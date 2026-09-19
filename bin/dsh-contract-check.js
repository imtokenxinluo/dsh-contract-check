#!/usr/bin/env node
// dsh-contract-check CLI —— 离线检查（不需要 DSH 运行）。
//
//   scan <path...>     扫描源码文件或目录，找 render 契约违规
//   package <dir...>   检查包的 files 白名单是否漏发「声明了要用的文件」
//   vocab              打印内核事件类型词汇表的版本与条目数
//
// 退出码：发现 violation → 1（便于脚本/CI 串联）；否则 0。
// 定位：检查「契约合规」，**不检测恶意**。

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { scanSource } from "../src/scan-source.js";
import { checkPackage } from "../src/package-check.js";
import { KNOWN_EVENT_TYPES, VOCAB_VERSION } from "../src/event-vocab.js";

const SCAN_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "coverage"]);

function usage() {
  console.log(`dsh-contract-check

usage:
  dsh-contract-check scan <path...>
      静态扫描源码里的 render 定义，检查是否违反 render(): ContentBlock[] 契约。
      路径可以是文件或目录（目录会递归）。发现违规时退出码为 1。

  dsh-contract-check package <dir...>
      检查包的 npm 打包完整性：package.json 声明要用的文件（dsh.bundle.patch /
      exports / types 等）是否会被 files 白名单漏在包外，或干脆不存在。
      漏发 bundle patch 的后果是 **DSH 整个插件树拒绝启动**。

  dsh-contract-check vocab
      打印内核会话事件类型词汇表（表外类型会让整条会话无法加载）。

定位说明：本工具检查**契约合规**，不检测恶意、不阻止执行。
静态分析判不准时会报 unknown 而不是猜 violation。
本工具不运行 npm、不执行被检查包的脚本（npm pack 会跑 prepack，对不受信包是危险的）。`);
}

async function collectFiles(target) {
  const out = [];
  let st;
  try {
    st = await stat(target);
  } catch {
    return { files: [], error: `路径不存在或不可读：${target}` };
  }
  if (st.isFile()) {
    out.push(target);
    return { files: out };
  }
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIR.has(e.name)) continue;
        await walk(full);
      } else if (e.isFile() && SCAN_EXT.has(path.extname(e.name))) {
        out.push(full);
      }
    }
  }
  await walk(target);
  return { files: out };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === "vocab") {
    console.log(`词汇表版本: ${VOCAB_VERSION}`);
    console.log(`条目数: ${KNOWN_EVENT_TYPES.size}`);
    console.log("（表外事件类型会被加载器拒绝解释整条日志；详见 README）");
    return;
  }

  if (cmd === "package") {
    const dirs = rest.filter((a) => !a.startsWith("--"));
    if (dirs.length === 0) return usage();
    let totalViolations = 0, errors = 0;
    for (const dir of dirs) {
      const r = checkPackage(dir);
      if (r.ok === false) {
        console.log(`ERR  ${r.error}`);
        errors++;
        continue;
      }
      if (r.violations === 0 && r.notes.length === 0) {
        console.log(`ok   ${dir}（检查 ${r.checked} 项声明${r.hasWhitelist ? "" : "；无 files 白名单 → 默认全打包"}）`);
      } else if (r.violations === 0) {
        console.log(`ok   ${dir}（检查 ${r.checked} 项声明；${r.notes.length} 条提示）`);
        for (const n of r.notes) console.log(`  note  · ${n.path}\n          ${n.reason}`);
      } else {
        console.log(`VIOLATION  ${dir}（${r.violations} 项会被漏发）`);
        for (const f of r.findings) console.log(`  · ${f.path}\n      ${f.reason}`);
        for (const n of r.notes) console.log(`  note · ${n.path}\n      ${n.reason}`);
      }
      totalViolations += r.violations;
    }
    console.log(`\nchecked=${dirs.length} violation=${totalViolations}${errors ? ` errors=${errors}` : ""}`);
    if (totalViolations > 0 || errors > 0) process.exitCode = 1;
    return;
  }

  if (cmd !== "scan" || rest.length === 0) return usage();

  const targets = rest.filter((a) => !a.startsWith("--"));
  let scanned = 0, found = 0, violations = 0, unknown = 0, errors = 0;

  for (const target of targets) {
    const { files, error } = await collectFiles(target);
    if (error) {
      console.log(`ERR  ${error}`);
      errors++;
      continue;
    }
    for (const file of files) {
      scanned++;
      let text;
      try {
        text = await readFile(file, "utf8");
      } catch (e) {
        console.log(`ERR  ${file}: ${String(e?.message ?? e)}`);
        errors++;
        continue;
      }
      const r = scanSource(text, file);
      found += r.found;
      violations += r.violations;
      unknown += r.unknown;
      for (const f of r.findings) {
        if (f.status === "violation") {
          console.log(`VIOLATION  ${file}:${f.line}  ${f.reason}`);
          if (f.evidence) console.log(`           evidence: ${f.evidence}`);
        } else if (f.status === "unknown") {
          console.log(`unknown    ${file}:${f.line}  ${f.reason}`);
        } else {
          console.log(`ok         ${file}:${f.line}`);
        }
      }
    }
  }

  console.log(`\nscanned=${scanned} render=${found} violation=${violations} unknown=${unknown}${errors ? ` errors=${errors}` : ""}`);
  if (violations > 0 || errors > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});

// 打包完整性检查测试。
//
// 背景（真实事故）：`package.json` 声明 `dsh.bundle.patch: ./cordis.patch.yml`，
// 但 `files` 白名单漏了它 → npm 打包时排除 → 安装后 bundle 挂载 ENOENT →
// **DSH 整个插件树拒绝启动**。
//
// npm 语义（本仓库用一次性实验实测，非猜测）：
//   * 总是包含：package.json / README* / LICENSE* / CHANGELOG* / `main` 指向的文件 / `bin` 指向的文件
//   * **不**总是包含：`exports` 目标 / `types` / 任何自定义字段（含 dsh.bundle.patch）
//   → 检查必须据此判定，否则会对 main/bin 误报。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPackage } from "../src/package-check.js";

function pkg(files, extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "pkgcheck-"));
  const write = (rel, content = "x") => {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  };
  const pj = { name: "probe", version: "1.0.0", ...extra };
  if (files !== undefined) pj.files = files;
  write("package.json", JSON.stringify(pj, null, 2));
  return { dir, write, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test("打包: dsh.bundle.patch 不在 files 里 → violation（真实事故复现）", () => {
  const p = pkg(["src"], { dsh: { bundle: { patch: "./cordis.patch.yml" } } });
  try {
    p.write("cordis.patch.yml", "- insert: []");
    p.write("src/index.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 1, JSON.stringify(r.findings));
    assert.match(r.findings[0].reason, /cordis\.patch\.yml|dsh\.bundle\.patch/);
  } finally { p.done(); }
});

test("打包: dsh.bundle.patch 在 files 里 → ok", () => {
  const p = pkg(["src", "cordis.patch.yml"], { dsh: { bundle: { patch: "./cordis.patch.yml" } } });
  try {
    p.write("cordis.patch.yml");
    p.write("src/index.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, JSON.stringify(r.findings));
  } finally { p.done(); }
});

test("打包: main 不在 files 里 → 不得误报（npm 自动包含 main）", () => {
  const p = pkg(["src"], { main: "lib/index.js" });
  try {
    p.write("lib/index.js");
    p.write("src/a.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, `npm 自动包含 main，不该报：${JSON.stringify(r.findings)}`);
  } finally { p.done(); }
});

test("打包: bin 不在 files 里 → 不得误报（npm 自动包含 bin）", () => {
  const p = pkg(["src"], { bin: { probe: "bin/cli.js" } });
  try {
    p.write("bin/cli.js");
    p.write("src/a.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, `npm 自动包含 bin，不该报：${JSON.stringify(r.findings)}`);
  } finally { p.done(); }
});

test("打包: exports 目标不在 files 里 → violation（npm 不自动包含 exports）", () => {
  const p = pkg(["src"], { exports: { ".": { default: "./dist/index.js" } } });
  try {
    p.write("dist/index.js");
    p.write("src/a.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 1, JSON.stringify(r.findings));
  } finally { p.done(); }
});

test("打包: types 不在 files 里 → violation（npm 不自动包含 types）", () => {
  const p = pkg(["src"], { types: "lib/index.d.ts" });
  try {
    p.write("lib/index.d.ts");
    p.write("src/a.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 1, JSON.stringify(r.findings));
  } finally { p.done(); }
});

test("打包: 声明的文件在磁盘上不存在 → violation（另一种致命情况）", () => {
  const p = pkg(["src", "cordis.patch.yml"], { dsh: { bundle: { patch: "./cordis.patch.yml" } } });
  try {
    p.write("src/a.js"); // 故意不写 cordis.patch.yml
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 1, JSON.stringify(r.findings));
    assert.match(r.findings[0].reason, /不存在|缺失/);
  } finally { p.done(); }
});

test("打包: 没有 files 字段 → 全部打包，不报 violation", () => {
  const p = pkg(undefined, { main: "lib/index.js", dsh: { bundle: { patch: "./cordis.patch.yml" } } });
  try {
    p.write("lib/index.js");
    p.write("cordis.patch.yml");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, JSON.stringify(r.findings));
    assert.equal(r.hasWhitelist, false);
  } finally { p.done(); }
});

test("打包: files 用目录条目覆盖嵌套文件 → ok", () => {
  const p = pkg(["lib"], { exports: { "./x": "./lib/deep/x.js" } });
  try {
    p.write("lib/deep/x.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, JSON.stringify(r.findings));
  } finally { p.done(); }
});

test("打包: files 用 glob 覆盖 → ok", () => {
  const p = pkg(["skills/**"], { exports: { "./s": "./skills/a/b.md" } });
  try {
    p.write("skills/a/b.md");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, JSON.stringify(r.findings));
  } finally { p.done(); }
});

test("打包: files 里的 ! 排除项生效 → violation", () => {
  const p = pkg(["lib", "!lib/skip.js"], { exports: { "./s": "./lib/skip.js" } });
  try {
    p.write("lib/skip.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 1, JSON.stringify(r.findings));
  } finally { p.done(); }
});

test("打包: 非包目录（没有 package.json）→ 报错而非崩溃", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pkgcheck-empty-"));
  try {
    const r = checkPackage(dir);
    assert.equal(r.ok, false);
    assert.ok(r.error);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- 通配子路径导出（真实第三方包遇到的形态）---
// `exports: { "./src/*": "./src/*" }` 是**模式**不是字面文件，不能拿它去找文件。
//
// 判定级别（2026-09-19 调整）：这类问题会让「某个子路径 import 失败」，
// **不会让插件树起不来**，所以记为 note（提示）而不是 violation ——
// violation 通道必须保持高信号，否则真实事故会被噪音淹没。

test("打包: 通配子路径导出不得被报成「文件不存在」", () => {
  const p = pkg(["lib"], { exports: { "./src/*": "./src/*" } });
  try {
    p.write("lib/index.js");
    const r = checkPackage(p.dir);
    const reasons = [...r.findings, ...r.notes].map((f) => f.reason).join(" | ");
    assert.ok(!/不存在/.test(reasons), `不应报"文件不存在"：${reasons}`);
  } finally { p.done(); }
});

test("打包: 通配子路径导出的目录不在 files 里 → note（不算 violation）", () => {
  const p = pkg(["lib"], { exports: { "./src/*": "./src/*" } });
  try {
    p.write("lib/index.js");
    p.write("src/a.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, `不该算 violation：${JSON.stringify(r.findings)}`);
    assert.equal(r.notes.length, 1, JSON.stringify(r.notes));
    assert.match(r.notes[0].reason, /子路径|目录/);
    assert.ok(!/不存在/.test(r.notes[0].reason), "理由不该说文件不存在");
  } finally { p.done(); }
});

test("打包: 通配子路径导出的目录在 files 里 → 无 note", () => {
  const p = pkg(["lib", "src"], { exports: { "./src/*": "./src/*" } });
  try {
    p.write("lib/index.js");
    p.write("src/a.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0);
    assert.equal(r.notes.length, 0, JSON.stringify(r.notes));
  } finally { p.done(); }
});

test("打包: 条件导出里的通配也要处理（types/default 各一条）", () => {
  const p = pkg(["lib"], { exports: { "./x/*": { types: "./lib/types/x/*.d.ts", default: "./lib/x/*.js" } } });
  try {
    p.write("lib/index.js");
    const r = checkPackage(p.dir);
    const all = [...r.findings, ...r.notes];
    assert.ok(!all.some((f) => /不存在/.test(f.reason)), `不得报文件不存在：${JSON.stringify(all)}`);
  } finally { p.done(); }
});

// --- glob 语义：`**/` 必须能匹配「零层目录」（真实包 cosmokit / zod 的形态）---

test("打包: files 里的 lib/types/**/*.d.ts 必须覆盖 lib/types/index.d.ts", () => {
  const p = pkg(["lib/index.js", "lib/types/**/*.d.ts"], { types: "lib/types/index.d.ts" });
  try {
    p.write("lib/index.js");
    p.write("lib/types/index.d.ts");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, `**/ 应能匹配零层目录：${JSON.stringify(r.findings)}`);
  } finally { p.done(); }
});

test("打包: files 里的 **/*.js 必须覆盖根目录的 index.js", () => {
  const p = pkg(["src", "**/*.js"], { exports: { ".": { import: "./index.js" } } });
  try {
    p.write("index.js");
    p.write("src/a.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, `**/ 应能匹配零层目录：${JSON.stringify(r.findings)}`);
  } finally { p.done(); }
});

// --- 无扩展名路径要按 Node 规则解析（真实包 cpu-features 的形态）---

test("打包: main 无扩展名（./lib/index → lib/index.js）不得报文件不存在", () => {
  const p = pkg(["lib"], { main: "./lib/index" });
  try {
    p.write("lib/index.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, `应按 Node 规则解析扩展名：${JSON.stringify(r.findings)}`);
  } finally { p.done(); }
});

test("打包: exports 无扩展名也要解析", () => {
  const p = pkg(["lib"], { exports: { ".": { default: "./lib/index" } } });
  try {
    p.write("lib/index.js");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, JSON.stringify(r.findings));
  } finally { p.done(); }
});

// --- 自定义条件（源码模式工具链用的）不应被要求随包发布 ---

test("打包: 自定义条件指向未发布的源码 → 不报（zod / standard-schema 的形态）", () => {
  const p = pkg(["dist"], {
    exports: {
      ".": {
        "@zod/source": "./src/index.ts",
        "standard-schema-spec": "./src/index.ts",
        types: "./dist/index.d.ts",
        import: "./dist/index.js"
      }
    }
  });
  try {
    p.write("dist/index.js");
    p.write("dist/index.d.ts");
    // 注意：src/index.ts 故意不写 —— 它本就不该随包发布
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, `自定义条件不该被检查：${JSON.stringify(r.findings)}`);
  } finally { p.done(); }
});

// --- 同一文件被多个字段声明时不要重复报 ---

test("打包: 同一文件被 types 与 exports 同时声明 → 只报一次", () => {
  const p = pkg(["lib/index.js"], {
    types: "lib/types/index.d.ts",
    exports: { ".": { types: "./lib/types/index.d.ts" } }
  });
  try {
    p.write("lib/index.js");
    p.write("lib/types/index.d.ts");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 1, `应只报一次：${JSON.stringify(r.findings)}`);
  } finally { p.done(); }
});

test("打包: 通配子路径导出 —— 目录下真实文件被 glob 覆盖时不报（zod 的形态）", () => {
  // zod: files 含 "**/*.js"，exports 有 "./v4/locales/*" → 实际是随包发出的。
  // 判定必须看「目录下的真实文件是否被白名单覆盖」，而不是「目录本身是否被覆盖」。
  const p = pkg(["src", "**/*.js", "**/*.d.ts"], {
    exports: { "./locales/*": "./v4/locales/*" }
  });
  try {
    p.write("v4/locales/en.js");
    p.write("v4/locales/zh.js");
    p.write("src/a.js");
    const r = checkPackage(p.dir);
    assert.equal(r.notes.length, 0, `文件已随包发出，不该提示：${JSON.stringify(r.notes)}`);
  } finally { p.done(); }
});

test("打包: 通配子路径导出 —— 目录下文件确实都没被覆盖时才提示", () => {
  const p = pkg(["lib"], { exports: { "./src/*": "./src/*" } });
  try {
    p.write("lib/index.js");
    p.write("src/a.js");
    const r = checkPackage(p.dir);
    assert.equal(r.notes.length, 1, JSON.stringify(r.notes));
  } finally { p.done(); }
});

test("打包: 通配子路径导出 —— 目录在磁盘上不存在时也提示", () => {
  const p = pkg(["lib"], { exports: { "./missing/*": "./missing/*" } });
  try {
    p.write("lib/index.js");
    const r = checkPackage(p.dir);
    assert.equal(r.notes.length, 1, JSON.stringify(r.notes));
  } finally { p.done(); }
});

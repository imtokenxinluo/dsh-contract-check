// 打包完整性检查：`files` 白名单会不会把「声明了要用的文件」漏在包外。
//
// 为什么值得单独做：这类遗漏的后果不是"某个功能不工作"，而是
// **DSH 整个插件树拒绝启动**（bundle 挂载时 ENOENT）。真实事故：本项目的 0.2.0。
//
// npm 的 `files` 语义（用一次性实验实测，不是猜）：
//   * **总是包含**：package.json、README*、LICENSE*/LICENCE*、CHANGELOG*、
//     `main` 指向的文件、`bin` 指向的文件
//   * **不**总是包含：`exports` 的目标、`types`、**任何自定义字段**
//     —— DSH 的 `dsh.bundle.patch` 属于自定义字段，不在 `files` 里就会丢失
//   * `files` 里的条目优先于 `.npmignore`；`!` 开头的条目是排除项
//   * 没有 `files` 字段时：默认打包全部（无遗漏风险）
//
// 只读：不运行 npm、不执行被检查包的脚本（npm pack 会跑 prepack/prepare，
// 对不受信任的包是危险的 —— 所以这里自己实现白名单判定）。
//
// 两类结论，严格区分（violation 通道必须保持高信号）：
//   violation —— 会让包**装不起来 / 插件树拒启**的问题（漏发必用文件、文件不存在）
//   note      —— 只会让**某个子路径不可用**的小瑕疵（如通配子路径导出未随包发出）

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, normalize } from "node:path";

/** npm 一定会打进包的文件（相对包根） */
const ALWAYS_INCLUDED = [
  /^package\.json$/i,
  /^readme(\.[^/]*)?$/i,
  /^licen[cs]e(\.[^/]*)?$/i,
  /^changelog(\.[^/]*)?$/i
];

/**
 * 标准 exports 条件名。**不在此列表里的自定义条件一律跳过**——
 * 社区工具链会用它指向"源码模式"入口（如 zod 的 `@zod/source`、
 * standard-schema 的 `standard-schema-spec`），那些文件本就不该随包发布。
 * 对这一类做存在性检查会产生误报（真实踩过）。
 */
const STANDARD_CONDITIONS = new Set([
  "types", "import", "require", "default", "node", "browser", "module",
  "deno", "worker", "node-addons"
]);

/** 无扩展名路径按 Node 规则解析：依次尝试这些后缀 */
const EXT_CANDIDATES = [".js", ".mjs", ".cjs", ".json", ".node", ".ts", ".d.ts"];

/** 收集 package.json 里「声明要用的文件路径」 */
function collectDeclared(pj) {
  const out = [];
  const add = (value, why, pattern = false) => {
    if (typeof value === "string" && value.length > 0) out.push({ path: value, why, pattern });
  };

  add(pj.main, "main（npm 会自动包含，仅作存在性检查）");
  add(pj.types, "types（npm **不**自动包含）");
  if (typeof pj.bin === "string") add(pj.bin, "bin（npm 自动包含）");
  else if (pj.bin && typeof pj.bin === "object") {
    for (const v of Object.values(pj.bin)) add(v, "bin（npm 自动包含）");
  }

  // exports：递归；自定义条件跳过
  const walkExports = (node, trail, standardContext) => {
    if (typeof node === "string") {
      add(node, `exports${trail}（npm **不**自动包含）`, /[*?]/.test(node));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k.startsWith(".")) { walkExports(v, `${trail}${k}`, true); continue; }  // 子路径键
        if (!STANDARD_CONDITIONS.has(k)) continue;                                   // 自定义条件跳过
        walkExports(v, `${trail}.${k}`, standardContext);
      }
    }
  };
  if (pj.exports) walkExports(pj.exports, "", true);

  // DSH 自定义字段：真实事故就出在这里
  if (pj.dsh?.bundle?.patch) add(pj.dsh.bundle.patch, "dsh.bundle.patch（npm **不**自动包含；漏发 = 插件树拒启）");

  return out;
}

/**
 * `files` 条目 → 正则。
 * 关键：`**\/` 必须能匹配**零层**目录（`lib/types/**\/*.d.ts` 要覆盖 `lib/types/index.d.ts`）——
 * 真实包 cosmokit / zod 就靠这个形态，写错会大面积误报。
 */
function entryToRegex(entry) {
  const esc = entry.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = esc
    .replace(/\*\*\//g, "\u0000")   // **/  → 零或多层目录
    .replace(/\*\*/g, "\u0001")     // **   → 任意（含 /）
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${body}$`);
}

/** 某条目是否覆盖目标路径（目录条目按前缀算） */
function entryCovers(entry, target) {
  const e = entry.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  const t = target.replace(/\\/g, "/").replace(/^\.\//, "");
  if (e.length === 0) return false;
  if (!/[*?]/.test(e)) return t === e || t.startsWith(e + "/");
  return entryToRegex(e).test(t);
}

/** 白名单是否覆盖目标（含 ! 排除项） */
function whitelistCovers(files, target) {
  const entries = files.map((f) => String(f).replace(/\\/g, "/"));
  const positives = entries.filter((e) => !e.startsWith("!"));
  const negatives = entries.filter((e) => e.startsWith("!")).map((e) => e.slice(1));
  if (!positives.some((e) => entryCovers(e, target))) return false;
  return !negatives.some((e) => entryCovers(e, target));
}

/** 解析磁盘上真实存在的文件（支持无扩展名 → 补后缀 / 补 index） */
function resolveOnDisk(dir, rel) {
  const clean = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  const direct = normalize(join(dir, clean));
  try {
    if (existsSync(direct) && !statSync(direct).isDirectory()) return clean;
  } catch { /* 继续尝试 */ }

  // 无扩展名 → 依次补
  if (!/\.[a-z0-9]+$/i.test(clean)) {
    for (const ext of EXT_CANDIDATES) {
      const cand = normalize(join(dir, clean + ext));
      try { if (existsSync(cand) && !statSync(cand).isDirectory()) return clean + ext; } catch { /* next */ }
    }
    // 目录 → index
    for (const ext of EXT_CANDIDATES) {
      const cand = normalize(join(dir, clean, "index" + ext));
      try { if (existsSync(cand) && !statSync(cand).isDirectory()) return clean + "/index" + ext; } catch { /* next */ }
    }
  }
  return null;
}

/** 列出某目录下深度受限的真实文件（相对包根） */
function listFilesUnder(dir, prefix, maxDepth = 2, limit = 40) {
  const out = [];
  const walk = (abs, rel, depth) => {
    if (out.length >= limit || depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(abs, { withFileTypes: true }) } catch { return; }
    for (const e of entries) {
      if (out.length >= limit) return;
      const childAbs = join(abs, e.name);
      const childRel = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(childAbs, childRel, depth + 1);
      else out.push(childRel);
    }
  };
  walk(normalize(join(dir, prefix)), prefix, 0);
  return out;
}

/**
 * 通配子路径导出是否「未随包发出」。
 * 判据：看该目录下的**真实文件**有没有被白名单覆盖——
 * 只看「目录本身是否被覆盖」是错的（zod 用 `**\/*.js` 覆盖目录内的文件，目录路径本身不匹配任何条目）。
 */
function wildcardUnshipped(dir, files, prefix) {
  if (files === null) return false;
  const under = listFilesUnder(dir, prefix);
  if (under.length === 0) return true;                       // 目录不存在或为空 → 确实没发出
  return !under.some((rel) => whitelistCovers(files, rel));  // 没有任何一个文件被覆盖 → 没发出
}

/**
 * 检查一个包目录。
 * @param {string} dir - 包根目录（含 package.json）
 * @returns {{ok:boolean, dir:string, error?:string, hasWhitelist:boolean, checked:number,
 *   violations:number, notes:Array, findings:Array}}
 */
export function checkPackage(dir) {
  const report = { ok: true, dir, hasWhitelist: false, checked: 0, violations: 0, findings: [], notes: [] };

  const pjPath = join(dir, "package.json");
  if (!existsSync(pjPath)) {
    return { ...report, ok: false, error: `不是包目录：找不到 ${pjPath}` };
  }

  let pj;
  try {
    pj = JSON.parse(readFileSync(pjPath, "utf8"));
  } catch (error) {
    return { ...report, ok: false, error: `package.json 解析失败：${String(error?.message ?? error)}` };
  }

  const files = Array.isArray(pj.files) ? pj.files : null;
  report.hasWhitelist = files !== null;

  // bin 的路径 npm 会自动包含，单独收集用于"总是包含"判断
  const binPaths = (typeof pj.bin === "string" ? [pj.bin]
    : pj.bin && typeof pj.bin === "object" ? Object.values(pj.bin) : [])
    .map((b) => String(b).replace(/^\.\//, ""));
  const mainPath = String(pj.main ?? "").replace(/^\.\//, "");

  const declared = collectDeclared(pj);
  report.checked = declared.length;
  const seen = new Set();

  for (const { path: rel, why, pattern } of declared) {
    const clean = rel.replace(/\\/g, "/").replace(/^\.\//, "");

    // 0) 通配路径（模式，不是字面文件）→ 只提示级别
    if (pattern || /[*?]/.test(clean)) {
      const prefix = clean.split(/[*?]/)[0].replace(/\/+$/, "");
      if (prefix.length === 0) continue;
      if (wildcardUnshipped(dir, files, prefix)) {
        const key = `note:${prefix}`;
        if (seen.has(key)) continue;
        seen.add(key);
        report.notes.push({
          path: clean,
          status: "note",
          reason: `子路径导出 `+"`"+prefix+`/*`+"`"+` 未随包发出：安装后该路径 import 会失败（不影响插件启动）`
        });
      }
      continue;
    }

    // 1) 文件是否真的存在（含 Node 风格扩展名解析）
    const resolved = resolveOnDisk(dir, clean);
    if (resolved === null) {
      const key = `missing:${clean}`;
      if (seen.has(key)) continue;
      seen.add(key);
      report.violations++;
      report.findings.push({ path: clean, status: "violation", reason: `声明了但文件不存在（含补全扩展名后）：${why}`, why });
      continue;
    }

    // 2) npm 会自动包含的，不必看白名单
    const alwaysIncluded =
      ALWAYS_INCLUDED.some((re) => re.test(resolved)) ||
      resolved === mainPath || mainPath.startsWith(resolved + ".") ||
      binPaths.includes(resolved);
    if (alwaysIncluded) continue;
    if (files === null) continue;

    // 3) 白名单覆盖判定（同时检查声明路径与其解析结果）
    if (!whitelistCovers(files, clean) && !whitelistCovers(files, resolved)) {
      const key = `outside:${clean}`;
      if (seen.has(key)) continue;
      seen.add(key);
      report.violations++;
      report.findings.push({
        path: clean,
        status: "violation",
        reason: `在 files 白名单之外，npm 不会打包它：${why}`,
        why
      });
    }
  }

  return report;
}

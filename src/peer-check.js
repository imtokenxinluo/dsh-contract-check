// 兼容性检查：插件的 peer 范围是否覆盖**当前内核版本**。
//
// 为什么值得单独做：peer 范围不覆盖时，DSH 会**直接跳过该插件**（往往只在启动日志里
// 留一句，界面上看不出任何异常）。表现是"装了但没生效"，排查成本极高。
// 真实事故（2026-10）：dsh-plugin-scheduled-tasks / dsh-doublecheck / dsh-monitor 都只
// 声明到 `^0.1.0-rc.6`，DSH 升到 0.2.x 之后全部被静默跳过。
//
// 判据与 DSH 自己保持一致：
//   semver.satisfies(runtimeVersion, range, { includePrerelease: true })
// 只评价 `@deepseek-ai/` 作用域下的 peer（内核包）；第三方 peer 不评价，避免误报。
//
// 两类结论，与 package-check 一致：
//   violation —— 该插件会被内核跳过（或现在就已经不满足）
//   note      —— 无法判断（未声明 peer / 非法范围 / workspace 协议）

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

/**
 * 只评价 `@deepseek-ai/dsh-*`。
 *
 * 这不是偷懒，是与 DSH 自己的兼容性检查（dsh-app-boot 的 evaluatePluginCompatibility）
 * 同一口径：它只对名字以 `@deepseek-ai/dsh-` 开头的 peer 做 semver 判断。
 * `@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 这类是**独立包、各自有版本号**，
 * 拿内核版本去比会得到满屏假阳性（2026-11-03 实测踩到）。
 */
const KERNEL_PREFIX = "@deepseek-ai/dsh-";
const AI_SCOPE = "@deepseek-ai/";

/**
 * 定位内核 package.json。顺序：
 *   1. 显式传入 / 环境变量 DSH_KERNEL_PATH
 *   2. 从 cwd 解析 @deepseek-ai/dsh/package.json
 *   3. 从本模块位置解析
 *   4. 本机 npm 全局前缀下的默认位置（可用 --dsh 覆盖）
 * @returns {string|null}
 */
export function locateKernel({ cwd = process.cwd(), hint = null } = {}) {
  const candidates = [];
  if (hint) candidates.push(hint, join(hint, "package.json"));
  if (process.env.DSH_KERNEL_PATH) candidates.push(process.env.DSH_KERNEL_PATH);

  for (const base of [join(cwd, "noop.js"), import.meta.url]) {
    try {
      const req = createRequire(base);
      candidates.push(req.resolve("@deepseek-ai/dsh/package.json"));
    } catch { /* 继续尝试 */ }
  }
  if (process.env.npm_config_prefix) {
    candidates.push(join(process.env.npm_config_prefix, "node_modules", "@deepseek-ai", "dsh", "package.json"));
  }
  // 本机默认（npm prefix=D:\tool\npmPlugin）；仅作为最后的兜底，找不到就会给出明确报错
  candidates.push("D:/tool/npmPlugin/node_modules/@deepseek-ai/dsh/package.json");

  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

/** 从内核包位置解析 semver 实现（用内核自己依赖的那份，版本口径一致）。 */
export function loadSemver(kernelPkgPath) {
  try {
    const req = createRequire(kernelPkgPath);
    return req("semver");
  } catch {
    return null;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * 检查一个包目录的 peer 范围是否覆盖给定内核版本。
 *
 * @param {string} dir 包目录
 * @param {{ dshVersion: string, semver: object }} options
 * @returns {{
 *   ok: boolean, error?: string, dir: string, dshVersion: string,
 *   checked: number, violations: number,
 *   findings: Array<{name: string, range: string, status: 'violation', reason: string}>,
 *   notes: Array<{name: string, range: string, status: 'note', reason: string}>
 * }}
 */
export function checkPeers(dir, { dshVersion, semver } = {}) {
  const report = { ok: true, dir, dshVersion: dshVersion ?? null, checked: 0, violations: 0, findings: [], notes: [] };
  if (!dshVersion || typeof dshVersion !== "string") {
    return { ...report, ok: false, error: "缺少 dshVersion（当前内核版本）" };
  }
  if (!semver || typeof semver.satisfies !== "function") {
    return { ...report, ok: false, error: "缺少 semver 实现（无法判断范围）" };
  }

  const pjPath = join(dir, "package.json");
  if (!existsSync(pjPath)) {
    return { ...report, ok: false, error: `不是包目录：找不到 ${pjPath}` };
  }
  let pj;
  try {
    pj = readJson(pjPath);
  } catch (error) {
    return { ...report, ok: false, error: `package.json 解析失败：${String(error?.message ?? error)}` };
  }

  const peers = pj.peerDependencies && typeof pj.peerDependencies === "object" ? pj.peerDependencies : {};
  const optional = pj.peerDependenciesMeta && typeof pj.peerDependenciesMeta === "object" ? pj.peerDependenciesMeta : {};
  const allNames = Object.keys(peers).sort();
  const names = allNames.filter((n) => n.startsWith(KERNEL_PREFIX));
  // 非 dsh- 的 @deepseek-ai/* peer（cordis / schemastery 等）：DSH 不评价，只记提示
  for (const n of allNames.filter((x) => x.startsWith(AI_SCOPE) && !x.startsWith(KERNEL_PREFIX))) {
    report.notes.push({ name: n, range: String(peers[n] ?? ""), status: "note", reason: "非 dsh- 内核包（独立版本号），DSH 的兼容性检查不评价它" });
  }

  if (names.length === 0) {
    report.notes.push({ name: "(无)", range: "(无)", status: "note", reason: "没有声明任何 @deepseek-ai/dsh-* peer —— 内核不会因此跳过它，但也没有承诺" });
    return report;
  }

  for (const name of names) {
    report.checked++;
    const range = String(peers[name] ?? "");
    const isOptional = optional[name]?.optional === true;

    if (range.startsWith("workspace:")) {
      report.notes.push({ name, range, status: "note", reason: "workspace 协议（发布时会被替换成实际版本），此处不评价" });
      continue;
    }
    if (range === "*" || range === "x" || range === "latest") {
      report.notes.push({ name, range, status: "note", reason: "任意版本（*），不做判断" });
      continue;
    }

    // 注意：semver.satisfies 对**非法范围**返回 false（不抛错），所以直接用会把
    // 写错的范围误报成"插件会被跳过"。先用 validRange 区分"非法"与"合法但不满足"。
    let normalized;
    try {
      normalized = typeof semver.validRange === "function" ? semver.validRange(range, { includePrerelease: true }) : range;
    } catch {
      normalized = null;
    }
    if (normalized === null) {
      report.notes.push({ name, range, status: "note", reason: `非法范围 "${range}"，无法判断` });
      continue;
    }

    let ok;
    try {
      ok = semver.satisfies(dshVersion, normalized, { includePrerelease: true });
    } catch {
      report.notes.push({ name, range, status: "note", reason: `范围解析失败 "${range}"，无法判断` });
      continue;
    }

    if (!ok) {
      report.violations++;
      report.findings.push({
        name,
        range,
        status: "violation",
        reason: `当前内核 ${dshVersion} 不满足 "${range}"${isOptional ? "（可选 peer，但 DSH 仍按必需处理）" : ""} —— DSH 会跳过该插件`
      });
    }
  }

  return report;
}
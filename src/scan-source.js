// 离线源码扫描：不启动 DSH，直接从源码里找出 render 定义并判定契约。
//
// 提取策略（正则 + 括号配对，不引入解析器依赖）：
//   - `render(args, value) { ... }`      方法简写 → 花括号配对取整段
//   - `render: (a, v) => ...`            箭头属性 → 取箭头后半段
//   - `render: function (a, v) { ... }`  函数表达式 → 花括号配对
// 局限（README 已如实说明）：压缩/拼接的代码可能取不准 → 一律归 unknown，不猜 violation。

import { classifyRenderSource } from "./render-contract.js";

const NL = "\n";

/** 位置 → 行号 */
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === NL) line++;
  return line;
}

/** 去掉注释（保留字符串内容，避免误伤 URL）。 */
function stripComments(src) {
  return src
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * 从 `{` 开始做括号配对，返回结束位置（含 `}`）。
 * 会跳过字符串与模板字符串，避免 `"}"` 打乱配对。
 */
function matchBrace(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  let quote = null;
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; i++; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1; // 没配对 → 交给 unknown
}

const PATTERNS = [
  // render(args) { ... }  /  render: function (args) { ... }
  { re: /\brender\s*(?::\s*(?:async\s+)?function\s*)?\([^)]*\)\s*\{/g, kind: "block" },
  // render: (args) => ...  /  render: async (args) => ...
  { re: /\brender\s*:\s*(?:async\s*)?\(?[^)=]*\)?\s*=>/g, kind: "arrow" }
];

/**
 * 扫描一段源码里的所有 render 定义。
 * @param {string} source
 * @param {string} [file] - 仅用于报告
 * @returns {{file?:string, found:number, violations:number, unknown:number, findings:object[]}}
 */
export function scanSource(source, file) {
  const report = { ...(file ? { file } : {}), found: 0, violations: 0, unknown: 0, findings: [] };
  if (typeof source !== "string" || source.length === 0) return report;

  const cleaned = stripComments(source);
  const spans = [];
  for (const { re, kind } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      if (m.index === re.lastIndex) re.lastIndex++;
      if (kind === "block") {
        const open = cleaned.indexOf("{", m.index);
        if (open < 0) continue;
        const close = matchBrace(cleaned, open);
        if (close < 0) continue;
        spans.push({ start: m.index, end: close + 1, fnSource: cleaned.slice(m.index, close + 1) });
      } else {
        const arrow = cleaned.indexOf("=>", m.index);
        if (arrow < 0) continue;
        const rest = cleaned.slice(arrow + 2);
        const trimmed = rest.trimStart();
        if (trimmed.startsWith("{")) {
          const open = arrow + 2 + (rest.length - trimmed.length);
          const close = matchBrace(cleaned, open);
          if (close < 0) continue;
          spans.push({ start: m.index, end: close + 1, fnSource: cleaned.slice(m.index, close + 1) });
        } else {
          // 隐式返回：取到行尾或 `;` 或 `,`（顶层）
          let j = arrow + 2;
          let depth = 0;
          let quote = null;
          let end = j;
          while (j < cleaned.length) {
            const ch = cleaned[j];
            if (quote) {
              if (ch === "\\") { j += 2; continue; }
              if (ch === quote) quote = null;
            } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
            else if (ch === "(" || ch === "[" || ch === "{") depth++;
            else if (ch === ")" || ch === "]" || ch === "}") {
              if (depth === 0) break;
              depth--;
            } else if ((ch === ";" || ch === "," || ch === NL) && depth === 0) break;
            j++;
            end = j;
          }
          spans.push({ start: m.index, end, fnSource: cleaned.slice(m.index, end) });
        }
      }
    }
  }

  // 去重（重叠匹配）并按位置排序
  const unique = [];
  for (const s of spans.sort((a, b) => a.start - b.start)) {
    if (unique.length > 0 && s.start < unique[unique.length - 1].end) continue;
    unique.push(s);
  }

  for (const s of unique) {
    report.found++;
    const verdict = classifyRenderSource(s.fnSource);
    const finding = {
      line: lineOf(cleaned, s.start),
      status: verdict.status,
      reason: verdict.reason,
      evidence: verdict.evidence
    };
    if (verdict.status === "violation") report.violations++;
    if (verdict.status === "unknown") report.unknown++;
    report.findings.push(finding);
  }
  return report;
}

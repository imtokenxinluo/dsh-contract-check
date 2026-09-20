// render 契约静态判定。
//
// 为什么需要：`dsh-tools` 把 `tool.output.render()` 的返回值原样写入会话日志，
// 运行时从不校验它是不是 ContentBlock[]；而加载器要求 tool-result 块的 content
// 必须是数组。一处返回字符串 = 整条会话历史不可加载（真实事故：dsh-ssh-ops）。
//
// 设计原则：**宁 unknown，不 violation**。静态分析看不出形态时如实说不知道，
// 绝不猜——因为误报会让使用者卸载好插件、并从此不信任这个检查器。
//
// 三态：
//   ok        —— 所有可达返回都是数组形态
//   violation —— 存在返回字符串字面量/字符串产物/裸 return 的路径
//   unknown   —— 形态不可静态判定（返回变量、调用结果、压缩代码等）

import { stripComments, matchBrace, matchPair, findOwnArrow, stripNestedFunctionBodies } from "./source-utils.js";

/**
 * 判定一个返回表达式的类型。
 *
 * 规则（真实误报换来的）：
 *   1) 先剥掉最外层多余括号：`([...])` 就是 `[...]`。
 *   2) 只在**括号深度 0** 处认「产物标记」——数组字面量内部的 `.join()` 不算，
 *      因为那是元素的内容，不是整个返回值的类型。
 *   3) 数组字面量自己算一个标记（`[` 处），所以 `[{...}].join("")` 里
 *      更靠后的 `.join(` 会正确地胜出为字符串。
 */
const PRODUCER_MARKS = [
  { kind: "string", re: /JSON\.stringify\s*\(/g },
  { kind: "string", re: /String\s*\(/g },
  { kind: "string", re: /\.join\s*\(/g },
  { kind: "string", re: /\.toString\s*\(/g },
  { kind: "string", re: /\.toFixed\s*\(/g },
  { kind: "array", re: /\.map\s*\(/g },
  { kind: "array", re: /\.flatMap\s*\(/g },
  { kind: "array", re: /\.filter\s*\(/g },
  { kind: "array", re: /\.concat\s*\(/g },
  { kind: "array", re: /\.slice\s*\(/g },
  { kind: "array", re: /Array\.from\s*\(/g },
  { kind: "array", re: /Array\.of\s*\(/g }
];

/** 剥掉最外层成对括号（可能是数组/对象/函数调用的一部分，只剥完全包裹的）。 */
function stripOuterParens(e) {
  let s = e.trim();
  for (;;) {
    if (!s.startsWith("(")) return s;
    const close = matchPair(s, 0, "(", ")");
    if (close !== s.length - 1) return s;
    s = s.slice(1, close).trim();
  }
}

function classifyExpression(expr) {
  const e = stripOuterParens(expr);
  if (e === "") return { kind: "bare" }; // return; → undefined

  const marks = [];
  if (e.startsWith("[")) marks.push({ kind: "array", at: 0 });
  if (e.startsWith("`") || e.startsWith('"') || e.startsWith("'")) marks.push({ kind: "string", at: 0 });

  // 扫一遍，只在深度 0 处认标记
  let depth = 0;
  let quote = null;
  for (let i = 0; i < e.length; i++) {
    const ch = e[i];
    if (quote) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; continue; }
    if (ch === ")" || ch === "]" || ch === "}") { depth--; continue; }
    if (depth !== 0) continue;
    for (const { kind, re } of PRODUCER_MARKS) {
      re.lastIndex = i;
      const m = re.exec(e);
      if (m && m.index === i) marks.push({ kind, at: i });
    }
  }

  if (marks.length === 0) return { kind: "unknown" };
  marks.sort((a, b) => a.at - b.at);
  return { kind: marks[marks.length - 1].kind };
}

/**
 * 从 `return` 之后扫描表达式结束位置。
 *
 * 为什么不能简单用 `/\breturn\b([\s\S]*?)(?:;|$)/`（2026-09-20 的真实误报）：
 * 现代代码常省分号（ASI），正则找不到 `;` 就一路吞到函数体结尾，
 * 把后面语句里的 `.join()` / `String()` 也算进这个 return 的表达式里，
 * 于是"所有 return 都是数组"的合规函数被判成"返回字符串"。
 * 实证：`@tianbuyu-wwx/dsh-formatforge/tools/formats.mjs` 的 render
 * （两条 return 都是数组，却被报 violation）。
 *
 * 规则：
 *   · 括号/引号内一律不算结束（模板字符串、嵌套对象、跨行调用都安全）
 *   · 深度 0 处遇到 `;` → 结束
 *   · 深度 0 处遇到换行 → 看下一行是否像"本表达式的延续"，是就继续
 *     （`.join(`、`&&`、`?`、运算符开头都算延续）
 *   · 深度 0 处遇到闭合括号（`}`/`)`/`]`）→ 结束（那是外层块的边界）
 */
function scanReturnEnd(src, from) {
  let depth = 0
  let quote = null
  for (let i = from; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (ch === "\\") { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; continue }
    if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) return i
      depth--
      continue
    }
    if (depth !== 0) continue
    if (ch === ";") return i
    if (ch === "\n") {
      // 上一行以运算符/逗号/开括号结尾 → 表达式必然跨行
      const before = src.slice(from, i).replace(/\s+$/, "")
      if (/[+\-*/%&|=<>,(.[?:!]$/.test(before)) continue
      const after = src.slice(i + 1).replace(/^\s+/, "")
      if (after === "") return src.length
      // 下一行以这些开头 → 是延续（方法链、三元、运算符、闭括号）
      if (/^[.?!:,)\]}+\-*/%&|=<>]/.test(after)) continue
      if (/^(&&|\|\||\?\?)/.test(after)) continue
      return i
    }
  }
  return src.length
}

/** 收集函数体内部的 return 表达式（先剔除嵌套函数体，避免误报）。 */
function collectReturns(inner) {
  const body = stripNestedFunctionBodies(inner);
  const out = [];
  const re = /\breturn\b/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const start = m.index + m[0].length;
    out.push(body.slice(start, scanReturnEnd(body, start)));
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/** 取函数体的「有效返回形态」列表。 */
function extractReturnShapes(source) {
  const s = stripComments(source).trim();

  // 1) 自身是箭头函数（只看属于它自己的那个箭头）
  const arrowAt = findOwnArrow(s);
  if (arrowAt >= 0) {
    const rest = s.slice(arrowAt + 2);
    const trimmed = rest.trimStart();
    if (trimmed.startsWith("{")) {
      const open = arrowAt + 2 + (rest.length - trimmed.length);
      const close = matchBrace(s, open);
      if (close < 0) return [];
      return collectReturns(s.slice(open + 1, close));
    }
    return [trimmed]; // 隐式返回
  }

  // 2) function 声明/表达式、或方法简写 → 块体：取第一层花括号的内部
  const brace = s.indexOf("{");
  if (brace < 0) return [];
  const close = matchBrace(s, brace);
  if (close < 0) return [];
  return collectReturns(s.slice(brace + 1, close));
}

/**
 * 判定一个 render 函数的源码。
 * @param {string} source - 函数源码（通常来自 Function.prototype.toString）。
 * @returns {{status:"ok"|"violation"|"unknown", reason:string, evidence?:string}}
 */
export function classifyRenderSource(source) {
  if (typeof source !== "string" || source.trim() === "") {
    return { status: "unknown", reason: "空源码：无法判定" };
  }
  if (!/=>|\bfunction\b|\brender\s*\(|\w+\s*\([^)]*\)\s*\{/.test(source)) {
    return { status: "unknown", reason: "看起来不是函数源码：无法判定" };
  }

  const shapes = extractReturnShapes(source);
  if (shapes.length === 0) {
    return { status: "unknown", reason: "未找到 return 语句：无法判定" };
  }

  const classified = shapes.map((expr) => ({ expr: expr.trim(), ...classifyExpression(expr) }));

  const stringy = classified.find((c) => c.kind === "string" || c.kind === "bare");
  if (stringy) {
    const what = stringy.kind === "string" ? "返回字符串" : "裸 return（返回 undefined）";
    return {
      status: "violation",
      reason: `${what}，违反 render(): ContentBlock[] 契约`,
      evidence: stringy.expr === "" ? "return;" : stringy.expr.slice(0, 120)
    };
  }

  if (classified.every((c) => c.kind === "array")) {
    return { status: "ok", reason: "所有 return 都是数组形态" };
  }

  const unknownOne = classified.find((c) => c.kind === "unknown");
  return {
    status: "unknown",
    reason: "存在静态不可判定的返回（返回变量或调用结果）；如需确认请在配置里开启实测",
    evidence: unknownOne ? unknownOne.expr.slice(0, 120) : undefined
  };
}

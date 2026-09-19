// 源码处理小工具（被 render-contract 与 scan-source 共用）。
// 只做括号配对与注释剥离这类机械工作，不做语法解析——够用且零依赖。

export const NL = "\n";

/** 位置 → 行号（1 基） */
export function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === NL) line++;
  return line;
}

/**
 * 去掉注释。
 * 行注释保留换行（否则行号会漂），并跳过 `https://` 这类「冒号后的双斜杠」。
 * 块注释用等长空白替换，保持行号不变。
 */
export function stripComments(src) {
  return src
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** 从 openIdx 处的开括号做配对（跳过字符串/模板字符串），返回闭括号位置；失败返回 -1。 */
export function matchPair(src, openIdx, open = "{", close = "}") {
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
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** 括号配对便捷包装 */
export function matchBrace(src, openIdx) { return matchPair(src, openIdx, "{", "}"); }
export function matchParen(src, openIdx) { return matchPair(src, openIdx, "(", ")"); }

/**
 * 把「嵌套函数体」替换成占位符，返回处理后的文本。
 *
 * 为什么需要：`render` 里常有嵌套的箭头函数或局部函数，它们内部的
 * `return "字符串"` **不属于 render 的返回值**。不剔除就会误报——
 * 而误报是这个工具最不能犯的错（宁 unknown，不 violation）。
 *
 * 传入的应当是**外层函数体的内部文本**（不含外层花括号），这样
 * `function` 关键字只会来自真正嵌套的函数。
 */
export function stripNestedFunctionBodies(inner) {
  const regions = [];

  // 嵌套箭头函数（块体形式）：=> { ... }
  const arrowRe = /=>\s*\{/g;
  let m;
  while ((m = arrowRe.exec(inner)) !== null) {
    const open = inner.indexOf("{", m.index);
    if (open < 0) continue;
    const close = matchBrace(inner, open);
    if (close >= 0) regions.push([open, close]);
  }

  // 嵌套函数声明/表达式：function ... { ... }
  const fnRe = /\bfunction\b[^{;]*\{/g;
  while ((m = fnRe.exec(inner)) !== null) {
    const open = inner.indexOf("{", m.index);
    if (open < 0) continue;
    const close = matchBrace(inner, open);
    if (close >= 0) regions.push([open, close]);
  }

  if (regions.length === 0) return inner;

  // 合并重叠区间，然后从后往前替换（保持前面的索引有效）
  regions.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }

  let out = inner;
  for (let i = merged.length - 1; i >= 0; i--) {
    const [s, e] = merged[i];
    out = out.slice(0, s) + "{/*nested*/}" + out.slice(e + 1);
  }
  return out;
}

/**
 * 找出「属于这个函数自己」的箭头。
 * 只有当源码本身**就是**箭头函数时才返回其位置：
 *   `(a, v) => ...` / `a => ...` / `async (a) => ...` / `render: (a, v) => ...`
 * 方法简写 `render(a, v) { ... }` 与 `function () {}` 一律返回 -1
 * —— 否则会把函数体内部嵌套箭头误当成外层（真实踩过的坑）。
 */
export function findOwnArrow(src) {
  const skipAsyncAndSpace = (from) => {
    let i = from;
    if (src.startsWith("async", i)) i += 5;
    while (i < src.length && /\s/.test(src[i])) i++;
    return i;
  };

  let i = skipAsyncAndSpace(0);

  // 对象字面量里的属性前缀 `render:` —— 扫描器传进来的是带前缀的片段，跳过它
  const nameMatch = /^[A-Za-z_$][\w$]*\s*:/.exec(src.slice(i));
  if (nameMatch) i = skipAsyncAndSpace(i + nameMatch[0].length);

  if (src[i] === "(") {
    const close = matchParen(src, i);
    if (close < 0) return -1;
    let j = close + 1;
    while (j < src.length && /\s/.test(src[j])) j++;
    return src.startsWith("=>", j) ? j : -1;
  }

  // 单参数箭头：ident => ...
  const m = /^[A-Za-z_$][\w$]*\s*=>/.exec(src.slice(i));
  if (m) return i + m[0].indexOf("=>");
  return -1;
}

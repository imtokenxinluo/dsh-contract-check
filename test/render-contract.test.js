// render 契约静态判定测试。核心原则：宁 unknown，不 violation（零误报优先）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRenderSource } from "../src/render-contract.js";

const CASES = [
  // --- 应判 violation ---
  ["箭头隐式返回模板字符串", "(args, value) => `Wrote ${value.bytes} bytes`", "violation"],
  ["箭头隐式返回普通字符串", '(args, value) => "ok"', "violation"],
  ["函数体 return 字符串（含分支）", 'function render(a, v) { if (!v) return "none"; return `x=${v.x}`; }', "violation"],
  ["方法简写 return 字符串", 'render(a, v) { return "done"; }', "violation"],
  ["裸 return（返回 undefined）", 'render(a, v) { if (!v) return; return [{ type: "text", text: "x" }]; }', "violation"],
  ["字符串拼接", '(a, v) => "n=" + v.n', "violation"],
  ["JSON.stringify 结果", "(a, v) => JSON.stringify(v)", "violation"],
  ["join 结果", '(a, v) => v.items.map((i) => i.name).join(", ")', "violation"],

  // --- 应判 ok ---
  ["数组字面量", '(a, v) => [{ type: "text", text: `n=${v.n}` }]', "ok"],
  ["map 结果", '(a, v) => v.items.map((i) => ({ type: "text", text: i.name }))', "ok"],
  ["filter+map 链", "(a, v) => v.items.filter(Boolean).map((i) => ({ type: \"text\", text: i }))", "ok"],
  ["展开数组字面量", "(a, v) => [...build(v)]", "ok"],
  ["concat 结果", "(a, v) => base.concat(extra(v))", "ok"],
  ["块体内多处返回数组", 'function render(a, v) { if (!v) return []; return [{ type: "text", text: "x" }]; }', "ok"],

  // --- 应判 unknown（不可猜） ---
  ["返回局部变量", "function render(a, v) { const out = []; return out; }", "unknown"],
  ["返回函数调用结果", "(a, v) => format(v)", "unknown"],
  ["异步返回", "async function render(a, v) { return await build(v); }", "unknown"],
  ["空源码", "", "unknown"],
  ["非函数源码", "not a function at all", "unknown"]
];

for (const [name, src, expected] of CASES) {
  test(`render 契约: ${name} → ${expected}`, () => {
    const r = classifyRenderSource(src);
    assert.equal(r.status, expected, `reason=${r.reason}`);
    assert.ok(typeof r.reason === "string" && r.reason.length > 0, "必须有 reason");
  });
}

test("render 契约: 注释里的 return \"...\" 不得造成误报", () => {
  const src = [
    'function render(a, v) {',
    '  // return "old behaviour"',
    '  /* return "also old" */',
    '  return [{ type: "text", text: "ok" }];',
    '}'
  ].join("\n");
  assert.equal(classifyRenderSource(src).status, "ok");
});

test("render 契约: 字符串里的 // 不得被当成注释", () => {
  const src = '(a, v) => [{ type: "text", text: "https://example.com/x" }]';
  assert.equal(classifyRenderSource(src).status, "ok");
});

test("render 契约: violation 必须带命中证据", () => {
  const r = classifyRenderSource('(a, v) => `x=${v.x}`');
  assert.equal(r.status, "violation");
  assert.ok(r.evidence && r.evidence.length > 0, "violation 必须给出证据片段");
});

test("render 契约: 外层是方法简写时，嵌套箭头不得被误当成外层", () => {
  const src = 'render(a, v) { return { items: v.items }.items.map((i) => ({ type: "text", text: i })); }';
  const r = classifyRenderSource(src);
  assert.equal(r.status, "ok", `reason=${r.reason} evidence=${r.evidence}`);
});

test("render 契约: 嵌套函数里 return 字符串不得误报", () => {
  const src = 'render(a, v) { const f = () => { return "inner" }; return [{ type: "text", text: "ok" }]; }';
  const r = classifyRenderSource(src);
  assert.equal(r.status, "ok", `reason=${r.reason} evidence=${r.evidence}`);
});

test("render 契约: 嵌套 function 里 return 字符串不得误报", () => {
  const src = 'render(a, v) { function fmt(x) { return "s"; } return [{ type: "text", text: fmt(v) }]; }';
  const r = classifyRenderSource(src);
  assert.equal(r.status, "ok", `reason=${r.reason} evidence=${r.evidence}`);
});

test("render 契约: 数组字面量内部含 .join 不得误判为字符串（真实误报）", () => {
  const src = 'render(args, value) { return [{ type: "text", text: `Directory ${value.path}:\\n` + value.entries.join("\\n") }]; }';
  const r = classifyRenderSource(src);
  assert.equal(r.status, "ok", `reason=${r.reason} evidence=${r.evidence}`);
});

test("render 契约: 数组字面量之后接 .join 才是字符串", () => {
  const src = 'render(args, value) { return [{ type: "text", text: "x" }].join("\\n"); }';
  const r = classifyRenderSource(src);
  assert.equal(r.status, "violation", `reason=${r.reason}`);
});

test("render 契约: 括号包裹的数组字面量判 ok", () => {
  const src = 'render(a, v) { return ([{ type: "text", text: "ok" }]); }';
  assert.equal(classifyRenderSource(src).status, "ok");
});

test("render 契约: 调用参数里含 .join 不得误判（外层是未知调用）", () => {
  const src = 'render(a, v) { return wrap(v.items.join(",")); }';
  assert.equal(classifyRenderSource(src).status, "unknown");
});

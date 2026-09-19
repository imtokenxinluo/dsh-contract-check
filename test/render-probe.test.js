// 实测 render 契约测试。
//
// 为什么必须实测：`defineTool` 会把用户的 render 包一层 ——
//   output: { render(args, value) { return userRender(args, value); } }
// 静态拿到的是这个包装函数，函数体是"调用"，永远判不准（实机：21/21 unknown）。
// 所以对静态判不准的工具，真调一次 render 看返回值形态。
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeRender, fakeValueFromSchema } from "../src/render-probe.js";

function def(render, schema = { type: "object", additionalProperties: false, properties: {} }) {
  return { name: "t", description: "d", parameters: schema, output: { schema, render } };
}

test("实测: 返回数组 → ok", () => {
  const r = probeRender(def(() => [{ type: "text", text: "x" }]));
  assert.equal(r.status, "ok");
});

test("实测: 返回字符串 → violation（defineTool 包装的形态也能查出）", () => {
  const userRender = () => "bare string";
  // 模拟 defineTool 的包装
  const wrapped = def((args, value) => userRender(args, value));
  const r = probeRender(wrapped);
  assert.equal(r.status, "violation");
  assert.match(r.reason, /字符串/);
  assert.ok(r.evidence);
});

test("实测: render 抛异常 → unknown（不误报成 violation）", () => {
  const r = probeRender(def(() => { throw new Error("render boom"); }));
  assert.equal(r.status, "unknown");
  assert.match(r.reason, /抛异常|boom/);
});

test("实测: 返回对象（非数组非字符串）→ violation（契约要求 ContentBlock[]）", () => {
  const r = probeRender(def(() => ({ type: "text", text: "x" })));
  assert.equal(r.status, "violation");
});

test("实测: 返回 undefined/null → violation", () => {
  assert.equal(probeRender(def(() => undefined)).status, "violation");
  assert.equal(probeRender(def(() => null)).status, "violation");
});

test("实测: 不是函数 → unknown", () => {
  const r = probeRender({ name: "t", output: { schema: {}, render: 42 } });
  assert.equal(r.status, "unknown");
});

test("实测: 按 output.schema 造假数据喂给 render", () => {
  let seen = null;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { bytes: { type: "integer" }, path: { type: "string" }, ok: { type: "boolean" } }
  };
  const r = probeRender(def((args, value) => { seen = value; return []; }, schema));
  assert.equal(r.status, "ok");
  assert.equal(typeof seen.bytes, "number", `value 应由 schema 造出：${JSON.stringify(seen)}`);
  assert.equal(typeof seen.path, "string");
  assert.equal(typeof seen.ok, "boolean");
});

test("实测: 病态 schema 不会卡死（深度/自引用）", () => {
  const selfRef = { type: "object", properties: {} };
  selfRef.properties.self = selfRef; // 自引用
  const r = probeRender(def((args, value) => (value ? [] : []), selfRef));
  assert.ok(["ok", "violation", "unknown"].includes(r.status), "必须返回结论而不是卡住");
});

test("fakeValueFromSchema: 各种类型", () => {
  assert.equal(typeof fakeValueFromSchema({ type: "string" }), "string");
  assert.equal(typeof fakeValueFromSchema({ type: "integer" }), "number");
  assert.equal(typeof fakeValueFromSchema({ type: "boolean" }), "boolean");
  assert.ok(Array.isArray(fakeValueFromSchema({ type: "array", items: { type: "string" } })));
  assert.equal(fakeValueFromSchema({ type: "null" }), null);
  assert.equal(typeof fakeValueFromSchema({ type: "object", properties: { a: { type: "string" } } }), "object");
});

test("fakeValueFromSchema: 坏输入不抛异常", () => {
  for (const bad of [null, undefined, 42, "x", []]) {
    assert.doesNotThrow(() => fakeValueFromSchema(bad));
  }
});

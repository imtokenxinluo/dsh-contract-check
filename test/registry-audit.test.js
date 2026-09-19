// 枚举式审计测试：给定注册表视图，找出违规/不完整/不可判定的工具。
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditRegistry } from "../src/registry-audit.js";

function def(name, render, extra = {}) {
  return { name, description: `tool ${name}`, parameters: {}, output: { schema: {}, render }, ...extra };
}

const VIOLATING = def("sftp_write", (args, value) => `Wrote ${value.bytes} bytes`);
const COMPLIANT = def("ok_tool", () => [{ type: "text", text: "ok" }]);
const UNDECIDABLE = def("mystery", (args, value) => format(value));
const NO_RENDER = { name: "no_render", description: "d", parameters: {}, output: { schema: {} } };

test("审计：检出违规工具，且不误报合规工具", () => {
  const visible = new Map([
    ["sftp_write", VIOLATING],
    ["ok_tool", COMPLIANT]
  ]);
  const r = auditRegistry(visible);
  assert.equal(r.checked, 2);
  const names = r.findings.map((f) => f.tool);
  assert.ok(names.includes("sftp_write"), "应检出 sftp_write");
  assert.ok(!names.includes("ok_tool"), "不得误报 ok_tool");
  const viol = r.findings.find((f) => f.tool === "sftp_write");
  assert.equal(viol.status, "violation");
  assert.ok(viol.reason.length > 0);
});

test("审计：不可判定的工具进 unknown，不算 violation", () => {
  const r = auditRegistry(new Map([["mystery", UNDECIDABLE]]));
  assert.equal(r.violations, 0);
  assert.equal(r.unknown, 1);
  assert.equal(r.findings[0].status, "unknown");
});

test("审计：缺少 render 的工具报 incomplete，且不抛异常", () => {
  const r = auditRegistry(new Map([["no_render", NO_RENDER]]));
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].status, "incomplete");
});

test("审计：全合规时 findings 为空", () => {
  const r = auditRegistry(new Map([["ok_tool", COMPLIANT]]));
  assert.equal(r.findings.length, 0);
  assert.equal(r.violations, 0);
  assert.equal(r.checked, 1);
});

test("审计：空注册表不抛异常", () => {
  const r = auditRegistry(new Map());
  assert.equal(r.checked, 0);
  assert.deepEqual(r.findings, []);
});

test("审计：接受数组形式的定义集合", () => {
  const r = auditRegistry([VIOLATING, COMPLIANT]);
  assert.equal(r.checked, 2);
  assert.equal(r.violations, 1);
});

test("审计：坏输入（null/字符串）不抛异常，报 checked=0", () => {
  for (const bad of [null, undefined, "nope", 42]) {
    const r = auditRegistry(bad);
    assert.equal(r.checked, 0);
    assert.deepEqual(r.findings, []);
  }
});

test("审计：单个工具的 render 抛异常时不中断整体审计", () => {
  const thrower = { name: "thrower", description: "d", parameters: {}, output: { schema: {}, get render() { throw new Error("boom"); } } };
  const r = auditRegistry([thrower, VIOLATING]);
  assert.equal(r.checked, 2, "抛异常的工具仍应计入 checked");
  assert.ok(r.findings.some((f) => f.tool === "sftp_write" && f.status === "violation"));
  assert.ok(r.findings.some((f) => f.tool === "thrower"));
});

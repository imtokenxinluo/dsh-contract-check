// 状态判定与存储测试。
//
// 语义必须**可解释**，不用颜色表达模糊含义：
//   green  —— 体检过，0 违规
//   yellow —— 体检过，有违规
//   none   —— 尚未体检（诚实显示"不知道"，不假装健康）
// unknown（静态判不准）**不影响颜色**：它是"判不准"，不是"有问题"。
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStatus, createStatusStore } from "../src/status.js";

const clean = { checked: 47, violations: 0, unknown: 3, incomplete: 0, error: 0, findings: [] };
const risky = {
  checked: 47, violations: 2, unknown: 1, incomplete: 1, error: 0,
  findings: [
    { tool: "sftp_write", status: "violation", reason: "返回字符串，违反 render(): ContentBlock[] 契约" },
    { tool: "tunnel_list", status: "violation", reason: "返回字符串，违反 render(): ContentBlock[] 契约" }
  ]
};

test("状态: 未体检 → none（不假装健康）", () => {
  const s = computeStatus(null);
  assert.equal(s.level, "none");
  assert.equal(s.lastAuditAt, null);
  assert.equal(s.checked, 0);
  assert.match(s.label, /未体检|尚未/);
});

test("状态: 0 违规 → green", () => {
  const s = computeStatus(clean, 1700000000000);
  assert.equal(s.level, "green");
  assert.equal(s.violations, 0);
  assert.equal(s.checked, 47);
  assert.equal(s.lastAuditAt, 1700000000000);
});

test("状态: 有违规 → yellow", () => {
  const s = computeStatus(risky, 1700000000000);
  assert.equal(s.level, "yellow");
  assert.equal(s.violations, 2);
});

test("状态: unknown 不影响颜色（判不准 ≠ 有问题）", () => {
  const s = computeStatus({ checked: 10, violations: 0, unknown: 9, incomplete: 0, error: 0, findings: [] });
  assert.equal(s.level, "green");
  assert.equal(s.unknown, 9);
});

test("状态: 违规项带工具名（便于定位）", () => {
  const s = computeStatus(risky, 1);
  assert.equal(s.findings.length, 2);
  assert.equal(s.findings[0].tool, "sftp_write");
});

// --- 假绿防护：没检查到任何工具，绝不能显示"健康"（实机踩到）---

test("状态: checked=0 不得显示 green（假绿比不显示更糟）", () => {
  const s = computeStatus({ checked: 0, violations: 0, unknown: 0, incomplete: 0, error: 0, findings: [] }, 1);
  assert.notEqual(s.level, "green", "0 个工具 = 什么都没检查，不能说健康");
  assert.equal(s.level, "none");
  assert.match(s.label, /未|无法/);
});

test("状态: 无法枚举注册表（enumerable=false）也不得显示 green", () => {
  const s = computeStatus(
    { checked: 0, violations: 0, unknown: 0, incomplete: 0, error: 0, findings: [], enumerable: false }, 1);
  assert.equal(s.level, "none");
});

test("状态: 只要真检查过工具，0 违规才是 green", () => {
  const s = computeStatus({ checked: 1, violations: 0, unknown: 0, incomplete: 0, error: 0, findings: [] }, 1);
  assert.equal(s.level, "green");
});

test("状态: 全部不可判定 → 不得显示 green（等于没验证）", () => {
  const s = computeStatus({ checked: 21, violations: 0, unknown: 21, incomplete: 0, error: 0, findings: [] }, 1);
  assert.notEqual(s.level, "green", "21/21 判不准 = 什么都没验出来，不能说健康");
  assert.equal(s.level, "none");
  assert.match(s.detail, /判不准|没有验证/);
});

test("状态: 部分可判定 + 0 违规 → green（真验过一部分）", () => {
  const s = computeStatus({ checked: 21, violations: 0, unknown: 20, incomplete: 0, error: 0, findings: [] }, 1);
  assert.equal(s.level, "green");
  assert.equal(s.unknown, 20);
});

test("状态: 实测判定数单独成句，不混进状态条", () => {
  const s = computeStatus({ checked: 21, violations: 0, unknown: 0, incomplete: 0, error: 0, probed: 21, findings: [] }, 1);
  assert.equal(s.probed, 21);
  assert.match(s.probeNote, /实测/);
  assert.doesNotMatch(s.detail, /实测/, "状态条固定四段，实测数走 probeNote");
});

test("状态: 状态条文案固定为「无耗 · 检查 N 个插件 · 违规 V · 不可判定 U」", () => {
  const s = computeStatus(clean, 1);
  assert.equal(s.detail, "无耗 · 检查 47 个插件 · 违规 0 · 不可判定 3");

  // 为 0 的项也要显示：数字消失会被误读成"这一项没查"
  const z = computeStatus({ checked: 21, violations: 0, unknown: 0, incomplete: 0, error: 0, findings: [] }, 1);
  assert.equal(z.detail, "无耗 · 检查 21 个插件 · 违规 0 · 不可判定 0");

  const bad = computeStatus(risky, 1);
  assert.equal(bad.detail, "无耗 · 检查 47 个插件 · 违规 2 · 不可判定 1 · 不完整 1");
});

test("状态: 非法报告不抛异常", () => {
  for (const bad of [undefined, 0, "x", {}, []]) {
    assert.doesNotThrow(() => computeStatus(bad));
  }
});

// --- 存储 ---

test("存储: 初始为 none，set 后返回最新", () => {
  const store = createStatusStore();
  assert.equal(store.get().level, "none");
  store.set(clean, 1000);
  const got = store.get();
  assert.equal(got.level, "green");
  assert.equal(got.lastAuditAt, 1000);
});

test("存储: 并发互斥 —— 体检进行中时 begin 返回 false", () => {
  const store = createStatusStore();
  assert.equal(store.isRunning(), false);
  assert.equal(store.begin(), true);
  assert.equal(store.isRunning(), true);
  assert.equal(store.begin(), false, "第二次 begin 必须失败（防并发点击堆叠）");
  store.end();
  assert.equal(store.isRunning(), false);
  assert.equal(store.begin(), true);
  store.end();
});

test("存储: 体检失败不清空上一次结果", () => {
  const store = createStatusStore();
  store.set(risky, 2000);
  store.begin();
  store.end(); // 失败路径也可能 end
  assert.equal(store.get().level, "yellow");
  assert.equal(store.get().lastAuditAt, 2000);
});

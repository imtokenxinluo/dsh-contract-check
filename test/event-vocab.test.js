// 事件类型词汇表校验测试。
// 背景：加载器只认识内核词汇表里的事件类型（或带 ignorable 标记的）；表外类型直接拒绝
// 解释整条日志，而 Session.append 设不了 ignorable。
// ⚠️ 但"表外"≠"一定打不开"（2026-09-20 修正）：KNOWN_SESSION_EVENT_TYPES 是导出的
// **可变 Set**，插件可以在运行时 .add() 注册自己的类型（真实例：@flowingspring/dsh-voco）。
// 所以本模块只能回答"是否在内核**初始**表内"，回答不了"有没有被注册过"。
import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_EVENT_TYPES, VOCAB_VERSION, checkEventType } from "../src/event-vocab.js";

// 注意这里**不写死**条目数与版本：词表是随内核升级重新生成的快照，
// 写死就等于"每次内核升级都要手改测试"，而真正该报警的是**漂移**
// （见下方 drift 测试：与已安装内核比对，漂了就红）。
test("词汇表：非空且版本号形如内核版本", () => {
  assert.ok(KNOWN_EVENT_TYPES.size > 0, "词汇表不应为空");
  assert.match(VOCAB_VERSION, /^\d+\.\d+\.\d+/, `版本号形如 x.y.z，实际 ${VOCAB_VERSION}`);
});

test("词汇表：与内核漂移检测（无内核时跳过）", async () => {
  // 这条测试的意义：词表是**生成物**，内核升级后它会静默过期 ——
  // 过期的代价是双向的：新增类型被误报成"表外"，已移除类型被误判成合法。
  // 找到内核就比对，找不到（如精简 CI 环境）则跳过，绝不伪造通过。
  const { findKernelVocab } = await import("../scripts/verify-vocab.mjs");
  const kernel = await findKernelVocab();
  if (!kernel) return; // 环境里没有内核 -> 跳过
  const missing = [...kernel.types].filter((t) => !KNOWN_EVENT_TYPES.has(t));
  const extra = [...KNOWN_EVENT_TYPES].filter((t) => !kernel.types.has(t));
  assert.deepEqual(
    { missing, extra, kernelVersion: kernel.version, vocabVersion: VOCAB_VERSION },
    { missing: [], extra: [], kernelVersion: kernel.version, vocabVersion: kernel.version },
    "内嵌词汇表与已安装内核不一致 -> 运行 npm run gen:vocab 重新生成",
  );
});

test("词汇表：全部已知类型判 known", () => {
  for (const t of KNOWN_EVENT_TYPES) {
    assert.equal(checkEventType(t).status, "known", `${t} 应判 known`);
  }
});

test("词汇表：内核真实类型抽样均在表内", () => {
  for (const t of ["tool/call", "tool/result", "turn/end", "user/message", "assistant/message", "todo/write", "session/title", "agent/inbox/spliced"]) {
    assert.ok(KNOWN_EVENT_TYPES.has(t), `${t} 应存在于词汇表`);
  }
});

test("词汇表：社区报告过的越界类型判 unknown", () => {
  for (const t of ["my-plugin/whatever", "agent-teams/team-created", "message-edit/version", "web/exa-search-request"]) {
    const r = checkEventType(t);
    assert.equal(r.status, "unknown", `${t} 应判 unknown`);
    assert.ok(r.reason.length > 0);
  }
});

test("词汇表：非法输入不抛异常", () => {
  for (const bad of [null, undefined, "", 42, {}]) {
    const r = checkEventType(bad);
    assert.equal(r.status, "unknown");
  }
});

// --- 措辞不得退回"绝对违规"（2026-09-20 修正：表外 ≠ 一定打不开）---

test("词汇表：表外的判定理由必须提到『注册』这个前提，不能断言一定会坏", () => {
  const r = checkEventType("some-plugin/custom-event");
  assert.equal(r.status, "unknown");
  assert.match(r.reason, /注册/, "理由里必须提醒『是否已注册』——插件可以通过改 Set 自救");
  assert.match(r.reason, /若|如果|从未/, "必须是条件式表述，不能断言一定拒绝解释");
});

// 事件类型词汇表校验测试。
// 背景：加载器只认识内核词汇表里的事件类型；表外类型直接拒绝解释整条日志，
// 而 Session.append 无法设置 ignorable —— 插件自己发明事件名会让使用者会话打不开。
import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_EVENT_TYPES, VOCAB_VERSION, checkEventType } from "../src/event-vocab.js";

test("词汇表：本版本共 44 类", () => {
  assert.equal(KNOWN_EVENT_TYPES.size, 44, `实际 ${KNOWN_EVENT_TYPES.size}`);
  assert.equal(VOCAB_VERSION, "0.1.0-rc.6");
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

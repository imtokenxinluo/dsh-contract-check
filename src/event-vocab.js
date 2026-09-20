// 内核会话事件类型词汇表（生成文件，勿手改）。
//
// 为什么这份表重要：加载器只认识表内类型（或带 ignorable 标记的），遇到表外类型会
// **拒绝解释整条日志**（"unknown to this harness and not marked ignorable"）；
// 而 Session.append 的 opts 只接受 sourceEventSeqs / surfaceOp，**插件设不了 ignorable**。
//
// ⚠️ 但要区分"没注册"和"注册过"（2026-09-20 修正）：
// KNOWN_SESSION_EVENT_TYPES 是**导出的可变 Set**，插件可以在运行时 .add() 把自己的类型
// 注册进去（真实例：@flowingspring/dsh-voco 同时改自己那份与宿主那份）。
// 所以"表外"≠ 一定打不开会话 —— 只有一个前提：**该类型确实从未被注册**。
// 本模块只能回答"是否在内核**初始**词汇表内"，回答不了"有没有被注册过"。
//
// 生成自：@deepseek-ai/dsh-session@0.1.0-rc.6 的 KNOWN_SESSION_EVENT_TYPES
// 重新生成：node scripts/gen-event-vocab.mjs [路径]
// 漂移检查：node scripts/verify-vocab.mjs

export const VOCAB_VERSION = "0.1.0-rc.6";

export const KNOWN_EVENT_TYPES = new Set([
  "agent-preset/selected",
  "agent/inbox/spliced",
  "approval/asked",
  "approval/decided",
  "approval/policy",
  "assistant/chunk",
  "assistant/message",
  "command/done",
  "command/run",
  "compaction/end",
  "compaction/prune",
  "compaction/start",
  "compaction/summary",
  "feedback/record",
  "goal/change",
  "hook/invoked",
  "hook/result",
  "llm/retry",
  "llm/retry-started",
  "permission/preset",
  "plan/mode",
  "request/context",
  "request/header",
  "sandbox/mode",
  "schedule/change",
  "session/end-seed",
  "session/title",
  "session/title-llm-request",
  "step/end",
  "step/start",
  "subagent/descriptor",
  "todo/write",
  "tool-workflow/agent-end",
  "tool-workflow/agent-start",
  "tool-workflow/run-end",
  "tool-workflow/run-start",
  "tool/call",
  "tool/code-dispatch",
  "tool/code-dispatch-start",
  "tool/result",
  "turn/end",
  "turn/start",
  "user/message",
  "web/deepseek-search-llm-request"
]);

/**
 * 校验一个会话事件类型是否在内核**初始**词汇表内。
 * 注意：返回 unknown 只代表"不在初始表内"，**不代表该类型没被插件注册过**。
 * @param {unknown} type
 * @returns {{status: "known"|"unknown", type: unknown, reason: string}}
 */
export function checkEventType(type) {
  if (typeof type !== 'string' || type.length === 0) {
    return { status: 'unknown', type, reason: '事件类型不是非空字符串' };
  }
  if (KNOWN_EVENT_TYPES.has(type)) {
    return { status: 'known', type, reason: '在内核词汇表内' };
  }
  return {
    status: 'unknown',
    type,
    reason:
      '不在内核初始词汇表内：**若该类型从未被注册**，加载器会拒绝解释整条日志（append 设不了 ignorable）。' +
      '请确认：(a) 你是否在加载时把该类型 .add() 进了 KNOWN_SESSION_EVENT_TYPES（含宿主那份模块实例？）；' +
      '(b) 否则应改用词汇表内的类型，或不要写这个事件'
  };
}

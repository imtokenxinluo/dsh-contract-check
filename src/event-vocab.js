// 内核会话事件类型词汇表（生成文件，勿手改）。
//
// 为什么这份表很重要：加载器只认识表内类型，遇到表外类型会**拒绝解释整条日志**
// （"unknown to this harness and not marked ignorable"）；而 Session.append 的 opts
// 只接受 sourceEventSeqs / surfaceOp，**插件无法设置 ignorable**。因此在当前内核上，
// 插件写一个自定义事件名 = 使用者的会话打不开。
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
 * 校验一个会话事件类型是否在内核词汇表内。
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
      '不在内核词汇表内：加载器会拒绝解释整条日志，而 append 无法设置 ignorable —— 应改用「不写自定义事件」或词汇表内的类型'
  };
}

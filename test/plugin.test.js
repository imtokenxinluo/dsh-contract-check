// 插件壳测试：用假 ctx 驱动，不依赖真实 DSH。
import { test } from "node:test";
import assert from "node:assert/strict";
import plugin, { auditCtx } from "../src/plugin.js";

function fakeCtx({ visible, logger } = {}) {
  const warns = [];
  const handlers = new Map();
  const ctx = {
    logger: logger ?? { warn: (m) => warns.push(String(m)) },
    tools: visible === undefined ? undefined : { view: () => ({ visible }) },
    on(event, fn) { handlers.set(event, fn); return () => handlers.delete(event); }
  };
  return { ctx, warns, handlers, emit: (ev, ...args) => handlers.get(ev)?.(...args) };
}

const VIOLATING = { name: "sftp_write", description: "d", parameters: {}, output: { schema: {}, render: (a, v) => `Wrote ${v.bytes}` } };
const COMPLIANT = { name: "ok_tool", description: "d", parameters: {}, output: { schema: {}, render: () => [{ type: "text", text: "ok" }] } };

test("插件：apply 注册 session/event 监听", () => {
  const { ctx, handlers } = fakeCtx({ visible: new Map([["ok_tool", COMPLIANT]]) });
  plugin.apply(ctx, {});
  assert.ok(handlers.has("session/event"), "应订阅 session/event");
});

test("插件：启动审计检出违规工具并告警（含工具名）", () => {
  const { ctx, warns } = fakeCtx({ visible: new Map([["sftp_write", VIOLATING], ["ok_tool", COMPLIANT]]) });
  plugin.apply(ctx, { auditOnLoad: true });
  const all = warns.join("\n");
  assert.match(all, /sftp_write/, `告警里应含违规工具名，实际：${all}`);
  assert.ok(!/ok_tool/.test(all), "不得告警合规工具");
});

test("插件：无 ctx.tools 时告警“无法枚举”，且不抛异常", () => {
  const { ctx, warns } = fakeCtx({});
  assert.doesNotThrow(() => plugin.apply(ctx, { auditOnLoad: true }));
  assert.match(warns.join("\n"), /无法枚举|不可用/);
});

test("插件：全合规时不产生违规告警", () => {
  const { ctx, warns } = fakeCtx({ visible: new Map([["ok_tool", COMPLIANT]]) });
  plugin.apply(ctx, { auditOnLoad: true });
  assert.ok(!/violation|违规/.test(warns.join("\n")), `不应有违规告警：${warns.join(" | ")}`);
});

test("插件：session/event 遇到词汇表外事件类型时告警", () => {
  const { ctx, warns, emit } = fakeCtx({ visible: new Map() });
  plugin.apply(ctx, {});
  emit("session/event", { id: "s1" }, { type: "my-plugin/thing", seq: 7 });
  const all = warns.join("\n");
  assert.match(all, /my-plugin\/thing/, `应告警越界类型，实际：${all}`);
});

test("插件：session/event 里的合法类型不告警", () => {
  const { ctx, warns, emit } = fakeCtx({ visible: new Map() });
  plugin.apply(ctx, {});
  emit("session/event", { id: "s1" }, { type: "tool/result", seq: 8 });
  // 注：假 ctx 没有 webServer，首次流量会触发"GUI 路由未挂载"诊断 —— 那是另一回事，
  // 这里只断言「没有把合法类型报成越界」。
  assert.ok(!/表外事件类型/.test(warns.join("\n")), `合法类型不该报越界：${warns.join(" | ")}`);
});

test("插件：内部异常被吞掉，不影响宿主启动", () => {
  const { ctx } = fakeCtx({ visible: new Map() });
  // 故意把 view 换成会抛的实现
  ctx.tools = { view() { throw new Error("boom"); } };
  assert.doesNotThrow(() => plugin.apply(ctx, { auditOnLoad: true }));
});

test("auditCtx：可独立调用并返回审计报告", () => {
  const { ctx } = fakeCtx({ visible: new Map([["sftp_write", VIOLATING]]) });
  const r = auditCtx(ctx);
  assert.equal(r.checked, 1);
  assert.equal(r.violations, 1);
});

test("插件：加载时注册表为空则静默（其它插件可能尚未注册）", () => {
  const { ctx, warns } = fakeCtx({ visible: new Map() });
  plugin.apply(ctx, { auditOnLoad: true });
  assert.equal(warns.length, 0, `注册表为空时不应输出：${warns.join(" | ")}`);
});

test("插件：tools/change 后重新体检，能发现后注册的违规工具", () => {
  const visible = new Map();
  const warns = [];
  const handlers = new Map();
  const ctx = {
    logger: { warn: (m) => warns.push(String(m)) },
    tools: { view: () => ({ visible }) },
    on(event, fn) { handlers.set(event, fn); return () => handlers.delete(event); }
  };
  plugin.apply(ctx, { auditOnLoad: true });
  assert.equal(warns.length, 0, "初始为空应静默");

  // 之后某个插件注册了一个违规工具
  visible.set("sftp_write", VIOLATING);
  handlers.get("tools/change")?.();

  const all = warns.join("\n");
  assert.match(all, /sftp_write/, `应在 tools/change 后检出：${all}`);
});

test("插件：同一个问题不重复告警", () => {
  const visible = new Map([["sftp_write", VIOLATING]]);
  const warns = [];
  const handlers = new Map();
  const ctx = {
    logger: { warn: (m) => warns.push(String(m)) },
    tools: { view: () => ({ visible }) },
    on(event, fn) { handlers.set(event, fn); return () => handlers.delete(event); }
  };
  plugin.apply(ctx, { auditOnLoad: true });
  const after1 = warns.length;
  handlers.get("tools/change")?.();
  handlers.get("tools/change")?.();
  assert.equal(warns.length, after1, `重复体检不应重复告警：${warns.join(" | ")}`);
});

test("插件：收不到 tools/change 时，首次 session/event 补做体检", () => {
  // 事件作用域未必能到达本插件，所以不能只依赖 tools/change。
  const visible = new Map();
  const warns = [];
  const handlers = new Map();
  const ctx = {
    logger: { warn: (m) => warns.push(String(m)) },
    tools: { view: () => ({ visible }) },
    on(event, fn) { handlers.set(event, fn); return () => handlers.delete(event); }
  };
  plugin.apply(ctx, { auditOnLoad: true });
  assert.equal(warns.length, 0, "初始注册表为空应静默");

  visible.set("sftp_write", VIOLATING);          // 其它插件已注册
  handlers.get("session/event")?.({ id: "s1" }, { type: "tool/result", seq: 1 }); // 只有会话流量，没有 tools/change

  assert.match(warns.join("\n"), /sftp_write/, `应补做体检并检出：${warns.join(" | ")}`);
});

// --- GUI 状态接口：注册 HTTP 路由 ---

test("插件：有 webServer 时注册 status 与 audit 两条路由", () => {
  const routes = [];
  const ctx = {
    logger: { warn: () => {} },
    tools: { view: () => ({ visible: new Map([["ok_tool", COMPLIANT]]) }) },
    on: () => () => {},
    webServer: { register: (r) => { routes.push(r); return () => {}; } }
  };
  plugin.apply(ctx, { auditOnLoad: true });
  const paths = routes.map((r) => r.path).sort();
  assert.deepEqual(paths, ["/contract-check/audit", "/contract-check/status"]);
  assert.ok(routes.every((r) => r.kind === "exact"), "必须是 exact 路由");
  assert.ok(routes.every((r) => typeof r.handler === "function"), "每条路由都要有 handler");
});

test("插件：没有 webServer 时保持静默（GUI 可选，不是问题）", () => {
  const warns = [];
  const ctx = {
    logger: { warn: (m) => warns.push(String(m)) },
    tools: { view: () => ({ visible: new Map([["ok_tool", COMPLIANT]]) }) },
    on: () => () => {}
  };
  assert.doesNotThrow(() => plugin.apply(ctx, { auditOnLoad: true }));
  assert.ok(!/webServer|路由/.test(warns.join("\n")), `不该告警：${warns.join(" | ")}`);
});

test("插件：注册路由抛异常被吞掉，不影响体检与宿主", () => {
  const warns = [];
  const ctx = {
    logger: { warn: (m) => warns.push(String(m)) },
    tools: { view: () => ({ visible: new Map([["sftp_write", VIOLATING]]) }) },
    on: () => () => {},
    webServer: { register: () => { throw new Error("duplicate route"); } }
  };
  assert.doesNotThrow(() => plugin.apply(ctx, { auditOnLoad: true }));
  assert.match(warns.join("\n"), /注册状态路由失败/);
  assert.match(warns.join("\n"), /sftp_write/, "体检仍应照常执行并告警");
});

// --- 时序：apply 早于 webServer 就绪（实机踩到的坑）---

test("插件：有 ctx.inject 时走注入路径，服务就绪后才注册路由", () => {
  const routes = [];
  let injected = null;
  const ctx = {
    logger: { warn: () => {} },
    tools: { view: () => ({ visible: new Map() }) },
    on: () => () => {},
    inject(deps, cb) { injected = { deps, cb }; }   // 模拟 cordis 的延迟注入
  };
  plugin.apply(ctx, { auditOnLoad: false });
  assert.deepEqual(injected.deps, ["webServer"], "应声明依赖 webServer");
  assert.equal(routes.length, 0, "服务未就绪前不应注册");
  injected.cb({ webServer: { register: (r) => { routes.push(r); return () => {}; } } });
  assert.equal(routes.length, 2, "服务就绪后应注册两条路由");
});

test("插件：webServer 始终缺席 → 体检照常、且首次会话流量时明确告警", () => {
  const warns = [];
  const handlers = new Map();
  const visible = new Map([["ok_tool", COMPLIANT]]);
  const ctx = {
    logger: { warn: (m) => warns.push(String(m)) },
    tools: { view: () => ({ visible }) },
    on(event, fn) { handlers.set(event, fn); return () => handlers.delete(event); },
    inject: () => { /* 服务永不就绪 */ }
  };
  plugin.apply(ctx, { auditOnLoad: true });
  assert.ok(!/未挂载/.test(warns.join("\n")), "启动时不该急着告警");
  handlers.get("session/event")?.({ id: "s1" }, { type: "tool/result", seq: 1 });
  assert.match(warns.join("\n"), /GUI 状态路由未挂载/, `应有明确诊断：${warns.join(" | ")}`);
});

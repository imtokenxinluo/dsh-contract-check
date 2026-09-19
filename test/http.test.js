// HTTP 路由 handler 测试（用假 req/res，不依赖真实 server）。
//
// 路由：
//   GET  /contract-check/status  → 最近一次体检结果（JSON）
//   POST /contract-check/audit   → 触发一次体检并返回结果（JSON）
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttpHandlers } from "../src/http.js";
import { createStatusStore } from "../src/status.js";

function fakeRes() {
  const out = { statusCode: null, headers: null, body: "" };
  return {
    out,
    writeHead(code, headers) { out.statusCode = code; out.headers = headers; },
    end(body) { if (body !== undefined) out.body += String(body); }
  };
}

const cleanReport = { checked: 5, violations: 0, unknown: 0, incomplete: 0, error: 0, findings: [] };
const badReport = {
  checked: 5, violations: 1, unknown: 0, incomplete: 0, error: 0,
  findings: [{ tool: "sftp_write", status: "violation", reason: "返回字符串" }]
};

function mk(opts = {}) {
  const store = createStatusStore();
  if (opts.seed) store.set(opts.seed, 1234);
  const calls = [];
  const inner = opts.audit ?? (() => cleanReport);
  // 计数器要包在外面，否则传入自定义 audit 时就统计不到了（测试自身的 bug）
  const audit = () => { calls.push("audit"); return inner(); };
  return { store, calls, h: createHttpHandlers({ store, audit }) };
}

test("http: /status 未体检 → level=none 且 200", () => {
  const { h } = mk();
  const res = fakeRes();
  h.status({ method: "GET" }, res);
  assert.equal(res.out.statusCode, 200);
  assert.match(res.out.headers["content-type"], /application\/json/);
  const body = JSON.parse(res.out.body);
  assert.equal(body.level, "none");
  assert.equal(body.lastAuditAt, null);
});

test("http: /status 返回 level/checked/violations/lastAuditAt", () => {
  const { h } = mk({ seed: badReport });
  const res = fakeRes();
  h.status({ method: "GET" }, res);
  const body = JSON.parse(res.out.body);
  assert.equal(body.level, "yellow");
  assert.equal(body.checked, 5);
  assert.equal(body.violations, 1);
  assert.equal(body.lastAuditAt, 1234);
  assert.equal(body.findings.length, 1);
});

test("http: /audit 触发体检、更新存储、返回新状态", async () => {
  const { h, store, calls } = mk({ seed: cleanReport, audit: () => badReport });
  const res = fakeRes();
  await h.audit({ method: "POST" }, res);
  assert.equal(res.out.statusCode, 200);
  assert.deepEqual(calls, ["audit"]);
  const body = JSON.parse(res.out.body);
  assert.equal(body.level, "yellow");
  assert.equal(store.get().level, "yellow");
});

test("http: /audit 体检抛异常 → 500 且保留上一次结果", async () => {
  const { h, store } = mk({
    seed: cleanReport,
    audit: () => { throw new Error("boom"); }
  });
  const res = fakeRes();
  await h.audit({ method: "POST" }, res);
  assert.equal(res.out.statusCode, 500);
  const body = JSON.parse(res.out.body);
  assert.equal(body.ok, false);
  assert.match(String(body.error), /boom/);
  assert.equal(store.get().level, "green", "失败不得清空上一次结果");
  assert.equal(store.isRunning(), false, "失败后必须释放互斥锁");
});

test("http: /audit 并发点击 → 第二次返回 409（不排队堆叠）", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { h } = mk({ audit: () => { /* 挂起，模拟慢体检 */ } });
  // 手动占用互斥
  const { store } = mk();
  // 用同一个 store 构造：重来一次，确保共享
  const store2 = createStatusStore();
  const h2 = createHttpHandlers({ store: store2, audit: async () => { await gate; return cleanReport; } });
  const res1 = fakeRes();
  const p1 = h2.audit({ method: "POST" }, res1);
  const res2 = fakeRes();
  await h2.audit({ method: "POST" }, res2);
  assert.equal(res2.out.statusCode, 409, "体检进行中应返回 409");
  release();
  await p1;
  assert.equal(res1.out.statusCode, 200);
});

test("http: /audit 非 POST → 405", async () => {
  const { h, calls } = mk();
  const res = fakeRes();
  await h.audit({ method: "GET" }, res);
  assert.equal(res.out.statusCode, 405);
  assert.deepEqual(calls, [], "不应触发体检");
});

test("http: /status 非 GET → 405", () => {
  const { h } = mk();
  const res = fakeRes();
  h.status({ method: "POST" }, res);
  assert.equal(res.out.statusCode, 405);
});

// --- 诊断：枚举失败时不必靠日志/截图定位 ---

test("http: /status 带上诊断快照", () => {
  const store = createStatusStore();
  const h = createHttpHandlers({
    store,
    audit: () => cleanReport,
    diag: () => ({ toolsInjectFired: true, registrySource: "ctx.tools", viewInfo: "Map(3)" })
  });
  const res = fakeRes();
  h.status({ method: "GET" }, res);
  const body = JSON.parse(res.out.body);
  assert.equal(body.diag.toolsInjectFired, true);
  assert.equal(body.diag.registrySource, "ctx.tools");
  assert.match(body.diag.viewInfo, /Map/);
});

test("http: diag 抛异常不影响状态返回", () => {
  const store = createStatusStore();
  const h = createHttpHandlers({ store, audit: () => cleanReport, diag: () => { throw new Error("diag boom"); } });
  const res = fakeRes();
  assert.doesNotThrow(() => h.status({ method: "GET" }, res));
  assert.equal(res.out.statusCode, 200);
  assert.equal(JSON.parse(res.out.body).ok, true);
});

test("http: 没有 diag 时字段为 undefined（不报错）", () => {
  const { h } = mk();
  const res = fakeRes();
  h.status({ method: "GET" }, res);
  assert.equal(JSON.parse(res.out.body).diag, undefined);
});

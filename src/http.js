// HTTP 路由 handler：把体检状态暴露给 GUI（同源 fetch，不需要 RPC 协议）。
//
//   GET  /contract-check/status  → 最近一次体检结果
//   POST /contract-check/audit   → 立刻体检一次并返回新结果
//
// 设计取舍：
//   * 只用 node:http 的 (req,res)，**不引入 typert/remote RPC** —— 客户端同源 fetch 即可
//   * 体检失败**不清空**上一次结果（否则界面会从"有风险"跳回"未知"，丢掉信息）
//   * 体检进行中再次点击 → 409（枚举注册表是 CPU 活，连点会堆任务）

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, JSON_HEADERS);
  res.end(body);
}

/**
 * @param {{store: object, audit: () => object|Promise<object>, diag?: () => object}} deps
 *   store  —— createStatusStore() 的实例
 *   audit  —— 跑一次体检，返回审计报告
 *   diag   —— 可选：诊断快照（枚举用了哪个访问器、注入是否触发），随 /status 返回。
 *             为什么带上它：枚举失败时界面只显示灰点，而日志未必拿得到
 *             （日志只在用启动器启动时才有）。带上诊断 = 一次重启就能定位。
 * @returns {{status: Function, audit: Function}} node:http handler（req,res）
 */
export function createHttpHandlers({ store, audit, diag }) {
  const diagSnapshot = () => {
    try { return typeof diag === "function" ? diag() : undefined; } catch { return undefined; }
  };

  const statusHandler = (req, res) => {
    if (req?.method !== "GET") return sendJson(res, 405, { ok: false, error: "use GET" });
    try {
      sendJson(res, 200, { ok: true, ...store.get(), running: store.isRunning(), diag: diagSnapshot() });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
    }
  };

  const auditHandler = async (req, res) => {
    if (req?.method !== "POST") return sendJson(res, 405, { ok: false, error: "use POST" });
    if (!store.begin()) {
      return sendJson(res, 409, { ok: false, error: "体检正在进行中", ...store.get(), running: true });
    }
    try {
      const report = await audit();
      const status = store.set(report);
      sendJson(res, 200, { ok: true, ...status, running: false, diag: diagSnapshot() });
    } catch (error) {
      // 关键：失败保留上一次结果，只报错
      sendJson(res, 500, { ok: false, error: String(error?.message ?? error), ...store.get(), running: false });
    } finally {
      store.end();
    }
  };

  return { status: statusHandler, audit: auditHandler };
}

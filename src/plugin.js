// plugin.js — cordis 插件壳：对当前注册的工具做契约体检，并盯住会话事件类型。
//
// 只做两件事，且**只告警、不拦截**（用户明确选择）：
//   1) 枚举 ctx.tools.view() 里可见的工具定义，检查 render 契约（静态 + 实测兜底）
//   2) 订阅 session/event，发现越出内核词汇表的事件类型立刻告警
//
// 它检测的是「契约合规」，**不检测恶意**。进程内的检查器无法对抗同进程的恶意代码
// —— 这一点写在 README 第一段，不靠读者的想象补全。

import { auditRegistry } from "./registry-audit.js";
import { checkEventType } from "./event-vocab.js";
import { createStatusStore } from "./status.js";
import { createHttpHandlers } from "./http.js";
import { probeRender } from "./render-probe.js";

const TAG = "[contract-check]";
const STATUS_PATH = "/contract-check/status";
const AUDIT_PATH = "/contract-check/audit";

/**
 * 读取可见工具集合，并**记录为什么失败**。
 *
 * 为什么带诊断：枚举失败时（实机踩到）界面只会显示灰点，日志又未必拿得到
 * （日志只在用启动器启动时才有）。把「用了哪个访问器 / view() 返回什么」
 * 直接暴露到 /status，一次重启就能定位。
 *
 * 注意：未注入时 `ctx.tools` 会**抛异常**（"cannot get property without inject"），
 * 不是返回 undefined —— 所以第一次访问必须包在 try 里。
 *
 * @returns {{visible: Map|Array|object|null, source: string, viewInfo: string}}
 */
function readVisible(ctx, diag) {
  const record = (key, value) => { if (diag) diag.accessors[key] = value; };

  let tools;
  try {
    tools = ctx?.tools;
  } catch {
    tools = undefined; // 未注入 → 抛异常，这里当作"没有"
  }
  record("ctxTools", !!tools);
  let source = tools ? "ctx.tools" : "none";

  if (!tools) {
    try { tools = ctx?.get?.("tools"); } catch { tools = undefined; }
    record("ctxGet", !!tools);
    if (tools) source = "ctx.get('tools')";
  }

  if (!tools) return { visible: null, source, viewInfo: "拿不到 tools 服务" };

  try {
    const view = tools.view?.();
    if (!view || typeof view !== "object") return { visible: null, source, viewInfo: "view() 返回非对象" };
    const visible = view.visible;
    if (visible instanceof Map) return { visible, source, viewInfo: `Map(${visible.size})` };
    if (Array.isArray(visible)) return { visible, source, viewInfo: `Array(${visible.length})` };
    if (visible && typeof visible === "object") {
      return { visible, source, viewInfo: `Object(${Object.keys(visible).length})` };
    }
    return { visible: null, source, viewInfo: "view().visible 形态未知" };
  } catch (error) {
    return { visible: null, source, viewInfo: `view() 抛异常：${String(error?.message ?? error)}` };
  }
}

/**
 * 对当前 ctx 做一次注册表审计。
 * @param {object} ctx
 * @param {object} [diag] - 可选：诊断信息收集器（会被就地写入）
 * @param {object} [options] - { probe }：静态判不准时的实测器
 * @returns {{checked:number, violations:number, unknown:number, incomplete:number,
 *   error:number, enumerable:boolean, findings:object[]}}
 */
export function auditCtx(ctx, diag, { probe } = {}) {
  const { visible, source, viewInfo } = readVisible(ctx, diag);
  if (diag) {
    diag.registrySource = source;
    diag.viewInfo = viewInfo;
  }
  if (visible === null) {
    return { checked: 0, violations: 0, unknown: 0, incomplete: 0, error: 0, enumerable: false, findings: [] };
  }
  const report = auditRegistry(visible, probe ? { probe } : {});
  return { ...report, enumerable: true };
}

/** 把审计报告写成告警（all 为 true 时连 unknown 也报）。 */
function warnReport(ctx, report, { all = false, onFinding, seen, initial = false } = {}) {
  if (!report.enumerable) {
    ctx.logger?.warn?.(`${TAG} 无法枚举工具注册表（ctx.tools 不可用）——本插件无法体检，未做任何改动`);
    return 0;
  }
  // 注册表为空：多半是「其它插件还没注册完」，保持安静，等 tools/change。
  if (report.checked === 0) return 0;

  let fresh = 0;
  for (const f of report.findings) {
    if (!all && f.status === "unknown") continue;
    const key = `${f.tool}|${f.status}|${f.reason}`;
    if (seen?.has(key)) continue;
    seen?.add(key);
    fresh++;
    ctx.logger?.warn?.(
      `${TAG} ${f.status} 工具=${f.tool}：${f.reason}${f.evidence ? ` | 证据: ${f.evidence}` : ""}`
    );
    try { onFinding?.(f); } catch { /* 回调异常不影响宿主 */ }
  }

  // 汇总只在首次体检或确实有新发现时输出，避免 tools/change 反复刷屏。
  if (initial || fresh > 0) {
    const parts = [];
    if (report.violations > 0) parts.push(`违规 ${report.violations}`);
    if (report.incomplete > 0) parts.push(`不完整 ${report.incomplete}`);
    if (report.unknown > 0) parts.push(`不可判定 ${report.unknown}`);
    if (report.probed > 0) parts.push(`其中实测判定 ${report.probed}`);
    if (report.error > 0) parts.push(`读取失败 ${report.error}`);
    ctx.logger?.warn?.(
      `${TAG} 无耗检查 ${report.checked} 个插件，` +
        (parts.length > 0 ? parts.join("，") : "全部合规")
    );
  }
  return fresh;
}

export default {
  name: "contract-check",
  apply(ctx, config = {}) {
    const auditOnLoad = config.auditOnLoad ?? true;
    const reportUnknown = config.reportUnknown ?? false;
    const onFinding = config.onFinding;
    // 实测默认**开**：`defineTool` 把用户的 render 包一层，静态永远看不透
    // （实机 21/21 unknown = 等于没检查）。要关：probeRender: false
    const probe = config.probeRender === false ? null : probeRender;
    const seen = new Set(); // tool|status|reason，避免重复告警
    const store = createStatusStore();

    // 注册表 ctx：`tools` 服务就绪前枚举不了。
    // 实机踩到：不声明注入时 `ctx.tools` 是 undefined（且访问会抛异常）→ 体检报"检查 0 个工具"，
    // 而 0 个工具曾被算成绿色（假绿）。两处都修：这里等注入；状态判定拒绝假绿。
    let registryCtx = ctx;

    // 诊断信息（随 /status 一起暴露）：枚举失败时不必再猜，
    // 也不必依赖日志（日志只在用启动器启动时才有）。
    const diag = {
      toolsInjectFired: false,
      webServerInjectFired: false,
      toolsChangeEvents: 0,
      sessionEvents: 0,
      audits: 0,
      registrySource: null,
      viewInfo: null,
      accessors: { ctxTools: false, ctxGet: false },
      lastError: null,
      startedAt: Date.now()
    };

    // 跑一次体检：告警 + 把结果记进状态存储（GUI 读的就是它）
    const runAudit = (initial = false) => {
      try {
        diag.audits++;
        const report = auditCtx(registryCtx, diag, { probe });
        store.set(report);
        return warnReport(ctx, report, { all: reportUnknown, onFinding, seen, initial });
      } catch (error) {
        // 体检自身出错绝不影响宿主启动
        diag.lastError = String(error?.message ?? error);
        ctx.logger?.warn?.(`${TAG} 体检失败（已忽略，不影响 DSH）：${diag.lastError}`);
        return 0;
      }
    };

    // ── GUI 状态接口：同源 HTTP 路由（客户端 fetch 它，不需要 RPC 协议）──
    //
    // 时序坑（实机踩到）：本插件的 apply 可能**早于** host-webserver 注册服务，
    // 那时 `ctx.webServer` 还是 undefined，直接注册就静默跳过 ——
    // 表现是 GUI 只有灰点、请求路由拿到的是 SPA 首页。
    // 所以改用 ctx.inject(['webServer'], cb)：服务就绪后再挂路由，
    // **且不阻塞核心体检**（webServer 始终缺席也照常体检）。
    let routesRegistered = false;
    const registerRoutes = (wctx) => {
      const server = wctx?.webServer ?? wctx?.get?.("webServer") ?? ctx?.webServer ?? ctx?.get?.("webServer");
      if (!server?.register) return false;
      const handlers = createHttpHandlers({
        store,
        audit: () => auditCtx(registryCtx, diag, { probe }), // 手动体检：现场重新枚举注册表
        diag: () => ({ ...diag, accessors: { ...diag.accessors } })
      });
      const disposers = [
        server.register({ kind: "exact", path: STATUS_PATH, handler: handlers.status }),
        server.register({ kind: "exact", path: AUDIT_PATH, handler: handlers.audit })
      ];
      try { (wctx ?? ctx).effect?.(() => () => disposers.forEach((d) => d?.())); } catch { /* 无 effect 也无妨 */ }
      routesRegistered = true;
      ctx.logger?.info?.(`${TAG} 状态接口已挂载：${STATUS_PATH}（GET）· ${AUDIT_PATH}（POST）`);
      return true;
    };

    try {
      if (typeof ctx.inject === "function") {
        // tools 服务就绪 → 换成能枚举注册表的 ctx，并立刻补做一次体检
        ctx.inject(["tools"], (tctx) => {
          diag.toolsInjectFired = true;
          try {
            registryCtx = tctx;
            runAudit(true);
          } catch (error) {
            diag.lastError = String(error?.message ?? error);
            ctx.logger?.warn?.(`${TAG} 注入 tools 后体检失败（已忽略）：${diag.lastError}`);
          }
        });
        ctx.inject(["webServer"], (wctx) => {
          diag.webServerInjectFired = true;
          try {
            registerRoutes(wctx);
          } catch (error) {
            diag.lastError = String(error?.message ?? error);
            ctx.logger?.warn?.(`${TAG} 注册状态路由失败（已忽略）：${diag.lastError}`);
          }
        });
      } else {
        // 兜底：老 ctx / 测试假 ctx（无 inject）——错误信息与注入路径保持一致
        try {
          registerRoutes(ctx);
        } catch (error) {
          diag.lastError = String(error?.message ?? error);
          ctx.logger?.warn?.(`${TAG} 注册状态路由失败（已忽略）：${diag.lastError}`);
        }
      }
    } catch (error) {
      diag.lastError = String(error?.message ?? error);
      ctx.logger?.warn?.(`${TAG} 注册服务注入失败（已忽略）：${diag.lastError}`);
    }

    if (auditOnLoad) runAudit(true);

    // 插件注册顺序不可控：本插件可能先于其它插件加载，那时注册表还是空的。
    // 所以盯住 tools/change，在注册表变化后重新体检（去重，不刷屏）。
    let sawNonEmptyRegistry = false;
    try {
      ctx.on("tools/change", () => {
        diag.toolsChangeEvents++;
        if (runAudit(false) > 0 || auditCtx(registryCtx, diag, { probe }).checked > 0) sawNonEmptyRegistry = true;
      });
    } catch (error) {
      diag.lastError = String(error?.message ?? error);
      ctx.logger?.warn?.(`${TAG} 订阅 tools/change 失败（已忽略）：${diag.lastError}`);
    }

    // 兜底：tools/change 是 ToolRuntime 在自己的 ctx 上发出的，作用域未必到达本插件。
    // 所以只要还有会话流量，就说明各插件早已注册完 —— 首次见到流量时补做一次体检。
    let fallbackDone = false;

    // 运行期：盯住会话事件类型是否越出内核词汇表
    try {
      ctx.on("session/event", (session, event) => {
        diag.sessionEvents++;
        if (!fallbackDone) {
          fallbackDone = true;
          if (!sawNonEmptyRegistry) runAudit(false);
          // 诊断：这时 DSH 已经跑起来并产生流量了，路由还没挂上就说明真有问题
          // （否则界面只会显示灰点，而日志里什么都没有 —— 实机踩过这个坑）
          if (!routesRegistered) {
            ctx.logger?.warn?.(
              `${TAG} GUI 状态路由未挂载（webServer 服务不可用？）—— 体检本身正常，但界面会显示"尚未体检"`
            );
          }
        }
        try {
          const verdict = checkEventType(event?.type);
          if (verdict.status !== "known") {
            const key = `(session-event)|violation|${String(event?.type)}`;
            if (!seen.has(key)) {
              seen.add(key);
              ctx.logger?.warn?.(
                `${TAG} 会话 ${session?.id ?? "?"} 写入表外事件类型 "${String(event?.type)}" (seq ${event?.seq ?? "?"})：` +
                  `加载器可能拒绝解释整条日志 —— ${verdict.reason}`
              );
              try { onFinding?.({ tool: "(session-event)", status: "violation", reason: verdict.reason, evidence: String(event?.type) }); } catch { /* contained */ }
            }
          }
        } catch { /* 单条事件出错不影响其它 */ }
      });
    } catch (error) {
      ctx.logger?.warn?.(`${TAG} 订阅 session/event 失败（已忽略）：${String(error?.message ?? error)}`);
    }
  }
};

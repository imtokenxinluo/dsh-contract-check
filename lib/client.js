window.__ModuleLoader__.load({
	id: "dsh-contract-check",
	factory: (require) => {
var __contractCheckClient = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/client.js
  var client_exports = {};
  __export(client_exports, {
    default: () => client_default
  });
  var import_react2 = __require("react");

  // ../dsh-tip-jar/lib/embed.js
  var import_react = __require("react");
  function formatUsdc(amountUsdc) {
    return "$" + (Math.round(amountUsdc * 100) / 100).toFixed(2);
  }
  var TipJarApiError = class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  };
  var TipJarApi = class {
    /** @param {() => object|undefined} getNamespace live namespace getter */
    constructor(getNamespace) {
      this.getNamespace = getNamespace;
    }
    async call(method, args) {
      const namespace = this.getNamespace();
      const fn = namespace && namespace[method];
      if (typeof fn !== "function") {
        throw new TipJarApiError("not-mounted", 'tipJar Remote method "' + method + '" is not mounted');
      }
      const rpc = await fn(args);
      if (!rpc.ok) {
        throw new TipJarApiError("rpc-failed", rpc.error && rpc.error.message || "remote call failed");
      }
      const business = rpc.value;
      if (!business.ok) {
        throw new TipJarApiError("rpc-failed", business.error && business.error.message || "remote call failed");
      }
      return business.value;
    }
    async listSponsors() {
      const result = await this.call("listSponsors", {});
      if (result.ok) return result.data;
      throw new TipJarApiError("registry-invalid", result.errors && result.errors.length ? result.errors.join("; ") : "registry load failed");
    }
    tipStats() {
      return this.call("tipStats", {});
    }
    saveTipStats(stats) {
      return this.call("saveTipStats", { stats });
    }
    reportContributor(targetId, category, anonId, note) {
      return this.call("reportContributor", { targetId, category, anonId, note });
    }
    disputed() {
      return this.call("disputed", {});
    }
  };
  function createTipJarApi(ctx) {
    return new TipJarApi(() => {
      const remote = ctx.remote;
      if (!remote || !remote.namespaces) return void 0;
      const ns = remote.namespaces.get("tipJar");
      return ns ? ns.service : void 0;
    });
  }
  function resolveEmbed(sponsors, pluginId, stats) {
    if (!sponsors || !Array.isArray(sponsors.plugins)) return { status: "loading" };
    const plugin = sponsors.plugins.filter(function(p) {
      return p.pluginId === pluginId;
    })[0];
    if (!plugin) return { status: "unregistered" };
    const contributor = (sponsors.contributors || []).filter(function(x) {
      return x.id === plugin.contributorId;
    })[0];
    if (!contributor) return { status: "no-contributor" };
    const stat = stats && stats.byContributorId && stats.byContributorId[contributor.id] ? stats.byContributorId[contributor.id] : null;
    return { status: "ok", plugin, contributor, stat };
  }
  function TipJarEmbed(props) {
    const api = createTipJarApi(props.ctx);
    const pluginId = props.pluginId;
    const [data, setData] = (0, import_react.useState)(null);
    const [tipState, setTipState] = (0, import_react.useState)({ stats: null });
    const [copied, setCopied] = (0, import_react.useState)(false);
    const h = import_react.createElement;
    (0, import_react.useEffect)(function() {
      let alive = true;
      api.listSponsors().then(function(d) {
        if (alive && d) setData(d);
      }).catch(function() {
      });
      api.tipStats().then(function(r) {
        if (alive && r) setTipState({ stats: r.stats });
      }).catch(function() {
      });
      return function() {
        alive = false;
      };
    }, [api, pluginId]);
    const resolved = resolveEmbed(data, pluginId, tipState.stats);
    if (resolved.status === "loading") return h("div", { className: "sps-toolcard" }, "🤝 支持作者（加载中…）");
    if (resolved.status === "unregistered") return h("div", { className: "sps-toolcard sps-tip-line" }, "该插件未在赞助注册表登记（sponsors.json）");
    if (resolved.status === "no-contributor") return h("div", { className: "sps-toolcard sps-tip-line" }, "贡献者未登记");
    const c = resolved.contributor;
    const plugin = resolved.plugin;
    const stat = resolved.stat;
    const eth = c.ethics || {};
    const ethicsBadge = eth.paidWall === true ? h("span", { className: "sps-badge-pw" }, "🔴 付费墙") : eth.voluntary === true ? h("span", { className: "sps-badge-vol" }, "🟢 自愿打赏") : h("span", { className: "sps-badge-un" }, "⚪ 未确认");
    const addr = c.tips && c.tips.usdc;
    const copyBtn = addr ? h("button", {
      className: "sps-btn",
      title: copied ? "已复制 ✓" : "复制地址",
      onClick: function() {
        try {
          if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(addr).catch(function() {
            });
          }
        } catch (e) {
        }
        setCopied(true);
        setTimeout(function() {
          setCopied(false);
        }, 1500);
      }
    }, copied ? "✓ 已复制" : "📋 复制地址") : null;
    const line = h(
      "div",
      { className: "sps-tool-support" },
      h("span", { className: "sps-tip-alias" }, "支持作者 @" + c.alias),
      ethicsBadge,
      copyBtn,
      stat ? h("span", { className: "sps-tip-amount" }, " · " + formatUsdc(stat.amountUsdc) + " / " + stat.count + " 笔") : null
    );
    const qr = addr ? h(
      "div",
      { style: { display: "flex", justifyContent: "center", paddingTop: 6 } },
      h("img", { className: "sps-qr", src: "https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=" + encodeURIComponent(addr), alt: "USDC 收款二维码" })
    ) : null;
    return h(
      "div",
      { className: "sps-toolcard" },
      h("div", { className: "sps-tool-head" }, "🤝 " + (plugin.name || pluginId)),
      line,
      qr
    );
  }

  // src/client.js
  var STATUS_URL = "/contract-check/status";
  var AUDIT_URL = "/contract-check/audit";
  var COLORS = {
    green: "var(--dsw-alias-state-success-primary, #22a06b)",
    yellow: "var(--dsw-alias-state-warning-primary, #d9a300)",
    none: "var(--dsw-alias-label-tertiary, #9aa0a6)"
  };
  var WORD = { green: "🟢", yellow: "🟡", none: "⚪" };
  var CSS = `
.cc-wrap{padding:20px 24px;font-size:13px;color:var(--dsw-alias-label-primary)}
.cc-card{max-width:560px;border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.25));border-radius:12px;padding:20px}
.cc-head{display:flex;align-items:center;gap:14px}
.cc-dot{width:44px;height:44px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 6px rgba(128,128,128,.08)}
.cc-title{font-size:20px;font-weight:700;line-height:1.2}
.cc-sub{font-size:12.5px;color:var(--dsw-alias-label-tertiary);margin-top:3px}
.cc-nums{display:flex;gap:18px;margin:16px 0 4px;flex-wrap:wrap}
.cc-num-v{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.cc-num-k{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.cc-btn{margin-top:16px;padding:8px 18px;border-radius:8px;border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.3));background:transparent;color:inherit;font-size:13px;cursor:pointer}
.cc-btn:hover{background:rgba(128,128,128,.08)}
.cc-btn[disabled]{opacity:.55;cursor:default}
.cc-err{margin-top:12px;color:var(--dsw-alias-state-error-primary,#d94a4a);font-size:12.5px;white-space:pre-wrap}
.cc-list{margin-top:16px;border-top:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.2));padding-top:12px}
.cc-item{padding:7px 0;border-bottom:1px dashed var(--dsw-alias-border-secondary,rgba(128,128,128,.15))}
.cc-item:last-child{border-bottom:none}
.cc-item-tool{font-weight:600}
.cc-item-why{color:var(--dsw-alias-label-secondary);font-size:12.5px;margin-top:2px}
.cc-hbtn{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.3));background:transparent;color:inherit;font-size:12px;cursor:pointer}
.cc-hdot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
`;
  function insertStyles(css) {
    const id = "dsh-contract-check-styles";
    if (typeof document === "undefined" || document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
  function fmtTime(ms) {
    if (typeof ms !== "number" || ms <= 0) return "尚未体检";
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function useStatus() {
    const [state, setState] = (0, import_react2.useState)(null);
    const [busy, setBusy] = (0, import_react2.useState)(false);
    const [error, setError] = (0, import_react2.useState)(null);
    const refresh = (0, import_react2.useCallback)(async () => {
      try {
        const res = await fetch(STATUS_URL, { cache: "no-store" });
        setState(await res.json());
        setError(null);
      } catch (e) {
        setError(String(e && e.message || e));
      }
    }, []);
    const runAudit = (0, import_react2.useCallback)(async () => {
      setBusy(true);
      try {
        const res = await fetch(AUDIT_URL, { method: "POST" });
        const body = await res.json();
        setState(body);
        setError(body && body.ok === false ? String(body.error || "体检失败") : null);
      } catch (e) {
        setError(String(e && e.message || e));
      } finally {
        setBusy(false);
      }
    }, []);
    (0, import_react2.useEffect)(() => {
      refresh();
    }, [refresh]);
    return { state, busy, error, refresh, runAudit };
  }
  function levelOf(state) {
    const lv = state && state.level;
    return lv === "green" || lv === "yellow" ? lv : "none";
  }
  function Num(props) {
    return (0, import_react2.createElement)(
      "div",
      null,
      (0, import_react2.createElement)("div", { className: "cc-num-v" }, String(props.value)),
      (0, import_react2.createElement)("div", { className: "cc-num-k" }, props.label)
    );
  }
  function TipSupport(props) {
    const remote = props.ctx && props.ctx.remote;
    const ns = remote && remote.namespaces && remote.namespaces.get ? remote.namespaces.get("tipJar") : null;
    if (!ns) return null;
    return (0, import_react2.createElement)(TipJarEmbed, { ctx: props.ctx, pluginId: "dsh-contract-check" });
  }
  function StatusPanel(props) {
    const { state, busy, error, runAudit } = useStatus();
    const level = levelOf(state);
    const violations = state && state.violations || 0;
    const findings = state && state.findings || [];
    return (0, import_react2.createElement)(
      "div",
      { className: "cc-wrap" },
      (0, import_react2.createElement)(
        "div",
        { className: "cc-card" },
        (0, import_react2.createElement)(
          "div",
          { className: "cc-head" },
          (0, import_react2.createElement)("div", { className: "cc-dot", style: { background: COLORS[level] } }),
          (0, import_react2.createElement)(
            "div",
            null,
            (0, import_react2.createElement)(
              "div",
              { className: "cc-title" },
              `${WORD[level]} 契约体检：${state && state.label || "尚未体检"}`
            ),
            (0, import_react2.createElement)(
              "div",
              { className: "cc-sub" },
              `${state && state.detail || "还没有跑过契约体检"}` + (state && state.probeNote ? ` · ${state.probeNote}` : "") + ` · 上次体检：${fmtTime(state && state.lastAuditAt)}`
            )
          )
        ),
        (0, import_react2.createElement)(
          "div",
          { className: "cc-nums" },
          (0, import_react2.createElement)(Num, { value: state && state.checked || 0, label: "无耗检查" }),
          (0, import_react2.createElement)(Num, { value: violations, label: "违规" }),
          (0, import_react2.createElement)(Num, { value: state && state.unknown || 0, label: "不可判定" })
        ),
        (0, import_react2.createElement)("button", {
          className: "cc-btn",
          disabled: busy,
          onClick: runAudit
        }, busy ? "体检中…" : "重新体检"),
        error ? (0, import_react2.createElement)("div", { className: "cc-err" }, error) : null,
        findings.length > 0 ? (0, import_react2.createElement)(
          "div",
          { className: "cc-list" },
          findings.map((f, i) => (0, import_react2.createElement)(
            "div",
            { className: "cc-item", key: `${f.tool}-${i}` },
            (0, import_react2.createElement)("div", { className: "cc-item-tool" }, `${f.status === "violation" ? "⚠️ " : ""}${f.tool}`),
            (0, import_react2.createElement)("div", { className: "cc-item-why" }, f.reason)
          ))
        ) : null,
        (0, import_react2.createElement)(
          "div",
          { className: "cc-sub", style: { marginTop: "14px" } },
          "只检查契约合规，不检测恶意、不拦截执行。"
        ),
        (0, import_react2.createElement)(
          "div",
          { style: { marginTop: "14px" } },
          (0, import_react2.createElement)(TipSupport, { ctx: props.ctx })
        )
      )
    );
  }
  function HeaderBadge() {
    const { state, busy, runAudit } = useStatus();
    const level = levelOf(state);
    const title = state && state.detail ? state.detail : "尚未体检";
    return (0, import_react2.createElement)(
      "button",
      {
        className: "cc-hbtn",
        title,
        disabled: busy,
        onClick: runAudit
      },
      (0, import_react2.createElement)("span", { className: "cc-hdot", style: { background: COLORS[level] } }),
      (0, import_react2.createElement)("span", null, busy ? "体检中…" : "体检")
    );
  }
  var client_default = {
    inject: ["slots"],
    apply(ctx) {
      const slots = ctx.slots;
      if (!slots) return;
      ctx.effect(() => insertStyles(CSS));
      slots.inject("conversation.view", function() {
        return slots.register(
          { name: "conversation.view", id: "contract-check", order: 30, label: "体检" },
          function() {
            return (0, import_react2.createElement)(StatusPanel, { ctx });
          }
        );
      });
      slots.inject("conversation.session.header.utilities", function() {
        return slots.register(
          { name: "conversation.session.header.utilities", id: "contract-check-header", order: 35 },
          function() {
            return (0, import_react2.createElement)(HeaderBadge);
          }
        );
      });
    }
  };
  return __toCommonJS(client_exports);
})();

		return __contractCheckClient.default || __contractCheckClient;
	}
});

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
  var CSS = `
.cc-hbtn{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:7px;
  border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.3));background:transparent;
  color:inherit;font:inherit;font-size:12px;line-height:1.7;cursor:pointer;
  transition:background-color .15s ease,border-color .15s ease,transform .06s ease,opacity .15s ease;
  -webkit-user-select:none;user-select:none}
.cc-hbtn:hover{background:rgba(128,128,128,.10);border-color:rgba(128,128,128,.45)}
.cc-hbtn:active{background:rgba(128,128,128,.18);transform:scale(.96)}
.cc-hbtn:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary,#22a06b);outline-offset:2px}
.cc-hbtn[disabled]{opacity:.7;cursor:default;transform:none}

/* 定宽文字槽：「体检」和「体检中…」占同样宽度 —— 否则按钮忽宽忽窄，看着就是抖 */
.cc-hlabel{min-width:46px;text-align:center;display:inline-block}

.cc-hdot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 2px rgba(128,128,128,.12)}

/* 体检中：圆点变成转圈（实心圆自己转看不出来，所以换成圆环+高亮缺口） */
@keyframes cc-spin{to{transform:rotate(360deg)}}
.cc-spin{background:transparent !important;box-sizing:border-box;box-shadow:none;
  border:2px solid rgba(128,128,128,.28);
  border-top-color:var(--dsw-alias-state-success-primary,#22a06b);
  animation:cc-spin .5s linear infinite}

/* 设置页那一栏 */
.cc-settings{padding:4px 0}
.cc-set-title{font-size:14px;font-weight:600}
.cc-set-sub{font-size:12.5px;color:var(--dsw-alias-label-tertiary);margin-top:4px;margin-bottom:10px}
`;
  var MIN_BUSY_MS = 500;
  function insertStyles(css) {
    const id = "dsh-contract-check-styles";
    if (typeof document === "undefined" || document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
  function useStatus() {
    const [state, setState] = (0, import_react2.useState)(null);
    const [busy, setBusy] = (0, import_react2.useState)(false);
    const refresh = (0, import_react2.useCallback)(async () => {
      try {
        const res = await fetch(STATUS_URL, { cache: "no-store" });
        setState(await res.json());
      } catch {
      }
    }, []);
    const runAudit = (0, import_react2.useCallback)(async () => {
      setBusy(true);
      const started = Date.now();
      try {
        const res = await fetch(AUDIT_URL, { method: "POST" });
        setState(await res.json());
      } catch {
      } finally {
        const elapsed = Date.now() - started;
        if (elapsed < MIN_BUSY_MS) await new Promise((r) => setTimeout(r, MIN_BUSY_MS - elapsed));
        setBusy(false);
      }
    }, []);
    (0, import_react2.useEffect)(() => {
      refresh();
    }, [refresh]);
    return { state, busy, runAudit };
  }
  function levelOf(state) {
    const lv = state && state.level;
    return lv === "green" || lv === "yellow" ? lv : "none";
  }
  function HeaderBadge() {
    const { state, busy, runAudit } = useStatus();
    const level = levelOf(state);
    return (0, import_react2.createElement)(
      "button",
      {
        type: "button",
        className: "cc-hbtn",
        disabled: busy,
        onClick: runAudit,
        title: state && state.detail || "无耗检查：尚未体检"
      },
      (0, import_react2.createElement)("span", {
        className: busy ? "cc-hdot cc-spin" : "cc-hdot",
        // 忙碌时不设内联底色：否则会盖掉 .cc-spin 的透明底（内联样式优先级更高）
        style: busy ? void 0 : { background: COLORS[level] }
      }),
      (0, import_react2.createElement)("span", { className: "cc-hlabel" }, busy ? "体检中…" : "体检")
    );
  }
  function TipSupport(props) {
    let ns = null;
    try {
      const remote = props.ctx && props.ctx.remote;
      ns = remote && remote.namespaces && typeof remote.namespaces.get === "function" ? remote.namespaces.get("tipJar") : null;
    } catch {
      ns = null;
    }
    if (!ns) return null;
    return (0, import_react2.createElement)(TipJarEmbed, { ctx: props.ctx, pluginId: "dsh-contract-check" });
  }
  function SettingsSection(props) {
    return (0, import_react2.createElement)(
      "div",
      { className: "cc-settings" },
      (0, import_react2.createElement)("div", { className: "cc-set-title" }, "无耗检查"),
      (0, import_react2.createElement)(
        "div",
        { className: "cc-set-sub" },
        "契约检查插件：不花 token、不拦执行、只告警。状态见会话头部那个圆点。"
      ),
      (0, import_react2.createElement)(TipSupport, { ctx: props.ctx })
    );
  }
  var client_default = {
    inject: ["remote", "slots"],
    apply(ctx) {
      const slots = ctx.slots;
      if (!slots) return;
      ctx.effect(() => insertStyles(CSS));
      slots.inject("conversation.session.header.utilities", function() {
        return slots.register(
          { name: "conversation.session.header.utilities", id: "contract-check-header", order: 35 },
          function() {
            return (0, import_react2.createElement)(HeaderBadge);
          }
        );
      });
      slots.inject("settings.section", function() {
        return slots.register(
          { name: "settings.section", id: "contract-check-settings", order: 40, label: "无耗检查" },
          function() {
            return (0, import_react2.createElement)(SettingsSection, { ctx });
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

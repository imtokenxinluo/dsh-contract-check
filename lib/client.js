// built-from-src-sha256: cd269a2ec111915eaedaf8a08bb049881ffc153ce26bf4c15ce341b76de529cf
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
  function formatTipStats(entry) {
    if (!entry || typeof entry !== "object") return "";
    const amount = Number(entry.amountUsdc) || 0;
    const count = Number(entry.count) || 0;
    const supporters = Number(entry.supporters) || 0;
    const parts = [formatUsdc(amount)];
    if (count > 0) parts.push(count + " 笔");
    if (supporters > 0) parts.push(supporters + " 位支持者");
    return parts.join(" · ");
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
    /** 宿主本地生成二维码（data URL），避免请求第三方 CDN。 */
    qrPng(text) {
      return this.call("qrPng", { text });
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
  function resolveChannels(contributor) {
    const c = contributor || {};
    const tips = c.tips || {};
    const usdc = typeof tips.usdc === "string" && tips.usdc.length > 0 ? tips.usdc : "";
    const fiat = Array.isArray(tips.fiat) ? tips.fiat.filter(function(f) {
      return f && typeof f.url === "string" && f.url.length > 0 && typeof f.label === "string";
    }) : [];
    const qrCodes = Array.isArray(tips.qrCodes) ? tips.qrCodes.filter(function(q) {
      return q && typeof q.image === "string" && q.image.length > 0 && typeof q.label === "string";
    }) : [];
    const subscriptions = [];
    const seenSub = /* @__PURE__ */ new Set();
    for (const list of [tips.subscriptions, c.subscriptions]) {
      if (!Array.isArray(list)) continue;
      for (const s of list) {
        if (!s || typeof s.url !== "string" || s.url.length === 0 || typeof s.label !== "string") continue;
        if (seenSub.has(s.url)) continue;
        seenSub.add(s.url);
        subscriptions.push(s);
      }
    }
    return {
      usdc,
      fiat,
      qrCodes,
      subscriptions,
      hasAny: Boolean(usdc || fiat.length || qrCodes.length || subscriptions.length)
    };
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
  var EMBED_STYLE_ID = "dsh-tip-jar-embed-css";
  var EMBED_CSS = [
    ".sps-toolcard{border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.35));border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));padding:10px 12px;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-primary,inherit)}",
    ".sps-tool-head{font-weight:600;margin-bottom:6px}",
    ".sps-tool-support{font-size:12px;color:var(--dsw-alias-label-secondary,inherit);border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.3));padding-top:6px}",
    ".sps-tool-support b{color:var(--dsw-alias-state-warn-primary,#d08700)}",
    ".sps-tip-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}",
    ".sps-tip-alias{font-weight:600;color:var(--dsw-alias-label-primary,inherit)}",
    ".sps-tip-amount{color:var(--dsw-alias-state-success-primary,#22a06b);font-weight:600;font-variant-numeric:tabular-nums}",
    ".sps-badge-vol{font-size:10px;color:var(--dsw-alias-state-success-primary,#22a06b);border:1px solid var(--dsw-alias-state-success-primary,#22a06b);border-radius:10px;padding:0 6px}",
    ".sps-badge-pw{font-size:10px;color:var(--dsw-alias-state-error-primary,#c94a4a);border:1px solid var(--dsw-alias-state-error-primary,#c94a4a);border-radius:10px;padding:0 6px}",
    ".sps-badge-un{font-size:10px;color:var(--dsw-alias-label-secondary,inherit);border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.35));border-radius:10px;padding:0 6px}",
    ".sps-btn{background:none;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.35));border-radius:5px;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;font-size:11px;padding:2px 8px;display:inline-flex;align-items:center;justify-content:center}",
    ".sps-btn:hover{color:var(--dsw-alias-label-primary,inherit);border-color:var(--dsw-alias-brand-primary,#4d6bfe)}",
    ".sps-qr{width:120px;height:120px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.35));border-radius:6px;object-fit:contain}",
    ".sps-qr-row{display:flex;align-items:center;gap:10px}",
    ".sps-links{display:flex;flex-wrap:wrap;gap:5px;align-items:center}",
    ".sps-links-block{margin-top:8px;padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l1,rgba(128,128,128,.35));display:flex;flex-direction:column;gap:4px}.sps-link{font-size:11px;color:var(--dsw-alias-brand-primary,#4d6bfe);text-decoration:none}",
    ".sps-link:hover{text-decoration:underline}",
    ".sps-label{font-size:10px;color:var(--dsw-alias-label-secondary,inherit);text-transform:uppercase;letter-spacing:.04em}",
    ".sps-pay-meta{display:flex;flex-direction:column;gap:2px}",
    ".sps-pay-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}",
    ".sps-qrcode-note{font-size:9px;color:var(--dsw-alias-label-secondary,inherit);line-height:1.3;margin-top:1px}"
  ].join("");
  function ensureEmbedStyles(doc) {
    const d = doc ?? (typeof document === "undefined" ? null : document);
    if (!d || !d.head || typeof d.createElement !== "function") return false;
    if (typeof d.getElementById === "function" && d.getElementById(EMBED_STYLE_ID)) return false;
    const el = d.createElement("style");
    el.id = EMBED_STYLE_ID;
    el.textContent = EMBED_CSS;
    d.head.appendChild(el);
    return true;
  }
  function TipJarEmbed(props) {
    const api = createTipJarApi(props.ctx);
    const pluginId = props.pluginId;
    const [data, setData] = (0, import_react.useState)(null);
    const [tipState, setTipState] = (0, import_react.useState)({ stats: null });
    const [copied, setCopied] = (0, import_react.useState)(false);
    const [qrUrl, setQrUrl] = (0, import_react.useState)(null);
    const h = import_react.createElement;
    (0, import_react.useEffect)(function() {
      ensureEmbedStyles();
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
    (0, import_react.useEffect)(function() {
      let alive = true;
      const r = resolveEmbed(data, pluginId, null);
      const addr2 = r.status === "ok" && r.contributor && r.contributor.tips && typeof r.contributor.tips.usdc === "string" ? r.contributor.tips.usdc : "";
      if (!addr2) {
        setQrUrl(null);
        return function() {
          alive = false;
        };
      }
      api.qrPng(addr2).then(function(v) {
        if (alive && v && typeof v.dataUrl === "string") setQrUrl(v.dataUrl);
      }).catch(function() {
        if (alive) setQrUrl(null);
      });
      return function() {
        alive = false;
      };
    }, [api, data, pluginId]);
    const resolved = resolveEmbed(data, pluginId, tipState.stats);
    if (resolved.status === "loading") return h("div", { className: "sps-toolcard" }, "🤝 支持作者（加载中…）");
    if (resolved.status === "unregistered") return h("div", { className: "sps-toolcard sps-tip-line" }, "该插件未在赞助注册表登记（sponsors.json）");
    if (resolved.status === "no-contributor") return h("div", { className: "sps-toolcard sps-tip-line" }, "贡献者未登记");
    const c = resolved.contributor;
    const plugin = resolved.plugin;
    const stat = resolved.stat;
    const eth = c.ethics || {};
    const ethicsBadge = eth.paidWall === true ? h("span", { className: "sps-badge-pw" }, "🔴 付费墙") : eth.voluntary === true ? h("span", { className: "sps-badge-vol" }, "🟢 自愿打赏") : h("span", { className: "sps-badge-un" }, "⚪ 未确认");
    const channels = resolveChannels(c);
    const addr = channels.usdc;
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
      stat ? h("span", { className: "sps-tip-amount" }, " · " + formatTipStats(stat)) : null
    );
    const qr = addr && qrUrl ? h(
      "div",
      { style: { display: "flex", justifyContent: "center", paddingTop: 6 } },
      h("img", { className: "sps-qr", src: qrUrl, alt: "USDC 收款二维码" })
    ) : null;
    const fiat = channels.fiat.length ? h(
      "div",
      { className: "sps-links" },
      h("span", { className: "sps-label" }, "法币"),
      channels.fiat.map(function(f) {
        return h("a", { key: f.url, className: "sps-link", href: f.url, target: "_blank", rel: "noreferrer" }, f.label);
      })
    ) : null;
    const subs = channels.subscriptions.length ? h(
      "div",
      { className: "sps-links" },
      h("span", { className: "sps-label" }, "订阅"),
      channels.subscriptions.map(function(s) {
        return h("a", { key: s.url, className: "sps-link", href: s.url, target: "_blank", rel: "noreferrer" }, s.label);
      })
    ) : null;
    const payQr = channels.qrCodes.map(function(q) {
      return h(
        "div",
        { key: q.label, className: "sps-qr-row", title: q.label + " 收款码（平台直付）" },
        h("img", { className: "sps-qr", src: q.image, alt: q.label + " 收款码" }),
        h(
          "div",
          { className: "sps-pay-meta" },
          h("div", { className: "sps-pay-name" }, q.label),
          h("div", { className: "sps-qrcode-note" }, "扫码直付")
        )
      );
    });
    const none = channels.hasAny ? null : h("div", { className: "sps-tip-line" }, "该贡献者尚未登记任何打赏方式");
    return h(
      "div",
      { className: "sps-toolcard" },
      h("div", { className: "sps-tool-head" }, "🤝 " + (plugin.name || pluginId)),
      line,
      qr,
      payQr.length ? h("div", null, payQr) : null,
      fiat || subs ? h("div", { className: "sps-links-block" }, fiat, subs) : null,
      none
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

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
  var import_react = __require("react");
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
    const [state, setState] = (0, import_react.useState)(null);
    const [busy, setBusy] = (0, import_react.useState)(false);
    const refresh = (0, import_react.useCallback)(async () => {
      try {
        const res = await fetch(STATUS_URL, { cache: "no-store" });
        setState(await res.json());
      } catch {
      }
    }, []);
    const runAudit = (0, import_react.useCallback)(async () => {
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
    (0, import_react.useEffect)(() => {
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
    return (0, import_react.createElement)(
      "button",
      {
        type: "button",
        className: "cc-hbtn",
        disabled: busy,
        onClick: runAudit,
        title: state && state.detail || "无耗检查：尚未体检"
      },
      (0, import_react.createElement)("span", {
        className: busy ? "cc-hdot cc-spin" : "cc-hdot",
        // 忙碌时不设内联底色：否则会盖掉 .cc-spin 的透明底（内联样式优先级更高）
        style: busy ? void 0 : { background: COLORS[level] }
      }),
      (0, import_react.createElement)("span", { className: "cc-hlabel" }, busy ? "体检中…" : "体检")
    );
  }
  var client_default = {
    inject: ["slots"],
    apply(ctx) {
      const slots = ctx.slots;
      if (!slots) return;
      ctx.effect(() => insertStyles(CSS));
      slots.inject("conversation.session.header.utilities", function() {
        return slots.register(
          { name: "conversation.session.header.utilities", id: "contract-check-header", order: 35 },
          function() {
            return (0, import_react.createElement)(HeaderBadge);
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

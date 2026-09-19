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
.cc-hbtn[disabled]{opacity:.6;cursor:default;transform:none}
.cc-hdot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 2px rgba(128,128,128,.12)}
`;
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
      try {
        const res = await fetch(AUDIT_URL, { method: "POST" });
        const body = await res.json();
        setState(body);
      } catch {
      } finally {
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
      (0, import_react.createElement)("span", { className: "cc-hdot", style: { background: COLORS[level] } }),
      (0, import_react.createElement)("span", null, busy ? "体检中…" : "体检")
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

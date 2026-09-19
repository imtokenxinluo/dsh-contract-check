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
  var COLORS = {
    green: "var(--dsw-alias-state-success-primary, #22a06b)",
    yellow: "var(--dsw-alias-state-warning-primary, #d9a300)",
    none: "var(--dsw-alias-label-tertiary, #9aa0a6)"
  };
  var CSS = `
.cc-dot{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle;box-shadow:0 0 0 3px rgba(128,128,128,.10)}
.cc-dot:hover{box-shadow:0 0 0 3px rgba(128,128,128,.24)}
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
    const refresh = (0, import_react.useCallback)(async () => {
      try {
        const res = await fetch(STATUS_URL, { cache: "no-store" });
        setState(await res.json());
      } catch {
      }
    }, []);
    (0, import_react.useEffect)(() => {
      refresh();
    }, [refresh]);
    return state;
  }
  function levelOf(state) {
    const lv = state && state.level;
    return lv === "green" || lv === "yellow" ? lv : "none";
  }
  function StatusDot() {
    const state = useStatus();
    const level = levelOf(state);
    return (0, import_react.createElement)("span", {
      className: "cc-dot",
      style: { background: COLORS[level] },
      title: state && state.detail || "无耗检查：尚未体检"
    });
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
            return (0, import_react.createElement)(StatusDot);
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

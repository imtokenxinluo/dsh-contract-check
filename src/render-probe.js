// 实测 render 契约：真调一次 render，看返回值形态。
//
// ── 为什么必须实测（实机结论）────────────────────────────────────────
// `defineTool` 会把用户的 render 包一层：
//     output: { render(args, value) { return userRender(args, value); } }
// 静态拿到的是这个**包装函数**，函数体是"调用"，因此永远判不准 ——
// 实机上出现 21/21 全部 unknown，等于没检查。
//
// 所以：静态判不出时**真调一次**。为了让它真的能跑完，按 `output.schema`
// 造一份符合形状的假数据喂进去（render 通常要读 value 的字段）。
//
// ── 风险与边界 ───────────────────────────────────────────────────
// * 契约上 render 应当是**纯投影**（只读 value、返回内容块）。实测据此设计：
//   只读返回值，不写任何东西。
// * 若 render 有副作用或抛异常 → 归 unknown（**绝不因为调用失败就报 violation**）。
// * 自引用/病态 schema 有深度上限，不会卡死。

const MAX_DEPTH = 4;

/**
 * 按 JSON Schema 造一份最小的、形状合法的假数据。
 * 目的只是"让 render 能跑下去"，不追求语义合理。
 */
export function fakeValueFromSchema(schema, depth = 0) {
  if (depth > MAX_DEPTH || !schema || typeof schema !== "object") return null;

  // oneOf/anyOf/allOf：取第一个能造的分支
  for (const key of ["oneOf", "anyOf", "allOf"]) {
    if (Array.isArray(schema[key]) && schema[key].length > 0) {
      return fakeValueFromSchema(schema[key][0], depth + 1);
    }
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Object.prototype.hasOwnProperty.call(schema, "const")) return schema.const;

  switch (schema.type) {
    case "string":
      return "x";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    case "array":
      return [fakeValueFromSchema(schema.items ?? {}, depth + 1)];
    case "object":
    default: {
      const out = {};
      const props = schema.properties;
      if (props && typeof props === "object") {
        let n = 0;
        for (const [key, sub] of Object.entries(props)) {
          if (n++ >= 20) break; // 防病态 schema 造出巨型对象
          out[key] = fakeValueFromSchema(sub, depth + 1);
        }
      }
      return out;
    }
  }
}

/** 判定值是否是合法的 ContentBlock[]（数组即认为形态正确）。 */
function classifyValue(value) {
  if (Array.isArray(value)) return { ok: true };
  if (typeof value === "string") return { ok: false, what: "字符串" };
  if (value === undefined) return { ok: false, what: "undefined" };
  if (value === null) return { ok: false, what: "null" };
  if (typeof value === "object") return { ok: false, what: "对象（不是数组）" };
  return { ok: false, what: typeof value };
}

/**
 * 实测一个工具定义的 render。
 * @param {object} definition - 工具定义（含 output.render 与 output.schema）
 * @returns {{status:"ok"|"violation"|"unknown", reason:string, evidence?:string}}
 */
export function probeRender(definition) {
  const render = definition?.output?.render;
  if (typeof render !== "function") {
    return { status: "unknown", reason: "output.render 不是函数，无法实测" };
  }

  const value = fakeValueFromSchema(definition?.output?.schema ?? {});
  const args = fakeValueFromSchema(definition?.parameters ?? {});

  let returned;
  try {
    returned = render(args, value);
  } catch (error) {
    // 调用失败 = 判不准，绝不当作违规（否则假数据不合形状就会误报）
    return { status: "unknown", reason: `render 抛异常（假数据可能不合形状）：${String(error?.message ?? error)}` };
  }

  // async render：契约上是同步返回，这里也不等 promise（只按同步结果判定）
  const verdict = classifyValue(returned);
  if (verdict.ok) return { status: "ok", reason: "实测返回数组" };

  let evidence;
  try {
    evidence = typeof returned === "string" ? returned.slice(0, 120) : JSON.stringify(returned)?.slice(0, 120);
  } catch {
    evidence = String(returned).slice(0, 120);
  }

  return {
    status: "violation",
    reason: `实测返回${verdict.what}，违反 render(): ContentBlock[] 契约`,
    evidence
  };
}

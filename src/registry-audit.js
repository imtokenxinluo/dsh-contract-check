// 枚举式审计：对注册表里的每个工具定义做机械可判的契约检查。
//
// 输入是 `ctx.tools.view(scope).visible` 那样的「名字 → 定义」集合（Map 或数组）。
// 定义里保留着 `output.render` 函数本体，所以能直接对它的源码做静态判定。
//
// 原则：宁 unknown，不 violation；单个工具出错不得中断整体审计。

import { classifyRenderSource } from "./render-contract.js";

/** 归一化输入为 [name, definition] 列表；坏输入返回空表。 */
function normalize(visible) {
  try {
    if (visible instanceof Map) return [...visible.entries()];
    if (Array.isArray(visible)) return visible.map((d) => [d?.name, d]);
    if (visible && typeof visible === "object") return [...Object.entries(visible)];
  } catch {
    /* 落到空表 */
  }
  return [];
}

function emptyReport() {
  return { checked: 0, ok: 0, violations: 0, unknown: 0, incomplete: 0, error: 0, probed: 0, findings: [] };
}

/**
 * 审计一组工具定义。
 * @param {Map<string, object> | object[] | Record<string, object>} visible
 * @param {{probe?: (definition: object) => {status:string,reason:string,evidence?:string}}} [options]
 *   probe —— 可选实测器：静态判不准时兜底。
 *   `defineTool` 会把用户的 render 包一层，静态永远看不透（实机 21/21 unknown），
 *   所以实测不是可选项而是必需品。不传则保持"判不准"。
 * @returns {{checked:number, ok:number, violations:number, unknown:number,
 *   incomplete:number, error:number, probed:number,
 *   findings: Array<{tool:string, status:string, reason:string, evidence?:string}>}}
 */
export function auditRegistry(visible, { probe } = {}) {
  const report = emptyReport();
  const entries = normalize(visible);

  for (const [key, def] of entries) {
    report.checked++;
    const tool = typeof def?.name === "string" && def.name.length > 0 ? def.name : String(key ?? "(unnamed)");

    // 1) 定义完整性：render 必须是函数
    let render;
    try {
      render = def?.output?.render;
    } catch (error) {
      report.error++;
      report.findings.push({ tool, status: "error", reason: `读取 output.render 时抛异常：${String(error?.message ?? error)}` });
      continue;
    }

    if (typeof render !== "function") {
      report.incomplete++;
      report.findings.push({
        tool,
        status: "incomplete",
        reason: "缺少 output.render（或它不是函数）：工具无法产出结果内容"
      });
      continue;
    }

    // 2) 先做静态判定（零副作用）
    let source;
    try {
      source = render.toString();
    } catch (error) {
      report.error++;
      report.findings.push({ tool, status: "error", reason: `读取 render 源码时抛异常：${String(error?.message ?? error)}` });
      continue;
    }

    let verdict = classifyRenderSource(source);

    // 3) 静态判不准 → 实测兜底（defineTool 的包装函数永远是这一档）
    if (verdict.status === "unknown" && typeof probe === "function") {
      try {
        const probed = probe(def);
        if (probed && probed.status !== "unknown") {
          report.probed++;
          verdict = { status: probed.status, reason: `${probed.reason}（实测）`, evidence: probed.evidence };
        } else if (probed?.reason) {
          verdict = { ...verdict, reason: `${verdict.reason}；实测也判不准：${probed.reason}` };
        }
      } catch (error) {
        verdict = { ...verdict, reason: `${verdict.reason}；实测抛异常：${String(error?.message ?? error)}` };
      }
    }

    if (verdict.status === "violation") {
      report.violations++;
      report.findings.push({ tool, status: "violation", reason: verdict.reason, evidence: verdict.evidence });
    } else if (verdict.status === "unknown") {
      report.unknown++;
      report.findings.push({ tool, status: "unknown", reason: verdict.reason, evidence: verdict.evidence });
    } else {
      report.ok++;
    }
  }

  return report;
}

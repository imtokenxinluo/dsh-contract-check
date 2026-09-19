// 状态判定与存储：把「最近一次体检结果」变成 GUI 能显示的状态。
//
// 语义刻意保持**可解释**——不用颜色表达模糊含义：
//   green  —— 体检过，0 违规
//   yellow —— 体检过，有违规
//   none   —— 尚未体检（诚实显示"不知道"，绝不假装健康）
//
// 为什么 `unknown` 不影响颜色：它是"静态分析判不准"，不是"有问题"。
// 把它算成风险会让用户天天看到黄色，然后就再也不看这个颜色了。

const NONE = Object.freeze({
  level: "none",
  label: "尚未体检",
  detail: "还没有跑过契约体检",
  checked: 0,
  violations: 0,
  unknown: 0,
  incomplete: 0,
  readErrors: 0,
  findings: [],
  lastAuditAt: null
});

/** 从审计报告算状态。非法输入一律当"未体检"，绝不抛异常。 */
export function computeStatus(report, lastAuditAt = null) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return { ...NONE };
  if (typeof report.checked !== "number") return { ...NONE };

  // 假绿防护（实机踩到）：checked <= 0 意味着"什么都没检查"——
  // 可能是服务没就绪、也可能注册表本来就空。绝不能说成"健康"：
  // 界面显示绿的、实际什么都没验，比不显示更糟。
  if (report.checked <= 0) {
    return {
      ...NONE,
      detail: report.enumerable === false
        ? "无法枚举工具注册表（ctx.tools 不可用）"
        : "还没有检查到任何工具"
    };
  }

  const violations = num(report.violations);
  const unknown = num(report.unknown);
  const incomplete = num(report.incomplete);
  const readErrors = num(report.error);   // 注意：对外叫 readErrors，避免与响应里的 error（错误消息）撞名
  const findings = Array.isArray(report.findings)
    ? report.findings.map((f) => ({
        tool: String(f?.tool ?? "?"),
        status: String(f?.status ?? "unknown"),
        reason: String(f?.reason ?? "")
      }))
    : [];

  const level = violations > 0 ? "yellow" : "green";
  const label = level === "green" ? "健康" : "有风险";

  // 显示文案（用户定稿 2026-09-19）：`无耗 · 检查 N 个插件 · 违规 V · 不可判定 U`
  // 「无耗」放最前是重点——这个插件不花 token，是它的立身之本。
  // 违规/不可判定为 0 时也照常显示：数字消失会被误读成"这一项没查"。
  const parts = [
    `无耗 · 检查 ${report.checked} 个插件`,
    `违规 ${violations}`,
    `不可判定 ${unknown}`
  ];
  if (incomplete > 0) parts.push(`不完整 ${incomplete}`);
  if (readErrors > 0) parts.push(`读取失败 ${readErrors}`);
  const probed = num(report.probed);
  const probeNote = probed > 0 ? `其中实测判定 ${probed}` : "";

  // 全不可判定 = 实际什么都没验出来（实机：defineTool 的包装让静态 21/21 unknown）。
  // 这时显示绿色是**误导** —— 我们并没有确认任何东西。诚实地说"没验证出来"。
  if (violations === 0 && report.checked > 0 && unknown === report.checked) {
    return {
      ...NONE,
      detail: `${parts.join(" · ")} —— 全部判不准，等于没有验证`,
      checked: report.checked,
      unknown,
      probeNote,
      findings,
      lastAuditAt: typeof lastAuditAt === "number" ? lastAuditAt : null
    };
  }

  return {
    level,
    label,
    detail: parts.join(" · "),
    checked: report.checked,
    violations,
    unknown,
    incomplete,
    readErrors,
    probed,
    probeNote,
    findings,
    lastAuditAt: typeof lastAuditAt === "number" ? lastAuditAt : null
  };
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * 内存状态存储 + 体检互斥。
 * 互斥的意义：手动体检要枚举整个工具注册表，连点会把 CPU 堆起来。
 */
export function createStatusStore() {
  let last = null;      // { status, at }
  let running = false;

  return {
    /** 记录一次成功的体检结果。 */
    set(report, at = Date.now()) {
      last = { status: computeStatus(report, at), at };
      return last.status;
    },
    /** 最近一次状态（没跑过就是 none）。 */
    get() {
      return last ? { ...last.status } : { ...NONE };
    },
    /** 是否正在体检。 */
    isRunning() {
      return running;
    },
    /** 尝试占用互斥；已占用返回 false。 */
    begin() {
      if (running) return false;
      running = true;
      return true;
    },
    /** 释放互斥（成功/失败都必须调用）。 */
    end() {
      running = false;
    }
  };
}

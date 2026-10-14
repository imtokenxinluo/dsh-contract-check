// ⚠️ VENDORED 文件：逻辑本体来自 dsh-publish-guard（eef12dc）。
// 不要直接改这份——改 D:\tool\claude_code\dsh-publish-guard\lib\leak-check.mjs 后重拷。
// 漂移由 test/vendored-leak-check.test.js 检查（本机存在兄弟仓库时对比一致）。
// 本文件零依赖（仅 node 内置模块），因此 CI 不用 npm install 也能跑。
// dsh-leak-check（A）：发布前泄漏检查。
//
// 纪律（与 dsh-contract-check 一脉相承）：
//   · 只读：不执行被检查包的任何脚本（npm pack 会跑 prepack/prepare，绝不调用）
//   · 分级：violation = 会把源码/密钥送出去的硬伤；review = 疑似，人工看；note = 提醒
//   · 铁律：「宁 review，不 violation」——密钥类一律 review，绝不公开指控
//
// 为什么这些检查有价值（2026-09 实证）：
//   · source map = 免费送人整份源码结构（REA 的 JS 分析明确依赖它）
//   · 密钥进客户端 = 发布即泄露，任何混淆都救不回来
//   · test/.env/.pem 混进 files = 打包事故，装包的人全看得到

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

// ---------------------------------------------------------------- 规则表

const SECRET_PATTERNS = [
  { name: "github-token", re: /ghp_[A-Za-z0-9]{20,}/g },
  { name: "github-oauth", re: /gho_[A-Za-z0-9]{20,}/g },
  { name: "github-pat", re: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: "openai-key", re: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/g },
  { name: "npm-token", re: /npm_[A-Za-z0-9]{20,}/g },
  { name: "private-key-pem", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "eth-private-key", re: /0x[0-9a-fA-F]{64}/g },
  { name: "telegram-bot-token", re: /\d{8,10}:[A-Za-z0-9_-]{30,}/g }
]

const DANGEROUS_FILE = [
  { name: "test-dir", re: /(^|\/)(test|tests|__tests__)(\/|$)/i },
  { name: "test-file", re: /\.(spec|test)\.(js|mjs|cjs|ts|tsx)$/i },
  { name: "dotenv", re: /(^|\/)\.env($|\.)/i },
  { name: "npmrc", re: /\.npmrc$/i },
  { name: "key-material", re: /\.(pem|key|pfx|p12|jks|keystore)$/i },
  { name: "source-map", re: /\.map$/i },
  { name: "secrets-file", re: /(^|\/)(secrets?|credentials?|passwords?)(\.(json|txt|env|js|mjs|yaml|yml)|$)/i }
]

const PROVENANCE = /built-from-src-sha256/i

// ---------------------------------------------------------------- 工具

function shannon(s) {
  const freq = new Map()
  for (const c of s) freq.set(c, (freq.get(c) || 0) + 1)
  let h = 0
  for (const v of freq.values()) { const p = v / s.length; h -= p * Math.log2(p) }
  return h
}

function dedupe(arr) {
  const seen = new Set()
  return arr.filter((x) => { const k = x.level + "|" + x.rule + "|" + x.evidence; if (seen.has(k)) return false; seen.add(k); return true })
}

// ---------------------------------------------------------------- 产物扫描

/**
 * 扫描一个构建产物（JS bundle）。
 * @returns {{violations: number, reviews: number, notes: number, findings: Array}}
 */
export function scanBundle(text, file = "(bundle)") {
  const findings = []

  // 1) source map —— violation：等于发布整份源码结构
  const sm = text.match(/\/\/[#@]\s*sourceMappingURL=\S*/)
  if (sm) findings.push({ level: "violation", rule: "sourcemap", file, evidence: sm[0].slice(0, 80) })

  // 2) 密钥家族 —— review（绝不判 violation）
  for (const p of SECRET_PATTERNS) {
    const m = text.match(p.re)
    if (m) findings.push({ level: "review", rule: "secret-" + p.name, file, evidence: "疑似 " + p.name + "：" + m[0].slice(0, 24) + "…" })
  }

  // 3) 高熵长串 —— review（上限 5 条，避免刷屏）
  // 特例：dsh-obfuscate 的产物（stamp 里带 obfuscated:）本来就充满 base64/rc4 编码串，
  // 高熵是预期现象，跳过熵扫描，只留一条 note 说明。
  const isObfuscated = PROVENANCE.test(text) && /obfuscated:/.test(text)
  let entropyHits = 0
  const tokens = isObfuscated ? [] : text.matchAll(/[A-Za-z0-9+/=_-]{40,}/g)
  if (isObfuscated) findings.push({ level: "note", rule: "obfuscated-bundle", file, evidence: "检测到混淆产物（dsh-obfuscate），高熵串为预期现象，熵扫描已跳过" })
  for (const t of tokens) {
    if (entropyHits >= 5) break
    const tok = t[0]
    if (shannon(tok) >= 4.5) {
      entropyHits++
      findings.push({ level: "review", rule: "high-entropy", file, evidence: "高熵串（熵 " + shannon(tok).toFixed(2) + "）：" + tok.slice(0, 24) + "…" })
    }
  }

  // 4) 调试残留 —— note
  if (/\bdebugger\s*;/.test(text)) findings.push({ level: "note", rule: "debugger", file, evidence: "产物里残留 debugger; 语句" })
  if (/\bconsole\.(log|debug|info)\s*\(/.test(text)) findings.push({ level: "note", rule: "console", file, evidence: "产物里残留 console 输出" })
  const todo = text.match(/\b(TODO|FIXME|HACK)\b[^\n]{0,60}/)
  if (todo) findings.push({ level: "note", rule: "todo-comment", file, evidence: todo[0].slice(0, 80) })
  if (/\bnew\s+Function\s*\(/.test(text)) findings.push({ level: "note", rule: "new-function", file, evidence: "产物里使用 new Function（可能触发 CSP，也常被安全扫描器标记）" })

  // 5) 溯源指纹 —— note（正面）
  if (PROVENANCE.test(text)) findings.push({ level: "note", rule: "provenance-ok", file, evidence: "有溯源指纹（built-from-src-sha256 式），版本可追溯到源码 ✓" })

  return summary(findings)
}

// ---------------------------------------------------------------- 打包检查

function walkFiles(dir, depth, acc) {
  if (depth < 0) return
  let items
  try { items = readdirSync(dir) } catch { return }
  for (const n of items) {
    if (n === "node_modules" || n === ".git") continue
    const p = join(dir, n)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) { walkFiles(p, depth - 1, acc); continue }
    acc.push(relative(dir, p).replace(/\\/g, "/"))
  }
}

/**
 * 检查一个包目录：files 白名单 + 磁盘上的危险文件。
 * 不运行 npm、不执行任何脚本。
 */
export function checkPackage(dir) {
  const findings = []
  const pkgPath = join(dir, "package.json")
  if (!existsSync(pkgPath)) return summary([{ level: "violation", rule: "no-package-json", file: dir, evidence: "没有 package.json" }])

  let pkg
  try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")) } catch (e) {
    return summary([{ level: "violation", rule: "bad-package-json", file: dir, evidence: "package.json 解析失败: " + e.message }])
  }

  const files = Array.isArray(pkg.files) ? pkg.files : null
  const disk = []
  walkFiles(dir, 3, disk)

  const checkName = (entry, where) => {
    for (const d of DANGEROUS_FILE) {
      if (d.re.test(entry)) {
        const published = files === null || files.some((f) => f.replace(/^\.\//, "") === entry || entry.startsWith(f.replace(/\/$/, "") + "/") || f === entry)
        findings.push({
          level: published ? "violation" : "note",
          rule: "packaging-" + d.name,
          file: join(dir, entry),
          evidence: where + " 含 " + d.name + (published ? "（会随包发布）" : "（未随包发布，仅磁盘存在）")
        })
      }
    }
  }

  if (files) for (const f of files) checkName(f.replace(/^\.\//, ""), "files 白名单条目")
  for (const f of disk) checkName(f, "磁盘")

  return summary(findings)
}

export function preflight(dir, bundlePath) {
  const out = checkPackage(dir)
  const bundle = existsSync(bundlePath) ? scanBundle(readFileSync(bundlePath, "utf8"), bundlePath) : summary([{ level: "note", rule: "no-bundle", file: bundlePath, evidence: "未找到 bundle，跳过产物扫描" }])
  const findings = [...out.findings, ...bundle.findings]
  return summary(findings)
}

function summary(findings) {
  const f = dedupe(findings)
  const counts = { violations: 0, reviews: 0, notes: 0 }
  for (const x of f) counts[x.level + "s"]++
  return { ...counts, findings: f }
}

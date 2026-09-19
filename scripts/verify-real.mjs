// 真实世界验收：对已安装的真实插件与内核工具跑静态检查。
//
// 验收的核心断言是「**零误报**」——所以本脚本检查的是：
//   1) 内核自带工具（必然合规）不得报出 violation
//   2) 已修好的第三方插件（dsh-ssh-ops 0.2.1）不得报出 violation
//   3) 另配一个合成的"旧式违规"样本，证明检测**确实有效**（不是什么都判 ok）
//
// 只读：不修改任何被扫描的文件。
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { scanSource } from '../src/scan-source.js'

const KERNEL_DIR = 'D:/tool/npmPlugin/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'
const PROFILE_MODULES = 'D:/tool/dsh_data/profiles/web/node_modules'

function walk(dir, out = [], depth = 0) {
  if (depth > 4) return out
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'client') continue
      walk(full, out, depth + 1)
    } else if (e.isFile() && /\.(js|mjs|ts|jsx|tsx)$/.test(e.name)) {
      out.push(full)
    }
  }
  return out
}

function scanTree(label, dir) {
  if (!existsSync(dir)) return { label, skipped: true, files: 0, found: 0, violations: 0, unknown: 0, bad: [] }
  const files = walk(dir)
  const acc = { label, skipped: false, files: files.length, found: 0, violations: 0, unknown: 0, bad: [] }
  for (const f of files) {
    let text
    try { text = readFileSync(f, 'utf8') } catch { continue }
    const r = scanSource(text, f)
    acc.found += r.found
    acc.violations += r.violations
    acc.unknown += r.unknown
    for (const finding of r.findings) {
      if (finding.status === 'violation') acc.bad.push(`${f}:${finding.line} ${finding.reason}`)
    }
  }
  return acc
}

const results = []

// 1) 内核自带工具包（必然合规）
if (existsSync(KERNEL_DIR)) {
  for (const d of readdirSync(KERNEL_DIR)) {
    if (!d.startsWith('dsh-tool-')) continue
    results.push(scanTree(`kernel:${d}`, join(KERNEL_DIR, d)))
  }
}

// 2) 真实第三方插件（已修好的版本）
for (const p of ['dsh-ssh-ops', 'dsh-session-doctor', 'dsh-contract-check']) {
  const base = p === 'dsh-contract-check' ? 'D:/tool/claude_code/dsh-contract-check' : join(PROFILE_MODULES, p)
  const target = existsSync(join(base, 'src')) ? join(base, 'src') : base
  results.push(scanTree(`plugin:${p}`, target))
}

// 3) 合成违规样本：证明检测有效
const SYNTHETIC = [
  'const t = { output: { render: (a, v) => `Wrote ${v.bytes} bytes` } };',
  'const u = { output: { render(args, value) { return "done"; } } };'
].join('\n')
const synth = scanSource(SYNTHETIC, '(synthetic)')
results.push({
  label: 'synthetic:old-style-violation',
  skipped: false,
  files: 0,
  found: synth.found,
  violations: synth.violations,
  unknown: synth.unknown,
  bad: synth.findings.filter((f) => f.status === 'violation').map((f) => `(synthetic):${f.line}`)
})

// 汇总
console.log('=== 真实世界验收 ===\n')
let realViolations = 0
let realFound = 0
for (const r of results) {
  if (r.skipped) { console.log(`SKIP  ${r.label}（路径不存在）`); continue }
  const isSynthetic = r.label.startsWith('synthetic:')
  if (!isSynthetic) { realViolations += r.violations; realFound += r.found }
  console.log(
    `${isSynthetic ? 'SYNTH' : r.violations > 0 ? 'FAIL ' : 'ok   '} ${r.label.padEnd(38)} ` +
      `render=${String(r.found).padStart(3)} violation=${r.violations} unknown=${r.unknown}`
  )
  for (const b of r.bad.slice(0, 3)) console.log(`        ${b}`)
}

console.log(`\n真实代码合计：render=${realFound}，误报 violation=${realViolations}`)
console.log(`合成样本：violation=${synth.violations}（应 > 0，证明检测有效）`)

let ok = true
if (realViolations !== 0) {
  console.log('\n✗ 真实代码上出现误报 —— 这是本工具最不能犯的错，必须修')
  ok = false
}
if (synth.violations === 0) {
  console.log('\n✗ 合成违规样本没被检出 —— 检测失效')
  ok = false
}
console.log(ok ? '\n✓ 通过：真实代码零误报，且对已知违规有效' : '\n✗ 未通过')
if (!ok) process.exitCode = 1

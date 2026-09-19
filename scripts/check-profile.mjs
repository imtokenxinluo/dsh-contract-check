// 对一个 profile 里已装的插件做全面契约体检（离线，不需要 DSH 运行）。
//
//   node scripts/check-profile.mjs [node_modules 路径]
//
// 检查两件事：
//   1) 打包完整性（files 白名单会不会漏发声明要用的文件 → 插件树拒启）
//   2) render 契约（返回字符串 → 会话历史打不开）
//
// 只读：不修改被检查的文件。

import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkPackage } from '../src/package-check.js'
import { scanSource } from '../src/scan-source.js'

const ROOT = process.argv[2] ?? 'D:/tool/dsh_data/profiles/web/node_modules'
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'coverage', 'assets', 'docs'])
const SCAN_EXT = /\.(js|mjs|cjs|ts|tsx|jsx)$/

/** 列出一级包（含 @scope/name） */
function listPackages(root) {
  const out = []
  let entries
  try { entries = readdirSync(root, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue
    if (e.name.startsWith('.')) continue
    if (e.name.startsWith('@')) {
      for (const s of readdirSync(join(root, e.name), { withFileTypes: true })) {
        if (s.isDirectory() || s.isSymbolicLink()) out.push({ name: `${e.name}/${s.name}`, dir: join(root, e.name, s.name) })
      }
    } else {
      out.push({ name: e.name, dir: join(root, e.name) })
    }
  }
  return out
}

function collectSourceFiles(dir, out = [], depth = 0) {
  if (depth > 4) return out
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue
      collectSourceFiles(full, out, depth + 1)
    } else if (e.isFile() && SCAN_EXT.test(e.name)) {
      out.push(full)
    }
  }
  return out
}

const pkgs = listPackages(ROOT)
console.log(`体检对象：${ROOT}`)
console.log(`发现 ${pkgs.length} 个包\n`)

const rows = []
let pkgViolations = 0
let pkgNotes = 0
let renderViolations = 0
let renderUnknown = 0
let renderOk = 0

for (const { name, dir } of pkgs) {
  if (!existsSync(join(dir, 'package.json'))) continue
  let version = '?'
  try { version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? '?' } catch { /* ignore */ }

  const pk = checkPackage(dir)
  const pkgStatus = pk.ok === false ? 'ERR' : pk.violations > 0 ? `${pk.violations} 项漏发` : 'ok'
  if (pk.violations > 0) pkgViolations += pk.violations
  pkgNotes += (pk.notes ?? []).length

  // render 扫描：优先 src，其次 lib
  const base = existsSync(join(dir, 'src')) ? join(dir, 'src') : join(dir, 'lib')
  const files = existsSync(base) ? collectSourceFiles(base) : []
  let v = 0, u = 0, o = 0, found = 0
  const badDetail = []
  for (const f of files) {
    let text
    try { text = readFileSync(f, 'utf8') } catch { continue }
    const r = scanSource(text, f)
    found += r.found
    v += r.violations
    u += r.unknown
    o += r.found - r.violations - r.unknown
    for (const finding of r.findings) {
      if (finding.status === 'violation') badDetail.push(`${f.replace(dir, '')}:${finding.line} ${finding.reason}`)
    }
  }
  renderViolations += v
  renderUnknown += u
  renderOk += o

  rows.push({ name, version, pkgStatus, found, v, u, o, pkgDetail: pk.findings, pkgNotes: pk.notes ?? [], badDetail })
}

// 输出
const w = Math.max(28, ...rows.map((r) => r.name.length + 2))
console.log('包'.padEnd(w) + '版本'.padEnd(10) + '打包'.padEnd(12) + 'render(ok/unknown/违规)')
console.log('-'.repeat(w + 45))
for (const r of rows) {
  const flag = r.v > 0 || r.pkgStatus !== 'ok' ? '  ⚠️' : ''
  console.log(
    r.name.padEnd(w) + String(r.version).padEnd(10) + r.pkgStatus.padEnd(12) +
      `${r.o}/${r.u}/${r.v} (共 ${r.found})` + flag
  )
}

const problems = rows.filter((r) => r.v > 0 || r.pkgStatus !== 'ok')
if (problems.length) {
  console.log('\n=== 需要看的项（violation）===')
  for (const r of problems) {
    console.log(`\n▸ ${r.name}@${r.version}`)
    for (const f of r.pkgDetail) console.log(`   [打包] ${f.path} — ${f.reason}`)
    for (const b of r.badDetail) console.log(`   [render] ${b}`)
  }
}

const noted = rows.filter((r) => r.pkgNotes.length > 0)
if (noted.length) {
  console.log('\n=== 提示（note，不影响启动）===')
  for (const r of noted) {
    for (const n of r.pkgNotes) console.log(`   ${r.name}: ${n.path} — ${n.reason}`)
  }
}

console.log(`\n=== 汇总 ===`)
console.log(`包: ${rows.length}   打包漏发: ${pkgViolations}${pkgNotes ? `（另有 ${pkgNotes} 条提示）` : ''}   render 违规: ${renderViolations}   不可判定: ${renderUnknown}   合规 render: ${renderOk}`)
if (pkgViolations === 0 && renderViolations === 0) {
  console.log('✓ 没有发现违规——所有已装插件在契约层面是干净的')
} else {
  console.log('⚠️ 上面列出了需要看的项')
  process.exitCode = 1
}

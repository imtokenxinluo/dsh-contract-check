// 词汇表漂移检查：把内嵌的 KNOWN_EVENT_TYPES 与已安装内核重新比对。
// DSH 升级后跑一次——不一致说明内核词汇表变了，需要重新生成并复核。
import { readFileSync, existsSync } from 'node:fs'
import { KNOWN_EVENT_TYPES, VOCAB_VERSION } from '../src/event-vocab.js'

const CANDIDATES = [
  'D:/tool/npmPlugin/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js',
  'D:/tool/npmPlugin/node_modules/@deepseek-ai/dsh-session/lib/index.js'
]

const libPath = CANDIDATES.find((p) => existsSync(p)) ?? process.argv[2]
if (!libPath || !existsSync(libPath)) {
  console.error('找不到 dsh-session/lib/index.js —— 请传入路径：node scripts/verify-vocab.mjs <路径>')
  process.exit(2)
}

const text = readFileSync(libPath, 'utf8')
const m = text.match(/const KNOWN_SESSION_EVENT_TYPES = new Set\(\[([\s\S]*?)\]\)/)
if (!m) {
  console.error(`未能从 ${libPath} 提取词汇表 —— 内核结构可能已变`)
  process.exit(2)
}
const kernel = new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]))

let pkgVersion = 'unknown'
try {
  pkgVersion = JSON.parse(readFileSync(libPath.replace(/lib\/index\.js$/, 'package.json'), 'utf8')).version
} catch { /* 保底 */ }

const missing = [...kernel].filter((t) => !KNOWN_EVENT_TYPES.has(t))
const extra = [...KNOWN_EVENT_TYPES].filter((t) => !kernel.has(t))

console.log(`内嵌词汇表: ${KNOWN_EVENT_TYPES.size} 条（标注版本 ${VOCAB_VERSION}）`)
console.log(`内核词汇表: ${kernel.size} 条（实际版本 ${pkgVersion}）`)
console.log(`内嵌缺少: ${missing.length ? missing.join(', ') : '(无)'}`)
console.log(`内嵌多出: ${extra.length ? extra.join(', ') : '(无)'}`)

if (missing.length === 0 && extra.length === 0) {
  console.log('\n✓ 一致——内嵌词汇表与当前内核同步')
} else {
  console.log('\n✗ 不一致——请重新生成：node scripts/gen-event-vocab.mjs，并复核受影响的行为')
  process.exitCode = 1
}

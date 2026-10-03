// 词汇表漂移检查：把内嵌的 KNOWN_EVENT_TYPES 与已安装内核重新比对。
// DSH 升级后跑一次 —— 不一致说明内核词汇表变了，需要重新生成并复核。
//
// 既能当脚本跑（node scripts/verify-vocab.mjs），也能被测试 import 复用：
// 脚本部分用"是否被直接执行"守卫，import 时不会产生任何副作用。
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { KNOWN_EVENT_TYPES, VOCAB_VERSION } from '../src/event-vocab.js'

const CANDIDATES = [
  'D:/tool/npmPlugin/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js',
  'D:/tool/npmPlugin/node_modules/@deepseek-ai/dsh-session/lib/index.js',
]

/**
 * 读已安装内核的词汇表。
 * @param {string} [explicitPath] 显式指定 dsh-session/lib/index.js
 * @returns {{types: Set<string>, version: string, libPath: string} | null} 找不到返回 null
 */
export function findKernelVocab(explicitPath) {
  const libPath = (explicitPath && existsSync(explicitPath) ? explicitPath : null)
    ?? CANDIDATES.find((p) => existsSync(p))
    ?? null
  if (!libPath) return null
  let text
  try {
    text = readFileSync(libPath, 'utf8')
  } catch {
    return null
  }
  const m = text.match(/const KNOWN_SESSION_EVENT_TYPES = new Set\(\[([\s\S]*?)\]\)/)
  if (!m) return null
  const types = new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]))
  let version = 'unknown'
  try {
    version = JSON.parse(readFileSync(libPath.replace(/lib\/index\.js$/, 'package.json'), 'utf8')).version
  } catch { /* 保底：版本读不到不影响比对 */ }
  return { types, version, libPath }
}

/** 内嵌词表 vs 内核词表的双向差异。 */
export function diffVocab(kernel, embedded = KNOWN_EVENT_TYPES) {
  return {
    missing: [...kernel.types].filter((t) => !embedded.has(t)),
    extra: [...embedded].filter((t) => !kernel.types.has(t)),
  }
}

// ── 脚本入口（仅直接执行时）────────────────────────────────────────────────
const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  const kernel = findKernelVocab(process.argv[2])
  if (!kernel) {
    console.error('找不到 dsh-session/lib/index.js —— 请传入路径：node scripts/verify-vocab.mjs <路径>')
    process.exit(2)
  }
  const { missing, extra } = diffVocab(kernel)
  console.log(`内嵌词汇表: ${KNOWN_EVENT_TYPES.size} 条（标注版本 ${VOCAB_VERSION}）`)
  console.log(`内核词汇表: ${kernel.types.size} 条（实际版本 ${kernel.version}）`)
  console.log(`内嵌缺少: ${missing.length ? missing.join(', ') : '(无)'}`)
  console.log(`内嵌多出: ${extra.length ? extra.join(', ') : '(无)'}`)
  if (missing.length === 0 && extra.length === 0) {
    console.log('\n✓ 一致——内嵌词汇表与当前内核同步')
  } else {
    console.log('\n✗ 不一致——请重新生成：node scripts/gen-event-vocab.mjs，并复核受影响的行为')
    process.exitCode = 1
  }
}

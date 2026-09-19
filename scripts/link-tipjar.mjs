// 把本插件登记进打赏罐的赞助注册表（sponsors.json）。
//
// 为什么需要这一步：client 里渲染的是 <TipJarEmbed pluginId="dsh-contract-check">，
// 它读注册表里 pluginId → contributorId → 贡献者打赏渠道这条链。
// **只嵌组件、不登记** = 界面上只会显示"该插件未在赞助注册表登记"。
//
// 谨慎起见：
//   - 默认 dry-run，只打印将要做的改动；`--apply` 才写盘
//   - 写盘前先备份（同目录 .bak-<时间戳>）
//   - 写盘后重新解析校验，失败自动回滚
//   - 幂等：重复执行只更新，不重复追加
//   - **不改贡献者**：收款信息是用户自己的，工具只登记插件这一环
//
// 用法：
//   node scripts/link-tipjar.mjs                 # 预览
//   node scripts/link-tipjar.mjs --apply         # 落盘
//   node scripts/link-tipjar.mjs --apply --repo https://github.com/you/dsh-contract-check

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { linkPlugin, PLUGIN_ID } from './tipjar-link.js'

const REGISTRY = process.env.SPONSORS_JSON || 'D:/tool/dsh_data/sponsors.json'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const repoIdx = argv.indexOf('--repo')
const repo = repoIdx >= 0 ? argv[repoIdx + 1] : null

if (!existsSync(REGISTRY)) {
  console.error(`注册表不存在：${REGISTRY}`)
  console.error('（可用环境变量 SPONSORS_JSON 指定，或确认 DSH 工作区根目录）')
  process.exit(2)
}

let data
try {
  data = JSON.parse(readFileSync(REGISTRY, 'utf8'))
} catch (e) {
  console.error(`注册表不是合法 JSON：${e.message}`)
  process.exit(2)
}

const result = linkPlugin(data, { repo })
if (!result.ok) {
  console.error(`不能登记：${result.reason}——注册表原样不动`)
  process.exit(2)
}

console.log(`注册表: ${REGISTRY}`)
console.log(`贡献者: ${result.entry.contributorId}（沿用已有，不新建）`)
console.log(`将要${result.action}: ${JSON.stringify(result.entry)}`)

if (!apply) {
  console.log('\n这是预览。要落盘请加 --apply')
  process.exit(0)
}

const backup = `${REGISTRY}.bak-${timestamp()}`
copyFileSync(REGISTRY, backup)
writeFileSync(REGISTRY, JSON.stringify(result.data, null, 2), 'utf8')

// 落盘后重新读回来验一遍：解析得动、条目在、贡献者还找得到
try {
  const back = JSON.parse(readFileSync(REGISTRY, 'utf8'))
  const hit = back.plugins.find((p) => p && p.pluginId === PLUGIN_ID)
  if (!hit || hit.contributorId !== result.entry.contributorId) throw new Error('写入后条目校验不一致')
  console.log(`\n✓ 已${result.action}并校验通过（plugins 共 ${back.plugins.length} 条）`)
  console.log(`  备份: ${backup}`)
} catch (e) {
  console.error(`写入后校验失败（${e.message}）——正在回滚`)
  copyFileSync(backup, REGISTRY)
  process.exit(1)
}

function timestamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

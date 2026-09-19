// 构建客户端产物：src/client.js → lib/client.js（DSH 的 ModuleLoader 格式）。
//
// 为什么需要构建：DSH 的客户端插件必须是浏览器可直接执行的单文件，包在
//   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
// 里。`react` 保持 external —— **由宿主提供**（这是宿主 ModuleLoader 的约定），
// 所以我们的包很小；如果把 react 打进来，会与宿主 React 形成双实例。
//
// esbuild 用**本机已有副本**（不联网安装）：
//   优先项目自身 node_modules，其次工作区其它插件的副本。
//
// 用法：node scripts/build-client.mjs

import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// 打赏罐的嵌入组件（dsh-tip-jar/embed）：纯 ESM，由**我们自己的构建时**打包进 bundle。
// 平台禁止插件之间在运行时互相 import 对方 client 模块，构建时打包是官方姿势（见 tip-jar 的 EMBED.md）。
// 目录可能不存在（别人 clone 这个插件时没装打赏罐）——那就跳过，构建照样成功。
const TIP_JAR_EMBED = fileURLToPath(new URL('../../dsh-tip-jar/lib/embed.js', import.meta.url))
const HAVE_TIP_JAR = existsSync(TIP_JAR_EMBED)

/** 依次尝试这些位置解析 esbuild（都不是就明确报错，不去联网装） */
const ESBUILD_BASES = [
  ROOT + '/',
  'D:/tool/claude_code/dsh-stock-picks/',
  'D:/tool/claude_code/dsh-tip-jar/',
  process.cwd() + '/'
]

function loadEsbuild() {
  for (const base of ESBUILD_BASES) {
    try {
      const req = createRequire(base.endsWith('/') ? base : base + '/')
      const mod = req('esbuild')
      if (mod && typeof mod.build === 'function') return { mod, base }
    } catch { /* 换下一个 */ }
  }
  console.error('找不到 esbuild。本脚本刻意不联网安装，请确认以下任一处存在 node_modules/esbuild：')
  for (const b of ESBUILD_BASES) console.error('  - ' + b)
  process.exit(2)
}

const { mod: esbuild, base } = loadEsbuild()
console.log(`esbuild 来自: ${base}`)

mkdirSync(join(ROOT, 'lib'), { recursive: true })
const tmp = join(ROOT, 'lib/.client.tmp.js')

// 打赏罐不在时（别人 clone 走、或社区用户没装 tip-jar 的构建环境）：
// 用空组件顶替，构建照样成功、插件功能不受影响。绝不能因为"少了可选依赖"就构建失败。
const stub = join(ROOT, 'lib/.embed-stub.mjs')
const plugins = []
if (!HAVE_TIP_JAR) {
  writeFileSync(stub, 'export function TipJarEmbed() { return null }\n', 'utf8')
  plugins.push({
    name: 'tip-jar-stub',
    setup(b) {
      b.onResolve({ filter: /^dsh-tip-jar\/embed$/ }, () => ({ path: stub }))
    }
  })
}

await esbuild.build({
  entryPoints: [join(ROOT, 'src/client.js')],
  outfile: tmp,
  bundle: true,
  format: 'iife',
  globalName: '__contractCheckClient',
  platform: 'browser',
  target: 'es2020',
  external: ['react'],
  alias: HAVE_TIP_JAR ? { 'dsh-tip-jar/embed': TIP_JAR_EMBED } : undefined,
  plugins,
  // esbuild 默认 charset=ascii，会把中文转义成 \uXXXX：产物可读性差、体积也更大。
  // 客户端本来就在浏览器里跑，直接用 utf8。
  charset: 'utf8',
  logLevel: 'warning'
})

const bundle = readFileSync(tmp, 'utf8')
rmSync(tmp)
if (!HAVE_TIP_JAR) rmSync(stub, { force: true })

// ── 自检：react 必须保持 external（否则体积暴涨 + 双实例冲突）──
const problems = []
if (!/require\(\s*["']react["']\s*\)/.test(bundle)) {
  problems.push('产物里没有 require("react") —— external 可能没生效，react 被打进来了')
}
// 打赏罐嵌入组件当前**没有挂载**（用户定：界面只留一个状态圆点，不做 Tab、不做按钮）。
// 但构建支持保留着：一旦哪天重新挂上，下面这条自检会自动开始生效。
const MOUNTS_EMBED = /from\s+'dsh-tip-jar\/embed'/.test(readFileSync(join(ROOT, 'src/client.js'), 'utf8'))

if (HAVE_TIP_JAR && MOUNTS_EMBED && !bundle.includes('sps-toolcard')) {
  problems.push('源码 import 了 dsh-tip-jar/embed 却没被打进产物 —— alias 未生效（打赏组件会静默消失）')
}
if (bundle.length > 200 * 1024) {
  problems.push(`产物过大（${(bundle.length / 1024).toFixed(0)} KB > 200 KB）—— 很可能把依赖打进来了`)
}
if (problems.length) {
  console.error('构建自检失败：')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}

// 产物里盖一个**源码指纹**：改了 src/client.js 却忘了重新构建时，
// 测试能立刻发现（用户拿到的是旧界面）。
// 为什么用指纹而不是"重新构建再比对"：构建要 esbuild，
// 而 CI / 别人的机器上不一定有（我们刻意不联网装依赖）。
const sourceHash = createHash('sha256')
  .update(readFileSync(join(ROOT, 'src/client.js'), 'utf8'))
  .digest('hex')

const wrapped =
  '// built-from-src-sha256: ' + sourceHash + '\n' +
  'window.__ModuleLoader__.load({\n' +
  '\tid: "dsh-contract-check",\n' +
  '\tfactory: (require) => {\n' +
  bundle +
  '\n\t\treturn __contractCheckClient.default || __contractCheckClient;\n' +
  '\t}\n' +
  '});\n'

writeFileSync(join(ROOT, 'lib/client.js'), wrapped, 'utf8')

const kb = (wrapped.length / 1024).toFixed(1)
console.log(`✓ 已生成 lib/client.js（${kb} KB，react external，ModuleLoader 格式）`)
console.log(`  源码指纹: ${sourceHash.slice(0, 16)}…`)

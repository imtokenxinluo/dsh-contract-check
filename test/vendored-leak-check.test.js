// vendored leak-check 的护栏测试：
//   1. 本文件零依赖（CI 不跑 npm install 也能执行）
//   2. workflow 确实引用了预检脚本
//   3. 预检对**本仓库**跑通（退出码 0）
//   4. 与 dsh-publish-guard 的源文件漂移检测（兄弟仓库存在时强制一致）
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"

const root = fileURLToPath(new URL("..", import.meta.url))
const vendored = join(root, "scripts/vendor/leak-check.mjs")
const wrapper = join(root, "scripts/preflight-leak.mjs")
const workflow = join(root, ".github/workflows/test.yml")
const sibling = join(dirname(root), "dsh-publish-guard/lib/leak-check.mjs")

test("vendored: 文件存在且只 import node 内置模块（零依赖）", () => {
  const t = readFileSync(vendored, "utf8")
  const imports = [...t.matchAll(/^\s*import\s[^;]+from\s+["']([^"']+)["']/gm)].map((m) => m[1])
  for (const i of imports) assert.ok(i.startsWith("node:"), "只允许 node: 内置模块，发现 " + i)
})

test("vendored: workflow 里有预检步骤", () => {
  const t = readFileSync(workflow, "utf8")
  assert.match(t, /node scripts\/preflight-leak\.mjs/)
})

test("vendored: 预检对本仓库跑通（0 violation）", () => {
  const r = spawnSync(process.execPath, [wrapper], { encoding: "utf8", cwd: tmpdir() })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /violation 0/)
})

test("vendored: 与 dsh-publish-guard 源文件一致（漂移检测，兄弟仓库不在则跳过）", (t) => {
  if (!existsSync(sibling)) { t.skip("兄弟仓库 dsh-publish-guard 不在本机"); return }
  const src = readFileSync(sibling, "utf8")
  const cp = readFileSync(vendored, "utf8")
  // 只剥掉 vendored 通知头（以最后一行注释为标记），其余必须与源文件逐字一致
  const marker = "本文件零依赖（仅 node 内置模块），因此 CI 不用 npm install 也能跑。"
  const idx = cp.indexOf(marker)
  const body = (idx >= 0 ? cp.slice(idx + marker.length) : cp).replace(/^\r?\n/, "")
  assert.equal(body, src, "vendored 副本与源文件不一致 —— 改源文件后需重拷（见 vendored 头部说明）")
})
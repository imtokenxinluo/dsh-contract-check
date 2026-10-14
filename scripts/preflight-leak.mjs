#!/usr/bin/env node
// 发布前泄漏预检：CI 与本地共用（node scripts/preflight-leak.mjs）。
// 路径基于本脚本位置解析，与调用时的 cwd 无关。
import { preflight } from "./vendor/leak-check.mjs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const root = fileURLToPath(new URL("..", import.meta.url))
const res = preflight(root, join(root, "lib/client.js"))
const icon = (l) => (l === "violation" ? "[X]" : l === "review" ? "[?]" : "    ")
console.log("preflight: violation " + res.violations + " · review " + res.reviews + " · note " + res.notes)
for (const f of res.findings) console.log("  " + icon(f.level) + " [" + f.rule + "] " + f.evidence)
process.exit(res.violations > 0 ? 1 : 0)
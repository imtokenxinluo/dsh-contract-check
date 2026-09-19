// 客户端产物（lib/client.js）格式测试。
//
// 为什么要测构建产物：DSH 加载客户端插件时要求精确格式，格式错了 DSH 会在启动时
// 报 "client bundles not found / malformed" 一类诊断（整个 GUI 侧就不显示）。
// 这类错误很难在运行期调试，所以在测试里锁死。
//
// 前置：先 `npm run build`（本包有构建步骤）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BUNDLE = fileURLToPath(new URL("../lib/client.js", import.meta.url));

test("客户端产物: lib/client.js 存在（否则包不完整）", () => {
  assert.ok(existsSync(BUNDLE), "缺少 lib/client.js —— 请先运行 npm run build");
});

test("客户端产物: 是 ModuleLoader 包装格式且 id 正确", () => {
  const src = readFileSync(BUNDLE, "utf8");
  assert.match(src, /^window\.__ModuleLoader__\.load\(\{/, "必须以 ModuleLoader.load 开始");
  assert.match(src, /id:\s*["']dsh-contract-check["']/, "id 必须是包名（宿主按它挂载）");
  assert.match(src, /factory:\s*\(require\)\s*=>\s*\{/, "必须有 factory(require) 形式");
});

test("客户端产物: react 保持 external（不能被静态打包进来）", () => {
  const src = readFileSync(BUNDLE, "utf8");
  assert.match(src, /require\(\s*["']react["']\s*\)/, "应当调用 require(\"react\")");
  // react 被打进来时会出现它内部的标记串
  assert.ok(!/react\.production\.min|__SECRET_INTERNALS_DO_NOT_USE/.test(src), "产物里不该包含 React 本体");
});

test("客户端产物: 体积在合理范围（外部依赖未被打入）", () => {
  const kb = statSync(BUNDLE).size / 1024;
  assert.ok(kb > 1, `产物过小（${kb.toFixed(1)} KB）—— 可能是空构建`);
  assert.ok(kb < 200, `产物过大（${kb.toFixed(1)} KB）—— 很可能把依赖打进来了`);
});

test("客户端产物: 语法可解析（node --check）", () => {
  // 用 node 解析一遍：产物的 bug 不该等到浏览器里才发现
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ["--check", BUNDLE], { stdio: ["ignore", "pipe", "pipe"] });
  });
});

test("客户端产物: 只暴露 slots 注入（不注册模型工具，保持 token 中立）", () => {
  const src = readFileSync(BUNDLE, "utf8");
  assert.match(src, /conversation\.view/, "应注册会话 Tab");
  assert.ok(!/systemPrompt|tools\.register|defineTool/.test(src), "客户端不该碰提示词或工具注册");
});

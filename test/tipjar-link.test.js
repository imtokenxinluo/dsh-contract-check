// 打赏罐绑定的测试。
//
// 现状（2026-09-19 用户定）：**界面上的打赏条已摘掉**——体检插件不做 Tab、不做按钮，
// 只留一个状态圆点，所以嵌入组件暂时没有挂载点。
// 但"绑定"这件事本身保留：注册表登记、构建别名、打桩降级都还在，随时可以重新挂上。
//
// 因此下面分两类：
//   1. 无条件必须成立的：注册表链条完整（登记 → 贡献者 → 收款地址）
//   2. 条件成立的：**一旦 client 里确实挂了嵌入组件**，那套约束（pluginId 一致、
//      inject 声明齐全、产物里真的打进去了）就必须全部满足
//      —— 用条件式是为了：现在不挂不误报，将来重新挂上时立刻有人盯着。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { linkPlugin, PLUGIN_ID, PLUGIN_NAME } from "../src/tipjar-link.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const base = () => ({
  schemaVersion: 1,
  contributors: [{ id: "alice", alias: "alice", tips: { usdc: "0xabc" } }],
  plugins: [{ pluginId: "other-plugin", name: "别的插件", contributorId: "alice", sponsors: [] }]
});

// ── 1. 注册表链条（无条件） ────────────────────────────────────────────

test("打赏罐: 新增一条登记，指向已有贡献者", () => {
  const r = linkPlugin(base());
  assert.equal(r.ok, true);
  assert.equal(r.action, "新增");
  const hit = r.data.plugins.find((p) => p.pluginId === PLUGIN_ID);
  assert.ok(hit, "条目必须真的写进去");
  assert.equal(hit.contributorId, "alice");
  assert.equal(hit.name, PLUGIN_NAME);
});

test("打赏罐: 幂等——重复登记只更新，不重复追加", () => {
  const once = linkPlugin(base());
  const twice = linkPlugin(once.data);
  assert.equal(twice.action, "更新");
  assert.equal(twice.data.plugins.filter((p) => p.pluginId === PLUGIN_ID).length, 1);
  assert.equal(twice.data.plugins.length, once.data.plugins.length);
});

test("打赏罐: 不动机器里已有的其它条目", () => {
  const r = linkPlugin(base());
  const other = r.data.plugins.find((p) => p.pluginId === "other-plugin");
  assert.deepEqual(other, base().plugins[0]);
});

test("打赏罐: 不改调用方传进来的对象（写盘失败也不会脏内存）", () => {
  const input = base();
  linkPlugin(input);
  assert.equal(input.plugins.length, 1);
});

test("打赏罐: 没有贡献者时明确拒绝，不硬造一个", () => {
  const r = linkPlugin({ schemaVersion: 1, contributors: [], plugins: [] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /contributor/);
});

test("打赏罐: 指定的贡献者不存在时拒绝（否则界面显示'贡献者未登记'）", () => {
  const r = linkPlugin(base(), { contributorId: "nobody" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /nobody/);
});

test("打赏罐: 结构不符的注册表一律拒绝，绝不'顺手修一修'", () => {
  for (const bad of [null, [], {}, { plugins: [] }, { contributors: [] }]) {
    const r = linkPlugin(bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} 应该被拒绝`);
  }
});

test("打赏罐: --repo 才写 upstream，不传就不写空壳字段", () => {
  assert.equal(linkPlugin(base()).entry.upstream, undefined);
  const withRepo = linkPlugin(base(), { repo: "https://github.com/x/y" });
  assert.deepEqual(withRepo.entry.upstream, { repo: "https://github.com/x/y", author: "alice" });
});

test("打赏罐: 本机注册表里这条登记能被打赏罐自己解析出来（装了才查）", (t) => {
  const reg = "D:/tool/dsh_data/sponsors.json";
  const embed = "D:/tool/claude_code/dsh-tip-jar/lib/embed.js";
  if (!existsSync(reg) || !existsSync(embed)) {
    t.skip("本机没有注册表或打赏罐，跳过联机检查");
    return;
  }
  const data = JSON.parse(readFileSync(reg, "utf8"));
  const hit = data.plugins.find((p) => p && p.pluginId === PLUGIN_ID);
  assert.ok(hit, `${PLUGIN_ID} 未登记 → 界面上不会出现打赏条`);
  const contributor = data.contributors.find((c) => c && c.id === hit.contributorId);
  assert.ok(contributor, "登记指向的贡献者必须存在");
  assert.ok(contributor.tips && contributor.tips.usdc, "贡献者要有收款地址，否则组件没有可打赏目标");
});

// ── 2. 挂载约束（条件式：client 里挂了嵌入组件时才生效） ──────────────────

const MOUNTS_EMBED = /from 'dsh-tip-jar\/embed'/.test(read("src/client.js"));

test("打赏罐: 若 client 挂了嵌入组件，pluginId 必须与登记用的一致", (t) => {
  if (!MOUNTS_EMBED) return t.skip("当前界面未挂打赏条（设计如此）");
  const client = read("src/client.js");
  const m = client.match(/pluginId:\s*'([^']+)'/);
  assert.ok(m, "挂了组件就必须传 pluginId");
  assert.equal(m[1], PLUGIN_ID, "两处 pluginId 不一致 → 界面会显示'未在赞助注册表登记'");
});

test("打赏罐: 若 client 挂了嵌入组件，inject 必须声明 remote（少它组件永不显示）", (t) => {
  if (!MOUNTS_EMBED) return t.skip("当前界面未挂打赏条（设计如此）");
  const client = read("src/client.js");
  const m = client.match(/inject:\s*\[([^\]]*)\]/);
  assert.ok(m, "client.js 里应该有 inject 列表");
  const list = m[1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
  assert.ok(list.includes("remote"), `inject 里必须有 'remote'，现在只有 [${list.join(", ")}]`);
});

test("打赏罐: 若 client 挂了嵌入组件，package.json 必须声明 dsh-api-remotes", (t) => {
  if (!MOUNTS_EMBED) return t.skip("当前界面未挂打赏条（设计如此）");
  const pkg = JSON.parse(read("package.json"));
  const list = (pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject) || [];
  assert.ok(
    list.includes("@deepseek-ai/dsh-api-remotes"),
    "缺 @deepseek-ai/dsh-api-remotes → 客户端拿不到 remote 服务"
  );
});

test("打赏罐: 若 client 挂了嵌入组件，产物里必须真的打进组件", (t) => {
  if (!MOUNTS_EMBED) return t.skip("当前界面未挂打赏条（设计如此）");
  const bundle = `${ROOT}/lib/client.js`;
  if (!existsSync(bundle)) return t.skip("还没构建产物");
  assert.match(readFileSync(bundle, "utf8"), /sps-toolcard/, "打赏组件没被打进产物");
});

test("打赏罐: 构建脚本始终支持挂载（alias + 未安装时打桩），不管现在挂没挂", () => {
  const build = read("scripts/build-client.mjs");
  assert.match(build, /dsh-tip-jar\/embed/, "构建脚本要认识这个 import");
  assert.match(build, /HAVE_TIP_JAR/, "要能判断打赏罐装没装");
  assert.match(build, /TipJarEmbed.*return null/, "没装时要能打桩，不能让构建失败");
});

// ── 3. 界面最小化约束（用户定：不要 Tab、不要按钮） ────────────────────────

test("界面: 不注册 Tab（体检不该要求用户主动去看）", () => {
  const client = read("src/client.js");
  assert.doesNotMatch(client, /slots\.inject\(\s*'conversation\.view'/, "不该再有「体检」页签");
});

test("界面: 不注册任何按钮（体检不该要求用户主动去点）", () => {
  const client = read("src/client.js");
  assert.doesNotMatch(client, /createElement\(\s*'button'/, "界面上不该有按钮");
  assert.doesNotMatch(client, /runAudit|AUDIT_URL/, "不该有手动触发体检的入口");
});

test("界面: 唯一界面元素是状态圆点，且带颜色 + 悬停说明", () => {
  const client = read("src/client.js");
  assert.match(client, /function StatusDot/, "应该有状态圆点组件");
  assert.match(client, /COLORS\[level\]/, "圆点要按健康度着色");
  assert.match(client, /title:\s*\(state && state\.detail\)/, "悬停要显示完整状态条");
});

test("界面: 客户端只读状态，不发任何写请求", () => {
  const client = read("src/client.js");
  const written = [...client.matchAll(/fetch\([^)]*method:\s*'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(written, [], `客户端不该有写请求，发现: ${written.join(", ")}`);
});

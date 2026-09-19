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

// ── 3. 界面约束（用户定：不要 Tab；要按钮，但点击反馈要做足） ──────────────

test("界面: 不注册 Tab（体检不该要求用户主动去翻页签）", () => {
  const client = read("src/client.js");
  assert.doesNotMatch(client, /slots\.inject\(\s*'conversation\.view'/, "不该再有「体检」页签");
});

test("界面: 保留「体检」按钮，点击能触发一次体检", () => {
  const client = read("src/client.js");
  assert.match(client, /createElement\(\s*'button'/, "头部要有体检按钮");
  assert.match(client, /onClick:\s*runAudit/, "点击要真的触发体检");
  assert.match(client, /AUDIT_URL/, "要打到体检路由");
});

test("界面: 点击反馈四态齐全（悬停/按下/进行中/键盘聚焦）", () => {
  const client = read("src/client.js");
  assert.match(client, /\.cc-hbtn:hover/, "要有悬停态");
  assert.match(client, /\.cc-hbtn:active/, "要有按下态");
  assert.match(client, /\.cc-hbtn\[disabled\]/, "进行中要禁用（防连点）");
  assert.match(client, /\.cc-hbtn:focus-visible/, "键盘聚焦要有可见轮廓");
  assert.match(client, /transition:/, "状态切换要平滑，不能硬跳");
});

test("界面: 体检进行中要有明确的文字反馈，不能'点了没反应'", () => {
  const client = read("src/client.js");
  assert.match(client, /busy \? '体检中…'/, "进行中要显示「体检中…」");
});

test("界面: 忙碌态有最短展示时长（体检几十毫秒跑完也不会'闪一下'）", () => {
  const client = read("src/client.js");
  const m = client.match(/MIN_BUSY_MS\s*=\s*(\d+)/);
  assert.ok(m, "要定义最短忙碌时长");
  const ms = Number(m[1]);
  assert.ok(ms >= 300 && ms <= 1200, `最短时长应在 300~1200ms 之间（现在是 ${ms}ms）`);
  assert.match(client, /Date\.now\(\)\s*-\s*started/, "要真的按实际耗时补足");
  assert.match(client, /setTimeout\(r,\s*MIN_BUSY_MS\s*-\s*elapsed\)/, "补足逻辑要落到 setTimeout");
});

test("界面: 忙碌态有转圈动画，且不是实心圆自转（那样看不出在动）", () => {
  const client = read("src/client.js");
  assert.match(client, /@keyframes\s+cc-spin/, "要有转圈动画");
  assert.match(client, /\.cc-spin\{[\s\S]*?border-top-color/, "要用圆环 + 高亮缺口");
  assert.match(client, /busy \? 'cc-hdot cc-spin'/, "忙碌时要换成转圈样式");
});

test("界面: 按钮宽度不随文字变化（否则忽宽忽窄像在抖）", () => {
  const client = read("src/client.js");
  assert.match(client, /\.cc-hlabel\{[\s\S]*?min-width/, "文字槽要定宽");
  assert.match(client, /className: 'cc-hlabel'/, "文字要用定宽槽包起来");
});

test("界面: 唯一会写状态的动作就是这个按钮（客户端不发别的写请求）", () => {
  const client = read("src/client.js");
  const written = [...client.matchAll(/fetch\(\s*([A-Z_]+)[^)]*method:\s*'(\w+)'/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(written, ["AUDIT_URL:POST"], `客户端只该有这一个写请求，实际: ${written.join(", ") || "无"}`);
});

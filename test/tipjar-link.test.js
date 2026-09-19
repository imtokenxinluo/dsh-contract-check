// 打赏罐绑定的测试。
//
// 这一环最容易出的错不是崩溃，而是**静默不显示**：
// pluginId 写错、贡献者没登记、注册表结构不符 —— 界面上都只是少了一条打赏。
// 所以这里盯的是"链条完整"，而不是"函数不抛异常"。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { linkPlugin, PLUGIN_ID, PLUGIN_NAME } from "../src/tipjar-link.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const base = () => ({
  schemaVersion: 1,
  contributors: [{ id: "alice", alias: "alice", tips: { usdc: "0xabc" } }],
  plugins: [{ pluginId: "other-plugin", name: "别的插件", contributorId: "alice", sponsors: [] }]
});

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

// --- 与 client 半的一致性：两处 pluginId 必须相同，否则组件查不到登记 ---

test("打赏罐: client 里的 pluginId 与登记用的 pluginId 一致", () => {
  const client = readFileSync(new URL("../src/client.js", import.meta.url), "utf8");
  const m = client.match(/pluginId:\s*'([^']+)'/);
  assert.ok(m, "client.js 里应该有 pluginId");
  assert.equal(m[1], PLUGIN_ID, "两处 pluginId 不一致 → 界面上会显示'未在赞助注册表登记'");
});

test("打赏罐: client 里用构建时打包的 esbuild 别名路径（不是运行时跨包 import）", () => {
  const client = readFileSync(new URL("../src/client.js", import.meta.url), "utf8");
  assert.match(client, /from 'dsh-tip-jar\/embed'/);
  const build = readFileSync(new URL("../scripts/build-client.mjs", import.meta.url), "utf8");
  assert.match(build, /dsh-tip-jar\/embed/, "构建脚本必须把 embed 打进产物");
});

test("打赏罐: 打赏罐没装时构建仍能成功（可选依赖不得让插件构建失败）", () => {
  const build = readFileSync(new URL("../scripts/build-client.mjs", import.meta.url), "utf8");
  assert.match(build, /HAVE_TIP_JAR/, "构建脚本要有'没装就打桩'的分支");
  assert.match(build, /TipJarEmbed\(\) \{ return null \}|TipJarEmbed.*return null/);
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

test("打赏罐: 产物里确实打进了组件（不是只剩一个空函数）", (t) => {
  const bundle = `${ROOT}/lib/client.js`;
  if (!existsSync(bundle)) {
    t.skip("还没构建产物");
    return;
  }
  const text = readFileSync(bundle, "utf8");
  assert.match(text, /sps-toolcard/, "打赏组件没被打进产物");
  assert.match(text, /dsh-contract-check/, "产物里应该有本插件的 pluginId");
});

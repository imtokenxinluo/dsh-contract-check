// 包元信息约束：这些一旦破掉，CI 与消费者都会受影响，而且都不容易在本地发现。
//
// 为什么这些放在测试里而不是 CI 的单独步骤里：
// 一是测试本地也会跑（CI 步骤只在 CI 跑）；二是 workflow 里写内联脚本
// 会踩 YAML 语法坑——2026-09-20 就踩过一次（见 .github/workflows/test.yml 注释）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("包元信息: 零运行时依赖（CI 因此不需要 npm install，也就没有装依赖的风险面）", () => {
  assert.deepEqual(Object.keys(pkg.dependencies || {}), [], "不该有运行时依赖");
  assert.deepEqual(Object.keys(pkg.optionalDependencies || {}), [], "不该有可选依赖");
});

test("包元信息: publishConfig 锁定官方源（本机默认源是只读镜像，不带它会发失败）", () => {
  assert.equal(pkg.publishConfig && pkg.publishConfig.registry, "https://registry.npmjs.org");
});

test("包元信息: files 覆盖 package.json 里声明要用的文件（本工具自己检查的那类事故）", () => {
  const files = pkg.files || [];
  const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
  assert.ok(patch, "package.json 应声明 dsh.bundle.patch");
  const rel = patch.replace(/^\.\//, "");
  assert.ok(
    files.includes(rel) || files.includes("."),
    `files 里没有 ${rel} —— npm 不会打包它，装上后插件树会拒绝启动`
  );
  assert.ok(files.includes("lib"), "files 里必须有 lib（客户端产物）");
});

test("包元信息: exports 指向的文件都在 files 覆盖范围内", () => {
  const files = pkg.files || [];
  const covered = (p) => {
    const rel = p.replace(/^\.\//, "");
    return files.some((f) => rel === f || rel.startsWith(f + "/"));
  };
  for (const [key, target] of Object.entries(pkg.exports || {})) {
    if (key === "./package.json") continue;
    const p = typeof target === "string" ? target : target.default;
    assert.ok(covered(p), `exports["${key}"] → ${p} 不在 files 里，装完会 import 失败`);
  }
});

test("包元信息: 仓库地址指向实际发布的仓库", () => {
  assert.match(pkg.repository.url, /github\.com\/imtokenxinluo\/dsh-contract-check/);
});

test("包元信息: workflow 里不写内联脚本（YAML 对冒号敏感，踩过一次）", () => {
  const wf = readFileSync(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");
  for (const [i, line] of wf.split("\n").entries()) {
    const m = line.match(/^\s*run:\s*(.+)$/);
    if (!m) continue;
    assert.ok(
      !/:\s/.test(m[1]),
      `.github/workflows/test.yml 第 ${i + 1} 行的内联脚本里有「冒号+空格」—— YAML 会解析失败，整个 workflow 起不来：${line.trim()}`
    );
  }
});

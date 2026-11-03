// peer 兼容性检查：范围覆盖判定 + 与 DSH 同口径（只评价 @deepseek-ai/dsh-*）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPeers, locateKernel, loadSemver } from "../src/peer-check.js";

const KERNEL = locateKernel();
const SEMVER = loadSemver(KERNEL);
const SKIP = SEMVER ? false : "找不到内核或 semver（在无 DSH 的环境里跳过）";

function withPkg(pj, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "peer-check-"));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify(pj));
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const check = (pj, dshVersion = "0.2.1-rc.2") =>
  withPkg(pj, (dir) => checkPeers(dir, { dshVersion, semver: SEMVER ?? {} }));

test("范围覆盖当前内核 → 无 violation", { skip: SKIP }, () => {
  const r = check({ name: "x", version: "1.0.0", peerDependencies: { "@deepseek-ai/dsh-agent": "^0.2.0-rc.2" } });
  assert.equal(r.ok, true);
  assert.equal(r.violations, 0);
  assert.equal(r.checked, 1);
});

test("精确旧版本 → violation（DSH 会跳过）", { skip: SKIP }, () => {
  const r = check({ peerDependencies: { "@deepseek-ai/dsh-session": "0.1.0-rc.6" } });
  assert.equal(r.violations, 1);
  assert.equal(r.findings[0].name, "@deepseek-ai/dsh-session");
  assert.match(r.findings[0].reason, /会跳过/);
});

test("|| 组合范围只要有一支覆盖就通过", { skip: SKIP }, () => {
  const r = check({ peerDependencies: { "@deepseek-ai/dsh-typert-protocol": "^0.1.0-rc.6 || ^0.2.0-rc.2" } });
  assert.equal(r.violations, 0);
});

test("cordis / schemastery 这类非 dsh- 包不评价（否则满屏假阳性）", { skip: SKIP }, () => {
  const r = check({
    peerDependencies: {
      "@deepseek-ai/cordis": "^4.0.1",
      "@deepseek-ai/schemastery": "^3.18.1",
      "@deepseek-ai/dsh-agent": "^0.2.0-rc.2"
    }
  });
  assert.equal(r.violations, 0, "非 dsh- 的 peer 不该被判为违规");
  assert.equal(r.checked, 1, "只统计 dsh- peer");
  assert.equal(r.notes.filter((n) => n.name === "@deepseek-ai/cordis").length, 1);
});

test("workspace 协议 → note（发布时才替换成实际版本）", { skip: SKIP }, () => {
  const r = check({ peerDependencies: { "@deepseek-ai/dsh-agent": "workspace:*" } });
  assert.equal(r.violations, 0);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0].reason, /workspace/);
});

test("* 范围 → note（任意版本，不做判断）", { skip: SKIP }, () => {
  const r = check({ peerDependencies: { "@deepseek-ai/dsh-agent": "*" } });
  assert.equal(r.violations, 0);
  assert.equal(r.notes.length, 1);
});

test("未声明任何 dsh- peer → 不误报，但给出提示", { skip: SKIP }, () => {
  const r = check({ peerDependencies: {} });
  assert.equal(r.violations, 0);
  assert.equal(r.checked, 0);
  assert.match(r.notes[0].reason, /没有声明/);
});

test("非法范围 → note 而不是违规", { skip: SKIP }, () => {
  const r = check({ peerDependencies: { "@deepseek-ai/dsh-agent": "not-a-range" } });
  assert.equal(r.violations, 0);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0].reason, /非法范围/);
});

test("缺少 dshVersion → ok:false", { skip: SKIP }, () => {
  const r = withPkg({ peerDependencies: {} }, (dir) => checkPeers(dir, { semver: SEMVER }));
  assert.equal(r.ok, false);
  assert.match(r.error, /dshVersion/);
});

test("缺少 semver → ok:false（不能静默当成通过）", { skip: SKIP }, () => {
  const r = withPkg({ peerDependencies: { "@deepseek-ai/dsh-agent": "^0.2.0" } }, (dir) =>
    checkPeers(dir, { dshVersion: "0.2.1-rc.2" })
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /semver/);
});

test("不是包目录 → ok:false", { skip: SKIP }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "peer-check-empty-"));
  try {
    const r = checkPeers(dir, { dshVersion: "0.2.1-rc.2", semver: SEMVER });
    assert.equal(r.ok, false);
    assert.match(r.error, /不是包目录/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
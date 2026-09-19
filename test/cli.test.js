// CLI 端到端测试（离线扫描，不需要 DSH）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/dsh-contract-check.js", import.meta.url));

function withDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "dsh-contract-check-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function run(args) {
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

const BAD = 'const tool = { output: { render: (a, v) => `Wrote ${v.bytes} bytes` } };\n';
const GOOD = 'const tool = { output: { render: (a, v) => [{ type: "text", text: "ok" }] } };\n';

test("cli: 无参数打印用法", () => {
  const r = run([]);
  assert.match(r.out, /usage/i);
});

test("cli: scan 一个违规文件 → 退出码 1，且指出位置与原因", () => {
  withDir((dir) => {
    const f = path.join(dir, "bad.js");
    writeFileSync(f, BAD);
    const r = run(["scan", f]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /violation/);
    assert.match(r.out, /render/);
  });
});

test("cli: scan 一个合规文件 → 退出码 0", () => {
  withDir((dir) => {
    const f = path.join(dir, "good.js");
    writeFileSync(f, GOOD);
    const r = run(["scan", f]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ok/i);
  });
});

test("cli: scan 一个目录，递归扫描并汇总", () => {
  withDir((dir) => {
    mkdirSync(path.join(dir, "lib"));
    writeFileSync(path.join(dir, "lib", "a.js"), BAD);
    writeFileSync(path.join(dir, "lib", "b.js"), GOOD);
    const r = run(["scan", dir]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /violation/i);
    assert.match(r.out, /合计|summary|scanned/i);
  });
});

test("cli: vocab 打印词汇表版本与条目数", () => {
  const r = run(["vocab"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /0\.1\.0-rc\.6/);
  assert.match(r.out, /44/);
});

test("cli: 不存在的路径 → 报错且退出码非零，不崩溃", () => {
  const r = run(["scan", path.join(tmpdir(), "definitely-missing-" + Date.now() + ".js")]);
  assert.notEqual(r.code, 0);
});

test("cli: package 子命令检出「bundle patch 不在 files 里」→ 退出码 1", () => {
  withDir((dir) => {
    writeFileSync(path.join(dir, "cordis.patch.yml"), "- insert: []");
    mkdirSync(path.join(dir, "src"));
    writeFileSync(path.join(dir, "src", "index.js"), "export default {};");
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({
      name: "probe", version: "1.0.0",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      files: ["src"]
    }));
    const r = run(["package", dir]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /cordis\.patch\.yml/);
    assert.match(r.out, /files|白名单/);
  });
});

test("cli: package 子命令对合规包 → 退出码 0", () => {
  withDir((dir) => {
    writeFileSync(path.join(dir, "cordis.patch.yml"), "- insert: []");
    mkdirSync(path.join(dir, "src"));
    writeFileSync(path.join(dir, "src", "index.js"), "export default {};");
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({
      name: "probe", version: "1.0.0",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      files: ["src", "cordis.patch.yml"]
    }));
    const r = run(["package", dir]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ok|通过/i);
  });
});

test("cli: 无参数时用法里提到 package 子命令", () => {
  const r = run([]);
  assert.match(r.out, /package/i);
});

// npm 自动包含语义：CHANGELOG 不自动带（2026-09-20 复测修正）。
//
// 实验（files: ["lib"]，根目录放 README/LICENSE/CHANGELOG/HISTORY）：
//   LICENSE ✓、README.md ✓、CHANGELOG.md ✗、HISTORY.md ✗
// 因此：声明要用的文件若指向 CHANGELOG，必须自己进 files，否则会被漏发。
// 早前 ALWAYS_INCLUDED 里错误地包含 changelog，这组测试锁住修正结果。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPackage } from "../src/package-check.js";

/** 造一个临时包目录；返回 { dir, write, done } */
function pkg(files, extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "pkgchangelog-"));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "tmp-pkg", version: "1.0.0", files, ...extra }, null, 2)
  );
  return {
    dir,
    write(rel, content = "x") {
      const p = path.join(dir, rel);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, content);
    },
    done() { rmSync(dir, { recursive: true, force: true }); }
  };
}

test("打包: CHANGELOG 不在 files 里时会被漏发（npm 不自动包含它）", () => {
  const p = pkg(["lib"], { exports: { "./doc": "./CHANGELOG.md" } });
  try {
    p.write("lib/index.js");
    p.write("CHANGELOG.md");
    const r = checkPackage(p.dir);
    assert.ok(r.violations > 0, "CHANGELOG 被声明要用却不在 files 里 → 应报 violation");
  } finally { p.done(); }
});

test("打包: README / LICENSE 不需要进 files（npm 确实自动包含）", () => {
  const p = pkg(["lib"], { exports: { "./r": "./README.md", "./l": "./LICENSE" } });
  try {
    p.write("lib/index.js");
    p.write("README.md");
    p.write("LICENSE");
    const r = checkPackage(p.dir);
    assert.equal(r.violations, 0, JSON.stringify(r.findings));
  } finally { p.done(); }
});

test("打包: 本仓库自己的 files 必须包含 CHANGELOG.md（0.1.1 就是漏在这）", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const pj = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.ok(
    (pj.files || []).includes("CHANGELOG.md"),
    "files 里没有 CHANGELOG.md → npm 不会打包它（实测确认 CHANGELOG 不自动包含）"
  );
});

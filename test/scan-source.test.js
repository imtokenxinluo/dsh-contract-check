// 离线源码扫描测试：从 .js/.ts 源码里找出 render 定义并判定契约。
// 用途：不启动 DSH 也能体检一个插件的源码。
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSource } from "../src/scan-source.js";

test("扫描：方法简写 render 返回数组 → ok", () => {
  const src = `
    const tool = {
      name: "demo",
      output: {
        render(args, value) {
          return [{ type: "text", text: "ok" }];
        }
      }
    };`;
  const r = scanSource(src, "demo.js");
  assert.equal(r.found, 1, JSON.stringify(r));
  assert.equal(r.findings[0].status, "ok");
});

test("扫描：箭头属性 render 返回模板字符串 → violation", () => {
  const src = 'const tool = { output: { render: (a, v) => `Wrote ${v.bytes} bytes` } };';
  const r = scanSource(src, "demo.js");
  assert.equal(r.found, 1);
  assert.equal(r.findings[0].status, "violation");
  assert.ok(r.findings[0].line > 0, "应给出行号");
});

test("扫描：render: function 形式 → 判定正确", () => {
  const bad = 'output: { render: function (a, v) { return "done"; } }';
  const good = 'output: { render: function (a, v) { return [{ type: "text", text: "x" }]; } }';
  assert.equal(scanSource(bad, "a.js").findings[0].status, "violation");
  assert.equal(scanSource(good, "a.js").findings[0].status, "ok");
});

test("扫描：字符串里的花括号不得打乱括号配对", () => {
  const src = 'output: { render(a, v) { return [{ type: "text", text: "}" }]; } }';
  const r = scanSource(src, "tricky.js");
  assert.equal(r.found, 1);
  assert.equal(r.findings[0].status, "ok", `reason=${r.findings[0]?.reason}`);
});

test("扫描：嵌套对象与多返回路径", () => {
  const src = `
    render(a, v) {
      if (!v.ok) {
        return [{ type: "text", text: "fail" }];
      }
      return { items: v.items }.items.map((i) => ({ type: "text", text: i }));
    }`;
  const r = scanSource(src, "nested.js");
  assert.equal(r.found, 1);
  assert.equal(r.findings[0].status, "ok", `reason=${r.findings[0]?.reason}`);
});

test("扫描：压缩代码（不可判定）→ unknown，不算 violation", () => {
  const src = 'render:(e,t)=>e.x?t.y:z.w';
  const r = scanSource(src, "min.js");
  assert.equal(r.found, 1);
  assert.equal(r.findings[0].status, "unknown");
});

test("扫描：一个文件里多个 render 全部报出并带行号", () => {
  const src = [
    'const a = { render: (x) => `bad` };',
    'const b = { render: (x) => [{ type: "text", text: "good" }] };'
  ].join("\n");
  const r = scanSource(src, "multi.js");
  assert.equal(r.found, 2);
  assert.equal(r.violations, 1);
  assert.equal(r.findings[0].line, 1);
  assert.equal(r.findings[1].line, 2);
});

test("扫描：没有 render 的文件 → found=0，不报错", () => {
  const r = scanSource("export const x = 1;", "empty.js");
  assert.equal(r.found, 0);
  assert.deepEqual(r.findings, []);
});

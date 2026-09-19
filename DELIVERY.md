# dsh-contract-check — 交付记录

> 2026-09-13 · Verdict: **green**（spec 已记录 · 红绿时间线完整 · 对抗审查已做并记录边界 ·
> 真实代码零误报实证）。独立 per-dimension verify 通道未执行，故**不宣称 verified/proven**。

## 1. Spec（契约摘要）

- **Goal**：进程内插件 + 离线 CLI，枚举当前注册的工具定义并静态检查 `render` 契约，
  运行期检查会话事件类型是否越出内核词汇表。**只告警，不拦截**。
- **Scope**：独立仓库；`src/`（判定核心 + 插件壳）、`bin/` CLI、`test/`、README、
  `package.json`（files 含 `cordis.patch.yml`）、`cordis.patch.yml`。
- **Non-goals**：不做拦截；不检测恶意/投毒；不做成"安全卫士"；不改内核；不代为安装或重启 DSH；
  不发 npm/GitHub；不扫描网络与凭据。
- **Priorities**：**零误报 > 覆盖率**（宁 unknown 不 violation）；只告警不干预；核心与运行环境解耦。

## 2. 红绿时间线（关键节点）

| 阶段 | 证据 |
|---|---|
| red | `render` 判定先写 22 个用例 → 模块缺失红 → 放 stub 后**行为红 17 个** |
| green | 实现三态判定 → 22/22 |
| red → green | 链式类型误判（`.map().join()` 判成数组）→ 修正为「链尾决定」→ 22/22 |
| red → green | 审计模块 + 词汇表 → 行为红 8 个 → 35/35 |
| red → green | 插件壳（假 ctx）→ 红 → 含 `tools/change` 重体检、去重告警 → 43/43 |
| red → green | 源码扫描器 → 红（嵌套箭头被误当外层）→ 抽出 `source-utils`、`findOwnArrow` → 57/57 |
| red → green | CLI 6 测 → 红 → 63/63 |
| **red（真实误报）** | 扫 `dsh-ssh-ops` 报 5 个 violation → **全是误报**（数组字面量内部含 `.join()`） |
| green | 改为「只在括号深度 0 处认产物标记」→ 67/67；重扫真实代码误报归零 |
| red → green | 对抗审查发现：`tools/change` 可能收不到 → 加「首次会话流量补做体检」兜底 → 68/68 |

## 3. 对抗审查（本会话手动执行）

| 异议 | 结论 |
|---|---|
| **误报会不会毁掉工具价值** | 是最大风险。真实扫 `dsh-ssh-ops` 时**确实发生了 5 个误报**（数组内部 `.join()`），已修并加 3 个测试锁定 |
| **`tools/change` 作用域是否到达本插件** | **未验证**（事件在 ToolRuntime 自己的 ctx 上发出）。已加兜底：首次 `session/event` 时补做体检 + 单测锁定 |
| **注册表在加载时可能还是空的** | 已处理：空注册表**静默**，等 `tools/change` 或首次会话流量 |
| **插件自身出错会不会拖垮 DSH** | 已处理：全部审计/订阅路径 try-catch，异常只落一条告警 |
| **同名工具被 shadow / 受限工具** | 用 `view()` 的可见集合，符合"该 scope 实际能看到的工具"语义；未对 shadow 单独处理（低风险，如实记录） |

## 4. 验证证据

```
$ npm test
# tests 68  # pass 68  # fail 0

$ npm run verify:real
真实代码合计：render=52，误报 violation=0
合成样本：violation=2（应 > 0，证明检测有效）
✓ 通过：真实代码零误报，且对已知违规有效

$ npm run verify:vocab
内嵌词汇表: 44 条（0.1.0-rc.6） / 内核词汇表: 44 条 → ✓ 一致

$ npm pack --dry-run
12 files 内含 cordis.patch.yml（509 B）→ 不会重演 0.2.0 的包缺文件事故
```

真实代码覆盖面：**19 个内核工具包 + 3 个真实插件**（内核自带工具必然合规，任何 violation 都是误报）。
对照样本：`dsh-ssh-ops@0.2.1` 15 个 render / 0 violation（该版本已修好；修复前正是裸字符串）。

## 5. 未验证 / 未覆盖（如实）

1. **实机挂载已验证**（2026-09-19）：web profile 以 `link:` 接入 + 重启后，GUI 插件列表可见
   `contract-check` → bundle patch 解析正确、`apply()` 已执行。
   **仍待补**：首次体检的日志行未核对（DSH 输出在启动它的控制台窗口，未落盘）；
   `tools/change` 作用域未验证（已有"首次会话流量补做体检"兜底）。
2. **未覆盖的契约**：打包白名单（属磁盘属性，用 `npm pack --dry-run` 核对）、
   是否杀宿主进程（属运行时行为）。
3. **静态分析盲区**：运行时拼接的返回值、深度混淆 → 判 `unknown`，不等于"没问题"。
4. **不检测恶意**：满足全部契约的插件照样能偷数据；那需要进程外隔离与权限手段。
5. **顺带核实（降低误报信心）**：`dsh-tools` 的 `register()` 强制要求 `output.render` 是函数
   （否则 `throw new TypeError("tool … must declare output { schema, render … }")`），
   因此 `incomplete` 判定在实际运行中不会误报；profile 内 9 个插件离线预检**全部 violation=0**。

## 6. 交付物

21 个文件（不含 node_modules）：

- `src/render-contract.js` — 三态判定（真实误报换来的括号深度规则）
- `src/source-utils.js` — 注释剥离 / 括号配对 / 嵌套函数体剔除 / 自身箭头识别
- `src/registry-audit.js` — 枚举式审计
- `src/event-vocab.js` — 44 类词汇表（**由内核生成**，`scripts/gen-event-vocab.mjs` 可重生成）
- `src/scan-source.js` — 离线源码扫描
- `src/plugin.js` — cordis 插件壳（只告警）
- `bin/dsh-contract-check.js` — CLI（`scan` / `vocab`，违规退出码 1）
- `test/` 6 个测试文件（68 用例）
- `scripts/verify-real.mjs`、`scripts/verify-vocab.mjs`、`scripts/gen-event-vocab.mjs`
- `README.md`（首段即声明"不检测恶意、不拦截"）、`LICENSE`、`package.json`、`cordis.patch.yml`

---

# 增补：GUI 状态标识（2026-09-19）

> Verdict: **green**（红绿完整 · 真实事故复现 · 客户端产物格式锁定 · 121/121）

## Spec 摘要

DSH 会话头部出现一个**小按钮**：颜色圆点 + 「体检」二字，悬停显示完整状态条，
点击立刻重跑一次体检（0.5 秒转圈动画）：
🟢 绿 = 0 违规 / 🟡 黄 = 有违规 / ⚪ 灰 = 尚未体检或判不准。
**界面上只有这一个元素** —— 不做 Tab、不做面板，体检不该要求用户主动去翻。
**token 中立不变**（GUI 不进模型上下文）。不做拦截、不做恶意检测。

> 2026-09-19 修订：初版做过「体检」Tab + 面板 + 「重新体检」按钮，
> 用户反馈"页签增加负担、点击体验不好"后删掉 Tab 与面板，
> 按钮保留并把点击反馈做足（最短 0.5s、转圈动画、定宽防抖动）。

## 红绿时间线

| 阶段 | 证据 |
|---|---|
| red | `status.test.js` + `http.test.js` 先写 16 用例 → 模块缺失红 → 放 stub 后**行为红 14 个** |
| **red（真实 bug）** | 实现后 2 挂：`/audit` 错误响应里 `error`（错误消息）被状态对象的 `error`（读取失败**计数**）覆盖成 `0` |
| green | 状态字段改名 `readError`→`readErrors` 消歧义；修测试自身计数器 bug → 112/112 |
| red → green | 插件路由注册测试（3 个）→ 红（新代码路径无测试）→ 115/115 |
| red → green | **移走 `lib/client.js` → 6 个产物测试全红** → 重建 → 6/6 绿 |
| green | 全量 **121/121**；`verify:real` 真实代码零误报；`verify:vocab` 一致；`package .` 自检 9 项 0 违规 |

## 实现要点（都来自读内核 + 读真实插件源码，不是猜）

- **路由**：`ctx.webServer.register({ kind: "exact", path, handler })`，handler 是 `(req, res)`（node:http）
- **客户端**：`window.__ModuleLoader__.load({ id, factory: (require) => … })` 包装；
  `slots.inject('conversation.session.header.utilities', () => slots.register({ name, id, order }, render))`
  （**不再**注册 `conversation.view` —— 那个 Tab 已按用户要求删除）
- **React 由宿主提供**：构建时 `external: ['react']` → 产物仅 **5.6 KB**
  （对照：stock-picks 795 KB / tip-jar 770 KB —— 它们把 React 打进去了）
- **不引入 typert/remote RPC**：客户端同源 `fetch` 自家路由即可
- **`files` 加上 `lib`**：否则 npm 包会漏发客户端产物（本工具自己检查的那类错误）

## 新增/变更文件

- `src/status.js`（状态判定 + 存储 + 体检互斥）· `src/http.js`（两条路由 handler）
- `src/client.js`（头部体检按钮）· `lib/client.js`（**构建产物，5.6 KB**）
- `scripts/build-client.mjs`（用本机已有 esbuild，不联网）
- `test/status.test.js` · `test/http.test.js` · `test/client-bundle.test.js`
- `src/plugin.js`（接线：状态存储 + 路由注册，webServer 为**软依赖**）
- `package.json`（`exports["./client"]`、`dsh.client`、`files` 加 `lib`、`build` 脚本）
- `README.md`（GUI 章节 + 状态语义 + 构建说明 + token 中立说明）

## 未验证 / 边界（如实）

1. **GUI 渲染未实机确认**：产物格式已锁定、宿主路由已单测，但**浏览器里的实际显示需要重启 DSH 后由使用者确认**。
2. `ctx.webServer` 缺失时静默降级（GUI 不可用，体检照常）——不视为问题、不告警。
3. 本地开发用 `link:` 时，**改客户端必须重跑 `npm run build`** 再重启。
4. 体检互斥是**进程内**的：多实例 DSH 各自独立（本机有端口守卫，不会双实例）。
5. 仍然**不检测恶意、不拦截**——颜色只表达"契约合规"，不表达"安全"。

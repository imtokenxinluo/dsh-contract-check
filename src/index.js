// index.js — dsh-contract-check 公共 API。
//
// 包默认导出是 cordis 插件（profile 的 bundle 机制会 import 它并挂载）；
// 命名导出是给离线使用/测试的纯逻辑。

export { classifyRenderSource } from "./render-contract.js";
export { auditRegistry } from "./registry-audit.js";
export { scanSource } from "./scan-source.js";
export { KNOWN_EVENT_TYPES, VOCAB_VERSION, checkEventType } from "./event-vocab.js";
export { auditCtx } from "./plugin.js";

import plugin from "./plugin.js";
export default plugin;

// 把某个插件登记进打赏罐赞助注册表的**纯逻辑**（无 IO，好测）。
//
// 打赏罐的 embed 组件读取链条是：
//   pluginId → plugin.contributorId → contributor → 打赏渠道
// 任何一环缺失，界面上就是"未登记/贡献者未登记"，而不是打赏条。
// 所以这里只做一件事：确保这条链的第一环在注册表里存在且指向正确的贡献者。

/** 本插件在打赏罐注册表里的 pluginId —— 必须与 client.js 传给 TipJarEmbed 的一致。 */
export const PLUGIN_ID = "dsh-contract-check";
/** 注册表里显示的名字（中文，给人看的）。 */
export const PLUGIN_NAME = "无耗检查";

/**
 * 计算登记后的新注册表（不改原对象）。
 * @returns {{ ok: true, data: object, action: "新增"|"更新", entry: object }
 *          | { ok: false, reason: string }}
 */
export function linkPlugin(data, opts = {}) {
  const pluginId = opts.pluginId || PLUGIN_ID;
  const name = opts.name || PLUGIN_NAME;
  const repo = opts.repo || null;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "注册表不是对象" };
  }
  if (!Array.isArray(data.plugins) || !Array.isArray(data.contributors)) {
    return { ok: false, reason: "注册表结构不符（缺少 plugins / contributors 数组）" };
  }

  // 贡献者必须已存在：那是用户自己的收款信息，工具不替用户创建。
  const contributorId = opts.contributorId || (data.contributors[0] && data.contributors[0].id);
  if (typeof contributorId !== "string" || contributorId === "") {
    return { ok: false, reason: "注册表里没有可用的 contributor" };
  }
  if (!data.contributors.some((c) => c && c.id === contributorId)) {
    return { ok: false, reason: `贡献者 ${contributorId} 不在注册表里` };
  }

  const entry = { pluginId, name, contributorId, sponsors: [] };
  if (repo) entry.upstream = { repo, author: contributorId };

  // 深拷贝一份再改，调用方传入的 data 不受影响（写盘失败时不至于脏内存）
  const next = JSON.parse(JSON.stringify(data));
  const at = next.plugins.findIndex((p) => p && p.pluginId === pluginId);
  let action;
  if (at >= 0) {
    next.plugins[at] = entry;
    action = "更新";
  } else {
    next.plugins.push(entry);
    action = "新增";
  }
  return { ok: true, data: next, action, entry };
}

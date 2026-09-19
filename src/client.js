// client.js — 会话头部的一个小按钮：颜色圆点 + 「体检」。
//
// 设计约束（用户定，2026-09-19）：
//   - **不要 Tab**：多一个页签就是多一份负担，体检不该要求用户主动去翻
//   - **要按钮**：想手动确认时点一下就行 —— 但点击的视觉反馈要做足
//     （悬停/按下/进行中/键盘聚焦，四态都要有），否则"点了没反应"最难受
//
// 颜色语义（与宿主侧 computeStatus 一致）：
//   🟢 绿 = 验过、0 违规      🟡 黄 = 验过、有违规      ⚪ 灰 = 没验到 / 全部判不准
//   悬停显示完整状态条：`无耗 · 检查 21 个插件 · 违规 0 · 不可判定 1`
//
// token 中立：这是浏览器侧代码，不进模型上下文。

import { createElement, useState, useEffect, useCallback } from 'react'

const STATUS_URL = '/contract-check/status'
const AUDIT_URL = '/contract-check/audit'

const COLORS = {
  green: 'var(--dsw-alias-state-success-primary, #22a06b)',
  yellow: 'var(--dsw-alias-state-warning-primary, #d9a300)',
  none: 'var(--dsw-alias-label-tertiary, #9aa0a6)'
}

const CSS = `
.cc-hbtn{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:7px;
  border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.3));background:transparent;
  color:inherit;font:inherit;font-size:12px;line-height:1.7;cursor:pointer;
  transition:background-color .15s ease,border-color .15s ease,transform .06s ease,opacity .15s ease;
  -webkit-user-select:none;user-select:none}
.cc-hbtn:hover{background:rgba(128,128,128,.10);border-color:rgba(128,128,128,.45)}
.cc-hbtn:active{background:rgba(128,128,128,.18);transform:scale(.96)}
.cc-hbtn:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary,#22a06b);outline-offset:2px}
.cc-hbtn[disabled]{opacity:.7;cursor:default;transform:none}

/* 定宽文字槽：「体检」和「体检中…」占同样宽度 —— 否则按钮忽宽忽窄，看着就是抖 */
.cc-hlabel{min-width:46px;text-align:center;display:inline-block}

.cc-hdot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 2px rgba(128,128,128,.12)}

/* 体检中：圆点变成转圈（实心圆自己转看不出来，所以换成圆环+高亮缺口） */
@keyframes cc-spin{to{transform:rotate(360deg)}}
.cc-spin{background:transparent !important;box-sizing:border-box;box-shadow:none;
  border:2px solid rgba(128,128,128,.28);
  border-top-color:var(--dsw-alias-state-success-primary,#22a06b);
  animation:cc-spin .5s linear infinite}
`

/** 体检本身可能几十毫秒就跑完，那样动画只会"闪一下"，比不动还难看。
 *  所以给忙碌态设最短展示时长：跑得再快，也让这半秒的动画转完。 */
const MIN_BUSY_MS = 500

function insertStyles(css) {
  const id = 'dsh-contract-check-styles'
  if (typeof document === 'undefined' || document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.textContent = css
  document.head.appendChild(el)
}

/** 读状态 + 手动体检。手动那一下只在用户点击时发生。 */
function useStatus() {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL, { cache: 'no-store' })
      setState(await res.json())
    } catch {
      /* 拿不到就保持上一次，不打扰用户 */
    }
  }, [])

  const runAudit = useCallback(async () => {
    setBusy(true)
    const started = Date.now()
    try {
      const res = await fetch(AUDIT_URL, { method: 'POST' })
      setState(await res.json())
    } catch {
      /* 失败不弹错：圆点退回上一次的颜色，再点一次即可 */
    } finally {
      // 体检可能几十毫秒就完事 —— 补足到最短展示时长，让动画完整转完这半秒
      const elapsed = Date.now() - started
      if (elapsed < MIN_BUSY_MS) await new Promise((r) => setTimeout(r, MIN_BUSY_MS - elapsed))
      setBusy(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  return { state, busy, runAudit }
}

function levelOf(state) {
  const lv = state && state.level
  return lv === 'green' || lv === 'yellow' ? lv : 'none'
}

/**
 * 状态圆点 + 「体检」按钮。
 * 颜色 = 结论，悬停 = 细节，点击 = 立刻重跑一次体检
 * （进行中：圆点转圈 + 文字换「体检中…」，且补足半秒最短时长，避免"闪一下"）。
 */
function HeaderBadge() {
  const { state, busy, runAudit } = useStatus()
  const level = levelOf(state)
  return createElement('button', {
    type: 'button',
    className: 'cc-hbtn',
    disabled: busy,
    onClick: runAudit,
    title: (state && state.detail) || '无耗检查：尚未体检'
  },
    createElement('span', {
      className: busy ? 'cc-hdot cc-spin' : 'cc-hdot',
      // 忙碌时不设内联底色：否则会盖掉 .cc-spin 的透明底（内联样式优先级更高）
      style: busy ? undefined : { background: COLORS[level] }
    }),
    createElement('span', { className: 'cc-hlabel' }, busy ? '体检中…' : '体检'))
}

export default {
  inject: ['slots'],
  apply(ctx) {
    const slots = ctx.slots
    if (!slots) return
    ctx.effect(() => insertStyles(CSS))

    slots.inject('conversation.session.header.utilities', function () {
      return slots.register(
        { name: 'conversation.session.header.utilities', id: 'contract-check-header', order: 35 },
        function () { return createElement(HeaderBadge) })
    })
  }
}

// client.js — 会话头部的一个状态圆点。**这是本插件唯一的界面**，刻意做到最小。
//
// 设计约束（用户定，2026-09-19）：
//   - 不要 Tab：体检不该要求用户主动去看（多一个页签就是多一份负担）
//   - 不要按钮：体检不该要求用户主动去点（点了没反馈，体验更差）
//   → 检查由插件自己跑（加载时 + 工具注册表变化时 + 首次会话流量兜底），
//     界面只负责"安静地把颜色摆在那儿"。
//
// 颜色语义（与宿主侧 computeStatus 一致）：
//   🟢 绿 = 验过、0 违规      🟡 黄 = 验过、有违规      ⚪ 灰 = 没验到 / 全部判不准
//   鼠标移上去显示完整状态条：`无耗 · 检查 21 个插件 · 违规 0 · 不可判定 1`
//
// token 中立：这是浏览器侧代码，不进模型上下文。

import { createElement, useState, useEffect, useCallback } from 'react'

const STATUS_URL = '/contract-check/status'

const COLORS = {
  green: 'var(--dsw-alias-state-success-primary, #22a06b)',
  yellow: 'var(--dsw-alias-state-warning-primary, #d9a300)',
  none: 'var(--dsw-alias-label-tertiary, #9aa0a6)'
}

const CSS = `
.cc-dot{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle;box-shadow:0 0 0 3px rgba(128,128,128,.10)}
.cc-dot:hover{box-shadow:0 0 0 3px rgba(128,128,128,.24)}
`

function insertStyles(css) {
  const id = 'dsh-contract-check-styles'
  if (typeof document === 'undefined' || document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.textContent = css
  document.head.appendChild(el)
}

/**
 * 只读状态。**没有任何写操作** —— 界面不做任何会改变状态的事。
 * 手动触发体检的能力保留在宿主侧的 `POST /contract-check/audit` 路由上，
 * 只是不再挂到界面上：检查本来就该自动发生。
 */
function useStatus() {
  const [state, setState] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL, { cache: 'no-store' })
      setState(await res.json())
    } catch {
      /* 拿不到就保持上一次 / 显示灰点，不打扰用户 */
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  return state
}

function levelOf(state) {
  const lv = state && state.level
  return lv === 'green' || lv === 'yellow' ? lv : 'none'
}

/**
 * 状态圆点：会话头部一个 10px 的小点。
 * 颜色 = 结论，悬停 = 细节。不点击、不弹窗、不占位。
 */
function StatusDot() {
  const state = useStatus()
  const level = levelOf(state)
  return createElement('span', {
    className: 'cc-dot',
    style: { background: COLORS[level] },
    title: (state && state.detail) || '无耗检查：尚未体检'
  })
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
        function () { return createElement(StatusDot) })
    })
  }
}

// client.js — DSH 界面里的「体检」Tab 与会话头部小徽章。
//
// 数据来源：**同源 fetch 我们自己的 HTTP 路由**（/contract-check/status 与 /audit），
// 因此不需要 typert/remote RPC 协议 —— 这是刻意的简化。
//
// token 中立不受影响：这是浏览器侧代码，不进模型上下文。
//
// 状态语义（与宿主侧 computeStatus 一致）：
//   绿 = 体检过、0 违规    黄 = 体检过、有违规    灰 = 尚未体检
//   `不可判定(unknown)` 不影响颜色 —— 那是"判不准"，不是"有问题"。

import { createElement, useState, useEffect, useCallback } from 'react'
import { TipJarEmbed } from 'dsh-tip-jar/embed'

const STATUS_URL = '/contract-check/status'
const AUDIT_URL = '/contract-check/audit'

const COLORS = {
  green: 'var(--dsw-alias-state-success-primary, #22a06b)',
  yellow: 'var(--dsw-alias-state-warning-primary, #d9a300)',
  none: 'var(--dsw-alias-label-tertiary, #9aa0a6)'
}

const WORD = { green: '🟢', yellow: '🟡', none: '⚪' }

const CSS = `
.cc-wrap{padding:20px 24px;font-size:13px;color:var(--dsw-alias-label-primary)}
.cc-card{max-width:560px;border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.25));border-radius:12px;padding:20px}
.cc-head{display:flex;align-items:center;gap:14px}
.cc-dot{width:44px;height:44px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 6px rgba(128,128,128,.08)}
.cc-title{font-size:20px;font-weight:700;line-height:1.2}
.cc-sub{font-size:12.5px;color:var(--dsw-alias-label-tertiary);margin-top:3px}
.cc-nums{display:flex;gap:18px;margin:16px 0 4px;flex-wrap:wrap}
.cc-num-v{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.cc-num-k{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.cc-btn{margin-top:16px;padding:8px 18px;border-radius:8px;border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.3));background:transparent;color:inherit;font-size:13px;cursor:pointer}
.cc-btn:hover{background:rgba(128,128,128,.08)}
.cc-btn[disabled]{opacity:.55;cursor:default}
.cc-err{margin-top:12px;color:var(--dsw-alias-state-error-primary,#d94a4a);font-size:12.5px;white-space:pre-wrap}
.cc-list{margin-top:16px;border-top:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.2));padding-top:12px}
.cc-item{padding:7px 0;border-bottom:1px dashed var(--dsw-alias-border-secondary,rgba(128,128,128,.15))}
.cc-item:last-child{border-bottom:none}
.cc-item-tool{font-weight:600}
.cc-item-why{color:var(--dsw-alias-label-secondary);font-size:12.5px;margin-top:2px}
.cc-hbtn{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.3));background:transparent;color:inherit;font-size:12px;cursor:pointer}
.cc-hdot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
`

function insertStyles(css) {
  const id = 'dsh-contract-check-styles'
  if (typeof document === 'undefined' || document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.textContent = css
  document.head.appendChild(el)
}

function fmtTime(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '尚未体检'
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 取状态 + 手动体检。两条路由都在我们自己插件上。 */
function useStatus() {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL, { cache: 'no-store' })
      setState(await res.json())
      setError(null)
    } catch (e) {
      setError(String((e && e.message) || e))
    }
  }, [])

  const runAudit = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch(AUDIT_URL, { method: 'POST' })
      const body = await res.json()
      setState(body)
      setError(body && body.ok === false ? String(body.error || '体检失败') : null)
    } catch (e) {
      setError(String((e && e.message) || e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  return { state, busy, error, refresh, runAudit }
}

function levelOf(state) {
  const lv = state && state.level
  return lv === 'green' || lv === 'yellow' ? lv : 'none'
}

function Num(props) {
  return createElement('div', null,
    createElement('div', { className: 'cc-num-v' }, String(props.value)),
    createElement('div', { className: 'cc-num-k' }, props.label))
}

/**
 * 支持作者（打赏罐嵌入组件）。
 *
 * 为什么先判 Remote 再渲染：`TipJarEmbed` 拿不到 Remote 时会**永远停在"加载中…"**
 * （它的 loading 分支是靠数据到达来翻页的）。社区里别人装了这个插件但没装打赏罐，
 * 就会看到一个永不消失的"加载中"——那比不显示更糟。所以这里先看命名空间在不在。
 * 打赏是自愿的、可选的：没装就静默不显示，不影响体检功能。
 */
function TipSupport(props) {
  const remote = props.ctx && props.ctx.remote
  const ns = remote && remote.namespaces && remote.namespaces.get
    ? remote.namespaces.get('tipJar')
    : null
  if (!ns) return null
  return createElement(TipJarEmbed, { ctx: props.ctx, pluginId: 'dsh-contract-check' })
}

/** 完整面板（会话「体检」Tab） */
function StatusPanel(props) {
  const { state, busy, error, runAudit } = useStatus()
  const level = levelOf(state)
  const violations = (state && state.violations) || 0
  const findings = (state && state.findings) || []

  return createElement('div', { className: 'cc-wrap' },
    createElement('div', { className: 'cc-card' },
      createElement('div', { className: 'cc-head' },
        createElement('div', { className: 'cc-dot', style: { background: COLORS[level] } }),
        createElement('div', null,
          createElement('div', { className: 'cc-title' },
            `${WORD[level]} 契约体检：${(state && state.label) || '尚未体检'}`),
          createElement('div', { className: 'cc-sub' },
            `${(state && state.detail) || '还没有跑过契约体检'}`
            + (state && state.probeNote ? ` · ${state.probeNote}` : '')
            + ` · 上次体检：${fmtTime(state && state.lastAuditAt)}`))),

      createElement('div', { className: 'cc-nums' },
        createElement(Num, { value: (state && state.checked) || 0, label: '无耗检查' }),
        createElement(Num, { value: violations, label: '违规' }),
        createElement(Num, { value: (state && state.unknown) || 0, label: '不可判定' })),

      createElement('button', {
        className: 'cc-btn',
        disabled: busy,
        onClick: runAudit
      }, busy ? '体检中…' : '重新体检'),

      error ? createElement('div', { className: 'cc-err' }, error) : null,

      findings.length > 0
        ? createElement('div', { className: 'cc-list' },
            findings.map((f, i) => createElement('div', { className: 'cc-item', key: `${f.tool}-${i}` },
              createElement('div', { className: 'cc-item-tool' }, `${f.status === 'violation' ? '⚠️ ' : ''}${f.tool}`),
              createElement('div', { className: 'cc-item-why' }, f.reason))))
        : null,

      createElement('div', { className: 'cc-sub', style: { marginTop: '14px' } },
        '只检查契约合规，不检测恶意、不拦截执行。'),

      createElement('div', { style: { marginTop: '14px' } },
        createElement(TipSupport, { ctx: props.ctx }))))
}

/** 会话头部的小徽章（圆点看颜色；鼠标移上去看状态条；点一下 = 手动体检） */
function HeaderBadge() {
  const { state, busy, runAudit } = useStatus()
  const level = levelOf(state)
  // 常显只有「体检」二字 + 一个颜色圆点，不占地方；
  // 悬停提示才展开完整状态：`无耗 · 检查 21 个插件 · 违规 0 · 不可判定 1`
  const title = state && state.detail ? state.detail : '尚未体检'
  return createElement('button', {
    className: 'cc-hbtn',
    title,
    disabled: busy,
    onClick: runAudit
  },
    createElement('span', { className: 'cc-hdot', style: { background: COLORS[level] } }),
    createElement('span', null, busy ? '体检中…' : '体检'))
}

export default {
  inject: ['slots'],
  apply(ctx) {
    const slots = ctx.slots
    if (!slots) return
    ctx.effect(() => insertStyles(CSS))

    slots.inject('conversation.view', function () {
      return slots.register(
        { name: 'conversation.view', id: 'contract-check', order: 30, label: '体检' },
        function () { return createElement(StatusPanel, { ctx: ctx }) })
    })

    slots.inject('conversation.session.header.utilities', function () {
      return slots.register(
        { name: 'conversation.session.header.utilities', id: 'contract-check-header', order: 35 },
        function () { return createElement(HeaderBadge) })
    })
  }
}

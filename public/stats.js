'use strict'

// 集計の画面。サーバーの /api/stats を期間ごとに読んで描く
const RANGE_KEY = 'kaji_stats_range'
const MONTHLY_OVER = 31 // これより長い期間は、日ごとではなく月ごとに出す

const $ = (sel) => document.querySelector(sel)

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'class') el.className = v
    else if (k === 'style') el.style.cssText = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c)
  return el
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}月${d}日(${WEEK[w]})`
}
function shiftDate(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
// 目盛り用の短い日付(11/3)
function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}
// 名前の前に付ける色の丸。color 0 は消した家族・だれか
const dot = (color) => h('span', { class: 'dot', style: `--c: var(--who-${color || 0})`, 'aria-hidden': 'true' })
const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0)

function getRange() {
  try {
    return localStorage.getItem(RANGE_KEY) || '30'
  } catch {
    return '30'
  }
}
function setRange(r) {
  try {
    localStorage.setItem(RANGE_KEY, r)
  } catch {}
}

let range = getRange()
let seq = 0 // 期間を続けて切り替えたとき、古い結果で上書きしないため

async function load() {
  const my = ++seq
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-checked', String(b.dataset.range === range))
  $('#loading').hidden = false
  $('#error').hidden = true
  try {
    const res = await fetch(`/api/stats?range=${range}`, { credentials: 'same-origin' })
    // 合言葉が無いときは、ボードの画面で入れてもらう
    if (res.status === 401) return location.replace('/')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `通信エラー (${res.status})`)
    if (my === seq) render(data)
  } catch (e) {
    if (my !== seq) return
    $('#error').textContent = e instanceof TypeError ? '通信できません' : e.message
    $('#error').hidden = false
  } finally {
    if (my === seq) $('#loading').hidden = true
  }
}

function render(data) {
  const s = data.summary
  const empty = s.total === 0
  $('#span').textContent = empty ? '' : `${formatDate(data.from)} 〜 ${formatDate(data.to)}`
  $('#empty').hidden = !empty
  $('#content').hidden = empty
  if (empty) return

  $('#rate').textContent = pct(s.done, s.total)
  $('#rate-sub').textContent = `${s.total}件のうち ${s.done}件`
  $('#days').textContent = s.days
  $('#once-sub').textContent = s.onceTotal ? `今日だけのタスク ${s.onceDone}/${s.onceTotal}` : ''

  renderTrend(data)
  renderPeople(data)
  renderChores(data)
}

// ---------- 日ごと(長い期間は月ごと)の完了 ----------

function trendBars(data) {
  const byDate = new Map(data.days.map((d) => [d.date, d]))
  const bars = []
  for (let d = data.from; d <= data.to; d = shiftDate(d, 1)) {
    const r = byDate.get(d)
    bars.push({ key: d, label: formatDate(d), total: r?.total ?? 0, done: r?.done ?? 0 })
  }
  if (bars.length <= MONTHLY_OVER) return { bars, monthly: false }
  const months = new Map()
  for (const b of bars) {
    const k = b.key.slice(0, 7)
    const m = months.get(k) ?? { key: k, label: `${Number(k.slice(5))}月`, total: 0, done: 0 }
    m.total += b.total
    m.done += b.done
    months.set(k, m)
  }
  return { bars: [...months.values()], monthly: true }
}

function renderTrend(data) {
  const { bars, monthly } = trendBars(data)
  const note = $('#trend-note')
  $('#trend-title').textContent = monthly ? '月ごとの完了' : '日ごとの完了'
  const hint = `棒をタップすると、その${monthly ? '月' : '日'}の数が出ます`
  note.textContent = hint
  let picked = null
  const show = (b, el) => {
    picked?.classList.remove('on')
    if (picked === el) {
      picked = null
      note.textContent = hint
      return
    }
    picked = el
    el.classList.add('on')
    note.textContent = b.total ? `${b.label} ${b.done}/${b.total}件(${pct(b.done, b.total)}%)` : `${b.label} 記録なし`
  }
  // 目盛りの日付は、はじめ・まんなか・おわりだけ
  const marks = new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1])
  $('#trend').replaceChildren(
    h(
      'div',
      { class: 'trend-bars' },
      bars.map((b) => {
        const el = h(
          'button',
          {
            type: 'button',
            class: b.total ? 'tbar' : 'tbar none',
            'aria-label': b.total ? `${b.label} ${pct(b.done, b.total)}%` : `${b.label} 記録なし`,
          },
          h('span', { class: 'tbar-fill', style: `height: ${b.total ? Math.max(pct(b.done, b.total), 2) : 0}%` }),
        )
        el.addEventListener('click', () => show(b, el))
        return el
      }),
    ),
    h(
      'div',
      { class: 'trend-axis' },
      bars.map((b, i) => h('span', {}, marks.has(i) ? (monthly ? b.label : shortDate(b.key)) : '')),
    ),
  )
}

// ---------- だれが やった? ----------

function renderPeople(data) {
  const rows = [...data.people]
  if (data.summary.unknown) rows.push({ name: 'だれか', count: data.summary.unknown, unknown: true })
  const max = Math.max(1, ...rows.map((r) => r.count))
  $('#people').replaceChildren(
    ...(rows.length
      ? rows.map((r) =>
          h(
            'li',
            { class: r.unknown ? 'hbar unknown' : 'hbar' },
            h('span', { class: 'hbar-name' }, r.unknown ? null : dot(r.color), r.name),
            h(
              'span',
              { class: 'hbar-track' },
              h('span', { class: 'hbar-fill', style: `width: ${(r.count / max) * 100}%; --c: var(--who-${r.unknown ? 0 : r.color || 0})` }),
            ),
            h('span', { class: 'hbar-num' }, `${r.count}回`),
          ),
        )
      : [h('li', { class: 'hint' }, 'まだ完了した家事がありません')]),
  )
}

// ---------- 毎日の家事 ----------

// ゲージの長さは完了の割合。その長さを、やった人ごとの回数の割合で分けて、人の色で塗る
// (一緒にやった日は、それぞれ 1 回と数える)
function choreGauge(t) {
  const parts = t.doers.map((d) => ({ color: d.color || 0, count: d.count }))
  if (t.unknown) parts.push({ color: 0, count: t.unknown })
  const sum = parts.reduce((a, p) => a + p.count, 0)
  const width = (t.done / (t.total || 1)) * 100
  return h(
    'span',
    { class: 'hbar-track stack' },
    sum
      ? parts.map((p) => h('span', { class: 'hbar-fill', style: `width: ${(width * p.count) / sum}%; --c: var(--who-${p.color})` }))
      : h('span', { class: 'hbar-fill', style: `width: ${width}%` }),
  )
}

function renderChores(data) {
  $('#chores').replaceChildren(
    ...data.chores.map((t) => {
      const who = t.doers.map((d) => h('span', { class: 'who' }, dot(d.color), `${d.name} ${d.count}`))
      if (t.unknown) who.push(h('span', { class: 'who' }, dot(0), `だれか ${t.unknown}`))
      return h(
        'li',
        { class: 'chore' },
        h(
          'div',
          { class: 'chore-head' },
          h('span', { class: 'chore-title' }, t.title, t.deleted ? h('span', { class: 'tag' }, '今はない') : null),
          h('span', { class: 'chore-rate' }, `${pct(t.done, t.total)}%`),
        ),
        choreGauge(t),
        h('p', { class: 'chore-sub' }, `${t.total}日のうち ${t.done}日`, who.length ? [' ・ ', ...who.flatMap((w, i) => (i ? [' / ', w] : [w]))] : ''),
      )
    }),
  )
}

for (const b of document.querySelectorAll('.seg button')) {
  b.addEventListener('click', () => {
    if (b.dataset.range === range) return
    range = b.dataset.range
    setRange(range)
    load()
  })
}

load()

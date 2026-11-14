'use strict'

// ごほうびの画面。サーバーの /api/rewards を読んで、家族ごとのポイントと使った記録を描く

const $ = (sel) => document.querySelector(sel)

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'class') el.className = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c)
  return el
}

// 名前の前に付ける色の丸。color 0 は消した家族
const dot = (color) => h('span', { class: 'dot', style: `--c: var(--who-${color || 0})`, 'aria-hidden': 'true' })
const yen = (points, rate) => `${(Math.max(points, 0) * rate).toLocaleString('ja-JP')}円ぶん`
function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}月${d}日`
}

let data = null // { yenPerPoint, points, uses }
let using = null // 「使う」のシートで選んでいる人

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  // 合言葉が無いときは、ボードの画面で入れてもらう
  if (res.status === 401) {
    location.replace('/')
    throw new Error('合言葉が必要です')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `通信エラー (${res.status})`)
  return json
}

function showError(e) {
  $('#error').textContent = e instanceof TypeError ? '通信できません' : e.message
  $('#error').hidden = false
}

async function load() {
  try {
    data = await api('GET', '/api/rewards')
    $('#error').hidden = true
    render()
  } catch (e) {
    showError(e)
  } finally {
    $('#loading').hidden = true
  }
}

function render() {
  const rate = data.yenPerPoint
  $('#rate').textContent = `1 ポイント = ${rate}円。ご飯のときに使えます`
  $('#content').hidden = false
  $('#people').replaceChildren(
    ...(data.points.length
      ? data.points.map((p) =>
          h(
            'li',
            { class: 'reward-person' },
            h(
              'div',
              { class: 'reward-head' },
              h('span', { class: 'reward-name' }, dot(p.color), p.name),
              h('span', { class: 'reward-total' }, String(p.balance), h('small', {}, 'ポイント')),
            ),
            h(
              'p',
              { class: 'reward-yen' },
              h('span', {}, yen(p.balance, rate)),
              h('button', { type: 'button', class: 'btn primary', disabled: p.balance < 1, onclick: () => openUse(p) }, '使う'),
            ),
            h(
              'p',
              { class: 'reward-sub' },
              [`今月 +${p.month}`, `家事 ${p.chores}`, `ありがとう ${p.thanks}`, p.used ? `使った ${p.used}` : null].filter(Boolean).join(' ・ '),
            ),
          ),
        )
      : [h('li', { class: 'hint' }, 'まだ だれもいません。ボードの右上の「私は…」から名前を追加してください')]),
  )
  $('#uses').replaceChildren(
    ...(data.uses.length
      ? data.uses.map((u) =>
          h(
            'li',
            { class: u.canceled ? 'use canceled' : 'use' },
            h(
              'span',
              { class: 'use-body' },
              h('span', { class: 'use-main' }, dot(u.color), `${u.name} · ${u.points} ポイント`),
              h('span', { class: 'use-meta' }, `${shortDate(u.date)} · ${yen(u.points, u.yenPerPoint)}${u.canceled ? ' · 取り消し済み' : ''}`),
            ),
            u.canceled ? null : h('button', { type: 'button', class: 'btn', onclick: () => cancelUse(u) }, '取り消す'),
          ),
        )
      : [h('li', { class: 'hint' }, 'まだ使った記録はありません')]),
  )
}

// ---------- 使う ----------

function openUse(p) {
  using = p
  $('#use-title').replaceChildren(dot(p.color), `${p.name} のポイントを使う`)
  $('#use-hint').textContent = `使えるのは ${p.balance} ポイントまで`
  $('#use-points').max = String(p.balance)
  $('#use-points').value = ''
  $('#use-error').textContent = ''
  renderUseYen()
  $('#use-dialog').showModal()
}

// 入れた数が使える範囲か
function usePoints() {
  const n = Number($('#use-points').value)
  return using && Number.isInteger(n) && n >= 1 && n <= using.balance ? n : null
}

function renderUseYen() {
  const n = Number($('#use-points').value) || 0
  $('#use-yen').textContent = yen(n, data.yenPerPoint)
  $('#use-ok').disabled = usePoints() == null
}

$('#use-points').addEventListener('input', renderUseYen)
$('#use-all').addEventListener('click', () => {
  $('#use-points').value = String(using.balance)
  renderUseYen()
})

$('#use-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const points = usePoints()
  if (points == null) return
  $('#use-ok').disabled = true
  try {
    data = await api('POST', '/api/rewards/uses', { memberId: using.id, points })
    $('#use-dialog').close()
    render()
  } catch (err) {
    $('#use-error').textContent = err instanceof TypeError ? '通信できません' : err.message
    renderUseYen()
  }
})

async function cancelUse(u) {
  if (!confirm(`${u.name} の ${u.points} ポイントを使った記録を取り消しますか?(ポイントは戻ります)`)) return
  try {
    data = await api('POST', `/api/rewards/uses/${u.id}/cancel`)
    render()
  } catch (e) {
    showError(e)
  }
}

// ---------- ダイアログ ----------

for (const btn of document.querySelectorAll('[data-close]')) btn.addEventListener('click', () => btn.closest('dialog').close())
// 外側(背景)をタップしたら閉じる
$('#use-dialog').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close()
})
$('#use-dialog').addEventListener('close', () => {
  using = null
})

// ほかの家族の操作を、開き直したときに反映する
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('#use-dialog').open) load()
})

load()

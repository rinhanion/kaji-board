'use strict'

const POLL_MS = 20_000
const UNDO_MS = 5_000
const ME_KEY = 'kaji_me'

const $ = (sel) => document.querySelector(sel)

let board = null
let version = 0 // 操作のたびに増やす。古いポーリング結果で上書きしないため
let pending = 0
let pendingCheckId = null // 名前を選ぶ前にタップした家事

// ---------- 小さな道具 ----------

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

function svgCheck() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  const p = document.createElementNS(ns, 'path')
  p.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5')
  svg.append(p)
  return svg
}

function getMe() {
  try {
    return Number(localStorage.getItem(ME_KEY)) || null
  } catch {
    return null
  }
}
function setMe(id) {
  try {
    if (id) localStorage.setItem(ME_KEY, String(id))
    else localStorage.removeItem(ME_KEY)
  } catch {}
}
function meMember() {
  const id = getMe()
  return board?.members.find((m) => m.id === id) ?? null
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}月${d}日(${WEEK[w]})`
}
function formatTime(ms) {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---------- 通信 ----------

class Unauthorized extends Error {}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    showLogin()
    throw new Unauthorized()
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `通信エラー (${res.status})`)
  return data
}

function setOffline(on) {
  $('#offline').hidden = !on
}

async function refresh() {
  if (pending > 0) return
  const v = version
  try {
    const data = await api('GET', '/api/board')
    setOffline(false)
    if (v === version && pending === 0) apply(data)
  } catch (e) {
    if (!(e instanceof Unauthorized)) setOffline(true)
  }
}

// 画面を先に変えてからサーバーに送る。返ってきた最新の状態で描き直す
async function mutate(optimistic, method, path, body) {
  const v = ++version
  pending++
  if (optimistic && board) {
    optimistic(board)
    render()
  }
  try {
    const data = await api(method, path, body)
    setOffline(false)
    if (v === version) apply(data)
    return data
  } catch (e) {
    if (e instanceof Unauthorized) return null
    alert(e.message)
    await refreshNow()
    return null
  } finally {
    pending--
  }
}

async function refreshNow() {
  try {
    apply(await api('GET', '/api/board'))
  } catch {}
}

function apply(data) {
  board = { date: data.date, members: data.members, tasks: data.tasks }
  if (getMe() && !meMember()) setMe(null) // 自分の名前が消されていたら選び直し
  render()
}

// ---------- 描画 ----------

function sortedTasks() {
  const undone = board.tasks.filter((t) => !t.doneAt)
  const done = board.tasks.filter((t) => t.doneAt)
  // 未完了: 毎日の家事(並び順) → 今日だけ(追加順)。完了: 終わった順
  undone.sort((a, b) => (a.kind === b.kind ? (a.kind === 'daily' ? a.sort - b.sort : a.createdAt - b.createdAt) : a.kind === 'daily' ? -1 : 1))
  done.sort((a, b) => a.doneAt - b.doneAt)
  return [...undone, ...done]
}

function render() {
  if (!board) return
  $('#date').textContent = formatDate(board.date)

  const total = board.tasks.length
  const doneCount = board.tasks.filter((t) => t.doneAt).length
  const label = $('#progress-label')
  label.replaceChildren('今日 ', h('span', { class: 'num' }, `${doneCount}/${total}`), ' 完了')
  $('#bar-fill').style.width = total ? `${(doneCount / total) * 100}%` : '0'
  const bar = $('.progress')
  bar.setAttribute('aria-valuemin', '0')
  bar.setAttribute('aria-valuemax', String(total))
  bar.setAttribute('aria-valuenow', String(doneCount))
  $('#all-done').hidden = !(total > 0 && doneCount === total)

  const me = meMember()
  const chip = $('#me-btn')
  chip.textContent = me ? me.name : '私は…'
  chip.classList.toggle('empty', !me)

  renderList()
  if ($('#me-dialog').open) renderMeList()
}

function renderList() {
  const list = $('#list')
  // 並び替えをなめらかに見せる(FLIP)
  const before = new Map()
  for (const li of list.children) before.set(li.dataset.id, li.getBoundingClientRect().top)

  list.replaceChildren(...sortedTasks().map(taskItem))

  for (const li of list.children) {
    const top = before.get(li.dataset.id)
    if (top == null) continue
    const dy = top - li.getBoundingClientRect().top
    if (!dy) continue
    li.style.transform = `translateY(${dy}px)`
    li.style.transition = 'none'
    requestAnimationFrame(() => {
      li.style.transition = 'transform 0.35s ease'
      li.style.transform = ''
    })
  }
}

function taskItem(t) {
  const done = !!t.doneAt
  const meta = done ? `${t.doneByName ?? 'だれか'} · ${formatTime(t.doneAt)}` : null
  const card = h(
    'button',
    {
      type: 'button',
      class: `card${done ? ' done' : ''}`,
      'aria-pressed': done ? 'true' : 'false',
      onclick: () => (done ? uncheck(t) : check(t)),
    },
    h('span', { class: 'check', 'aria-hidden': 'true' }, svgCheck()),
    h(
      'span',
      { class: 'card-body' },
      t.kind === 'once' ? h('span', { class: 'tag' }, '今日だけ') : null,
      h('span', { class: 'card-title' }, t.title),
      meta ? h('span', { class: 'card-meta' }, meta) : null,
    ),
  )
  const del =
    t.kind === 'once'
      ? h('button', { type: 'button', class: 'del', 'aria-label': `${t.title}を削除`, onclick: () => removeOnce(t) }, '×')
      : null
  return h('li', { class: `item${del ? ' has-del' : ''}`, 'data-id': String(t.id) }, card, del)
}

// ---------- 操作 ----------

function check(t) {
  const me = meMember()
  if (!me) {
    pendingCheckId = t.id
    openMeDialog()
    return
  }
  doCheck(t.id, me)
}

function doCheck(id, member) {
  const now = Date.now()
  mutate(
    (b) => {
      const x = b.tasks.find((y) => y.id === id)
      if (x && !x.doneAt) Object.assign(x, { doneAt: now, doneBy: member?.id ?? null, doneByName: member?.name ?? null })
    },
    'POST',
    `/api/tasks/${id}/check`,
    { memberId: member?.id ?? null },
  )
  const t = board.tasks.find((y) => y.id === id)
  showToast(`「${t?.title ?? ''}」完了`, () => doUncheck(id))
}

function uncheck(t) {
  const prev = { id: t.doneBy, name: t.doneByName }
  doUncheck(t.id)
  showToast(`「${t.title}」を未完了に戻しました`, () => doCheck(t.id, prev.id ? prev : null))
}

function doUncheck(id) {
  mutate(
    (b) => {
      const x = b.tasks.find((y) => y.id === id)
      if (x) Object.assign(x, { doneAt: null, doneBy: null, doneByName: null })
    },
    'POST',
    `/api/tasks/${id}/uncheck`,
  )
}

function removeOnce(t) {
  if (!confirm(`「${t.title}」を削除しますか?`)) return
  mutate((b) => (b.tasks = b.tasks.filter((x) => x.id !== t.id)), 'DELETE', `/api/tasks/${t.id}`)
}

// ---------- 元に戻す ----------

let toastTimer = null
let toastUndo = null

function showToast(msg, undo) {
  $('#toast-msg').textContent = msg
  toastUndo = undo
  const el = $('#toast')
  el.hidden = false
  // 連続タップでもアニメーションをやり直す
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.animation = ''
  clearTimeout(toastTimer)
  toastTimer = setTimeout(hideToast, UNDO_MS)
}
function hideToast() {
  $('#toast').hidden = true
  toastUndo = null
}
$('#toast-undo').addEventListener('click', () => {
  const fn = toastUndo
  hideToast()
  fn?.()
})

// ---------- ダイアログ ----------

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close())
}
// 背景タップで閉じる
for (const d of document.querySelectorAll('dialog.sheet')) {
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close()
  })
}

// 今日だけのタスク
$('#fab').addEventListener('click', () => {
  $('#add-title').value = ''
  $('#add-dialog').showModal()
  $('#add-title').focus()
})
$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const title = $('#add-title').value.trim()
  if (!title) return
  $('#add-dialog').close()
  const tempId = -Date.now()
  mutate(
    (b) => b.tasks.push({ id: tempId, title, kind: 'once', sort: 0, doneAt: null, doneBy: null, doneByName: null, createdAt: Date.now() }),
    'POST',
    '/api/tasks',
    { title, kind: 'once' },
  )
})

// 私は○○
function openMeDialog() {
  renderMeList()
  $('#member-add-name').value = ''
  $('#me-dialog').showModal()
}
$('#me-btn').addEventListener('click', openMeDialog)
$('#me-dialog').addEventListener('close', () => {
  pendingCheckId = null
})

function renderMeList() {
  const meId = getMe()
  const list = $('#me-list')
  if (!board.members.length) {
    list.replaceChildren(h('p', { class: 'hint' }, 'まだ だれもいません。下から名前を追加してください'))
    return
  }
  list.replaceChildren(
    ...board.members.map((m) =>
      h('button', { type: 'button', class: m.id === meId ? 'on' : '', onclick: () => chooseMe(m) }, m.name),
    ),
  )
}

function chooseMe(m) {
  setMe(m.id)
  const id = pendingCheckId
  pendingCheckId = null
  $('#me-dialog').close()
  render()
  if (id != null) doCheck(id, m)
}

$('#member-add-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = $('#member-add-name').value.trim()
  if (!name) return
  const data = await mutate(null, 'POST', '/api/members', { name })
  $('#member-add-name').value = ''
  // 自分の名前がまだなら、追加した人を自分にする
  if (data?.createdId && !getMe()) {
    const m = data.members.find((x) => x.id === data.createdId)
    if (m) chooseMe(m)
  } else {
    renderMeList()
  }
})

// ---------- 編集 ----------

$('#edit-btn').addEventListener('click', () => {
  renderEdit()
  $('#edit-dialog').showModal()
})

function dailyTasks() {
  return board.tasks.filter((t) => t.kind === 'daily').sort((a, b) => a.sort - b.sort)
}

function renderEdit() {
  const chores = dailyTasks()
  $('#edit-chores').replaceChildren(
    ...chores.map((t, i) =>
      h(
        'li',
        { class: 'edit-row' },
        h('input', {
          value: t.title,
          maxlength: '40',
          'aria-label': '家事の名前',
          enterkeyhint: 'done',
          onchange: (e) => renameChore(t, e.target),
          onkeydown: (e) => e.key === 'Enter' && e.target.blur(),
        }),
        h('button', { type: 'button', 'aria-label': '上へ', disabled: i === 0, onclick: () => moveChore(i, -1) }, '↑'),
        h('button', { type: 'button', 'aria-label': '下へ', disabled: i === chores.length - 1, onclick: () => moveChore(i, 1) }, '↓'),
        h('button', { type: 'button', class: 'x', 'aria-label': '削除', onclick: () => deleteChore(t) }, '×'),
      ),
    ),
  )
  $('#edit-members').replaceChildren(
    ...(board.members.length
      ? board.members.map((m) =>
          h(
            'li',
            { class: 'edit-row' },
            h('input', {
              value: m.name,
              maxlength: '12',
              'aria-label': '名前',
              enterkeyhint: 'done',
              onchange: (e) => renameMember(m, e.target),
              onkeydown: (e) => e.key === 'Enter' && e.target.blur(),
            }),
            h('button', { type: 'button', class: 'x', 'aria-label': '削除', onclick: () => deleteMember(m) }, '×'),
          ),
        )
      : [h('li', { class: 'hint' }, '名前は、右上の「私は…」から追加できます')]),
  )
}

async function editMutate(...args) {
  await mutate(...args)
  renderEdit()
}

function renameChore(t, input) {
  const title = input.value.trim()
  if (!title) {
    input.value = t.title
    return
  }
  if (title !== t.title) editMutate(null, 'PATCH', `/api/tasks/${t.id}`, { title })
}

function moveChore(i, dir) {
  const ids = dailyTasks().map((t) => t.id)
  ;[ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]
  editMutate(
    (b) => ids.forEach((id, n) => (b.tasks.find((t) => t.id === id).sort = n + 1)),
    'POST',
    '/api/tasks/reorder',
    { ids },
  )
  renderEdit()
}

function deleteChore(t) {
  if (!confirm(`毎日の家事「${t.title}」を削除しますか?`)) return
  editMutate((b) => (b.tasks = b.tasks.filter((x) => x.id !== t.id)), 'DELETE', `/api/tasks/${t.id}`)
}

$('#chore-add-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const title = $('#chore-add-title').value.trim()
  if (!title) return
  $('#chore-add-title').value = ''
  editMutate(null, 'POST', '/api/tasks', { title, kind: 'daily' })
})

function renameMember(m, input) {
  const name = input.value.trim()
  if (!name) {
    input.value = m.name
    return
  }
  if (name !== m.name) editMutate(null, 'PATCH', `/api/members/${m.id}`, { name })
}

function deleteMember(m) {
  if (!confirm(`「${m.name}」を削除しますか?(この人の記録は「だれか」になります)`)) return
  editMutate(null, 'DELETE', `/api/members/${m.id}`)
}

$('#reset-btn').addEventListener('click', () => {
  if (!confirm('毎日の家事のチェックを外し、今日だけのタスクを消します。よいですか?')) return
  editMutate(null, 'POST', '/api/reset')
})

// ---------- 合言葉 ----------

function showLogin() {
  $('#board').hidden = true
  $('#login').hidden = false
  $('#passphrase').focus()
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = e.target.querySelector('button')
  btn.disabled = true
  $('#login-error').textContent = ''
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: $('#passphrase').value }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      $('#login-error').textContent = data.error || 'うまくいきませんでした'
      return
    }
    $('#passphrase').value = ''
    await start()
  } finally {
    btn.disabled = false
  }
})

// ---------- 起動 ----------

async function start() {
  try {
    apply(await api('GET', '/api/board'))
  } catch (e) {
    if (e instanceof Unauthorized) return
    setOffline(true) // ポーリングでつながったら描かれる
  }
  $('#login').hidden = true
  $('#board').hidden = false
  if (board && !meMember()) openMeDialog()
}

setInterval(() => {
  if (!document.hidden) refresh()
}, POLL_MS)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh()
})
window.addEventListener('online', refresh)

start()

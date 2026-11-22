'use strict'

const POLL_MS = 20_000
const UNDO_MS = 5_000
const LONG_PRESS_MS = 500
const ME_KEY = 'kaji_me'
const HISTORY_DAYS = 7 // さかのぼれる日数(サーバーと合わせる)
const SHOPPING_MAX = 50 // 買い物メモの、まだ買っていない品の上限(サーバーと合わせる)

const $ = (sel) => document.querySelector(sel)

let board = null
let version = 0 // 操作のたびに増やす。古いポーリング結果で上書きしないため
let pending = 0
let pendingCheckId = null // 名前を選ぶ前にタップした家事
let popId = null // 直前にチェックした家事(印を弾ませる)
let thanksPopId = null // 直前に「ありがとう」を送った家事(ボタンを弾ませる)
let whoTaskId = null // 「だれがやった?」で選んでいる家事
let whoPicked = new Set() // 「だれがやった?」で選ばれている人の id
let pastDate = null // 見ている過去の日。null なら今日
let past = null // 過去の日の記録 { date, tasks }。読み込み中は null
let shopFlashId = null // 「もうあります」で光らせる買い物メモの品
let buyerItemId = null // 「だれが買った?」で選んでいる品
let ownerTaskId = null // 「だれの担当?」で選んでいる家事

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

// 家族の色の数(サーバーの COLOR_COUNT と同じ)。色は style.css の --who-N
const COLOR_COUNT = 6

// 名前の前に付ける色の丸。color 0 は消した家族・だれか
function dot(color) {
  return h('span', { class: 'dot', style: `--c: var(--who-${color || 0})`, 'aria-hidden': 'true' })
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
// iso の n 日あと(マイナスなら前)
function shiftDate(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400_000)
}
// その家事の日の終わり(翌日の JST 4:00)
function dayEnd(iso) {
  return Date.parse(shiftDate(iso, 1)) + (4 - 9) * 3600_000
}
function formatTime(ms) {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 見ている日の家事(今日か、過去の日)
function view() {
  return pastDate ? past : board
}
function viewTasks() {
  return view()?.tasks ?? []
}
function taskBase() {
  return pastDate ? '/api/history' : '/api/tasks'
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
    const date = pastDate
    const [data, hist] = await Promise.all([api('GET', '/api/board'), date ? api('GET', `/api/history/${date}`) : null])
    setOffline(false)
    if (v === version && pending === 0) {
      apply(data)
      if (hist) apply(hist)
    }
  } catch (e) {
    if (!(e instanceof Unauthorized)) setOffline(true)
  }
}

// 画面を先に変えてからサーバーに送る。返ってきた最新の状態で描き直す
async function mutate(optimistic, method, path, body) {
  const v = ++version
  pending++
  if (optimistic && view()) {
    optimistic(view())
    render()
  }
  try {
    const data = await api(method, path, body)
    setOffline(false)
    if (v === version) apply(data)
    // 過去の日の操作ではボード(ポイント)が返ってこないので、読み直す
    if (data.past)
      api('GET', '/api/board').then(
        (b) => v === version && apply(b),
        () => {},
      )
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
    if (pastDate) apply(await api('GET', `/api/history/${pastDate}`))
  } catch {}
}

function apply(data) {
  if (data.past) {
    // 返ってくるまでに別の日へ移っていたら捨てる
    if (data.past.date === pastDate) {
      past = data.past
      render()
    }
    return
  }
  board = {
    date: data.date,
    members: data.members,
    tasks: data.tasks,
    shopping: data.shopping ?? [],
    points: data.points ?? [],
    yenPerPoint: data.yenPerPoint ?? 10,
  }
  if (getMe() && !meMember()) setMe(null) // 自分の名前が消されていたら選び直し
  render()
}

// ---------- 描画 ----------

function sortedTasks() {
  const undone = viewTasks().filter((t) => !t.doneAt)
  const done = viewTasks().filter((t) => t.doneAt)
  // 未完了: 毎日の家事(並び順) → 今日だけ(追加順)。完了: 終わった順
  undone.sort((a, b) =>
    a.kind === b.kind
      ? a.kind === 'daily'
        ? a.sort - b.sort
        : a.createdAt - b.createdAt
      : a.kind === 'daily'
        ? -1
        : 1,
  )
  done.sort((a, b) => a.doneAt - b.doneAt)
  return [...undone, ...done]
}

function render() {
  if (!board) return
  const back = pastDate ? daysBetween(pastDate, board.date) : 0
  const dayName = back === 0 ? '今日' : back === 1 ? 'きのう' : `${back}日前`
  $('#date').textContent = formatDate(pastDate ?? board.date)
  $('#title').textContent = `${dayName}の家事`
  $('#prev-day').disabled = back >= HISTORY_DAYS
  $('#next-day').disabled = back === 0
  $('#board').classList.toggle('past', back > 0)
  $('#past-bar').hidden = back === 0
  $('#fab').hidden = back > 0
  $('#shop').hidden = back > 0 // 買い物メモは今の話なので、過去の日は隠す
  $('#no-record').hidden = !(back > 0 && past && past.tasks.length === 0)

  const tasks = viewTasks()
  const total = tasks.length
  const doneCount = tasks.filter((t) => t.doneAt).length
  const label = $('#progress-label')
  label.replaceChildren(`${dayName} `, h('span', { class: 'num' }, `${doneCount}/${total}`), ' 完了')
  $('#bar-fill').style.width = total ? `${(doneCount / total) * 100}%` : '0'
  const bar = $('.progress')
  bar.setAttribute('aria-valuemin', '0')
  bar.setAttribute('aria-valuemax', String(total))
  bar.setAttribute('aria-valuenow', String(doneCount))
  $('#all-done').hidden = !(total > 0 && doneCount === total)
  $('#long-hint').hidden = !(total > 0 && board.members.length >= 2)

  const me = meMember()
  const chip = $('#me-btn')
  chip.replaceChildren(...(me ? [dot(me.color), me.name] : ['私は…']))
  chip.classList.toggle('empty', !me)

  // 名前の下に、自分の使えるポイント。名前を選んでいない端末では、ごほうびへの入口だけ
  const mine = me && board.points.find((p) => p.id === me.id)
  $('#me-points-text').replaceChildren(
    ...(mine ? [h('span', { class: 'num' }, String(mine.balance)), 'pt'] : ['ごほうび']),
  )

  renderList()
  renderShop()
  if ($('#shop-dialog').open) renderShopList()
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
  // 過去の日に、その日が終わってから付けたチェックは時刻ではなく「あとから記録」と出す
  const late = done && pastDate && t.doneAt >= dayEnd(pastDate)
  const who = t.doers.length ? t.doers.flatMap((d, i) => [i ? '・' : '', dot(d.color), d.name]) : ['だれか']
  const meta = done ? [...who, ` · ${late ? 'あとから記録' : formatTime(t.doneAt)}`] : null
  // 「ありがとう」は、だれかが完了にした家事に、やった人以外が送れる
  const myId = getMe()
  const canThank = done && t.doers.length > 0 && !t.doers.some((d) => d.id === myId)
  const thanked = t.thanks.some((d) => d.id === myId)
  // 名前の上の札。担当は今日のボードだけ(過去の日の記録には担当を写さない)。完了しても残す
  const tags = []
  if (t.kind === 'once') tags.push(h('span', { class: 'tag' }, '今日だけ'))
  if (!pastDate && t.owner)
    tags.push(
      t.owner.id === myId
        ? h('span', { class: 'tag owner mine' }, 'あなたの担当')
        : h('span', { class: 'tag owner' }, '担当 ', dot(t.owner.color), t.owner.name),
    )
  const card = h(
    'button',
    {
      type: 'button',
      class: `card${done ? ' done' : ''}${done && t.id === popId ? ' pop' : ''}`,
      'aria-pressed': done ? 'true' : 'false',
      onclick: () => (done ? uncheck(t) : check(t)),
    },
    h('span', { class: 'check', 'aria-hidden': 'true' }, svgCheck()),
    h(
      'span',
      { class: 'card-body' },
      tags.length ? h('span', { class: 'card-tags' }, tags) : null,
      h('span', { class: 'card-title' }, t.title),
      meta ? h('span', { class: 'card-meta' }, meta) : null,
      done && t.thanks.length
        ? h(
            'span',
            { class: 'card-thanks' },
            'ありがとう ',
            t.thanks.flatMap((d, i) => [i ? '・' : '', dot(d.color), d.name]),
          )
        : null,
    ),
  )
  onLongPress(card, () => openWho(t.id))
  const del =
    t.kind === 'once' && !pastDate
      ? h(
          'button',
          { type: 'button', class: 'del', 'aria-label': `${t.title}を削除`, onclick: () => removeOnce(t) },
          '×',
        )
      : null
  const thanks = canThank
    ? h(
        'button',
        {
          type: 'button',
          class: `thanks${thanked && t.id === thanksPopId ? ' pop' : ''}`,
          'aria-pressed': thanked ? 'true' : 'false',
          'aria-label': `${t.title}に ありがとう`,
          onclick: () => toggleThanks(t, !thanked),
        },
        'ありがとう',
      )
    : null
  return h(
    'li',
    { class: `item${del ? ' has-del' : ''}${thanks ? ' has-thanks' : ''}`, 'data-id': String(t.id) },
    card,
    thanks,
    del,
  )
}

// ---------- 操作 ----------

function check(t) {
  const me = meMember()
  if (!me) {
    pendingCheckId = t.id
    openMeDialog()
    return
  }
  doCheck(t.id, [me])
}

function popCheck(id) {
  popId = id
  setTimeout(() => {
    if (popId === id) popId = null
  }, 600)
}

// doers: やった人 [{ id, name }](元に戻すときは前の人たち。だれもいなければ空)
function doCheck(id, doers) {
  const now = Date.now()
  popCheck(id)
  mutate(
    (b) => {
      const x = b.tasks.find((y) => y.id === id)
      if (x && !x.doneAt) Object.assign(x, { doneAt: now, doers })
    },
    'POST',
    `${taskBase()}/${id}/check`,
    { memberIds: doers.map((d) => d.id) },
  )
  const t = viewTasks().find((y) => y.id === id)
  showToast(`「${t?.title ?? ''}」完了`, () => doUncheck(id))
}

// 「ありがとう」を付ける・外す
function toggleThanks(t, on) {
  const me = meMember()
  if (!me) {
    openMeDialog()
    return
  }
  thanksPopId = on ? t.id : null
  if (on)
    setTimeout(() => {
      if (thanksPopId === t.id) thanksPopId = null
    }, 600)
  mutate(
    (b) => {
      const x = b.tasks.find((y) => y.id === t.id)
      if (!x) return
      x.thanks = x.thanks.filter((d) => d.id !== me.id)
      if (on) x.thanks.push({ id: me.id, name: me.name, color: me.color })
    },
    'POST',
    `${taskBase()}/${t.id}/thanks`,
    { memberId: me.id, on },
  )
}

function uncheck(t) {
  const prev = t.doers
  doUncheck(t.id)
  showToast(`「${t.title}」を未完了に戻しました`, () => doCheck(t.id, prev))
}

function doUncheck(id) {
  mutate(
    (b) => {
      const x = b.tasks.find((y) => y.id === id)
      if (x) Object.assign(x, { doneAt: null, doers: [], thanks: [] })
    },
    'POST',
    `${taskBase()}/${id}/uncheck`,
  )
}

// 代理で完了: やった人たちを指定して完了にする(完了済みなら人だけ付け替える)
function doAssign(id, doers, { toast = true } = {}) {
  const t = viewTasks().find((y) => y.id === id)
  if (!t) return
  const prev = { doneAt: t.doneAt, doers: t.doers }
  if (!t.doneAt) popCheck(id)
  const now = Date.now()
  mutate(
    (b) => {
      const x = b.tasks.find((y) => y.id === id)
      // やった人になった人の「ありがとう」は消える(サーバーと同じ)
      if (x)
        Object.assign(x, {
          doneAt: x.doneAt ?? now,
          doers,
          thanks: x.thanks.filter((d) => !doers.some((y) => y.id === d.id)),
        })
    },
    'POST',
    `${taskBase()}/${id}/check`,
    { memberIds: doers.map((d) => d.id), reassign: true },
  )
  if (!toast) return
  showToast(`「${t.title}」を${doers.map((d) => d.name).join('と')}が完了`, () => {
    if (!prev.doneAt) doUncheck(id)
    else doAssign(id, prev.doers, { toast: false })
  })
}

// 長押しで fn を呼ぶ。長押しのあとのクリック(チェック)は打ち消す
function onLongPress(el, fn) {
  let timer = null
  let fired = false
  let sx = 0
  let sy = 0
  const cancel = () => {
    clearTimeout(timer)
    timer = null
  }
  el.addEventListener('pointerdown', (e) => {
    fired = false
    sx = e.clientX
    sy = e.clientY
    timer = setTimeout(() => {
      timer = null
      fired = true
      navigator.vibrate?.(15)
      fn()
    }, LONG_PRESS_MS)
  })
  el.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel() // スクロールなら取りやめ
  })
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(type, cancel)
  el.addEventListener('contextmenu', (e) => e.preventDefault())
  el.addEventListener(
    'click',
    (e) => {
      if (!fired) return
      fired = false
      e.stopImmediatePropagation()
      e.preventDefault()
    },
    true,
  )
}

// 「だれが やった?」: 何人でも選べる。開いたときは、完了済みならその人たち、未完了なら自分を選んでおく
function openWho(id) {
  const t = viewTasks().find((y) => y.id === id)
  if (!t) return
  whoTaskId = id
  whoPicked = new Set(t.doneAt ? t.doers.map((d) => d.id) : meMember() ? [meMember().id] : [])
  $('#who-task').textContent = `「${t.title}」をやった人を選んでください(何人でも)`
  $('#who-undo').hidden = !t.doneAt
  renderWhoList()
  $('#who-dialog').showModal()
}

function renderWhoList() {
  $('#who-list').replaceChildren(
    ...(board.members.length
      ? board.members.map((m) =>
          h(
            'button',
            {
              type: 'button',
              class: whoPicked.has(m.id) ? 'on' : '',
              'aria-pressed': whoPicked.has(m.id) ? 'true' : 'false',
              onclick: () => {
                whoPicked.has(m.id) ? whoPicked.delete(m.id) : whoPicked.add(m.id)
                renderWhoList()
              },
            },
            svgCheck(),
            dot(m.color),
            m.name,
          ),
        )
      : [h('p', { class: 'hint' }, 'まだ だれもいません。右上の「私は…」から名前を追加してください')]),
  )
  $('#who-ok').disabled = !board.members.some((m) => whoPicked.has(m.id))
}

$('#who-ok').addEventListener('click', () => {
  const id = whoTaskId
  const doers = board.members
    .filter((m) => whoPicked.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, color: m.color }))
  $('#who-dialog').close()
  if (id != null && doers.length) doAssign(id, doers)
})

$('#who-undo').addEventListener('click', () => {
  const t = viewTasks().find((y) => y.id === whoTaskId)
  $('#who-dialog').close()
  if (t?.doneAt) uncheck(t)
})
$('#who-dialog').addEventListener('close', () => {
  whoTaskId = null
})

function removeOnce(t) {
  if (!confirm(`「${t.title}」を削除しますか?`)) return
  mutate((b) => (b.tasks = b.tasks.filter((x) => x.id !== t.id)), 'DELETE', `/api/tasks/${t.id}`)
}

// ---------- 買い物メモ ----------

// 同じ品か見る鍵(サーバーの cleanText → normalize と同じ 2 段)
function cleanName(s) {
  return s.trim().replace(/\s+/g, ' ')
}
function nameKey(s) {
  return cleanName(s).normalize('NFKC').trim()
}

function unbought() {
  return board.shopping.filter((s) => !s.boughtAt)
}

// 札を 2 行ぶんまで並べ、入りきらない分は「ほか N 件」にまとめる。
// 幅は端末で変わるので、いったん全部並べてから、置かれた位置(offsetTop)で行を数える
function renderShop() {
  const items = unbought()
  const box = $('#shop-items')
  $('#shop').classList.toggle('empty', items.length === 0)
  $('#shop-count').hidden = items.length === 0
  $('#shop-count').textContent = String(items.length) // 数の札はいつも全部の数
  if (!items.length) {
    box.replaceChildren('ほしいもの・切れたものを書いておくと、買い物に行く人が見られます')
    return
  }
  const pills = items.map((s) => h('span', { class: 'shop-pill' }, s.name))
  box.replaceChildren(...pills)
  const tops = [...new Set(pills.map((p) => p.offsetTop))].sort((a, b) => a - b)
  if (tops.length <= 2) return
  // 3 行目より下を外し、「ほか N 件」を足す。「ほか」が 3 行目に落ちたら、手前の札を 1 つずつ外す
  let shown = pills.filter((p) => p.offsetTop <= tops[1])
  const more = h('span', { class: 'shop-pill more' })
  for (;;) {
    more.textContent = `ほか ${items.length - shown.length} 件`
    box.replaceChildren(...shown, more)
    if (more.offsetTop <= tops[1] || shown.length === 0) break
    shown = shown.slice(0, -1)
  }
}
// 隠れている間(合言葉の入力中・過去の日)は幅が 0 で位置が取れないので、欄の幅が変わったとき
// (見えるようになったとき・向きを変えたとき)に測り直す。幅が前と同じなら何もしないので、
// 札の入れ替えで高さだけ変わっても呼び直さない。描き直しは 1 フレーム遅らせ、観察の最中に DOM を変えない
let shopWidth = 0
new ResizeObserver(([e]) => {
  const w = Math.round(e.contentRect.width)
  if (w === shopWidth) return
  shopWidth = w
  if (w > 0) requestAnimationFrame(() => board && renderShop())
}).observe($('#shop-items'))

function openShop() {
  $('#shop-msg').textContent = ''
  renderShopList()
  $('#shop-dialog').showModal() // 自分で focus() は呼ばない(見るだけのときにキーボードで一覧が隠れないように)
}
$('#shop').addEventListener('click', openShop)

function renderShopList() {
  $('#shop-long-hint').hidden = !(board.shopping.length > 0 && board.members.length >= 2)
  $('#shop-list').replaceChildren(...board.shopping.map(shopRow))
}

function shopRow(s) {
  const bought = !!s.boughtAt
  const temp = s.id < 0 // 送信中(サーバーの id がまだ無い)
  // 人が null(名前なし・消した家族)なら、まだ: 何も出さない、買った: 「買った」だけ
  const by = bought
    ? s.boughtBy
      ? [dot(s.boughtBy.color), s.boughtBy.name, ' が買った']
      : ['買った']
    : s.addedBy
      ? [dot(s.addedBy.color), s.addedBy.name]
      : []
  const li = h(
    'li',
    { class: `shop-row${bought ? ' bought' : ''}${s.id === shopFlashId ? ' flash' : ''}`, 'data-id': String(s.id) },
    h(
      'button',
      {
        type: 'button',
        class: 'box',
        'aria-pressed': bought ? 'true' : 'false',
        'aria-label': `${s.name}を買った`,
        disabled: temp,
        onclick: () => (bought ? unbuyItem(s) : buyItem(s)),
      },
      svgCheck(),
    ),
    h(
      'span',
      { class: 'name' },
      h('span', { class: 'label' }, s.name),
      by.length ? h('span', { class: 'by' }, by) : null,
    ),
    bought
      ? null
      : h(
          'button',
          { type: 'button', class: 'x', 'aria-label': `${s.name}を消す`, disabled: temp, onclick: () => removeItem(s) },
          svgCross(),
        ),
  )
  if (!temp) onLongPress(li, () => openBuyer(s.id))
  return li
}

function svgCross() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(ns, 'path')
  p.setAttribute('d', 'M6 6l12 12M18 6L6 18')
  svg.append(p)
  return svg
}

// すでにある品を少し光らせて「もうあります」と知らせる
function flashItem(id) {
  shopFlashId = id
  $('#shop-msg').textContent = 'もうあります'
  renderShopList()
  $(`#shop-list [data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
  setTimeout(() => {
    if (shopFlashId !== id) return
    shopFlashId = null
    $(`#shop-list [data-id="${id}"]`)?.classList.remove('flash')
  }, 700)
}

$('#shop-name').addEventListener('input', () => ($('#shop-msg').textContent = ''))

$('#shop-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const input = $('#shop-name')
  const name = cleanName(input.value)
  if (!name) return
  const key = nameKey(name)
  const same = unbought().find((s) => nameKey(s.name) === key)
  if (same) {
    flashItem(same.id)
    return
  }
  if (unbought().length >= SHOPPING_MAX) {
    $('#shop-msg').textContent = 'メモがいっぱいです。買ったものや要らないものを消してください'
    return
  }
  input.value = '' // フォーカスはそのまま。続けて書ける
  $('#shop-msg').textContent = ''
  const me = meMember()
  const tempId = -Date.now()
  const addedBy = me ? { id: me.id, name: me.name, color: me.color } : null
  mutate(
    (b) => {
      // まだの品の終わり(買った品の上)に足す
      const i = b.shopping.findIndex((s) => s.boughtAt)
      const item = { id: tempId, name, createdAt: Date.now(), boughtAt: null, addedBy, boughtBy: null }
      i < 0 ? b.shopping.push(item) : b.shopping.splice(i, 0, item)
    },
    'POST',
    '/api/shopping',
    { name, memberId: me?.id },
  )
})

// 並びは「まだの品(書いた順)→ 買った品(書いた順)」。サーバーと同じ
function sortShopping(b) {
  b.shopping.sort((x, y) => (!!x.boughtAt === !!y.boughtAt ? Math.abs(x.id) - Math.abs(y.id) : x.boughtAt ? 1 : -1))
}

function buyItem(s) {
  const me = meMember()
  const boughtBy = me ? { id: me.id, name: me.name, color: me.color } : null
  const now = Date.now()
  mutate(
    (b) => {
      const x = b.shopping.find((y) => y.id === s.id)
      if (x && !x.boughtAt) Object.assign(x, { boughtAt: now, boughtBy })
      sortShopping(b)
    },
    'POST',
    `/api/shopping/${s.id}/buy`,
    { memberId: me?.id },
  )
}

function unbuyItem(s) {
  // 同じ名前のまだの品があれば、戻さずに知らせる
  const same = unbought().find((y) => nameKey(y.name) === nameKey(s.name))
  if (same) {
    flashItem(same.id)
    return
  }
  mutate(
    (b) => {
      const x = b.shopping.find((y) => y.id === s.id)
      if (x) Object.assign(x, { boughtAt: null, boughtBy: null })
      sortShopping(b)
    },
    'POST',
    `/api/shopping/${s.id}/unbuy`,
  )
}

function removeItem(s) {
  if (!confirm(`「${s.name}」を消しますか?`)) return
  mutate((b) => (b.shopping = b.shopping.filter((x) => x.id !== s.id)), 'DELETE', `/api/shopping/${s.id}`)
}

// だれが買った?: 1 人だけ。名前をタップしたらすぐ決まって閉じる
function openBuyer(id) {
  const s = board.shopping.find((y) => y.id === id)
  if (!s) return
  buyerItemId = id
  $('#buyer-item').textContent = `「${s.name}」を買った人を選んでください`
  const current = s.boughtAt ? s.boughtBy?.id : null
  $('#buyer-list').replaceChildren(
    ...(board.members.length
      ? board.members.map((m) =>
          h(
            'button',
            { type: 'button', class: m.id === current ? 'on' : '', onclick: () => chooseBuyer(m) },
            dot(m.color),
            m.name,
          ),
        )
      : [h('p', { class: 'hint' }, 'まだ だれもいません。右上の「私は…」から名前を追加してください')]),
  )
  $('#buyer-dialog').showModal()
}
$('#buyer-dialog').addEventListener('close', () => {
  buyerItemId = null
})

function chooseBuyer(m) {
  const id = buyerItemId
  $('#buyer-dialog').close()
  const s = board.shopping.find((y) => y.id === id)
  if (!s) return
  if (s.boughtAt && s.boughtBy?.id === m.id) return // 今の買った人なら何もしない
  const boughtBy = { id: m.id, name: m.name, color: m.color }
  const now = Date.now()
  mutate(
    (b) => {
      const x = b.shopping.find((y) => y.id === id)
      if (x) Object.assign(x, { boughtAt: x.boughtAt ?? now, boughtBy })
      sortShopping(b)
    },
    'POST',
    `/api/shopping/${id}/buy`,
    { memberId: m.id, reassign: true },
  )
}

// ---------- 過去の日 ----------

// 今日から back 日前を見る(0 なら今日)
async function showDay(back) {
  if (!board) return
  back = Math.max(0, Math.min(HISTORY_DAYS, back))
  pastDate = back ? shiftDate(board.date, -back) : null
  past = null
  hideToast() // 元に戻すは、前に見ていた日の操作なので消す
  render()
  if (!pastDate) return
  try {
    apply(await api('GET', `/api/history/${pastDate}`))
  } catch (e) {
    if (!(e instanceof Unauthorized)) alert(e.message)
  }
}
function currentBack() {
  return pastDate ? daysBetween(pastDate, board.date) : 0
}
$('#prev-day').addEventListener('click', () => showDay(currentBack() + 1))
$('#next-day').addEventListener('click', () => showDay(currentBack() - 1))
$('#today-btn').addEventListener('click', () => showDay(0))

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
    (b) => b.tasks.push({ id: tempId, title, kind: 'once', sort: 0, doneAt: null, doers: [], createdAt: Date.now() }),
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
      h(
        'button',
        { type: 'button', class: m.id === meId ? 'on' : '', onclick: () => chooseMe(m) },
        dot(m.color),
        m.name,
      ),
    ),
  )
}

function chooseMe(m) {
  setMe(m.id)
  const id = pendingCheckId
  pendingCheckId = null
  $('#me-dialog').close()
  render()
  if (id != null) doCheck(id, [m])
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
    // 家事ごとに枠で囲み、名前の行の下に「担当」ボタンを置く(家族がいるときだけ)
    ...chores.map((t, i) =>
      h(
        'li',
        { class: 'edit-chore' },
        h(
          'div',
          { class: 'edit-row' },
          h('input', {
            value: t.title,
            maxlength: '40',
            'aria-label': '家事の名前',
            enterkeyhint: 'done',
            onchange: (e) => renameChore(t, e.target),
            onkeydown: (e) => e.key === 'Enter' && e.target.blur(),
          }),
          h(
            'button',
            { type: 'button', 'aria-label': '上へ', disabled: i === 0, onclick: () => moveChore(i, -1) },
            '↑',
          ),
          h(
            'button',
            { type: 'button', 'aria-label': '下へ', disabled: i === chores.length - 1, onclick: () => moveChore(i, 1) },
            '↓',
          ),
          h('button', { type: 'button', class: 'x', 'aria-label': '削除', onclick: () => deleteChore(t) }, '×'),
        ),
        board.members.length
          ? h(
              'div',
              { class: 'owner-line' },
              h(
                'button',
                {
                  type: 'button',
                  class: `owner-btn${t.owner ? '' : ' unset'}`,
                  'aria-label': t.owner ? `${t.title}の担当: ${t.owner.name}` : `${t.title}の担当を決める`,
                  onclick: () => openOwner(t.id),
                },
                ...(t.owner ? ['担当 ', dot(t.owner.color), t.owner.name] : ['担当を決める']),
              ),
            )
          : null,
      ),
    ),
  )
  $('#edit-members').replaceChildren(
    ...(board.members.length
      ? board.members.map((m) =>
          h(
            'li',
            { class: 'edit-member' },
            h(
              'div',
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
            h(
              'div',
              { class: 'swatches', role: 'radiogroup', 'aria-label': `${m.name}の色` },
              Array.from({ length: COLOR_COUNT }, (_, i) =>
                h('button', {
                  type: 'button',
                  role: 'radio',
                  style: `--c: var(--who-${i + 1})`,
                  'aria-label': `色 ${i + 1}`,
                  'aria-checked': String(m.color === i + 1),
                  onclick: () => recolorMember(m, i + 1),
                }),
              ),
            ),
          ),
        )
      : [h('li', { class: 'hint' }, '名前は、右上の「私は…」から追加できます')]),
  )
  $('#yen-input').value = String(board.yenPerPoint)
}

// だれの担当?: 1 人だけ。名前(または「なし」)をタップしたらすぐ決まって閉じる
function openOwner(id) {
  const t = board.tasks.find((y) => y.id === id)
  if (!t) return
  ownerTaskId = id
  const current = t.owner?.id ?? null
  const option = (on, onclick, ...children) =>
    h('button', { type: 'button', class: on ? 'on' : '', 'aria-pressed': on ? 'true' : 'false', onclick }, ...children)
  const none = option(current == null, () => chooseOwner(null), svgCheck(), 'なし')
  none.classList.add('none')
  $('#owner-task').textContent = t.title
  $('#owner-list').replaceChildren(
    none,
    ...board.members.map((m) => option(m.id === current, () => chooseOwner(m), svgCheck(), dot(m.color), m.name)),
  )
  $('#owner-dialog').showModal()
}
$('#owner-dialog').addEventListener('close', () => {
  ownerTaskId = null
})

// m が null なら担当を外す。過去の日を見ているときも、担当は今日の board に入れる
function chooseOwner(m) {
  const id = ownerTaskId
  $('#owner-dialog').close()
  const t = board.tasks.find((y) => y.id === id)
  if (!t) return
  if ((t.owner?.id ?? null) === (m?.id ?? null)) return // 今の担当と同じなら何もしない
  const owner = m ? { id: m.id, name: m.name, color: m.color } : null
  editMutate(
    () => {
      const x = board.tasks.find((y) => y.id === id)
      if (x) x.owner = owner
    },
    m ? 'POST' : 'DELETE',
    `/api/tasks/${id}/owner`,
    m ? { memberId: m.id } : undefined,
  )
  // 返事を待たずに、設定の担当ボタンも先に描き直す(recolorMember と同じ)
  renderEdit()
}

$('#yen-input').addEventListener('change', (e) => {
  const yen = Number(e.target.value)
  if (!Number.isInteger(yen) || yen < 1 || yen > 1000) {
    e.target.value = String(board.yenPerPoint)
    return
  }
  if (yen !== board.yenPerPoint) editMutate(null, 'PATCH', '/api/settings', { yenPerPoint: yen })
})
$('#yen-input').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur())

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
    (b) => {
      ids.forEach((id, n) => {
        b.tasks.find((t) => t.id === id).sort = n + 1
      })
    },
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

function recolorMember(m, color) {
  if (color === m.color) return
  editMutate(
    // 家族は過去の日を見ているときも board にある
    () => {
      const x = board.members.find((y) => y.id === m.id)
      if (x) x.color = color
    },
    'PATCH',
    `/api/members/${m.id}`,
    { color },
  )
  renderEdit()
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

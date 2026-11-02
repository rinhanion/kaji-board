import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database
  FAMILY_PASSPHRASE: string
}

const AUTH_COOKIE = 'kaji_auth'
const TITLE_MAX = 40
const NAME_MAX = 12

// 家事の「日付」。JST の 4:00 で日が変わる(JST = UTC+9、そこから 4 時間戻す)
export function boardDate(now = Date.now()): string {
  return new Date(now + (9 - 4) * 3600_000).toISOString().slice(0, 10)
}

// 全角・半角の違いや前後の空白で合言葉がずれないようにそろえる
function normalize(s: string): string {
  return s.normalize('NFKC').trim()
}

// Cookie に入れる値。合言葉そのものではなく、合言葉を鍵にした HMAC を入れる。
// 合言葉を変えると全端末の Cookie が無効になる
async function authToken(passphrase: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(normalize(passphrase)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('kaji-board-auth-v1')))
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// 毎日の家事のチェックを外し、今日だけのタスクを消す。
// archiveDate があれば、消す前にその日付で history に写しておく(同じ日付をもう一度写したら上書き)
async function resetBoard(db: D1Database, date: string, archiveDate?: string) {
  const archive = archiveDate
    ? [
        db
          .prepare(
            `INSERT INTO history (date, task_id, title, kind, sort, created_at, done_by, done_by_name, done_at)
             SELECT ?1, t.id, t.title, t.kind, t.sort, t.created_at, t.done_by, m.name, t.done_at
             FROM tasks t LEFT JOIN members m ON m.id = t.done_by
             WHERE true
             ON CONFLICT (date, task_id) DO UPDATE SET
               title = excluded.title, done_by = excluded.done_by, done_by_name = excluded.done_by_name, done_at = excluded.done_at`,
          )
          .bind(archiveDate),
      ]
    : []
  await db.batch([
    ...archive,
    db.prepare("UPDATE tasks SET done_by = NULL, done_at = NULL WHERE kind = 'daily'"),
    db.prepare("DELETE FROM tasks WHERE kind = 'once'"),
    db
      .prepare("INSERT INTO meta (key, value) VALUES ('board_date', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(date),
  ])
}

// 日付が変わっていたらリセットする。Cron が動かなかった日も、最初のアクセスで追いつく。
// board_date の更新に成功した 1 リクエストだけがリセットするので、同時アクセスでも二重に走らない
async function ensureToday(db: D1Database) {
  const today = boardDate()
  const prev = await db.prepare("SELECT value FROM meta WHERE key = 'board_date'").first<{ value: string }>()
  if (prev?.value === today) return
  const res = await db
    .prepare(
      "INSERT INTO meta (key, value) VALUES ('board_date', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE meta.value <> ?1",
    )
    .bind(today)
    .run()
  if (res.meta.changes > 0) await resetBoard(db, today, prev?.value)
}

async function getBoard(db: D1Database) {
  const [members, tasks] = await db.batch([
    db.prepare('SELECT id, name FROM members ORDER BY sort, id'),
    db.prepare(
      `SELECT t.id, t.title, t.kind, t.sort, t.done_by AS doneBy, m.name AS doneByName, t.done_at AS doneAt, t.created_at AS createdAt
       FROM tasks t LEFT JOIN members m ON m.id = t.done_by
       ORDER BY t.kind = 'once', t.sort, t.id`,
    ),
  ])
  return { date: boardDate(), members: members.results, tasks: tasks.results }
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s+/g, ' ')
  if (!s || [...s].length > max) return null
  return s
}

const app = new Hono<{ Bindings: Bindings }>()

app.post('/api/login', async (c) => {
  const expected = c.env.FAMILY_PASSPHRASE
  if (!expected) return c.json({ error: '合言葉がサーバーに設定されていません' }, 500)
  const body = await c.req.json<{ passphrase?: string }>().catch(() => ({}) as { passphrase?: string })
  const token = await authToken(body.passphrase ?? '')
  if (!sameString(token, await authToken(expected))) {
    // 総当たりを少しだけ遅らせる
    await new Promise((r) => setTimeout(r, 800))
    return c.json({ error: '合言葉がちがいます' }, 401)
  }
  setCookie(c, AUTH_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    maxAge: 400 * 24 * 3600, // ブラウザが許す最長(約 400 日)
  })
  return c.json({ ok: true })
})

// /api/login 以外は合言葉の Cookie が必要
app.use('/api/*', async (c, next) => {
  const cookie = getCookie(c, AUTH_COOKIE) ?? ''
  if (!c.env.FAMILY_PASSPHRASE || !sameString(cookie, await authToken(c.env.FAMILY_PASSPHRASE))) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await ensureToday(c.env.DB)
  await next()
})

app.get('/api/board', async (c) => c.json(await getBoard(c.env.DB)))

app.post('/api/tasks/:id/check', async (c) => {
  const body = await c.req.json<{ memberId?: number; reassign?: boolean }>().catch(() => ({}) as { memberId?: number; reassign?: boolean })
  const memberId = Number(body.memberId) || null
  const id = Number(c.req.param('id'))
  if (body.reassign) {
    // 代理で完了: 「○○さんがやった」と、やった人を指定する(完了済みなら人だけ付け替える)
    await c.env.DB.prepare('UPDATE tasks SET done_by = ?1, done_at = COALESCE(done_at, ?2) WHERE id = ?3')
      .bind(memberId, Date.now(), id)
      .run()
  } else {
    // 先にチェックした人を優先する(すでに完了なら上書きしない)
    await c.env.DB.prepare('UPDATE tasks SET done_by = ?1, done_at = ?2 WHERE id = ?3 AND done_at IS NULL')
      .bind(memberId, Date.now(), id)
      .run()
  }
  return c.json(await getBoard(c.env.DB))
})

app.post('/api/tasks/:id/uncheck', async (c) => {
  await c.env.DB.prepare('UPDATE tasks SET done_by = NULL, done_at = NULL WHERE id = ?1')
    .bind(Number(c.req.param('id')))
    .run()
  return c.json(await getBoard(c.env.DB))
})

app.post('/api/tasks', async (c) => {
  const body = await c.req.json<{ title?: string; kind?: string }>().catch(() => ({}) as Record<string, string>)
  const title = cleanText(body.title, TITLE_MAX)
  const kind = body.kind === 'daily' ? 'daily' : 'once'
  if (!title) return c.json({ error: `1〜${TITLE_MAX}文字で入力してください` }, 400)
  await c.env.DB.prepare(
    'INSERT INTO tasks (title, kind, sort, created_at) VALUES (?1, ?2, (SELECT COALESCE(MAX(sort), 0) + 1 FROM tasks WHERE kind = ?2), ?3)',
  )
    .bind(title, kind, Date.now())
    .run()
  return c.json(await getBoard(c.env.DB))
})

app.patch('/api/tasks/:id', async (c) => {
  const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string })
  const title = cleanText(body.title, TITLE_MAX)
  if (!title) return c.json({ error: `1〜${TITLE_MAX}文字で入力してください` }, 400)
  await c.env.DB.prepare('UPDATE tasks SET title = ?1 WHERE id = ?2').bind(title, Number(c.req.param('id'))).run()
  return c.json(await getBoard(c.env.DB))
})

app.delete('/api/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?1').bind(Number(c.req.param('id'))).run()
  return c.json(await getBoard(c.env.DB))
})

// 毎日の家事の並び順。ids の順に sort を振り直す
app.post('/api/tasks/reorder', async (c) => {
  const body = await c.req.json<{ ids?: unknown }>().catch(() => ({}) as { ids?: unknown })
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: 'ids が必要です' }, 400)
  const db = c.env.DB
  await db.batch(
    body.ids.map((id, i) => db.prepare("UPDATE tasks SET sort = ?1 WHERE id = ?2 AND kind = 'daily'").bind(i + 1, Number(id))),
  )
  return c.json(await getBoard(db))
})

// ---------- 過去の日 ----------

// 画面でさかのぼれる日数
const HISTORY_DAYS = 7

// 見られる過去の日付か(昨日〜7 日前)
function pastDateOk(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const oldest = boardDate(Date.now() - HISTORY_DAYS * 86400_000)
  return date >= oldest && date < boardDate()
}

async function getHistory(db: D1Database, date: string) {
  const tasks = await db
    .prepare(
      `SELECT h.id, h.title, h.kind, h.sort, h.done_by AS doneBy, COALESCE(m.name, h.done_by_name) AS doneByName,
         h.done_at AS doneAt, h.created_at AS createdAt
       FROM history h LEFT JOIN members m ON m.id = h.done_by
       WHERE h.date = ?1
       ORDER BY h.kind = 'once', h.sort, h.id`,
    )
    .bind(date)
    .all()
  return { past: { date, tasks: tasks.results } }
}

// 書き換える記録の日付。見られない日の記録なら null
async function historyDate(db: D1Database, id: number): Promise<string | null> {
  const row = await db.prepare('SELECT date FROM history WHERE id = ?1').bind(id).first<{ date: string }>()
  return row && pastDateOk(row.date) ? row.date : null
}

app.get('/api/history/:date', async (c) => {
  const date = c.req.param('date')
  if (!pastDateOk(date)) return c.json({ error: `見られるのは ${HISTORY_DAYS} 日前までです` }, 400)
  return c.json(await getHistory(c.env.DB, date))
})

// 過去の日の家事を完了にする。中身は /api/tasks/:id/check と同じ
app.post('/api/history/:id/check', async (c) => {
  const body = await c.req.json<{ memberId?: number; reassign?: boolean }>().catch(() => ({}) as { memberId?: number; reassign?: boolean })
  const memberId = Number(body.memberId) || null
  const id = Number(c.req.param('id'))
  const db = c.env.DB
  const date = await historyDate(db, id)
  if (!date) return c.json({ error: `書き換えられるのは ${HISTORY_DAYS} 日前までです` }, 400)
  const name = '(SELECT name FROM members WHERE id = ?1)'
  await db
    .prepare(
      body.reassign
        ? `UPDATE history SET done_by = ?1, done_by_name = ${name}, done_at = COALESCE(done_at, ?2) WHERE id = ?3`
        : `UPDATE history SET done_by = ?1, done_by_name = ${name}, done_at = ?2 WHERE id = ?3 AND done_at IS NULL`,
    )
    .bind(memberId, Date.now(), id)
    .run()
  return c.json(await getHistory(db, date))
})

app.post('/api/history/:id/uncheck', async (c) => {
  const id = Number(c.req.param('id'))
  const db = c.env.DB
  const date = await historyDate(db, id)
  if (!date) return c.json({ error: `書き換えられるのは ${HISTORY_DAYS} 日前までです` }, 400)
  await db.prepare('UPDATE history SET done_by = NULL, done_by_name = NULL, done_at = NULL WHERE id = ?1').bind(id).run()
  return c.json(await getHistory(db, date))
})

app.post('/api/members', async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string })
  const name = cleanText(body.name, NAME_MAX)
  if (!name) return c.json({ error: `1〜${NAME_MAX}文字で入力してください` }, 400)
  const row = await c.env.DB.prepare(
    'INSERT INTO members (name, sort) VALUES (?1, (SELECT COALESCE(MAX(sort), 0) + 1 FROM members)) RETURNING id',
  )
    .bind(name)
    .first<{ id: number }>()
  return c.json({ ...(await getBoard(c.env.DB)), createdId: row?.id })
})

app.patch('/api/members/:id', async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string })
  const name = cleanText(body.name, NAME_MAX)
  if (!name) return c.json({ error: `1〜${NAME_MAX}文字で入力してください` }, 400)
  await c.env.DB.prepare('UPDATE members SET name = ?1 WHERE id = ?2').bind(name, Number(c.req.param('id'))).run()
  return c.json(await getBoard(c.env.DB))
})

app.delete('/api/members/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = c.env.DB
  await db.batch([
    db.prepare('UPDATE tasks SET done_by = NULL WHERE done_by = ?1').bind(id),
    db.prepare('DELETE FROM members WHERE id = ?1').bind(id),
  ])
  return c.json(await getBoard(db))
})

// 手動リセット(編集画面のボタン、動作確認用)
app.post('/api/reset', async (c) => {
  await resetBoard(c.env.DB, boardDate())
  return c.json(await getBoard(c.env.DB))
})

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404))

export default {
  fetch: app.fetch,
  // 毎朝 4:00 JST(= 19:00 UTC)の Cron。日付が変わっていればリセットする
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(ensureToday(env.DB))
  },
} satisfies ExportedHandler<Bindings>

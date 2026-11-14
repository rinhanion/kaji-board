import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test'
import worker, { boardDate } from '../src/index'

const DAY = 86400_000

export const today = () => boardDate()
export const daysAgo = (n: number) => boardDate(Date.now() - n * DAY)

// 毎回同じ状態からはじめる。家族 2 人、毎日の家事 2 つ、board_date は今日
export async function seed() {
  const db = env.DB
  await db.batch([
    db.prepare('DELETE FROM history_doers'),
    db.prepare('DELETE FROM history'),
    db.prepare('DELETE FROM tasks'),
    db.prepare('DELETE FROM members'),
    db.prepare('DELETE FROM meta'),
    db.prepare("INSERT INTO members (id, name, sort, color) VALUES (1, 'ママ', 1, 1), (2, 'パパ', 2, 2)"),
    db.prepare("INSERT INTO tasks (id, title, kind, sort, created_at) VALUES (1, '洗濯', 'daily', 1, 0), (2, '食器洗い', 'daily', 2, 0)"),
    db.prepare("INSERT INTO meta (key, value) VALUES ('board_date', ?1)").bind(today()),
  ])
}

// Worker の fetch を直接呼ぶ
export async function request(method: string, path: string, init: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {}
  if (init.cookie) headers.cookie = init.cookie
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const ctx = createExecutionContext()
  const res = await worker.fetch(
    new Request(`http://kaji.test${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return res
}

let cookie: string | null = null

// 正しい合言葉でログインした Cookie
export async function authCookie(): Promise<string> {
  if (!cookie) {
    const res = await request('POST', '/api/login', { body: { passphrase: env.FAMILY_PASSPHRASE } })
    cookie = res.headers.get('set-cookie')!.split(';')[0]
  }
  return cookie
}

type Task = { id: number; title: string; kind: string; doers: { id: number; name: string; color: number }[]; doneAt: number | null }

// ログイン済みで API を呼び、JSON を返す
export async function api<T = { date: string; tasks: Task[]; past?: { date: string; tasks: Task[] }; error?: string }>(
  method: string,
  path: string,
  body?: unknown,
) {
  const res = await request(method, path, { body, cookie: await authCookie() })
  return { status: res.status, data: (await res.json()) as T }
}

export async function runCron() {
  const ctx = createExecutionContext()
  await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: '0 19 * * *' }), env, ctx)
  await waitOnExecutionContext(ctx)
}

// やった人の名前の一覧
export const names = (t: Task) => t.doers.map((d) => d.name)

export function find(tasks: Task[] | undefined, title: string) {
  const t = tasks?.find((x) => x.title === title)
  if (!t) throw new Error(`「${title}」が見つかりません`)
  return t
}

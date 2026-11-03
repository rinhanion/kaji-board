import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { boardDate } from '../src/index'
import { api, daysAgo, find, names, request, runCron, seed, today } from './helpers'

beforeEach(seed)

// 日付が変わった状態をつくる: board_date を前の日に戻す
async function rewindBoardDate(date: string) {
  await env.DB.prepare("UPDATE meta SET value = ?1 WHERE key = 'board_date'").bind(date).run()
}

// その日の記録。name はやった人の名前を「・」でつないだもの(いなければ null)
async function historyRows(date: string) {
  const { results } = await env.DB.prepare(
    `SELECT h.title, h.kind, (SELECT group_concat(d.name, '・') FROM history_doers d WHERE d.history_id = h.id) AS name, h.done_at AS doneAt
     FROM history h WHERE h.date = ?1 ORDER BY h.id`,
  )
    .bind(date)
    .all<{ title: string; kind: string; name: string | null; doneAt: number | null }>()
  return results
}

describe('家事の日付', () => {
  it('JST の 4:00 で日が変わる', () => {
    expect(boardDate(Date.parse('2026-11-02T18:59:59Z'))).toBe('2026-11-02') // JST 11/3 3:59
    expect(boardDate(Date.parse('2026-11-02T19:00:00Z'))).toBe('2026-11-03') // JST 11/3 4:00
  })

  it('JST の 0:00〜3:59 は前の日のまま', () => {
    expect(boardDate(Date.parse('2026-11-02T15:30:00Z'))).toBe('2026-11-02') // JST 11/3 0:30
  })
})

describe('合言葉', () => {
  it('Cookie がなければ API は 401', async () => {
    const res = await request('GET', '/api/board')
    expect(res.status).toBe(401)
  })

  it('合言葉がちがえば 401 で、Cookie は出さない', async () => {
    const res = await request('POST', '/api/login', { body: { passphrase: 'まちがい' } })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('全角や前後の空白がちがっても同じ合言葉とみなす', async () => {
    const res = await request('POST', '/api/login', { body: { passphrase: ' ｔｅｓｔ－ｐａｓｓｐｈｒａｓｅ ' } })
    expect(res.status).toBe(200)
  })

  it('正しい合言葉の Cookie で今日の家事が見られる', async () => {
    const { status, data } = await api('GET', '/api/board')
    expect(status).toBe(200)
    expect(data.date).toBe(today())
    expect(data.tasks.map((t) => t.title)).toEqual(['洗濯', '食器洗い'])
  })
})

describe('今日の家事', () => {
  it('先にチェックした人を優先する', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    const { data } = await api('POST', '/api/tasks/1/check', { memberId: 2 })
    expect(names(find(data.tasks, '洗濯'))).toEqual(['ママ'])
  })

  it('代理で完了にすると、やった人を付け替える', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    const { data } = await api('POST', '/api/tasks/1/check', { memberId: 2, reassign: true })
    expect(names(find(data.tasks, '洗濯'))).toEqual(['パパ'])
  })

  it('未完了に戻せる', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    const { data } = await api('POST', '/api/tasks/1/uncheck')
    expect(find(data.tasks, '洗濯').doneAt).toBeNull()
    expect(names(find(data.tasks, '洗濯'))).toEqual([])
  })
})

describe('複数人でやった', () => {
  it('長押しで選んだ人たち全員で完了にできる', async () => {
    const { data } = await api('POST', '/api/tasks/1/check', { memberIds: [2, 1], reassign: true })
    const t = find(data.tasks, '洗濯')
    expect(t.doneAt).not.toBeNull()
    expect(names(t)).toEqual(['ママ', 'パパ']) // 家族の並び順
  })

  it('先にチェックした人がいれば、あとのタップでは人を足さない', async () => {
    await api('POST', '/api/tasks/1/check', { memberIds: [1] })
    const { data } = await api('POST', '/api/tasks/1/check', { memberIds: [2] })
    expect(names(find(data.tasks, '洗濯'))).toEqual(['ママ'])
  })

  it('付け替えると、前の人たちと入れ替わる(完了の時刻はそのまま)', async () => {
    const first = await api('POST', '/api/tasks/1/check', { memberIds: [1, 2], reassign: true })
    const doneAt = find(first.data.tasks, '洗濯').doneAt
    const { data } = await api('POST', '/api/tasks/1/check', { memberIds: [2], reassign: true })
    expect(names(find(data.tasks, '洗濯'))).toEqual(['パパ'])
    expect(find(data.tasks, '洗濯').doneAt).toBe(doneAt)
  })

  it('いない家族の id は無視する', async () => {
    const { status, data } = await api('POST', '/api/tasks/1/check', { memberIds: [1, 99], reassign: true })
    expect(status).toBe(200)
    expect(names(find(data.tasks, '洗濯'))).toEqual(['ママ'])
  })

  it('家族を消すと、やった人から外れる(完了のまま)', async () => {
    await api('POST', '/api/tasks/1/check', { memberIds: [1, 2], reassign: true })
    const { data } = await api('DELETE', '/api/members/1')
    expect(names(find(data.tasks, '洗濯'))).toEqual(['パパ'])
    expect(find(data.tasks, '洗濯').doneAt).not.toBeNull()
  })

  it('日付が変わると全員が記録に写り、今日の分は空になる', async () => {
    await api('POST', '/api/tasks/1/check', { memberIds: [1, 2], reassign: true })
    await rewindBoardDate(daysAgo(1))
    const { data } = await api('GET', '/api/board')
    expect(names(find(data.tasks, '洗濯'))).toEqual([])
    expect((await historyRows(daysAgo(1)))[0].name).toBe('ママ・パパ')
    const past = await api('GET', `/api/history/${daysAgo(1)}`)
    expect(names(find(past.data.past?.tasks, '洗濯'))).toEqual(['ママ', 'パパ'])
  })

  it('過去の日も複数人に付け替えられる', async () => {
    await rewindBoardDate(daysAgo(1))
    await api('GET', '/api/board')
    const past = await api('GET', `/api/history/${daysAgo(1)}`)
    const id = find(past.data.past?.tasks, '食器洗い').id
    const { data } = await api('POST', `/api/history/${id}/check`, { memberIds: [1, 2], reassign: true })
    expect(names(find(data.past?.tasks, '食器洗い'))).toEqual(['ママ', 'パパ'])
  })
})

describe('毎朝のリセット', () => {
  // きのうの状態: 洗濯はママが完了、食器洗いは未完了、今日だけのタスクが 1 つ
  async function yesterdayBoard() {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    await api('POST', '/api/tasks', { title: '布団を干す', kind: 'once' })
    await rewindBoardDate(daysAgo(1))
  }

  it('日付が変わって最初のアクセスで、チェックを外し今日だけのタスクを消す', async () => {
    await yesterdayBoard()
    const { data } = await api('GET', '/api/board')
    expect(data.tasks.map((t) => [t.title, t.doneAt])).toEqual([
      ['洗濯', null],
      ['食器洗い', null],
    ])
  })

  it('リセットの前に、前の日の家事を history に写す', async () => {
    await yesterdayBoard()
    await api('GET', '/api/board')
    const rows = await historyRows(daysAgo(1))
    expect(rows.map((r) => [r.title, r.kind, r.name])).toEqual([
      ['洗濯', 'daily', 'ママ'],
      ['食器洗い', 'daily', null],
      ['布団を干す', 'once', null],
    ])
    expect(rows[0].doneAt).not.toBeNull()
  })

  it('Cron でも同じように写してリセットする', async () => {
    await yesterdayBoard()
    await runCron()
    expect(await historyRows(daysAgo(1))).toHaveLength(3)
    const { data } = await api('GET', '/api/board')
    expect(data.tasks).toHaveLength(2)
  })

  it('同じ日に何度アクセスしても、写すのは 1 回だけ', async () => {
    await yesterdayBoard()
    await api('GET', '/api/board')
    await runCron()
    await api('GET', '/api/board')
    expect(await historyRows(daysAgo(1))).toHaveLength(3)
    expect(await historyRows(today())).toHaveLength(0)
  })

  it('手動リセットでは写さない', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    await api('POST', '/api/reset')
    const { results } = await env.DB.prepare('SELECT COUNT(*) AS n FROM history').all<{ n: number }>()
    expect(results[0].n).toBe(0)
  })
})

describe('過去の日', () => {
  // きのうの記録: 洗濯は未完了、食器洗いはママが完了
  async function seedYesterday() {
    await api('POST', '/api/tasks/2/check', { memberId: 1 })
    await rewindBoardDate(daysAgo(1))
    await api('GET', '/api/board') // ここで写ってリセットされる
    const { data } = await api('GET', `/api/history/${daysAgo(1)}`)
    return data.past!
  }

  it('きのうの記録が見られる', async () => {
    const past = await seedYesterday()
    expect(past.date).toBe(daysAgo(1))
    expect(names(find(past.tasks, '食器洗い'))).toEqual(['ママ'])
    expect(find(past.tasks, '洗濯').doneAt).toBeNull()
  })

  it('あとから完了にでき、今日の家事には影響しない', async () => {
    const past = await seedYesterday()
    const { data } = await api('POST', `/api/history/${find(past.tasks, '洗濯').id}/check`, { memberId: 2 })
    expect(names(find(data.past?.tasks, '洗濯'))).toEqual(['パパ'])

    const board = await api('GET', '/api/board')
    expect(board.data.tasks.every((t) => t.doneAt === null)).toBe(true)
  })

  it('やった人の付け替えと、未完了に戻すことができる', async () => {
    const past = await seedYesterday()
    const id = find(past.tasks, '食器洗い').id
    let res = await api('POST', `/api/history/${id}/check`, { memberId: 2, reassign: true })
    expect(names(find(res.data.past?.tasks, '食器洗い'))).toEqual(['パパ'])
    res = await api('POST', `/api/history/${id}/uncheck`)
    expect(find(res.data.past?.tasks, '食器洗い').doneAt).toBeNull()
  })

  it('家族を消しても、記録には名前が残る', async () => {
    const past = await seedYesterday()
    await api('DELETE', '/api/members/1')
    const { data } = await api('GET', `/api/history/${past.date}`)
    expect(names(find(data.past?.tasks, '食器洗い'))).toEqual(['ママ'])
  })

  it('見られるのは 7 日前まで。今日や 8 日前は 400', async () => {
    expect((await api('GET', `/api/history/${daysAgo(7)}`)).status).toBe(200)
    expect((await api('GET', `/api/history/${daysAgo(8)}`)).status).toBe(400)
    expect((await api('GET', `/api/history/${today()}`)).status).toBe(400)
    expect((await api('GET', '/api/history/not-a-date')).status).toBe(400)
  })

  it('8 日前より古い記録は書き換えられないが、DB には残る', async () => {
    const old = daysAgo(30)
    const row = await env.DB.prepare(
      "INSERT INTO history (date, task_id, title, kind, created_at) VALUES (?1, 1, '洗濯', 'daily', 0) RETURNING id",
    )
      .bind(old)
      .first<{ id: number }>()
    const res = await api('POST', `/api/history/${row!.id}/check`, { memberId: 1 })
    expect(res.status).toBe(400)
    expect(await historyRows(old)).toEqual([{ title: '洗濯', kind: 'daily', name: null, doneAt: null }])
  })
})

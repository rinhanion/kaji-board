import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, daysAgo, find, runCron, seed, today } from './helpers'

beforeEach(seed)

type Point = { id: number; name: string; chores: number; thanks: number; month: number; used: number; balance: number }
type Use = { id: number; name: string; points: number; yenPerPoint: number; date: string; canceled: boolean }
type Rewards = { yenPerPoint: number; points: Point[]; uses: Use[]; error?: string }

const rewards = () => api<Rewards>('GET', '/api/rewards')
// 名前でその人のポイントを取る
async function pointsOf(name: string) {
  const { data } = await rewards()
  const p = data.points.find((x) => x.name === name)
  if (!p) throw new Error(`「${name}」が見つかりません`)
  return p
}
// 送った人の名前の一覧
const thanksNames = (t: { thanks: { name: string }[] }) => t.thanks.map((x) => x.name)

let nextId = 1

// 過去の記録を 1 件足す。doers・thanks は [member_id, 名前]
async function addHistory(date: string, taskId: number, done: boolean, doers: [number, string][] = [], thanks: [number, string][] = []) {
  const id = nextId++
  await env.DB.batch([
    env.DB.prepare("INSERT INTO history (id, date, task_id, title, kind, created_at, done_at) VALUES (?1, ?2, ?3, '洗濯', 'daily', 0, ?4)").bind(
      id,
      date,
      taskId,
      done ? 1 : null,
    ),
    ...doers.map(([m, name]) => env.DB.prepare('INSERT INTO history_doers (history_id, member_id, name) VALUES (?1, ?2, ?3)').bind(id, m, name)),
    ...thanks.map(([m, name]) => env.DB.prepare('INSERT INTO history_thanks (history_id, member_id, name) VALUES (?1, ?2, ?3)').bind(id, m, name)),
  ])
  return id
}

beforeEach(() => {
  nextId = 1
})

describe('ありがとう', () => {
  it('ほかの人が完了にした家事に送れて、外せる', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    const on = await api('POST', '/api/tasks/1/thanks', { memberId: 2 })
    expect(thanksNames(find(on.data.tasks, '洗濯'))).toEqual(['パパ'])
    const off = await api('POST', '/api/tasks/1/thanks', { memberId: 2, on: false })
    expect(thanksNames(find(off.data.tasks, '洗濯'))).toEqual([])
  })

  it('1 つの家事に 1 人 1 回まで', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    await api('POST', '/api/tasks/1/thanks', { memberId: 2 })
    const { data } = await api('POST', '/api/tasks/1/thanks', { memberId: 2 })
    expect(thanksNames(find(data.tasks, '洗濯'))).toEqual(['パパ'])
    expect((await pointsOf('ママ')).thanks).toBe(1)
  })

  it('自分がやった家事・未完了の家事・「だれか」の完了には送れない', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    expect((await api('POST', '/api/tasks/1/thanks', { memberId: 1 })).status).toBe(400)
    expect((await api('POST', '/api/tasks/2/thanks', { memberId: 1 })).status).toBe(400)
    await api('POST', '/api/tasks/2/check', {}) // やった人なしの完了
    expect((await api('POST', '/api/tasks/2/thanks', { memberId: 1 })).status).toBe(400)
  })

  it('いない家族の名前では送れない', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    expect((await api('POST', '/api/tasks/1/thanks', { memberId: 99 })).status).toBe(400)
    expect((await api('POST', '/api/tasks/1/thanks', {})).status).toBe(400)
  })

  it('未完了に戻すと消える', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    await api('POST', '/api/tasks/1/thanks', { memberId: 2 })
    await api('POST', '/api/tasks/1/uncheck')
    const { data } = await api('POST', '/api/tasks/1/check', { memberId: 1 })
    expect(thanksNames(find(data.tasks, '洗濯'))).toEqual([])
  })

  it('やった人を付け替えて、送った人がやった人になったら消える', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    await api('POST', '/api/tasks/1/thanks', { memberId: 2 })
    const { data } = await api('POST', '/api/tasks/1/check', { memberIds: [1, 2], reassign: true })
    expect(thanksNames(find(data.tasks, '洗濯'))).toEqual([])
  })

  it('やった人を付け替えても、やった人でない人の分は残る', async () => {
    await env.DB.prepare("INSERT INTO members (id, name, sort, color) VALUES (3, 'こども', 3, 3)").run()
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    await api('POST', '/api/tasks/1/thanks', { memberId: 2 })
    const { data } = await api('POST', '/api/tasks/1/check', { memberId: 3, reassign: true })
    expect(thanksNames(find(data.tasks, '洗濯'))).toEqual(['パパ'])
    expect((await pointsOf('こども')).thanks).toBe(1)
    expect((await pointsOf('ママ')).thanks).toBe(0)
  })

  it('毎朝のリセットで、過去の記録へ写って今日の分は空になる', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    await api('POST', '/api/tasks/1/thanks', { memberId: 2 })
    await env.DB.prepare("UPDATE meta SET value = ?1 WHERE key = 'board_date'").bind(daysAgo(1)).run()
    await runCron()

    const now = await api('GET', '/api/board')
    expect(thanksNames(find(now.data.tasks, '洗濯'))).toEqual([])
    const { data } = await api('GET', `/api/history/${daysAgo(1)}`)
    expect(thanksNames(find(data.past?.tasks, '洗濯'))).toEqual(['パパ'])
    // ポイントは写したあとも変わらない
    expect(await pointsOf('ママ')).toMatchObject({ chores: 1, thanks: 1, balance: 2 })
  })

  it('過去の日(7 日前まで)にも付け外しできる', async () => {
    const id = await addHistory(daysAgo(2), 1, true, [[1, 'ママ']])
    const on = await api('POST', `/api/history/${id}/thanks`, { memberId: 2 })
    expect(thanksNames(find(on.data.past?.tasks, '洗濯'))).toEqual(['パパ'])
    expect((await api('POST', `/api/history/${id}/thanks`, { memberId: 1 })).status).toBe(400) // 自分がやった家事
    const off = await api('POST', `/api/history/${id}/thanks`, { memberId: 2, on: false })
    expect(thanksNames(find(off.data.past?.tasks, '洗濯'))).toEqual([])

    const old = await addHistory(daysAgo(8), 1, true, [[1, 'ママ']])
    expect((await api('POST', `/api/history/${old}/thanks`, { memberId: 2 })).status).toBe(400)
  })

  it('過去の日を未完了に戻すと消える', async () => {
    const id = await addHistory(daysAgo(2), 1, true, [[1, 'ママ']], [[2, 'パパ']])
    await api('POST', `/api/history/${id}/uncheck`)
    expect(await pointsOf('ママ')).toMatchObject({ chores: 0, thanks: 0 })
    const { results } = await env.DB.prepare('SELECT * FROM history_thanks').all()
    expect(results).toEqual([])
  })
})

describe('ポイント', () => {
  it('家事 1 回で 1、一緒にやったらそれぞれ 1。今日の分も過去の分も数える', async () => {
    await addHistory(daysAgo(40), 1, true, [[1, 'ママ']])
    await addHistory(daysAgo(1), 1, true, [
      [1, 'ママ'],
      [2, 'パパ'],
    ])
    await api('POST', '/api/tasks/1/check', { memberId: 2 })
    expect(await pointsOf('ママ')).toMatchObject({ chores: 2, thanks: 0, balance: 2 })
    expect(await pointsOf('パパ')).toMatchObject({ chores: 2, thanks: 0, balance: 2 })
  })

  it('「ありがとう」を 1 つもらうと 1。一緒にやった家事なら、それぞれ 1', async () => {
    await env.DB.prepare("INSERT INTO members (id, name, sort, color) VALUES (3, 'こども', 3, 3)").run()
    await addHistory(daysAgo(1), 1, true, [[1, 'ママ']], [
      [2, 'パパ'],
      [3, 'こども'],
    ])
    await api('POST', '/api/tasks/1/check', { memberIds: [1, 2], reassign: true })
    await api('POST', '/api/tasks/1/thanks', { memberId: 3 })
    expect(await pointsOf('ママ')).toMatchObject({ chores: 2, thanks: 3, balance: 5 })
    expect(await pointsOf('パパ')).toMatchObject({ chores: 1, thanks: 1, balance: 2 })
    expect(await pointsOf('こども')).toMatchObject({ chores: 0, thanks: 0, balance: 0 })
  })

  it('未完了の記録と、やった人のいない完了は数えない', async () => {
    await addHistory(daysAgo(1), 1, false, [[1, 'ママ']])
    await addHistory(daysAgo(1), 2, true)
    await api('POST', '/api/tasks/1/check', {})
    const { data } = await rewards()
    expect(data.points.map((p) => p.balance)).toEqual([0, 0])
  })

  it('消した家族は出さない', async () => {
    await addHistory(daysAgo(1), 1, true, [[2, 'パパ']])
    await api('DELETE', '/api/members/2')
    const { data } = await rewards()
    expect(data.points.map((p) => p.name)).toEqual(['ママ'])
  })

  it('今月ためた分は、今月の記録と今日の分だけ', async () => {
    const monthStart = `${today().slice(0, 7)}-01`
    const lastMonth = new Date(Date.parse(monthStart) - 86400_000).toISOString().slice(0, 10)
    await addHistory(lastMonth, 1, true, [[1, 'ママ']], [[2, 'パパ']])
    await addHistory(monthStart, 2, true, [[1, 'ママ']], [[2, 'パパ']])
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    // 今日が月の 1 日だと、monthStart の記録は今日と同じ日付になるが、数え方は変わらない
    expect(await pointsOf('ママ')).toMatchObject({ chores: 3, thanks: 2, month: 3, balance: 5 })
  })

  it('ボードにも、家族ごとのポイントと 1 ポイントの円が付く', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    const { data } = await api<Rewards>('GET', '/api/board')
    expect(data.yenPerPoint).toBe(10)
    expect(data.points.map((p) => [p.name, p.balance])).toEqual([
      ['ママ', 1],
      ['パパ', 0],
    ])
  })
})

describe('ポイントを使う', () => {
  beforeEach(async () => {
    // ママ 5 ポイント(家事 3 + ありがとう 2)
    await addHistory(daysAgo(3), 1, true, [[1, 'ママ']], [[2, 'パパ']])
    await addHistory(daysAgo(2), 1, true, [[1, 'ママ']], [[2, 'パパ']])
    await addHistory(daysAgo(1), 1, true, [[1, 'ママ']])
  })

  it('使った分だけ使えるポイントが減り、記録が残る', async () => {
    const { status, data } = await api<Rewards>('POST', '/api/rewards/uses', { memberId: 1, points: 3 })
    expect(status).toBe(200)
    expect(data.points[0]).toMatchObject({ name: 'ママ', used: 3, balance: 2 })
    expect(data.uses).toMatchObject([{ name: 'ママ', points: 3, yenPerPoint: 10, date: today(), canceled: false }])
  })

  it('使えるポイントちょうどまで使える。それより多いと断る', async () => {
    expect((await api('POST', '/api/rewards/uses', { memberId: 1, points: 6 })).status).toBe(400)
    expect((await api('POST', '/api/rewards/uses', { memberId: 1, points: 5 })).status).toBe(200)
    expect((await api('POST', '/api/rewards/uses', { memberId: 1, points: 1 })).status).toBe(400)
    expect((await pointsOf('ママ')).balance).toBe(0)
  })

  it('0・マイナス・小数・数字でないもの・いない家族は断る', async () => {
    for (const points of [0, -1, 1.5, 'abc', null]) {
      expect((await api('POST', '/api/rewards/uses', { memberId: 1, points })).status).toBe(400)
    }
    expect((await api('POST', '/api/rewards/uses', { memberId: 99, points: 1 })).status).toBe(400)
    expect((await rewards()).data.uses).toEqual([])
  })

  it('取り消すと使えるポイントが戻り、記録の行は残る', async () => {
    const used = await api<Rewards>('POST', '/api/rewards/uses', { memberId: 1, points: 3 })
    const { data } = await api<Rewards>('POST', `/api/rewards/uses/${used.data.uses[0].id}/cancel`)
    expect(data.points[0]).toMatchObject({ used: 0, balance: 5 })
    expect(data.uses).toMatchObject([{ points: 3, canceled: true }])
  })

  it('使ったあとにチェックを外すと、マイナスのまま出す', async () => {
    await api('POST', '/api/rewards/uses', { memberId: 1, points: 5 })
    await api('POST', '/api/history/3/uncheck')
    expect((await pointsOf('ママ')).balance).toBe(-1)
    expect((await api('POST', '/api/rewards/uses', { memberId: 1, points: 1 })).status).toBe(400)
  })

  it('1 ポイントの円を変えても、前に使った記録の金額は変わらない', async () => {
    await api('POST', '/api/rewards/uses', { memberId: 1, points: 2 })
    const set = await api<Rewards>('PATCH', '/api/settings', { yenPerPoint: 20 })
    expect(set.data.yenPerPoint).toBe(20)
    const { data } = await api<Rewards>('POST', '/api/rewards/uses', { memberId: 1, points: 1 })
    expect(data.yenPerPoint).toBe(20)
    expect(data.uses.map((u) => [u.points, u.yenPerPoint])).toEqual([
      [1, 20],
      [2, 10],
    ])
  })

  it('1 ポイントの円は 1〜1000 の整数だけ', async () => {
    for (const yenPerPoint of [0, 1001, 2.5, 'abc']) {
      expect((await api('PATCH', '/api/settings', { yenPerPoint })).status).toBe(400)
    }
    expect((await rewards()).data.yenPerPoint).toBe(10)
  })

  it('家族を消しても、使った記録は名前つきで残る', async () => {
    await api('POST', '/api/rewards/uses', { memberId: 1, points: 2 })
    await api('DELETE', '/api/members/1')
    expect((await rewards()).data.uses).toMatchObject([{ name: 'ママ', points: 2 }])
  })
})

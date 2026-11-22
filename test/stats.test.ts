import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, daysAgo, runCron, seed } from './helpers'

beforeEach(seed)

type Stats = {
  from: string
  to: string
  summary: {
    days: number
    total: number
    done: number
    onceTotal: number
    onceDone: number
    unknown: number
    firstDate: string | null
  }
  days: { date: string; total: number; done: number }[]
  chores: {
    id: number
    title: string
    deleted: boolean
    total: number
    done: number
    unknown: number
    doers: { name: string; color: number; count: number }[]
  }[]
  people: { name: string; color: number; count: number; share: number; shareExact: number }[]
  error?: string
}

let nextId = 1

// 記録を 1 件足す。doers は [member_id, 名前]
async function addHistory(
  date: string,
  taskId: number,
  title: string,
  done: boolean,
  doers: [number, string][] = [],
  kind = 'daily',
) {
  const id = nextId++
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO history (id, date, task_id, title, kind, created_at, done_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)',
    ).bind(id, date, taskId, title, kind, done ? 1 : null),
    ...doers.map(([m, name]) =>
      env.DB.prepare('INSERT INTO history_doers (history_id, member_id, name) VALUES (?1, ?2, ?3)').bind(id, m, name),
    ),
  ])
}

const stats = (range?: string) => api<Stats>('GET', `/api/stats${range ? `?range=${range}` : ''}`)

describe('集計', () => {
  beforeEach(async () => {
    nextId = 1
    // 1 日前: 洗濯(ママ)・食器洗い(ママとパパ)。2 日前: 洗濯(パパ)・食器洗いはやっていない・今日だけ(だれか)
    await addHistory(daysAgo(1), 1, '洗濯', true, [[1, 'ママ']])
    await addHistory(daysAgo(1), 2, '食器洗い', true, [
      [1, 'ママ'],
      [2, 'パパ'],
    ])
    await addHistory(daysAgo(2), 1, '洗濯', true, [[2, 'パパ']])
    await addHistory(daysAgo(2), 2, '食器洗い', false)
    await addHistory(daysAgo(2), 100, '布団を干す', true, [], 'once')
    // 期間の外(40 日前)
    await addHistory(daysAgo(40), 1, '洗濯', true, [[1, 'ママ']])
  })

  it('期間の中の完了数と日数を数える', async () => {
    const { data } = await stats('7')
    expect(data.from).toBe(daysAgo(7))
    expect(data.to).toBe(daysAgo(1))
    expect(data.summary).toMatchObject({
      days: 2,
      total: 5,
      done: 4,
      onceTotal: 1,
      onceDone: 1,
      unknown: 1,
      firstDate: daysAgo(40),
    })
    expect(data.days).toEqual([
      { date: daysAgo(2), total: 3, done: 2 },
      { date: daysAgo(1), total: 2, done: 2 },
    ])
  })

  it('一緒にやった家事は、それぞれ 1 回と数え、分担の数は人数で分ける。同じ数なら家族の並び順', async () => {
    const { data } = await stats('7')
    expect(data.people).toEqual([
      { name: 'ママ', color: 1, count: 2, share: 1.5, shareExact: 1.5 },
      { name: 'パパ', color: 2, count: 2, share: 1.5, shareExact: 1.5 },
    ])
  })

  it('毎日の家事ごとに、完了の割合とやった人を出す', async () => {
    const { data } = await stats('7')
    expect(data.chores.map((t) => [t.title, t.total, t.done])).toEqual([
      ['洗濯', 2, 2],
      ['食器洗い', 2, 1],
    ])
    expect(data.chores[0].doers).toEqual([
      { name: 'ママ', color: 1, count: 1 },
      { name: 'パパ', color: 2, count: 1 },
    ])
  })

  it('ぜんぶ なら、最初の記録の日から数える', async () => {
    const { data } = await stats('all')
    expect(data.from).toBe(daysAgo(40))
    expect(data.summary.total).toBe(6)
    expect(data.people.find((p) => p.name === 'ママ')?.count).toBe(3)
  })

  it('消した家事や家族も、写しておいた名前で数える', async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM tasks WHERE id = 2'),
      env.DB.prepare('DELETE FROM members WHERE id = 2'),
    ])
    const { data } = await stats('7')
    expect(data.chores.find((t) => t.id === 2)).toMatchObject({ title: '食器洗い', deleted: true })
    expect(data.people.map((p) => p.name)).toContain('パパ')
  })

  it('家事の名前を変えたら、今の名前で出す', async () => {
    await env.DB.prepare("UPDATE tasks SET title = '洗濯物' WHERE id = 1").run()
    const { data } = await stats('7')
    expect(data.chores[0].title).toBe('洗濯物')
  })

  it('期間の指定がおかしければ 400', async () => {
    const { status } = await stats('9999')
    expect(status).toBe(400)
  })

  it('記録が無くても空で返す', async () => {
    await env.DB.prepare('DELETE FROM history').run()
    const { status, data } = await stats()
    expect(status).toBe(200)
    expect(data.summary).toMatchObject({ total: 0, done: 0, unknown: 0, firstDate: null })
    expect(data.people).toEqual([])
  })
})

// その人の行
function person(data: Stats, name: string) {
  const p = data.people.find((x) => x.name === name)
  if (!p) throw new Error(`「${name}」が見つかりません`)
  return p
}
// 丸める前の分担の数の合計
const shareSum = (data: Stats) => data.people.reduce((a, p) => a + p.shareExact, 0)

describe('分担の数', () => {
  beforeEach(async () => {
    nextId = 1
    await env.DB.batch([env.DB.prepare('DELETE FROM history_doers'), env.DB.prepare('DELETE FROM history')])
  })

  const addMember = (id: number, name: string) =>
    env.DB.prepare('INSERT INTO members (id, name, sort, color) VALUES (?1, ?2, ?1, ?1)').bind(id, name).run()

  it('ママ 1 人の風呂掃除と、ママとパパの洗い物で、ママ 1.5件・2回、パパ 0.5件・1回', async () => {
    await addHistory(daysAgo(1), 1, '風呂掃除', true, [[1, 'ママ']])
    await addHistory(daysAgo(1), 2, '洗い物', true, [
      [1, 'ママ'],
      [2, 'パパ'],
    ])
    const { data } = await stats('7')
    expect(data.people).toEqual([
      { name: 'ママ', color: 1, count: 2, share: 1.5, shareExact: 1.5 },
      { name: 'パパ', color: 2, count: 1, share: 0.5, shareExact: 0.5 },
    ])
    expect(shareSum(data)).toBe(data.summary.done)
  })

  it('3 人で 1 件だけなら、3 人とも 0.3件・1回。丸める前の合計は 1', async () => {
    await addMember(3, 'こども')
    await addHistory(daysAgo(1), 1, '洗濯', true, [
      [1, 'ママ'],
      [2, 'パパ'],
      [3, 'こども'],
    ])
    const { data } = await stats('7')
    expect(data.people.map((p) => [p.name, p.share, p.count])).toEqual([
      ['ママ', 0.3, 1],
      ['パパ', 0.3, 1],
      ['こども', 0.3, 1],
    ])
    expect(shareSum(data)).toBeCloseTo(1, 9)
  })

  it('1 人の家事だけなら、分担の数とやった回数が同じ(3.0 ではなく 3)', async () => {
    for (const n of [1, 2, 3]) await addHistory(daysAgo(n), 1, '洗濯', true, [[1, 'ママ']])
    const { data } = await stats('7')
    expect(data.people).toEqual([{ name: 'ママ', color: 1, count: 3, share: 3, shareExact: 3 }])
    expect(Number.isInteger(data.people[0].share)).toBe(true)
    expect(JSON.stringify(data.people)).not.toContain('3.0')
  })

  it('丸め: 4 人で 1 件は 0.3、3 人で 2 件は 0.7', async () => {
    await addMember(3, 'こども')
    await addMember(4, 'おじいちゃん')
    await addHistory(daysAgo(1), 1, '洗濯', true, [
      [1, 'ママ'],
      [2, 'パパ'],
      [3, 'こども'],
      [4, 'おじいちゃん'],
    ])
    for (const n of [2, 3])
      await addHistory(daysAgo(n), 2, '食器洗い', true, [
        [1, 'ママ'],
        [2, 'パパ'],
        [3, 'こども'],
      ])
    const { data } = await stats('7')
    // 4 人の 1 件(1/4)と 3 人の 2 件(2/3)
    expect(person(data, 'おじいちゃん').share).toBe(0.3)
    expect(person(data, 'ママ').shareExact).toBeCloseTo(1 / 4 + 2 / 3, 9)
    expect(person(data, 'ママ').share).toBe(0.9)

    // 3 人で 2 件だけ
    await env.DB.prepare('DELETE FROM history_doers WHERE history_id = 1').run()
    await env.DB.prepare('DELETE FROM history WHERE id = 1').run()
    const after = (await stats('7')).data
    expect(after.people.map((p) => p.share)).toEqual([0.7, 0.7, 0.7])
  })

  it('21 人で 1 件なら、丸めると 0 になるが 0.1件と出す', async () => {
    // member_id 3〜23 はいない家族(写した名前だけ)
    await addHistory(daysAgo(1), 1, '大掃除', true, [
      [1, 'ママ'],
      ...Array.from({ length: 20 }, (_, i) => [i + 3, `親戚${i + 3}`] as [number, string]),
    ])
    const { data } = await stats('7')
    expect(data.people).toHaveLength(21)
    expect(person(data, 'ママ')).toMatchObject({ share: 0.1, count: 1 })
    expect(person(data, 'ママ').shareExact).toBeCloseTo(1 / 21, 9)
    expect(data.people.every((p) => p.share === 0.1)).toBe(true)
    expect(shareSum(data)).toBeCloseTo(1, 9)
  })

  it('丸める前の合計は、完了の数から「だれか」の数を引いた数と同じ', async () => {
    await addMember(3, 'こども')
    await addHistory(daysAgo(1), 1, '洗濯', true, [
      [1, 'ママ'],
      [2, 'パパ'],
      [3, 'こども'],
    ])
    await addHistory(daysAgo(1), 2, '食器洗い', true, [[2, 'パパ']])
    await addHistory(daysAgo(2), 1, '洗濯', true) // だれか
    await addHistory(daysAgo(2), 2, '食器洗い', false) // 未完了
    await addHistory(
      daysAgo(3),
      100,
      '布団を干す',
      true,
      [
        [1, 'ママ'],
        [3, 'こども'],
      ],
      'once',
    )
    await addHistory(daysAgo(3), 1, '洗濯', true, [
      [2, 'パパ'],
      [3, 'こども'],
    ])
    const { data } = await stats('7')
    expect(data.summary).toMatchObject({ done: 5, unknown: 1, onceDone: 1 })
    expect(shareSum(data)).toBeCloseTo(data.summary.done - data.summary.unknown, 9)
    // 今日だけのタスクも入る
    expect(person(data, 'ママ').shareExact).toBeCloseTo(1 / 3 + 1 / 2, 9)
  })

  it('やった人を付けずに完了した家事は、だれの分担の数にも入らない', async () => {
    await addHistory(daysAgo(1), 1, '洗濯', true, [
      [1, 'ママ'],
      [2, 'パパ'],
    ])
    const before = (await stats('7')).data
    await addHistory(daysAgo(1), 2, '食器洗い', true)
    const { data } = await stats('7')
    expect(data.people).toEqual(before.people)
    expect(shareSum(data)).toBe(1)
    expect(data.summary.unknown).toBe(before.summary.unknown + 1)
    expect(data.people.map((p) => p.name)).not.toContain('だれか')
  })

  it('完了していない家事は、やった人が付いていても分担の数に入らない', async () => {
    await addHistory(daysAgo(1), 1, '洗濯', true, [[1, 'ママ']])
    await addHistory(daysAgo(1), 2, '食器洗い', false, [
      [1, 'ママ'],
      [2, 'パパ'],
    ])
    const { data } = await stats('7')
    expect(data.people).toEqual([{ name: 'ママ', color: 1, count: 1, share: 1, shareExact: 1 }])
  })

  it('一緒にやった家族を消しても、ほかの人の分担の数は変わらない。消された人は写した名前で 0.5件', async () => {
    await addHistory(daysAgo(1), 2, '洗い物', true, [
      [1, 'ママ'],
      [2, 'パパ'],
    ])
    const before = (await stats('7')).data
    expect(person(before, 'ママ').share).toBe(0.5)
    await api('DELETE', '/api/members/2')
    const { data } = await stats('7')
    expect(person(data, 'ママ')).toMatchObject({ share: 0.5, shareExact: 0.5, count: 1 })
    expect(person(data, 'パパ')).toMatchObject({ color: 0, share: 0.5, count: 1 })
  })

  it('前のしくみで写した消された家族(member_id 0)とママで洗い物をしたら、ママ 0.5件', async () => {
    await addHistory(daysAgo(1), 2, '洗い物', true, [
      [1, 'ママ'],
      [0, 'おばあちゃん'],
    ])
    const { data } = await stats('7')
    expect(data.people).toEqual([
      { name: 'ママ', color: 1, count: 1, share: 0.5, shareExact: 0.5 },
      { name: 'おばあちゃん', color: 0, count: 1, share: 0.5, shareExact: 0.5 },
    ])
  })

  it('名前の同じ消された家族(member_id 0)は、1 行にまとまる', async () => {
    await addHistory(daysAgo(1), 1, '洗濯', true, [[0, 'おばあちゃん']])
    await addHistory(daysAgo(2), 2, '食器洗い', true, [
      [1, 'ママ'],
      [0, 'おばあちゃん'],
    ])
    await addHistory(daysAgo(3), 1, '洗濯', true, [[0, 'おじいちゃん']])
    const { data } = await stats('7')
    expect(data.people.filter((p) => p.name === 'おばあちゃん')).toEqual([
      { name: 'おばあちゃん', color: 0, count: 2, share: 1.5, shareExact: 1.5 },
    ])
    expect(person(data, 'おじいちゃん')).toMatchObject({ count: 1, share: 1 })
  })

  it('並びは分担の数の多い順(回数はパパが多くても、分担の数の多いママが上)', async () => {
    await addMember(3, 'こども')
    for (const n of [1, 2]) await addHistory(daysAgo(n), 1, '洗濯', true, [[1, 'ママ']])
    for (const n of [1, 2, 3])
      await addHistory(daysAgo(n), 2, '食器洗い', true, [
        [2, 'パパ'],
        [3, 'こども'],
      ])
    const { data } = await stats('7')
    expect(data.people.map((p) => [p.name, p.share, p.count])).toEqual([
      ['ママ', 2, 2],
      ['パパ', 1.5, 3],
      ['こども', 1.5, 3],
    ])
  })

  it('小数のずれがあっても、同じ分担の数なら家族の並び順', async () => {
    // ママは 3 人の家事 6 件(1/3 を 6 回足す。素直に足すと 2 よりわずかに小さくなる)、パパは 1 人の家事 2 件(ちょうど 2)
    for (const n of [1, 2, 3, 4, 5, 6])
      await addHistory(daysAgo(n), 1, '洗濯', true, [
        [1, 'ママ'],
        [3, 'おばあちゃん'],
        [4, 'おじいちゃん'],
      ])
    for (const n of [1, 2]) await addHistory(daysAgo(n), 2, '食器洗い', true, [[2, 'パパ']])
    const { data } = await stats('7')
    expect(data.people.map((p) => [p.name, p.share, p.count])).toEqual([
      ['ママ', 2, 6],
      ['パパ', 2, 2],
      ['おばあちゃん', 2, 6],
      ['おじいちゃん', 2, 6],
    ])
  })

  it('期間を切り替えると、その期間の記録だけで数える(8 日前の家事は 7日に入らず 30日に入る)', async () => {
    await addHistory(daysAgo(1), 1, '洗濯', true, [[1, 'ママ']])
    await addHistory(daysAgo(8), 2, '食器洗い', true, [
      [1, 'ママ'],
      [2, 'パパ'],
    ])
    await addHistory(daysAgo(40), 1, '洗濯', true, [[2, 'パパ']])
    const week = (await stats('7')).data
    expect(week.people).toEqual([{ name: 'ママ', color: 1, count: 1, share: 1, shareExact: 1 }])
    const month = (await stats('30')).data
    expect(month.people.map((p) => [p.name, p.share])).toEqual([
      ['ママ', 1.5],
      ['パパ', 0.5],
    ])
    const all = (await stats('all')).data
    // ぜんぶ: ママ 1 + 0.5、パパ 0.5 + 1 で同じ数なので、家族の並び順
    expect(all.people.map((p) => [p.name, p.share])).toEqual([
      ['ママ', 1.5],
      ['パパ', 1.5],
    ])
  })

  it('今日やった家事は分担の数に入らず、JST 4:00 のリセットのあと次の日の集計に入る', async () => {
    await api('POST', '/api/tasks/1/check', { memberIds: [1, 2], reassign: true })
    expect((await stats('7')).data.people).toEqual([])
    // 日付が変わったことにして、Cron で写す
    await env.DB.prepare("UPDATE meta SET value = ?1 WHERE key = 'board_date'").bind(daysAgo(1)).run()
    await runCron()
    const { data } = await stats('7')
    expect(data.people).toEqual([
      { name: 'ママ', color: 1, count: 1, share: 0.5, shareExact: 0.5 },
      { name: 'パパ', color: 2, count: 1, share: 0.5, shareExact: 0.5 },
    ])
  })

  it('過去の日のやった人を付け替えたら、次に開いたときの分担の数に出る', async () => {
    await addHistory(daysAgo(1), 1, '洗濯', true, [[1, 'ママ']])
    expect((await stats('7')).data.people.map((p) => p.share)).toEqual([1])
    const { status } = await api('POST', '/api/history/1/check', { memberIds: [1, 2], reassign: true })
    expect(status).toBe(200)
    const { data } = await stats('7')
    expect(data.people.map((p) => [p.name, p.share, p.count])).toEqual([
      ['ママ', 0.5, 1],
      ['パパ', 0.5, 1],
    ])
  })

  it('分担の数を出しても、ポイントは一緒にやった家事でそれぞれ +1 のまま', async () => {
    await addHistory(daysAgo(1), 1, '洗濯', true, [
      [1, 'ママ'],
      [2, 'パパ'],
    ])
    expect(person((await stats('7')).data, 'ママ').share).toBe(0.5)
    const { data } = await api<{ points: { name: string; chores: number }[] }>('GET', '/api/board')
    expect(data.points.map((p) => [p.name, p.chores])).toEqual([
      ['ママ', 1],
      ['パパ', 1],
    ])
  })

  it('期間の指定がおかしければ、今までどおり 400 とエラーの文言', async () => {
    for (const r of ['', '0', 'abc', '7.5']) {
      const res = await api<Stats>('GET', `/api/stats?range=${r}`)
      expect(res.status).toBe(400)
      expect(res.data.error).toBe('range は 7・30・all のどれかです')
    }
  })
})

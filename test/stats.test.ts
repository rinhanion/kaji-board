import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, daysAgo, seed } from './helpers'

beforeEach(seed)

type Stats = {
  from: string
  to: string
  summary: { days: number; total: number; done: number; onceTotal: number; onceDone: number; unknown: number; firstDate: string | null }
  days: { date: string; total: number; done: number }[]
  chores: { id: number; title: string; deleted: boolean; total: number; done: number; unknown: number; doers: { name: string; color: number; count: number }[] }[]
  people: { name: string; color: number; count: number }[]
  error?: string
}

let nextId = 1

// 記録を 1 件足す。doers は [member_id, 名前]
async function addHistory(date: string, taskId: number, title: string, done: boolean, doers: [number, string][] = [], kind = 'daily') {
  const id = nextId++
  await env.DB.batch([
    env.DB.prepare('INSERT INTO history (id, date, task_id, title, kind, created_at, done_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)').bind(
      id,
      date,
      taskId,
      title,
      kind,
      done ? 1 : null,
    ),
    ...doers.map(([m, name]) => env.DB.prepare('INSERT INTO history_doers (history_id, member_id, name) VALUES (?1, ?2, ?3)').bind(id, m, name)),
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
    expect(data.summary).toMatchObject({ days: 2, total: 5, done: 4, onceTotal: 1, onceDone: 1, unknown: 1, firstDate: daysAgo(40) })
    expect(data.days).toEqual([
      { date: daysAgo(2), total: 3, done: 2 },
      { date: daysAgo(1), total: 2, done: 2 },
    ])
  })

  it('一緒にやった家事は、それぞれ 1 回と数える', async () => {
    const { data } = await stats('7')
    expect(data.people).toEqual([
      { name: 'ママ', color: 1, count: 2 },
      { name: 'パパ', color: 2, count: 2 },
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
    await env.DB.batch([env.DB.prepare('DELETE FROM tasks WHERE id = 2'), env.DB.prepare('DELETE FROM members WHERE id = 2')])
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

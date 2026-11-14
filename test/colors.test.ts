import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, daysAgo, find, runCron, seed } from './helpers'

beforeEach(seed)

type Member = { id: number; name: string; color: number }
type Board = { members: Member[]; createdId?: number; error?: string }

// 今日の盤面を昨日のものとして、毎朝のリセットで history に写す
async function archiveAsYesterday() {
  await env.DB.prepare("UPDATE meta SET value = ?1 WHERE key = 'board_date'").bind(daysAgo(1)).run()
  await runCron()
}

const colors = (b: Board) => b.members.map((m) => [m.name, m.color])

describe('家族の色', () => {
  it('ボードの家族に色が付いている', async () => {
    const { data } = await api<Board>('GET', '/api/board')
    expect(colors(data)).toEqual([
      ['ママ', 1],
      ['パパ', 2],
    ])
  })

  it('色を変えられる。名前はそのまま', async () => {
    const { status, data } = await api<Board>('PATCH', '/api/members/2', { color: 5 })
    expect(status).toBe(200)
    expect(colors(data)).toEqual([
      ['ママ', 1],
      ['パパ', 5],
    ])
  })

  it('名前と色を一度に変えられる', async () => {
    const { data } = await api<Board>('PATCH', '/api/members/1', { name: 'おかあさん', color: 3 })
    expect(colors(data)[0]).toEqual(['おかあさん', 3])
  })

  it('色の番号がおかしければ 400', async () => {
    for (const color of [0, 7, 1.5, 'red']) {
      const { status } = await api<Board>('PATCH', '/api/members/1', { color })
      expect(status).toBe(400)
    }
    const { status } = await api<Board>('PATCH', '/api/members/1', {})
    expect(status).toBe(400)
  })

  it('追加した人には、いちばん使われていない色を付ける', async () => {
    const first = await api<Board>('POST', '/api/members', { name: 'さくら' })
    expect(first.data.members.find((m) => m.id === first.data.createdId)?.color).toBe(3)
    // 1 を空けると、次は 1
    await api<Board>('PATCH', '/api/members/1', { color: 4 })
    const second = await api<Board>('POST', '/api/members', { name: 'じぃじ' })
    expect(second.data.members.find((m) => m.id === second.data.createdId)?.color).toBe(1)
  })

  it('6 色を使い切ったら、また 1 から', async () => {
    for (const name of ['a', 'b', 'c', 'd']) await api<Board>('POST', '/api/members', { name })
    const { data } = await api<Board>('POST', '/api/members', { name: 'e' })
    expect(data.members.find((m) => m.id === data.createdId)?.color).toBe(1)
  })

  it('やった人にも色が付く。消した家族は 0', async () => {
    const { data } = await api('POST', '/api/tasks/1/check', { memberIds: [1, 2] })
    expect(find(data.tasks, '洗濯').doers.map((d) => d.color)).toEqual([1, 2])

    await archiveAsYesterday()
    await api('DELETE', '/api/members/2')
    const past = await api('GET', `/api/history/${daysAgo(1)}`)
    expect(find(past.data.past?.tasks, '洗濯').doers.map((d) => [d.name, d.color])).toEqual([
      ['ママ', 1],
      ['パパ', 0],
    ])
  })

  it('集計のやった人にも色が付く', async () => {
    await api('POST', '/api/tasks/1/check', { memberIds: [1, 2] })
    await archiveAsYesterday()
    await api<Board>('PATCH', '/api/members/2', { color: 6 })
    type Stats = { people: { name: string; color: number }[]; chores: { doers: { name: string; color: number }[] }[] }
    const { data } = await api<Stats>('GET', '/api/stats?range=7')
    expect(data.people.map((p) => [p.name, p.color])).toEqual([
      ['ママ', 1],
      ['パパ', 6],
    ])
    expect(data.chores[0].doers.map((d) => d.color)).toEqual([1, 6])
  })
})

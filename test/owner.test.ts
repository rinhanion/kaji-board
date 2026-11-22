import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, authCookie, daysAgo, find, names, request, runCron, seed } from './helpers'

beforeEach(seed)

const MAMA = { id: 1, name: 'ママ', color: 1 }
const PAPA = { id: 2, name: 'パパ', color: 2 }

// 日付が変わった状態をつくる: board_date を前の日に戻す
async function rewindBoardDate(date: string) {
  await env.DB.prepare("UPDATE meta SET value = ?1 WHERE key = 'board_date'").bind(date).run()
}

// DB にある家事の担当の id
async function ownerIdOf(taskId: number) {
  const row = await env.DB.prepare('SELECT owner_id AS ownerId FROM tasks WHERE id = ?1')
    .bind(taskId)
    .first<{ ownerId: number | null }>()
  return row?.ownerId
}

// 今日のボードでの、その家事の担当
async function boardOwner(title: string) {
  const { data } = await api('GET', '/api/board')
  return find(data.tasks, title).owner
}

// ポイント(ごほうびの画面と同じ数え方)
async function balanceOf(name: string) {
  const { data } = await api<{ points: { name: string; balance: number }[] }>('GET', '/api/rewards')
  const p = data.points.find((x) => x.name === name)
  if (!p) throw new Error(`「${name}」が見つかりません`)
  return p.balance
}

// 今日だけのタスクを足して、その id を返す
async function addOnce(title: string) {
  const { data } = await api('POST', '/api/tasks', { title, kind: 'once' })
  return find(data.tasks, title).id
}

describe('担当を決める・外す', () => {
  it('担当を決めると、返り値とボードの家事に今の名前と色で出る。ほかの家事は担当なし', async () => {
    const { status, data } = await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    expect(status).toBe(200)
    expect(find(data.tasks, '洗濯').owner).toEqual(MAMA)
    expect(find(data.tasks, '食器洗い').owner).toBeNull()
    // ほかの端末が読み直したときも同じ
    expect(await boardOwner('洗濯')).toEqual(MAMA)
    expect(await ownerIdOf(1)).toBe(1)
  })

  it('はじめはどの家事も担当なし(owner は null)', async () => {
    const { data } = await api('GET', '/api/board')
    expect(data.tasks.map((t) => t.owner)).toEqual([null, null])
  })

  it('「なし」で担当が外れる', async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    const { status, data } = await api('DELETE', '/api/tasks/1/owner')
    expect(status).toBe(200)
    expect(find(data.tasks, '洗濯').owner).toBeNull()
    expect(await ownerIdOf(1)).toBeNull()
  })

  it('担当がいない家事・無い id・今日だけのタスクでも、外すのは 200', async () => {
    expect((await api('DELETE', '/api/tasks/1/owner')).status).toBe(200)
    expect((await api('DELETE', '/api/tasks/999/owner')).status).toBe(200)
    const onceId = await addOnce('電球を替える')
    expect((await api('DELETE', `/api/tasks/${onceId}/owner`)).status).toBe(200)
  })

  it('別の人を選ぶと担当が入れ替わる(担当は 1 人だけ)', async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    const { data } = await api('POST', '/api/tasks/1/owner', { memberId: 2 })
    expect(find(data.tasks, '洗濯').owner).toEqual(PAPA)
    expect(await ownerIdOf(1)).toBe(2)
  })

  it('同じ人をもう一度送っても 200 でそのまま', async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    const { status, data } = await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    expect(status).toBe(200)
    expect(find(data.tasks, '洗濯').owner).toEqual(MAMA)
  })

  it('1 人が 2 つの家事の担当になれる', async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    const { data } = await api('POST', '/api/tasks/2/owner', { memberId: 1 })
    expect(find(data.tasks, '洗濯').owner).toEqual(MAMA)
    expect(find(data.tasks, '食器洗い').owner).toEqual(MAMA)
  })

  it('合言葉の Cookie がなければ、決めるのも外すのも 401 で、担当は変わらない', async () => {
    expect((await request('POST', '/api/tasks/1/owner', { body: { memberId: 1 } })).status).toBe(401)
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    expect((await request('DELETE', '/api/tasks/1/owner')).status).toBe(401)
    expect(await ownerIdOf(1)).toBe(1)
  })
})

describe('今日だけのタスク', () => {
  it('今日だけのタスクには担当を付けられない(400)。owner は null のまま', async () => {
    const onceId = await addOnce('電球を替える')
    const { status, data } = await api('POST', `/api/tasks/${onceId}/owner`, { memberId: 1 })
    expect(status).toBe(400)
    expect(data.error).toBe('担当は毎日の家事にだけ付けられます')
    expect(await ownerIdOf(onceId)).toBeNull()
    expect(await boardOwner('電球を替える')).toBeNull()
  })
})

describe('担当を決められないとき', () => {
  it('無い家事は 404', async () => {
    const { status, data } = await api('POST', '/api/tasks/999/owner', { memberId: 1 })
    expect(status).toBe(404)
    expect(data.error).toBe('家事が見つかりません')
  })

  it('ほかの端末で消された家事は 404', async () => {
    await api('DELETE', '/api/tasks/1')
    const { status, data } = await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    expect(status).toBe(404)
    expect(data.error).toBe('家事が見つかりません')
  })

  it('id が数でなければ 404', async () => {
    expect((await api('POST', '/api/tasks/abc/owner', { memberId: 1 })).status).toBe(404)
  })

  it('memberId が無い・いない家族・数でない・正の整数でなければ 400 で、担当は変わらない', async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    for (const body of [
      {},
      { memberId: 99 },
      { memberId: '2' },
      { memberId: 0 },
      { memberId: -2 },
      { memberId: 1.5 },
    ]) {
      const { status, data } = await api('POST', '/api/tasks/1/owner', body)
      expect(status, JSON.stringify(body)).toBe(400)
      expect(data.error).toBe('担当にする家族を選んでください')
    }
    expect(await boardOwner('洗濯')).toEqual(MAMA)
  })

  it('本文が JSON でなくても 400(500 にしない)', async () => {
    const res = await request('POST', '/api/tasks/1/owner', { cookie: await authCookie() })
    expect(res.status).toBe(400)
    expect(await ownerIdOf(1)).toBeNull()
  })

  it('ほかの端末で消された家族は担当にできない(400)', async () => {
    await api('DELETE', '/api/members/2')
    const { status } = await api('POST', '/api/tasks/1/owner', { memberId: 2 })
    expect(status).toBe(400)
    expect(await ownerIdOf(1)).toBeNull()
  })
})

describe('担当は目印(完了とポイントは今のまま)', () => {
  beforeEach(async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
  })

  it('担当でない人も完了にでき、やった人のポイントが 1 増える。担当のポイントは変わらない', async () => {
    const { status, data } = await api('POST', '/api/tasks/1/check', { memberId: 2 })
    expect(status).toBe(200)
    const t = find(data.tasks, '洗濯')
    expect(t.doneAt).not.toBeNull()
    expect(names(t)).toEqual(['パパ'])
    expect(await balanceOf('パパ')).toBe(1)
    expect(await balanceOf('ママ')).toBe(0)
  })

  it('担当の人がやっても、担当のない家事と同じく 1 ポイント', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    expect(await balanceOf('ママ')).toBe(1)
    // 担当のない食器洗いをやったときも同じ増え方
    await api('POST', '/api/tasks/2/check', { memberId: 1 })
    expect(await balanceOf('ママ')).toBe(2)
  })

  it('完了しても・未完了に戻しても・やった人を付け替えても、担当は残る', async () => {
    let { data } = await api('POST', '/api/tasks/1/check', { memberId: 2 })
    expect(find(data.tasks, '洗濯').owner).toEqual(MAMA)
    ;({ data } = await api('POST', '/api/tasks/1/check', { memberIds: [1, 2], reassign: true }))
    expect(find(data.tasks, '洗濯').owner).toEqual(MAMA)
    ;({ data } = await api('POST', '/api/tasks/1/uncheck'))
    expect(find(data.tasks, '洗濯').owner).toEqual(MAMA)
  })

  it('担当の家事を上に寄せない(並び順は今までどおり)', async () => {
    const { data } = await api('POST', '/api/tasks/2/owner', { memberId: 2 })
    await api('DELETE', '/api/tasks/1/owner')
    expect(data.tasks.map((t) => t.title)).toEqual(['洗濯', '食器洗い'])
    expect((await api('GET', '/api/board')).data.tasks.map((t) => t.title)).toEqual(['洗濯', '食器洗い'])
  })
})

describe('リセットでは外れない', () => {
  beforeEach(async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    await api('POST', '/api/tasks/1/check', { memberId: 2 })
  })

  it('日付が変わって最初のアクセスのあとも担当は残る(チェックは外れる)', async () => {
    await rewindBoardDate(daysAgo(1))
    const { data } = await api('GET', '/api/board')
    const t = find(data.tasks, '洗濯')
    expect(t.doneAt).toBeNull()
    expect(t.owner).toEqual(MAMA)
  })

  it('毎朝 4:00 の Cron のあとも担当は残る', async () => {
    await rewindBoardDate(daysAgo(1))
    await runCron()
    expect(await ownerIdOf(1)).toBe(1)
    const t = find((await api('GET', '/api/board')).data.tasks, '洗濯')
    expect(t.doneAt).toBeNull()
    expect(t.owner).toEqual(MAMA)
  })

  it('「今すぐリセット」のあとも担当は残る', async () => {
    const { data } = await api('POST', '/api/reset')
    const t = find(data.tasks, '洗濯')
    expect(t.doneAt).toBeNull()
    expect(t.owner).toEqual(MAMA)
  })

  it('何日もまたいでも担当は残る', async () => {
    await rewindBoardDate(daysAgo(5))
    expect(await boardOwner('洗濯')).toEqual(MAMA)
  })
})

describe('記録には担当を写さない', () => {
  it('前の日の記録の家事に owner が無い。history に owner_id の列も無い', async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    await api('POST', '/api/tasks/1/check', { memberId: 2 })
    await rewindBoardDate(daysAgo(1))
    await api('GET', '/api/board')
    const { status, data } = await api('GET', `/api/history/${daysAgo(1)}`)
    expect(status).toBe(200)
    const t = find(data.past?.tasks, '洗濯')
    expect(names(t)).toEqual(['パパ']) // 記録に残るのはやった人だけ
    expect(t.owner).toBeUndefined()
    const { results } = await env.DB.prepare('PRAGMA table_info(history)').all<{ name: string }>()
    expect(results.map((c) => c.name)).not.toContain('owner_id')
  })

  it('過去の日の家事を書き換えても、今日の担当は変わらない', async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    await rewindBoardDate(daysAgo(1))
    const board = await api('GET', '/api/board')
    expect(find(board.data.tasks, '洗濯').owner).toEqual(MAMA)
    const past = await api('GET', `/api/history/${daysAgo(1)}`)
    const pastId = find(past.data.past?.tasks, '洗濯').id
    await api('POST', `/api/history/${pastId}/check`, { memberId: 2 })
    expect(await boardOwner('洗濯')).toEqual(MAMA)
  })
})

describe('家族を変えたとき', () => {
  beforeEach(async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
  })

  it('担当の家族を消すと、その家事は担当なしになる(DB でも NULL)', async () => {
    const { status, data } = await api('DELETE', '/api/members/1')
    expect(status).toBe(200)
    expect(find(data.tasks, '洗濯').owner).toBeNull()
    expect(await ownerIdOf(1)).toBeNull()
  })

  it('担当でない家族を消しても、担当はそのまま', async () => {
    const { data } = await api('DELETE', '/api/members/2')
    expect(find(data.tasks, '洗濯').owner).toEqual(MAMA)
  })

  it('担当の家族の名前と色を変えると、担当にも今の名前と色で出る', async () => {
    const { status, data } = await api('PATCH', '/api/members/1', { name: 'はは', color: 3 })
    expect(status).toBe(200)
    expect(find(data.tasks, '洗濯').owner).toEqual({ id: 1, name: 'はは', color: 3 })
    expect(await boardOwner('洗濯')).toEqual({ id: 1, name: 'はは', color: 3 })
  })
})

describe('毎日の家事を変えたとき', () => {
  beforeEach(async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
  })

  it('家事の名前を変えても担当はそのまま', async () => {
    const { data } = await api('PATCH', '/api/tasks/1', { title: 'お風呂掃除' })
    expect(find(data.tasks, 'お風呂掃除').owner).toEqual(MAMA)
  })

  it('並べ替えても担当はそのまま', async () => {
    const { status } = await api('POST', '/api/tasks/reorder', { ids: [2, 1] })
    expect(status).toBe(200)
    const { data } = await api('GET', '/api/board')
    expect(data.tasks.map((t) => t.title)).toEqual(['食器洗い', '洗濯'])
    expect(find(data.tasks, '洗濯').owner).toEqual(MAMA)
    expect(find(data.tasks, '食器洗い').owner).toBeNull()
  })

  it('家事を消すと担当ごと消え、新しく足した毎日の家事は担当なしで始まる', async () => {
    await api('DELETE', '/api/tasks/1')
    const { data } = await api('POST', '/api/tasks', { title: '洗濯', kind: 'daily' })
    const t = find(data.tasks, '洗濯')
    expect(t.id).not.toBe(1)
    expect(t.owner).toBeNull()
  })
})

describe('集計は今までどおり', () => {
  it('担当ママの洗濯をパパがやると、集計の毎日の家事ごとのやった人はパパ 1 回だけ', async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 1 })
    await api('POST', '/api/tasks/1/check', { memberId: 2 })
    await rewindBoardDate(daysAgo(1))
    await api('GET', '/api/board')
    const { status, data } = await api<{
      chores: { title: string; total: number; done: number; doers: { name: string; color: number; count: number }[] }[]
    }>('GET', '/api/stats?range=7')
    expect(status).toBe(200)
    const chore = data.chores.find((t) => t.title === '洗濯')
    expect(chore).toMatchObject({ total: 1, done: 1 })
    expect(chore?.doers).toEqual([{ name: 'パパ', color: 2, count: 1 }])
  })

  it('担当の人がやった日は、その人の回数として数える', async () => {
    await api('POST', '/api/tasks/1/owner', { memberId: 2 })
    await api('POST', '/api/tasks/1/check', { memberId: 2 })
    await rewindBoardDate(daysAgo(1))
    await api('GET', '/api/board')
    const { data } = await api<{ chores: { title: string; doers: { name: string; count: number }[] }[] }>(
      'GET',
      '/api/stats?range=7',
    )
    expect(data.chores.find((t) => t.title === '洗濯')?.doers.map((d) => [d.name, d.count])).toEqual([['パパ', 1]])
  })
})

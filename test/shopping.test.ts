import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, daysAgo, runCron, seed, today } from './helpers'

beforeEach(seed)

type Who = { id: number; name: string; color: number }
type Item = { id: number; name: string; createdAt: number; boughtAt: number | null; addedBy: Who | null; boughtBy: Who | null }
type Board = { date: string; shopping: Item[]; error?: string; existingId?: number }
type Row = {
  id: number
  name: string
  name_key: string
  added_by: number | null
  added_by_name: string | null
  bought_at: number | null
  bought_date: string | null
  bought_by: number | null
  bought_by_name: string | null
}

const board = () => api<Board>('GET', '/api/board')
const add = (name: unknown, memberId?: unknown) => api<Board>('POST', '/api/shopping', { name, memberId })
const buy = (id: number, body: Record<string, unknown> = {}) => api<Board>('POST', `/api/shopping/${id}/buy`, body)
const unbuy = (id: number) => api<Board>('POST', `/api/shopping/${id}/unbuy`)
const remove = (id: number) => api<Board>('DELETE', `/api/shopping/${id}`)

// 品名で一覧の品を取る(同じ名前が 2 つあるときは、まだ買っていない方を先に見る)
function item(list: Item[], name: string, bought?: boolean) {
  const s = list.find((x) => x.name === name && (bought === undefined || !!x.boughtAt === bought))
  if (!s) throw new Error(`「${name}」が見つかりません`)
  return s
}
const itemNames = (list: Item[]) => list.map((s) => s.name)

// 足して、その品の id を返す
async function addId(name: string, memberId?: number) {
  const { status, data } = await add(name, memberId)
  expect(status).toBe(200)
  return item(data.shopping, name, false).id
}

async function rows(): Promise<Row[]> {
  const { results } = await env.DB.prepare('SELECT * FROM shopping_items ORDER BY id').all<Row>()
  return results
}
async function row(id: number) {
  return env.DB.prepare('SELECT * FROM shopping_items WHERE id = ?1').bind(id).first<Row>()
}

// 前の日に買ったことにする(見え方は boardDate() と bought_date だけで決まる)
async function boughtYesterday(id: number) {
  await env.DB.prepare('UPDATE shopping_items SET bought_date = ?1 WHERE id = ?2').bind(daysAgo(1), id).run()
}

// board_date を前の日に戻し、次のアクセスで「日付が変わった」としてリセットさせる
async function rewindBoardDate(date: string) {
  await env.DB.prepare("UPDATE meta SET value = ?1 WHERE key = 'board_date'").bind(date).run()
}

// まだ買っていない品を n 件、DB に直接入れる
async function fill(n: number) {
  await env.DB.batch(
    Array.from({ length: n }, (_, i) =>
      env.DB.prepare('INSERT INTO shopping_items (name, name_key, created_at) VALUES (?1, ?1, 0)').bind(`品${i + 1}`),
    ),
  )
}

describe('買い物メモを書く', () => {
  it('はじめは空', async () => {
    const { data } = await board()
    expect(data.shopping).toEqual([])
  })

  it('足すと書いた順に一覧の終わりに並び、書いた人(名前・色)が付く', async () => {
    await add('ケチャップ', 1)
    const { status, data } = await add('牛乳', 2)
    expect(status).toBe(200)
    expect(itemNames(data.shopping)).toEqual(['ケチャップ', '牛乳'])
    expect(item(data.shopping, 'ケチャップ').addedBy).toEqual({ id: 1, name: 'ママ', color: 1 })
    expect(item(data.shopping, '牛乳').addedBy).toEqual({ id: 2, name: 'パパ', color: 2 })
    expect(data.shopping.every((s) => s.boughtAt === null && s.boughtBy === null)).toBe(true)
    const [r] = await rows()
    expect(r.added_by).toBe(1)
    expect(r.added_by_name).toBe('ママ')
  })

  it('空白だけでは足されない(全角スペースも)', async () => {
    for (const name of ['   ', '　　', '']) {
      const { status, data } = await add(name, 1)
      expect(status).toBe(400)
      expect(data.error).toBe('1〜40文字で入力してください')
    }
    expect(await rows()).toHaveLength(0)
  })

  it('品名の前後の空白は取り除き、中の空白は 1 つに詰めて記録する', async () => {
    const { data } = await add('  牛乳 ', 1)
    expect(itemNames(data.shopping)).toEqual(['牛乳'])
    await add(' 食パン　　6枚切り ', 1)
    const r = await rows()
    expect(r.map((x) => x.name)).toEqual(['牛乳', '食パン 6枚切り'])
  })

  it('品名は 40 文字まで。41 文字は 400', async () => {
    expect((await add('あ'.repeat(40))).status).toBe(200)
    const { status, data } = await add('い'.repeat(41))
    expect(status).toBe(400)
    expect(data.error).toBe('1〜40文字で入力してください')
    expect(await rows()).toHaveLength(1)
  })

  it('文字列でない品名は 400', async () => {
    for (const name of [123, null, undefined, ['牛乳']]) {
      expect((await add(name)).status).toBe(400)
    }
    expect(await rows()).toHaveLength(0)
  })
})

describe('同じ品名', () => {
  it('まだ買っていない品と同じ名前は 409 で、すでにある品の id を返す(全角・半角・空白の違いは同じ)', async () => {
    const ketchup = await addId('ケチャップ')
    const abc = await addId('ＡＢＣ')
    for (const [name, existingId] of [
      ['ｹﾁｬｯﾌﾟ', ketchup],
      [' ケチャップ  ', ketchup],
      ['ABC', abc],
    ] as const) {
      const { status, data } = await add(name)
      expect(status).toBe(409)
      expect(data.error).toBe('もうあります')
      expect(data.existingId).toBe(existingId)
    }
    expect(await rows()).toHaveLength(2)
  })

  it('大文字・小文字やひらがな・カタカナは別の品として足せる', async () => {
    await addId('abc')
    expect((await add('ABC')).status).toBe(200)
    await addId('けちゃっぷ')
    expect((await add('ケチャップ')).status).toBe(200)
  })

  it('今日買った品と同じ名前なら足せる(2 行になる)', async () => {
    const id = await addId('ケチャップ')
    await buy(id, { memberId: 1 })
    const { status, data } = await add('ケチャップ', 2)
    expect(status).toBe(200)
    expect(data.shopping.filter((s) => s.name === 'ケチャップ')).toHaveLength(2)
    // まだの品が上、買った品が下
    expect(data.shopping.map((s) => !!s.boughtAt)).toEqual([false, true])
  })

  it('前の日に買った品と同じ名前も足せる', async () => {
    const id = await addId('牛乳')
    await buy(id, { memberId: 1 })
    await boughtYesterday(id)
    const { status, data } = await add('牛乳')
    expect(status).toBe(200)
    expect(itemNames(data.shopping)).toEqual(['牛乳'])
    expect(await rows()).toHaveLength(2)
  })
})

describe('50 件まで', () => {
  it('まだ買っていない品が 50 件なら 51 件目は 400。1 件を買ったにすると、また足せる', async () => {
    await fill(50)
    const { status, data } = await add('ケチャップ')
    expect(status).toBe(400)
    expect(data.error).toBe('メモがいっぱいです。買ったものや要らないものを消してください')
    const first = (await board()).data.shopping[0]
    await buy(first.id, { memberId: 1 })
    expect((await add('ケチャップ')).status).toBe(200)
  })

  it('○ を外して 51 件になるのは止めない。そのあとの追加は 400', async () => {
    const id = await addId('ケチャップ')
    await buy(id, { memberId: 1 })
    await fill(50)
    const { status, data } = await unbuy(id)
    expect(status).toBe(200)
    expect(data.shopping.filter((s) => !s.boughtAt)).toHaveLength(51)
    const after = await add('牛乳')
    expect(after.status).toBe(400)
    expect(after.data.error).toBe('メモがいっぱいです。買ったものや要らないものを消してください')
  })
})

describe('買った ○', () => {
  it('○ で買ったになり、並びが下へ。DB の bought_date は今日', async () => {
    const a = await addId('ケチャップ', 1)
    await addId('牛乳', 1)
    const before = Date.now()
    const { status, data } = await buy(a, { memberId: 2 })
    expect(status).toBe(200)
    expect(itemNames(data.shopping)).toEqual(['牛乳', 'ケチャップ'])
    const s = item(data.shopping, 'ケチャップ')
    expect(s.boughtAt).toBeGreaterThanOrEqual(before)
    expect(s.boughtBy).toEqual({ id: 2, name: 'パパ', color: 2 })
    const r = await row(a)
    expect(r?.bought_date).toBe(today())
    expect(r?.bought_by).toBe(2)
    expect(r?.bought_by_name).toBe('パパ')
  })

  it('もう一度で戻る。4 列とも NULL になり、書いた人はそのまま', async () => {
    const a = await addId('ケチャップ', 1)
    await addId('牛乳', 1)
    await buy(a, { memberId: 2 })
    const { status, data } = await unbuy(a)
    expect(status).toBe(200)
    expect(itemNames(data.shopping)).toEqual(['ケチャップ', '牛乳'])
    const s = item(data.shopping, 'ケチャップ')
    expect(s.boughtAt).toBeNull()
    expect(s.boughtBy).toBeNull()
    expect(s.addedBy).toEqual({ id: 1, name: 'ママ', color: 1 })
    const r = await row(a)
    expect([r?.bought_at, r?.bought_date, r?.bought_by, r?.bought_by_name]).toEqual([null, null, null, null])
  })

  it('買った品は、書いた順(id 順)に並ぶ', async () => {
    const a = await addId('A')
    const b = await addId('B')
    await addId('C')
    await buy(b)
    const { data } = await buy(a)
    expect(itemNames(data.shopping)).toEqual(['C', 'A', 'B'])
  })

  it('書いた人でない家族も ○ を付けられる・外せる・消せる', async () => {
    const a = await addId('ケチャップ', 1)
    expect((await buy(a, { memberId: 2 })).status).toBe(200)
    expect((await unbuy(a)).status).toBe(200)
    const { status, data } = await remove(a)
    expect(status).toBe(200)
    expect(data.shopping).toEqual([])
  })

  it('先に付けた人を優先する(reassign なしの 2 回目では変わらない)', async () => {
    const a = await addId('ケチャップ')
    const first = await buy(a, { memberId: 1 })
    const at = item(first.data.shopping, 'ケチャップ').boughtAt
    const { status, data } = await buy(a, { memberId: 2 })
    expect(status).toBe(200)
    const s = item(data.shopping, 'ケチャップ')
    expect(s.boughtBy?.name).toBe('ママ')
    expect(s.boughtAt).toBe(at)
  })

  it('まだの品の /unbuy は何もしない', async () => {
    const a = await addId('ケチャップ', 1)
    const { status, data } = await unbuy(a)
    expect(status).toBe(200)
    expect(item(data.shopping, 'ケチャップ').boughtAt).toBeNull()
  })

  it('無い id の /buy・/unbuy は 404', async () => {
    for (const res of [await buy(999, { memberId: 1 }), await unbuy(999), await buy(999, { memberId: 1, reassign: true })]) {
      expect(res.status).toBe(404)
      expect(res.data.error).toBe('この品はもう一覧にありません')
    }
  })

  it('同じ名前のまだの品があるとき、買ったほうの /unbuy は 409 で、買ったのまま', async () => {
    const old = await addId('牛乳')
    await buy(old, { memberId: 1 })
    const fresh = await addId('牛乳')
    const { status, data } = await unbuy(old)
    expect(status).toBe(409)
    expect(data.error).toBe('もうあります')
    expect(data.existingId).toBe(fresh)
    const r = await row(old)
    expect(r?.bought_at).not.toBeNull()
    expect(r?.bought_by_name).toBe('ママ')
  })
})

describe('長押しの「だれが買った?」(reassign)', () => {
  it('まだの品に reassign で、買った人がその人になる', async () => {
    const a = await addId('ケチャップ', 1)
    const { status, data } = await buy(a, { memberId: 2, reassign: true })
    expect(status).toBe(200)
    const s = item(data.shopping, 'ケチャップ')
    expect(s.boughtAt).not.toBeNull()
    expect(s.boughtBy?.name).toBe('パパ')
    expect((await row(a))?.bought_date).toBe(today())
  })

  it('ママが買った品をパパに付け替えると、bought_at・bought_date は変わらない', async () => {
    const a = await addId('ケチャップ')
    await buy(a, { memberId: 1 })
    const before = await row(a)
    const { status, data } = await buy(a, { memberId: 2, reassign: true })
    expect(status).toBe(200)
    expect(item(data.shopping, 'ケチャップ').boughtBy?.name).toBe('パパ')
    expect(item(data.shopping, 'ケチャップ').boughtAt).toBe(before?.bought_at)
    const after = await row(a)
    expect(after?.bought_at).toBe(before?.bought_at)
    expect(after?.bought_date).toBe(before?.bought_date)
    expect(after?.bought_by).toBe(2)
    expect(after?.bought_by_name).toBe('パパ')
  })

  it('名前なしで買った品にも、あとから買った人を付けられる', async () => {
    const a = await addId('ケチャップ')
    await buy(a)
    const { data } = await buy(a, { memberId: 1, reassign: true })
    expect(item(data.shopping, 'ケチャップ').boughtBy?.name).toBe('ママ')
  })

  it('reassign で memberId なし・いない家族は 400 で、何も変わらない', async () => {
    const a = await addId('ケチャップ')
    for (const body of [{ reassign: true }, { reassign: true, memberId: 999 }]) {
      const { status, data } = await buy(a, body)
      expect(status).toBe(400)
      expect(data.error).toBe('買った人を選んでください')
    }
    expect((await row(a))?.bought_at).toBeNull()
  })
})

describe('× で消す', () => {
  it('まだ買っていない品は、一覧からも DB からも消える', async () => {
    const a = await addId('ケチャップ')
    await addId('牛乳')
    const { status, data } = await remove(a)
    expect(status).toBe(200)
    expect(itemNames(data.shopping)).toEqual(['牛乳'])
    expect(await row(a)).toBeNull()
  })

  it('買った品の DELETE は 400 で、行は残る', async () => {
    const a = await addId('ケチャップ')
    await buy(a, { memberId: 1 })
    const { status, data } = await remove(a)
    expect(status).toBe(400)
    expect(data.error).toBe('買った品は消せません。○ を外してから消してください')
    expect(await row(a)).not.toBeNull()
  })

  it('前の日に買った品の DELETE でも、行は残る', async () => {
    const a = await addId('ケチャップ')
    await buy(a, { memberId: 1 })
    await boughtYesterday(a)
    await remove(a)
    expect(await row(a)).not.toBeNull()
  })

  it('無い id の DELETE は 200、消したあとの /buy は 404', async () => {
    const a = await addId('ケチャップ')
    await remove(a)
    expect((await remove(a)).status).toBe(200)
    expect((await remove(999)).status).toBe(200)
    expect((await buy(a, { memberId: 1 })).status).toBe(404)
  })

  it('消した品の名前は、また足せる', async () => {
    const a = await addId('ケチャップ')
    await remove(a)
    expect((await add('ケチャップ')).status).toBe(200)
  })
})

describe('名前を選んでいない端末', () => {
  it('memberId なしで足すと書いた人は null。DB も NULL', async () => {
    const { data } = await add('ケチャップ')
    expect(item(data.shopping, 'ケチャップ').addedBy).toBeNull()
    const [r] = await rows()
    expect(r.added_by).toBeNull()
    expect(r.added_by_name).toBeNull()
  })

  it('memberId なしの /buy は買ったになり、買った人は null', async () => {
    const a = await addId('ケチャップ', 1)
    const { status, data } = await buy(a)
    expect(status).toBe(200)
    const s = item(data.shopping, 'ケチャップ')
    expect(s.boughtAt).not.toBeNull()
    expect(s.boughtBy).toBeNull()
    const r = await row(a)
    expect(r?.bought_date).toBe(today())
    expect(r?.bought_by).toBeNull()
    expect(r?.bought_by_name).toBeNull()
  })

  it('いない家族の id で書いても・買っても、名前は null', async () => {
    const { data } = await add('ケチャップ', 999)
    const s = item(data.shopping, 'ケチャップ')
    expect(s.addedBy).toBeNull()
    const bought = await buy(s.id, { memberId: 999 })
    expect(bought.status).toBe(200)
    expect(item(bought.data.shopping, 'ケチャップ').boughtBy).toBeNull()
    const r = await row(s.id)
    expect([r?.added_by, r?.added_by_name, r?.bought_by, r?.bought_by_name]).toEqual([null, null, null, null])
    expect(r?.bought_at).not.toBeNull()
  })
})

describe('日付が変わったとき', () => {
  it('前の日に買った品は一覧に出ない。まだの品は出る', async () => {
    const a = await addId('ケチャップ')
    await addId('牛乳')
    await buy(a, { memberId: 1 })
    await boughtYesterday(a)
    const { data } = await board()
    expect(itemNames(data.shopping)).toEqual(['牛乳'])
  })

  it('前の日に買った品は、/unbuy も /buy(reassign)も 404', async () => {
    const a = await addId('ケチャップ')
    await buy(a, { memberId: 1 })
    await boughtYesterday(a)
    expect((await unbuy(a)).status).toBe(404)
    expect((await buy(a, { memberId: 2, reassign: true })).status).toBe(404)
    expect((await buy(a, { memberId: 2 })).status).toBe(404)
    const r = await row(a)
    expect(r?.bought_by_name).toBe('ママ')
    expect(r?.bought_date).toBe(daysAgo(1))
  })

  it('買った記録は、見えなくなったあとも DB に残る', async () => {
    const a = await addId('ケチャップ', 2)
    await buy(a, { memberId: 1 })
    await boughtYesterday(a)
    await board()
    const r = await row(a)
    expect(r).toMatchObject({
      name: 'ケチャップ',
      bought_date: daysAgo(1),
      bought_by: 1,
      bought_by_name: 'ママ',
      added_by: 2,
      added_by_name: 'パパ',
    })
    expect(r?.bought_at).not.toBeNull()
  })

  it('まだの品は、日付をまたいだあとの最初のアクセス(リセット)でも消えない', async () => {
    await addId('ケチャップ', 1)
    await rewindBoardDate(daysAgo(1))
    const { data } = await board()
    expect(data.date).toBe(today())
    expect(itemNames(data.shopping)).toEqual(['ケチャップ'])
    expect(item(data.shopping, 'ケチャップ').addedBy?.name).toBe('ママ')
  })

  it('まだの品は Cron のリセットでも消えない', async () => {
    await addId('ケチャップ')
    await rewindBoardDate(daysAgo(1))
    await runCron()
    expect(itemNames((await board()).data.shopping)).toEqual(['ケチャップ'])
  })

  it('朝 4:00 の前に ○ を外した品は、リセットのあとも残る', async () => {
    const a = await addId('ケチャップ')
    await buy(a, { memberId: 1 })
    await unbuy(a)
    await rewindBoardDate(daysAgo(1))
    const { data } = await board()
    expect(itemNames(data.shopping)).toEqual(['ケチャップ'])
    expect(item(data.shopping, 'ケチャップ').boughtAt).toBeNull()
  })
})

describe('設定の「今すぐリセット」', () => {
  it('まだの品も、今日買った品も、買ったのまま残る', async () => {
    const a = await addId('ケチャップ')
    await addId('牛乳')
    await buy(a, { memberId: 1 })
    const before = await row(a)
    const { status, data } = await api<Board>('POST', '/api/reset')
    expect(status).toBe(200)
    expect(itemNames(data.shopping)).toEqual(['牛乳', 'ケチャップ'])
    expect(item(data.shopping, 'ケチャップ').boughtBy?.name).toBe('ママ')
    expect(await row(a)).toEqual(before)
  })
})

describe('家族の名前と色', () => {
  it('名前・色を変えると、書いた人・買った人も今の名前と色で出る', async () => {
    const a = await addId('ケチャップ', 1)
    await buy(a, { memberId: 1 })
    await api('PATCH', '/api/members/1', { name: 'おかあさん', color: 3 })
    const { data } = await board()
    const s = item(data.shopping, 'ケチャップ')
    expect(s.addedBy).toEqual({ id: 1, name: 'おかあさん', color: 3 })
    expect(s.boughtBy).toEqual({ id: 1, name: 'おかあさん', color: 3 })
    // 書いたときの名前の写しは変えない
    expect((await row(a))?.added_by_name).toBe('ママ')
  })

  it('書いた人・買った人を消しても品は残り、名前は null。DB の写した名前は残る', async () => {
    const a = await addId('ケチャップ', 1)
    const b = await addId('牛乳', 2)
    await buy(b, { memberId: 1 })
    const { data } = await api<Board>('DELETE', '/api/members/1')
    expect(itemNames(data.shopping)).toEqual(['ケチャップ', '牛乳'])
    expect(item(data.shopping, 'ケチャップ').addedBy).toBeNull()
    expect(item(data.shopping, '牛乳').addedBy?.name).toBe('パパ')
    expect(item(data.shopping, '牛乳').boughtBy).toBeNull()
    expect(item(data.shopping, '牛乳').boughtAt).not.toBeNull()
    expect((await row(a))?.added_by_name).toBe('ママ')
    expect((await row(b))?.bought_by_name).toBe('ママ')
  })
})

describe('ポイント', () => {
  it('足す・○・付け替え・外す・消すの前後で、使えるポイントは変わらない', async () => {
    await api('POST', '/api/tasks/1/check', { memberId: 1 })
    type Rewards = { points: { id: number; balance: number }[] }
    const balances = async () => (await api<Rewards>('GET', '/api/rewards')).data.points.map((p) => [p.id, p.balance])
    const before = await balances()
    expect(before).toEqual([
      [1, 1],
      [2, 0],
    ])
    const a = await addId('ケチャップ', 1)
    await addId('牛乳', 2)
    await buy(a, { memberId: 1 })
    await buy(a, { memberId: 2, reassign: true })
    expect(await balances()).toEqual(before)
    await unbuy(a)
    await remove(a)
    expect(await balances()).toEqual(before)
  })
})

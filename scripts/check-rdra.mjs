// RDRA の地図(docs/rdra/)が、今のコードとずれていないかを確かめる。依存なし
// - src/index.ts の API と、3-境界.md の UC の一覧の API が、どちら向きにも合っているか
// - migrations/ のテーブルが、すべて 4-システム.md の情報モデルに載っているか
// 使い方: node scripts/check-rdra.mjs(npm run check の中でも走る)
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

// コードの API: app.post('/api/...') の形
const codeApis = new Set(
  [...read('src/index.ts').matchAll(/app\.(get|post|put|patch|delete)\(\s*'(\/api\/[^']*)'/g)].map(
    ([, method, path]) => `${method.toUpperCase()} ${path}`,
  ),
)

// 地図の API: 3-境界.md の「UC の一覧」の中の `POST /api/...`
const boundary = read('docs/rdra/3-境界.md')
const ucSection = boundary.split(/^## /m).find((s) => s.startsWith('UC の一覧'))
if (!ucSection) {
  console.error('docs/rdra/3-境界.md に「## UC の一覧」の節が見つからない')
  process.exit(1)
}
const mapApis = new Set(
  [...ucSection.matchAll(/`(GET|POST|PUT|PATCH|DELETE) (\/api\/[^`]*)`/g)].map(([, m, p]) => `${m} ${p}`),
)

// テーブル: migrations を番号順に読み、CREATE で足し、DROP で外し、RENAME で付け替える
const tables = new Set()
const migrations = readdirSync(join(root, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
for (const f of migrations) {
  // -- のコメントは除いてから読む
  const sql = read(`migrations/${f}`).replace(/--.*$/gm, '')
  for (const [, verb, name, renamed] of sql.matchAll(
    /(CREATE TABLE(?: IF NOT EXISTS)?|DROP TABLE(?: IF EXISTS)?|ALTER TABLE)\s+(\w+)(?:\s+RENAME TO\s+(\w+))?/gi,
  )) {
    const v = verb.toUpperCase()
    if (v.startsWith('CREATE')) tables.add(name)
    else if (v.startsWith('DROP')) tables.delete(name)
    else if (renamed) {
      tables.delete(name)
      tables.add(renamed)
    }
  }
}

// 地図のテーブル: 4-システム.md の「情報モデル」の中の `members` など
const system = read('docs/rdra/4-システム.md')
const infoSection = system.split(/^## /m).find((s) => s.startsWith('情報モデル'))
if (!infoSection) {
  console.error('docs/rdra/4-システム.md に「## 情報モデル」の節が見つからない')
  process.exit(1)
}
const mapWords = new Set([...infoSection.matchAll(/`(\w+)`/g)].map(([, w]) => w))

const problems = [
  ...[...codeApis]
    .filter((a) => !mapApis.has(a))
    .map((a) => `API ${a} が、3-境界.md の UC の一覧に無い。どの UC のための API かを書き足す`),
  ...[...mapApis]
    .filter((a) => !codeApis.has(a))
    .map((a) => `3-境界.md の UC の一覧にある ${a} が、src/index.ts に無い。消した API なら地図からも外す`),
  ...[...tables]
    .filter((t) => !mapWords.has(t))
    .map((t) => `テーブル ${t} が、4-システム.md の情報モデルに無い。どの情報を持つテーブルかを書き足す`),
]

if (problems.length > 0) {
  console.error('RDRA の地図(docs/rdra/)が、コードとずれている:')
  for (const p of problems) console.error(`- ${p}`)
  process.exit(1)
}
console.log(`RDRA の地図とコードは合っている(API ${codeApis.size} 本、テーブル ${tables.size} 個)`)

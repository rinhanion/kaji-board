// Stop: 作業を終える前に、コードの変更があれば npm run check を走らせる。
// 落ちていたら終わらせず、出力の末尾を Claude に返して直させる
import { spawnSync } from 'node:child_process'
import { git, projectDir, readInput } from './lib.mjs'

const input = await readInput()
// 直前にこのフックで止めて、直したあとの 2 回目なら止めない(止め続けるのを防ぐ)
if (input.stop_hook_active) process.exit(0)

// チェックの対象になるファイル。文書だけの変更では走らせない
const CODE = /^(src|test|public|migrations)\/|^(package(-lock)?\.json|tsconfig\.json|vitest\.config\.ts|wrangler\.jsonc)$/

// まだ main に入っていない変更(コミット済みと、作業中の両方)
const committed = git('diff', '--name-only', 'origin/main...HEAD') ?? ''
const working = (git('status', '--porcelain') ?? '').split('\n').map((l) => l.slice(3).split(' -> ').pop())
const changed = [...committed.split('\n'), ...working].filter((f) => f && CODE.test(f))
if (changed.length === 0) process.exit(0)

const res = spawnSync('npm', ['run', 'check'], { cwd: projectDir, encoding: 'utf8', timeout: 170_000 })
if (res.status === 0) process.exit(0)

const tail = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n')
process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason: `npm run check が通っていません。直してから終えてください(CLAUDE.md)。\n\n${tail}`,
  }),
)

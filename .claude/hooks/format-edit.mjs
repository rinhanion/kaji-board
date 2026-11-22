// PostToolUse(Edit / Write など): 書きかえたファイルを Biome で整形する。
// 整形のずれで npm run check が落ちる手戻りをなくす。直せない lint の指摘は Claude に返す
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { isSecretFile, projectDir, readInput, relPath } from './lib.mjs'

const input = await readInput()
const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path
const rel = file && relPath(file)
if (!rel || isSecretFile(rel)) process.exit(0)

const biome = path.join(projectDir, 'node_modules', '.bin', 'biome')
// Biome が扱わないファイル・設定で外したファイル(md など)は、何もせずに通す
const res = spawnSync(biome, ['check', '--write', '--no-errors-on-unmatched', '--files-ignore-unknown=true', rel], {
  cwd: projectDir,
  encoding: 'utf8',
  timeout: 20_000,
})
// node_modules が無いなど、Biome を動かせないときは止めない(終わるときの npm run check で気づける)
if (res.error || res.status === 0) process.exit(0)

const tail = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n')
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `${rel} は整形しましたが、Biome の指摘が残っています。直してください。\n\n${tail}`,
    },
  }),
)

// PreToolUse(Edit / Write など): 触ってはいけないファイルの編集を止める
import { SECRET_REASON, deny, git, isSecretFile, readInput, relPath } from './lib.mjs'

const input = await readInput()
const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path
const rel = file && relPath(file)
if (!rel) process.exit(0)

if (isSecretFile(rel)) deny(SECRET_REASON)

// 当て済みの migration: main(origin/main)に入っているもの。新しい番号のファイルは足してよい
if (/^migrations\/[^/]+\.sql$/.test(rel)) {
  const base = git('rev-parse', '--verify', '--quiet', 'origin/main') ? 'origin/main' : 'HEAD'
  if (git('cat-file', '-e', `${base}:${rel}`) !== null) {
    deny(`${rel} は本番に当て済みの migration なので書き換えない決まりです(CLAUDE.md)。変更は新しい番号のファイルを足してください。`)
  }
}

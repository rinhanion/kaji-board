// フックの共通の道具。依存なし(Node の標準だけ)
import { execFileSync } from 'node:child_process'
import path from 'node:path'

export const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()

// フックに渡される JSON を読む
export async function readInput() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return text ? JSON.parse(text) : {}
}

export function git(...args) {
  try {
    return execFileSync('git', args, { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd() // 先頭の空白は git status の書式の一部なので残す
  } catch {
    return null
  }
}

// ツールの呼び出しを止める。reason は Claude に返る
export function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  )
  process.exit(0)
}

// プロジェクトからの相対パス(プロジェクトの外なら null)
export function relPath(file) {
  const rel = path.relative(projectDir, path.resolve(projectDir, file))
  return rel.startsWith('..') || path.isAbsolute(rel) ? null : rel.split(path.sep).join('/')
}

// .dev.vars(合言葉などのシークレット)か。見本の .dev.vars.example は除く
export function isSecretFile(rel) {
  const base = path.posix.basename(rel)
  return base.startsWith('.dev.vars') && base !== '.dev.vars.example'
}

export const SECRET_REASON = '.dev.vars は合言葉などのシークレットなので、読むことも書くこともしない決まりです(CLAUDE.md)。合言葉は本人が `wrangler secret put` で入れます。'

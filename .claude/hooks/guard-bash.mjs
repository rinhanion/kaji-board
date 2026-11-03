// PreToolUse(Bash): main ブランチでのコミットと、.dev.vars に触るコマンドを止める
import { SECRET_REASON, deny, git, readInput } from './lib.mjs'

const input = await readInput()
const command = String(input.tool_input?.command ?? '')

// 文章として書かれた部分(ヒアドキュメントの中身と、空白を含む引用符の中)は除く。
// コミットメッセージや PR 本文で「.dev.vars」と書いただけで止めないため
const code = command
  .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\2(?=\n|$)/g, ' ')
  .replace(/"[^"]*\s[^"]*"|'[^']*\s[^']*'/g, ' ')

// .dev.vars に触るコマンド(見本の .dev.vars.example は除く)
if (/\.dev\.vars(?!\.example)/.test(code)) deny(SECRET_REASON)

// main でのコミット。同じコマンドの中でブランチを切り替えているなら通す(例: git switch -c x && git commit)
const commits = /\bgit\b(\s+-C\s+\S+)?\s+commit(?![\w-])/.test(command)
const switches = /\bgit\b(\s+-C\s+\S+)?\s+(switch|checkout)\b/.test(command)
if (commits && !switches && git('branch', '--show-current') === 'main') {
  deny('main に直接コミットしない決まりです(CLAUDE.md)。Issue を作り、`git switch -c <種類>/<Issue 番号>-<説明>` でブランチを切ってからコミットしてください。')
}

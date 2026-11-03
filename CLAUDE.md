# kaji-board

家族で共有する「今日の家事」チェックボード。Cloudflare Workers + Hono + D1 + Cron、画面は素の HTML・CSS・JS(ビルドなし)。
しくみ・セットアップ・できることは README.md にある。ここには作業するときに守ることだけを書く。

## 作業の流れ

- main に直接コミット・プッシュしない。Issue → ブランチ → PR → マージ の順に進める
  - GitHub のルールセット「main を守る」で、main への直接プッシュ・強制プッシュ・削除は断られる。PR と CI の `check` が通ることが必須で、マージは squash だけ
  - ブランチ名: `<種類>/<Issue 番号>-<短い説明>`(例: `feat/1-past-days`、`test/3-automated-tests`)
  - PR 本文に `Closes #<Issue 番号>` を書く。マージは squash で、ブランチは消す
  - PR では GitHub Actions の `check`(`npm run check` と同じ)が走る。通ってからマージする
  - 設計が合意できていれば、マージまで Claude が行ってよい
- 変更したら、コミットの前に `npm run check`(型チェックとテスト)を通す
- 動きを変えたら、`test/` にテストを足す。テストは Workers の実行環境と本物の D1 の上で動く

## フック(`.claude/settings.json`)

Claude Code のフックで、上の決まりの一部を機械的に止める。止められたら、理由を読んで決まりどおりにやり直す(フックを外して通さない)。

- 作業を終えるとき: main に入っていないコードの変更があれば `npm run check` を走らせ、落ちていたら終われない
- main ブランチでの `git commit` は止まる
- `.dev.vars` に触る編集・コマンドと、main に入っている `migrations/*.sql` の編集は止まる(コミットメッセージなど文章の中に書くのはよい)

## 本番に反映する

- マージしたあと、main で行う
- `migrations/` を足したときは、先に `npm run db:migrate:remote`、そのあと `npm run deploy`(逆にすると、新しいコードが無いテーブルを読みにいく)
- テストや文書だけの変更は、反映しなくてよい

## 変えてはいけないもの

- 当て済みの `migrations/*.sql` は書き換えない。変更は新しい番号のファイルを足す
- `history` テーブルは分析用に消さずにためる。行を消す処理を足さない(画面で見せるのは 7 日前までと分けて考える)
- `.dev.vars` は読まない・書かない。合言葉は `wrangler secret put FAMILY_PASSPHRASE` で本人が入れる
- `wrangler.jsonc` の `database_id` は本番の D1。勝手に変えない

## 書き方の決まり

- 依存はなるべく増やさない。画面(`public/`)には外部ライブラリを入れない
- コードコメントは日本語。まわりのコードの書き方と量に合わせる
- 見た目は Cobalt Paper に合わせる。色や大きさは `public/style.css` の `:root` のトークンを使う
- 家事の「日付」は JST 4:00 区切り。サーバーでは `boardDate()` で求め、画面はサーバーから受け取った日付をもとにする

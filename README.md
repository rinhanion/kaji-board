# 今日の家事ボード

家族で共有する「今日の家事」チェックボード。スマホ第一、ログインなし(家族の合言葉だけ)。
Cloudflare Workers + D1 + Cron Triggers で、無料枠の範囲で動く。

## できること

- 毎日の家事にチェックを入れる(カード全体をタップ)。終わったものは薄くなって下へ移る
- だれがやったかを自動で記録する(端末ごとに最初の 1 回だけ「私は○○」を選ぶ)
- カードを長押しすると「だれがやった?」が開き、ほかの人の名前や、何人かの名前で完了にできる(代理で完了・一緒にやった)。完了済みのカードなら、やった人を付け替えられる
- チェック直後の 5 秒間は「元に戻す」が出る。終わったカードをもう一度タップしても戻せる
- 右下の ＋ で「今日だけのタスク」を追加する
- 日付の横の ‹ › で 7 日前までさかのぼれる。付け忘れたチェックを、あとから付け外しできる(その日が終わってから付けたものは「あとから記録」と出る)
- 毎朝 4:00(JST)に自動リセット: 毎日の家事はチェックを外し、今日だけのタスクは消す
- 家族ごとに色が付き、ボードのやった人と集計で見分けられる。色は設定の「家族」で 6 色から選ぶ
- 完了した家事に、やった人以外が「ありがとう」を送れる(1 つの家事に 1 人 1 回。もう一度タップで外す。過去の日にも付けられる)
- 家事 1 回と、もらった「ありがとう」1 つで 1 ポイントたまる。ポイントは「ごほうび」のページで、1 ポイント = 10 円(設定で変えられる)として、ご飯のときに使える。使った記録は残り、まちがえたら取り消せる
- 設定の「集計を見る」で、昨日までの記録を集計して見られる(7 日・30 日・ぜんぶ)。完了の割合、日ごと(長い期間は月ごと)の完了、だれが何回やったか、毎日の家事ごとの完了の割合とやった人
- 右上の設定ボタンから、毎日の家事の追加・名前変更・削除・並べ替え、家族の名前と色の変更・削除、手動リセット
- 他の家族の操作は 20 秒ごと(と、アプリを開き直したとき)に反映
- ホーム画面に追加できる(PWA)。ダークモード対応

## しくみ

| 部分 | 中身 |
| --- | --- |
| 画面 | `public/`(素の HTML・CSS・JS)。Workers の静的アセットとして配信 |
| API | `src/index.ts`(Hono)。`/api/*` だけ Worker が受ける |
| データ | D1。`migrations/` |
| リセット | Cron `0 19 * * *`(UTC 19:00 = JST 4:00) |

- **合言葉**: Worker のシークレット `FAMILY_PASSPHRASE`。正しい合言葉を入れた端末には、合言葉を鍵にした HMAC を Cookie(HttpOnly、約 400 日)で渡す。合言葉を変えると全端末で入力し直しになる。全角・半角や前後の空白の違いは同じとみなす
- **だれか**: 選んだ名前は端末の localStorage に保存する
- **過去の記録**: リセットの直前に、その日の家事を `history` テーブルへ、やった人(何人でも)を `history_doers` テーブルへ、「ありがとう」を `history_thanks` テーブルへ写す。画面で見られるのは 7 日前までだが、あとで分析できるように消さずに残す。家事や家族を消しても記録は残る(名前も写してある)。手動リセットでは写さない
- **ポイント**: ためたポイントは保存せず、やった人(`task_doers` / `history_doers`)と「ありがとう」(`task_thanks` / `history_thanks`)の記録から毎回数える。今までの記録も、今日の分も入る。保存するのは、使った記録(`point_uses`)だけ。使えるポイント = ためたポイント − 使ったポイント(取り消した分は除く)。使ったあとにチェックを外すと、マイナスになることがある
- **リセット**: 「家事の日付」(JST 4:00 区切り)を D1 に持っておき、日付が変わっていたら Cron か、その日最初のアクセスでリセットする。Cron が動かなかった日でもずれない

## セットアップ(ローカル)

Node.js 20 以上が必要。

```sh
npm install
cp .dev.vars.example .dev.vars   # 中の合言葉を好きなものに変える
npm run db:migrate:local         # ローカルの D1 にテーブルと初期データを作る
npm run dev                      # http://localhost:8787
```

同じ Wi-Fi のスマホからは `http://<Mac の IP アドレス>:8787` で開ける(`npm run dev` は `--ip 0.0.0.0` で起動する)。

### テスト

```sh
npm run check   # 型チェックとテストをまとめて走らせる(変更したら毎回これ)
npm test        # テストだけ
```

テストは `@cloudflare/vitest-plugin` で Workers の実行環境の中で動き、D1 もローカルの本物を使う(`.dev.vars` は要らない)。
日付の区切り、合言葉、チェックの付け外し、毎朝のリセットで記録が残ること、過去の日の付け外しと 7 日の範囲、集計の数え方、家族の色、「ありがとう」の決まり、ポイントの数え方と使い方を確かめる。

### リセットを試す

- 画面から: 右上の設定 → 「今すぐリセット」
- Cron を試す: `npx wrangler dev --test-scheduled` で起動し、`curl "http://localhost:8787/__scheduled?cron=0+19+*+*+*"`
  (日付が変わっていないときは何もしない。日付をまたいだ動きを試すなら、`npx wrangler d1 execute kaji-board --local --command "UPDATE meta SET value='2000-01-01'"` のあと画面を再読み込みする)

## デプロイ

Cloudflare のアカウント(無料プランで可)が必要。

```sh
npx wrangler login                     # ブラウザで Cloudflare にログイン
npx wrangler d1 create kaji-board      # 出てきた database_id を wrangler.jsonc の database_id に貼る
npm run db:migrate:remote              # 本番の D1 にテーブルと初期データを作る
npx wrangler secret put FAMILY_PASSPHRASE   # 家族の合言葉を入力
npm run deploy                         # https://kaji-board.<あなたのサブドメイン>.workers.dev
```

デプロイ後、家族のスマホでその URL を開き、合言葉を入れて「私は○○」を選ぶ。
ホーム画面への追加は、iPhone は Safari の共有ボタン →「ホーム画面に追加」、Android は Chrome のメニュー →「ホーム画面に追加」。

合言葉を変えるときは、もう一度 `npx wrangler secret put FAMILY_PASSPHRASE`。

## 無料枠の目安

20 秒ごとのポーリングは、アプリを開いている間だけ動く。家族 4 人が 1 日 30 分ずつ開いても 1 日 400 リクエスト程度で、Workers(1 日 10 万リクエスト)・D1(1 日 500 万行の読み取り)の無料枠に対して十分小さい。

## まだやっていないこと

- リアルタイム反映(Durable Objects / WebSocket)
- オフライン時の操作の保存(Service Worker)
- 合言葉の総当たり対策は、失敗時に少し待たせるだけ
- 並べ替えは ↑↓ ボタン(ドラッグではない)

## ファイル

```
.github/workflows/       CI(PR と main で npm run check)
.claude/                 Claude Code のフック(決まりを機械的に守らせる)
CLAUDE.md                作業するときに守ること(流れ・本番反映・変えてはいけないもの)
src/index.ts             API と Cron(Hono)
public/                  画面(index.html, app.js, stats.html, stats.js, rewards.html, rewards.js, style.css, manifest, アイコン)
migrations/              D1 のスキーマと初期データ
test/                    テスト(vitest。npm run check)
vitest.config.ts         テストの設定
scripts/make-icons.mjs   PNG アイコンを作る(依存なし。npm run icons)
wrangler.jsonc           Workers の設定(D1・Cron・静的アセット)
```

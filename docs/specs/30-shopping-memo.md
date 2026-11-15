# 買い物メモ

Issue: #30

## 仕様

### ねらい

「ケチャップがない」「〜が欲しい」と気づいた人が、その場でボードに書いておけるようにする。
買い物に行ける人がボードを見て、ほかの家族の欲しいものも一緒に買ってこられるようにする。
そのために、ボードの上のほうにあったポイントの行を名前の下へ小さく移し、空いた場所を買い物メモにする。

### できること

#### ポイントの見せ方(名前の下へ移す)

- 右上の名前のチップ(色の点と名前)のすぐ下に、小さく「120pt ›」と出す。数字は今までどおり、自分の使えるポイント
- 「120pt ›」をタップすると、今までどおり「ごほうび」のページ(`/rewards.html`)へ行く
- 今までボードの進み具合の下にあった、ポイントの行(「● 120 ポイント(1,200円ぶん)›」)は無くす。円の表示はボードからは消え、「ごほうび」のページで見る
- 名前を選んでいない端末(チップが「私は…」のとき)は、チップの下に小さく「ごほうび ›」と出し、タップで「ごほうび」のページへ行く(今の「ごほうびを見る」の入口を、小さくして残す)
- 設定の中の「ごほうびを見る」ボタンは今までどおり残す

#### ボードの買い物メモの欄

- ポイントの行があった場所(進み具合のバーの下)に、「買い物メモ」の欄を出す
- 欄の見出しの行: カートの印・「買い物メモ」・まだ買っていない品の数(丸い札の数字)・右はしに「＋ 書く」
- 見出しの下に、まだ買っていない品名を丸い札で並べる(書いた順)。買った ○ を付けた品は、ボードの欄には出さない
- まだ買っていない品が 1 つも無いときは、数の札を出さず、品名の代わりに「ほしいもの・切れたものを書いておくと、買い物に行く人が見られます」と出す
- 欄のどこをタップしても(「＋ 書く」も含めて)、買い物メモのシートが開く

#### 買い物メモのシート

- 見出し「買い物メモ」、その下に小さく「買ったら ○ をタップ。買ったものは明日の朝 4時に消えます」
- 品の一覧。1 行に、左から ○・品名・その下に小さく書いた人(色の点と名前)・右はしに ×
  - 並びは、まだ買っていない品(書いた順)が上、買った品がその下
- ○ をタップすると「買った」になる。○ が塗りつぶしのチェックになり、品名に取り消し線、行のふちが点線になり、名前の行が「(色の点)ひろき が買った」になる
- 「買った」の ○ をもう一度タップすると、まだ買っていない状態に戻る(名前の行も書いた人に戻る)
- 行を長押しすると「だれが買った?」が開き、家族から 1 人を選んで「買った」にできる(ほかの人が買ってきたものを代わりに付ける。家事の長押しと同じ感覚)。買った品なら、買った人を付け替えられる
- まだ買っていない品の右はしの × をタップすると、確かめてから、その品をメモから消す。買った品には × を出さない(買った記録は残すため。まちがえたら ○ を外して戻す)
- 一覧の下に入力欄(うすい字で「例: ケチャップ」)と「追加」ボタン。入力して「追加」(またはキーボードの確定)で、一覧の終わりに足される。足したあと入力欄は空になり、続けて書ける
- 下に「とじる」ボタン。シートの外をタップしても閉じる(ほかのシートと同じ)
- 書いた人・買った人は、その端末で選んでいる名前で記録する。名前を選んでいない端末でも書けるし ○ も付けられるが、その場合は名前を出さない(色の点も出さない)

### 決まりごと

- **消えるタイミング**
  - まだ買っていない品は、家事の日付が変わっても(毎朝 4:00 のリセットでも)消えない。× で消すまで残る
  - 買った ○ を付けた品は、次の朝 4:00(JST)を過ぎると一覧から見えなくなる(記録は消さない)。それまでは ○ を外して戻せる
    - 例: 15 日の 20 時に ○ を付けたら、16 日の 4:00 に消える。16 日の 2 時(家事の日付ではまだ 15 日)に付けても、16 日の 4:00 に消える
  - Cron が動かなかった日でも、その日最初のアクセスで同じように消える(家事のリセットと同じ)
- **だれが何をできるか**: 家族ならだれでも、書く・○ を付ける・○ を外す・× で消す、ができる(書いた人以外でもよい)
- **書いた人の名前**: 書いた人・買った人の名前と色は、今の家族の名前と色で出す
- **過去の日を見ているとき**: ‹ で過去の日を見ている間は、買い物メモの欄を隠す。今日に戻ると出る。名前の下のポイントは、過去の日でも今までどおり出す
- **ほかの家族の操作の反映**: ほかの端末での追加・○・×は、家事と同じく 20 秒ごと(と、アプリを開き直したとき)に反映する。シートを開いている間も反映する
- **ポイントとの関係**: 買い物メモはポイントにならない。ためたポイントの数え方は変えない
- **記録**: 買った品は、一覧から消えたあとも、何を・だれが・いつ(家事の日付)買ったかを消さずにためる(`history` と同じく、あとで分析できるように)。画面で買った記録を見せるのは今回はやらない。× で消した、まだ買っていない品は残さない

### やらないこと

- 品名をあとから書き直すこと(消して書き直す)
- 数量・お店・メモ欄など、品名以外の項目
- 並べ替え
- 「よく買うもの」の候補や、前に買ったものからの入力補助
- 買ったものの履歴を見ること、集計に入れること
- 買い物に行く人への通知

### 確かめ方

- 名前を選んだ端末で、チップの下に「(自分の使えるポイント)pt ›」が出て、タップすると「ごほうび」のページが開く
- 名前を選んでいない端末で、チップの下に「ごほうび ›」が出て、タップすると「ごほうび」のページが開く
- ボードの進み具合の下に、前のポイントの行(「〜ポイント(〜円ぶん)」)が出ない
- メモが空のとき、欄に「ほしいもの・切れたものを書いておくと、買い物に行く人が見られます」が出て、数の札は出ない
- シートで「ケチャップ」と入れて「追加」すると、一覧の終わりに「ケチャップ」と書いた人の名前が出て、ボードの欄に「ケチャップ」の札と数 1 が出る
- 空白だけを入れて「追加」しても、何も足されない
- 品名の前後の空白は取り除いて記録される
- ○ をタップすると、取り消し線と「(名前) が買った」が出て、ボードの欄からその札が消え、数が 1 減る
- 「買った」の ○ をもう一度タップすると元に戻り、ボードの欄にまた出る
- × をタップすると「「(品名)」を消しますか?」と確かめが出て、OK でシートからもボードからも消える。キャンセルなら残る
- まだ買っていない品は、朝 4:00 のリセット(日付をまたいだあとの最初のアクセスを含む)のあとも残る
- 買った品は、朝 4:00 のリセットのあと一覧から消える
- 朝 4:00 の前に ○ を外した品は、リセットのあとも残る
- 別の端末で足した品が、20 秒以内(またはアプリを開き直したとき)にボードの欄に出る
- ‹ で過去の日を見ている間は買い物メモの欄が出ず、「今日に戻る」で出る
- 名前を選んでいない端末で書いた品は、書いた人の名前が出ない。○ を付けると「買った」になり、買った人の名前は出ない
- 買い物メモを足したり ○ を付けたりしても、ポイントの数は変わらない

### 決めたこと(2026-11-15 本人と合意)

1. 品名の長さの上限は 40 文字(今日だけのタスク・家事の名前と同じ)。それを超えると入力欄でそれ以上打てない
2. まだ買っていない品と同じ品名を書いたら、足さずに、すでにあるほうを少し光らせて「もうあります」と知らせる。全角・半角や前後の空白の違いは同じとみなす(合言葉と同じ考え方)。買った品と同じ名前なら、新しく足してよい
3. × をタップしたら、消す前に「「ケチャップ」を消しますか?」と確かめる(ほかの削除と同じ確かめ方)。「OK」で消え、「キャンセル」なら何もしない。「元に戻す」は出さない
4. ボードの欄の札は 2 行ぶんまで並べ、入りきらない分は最後に「ほか N 件」の札にまとめる(ぜんぶはシートで見る)。数の札はいつも全部の数
5. 入れられる品は、まだ買っていない品で 50 件まで。超えたら「メモがいっぱいです。買ったものや要らないものを消してください」と出す
6. 書いた人・買った人の家族を設定で消しても、品は残し、名前を出さない(名前を選んでいない端末で書いたときと同じ見え方)
7. 設定の「今すぐリセット」は、買い物メモに何もしない(買った品が見えなくなるのは、家事の日付が変わったときだけ)
8. ボードの欄の品名の札をタップしても ○ は付けない。欄のどこをタップしてもシートが開くだけ
9. (設計の承認時に変更)買った品は行を消さず、記録としてためる。何を・だれが・いつ(家事の日付)買ったかを残す。一覧に出すのは、まだ買っていない品と、今日(家事の日付)買った品だけ
10. 「買った」はタップした人(その端末の名前)で付く。行の長押しで「だれが買った?」を開き、ほかの家族を選んで付けることもできる(1 人だけ)
11. 買った ○ を外したとき、同じ名前のまだ買っていない品がすでにあれば、外さずに「もうあります」と出す
12. まだ買っていない品の上限 50 件は、追加のときに見る(○ を外して 51 件になるのは止めない)
13. 買い物メモの買った記録も、`history` と同じく消さずにためる決まりとして、CLAUDE.md の「変えてはいけないもの」に書き足す
14. シートの説明の下に「長押しで、買った人を選べます」と一言出す(家事の `#long-hint` と同じ見た目)。家族が 2 人以上いて、品が 1 つ以上あるときだけ

## 設計

### 1. データ

`migrations/0006_shopping.sql` を足す。

```sql
-- 買い物メモ。まだ買っていない品は × で消すまで残す。
-- 買った品は行を消さず、何を・だれが・いつ(家事の日付)買ったかを分析用にためる(history と同じ考え方)。
-- 画面に出すのは、まだ買っていない品と、今日(家事の日付)買った品だけ。
-- 家族が消されても記録が残るよう、外部キーにはせず名前も写しておく
CREATE TABLE shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, -- 画面に出す品名(前後の空白を取り、中の空白は 1 つに詰めたもの)
  name_key TEXT NOT NULL, -- 同じ品かを見る鍵(name を NFKC でそろえたもの)
  created_at INTEGER NOT NULL,
  added_by INTEGER, -- 書いた人の members.id(名前なしは NULL。消されていることもある)
  added_by_name TEXT, -- 書いたときの名前
  bought_at INTEGER, -- 買った ○ を付けた時刻。まだなら NULL
  bought_date TEXT, -- 買った日の家事の日付(JST 4:00 区切り)。まだなら NULL
  bought_by INTEGER, -- 買った人の members.id(名前なしは NULL。消されていることもある)
  bought_by_name TEXT -- 買った人を付けたときの名前
);

-- まだ買っていない品の中では、同じ品名を 1 つまでにする(買った品とは重なってよい)
CREATE UNIQUE INDEX shopping_items_unbought ON shopping_items (name_key) WHERE bought_at IS NULL;
```

#### 買った品を残す: 日付で隠す

決めたこと 9 により、行は消さない。`bought_date` に `boardDate()` を入れ、一覧(`getBoard()`)は次の条件で読む。

```sql
WHERE s.bought_at IS NULL OR s.bought_date = ?1 -- ?1 = boardDate()
```

- 見えなくなるのは `boardDate()` が変わった瞬間(JST 4:00)。Cron や `board_date` のリセットには頼らないので、Cron が動かなかった日も、最初のアクセスを待たずに正しい(決まりごと「消えるタイミング」)。例: 15 日 20 時・16 日 2 時に ○ → どちらも `bought_date = 15 日` → 16 日 4:00 から `boardDate() = 16 日` で出なくなる
- `resetBoard()` には何も足さない。なので「今すぐリセット」は買い物メモに何もしない(決めたこと 7)
- 前の日以前に買った品は、画面からは操作できない(○ を外す・付け替える・消す、はどれも「今日の一覧に出ている品」だけ。下の API で `404`)
- 品が行として残り続けるので、CLAUDE.md の「`history` は消さずにためる」と同じ扱いにする。買った行を消す処理は足さない(× で消せるのは、まだ買っていない品だけ)
- 部分ユニークインデックスは `bought_at IS NULL` の行だけが対象なので、今日より前に買った品(`bought_at` が入っている)とは重ならない。前の日に買った「牛乳」があっても、新しく「牛乳」を書ける。今日買った「牛乳」とも重ならない(決めたこと 2)

#### 名前の持ち方

- 外部キーにしない(`history_doers` と同じ)。`members.id` は AUTOINCREMENT で使い回されないので、消した家族の id が別の人に付くことはない
- 名前も `added_by_name` / `bought_by_name` に写しておく(分析で、家族を消したあとも名前がわかるように)
- 画面に出すのは、毎回 `members` を LEFT JOIN した今の名前・色。家族を消したら JOIN が外れて `null` になり、名前を出さない(決めたこと 6。写した名前は画面には使わない)
- 「買った」と「買った人なし」を分けるため、状態は `bought_at` で持ち、`bought_by` は人だけを持つ

### 2. 品名の同一判定

- 品名は今の `cleanText(v, TITLE_MAX)` で受ける(前後の空白を取り、中の空白は 1 つに詰め、1〜40 文字か見る。全角スペースも `\s` に入る)
- 鍵は今の合言葉の `normalize()`(`NFKC` + `trim`)をそのまま使い回す。`name_key = normalize(name)`
  - `cleanText` を通したあとなので、空白はすでにそろっている。NFKC で全角英数(`ＡＢＣ`)→半角、半角カナ(`ｹﾁｬｯﾌﾟ`)→全角カナになる
  - 大文字・小文字、ひらがな・カタカナはそろえない(仕様は「全角・半角や前後の空白」まで)
- 画面でも同じ判定を先にする(サーバーに送る前に「もうあります」を出すため)。`app.js` に同じ 2 段を書く:
  `s.trim().replace(/\s+/g, ' ')` → `.normalize('NFKC').trim()`

### 3. API

`/api/board` に `shopping` を混ぜ、20 秒ごとの再読み込み・アプリを開き直したとき・ほかの操作の返り値にそのまま乗せる。別のエンドポイントで別に読みにいく案は、ポーリングが 2 本になり、`version` で古い結果を捨てる仕組みも二重になるのでとらない。

#### `getBoard()` に足すもの

batch に 1 本足す。

```sql
SELECT s.id, s.name, s.created_at AS createdAt, s.bought_at AS boughtAt,
  a.id AS addedId, a.name AS addedName, a.color AS addedColor,
  b.id AS boughtId, b.name AS boughtName, b.color AS boughtColor
FROM shopping_items s
LEFT JOIN members a ON a.id = s.added_by
LEFT JOIN members b ON b.id = s.bought_by
WHERE s.bought_at IS NULL OR s.bought_date = ?1 -- ?1 = boardDate()
ORDER BY s.bought_at IS NOT NULL, s.id
```

返す形(行を組み立て直して返す):

```ts
shopping: {
  id: number
  name: string
  createdAt: number
  boughtAt: number | null // null ならまだ買っていない
  addedBy: { id: number; name: string; color: number } | null // 書いた人(名前なし・消した家族は null)
  boughtBy: { id: number; name: string; color: number } | null // 買った人(同上。まだ買っていなければ null)
}[]
```

並びは「まだ買っていない品(書いた順)→ 買った品(書いた順)」。買った品も `id` 順にする(○ を付けた順にすると、付け外しのたびに行が入れ替わって押しまちがえやすい)。

#### 足すエンドポイント

どれも成功したら `getBoard()` を返す(今の `/api/tasks` と同じ)。`memberId` は、その端末で選んでいる名前の id。無い・いない家族なら、id も名前も NULL で記録する(SQL で `(SELECT id FROM members WHERE id = ?)` と `(SELECT name FROM members WHERE id = ?)` にする)。

「操作できる品」は、今日の一覧に出ている品(`bought_at IS NULL OR bought_date = boardDate()`)だけ。前の日に買った品・無い id は、どれも「品が無い」として扱う。

| メソッド・パス | 受け取る値 | すること |
| --- | --- | --- |
| `POST /api/shopping` | `{ name, memberId? }` | 品を足す |
| `POST /api/shopping/:id/buy` | `{ memberId?, reassign? }` | タップ(`reassign` なし): まだ買っていない品だけ、`bought_at = now, bought_date = boardDate(), bought_by(_name) = 人`。もう買った品なら何もしない(先に付けた人を優先。家事の `/check` と同じ)。長押しの「だれが買った?」(`reassign: true`): まだなら上と同じに買ったにし、今日買った品なら `bought_by(_name)` だけ入れ替える(`bought_at` / `bought_date` はそのまま) |
| `POST /api/shopping/:id/unbuy` | なし | 今日買った品を、まだ買っていないに戻す。`bought_at` `bought_date` `bought_by` `bought_by_name` を NULL |
| `DELETE /api/shopping/:id` | なし | まだ買っていない品だけ、行を消す(`WHERE id = ?1 AND bought_at IS NULL`)。× で消した品は残さない(決まりごと「記録」) |

- `/buy` と `/unbuy` を分けるのは、家事の `/check` `/uncheck` と同じ形にするため。2 回送っても結果が同じになる(ほかの端末と同時に押しても壊れない)
- 長押しで付けるのは 1 人だけ(決めたこと 10)なので、家事の `memberIds`(配列)ではなく `memberId` 1 つ。`reassign: true` のときは、いる家族の `memberId` が必須
- 上限 50 件は追加のときだけ見る。`/unbuy` で 51 件になっても止めない(決めたこと 12)

#### エラー

| 場面 | 状態コード | `error` の文言 |
| --- | --- | --- |
| 品名が空(空白だけを含む)・40 文字を超える・文字列でない | 400 | `1〜40文字で入力してください`(今のタスクと同じ文言) |
| まだ買っていない品に同じ品名がある | 409 | `もうあります`。あわせて `existingId`(すでにある品の id)を返す |
| まだ買っていない品がすでに 50 件 | 400 | `メモがいっぱいです。買ったものや要らないものを消してください` |
| `/buy` `/unbuy` で、操作できる品が無い(ほかの端末で消された・前の日に買った・無い id) | 404 | `この品はもう一覧にありません` |
| `/buy` の `reassign: true` で、`memberId` が無い・いない家族 | 400 | `買った人を選んでください` |
| `/unbuy` で、まだ買っていない品に同じ品名がある(決めたこと 11) | 409 | `もうあります`。あわせて `existingId` を返す。品は買ったのまま |
| `DELETE` で、その品が買った品 | 400 | `買った品は消せません。○ を外してから消してください`(画面は × を出さないので、ふつうは起きない) |
| `DELETE` で、その id の品が無い | 200 | エラーにしない(消したい結果にはなっている。今の `DELETE /api/tasks/:id` と同じ) |

`/unbuy` の 409 は、前もって「同じ鍵のまだ買っていない品」を SELECT して返す。すり抜けて部分ユニークインデックスにぶつかったときも、`UNIQUE constraint failed` をつかまえて 409 にする。

`POST /api/shopping` の流れ:

1. `cleanText` → だめなら 400
2. 1 本の SELECT で「同じ鍵のまだ買っていない品の id」と「まだ買っていない品の数」を取る → 重複なら 409、50 件なら 400
3. INSERT(`sort` は持たず、`id` の順を書いた順とする)。同時に足されて部分ユニークインデックスにぶつかったら、`UNIQUE constraint failed` をつかまえて 409 にする

上限 50 は `const SHOPPING_MAX = 50` として、`TITLE_MAX` の近くに置く。品名の上限は `TITLE_MAX`(40)を使い回す。

### 4. 画面

#### `public/index.html`

- `#me-btn` を `<div class="me-col">` で包み、すぐ下に `<a id="me-points" class="me-points" href="/rewards.html"><span id="me-points-text"></span><svg>›</svg></a>` を置く(モックの形)
- `#points-row`(進み具合の下のポイントの行)を消す
- その場所(`.progress` の下、`</header>` の前)に、欄を 1 つのボタンとして置く:

```html
<!-- 買い物メモ。どこをタップしてもシートが開く -->
<button id="shop" class="shop" type="button">
  <span class="shop-head">
    <svg>カートの印(モックと同じ path)</svg>
    買い物メモ <span id="shop-count" class="count"></span>
    <span class="add"><svg>＋</svg>書く</span>
  </span>
  <span id="shop-items" class="shop-items"></span>
</button>
```

- 買い物メモのシートを足す(ほかのシートと同じ `dialog.sheet` なので、外をタップで閉じる・`data-close` が今の仕組みのまま効く):

```html
<dialog id="shop-dialog" class="sheet">
  <h2>買い物メモ</h2>
  <p class="hint">買ったら ○ をタップ。買ったものは明日の朝 4時に消えます</p>
  <ul id="shop-list" class="shop-list"></ul>
  <form id="shop-form" class="shop-add">
    <input id="shop-name" maxlength="40" placeholder="例: ケチャップ" enterkeyhint="done" autocomplete="off" aria-label="品名">
    <button type="submit" class="btn primary">追加</button>
  </form>
  <p id="shop-msg" class="shop-msg" role="status"></p>
  <div class="sheet-actions">
    <button type="button" class="btn" data-close>とじる</button>
  </div>
</dialog>
```

  - 入力欄に `required` は付けない(空白だけのときはブラウザの吹き出しではなく、何もしないで終わる)
  - `maxlength="40"` で、それ以上打てない(決めたこと 1)

- 「だれが買った?」のシートを足す(行の長押しで開く):

```html
<!-- だれが買った?(買い物メモの行の長押しで開く。1 人だけ選ぶ) -->
<dialog id="buyer-dialog" class="sheet">
  <h2>だれが買った?</h2>
  <p id="buyer-item" class="hint"></p>
  <div id="buyer-list" class="me-list"></div>
  <div class="sheet-actions">
    <button type="button" class="btn" data-close>とじる</button>
  </div>
</dialog>
```

#### 「だれが買った?」: 今の `#who-dialog` を使い回さず、別のシートにする(推す)

| 案 | 中身 | 判断 |
| --- | --- | --- |
| A. 別のシート `#buyer-dialog`(推す) | `#me-dialog` と同じく、名前をタップしたらすぐ決まって閉じる。見た目は `.me-list` をそのまま使う | 1 人だけなので「選ぶ → これで完了」の 2 段がいらない。家事のシートの決まり(何人でも・未完了に戻す・ありがとうの消し方)に手を入れずにすむ |
| B. `#who-dialog` に 1 人だけの形を足す | `whoTaskId` に買い物の品も入れ、文言・ボタンを切り替える | 家事と買い物で分岐が増え、家事の長押しの動きを壊しやすい |

A にする。使い回すのは長押しの仕組み `onLongPress(el, fn)`(今のまま。長押しのあとのクリックを打ち消すので、長押しで ○ が付いてしまうことがない)と、`.me-list` の見た目だけ。

#### `public/app.js`

状態と描画:

- `apply()` で `board.shopping = data.shopping ?? []` も持つ
- `render()` の中:
  - 名前の下: 名前を選んでいれば `#me-points-text` に `<span class="num">120</span>pt`、選んでいなければ `ごほうび`。数字は今と同じ `mine.balance`
  - 今の `#points-text` の描画と、使わなくなる `formatYen()` は消す
  - `$('#shop').hidden = back > 0`(過去の日は隠す)
  - `renderShop()`(ボードの欄)を呼び、シートが開いていれば `renderShopList()` も呼ぶ(20 秒ごとの再読み込みでシートの中も変わる。入力欄は一覧の外なので、打ちかけの文字は消えない)
- `unbought()` = `board.shopping.filter((s) => !s.boughtAt)`

ボードの欄 `renderShop()`(2 行ぶんまでと「ほか N 件」):

```js
// 札を 2 行ぶんまで並べ、入りきらない分は「ほか N 件」にまとめる。
// 幅は端末で変わるので、いったん全部並べてから、置かれた位置(offsetTop)で行を数える
function renderShop() {
  const items = unbought()
  const box = $('#shop-items')
  $('#shop').classList.toggle('empty', items.length === 0)
  $('#shop-count').hidden = items.length === 0
  $('#shop-count').textContent = String(items.length) // 数の札はいつも全部の数
  if (!items.length) {
    box.replaceChildren('ほしいもの・切れたものを書いておくと、買い物に行く人が見られます')
    return
  }
  const pills = items.map((s) => h('span', { class: 'shop-pill' }, s.name))
  box.replaceChildren(...pills)
  const tops = [...new Set(pills.map((p) => p.offsetTop))].sort((a, b) => a - b)
  if (tops.length <= 2) return
  // 3 行目より下を外し、「ほか N 件」を足す。「ほか」が 3 行目に落ちたら、手前の札を 1 つずつ外す
  let shown = pills.filter((p) => p.offsetTop <= tops[1])
  const more = h('span', { class: 'shop-pill more' })
  for (;;) {
    more.textContent = `ほか ${items.length - shown.length} 件`
    box.replaceChildren(...shown, more)
    if (more.offsetTop <= tops[1] || shown.length === 0) break
    shown = shown.slice(0, -1)
  }
}
```

  - `.shop-items` に `position: relative` を付け、`offsetTop` をこの中の位置にする
  - 画面が隠れている間(合言葉の入力中など)は位置が取れず全部並ぶが、次の `render()` で直る
  - 向きを変えたときのため `window.addEventListener('resize', () => board && renderShop())`
  - 札の中の品名は 1 行に収め、長い品名は `…` で切る(`max-width: 100%` + `text-overflow: ellipsis`)

シート:

- `#shop` のクリックで `openShop()`: `#shop-msg` を空、`renderShopList()`、`showModal()`。自分で `focus()` は呼ばない(買い物に行く人が一覧を見るだけのときに、キーボードで一覧が隠れないように)
- `renderShopList()`: 1 品 1 行(`li.shop-row`、買った品は `.bought`、光らせる品は `.flash`)

```
li.shop-row[.bought][.flash]     ← onLongPress(li, () => openBuyer(s.id))
├ button.box   aria-pressed / aria-label「(品名)を買った」。中に svgCheck()
├ span.name    品名
│  └ span.by   まだ: 書いた人 [dot, 名前] / 買った: [dot, 名前, ' が買った']。人が null なら、まだ: 何も出さない、買った: 「買った」だけ
└ button.x     まだ買っていない品だけ。aria-label「(品名)を消す」。× の svg
```

  - 買った人が null(名前を選んでいない端末で付けた・消した家族)のときは、名前も色の点も出さず「買った」とだけ出す(空にすると、○ を付けたときに行の高さが変わるため)
  - 買った品には `.x` を作らない。行の右はしが空くので、`.shop-row.bought` は右の余白を `.x` の幅ぶん取り、品名の位置がずれないようにする
  - 長押しは行(`li`)に付ける。`onLongPress` はクリックを捕まえる段階(capture)で打ち消すので、行の中の ○ や × のクリックも長押しのあとは走らない。`.card` と同じく `.shop-row` に `-webkit-touch-callout: none; user-select: none` を付ける(長押しで文字の選択やメニューが出ないように)
  - 送信中の品(仮の負の id)は、○ と × を `disabled` にし、長押しもしない(サーバーの id が返る前に押されて 404 になるのを防ぐ)
  - シートの説明の下に「長押しで、買った人を選べます」の一言(`#shop-long-hint`)を出す。家族が 2 人以上で品が 1 つ以上あるときだけ(決めたこと 14)

操作(どれも今の `mutate(optimistic, method, path, body)` を使う。今日を見ているときしか開けないので、`optimistic` が受け取る `view()` は `board`):

- 追加(`#shop-form` の submit):
  1. 品名を `trim` して空白を詰める。空なら何もしない
  2. 鍵がまだ買っていない品と同じなら: その行を光らせ(`shopFlashId` に入れ、`scrollIntoView({ block: 'nearest' })`、700ms で外す。`popId` と同じやり方)、`#shop-msg` に「もうあります」。入力欄の文字はそのまま
  3. まだ買っていない品が 50 件なら `#shop-msg` に「メモがいっぱいです。買ったものや要らないものを消してください」
  4. それ以外: 入力欄を空にし(フォーカスはそのまま → 続けて書ける)、仮の id で一覧の終わりに足してから `POST /api/shopping` `{ name, memberId: meMember()?.id }`
  - 入力欄に打ち始めたら `#shop-msg` を空にする(`input` イベント)
  - 2・3 をすり抜けた(ほかの端末と同時に足した)ときのサーバーの 409・400 は、今の `mutate` どおり `alert` して読み直す
- ○: まだなら `POST /buy` `{ memberId: meMember()?.id }`(`boughtAt = Date.now()`, `boughtBy = 自分 or null` を先に描く)
- 買った ○ を外す: 同じ鍵のまだ買っていない品が一覧にあれば、送らずに、その行を光らせて `#shop-msg` に「もうあります」(決めたこと 11。追加の 2 と同じ出し方)。無ければ `POST /unbuy`(`boughtAt = null`, `boughtBy = null` を先に描く)。すり抜けたときのサーバーの 409 は `mutate` どおり `alert` して読み直す
- 長押し → `openBuyer(id)`: `#buyer-item` に「「(品名)」を買った人を選んでください」、`#buyer-list` に家族のボタン(`dot` と名前。今の買った人には `.on`)。家族が 0 人なら `#who-list` と同じ「まだ だれもいません。…」の一言
  - 名前をタップ → 閉じて `POST /buy` `{ memberId, reassign: true }`(先に `boughtAt = boughtAt ?? Date.now()`, `boughtBy = 選んだ人` を描く)
  - 今の買った人をタップしたときは、送らずに閉じるだけ
- ×(まだ買っていない品だけ): `confirm(`「${s.name}」を消しますか?`)` で OK なら、先に一覧から外して `DELETE /api/shopping/:id`(今の `removeOnce` と同じ形)
- ○・×・追加・長押しには「元に戻す」のトーストを出さない(× は確かめがあり、○ はもう一度押せば戻り、買った人はもう一度選び直せるため)

#### `public/style.css`

- 消す: `.points-row` `.points-text` `.points-row svg` `.past .points-row`
- 足す: モックの「ここから提案の見た目」のうち、次をそのまま移す(色・大きさは `:root` のトークンだけで書かれている)
  - `.top-row { align-items: flex-start; }` と `.top-actions` の `align-items: flex-start`(名前の下にポイントが出て、右の列が高くなるため)
  - `.me-col` `.me-points`(とその `.num` `svg`)
  - `.shop` `.shop-head` `.shop-head .count` `.shop-head .add` `.shop-head svg` `.shop-items` `.shop.empty .shop-items`
  - モックの `.pill` は `.shop-pill` に名前を変える(ほかの画面とぶつけない)。`max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` を足す。`.shop-pill.more` は `background: transparent; color: var(--cobalt-700); outline: 1px dashed var(--cobalt-200)` 程度
  - `.shop-list` `.shop-row` `.box` `.name` `.by` `.x` `.bought` `.shop-add`。`.box` と `.x` は `<button>` になるので `border: 0`(`.box` は今の枠線を `border` で持つので `background: transparent` だけ)、押せる大きさ 44px
  - `.shop-row` に `-webkit-touch-callout: none; -webkit-user-select: none; user-select: none;`(`.card` と同じ。長押しのため)。`.shop-row.bought` は × が無いぶん右の余白を足す
  - 「だれが買った?」は今の `.me-list` と `.me-list button.on` をそのまま使い、足す CSS は無い
- モックの `.dot` は移さない(今の `.dot` は `--c` で色を受ける形なので、そちらを使う)
- 足す: `.shop-row.flash { animation: flash 700ms ease; }` と `@keyframes flash { from { background: var(--cobalt-200); } }`、`.shop-msg { margin: var(--space-2) 0 0; min-height: 18px; color: var(--cobalt-700); font: var(--text-caption); }`
- 押すと縮んで弾む共通の選択子(86〜92 行目)に、`.shop` `.me-points` `.shop-row .box` `.shop-row .x` を足す

### 5. 日付と反映

- 買った品に `bought_date = boardDate()`(家事の日付)を持たせる。一覧は `bought_date = boardDate()` の買った品だけを出すので、JST 4:00 を過ぎた最初の読み込みから見えなくなる。`resetBoard()`・Cron・手動リセットとは関係しない
- 4:00 をまたいで画面を開いたままの端末は、次の 20 秒ごとの再読み込みで消える(サーバーが返す一覧が変わるため)
- 画面は日付を計算しない。サーバーが返す `shopping` をそのまま描く
- ほかの端末の操作: `/api/board` の 20 秒ごとの再読み込みと、`visibilitychange`(開き直したとき)で反映。シートを開いている間も `render()` から `renderShopList()` を呼ぶので反映する
- 過去の日を見ている間は、今までどおり `/api/board` も読み直しているので、今日に戻ったときは最新が出る

### 6. テストの方針

`test/helpers.ts` の `seed()` の batch の先頭に `DELETE FROM shopping_items` を足す。新しく `test/shopping.test.ts` を作る。

- 「日付が変わった」は、`board_date` を戻すのではなく、買った行の `bought_date` を `daysAgo(1)` に書き換えてつくる(見え方は `boardDate()` と `bought_date` だけで決まるため)。このファイルに `async function boughtYesterday(id)` を書く
- 「リセットでは消えない」は、`board.test.ts` と同じ `rewindBoardDate` をこのファイルにも書いて確かめる
- DB に残った記録は `env.DB` で `shopping_items` を直接読んで確かめる

| 仕様の「確かめ方」・決めたこと | `test/shopping.test.ts` で確かめること |
| --- | --- |
| 追加すると一覧の終わりに、書いた人と出る | 2 つ足すと書いた順に並び、`addedBy` が書いた人(名前・色)。`boughtAt` は null |
| 空白だけは足されない / 前後の空白を取る | `'   '` は 400 で件数は 0。`'  牛乳 '` は `牛乳` で記録される |
| 40 文字まで | 40 文字は通り、41 文字は 400 |
| 同じ品名は足さない(全角・半角・空白) | `ケチャップ` のあと `ｹﾁｬｯﾌﾟ`、`ＡＢＣ` のあと `ABC` は 409 で `existingId` が返る |
| 買った品と同じ名前なら足せる | `ケチャップ` を買ったにしたあと、`ケチャップ` を足せる(2 行になる) |
| 50 件まで | まだ買っていない品 50 件で 51 件目は 400(文言も見る)。1 件を買ったにすると、また足せる |
| ○ で買った・もう一度で戻る | `/buy` で `boughtAt` と `boughtBy`、並びが下へ。DB の `bought_date` が `today()`。`/unbuy` で両方 null(DB の 4 列も NULL)、`addedBy` はそのまま |
| 先に付けた人を優先 | ママが `/buy` したあと、パパの `/buy`(`reassign` なし)では `boughtBy` はママのまま |
| 長押しで別の人に付ける(決めたこと 10) | まだの品に `/buy` `{ memberId: 2, reassign: true }` で、買った人がパパになる。ママが買った品に同じものを送ると、パパに付け替わり、`boughtAt` は変わらない。`reassign: true` で `memberId` なし・いない家族は 400 |
| × で消える(まだ買っていない品だけ) | `DELETE` のあと一覧にも DB にも無い。買った品の `DELETE` は 400 で、行は残る。無い id の `DELETE` は 200、`/buy` は 404 |
| 名前を選んでいない端末 | `memberId` なしで足すと `addedBy` が null。`memberId` なしの `/buy` は `boughtAt` ありで `boughtBy` が null。いない家族の id も null になる |
| 日付が変わると買った品は見えなくなる | `boughtYesterday` のあと、`GET /api/board` に出ない。まだの品は出る。その品の `/unbuy` と `/buy`(`reassign`)は 404 |
| 朝 4:00 の前に ○ を外した品は残る | `/buy` → `/unbuy` した品は、`board_date` を戻して最初のアクセス(リセット)をしたあとも出る |
| まだの品はリセットで消えない | `board_date` を戻して最初のアクセス、`runCron()`、`POST /api/reset` のどれのあとも、まだの品が出る |
| 「今すぐリセット」は何もしない(決めたこと 7) | 今日買った品が、`POST /api/reset` のあとも出る(買ったのまま) |
| 買った記録が残る(決めたこと 9) | `boughtYesterday` のあとも、DB に `name` `bought_date` `bought_by` `bought_by_name` `added_by_name` が残る |
| 家族を消しても品と記録は残る(決めたこと 6) | 書いた人・買った人を `DELETE /api/members/:id` すると、品は残り `addedBy` / `boughtBy` が null。DB の `added_by_name` / `bought_by_name` は残る |
| 今の家族の名前と色で出る | `PATCH /api/members/:id` で名前・色を変えると、`addedBy` も変わる |
| ポイントは変わらない | 足す・○ の前後で `points` の `balance` が同じ |
| 同じ名前は、今日より前に買った品と重ならない | 前の日に買った `牛乳`(`boughtYesterday`)があっても `牛乳` を足せる。今日買った `牛乳` があっても足せる |
| ○ を外すと同じ名前になるとき(決めたこと 11) | 今日買った `牛乳` と、まだの `牛乳` があるとき、買ったほうの `/unbuy` は 409(`existingId` つき)で、買ったのまま |
| ○ を外して 51 件になるのは止めない(決めたこと 12) | まだの品 50 件と今日買った品 1 件で、`/unbuy` が通り 51 件になる。そのあとの追加は 400 |

画面だけの項目(名前の下の「pt ›」と「ごほうび ›」、前のポイントの行が無いこと、空のときの文、札の 2 行と「ほか N 件」、過去の日で隠れる、「もうあります」で光る、`confirm` の文言、買った品に × が出ない、長押しで「だれが買った?」が開き長押しで ○ が付かない、別の端末から 20 秒以内に出る)は、今の `test/` に画面のテストが無いので、実装のあと `npm run dev` で 2 つのタブを並べて手で確かめる。

### 7. 本番への反映

マイグレーションを足すので、マージしたあと main で `npm run db:migrate:remote` → `npm run deploy` の順にする(逆にすると、新しいコードが無い `shopping_items` を読みにいき、`/api/board` が落ちて画面ごと出なくなる)。

### 8. 変更するファイル

| ファイル | 変更 |
| --- | --- |
| `migrations/0006_shopping.sql` | 新しく作る(テーブルと部分ユニークインデックス) |
| `src/index.ts` | `SHOPPING_MAX`、`getBoard()` に `shopping`(今日の一覧の条件つき)、エンドポイント 4 つ。`resetBoard()` は変えない |
| `public/index.html` | 名前の下のポイント、`#points-row` を消す、`#shop` の欄、`#shop-dialog`、`#buyer-dialog` |
| `public/app.js` | `apply` / `render` の変更、`renderShop` / `renderShopList` / 追加・○・×・長押し(`openBuyer`)の操作、`formatYen` を消す |
| `public/style.css` | ポイントの行の CSS を消し、モックの CSS を移す(上の「style.css」のとおり) |
| `test/helpers.ts` | `seed()` に `DELETE FROM shopping_items` |
| `test/shopping.test.ts` | 新しく作る |
| `README.md` | 「しくみ」に買い物メモの 1 行(まだの品は × で消すまで残る。買った品は今日の分だけ見せ、行は消さずにためる。名前も写す)、「テスト」の確かめることに買い物メモを足す |
| `CLAUDE.md` | 「変えてはいけないもの」の `history` の行に、`shopping_items` の買った行も消さずにためることを足す(CLAUDE.md は決まりの正本なので、足すかどうかは本人の承認がいる) |

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

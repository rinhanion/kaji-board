-- 過去の日の記録。毎朝のリセットの直前に、その日の家事をまるごと写しておく。
-- 画面で見られるのは 7 日前までだが、あとで分析できるように消さずに残す。
-- 家事や家族が消されても記録が残るよう、外部キーにはせず名前も写しておく
CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- 家事の日付(JST 4:00 区切り)
  task_id INTEGER NOT NULL, -- tasks.id(消されていることもある)
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('daily', 'once')),
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  done_by INTEGER, -- members.id(消されていることもある)
  done_by_name TEXT,
  done_at INTEGER, -- 完了にした時刻。あとから付けたときは、付けた時刻
  UNIQUE (date, task_id)
);

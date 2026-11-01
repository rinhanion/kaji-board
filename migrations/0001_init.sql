-- 家族のメンバー(「私は○○」で選ぶ名前)
CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

-- 家事。kind='daily' は毎日の家事(毎朝チェックだけ外す)、'once' は今日だけ(毎朝消す)
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('daily', 'once')),
  sort INTEGER NOT NULL DEFAULT 0,
  done_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  done_at INTEGER,
  created_at INTEGER NOT NULL
);

-- board_date: 最後にリセットした「家事の日付」(JST 4:00 区切り)
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO tasks (title, kind, sort, created_at) VALUES
  ('洗濯', 'daily', 1, 0),
  ('食器洗い', 'daily', 2, 0),
  ('猫のごはん', 'daily', 3, 0),
  ('ゴミ出し', 'daily', 4, 0),
  ('掃除機', 'daily', 5, 0);

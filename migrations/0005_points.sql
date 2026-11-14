-- ポイント: 家事を 1 回やると +1、「ありがとう」を 1 つもらうと +1。
-- ためたポイントは保存せず、やった人と「ありがとう」の記録から毎回数える。
-- 保存するのは「ありがとう」と、ポイントを使った記録だけ

-- 今日の家事への「ありがとう」(送った人)。task_doers と同じ形
CREATE TABLE task_thanks (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, member_id)
);

-- 過去の日の家事への「ありがとう」。history_doers と同じく、消されても残るよう外部キーにせず名前も写す
CREATE TABLE history_thanks (
  history_id INTEGER NOT NULL, -- history.id
  member_id INTEGER NOT NULL, -- members.id(消されていることもある)
  name TEXT NOT NULL,
  PRIMARY KEY (history_id, member_id)
);

-- ポイントを使った記録。取り消しても行は消さず、canceled_at を入れる
CREATE TABLE point_uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL, -- members.id(消されていることもある)
  name TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  yen_per_point INTEGER NOT NULL, -- 使ったときの 1 ポイントの円(あとで設定を変えても変わらない)
  used_date TEXT NOT NULL, -- 使った日の家事の日付(JST 4:00 区切り)
  created_at INTEGER NOT NULL,
  canceled_at INTEGER -- 取り消した時刻。取り消していなければ NULL
);

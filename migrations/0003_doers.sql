-- やった人を何人でも付けられるようにする(一緒に干した・一緒に作った、など)。
-- 「完了かどうか・いつ」は今までどおり done_at で持つ。やった人が 0 人の完了は「だれか」

-- 今日の家事をやった人
CREATE TABLE task_doers (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, member_id)
);

-- 過去の日の家事をやった人。history と同じく、消されても残るよう外部キーにせず名前も写す
CREATE TABLE history_doers (
  history_id INTEGER NOT NULL, -- history.id
  member_id INTEGER NOT NULL, -- members.id(消されていることもある)
  name TEXT NOT NULL,
  PRIMARY KEY (history_id, member_id)
);

-- 今までの 1 人ぶんを写す。写したあとの done_by / done_by_name は使わないので空にしておく
-- (列は外部キーがあり DROP できないので残す)
INSERT INTO task_doers (task_id, member_id) SELECT id, done_by FROM tasks WHERE done_by IS NOT NULL;
INSERT INTO history_doers (history_id, member_id, name)
  SELECT id, COALESCE(done_by, 0), done_by_name FROM history WHERE done_by_name IS NOT NULL;
UPDATE tasks SET done_by = NULL;
UPDATE history SET done_by = NULL, done_by_name = NULL;

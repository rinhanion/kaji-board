-- 家族ごとの色。1〜6 の番号で持ち、実際の色は画面(style.css の --who-N)で決める
-- (ライト・ダークで色を変えられるよう、色そのものは DB に入れない)
ALTER TABLE members ADD COLUMN color INTEGER NOT NULL DEFAULT 1;

-- 今いる家族には、並び順で 1, 2, 3… と付ける
UPDATE members SET color = (
  SELECT COUNT(*) FROM members o WHERE o.sort < members.sort OR (o.sort = members.sort AND o.id < members.id)
) % 6 + 1;

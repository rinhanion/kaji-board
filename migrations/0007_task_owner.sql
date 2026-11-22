-- 毎日の家事の担当(家族 0〜1 人)。担当は家事についている決まりなので、毎朝のリセットでは外さない。
-- 家族を消したら、外部キーの ON DELETE SET NULL で「担当なし」になる。
-- 担当は目印なので history には写さない(記録には、やった人だけを残す)
ALTER TABLE tasks ADD COLUMN owner_id INTEGER REFERENCES members(id) ON DELETE SET NULL;

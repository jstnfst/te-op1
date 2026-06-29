-- packs: user-curated collections of patches, downloadable as a .zip of .aif

CREATE TABLE IF NOT EXISTS packs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_public   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pack_items (
  pack_id   INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  patch_id  INTEGER NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL DEFAULT 0,
  added_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (pack_id, patch_id)
);

CREATE INDEX IF NOT EXISTS idx_packs_user      ON packs (user_id);
CREATE INDEX IF NOT EXISTS idx_pack_items_pack ON pack_items (pack_id);

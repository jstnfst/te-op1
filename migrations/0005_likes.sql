-- likes: one per user per patch/pack. like_count is denormalized onto the
-- target row (kept in sync by functions/api/likes/[type]/[id].ts) so browse
-- sorting by popularity is a plain indexed ORDER BY.

CREATE TABLE IF NOT EXISTS likes (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT    NOT NULL,               -- 'patch' | 'pack'
  target_id   INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_target ON likes (target_type, target_id);

ALTER TABLE patches ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packs   ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_patches_likes ON patches (is_public, like_count);
CREATE INDEX IF NOT EXISTS idx_packs_likes   ON packs (is_public, like_count);

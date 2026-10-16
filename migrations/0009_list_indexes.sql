-- Indexes for the paged long lists (newest-first public scans, a user's own
-- patches and packs, a user's likes, and pack item order). The like-count
-- indexes for ?sort=likes already exist (0005).
CREATE INDEX IF NOT EXISTS idx_patches_public_created ON patches (is_public, created_at);
CREATE INDEX IF NOT EXISTS idx_patches_user_created   ON patches (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_packs_public_created   ON packs (is_public, created_at);
CREATE INDEX IF NOT EXISTS idx_packs_user_created     ON packs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_likes_user_type_created ON likes (user_id, target_type, created_at);
CREATE INDEX IF NOT EXISTS idx_pack_items_order       ON pack_items (pack_id, position);

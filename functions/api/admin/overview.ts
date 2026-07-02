import type { Env } from "../../_shared/env"
import { json } from "../../_shared/session"
import { isAdmin } from "../../_shared/admin"

// GET /api/admin/overview - the moderation console's one load: every account,
// and all public content (private content stays the owner's business).
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [users, patches, packs] = await Promise.all([
    env.DB
      .prepare(
        `SELECT u.id, u.provider, u.email, u.display_name, u.avatar_url, u.created_at,
                u.last_login, u.banned_at,
                (SELECT COUNT(*) FROM patches p WHERE p.user_id = u.id) AS patch_count,
                (SELECT COUNT(*) FROM packs k WHERE k.user_id = u.id) AS pack_count
         FROM users u ORDER BY u.created_at DESC`,
      )
      .all(),
    env.DB
      .prepare(
        `SELECT p.id, p.name, p.type, p.download_count, p.created_at,
                p.user_id, u.display_name AS author
         FROM patches p LEFT JOIN users u ON u.id = p.user_id
         WHERE p.is_public = 1 ORDER BY p.created_at DESC`,
      )
      .all(),
    env.DB
      .prepare(
        `SELECT k.id, k.name, k.created_at, k.user_id, u.display_name AS author,
                (SELECT COUNT(*) FROM pack_items pi WHERE pi.pack_id = k.id) AS item_count
         FROM packs k LEFT JOIN users u ON u.id = k.user_id
         WHERE k.is_public = 1 ORDER BY k.created_at DESC`,
      )
      .all(),
  ])
  // Mark fellow admins so the UI can show the role and hide the ban action
  // (the ban endpoint refuses to ban an admin regardless).
  const annotated = (users.results as Array<{ id: number; provider: string; email: string | null }>).map((u) => ({
    ...u,
    is_admin: isAdmin(env, { uid: u.id, provider: u.provider, email: u.email, name: null, avatar: null }),
  }))
  return json({ users: annotated, patches: patches.results, packs: packs.results })
}

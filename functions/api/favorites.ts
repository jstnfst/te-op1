import type { Env } from "../_shared/env"
import { getSessionUser, json } from "../_shared/session"

// GET /api/favorites - the signed-in user's liked patches and packs, newest
// like first. Items that went private since (and aren't the viewer's own)
// are filtered out rather than shown as dead rows.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })

  const [patches, packs] = await Promise.all([
    env.DB
      .prepare(
        `SELECT p.id, p.name, p.type, p.fx_type, p.lfo_type, p.octave, p.tags,
                p.download_count, p.created_at, p.like_count, 1 AS liked_by_me,
                u.display_name AS author
         FROM likes l
         JOIN patches p ON p.id = l.target_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE l.user_id = ?1 AND l.target_type = 'patch'
           AND (p.is_public = 1 OR p.user_id = ?1)
         ORDER BY l.created_at DESC`,
      )
      .bind(user.uid)
      .all(),
    env.DB
      .prepare(
        `SELECT k.id, k.name, k.is_public, k.created_at, k.like_count, 1 AS liked_by_me,
                u.display_name AS author,
                (SELECT COUNT(*) FROM pack_items pi WHERE pi.pack_id = k.id) AS item_count
         FROM likes l
         JOIN packs k ON k.id = l.target_id
         LEFT JOIN users u ON u.id = k.user_id
         WHERE l.user_id = ?1 AND l.target_type = 'pack'
           AND (k.is_public = 1 OR k.user_id = ?1)
         ORDER BY l.created_at DESC`,
      )
      .bind(user.uid)
      .all(),
  ])
  return json({ patches: patches.results, packs: packs.results })
}

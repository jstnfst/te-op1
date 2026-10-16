import type { Env } from "../_shared/env"
import { getSessionUser, json } from "../_shared/session"
import { pageParams, pageBody, PER_PAGE } from "../_shared/util"

// Liked rows, newest like first. Items that went private since (and aren't
// the viewer's own) are filtered out rather than shown as dead rows.
const PATCH_SQL = `SELECT p.id, p.name, p.type, p.fx_type, p.lfo_type, p.octave, p.tags,
         p.download_count, p.created_at, p.like_count, 1 AS liked_by_me,
         u.display_name AS author
  FROM likes l
  JOIN patches p ON p.id = l.target_id
  LEFT JOIN users u ON u.id = p.user_id
  WHERE l.user_id = ?1 AND l.target_type = 'patch'
    AND (p.is_public = 1 OR p.user_id = ?1)
  ORDER BY l.created_at DESC, p.id DESC`

const PACK_SQL = `SELECT k.id, k.name, k.is_public, k.created_at, k.like_count, k.download_count, 1 AS liked_by_me,
         u.display_name AS author,
         (SELECT COUNT(*) FROM pack_items pi WHERE pi.pack_id = k.id) AS item_count
  FROM likes l
  JOIN packs k ON k.id = l.target_id
  LEFT JOIN users u ON u.id = k.user_id
  WHERE l.user_id = ?1 AND l.target_type = 'pack'
    AND (k.is_public = 1 OR k.user_id = ?1)
  ORDER BY l.created_at DESC, k.id DESC`

const COUNT_SQL = {
  patch: `SELECT COUNT(*) AS n FROM likes l JOIN patches p ON p.id = l.target_id
          WHERE l.user_id = ?1 AND l.target_type = 'patch' AND (p.is_public = 1 OR p.user_id = ?1)`,
  pack: `SELECT COUNT(*) AS n FROM likes l JOIN packs k ON k.id = l.target_id
         WHERE l.user_id = ?1 AND l.target_type = 'pack' AND (k.is_public = 1 OR k.user_id = ?1)`,
}

// GET /api/favorites?kind=patch|pack&page=N - one paged list of the viewer's
// likes ({ items, total, page, hasMore }). Without ?kind, the combined
// { patches, packs } response, unpaged.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })

  const url = new URL(request.url)
  const kind = url.searchParams.get("kind")
  if (kind === "patch" || kind === "pack") {
    // Likes only change by the viewer's own hand, so no asof freeze here.
    const { page, offset } = pageParams(url)
    const [rows, count] = await Promise.all([
      env.DB.prepare(`${kind === "patch" ? PATCH_SQL : PACK_SQL} LIMIT ${PER_PAGE + 1} OFFSET ${offset}`).bind(user.uid).all(),
      env.DB.prepare(COUNT_SQL[kind]).bind(user.uid).first<{ n: number }>(),
    ])
    return json(pageBody(rows.results, count?.n ?? 0, page, null))
  }

  const [patches, packs] = await Promise.all([
    env.DB.prepare(PATCH_SQL).bind(user.uid).all(),
    env.DB.prepare(PACK_SQL).bind(user.uid).all(),
  ])
  return json({ patches: patches.results, packs: packs.results })
}

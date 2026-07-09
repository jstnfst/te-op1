import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"

const PER_PAGE = 24

// GET /api/packs/public?q=&sort= - public, searchable, cross-user pack
// discovery. Unlike GET /api/packs (the signed-in user's own packs), this
// needs no auth - mirrors GET /api/patches for the same shape, including
// ?sort=likes (popularity, ties newest-first).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  const url = new URL(request.url)
  const q = url.searchParams.get("q")
  const sort = url.searchParams.get("sort")
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1)

  const where = ["p.is_public = 1"]
  const binds: unknown[] = [user?.uid ?? 0]
  if (q) { binds.push(`%${q}%`); where.push(`p.name LIKE ?${binds.length}`) }

  const order = sort === "likes" ? "p.like_count DESC, p.created_at DESC" : "p.created_at DESC"
  const offset = (page - 1) * PER_PAGE
  const sql =
    `SELECT p.id, p.name, p.is_public, p.created_at, p.like_count, p.download_count, u.display_name AS author,
            (SELECT COUNT(*) FROM pack_items pi WHERE pi.pack_id = p.id) AS item_count,
            (l.user_id IS NOT NULL) AS liked_by_me
     FROM packs p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN likes l ON l.target_type = 'pack' AND l.target_id = p.id AND l.user_id = ?1
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}
     LIMIT ${PER_PAGE + 1} OFFSET ${offset}`
  const rows = await env.DB.prepare(sql).bind(...binds).all()
  const all = rows.results as Record<string, unknown>[]
  return json({ items: all.slice(0, PER_PAGE), page, hasMore: all.length > PER_PAGE })
}

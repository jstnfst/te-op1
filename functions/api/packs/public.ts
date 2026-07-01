import type { Env } from "../../_shared/env"
import { json } from "../../_shared/session"

const PER_PAGE = 24

// GET /api/packs/public?q= - public, searchable, cross-user pack discovery.
// Unlike GET /api/packs (the signed-in user's own packs), this needs no auth -
// mirrors GET /api/patches for the same public/searchable/paginated shape.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const q = url.searchParams.get("q")
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1)

  const where = ["p.is_public = 1"]
  const binds: unknown[] = []
  if (q) { binds.push(`%${q}%`); where.push(`p.name LIKE ?${binds.length}`) }

  const offset = (page - 1) * PER_PAGE
  const sql =
    `SELECT p.id, p.name, p.is_public, p.created_at, u.display_name AS author,
            (SELECT COUNT(*) FROM pack_items pi WHERE pi.pack_id = p.id) AS item_count
     FROM packs p LEFT JOIN users u ON u.id = p.user_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.created_at DESC
     LIMIT ${PER_PAGE + 1} OFFSET ${offset}`
  const rows = await env.DB.prepare(sql).bind(...binds).all()
  const all = rows.results as Record<string, unknown>[]
  return json({ items: all.slice(0, PER_PAGE), page, hasMore: all.length > PER_PAGE })
}

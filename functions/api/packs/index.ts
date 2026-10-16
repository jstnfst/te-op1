import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"
import { pageParams, pageBody, PER_PAGE } from "../../_shared/util"

// GET /api/packs - the signed-in user's packs (with item counts), newest first.
// ?q= filters by name (the Add to pack menu). With ?page=N it is a paged list
// ({ items, total, page, hasMore, asof }); without it, every pack in one list.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim()
  const { paged, page, offset, asof: asofIn } = pageParams(url)

  const where = ["p.user_id = ?1"]
  const binds: unknown[] = [user.uid]
  if (q) { binds.push(`%${q}%`); where.push(`p.name LIKE ?${binds.length}`) }
  let asof: number | null = null
  if (paged) {
    asof = asofIn ?? (await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM packs WHERE user_id = ?1").bind(user.uid).first<{ m: number }>())?.m ?? 0
    binds.push(asof); where.push(`p.id <= ?${binds.length}`)
  }
  const sql =
    `SELECT p.id, p.name, p.is_public, p.created_at, p.like_count, p.download_count,
            (SELECT COUNT(*) FROM pack_items pi WHERE pi.pack_id = p.id) AS item_count,
            (l.user_id IS NOT NULL) AS liked_by_me
     FROM packs p
     LEFT JOIN likes l ON l.target_type = 'pack' AND l.target_id = p.id AND l.user_id = ?1
     WHERE ${where.join(" AND ")} ORDER BY p.created_at DESC, p.id DESC`
  if (!paged) {
    const rows = await env.DB.prepare(sql).bind(...binds).all()
    return json({ items: rows.results })
  }
  const [rows, count] = await Promise.all([
    env.DB.prepare(`${sql} LIMIT ${PER_PAGE + 1} OFFSET ${offset}`).bind(...binds).all(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM packs p WHERE ${where.join(" AND ")}`).bind(...binds).first<{ n: number }>(),
  ])
  return json(pageBody(rows.results, count?.n ?? 0, page, asof))
}

// POST /api/packs { name } - create a pack.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return json({ error: "Bad body." }, { status: 400 }) }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : ""
  if (!name) return json({ error: "Pack name is required." }, { status: 400 })
  const packCount = await env.DB.prepare("SELECT COUNT(*) AS c FROM packs WHERE user_id = ?1").bind(user.uid).first<{ c: number }>()
  if ((packCount?.c ?? 0) >= 100) return json({ error: "Pack limit reached (100 per account)." }, { status: 429 })
  const res = await env.DB.prepare("INSERT INTO packs (user_id, name) VALUES (?1, ?2)").bind(user.uid, name).run()
  return json({ id: res.meta.last_row_id, name }, { status: 201 })
}

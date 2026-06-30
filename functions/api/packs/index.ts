import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"

// GET /api/packs - the signed-in user's packs (with item counts).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  const rows = await env.DB
    .prepare(
      `SELECT p.id, p.name, p.is_public, p.created_at,
              (SELECT COUNT(*) FROM pack_items pi WHERE pi.pack_id = p.id) AS item_count
       FROM packs p WHERE p.user_id = ?1 ORDER BY p.created_at DESC`,
    )
    .bind(user.uid)
    .all()
  return json({ items: rows.results })
}

// POST /api/packs { name } - create a pack.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return json({ error: "Bad body." }, { status: 400 }) }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : ""
  if (!name) return json({ error: "Pack name is required." }, { status: 400 })
  const res = await env.DB.prepare("INSERT INTO packs (user_id, name) VALUES (?1, ?2)").bind(user.uid, name).run()
  return json({ id: res.meta.last_row_id, name }, { status: 201 })
}

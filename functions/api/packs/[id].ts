import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"
import { isAdmin } from "../../_shared/admin"

interface PackRow {
  id: number
  user_id: number
  name: string
  is_public: number
  created_at: string
  author: string | null
}

function loadPack(env: Env, id: number) {
  return env.DB
    .prepare("SELECT p.*, u.display_name AS author FROM packs p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?1")
    .bind(id)
    .first<PackRow>()
}

// GET /api/packs/:id - detail + items. Public packs are visible to anyone; a
// non-owner viewing a public pack only sees its public patches.
export const onRequestGet: PagesFunction<Env> = async ({ params, env, request }) => {
  const id = parseInt(String(params.id), 10)
  if (!Number.isInteger(id)) return json({ error: "Bad id." }, { status: 400 })
  const pack = await loadPack(env, id)
  if (!pack) return json({ error: "Not found." }, { status: 404 })
  const user = await getSessionUser(request, env)
  const isOwner = !!user && user.uid === pack.user_id
  // Admin can view a private pack too (a pack just taken private stays inspectable).
  if (!pack.is_public && !isOwner && !isAdmin(env, user)) return json({ error: "Not found." }, { status: 404 })

  const visibility = isOwner ? "" : "AND pat.is_public = 1"
  const rows = await env.DB
    .prepare(
      `SELECT pat.id, pat.name, pat.type, pat.fx_type, pat.lfo_type, pat.octave, pat.tags,
              pat.download_count, pat.created_at, u.display_name AS author
       FROM pack_items pi
       JOIN patches pat ON pat.id = pi.patch_id
       LEFT JOIN users u ON u.id = pat.user_id
       WHERE pi.pack_id = ?1 ${visibility}
       ORDER BY pi.position, pi.added_at`,
    )
    .bind(id)
    .all()

  return json({
    id: pack.id, name: pack.name, is_public: pack.is_public, author: pack.author,
    created_at: pack.created_at, is_owner: isOwner, items: rows.results,
  })
}

// PATCH /api/packs/:id - owner (or admin, for moderation): rename or toggle public.
export const onRequestPatch: PagesFunction<Env> = async ({ params, env, request }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  const id = parseInt(String(params.id), 10)
  const pack = await loadPack(env, id)
  if (!pack || (pack.user_id !== user.uid && !isAdmin(env, user))) return json({ error: "Not found." }, { status: 404 })

  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return json({ error: "Bad body." }, { status: 400 }) }
  const sets: string[] = []
  const binds: unknown[] = []
  if (typeof body.name === "string" && body.name.trim()) { binds.push(body.name.trim().slice(0, 80)); sets.push(`name = ?${binds.length}`) }
  if (typeof body.is_public === "boolean") { binds.push(body.is_public ? 1 : 0); sets.push(`is_public = ?${binds.length}`) }
  if (!sets.length) return json({ error: "Nothing to update." }, { status: 400 })
  sets.push("updated_at = datetime('now')")
  binds.push(id)
  await env.DB.prepare(`UPDATE packs SET ${sets.join(", ")} WHERE id = ?${binds.length}`).bind(...binds).run()
  return json({ ok: true })
}

// DELETE /api/packs/:id - owner, or admin (moderation takedown).
export const onRequestDelete: PagesFunction<Env> = async ({ params, env, request }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  const id = parseInt(String(params.id), 10)
  const res = isAdmin(env, user)
    ? await env.DB.prepare("DELETE FROM packs WHERE id = ?1").bind(id).run()
    : await env.DB.prepare("DELETE FROM packs WHERE id = ?1 AND user_id = ?2").bind(id, user.uid).run()
  if (!res.meta.changes) return json({ error: "Not found." }, { status: 404 })
  return json({ ok: true })
}

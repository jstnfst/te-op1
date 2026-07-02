import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"
import { validatePreset } from "../../_shared/validate"
import { deriveTags } from "../../_shared/tags"
import { isAdmin } from "../../_shared/admin"

interface PatchRow {
  id: number
  user_id: number | null
  name: string
  type: string
  fx_type: string | null
  lfo_type: string | null
  octave: number
  json: string
  tags: string
  is_public: number
  download_count: number
  created_at: string
  author: string | null
}

async function load(env: Env, id: number) {
  return env.DB
    .prepare(
      `SELECT p.*, u.display_name AS author FROM patches p
       LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?1`,
    )
    .bind(id)
    .first<PatchRow>()
}

// GET /api/patches/:id - detail (public patches, or the owner's own).
export const onRequestGet: PagesFunction<Env> = async ({ params, env, request }) => {
  const id = parseInt(String(params.id), 10)
  if (!Number.isInteger(id)) return json({ error: "Bad id." }, { status: 400 })
  const row = await load(env, id)
  if (!row) return json({ error: "Not found." }, { status: 404 })
  const user = await getSessionUser(request, env)
  if (!row.is_public) {
    // Owner, or admin (so a patch just taken private stays inspectable).
    if (!user || (user.uid !== row.user_id && !isAdmin(env, user))) return json({ error: "Not found." }, { status: 404 })
  }
  const is_owner = !!(user && user.uid === row.user_id)
  // can_edit gates the tag editor UI; the PATCH handler enforces the same rule.
  const can_edit = is_owner || isAdmin(env, user)
  const liked = user
    ? await env.DB
        .prepare("SELECT 1 AS x FROM likes WHERE user_id = ?1 AND target_type = 'patch' AND target_id = ?2")
        .bind(user.uid, id)
        .first()
    : null
  return json({
    id: row.id, name: row.name, type: row.type, fx_type: row.fx_type, lfo_type: row.lfo_type,
    octave: row.octave, tags: row.tags, author: row.author, created_at: row.created_at,
    download_count: row.download_count, preset: JSON.parse(row.json), is_owner, can_edit,
    like_count: (row as PatchRow & { like_count?: number }).like_count ?? 0, liked_by_me: !!liked,
  })
}

// PATCH /api/patches/:id - owner (or admin, for moderation): rename, toggle
// public, or replace JSON.
export const onRequestPatch: PagesFunction<Env> = async ({ params, env, request }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  const id = parseInt(String(params.id), 10)
  const row = await load(env, id)
  if (!row || (row.user_id !== user.uid && !isAdmin(env, user))) return json({ error: "Not found." }, { status: 404 })

  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return json({ error: "Bad body." }, { status: 400 }) }

  const sets: string[] = []
  const binds: unknown[] = []
  if (typeof body.name === "string" && body.name.trim()) { binds.push(body.name.trim()); sets.push(`name = ?${binds.length}`) }
  if (typeof body.is_public === "boolean") { binds.push(body.is_public ? 1 : 0); sets.push(`is_public = ?${binds.length}`) }
  if (typeof body.tags === "string") {
    const normalized = [...new Set(body.tags.split(",").map((t: string) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")).filter(Boolean))].join(",")
    binds.push(normalized); sets.push(`tags = ?${binds.length}`)
  }
  if (body.json !== undefined) {
    const v = validatePreset(body.json)
    if (!v.ok || !v.json || !v.meta) return json({ error: v.error || "Invalid preset." }, { status: 400 })
    binds.push(v.json); sets.push(`json = ?${binds.length}`)
    binds.push(deriveTags(JSON.parse(v.json)).join(",")); sets.push(`tags = ?${binds.length}`)
    binds.push(v.meta.type); sets.push(`type = ?${binds.length}`)
  }
  if (!sets.length) return json({ error: "Nothing to update." }, { status: 400 })
  sets.push("updated_at = datetime('now')")
  binds.push(id)
  await env.DB.prepare(`UPDATE patches SET ${sets.join(", ")} WHERE id = ?${binds.length}`).bind(...binds).run()
  return json({ ok: true })
}

// DELETE /api/patches/:id - owner, or admin (moderation takedown).
export const onRequestDelete: PagesFunction<Env> = async ({ params, env, request }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  const id = parseInt(String(params.id), 10)
  const res = isAdmin(env, user)
    ? await env.DB.prepare("DELETE FROM patches WHERE id = ?1").bind(id).run()
    : await env.DB.prepare("DELETE FROM patches WHERE id = ?1 AND user_id = ?2").bind(id, user.uid).run()
  if (!res.meta.changes) return json({ error: "Not found." }, { status: 404 })
  return json({ ok: true })
}

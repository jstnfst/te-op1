import type { Env } from "../../../_shared/env"
import { getSessionUser, json } from "../../../_shared/session"

function ownedPack(env: Env, packId: number, uid: number) {
  return env.DB.prepare("SELECT user_id FROM packs WHERE id = ?1").bind(packId).first<{ user_id: number }>()
    .then((p) => (p && p.user_id === uid ? p : null))
}

// POST /api/packs/:id/items { patch_id } — owner adds a patch (must be public or owned).
export const onRequestPost: PagesFunction<Env> = async ({ params, env, request }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  const packId = parseInt(String(params.id), 10)
  if (!(await ownedPack(env, packId, user.uid))) return json({ error: "Not found." }, { status: 404 })

  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return json({ error: "Bad body." }, { status: 400 }) }
  const patchId = Number.isInteger(body.patch_id) ? (body.patch_id as number) : 0
  if (!patchId) return json({ error: "patch_id is required." }, { status: 400 })

  const patch = await env.DB.prepare("SELECT id, is_public, user_id FROM patches WHERE id = ?1")
    .bind(patchId).first<{ id: number; is_public: number; user_id: number }>()
  if (!patch || (!patch.is_public && patch.user_id !== user.uid)) return json({ error: "Patch not found." }, { status: 404 })

  const pos = await env.DB.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM pack_items WHERE pack_id = ?1")
    .bind(packId).first<{ p: number }>()
  await env.DB.prepare("INSERT OR IGNORE INTO pack_items (pack_id, patch_id, position) VALUES (?1, ?2, ?3)")
    .bind(packId, patchId, pos?.p ?? 0).run()
  return json({ ok: true })
}

// DELETE /api/packs/:id/items { patch_id } — owner removes a patch.
export const onRequestDelete: PagesFunction<Env> = async ({ params, env, request }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  const packId = parseInt(String(params.id), 10)
  if (!(await ownedPack(env, packId, user.uid))) return json({ error: "Not found." }, { status: 404 })

  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return json({ error: "Bad body." }, { status: 400 }) }
  const patchId = Number.isInteger(body.patch_id) ? (body.patch_id as number) : 0
  await env.DB.prepare("DELETE FROM pack_items WHERE pack_id = ?1 AND patch_id = ?2").bind(packId, patchId).run()
  return json({ ok: true })
}

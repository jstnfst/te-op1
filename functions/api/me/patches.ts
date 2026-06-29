import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"

interface PackGroup {
  id: number
  name: string
  patch_ids: number[]
}

// GET /api/me/patches — the signed-in user's own patches, plus their packs with
// the patch ids each contains (so pickers can group patches by pack).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })
  const rows = await env.DB
    .prepare(
      `SELECT id, name, type, fx_type, lfo_type, octave, tags, is_public, download_count, created_at
       FROM patches WHERE user_id = ?1 ORDER BY created_at DESC`,
    )
    .bind(user.uid)
    .all()

  // Packs (owner) joined to their items; LEFT JOIN keeps empty packs out of the
  // groups list (patch_id is null) while still preserving pack order.
  const packRows = await env.DB
    .prepare(
      `SELECT p.id, p.name, pi.patch_id
       FROM packs p
       LEFT JOIN pack_items pi ON pi.pack_id = p.id
       WHERE p.user_id = ?1
       ORDER BY p.created_at DESC, pi.position, pi.added_at`,
    )
    .bind(user.uid)
    .all()
  const packs = new Map<number, PackGroup>()
  for (const r of packRows.results as { id: number; name: string; patch_id: number | null }[]) {
    let g = packs.get(r.id)
    if (!g) { g = { id: r.id, name: r.name, patch_ids: [] }; packs.set(r.id, g) }
    if (r.patch_id != null) g.patch_ids.push(r.patch_id)
  }
  return json({ items: rows.results, packs: [...packs.values()] })
}

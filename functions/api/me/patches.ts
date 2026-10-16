import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"
import { pageParams, pageBody, PER_PAGE } from "../../_shared/util"

interface PackGroup {
  id: number
  name: string
  patch_ids: number[]
}

// GET /api/me/patches - the signed-in user's own patches, plus their packs with
// the patch ids each contains (so pickers can group patches by pack).
// With ?page=N it is a paged list instead ({ items, total, page, hasMore, asof },
// no pack groups) for the Mine page; without it, the full response stays for
// patch.html's "your patches" picker.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in." }, { status: 401 })

  const { paged, page, offset, asof: asofIn } = pageParams(new URL(request.url))
  if (paged) {
    const asof = asofIn ?? (await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM patches WHERE user_id = ?1").bind(user.uid).first<{ m: number }>())?.m ?? 0
    const [rows, count] = await Promise.all([
      env.DB
        .prepare(
          `SELECT p.id, p.name, p.type, p.fx_type, p.lfo_type, p.octave, p.tags, p.is_public,
                  p.download_count, p.created_at, p.like_count,
                  (l.user_id IS NOT NULL) AS liked_by_me
           FROM patches p
           LEFT JOIN likes l ON l.target_type = 'patch' AND l.target_id = p.id AND l.user_id = ?1
           WHERE p.user_id = ?1 AND p.id <= ?2
           ORDER BY p.created_at DESC, p.id DESC
           LIMIT ${PER_PAGE + 1} OFFSET ${offset}`,
        )
        .bind(user.uid, asof)
        .all(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM patches WHERE user_id = ?1 AND id <= ?2").bind(user.uid, asof).first<{ n: number }>(),
    ])
    return json(pageBody(rows.results, count?.n ?? 0, page, asof))
  }

  const rows = await env.DB
    .prepare(
      `SELECT p.id, p.name, p.type, p.fx_type, p.lfo_type, p.octave, p.tags, p.is_public,
              p.download_count, p.created_at, p.like_count,
              (l.user_id IS NOT NULL) AS liked_by_me
       FROM patches p
       LEFT JOIN likes l ON l.target_type = 'patch' AND l.target_id = p.id AND l.user_id = ?1
       WHERE p.user_id = ?1 ORDER BY p.created_at DESC`,
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

import type { Env } from "../../../_shared/env"
import { getSessionUser, json } from "../../../_shared/session"
import { isAdmin } from "../../../_shared/admin"
import { pageParams, pageBody, PER_PAGE } from "../../../_shared/util"

const MAX_PACK_SIZE = 200

function ownedPack(env: Env, packId: number, uid: number) {
  return env.DB.prepare("SELECT user_id FROM packs WHERE id = ?1").bind(packId).first<{ user_id: number }>()
    .then((p) => (p && p.user_id === uid ? p : null))
}

// GET /api/packs/:id/items?page=N - the pack's patches in pack order, paged
// ({ items, total, page, hasMore }). ?ids=1 returns just { ids } in order, for
// Select all (a pack holds at most MAX_PACK_SIZE). Visibility as the pack page:
// the owner sees private patches too; others see a public pack's public ones.
export const onRequestGet: PagesFunction<Env> = async ({ params, env, request }) => {
  const packId = parseInt(String(params.id), 10)
  if (!Number.isInteger(packId)) return json({ error: "Bad id." }, { status: 400 })
  const pack = await env.DB.prepare("SELECT user_id, is_public FROM packs WHERE id = ?1")
    .bind(packId).first<{ user_id: number; is_public: number }>()
  if (!pack) return json({ error: "Not found." }, { status: 404 })
  const user = await getSessionUser(request, env)
  const isOwner = !!user && user.uid === pack.user_id
  if (!pack.is_public && !isOwner && !isAdmin(env, user)) return json({ error: "Not found." }, { status: 404 })

  const visibility = isOwner ? "" : "AND pat.is_public = 1"
  const url = new URL(request.url)
  // ?list=1: every visible patch as { id, name, author, is_mine }, in pack
  // order - one request for the patch editor's Patch picker (≤ MAX_PACK_SIZE).
  if (url.searchParams.get("list")) {
    const rows = await env.DB
      .prepare(`SELECT pat.id, pat.name, u.display_name AS author, (pat.user_id = ?2) AS is_mine
                FROM pack_items pi JOIN patches pat ON pat.id = pi.patch_id
                LEFT JOIN users u ON u.id = pat.user_id
                WHERE pi.pack_id = ?1 ${visibility} ORDER BY pi.position, pi.added_at LIMIT ${MAX_PACK_SIZE}`)
      .bind(packId, user?.uid ?? 0).all()
    return json({ items: rows.results })
  }
  if (url.searchParams.get("ids")) {
    const rows = await env.DB
      .prepare(`SELECT pat.id FROM pack_items pi JOIN patches pat ON pat.id = pi.patch_id
                WHERE pi.pack_id = ?1 ${visibility} ORDER BY pi.position, pi.added_at LIMIT ${MAX_PACK_SIZE}`)
      .bind(packId).all<{ id: number }>()
    return json({ ids: rows.results.map((r) => r.id) })
  }

  const { page, offset } = pageParams(url)
  const [rows, count] = await Promise.all([
    env.DB
      .prepare(
        `SELECT pat.id, pat.name, pat.type, pat.fx_type, pat.lfo_type, pat.octave, pat.tags,
                pat.download_count, pat.created_at, pat.like_count, u.display_name AS author,
                (l.user_id IS NOT NULL) AS liked_by_me
         FROM pack_items pi
         JOIN patches pat ON pat.id = pi.patch_id
         LEFT JOIN users u ON u.id = pat.user_id
         LEFT JOIN likes l ON l.target_type = 'patch' AND l.target_id = pat.id AND l.user_id = ?2
         WHERE pi.pack_id = ?1 ${visibility}
         ORDER BY pi.position, pi.added_at
         LIMIT ${PER_PAGE + 1} OFFSET ${offset}`,
      )
      .bind(packId, user?.uid ?? 0)
      .all(),
    env.DB
      .prepare(`SELECT COUNT(*) AS n FROM pack_items pi JOIN patches pat ON pat.id = pi.patch_id WHERE pi.pack_id = ?1 ${visibility}`)
      .bind(packId).first<{ n: number }>(),
  ])
  return json(pageBody(rows.results, count?.n ?? 0, page, null))
}

// POST /api/packs/:id/items { patch_id } - owner adds a patch (must be public or owned).
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

  const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM pack_items WHERE pack_id = ?1")
    .bind(packId).first<{ c: number }>()
  if ((count?.c ?? 0) >= MAX_PACK_SIZE) return json({ error: `Packs are limited to ${MAX_PACK_SIZE} patches.` }, { status: 400 })

  const pos = await env.DB.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM pack_items WHERE pack_id = ?1")
    .bind(packId).first<{ p: number }>()
  await env.DB.prepare("INSERT OR IGNORE INTO pack_items (pack_id, patch_id, position) VALUES (?1, ?2, ?3)")
    .bind(packId, patchId, pos?.p ?? 0).run()
  return json({ ok: true })
}

// DELETE /api/packs/:id/items { patch_id } - owner removes a patch.
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

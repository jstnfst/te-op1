import type { Env } from "../../../_shared/env"
import { getSessionUser } from "../../../_shared/session"
import { buildAif } from "../../../_shared/aif"
import { buildZip } from "../../../_shared/zip"
import { slug } from "../../../_shared/util"

// GET /api/packs/:id/download - zip of the pack's .aif files. Public packs are
// downloadable by anyone (only their public patches are included); private packs
// only by the owner.
export const onRequestGet: PagesFunction<Env> = async ({ params, env, request }) => {
  const id = parseInt(String(params.id), 10)
  if (!Number.isInteger(id)) return new Response("Bad id", { status: 400 })
  const pack = await env.DB.prepare("SELECT id, user_id, name, is_public FROM packs WHERE id = ?1")
    .bind(id).first<{ id: number; user_id: number; name: string; is_public: number }>()
  if (!pack) return new Response("Not found", { status: 404 })

  const user = await getSessionUser(request, env)
  const isOwner = !!user && user.uid === pack.user_id
  if (!pack.is_public && !isOwner) return new Response("Not found", { status: 404 })

  const visibility = isOwner ? "" : "AND pat.is_public = 1"
  const rows = await env.DB
    .prepare(
      `SELECT pat.name, pat.json FROM pack_items pi
       JOIN patches pat ON pat.id = pi.patch_id
       WHERE pi.pack_id = ?1 ${visibility}
       ORDER BY pi.position, pi.added_at`,
    )
    .bind(id)
    .all<{ name: string; json: string }>()
  if (!rows.results.length) return new Response("This pack has no downloadable patches.", { status: 404 })

  const zip = await buildZip(rows.results.map((p) => ({ name: slug(p.name) + ".aif", bytes: buildAif(p.json) })))
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug(pack.name, "pack")}.zip"`,
      "Cache-Control": "no-store",
    },
  })
}

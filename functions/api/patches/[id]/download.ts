import type { Env } from "../../../_shared/env"
import { buildAif } from "../../../_shared/aif"
import { getSessionUser } from "../../../_shared/session"
import { slug } from "../../../_shared/util"

// GET /api/patches/:id/download — reconstruct and return the .aif.
export const onRequestGet: PagesFunction<Env> = async ({ params, env, request }) => {
  const id = parseInt(String(params.id), 10)
  if (!Number.isInteger(id)) return new Response("Bad id", { status: 400 })

  const row = await env.DB
    .prepare("SELECT id, user_id, name, json, is_public FROM patches WHERE id = ?1")
    .bind(id)
    .first<{ id: number; user_id: number | null; name: string; json: string; is_public: number }>()
  if (!row) return new Response("Not found", { status: 404 })
  if (!row.is_public) {
    const user = await getSessionUser(request, env)
    if (!user || user.uid !== row.user_id) return new Response("Not found", { status: 404 })
  }

  const bytes = buildAif(row.json)
  // best-effort download counter (don't block the response on it)
  await env.DB.prepare("UPDATE patches SET download_count = download_count + 1 WHERE id = ?1").bind(id).run()

  return new Response(bytes, {
    headers: {
      "Content-Type": "audio/x-aiff",
      "Content-Disposition": `attachment; filename="${slug(row.name)}.aif"`,
      "Cache-Control": "no-store",
    },
  })
}

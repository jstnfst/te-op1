import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"
import { buildAif } from "../../_shared/aif"
import { buildZip } from "../../_shared/zip"
import { slug } from "../../_shared/util"

const MAX_IDS = 200

// POST /api/patches/zip { ids: number[] } - bundle the selected patches' .aif
// files into a .zip. Gated by functions/api/patches/_middleware.ts (session
// required); a patch is included only if it's public or owned by the requester.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in to download patches." }, { status: 401 })

  let body: { ids?: unknown }
  try { body = (await request.json()) as { ids?: unknown } } catch { return json({ error: "Expected a JSON body." }, { status: 400 }) }
  const ids = Array.isArray(body.ids)
    ? (body.ids.filter((x) => Number.isInteger(x)) as number[])
    : []
  if (!ids.length) return json({ error: "No patches selected." }, { status: 400 })
  if (ids.length > MAX_IDS) return json({ error: `Select at most ${MAX_IDS} patches at a time.` }, { status: 400 })

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",")
  const rows = await env.DB
    .prepare(
      `SELECT id, name, json FROM patches
       WHERE id IN (${placeholders}) AND (is_public = 1 OR user_id = ?${ids.length + 1})`,
    )
    .bind(...ids, user.uid)
    .all<{ id: number; name: string; json: string }>()
  const patches = rows.results
  if (!patches.length) return json({ error: "Nothing to download." }, { status: 404 })

  const zip = await buildZip(patches.map((p) => ({ name: slug(p.name) + ".aif", bytes: buildAif(p.json) })))
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="op1-patches.zip"',
      "Cache-Control": "no-store",
    },
  })
}

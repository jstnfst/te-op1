import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"

// GET /api/me/patches — the signed-in user's own patches.
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
  return json({ items: rows.results })
}

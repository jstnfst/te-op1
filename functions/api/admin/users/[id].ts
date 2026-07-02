import type { Env } from "../../../_shared/env"
import { json } from "../../../_shared/session"
import { isAdmin } from "../../../_shared/admin"

// PATCH /api/admin/users/:id - { banned: boolean }. Ban blocks login (oauth
// callback) and kills live sessions (functions/api/_middleware.ts).
export const onRequestPatch: PagesFunction<Env> = async ({ params, env, request }) => {
  const id = parseInt(String(params.id), 10)
  if (!Number.isInteger(id)) return json({ error: "Bad id." }, { status: 400 })

  let body: { banned?: unknown }
  try { body = (await request.json()) as { banned?: unknown } } catch { return json({ error: "Bad body." }, { status: 400 }) }
  if (typeof body.banned !== "boolean") return json({ error: "Expected { banned: boolean }." }, { status: 400 })

  const target = await env.DB
    .prepare("SELECT id, provider, email FROM users WHERE id=?1")
    .bind(id)
    .first<{ id: number; provider: string; email: string | null }>()
  if (!target) return json({ error: "Not found." }, { status: 404 })

  // Admins (self included) can't be banned; drop them from ADMIN_EMAILS first.
  if (body.banned && isAdmin(env, { uid: target.id, provider: target.provider, email: target.email, name: null, avatar: null })) {
    return json({ error: "Administrators can't be banned. Remove the email from ADMIN_EMAILS first." }, { status: 400 })
  }

  await env.DB
    .prepare(`UPDATE users SET banned_at = ${body.banned ? "datetime('now')" : "NULL"} WHERE id=?1`)
    .bind(id)
    .run()
  return json({ ok: true })
}

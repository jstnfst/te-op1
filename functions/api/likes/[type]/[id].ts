import type { Env } from "../../../_shared/env"
import { getSessionUser, json } from "../../../_shared/session"

const TABLES = { patch: "patches", pack: "packs" } as const
type TargetType = keyof typeof TABLES

// PUT /api/likes/:type/:id - like; DELETE - unlike. Both idempotent. The
// denormalized like_count on the target row recounts from the likes table in
// the same batch, so it can't drift.
async function setLike(request: Request, env: Env, params: Record<string, unknown>, liked: boolean): Promise<Response> {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in to like things." }, { status: 401 })

  const type = String(params.type) as TargetType
  const table = TABLES[type]
  if (!table) return json({ error: "Bad target type." }, { status: 400 })
  const id = parseInt(String(params.id), 10)
  if (!Number.isInteger(id)) return json({ error: "Bad id." }, { status: 400 })

  // Likeable = visible: public, or your own.
  const row = await env.DB
    .prepare(`SELECT user_id, is_public FROM ${table} WHERE id = ?1`)
    .bind(id)
    .first<{ user_id: number | null; is_public: number }>()
  if (!row || (!row.is_public && row.user_id !== user.uid)) return json({ error: "Not found." }, { status: 404 })

  const write = liked
    ? env.DB.prepare("INSERT OR IGNORE INTO likes (user_id, target_type, target_id) VALUES (?1, ?2, ?3)").bind(user.uid, type, id)
    : env.DB.prepare("DELETE FROM likes WHERE user_id = ?1 AND target_type = ?2 AND target_id = ?3").bind(user.uid, type, id)
  const recount = env.DB
    .prepare(`UPDATE ${table} SET like_count = (SELECT COUNT(*) FROM likes WHERE target_type = ?1 AND target_id = ?2) WHERE id = ?2`)
    .bind(type, id)
  await env.DB.batch([write, recount])

  const fresh = await env.DB.prepare(`SELECT like_count FROM ${table} WHERE id = ?1`).bind(id).first<{ like_count: number }>()
  return json({ ok: true, liked, like_count: fresh?.like_count ?? 0 })
}

export const onRequestPut: PagesFunction<Env> = ({ request, env, params }) => setLike(request, env, params, true)
export const onRequestDelete: PagesFunction<Env> = ({ request, env, params }) => setLike(request, env, params, false)

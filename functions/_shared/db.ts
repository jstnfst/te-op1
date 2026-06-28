import type { Env, SessionUser } from "./env"
import type { NormalizedUser, Provider } from "./oauth"

export async function upsertUser(env: Env, provider: Provider, u: NormalizedUser): Promise<SessionUser> {
  const existing = await env.DB
    .prepare("SELECT id FROM users WHERE provider = ?1 AND provider_user_id = ?2")
    .bind(provider, u.providerUserId)
    .first<{ id: number }>()

  let uid: number
  if (existing) {
    uid = existing.id
    await env.DB
      .prepare("UPDATE users SET email=?1, display_name=?2, avatar_url=?3, last_login=datetime('now') WHERE id=?4")
      .bind(u.email, u.name, u.avatar, uid)
      .run()
  } else {
    const res = await env.DB
      .prepare("INSERT INTO users (provider, provider_user_id, email, display_name, avatar_url) VALUES (?1,?2,?3,?4,?5)")
      .bind(provider, u.providerUserId, u.email, u.name, u.avatar)
      .run()
    uid = res.meta.last_row_id as number
  }
  return { uid, provider, email: u.email, name: u.name, avatar: u.avatar }
}

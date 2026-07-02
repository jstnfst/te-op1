import type { Env, SessionUser } from "./env"
import type { NormalizedUser, Provider } from "./oauth"
import { encryptToken, decryptToken } from "./crypto"

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

/** When the account was banned, or null. Checked on login and on every authed API request. */
export async function getBannedAt(env: Env, uid: number): Promise<string | null> {
  const row = await env.DB
    .prepare("SELECT banned_at FROM users WHERE id=?1")
    .bind(uid)
    .first<{ banned_at: string | null }>()
  return row?.banned_at ?? null
}

/** Persist the GitHub access token (encrypted) so the user can file issues/react as themselves. */
export async function setGithubToken(env: Env, uid: number, accessToken: string): Promise<void> {
  const encrypted = await encryptToken(accessToken, env.JWT_SECRET)
  await env.DB.prepare("UPDATE users SET github_access_token=?1 WHERE id=?2").bind(encrypted, uid).run()
}

/** Decrypted GitHub access token for a uid, or null if none is stored. */
export async function getGithubToken(env: Env, uid: number): Promise<string | null> {
  const row = await env.DB
    .prepare("SELECT github_access_token FROM users WHERE id=?1")
    .bind(uid)
    .first<{ github_access_token: string | null }>()
  if (!row?.github_access_token) return null
  return decryptToken(row.github_access_token, env.JWT_SECRET)
}

/** Decrypted token + numeric GitHub user id (used to match reactions), or null if not linked. */
export async function getGithubAuth(env: Env, uid: number): Promise<{ token: string; githubUserId: number } | null> {
  const row = await env.DB
    .prepare("SELECT github_access_token, provider_user_id FROM users WHERE id=?1")
    .bind(uid)
    .first<{ github_access_token: string | null; provider_user_id: string }>()
  if (!row?.github_access_token) return null
  const token = await decryptToken(row.github_access_token, env.JWT_SECRET)
  if (!token) return null
  return { token, githubUserId: Number(row.provider_user_id) }
}

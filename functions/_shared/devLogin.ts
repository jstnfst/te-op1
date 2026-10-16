import type { Env } from "./env"

// Mock login for local development. Lets you sign in as a fixed persona
// without a real OAuth round-trip, so signed-in, admin, GitHub, and banned
// flows can be tested on localhost.
//
// It must never work in production. Three independent checks, all required:
//   1. DEV_LOGIN=1 - set only in the gitignored .dev.vars, never in
//      wrangler.toml [vars] or as a Pages secret.
//   2. SITE_URL is a plain-http localhost origin (production's is the
//      https pages.dev origin).
//   3. The request itself arrived on a loopback host.
// Any one failing means the endpoint answers 404, the same as a route that
// doesn't exist, and the login page never shows the dev panel.

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

function isLoopbackHttp(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === "http:" && LOOPBACK.has(u.hostname)
  } catch {
    return false
  }
}

export function devLoginEnabled(env: Env, request: Request): boolean {
  return env.DEV_LOGIN === "1" && isLoopbackHttp(env.SITE_URL) && isLoopbackHttp(request.url)
}

export interface DevPersona {
  id: string
  label: string
  desc: string
  provider: string
  name: string
  email: (env: Env) => string
  banned?: boolean
}

/** First ADMIN_EMAILS entry, so the admin persona gets the real admin role check. */
const adminEmail = (env: Env) =>
  (env.ADMIN_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean)[0] || "admin@dev.local"

export const DEV_PERSONAS: DevPersona[] = [
  { id: "musician", label: "Musician", desc: "Regular signed-in user", provider: "dev", name: "Dev Musician", email: () => "musician@dev.local" },
  { id: "github", label: "GitHub user", desc: "GitHub provider, so the ISSUES tab shows (no real token)", provider: "github", name: "Dev GitHub", email: () => "github@dev.local" },
  { id: "admin", label: "Admin", desc: "First ADMIN_EMAILS address, so MOD shows", provider: "dev", name: "Dev Admin", email: adminEmail },
  { id: "banned", label: "Banned user", desc: "Login is refused, like a suspended account", provider: "dev", name: "Dev Banned", email: () => "banned@dev.local", banned: true },
]

/** Find or create the persona's local user row. provider_user_id is "dev:<id>" so mock rows are easy to spot. */
export async function upsertDevUser(env: Env, p: DevPersona): Promise<number> {
  const providerUserId = `dev:${p.id}`
  const email = p.email(env)
  const existing = await env.DB
    .prepare("SELECT id FROM users WHERE provider = ?1 AND provider_user_id = ?2")
    .bind(p.provider, providerUserId)
    .first<{ id: number }>()
  let uid: number
  if (existing) {
    uid = existing.id
    await env.DB
      .prepare("UPDATE users SET email=?1, display_name=?2, last_login=datetime('now') WHERE id=?3")
      .bind(email, p.name, uid)
      .run()
  } else {
    const res = await env.DB
      .prepare("INSERT INTO users (provider, provider_user_id, email, display_name, avatar_url) VALUES (?1,?2,?3,?4,NULL)")
      .bind(p.provider, providerUserId, email, p.name)
      .run()
    uid = res.meta.last_row_id as number
  }
  // Keep the banned persona banned (and the others not), whatever the mod console did to them.
  await env.DB
    .prepare(p.banned
      ? "UPDATE users SET banned_at = COALESCE(banned_at, datetime('now')) WHERE id=?1"
      : "UPDATE users SET banned_at = NULL WHERE id=?1")
    .bind(uid)
    .run()
  return uid
}

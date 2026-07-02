import type { Env, SessionUser } from "./env"
import { getSessionUser, json } from "./session"

/**
 * Roles are derived per-request from the session email against the
 * ADMIN_EMAILS allowlist (a non-secret var) - never stored in the JWT or DB,
 * so granting/revoking is a config change that takes effect immediately.
 * Shaped as a role string so a lower "operator" tier can slot in later.
 */
export type Role = "admin" | null

export function roleFor(env: Env, user: SessionUser | null): Role {
  if (!user?.email) return null
  const email = user.email.trim().toLowerCase()
  const allowed = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(email) ? "admin" : null
}

export const isAdmin = (env: Env, user: SessionUser | null): boolean =>
  roleFor(env, user) === "admin"

/**
 * Gate for /api/admin/*: a plain 404 for anyone who isn't an admin, signed
 * in or not, so the endpoints don't advertise their existence.
 */
export async function requireAdmin(request: Request, env: Env): Promise<SessionUser | Response> {
  const user = await getSessionUser(request, env)
  if (!isAdmin(env, user)) return json({ error: "Not found." }, { status: 404 })
  return user as SessionUser
}

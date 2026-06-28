import type { Env, SessionUser } from "./env"
import { verifyJwt, signJwt } from "./jwt"
import { parseCookies, serializeCookie, SESSION_COOKIE, isHttps } from "./cookies"

const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days

export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = parseCookies(request)[SESSION_COOKIE]
  const payload = await verifyJwt<SessionUser>(token, env.JWT_SECRET)
  if (!payload) return null
  return {
    uid: payload.uid,
    provider: payload.provider,
    email: payload.email,
    name: payload.name,
    avatar: payload.avatar,
  }
}

export async function sessionCookie(env: Env, user: SessionUser): Promise<string> {
  const token = await signJwt({ ...user }, env.JWT_SECRET, SESSION_TTL)
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL,
    httpOnly: true,
    secure: isHttps(env.SITE_URL),
    sameSite: "Lax",
  })
}

export function clearSessionCookie(env: Env): string {
  return serializeCookie(SESSION_COOKIE, "", {
    maxAge: 0,
    httpOnly: true,
    secure: isHttps(env.SITE_URL),
    sameSite: "Lax",
  })
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  })
}

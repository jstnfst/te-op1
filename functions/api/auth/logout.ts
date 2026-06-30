import type { Env } from "../../_shared/env"
import { clearSessionCookie } from "../../_shared/session"

// GET or POST /api/auth/logout - clear the session and return home.
export const onRequest: PagesFunction<Env> = async ({ env }) => {
  return new Response(null, {
    status: 302,
    headers: { Location: `${env.SITE_URL}/`, "Set-Cookie": clearSessionCookie(env) },
  })
}

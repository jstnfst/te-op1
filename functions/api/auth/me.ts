import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"

// GET /api/auth/me — current user, or { user: null }.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  return json({ user })
}

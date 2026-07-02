import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"
import { getGithubToken } from "../../_shared/db"
import { isAdmin } from "../../_shared/admin"

// GET /api/auth/me - current user, or { user: null }. For GitHub sessions,
// also reports whether an issues-capable access token is on file (older
// sessions predate the public_repo scope and need one re-login to get one).
// isAdmin only unlocks UI; every admin endpoint re-derives the role itself.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ user: null })
  const githubIssuesReady = user.provider === "github" ? Boolean(await getGithubToken(env, user.uid)) : false
  return json({ user: { ...user, githubIssuesReady, isAdmin: isAdmin(env, user) } })
}

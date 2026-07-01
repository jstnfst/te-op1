import type { Env, SessionUser } from "./env"
import { getSessionUser, json } from "./session"
import { getGithubAuth } from "./db"

export interface GithubSession {
  user: SessionUser
  token: string
  githubUserId: number
}

/**
 * Issues/upvotes/releases all need to act as the signed-in user's own GitHub
 * account. Requires a github-provider session with a stored access token
 * (older github sessions predate the public_repo scope and need one
 * re-login - see /api/auth/me's githubIssuesReady flag).
 */
export async function requireGithubSession(request: Request, env: Env): Promise<GithubSession | Response> {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in to continue." }, { status: 401 })
  if (user.provider !== "github") return json({ error: "Sign in with GitHub to use issues." }, { status: 403 })
  const auth = await getGithubAuth(env, user.uid)
  if (!auth) return json({ error: "Reconnect GitHub to use issues.", needsReconnect: true }, { status: 403 })
  return { user, token: auth.token, githubUserId: auth.githubUserId }
}

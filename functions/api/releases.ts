import type { Env } from "../_shared/env"
import { json } from "../_shared/session"
import { requireGithubSession } from "../_shared/issuesAuth"
import { listReleases } from "../_shared/github"

// GET /api/releases - changelog for the Issues tab. Gated the same as /api/issues
// (needs the viewer's own token, both to avoid an unauthenticated rate limit and
// because only GitHub-signed-in users see this tab at all).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireGithubSession(request, env)
  if (auth instanceof Response) return auth
  try {
    const items = await listReleases(auth.token)
    return json({ items })
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 502 })
  }
}

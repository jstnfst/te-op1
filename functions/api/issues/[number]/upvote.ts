import type { Env } from "../../../_shared/env"
import { json } from "../../../_shared/session"
import { requireGithubSession } from "../../../_shared/issuesAuth"
import { findOwnReaction, addUpvote, removeUpvote } from "../../../_shared/github"

function parseIssueNumber(raw: unknown): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

// POST /api/issues/:number/upvote - add the viewer's own +1 reaction.
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireGithubSession(request, env)
  if (auth instanceof Response) return auth
  const number = parseIssueNumber(params.number)
  if (!number) return json({ error: "Invalid issue number." }, { status: 400 })

  try {
    await addUpvote(auth.token, number)
    return json({ upvoted: true })
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 502 })
  }
}

// DELETE /api/issues/:number/upvote - remove the viewer's own +1 reaction.
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireGithubSession(request, env)
  if (auth instanceof Response) return auth
  const number = parseIssueNumber(params.number)
  if (!number) return json({ error: "Invalid issue number." }, { status: 400 })

  try {
    const mine = await findOwnReaction(auth.token, number, auth.githubUserId)
    if (mine) await removeUpvote(auth.token, number, mine.id)
    return json({ upvoted: false })
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 502 })
  }
}

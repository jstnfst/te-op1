import type { Env } from "../../_shared/env"
import { json } from "../../_shared/session"
import { requireGithubSession } from "../../_shared/issuesAuth"
import { listIssues, createIssue, findOwnReaction, type IssueKind } from "../../_shared/github"

const SUMMARY_MAX = 200
const DESCRIPTION_MAX = 4000

function parseKind(v: string | null): IssueKind {
  return v === "feature" ? "feature" : "bug"
}

// GET /api/issues?kind=bug|feature - list existing reports of that kind, with
// the viewer's own upvote state attached.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireGithubSession(request, env)
  if (auth instanceof Response) return auth

  const kind = parseKind(new URL(request.url).searchParams.get("kind"))
  try {
    const issues = await listIssues(auth.token, kind)
    const items = await Promise.all(
      issues.map(async (issue) => {
        const mine = await findOwnReaction(auth.token, issue.number, auth.githubUserId)
        return { ...issue, upvoted: Boolean(mine) }
      }),
    )
    return json({ items, kind })
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 502 })
  }
}

// POST /api/issues - file a new bug report or feature request as the signed-in user.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireGithubSession(request, env)
  if (auth instanceof Response) return auth

  let body: unknown
  try { body = await request.json() } catch { return json({ error: "Expected a JSON body." }, { status: 400 }) }
  const { kind: rawKind, summary, description } = (body || {}) as Record<string, unknown>

  if (rawKind !== "bug" && rawKind !== "feature") return json({ error: "kind must be \"bug\" or \"feature\"." }, { status: 400 })
  const title = typeof summary === "string" ? summary.trim() : ""
  const desc = typeof description === "string" ? description.trim() : ""
  if (!title) return json({ error: "Summary is required." }, { status: 400 })
  if (title.length > SUMMARY_MAX) return json({ error: `Summary must be ${SUMMARY_MAX} characters or fewer.` }, { status: 400 })
  if (!desc) return json({ error: "Description is required." }, { status: 400 })
  if (desc.length > DESCRIPTION_MAX) return json({ error: `Description must be ${DESCRIPTION_MAX} characters or fewer.` }, { status: 400 })

  const footer = `\n\n---\n_Filed via the OP-1 Field site issues page._`
  try {
    const issue = await createIssue(auth.token, rawKind, title, `${desc}${footer}`)
    return json({ ...issue, upvoted: false }, { status: 201 })
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 502 })
  }
}

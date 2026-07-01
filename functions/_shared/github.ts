// Thin GitHub REST client. Every call here runs with the *caller's own* GitHub
// access token (see functions/_shared/db.ts getGithubToken) - issues and
// reactions are created as the signed-in user, not a shared bot account.

export const GITHUB_OWNER = "jstnfst"
export const GITHUB_REPO = "te-op1"
const API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`
const USER_AGENT = "te-op1"

export type IssueKind = "bug" | "feature"
const LABEL: Record<IssueKind, string> = { bug: "bug", feature: "enhancement" }

export interface GithubIssue {
  number: number
  title: string
  body: string
  state: "open" | "closed"
  labels: string[]
  htmlUrl: string
  createdAt: string
  authorLogin: string
  authorAvatar: string | null
  upvotes: number
  kind: IssueKind
  status: "planned" | "in-progress" | "shipped" | "open"
}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  })
  return res
}

function kindFromLabels(labels: string[]): IssueKind {
  return labels.includes("bug") ? "bug" : "feature"
}

function statusFromIssue(state: string, labels: string[]): GithubIssue["status"] {
  if (state === "closed") return "shipped"
  if (labels.includes("in progress")) return "in-progress"
  if (labels.includes("planned")) return "planned"
  return "open"
}

function normalizeIssue(raw: Record<string, any>): GithubIssue {
  const labels: string[] = (raw.labels || []).map((l: any) => (typeof l === "string" ? l : l.name))
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body || "",
    state: raw.state,
    labels,
    htmlUrl: raw.html_url,
    createdAt: raw.created_at,
    authorLogin: raw.user?.login || "unknown",
    authorAvatar: raw.user?.avatar_url || null,
    upvotes: raw.reactions?.["+1"] || 0,
    kind: kindFromLabels(labels),
    status: statusFromIssue(raw.state, labels),
  }
}

// Kept small: the list handler also does one reaction-lookup subrequest per
// issue to report the viewer's own upvote state, and Workers cap subrequests.
const ISSUES_PER_PAGE = 15

/** List issues for a kind (bug/feature), newest first, open and closed alike. */
export async function listIssues(token: string, kind: IssueKind): Promise<GithubIssue[]> {
  const res = await gh(token, `/issues?state=all&labels=${LABEL[kind]}&per_page=${ISSUES_PER_PAGE}&sort=created&direction=desc`)
  if (!res.ok) throw new Error(`GitHub list issues failed (${res.status})`)
  const raw = (await res.json()) as Record<string, any>[]
  // The issues endpoint also returns PRs; those carry a pull_request key.
  return raw.filter((r) => !r.pull_request).map(normalizeIssue)
}

export async function createIssue(
  token: string,
  kind: IssueKind,
  title: string,
  body: string,
): Promise<GithubIssue> {
  const res = await gh(token, "/issues", {
    method: "POST",
    body: JSON.stringify({ title, body, labels: [LABEL[kind]] }),
  })
  if (!res.ok) throw new Error(`GitHub create issue failed (${res.status}): ${await res.text()}`)
  return normalizeIssue(await res.json())
}

/** The authenticated user's own +1 reaction on an issue, if any. */
export async function findOwnReaction(
  token: string,
  issueNumber: number,
  githubUserId: number,
): Promise<{ id: number } | null> {
  const res = await gh(token, `/issues/${issueNumber}/reactions?content=%2B1&per_page=100`)
  if (!res.ok) throw new Error(`GitHub list reactions failed (${res.status})`)
  const reactions = (await res.json()) as Array<{ id: number; user: { id: number } }>
  const mine = reactions.find((r) => r.user.id === githubUserId)
  return mine ? { id: mine.id } : null
}

export async function addUpvote(token: string, issueNumber: number): Promise<void> {
  const res = await gh(token, `/issues/${issueNumber}/reactions`, {
    method: "POST",
    body: JSON.stringify({ content: "+1" }),
  })
  if (!res.ok) throw new Error(`GitHub add reaction failed (${res.status})`)
}

export async function removeUpvote(token: string, issueNumber: number, reactionId: number): Promise<void> {
  const res = await gh(token, `/issues/${issueNumber}/reactions/${reactionId}`, { method: "DELETE" })
  if (!res.ok && res.status !== 404) throw new Error(`GitHub remove reaction failed (${res.status})`)
}

export interface GithubRelease {
  tagName: string
  name: string
  body: string
  publishedAt: string
  htmlUrl: string
}

export async function listReleases(token: string): Promise<GithubRelease[]> {
  const res = await gh(token, "/releases?per_page=20")
  if (!res.ok) throw new Error(`GitHub list releases failed (${res.status})`)
  const raw = (await res.json()) as Record<string, any>[]
  return raw.map((r) => ({
    tagName: r.tag_name,
    name: r.name || r.tag_name,
    body: r.body || "",
    publishedAt: r.published_at,
    htmlUrl: r.html_url,
  }))
}

// Thin GitHub REST client. Every call here runs with the *caller's own* GitHub
// access token (see functions/_shared/db.ts getGithubToken) - issues and
// reactions are created as the signed-in user, not a shared bot account.

export const GITHUB_OWNER = "jstnfst"
export const GITHUB_REPO = "te-op1"
const API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`
const USER_AGENT = "te-op1"

export type IssueKind = "bug" | "feature"
const LABEL: Record<IssueKind, string> = { bug: "bug", feature: "enhancement" }

export type IssueStatus = "planned" | "in-progress" | "fixed" | "closed" | "open"

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
  status: IssueStatus
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

// GitHub's own close reason distinguishes "fixed" from "declined" - only
// not_planned (won't fix, duplicate, etc.) counts as Closed; completed (or the
// null state_reason on older issues predating this field) counts as Fixed.
function statusFromIssue(state: string, labels: string[], stateReason: string | null): IssueStatus {
  if (state === "closed") return stateReason === "not_planned" ? "closed" : "fixed"
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
    status: statusFromIssue(raw.state, labels, raw.state_reason ?? null),
  }
}

// GitHub's labels query param ANDs multiple values, so bug + enhancement can't
// be fetched as one "OR" call - two per-label calls instead, merged below. Kept
// small per label: the list handler also does one reaction-lookup subrequest
// per shown issue to report the viewer's own upvote state, and Workers cap
// subrequests (2 list calls + up to COMBINED_CAP reaction lookups stays well
// under the default 50).
const PER_LABEL_FETCH = 15
const COMBINED_CAP = 20

async function listIssuesByLabel(token: string, kind: IssueKind): Promise<GithubIssue[]> {
  const res = await gh(token, `/issues?state=all&labels=${LABEL[kind]}&per_page=${PER_LABEL_FETCH}&sort=created&direction=desc`)
  if (!res.ok) throw new Error(`GitHub list issues failed (${res.status})`)
  const raw = (await res.json()) as Record<string, any>[]
  // The issues endpoint also returns PRs; those carry a pull_request key.
  return raw.filter((r) => !r.pull_request).map(normalizeIssue)
}

/** All bug + feature issues, merged and newest first, open and closed alike. */
export async function listAllIssues(token: string): Promise<GithubIssue[]> {
  const [bugs, features] = await Promise.all([listIssuesByLabel(token, "bug"), listIssuesByLabel(token, "feature")])
  return [...bugs, ...features]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, COMBINED_CAP)
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

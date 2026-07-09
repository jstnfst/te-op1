export interface User {
  uid: number
  provider: string
  email: string | null
  name: string | null
  avatar: string | null
  /** True once a github access token is on file (provider === "github" only). */
  githubIssuesReady?: boolean
  /** UI hint only - every admin endpoint re-derives the role server-side. */
  isAdmin?: boolean
}

export interface PatchSummary {
  id: number
  name: string
  type: string
  fx_type: string | null
  lfo_type: string | null
  octave: number
  tags: string
  download_count: number
  created_at: string
  author?: string | null
  is_public?: number
  like_count?: number
  /** SQLite boolean: 0/1 from list queries. */
  liked_by_me?: number | boolean
}

async function handle<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data
}

export const apiGet = <T>(path: string) =>
  fetch(path, { credentials: "same-origin" }).then((r) => handle<T>(r))

export const apiSend = <T>(path: string, method: string, body?: unknown) =>
  fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((r) => handle<T>(r))

export interface Pack {
  id: number
  name: string
  is_public: number
  created_at: string
  item_count?: number
  author?: string | null
  like_count?: number
  download_count?: number
  liked_by_me?: number | boolean
}

/** POST a JSON body and save the binary response (e.g. a .zip) as a download. */
export async function downloadZip(path: string, body: unknown, filename: string) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `Download failed (${res.status})`)
  }
  const blob = await res.blob()
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

export interface User {
  uid: number
  provider: string
  email: string | null
  name: string | null
  avatar: string | null
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

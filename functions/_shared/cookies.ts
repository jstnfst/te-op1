export const SESSION_COOKIE = "te_session"
export const OAUTH_TX_COOKIE = "te_oauth_tx"

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("Cookie") || ""
  const out: Record<string, string> = {}
  for (const part of header.split(";")) {
    const i = part.indexOf("=")
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export interface CookieOptions {
  maxAge?: number
  path?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: "Lax" | "Strict" | "None"
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${opts.path ?? "/"}`)
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.httpOnly !== false) parts.push("HttpOnly")
  if (opts.secure !== false) parts.push("Secure")
  parts.push(`SameSite=${opts.sameSite ?? "Lax"}`)
  return parts.join("; ")
}

/** Secure cookies are dropped over plain http://localhost during local dev. */
export function isHttps(siteUrl: string): boolean {
  return siteUrl.startsWith("https://")
}

// Small crypto helpers built on Web Crypto (available in the Workers runtime).

export function b64urlFromBytes(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function b64urlToBytes(input: string): Uint8Array {
  let s = input.replace(/-/g, "+").replace(/_/g, "/")
  while (s.length % 4) s += "="
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** URL-safe random token. */
export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return b64urlFromBytes(a)
}

/** SHA-256 of a UTF-8 string, base64url-encoded (used for PKCE S256). */
export async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data))
  return b64urlFromBytes(digest)
}

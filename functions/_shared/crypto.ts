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

// AES-256-GCM at rest for stored third-party tokens (e.g. the GitHub access
// token needed to file issues as the user). The key is derived from
// JWT_SECRET rather than adding a second secret to configure/rotate.
async function tokenKey(jwtSecret: string): Promise<CryptoKey> {
  const bits = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`token-enc:${jwtSecret}`))
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

/** Encrypt a secret string for storage; result is a single base64url token (iv + ciphertext). */
export async function encryptToken(plaintext: string, jwtSecret: string): Promise<string> {
  const key = await tokenKey(jwtSecret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  )
  const combined = new Uint8Array(iv.length + ciphertext.length)
  combined.set(iv, 0)
  combined.set(ciphertext, iv.length)
  return b64urlFromBytes(combined)
}

/** Reverse of encryptToken. Returns null if decryption fails (bad key, corrupt data). */
export async function decryptToken(stored: string, jwtSecret: string): Promise<string | null> {
  try {
    const key = await tokenKey(jwtSecret)
    const combined = b64urlToBytes(stored)
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext)
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

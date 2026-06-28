// Minimal HS256 JWT using Web Crypto. Used for the session cookie and the
// short-lived OAuth transaction cookie.
import { b64urlFromBytes, b64urlToBytes } from "./crypto"

const enc = new TextEncoder()
const dec = new TextDecoder()

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expSeconds = 60 * 60 * 24 * 30,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "HS256", typ: "JWT" }
  const body = { ...payload, iat: now, exp: now + expSeconds }
  const h = b64urlFromBytes(enc.encode(JSON.stringify(header)))
  const p = b64urlFromBytes(enc.encode(JSON.stringify(body)))
  const data = `${h}.${p}`
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data)),
  )
  return `${data}.${b64urlFromBytes(sig)}`
}

export async function verifyJwt<T = Record<string, unknown>>(
  token: string | undefined | null,
  secret: string,
): Promise<T | null> {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const data = `${parts[0]}.${parts[1]}`
  let ok = false
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      b64urlToBytes(parts[2]),
      enc.encode(data),
    )
  } catch {
    return null
  }
  if (!ok) return null
  try {
    const payload = JSON.parse(dec.decode(b64urlToBytes(parts[1]))) as T & { exp?: number }
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

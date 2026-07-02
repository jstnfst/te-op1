import type { Env } from "../../../_shared/env"
import { isProvider, exchangeCode, fetchUser } from "../../../_shared/oauth"
import { verifyJwt } from "../../../_shared/jwt"
import { parseCookies, serializeCookie, OAUTH_TX_COOKIE, isHttps } from "../../../_shared/cookies"
import { upsertUser, setGithubToken, getBannedAt } from "../../../_shared/db"
import { sessionCookie } from "../../../_shared/session"

function redirect(location: string, extraCookies: string[] = []): Response {
  const headers = new Headers({ Location: location })
  for (const c of extraCookies) headers.append("Set-Cookie", c)
  return new Response(null, { status: 302, headers })
}

// GET /api/auth/:provider/callback - exchange the code, upsert the user, set session.
export const onRequestGet: PagesFunction<Env> = async ({ params, env, request }) => {
  const provider = String(params.provider)
  if (!isProvider(provider)) return new Response("Unknown provider", { status: 404 })

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const tx = await verifyJwt<{ state: string; provider: string; codeVerifier: string }>(
    parseCookies(request)[OAUTH_TX_COOKIE],
    env.JWT_SECRET,
  )

  const loginError = `${env.SITE_URL}/login?error=auth_failed`
  if (!code || !state || !tx || tx.state !== state || tx.provider !== provider) {
    return redirect(loginError)
  }

  try {
    const accessToken = await exchangeCode(env, provider, code, tx.codeVerifier || undefined)
    const normalized = await fetchUser(env, provider, accessToken)
    const user = await upsertUser(env, provider, normalized)
    const clearTx = serializeCookie(OAUTH_TX_COOKIE, "", {
      maxAge: 0, httpOnly: true, secure: isHttps(env.SITE_URL), sameSite: "Lax",
    })
    // Banned accounts authenticate fine upstream but get no session here.
    if (await getBannedAt(env, user.uid)) {
      return redirect(`${env.SITE_URL}/login?error=suspended`, [clearTx])
    }
    // GitHub tokens (with public_repo scope) let the user file issues/react as
    // themselves later - the other providers' tokens aren't used for anything
    // past login, so only GitHub's is worth persisting.
    if (provider === "github") await setGithubToken(env, user.uid, accessToken)
    return redirect(`${env.SITE_URL}/`, [await sessionCookie(env, user), clearTx])
  } catch (err) {
    console.error("oauth callback error", err)
    return redirect(loginError)
  }
}

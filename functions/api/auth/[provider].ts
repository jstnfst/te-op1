import type { Env } from "../../_shared/env"
import { isProvider, buildAuthorizeUrl, providerUsesPkce } from "../../_shared/oauth"
import { randomToken, sha256Base64Url } from "../../_shared/crypto"
import { signJwt } from "../../_shared/jwt"
import { serializeCookie, OAUTH_TX_COOKIE, isHttps } from "../../_shared/cookies"

// GET /api/auth/:provider — start the OAuth flow.
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const provider = String(params.provider)
  if (!isProvider(provider)) return new Response("Unknown provider", { status: 404 })

  const state = randomToken(24)
  const nonce = randomToken(16)
  let codeVerifier = ""
  let codeChallenge: string | undefined
  if (providerUsesPkce(provider)) {
    codeVerifier = randomToken(48)
    codeChallenge = await sha256Base64Url(codeVerifier)
  }

  // Stash the transaction (CSRF state + PKCE verifier) in a short-lived signed cookie.
  const tx = await signJwt({ state, provider, nonce, codeVerifier }, env.JWT_SECRET, 600)
  const authorizeUrl = buildAuthorizeUrl(env, provider, { state, codeChallenge, nonce })

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl,
      "Set-Cookie": serializeCookie(OAUTH_TX_COOKIE, tx, {
        maxAge: 600,
        httpOnly: true,
        secure: isHttps(env.SITE_URL),
        sameSite: "Lax",
      }),
    },
  })
}

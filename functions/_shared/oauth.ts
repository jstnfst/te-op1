// OAuth provider config + flow helpers. Recipe from ../claude-website/README.md.
import type { Env } from "./env"

export type Provider = "google" | "microsoft" | "yahoo" | "github"
export function isProvider(p: string): p is Provider {
  return p === "google" || p === "microsoft" || p === "yahoo" || p === "github"
}

// GitHub's API rejects requests without a User-Agent; harmless for the others.
const USER_AGENT = "te-op1"

interface ProviderConfig {
  authorize: string
  token: string
  userinfo: string
  scope: string
  clientId: (e: Env) => string
  clientSecret: (e: Env) => string
  tokenAuth: "body" | "basic" // Yahoo requires HTTP Basic for the token request
  usePkce: boolean
  extraAuthParams?: Record<string, string>
}

const CONFIGS: Record<Provider, ProviderConfig> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://www.googleapis.com/oauth2/v2/userinfo",
    scope: "openid email profile",
    clientId: (e) => e.GOOGLE_CLIENT_ID,
    clientSecret: (e) => e.GOOGLE_CLIENT_SECRET,
    tokenAuth: "body",
    usePkce: true,
    extraAuthParams: { access_type: "online" },
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userinfo: "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
    scope: "openid email profile User.Read",
    clientId: (e) => e.MICROSOFT_CLIENT_ID,
    clientSecret: (e) => e.MICROSOFT_CLIENT_SECRET,
    tokenAuth: "body",
    usePkce: true,
    extraAuthParams: { response_mode: "query" },
  },
  yahoo: {
    authorize: "https://api.login.yahoo.com/oauth2/request_auth",
    token: "https://api.login.yahoo.com/oauth2/get_token",
    userinfo: "https://api.login.yahoo.com/openid/v1/userinfo",
    scope: "openid email profile",
    clientId: (e) => e.YAHOO_CLIENT_ID,
    clientSecret: (e) => e.YAHOO_CLIENT_SECRET,
    tokenAuth: "basic",
    usePkce: false,
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    userinfo: "https://api.github.com/user",
    // public_repo lets signed-in GitHub users file issues on the repo as themselves
    // (see functions/_shared/github.ts). Scopes are requested per-auth for OAuth
    // Apps, so this needs no change on github.com - just a re-consent on next login.
    scope: "read:user user:email public_repo",
    clientId: (e) => e.GITHUB_CLIENT_ID,
    clientSecret: (e) => e.GITHUB_CLIENT_SECRET,
    tokenAuth: "body",
    usePkce: false,
  },
}

export function redirectUri(env: Env, provider: Provider): string {
  return `${env.SITE_URL}/api/auth/${provider}/callback`
}

export function buildAuthorizeUrl(
  env: Env,
  provider: Provider,
  opts: { state: string; codeChallenge?: string; nonce?: string },
): string {
  const c = CONFIGS[provider]
  const params = new URLSearchParams({
    client_id: c.clientId(env),
    redirect_uri: redirectUri(env, provider),
    response_type: "code",
    scope: c.scope,
    state: opts.state,
    ...(c.extraAuthParams || {}),
  })
  if (c.usePkce && opts.codeChallenge) {
    params.set("code_challenge", opts.codeChallenge)
    params.set("code_challenge_method", "S256")
  }
  if (provider === "yahoo" && opts.nonce) params.set("nonce", opts.nonce)
  return `${c.authorize}?${params.toString()}`
}

export const providerUsesPkce = (provider: Provider) => CONFIGS[provider].usePkce

export interface NormalizedUser {
  providerUserId: string
  email: string | null
  name: string | null
  avatar: string | null
}

export async function exchangeCode(
  env: Env,
  provider: Provider,
  code: string,
  codeVerifier?: string,
): Promise<string> {
  const c = CONFIGS[provider]
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(env, provider),
  })
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  }
  if (c.tokenAuth === "basic") {
    headers.Authorization = "Basic " + btoa(`${c.clientId(env)}:${c.clientSecret(env)}`)
  } else {
    body.set("client_id", c.clientId(env))
    body.set("client_secret", c.clientSecret(env))
  }
  if (c.usePkce && codeVerifier) body.set("code_verifier", codeVerifier)

  const res = await fetch(c.token, { method: "POST", headers, body })
  if (!res.ok) throw new Error(`token exchange failed (${provider}): ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error(`no access_token from ${provider}`)
  return data.access_token
}

export async function fetchUser(
  env: Env,
  provider: Provider,
  accessToken: string,
): Promise<NormalizedUser> {
  const c = CONFIGS[provider]
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  }
  const res = await fetch(c.userinfo, { headers: authHeaders })
  if (!res.ok) throw new Error(`userinfo failed (${provider}): ${res.status}`)
  const u = (await res.json()) as Record<string, unknown>

  if (provider === "github") {
    // /user.email is null when the user keeps it private - fall back to the
    // primary verified address from /user/emails (needs the user:email scope).
    let email = (u.email as string) ?? null
    if (!email) {
      const er = await fetch("https://api.github.com/user/emails", { headers: authHeaders })
      if (er.ok) {
        const emails = (await er.json()) as Array<{ email: string; primary: boolean; verified: boolean }>
        email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? null
      }
    }
    return {
      providerUserId: String(u.id),
      email,
      name: ((u.name as string) || (u.login as string)) ?? null,
      avatar: (u.avatar_url as string) ?? null,
    }
  }
  if (provider === "google") {
    return { providerUserId: String(u.id), email: (u.email as string) ?? null, name: (u.name as string) ?? null, avatar: (u.picture as string) ?? null }
  }
  if (provider === "microsoft") {
    const email = (u.mail as string) || (u.userPrincipalName as string) || null
    return { providerUserId: String(u.id), email, name: (u.displayName as string) ?? null, avatar: null }
  }
  // yahoo OIDC userinfo: sub / email / name / picture
  return {
    providerUserId: String(u.sub),
    email: (u.email as string) ?? null,
    name: ((u.name as string) || (u.given_name as string)) ?? null,
    avatar: (u.picture as string) ?? null,
  }
}

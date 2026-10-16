import type { Env } from "../../_shared/env"
import { json, sessionCookie } from "../../_shared/session"
import { safeNext } from "../../_shared/util"
import { devLoginEnabled, DEV_PERSONAS, upsertDevUser } from "../../_shared/devLogin"

// Local-dev mock login (see functions/_shared/devLogin.ts for the gating).
//   GET /api/auth/dev               -> { personas } when enabled, else 404
//   GET /api/auth/dev?as=<id>&next= -> sign in as that persona, redirect to next
// A static route, so it takes precedence over /api/auth/:provider.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!devLoginEnabled(env, request)) return new Response("Not found", { status: 404 })

  const url = new URL(request.url)
  const as = url.searchParams.get("as")
  if (!as) {
    return json({ personas: DEV_PERSONAS.map(({ id, label, desc }) => ({ id, label, desc })) })
  }

  const persona = DEV_PERSONAS.find((p) => p.id === as)
  if (!persona) return json({ error: "Unknown persona." }, { status: 400 })

  const uid = await upsertDevUser(env, persona)
  // Redirect back to the origin the request came in on (localhost vs 127.0.0.1),
  // so the cookie and the page share a host.
  const origin = url.origin
  if (persona.banned) {
    return new Response(null, { status: 302, headers: { Location: `${origin}/login?error=suspended` } })
  }
  const cookie = await sessionCookie(env, {
    uid, provider: persona.provider, email: persona.email(env), name: persona.name, avatar: null,
  })
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}${safeNext(url.searchParams.get("next"))}`, "Set-Cookie": cookie },
  })
}

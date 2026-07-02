import type { Env } from "../_shared/env"
import { getSessionUser, clearSessionCookie, json } from "../_shared/session"
import { getBannedAt } from "../_shared/db"

// Session JWTs live for 30 days, so a ban must be enforced here, not just at
// login: any request carrying a banned user's session gets a 403 and has the
// cookie cleared. Requests without a session (including the OAuth callback,
// which does its own banned check before issuing a cookie) pass through.
export const onRequest: PagesFunction<Env> = async (context) => {
  const user = await getSessionUser(context.request, context.env)
  if (user && (await getBannedAt(context.env, user.uid))) {
    return json(
      { error: "This account has been suspended." },
      { status: 403, headers: { "Set-Cookie": clearSessionCookie(context.env) } },
    )
  }
  return context.next()
}

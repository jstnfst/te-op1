import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"

// Gate the whole community library API behind a session: browsing, viewing, and
// downloading patches all require sign-in. Per-owner checks (who may edit/delete,
// or see a private patch) stay in the individual handlers. Applies to
// /api/patches, /api/patches/:id, and /api/patches/:id/download.
export const onRequest: PagesFunction<Env> = async (context) => {
  const user = await getSessionUser(context.request, context.env)
  if (!user) return json({ error: "Sign in to view patches." }, { status: 401 })
  return context.next()
}

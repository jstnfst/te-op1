import type { Env } from "../../_shared/env"
import { requireAdmin } from "../../_shared/admin"

// Everything under /api/admin is admin-only. Non-admins (signed in or not)
// get a plain 404 so the surface doesn't advertise itself.
export const onRequest: PagesFunction<Env> = async (context) => {
  const gate = await requireAdmin(context.request, context.env)
  if (gate instanceof Response) return gate
  return context.next()
}

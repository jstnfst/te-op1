import type { Env } from "../../_shared/env"
import { json } from "../../_shared/session"

// GET /api/patches/counts - public patch totals per engine type, for the
// landing page's engine dial. { total, byType: { fm: 3, ... } }. A static
// route, so it takes precedence over /api/patches/:id.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await env.DB
    .prepare("SELECT type, COUNT(*) AS n FROM patches WHERE is_public = 1 GROUP BY type")
    .all<{ type: string; n: number }>()
  const byType: Record<string, number> = {}
  let total = 0
  for (const r of rows.results) { byType[r.type] = r.n; total += r.n }
  return json({ total, byType }, { headers: { "Cache-Control": "public, max-age=60" } })
}

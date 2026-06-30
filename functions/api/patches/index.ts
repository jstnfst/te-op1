import type { Env } from "../../_shared/env"
import { getSessionUser, json } from "../../_shared/session"
import { validatePreset, MAX_UPLOAD_BYTES } from "../../_shared/validate"
import { deriveTags } from "../../_shared/tags"

const PER_PAGE = 24

// GET /api/patches - public, filterable list.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const type = url.searchParams.get("type")
  const tag = url.searchParams.get("tag")
  const q = url.searchParams.get("q")
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1)

  const where = ["p.is_public = 1"]
  const binds: unknown[] = []
  if (type) { binds.push(type); where.push(`p.type = ?${binds.length}`) }
  if (tag) { binds.push(`%${tag}%`); where.push(`p.tags LIKE ?${binds.length}`) }
  if (q) { binds.push(`%${q}%`); where.push(`p.name LIKE ?${binds.length}`) }

  const offset = (page - 1) * PER_PAGE
  const sql =
    `SELECT p.id, p.name, p.type, p.fx_type, p.lfo_type, p.octave, p.tags,
            p.download_count, p.created_at, u.display_name AS author
     FROM patches p LEFT JOIN users u ON u.id = p.user_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.created_at DESC
     LIMIT ${PER_PAGE + 1} OFFSET ${offset}`
  const rows = await env.DB.prepare(sql).bind(...binds).all()
  const all = rows.results as Record<string, unknown>[]
  return json({ items: all.slice(0, PER_PAGE), page, hasMore: all.length > PER_PAGE })
}

// POST /api/patches - create a patch (auth required).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: "Sign in to upload." }, { status: 401 })

  // Reject oversized uploads before parsing, so a huge body can't be read into
  // memory and canonicalized just to be rejected by the storage cap later.
  const declaredLen = Number(request.headers.get("content-length") || 0)
  if (declaredLen > MAX_UPLOAD_BYTES) return json({ error: "Preset is too large." }, { status: 413 })

  let rawBody: string
  try { rawBody = await request.text() } catch { return json({ error: "Could not read request body." }, { status: 400 }) }
  if (rawBody.length > MAX_UPLOAD_BYTES) return json({ error: "Preset is too large." }, { status: 413 })

  let body: unknown
  try { body = JSON.parse(rawBody) } catch { return json({ error: "Expected a JSON body." }, { status: 400 }) }
  const presetInput =
    body && typeof body === "object" && "json" in (body as Record<string, unknown>)
      ? (body as Record<string, unknown>).json
      : body

  const v = validatePreset(presetInput)
  if (!v.ok || !v.json || !v.meta) return json({ error: v.error || "Invalid preset." }, { status: 400 })

  const recent = await env.DB
    .prepare("SELECT COUNT(*) AS c FROM patches WHERE user_id=?1 AND created_at > datetime('now','-1 hour')")
    .bind(user.uid)
    .first<{ c: number }>()
  if (recent && recent.c >= 50) return json({ error: "Upload rate limit reached. Try again later." }, { status: 429 })

  const tags = deriveTags(JSON.parse(v.json)).join(",")
  const res = await env.DB
    .prepare(
      `INSERT INTO patches (user_id, name, type, engine_version, fx_type, lfo_type, octave, json, tags)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
    )
    .bind(user.uid, v.meta.name, v.meta.type, v.meta.engine_version, v.meta.fx_type, v.meta.lfo_type, v.meta.octave, v.json, tags)
    .run()
  return json({ id: res.meta.last_row_id, name: v.meta.name }, { status: 201 })
}

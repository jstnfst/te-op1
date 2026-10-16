// Small shared helpers.

/** Filesystem-safe slug from a patch/pack name, with a fallback. */
export function slug(name: string, fallback = "patch"): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return s || fallback
}

/**
 * A post-login return path, or "/" if the value isn't a same-site path.
 * Rejects protocol-relative ("//evil", "/\evil") and API targets so the
 * OAuth round-trip can't be turned into an open redirect.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || next.length > 512) return "/"
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/"
  if (next.startsWith("/api/") || next.startsWith("/login")) return "/"
  return next
}

/** Page size for every paged list endpoint. */
export const PER_PAGE = 24

/**
 * Paging params shared by the list endpoints: ?page=N (1-based) and ?asof=ID.
 * `paged` is false when the caller sent no ?page= at all, so endpoints whose
 * existing callers expect the full list (e.g. patch.html's /api/me/patches
 * picker) can keep that response. `asof` freezes a listing at the highest id
 * seen on its first page, so rows created mid-scroll don't shift later pages.
 */
export function pageParams(url: URL) {
  const raw = url.searchParams.get("page")
  const page = Math.max(1, parseInt(raw || "1", 10) || 1)
  const a = parseInt(url.searchParams.get("asof") || "", 10)
  return {
    paged: raw !== null,
    page,
    per: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
    asof: Number.isInteger(a) && a > 0 ? a : null,
  }
}

/** The standard paged-list response body. */
export function pageBody<T>(rows: T[], total: number, page: number, asof: number | null) {
  return { items: rows.slice(0, PER_PAGE), total, page, hasMore: rows.length > PER_PAGE, asof }
}

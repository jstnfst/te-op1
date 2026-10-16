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

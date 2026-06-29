// Small shared helpers.

/** Filesystem-safe slug from a patch/pack name, with a fallback. */
export function slug(name: string, fallback = "patch"): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return s || fallback
}

/** /login?next=<here>, so signing in lands back where the visitor started. */
export function loginPath(next: string) {
  return next === "/" || next.startsWith("/login") ? "/login" : `/login?next=${encodeURIComponent(next)}`
}

/** The current page as a login return target. */
export const here = () => loginPath(location.pathname + location.search)

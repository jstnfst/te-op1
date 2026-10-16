import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "../auth"

const PROVIDERS: Array<[string, string]> = [
  ["google", "Continue with Google"],
  ["microsoft", "Continue with Microsoft"],
  ["yahoo", "Continue with Yahoo"],
  ["github", "Continue with GitHub"],
]

export default function Login() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  // Same-site path to return to; the server re-sanitizes it (functions/_shared/util.ts safeNext).
  const raw = params.get("next") || ""
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/"

  // next may be a static page (e.g. /patch.html?id=), so leave the SPA router.
  useEffect(() => {
    if (user) window.location.replace(next)
  }, [user, next])

  return (
    <>
      <h1 className="hero-title">Log in</h1>
      <p className="lead">
        Sign in to upload patches, build packs, and keep favorites. Browsing and downloading
        the library, and everything in the Lab, stays open to everyone.
      </p>
      {params.get("error") === "suspended" ? (
        <p className="error">This account has been suspended</p>
      ) : params.get("error") ? (
        <p className="error">Login failed. Please try again.</p>
      ) : null}
      <div className="provider-list">
        {PROVIDERS.map(([id, label]) => (
          <div key={id}>
            <a className="btn primary" href={`/api/auth/${id}${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`}>
              {label}
            </a>
            {id === "github" && (
              <p className="muted" style={{ marginTop: 6 }}>Also unlocks Issues, for reporting bugs and requesting features</p>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

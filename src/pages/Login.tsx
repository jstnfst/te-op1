import { useEffect, useState } from "react"
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

  // Mock personas for local testing. The endpoint 404s everywhere but a
  // localhost dev server with DEV_LOGIN=1 (functions/_shared/devLogin.ts),
  // so in production this stays null and the panel never renders.
  const [personas, setPersonas] = useState<Array<{ id: string; label: string; desc: string }> | null>(null)
  useEffect(() => {
    fetch("/api/auth/dev", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPersonas(d?.personas ?? null))
      .catch(() => setPersonas(null))
  }, [])

  // next may be a static page (e.g. /library/editor?id=), so leave the SPA router.
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

      {personas && (
        <section className="dev-login" aria-label="Development login">
          <p className="dev-login-head">Dev login · localhost only</p>
          <div className="dev-login-list">
            {personas.map((p) => (
              <a key={p.id} className="btn" href={`/api/auth/dev?as=${p.id}${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`} title={p.desc}>
                {p.label}
              </a>
            ))}
          </div>
          <p className="muted">Mock personas in your local database, never on the live site</p>
        </section>
      )}
    </>
  )
}

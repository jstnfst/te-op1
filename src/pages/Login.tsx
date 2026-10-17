import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "../auth"
import { HeroShader } from "../landing/HeroShader"
import "./login.css"

// [id, label, key-cap glyph]
const PROVIDERS: Array<[string, string, string]> = [
  ["google", "Google", "G"],
  ["microsoft", "Microsoft", "M"],
  ["yahoo", "Yahoo", "Y"],
  ["github", "GitHub", "GH"],
]

// What an account adds; the rest of the site needs none
const PERKS: Array<[string, string]> = [
  ["Upload", "Share your patches with the library, public or private"],
  ["Packs", "Collect patches into packs and download them as one .zip"],
  ["Favorites", "Like patches and packs to keep them close"],
  ["Issues", "Report bugs and request features (GitHub sign-in)"],
]

export default function Login() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const stage = useRef<HTMLElement>(null)
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

  const error = params.get("error")
  const q = next === "/" ? "" : `?next=${encodeURIComponent(next)}`

  return (
    <section className="login-stage" ref={stage}>
      <HeroShader host={stage} />
      <div className="login-grid">
        <div className="login-copy">
          <p className="eyebrow">Account</p>
          <h1 className="login-title">Log in</h1>
          <p className="login-lead">
            Browsing, downloading, and everything in the Lab stay open to everyone. An account adds:
          </p>
          <ul className="login-perks">
            {PERKS.map(([k, d], i) => (
              <li key={k}>
                <span className="login-perk-n">{String(i + 1).padStart(2, "0")}</span>
                <b>{k}</b>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="login-side">
          <div className="login-card">
            <p className="login-card-head">Continue with</p>
            {error === "suspended" ? (
              <p className="error">This account has been suspended</p>
            ) : error ? (
              <p className="error">Login failed. Please try again.</p>
            ) : null}
            <ul className="login-providers">
              {PROVIDERS.map(([id, label, glyph]) => (
                <li key={id}>
                  <a className="login-provider" href={`/api/auth/${id}${q}`}>
                    <span className="login-key" aria-hidden="true">{glyph}</span>
                    <span className="login-provider-name">
                      {label}
                      {id === "github" && <small>Also unlocks Issues</small>}
                    </span>
                    <span className="login-go" aria-hidden="true">→</span>
                  </a>
                </li>
              ))}
            </ul>
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
        </div>
      </div>
    </section>
  )
}

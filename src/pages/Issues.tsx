import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { apiGet } from "../api"
import RequireGithubIssues from "../githubGate"

interface Release {
  tagName: string
  name: string
  body: string
  publishedAt: string
  htmlUrl: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function IssuesHome() {
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    apiGet<{ items: Release[] }>("/api/releases")
      .then((d) => setReleases(d.items))
      .catch((e) => setErr((e as Error).message))
  }, [])

  return (
    <>
      <h1 className="hero-title">Issues</h1>
      <p className="lead">Bugs, feature requests, and what's shipped - filed and tracked on GitHub.</p>

      <div className="row" style={{ margin: "18px 0 28px" }}>
        <Link className="btn primary" to="/issues/report?type=bug">Report bug</Link>
        <Link className="btn primary" to="/issues/report?type=feature">Request feature</Link>
      </div>

      <h2>Changelog</h2>
      {err && <p className="error">{err}</p>}
      {!err && releases === null ? (
        <p className="muted">Loading…</p>
      ) : releases && releases.length === 0 ? (
        <p className="muted">No releases published yet.</p>
      ) : releases ? (
        <div className="changelog">
          {releases.map((r) => (
            <article className="release" key={r.tagName}>
              <div className="release-head">
                <a className="release-tag" href={r.htmlUrl} target="_blank" rel="noreferrer">{r.name}</a>
                <span className="muted">{formatDate(r.publishedAt)}</span>
              </div>
              {r.body && <p className="release-body">{r.body}</p>}
            </article>
          ))}
        </div>
      ) : null}
    </>
  )
}

export default function Issues() {
  return (
    <RequireGithubIssues title="Issues">
      <IssuesHome />
    </RequireGithubIssues>
  )
}

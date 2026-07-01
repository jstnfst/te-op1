import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "./auth"

// Issues are filed on GitHub as the viewer's own account, so this tab needs a
// GitHub-provider session with a stored access token. Shared by Issues.tsx and
// IssueReport.tsx so the four gate states (loading / signed out / wrong
// provider / needs reconnect) can't drift between the two pages.
export default function RequireGithubIssues({ title, children }: { title: string; children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <p className="muted">Loading…</p>

  if (!user) {
    return (
      <>
        <h1 className="hero-title">{title}</h1>
        <p className="lead">
          Filing an issue posts it to GitHub under your own account, so this tab needs a GitHub sign-in.
        </p>
        <p className="muted"><Link to="/login">Log in with GitHub</Link> to continue.</p>
      </>
    )
  }

  if (user.provider !== "github") {
    return (
      <>
        <h1 className="hero-title">{title}</h1>
        <p className="lead">
          Issues are filed on GitHub as you, so this tab is only available when you're signed in
          with a GitHub account. You're currently signed in with {user.provider}.
        </p>
        <p className="muted"><a className="btn primary" href="/api/auth/github">Continue with GitHub</a></p>
      </>
    )
  }

  if (!user.githubIssuesReady) {
    return (
      <>
        <h1 className="hero-title">{title}</h1>
        <p className="lead">
          Reporting issues needs one more permission from GitHub (to post issues as you). You've
          signed in before this was added - reconnect to pick it up.
        </p>
        <p className="muted"><a className="btn primary" href="/api/auth/github">Reconnect GitHub</a></p>
      </>
    )
  }

  return <>{children}</>
}

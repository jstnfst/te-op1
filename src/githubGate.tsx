import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "./auth"
import { loginPath } from "./paths"

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
          Issues post to GitHub under your account.
        </p>
        <p className="muted"><Link to={loginPath(location.pathname + location.search)}>Log in with GitHub</Link> to continue.</p>
      </>
    )
  }

  if (user.provider !== "github") {
    return (
      <>
        <h1 className="hero-title">{title}</h1>
        <p className="lead">
          Issues post to GitHub under your account. You're signed in with {user.provider}.
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
          GitHub needs one more permission to post issues as you.
        </p>
        <p className="muted"><a className="btn primary" href="/api/auth/github">Reconnect GitHub</a></p>
      </>
    )
  }

  return <>{children}</>
}

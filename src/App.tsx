import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom"
import type { ReactElement } from "react"
import { useAuth } from "./auth"
import Home from "./pages/Home"
import Login from "./pages/Login"
import Library from "./pages/Library"
import Mine from "./pages/Mine"
import Upload from "./pages/Upload"
import Packs from "./pages/Packs"
import Pack from "./pages/Pack"
import Favorites from "./pages/Favorites"
import Lab from "./pages/Lab"
import Issues from "./pages/Issues"
import IssueReport from "./pages/IssueReport"
import Mod from "./pages/Mod"
import { loginPath } from "./paths"

// Personal library pages need a session; send signed-out visitors to the
// login page, which brings them back here afterwards. Browsing is public.
function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <Navigate to={loginPath(loc.pathname + loc.search)} replace />
  return children
}

// Admin-only surface. Non-admins are sent home without a hint that the page
// exists; the API underneath is gated server-side regardless (functions/api/admin).
function RequireAdmin({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted">Loading…</p>
  if (!user?.isAdmin) return <Navigate to="/" replace />
  return children
}

function OldPackRedirect() {
  const { id } = useParams()
  return <Navigate to={`/library/packs/${id}`} replace />
}

// The header + footer are rendered site-wide by public/site-header.js (shared
// with the static reference pages), so the SPA only owns the <main> content.
// The landing page breaks out of the centered column for its full-bleed hero.
export default function App() {
  const { pathname } = useLocation()
  return (
    <main className={pathname === "/" ? "landing" : undefined}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        {/* Library: community patches. Browsing is public; the personal pages need a session. */}
        <Route path="/library" element={<Library />} />
        <Route path="/library/packs" element={<Packs />} />
        <Route path="/library/packs/:id" element={<Pack />} />
        <Route path="/library/faves" element={<RequireAuth><Favorites /></RequireAuth>} />
        <Route path="/library/mine" element={<RequireAuth><Mine /></RequireAuth>} />
        <Route path="/library/upload" element={<RequireAuth><Upload /></RequireAuth>} />

        {/* Lab: the format reference. /lab/layout, /lab/mappings and /lab/inspector
            are static pages served by public/_redirects. */}
        <Route path="/lab" element={<Lab />} />
        {/* Not wrapped in RequireAuth: RequireGithubIssues (in each page) already
            handles signed-out/wrong-provider/needs-reconnect with a message that
            explains why GitHub specifically is required, instead of a bare redirect. */}
        <Route path="/issues" element={<Issues />} />
        <Route path="/issues/report" element={<IssueReport />} />

        <Route path="/mod" element={<RequireAdmin><Mod /></RequireAdmin>} />

        {/* Pre-split URLs; keep old bookmarks and shared links working. */}
        <Route path="/patches" element={<Navigate to="/library" replace />} />
        <Route path="/browse" element={<Navigate to="/library" replace />} />
        <Route path="/me" element={<Navigate to="/library/mine" replace />} />
        <Route path="/packs" element={<Navigate to="/library/packs" replace />} />
        <Route path="/packs/:id" element={<OldPackRedirect />} />
        <Route path="/favorites" element={<Navigate to="/library/faves" replace />} />
        <Route path="/upload" element={<Navigate to="/library/upload" replace />} />

        <Route path="*" element={<p className="muted">Page not found.</p>} />
      </Routes>
    </main>
  )
}

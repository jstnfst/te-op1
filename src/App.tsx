import { Routes, Route, Navigate } from "react-router-dom"
import type { ReactElement } from "react"
import { useAuth } from "./auth"
import Home from "./pages/Home"
import Login from "./pages/Login"
import Patches from "./pages/Patches"
import Upload from "./pages/Upload"
import Packs from "./pages/Packs"
import Pack from "./pages/Pack"
import Issues from "./pages/Issues"
import IssueReport from "./pages/IssueReport"
import Mod from "./pages/Mod"

// Library pages require a session; send signed-out visitors to the login page.
// The patches API is gated server-side too (functions/api/patches/_middleware.ts).
function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
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

// The header + footer are rendered site-wide by public/site-header.js (shared
// with the static reference pages), so the SPA only owns the <main> content.
export default function App() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/patches" element={<RequireAuth><Patches /></RequireAuth>} />
        {/* Merged into /patches (My patches + Browse); redirect old bookmarks/links. */}
        <Route path="/browse" element={<Navigate to="/patches" replace />} />
        <Route path="/me" element={<Navigate to="/patches" replace />} />
        <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
        <Route path="/packs" element={<RequireAuth><Packs /></RequireAuth>} />
        <Route path="/packs/:id" element={<Pack />} />
        {/* Not wrapped in RequireAuth: RequireGithubIssues (in each page) already
            handles signed-out/wrong-provider/needs-reconnect with a message that
            explains why GitHub specifically is required, instead of a bare redirect. */}
        <Route path="/issues" element={<Issues />} />
        <Route path="/issues/report" element={<IssueReport />} />
        <Route path="/mod" element={<RequireAdmin><Mod /></RequireAdmin>} />
        <Route path="*" element={<p className="muted">Page not found.</p>} />
      </Routes>
    </main>
  )
}

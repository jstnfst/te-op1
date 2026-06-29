import { Routes, Route, Navigate } from "react-router-dom"
import type { ReactElement } from "react"
import { useAuth } from "./auth"
import Home from "./pages/Home"
import Login from "./pages/Login"
import Browse from "./pages/Browse"
import Upload from "./pages/Upload"
import MyPatches from "./pages/MyPatches"
import Packs from "./pages/Packs"
import Pack from "./pages/Pack"

// Library pages require a session; send signed-out visitors to the login page.
// The patches API is gated server-side too (functions/api/patches/_middleware.ts).
function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
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
        <Route path="/browse" element={<RequireAuth><Browse /></RequireAuth>} />
        <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
        <Route path="/me" element={<RequireAuth><MyPatches /></RequireAuth>} />
        <Route path="/packs" element={<RequireAuth><Packs /></RequireAuth>} />
        <Route path="/packs/:id" element={<Pack />} />
        <Route path="*" element={<p className="muted">Page not found.</p>} />
      </Routes>
    </main>
  )
}

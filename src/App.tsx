import { Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import Login from "./pages/Login"
import Browse from "./pages/Browse"
import Upload from "./pages/Upload"
import MyPatches from "./pages/MyPatches"

// The header + footer are rendered site-wide by public/site-header.js (shared
// with the static reference pages), so the SPA only owns the <main> content.
export default function App() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/me" element={<MyPatches />} />
        <Route path="*" element={<p className="muted">Page not found.</p>} />
      </Routes>
    </main>
  )
}

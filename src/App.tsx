import { Routes, Route, Link, NavLink } from "react-router-dom"
import { useAuth } from "./auth"
import Home from "./pages/Home"
import Login from "./pages/Login"
import Browse from "./pages/Browse"
import Upload from "./pages/Upload"
import MyPatches from "./pages/MyPatches"

const FW = "1.7.3"

function Header() {
  const { user, loading } = useAuth()
  return (
    <header className="site">
      <div className="header-row">
        <Link to="/" className="site-title">OP-1 FIELD</Link>
        <span className="site-sep">//</span>
        <span className="site-sub">preset library</span>
        <span className="header-spacer" />
        <span className="auth-mini">
          {loading ? null : user ? (
            <>
              {user.avatar && <img src={user.avatar} alt="" />}
              <span>{user.name || user.email}</span>
              <a href="/api/auth/logout">log out</a>
            </>
          ) : (
            <Link to="/login">log in</Link>
          )}
        </span>
      </div>
      <nav className="page-nav" aria-label="Site navigation">
        <NavLink to="/" end className="nav-btn">HOME</NavLink>
        {/* Reference docs remain as static pages for now. */}
        <a href="/params.html" className="nav-btn">LAYOUT</a>
        <a href="/display.html" className="nav-btn">MAPPINGS</a>
        <a href="/patch.html" className="nav-btn">PATCH</a>
        <NavLink to="/browse" className="nav-btn">BROWSE</NavLink>
        <NavLink to="/upload" className="nav-btn">UPLOAD</NavLink>
        <NavLink to="/me" className="nav-btn">MY PATCHES</NavLink>
      </nav>
    </header>
  )
}

function Footer() {
  return (
    <footer className="site">
      OP-1 Field firmware&nbsp;{FW} &middot;{" "}
      <a href="https://github.com/jstnfst/te-op1">github.com/jstnfst/te-op1</a>
    </footer>
  )
}

export default function App() {
  return (
    <>
      <Header />
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
      <Footer />
    </>
  )
}

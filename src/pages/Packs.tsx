import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiGet, apiSend, type Pack } from "../api"

const VIEW_KEY = "te-op1-packs-view"
type View = "grid" | "list"

export default function Packs() {
  const { user, loading } = useAuth()
  const [packs, setPacks] = useState<Pack[]>([])
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState("")
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as View) || "grid" } catch { return "grid" }
  })

  function setViewPersisted(v: View) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch {}
  }

  async function load() {
    try { const d = await apiGet<{ items: Pack[] }>("/api/packs"); setPacks(d.items) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => { if (user) load() }, [user])

  if (loading) return <p className="muted">Loading…</p>
  if (!user) {
    return (
      <>
        <h1 className="hero-title">Packs</h1>
        <p className="lead">Please <Link to="/login">log in</Link>.</p>
      </>
    )
  }

  async function create() {
    const n = name.trim()
    if (!n) return
    try { await apiSend("/api/packs", "POST", { name: n }); setName(""); load() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      <h1 className="hero-title">Packs</h1>
      <p className="lead">Group patches into a pack and share it as a single .zip of .aif files.</p>
      <div className="row" style={{ margin: "16px 0" }}>
        <input
          type="text"
          placeholder="New pack name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") create() }}
          aria-label="New pack name"
        />
        <button className="btn primary" onClick={create} disabled={!name.trim()}>Create pack</button>
      </div>
      {err && <p className="error">{err}</p>}
      {busy ? (
        <p className="muted">Loading…</p>
      ) : packs.length === 0 ? (
        <p className="muted">No packs yet. Create one above, then add patches from <Link to="/browse">Browse</Link> or <Link to="/me">My patches</Link>.</p>
      ) : (
        <>
          <div className="browse-head">
            <span className="browse-count">{packs.length} {packs.length === 1 ? "pack" : "packs"}</span>
            <div className="view-toggle" role="group" aria-label="Display view">
              <button
                className={"view-btn" + (view === "grid" ? " active" : "")}
                onClick={() => setViewPersisted("grid")}
                aria-label="Grid view"
                title="Grid view"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <rect x="0" y="0" width="6" height="6" rx="1" fill="currentColor"/>
                  <rect x="8" y="0" width="6" height="6" rx="1" fill="currentColor"/>
                  <rect x="0" y="8" width="6" height="6" rx="1" fill="currentColor"/>
                  <rect x="8" y="8" width="6" height="6" rx="1" fill="currentColor"/>
                </svg>
              </button>
              <button
                className={"view-btn" + (view === "list" ? " active" : "")}
                onClick={() => setViewPersisted("list")}
                aria-label="List view"
                title="List view"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <rect x="0" y="1" width="14" height="2.5" rx="1" fill="currentColor"/>
                  <rect x="0" y="5.75" width="14" height="2.5" rx="1" fill="currentColor"/>
                  <rect x="0" y="10.5" width="14" height="2.5" rx="1" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
          {view === "grid" ? (
            <div className="grid">
              {packs.map((p) => (
                <Link className="card" key={p.id} to={`/packs/${p.id}`}>
                  <div className="card-eyebrow">
                    <span className="chip">{p.is_public ? "public" : "private"}</span> {p.item_count ?? 0} patches
                  </div>
                  <div className="card-title">{p.name}</div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="list">
              {packs.map((p) => (
                <Link className="list-row" key={p.id} to={`/packs/${p.id}`}>
                  <span className="chip list-type">{p.is_public ? "public" : "private"}</span>
                  <span className="list-name">{p.name}</span>
                  <span className="list-author">{p.item_count ?? 0} patches</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

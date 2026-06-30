import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiGet, apiSend, type PatchSummary } from "../api"
import { useSelection, SelectionBar } from "../packs"

const VIEW_KEY = "te-op1-patches-view"
type View = "grid" | "list"

export default function MyPatches() {
  const { user, loading } = useAuth()
  const [items, setItems] = useState<PatchSummary[]>([])
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(true)
  const [pendingDel, setPendingDel] = useState<number | null>(null)
  const [pendingPublic, setPendingPublic] = useState<number | null>(null)
  const [toggling, setToggling] = useState<number | null>(null)
  const delTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publicTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selection = useSelection()
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as View) || "grid" } catch { return "grid" }
  })

  function setViewPersisted(v: View) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch {}
  }

  async function load() {
    try {
      const d = await apiGet<{ items: PatchSummary[] }>("/api/me/patches")
      setItems(d.items)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { if (user) load() }, [user])
  useEffect(() => () => {
    if (delTimer.current) clearTimeout(delTimer.current)
    if (publicTimer.current) clearTimeout(publicTimer.current)
  }, [])

  if (loading) return <p className="muted">Loading…</p>
  if (!user) {
    return (
      <>
        <h1 className="hero-title">My patches</h1>
        <p className="lead">Please <Link to="/login">log in</Link>.</p>
      </>
    )
  }

  async function del(id: number) {
    if (pendingDel !== id) {
      if (delTimer.current) clearTimeout(delTimer.current)
      setPendingDel(id)
      delTimer.current = setTimeout(() => setPendingDel(null), 2000)
      return
    }
    if (delTimer.current) clearTimeout(delTimer.current)
    setPendingDel(null)
    try {
      await apiSend(`/api/patches/${id}`, "DELETE")
      setItems((i) => i.filter((p) => p.id !== id))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function toggle(p: PatchSummary) {
    // "Make public" is irreversible — require a second tap
    if (!p.is_public && pendingPublic !== p.id) {
      if (publicTimer.current) clearTimeout(publicTimer.current)
      setPendingPublic(p.id)
      publicTimer.current = setTimeout(() => setPendingPublic(null), 3000)
      return
    }
    if (publicTimer.current) clearTimeout(publicTimer.current)
    setPendingPublic(null)
    const np = !p.is_public
    setToggling(p.id)
    try {
      await apiSend(`/api/patches/${p.id}`, "PATCH", { is_public: np })
      setItems((i) => i.map((x) => (x.id === p.id ? { ...x, is_public: np ? 1 : 0 } : x)))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setToggling(null)
    }
  }

  const viewToggle = (
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
  )

  return (
    <>
      <h1 className="hero-title">My patches</h1>
      {err && <p className="error">{err}</p>}
      {busy ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">You haven't uploaded anything yet. <Link to="/upload">Upload one</Link>.</p>
      ) : (
        <>
          <div className="browse-head">
            <span className="browse-count">{items.length} {items.length === 1 ? "patch" : "patches"}</span>
            {viewToggle}
          </div>
          {view === "grid" ? (
            <div className="grid">
              {items.map((p) => (
                <div className={"card" + (selection.has(p.id) ? " selected" : "")} key={p.id}>
                  <div className="card-eyebrow">
                    <label className="card-check">
                      <input type="checkbox" checked={selection.has(p.id)} onChange={() => selection.toggle(p.id)} aria-label={`Select ${p.name}`} />
                    </label>
                    <span className="chip">{p.type}</span>
                    <span>{p.is_public ? "public" : "private"}</span>
                  </div>
                  <div className="card-title">{p.name}</div>
                  {p.tags && p.tags.split(",").filter(Boolean).length > 0 && (
                    <div className="card-tags" style={{ marginTop: 6 }}>
                      {p.tags.split(",").filter(Boolean).slice(0, 6).map((t) => (
                        <span key={t} className="chip tag">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="row" style={{ marginTop: 12 }}>
                    <a className="btn" href={`/patch.html?id=${p.id}`}>Open</a>
                    <a className="btn" href={`/api/patches/${p.id}/download`}>Download .aif</a>
                    <button
                      className={"btn" + (pendingPublic === p.id ? " primary" : "")}
                      onClick={() => toggle(p)}
                      disabled={toggling === p.id}
                    >
                      {pendingPublic === p.id ? "Make public?" : p.is_public ? "Make private" : "Make public"}
                    </button>
                    <button className={"btn" + (pendingDel === p.id ? " danger" : "")} onClick={() => del(p.id)}>
                      {pendingDel === p.id ? "Confirm?" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="list">
              {items.map((p) => (
                <div className={"list-row" + (selection.has(p.id) ? " selected" : "")} key={p.id}>
                  <label className="card-check list-check">
                    <input type="checkbox" checked={selection.has(p.id)} onChange={() => selection.toggle(p.id)} aria-label={`Select ${p.name}`} />
                  </label>
                  <span className="chip list-type">{p.type}</span>
                  <span className="list-author">{p.is_public ? "public" : "private"}</span>
                  <span className="list-name">{p.name}</span>
                  {p.tags && p.tags.split(",").filter(Boolean).length > 0 && (
                    <div className="list-tags">
                      {p.tags.split(",").filter(Boolean).slice(0, 3).map((t) => (
                        <span key={t} className="chip tag">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="list-actions">
                    <a className="btn" href={`/patch.html?id=${p.id}`}>Open</a>
                    <button
                      className={"btn list-act-ext" + (pendingPublic === p.id ? " primary" : "")}
                      onClick={() => toggle(p)}
                      disabled={toggling === p.id}
                    >
                      {pendingPublic === p.id ? "Make public?" : p.is_public ? "Make private" : "Make public"}
                    </button>
                    <button
                      className={"btn list-act-ext" + (pendingDel === p.id ? " danger" : "")}
                      onClick={() => del(p.id)}
                    >
                      {pendingDel === p.id ? "Confirm?" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <SelectionBar ids={selection.ids} onClear={selection.clear} />
    </>
  )
}

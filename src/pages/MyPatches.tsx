import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiGet, apiSend, type PatchSummary } from "../api"
import { useSelection, SelectionBar } from "../packs"

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

  return (
    <>
      <h1 className="hero-title">My patches</h1>
      {err && <p className="error">{err}</p>}
      {busy ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">You haven't uploaded anything yet. <Link to="/upload">Upload one</Link>.</p>
      ) : (
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
                <div className="card-desc" style={{ marginTop: 6 }}>
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
      )}
      <SelectionBar ids={selection.ids} onClear={selection.clear} />
    </>
  )
}

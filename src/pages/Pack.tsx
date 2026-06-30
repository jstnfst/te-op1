import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useAuth } from "../auth"
import { apiGet, apiSend, type PatchSummary } from "../api"

interface PackDetail {
  id: number
  name: string
  is_public: number
  author: string | null
  created_at: string
  is_owner: boolean
  items: PatchSummary[]
}

export default function Pack() {
  const { id } = useParams()
  const { user } = useAuth()
  const [pack, setPack] = useState<PackDetail | null>(null)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(true)
  const [pendingDel, setPendingDel] = useState(false)
  const delTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load() {
    setBusy(true)
    try { setPack(await apiGet<PackDetail>(`/api/packs/${id}`)) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [id])
  useEffect(() => () => { if (delTimer.current) clearTimeout(delTimer.current) }, [])

  if (busy) return <p className="muted">Loading…</p>
  if (err || !pack) {
    return (
      <>
        <h1 className="hero-title">Pack</h1>
        <p className="muted">{err || "Not found."}</p>
        <p className="muted"><Link to="/browse">Browse patches</Link></p>
      </>
    )
  }

  async function remove(patchId: number) {
    try {
      await apiSend(`/api/packs/${pack!.id}/items`, "DELETE", { patch_id: patchId })
      load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function togglePublic() {
    try {
      await apiSend(`/api/packs/${pack!.id}`, "PATCH", { is_public: !pack!.is_public })
      load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function del() {
    if (!pendingDel) {
      if (delTimer.current) clearTimeout(delTimer.current)
      setPendingDel(true)
      delTimer.current = setTimeout(() => setPendingDel(false), 2000)
      return
    }
    if (delTimer.current) clearTimeout(delTimer.current)
    setPendingDel(false)
    try {
      await apiSend(`/api/packs/${pack!.id}`, "DELETE")
      window.location.href = "/packs"
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const shareUrl = `${location.origin}/packs/${pack.id}`
  return (
    <>
      {pack.author && <p className="lead" style={{ marginBottom: 4, fontSize: 12 }}>by {pack.author}</p>}
      <h1 className="hero-title">{pack.name}</h1>
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ margin: "12px 0" }}>
        <a className="btn primary" href={`/api/packs/${pack.id}/download`}>Download .zip</a>
        {pack.is_owner && <button className="btn" onClick={togglePublic}>{pack.is_public ? "Make private" : "Make public"}</button>}
        {pack.is_owner && (
          <button className={"btn" + (pendingDel ? " danger" : "")} onClick={del}>
            {pendingDel ? "Confirm?" : "Delete pack"}
          </button>
        )}
      </div>
      {pack.is_public ? (
        <p className="muted">Public - anyone with the link can download: <code>{shareUrl}</code></p>
      ) : (
        <p className="muted">Private - only you can download.</p>
      )}

      {pack.items.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          No patches in this pack yet{pack.is_owner ? " - add some from Browse or My patches." : "."}
        </p>
      ) : (
        <div className="grid" style={{ marginTop: 16 }}>
          {pack.items.map((p) => (
            <div className="card" key={p.id}>
              <div className="card-eyebrow">
                <span className="chip">{p.type}</span>
                {p.author ? <span>by {p.author}</span> : null}
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
                {pack.is_owner && <button className="btn" onClick={() => remove(p.id)}>Remove</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!user && <p className="muted" style={{ marginTop: 16 }}>Want to make your own packs? <Link to="/login">Log in</Link>.</p>}
    </>
  )
}

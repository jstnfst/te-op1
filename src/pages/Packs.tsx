import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiGet, apiSend, type Pack } from "../api"

export default function Packs() {
  const { user, loading } = useAuth()
  const [packs, setPacks] = useState<Pack[]>([])
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState("")

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
        />
        <button className="btn primary" onClick={create} disabled={!name.trim()}>Create pack</button>
      </div>
      {err && <p className="error">{err}</p>}
      {busy ? (
        <p className="muted">Loading…</p>
      ) : packs.length === 0 ? (
        <p className="muted">No packs yet. Create one above, then add patches from <Link to="/browse">Browse</Link> or <Link to="/me">My patches</Link>.</p>
      ) : (
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
      )}
    </>
  )
}

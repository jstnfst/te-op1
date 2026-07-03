import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiGet, apiSend, type Pack } from "../api"
import { Collapsible } from "../collapsible"
import { LikeButton } from "../like"

const VIEW_KEY = "te-op1-packs-view"
const DISCOVER_VIEW_KEY = "te-op1-packs-discover-view"
type View = "grid" | "list"

function useViewToggle(storageKey: string, initial: View = "grid") {
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem(storageKey) as View) || initial } catch { return initial }
  })
  function setViewPersisted(v: View) {
    setView(v)
    try { localStorage.setItem(storageKey, v) } catch {}
  }
  return [view, setViewPersisted] as const
}

function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <div className="view-toggle" role="group" aria-label="Display view">
      <button
        className={"view-btn" + (view === "grid" ? " active" : "")}
        onClick={() => setView("grid")}
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
        onClick={() => setView("list")}
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
}

function PackGrid({ packs, showAuthor }: { packs: Pack[]; showAuthor: boolean }) {
  return (
    <div className="grid">
      {packs.map((p) => (
        <Link className="card" key={p.id} to={`/packs/${p.id}`}>
          <div className="card-eyebrow">
            <span className={"chip " + (p.is_public ? "vis-public" : "vis-private")}>
              {p.is_public ? "public" : "private"}
            </span>
            <span>{p.item_count ?? 0} patches</span>
            {showAuthor && p.author ? <span>by {p.author}</span> : null}
          </div>
          <div className="card-title">{p.name}</div>
          <div className="row card-actions">
            <LikeButton type="pack" id={p.id} likeCount={p.like_count} likedByMe={p.liked_by_me} />
          </div>
        </Link>
      ))}
    </div>
  )
}

function PackList({ packs, showAuthor }: { packs: Pack[]; showAuthor: boolean }) {
  return (
    <div className="list">
      {packs.map((p) => (
        <Link className="list-row" key={p.id} to={`/packs/${p.id}`}>
          <span className={"chip list-type " + (p.is_public ? "vis-public" : "vis-private")}>
            {p.is_public ? "public" : "private"}
          </span>
          <span className="list-name">{p.name}</span>
          {showAuthor && p.author ? <span className="list-author">by {p.author}</span> : (
            <span className="list-author">{p.item_count ?? 0} patches</span>
          )}
          <div className="list-actions">
            <LikeButton type="pack" id={p.id} likeCount={p.like_count} likedByMe={p.liked_by_me} />
          </div>
        </Link>
      ))}
    </div>
  )
}

function MyPacks() {
  const [packs, setPacks] = useState<Pack[]>([])
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState("")
  const [view, setView] = useViewToggle(VIEW_KEY)

  async function load() {
    try { const d = await apiGet<{ items: Pack[] }>("/api/packs"); setPacks(d.items) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])

  async function create() {
    const n = name.trim()
    if (!n) return
    try { await apiSend("/api/packs", "POST", { name: n }); setName(""); load() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <Collapsible storageKey="te-op1-packs-mine-open" summary={`My packs${busy ? "" : ` (${packs.length})`}`}>
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
        <p className="muted">No packs yet. Create one above, then add patches from <Link to="/patches">Patches</Link>.</p>
      ) : (
        <>
          <div className="browse-head">
            <span className="browse-count">{packs.length} {packs.length === 1 ? "pack" : "packs"}</span>
            <ViewToggle view={view} setView={setView} />
          </div>
          {view === "grid" ? <PackGrid packs={packs} showAuthor={false} /> : <PackList packs={packs} showAuthor={false} />}
        </>
      )}
    </Collapsible>
  )
}

function DiscoverPacks() {
  const [packs, setPacks] = useState<Pack[]>([])
  const [q, setQ] = useState("")
  const [sort, setSort] = useState("")
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState("")
  const [view, setView] = useViewToggle(DISCOVER_VIEW_KEY)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  async function load(query: string, sortBy = sort) {
    setBusy(true)
    setErr("")
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("q", query.trim())
      if (sortBy) params.set("sort", sortBy)
      const d = await apiGet<{ items: Pack[] }>(`/api/packs/public?${params.toString()}`)
      setPacks(d.items)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { load("") }, [])
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(q), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <>
      <div className="row" style={{ margin: "16px 0" }}>
        <input
          type="search"
          placeholder="Search public packs…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search public packs"
        />
        <select
          className="sort-select"
          value={sort}
          onChange={(e) => { setSort(e.target.value); load(q, e.target.value) }}
          aria-label="Sort order"
        >
          <option value="">Newest</option>
          <option value="likes">Most liked</option>
        </select>
      </div>
      {err && <p className="error">{err}</p>}
      {busy && packs.length === 0 ? (
        <p className="muted">Loading…</p>
      ) : packs.length === 0 ? (
        <p className="muted">{q.trim() ? `No public packs match "${q.trim()}".` : "No public packs yet."}</p>
      ) : (
        <>
          <div className="browse-head">
            <span className="browse-count">{packs.length} public {packs.length === 1 ? "pack" : "packs"}</span>
            <ViewToggle view={view} setView={setView} />
          </div>
          {view === "grid" ? <PackGrid packs={packs} showAuthor /> : <PackList packs={packs} showAuthor />}
        </>
      )}
    </>
  )
}

export default function Packs() {
  const { user, loading } = useAuth()

  if (loading) return <p className="muted">Loading…</p>
  if (!user) {
    return (
      <>
        <h1 className="hero-title">Packs</h1>
        <p className="lead">Please <Link to="/login">log in</Link>.</p>
      </>
    )
  }

  return (
    <>
      <h1 className="hero-title">Packs</h1>
      <p className="lead">Group patches into a pack and share it as a single .zip of .aif files.</p>

      <MyPacks />

      <h2>Discover public packs</h2>
      <DiscoverPacks />
    </>
  )
}

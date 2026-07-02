import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiGet, apiSend, type PatchSummary } from "../api"
import { useSelection, SelectionBar, type Selection } from "../packs"
import { Collapsible } from "../collapsible"
import { LikeButton } from "../like"

const TYPES = [
  "amp", "cluster", "dbox", "digital", "dimension", "dna", "drwave",
  "dsynth", "fm", "phase", "pulse", "sampler", "string", "vocoder", "voltage",
]

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

// ---------- My patches ----------

function MyPatches({ selection }: { selection: Selection }) {
  const [items, setItems] = useState<PatchSummary[]>([])
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(true)
  const [pendingDel, setPendingDel] = useState<number | null>(null)
  const [pendingPublic, setPendingPublic] = useState<number | null>(null)
  const [toggling, setToggling] = useState<number | null>(null)
  const delTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publicTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [view, setView] = useViewToggle("te-op1-patches-mine-view")

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

  useEffect(() => { load() }, [])
  useEffect(() => () => {
    if (delTimer.current) clearTimeout(delTimer.current)
    if (publicTimer.current) clearTimeout(publicTimer.current)
  }, [])

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
    // "Make public" is irreversible - require a second tap
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
    <Collapsible storageKey="te-op1-patches-mine-open" summary={`My patches${busy ? "" : ` (${items.length})`}`}>
      {err && <p className="error">{err}</p>}
      {busy ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">You haven't uploaded anything yet. <Link to="/upload">Upload one</Link>.</p>
      ) : (
        <>
          <div className="browse-head">
            <span className="browse-count">{items.length} {items.length === 1 ? "patch" : "patches"}</span>
            <ViewToggle view={view} setView={setView} />
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
    </Collapsible>
  )
}

// ---------- Discover patches ----------

/** Admin-only moderation handles on community items (hidden for everyone else). */
interface ModActions {
  armedDel: boolean
  busy: boolean
  onPrivate: () => void
  onDelete: () => void
}

function ModButtons({ mod, ext }: { mod: ModActions; ext?: boolean }) {
  // In list view only Delete hides on mobile (list-act-ext): the reversible
  // takedown stays reachable everywhere.
  return (
    <>
      <button className="btn" onClick={mod.onPrivate} disabled={mod.busy}>
        {mod.busy ? "Working…" : "Make private"}
      </button>
      <button className={"btn" + (ext ? " list-act-ext" : "") + (mod.armedDel ? " danger" : "")} onClick={mod.onDelete} disabled={mod.busy}>
        {mod.armedDel ? "Confirm?" : "Delete"}
      </button>
    </>
  )
}

function GridCard({ p, selected, onToggle, onTagClick, mod }: { p: PatchSummary; selected: boolean; onToggle: () => void; onTagClick: (t: string) => void; mod?: ModActions }) {
  const tags = p.tags.split(",").filter(Boolean).slice(0, 6)
  return (
    <div className={"card" + (selected ? " selected" : "")}>
      <div className="card-eyebrow">
        <label className="card-check">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${p.name}`} />
        </label>
        <span className="chip">{p.type}</span>
        {p.author ? <span>by {p.author}</span> : null}
      </div>
      <div className="card-title">{p.name}</div>
      <div className="card-tags">
        {tags.map((t) => (
          <span key={t} className="chip tag chip-filter" onClick={() => onTagClick(t)} title={`Filter by ${t}`}>{t}</span>
        ))}
      </div>
      <div className="row card-actions">
        <a className="btn" href={`/patch.html?id=${p.id}`}>Open</a>
        <a className="btn" href={`/api/patches/${p.id}/download`}>Download .aif</a>
        <LikeButton type="patch" id={p.id} likeCount={p.like_count} likedByMe={p.liked_by_me} />
        {mod && <ModButtons mod={mod} />}
      </div>
    </div>
  )
}

function ListRow({ p, selected, onToggle, onTagClick, mod }: { p: PatchSummary; selected: boolean; onToggle: () => void; onTagClick: (t: string) => void; mod?: ModActions }) {
  const tags = p.tags.split(",").filter(Boolean).slice(0, 4)
  return (
    <div className={"list-row" + (selected ? " selected" : "")}>
      <label className="card-check list-check">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${p.name}`} />
      </label>
      <span className="chip list-type">{p.type}</span>
      <span className="list-name">{p.name}</span>
      {p.author ? <span className="list-author">by {p.author}</span> : null}
      <div className="list-tags">
        {tags.map((t) => (
          <span key={t} className="chip tag chip-filter" onClick={() => onTagClick(t)} title={`Filter by ${t}`}>{t}</span>
        ))}
      </div>
      <div className="list-actions">
        <LikeButton type="patch" id={p.id} likeCount={p.like_count} likedByMe={p.liked_by_me} />
        <a className="btn" href={`/patch.html?id=${p.id}`}>Open</a>
        <a className="btn list-dl" href={`/api/patches/${p.id}/download`}>Download .aif</a>
        {mod && <ModButtons mod={mod} ext />}
      </div>
    </div>
  )
}

function DiscoverPatches({ selection }: { selection: Selection }) {
  const { user } = useAuth()
  const [items, setItems] = useState<PatchSummary[]>([])
  const [type, setType] = useState("")
  const [q, setQ] = useState("")
  const [tag, setTag] = useState("")
  const [sort, setSort] = useState("")
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [view, setView] = useViewToggle("te-op1-patches-discover-view")
  const [modArmed, setModArmed] = useState<number | null>(null)
  const [modBusy, setModBusy] = useState<number | null>(null)
  const modTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (modTimer.current) clearTimeout(modTimer.current) }, [])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtersRef = useRef({ type: "", q: "", tag: "", sort: "" })
  filtersRef.current = { type, q, tag, sort }
  const isFirstQTagRender = useRef(true)

  async function load(filters = filtersRef.current) {
    setLoading(true)
    setErr("")
    try {
      const params = new URLSearchParams()
      if (filters.type) params.set("type", filters.type)
      if (filters.q.trim()) params.set("q", filters.q.trim())
      if (filters.tag.trim()) params.set("tag", filters.tag.trim())
      if (filters.sort) params.set("sort", filters.sort)
      const data = await apiGet<{ items: PatchSummary[] }>(`/api/patches?${params.toString()}`)
      setItems(data.items)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, sort])

  useEffect(() => {
    if (isFirstQTagRender.current) { isFirstQTagRender.current = false; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tag])

  function handleTagClick(t: string) {
    setTag(t)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    load({ ...filtersRef.current, tag: t })
  }

  function clearFilters() {
    setType("")
    setQ("")
    setTag("")
  }

  // Admin moderation on community items: make private (one tap, reversible by
  // the owner) or delete (second-tap confirm, same convention as MyPatches).
  async function modPrivate(p: PatchSummary) {
    setModBusy(p.id)
    try {
      await apiSend(`/api/patches/${p.id}`, "PATCH", { is_public: false })
      setItems((i) => i.filter((x) => x.id !== p.id))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setModBusy(null)
    }
  }

  async function modDelete(p: PatchSummary) {
    if (modArmed !== p.id) {
      if (modTimer.current) clearTimeout(modTimer.current)
      setModArmed(p.id)
      modTimer.current = setTimeout(() => setModArmed(null), 2500)
      return
    }
    if (modTimer.current) clearTimeout(modTimer.current)
    setModArmed(null)
    setModBusy(p.id)
    try {
      await apiSend(`/api/patches/${p.id}`, "DELETE")
      setItems((i) => i.filter((x) => x.id !== p.id))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setModBusy(null)
    }
  }

  const modFor = (p: PatchSummary): ModActions | undefined =>
    user?.isAdmin
      ? { armedDel: modArmed === p.id, busy: modBusy === p.id, onPrivate: () => modPrivate(p), onDelete: () => modDelete(p) }
      : undefined

  const hasFilters = type !== "" || q !== "" || tag !== ""

  return (
    <>
      <h2>Discover patches</h2>
      <div className="browse-head">
        <div className="row">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by engine">
            <option value="">All engines</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="search"
            placeholder="Search name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search by name"
          />
          <input
            type="search"
            placeholder="Filter by tag…"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            aria-label="Filter by tag"
          />
          <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort order">
            <option value="">Newest</option>
            <option value="likes">Most liked</option>
          </select>
          {hasFilters && (
            <button className="btn" onClick={clearFilters}>Clear</button>
          )}
        </div>
        <ViewToggle view={view} setView={setView} />
      </div>
      {err && <p className="error">{err}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <>
          <p className="muted">No patches found.</p>
          {hasFilters
            ? <p style={{ marginTop: 8 }}><button className="btn" onClick={clearFilters}>Clear filters</button></p>
            : <p className="muted" style={{ marginTop: 4 }}>No community patches yet - <Link to="/upload">upload the first one</Link>.</p>
          }
        </>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>{items.length} {items.length === 1 ? "patch" : "patches"}</p>
          {view === "grid" ? (
            <div className="grid">
              {items.map((p) => (
                <GridCard key={p.id} p={p} selected={selection.has(p.id)} onToggle={() => selection.toggle(p.id)} onTagClick={handleTagClick} mod={modFor(p)} />
              ))}
            </div>
          ) : (
            <div className="list">
              {items.map((p) => (
                <ListRow key={p.id} p={p} selected={selection.has(p.id)} onToggle={() => selection.toggle(p.id)} onTagClick={handleTagClick} mod={modFor(p)} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

export default function Patches() {
  const { user, loading } = useAuth()
  const selection = useSelection()

  if (loading) return <p className="muted">Loading…</p>
  if (!user) {
    return (
      <>
        <h1 className="hero-title">Patches</h1>
        <p className="lead">Please <Link to="/login">log in</Link>.</p>
      </>
    )
  }

  return (
    <>
      <h1 className="hero-title">Patches</h1>
      <p className="lead">Manage what you've published, and search the community library for more.</p>

      <MyPatches selection={selection} />
      <DiscoverPatches selection={selection} />

      <SelectionBar ids={selection.ids} onClear={selection.clear} />
    </>
  )
}

import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { apiGet, type PatchSummary } from "../api"
import { useSelection, SelectionBar } from "../packs"

const TYPES = [
  "amp", "cluster", "dbox", "digital", "dimension", "dna", "drwave",
  "dsynth", "fm", "phase", "pulse", "sampler", "string", "vocoder", "voltage",
]

const VIEW_KEY = "te-op1-browse-view"
type View = "grid" | "list"

function GridCard({ p, selected, onToggle, onTagClick }: { p: PatchSummary; selected: boolean; onToggle: () => void; onTagClick: (t: string) => void }) {
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
      <div className="card-desc">
        {tags.map((t) => (
          <span key={t} className="chip tag" style={{ cursor: "pointer" }} onClick={() => onTagClick(t)} title={`Filter by ${t}`}>{t}</span>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <a className="btn" href={`/patch.html?id=${p.id}`}>Open</a>
        <a className="btn" href={`/api/patches/${p.id}/download`}>Download .aif</a>
      </div>
    </div>
  )
}

function ListRow({ p, selected, onToggle, onTagClick }: { p: PatchSummary; selected: boolean; onToggle: () => void; onTagClick: (t: string) => void }) {
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
          <span key={t} className="chip tag" style={{ cursor: "pointer" }} onClick={() => onTagClick(t)} title={`Filter by ${t}`}>{t}</span>
        ))}
      </div>
      <div className="list-actions">
        <a className="btn" href={`/patch.html?id=${p.id}`}>Open</a>
        <a className="btn list-dl" href={`/api/patches/${p.id}/download`}>Download .aif</a>
      </div>
    </div>
  )
}

export default function Browse() {
  const [items, setItems] = useState<PatchSummary[]>([])
  const [type, setType] = useState("")
  const [q, setQ] = useState("")
  const [tag, setTag] = useState("")
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as View) || "grid" } catch { return "grid" }
  })
  const selection = useSelection()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtersRef = useRef({ type: "", q: "", tag: "" })
  filtersRef.current = { type, q, tag }
  const isFirstQTagRender = useRef(true)

  function setViewPersisted(v: View) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch {}
  }

  async function load(filters = filtersRef.current) {
    setLoading(true)
    setErr("")
    try {
      const params = new URLSearchParams()
      if (filters.type) params.set("type", filters.type)
      if (filters.q.trim()) params.set("q", filters.q.trim())
      if (filters.tag.trim()) params.set("tag", filters.tag.trim())
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
  }, [type])

  useEffect(() => {
    if (isFirstQTagRender.current) { isFirstQTagRender.current = false; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
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

  const hasFilters = type !== "" || q !== "" || tag !== ""

  return (
    <>
      <h1 className="hero-title">Browse patches</h1>
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
          {hasFilters && (
            <button className="btn" onClick={clearFilters}>Clear</button>
          )}
        </div>
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
      {err && <p className="error">{err}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <>
          <p className="muted">No patches found.</p>
          {hasFilters
            ? <p style={{ marginTop: 8 }}><button className="btn" onClick={clearFilters}>Clear filters</button></p>
            : <p className="muted" style={{ marginTop: 4 }}>No community patches yet — <Link to="/upload">upload the first one</Link>.</p>
          }
        </>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>{items.length} {items.length === 1 ? "patch" : "patches"}</p>
          {view === "grid" ? (
            <div className="grid">
              {items.map((p) => (
                <GridCard key={p.id} p={p} selected={selection.has(p.id)} onToggle={() => selection.toggle(p.id)} onTagClick={handleTagClick} />
              ))}
            </div>
          ) : (
            <div className="list">
              {items.map((p) => (
                <ListRow key={p.id} p={p} selected={selection.has(p.id)} onToggle={() => selection.toggle(p.id)} onTagClick={handleTagClick} />
              ))}
            </div>
          )}
        </>
      )}
      <SelectionBar ids={selection.ids} onClear={selection.clear} />
    </>
  )
}

import { useEffect, useState } from "react"
import { apiGet, type PatchSummary } from "../api"
import { useSelection, SelectionBar } from "../packs"

const TYPES = [
  "amp", "cluster", "dbox", "digital", "dimension", "dna", "drwave",
  "dsynth", "fm", "phase", "pulse", "sampler", "string", "vocoder", "voltage",
]

function Card({ p, selected, onToggle }: { p: PatchSummary; selected: boolean; onToggle: () => void }) {
  const tags = p.tags.split(",").filter(Boolean).slice(0, 6)
  return (
    <div className={"card" + (selected ? " selected" : "")}>
      <div className="card-eyebrow">
        <label className="card-check">
          <input type="checkbox" checked={selected} onChange={onToggle} /> select
        </label>
      </div>
      <div className="card-eyebrow">
        <span className="chip">{p.type}</span>
        {p.author ? ` by ${p.author}` : ""}
      </div>
      <div className="card-title">{p.name}</div>
      <div className="card-desc">
        {tags.map((t) => <span key={t} className="chip tag">{t}</span>)}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <a className="btn" href={`/patch.html?id=${p.id}`}>Open</a>
        <a className="btn" href={`/api/patches/${p.id}/download`}>Download .aif</a>
      </div>
    </div>
  )
}

export default function Browse() {
  const [items, setItems] = useState<PatchSummary[]>([])
  const [type, setType] = useState("")
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const selection = useSelection()

  async function load() {
    setLoading(true)
    setErr("")
    try {
      const params = new URLSearchParams()
      if (type) params.set("type", type)
      if (q.trim()) params.set("q", q.trim())
      const data = await apiGet<{ items: PatchSummary[] }>(`/api/patches?${params.toString()}`)
      setItems(data.items)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [type])

  return (
    <>
      <p className="eyebrow">Community</p>
      <h1 className="hero-title">Browse patches</h1>
      <div className="row" style={{ margin: "16px 0" }}>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All engines</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="search"
          placeholder="Search name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load() }}
        />
        <button className="btn" onClick={load}>Search</button>
      </div>
      {err && <p className="error">{err}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No patches found.</p>
      ) : (
        <div className="grid">
          {items.map((p) => (
            <Card key={p.id} p={p} selected={selection.has(p.id)} onToggle={() => selection.toggle(p.id)} />
          ))}
        </div>
      )}
      <SelectionBar ids={selection.ids} onClear={selection.clear} />
    </>
  )
}

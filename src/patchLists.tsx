import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useAuth } from "./auth"
import { apiGet, apiSend, type PatchSummary } from "./api"
import { SelectionToolbar, type Selection, type SelBind } from "./packs"
import { Collapsible } from "./collapsible"
import { LikeButton, DownloadCount } from "./like"
import { useLongList } from "./useLongList"
import { LongList } from "./LongList"

// Patch lists shared by the Library pages: the public browser (/library) and
// the signed-in owner's list (/library/mine). Both are long lists
// (src/LongList.tsx): paged on demand, virtualized, with a pager.

export const TYPES = [
  "amp", "cluster", "dbox", "digital", "dimension", "dna", "drwave",
  "dsynth", "fm", "phase", "pulse", "sampler", "string", "vocoder", "voltage",
]

type View = "grid" | "list"

export function useViewToggle(storageKey: string, initial: View = "grid") {
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem(storageKey) as View) || initial } catch { return initial }
  })
  function setViewPersisted(v: View) {
    setView(v)
    try { localStorage.setItem(storageKey, v) } catch {}
  }
  return [view, setViewPersisted] as const
}

export function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
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

// ---------- shared patch card / row ----------

/** Admin-only moderation handle on community items (hidden for everyone
 * else). Reversible-only inline: hard deletes live in the /mod console. */
interface ModActions {
  busy: boolean
  onPrivate: () => void
}

function ModButtons({ mod }: { mod: ModActions }) {
  return (
    <button className="btn" onClick={mod.onPrivate} disabled={mod.busy}>
      {mod.busy ? "Working…" : "Make private"}
    </button>
  )
}

export interface RowProps {
  p: PatchSummary
  selected: boolean
  /** From selection.bind(); omit to render without selection (no checkbox, no click/drag select). */
  sel?: SelBind
  onTagClick?: (t: string) => void
  mod?: ModActions
  /** Extra eyebrow chip, e.g. the owner's public/private state. */
  chip?: ReactNode
  /** Page-specific trailing actions, e.g. a pack owner's Remove. */
  extra?: ReactNode
  /** Called after this patch's like flips (e.g. Favorites drops it on unlike). */
  onLiked?: (liked: boolean) => void
}

// For the mouse the box is visual (pointer-events: none) and the card takes the
// press/drag; keyboard users tab to it and toggle with Space.
const checkbox = (p: PatchSummary, sel: SelBind) => (
  <input type="checkbox" className="sel-box" {...sel.box} aria-label={`Select ${p.name}`} />
)

/** Download the patch's .aif: an icon button (arrow down onto a tray line). */
const DownloadButton = ({ p, className = "" }: { p: PatchSummary; className?: string }) => (
  <a className={"btn icon-btn " + className} href={`/api/patches/${p.id}/download`} aria-label={`Download ${p.name}.aif`} title="Download .aif">
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </a>
)

const tagChips = (tags: string[], onTagClick?: (t: string) => void) => tags.map((t) => (
  <span key={t} className={"chip tag" + (onTagClick ? " chip-filter" : "")} onClick={onTagClick && (() => onTagClick(t))} title={onTagClick ? `Filter by ${t}` : undefined}>{t}</span>
))

export function GridCard({ p, selected, sel, onTagClick, mod, chip, extra, onLiked }: RowProps) {
  return (
    <div className={"card" + (sel ? " selectable" : "") + (selected ? " selected" : "")} {...sel?.card}>
      <div className="card-eyebrow">
        {sel && <span className="card-check">{checkbox(p, sel)}</span>}
        <span className="chip">{p.type}</span>
        {chip}
        {p.author ? <span>by {p.author}</span> : null}
      </div>
      <div className="card-title">{p.name}</div>
      <div className="card-tags">{tagChips(p.tags.split(",").filter(Boolean).slice(0, 6), onTagClick)}</div>
      <div className="row card-actions">
        <a className="btn" href={`/library/editor?id=${p.id}`}>Open</a>
        <DownloadButton p={p} />
        <DownloadCount n={p.download_count} />
        <LikeButton type="patch" id={p.id} likeCount={p.like_count} likedByMe={p.liked_by_me} onToggled={onLiked && ((liked) => onLiked(liked))} />
        {mod && <ModButtons mod={mod} />}
        {extra}
      </div>
    </div>
  )
}

/** List view's columns (header labels, one per cell of ListRow). */
export const PATCH_COLUMNS = {
  kind: "patch",
  labels: [<i className="list-head-box" title="Select" aria-label="Select" />, "Synth", "Preset", "Tags", "Downloads", "Actions"],
}

export function ListRow({ p, selected, sel, onTagClick, mod, chip, extra, onLiked }: RowProps) {
  return (
    <div className={"list-row" + (sel ? " selectable" : "") + (selected ? " selected" : "")} {...sel?.card}>
      <span className="card-check list-check">{sel && checkbox(p, sel)}</span>
      <span className="list-type"><span className="chip">{p.type}</span></span>
      <span className="list-title">
        <span className="list-name">{p.name}</span>
        {chip}
        {p.author ? <span className="list-byline">by {p.author}</span> : null}
      </span>
      <div className="list-tags">{tagChips(p.tags.split(",").filter(Boolean).slice(0, 4), onTagClick)}</div>
      <span className="list-dls"><DownloadCount n={p.download_count} /></span>
      <div className="list-actions">
        <LikeButton type="patch" id={p.id} likeCount={p.like_count} likedByMe={p.liked_by_me} onToggled={onLiked && ((liked) => onLiked(liked))} />
        <a className="btn" href={`/library/editor?id=${p.id}`}>Open</a>
        <DownloadButton p={p} className="list-dl" />
        {mod && <ModButtons mod={mod} />}
        {extra}
      </div>
    </div>
  )
}

/** Grid card or list row by view, for LongList's renderItem. */
export const PatchItem = ({ view, ...props }: RowProps & { view: View }) =>
  view === "grid" ? <GridCard {...props} /> : <ListRow {...props} />

// ---------- My patches ----------

export function MyPatches({ selection }: { selection: Selection }) {
  const [err, setErr] = useState("")
  const [pendingDel, setPendingDel] = useState<number | null>(null)
  const [pendingPublic, setPendingPublic] = useState<number | null>(null)
  const [toggling, setToggling] = useState<number | null>(null)
  const delTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publicTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [view, setView] = useViewToggle("te-op1-patches-mine-view")
  const list = useLongList<PatchSummary>({
    key: "mine",
    url: (page, asof) => `/api/me/patches?page=${page}${asof ? `&asof=${asof}` : ""}`,
  })

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
      if (selection.has(id)) selection.pick(id)
      list.reload()
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
      list.patch(p.id, (x) => ({ ...x, is_public: np ? 1 : 0 }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setToggling(null)
    }
  }

  const order = list.loadedIds()
  const ext = view === "list" ? " list-act-ext" : ""

  return (
    <Collapsible storageKey="te-op1-patches-mine-open" summary={`My patches${list.total === null ? "" : ` (${list.total})`}`}>
      {err && <p className="error">{err}</p>}
      <div className="browse-head">
        <span className="browse-count" />
        <ViewToggle view={view} setView={setView} />
      </div>
      <LongList
        list={list}
        view={view}
        noun={["patch", "patches"]}
        toolbar={<SelectionToolbar selection={selection} />}
        columns={PATCH_COLUMNS}
        empty={<p className="muted">You haven't uploaded anything yet. <Link to="/library/upload">Upload one</Link>.</p>}
        renderItem={(p) => (
          <PatchItem
            view={view}
            p={{ ...p, author: null }}
            selected={selection.has(p.id)}
            sel={selection.bind(p.id, order)}
            chip={<span className={"chip " + (p.is_public ? "vis-public" : "vis-private")}>{p.is_public ? "public" : "private"}</span>}
            extra={<>
              <button className={"btn" + ext + (pendingPublic === p.id ? " primary" : "")} onClick={() => toggle(p)} disabled={toggling === p.id}>
                {pendingPublic === p.id ? "Make public?" : p.is_public ? "Make private" : "Make public"}
              </button>
              <button className={"btn" + ext + (pendingDel === p.id ? " danger" : "")} onClick={() => del(p.id)}>
                {pendingDel === p.id ? "Confirm?" : "Delete"}
              </button>
            </>}
          />
        )}
      />
    </Collapsible>
  )
}

// ---------- Discover patches ----------

/** The public library browser. Filters seed from the URL (?q=&type=&tag=&sort=)
 * so the landing page and engine links can deep-link into a search. */
export function DiscoverPatches({ selection }: { selection: Selection }) {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [type, setType] = useState(() => params.get("type") || "")
  const [q, setQ] = useState(() => params.get("q") || "")
  const [tag, setTag] = useState(() => params.get("tag") || "")
  const [sort, setSort] = useState(() => params.get("sort") || "")
  const [err, setErr] = useState("")
  const [view, setView] = useViewToggle("te-op1-patches-discover-view")
  const [modBusy, setModBusy] = useState<number | null>(null)
  const [counts, setCounts] = useState<Record<string, number> | null>(null)

  // typing debounces into the list key; chips and sort apply at once
  const [typed, setTyped] = useState({ q: q.trim(), tag: tag.trim() })
  useEffect(() => {
    const t = setTimeout(() => setTyped({ q: q.trim(), tag: tag.trim() }), 300)
    return () => clearTimeout(t)
  }, [q, tag])

  const filters = { type, q: typed.q, tag: typed.tag, sort }
  const list = useLongList<PatchSummary>({
    key: JSON.stringify(filters),
    url: (page, asof) => {
      const p = new URLSearchParams({ page: String(page) })
      if (filters.type) p.set("type", filters.type)
      if (filters.q) p.set("q", filters.q)
      if (filters.tag) p.set("tag", filters.tag)
      if (filters.sort) p.set("sort", filters.sort)
      if (asof) p.set("asof", String(asof))
      return `/api/patches?${p}`
    },
  })

  useEffect(() => {
    apiGet<{ byType: Record<string, number> }>("/api/patches/counts").then((d) => setCounts(d.byType)).catch(() => setCounts(null))
  }, [])
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null

  function clearFilters() {
    setType("")
    setQ("")
    setTag("")
  }

  // Admin moderation on community items: make private only (one tap,
  // reversible by the owner). Hard deletes live in the /mod console.
  async function modPrivate(p: PatchSummary) {
    setModBusy(p.id)
    try {
      await apiSend(`/api/patches/${p.id}`, "PATCH", { is_public: false })
      list.reload()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setModBusy(null)
    }
  }

  const modFor = (p: PatchSummary): ModActions | undefined =>
    user?.isAdmin ? { busy: modBusy === p.id, onPrivate: () => modPrivate(p) } : undefined

  const hasFilters = type !== "" || q !== "" || tag !== ""
  const order = list.loadedIds()

  return (
    <>
      {/* one filter row: name search, tag, sort, view; engine chips below */}
      <div className="filter-row">
        <input
          className="search-big"
          type="search"
          placeholder="Search patches by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search by name"
          autoFocus={!!params.get("q")}
        />
        <input
          className="filter-tag"
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
        {hasFilters && <button className="btn" onClick={clearFilters}>Clear</button>}
        <ViewToggle view={view} setView={setView} />
      </div>
      <div className="engine-chips" role="group" aria-label="Filter by engine">
        <button className={"engine-chip" + (type === "" ? " active" : "")} onClick={() => setType("")} aria-pressed={type === ""}>
          all{total !== null && <span className="engine-n">{total}</span>}
        </button>
        {TYPES.map((t) => {
          const n = counts?.[t] ?? 0
          return (
            <button key={t} className={"engine-chip" + (type === t ? " active" : "") + (counts && !n ? " empty" : "")} onClick={() => setType(type === t ? "" : t)} aria-pressed={type === t}>
              {t}{counts && <span className="engine-n">{n}</span>}
            </button>
          )
        })}
      </div>
      {err && <p className="error">{err}</p>}
      <LongList
        list={list}
        view={view}
        noun={["patch", "patches"]}
        toolbar={<SelectionToolbar selection={selection} />}
        columns={PATCH_COLUMNS}
        empty={hasFilters ? (
          <>
            <p className="muted">No patches found</p>
            <p style={{ marginTop: 8 }}><button className="btn" onClick={clearFilters}>Clear filters</button></p>
          </>
        ) : (
          <p className="muted">No community patches yet. <Link to="/library/upload">Upload the first one</Link>.</p>
        )}
        renderItem={(p) => (
          <PatchItem
            view={view}
            p={p}
            selected={selection.has(p.id)}
            sel={selection.bind(p.id, order)}
            onTagClick={(t) => setTag(t)}
            mod={modFor(p)}
          />
        )}
      />
    </>
  )
}

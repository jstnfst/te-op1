import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiSend, type Pack } from "../api"
import { Collapsible } from "../collapsible"
import { LikeButton, Popularity, useLike } from "../like"
import { loginPath } from "../paths"
import { DeleteButton, useViewToggle, ViewToggle, VisibilityButton } from "../patchLists"
import { useLongList } from "../useLongList"
import { LongList } from "../LongList"
import { HowSteps, type Step } from "./Library"

type View = "grid" | "list"

const patchCount = (n = 0) => `${n} ${n === 1 ? "patch" : "patches"}`

/** Status chip: public/private on your own lists, "yours" in the community list. */
function PackChip({ p, community }: { p: Pack; community?: boolean }) {
  if (community) return p.is_mine ? <span className="chip yours">yours</span> : null
  return <span className={"chip " + (p.is_public ? "vis-public" : "vis-private")}>{p.is_public ? "public" : "private"}</span>
}

/** An owner's controls on their own pack rows/cards. */
export interface PackOwner {
  onToggle: () => void
  onDelete: () => void
  busy?: boolean
}

export interface PackItemProps {
  p: Pack
  view: View
  showAuthor: boolean
  /** Called after a pack's like flips (e.g. Favorites drops it on unlike). */
  onLiked?: (liked: boolean) => void
  /** Community listing: every pack is public, so mark the viewer's own instead of visibility. */
  community?: boolean
  /** Your own packs: visibility toggle (in place of the chip) and delete. */
  owner?: PackOwner
}

/** List view's columns. The first says whose pack it is: on the community
 * list, "you" or the author; on your own lists, public or private. */
export const packColumns = (community?: boolean) => ({
  kind: "pack",
  labels: [community ? "Owner" : "Visibility", "Pack", "Patches", "Popularity", "Actions"],
})

/** A pack's glyph: a stack of patch cards. */
const PackGlyph = () => (
  <span className="engine-art" aria-hidden="true">
    <svg viewBox="0 0 120 72" className="engine-svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
      <rect x="38" y="10" width="52" height="34" rx="3" opacity=".4" />
      <rect x="32" y="18" width="52" height="34" rx="3" opacity=".7" />
      <rect x="26" y="26" width="52" height="34" rx="3" className="ac" />
    </svg>
  </span>
)

/** One pack as a grid card or list row (LongList renderItem). */
export function PackItem({ p, view, showAuthor, onLiked, community, owner }: PackItemProps) {
  const author = showAuthor && p.author && !(community && p.is_mine) ? p.author : null
  const like = useLike("pack", p.id, p.like_count, p.liked_by_me, onLiked)
  const vis = owner && <VisibilityButton isPublic={!!p.is_public} onToggle={owner.onToggle} busy={owner.busy} />
  const del = owner && <DeleteButton label="Delete pack" onDelete={owner.onDelete} />
  if (view === "grid") {
    return (
      <Link className="card patch-card" to={`/library/packs/${p.id}`}>
        <div className="card-head">
          <PackGlyph />
          <span className="card-engine">{patchCount(p.item_count)}</span>
          {!owner && <PackChip p={p} community={community} />}
        </div>
        <div className="card-title">{p.name}</div>
        {author ? <div className="card-by">by {author}</div> : null}
        <div className="card-stats"><Popularity inline downloads={p.download_count} like={like} /></div>
        <div className="card-actions">
          <LikeButton like={like} />
          {owner && <span className="card-actions-end">{vis}{del}</span>}
        </div>
      </Link>
    )
  }
  return (
    <Link className="list-row" to={`/library/packs/${p.id}`}>
      <span className="list-type">
        {community && !p.is_mine
          ? <span className="list-owner">{p.author ?? ""}</span>
          : <PackChip p={p} community={community} />}
      </span>
      <span className="list-title">
        <span className="list-name">{p.name}</span>
        {!community && author ? <span className="list-byline">by {author}</span> : null}
      </span>
      <span className="list-count">{patchCount(p.item_count)}</span>
      <span className="list-dls"><Popularity downloads={p.download_count} like={like} /></span>
      <div className="list-actions"><LikeButton like={like} />{vis}{del}</div>
    </Link>
  )
}

/** The viewer's own packs (Mine). */
export function MyPacks({ pageParam = "ppage" }: { pageParam?: string }) {
  const [name, setName] = useState("")
  const [err, setErr] = useState("")
  const [view, setView] = useViewToggle("te-op1-packs-view")
  const list = useLongList<Pack>({
    key: "my-packs",
    url: (page, asof) => `/api/packs?page=${page}${asof ? `&asof=${asof}` : ""}`,
  })

  async function create() {
    const n = name.trim()
    if (!n) return
    try { await apiSend("/api/packs", "POST", { name: n }); setName(""); list.reload() }
    catch (e) { setErr((e as Error).message) }
  }

  const [toggling, setToggling] = useState<number | null>(null)
  async function toggle(p: Pack) {
    const np = !p.is_public
    setToggling(p.id)
    try {
      await apiSend(`/api/packs/${p.id}`, "PATCH", { is_public: np })
      list.patch(p.id, (x) => ({ ...x, is_public: np ? 1 : 0 }))
    } catch (e) { setErr((e as Error).message) }
    finally { setToggling(null) }
  }
  async function del(id: number) {
    try { await apiSend(`/api/packs/${id}`, "DELETE"); list.reload() }
    catch (e) { setErr((e as Error).message) }
  }
  const ownerOf = (p: Pack): PackOwner => ({ onToggle: () => toggle(p), onDelete: () => del(p.id), busy: toggling === p.id })

  const count = list.total
  return (
    <Collapsible id="packs" storageKey="te-op1-packs-mine-open" summary={`My packs${count === null ? "" : ` (${count})`}`}>
      <div className="browse-head" style={{ margin: "16px 0 12px" }}>
        <div className="row">
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
        <ViewToggle view={view} setView={setView} />
      </div>
      {err && <p className="error">{err}</p>}
      <LongList
        list={list}
        view={view}
        noun={["pack", "packs"]}
        pageParam={pageParam}
        empty={<p className="muted">No packs yet</p>}
        columns={packColumns()}
        renderItem={(p) => <PackItem p={p} view={view} showAuthor={false} owner={ownerOf(p)} />}
      />
    </Collapsible>
  )
}

function DiscoverPacks() {
  const [q, setQ] = useState("")
  const [typed, setTyped] = useState("")
  const [sort, setSort] = useState("")
  const [view, setView] = useViewToggle("te-op1-packs-discover-view")
  useEffect(() => { const t = setTimeout(() => setTyped(q.trim()), 300); return () => clearTimeout(t) }, [q])

  const list = useLongList<Pack>({
    key: JSON.stringify({ q: typed, sort }),
    url: (page, asof) => {
      const p = new URLSearchParams({ page: String(page) })
      if (typed) p.set("q", typed)
      if (sort) p.set("sort", sort)
      if (asof) p.set("asof", String(asof))
      return `/api/packs/public?${p}`
    },
  })

  return (
    <>
      {/* same filter row as the patch browser: search, sort, view */}
      <div className="filter-row">
        <input
          className="search-big"
          type="search"
          placeholder="Search packs by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search packs by name"
        />
        <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort order">
          <option value="">Newest</option>
          <option value="likes">Most liked</option>
        </select>
        <ViewToggle view={view} setView={setView} />
      </div>
      <LongList
        list={list}
        view={view}
        noun={["public pack", "public packs"]}
        empty={<p className="muted">{typed ? `No public packs match "${typed}"` : "No public packs yet"}</p>}
        columns={packColumns(true)}
        renderItem={(p) => <PackItem p={p} view={view} showAuthor community />}
      />
    </>
  )
}

const STEPS: Step[] = [
  { n: "1", title: "Find", body: "Search by name, or sort by most liked" },
  { n: "2", title: "Open", body: "See every patch inside before you take it" },
  { n: "3", title: "Take", body: "Download the whole pack as one .zip" },
]

/** /library/packs - public packs, laid out like the patch browser. Your own live in Mine. */
export default function Packs() {
  const { user } = useAuth()

  return (
    <>
      <div className="lib-hero">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="hero-title">Find a pack</h1>
          <p className="lead">
            Curated sets of patches, downloaded as one .zip.
            {user
              ? <> Yours are in <Link to="/library/mine#packs">Mine</Link>.</>
              : <> <Link to={loginPath("/library/packs")}>Log in</Link> to build your own.</>}
          </p>
        </div>
        <HowSteps steps={STEPS} />
      </div>

      <DiscoverPacks />
    </>
  )
}

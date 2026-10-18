import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { apiSend, type Pack } from "../api"
import { Collapsible } from "../collapsible"
import { LikeButton, DownloadCount } from "../like"
import { loginPath } from "../paths"
import { useViewToggle, ViewToggle } from "../patchLists"
import { useLongList } from "../useLongList"
import { LongList } from "../LongList"

type View = "grid" | "list"

const patchCount = (n = 0) => `${n} ${n === 1 ? "patch" : "patches"}`

/** Status chip: public/private on your own lists, "yours" in the community list. */
function PackChip({ p, community }: { p: Pack; community?: boolean }) {
  if (community) return p.is_mine ? <span className="chip yours">yours</span> : null
  return <span className={"chip " + (p.is_public ? "vis-public" : "vis-private")}>{p.is_public ? "public" : "private"}</span>
}

export interface PackItemProps {
  p: Pack
  view: View
  showAuthor: boolean
  /** Called after a pack's like flips (e.g. Favorites drops it on unlike). */
  onLiked?: (liked: boolean) => void
  /** Community listing: every pack is public, so mark the viewer's own instead of visibility. */
  community?: boolean
}

/** List view's columns. The first says whose pack it is: on the community
 * list, "you" or the author; on your own lists, public or private. */
export const packColumns = (community?: boolean) => ({
  kind: "pack",
  labels: [community ? "Owner" : "Visibility", "Pack", "Patches", "Downloads", "Likes"],
})

/** One pack as a grid card or list row (LongList renderItem). */
export function PackItem({ p, view, showAuthor, onLiked, community }: PackItemProps) {
  const author = showAuthor && p.author && !(community && p.is_mine) ? p.author : null
  const like = <LikeButton type="pack" id={p.id} likeCount={p.like_count} likedByMe={p.liked_by_me} onToggled={onLiked} />
  if (view === "grid") {
    return (
      <Link className="card" to={`/library/packs/${p.id}`}>
        <div className="card-eyebrow">
          <PackChip p={p} community={community} />
          <span>{patchCount(p.item_count)}</span>
          {author ? <span>by {author}</span> : null}
        </div>
        <div className="card-title">{p.name}</div>
        <div className="row card-actions">
          <DownloadCount n={p.download_count} />
          {like}
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
      <span className="list-dls"><DownloadCount n={p.download_count} /></span>
      <div className="list-actions">{like}</div>
    </Link>
  )
}

/** The viewer's own packs. `shelf` = the Packs page's titled section; Mine uses the plain fold. */
export function MyPacks({ shelf = false, pageParam = "ppage" }: { shelf?: boolean; pageParam?: string }) {
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

  const count = list.total
  return (
    <Collapsible
      storageKey="te-op1-packs-mine-open"
      className={shelf ? "shelf" : undefined}
      summary={shelf
        ? <><span className="shelf-title">Your packs</span>{count !== null && <span className="shelf-count">{count}</span>}</>
        : `My packs${count === null ? "" : ` (${count})`}`}
    >
      <div className="browse-head" style={{ margin: shelf ? "4px 0 12px" : "16px 0 12px" }}>
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
        renderItem={(p) => <PackItem p={p} view={view} showAuthor={false} />}
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
      <div className="browse-head" style={{ margin: "16px 0 12px" }}>
        <div className="row">
          <input
            type="search"
            placeholder="Search public packs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search public packs"
          />
          <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort order">
            <option value="">Newest</option>
            <option value="likes">Most liked</option>
          </select>
        </div>
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

export default function Packs() {
  const { user } = useAuth()

  return (
    <>
      <h1 className="hero-title">Packs</h1>
      <p className="lead">
        Curated sets of patches, downloaded as one .zip.
        {!user && <> <Link to={loginPath("/library/packs")}>Log in</Link> to build your own.</>}
      </p>

      {user && <MyPacks shelf pageParam="ypage" />}

      <section className="community">
        <div className="section-head">
          <h2 className="section-title">Community packs</h2>
          <span className="section-sub">Public packs from everyone{user ? ", yours included" : ""}</span>
        </div>
        <DiscoverPacks />
      </section>
    </>
  )
}

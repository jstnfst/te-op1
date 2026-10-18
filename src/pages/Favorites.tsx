import { Link } from "react-router-dom"
import type { Pack, PatchSummary } from "../api"
import { useSelection, SelectionToolbar } from "../packs"
import { PATCH_COLUMNS, PatchItem, ViewToggle, useViewToggle } from "../patchLists"
import { PackItem, packColumns } from "./Packs"
import { useLongList } from "../useLongList"
import { LongList } from "../LongList"

/** Liked patches and packs, newest like first. Unliking takes the item off the page. */
export default function Favorites() {
  const selection = useSelection()
  const [patchView, setPatchView] = useViewToggle("te-op1-faves-patches-view")
  const [packView, setPackView] = useViewToggle("te-op1-faves-packs-view")
  const patches = useLongList<PatchSummary>({ key: "fav-patches", url: (page) => `/api/favorites?kind=patch&page=${page}` })
  const packs = useLongList<Pack>({ key: "fav-packs", url: (page) => `/api/favorites?kind=pack&page=${page}` })

  const order = patches.loadedIds()
  const none = patches.total === 0 && packs.total === 0

  return (
    <>
      <p className="eyebrow">Library</p>
      <h1 className="hero-title">Favorites</h1>
      <p className="lead">Everything you've liked, newest first.</p>

      {none ? (
        <p className="muted">
          Nothing yet. Find some <Link to="/library">patches</Link> or{" "}
          <Link to="/library/packs">packs</Link>.
        </p>
      ) : (
        <>
          <section>
            <div className="browse-head">
              <h2 style={{ margin: 0 }}>Patches</h2>
              <ViewToggle view={patchView} setView={setPatchView} />
            </div>
            <LongList
              list={patches}
              view={patchView}
              noun={["liked patch", "liked patches"]}
              toolbar={<SelectionToolbar selection={selection} />}
              columns={PATCH_COLUMNS}
              empty={<p className="muted">No liked patches yet</p>}
              renderItem={(p) => (
                <PatchItem
                  view={patchView}
                  p={p}
                  selected={selection.has(p.id)}
                  sel={selection.bind(p.id, order)}
                  onLiked={(liked) => {
                    if (liked) return
                    if (selection.has(p.id)) selection.pick(p.id)
                    patches.reload()
                  }}
                />
              )}
            />
          </section>

          <section style={{ marginTop: 36 }}>
            <div className="browse-head">
              <h2 style={{ margin: 0 }}>Packs</h2>
              <ViewToggle view={packView} setView={setPackView} />
            </div>
            <LongList
              list={packs}
              view={packView}
              noun={["liked pack", "liked packs"]}
              pageParam="ppage"
              empty={<p className="muted">No liked packs yet</p>}
              columns={packColumns()}
              renderItem={(k) => <PackItem p={k} view={packView} showAuthor onLiked={(liked) => { if (!liked) packs.reload() }} />}
            />
          </section>
        </>
      )}
    </>
  )
}

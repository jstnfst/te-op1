import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useAuth } from "../auth"
import { apiGet, apiSend, type PatchSummary } from "../api"
import { LikeButton, DownloadCount } from "../like"
import { loginPath } from "../paths"
import { useSelection, SelectionToolbar } from "../packs"
import { PATCH_COLUMNS, PatchItem, ViewToggle, useViewToggle } from "../patchLists"
import { useLongList } from "../useLongList"
import { LongList } from "../LongList"

/** Copy the share link, with a visible (and announced) "Copied" state. If the
 * clipboard API is unavailable or refused, select the URL text instead so it
 * can be copied by hand. */
function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle")
  const codeRef = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    if (timer.current) clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(url)
      setState("copied")
    } catch {
      const r = document.createRange()
      if (codeRef.current) { r.selectNodeContents(codeRef.current); getSelection()?.removeAllRanges(); getSelection()?.addRange(r) }
      setState("manual")
    }
    timer.current = setTimeout(() => setState("idle"), 2000)
  }

  return (
    <span className="share-link">
      <code ref={codeRef} className="share-url">{url}</code>
      <button type="button" className={"btn copy-btn" + (state === "copied" ? " copied" : "")} onClick={copy}>
        {state === "copied" ? <><span aria-hidden="true">✓</span> Copied</> : "Copy link"}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Link copied" : state === "manual" ? "Link selected, press Ctrl+C to copy" : ""}
      </span>
      {state === "manual" && <span className="muted">Selected, press Ctrl+C</span>}
    </span>
  )
}

interface PackDetail {
  id: number
  name: string
  is_public: number
  author: string | null
  created_at: string
  is_owner: boolean
  /** patches the viewer can see; the items themselves are paged (/items) */
  item_count: number
  like_count?: number
  download_count?: number
  liked_by_me?: boolean
}

export default function Pack() {
  const { id } = useParams()
  const { user } = useAuth()
  const [pack, setPack] = useState<PackDetail | null>(null)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(true)
  const [pendingDel, setPendingDel] = useState(false)
  const [pendingPublic, setPendingPublic] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<number | null>(null)
  const delTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selection = useSelection()
  const [view, setView] = useViewToggle("te-op1-pack-view")
  const [removing, setRemoving] = useState("")
  const items = useLongList<PatchSummary>({ key: `pack-${id}`, url: (page) => `/api/packs/${id}/items?page=${page}` })

  // Only the first load shows the page-level "Loading…"; later refreshes (after
  // a remove or visibility change) update in place so the list keeps its place.
  async function load() {
    try { setPack(await apiGet<PackDetail>(`/api/packs/${id}`)) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => { setBusy(true); load() }, [id])
  useEffect(() => () => {
    if (delTimer.current) clearTimeout(delTimer.current)
    if (removeTimer.current) clearTimeout(removeTimer.current)
  }, [])

  if (busy) return <p className="muted">Loading…</p>
  if (err && !pack) {
    return (
      <>
        <h1 className="hero-title">Pack</h1>
        <p className="muted">{err || "Not found"}</p>
        <p className="muted"><Link to="/library">Browse patches</Link></p>
      </>
    )
  }
  if (!pack) return null

  const refresh = () => { items.reload(); load() }

  async function remove(patchId: number) {
    if (pendingRemove !== patchId) {
      if (removeTimer.current) clearTimeout(removeTimer.current)
      setPendingRemove(patchId)
      removeTimer.current = setTimeout(() => setPendingRemove(null), 2000)
      return
    }
    if (removeTimer.current) clearTimeout(removeTimer.current)
    setPendingRemove(null)
    try {
      await apiSend(`/api/packs/${pack!.id}/items`, "DELETE", { patch_id: patchId })
      if (selection.has(patchId)) selection.pick(patchId)
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function removeMany(ids: number[], done: () => void) {
    let n = 0
    try {
      for (const pid of ids) {
        setRemoving(`Removing ${n + 1} / ${ids.length}…`)
        await apiSend(`/api/packs/${pack!.id}/items`, "DELETE", { patch_id: pid })
        n++
      }
      done()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setRemoving("")
      refresh()
    }
  }

  async function togglePublic() {
    const makingPublic = !pack!.is_public
    if (makingPublic && !pendingPublic) {
      setPendingPublic(true)
      return
    }
    setPendingPublic(false)
    setToggling(true)
    try {
      await apiSend(`/api/packs/${pack!.id}`, "PATCH", { is_public: makingPublic })
      load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setToggling(false)
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
      window.location.href = "/library/packs"
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  // Owner curates; admin moderation here is reversible-only and one-way:
  // an admin can take a public pack private, never publish someone's private
  // pack or delete it (deletes live in /mod).
  const order = items.loadedIds()
  const canToggleVisibility = pack.is_owner || (!!user?.isAdmin && !!pack.is_public)
  const shareUrl = `${location.origin}/library/packs/${pack.id}`
  return (
    <>
      {pack.author && <p className="pack-author">by {pack.author}</p>}
      <h1 className="hero-title">{pack.name}</h1>
      {err && <p className="error">{err}</p>}
      <div className="row pack-actions">
        <a className="btn primary" href={`/api/packs/${pack.id}/download`}>Download pack .zip</a>
        <DownloadCount n={pack.download_count} />
        {user && <LikeButton type="pack" id={pack.id} likeCount={pack.like_count} likedByMe={pack.liked_by_me} />}
        {canToggleVisibility && (
          <button
            className={"btn" + (pendingPublic ? " primary" : "")}
            onClick={togglePublic}
            disabled={toggling}
          >
            {pendingPublic ? "Make public?" : pack.is_public ? "Make private" : "Make public"}
          </button>
        )}
        {pack.is_owner && (items.total ?? pack.item_count) > 0 && (
          <a className="btn" href={`/library/editor?pack=${pack.id}`}>Edit in patch editor</a>
        )}
        {pack.is_owner && (
          <button className={"btn" + (pendingDel ? " danger" : "")} onClick={del}>
            {pendingDel ? "Confirm?" : "Delete pack"}
          </button>
        )}
      </div>
      {pack.is_public ? (
        <div className="share-row">
          <span className="muted">Public · anyone with the link can download</span>
          <CopyLink url={shareUrl} />
        </div>
      ) : (
        <p className="muted">{pack.is_owner ? "Private · only you can download" : "Private · only the owner can download"}</p>
      )}

      <div className="browse-head" style={{ marginTop: 24 }}>
        <span className="browse-count" />
        <ViewToggle view={view} setView={setView} />
      </div>
      <LongList
        list={items}
        view={view}
        noun={["patch", "patches"]}
        columns={PATCH_COLUMNS}
        toolbar={
          <SelectionToolbar
            selection={selection}
            // a pack is small and bounded (200 max), so "all" is meaningful here
            selectAll={{
              count: items.total ?? pack.item_count,
              ids: () => apiGet<{ ids: number[] }>(`/api/packs/${pack.id}/items?ids=1`).then((d) => d.ids),
            }}
            hint={pack.is_owner
              ? "Select patches to download them, copy them into another pack, or remove them from this one"
              : "Select patches to download just those, or add them to one of your packs"}
            extra={pack.is_owner ? (ids, done) => (
              <button className="btn danger" disabled={!ids.length || !!removing} onClick={() => removeMany(ids, done)}>
                {removing || "Remove from pack"}
              </button>
            ) : undefined}
          />
        }
        empty={
          <p className="muted pack-empty">
            {pack.is_owner
              ? <>No patches in this pack yet. Select some in <Link to="/library">Browse</Link> and choose Add to pack.</>
              : "No patches in this pack yet"}
          </p>
        }
        renderItem={(p) => (
          <PatchItem
            view={view}
            p={p}
            selected={selection.has(p.id)}
            sel={selection.bind(p.id, order)}
            extra={pack.is_owner && (
              <button className={"btn" + (pendingRemove === p.id ? " danger" : "")} onClick={() => remove(p.id)}>
                {pendingRemove === p.id ? "Confirm?" : "Remove"}
              </button>
            )}
          />
        )}
      />

      {!user && <p className="muted pack-login">Want to make your own packs? <Link to={loginPath(location.pathname)}>Log in</Link>.</p>}
    </>
  )
}

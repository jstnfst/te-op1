import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useAuth } from "../auth"
import { apiGet, apiSend, type PatchSummary } from "../api"
import { LikeButton } from "../like"

interface PackDetail {
  id: number
  name: string
  is_public: number
  author: string | null
  created_at: string
  is_owner: boolean
  items: PatchSummary[]
  like_count?: number
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

  async function load() {
    setBusy(true)
    try { setPack(await apiGet<PackDetail>(`/api/packs/${id}`)) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [id])
  useEffect(() => () => {
    if (delTimer.current) clearTimeout(delTimer.current)
    if (removeTimer.current) clearTimeout(removeTimer.current)
  }, [])

  if (busy) return <p className="muted">Loading…</p>
  if (err || !pack) {
    return (
      <>
        <h1 className="hero-title">Pack</h1>
        <p className="muted">{err || "Not found."}</p>
        <p className="muted"><Link to="/patches">Browse patches</Link></p>
      </>
    )
  }

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
      load()
    } catch (e) {
      setErr((e as Error).message)
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
      window.location.href = "/packs"
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  // Owner curates; admin moderation here is reversible-only and one-way:
  // an admin can take a public pack private, never publish someone's private
  // pack or delete it (deletes live in /mod).
  const canToggleVisibility = pack.is_owner || (!!user?.isAdmin && !!pack.is_public)
  const shareUrl = `${location.origin}/packs/${pack.id}`
  return (
    <>
      {pack.author && <p className="pack-author">by {pack.author}</p>}
      <h1 className="hero-title">{pack.name}</h1>
      {err && <p className="error">{err}</p>}
      <div className="row pack-actions">
        <a className="btn primary" href={`/api/packs/${pack.id}/download`}>Download .zip</a>
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
        {pack.is_owner && (
          <button className={"btn" + (pendingDel ? " danger" : "")} onClick={del}>
            {pendingDel ? "Confirm?" : "Delete pack"}
          </button>
        )}
      </div>
      {pack.is_public ? (
        <p className="muted">Public - anyone with the link can download: <code>{shareUrl}</code></p>
      ) : (
        <p className="muted">{pack.is_owner ? "Private - only you can download." : "Private - only the owner can download."}</p>
      )}

      {pack.items.length === 0 ? (
        <p className="muted pack-empty">
          No patches in this pack yet{pack.is_owner ? " - add some from Browse or My patches." : "."}
        </p>
      ) : (
        <div className="grid pack-grid">
          {pack.items.map((p) => (
            <div className="card" key={p.id}>
              <div className="card-eyebrow">
                <span className="chip">{p.type}</span>
                {p.author ? <span>by {p.author}</span> : null}
              </div>
              <div className="card-title">{p.name}</div>
              {p.tags && p.tags.split(",").filter(Boolean).length > 0 && (
                <div className="card-tags">
                  {p.tags.split(",").filter(Boolean).slice(0, 6).map((t) => (
                    <span key={t} className="chip tag">{t}</span>
                  ))}
                </div>
              )}
              <div className="row card-actions">
                <a className="btn" href={`/patch.html?id=${p.id}`}>Open</a>
                <a className="btn" href={`/api/patches/${p.id}/download`}>Download .aif</a>
                {user && <LikeButton type="patch" id={p.id} likeCount={p.like_count} likedByMe={p.liked_by_me} />}
                {pack.is_owner && (
                  <button
                    className={"btn" + (pendingRemove === p.id ? " danger" : "")}
                    onClick={() => remove(p.id)}
                  >
                    {pendingRemove === p.id ? "Confirm?" : "Remove"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!user && <p className="muted pack-login">Want to make your own packs? <Link to="/login">Log in</Link>.</p>}
    </>
  )
}

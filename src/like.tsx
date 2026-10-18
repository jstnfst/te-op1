import { useEffect, useState } from "react"
import { apiSend } from "./api"
import { useAuth } from "./auth"
import { here } from "./paths"
import { HeartIcon } from "./icons"

export interface Like {
  liked: boolean
  count: number
  busy: boolean
  toggle: (e: React.MouseEvent) => void
  /** tooltip / label for the button */
  label: string
}

/**
 * One item's like state, shared by its LikeButton and its Popularity count.
 * Optimistic: flips immediately, reconciles with the server count, reverts on
 * error.
 */
export function useLike(
  type: "patch" | "pack",
  id: number,
  likeCount?: number,
  likedByMe?: number | boolean,
  onToggled?: (liked: boolean, count: number) => void,
): Like {
  const [liked, setLiked] = useState(!!likedByMe)
  const [count, setCount] = useState(likeCount ?? 0)
  const [busy, setBusy] = useState(false)
  const { user, loading } = useAuth()

  // Lists reload in place (filters, sort); keep in step with fresh props.
  useEffect(() => { setLiked(!!likedByMe); setCount(likeCount ?? 0) }, [likedByMe, likeCount])

  async function toggle(e: React.MouseEvent) {
    // stopPropagation/preventDefault so it works inside card-sized <Link>s
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    // Browsing is public; liking needs an account. Send the visitor to log in
    // and bring them straight back here.
    if (!user && !loading) { window.location.href = here(); return }
    const next = !liked
    setLiked(next)
    setCount((c) => Math.max(0, c + (next ? 1 : -1)))
    setBusy(true)
    try {
      const d = await apiSend<{ like_count: number }>(`/api/likes/${type}/${id}`, next ? "PUT" : "DELETE")
      setCount(d.like_count)
      onToggled?.(next, d.like_count)
    } catch {
      setLiked(!next)
      setCount((c) => Math.max(0, c + (next ? -1 : 1)))
    } finally {
      setBusy(false)
    }
  }

  return { liked, count, busy, toggle, label: user ? (liked ? "Unlike" : "Like") : "Log in to like" }
}

/** The one like control: a square heart button, the same size as the other icon buttons. */
export function LikeButton({ like }: { like: Like }) {
  return (
    <button
      type="button"
      className={"btn icon-btn like" + (like.liked ? " active" : "")}
      onClick={like.toggle}
      disabled={like.busy}
      aria-pressed={like.liked}
      aria-label={like.label}
      title={like.label}
    >
      <HeartIcon filled={like.liked} />
    </button>
  )
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`

const DownloadGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1.5v8m0 0L4.8 6.3M8 9.5l3.2-3.2M2.5 12.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1"
      fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Read-only download tally. */
export function DownloadCount({ n }: { n?: number }) {
  const count = n ?? 0
  return <span className="dl-count" title={plural(count, "download")}><DownloadGlyph />{count}</span>
}

/** Downloads and favorites, stacked (list rows) or side by side (cards). */
export function Popularity({ downloads, like, inline = false }: { downloads?: number; like: Like; inline?: boolean }) {
  return (
    <span className={"popularity" + (inline ? " inline" : "")}>
      <DownloadCount n={downloads} />
      <span className={"dl-count fav-count" + (like.liked ? " mine" : "")} title={plural(like.count, "favorite")}>
        <HeartIcon filled={like.liked} />{like.count}
      </span>
    </span>
  )
}

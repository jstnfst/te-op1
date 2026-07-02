import { useEffect, useState } from "react"
import { apiSend } from "./api"

/**
 * The one like control, used on patch cards/rows, pack rows, and the pack
 * header. Optimistic: flips immediately, reconciles with the server count,
 * reverts on error. stopPropagation/preventDefault so it works inside
 * row-sized <Link> wrappers.
 */
export function LikeButton({
  type,
  id,
  likeCount,
  likedByMe,
  onToggled,
}: {
  type: "patch" | "pack"
  id: number
  likeCount?: number
  likedByMe?: number | boolean
  onToggled?: (liked: boolean, count: number) => void
}) {
  const [liked, setLiked] = useState(!!likedByMe)
  const [count, setCount] = useState(likeCount ?? 0)
  const [busy, setBusy] = useState(false)

  // Lists reload in place (filters, sort); keep in step with fresh props.
  useEffect(() => { setLiked(!!likedByMe); setCount(likeCount ?? 0) }, [likedByMe, likeCount])

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
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

  return (
    <button
      type="button"
      className={"btn like" + (liked ? " active" : "")}
      onClick={toggle}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      title={liked ? "Unlike" : "Like"}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 14.2 2.8 9.1a3.6 3.6 0 0 1 0-5.2 3.7 3.7 0 0 1 5.1 0l.1.1.1-.1a3.7 3.7 0 0 1 5.1 0 3.6 3.6 0 0 1 0 5.2Z"
          fill={liked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      {count > 0 && <span>{count}</span>}
    </button>
  )
}

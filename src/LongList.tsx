import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { useLocation, useNavigationType } from "react-router-dom"
import { PER_PAGE, type LongListData } from "./useLongList"

const MIN_COL = 240 // matches .grid's minmax(240px, 1fr)
const gapFor = () => (window.matchMedia("(max-width: 640px)").matches ? 10 : 12) // .grid gap per breakpoint
const headerH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-h")) || 0
const RESTORE_KEY = (path: string) => `te-op1-list-restore:${path}`
/** How the current document was loaded: "navigate", "reload", "back_forward". */
const docNavType = () => (performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined)?.type ?? "navigate"

/**
 * A long, sparsely loaded, virtualized list.
 *
 * The page scrolls as if every one of `total` items were present; only the
 * rows near the viewport (plus `overscan` rows each side) are in the DOM, and
 * they're recycled as you scroll. Pages are fetched as their rows approach,
 * with static placeholders until they land (no shimmer: motion rule).
 *
 * The sticky bar carries an optional first line (`toolbar`, e.g. selection
 * actions) and a second, right-aligned line with the count and a pager. The
 * page the viewer is on is mirrored to the URL (`?{pageParam}=N`) and, for the
 * list in view when leaving, restored on return.
 */
export function LongList<T extends { id: number }>({
  list,
  view,
  renderItem,
  noun,
  pageParam = "page",
  toolbar,
  empty,
  columns,
}: {
  list: LongListData<T>
  view: "grid" | "list"
  renderItem: (item: T, index: number) => ReactNode
  /** [singular, plural], e.g. ["patch", "patches"] */
  noun: [string, string]
  /** URL param for this list's page; give each list on a page its own */
  pageParam?: string
  toolbar?: ReactNode
  empty?: ReactNode
  /** List view's column grid: `kind` picks the track layout in theme.css
   * (.cols-patch / .cols-pack), `labels` are the header cells, one per track. */
  columns?: { kind: string; labels: ReactNode[] }
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(1)
  const [gap, setGap] = useState(12)
  const [offset, setOffset] = useState(0) // list top relative to the document
  const [barH, setBarH] = useState(0)
  const [ready, setReady] = useState(false) // container measured at least once
  // ?page= as it was when the list opened; read before the URL is rewritten
  const [initialPage] = useState(() => parseInt(new URL(location.href).searchParams.get(pageParam) || "", 10) || 1)
  // Return-to-your-place only when the visitor is coming *back* (browser
  // back/forward, or a reload). A fresh visit - a nav link, a typed URL -
  // starts at the top; an explicit ?page= in the link is still honored.
  // location.key "default" = this route is the document's first render.
  const loc = useLocation()
  const navType = useNavigationType()
  const [mayRestore] = useState(() =>
    loc.key === "default" ? ["back_forward", "reload"].includes(docNavType()) : navType === "POP")

  // We restore the position ourselves (below); the browser's own restore uses
  // a raw scrollY that maps to different rows before measurements land.
  useEffect(() => {
    const prev = history.scrollRestoration
    history.scrollRestoration = "manual"
    return () => { history.scrollRestoration = prev }
  }, [])

  // columns follow the container width exactly like the CSS auto-fill grid.
  // The box only exists once the list has rows, so re-run when it appears.
  const hasBox = (list.total ?? 0) > 0
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      const g = gapFor()
      setGap(g)
      setCols(view === "grid" ? Math.max(1, Math.floor((el.clientWidth + g) / (MIN_COL + g))) : 1)
      setOffset(el.getBoundingClientRect().top + window.scrollY)
      setBarH(barRef.current?.offsetHeight ?? 0)
      setReady(true)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (barRef.current) ro.observe(barRef.current)
    ro.observe(document.body) // content above the list can change its offset
    return () => ro.disconnect()
  }, [view, hasBox])

  // Rows are uniform in practice, so the first real row's measured height is
  // the estimate for all of them: offsets for unvisited rows (and so jumps,
  // restores, and the total height) come out right without visiting them.
  const [rowH, setRowH] = useState(view === "grid" ? 186 : 45)
  useEffect(() => { setRowH(view === "grid" ? 186 : 45) }, [view])

  const total = list.total ?? 0
  const rows = Math.ceil(total / cols)
  const v = useWindowVirtualizer({
    count: rows,
    estimateSize: () => rowH,
    overscan: 3,
    scrollMargin: offset,
    // keep jumped-to rows clear of the sticky site header + this list's bar
    scrollPaddingStart: headerH() + barH + 8,
  })
  const vrows = v.getVirtualItems()

  useEffect(() => {
    const real = [...(boxRef.current?.querySelectorAll<HTMLElement>(".vrow") ?? [])].find((r) => !r.querySelector(".skeleton"))
    if (!real) return
    const h = real.offsetHeight
    if (h > 0 && Math.abs(h - rowH) > 1) { setRowH(h); requestAnimationFrame(() => v.measure()) }
  })

  // Every row's actions cell takes the widest one seen, so the columns line up
  // down the list and under the header (rows recycle; the width only grows).
  const [actW, setActW] = useState(0)
  // the web font lands after first paint and widens the buttons: measure again
  const [, setFontTick] = useState(0)
  useEffect(() => { document.fonts?.ready.then(() => setFontTick((t) => t + 1)) }, [])
  useLayoutEffect(() => {
    if (view !== "list" || !columns) return
    let w = 0
    boxRef.current?.querySelectorAll<HTMLElement>(".list-actions").forEach((a) => { w = Math.max(w, a.scrollWidth) })
    if (w > actW) setActW(w)
  })

  // fetch the pages that cover the rendered rows (overscan included)
  const firstIdx = vrows.length ? vrows[0].index * cols : 0
  const lastIdx = vrows.length ? (vrows[vrows.length - 1].index + 1) * cols - 1 : 0
  useEffect(() => { if (list.total) list.ensureRange(firstIdx, Math.min(lastIdx, total - 1)) })

  // ---- current page: the first row under the sticky bars
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))
  const [page, setPage] = useState(initialPage)
  const pageFromScroll = () => {
    const line = window.scrollY + headerH() + barH + 8
    const row = v.getVirtualItems().find((r) => r.end > line + 2) // 2px: the row above ends exactly on the line
    if (!row) return null
    // At the very bottom a short last page can't reach the top of the
    // viewport, so the bottom of the document counts as the last page.
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
    const listBottom = (boxRef.current?.getBoundingClientRect().bottom ?? Infinity) <= window.innerHeight
    return atBottom && listBottom ? pages : Math.min(pages, Math.floor((row.index * cols) / PER_PAGE) + 1)
  }
  const jumping = useRef(false)
  // Where this list is right now, for return-to-your-place: the first item
  // under the sticky bars while the list is in view, else null. Kept current
  // as scrolling settles (and after jumps), so leaving needs no DOM reads -
  // by unmount the list's DOM is already gone.
  const here = useRef<number | null>(null)
  const track = () => {
    const box = boxRef.current
    if (!box) return
    const r = box.getBoundingClientRect()
    const line = headerH() + barH + 8
    if (r.top > line || r.bottom < line) { here.current = null; return }
    const row = v.getVirtualItems().find((x) => x.end > window.scrollY + line + 2)
    here.current = row ? row.index * cols : 0
  }
  useEffect(() => {
    // Read the page once scrolling settles: positions passed through on the
    // way (a jump in another list on the same page, a fling) don't count.
    let timer = 0
    const settle = () => {
      if (jumping.current || !restored.current) return
      track()
      // Only the list under the sticky bars has a page (a page can hold two).
      // Out of view, it's page 1, which drops its ?param, so the URL only ever
      // describes the list the visitor is actually in.
      const r = boxRef.current?.getBoundingClientRect()
      const line = headerH() + barH + 8
      if (!r) return
      if (r.top > line || r.bottom < line) { setPage((old) => (old === 1 ? old : 1)); return }
      const p = pageFromScroll()
      if (p !== null) setPage((old) => (old === p ? old : p))
    }
    const onScroll = () => { clearTimeout(timer); timer = window.setTimeout(settle, 100) }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => { clearTimeout(timer); window.removeEventListener("scroll", onScroll) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, cols, barH, pages])

  // mirror the page to the URL without adding history entries (only once the
  // restore below has run, so an incoming ?page= isn't overwritten first)
  useEffect(() => {
    if (!list.total || !restored.current) return
    const u = new URL(location.href)
    const want = page > 1 ? String(page) : null
    if (u.searchParams.get(pageParam) === want) return
    if (want) u.searchParams.set(pageParam, want)
    else u.searchParams.delete(pageParam)
    history.replaceState(history.state, "", u.pathname + u.search + u.hash)
  }, [page, pageParam, list.total])

  /**
   * Scroll so list item `index` sits just under the sticky bars. scrollToIndex
   * lands on estimates; the follow-up frames nudge until the row is exactly in
   * place (rows measure as they render). Instant, never smooth (motion rule).
   */
  function scrollToItem(index: number, done?: () => void) {
    const row = Math.floor(index / cols)
    jumping.current = true
    // Where the row sits: the list's live position on the page + the row's
    // offset inside it (measured, or the uniform row estimate). Recomputed
    // every frame, so content above that grows while we settle is followed.
    const target = () => {
      const box = boxRef.current
      if (!box) return null
      const inBox = (v.measurementsCache[row]?.start ?? row * rowH + v.options.scrollMargin) - v.options.scrollMargin
      const line = headerH() + (barRef.current?.offsetHeight ?? barH) + 8
      return Math.max(0, box.getBoundingClientRect().top + window.scrollY + inBox - line)
    }
    const t0 = target()
    if (t0 !== null) window.scrollTo(0, t0)
    // Keep correcting until the row has held still for a while: content above
    // the list (another list still loading, say) can grow after the first
    // pass. Stops at once if the visitor takes over (wheel, touch, keys).
    let tries = 0, still = 0, stopped = false
    const stop = () => { stopped = true }
    const opts = { passive: true, once: true } as const
    // a frame later: the Enter that triggered a typed jump is still bubbling
    requestAnimationFrame(() => {
      if (stopped) return
      window.addEventListener("wheel", stop, opts)
      window.addEventListener("touchstart", stop, opts)
      window.addEventListener("keydown", stop, opts)
    })
    const finish = () => {
      window.removeEventListener("wheel", stop)
      window.removeEventListener("touchstart", stop)
      window.removeEventListener("keydown", stop)
      jumping.current = false
      track()
      done?.()
    }
    const fix = () => {
      if (stopped) return finish()
      // the rendered row is the ground truth once it exists
      const el = boxRef.current?.querySelector<HTMLElement>(`.vrow[data-index="${row}"]`)
      const line = headerH() + (barRef.current?.offsetHeight ?? barH) + 8
      const want = el ? window.scrollY + el.getBoundingClientRect().top - line : target()
      if (want !== null && Math.abs(want - window.scrollY) > 1) { window.scrollTo(0, Math.max(0, want)); still = 0 } else still++
      // settled = 20 quiet frames after at least 12; give up after ~2s
      if ((tries++ < 12 || still < 20) && tries < 120) requestAnimationFrame(fix)
      else finish()
    }
    requestAnimationFrame(fix)
  }

  function jump(p: number) {
    const target = Math.min(pages, Math.max(1, Math.round(p) || 1))
    list.ensureRange((target - 1) * PER_PAGE, target * PER_PAGE - 1)
    setPage(target)
    scrollToItem((target - 1) * PER_PAGE, () => {
      // a short last page can't reach the top; keep the page we jumped to
      const at = pageFromScroll()
      setPage(target === pages || at === null ? target : at)
    })
  }

  // New filters = a new list: back to page 1, and if the viewer had scrolled
  // into the old results, bring the top of the new ones into view.
  const lastKey = useRef(list.key)
  useEffect(() => {
    if (lastKey.current === list.key) return
    lastKey.current = list.key
    setPage(1)
    const top = (anchorRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - headerH() - 4
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top))
  }, [list.key])

  // ---- restore on return: the list that was in view when leaving goes back
  // to the item at its top; otherwise ?page= on a fresh visit.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || !list.total || !ready) return
    let saved: { param: string; key: string; index: number } | null = null
    try { saved = JSON.parse(sessionStorage.getItem(RESTORE_KEY(location.pathname)) || "null") } catch {}
    restored.current = true
    if (mayRestore && saved && saved.param === pageParam && saved.key === list.key && saved.index > 0) {
      list.ensureRange(saved.index, saved.index + PER_PAGE)
      const index = saved.index
      requestAnimationFrame(() => scrollToItem(index, () => setPage(pageFromScroll() ?? 1)))
      return
    }
    // another list on this page owns the return-to position: don't fight it
    if (mayRestore && saved && saved.param !== pageParam && saved.index > 0) return
    if (initialPage > 1) requestAnimationFrame(() => jump(initialPage))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.total, ready])
  const saveRef = useRef<() => void>(() => {})
  useEffect(() => {
    // Record where this list is on leave. The entry is per page path, shared by
    // the page's lists: the list in view writes it; a list that isn't in view
    // drops an entry it wrote earlier, so a stale deep position from a past
    // visit can't be restored after the visitor came back to the top.
    const save = () => {
      if (!list.total) return
      const key = RESTORE_KEY(location.pathname)
      try {
        if (here.current === null) {
          const prev = JSON.parse(sessionStorage.getItem(key) || "null")
          if (prev && prev.param === pageParam) sessionStorage.removeItem(key)
          return
        }
        sessionStorage.setItem(key, JSON.stringify({ param: pageParam, key: list.key, index: here.current }))
      } catch {}
    }
    saveRef.current = save
  })
  // save on unload and on unmount only (the save closure is refreshed each render)
  useEffect(() => {
    const onHide = () => saveRef.current()
    window.addEventListener("pagehide", onHide)
    return () => { saveRef.current(); window.removeEventListener("pagehide", onHide) }
  }, [])

  const [draft, setDraft] = useState<string | null>(null)
  const label = total === 1 ? noun[0] : noun[1]

  // one always-present anchor, so a filter change can scroll to the list top
  // even while the new results are still loading
  if (list.total === null) {
    return (
      <div className="longlist" ref={anchorRef}>
        {list.error
          ? <p className="error">{list.error} <button className="btn" onClick={list.retry}>Retry</button></p>
          : <p className="muted">Loading…</p>}
      </div>
    )
  }
  if (total === 0) return <div className="longlist" ref={anchorRef}>{empty ?? <p className="muted">Nothing here yet</p>}</div>

  return (
    <div className="longlist" ref={anchorRef} style={actW ? ({ "--act-w": `${actW}px` } as CSSProperties) : undefined}>
      <div className="listbar" ref={barRef}>
        {toolbar}
        <div className="listbar-pager">
          <span className="listbar-count">{total} {label}</span>
          {list.newer > 0 && (
            <button className="listbar-newer" onClick={list.reload}>{list.newer} new · Refresh</button>
          )}
          {pages > 1 && (
            <nav className="pager" aria-label={`Pages of ${noun[1]}`}>
              <button className="pager-btn" onClick={() => jump(1)} disabled={page === 1} aria-label="First page">⏮</button>
              <button className="pager-btn" onClick={() => jump(page - 1)} disabled={page === 1} aria-label="Previous page">‹</button>
              <label className="pager-field">
                Page
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft ?? String(page)}
                  onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
                  onFocus={(e) => { setDraft(String(page)); e.currentTarget.select() }}
                  onBlur={() => { if (draft) jump(+draft); setDraft(null) }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(null); e.currentTarget.blur() } }}
                  aria-label={`Page number, 1 to ${pages}`}
                  size={String(pages).length}
                />
                of {pages}
              </label>
              <button className="pager-btn" onClick={() => jump(page + 1)} disabled={page === pages} aria-label="Next page">›</button>
              <button className="pager-btn" onClick={() => jump(pages)} disabled={page === pages} aria-label="Last page">⏭</button>
              <span className="sr-only" aria-live="polite">Page {page} of {pages}</span>
            </nav>
          )}
        </div>
        {view === "list" && columns && (
          <div className={`list-head cols-${columns.kind}`} role="presentation">
            {columns.labels.map((l, k) => <span key={k}>{l}</span>)}
          </div>
        )}
      </div>

      {list.error && <p className="error">{list.error} <button className="btn" onClick={list.retry}>Retry</button></p>}

      <div ref={boxRef} className={view === "grid" ? "vgrid" : `list vlist${columns ? ` cols-${columns.kind}` : ""}`} style={{ height: v.getTotalSize(), position: "relative" }}>
        {vrows.map((r) => {
          const start = r.index * cols
          const cells = []
          for (let c = 0; c < cols; c++) {
            const i = start + c
            if (i >= total) break
            const item = list.itemAt(i)
            cells.push(item
              ? <div key={item.id} className="vcell">{renderItem(item, i)}</div>
              : <div key={`ph-${i}`} className="vcell">{view === "grid" ? <SkeletonCard /> : <SkeletonRow />}</div>)
          }
          return (
            <div
              key={r.key}
              data-index={r.index}
              ref={v.measureElement}
              className={view === "grid" ? "vrow" : "vrow vrow-list"}
              style={{
                position: "absolute", top: 0, left: 0, width: "100%",
                transform: `translateY(${r.start - v.options.scrollMargin}px)`,
                ...(view === "grid" ? { display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap, paddingBottom: gap } : null),
              }}
            >
              {cells}
            </div>
          )
        })}
      </div>
      <p className="list-end">That's all {total} {label}</p>
    </div>
  )
}

/** Static placeholders at roughly card/row size; muted blocks, no animation. */
function SkeletonCard() {
  return (
    <div className="card skeleton" aria-hidden="true">
      <span className="sk sk-eyebrow" /><span className="sk sk-title" /><span className="sk sk-tags" /><span className="sk sk-actions" />
    </div>
  )
}
function SkeletonRow() {
  return <div className="list-row skeleton" aria-hidden="true"><span className="sk sk-chip" /><span className="sk sk-name" /></div>
}

import { useCallback, useEffect, useRef, useState } from "react"
import { apiGet } from "./api"

/** Page size of every paged list endpoint (functions/_shared/util.ts PER_PAGE). */
export const PER_PAGE = 24

/** Response shape of the paged list endpoints. */
export interface PageResp<T> {
  items: T[]
  total: number
  page: number
  hasMore: boolean
  /** Highest id when page 1 was served; send it back so later pages don't shift. */
  asof: number | null
}

const MAX_CONCURRENT = 3

/**
 * Sparse, on-demand data for one long list. Pages of PER_PAGE are cached by
 * page number and fetched only when asked for (ensureRange), so a jump to
 * page 30 loads page 30, not 1-29. `key` is the serialized filter set: when
 * it changes everything resets, and responses for an old key are dropped.
 *
 * `url(page, asof)` builds the request; it must include `page=` so the
 * endpoint answers in paged form.
 */
export function useLongList<T extends { id: number }>({ url, key }: { url: (page: number, asof: number | null) => string; key: string }) {
  const [, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)

  const st = useRef({
    key: "",
    token: 0,
    total: null as number | null,
    asof: null as number | null,
    pages: new Map<number, T[]>(),
    inflight: new Set<number>(),
    queue: [] as number[],
    error: "",
    newer: 0, // rows added since this listing was frozen (focus check)
  })
  const urlRef = useRef(url)
  urlRef.current = url

  const pump = useCallback(() => {
    const s = st.current
    while (s.inflight.size < MAX_CONCURRENT && s.queue.length) {
      const page = s.queue.shift()!
      if (s.pages.has(page) || s.inflight.has(page)) continue
      s.inflight.add(page)
      const token = s.token
      apiGet<PageResp<T>>(urlRef.current(page, s.asof))
        .then((d) => {
          if (token !== st.current.token) return // filters changed meanwhile
          s.pages.set(page, d.items)
          if (s.total === null || page === 1) s.total = d.total
          if (s.asof === null && d.asof != null) s.asof = d.asof
          s.error = ""
        })
        .catch((e) => { if (token === st.current.token) s.error = (e as Error).message })
        .finally(() => {
          if (token !== st.current.token) return
          s.inflight.delete(page)
          bump()
          pump()
        })
    }
  }, [])

  const request = useCallback((pages: number[]) => {
    const s = st.current
    let added = false
    for (const p of pages) {
      if (p < 1 || s.pages.has(p) || s.inflight.has(p) || s.queue.includes(p)) continue
      if (s.total !== null && (p - 1) * PER_PAGE >= s.total) continue
      s.queue.push(p)
      added = true
    }
    if (added) pump()
  }, [pump])

  // reset on filter change, then learn the total from page 1
  if (st.current.key !== key) {
    const s = st.current
    s.key = key
    s.token++
    s.total = null
    s.asof = null
    s.pages = new Map()
    s.inflight = new Set()
    s.queue = []
    s.error = ""
    s.newer = 0
  }
  useEffect(() => { request([1]) }, [key, request])

  // New rows since the freeze: re-ask page 1 unfrozen when the tab regains focus.
  useEffect(() => {
    const onFocus = () => {
      const s = st.current
      if (s.total === null || s.asof === null) return
      const token = s.token
      apiGet<PageResp<T>>(urlRef.current(1, null))
        .then((d) => {
          if (token !== st.current.token) return
          const newer = Math.max(0, d.total - (s.total ?? 0))
          if (newer !== s.newer) { s.newer = newer; bump() }
        })
        .catch(() => {})
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  const s = st.current
  return {
    key,
    total: s.total,
    error: s.error,
    newer: s.newer,
    loading: s.inflight.size > 0,
    /** The item at list index i, or undefined while its page hasn't arrived. */
    itemAt: (i: number): T | undefined => s.pages.get(Math.floor(i / PER_PAGE) + 1)?.[i % PER_PAGE],
    /** Fetch whatever pages cover indices [start, end] that aren't cached yet. */
    ensureRange: (start: number, end: number) => {
      const first = Math.floor(Math.max(0, start) / PER_PAGE) + 1
      const last = Math.floor(Math.max(0, end) / PER_PAGE) + 1
      const want: number[] = []
      for (let p = first; p <= last; p++) want.push(p)
      request(want)
    },
    /** Ids of every loaded item, in list order (selection ranges follow this). */
    loadedIds: (): number[] => {
      const ids: number[] = []
      for (const p of [...s.pages.keys()].sort((a, b) => a - b)) for (const it of s.pages.get(p)!) ids.push(it.id)
      return ids
    },
    /** Update one loaded item in place (e.g. a visibility toggle). */
    patch: (id: number, fn: (item: T) => T) => {
      for (const [p, items] of s.pages) {
        const i = items.findIndex((x) => x.id === id)
        if (i !== -1) { const next = items.slice(); next[i] = fn(items[i]); s.pages.set(p, next); bump(); return }
      }
    },
    /**
     * Refetch after rows were added or removed (delete, unlike, remove from
     * pack). Pages that were loaded are fetched again under a fresh freeze,
     * so offsets stay consistent.
     */
    reload: () => {
      const loaded = [...s.pages.keys(), ...s.inflight]
      s.token++
      s.total = null
      s.asof = null
      s.pages = new Map()
      s.inflight = new Set()
      s.queue = []
      s.error = ""
      s.newer = 0
      bump()
      request(loaded.length ? [1, ...loaded.filter((p) => p !== 1)] : [1])
    },
    /** Retry after an error: re-queue what was asked for. */
    retry: () => { s.error = ""; bump(); request([1]) },
  }
}

export type LongListData<T extends { id: number }> = ReturnType<typeof useLongList<T>>

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "./auth"
import { apiGet, apiSend, downloadZip, type Pack } from "./api"
import { here } from "./paths"

export const MAX_SELECTION = 200

/** Touch screens have no shift key, so range-select hints don't apply there. */
const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches

/** A card's own controls keep their behavior; everything else on the card selects. */
const isControl = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("a, button, select, textarea, input:not([type=checkbox]), .chip-filter")

/** What a selectable card/row spreads onto itself and its checkbox (from `selection.bind`). */
export interface SelBind {
  selected: boolean
  card: {
    "data-sel-id": number
    onPointerDown: (e: React.PointerEvent) => void
    onClick: (e: React.MouseEvent) => void
  }
  box: {
    checked: boolean
    onChange: () => void
    tabIndex: number
  }
}

/**
 * Multi-select state shared across a page's lists.
 *
 * Pointer input all goes through the card (its checkbox is visual for the
 * mouse, see .sel-box), so one model covers every gesture:
 *  - press + release: toggle that patch
 *  - press + drag: paint - every patch from the pressed one to the one under
 *    the pointer (in `order`, the visible list order) takes the pressed
 *    patch's new state; dragging back restores the ones left behind
 *  - shift-click: the same range, anchored on the last patch clicked
 * Touch keeps tap-to-toggle (a drag there is a scroll); keyboard toggles via
 * the focused checkbox.
 */
export function useSelection() {
  const [sel, setSel] = useState<Set<number>>(new Set())
  const selRef = useRef(sel)
  selRef.current = sel
  const anchor = useRef<{ id: number; on: boolean } | null>(null)
  const drag = useRef<{ on: boolean; from: number; order: number[]; base: Set<number>; last: number } | null>(null)

  const capAdd = (n: Set<number>, x: number) => { if (n.size < MAX_SELECTION) n.add(x) }

  function pick(id: number, shift = false, order: number[] = []) {
    setSel((s) => {
      const n = new Set(s)
      const a = anchor.current
      const from = a ? order.indexOf(a.id) : -1
      const to = order.indexOf(id)
      if (shift && a && from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from]
        for (const x of order.slice(lo, hi + 1)) { if (a.on) capAdd(n, x); else n.delete(x) }
        return n
      }
      const on = !n.has(id)
      if (on) capAdd(n, id); else n.delete(id)
      anchor.current = { id, on }
      return n
    })
  }

  /** Paint the drag range: start..current set to the drag's state, everything else back to how it was. */
  function dragTo(id: number) {
    const d = drag.current
    if (!d || d.last === id) return
    const to = d.order.indexOf(id)
    if (to === -1) return
    d.last = id
    const [lo, hi] = d.from < to ? [d.from, to] : [to, d.from]
    const n = new Set(d.base)
    for (const x of d.order.slice(lo, hi + 1)) { if (d.on) capAdd(n, x); else n.delete(x) }
    setSel(n)
  }

  function startDrag(id: number, order: number[]) {
    const base = new Set(selRef.current)
    const on = !base.has(id)
    drag.current = { on, from: order.indexOf(id), order, base, last: NaN }
    anchor.current = { id, on }
    dragTo(id)
    document.documentElement.classList.add("drag-selecting")

    let scrollRaf = 0
    let lastY = 0
    // Auto-scroll when the pointer sits near the top (under the sticky header
    // + toolbar) or bottom edge, so a drag can run past the visible cards.
    const scrollStep = () => {
      const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-h")) || 0) + 70
      const dy = lastY > innerHeight - 56 ? 14 : lastY < top ? -14 : 0
      if (dy) {
        window.scrollBy(0, dy)
        hit(lastX, lastY)
        scrollRaf = requestAnimationFrame(scrollStep)
      } else scrollRaf = 0
    }
    let lastX = 0
    // Hit-test by position, not enter events: works across grid gaps and
    // while the page scrolls under a still pointer.
    const hit = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest("[data-sel-id]")
      if (el) dragTo(Number(el.getAttribute("data-sel-id")))
    }
    const move = (e: PointerEvent) => {
      lastX = e.clientX; lastY = e.clientY
      hit(lastX, lastY)
      if (!scrollRaf) scrollRaf = requestAnimationFrame(scrollStep)
    }
    const end = () => {
      drag.current = null
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
      document.documentElement.classList.remove("drag-selecting")
      document.removeEventListener("pointermove", move)
      document.removeEventListener("pointerup", end)
      document.removeEventListener("pointercancel", end)
    }
    document.addEventListener("pointermove", move)
    document.addEventListener("pointerup", end)
    document.addEventListener("pointercancel", end)
  }

  /** Handlers for one selectable card/row and its checkbox. */
  function bind(id: number, order: number[]): SelBind {
    return {
      selected: sel.has(id),
      card: {
        "data-sel-id": id,
        onPointerDown(e) {
          if (e.button !== 0 || e.pointerType === "touch" || isControl(e.target)) return
          e.preventDefault() // no text-selection while painting
          window.getSelection()?.removeAllRanges()
          if (e.shiftKey) pick(id, true, order)
          else startDrag(id, order)
        },
        onClick(e) {
          // Mouse/pen were handled on pointerdown; this path is touch (tap).
          const pt = (e.nativeEvent as PointerEvent).pointerType
          if (pt === "mouse" || pt === "pen" || isControl(e.target)) return
          // a keyboard Space on the checkbox clicks it too; its onChange handles that
          if (e.target instanceof HTMLInputElement) return
          pick(id, e.shiftKey, order)
        },
      },
      box: {
        checked: sel.has(id),
        onChange: () => pick(id, false, order), // keyboard (Space) on the focused box
        tabIndex: 0,
      },
    }
  }

  /** Select (or clear) every id in `ids`, e.g. everything currently shown. */
  function setMany(ids: number[], on: boolean) {
    setSel((s) => {
      const n = new Set(s)
      for (const x of ids) { if (on) capAdd(n, x); else n.delete(x) }
      return n
    })
  }

  return {
    ids: [...sel],
    has: (id: number) => sel.has(id),
    pick,
    bind,
    setMany,
    clear: () => { anchor.current = null; setSel(new Set()) },
  }
}

export type Selection = ReturnType<typeof useSelection>

/**
 * The selection line of a list's sticky bar (LongList's `toolbar`): always
 * visible, so the affordance is explicit before anything is picked. Actions
 * stay disabled (with a hint) until something is selected.
 *
 * `selectAll` is only given where "everything" is small and bounded - a
 * pack's page (a pack holds at most 200, the selection cap). The big lists
 * (Browse, Mine, Favorites) select by click, drag, and shift-click instead.
 */
export function SelectionToolbar({
  selection,
  selectAll,
  extra,
  hint = "Select patches to download them together or add them to a pack",
}: {
  selection: Selection
  /** All ids in scope (fetched on demand) and how many there are. */
  selectAll?: { count: number; ids: () => Promise<number[]> }
  /** extra page-specific actions, e.g. "Remove from pack" */
  extra?: (ids: number[], done: () => void) => ReactNode
  hint?: string
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<ReactNode>("")
  const [adding, setAdding] = useState("")
  const menuRef = useRef<HTMLDivElement>(null)

  const ids = selection.ids
  const n = ids.length

  // Select all (pack page only): tri-state against the pack's full id list.
  const [allIds, setAllIds] = useState<number[] | null>(null)
  const [selecting, setSelecting] = useState(false)
  const inScope = allIds ? allIds.filter((id) => selection.has(id)).length : 0
  const allOn = !!selectAll && !!allIds && allIds.length > 0 && inScope === Math.min(allIds.length, MAX_SELECTION)
  const someOn = !!selectAll && n > 0 && !allOn
  const allRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = someOn }, [someOn])
  // the pack's contents changed (count differs): re-fetch ids next time
  useEffect(() => { setAllIds(null) }, [selectAll?.count])

  async function toggleAll() {
    if (!selectAll) return
    if (allOn) { selection.clear(); return }
    setSelecting(true)
    try {
      const all = allIds ?? (await selectAll.ids())
      setAllIds(all)
      selection.setMany(all, true)
      if (all.length > MAX_SELECTION) setMsg(`Selected the first ${MAX_SELECTION} of ${all.length}`)
    } catch (e) { setMsg((e as Error).message) }
    finally { setSelecting(false) }
  }

  // close the pack menu on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
  }, [open])

  // a result message belongs to the selection it was about
  useEffect(() => { if (n === 0) setMsg("") }, [n])

  async function downloadSelected() {
    setMsg("")
    try { await downloadZip("/api/patches/zip", { ids }, "op1-patches.zip") }
    catch (e) { setMsg((e as Error).message) }
  }

  function openMenu() {
    if (!user) { window.location.href = here(); return }
    setOpen((o) => !o)
  }

  async function addTo(pack: { id: number; name: string }) {
    setMsg("")
    const total = ids.length
    let added = 0
    setAdding(`Adding 1 / ${total}…`)
    try {
      for (const id of ids) {
        await apiSend(`/api/packs/${pack.id}/items`, "POST", { patch_id: id })
        added++
        setAdding(`Adding ${added} / ${total}…`)
      }
      setAdding("")
      setMsg(<>Added {added} to <Link to={`/library/packs/${pack.id}`}>{pack.name}</Link></>)
      setOpen(false)
    } catch (e) {
      setAdding("")
      setMsg(added > 0 ? `Added ${added} of ${total}. ${(e as Error).message}` : (e as Error).message)
    }
  }

  return (
    <div className={"seltool" + (n ? " has-sel" : "")} role="toolbar" aria-label="Selection">
      {selectAll ? (
        <label className="seltool-all">
          <input
            ref={allRef}
            type="checkbox"
            checked={allOn}
            disabled={selecting}
            onChange={toggleAll}
            aria-label={allOn ? "Deselect all" : "Select all"}
          />
          <span>{n ? <><b>{n}</b> selected</> : <>Select all {selectAll.count}</>}</span>
        </label>
      ) : n > 0 ? (
        <span className="seltool-all"><span><b>{n}</b> selected</span></span>
      ) : null}
      {n > 0 && <button className="seltool-clear" onClick={selection.clear}>Clear</button>}
      <span className="seltool-hint">
        {adding || msg || (n ? (n >= MAX_SELECTION ? `Up to ${MAX_SELECTION} at a time` : coarse() ? "Tap more cards to add them" : "Drag across cards or shift-click to select a range") : hint)}
      </span>
      <div className="seltool-actions">
        <button className="btn primary" onClick={downloadSelected} disabled={!n}>
          {n ? `Download ${n} as .zip` : "Download selected"}
        </button>
        <div className="selbar-pack" ref={menuRef}>
          <button className="btn" onClick={openMenu} disabled={!n} aria-expanded={open} title={user ? undefined : "Log in to build packs"}>
            {user ? "Add to pack ▾" : "Add to pack (log in)"}
          </button>
          {open && <PackPicker onPick={addTo} onError={(m) => setMsg(m)} />}
        </div>
        {extra?.(ids, selection.clear)}
      </div>
    </div>
  )
}

/**
 * Add-to-pack menu: one field that finds your packs by name (server-side, so
 * an account with many packs never loads them all) or creates a new one.
 */
function PackPicker({ onPick, onError }: { onPick: (p: { id: number; name: string }) => void; onError: (m: string) => void }) {
  const [q, setQ] = useState("")
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [total, setTotal] = useState(0)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      apiGet<{ items: Pack[]; total: number }>(`/api/packs?page=1${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((d) => { if (live) { setPacks(d.items); setTotal(d.total) } })
        .catch(() => { if (live) setPacks([]) })
    }, q ? 200 : 0)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  const name = q.trim()
  const exact = packs?.some((p) => p.name.toLowerCase() === name.toLowerCase())

  async function create() {
    if (!name) return
    setCreating(true)
    try {
      const p = await apiSend<{ id: number }>("/api/packs", "POST", { name })
      onPick({ id: p.id, name })
    } catch (e) { onError((e as Error).message) }
    finally { setCreating(false) }
  }

  return (
    <div className="selbar-menu">
      <div className="menu-new-pack">
        <input
          type="text"
          placeholder="Find or name a pack…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name && !exact) create() }}
          aria-label="Find a pack, or type a new pack name"
          autoFocus
        />
      </div>
      {name && !exact && (
        <button className="menu-item menu-create" onClick={create} disabled={creating}>
          {creating ? "Creating…" : <>+ Create <b>{name}</b></>}
        </button>
      )}
      {packs === null ? (
        <div className="menu-item muted">Loading…</div>
      ) : packs.length === 0 ? (
        <div className="menu-item muted">{name ? "No pack by that name" : "No packs yet - type a name above"}</div>
      ) : (
        <>
          {packs.map((p) => (
            <button key={p.id} className="menu-item" onClick={() => onPick(p)}>{p.name}</button>
          ))}
          {total > packs.length && <div className="menu-item muted">{total - packs.length} more - type to narrow</div>}
        </>
      )}
    </div>
  )
}

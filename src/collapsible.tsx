import { useEffect, useRef, useState, type ReactNode } from "react"
import { useLocation } from "react-router-dom"

/**
 * A disclosure for a page's "your own stuff" section (My packs, My patches)
 * so it can be folded away and stop eating space above the community/discovery
 * section below it. Open state persists per storageKey; native <details> keeps
 * it keyboard/screen-reader accessible for free.
 *
 * The body only renders while open, so a folded long list doesn't keep a
 * virtualizer measuring an invisible box or fetching pages nobody can see.
 *
 * With an `id`, a link to #id (e.g. /library/mine#packs from the Packs page)
 * opens the section, folded or not, and scrolls it into view.
 */
export function Collapsible({ storageKey, summary, children, className, id }: {
  storageKey: string; summary: ReactNode; children: ReactNode; className?: string; id?: string
}) {
  const { hash } = useLocation()
  const targeted = !!id && hash === "#" + id
  const [initialOpen] = useState(() => {
    if (targeted) return true
    try { return localStorage.getItem(storageKey) !== "0" } catch { return true }
  })
  const [open, setOpen] = useState(initialOpen)
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!targeted || !el) return
    el.open = true // fires onToggle, which renders the body and remembers it open
    // Lists above this one load after first paint and push it down, so keep
    // it in place for a moment - until the visitor scrolls themselves.
    const until = performance.now() + 1500
    let raf = 0
    const stop = () => { cancelAnimationFrame(raf); raf = -1 }
    const aim = () => {
      if (raf < 0) return
      if (Math.abs(el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).scrollMarginTop || "0")) > 2)
        el.scrollIntoView({ block: "start" })
      if (performance.now() < until) raf = requestAnimationFrame(aim)
    }
    raf = requestAnimationFrame(aim)
    const opts = { passive: true, once: true }
    window.addEventListener("wheel", stop, opts)
    window.addEventListener("touchstart", stop, opts)
    window.addEventListener("keydown", stop, { once: true })
    return () => {
      stop()
      window.removeEventListener("wheel", stop)
      window.removeEventListener("touchstart", stop)
      window.removeEventListener("keydown", stop)
    }
  }, [targeted, hash])

  return (
    <details
      ref={ref}
      id={id}
      className={"collapsible" + (className ? " " + className : "")}
      open={initialOpen}
      onToggle={(e) => {
        const isOpen = (e.currentTarget as HTMLDetailsElement).open
        setOpen(isOpen)
        try { localStorage.setItem(storageKey, isOpen ? "1" : "0") } catch {}
      }}
    >
      <summary>{summary}</summary>
      {open && <div className="collapsible-body">{children}</div>}
    </details>
  )
}

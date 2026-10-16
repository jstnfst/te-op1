import { useState, type ReactNode } from "react"

/**
 * A disclosure for a page's "your own stuff" section (My packs, My patches)
 * so it can be folded away and stop eating space above the community/discovery
 * section below it. Open state persists per storageKey; native <details> keeps
 * it keyboard/screen-reader accessible for free.
 *
 * The body only renders while open, so a folded long list doesn't keep a
 * virtualizer measuring an invisible box or fetching pages nobody can see.
 */
export function Collapsible({ storageKey, summary, children, className }: { storageKey: string; summary: ReactNode; children: ReactNode; className?: string }) {
  const [initialOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== "0" } catch { return true }
  })
  const [open, setOpen] = useState(initialOpen)
  return (
    <details
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

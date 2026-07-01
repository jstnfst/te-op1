import { useState, type ReactNode } from "react"

/**
 * A disclosure for a page's "your own stuff" section (My packs, My patches)
 * so it can be folded away and stop eating space above the community/discovery
 * section below it. Open state persists per storageKey; native <details> keeps
 * it keyboard/screen-reader accessible for free.
 */
export function Collapsible({ storageKey, summary, children }: { storageKey: string; summary: ReactNode; children: ReactNode }) {
  const [initialOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== "0" } catch { return true }
  })
  return (
    <details
      className="collapsible"
      open={initialOpen}
      onToggle={(e) => {
        try { localStorage.setItem(storageKey, (e.currentTarget as HTMLDetailsElement).open ? "1" : "0") } catch {}
      }}
    >
      <summary>{summary}</summary>
      <div className="collapsible-body">{children}</div>
    </details>
  )
}

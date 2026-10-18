import { useEffect, useRef, useState, type ReactNode } from "react"

// Small line icons for the compact list/card controls (14px, currentColor),
// drawn on the same 16-unit grid as the like and download icons.

const svg = (children: ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)

export const TrashIcon = () => svg(<>
  <path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5" />
  <path d="M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6M6.8 7v4.5M9.2 7v4.5" />
</>)

/** A knob (its travel arc open at the bottom, like the editor's dials): open in the patch editor. */
export const KnobIcon = () => svg(<>
  <path d="M3.8 12.2a6 6 0 1 1 8.4 0" />
  <path d="M8 8.5 10.6 5.4" />
</>)

/** Open eye = public; eye with a slash = private. */
export const EyeIcon = ({ open }: { open: boolean }) => svg(<>
  <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z" />
  <circle cx="8" cy="8" r="2" />
  {!open && <path d="M2.5 13.5l11-11" />}
</>)

export const HeartIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 14.2 2.8 9.1a3.6 3.6 0 0 1 0-5.2 3.7 3.7 0 0 1 5.1 0l.1.1.1-.1a3.7 3.7 0 0 1 5.1 0 3.6 3.6 0 0 1 0 5.2Z"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
)

/**
 * A square icon button that can ask once before acting. With `confirm`, the
 * first press floats a "Confirm?" button over this one - absolutely placed, so
 * the row around it never reflows - and pressing that commits. It disarms on
 * its own after a moment. Clicks never reach an enclosing card or <Link>.
 */
export function IconAction({
  icon, label, onAction, confirm = false, tone = "danger", disabled, active, className = "",
}: {
  icon: ReactNode
  /** aria-label and tooltip, e.g. "Delete" or "Make public" */
  label: string
  onAction: () => void
  confirm?: boolean
  /** colour of the floating confirm: danger (red) or primary (orange) */
  tone?: "danger" | "primary"
  disabled?: boolean
  /** pressed state, e.g. a public eye */
  active?: boolean
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() }
  function press(e: React.MouseEvent) {
    stop(e)
    if (!confirm) return onAction()
    setArmed(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setArmed(false), 2500)
  }
  function commit(e: React.MouseEvent) {
    stop(e)
    if (timer.current) clearTimeout(timer.current)
    setArmed(false)
    onAction()
  }

  return (
    <span className="icon-action">
      <button type="button" className={"btn icon-btn" + (active ? " on" : "") + (className ? " " + className : "")}
        onClick={press} disabled={disabled} aria-label={label} title={label}>
        {icon}
      </button>
      {armed && (
        <button type="button" className={"btn confirm-pop " + tone} onClick={commit} autoFocus
          onBlur={() => setArmed(false)} aria-label={`Confirm: ${label}`}>
          Confirm?
        </button>
      )}
    </span>
  )
}

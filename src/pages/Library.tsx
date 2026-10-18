import { Link } from "react-router-dom"
import { useAuth } from "../auth"
import { useSelection } from "../packs"
import { DiscoverPatches } from "../patchLists"
import { loginPath } from "../paths"

export type Step = { n: string; title: string; body: React.ReactNode }

/** A browse page's three steps, beside its lead (Library and Packs). */
export function HowSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="how-steps" aria-label="How this page works">
      {steps.map((s) => (
        <li key={s.n}>
          <span className="how-n" aria-hidden="true">{s.n}</span>
          <span><b>{s.title}</b>{s.body}</span>
        </li>
      ))}
    </ol>
  )
}

/** The three things this page lets you do, spelled out before you need them. */
const STEPS: Step[] = [
  { n: "1", title: "Find", body: "Search by name, or narrow by engine and tag" },
  { n: "2", title: "Pick", body: <><span className="fine-only">Click a card or drag across several; <span className="nowrap"><kbd>shift</kbd>-click</span> for a range</span><span className="coarse-only">Tap cards to pick them</span></> },
  { n: "3", title: "Take", body: "Download them as one .zip, or add them to a new or existing pack" },
]

/** /library - the public patch browser; the front door of the LIBRARY path. */
export default function Library() {
  const { user } = useAuth()
  const selection = useSelection()

  return (
    <>
      <div className="lib-hero">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="hero-title">Find a sound</h1>
          <p className="lead">
            Community patches for the OP-1 Field.
            {user
              ? <> Yours are in <Link to="/library/mine#patches">Mine</Link>.</>
              : <> <Link to={loginPath("/library")}>Log in</Link> to like, build packs, and upload.</>}
          </p>
        </div>
        <HowSteps steps={STEPS} />
      </div>

      <DiscoverPatches selection={selection} />
    </>
  )
}

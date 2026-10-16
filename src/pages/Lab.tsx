import { Link } from "react-router-dom"
import { useAuth } from "../auth"

const TOOLS = [
  {
    href: "/lab/layout",
    eyebrow: "01 · knobs",
    title: "Knob layout",
    desc: "The named parameter behind every array index, for every synth, FX, and LFO engine",
  },
  {
    href: "/lab/mappings",
    eyebrow: "02 · values",
    title: "Value mappings",
    desc: "How a raw 16-bit value becomes the number on screen: percent, Hz, tempo, selector, and more",
  },
  {
    href: "/lab/inspector",
    eyebrow: "03 · patches",
    title: "Patch inspector",
    desc: "Load any preset and read it back: ADSR, knobs, FX, LFO, and the raw values behind them",
  },
]

/** /lab - the front door of the LAB path: the preset-format reference. */
export default function Lab() {
  const { user } = useAuth()
  return (
    <>
      <p className="eyebrow">Lab</p>
      <h1 className="hero-title">How the OP-1 thinks</h1>
      <p className="lead">
        An OP-1 Field preset is an AIFF-C file with a JSON blob inside: the synth engine, one
        envelope, one FX, and one LFO, each stored as 16-bit integers in fixed 8-element arrays.
        Teenage Engineering never documented that blob. The Lab does.
      </p>

      <div className="lab-stats" aria-label="Coverage">
        <span><b>15</b> synth engines</span>
        <span><b>9</b> FX</span>
        <span><b>6</b> LFOs</span>
        <span><b>8</b> scale types</span>
      </div>

      <h2>Tools</h2>
      <div className="grid lab-tools">
        {TOOLS.map((t) => (
          <a className="card" key={t.href} href={t.href}>
            <div className="card-eyebrow">{t.eyebrow}</div>
            <div className="card-title">{t.title}</div>
            <div className="card-desc">{t.desc}</div>
          </a>
        ))}
      </div>

      <h2>Changelog &amp; issues</h2>
      <p className="muted lab-issues">
        {user?.provider === "github"
          ? <>See what shipped, report a bug, or request a feature on <Link to="/issues">Issues</Link>.</>
          : <>Release notes and bug reports live on <a href="https://github.com/jstnfst/te-op1">GitHub</a>.
              Sign in with GitHub to file issues from here.</>}
      </p>
    </>
  )
}

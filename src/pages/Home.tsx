import { useEffect, useRef, useState, type PointerEvent } from "react"
import { Link } from "react-router-dom"
import { apiGet, type PatchSummary } from "../api"
import { DownloadCount } from "../like"
import { TYPES } from "../patchLists"
import { Scope, envLevel, envStage, ENV_STAGES, type ScopeHandle, type Side } from "../landing/Scope"
import "../landing/landing.css"

// Real samples of what each Lab tool holds, previewed in the "Inside the lab" tiles.
// fm's four knobs as named on the Layout page (public/params.html PARAMS).
const FM_KNOBS = ["FM AMOUNT", "FREQUENCY", "TOPOLOGY", "DETUNE"]
// The inspector's bundled "fm - sirius_signals" sample preset (public/patch.html).
const SAMPLE_PRESET: Array<[string, string]> = [["name", "sirius_signals"], ["type", "fm"], ["fx", "nitro"], ["lfo", "random"], ["octave", "4"]]

const SCALE_TYPES: Array<[string, string]> = [
  ["percent", "%"], ["centered", "centered %"], ["discrete", "discrete"], ["selector", "selector"],
  ["hz", "hz (log)"], ["tempo", "tempo dial"], ["inverse", "ms inverse"], ["decimal", "decimal"],
]

/** The Library knob's detents: no filter, then every engine. */
const DIAL = ["all", ...TYPES]
const SWEEP = 270 // degrees, -135° (all) to +135° (last engine)
const detentAngle = (i: number) => -SWEEP / 2 + (i * SWEEP) / (DIAL.length - 1)

/** Engine-select knob for the Library panel. One tick per detent; the pointer
 * snaps from detent to detent as the visitor moves across the panel. */
function KnobGlyph({ index }: { index: number }) {
  const ticks = DIAL.map((_, i) => {
    const a = (detentAngle(i) * Math.PI) / 180
    return (
      <line key={i} className={i === index ? "on" : undefined}
        x1={40 + Math.sin(a) * 29} y1={40 - Math.cos(a) * 29} x2={40 + Math.sin(a) * 35} y2={40 - Math.cos(a) * 35} />
    )
  })
  return (
    <div className="fork-glyph knob-wrap">
      <svg className="knob" viewBox="0 0 80 80" aria-hidden="true">
        <g className="knob-ticks">{ticks}</g>
        <circle className="knob-body" cx="40" cy="40" r="22" />
        <line className="knob-pointer" x1="40" y1="40" x2="40" y2="22" style={{ transform: `rotate(${detentAngle(index)}deg)` }} />
      </svg>
      <span className="knob-label">{DIAL[index]}</span>
    </div>
  )
}

// Envelope glyph geometry, from the same ADSR the scope draws.
const gx = (u: number) => 4 + u * 112
const gy = (lvl: number) => 70 - lvl * 58
const ENV_KNEES = [0, ...ENV_STAGES.map(([, end]) => end)]

/** ADSR glyph for the Lab panel: draws in once on hover/focus (CSS), then a
 * read-head follows the pointer, mirrored on the scope with its raw value. */
function EnvGlyph({ pos }: { pos: number }) {
  return (
    <div className="fork-glyph env-wrap">
      <svg className="env" viewBox="0 0 120 80" aria-hidden="true">
        <line className="env-base" x1="4" y1="70" x2="116" y2="70" />
        <polyline className="env-line" pathLength={1} points={ENV_KNEES.map((u) => `${gx(u)},${gy(envLevel(u))}`).join(" ")} />
        <g className="env-nodes">
          {ENV_KNEES.slice(1, -1).map((u) => <circle key={u} cx={gx(u)} cy={gy(envLevel(u))} r="2.5" />)}
        </g>
        <g className="env-cursor">
          <line x1={gx(pos)} y1="4" x2={gx(pos)} y2="70" />
          <circle cx={gx(pos)} cy={gy(envLevel(pos))} r="3.5" />
        </g>
      </svg>
      <span className="knob-label">{envStage(pos)}</span>
    </div>
  )
}

/** Light that follows the pointer inside a fork panel (pointer-gated; static otherwise). */
function trackSpot(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`)
}

function Trending() {
  const [items, setItems] = useState<PatchSummary[] | null>(null)
  useEffect(() => {
    apiGet<{ items: PatchSummary[] }>("/api/patches?sort=likes")
      .then((d) => setItems(d.items.slice(0, 8)))
      .catch(() => setItems([]))
  }, [])

  return (
    <section className="land-section">
      <div className="land-section-head">
        <h2>Popular in the library</h2>
        <Link className="land-more" to="/library?sort=likes">See all →</Link>
      </div>
      {items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">
          The library is empty so far. <Link to="/library/upload">Upload the first patch</Link>.
        </p>
      ) : (
        <div className="grid">
          {items.map((p) => (
            <a className="card" key={p.id} href={`/patch.html?id=${p.id}`}>
              <div className="card-eyebrow">
                <span className="chip">{p.type}</span>
                {p.author ? <span>by {p.author}</span> : null}
              </div>
              <div className="card-title">{p.name}</div>
              <div className="card-tags">
                {p.tags.split(",").filter(Boolean).slice(0, 4).map((t) => <span key={t} className="chip tag">{t}</span>)}
              </div>
              <div className="row card-actions">
                <DownloadCount n={p.download_count} />
                {(p.like_count ?? 0) > 0 && (
                  <span className="dl-count" title={`${p.like_count} likes`}>
                    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M8 14.2 2.8 9.1a3.6 3.6 0 0 1 0-5.2 3.7 3.7 0 0 1 5.1 0l.1.1.1-.1a3.7 3.7 0 0 1 5.1 0 3.6 3.6 0 0 1 0 5.2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                    {p.like_count}
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

/** Public patch totals per engine, for the knob readout and CTA. */
function useCounts() {
  const [counts, setCounts] = useState<{ total: number; byType: Record<string, number> } | null>(null)
  useEffect(() => {
    apiGet<{ total: number; byType: Record<string, number> }>("/api/patches/counts")
      .then(setCounts)
      .catch(() => setCounts(null))
  }, [])
  return counts
}

export default function Home() {
  const scope = useRef<ScopeHandle>(null)
  const counts = useCounts()
  const [dial, setDial] = useState(0)
  const [envPos, setEnvPos] = useState(0.5)
  const engine = DIAL[dial]
  const count = counts ? (engine === "all" ? counts.total : counts.byType[engine] ?? 0) : null

  // Keep the scope's engine trace + readouts in step with the knob.
  useEffect(() => { scope.current?.setEngine(engine, count) }, [engine, count])

  // Pointer X across the Library panel turns the knob, detent by detent.
  // Whatever is dialed when the visitor clicks is where the link goes.
  function turnKnob(e: PointerEvent<HTMLElement>) {
    trackSpot(e)
    if (e.pointerType === "touch") return
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width))
    setDial(Math.floor(x * DIAL.length))
  }
  // Pointer X across the Lab panel scrubs the envelope read-head (glyph + scope).
  function scrubEnv(e: PointerEvent<HTMLElement>) {
    trackSpot(e)
    if (e.pointerType === "touch") return
    const r = e.currentTarget.getBoundingClientRect()
    const u = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width))
    setEnvPos(u)
    scope.current?.setCursor(u)
  }
  const libraryHref = engine === "all" ? "/library" : `/library?type=${encodeURIComponent(engine)}`
  const libraryCta = engine === "all"
    ? (count === null ? "Browse patches" : `Browse all ${count} patches`)
    : (count === null ? `Browse ${engine} patches` : count === 0 ? `No ${engine} patches yet` : `Browse ${count} ${engine} ${count === 1 ? "patch" : "patches"}`)

  // Motion is pointer-gated: the scope runs only while a mouse/pen is over
  // the hero. Touch and keyboard get the static end state (see Scope.setSide).
  function enter(e: PointerEvent) {
    if (e.pointerType === "mouse" || e.pointerType === "pen") scope.current?.activate(true)
  }
  function move(e: PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    scope.current?.setX((e.clientX - r.left) / r.width)
  }
  const lean = (side: Side) => () => scope.current?.setSide(side)

  return (
    <>
      <section
        className="hero"
        onPointerEnter={enter}
        onPointerMove={move}
        onPointerLeave={() => scope.current?.activate(false)}
      >
        <div className="hero-top">
          <div className="hero-copy">
            <p className="eyebrow">OP-1 Field · community patches + format reference</p>
            <h1 className="land-title">
              Patches for<br />your OP-1<br /><span className="land-title-sub">and how they work</span>
            </h1>
          </div>
          <Scope ref={scope} />
        </div>

        <div className="fork">
          <Link
            className="fork-panel"
            to={libraryHref}
            onPointerEnter={lean("library")}
            onPointerLeave={lean(null)}
            onPointerMove={turnKnob}
            onFocus={lean("library")}
            onBlur={lean(null)}
          >
            <div className="fork-head">
              <span className="fork-key">A</span>
              <span className="fork-eyebrow">Library · for musicians</span>
            </div>
            <div className="fork-body">
              <div>
                <div className="fork-title">Find a sound</div>
                <p className="fork-desc">Browse community patches, download the .aif, and load it onto your OP-1. Share your own when you're ready.</p>
              </div>
              <KnobGlyph index={dial} />
            </div>
            <span className="fork-cta">{libraryCta} <span aria-hidden="true">→</span></span>
          </Link>

          <Link
            className="fork-panel"
            to="/lab"
            onPointerEnter={lean("lab")}
            onPointerLeave={lean(null)}
            onPointerMove={scrubEnv}
            onFocus={lean("lab")}
            onBlur={lean(null)}
          >
            <div className="fork-head">
              <span className="fork-key">B</span>
              <span className="fork-eyebrow">Lab · for engineers</span>
            </div>
            <div className="fork-body">
              <div>
                <div className="fork-title">See how it thinks</div>
                <p className="fork-desc">Knob layouts for every engine, raw-to-display value mappings, and an inspector for the preset format</p>
              </div>
              <EnvGlyph pos={envPos} />
            </div>
            <span className="fork-cta">Open the lab <span aria-hidden="true">→</span></span>
          </Link>
        </div>
      </section>

      <div className="land-body">
        <Trending />

        <section className="land-section">
          <div className="land-section-head">
            <h2>Inside the lab</h2>
            <Link className="land-more" to="/lab">Open the lab →</Link>
          </div>
          <div className="lab-tiles">
            <a className="lab-tile" href="/lab/layout">
              <div className="lab-tile-head"><span className="lab-tile-name">Layout</span><span className="lab-tile-go" aria-hidden="true">→</span></div>
              <p className="lab-tile-desc">What every knob does, on every synth, FX, and LFO engine</p>
              <div className="lab-tile-preview knob-row" aria-label="Example: the fm engine's knobs">
                <span className="lab-tile-caption">fm</span>
                {FM_KNOBS.map((k, i) => (
                  <span className="knob-cell" key={k}><i className="knob-dot" style={{ transform: `rotate(${-90 + i * 55}deg)` }} />{k}</span>
                ))}
              </div>
            </a>
            <a className="lab-tile" href="/lab/mappings">
              <div className="lab-tile-head"><span className="lab-tile-name">Mappings</span><span className="lab-tile-go" aria-hidden="true">→</span></div>
              <p className="lab-tile-desc">How a raw value becomes the number on screen, by scale type</p>
              <div className="lab-tile-preview scale-row" aria-label="Scale types">
                {SCALE_TYPES.map(([k, label]) => <span key={k} className={`scale-chip chip-${k}`}>{label}</span>)}
              </div>
            </a>
            <a className="lab-tile" href="/lab/inspector">
              <div className="lab-tile-head"><span className="lab-tile-name">Inspector</span><span className="lab-tile-go" aria-hidden="true">→</span></div>
              <p className="lab-tile-desc">Open any preset and read back its envelope, knobs, FX, and LFO</p>
              <dl className="lab-tile-preview preset-ro" aria-label="Example: a sample preset">
                {SAMPLE_PRESET.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            </a>
          </div>
        </section>
      </div>
    </>
  )
}

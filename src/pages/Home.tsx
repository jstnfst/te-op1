import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { apiGet, type PatchSummary } from "../api"
import { DownloadCount } from "../like"
import { TYPES } from "../patchLists"
import { Scope, envLevel, ENV_STAGES, type ScopeHandle, type Side } from "../landing/Scope"
import { HeroShader } from "../landing/HeroShader"
import "../landing/landing.css"

// Real samples of what each Lab tool holds, previewed in the "Inside the lab"
// tiles. Like the hero's fork panels, pointer X across a tile picks a frame
// (the far left is ALL), and a click opens the page on that pick.

// Layout: the page's group filter, ALL first, each frame one real engine's
// first four knobs (public/layout-params.js, what the Layout page renders).
// [label, Layout page group (#hash), engine shown]
const LAYOUT_FRAMES: Array<[string, string, string]> = [
  ["all", "", "synth.fm"], ["synth", "synth", "synth.cluster"], ["envelope", "env", "adsr"], ["fx", "fx", "fx.delay"], ["lfo", "lfo", "lfo.element"],
]
const knobNames = (key: string) => (window.OP1_LAYOUT?.[key] ?? []).filter((n): n is string => !!n).slice(0, 4)

// Mappings: all eight scale types; frame 0 lights them all, then one each.
const SCALE_TYPES: Array<[string, string]> = [
  ["percent", "%"], ["centered", "centered %"], ["discrete", "discrete"], ["selector", "selector"],
  ["hz", "hz"], ["tempo", "tempo dial"], ["decimal", "decimal"], ["fixed", "fixed"],
]

// Inspector: the editor's init patch first (public/patch.html initPatch), then
// the library's popular patches; a click opens the one shown.
const INIT_READOUT: Array<[string, string]> = [["name", "init"], ["type", "digital"], ["fx", "delay"], ["lfo", "element"], ["octave", "0"]]
const readout = (p: PatchSummary): Array<[string, string]> =>
  [["name", p.name], ["type", p.type], ["fx", p.fx_type ?? "-"], ["lfo", p.lfo_type ?? "-"], ["octave", String(p.octave ?? 0)]]

/** Pointer X across a tile picks one of `n` frames, left to right; leaving
 * puts it back on frame 0. Touch and keyboard get frame 0 (ALL / init). */
function useScrub(n: number) {
  const [i, setI] = useState(0)
  const [on, setOn] = useState(false)
  const bind = {
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch" || n < 1) return
      const r = e.currentTarget.getBoundingClientRect()
      setOn(true)
      setI(Math.min(n - 1, Math.floor(Math.max(0, (e.clientX - r.left) / r.width) * n)))
    },
    onPointerLeave: () => { setI(0); setOn(false) },
  }
  return { i, on, bind }
}

/* The Mappings tile's tint: a rainbow of the scale colors laid across the
   tile, each color centred over the pointer zone that picks it (zone 0 is
   ALL). The rainbow never moves and always shows whole: at full strength
   under ALL, and with a picked scale its band stays full while the rest
   dips to RAINBOW_DIP. */
const RAINBOW_DIP = "rgba(0,0,0,.3)" // mask alpha for the colors not picked
const ZONES = SCALE_TYPES.length + 1
const scaleColor = (t: string) => (t === "fixed" ? "var(--knob-null)" : `var(--c-${t})`)
const RAINBOW = "linear-gradient(90deg, " + SCALE_TYPES.map(([t], k) =>
  `${scaleColor(t)} ${(((k + 1.5) / ZONES) * 100).toFixed(1)}%`).join(", ") + ")"
function rainbowStyle(i: number): CSSProperties {
  if (i === 0) return { "--rainbow": RAINBOW } as CSSProperties
  const a = (i / ZONES) * 100, b = ((i + 1) / ZONES) * 100
  return {
    "--rainbow": RAINBOW,
    "--rainbow-mask": `linear-gradient(90deg, ${RAINBOW_DIP} ${(a - 3).toFixed(1)}%, #000 ${a.toFixed(1)}%, #000 ${b.toFixed(1)}%, ${RAINBOW_DIP} ${(b + 3).toFixed(1)}%)`,
  } as CSSProperties
}

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
 * read-head follows the pointer. The label names the reference entry dialed. */
function EnvGlyph({ pos, label }: { pos: number; label: string }) {
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
      <span className="knob-label">{label}</span>
    </div>
  )
}

/** The library's most-liked patches: the Trending grid, and the Inspector tile's hover cycle. */
function usePopular() {
  const [items, setItems] = useState<PatchSummary[] | null>(null)
  useEffect(() => {
    apiGet<{ items: PatchSummary[] }>("/api/patches?sort=likes")
      .then((d) => setItems(d.items.slice(0, 8)))
      .catch(() => setItems([]))
  }, [])
  return items
}

function Trending({ items }: { items: PatchSummary[] | null }) {
  return (
    <section className="land-section">
      <div className="land-section-head">
        <h2>Popular in the library</h2>
        <Link className="land-more" to="/library?sort=likes">See all</Link>
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
            <a className="card" key={p.id} href={`/library/editor?id=${p.id}`}>
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
  const popular = usePopular()
  const layoutTile = useScrub(LAYOUT_FRAMES.length)
  const scaleTile = useScrub(SCALE_TYPES.length + 1)
  const inspectTile = useScrub(1 + (popular?.length ?? 0))
  const layoutHash = LAYOUT_FRAMES[layoutTile.i][1]
  const scalePick = scaleTile.i > 0 ? SCALE_TYPES[scaleTile.i - 1][0] : ""
  const inspected = inspectTile.i > 0 ? popular?.[inspectTile.i - 1] : undefined
  const [dial, setDial] = useState(0)
  const [envPos, setEnvPos] = useState(0.5)
  const navigate = useNavigate()
  // The Lab dial: the overview, then every entry of the knob layout reference
  // (public/layout-params.js, the same table the Layout page renders).
  const [labDial] = useState<Array<string | null>>(() => [null, ...Object.keys(window.OP1_LAYOUT ?? {})])
  const [labIdx, setLabIdx] = useState(0)
  const labKey = labDial[labIdx] ?? null
  useEffect(() => {
    scope.current?.setLabInfo(labKey, labKey ? window.OP1_LAYOUT?.[labKey] ?? [] : [])
  }, [labKey])
  const engine = DIAL[dial]
  const count = counts ? (engine === "all" ? counts.total : counts.byType[engine] ?? 0) : null

  // Keep the scope's engine trace + readouts in step with the knob.
  useEffect(() => { scope.current?.setEngine(engine, count) }, [engine, count])

  // Pointer X across the Library panel turns the knob, detent by detent.
  // Whatever is dialed when the visitor clicks is where the link goes.
  function turnKnob(e: PointerEvent<HTMLElement>) {
    if (e.pointerType === "touch") return
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width))
    setDial(Math.floor(x * DIAL.length))
  }
  // Pointer X across the Lab panel dials through the knob-layout reference
  // (overview first, then each entry): the scope draws that entry's parameter
  // array from a real preset, and the link opens its card on the Layout page.
  // The glyph's envelope read-head follows the pointer.
  function scrubEnv(e: PointerEvent<HTMLElement>) {
    if (e.pointerType === "touch") return
    const r = e.currentTarget.getBoundingClientRect()
    const u = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width))
    setEnvPos(u)
    setLabIdx(Math.floor(u * labDial.length))
  }
  const labHref = labKey ? `/lab/layout#${labKey}` : "/lab"
  const labCta = labKey ? `Open ${labKey} in the knob layout` : "Open the lab"
  const libraryHref = engine === "all" ? "/library" : `/library?type=${encodeURIComponent(engine)}`
  const libraryCta = engine === "all"
    ? (count === null || count === 0 ? "Browse patches" : count === 1 ? "Browse the only patch" : `Browse all ${count} patches`)
    : (count === null ? `Browse ${engine} patches` : count === 0 ? `No ${engine} patches yet` : `Browse ${count} ${engine} ${count === 1 ? "patch" : "patches"}`)

  // Motion is pointer-gated: the scope runs only while a mouse/pen is over
  // the hero. Touch and keyboard get the static end state (see Scope.setSide).
  const heroRef = useRef<HTMLElement>(null)
  function enter(e: PointerEvent) {
    if (e.pointerType === "mouse" || e.pointerType === "pen") scope.current?.activate(true)
  }
  function move(e: PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    scope.current?.setX((e.clientX - r.left) / r.width)
  }
  const lean = (side: Side) => () => scope.current?.setSide(side)
  // The scope's LIB / LAB links play their path the way the far left of its
  // fork panel does: the LED lights, and the dial goes to ALL (Library) or
  // the overview (Lab) - exactly where each link goes.
  function ledHover(side: Side) {
    if (side === "library") setDial(0)
    if (side === "lab") { setLabIdx(0); setEnvPos(0) }
    scope.current?.setSide(side)
  }

  return (
    <>
      <section
        ref={heroRef}
        className="hero"
        onPointerEnter={enter}
        onPointerMove={move}
        onPointerLeave={() => scope.current?.activate(false)}
      >
        <HeroShader host={heroRef} />
        <p className="eyebrow hero-eyebrow">OP-1 Field · community patches + format reference</p>
        <div className="hero-top">
          <div className="hero-copy">
            <h1 className="land-title">
              Patches for<br />your OP-1<br /><span className="land-title-sub">and how they work</span>
            </h1>
          </div>
          <Scope ref={scope} onLed={ledHover} />
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
                <p className="fork-desc">Community patches, ready to load onto your OP-1</p>
              </div>
              <KnobGlyph index={dial} />
            </div>
            <span className="fork-cta">{libraryCta}</span>
          </Link>

          {/* a plain link: the Layout page is static; /lab stays in the SPA */}
          <a
            className="fork-panel"
            href={labHref}
            onClick={(e) => { if (labHref === "/lab") { e.preventDefault(); navigate("/lab") } }}
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
              <EnvGlyph pos={envPos} label={labKey ?? "overview"} />
            </div>
            <span className="fork-cta">{labCta}</span>
          </a>
        </div>
      </section>

      <div className="land-body">
        <Trending items={popular} />

        <section className="land-section">
          <div className="land-section-head">
            <h2>Inside the lab</h2>
            <Link className="land-more" to="/lab">Open the lab</Link>
          </div>
          <div className="lab-tiles">
            <a className="lab-tile" href={"/lab/layout" + (layoutHash ? "#" + layoutHash : "")} {...layoutTile.bind}>
              <div className="lab-tile-head"><span className="lab-tile-name">Layout</span></div>
              <p className="lab-tile-desc">What every knob does, on every synth, FX, and LFO engine</p>
              {(() => {
                const [group, , key] = LAYOUT_FRAMES[layoutTile.i]
                return (
                  <div className="lab-tile-preview knob-row" aria-label={`Example: the ${key} knobs`}>
                    <span className="lab-tile-caption tile-filter">
                      {LAYOUT_FRAMES.map(([g]) => <span key={g} className={g === group ? "on" : undefined}>{g}</span>)}
                      <b>{key}</b>
                    </span>
                    {knobNames(key).map((k, i) => (
                      <span className="knob-cell" key={i}>
                        <i className="knob-dot" style={{ transform: `rotate(${-90 + i * 55 + layoutTile.i * 38}deg)` }} />{k}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </a>
            <a className={"lab-tile rainbow" + (scaleTile.on ? " lit" : "")} href={"/lab/mappings" + (scalePick ? "#" + scalePick : "")}
              style={rainbowStyle(scaleTile.i)} {...scaleTile.bind}>
              <div className="lab-tile-head"><span className="lab-tile-name">Mappings</span></div>
              <p className="lab-tile-desc">How a raw value becomes the number on screen, by scale type</p>
              {/* frame 0 is ALL (every chip lit), then one scale type per frame */}
              <div className={"lab-tile-preview scale-row" + (scaleTile.i > 0 ? " picking" : "")} aria-label="Scale types">
                {SCALE_TYPES.map(([k, label], n) => (
                  <span key={k} className={`scale-chip chip-${k}` + (scaleTile.i === n + 1 ? " on" : "")}>{label}</span>
                ))}
              </div>
            </a>
            <a className="lab-tile" href={inspected ? `/library/editor?id=${inspected.id}` : "/library/editor?new"} {...inspectTile.bind}>
              <div className="lab-tile-head"><span className="lab-tile-name">Inspector</span></div>
              <p className="lab-tile-desc">Open any preset and read back its envelope, knobs, FX, and LFO</p>
              <dl className="lab-tile-preview preset-ro" aria-label={inspected ? `A popular patch: ${inspected.name}` : "The init patch"}>
                {(inspected ? readout(inspected) : INIT_READOUT).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            </a>
          </div>
        </section>
      </div>
    </>
  )
}

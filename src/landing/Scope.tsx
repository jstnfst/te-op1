import { useEffect, useImperativeHandle, useRef, type Ref } from "react"

/** Which path the visitor is leaning toward, as read from the fork panel under the pointer. */
export type Side = "library" | "lab" | null

export interface ScopeHandle {
  /** Run the trace while the pointer is inside the hero; stopping eases it back to rest. */
  activate(on: boolean): void
  /** Pointer position across the hero, 0..1. Drives phase speed and the lab readout. */
  setX(x: number): void
  /** Lab morphs the trace into the stepped ADSR envelope; library/null keeps the engine wave. */
  setSide(side: Side): void
  /** Read-head position along the envelope, 0..1 (pointer X across the Lab panel). */
  setCursor(u: number): void
  /** The engine dialed on the Library knob ("all" = no filter). Crossfades the waveform. */
  setEngine(engine: string, count: number | null): void
}

const W = 600
const H = 220
const MID = H / 2
const AMP = 74
const POINTS = 260
const TAU = Math.PI * 2

/**
 * The ADSR shape shared by the Lab panel glyph and the scope's lab view.
 * Stage end points along u (0..1); level is 0..1. Illustrative, not a
 * particular patch.
 */
export const ENV_STAGES: Array<[string, number]> = [["attack", 0.16], ["decay", 0.36], ["sustain", 0.72], ["release", 1]]
const SUSTAIN = 0.55
export function envLevel(u: number) {
  if (u < 0.16) return u / 0.16
  if (u < 0.36) return 1 - ((u - 0.16) / 0.2) * (1 - SUSTAIN)
  if (u < 0.72) return SUSTAIN
  return Math.max(0, SUSTAIN * (1 - (u - 0.72) / 0.28))
}
export const envStage = (u: number) => ENV_STAGES.find(([, end]) => u < end)?.[0] ?? "release"
// The scope reads the envelope back as raw 16-bit integers: held per column
// and snapped to coarse levels so the steps are visible at this scale.
const ENV_COLS = 48
const ENV_LEVELS = 24
const heldU = (u: number) => Math.min(1, (Math.floor(u * ENV_COLS) + 0.5) / ENV_COLS)
const envRaw = (u: number) => Math.round((Math.round(envLevel(heldU(u)) * ENV_LEVELS) / ENV_LEVELS) * 32767)
const ENV_TOP = 0.92, ENV_BOTTOM = -0.92
const envV = (raw: number) => ENV_BOTTOM + (raw / 32767) * (ENV_TOP - ENV_BOTTOM)

type Wave = (u: number, p: number) => number
const tri = (x: number) => 2 * Math.abs(2 * (x - Math.floor(x + 0.5))) - 1
const saw = (x: number) => 2 * (x - Math.floor(x + 0.5))
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1 }

/**
 * One characteristic trace per engine. Stylized pictures of each engine's
 * character for the landing scope, not renders of its actual output.
 * u is 0..1 across the screen (two cycles), p is the running phase.
 */
const WAVES: Record<string, Wave> = {
  all:       (u, p) => Math.sin(u * TAU * 2 + p) * 0.72 + Math.sin(u * TAU * 5 + p * 1.7) * 0.18,
  amp:       (u, p) => Math.tanh(2.6 * Math.sin(u * TAU * 2 + p)) * 0.85,
  cluster:   (u, p) => (Math.sin(u * TAU * 2 + p) + Math.sin(u * TAU * 2.12 + p * 1.1) + Math.sin(u * TAU * 1.9 + p * 0.9)) * 0.3,
  dbox:      (u, p) => Math.sin(u * TAU * 6 + p * 2) * Math.exp(-((u * 2) % 1) * 4.5) * 0.95,
  digital:   (u, p) => Math.round(Math.sin(Math.floor(u * 48) / 48 * TAU * 2 + p) * 3) / 3 * 0.85,
  dimension: (u, p) => (saw(u * 2 + p / TAU) + saw(u * 2.04 + p / TAU)) * 0.42,
  dna:       (u, p) => Math.sin(u * TAU * 2 + p) * 0.6 + hash(Math.floor(u * 90) + Math.floor(p * 6)) * 0.22,
  drwave:    (u, p) => Math.sin(2.8 * Math.sin(u * TAU * 2 + p)) * 0.85,
  dsynth:    (u, p) => saw(u * 2 + p / TAU) * 0.5 + Math.sign(Math.sin(u * TAU * 4 + p)) * 0.3,
  fm:        (u, p) => Math.sin(u * TAU * 2 + p + 2.4 * Math.sin(u * TAU * 6 + p * 2)) * 0.85,
  phase:     (u, p) => { const x = ((u * 2 + p / TAU) % 1 + 1) % 1; return Math.sin(TAU * (x < 0.3 ? x / 0.6 : 0.5 + (x - 0.3) / 1.4)) * 0.85 },
  pulse:     (u, p) => (((u * 2 + p / TAU) % 1 + 1) % 1 < 0.28 ? 0.8 : -0.8),
  sampler:   (u, p) => (Math.sin(u * TAU * 11 + p * 3) * 0.5 + Math.sin(u * TAU * 23 + p * 5) * 0.3) * Math.sin(u * Math.PI) * (0.7 + 0.3 * Math.sin(u * TAU * 2 + p)),
  string:    (u, p) => saw(u * 8 + p / TAU) * Math.exp(-((u * 2) % 1) * 2.8) * 0.9,
  vocoder:   (u, p) => Math.sin(u * TAU * 14 + p * 3) * (0.35 + 0.5 * Math.abs(Math.sin(u * TAU * 2 + p * 0.5))),
  voltage:   (u, p) => tri(u * 2 + p / TAU) * 0.85,
}
const ENGINES = Object.keys(WAVES)

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * The landing hero's oscilloscope. Still at rest; it only animates while
 * the parent reports the pointer inside the hero (activate(true)), then
 * eases to a stop. Never animates under prefers-reduced-motion (changes
 * still land, as a single redraw). Frames write the path and readouts
 * straight to the DOM, so React never re-renders per frame.
 */
export function Scope({ ref }: { ref: Ref<ScopeHandle> }) {
  const pathRef = useRef<SVGPathElement>(null)
  const glowRef = useRef<SVGPathElement>(null)
  const figRef = useRef<HTMLElement>(null)
  const cursorRef = useRef<SVGGElement>(null)
  const cursorLineRef = useRef<SVGLineElement>(null)
  const cursorDotRef = useRef<SVGCircleElement>(null)
  const ro = [useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null)]
  const rv = [useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null)]

  const s = useRef({
    active: false, raf: 0, last: 0,
    phase: 0, speed: 0, morph: 0, target: 0, x: 0.5, cursor: 0.5,
    side: null as Side,
    engine: "all", count: null as number | null,
    // crossfade weight per engine; the dialed one eases to 1, the rest to 0
    weights: Object.fromEntries(ENGINES.map((e) => [e, e === "all" ? 1 : 0])) as Record<string, number>,
  })

  function sample(u: number) {
    const st = s.current
    let v = 0
    for (const e of ENGINES) { const w = st.weights[e]; if (w > 0.001) v += WAVES[e](u, st.phase) * w }
    return v
  }

  function readouts(): Array<[string, string]> {
    const st = s.current
    if (st.side === "lab") {
      const raw = envRaw(st.cursor)
      return [["stage", envStage(st.cursor)], ["raw", String(raw)], ["display (%)", `${Math.round((raw / 32767) * 100)}%`]]
    }
    const n = st.count
    return [
      ["engine", st.engine === "all" ? "all engines" : st.engine],
      ["patches", n === null ? "–" : String(n)],
    ]
  }

  function draw() {
    const st = s.current
    let d = ""
    for (let i = 0; i <= POINTS; i++) {
      const u = i / POINTS
      // morph 0 = the dialed engine's wave, 1 = the stepped ADSR envelope
      const wave = st.morph < 0.999 ? sample(u) : 0
      const v = Math.max(-1.25, Math.min(1.25, wave + (envV(envRaw(u)) - wave) * st.morph))
      d += (i === 0 ? "M" : "L") + (u * W).toFixed(1) + " " + (MID - v * AMP).toFixed(1)
    }
    pathRef.current?.setAttribute("d", d)
    glowRef.current?.setAttribute("d", d)
    // read-head on the envelope, fading in with the lab morph
    const cx = (heldU(st.cursor) * W).toFixed(1)
    const cy = (MID - envV(envRaw(st.cursor)) * AMP).toFixed(1)
    cursorRef.current?.setAttribute("opacity", Math.max(0, (st.morph - 0.5) * 2).toFixed(2))
    cursorLineRef.current?.setAttribute("x1", cx)
    cursorLineRef.current?.setAttribute("x2", cx)
    cursorDotRef.current?.setAttribute("cx", cx)
    cursorDotRef.current?.setAttribute("cy", cy)
    // which path LED is lit (CSS keys off data-side)
    if (figRef.current) figRef.current.dataset.side = s.current.side ?? ""
    const rows = readouts()
    ro.forEach((r, i) => {
      const slot = r.current?.parentElement
      if (slot) slot.hidden = i >= rows.length
      if (i >= rows.length) return
      r.current!.textContent = rows[i][0]
      rv[i].current!.textContent = rows[i][1]
    })
  }

  function weightsSettled() {
    const st = s.current
    return ENGINES.every((e) => Math.abs(st.weights[e] - (e === st.engine ? 1 : 0)) < 0.004)
  }

  function frame(t: number) {
    const st = s.current
    const dt = st.last ? Math.min(0.05, (t - st.last) / 1000) : 0
    st.last = t
    const targetSpeed = st.active ? 1.2 + st.x * 1.8 : 0
    st.speed += (targetSpeed - st.speed) * Math.min(1, dt * 5)
    st.morph += (st.target - st.morph) * Math.min(1, dt * 7)
    const kw = Math.min(1, dt * 9)
    for (const e of ENGINES) st.weights[e] += ((e === st.engine ? 1 : 0) - st.weights[e]) * kw
    st.phase += st.speed * dt
    draw()
    const settled = !st.active && st.speed < 0.02 && Math.abs(st.target - st.morph) < 0.005 && weightsSettled()
    if (settled) { st.raf = 0; st.last = 0; return }
    st.raf = requestAnimationFrame(frame)
  }

  function ensureRunning() {
    const st = s.current
    if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(frame) }
  }

  /** Animate toward the new target while a pointer session runs; otherwise land on it in one redraw. */
  function settleOrAnimate() {
    const st = s.current
    if (st.active && !reducedMotion()) { ensureRunning(); return }
    st.morph = st.target
    for (const e of ENGINES) st.weights[e] = e === st.engine ? 1 : 0
    draw()
  }

  useImperativeHandle(ref, () => ({
    activate(on) {
      const st = s.current
      if (reducedMotion()) return
      st.active = on
      if (!on) { st.side = null; st.target = 0 }
      ensureRunning()
    },
    setX(x) {
      s.current.x = Math.max(0, Math.min(1, x))
      if (!s.current.raf) draw()
    },
    setSide(side) {
      const st = s.current
      st.side = side
      st.target = side === "lab" ? 1 : 0
      settleOrAnimate()
    },
    setCursor(u) {
      s.current.cursor = Math.max(0, Math.min(0.999, u))
      if (!s.current.raf) draw()
    },
    setEngine(engine, count) {
      const st = s.current
      st.count = count
      if (engine === st.engine || !WAVES[engine]) { if (!st.raf) draw(); return }
      st.engine = engine
      settleOrAnimate()
    },
  }))

  useEffect(() => {
    draw()
    const st = s.current
    return () => { if (st.raf) cancelAnimationFrame(st.raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grid = []
  for (let i = 1; i < 12; i++) grid.push(<line key={"v" + i} x1={(W / 12) * i} y1={0} x2={(W / 12) * i} y2={H} />)
  for (let i = 1; i < 4; i++) grid.push(<line key={"h" + i} x1={0} y1={(H / 4) * i} x2={W} y2={(H / 4) * i} />)

  return (
    <figure className="scope" aria-hidden="true" ref={figRef}>
      <div className="scope-bar">
        <span className="scope-leds">
          <span className="scope-led led-library">lib</span>
          <span className="scope-led led-lab">lab</span>
        </span>
      </div>
      <svg className="scope-screen" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <g className="scope-grid">{grid}</g>
        <line className="scope-axis" x1={0} y1={MID} x2={W} y2={MID} />
        <path ref={glowRef} className="scope-glow" />
        <path ref={pathRef} className="scope-trace" />
        <g ref={cursorRef} className="scope-cursor" opacity="0">
          <line ref={cursorLineRef} y1={0} y2={H} />
          <circle ref={cursorDotRef} r={4} />
        </g>
      </svg>
      <div className="scope-readout">
        {ro.map((r, i) => (
          <span className="ro" key={i}><span ref={r} /><b ref={rv[i]} /></span>
        ))}
      </div>
    </figure>
  )
}

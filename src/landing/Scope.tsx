import { useEffect, useImperativeHandle, useRef, type Ref } from "react"
import { Link } from "react-router-dom"
import { LAYOUT_SAMPLES } from "./layoutSamples"

/** Which path the visitor is leaning toward, as read from the fork panel under the pointer. */
export type Side = "library" | "lab" | null

export interface ScopeHandle {
  /** Run the trace while the pointer is inside the hero; stopping eases it back to rest. */
  activate(on: boolean): void
  /** Pointer position across the hero, 0..1. Drives phase speed. */
  setX(x: number): void
  /** Lights that path's LED. Lab morphs the trace into the 8-slot parameter
   * array, Library back to the engine wave; null (pointer gone) only drops the
   * LED and keeps whichever view was last shown. */
  setSide(side: Side): void
  /** The layout entry dialed on the Lab panel (null = Lab overview), with its
   * slot names by array index (null = unused slot). */
  setLabInfo(key: string | null, names: Array<string | null>): void
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
 * The ADSR shape drawn by the Lab panel glyph (Home.tsx). Stage end points
 * along u (0..1); level is 0..1. Illustrative, not a particular patch.
 */
export const ENV_STAGES: Array<[string, number]> = [["attack", 0.16], ["decay", 0.36], ["sustain", 0.72], ["release", 1]]
const SUSTAIN = 0.55
export function envLevel(u: number) {
  if (u < 0.16) return u / 0.16
  if (u < 0.36) return 1 - ((u - 0.16) / 0.2) * (1 - SUSTAIN)
  if (u < 0.72) return SUSTAIN
  return Math.max(0, SUSTAIN * (1 - (u - 0.72) / 0.28))
}

/* ── Lab view: the parameter array ──
   Every engine, FX, LFO and the envelope store their knobs as one fixed
   8-element array of signed 16-bit integers. The Lab view draws that array
   as a stepped trace: one column per slot, height = the raw value from a
   real preset (layoutSamples.ts), the dashed axis = 0. Dialing another entry
   eases each column to its new value, so the picture reshapes rather than
   cuts. */
const SLOTS = 8
const slotV = (raw: number) => (raw / 32768) * 0.92
const slotOf = (u: number) => Math.min(SLOTS - 1, Math.floor(u * SLOTS))
const SAMPLE_KEYS = Object.keys(LAYOUT_SAMPLES)
// Lab overview: the mean of every sampled entry, slot by slot
const OVERVIEW_RAW = Array.from({ length: SLOTS }, (_, i) =>
  Math.round(SAMPLE_KEYS.reduce((sum, k) => sum + LAYOUT_SAMPLES[k].raw[i], 0) / SAMPLE_KEYS.length))
/** Every sampled entry's stepped array as one faint backdrop path (static). */
const LAB_GHOSTS = SAMPLE_KEYS.map((k) => {
  const raw = LAYOUT_SAMPLES[k].raw
  let d = ""
  for (let i = 0; i < SLOTS; i++) {
    const y = (MID - slotV(raw[i]) * AMP).toFixed(1)
    d += (i === 0 ? "M0 " : "L" + ((i * W) / SLOTS).toFixed(1) + " ") + y + "L" + (((i + 1) * W) / SLOTS).toFixed(1) + " " + y
  }
  return d
}).join("")

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
// the faint all-engines backdrop needs less resolution than the lit trace
const GHOST_POINTS = 120

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * The landing hero's oscilloscope. Two views: Library draws the dialed
 * engine's wave over a faint field of every engine; Lab draws the dialed
 * layout entry's 8-slot parameter array over a faint field of every entry.
 * Still at rest; it only animates while the parent reports the pointer inside
 * the hero (activate(true)), then eases to a stop and holds the last view.
 * Never animates under prefers-reduced-motion (changes still land, as a
 * single redraw). Frames write the paths and readouts straight to the DOM,
 * so React never re-renders per frame.
 */
/** `onLed`: the pointer (or focus) is on the LIB / LAB link, or left it (null). */
export function Scope({ ref, onLed }: { ref: Ref<ScopeHandle>; onLed?: (side: Side) => void }) {
  const pathRef = useRef<SVGPathElement>(null)
  const glowRef = useRef<SVGPathElement>(null)
  const figRef = useRef<HTMLElement>(null)
  const waveGhostRef = useRef<SVGPathElement>(null)
  const labGhostRef = useRef<SVGPathElement>(null)
  const waveGridRef = useRef<SVGGElement>(null)
  const slotGridRef = useRef<SVGGElement>(null)
  const headRef = useRef<SVGRectElement>(null)
  const slotsRef = useRef<HTMLDivElement>(null)
  const ro = [useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null)]
  const rv = [useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null)]

  const s = useRef({
    active: false, raf: 0, last: 0,
    phase: 0, speed: 0, morph: 0, target: 0, x: 0.5,
    labKey: null as string | null, labNames: [] as Array<string | null>,
    // the parameter array on screen, easing toward slotTarget
    slots: [...OVERVIEW_RAW], slotTarget: [...OVERVIEW_RAW],
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

  /** The slot under the read-head, which sweeps the array like a sequencer playhead while the pointer is in. */
  const headSlot = () => slotOf((((s.current.phase / 8) % 1) + 1) % 1)

  function readouts(): Array<[string, string]> {
    const st = s.current
    if (st.target === 1) {
      // real reference data: the dialed entry, the preset its values come
      // from, and the slot under the read-head
      if (!st.labKey) return [["layout", `${SAMPLE_KEYS.length + 1} entries`], ["array", "8 × int16"], ["shown", "mean of all"]]
      const sample = LAYOUT_SAMPLES[st.labKey]
      const i = headSlot()
      const name = st.labNames[i]
      return [
        ["layout", st.labKey],
        ["preset", sample ? sample.from : "none on hand"],
        [`slot ${i}`, name ? (sample ? `${name} = ${sample.raw[i]}` : name) : "unused"],
      ]
    }
    const n = st.count
    return [
      ["engine", st.engine === "all" ? "all engines" : st.engine],
      ["patches", n === null ? "–" : String(n)],
    ]
  }

  function draw() {
    // a late call (pointer/blur events, a last frame) after unmount: nothing to draw into
    if (!figRef.current) return
    const st = s.current
    let d = ""
    for (let i = 0; i <= POINTS; i++) {
      const u = i / POINTS
      // morph 0 = the dialed engine's wave, 1 = the stepped parameter array
      const wave = st.morph < 0.999 ? sample(u) : 0
      const v = Math.max(-1.25, Math.min(1.25, wave + (slotV(st.slots[slotOf(u)]) - wave) * st.morph))
      d += (i === 0 ? "M" : "L") + (u * W).toFixed(1) + " " + (MID - v * AMP).toFixed(1)
    }
    pathRef.current?.setAttribute("d", d)
    glowRef.current?.setAttribute("d", d)
    // backdrops: every engine's wave behind the Library view, every sampled
    // array behind the Lab view; they trade places with the morph
    const wm = 1 - st.morph
    if (wm > 0.01) {
      let g = ""
      for (const e of ENGINES) {
        if (e === "all") continue
        for (let i = 0; i <= GHOST_POINTS; i++) {
          const u = i / GHOST_POINTS
          g += (i === 0 ? "M" : "L") + (u * W).toFixed(1) + " " + (MID - WAVES[e](u, st.phase) * AMP).toFixed(1)
        }
      }
      waveGhostRef.current?.setAttribute("d", g)
    }
    waveGhostRef.current?.setAttribute("opacity", wm.toFixed(2))
    // the overview has no lit entry, so its field carries the picture
    labGhostRef.current?.setAttribute("opacity", (st.morph * (st.labKey ? 0.6 : 1)).toFixed(2))
    waveGridRef.current?.setAttribute("opacity", wm.toFixed(2))
    slotGridRef.current?.setAttribute("opacity", st.morph.toFixed(2))
    // read-head column, and the slot strip under the screen
    const hs = headSlot()
    headRef.current?.setAttribute("x", ((hs * W) / SLOTS).toFixed(1))
    headRef.current?.setAttribute("opacity", (st.labKey ? st.morph : 0).toFixed(2))
    const strip = slotsRef.current
    if (strip) {
      strip.style.opacity = st.morph.toFixed(2)
      const sample = st.labKey ? LAYOUT_SAMPLES[st.labKey] : undefined
      for (let i = 0; i < SLOTS; i++) {
        const cell = strip.children[i] as HTMLElement
        const name = st.labKey ? st.labNames[i] ?? null : null
        cell.classList.toggle("off", !!st.labKey && !name)
        cell.classList.toggle("on", !!st.labKey && i === hs)
        const label = st.labKey ? (name ?? "unused") : "mean"
        const value = st.labKey ? (name && sample ? String(sample.raw[i]) : "–") : String(OVERVIEW_RAW[i])
        if (cell.children[1].textContent !== label) cell.children[1].textContent = label
        if (cell.children[2].textContent !== value) cell.children[2].textContent = value
      }
    }
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

  function settled() {
    const st = s.current
    return ENGINES.every((e) => Math.abs(st.weights[e] - (e === st.engine ? 1 : 0)) < 0.004)
      && st.slots.every((v, i) => Math.abs(v - st.slotTarget[i]) < 40)
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
    for (let i = 0; i < SLOTS; i++) st.slots[i] += (st.slotTarget[i] - st.slots[i]) * kw
    st.phase += st.speed * dt
    draw()
    if (!st.active && st.speed < 0.02 && Math.abs(st.target - st.morph) < 0.005 && settled()) {
      st.raf = 0; st.last = 0; return
    }
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
    if (st.raf) return // still easing to a stop; the running loop picks up the new target
    st.morph = st.target
    for (const e of ENGINES) st.weights[e] = e === st.engine ? 1 : 0
    st.slots = [...st.slotTarget]
    draw()
  }

  useImperativeHandle(ref, () => ({
    activate(on) {
      const st = s.current
      if (reducedMotion()) return
      // leaving keeps the last view: it eases to a stop and holds there
      st.active = on
      if (!on) st.side = null
      ensureRunning()
    },
    setX(x) {
      s.current.x = Math.max(0, Math.min(1, x))
      if (!s.current.raf) draw()
    },
    setSide(side) {
      const st = s.current
      st.side = side
      if (side === null) { if (!st.raf) draw(); return }
      st.target = side === "lab" ? 1 : 0
      settleOrAnimate()
    },
    setLabInfo(key, names) {
      const st = s.current
      st.labKey = key
      st.labNames = names
      const sample = key ? LAYOUT_SAMPLES[key] : undefined
      st.slotTarget = key ? Array.from({ length: SLOTS }, (_, i) => (sample ? sample.raw[i] : 0)) : [...OVERVIEW_RAW]
      settleOrAnimate()
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
  for (let i = 1; i < 4; i++) grid.push(<line key={"h" + i} x1={0} y1={(H / 4) * i} x2={W} y2={(H / 4) * i} />)
  const waveGrid = []
  for (let i = 1; i < 12; i++) waveGrid.push(<line key={i} x1={(W / 12) * i} y1={0} x2={(W / 12) * i} y2={H} />)
  const slotGrid = []
  for (let i = 1; i < SLOTS; i++) slotGrid.push(<line key={i} x1={(W / SLOTS) * i} y1={0} x2={(W / SLOTS) * i} y2={H} />)

  return (
    <figure className="scope" ref={figRef}>
      {/* the two LEDs double as the two paths' front doors */}
      <div className="scope-bar">
        <nav className="scope-leds" aria-label="Paths">
          {(["library", "lab"] as const).map((side) => (
            <Link key={side} className={`scope-led led-${side}`} to={"/" + side}
              onPointerEnter={() => onLed?.(side)} onPointerLeave={() => onLed?.(null)}
              onFocus={() => onLed?.(side)} onBlur={() => onLed?.(null)}>
              {side === "library" ? "lib" : "lab"}
            </Link>
          ))}
        </nav>
      </div>
      <div className="scope-screen-wrap" aria-hidden="true">
        <svg className="scope-screen" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <g className="scope-grid">{grid}</g>
          <g ref={waveGridRef} className="scope-grid">{waveGrid}</g>
          <g ref={slotGridRef} className="scope-grid" opacity="0">{slotGrid}</g>
          <rect ref={headRef} className="scope-head" y={0} width={W / SLOTS} height={H} opacity="0" />
          <line className="scope-axis" x1={0} y1={MID} x2={W} y2={MID} />
          <path ref={waveGhostRef} className="scope-ghost" />
          <path ref={labGhostRef} className="scope-ghost lab" d={LAB_GHOSTS} opacity="0" />
          <path ref={glowRef} className="scope-glow" />
          <path ref={pathRef} className="scope-trace" />
        </svg>
        {/* the array's slots along the bottom of the screen: index, name, raw value */}
        <div className="scope-slots" ref={slotsRef} style={{ opacity: 0 }}>
          {Array.from({ length: SLOTS }, (_, i) => (
            <span className="slot" key={i}><i>{i}</i><span /><b /></span>
          ))}
        </div>
      </div>
      <div className="scope-readout" aria-hidden="true">
        {ro.map((r, i) => (
          <span className="ro" key={i}><span ref={r} /><b ref={rv[i]} /></span>
        ))}
      </div>
    </figure>
  )
}

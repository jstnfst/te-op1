import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useAuth } from "../auth"
import "./lab.css"

// The Lab home joins the two reference tables into one map: the knob layout
// (public/layout-params.js: which parameter sits at each array index) and the
// value mappings (public/mapping-data.js: how that slot's raw value displays).
// Both tables are the same ones the Layout and Mappings pages render.

type Sample = [number, number | string]
type Slot = { idx: number; name: string | null; type: string | null; samples: Sample[]; info: string }
type Engine = { key: string; group: string; label: string; slots: Slot[] }

const GROUPS: Array<[string, string]> = [["synth", "Synth"], ["env", "Envelope"], ["fx", "FX"], ["lfo", "LFO"]]
const groupOf = (key: string) => (key === "adsr" || key === "dbox.dyna_env" ? "env" : key.split(".")[0])
/** "4–7" (a run of firmware constants) covers index i */
const inRun = (run: string, i: number) => {
  const [a, b] = run.split(/[–-]/).map(Number)
  return i >= a && i <= b
}

function buildEngines(): Engine[] {
  const layout = window.OP1_LAYOUT ?? {}
  const rows = window.OP1_MAPPINGS ?? []
  const engines = Object.entries(layout).map(([key, names]) => ({
    key,
    group: groupOf(key),
    label: key.includes(".") ? key.slice(key.indexOf(".") + 1) : key,
    slots: Array.from({ length: 8 }, (_, i): Slot => {
      const row = rows.find((r) => r[0] === key && r[1] === i)
        ?? rows.find((r) => r[0] === key && typeof r[1] === "string" && inRun(r[1], i))
      const samples = row ? [...row[4]].sort((a, b) => a[0] - b[0]) : []
      return { idx: i, name: names[i] ?? null, type: row?.[3] ?? null, samples, info: row?.[5] ?? "" }
    }),
  }))
  // grouped for the map, keeping each group in the layout table's order
  return GROUPS.flatMap(([g]) => engines.filter((e) => e.group === g))
}

const DEFAULT = { e: "adsr", i: 4 }

/** OP-1 Field firmware the references are built against, and the device bugs
 * found along the way, each with what a preset file can do about it. */
const FIRMWARE = "1.7.3"
const FIRMWARE_ISSUES: Array<{ title: string; what: string; fix: string }> = [
  {
    title: "Random LFO forgets its destination",
    what: "Presets saved on the device with the random LFO load with DESTINATION set to fx, whatever was chosen when saving. The value the device writes at lfo_params index 2 doesn't follow the selection.",
    fix: "Write DESTINATION at index 2 yourself: 1024 synth, 2144 envelope, 4160 fx, 7168 mix. Presets written this way load with the right destination; the patch editor and mondo both do this.",
  },
  {
    title: "Keys out of order are dropped without an error",
    what: "The preset parser reads the JSON keys in alphabetical order only. A preset with its keys in any other order still loads, but without its synth engine, FX and LFO types.",
    fix: "Keep the keys sorted: adsr, fx_active, fx_params, fx_type, knobs, lfo_active, lfo_params, lfo_type, mtime, name, octave, synth_version, type. The patch editor re-sorts them on save.",
  },
]

/** /lab - the front door of the LAB path: the preset format, mapped. */
export default function Lab() {
  const { user } = useAuth()
  const engines = useMemo(buildEngines, [])
  const scales = window.OP1_SCALES ?? {}
  const [params, setParams] = useSearchParams()

  const pick = (key: string | null, i: number) => {
    const e = engines.find((x) => x.key === key)
    return e ? { e, slot: e.slots[Math.max(0, Math.min(7, i))] } : null
  }
  const pinned = pick(params.get("e"), Number(params.get("i") ?? 0))
    ?? pick(DEFAULT.e, DEFAULT.i)
    ?? (engines[0] ? { e: engines[0], slot: engines[0].slots[0] } : null)
  const [hover, setHover] = useState<{ key: string; i: number } | null>(null)
  const shown = (hover && pick(hover.key, hover.i)) || pinned
  const [only, setOnly] = useState<string | null>(null)
  const panel = useRef<HTMLElement>(null)

  function select(key: string, i: number, fromMap = false) {
    setParams({ e: key, i: String(i) }, { replace: true })
    // stacked layout: the panel sits above the map, bring it back into view
    if (fromMap && window.matchMedia("(max-width: 900px)").matches) {
      const r = panel.current?.getBoundingClientRect()
      if (r && r.top < 0) panel.current?.scrollIntoView({ block: "start" })
    }
  }

  // counts for the stats line and the legend: shared with Layout and Mappings
  const stats = window.OP1_STATS ?? { engines: 0, namedSlots: 0, fixedSlots: 0, slots: 0, scaleTypes: 0, byType: {} }
  const legend = Object.entries(scales)
    .filter(([k]) => k !== "fixed" && stats.byType[k])
    .sort((a, b) => (stats.byType[b[0]] ?? 0) - (stats.byType[a[0]] ?? 0))

  // Arrow keys walk the map (roving tabindex: only the pinned cell is tabbable).
  function onKey(ev: KeyboardEvent<HTMLDivElement>) {
    if (!pinned) return
    const row = engines.indexOf(pinned.e)
    let r = row, c = pinned.slot.idx
    if (ev.key === "ArrowUp") r--
    else if (ev.key === "ArrowDown") r++
    else if (ev.key === "ArrowLeft") c--
    else if (ev.key === "ArrowRight") c++
    else return
    ev.preventDefault()
    r = Math.max(0, Math.min(engines.length - 1, r))
    c = Math.max(0, Math.min(7, c))
    select(engines[r].key, c)
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`[data-cell="${engines[r].key}:${c}"]`)?.focus())
  }

  return (
    <div className="labhome">
      <header className="lab-hero">
        <div>
          <p className="eyebrow">Lab</p>
          <h1 className="hero-title">How the OP-1 thinks</h1>
          <p className="lead">
            An OP-1 Field preset is an AIFF-C file with a JSON blob inside: the synth engine, one
            envelope, one FX, and one LFO, each stored as 16-bit integers in fixed 8-element arrays.
            Teenage Engineering never documented that blob. The Lab does.
          </p>
        </div>
        <dl className="lab-stats" aria-label="Coverage">
          <div><dt>engines</dt><dd>{stats.engines}</dd></div>
          <div><dt>named slots</dt><dd>{stats.namedSlots}</dd></div>
          <div><dt>scale types</dt><dd>{stats.scaleTypes}</dd></div>
        </dl>
      </header>

      <section className="fmap-section" aria-labelledby="fmap-h">
        <div className="fmap-head">
          <h2 id="fmap-h">Format map</h2>
          <p className="fmap-how">
            One row per engine, one column per array index. Color is how the slot's raw value maps
            to the screen. <span className="fine-only">Hover to read a slot, click to pin it.</span>
            <span className="coarse-only">Tap a slot to read it.</span>
          </p>
        </div>

        <div className="fmap-legend" role="group" aria-label="Show one scale type">
          {legend.map(([k, m]) => (
            <button key={k} type="button" className={`fmap-key s-${k}`} aria-pressed={only === k}
              onClick={() => setOnly(only === k ? null : k)} title={m.desc}>
              <i aria-hidden="true" />{m.label}<span className="fmap-key-n">{stats.byType[k]}</span>
            </button>
          ))}
          <span className="fmap-key-static"><i className="fixed" aria-hidden="true" />fixed</span>
          <span className="fmap-key-static"><i className="unused" aria-hidden="true" />unused</span>
        </div>

        <div className="fmap-body">
          <div className={"fmap" + (only ? " filtering" : "")} role="grid" aria-label="Every engine's eight array slots, colored by scale type"
            onKeyDown={onKey} onPointerLeave={() => setHover(null)}>
            <div className="fmap-row fmap-cols" role="row">
              <span className="fmap-label" role="columnheader">index</span>
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} role="columnheader" className={shown?.slot.idx === i ? "on" : undefined}>{i}</span>
              ))}
            </div>
            {GROUPS.map(([g, title]) => {
              const rows = engines.filter((e) => e.group === g)
              if (!rows.length) return null
              return (
                <div className="fmap-group" role="rowgroup" key={g}>
                  <div className="fmap-group-title" role="row"><span role="rowheader">{title} <b>{rows.length}</b></span></div>
                  {rows.map((e) => (
                    <div role="row" key={e.key}
                      className={"fmap-row" + (shown?.e === e ? " on" : "") + (pinned?.e === e ? " pinned" : "")}>
                      <span className="fmap-label" role="rowheader">{e.label}</span>
                      {e.slots.map((s) => {
                        const isPinned = pinned?.e === e && pinned.slot === s
                        const kind = s.name ? s.type ?? "unknown" : s.type === "fixed" ? "fixed" : "unused"
                        return (
                          <span role="gridcell" key={s.idx}>
                            <button type="button" data-cell={`${e.key}:${s.idx}`}
                              className={`fmap-cell s-${kind}` + (isPinned ? " pinned" : "") + (only && kind !== only ? " dim" : "")}
                              tabIndex={isPinned ? 0 : -1}
                              aria-pressed={isPinned}
                              aria-label={`${e.key} ${s.idx}: ${s.name ?? (kind === "fixed" ? "fixed constant" : "unused")}${s.name && s.type ? `, ${scales[s.type]?.label ?? s.type}` : ""}`}
                              onPointerEnter={(ev) => ev.pointerType !== "touch" && setHover({ key: e.key, i: s.idx })}
                              onClick={() => select(e.key, s.idx, true)} />
                          </span>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {shown && pinned && (
            <SlotPanel key={`${shown.e.key}:${shown.slot.idx}`} panelRef={panel} engine={shown.e} slot={shown.slot} preview={shown.e !== pinned.e || shown.slot !== pinned.slot}
              onSlot={(i) => select(shown.e.key, i)} />
          )}
        </div>
      </section>

      <section className="lab-tools-sec" aria-labelledby="tools-h">
        <h2 id="tools-h">Full references</h2>
        <ul className="lab-toolrows">
          <li><a href={shown ? `/lab/layout#${shown.e.key}` : "/lab/layout"}>
            <span className="lab-tool-n">01</span><b>Knob layout</b>
            <span>Every engine as a card: the named parameter behind each array index</span><i aria-hidden="true">→</i></a></li>
          <li><a href={shown ? `/lab/mappings#${shown.e.key}` : "/lab/mappings"}>
            <span className="lab-tool-n">02</span><b>Value mappings</b>
            <span>The full table: every slot's scale type, sample points, and range notes</span><i aria-hidden="true">→</i></a></li>
          <li><a href="/lab/inspector">
            <span className="lab-tool-n">03</span><b>Patch inspector</b>
            <span>Load any preset and read it back: ADSR, knobs, FX, LFO, and the raw values behind them</span><i aria-hidden="true">→</i></a></li>
        </ul>
      </section>

      <section className="lab-tools-sec" aria-labelledby="fw-h">
        <h2 id="fw-h">Firmware known issues</h2>
        <p className="muted lab-issues">Device bugs in OP-1 Field firmware {FIRMWARE} that affect preset files, and how to work around them.</p>
        <ul className="fw-issues">
          {FIRMWARE_ISSUES.map((f) => (
            <li key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.what}</p>
              <p className="fw-fix"><b>Workaround</b> {f.fix}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lab-tools-sec">
        <h2>Site changelog &amp; issues</h2>
        <p className="muted lab-issues">
          {user?.provider === "github"
            ? <>See what shipped, report a bug, or request a feature for this site on <Link to="/issues">Site issues</Link>.</>
            : <>Release notes and bug reports live on <a href="https://github.com/jstnfst/te-op1">GitHub</a>.
                Sign in with GitHub to file issues from here.</>}
        </p>
      </section>
    </div>
  )
}

const SWEEP = 270

/** How a slot's knob behaves, from the shared knob model (public/knob-model.js),
 * the same one the patch editor and inspector use:
 * - "turn": continuous over the knob's raw travel; the display is computed
 *   (percent / centered, and anything without a mapping)
 * - "pick": steps through named options (selectors)
 * - "points": steps through the known points (discrete, hz, tempo, ... have
 *   no general formula, so only those values have a display) */
function knobFor(engine: Engine, slot: Slot) {
  const model = window.OP1_KNOB!
  const [min, max] = model.range(engine.key, slot.idx)
  const pts = slot.samples.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0])
  const turn = model.isContinuous(engine.key, slot.idx)
  const mode: "turn" | "pick" | "points" = turn ? "turn" : model.isSelector(engine.key, slot.idx) ? "pick" : "points"
  return { mode, min, max, pts, model }
}

type PanelProps = { engine: Engine; slot: Slot; preview: boolean; onSlot: (i: number) => void; panelRef: RefObject<HTMLElement | null> }

/** The detail side of the map: one slot's name and scale type, and its knob,
 * which turns and reads out exactly as it does in the patch editor. */
function SlotPanel({ panelRef, engine, slot, preview, onSlot }: PanelProps) {
  const scales = window.OP1_SCALES ?? {}
  const meta = slot.type ? scales[slot.type] : undefined
  const k = knobFor(engine, slot)
  // keyed per slot by the map: each knob starts mid-travel (centered: at 0)
  const [raw, setRaw] = useState(() => {
    if (k.mode !== "turn") return k.pts[Math.floor((k.pts.length - 1) / 2)]?.[0] ?? 0
    return slot.type === "centered" ? 0 : Math.round((k.min + k.max) / 2)
  })
  const shown = k.model.display(engine.key, slot.idx, raw)
  const shownText = shown === "" || shown == null ? "–" : String(shown)
  // the raw axis spans the knob's travel (stretched to any known point outside it)
  const lo = Math.min(k.min, ...k.pts.map(([r]) => r)), hi = Math.max(k.max, ...k.pts.map(([r]) => r))
  const signed = lo < 0 && hi > 0
  const pos = (r: number) => Math.max(0, Math.min(100, ((r - lo) / (hi - lo || 1)) * 100))

  return (
    <aside ref={panelRef} className={`fpanel s-${slot.type ?? "unknown"}` + (preview ? " preview" : "")} aria-live="polite" aria-label="Selected slot">
      <div className="fpanel-head">
        <span className={`fpanel-group g-${engine.group}`}>{GROUPS.find(([g]) => g === engine.group)?.[1]}</span>
        <span className="fpanel-engine">{engine.key}</span>
      </div>

      <div className="fpanel-strip" role="group" aria-label={`${engine.key} slots`}>
        {engine.slots.map((s) => {
          const kind = s.name ? s.type ?? "unknown" : s.type === "fixed" ? "fixed" : "unused"
          return (
            <button key={s.idx} type="button" className={`fpanel-slotkey s-${kind}` + (s === slot ? " on" : "")}
              onClick={() => onSlot(s.idx)} aria-pressed={s === slot} aria-label={`${s.idx}: ${s.name ?? kind}`}>
              <i aria-hidden="true" /><span>{s.idx}</span>
            </button>
          )
        })}
      </div>

      <div className="fpanel-title">
        <span className="fpanel-idx">[{slot.idx}]</span>
        <span className="fpanel-name">{slot.name ?? (slot.type === "fixed" ? "Fixed constant" : "Unused")}</span>
      </div>
      {slot.name && meta && (
        <p className="fpanel-scale"><span className={`scale-chip chip-${slot.type}`}>{meta.label}</span>{meta.desc}</p>
      )}

      {slot.name && (k.mode === "turn" || k.pts.length > 0) ? (
        <>
          <div className="fpanel-dial">
            <Knob engine={engine} slot={slot} k={k} raw={raw} onTurn={setRaw} label={shownText} />
            <div className="fpanel-readout">
              <div className="ro-line"><span className="ro-k">raw</span><span className="ro-v">{raw}</span></div>
              <div className="ro-arrow" aria-hidden="true">↓</div>
              <div className="ro-line"><span className="ro-k">display</span><span className="ro-v hot">{shownText}</span></div>
              <div className="ro-step">
                {k.mode === "turn" ? <>full turn: <span className="nowrap">{k.min} → {k.max}</span></>
                  : k.mode === "pick" ? <>{k.pts.length} options</> : <>{k.pts.length} known {k.pts.length === 1 ? "point" : "points"}</>}
              </div>
            </div>
          </div>

          <div className="fpanel-axis" aria-hidden="true">
            <div className="axis-track">
              <span className="axis-range" style={{ left: 0, width: `${pos(raw)}%` }} />
              {signed && <span className="axis-zero" style={{ left: `${pos(0)}%` }} />}
              {k.mode !== "turn" && k.pts.map(([r]) => (
                <span key={r} className={"axis-tick" + (r === raw ? " on" : "")} style={{ left: `${pos(r)}%` }} />
              ))}
              <span className="axis-pt on" style={{ left: `${pos(raw)}%` }} />
            </div>
            <div className="axis-ends"><span>{lo}</span>{signed && <span>0</span>}<span>{hi}</span></div>
          </div>
        </>
      ) : (
        <p className="fpanel-empty">
          {slot.type === "fixed"
            ? slot.info || "Firmware-managed constant; not knob-editable"
            : slot.name ? "No raw → display points for this slot yet" : `No parameter at index ${slot.idx} on ${engine.key}`}
        </p>
      )}

      {slot.name && slot.info && <p className="fpanel-info">{slot.info}</p>}

      <div className="fpanel-links">
        <a href={`/lab/layout#${engine.key}`}>Layout card →</a>
        <a href={`/lab/mappings#${engine.key}`}>Mapping rows →</a>
      </div>
    </aside>
  )
}

type KnobProps = { engine: Engine; slot: Slot; k: ReturnType<typeof knobFor>; raw: number; onTurn: (raw: number) => void; label: string }

/** The slot's knob. Turning knobs follow the patch editor: drag up or right to
 * raise (a full turn over ~220px, Shift for fine), arrows step 1% of the travel
 * (Shift: 1 raw). Option and point knobs step from detent to detent. */
function Knob({ engine, slot, k, raw, onTurn, label }: KnobProps) {
  const drag = useRef<{ x: number; y: number; raw: number; i: number } | null>(null)
  const stepped = k.mode !== "turn"
  const last = k.pts.length - 1
  const at = stepped ? Math.max(0, k.pts.findIndex(([r]) => r === raw)) : 0
  // continuous knobs sit where the model puts them; detented ones are evenly
  // spaced, like the patch editor's selector knobs
  const frac = stepped ? (last > 0 ? at / last : 0) : k.model.frac(engine.key, slot.idx, raw)
  const deg = (f: number) => -SWEEP / 2 + f * SWEEP
  const centered = slot.type === "centered"
  const clamp = (r: number) => Math.max(k.min, Math.min(k.max, Math.round(r)))
  const toIdx = (i: number) => onTurn(k.pts[Math.max(0, Math.min(last, i))][0])

  function down(e: PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, raw, i: at }
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return
    const d = (e.clientX - drag.current.x) - (e.clientY - drag.current.y)
    if (stepped) toIdx(drag.current.i + Math.round(d / 26))
    else onTurn(clamp(drag.current.raw + d * ((e.shiftKey ? 0.25 : 1) / 220) * (k.max - k.min)))
  }
  function key(e: KeyboardEvent<SVGSVGElement>) {
    const dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0
    if (!dir && e.key !== "Home" && e.key !== "End") return
    e.preventDefault()
    if (stepped) toIdx(e.key === "Home" ? 0 : e.key === "End" ? last : at + dir)
    else if (e.key === "Home") onTurn(k.min)
    else if (e.key === "End") onTurn(k.max)
    else onTurn(clamp(raw + dir * (e.shiftKey ? 1 : Math.max(1, Math.round((k.max - k.min) / 100)))))
  }
  const polar = (d: number, r: number) => {
    const a = (d * Math.PI) / 180
    return [60 + Math.sin(a) * r, 60 - Math.cos(a) * r]
  }
  const arc = (from: number, to: number, r: number) => {
    if (to < from) [from, to] = [to, from]
    const [x1, y1] = polar(from, r), [x2, y2] = polar(to, r)
    return `M${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`
  }

  return (
    <svg className={`knob-big s-${slot.type ?? "unknown"}` + (stepped ? " stepped" : "")} viewBox="0 0 120 120" role="slider" tabIndex={0}
      aria-label={slot.name ?? "knob"} aria-valuemin={stepped ? 1 : k.min} aria-valuemax={stepped ? k.pts.length : k.max}
      aria-valuenow={stepped ? at + 1 : raw} aria-valuetext={`raw ${raw}, display ${label}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}
      onKeyDown={key}>
      <path className="kb-sweep" d={arc(-SWEEP / 2, SWEEP / 2, 50)} />
      {!stepped && frac > 0 && <path className="kb-fill" d={arc(centered ? 0 : -SWEEP / 2, deg(frac), 50)} />}
      {stepped && k.pts.map(([r], n) => {
        const a = deg(last > 0 ? n / last : 0)
        const [x1, y1] = polar(a, 45), [x2, y2] = polar(a, 55)
        return <line key={r} className={"kb-tick" + (n === at ? " on" : "")} x1={x1} y1={y1} x2={x2} y2={y2}
          onPointerDown={(e) => { e.stopPropagation(); toIdx(n) }} />
      })}
      <circle className="kb-body" cx="60" cy="60" r="34" />
      <g className="kb-pointer" style={{ transform: `rotate(${deg(frac)}deg)` }}>
        <line x1="60" y1="60" x2="60" y2="32" />
      </g>
      <circle className="kb-cap" cx="60" cy="60" r="4" />
    </svg>
  )
}

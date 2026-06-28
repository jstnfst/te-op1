// Server-side preset validation, ported from the checks in op1dump.c / json2aif.c.

export const SYNTH_TYPES = [
  "amp", "cluster", "dbox", "digital", "dimension", "dna", "drwave",
  "dsynth", "fm", "phase", "pulse", "sampler", "string", "vocoder", "voltage",
]
export const FX_TYPES = ["cwo", "delay", "grid", "mother", "nitro", "phone", "punch", "spring", "terminal"]
export const LFO_TYPES = ["element", "midi", "random", "tremolo", "value", "velocity"]

// APPL area minus the 4-byte "op-1" sig and the trailing '\n' (matches json2aif).
const APPL_JSON_MAX_SYNTH = 1023 // 1028 - 4 - 1
const APPL_JSON_MAX_DBOX = 4095 // 4100 - 4 - 1

export interface PatchMeta {
  name: string
  type: string
  engine_version: number | null
  fx_type: string | null
  lfo_type: string | null
  octave: number
  isDbox: boolean
}

export interface ValidateResult {
  ok: boolean
  error?: string
  json?: string // canonical (alphabetical keys, minified)
  meta?: PatchMeta
}

function isIntArray(v: unknown, len: number): boolean {
  return Array.isArray(v) && v.length === len &&
    v.every((n) => Number.isInteger(n) && (n as number) >= -32768 && (n as number) <= 32767)
}

/** Minify with top-level keys in alphabetical order (firmware requirement). */
function canonicalize(obj: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k]
  return JSON.stringify(sorted)
}

export function validatePreset(raw: unknown): ValidateResult {
  let obj: Record<string, unknown>
  if (typeof raw === "string") {
    if (raw.length > APPL_JSON_MAX_DBOX * 2) return { ok: false, error: "Preset is too large." }
    try { obj = JSON.parse(raw) } catch { return { ok: false, error: "Not valid JSON." } }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>
  } else {
    return { ok: false, error: "Expected a JSON object." }
  }

  const type = obj.type
  if (typeof type !== "string" || !SYNTH_TYPES.includes(type))
    return { ok: false, error: `Unknown or missing "type" (expected one of: ${SYNTH_TYPES.join(", ")}).` }

  const isDbox = type === "dbox"
  let engine_version: number | null = null

  if (isDbox) {
    if (!Number.isInteger(obj.drum_version)) return { ok: false, error: 'dbox preset needs an integer "drum_version".' }
    engine_version = obj.drum_version as number
    if (!Array.isArray(obj.dbox_data)) return { ok: false, error: 'dbox preset needs "dbox_data".' }
  } else {
    if (!Number.isInteger(obj.synth_version)) return { ok: false, error: 'Preset needs an integer "synth_version".' }
    engine_version = obj.synth_version as number
    if (!isIntArray(obj.adsr, 8)) return { ok: false, error: '"adsr" must be 8 integers (0-32767).' }
    if (!isIntArray(obj.knobs, 8)) return { ok: false, error: '"knobs" must be 8 integers.' }
  }

  if (!isIntArray(obj.fx_params, 8)) return { ok: false, error: '"fx_params" must be 8 integers.' }
  if (!isIntArray(obj.lfo_params, 8)) return { ok: false, error: '"lfo_params" must be 8 integers.' }

  const fx_type = typeof obj.fx_type === "string" ? obj.fx_type : null
  const lfo_type = typeof obj.lfo_type === "string" ? obj.lfo_type : null
  if (fx_type && !FX_TYPES.includes(fx_type)) return { ok: false, error: `Unknown fx_type "${fx_type}".` }
  if (lfo_type && !LFO_TYPES.includes(lfo_type)) return { ok: false, error: `Unknown lfo_type "${lfo_type}".` }

  const octave = Number.isInteger(obj.octave) ? (obj.octave as number) : 0
  if (octave < -8 || octave > 8) return { ok: false, error: '"octave" out of range.' }

  let name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : ""
  if (!name) name = type

  const json = canonicalize(obj)
  const cap = isDbox ? APPL_JSON_MAX_DBOX : APPL_JSON_MAX_SYNTH
  if (json.length > cap) return { ok: false, error: `Preset JSON exceeds ${cap} bytes.` }

  return {
    ok: true,
    json,
    meta: { name, type, engine_version, fx_type, lfo_type, octave, isDbox },
  }
}

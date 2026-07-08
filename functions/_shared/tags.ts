// Derive searchable tags from a preset (simplified port of mondo.c's tag section -
// good enough for browse filters; the C tool remains the authoritative tagger).

interface Presetish {
  type?: string
  adsr?: number[]
  fx_active?: boolean
  fx_type?: string
  fx_params?: number[]
  lfo_active?: boolean
  lfo_type?: string
  octave?: number
}

const FX_CHARACTER: Record<string, string> = {
  spring: "reverb", cwo: "reverb", mother: "reverb",
  delay: "echo", grid: "echo",
  punch: "punchy", nitro: "drive", phone: "lofi", terminal: "lofi",
}
const LFO_MOTION: Record<string, string> = {
  tremolo: "tremolo", element: "gravity", value: "modulated",
  random: "random", velocity: "dynamic", midi: "midi",
}

// The engine type is deliberately NOT tagged: cards/rows already show it as
// the engine chip, and browse filters on the type column directly.
export function deriveTags(p: Presetish): string[] {
  const tags = new Set<string>()

  const a = p.adsr
  if (Array.isArray(a) && a.length >= 4) {
    const [attack, , sustain, release] = a
    if (attack < 1500) tags.add("fast-attack")
    if (attack > 12000) tags.add("swelling")
    if (release > 12000) tags.add("long-release")
    if (release < 2000) tags.add("tight")
    if (sustain > 28000) tags.add("sustained")
    if (sustain < 2000) tags.add("percussive")
    if (attack > 6000 && sustain > 24000) tags.add("pad")
    if (attack < 1500 && sustain < 2000) tags.add("stab")
  }

  // The fx engine name is deliberately NOT tagged - the character term above
  // says what it sounds like, and the knobs refine it (thresholds are thirds
  // of each knob's documented range; see display-notes.md / public/display.html).
  if (p.fx_active && p.fx_type) {
    const c = FX_CHARACTER[p.fx_type]
    if (c) tags.add(c)
    const k = p.fx_params
    if (Array.isArray(k) && k.length >= 4) {
      // mix/level-style knob at index 3 (0-32767) cranked -> the effect dominates
      if (["spring", "mother", "grid", "delay", "terminal"].includes(p.fx_type) && k[3] > 21845) tags.add("wet")
      // heavy feedback -> regenerating echoes
      if (p.fx_type === "delay" && k[2] > 10922) tags.add("dub") // FEEDBACK 0-16384
      if (p.fx_type === "grid" && k[2] > 21845) tags.add("dub") // Z FEEDBACK 0-32767
      // terminal BITS maps 0-32767 to 2.0-16.0 bits; bottom third is properly crushed
      if (p.fx_type === "terminal" && k[1] < 10922) tags.add("bitcrushed")
      // nitro FEEDBACK 0-20643 cranked -> self-oscillating grit
      if (p.fx_type === "nitro" && k[2] > 13762) tags.add("gritty")
    }
  }
  if (p.lfo_active && p.lfo_type) {
    const m = LFO_MOTION[p.lfo_type]
    if (m) tags.add(m)
    tags.add("animated")
  }

  const oct = p.octave ?? 0
  if (oct < 0) tags.add("bass")
  if (oct > 0) tags.add("bright")

  return [...tags].sort()
}

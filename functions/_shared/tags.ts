// Derive searchable tags from a preset (simplified port of tag-patch.c — good
// enough for browse filters; the C tool remains the authoritative tagger).

interface Presetish {
  type?: string
  adsr?: number[]
  fx_active?: boolean
  fx_type?: string
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

export function deriveTags(p: Presetish): string[] {
  const tags = new Set<string>()
  if (p.type) tags.add(p.type)

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

  if (p.fx_active && p.fx_type) {
    tags.add(p.fx_type)
    const c = FX_CHARACTER[p.fx_type]
    if (c) tags.add(c)
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

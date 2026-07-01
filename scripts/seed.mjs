// Seed the D1 `patches` table from the generated samples.js (mondo samples output).
// Usage: node scripts/seed.mjs [--local|--remote]
import fs from "node:fs"
import { execSync } from "node:child_process"

const target = process.argv.includes("--remote") ? "--remote" : "--local"

if (!fs.existsSync("samples.js")) {
  console.error("samples.js not found. Generate it first: mondo.exe samples collection samples.js")
  process.exit(1)
}

// samples.js is `const SAMPLES = { ... }` - load it without importing.
const txt = fs.readFileSync("samples.js", "utf8")
const SAMPLES = eval("(function(){" + txt + ";return SAMPLES;})()")

const FX_CHAR = { spring: "reverb", cwo: "reverb", mother: "reverb", delay: "echo", grid: "echo", punch: "punchy", nitro: "drive", phone: "lofi", terminal: "lofi" }
const LFO_MOT = { tremolo: "tremolo", element: "gravity", value: "modulated", random: "random", velocity: "dynamic", midi: "midi" }

function deriveTags(p) {
  const t = new Set()
  if (p.type) t.add(p.type)
  const a = p.adsr
  if (Array.isArray(a) && a.length >= 4) {
    const [at, , su, re] = a
    if (at < 1500) t.add("fast-attack")
    if (at > 12000) t.add("swelling")
    if (re > 12000) t.add("long-release")
    if (re < 2000) t.add("tight")
    if (su > 28000) t.add("sustained")
    if (su < 2000) t.add("percussive")
    if (at > 6000 && su > 24000) t.add("pad")
    if (at < 1500 && su < 2000) t.add("stab")
  }
  if (p.fx_active && p.fx_type) { t.add(p.fx_type); if (FX_CHAR[p.fx_type]) t.add(FX_CHAR[p.fx_type]) }
  if (p.lfo_active && p.lfo_type) { if (LFO_MOT[p.lfo_type]) t.add(LFO_MOT[p.lfo_type]); t.add("animated") }
  const o = p.octave || 0
  if (o < 0) t.add("bass")
  if (o > 0) t.add("bright")
  return [...t].sort().join(",")
}

const canon = (o) => { const s = {}; for (const k of Object.keys(o).sort()) s[k] = o[k]; return JSON.stringify(s) }
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

const rows = []
for (const key of Object.keys(SAMPLES)) {
  const p = SAMPLES[key]
  if (!p || typeof p !== "object" || !p.type) continue
  const ev = p.type === "dbox" ? (p.drum_version ?? null) : (p.synth_version ?? null)
  const name = typeof p.name === "string" && /[a-zA-Z]/.test(p.name) ? p.name : key
  rows.push(
    "INSERT INTO patches (user_id,name,type,engine_version,fx_type,lfo_type,octave,json,tags,is_public) VALUES (" +
    `NULL,${q(name)},${q(p.type)},${ev === null ? "NULL" : ev},` +
    `${p.fx_type ? q(p.fx_type) : "NULL"},${p.lfo_type ? q(p.lfo_type) : "NULL"},${p.octave || 0},` +
    `${q(canon(p))},${q(deriveTags(p))},1);`,
  )
}

fs.writeFileSync("seed.generated.sql", rows.join("\n") + "\n")
console.log(`Wrote seed.generated.sql (${rows.length} patches).`)

try {
  execSync(`npx wrangler d1 execute te-op1-db ${target} --file=seed.generated.sql`, { stdio: "inherit" })
} catch {
  console.error("\nCould not run wrangler automatically. Run it yourself:")
  console.error(`  npx wrangler d1 execute te-op1-db ${target} --file=seed.generated.sql`)
}

// Write a probe set: one patch per value of a single array slot.
//
//   node scripts/mc/probe-sweep.mjs <base.json> <array> <index> <v1,v2,...> <name>
//   (or ./master-control.sh probe sweep ...)
//
// Each patch is the base preset with <array>[<index>] set to one value, named
// "<name> i<index> <value>" so it reads on the device's screen, and saved as
// sandbox/<name>/<name>-i<index>-<value>.json with its keys in the
// alphabetical order the firmware needs. mondo build turns them into .aif.
//
// Example: what does the random LFO's index 2 do at each raw value?
//   probe sweep presets/x.json lfo_params 2 1024,2144,4160,7168 rd
import fs from "node:fs"
import path from "node:path"

const [base, array, index, values, name] = process.argv.slice(2)
if (!base || !array || index === undefined || !values || !name) {
  console.error("usage: probe sweep <base.json> <array> <index> <v1,v2,...> <name>")
  process.exit(1)
}
if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
  console.error(`probe set name "${name}": letters, digits, - and _ only`)
  process.exit(1)
}

const preset = JSON.parse(fs.readFileSync(base, "utf8").replace(/^﻿/, ""))
const i = Number(index)
if (!Array.isArray(preset[array]) || !Number.isInteger(i) || i < 0 || i >= preset[array].length) {
  console.error(`${base} has no ${array}[${index}]`)
  process.exit(1)
}

const dir = path.join("sandbox", name)
fs.mkdirSync(dir, { recursive: true })
for (const raw of values.split(",").map((v) => v.trim()).filter(Boolean)) {
  const v = Number(raw)
  if (!Number.isInteger(v) || v < -32768 || v > 32767) {
    console.error(`skip "${raw}": not a 16-bit integer`)
    continue
  }
  const p = { ...preset, [array]: preset[array].map((x, k) => (k === i ? v : x)), name: `${name} i${i} ${v}` }
  delete p.mtime // mondo build stamps a fresh one
  const sorted = Object.fromEntries(Object.keys(p).sort().map((k) => [k, p[k]]))
  const file = path.join(dir, `${name}-i${i}-${v}.json`)
  fs.writeFileSync(file, JSON.stringify(sorted))
  console.log("  " + file)
}

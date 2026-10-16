// Fill the LOCAL D1 with enough rows to exercise the long-list UI (paging,
// virtualization, page jumps). Dev only: refuses --remote.
//
//   node scripts/seed-volume.mjs          seed
//   node scripts/seed-volume.mjs --clean  remove everything this script added
//
// Every row it creates is named "vol ..." so --clean can find it. Rows are
// owned by the dev "Musician" persona (sign in once via /login's Dev login
// panel first, so the user exists) plus any other local users.
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"

if (process.argv.includes("--remote")) {
  console.error("seed-volume is local-only.")
  process.exit(1)
}

const DB = "te-op1-db"
const MINE = 600      // musician's patches (half public)
const OTHERS = 300    // public patches by other users
const PACKS = 80      // musician's packs (account limit is 100)
const BIG_PACK = 200  // items in "vol pack 001" (pack limit is 200)
const LIKES = 300     // musician's likes on others' patches

function d1(args) {
  return execFileSync("npx", ["wrangler", "d1", "execute", DB, "--local", ...args], { encoding: "utf8", shell: true })
}
function query(sql) {
  const out = d1(["--json", "--command", JSON.stringify(sql)])
  return JSON.parse(out.slice(out.indexOf("[")))[0].results
}
function runFile(sql) {
  const f = path.join(os.tmpdir(), `seed-volume-${Date.now()}.sql`)
  fs.writeFileSync(f, sql)
  try { d1(["--file", f]) } finally { fs.rmSync(f, { force: true }) }
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

if (process.argv.includes("--clean")) {
  runFile(`
DELETE FROM likes WHERE target_type = 'patch' AND target_id IN (SELECT id FROM patches WHERE name LIKE 'vol %');
DELETE FROM likes WHERE target_type = 'pack' AND target_id IN (SELECT id FROM packs WHERE name LIKE 'vol %');
DELETE FROM pack_items WHERE pack_id IN (SELECT id FROM packs WHERE name LIKE 'vol %');
DELETE FROM pack_items WHERE patch_id IN (SELECT id FROM patches WHERE name LIKE 'vol %');
DELETE FROM packs WHERE name LIKE 'vol %';
DELETE FROM patches WHERE name LIKE 'vol %';
`)
  console.log("Removed all 'vol ...' rows from the local database.")
  process.exit(0)
}

const me = query("SELECT id FROM users WHERE provider = 'dev' AND provider_user_id = 'dev:musician'")[0]
if (!me) {
  console.error("No dev Musician user yet. Start `npm run dev`, open /login and click Dev login > Musician once.")
  process.exit(1)
}
const others = query("SELECT id FROM users WHERE id <> " + me.id + " AND banned_at IS NULL ORDER BY id LIMIT 10").map((r) => r.id)
if (!others.length) others.push(me.id)

// Real presets as the patch bodies, so Open / Download / zip all work.
const presets = fs.readdirSync("presets")
  .filter((f) => f.endsWith(".json"))
  .map((f) => { try { return JSON.parse(fs.readFileSync(path.join("presets", f), "utf8")) } catch { return null } })
  .filter((p) => p && typeof p.type === "string")
if (!presets.length) { console.error("No usable presets/*.json"); process.exit(1) }
const TAGS = ["pad", "bass", "lead", "keys", "pluck", "drone", "fx", "texture"]

function patchRow(i, owner, name, isPublic) {
  const base = presets[i % presets.length]
  const json = JSON.stringify({ ...base, name })
  const tags = [TAGS[i % TAGS.length], TAGS[(i * 3 + 1) % TAGS.length]].join(",")
  // spread created_at so newest-first order is deterministic and realistic
  return `(${owner}, ${q(name)}, ${q(base.type)}, ${base.synth_version ?? base.drum_version ?? "NULL"}, ${base.fx_type ? q(base.fx_type) : "NULL"}, ${base.lfo_type ? q(base.lfo_type) : "NULL"}, ${base.octave ?? 0}, ${q(json)}, ${q(tags)}, ${isPublic ? 1 : 0}, datetime('now', '-${i} minutes'))`
}
const cols = "(user_id, name, type, engine_version, fx_type, lfo_type, octave, json, tags, is_public, created_at)"

let sql = ""
const chunk = (rows) => { for (let i = 0; i < rows.length; i += 100) sql += `INSERT INTO patches ${cols} VALUES\n${rows.slice(i, i + 100).join(",\n")};\n` }
chunk(Array.from({ length: MINE }, (_, i) => patchRow(i, me.id, `vol m ${String(i + 1).padStart(4, "0")}`, i % 2 === 0)))
chunk(Array.from({ length: OTHERS }, (_, i) => patchRow(i + MINE, others[i % others.length], `vol o ${String(i + 1).padStart(4, "0")}`, true)))

sql += `INSERT INTO packs (user_id, name, is_public, created_at) VALUES\n` +
  Array.from({ length: PACKS }, (_, i) => `(${me.id}, ${q(`vol pack ${String(i + 1).padStart(3, "0")}`)}, ${i % 3 === 0 ? 0 : 1}, datetime('now', '-${i} hours'))`).join(",\n") + ";\n"

// one full pack, the rest a handful each
sql += `INSERT INTO pack_items (pack_id, patch_id, position)
  SELECT (SELECT id FROM packs WHERE name = 'vol pack 001' AND user_id = ${me.id}), id, id
  FROM patches WHERE name LIKE 'vol m %' ORDER BY id LIMIT ${BIG_PACK};
INSERT OR IGNORE INTO pack_items (pack_id, patch_id, position)
  SELECT pk.id, p.id, p.id FROM packs pk
  JOIN patches p ON p.name LIKE 'vol m %' AND (p.id % 41) = (pk.id % 41)
  WHERE pk.user_id = ${me.id} AND pk.name LIKE 'vol pack %' AND pk.name <> 'vol pack 001';
INSERT OR IGNORE INTO likes (user_id, target_type, target_id)
  SELECT ${me.id}, 'patch', id FROM patches WHERE name LIKE 'vol o %' ORDER BY id LIMIT ${LIKES};
INSERT OR IGNORE INTO likes (user_id, target_type, target_id)
  SELECT ${me.id}, 'pack', id FROM packs WHERE name LIKE 'vol pack %' AND is_public = 1 ORDER BY id LIMIT 40;
UPDATE patches SET like_count = (SELECT COUNT(*) FROM likes WHERE target_type = 'patch' AND target_id = patches.id) WHERE name LIKE 'vol %';
UPDATE packs SET like_count = (SELECT COUNT(*) FROM likes WHERE target_type = 'pack' AND target_id = packs.id) WHERE name LIKE 'vol %';
`
runFile(sql)
console.log(`Seeded ${MINE} + ${OTHERS} patches, ${PACKS} packs (one with ${BIG_PACK}), ~${LIKES} likes for user ${me.id}. Undo: node scripts/seed-volume.mjs --clean`)

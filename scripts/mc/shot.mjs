// Screenshot one page of the site.
//
//   node scripts/mc/shot.mjs <path> [--mobile] [--as <persona>] [--out <dir>] [--base <url>]
//   (or ./master-control.sh shot /library/editor --as musician)
//
// Full-page PNG into shots/ (gitignored) by default, named after the path.
// --as signs in as a dev-login persona first (local site, DEV_LOGIN=1).
// Page errors are printed, so a shot doubles as a quick check.
import fs from "node:fs"
import path from "node:path"
import { launch, arg, flag } from "./browser.mjs"

const target = "/" + (process.argv[2] ?? "").replace(/^\/+/, "")
if (!process.argv[2] || process.argv[2].startsWith("--")) {
  console.error("usage: shot <path> [--mobile] [--as <persona>] [--out <dir>] [--base <url>]")
  process.exit(1)
}
const BASE = arg("--base", "http://127.0.0.1:8788")
const OUT = arg("--out", "shots")
const who = arg("--as", null)
const mobile = flag("--mobile")

fs.mkdirSync(OUT, { recursive: true })
const slug = (target.slice(1).replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "") || "home")
  + (who ? "-" + who : "") + (mobile ? "-mobile" : "")
const file = path.join(OUT, slug + ".png")

const browser = await launch()
const ctx = await browser.newContext(mobile
  ? { viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, hasTouch: true }
  : { viewport: { width: 1280, height: 860 } })
const page = await ctx.newPage()
const errs = []
page.on("pageerror", (e) => errs.push(e.message))
page.on("console", (m) => m.type() === "error" && errs.push(m.text()))
if (who) await page.goto(`${BASE}/api/auth/dev?as=${encodeURIComponent(who)}&next=/`, { waitUntil: "networkidle" })
const res = await page.goto(BASE + target, { waitUntil: "networkidle" })
await page.waitForTimeout(400)
await page.screenshot({ path: file, fullPage: true })
await browser.close()

console.log(`${file}  (HTTP ${res?.status()})`)
for (const e of errs) console.log("  error: " + e)
process.exit(errs.length ? 1 : 0)

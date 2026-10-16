// Smoke test for the website: every page loads without page or console
// errors and without sideways scroll, on desktop and phone widths; then the
// dev-login personas sign in and land with the right navigation.
//
//   node scripts/mc/smoke.mjs [--base http://127.0.0.1:8788]
//   (or ./master-control.sh test website)
//
// Needs a running site (./master-control.sh dev up). The persona checks need
// DEV_LOGIN=1 in .dev.vars and are skipped against any non-local --base.
import { launch, arg } from "./browser.mjs"

const BASE = arg("--base", "http://127.0.0.1:8788")
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)

// [path, a selector that proves the page rendered its own content]
const PAGES = [
  ["/", ".hero"],
  ["/library", ".page-nav"],
  ["/library/packs", ".page-nav"],
  ["/library/editor", "#viz .pgroup"],
  ["/lab", ".lab-tools"],
  ["/lab/layout", "[data-site-header] header"],
  ["/lab/mappings", "[data-site-header] header"],
  ["/lab/inspector", "#viz .pgroup"],
  ["/login", "h1"],
]
const VIEWPORTS = [["desktop", 1280, 860], ["phone", 375, 760]]

const results = []
const pass = (name, detail = "") => results.push({ ok: true, name, detail })
const fail = (name, detail) => results.push({ ok: false, name, detail })

const browser = await launch()
try {
  for (const [vp, width, height] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height } })
    for (const [path, sel] of PAGES) {
      const page = await ctx.newPage()
      const errs = []
      page.on("pageerror", (e) => errs.push(e.message))
      page.on("console", (m) => m.type() === "error" && errs.push(m.text()))
      const name = `${vp.padEnd(7)} ${path}`
      try {
        const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 20000 })
        if (!res || res.status() >= 400) { fail(name, `HTTP ${res?.status()}`); continue }
        await page.waitForSelector(sel, { timeout: 5000 }).catch(() => errs.push(`missing ${sel}`))
        const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
        if (hscroll) errs.push("horizontal scroll")
        errs.length ? fail(name, errs.join("; ")) : pass(name)
      } catch (e) {
        fail(name, e.message.split("\n")[0])
      } finally {
        await page.close()
      }
    }
    await ctx.close()
  }

  // A patch from the library opens in the editor under LIBRARY > EDITOR.
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const r = await page.request.get(BASE + "/api/patches").catch(() => null)
    const first = r && r.ok() ? (await r.json()).items?.[0] : null
    if (!first) pass("editor  ?id=", "skipped: library is empty")
    else {
      await page.goto(`${BASE}/library/editor?id=${first.id}`, { waitUntil: "networkidle" })
      const tab = await page.locator(".page-nav .nav-btn.active").textContent().catch(() => null)
      tab === "EDITOR" ? pass("editor  ?id=" + first.id) : fail("editor  ?id=" + first.id, `active tab ${tab}`)
    }
    await ctx.close()
  }

  // Mock personas: sign in, land, and see the nav each one should.
  const devOn = LOCAL && (await fetch(BASE + "/api/auth/dev").then((r) => r.ok).catch(() => false))
  if (!devOn) pass("personas", LOCAL ? "skipped: DEV_LOGIN is off" : "skipped: not a local site")
  else {
    const expect = {
      musician: (s) => s.user && s.nav.includes("MINE"),
      github: (s) => s.user && s.labNav.includes("ISSUES"),
      admin: (s) => s.user && s.mod,
      banned: (s) => !s.user,
    }
    for (const [who, check] of Object.entries(expect)) {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto(`${BASE}/api/auth/dev?as=${who}&next=/library`, { waitUntil: "networkidle" })
      const s = await page.evaluate(async () => ({
        user: (await fetch("/api/auth/me").then((r) => r.json())).user,
        nav: [...document.querySelectorAll(".page-nav .nav-btn")].map((a) => a.textContent),
        mod: !!document.querySelector("a.mod-link"),
      }))
      await page.goto(BASE + "/lab", { waitUntil: "networkidle" })
      s.labNav = await page.evaluate(() => [...document.querySelectorAll(".page-nav .nav-btn")].map((a) => a.textContent))
      check(s) ? pass(`persona ${who}`) : fail(`persona ${who}`, JSON.stringify({ user: !!s.user, nav: s.nav, labNav: s.labNav, mod: s.mod }))
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}

for (const r of results) console.log(`${r.ok ? "  ok  " : "  FAIL"} ${r.name}${r.detail ? "  " + r.detail : ""}`)
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `\n${failed} of ${results.length} failed` : `\nall ${results.length} passed`)
process.exit(failed ? 1 : 0)

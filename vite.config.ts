import fs from "node:fs"
import path from "node:path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Local dev: Vite is the front door on :8788 (live reload for the SPA and the
// static pages in public/), and forwards /api/* to `wrangler pages dev` on
// :8789, which runs the Functions against the local D1. Production is
// unchanged: Pages serves dist/ and applies public/_redirects itself.
const API_PORT = 8789

/** Applies public/_redirects the way Pages does, for the dev server only:
 * exact-path rewrites (200) and redirects (301/302), plus Pages' pretty URLs
 * (/params serves params.html). The SPA catch-all (/* -> /index.html) is left
 * to Vite's own fallback, so Vite's module requests are never swallowed. */
function pagesRedirects(): Plugin {
  const pub = path.resolve(__dirname, "public")
  const read = () =>
    fs.readFileSync(path.join(pub, "_redirects"), "utf8").split("\n")
      .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split(/\s+/)).filter(([from]) => !from.includes("*"))
      .map(([from, to, status]) => ({ from, to, status: Number(status ?? 301) }))
  const pretty = (p: string) => (!path.extname(p) && fs.existsSync(path.join(pub, p + ".html")) ? p + ".html" : null)
  return {
    name: "pages-redirects",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://dev")
        const rule = read().find((r) => r.from === url.pathname)
        if (rule && rule.status !== 200) {
          res.writeHead(rule.status, { Location: rule.to + url.search })
          return res.end()
        }
        const target = rule ? rule.to : url.pathname
        const file = pretty(target)
        if (rule || file) req.url = (file ?? target) + url.search
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pagesRedirects()],
  server: {
    // IPv4 explicitly: on Windows "localhost" binds IPv6 ::1 only, and the
    // scripts (master-control, smoke, shot) talk to 127.0.0.1:8788
    host: "127.0.0.1",
    port: 8788,
    strictPort: true,
    // keep the browser's Host so the Functions see localhost:8788 (cookies,
    // OAuth callbacks and the dev-login loopback guard all key off it)
    proxy: { "/api": { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false } },
  },
})

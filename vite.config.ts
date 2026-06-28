import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // During `wrangler pages dev --proxy 5173`, the Vite dev server runs on 5173
  // and wrangler proxies it on 8788 so /api/* hits the Functions.
  server: { port: 5173 },
})

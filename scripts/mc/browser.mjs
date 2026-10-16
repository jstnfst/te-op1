// Shared bits for the master-control.sh Playwright scripts.
import { chromium } from "playwright"

/** Launch headless Chromium, with a hint when the browser isn't installed. */
export async function launch() {
  try {
    return await chromium.launch()
  } catch (e) {
    if (/Executable doesn't exist/.test(e.message)) {
      console.error("Playwright's Chromium isn't installed: npx playwright install chromium")
      process.exit(1)
    }
    throw e
  }
}

/** `--name value` from argv, else the fallback. */
export function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}
export const flag = (name) => process.argv.includes(name)

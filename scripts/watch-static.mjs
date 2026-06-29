import { watch, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const pairs = [
  ['public/patch.html', 'dist/patch.html'],
]

if (!existsSync(join(root, 'dist'))) mkdirSync(join(root, 'dist'), { recursive: true })

for (const [src, dst] of pairs) {
  copyFileSync(join(root, src), join(root, dst))
  console.log(`[watch-static] ${src} → ${dst}`)
}

for (const [src, dst] of pairs) {
  watch(join(root, src), () => {
    copyFileSync(join(root, src), join(root, dst))
    console.log(`[watch-static] ${src} → ${dst}`)
  })
}

console.log('[watch-static] watching...')

// One-off asset optimizer: converts every PNG under lootbox/assets/images to
// WebP in place (same path/name, .webp extension), preserving alpha. Originals
// are left untouched so the conversion can be verified before removing them.
//
// Usage: node scripts/convert-webp.mjs
// (sharp is a devDependency; safe to remove once assets are finalized.)

import { readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = fileURLToPath(new URL('../lootbox/assets/images', import.meta.url))

/** WebP encode settings: high quality, near-lossless alpha, max compression effort. */
const WEBP_OPTIONS = { quality: 82, alphaQuality: 100, effort: 6 }

async function collectPngs(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collectPngs(full)))
    else if (extname(entry.name).toLowerCase() === '.png') files.push(full)
  }
  return files
}

async function main() {
  const pngs = await collectPngs(ROOT)
  let savedBefore = 0
  let savedAfter = 0

  for (const png of pngs) {
    const webp = png.replace(/\.png$/i, '.webp')
    await sharp(png).webp(WEBP_OPTIONS).toFile(webp)
    const [{ size: before }, { size: after }] = await Promise.all([stat(png), stat(webp)])
    savedBefore += before
    savedAfter += after
    const pct = Math.round((1 - after / before) * 100)
    console.log(`${png.replace(ROOT, '')}  ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB  (-${pct}%)`)
  }

  console.log(
    `\nTotal: ${(savedBefore / 1024).toFixed(0)}KB -> ${(savedAfter / 1024).toFixed(0)}KB  (-${Math.round((1 - savedAfter / savedBefore) * 100)}%) across ${pngs.length} files`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

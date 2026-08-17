// One-off asset optimizer: converts every PNG under the asset roots below to
// WebP in place (same path/name, .webp extension), preserving alpha. Originals
// are left untouched so the conversion can be verified before removing them.
//
// Usage: node scripts/convert-webp.mjs
//        npm run convert:webp
// (sharp is a devDependency; safe to remove once assets are finalized.)

import { readdir, stat } from 'node:fs/promises'
import { join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** Roots scanned recursively for PNG → WebP. */
const ROOTS = [
  join(repoRoot, 'lootbox/assets/images'),
  join(repoRoot, 'lootbox-2/assets/images'),
  join(repoRoot, 'lootbox-test/assets/backgrounds'),
]

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
  const pngs = []
  for (const root of ROOTS) {
    pngs.push(...(await collectPngs(root)))
  }

  if (pngs.length === 0) {
    console.log('No PNG files found under configured asset roots.')
    return
  }

  let savedBefore = 0
  let savedAfter = 0

  for (const png of pngs) {
    const webp = png.replace(/\.png$/i, '.webp')
    await sharp(png).webp(WEBP_OPTIONS).toFile(webp)
    const [{ size: before }, { size: after }] = await Promise.all([stat(png), stat(webp)])
    savedBefore += before
    savedAfter += after
    const pct = Math.round((1 - after / before) * 100)
    console.log(`${relative(repoRoot, png)}  ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB  (-${pct}%)`)
  }

  console.log(
    `\nTotal: ${(savedBefore / 1024).toFixed(0)}KB -> ${(savedAfter / 1024).toFixed(0)}KB  (-${Math.round((1 - savedAfter / savedBefore) * 100)}%) across ${pngs.length} files`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

// Verifies the COMMITTED animation rasters without re-encoding anything.
//
// `npm run build:animations` already asserts all of this, but only for files it
// has just produced, and only on a machine with ffmpeg, avifenc and img2webp
// installed. Since the outputs are committed rather than built on deploy, the
// files that actually reach the CDN are the ones in git — and between the encode
// and the deploy they can be truncated by a bad merge, mangled by a filter that
// "optimises" images, or replaced by hand.
//
// The failure this guards against is silent by nature: an AVIF that has lost its
// `avis` brand or its `moov` box still decodes, still paints, and still reports a
// perfectly healthy `currentSrc`. It just shows one frame forever. Nothing in the
// browser complains, so the check has to happen here.
//
// Reads bytes only — no encoders required, so it runs anywhere, including CI.
//
//   node scripts/verify-animations.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertAvifSequence,
  assertAvifStill,
  assertWebpAnimated,
} from './build-card-animations.mjs'
import { BG_ANIM, BG_ANIM_STATES } from '../lootbox-2/backgrounds-anim.generated.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const brandDir = path.join(repoRoot, 'lootbox-2')

const failures = []
const rows = []

function check(label, relativeUrl, verify) {
  const file = path.join(brandDir, relativeUrl)
  const name = path.basename(relativeUrl)

  if (!fs.existsSync(file)) {
    failures.push(`${label}: ${name} is missing`)
    return
  }
  const bytes = fs.statSync(file).size
  if (bytes === 0) {
    failures.push(`${label}: ${name} is empty`)
    return
  }

  try {
    const frames = verify(file)
    rows.push(
      `  ok  ${name.padEnd(42)} ${String(Math.round(bytes / 1024)).padStart(5)} KB` +
        (frames ? `  ${frames} frames` : ''),
    )
  } catch (err) {
    failures.push(`${label}: ${err.message || err}`)
  }
}

for (const state of BG_ANIM_STATES) {
  const entry = BG_ANIM[state]
  process.stdout.write(
    `\n${state} — ${entry.box.width}x${entry.box.height}, ${entry.frames} frames @ ${entry.fps}fps\n`,
  )
  const before = rows.length

  for (const candidate of entry.avif) {
    check(`${state} loop`, candidate.url, (file) => assertAvifSequence(file, entry.frames))
  }
  for (const candidate of entry.webp) {
    check(`${state} loop`, candidate.url, (file) => assertWebpAnimated(file, entry.frames))
  }
  // Posters must be the opposite: a still, with no sequence track. A poster that
  // quietly became animated would double the bytes of the one layer that is
  // eager and always downloaded.
  for (const candidate of entry.poster.avif) {
    check(`${state} poster`, candidate.url, (file) => {
      assertAvifStill(file)
      return 0
    })
  }
  for (const candidate of entry.poster.webp) {
    check(`${state} poster`, candidate.url, (file) => {
      const buffer = fs.readFileSync(file)
      if (buffer.indexOf(Buffer.from('ANMF', 'ascii')) >= 0) {
        throw new Error(`${path.basename(file)}: poster is animated — expected a single frame`)
      }
      return 0
    })
  }

  process.stdout.write(`${rows.slice(before).join('\n')}\n`)
}

const total = rows.length + failures.length
if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} of ${total} file(s) failed:\n`)
  for (const failure of failures) process.stderr.write(`  ${failure}\n`)
  process.exit(1)
}

process.stdout.write(`\n${total} file(s) verified — every loop is a real sequence.\n`)

// Builds the animated card backgrounds for Thor from the source videos in
// lootbox-thor/animation-source/, as animated AVIF + animated WebP loops with
// static first-frame posters, at several densities, under content-hashed names.
//
// Usage: node scripts/build-card-animations.mjs [flags]
//        npm run build:animations
//
// Prerequisites are SYSTEM binaries, not npm packages:
//   brew install ffmpeg libavif webp
//
// WHY THE ENCODERS ARE NOT ffmpeg
// Homebrew's ffmpeg 9.0 formula dropped --enable-libaom and --enable-libwebp, so
// that build can no longer encode AVIF well (only libsvtav1 remains, which
// refuses single-picture mode and would fail on the posters) and cannot encode
// WebP at all (its `webp`/`webp_anim` codecs are decode-only). Rather than pin a
// build flag we do not control, the encoders here are the reference tools each
// format ships — `avifenc` from libavif (which drives libaom internally) and
// `img2webp` from libwebp — and ffmpeg is used only to decode, resample to the
// target fps and scale. That is the job ffmpeg will never stop being able to do.
//
// NO ALPHA, ON PURPOSE
// Everything is encoded opaque (yuv420p / no alpha plane). The card's rounded
// corners and its 2px rim are drawn in CSS instead, which is both smaller and a
// deliberate dodge: transparency is the one animated-AVIF bug class that is
// simultaneously broken and slow in Chromium, Firefox and WebKit (see
// web-platform-tests/interop#997). Do not "improve" this by adding an alpha
// channel.
//
// WHY THE VALIDATION IS NOT ffprobe
// ffmpeg's AVIF demuxer reads only the primary item, so `ffprobe` reports
// nb_frames=1 for a perfectly good 151-frame sequence. The real frame count is
// the sample count in the `stsz` box, which is what assertAvifSequence reads.
// Verified against Chrome's own WebCodecs ImageDecoder, which reports
// animated:true / frameCount:151 for these files.
//
// ADDING OR REPLACING A CLIP
// Every animated state is one entry in CLIPS below: a state name (the
// BACKGROUNDS key in lootbox-thor/icons.js), a source filename, and the CSS card
// box the footage was composed for. Swapping the mp4 for an EXISTING state needs
// no code change at all: the hash (and therefore every URL) changes on its own,
// and the only shape check that survives is that the new footage's aspect ratio
// still matches its card box (assertRatioMatches) — not its literal pixel
// dimensions, so a differently-sized re-export of the same footage is accepted
// automatically. Adding a WHOLLY NEW animated state does need a new CLIPS entry
// here, plus wiring it into BACKGROUNDS in lootbox-thor/icons.js — that part
// cannot be automatic, because a new state is new markup by definition.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

const SOURCE_DIR = path.join(repoRoot, 'lootbox-thor/animation-source')
const OUTPUT_DIR = path.join(repoRoot, 'lootbox-thor/assets/images/backgrounds-anim')
const MANIFEST_PATH = path.join(repoRoot, 'lootbox-thor/backgrounds-anim.generated.js')
/** Where --emit-frames drops PNG sequences. Outside assets/ so neither
 * scripts/build.js nor scripts/convert-webp.mjs ever walks into it. */
const FRAMES_DIR = path.join(SOURCE_DIR, 'frames')

/**
 * One entry per source clip. `state` is the BACKGROUNDS key in
 * lootbox-thor/icons.js, NOT the source filename — `loked.mp4` carries a typo
 * that must not reach a public URL.
 *
 * `box` is the CSS card box the clip was composed for: 208x320 for today's live
 * card, 208x288 for a history/locked one. Its ratio is asserted against every
 * source video (assertRatioMatches, below) so a replacement of the wrong shape
 * fails loudly instead of being squashed by `object-fit: fill` at runtime —
 * deliberately a ratio check, not an exact-pixel one, so a differently-sized
 * re-export of the same footage needs no change here.
 *
 * Only `available` and `locked` animate. Source videos exist for `missed` and
 * `previous` too (`mised.mp4`, `was_win.mp4` in animation-source/), but those two
 * card states were reverted to their original static rasters — see BACKGROUNDS in
 * icons.js — so they are deliberately NOT listed here. Do not add them back
 * without the accompanying icons.js/theme.css wiring this once had; see git
 * history around "revert missed/previous animation" for what that entailed.
 */
const CLIPS = Object.freeze([
  Object.freeze({
    state: 'available',
    source: 'active.mp4',
    box: Object.freeze({ width: 208, height: 320 }),
  }),
  Object.freeze({
    state: 'locked',
    source: 'loked.mp4',
    box: Object.freeze({ width: 208, height: 288 }),
  }),
])

/** 1x is 208 CSS px — the card's width on mobile, where the container query
 * pins it (core/base.css). 3x is still a downscale from both sources. */
const DENSITIES = Object.freeze([1, 1.5, 2, 2.5, 3])

/** The animated-WebP fallback stops at 2x on purpose: VP8 costs ~1.5-2.5x AVIF
 * at matched quality, and the browsers that need it are the older ones. They
 * upscale a 416-wide loop instead, which on a soft glow is imperceptible. */
const WEBP_MAX_WIDTH = 416

/**
 * CICP (nclx colr box) written into every AVIF: BT.709 primaries / sRGB
 * transfer / BT.601 matrix, limited range.
 *
 * Measured, not assumed. Both sources have all four colour fields `unknown`, so
 * the question is how ffmpeg decodes them — and it turns out to be the BT.601
 * matrix, not BT.709. Round-tripping frame 0 through each candidate and
 * comparing against ffmpeg's own RGB output gives PSNR 39.7 dB for matrix 6
 * against 29.9 dB for matrix 1 (the green channel is the giveaway: SSIM 0.98 vs
 * 0.55). Re-run that comparison if the source videos are ever re-exported with
 * real colour tags.
 */
const CICP = '1/13/6'

const DEFAULTS = Object.freeze({
  quality: 65,
  posterQuality: 82,
  fps: 15,
  speed: 6,
  encoder: 'avifenc',
})

/** The 1x animated AVIF is what a mobile client actually downloads. */
const BUDGET_1X_BYTES = 800 * 1024
/** Any single file above this is worth shouting about even if it is off-budget-path. */
const WARN_FILE_BYTES = 3 * 1024 * 1024

/** Bumped when the output layout changes in a way that must invalidate hashes. */
const SCHEMA_VERSION = 1

/** Only files matching this are ever pruned as stale (see pruneStale) — anything
 * else is reported and left alone. Derived from CLIPS so a new state is never a
 * second place this needs updating. */
const OUTPUT_NAME_RE = new RegExp(
  `^(${CLIPS.map((clip) => clip.state).join('|')})(-poster)?-(\\d+)w\\.([0-9a-f]{8})\\.(avif|webp)$`,
)

const USAGE = `Builds Thor's animated card backgrounds from lootbox-thor/animation-source/.

Usage: node scripts/build-card-animations.mjs [flags]

  --quality=N          0-100 for the animated loops. Default ${DEFAULTS.quality}.
  --poster-quality=N   0-100 for the static posters. Default ${DEFAULTS.posterQuality}
                       (matches the q82 of the existing static rasters).
  --fps=N              Output frame rate. Default ${DEFAULTS.fps}.
  --speed=N            avifenc speed 0-10, lower is smaller/slower. Default ${DEFAULTS.speed}.
  --only=STATE         Encode one clip (${CLIPS.map((clip) => clip.state).join('|')}).
                       The others' files must already exist with the current hash.
  --force              Re-encode even when the hashed outputs are all present.
  --fail-on-budget     Exit 1 instead of warning when a 1x AVIF exceeds 800KB.
  --emit-frames        Also dump the 15fps PNG sequence per density, for manual
                       conversion elsewhere. Written to animation-source/frames/.
  --dry-run            Print the plan, hashes and commands; encode nothing.
  --help               This text.
`

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const options = { ...DEFAULTS, only: '', force: false, failOnBudget: false, emitFrames: false, dryRun: false }

  for (const arg of argv) {
    const [key, rawValue] = arg.split('=')
    const value = rawValue ?? ''
    switch (key) {
      case '--help': process.stdout.write(USAGE); process.exit(0); break
      case '--quality': options.quality = Number(value); break
      case '--poster-quality': options.posterQuality = Number(value); break
      case '--fps': options.fps = Number(value); break
      case '--speed': options.speed = Number(value); break
      case '--only': options.only = value; break
      case '--force': options.force = true; break
      case '--fail-on-budget': options.failOnBudget = true; break
      case '--emit-frames': options.emitFrames = true; break
      case '--dry-run': options.dryRun = true; break
      default:
        throw new Error(`Unknown flag: ${arg}\n\n${USAGE}`)
    }
  }

  for (const key of ['quality', 'posterQuality', 'fps', 'speed']) {
    if (!Number.isFinite(options[key])) throw new Error(`--${key} must be a number`)
  }
  if (options.quality < 0 || options.quality > 100) throw new Error('--quality must be 0-100')
  if (options.posterQuality < 0 || options.posterQuality > 100) throw new Error('--poster-quality must be 0-100')
  if (options.fps <= 0) throw new Error('--fps must be positive')
  if (options.only && !CLIPS.some((clip) => clip.state === options.only)) {
    throw new Error(`--only must be one of: ${CLIPS.map((c) => c.state).join(', ')}`)
  }

  return Object.freeze(options)
}

// --- process helpers --------------------------------------------------------

function run(bin, args) {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    const stderr = (err.stderr || '').toString().trim()
    throw new Error(`${bin} failed (exit ${err.status}):\n${stderr || err.message}`)
  }
}

/** ffmpeg piped into avifenc. Two processes, so this is the one place a shell is
 * warranted; every interpolated path is repo- or tmpdir-owned. */
function runPiped(command) {
  try {
    return execFileSync('/bin/sh', ['-c', command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    const stderr = (err.stderr || '').toString().trim()
    throw new Error(`pipeline failed (exit ${err.status}):\n${command}\n${stderr || err.message}`)
  }
}

function toolVersion(bin, args, pattern) {
  const out = run(bin, args)
  const match = out.match(pattern)
  return match ? match[1] : out.split('\n')[0].trim()
}

function preflight() {
  const required = [
    ['ffmpeg', ['-version'], 'brew install ffmpeg'],
    ['ffprobe', ['-version'], 'brew install ffmpeg'],
    ['avifenc', ['--version'], 'brew install libavif'],
    ['avifdec', ['--version'], 'brew install libavif'],
    ['img2webp', ['-version'], 'brew install webp'],
    ['cwebp', ['-version'], 'brew install webp'],
  ]

  const missing = []
  for (const [bin, args, hint] of required) {
    try {
      execFileSync(bin, args, { stdio: 'ignore' })
    } catch (err) {
      // Non-zero exit is fine (several of these have no --version); ENOENT is not.
      if (err.code === 'ENOENT') missing.push(`  ${bin}  ->  ${hint}`)
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required tools:\n${missing.join('\n')}`)
  }

  return Object.freeze({
    ffmpeg: toolVersion('ffmpeg', ['-version'], /^ffmpeg version (\S+)/),
    avifenc: toolVersion('avifenc', ['--version'], /^Version: (\S+)/),
    // Probed via cwebp: img2webp prints the same libwebp version but only after
    // a "[no output file specified]" line, and both ship from one formula.
    libwebp: toolVersion('cwebp', ['-version'], /^(\S+)/),
  })
}

// --- planning ---------------------------------------------------------------

function probeSource(file) {
  const raw = run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames,r_frame_rate:format=duration',
    '-of', 'json', file,
  ])
  const parsed = JSON.parse(raw)
  const stream = parsed.streams?.[0]
  if (!stream) throw new Error(`No video stream in ${file}`)
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    frames: Number(stream.nb_frames),
    duration: Number(parsed.format?.duration),
  }
}

/** How far a source's aspect ratio may drift from its target card box before the
 * build refuses to touch it. 1% comfortably covers the ~0.06% drift every clip so
 * far actually measures (they are all composed almost exactly to their box),
 * while still catching a genuinely wrong file — wrong orientation, wrong crop,
 * the wrong clip renamed into an existing slot. */
const RATIO_TOLERANCE = 0.01

/**
 * Validates a source's aspect ratio against its card box — deliberately not its
 * literal pixel dimensions, so replacing a clip with a different-resolution
 * re-export of the same footage needs no change to CLIPS. `object-fit: fill`
 * (see the note on .lb-card__bg in lootbox-thor/theme.css) does not crop a
 * mismatch, it squashes it, which is why this is a hard failure rather than a
 * warning.
 */
function assertRatioMatches(clip, probed) {
  const sourceRatio = probed.width / probed.height
  const boxRatio = clip.box.width / clip.box.height
  const drift = Math.abs(sourceRatio - boxRatio) / boxRatio
  if (drift > RATIO_TOLERANCE) {
    throw new Error(
      `${clip.source} is ${probed.width}x${probed.height} (ratio ${sourceRatio.toFixed(4)}), which does not ` +
        `match the ${clip.box.width}x${clip.box.height} card box for state "${clip.state}" ` +
        `(ratio ${boxRatio.toFixed(4)}) within ${(RATIO_TOLERANCE * 100).toFixed(0)}%. Re-export the footage ` +
        `composed to this card's ratio, or update CLIPS[].box if the target box itself changed.`,
    )
  }
}

/** Even dimensions only: yuv420p subsamples chroma by 2 on both axes. */
function toEven(value) {
  const rounded = Math.round(value)
  return rounded % 2 === 0 ? rounded : rounded + 1
}

function ladderFor(clip, probed) {
  return DENSITIES.map((density) => {
    const width = toEven(clip.box.width * density)
    const height = toEven(clip.box.height * density)
    if (width > probed.width || height > probed.height) {
      throw new Error(
        `${clip.state}: ${density}x (${width}x${height}) would upscale ` +
          `${clip.source} (${probed.width}x${probed.height})`,
      )
    }
    return { density, width, height, webp: width <= WEBP_MAX_WIDTH }
  })
}

/** Everything that determines the delivered bytes. Changing any of it must
 * change every URL, which is why the tool versions are in here: otherwise a
 * toolchain upgrade silently swaps the bytes under an unchanged filename. */
function settingsFingerprint(options, versions) {
  return {
    schemaVersion: SCHEMA_VERSION,
    quality: options.quality,
    posterQuality: options.posterQuality,
    fps: options.fps,
    speed: options.speed,
    encoder: options.encoder,
    densities: [...DENSITIES],
    webpMaxWidth: WEBP_MAX_WIDTH,
    cicp: CICP,
    pixFmt: 'yuv420p',
    scaleFlags: 'lanczos',
    ffmpeg: versions.ffmpeg,
    avifenc: versions.avifenc,
    libwebp: versions.libwebp,
  }
}

/**
 * Hash of the source bytes plus the settings — deliberately NOT a hash of the
 * output files.
 *
 * libaom is not bit-deterministic across versions, thread counts or speed
 * settings, so hashing the outputs would rename all 36 files whenever an
 * incidental byte shifted, producing a large meaningless git diff and a pointless
 * CDN re-upload. Hashing the inputs gives the property that actually matters —
 * replace a source video and every URL changes — while keeping re-runs a no-op.
 */
function hashClip(sourcePath, fingerprint) {
  return createHash('sha256')
    .update(fs.readFileSync(sourcePath))
    .update(JSON.stringify(fingerprint, Object.keys(fingerprint).sort()))
    .digest('hex')
    .slice(0, 8)
}

function outputName({ state, width, hash, ext, poster = false }) {
  return `${state}${poster ? '-poster' : ''}-${width}w.${hash}.${ext}`
}

function planClip(clip, probed, hash, options) {
  const ladder = ladderFor(clip, probed)
  const targetFrames = Math.round(probed.duration * options.fps)
  const files = []

  for (const rung of ladder) {
    files.push({ kind: 'anim-avif', ...rung, name: outputName({ state: clip.state, width: rung.width, hash, ext: 'avif' }) })
    if (rung.webp) {
      files.push({ kind: 'anim-webp', ...rung, name: outputName({ state: clip.state, width: rung.width, hash, ext: 'webp' }) })
    }
    files.push({ kind: 'poster-avif', ...rung, name: outputName({ state: clip.state, width: rung.width, hash, ext: 'avif', poster: true }) })
    files.push({ kind: 'poster-webp', ...rung, name: outputName({ state: clip.state, width: rung.width, hash, ext: 'webp', poster: true }) })
  }

  return { clip, probed, hash, ladder, targetFrames, files }
}

// --- encoding ---------------------------------------------------------------

/** Decode + fps-resample + scale. Shared by every encoder below, so the pixels
 * they each see are identical. `fps` first in the chain so lanczos runs on the
 * decimated frame count rather than all 241. */
function videoFilter(width, height, fps) {
  return `fps=${fps},scale=${width}:${height}:flags=lanczos,format=yuv420p`
}

function ffmpegDecodeArgs(source) {
  // -map 0:v:0 -an -sn -dn strips the AAC track the sources carry, plus any
  // data/subtitle stream. -map_metadata -1 drops creation-time/encoder tags:
  // hygiene for a public asset and one less source of run-to-run variance.
  return ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', source,
    '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1']
}

function avifAnimCommand(source, out, rung, options) {
  const ff = [
    'ffmpeg', ...ffmpegDecodeArgs(source),
    '-vf', `"${videoFilter(rung.width, rung.height, options.fps)}"`,
    '-fps_mode', 'cfr',
    '-f', 'yuv4mpegpipe', '-',
  ].join(' ')
  const enc = [
    'avifenc', '--stdin',
    // --fps is the sequence timescale; every frame is 1 tick long, so this is fps.
    '--fps', String(options.fps),
    '-q', String(options.quality),
    '-s', String(options.speed),
    '-j', 'all',
    // -k 0 disables intermediate keyframes: a browser always plays an animated
    // image from frame 0, so seek granularity buys nothing and costs bytes.
    '-k', '0',
    '--repetition-count', 'infinite',
    '--cicp', CICP,
    `"${out}"`,
  ].join(' ')
  return `${ff} | ${enc}`
}

function encodeAnimAvif(source, out, rung, options) {
  runPiped(avifAnimCommand(source, out, rung, options))
}

function extractFrames(source, dir, rung, options) {
  fs.mkdirSync(dir, { recursive: true })
  run('ffmpeg', [
    ...ffmpegDecodeArgs(source),
    '-vf', videoFilter(rung.width, rung.height, options.fps),
    '-fps_mode', 'cfr',
    path.join(dir, 'f-%04d.png'),
  ])
  return fs.readdirSync(dir).filter((name) => name.endsWith('.png')).sort()
}

/**
 * img2webp over the PNG sequence.
 *
 * `-lossy` is not optional: img2webp defaults to LOSSLESS for PNG input, which
 * turns a 290KB loop into a 5.2MB one. The per-frame duration is
 * round(1000/fps) ms, so at 15fps the loop runs 151*67 = 10.117s against the
 * AVIF's exact 10.067s — a 0.5% drift that no one can see on an ambient glow,
 * and the price of WebP storing durations as whole milliseconds.
 */
function encodeAnimWebp(frameDir, frameNames, out, options) {
  run('img2webp', [
    '-loop', '0',
    '-lossy', '-q', String(options.quality), '-m', '6',
    '-d', String(Math.round(1000 / options.fps)),
    ...frameNames.map((name) => path.join(frameDir, name)),
    '-o', out,
  ])
}

function extractPoster(source, out, rung) {
  run('ffmpeg', [
    ...ffmpegDecodeArgs(source),
    '-vf', `select=eq(n\\,0),scale=${rung.width}:${rung.height}:flags=lanczos`,
    '-frames:v', '1',
    out,
  ])
}

/** Still AVIF from the poster PNG. A single input means avifenc writes major
 * brand `avif` (not `avis`) with the still_picture flag, which is what
 * assertAvifStill checks for. */
function encodePosterAvif(posterPng, out, options) {
  run('avifenc', [
    '-q', String(options.posterQuality),
    '-s', String(options.speed),
    '-j', 'all',
    '-y', '420',
    '--cicp', CICP,
    '-r', 'limited',
    posterPng, out,
  ])
}

function encodePosterWebp(posterPng, out, options) {
  run('cwebp', ['-q', String(options.posterQuality), '-m', '6', '-quiet', posterPng, '-o', out])
}

// --- assertions -------------------------------------------------------------

function readBox(buffer, tag) {
  return buffer.indexOf(Buffer.from(tag, 'ascii'))
}

function ftypBrands(buffer) {
  const size = buffer.readUInt32BE(0)
  return {
    major: buffer.subarray(8, 12).toString('ascii'),
    compatible: buffer.subarray(16, Math.min(size, 64)).toString('ascii'),
  }
}

/** Sample count of the sequence track — the honest frame count, since ffprobe
 * only ever sees the primary item (see the header note). */
function avifSampleCount(buffer) {
  const at = readBox(buffer, 'stsz')
  if (at < 0) return 0
  return buffer.readUInt32BE(at + 12)
}

function assertAvifSequence(file, expectedFrames) {
  const buffer = fs.readFileSync(file)
  const { major, compatible } = ftypBrands(buffer)

  // `avis` is the single bit Chrome and Firefox switch on to treat an AVIF as
  // animated; `pitm` is the still primary item Firefox additionally requires.
  if (major !== 'avis') throw new Error(`${path.basename(file)}: ftyp major brand is "${major}", expected "avis" — this would render as a still image`)
  if (!compatible.includes('avif')) throw new Error(`${path.basename(file)}: "avif" missing from compatible brands`)
  for (const tag of ['pitm', 'moov', 'iloc', 'iinf']) {
    if (readBox(buffer, tag) < 0) throw new Error(`${path.basename(file)}: missing ${tag} box`)
  }

  const frames = avifSampleCount(buffer)
  if (frames < 2) throw new Error(`${path.basename(file)}: only ${frames} sample(s) — not a sequence`)
  if (Math.abs(frames - expectedFrames) > 2) {
    throw new Error(`${path.basename(file)}: ${frames} frames, expected ~${expectedFrames}`)
  }
  return frames
}

function assertAvifStill(file) {
  const buffer = fs.readFileSync(file)
  const { major } = ftypBrands(buffer)
  if (major !== 'avif') throw new Error(`${path.basename(file)}: poster ftyp major brand is "${major}", expected "avif"`)
  if (readBox(buffer, 'moov') >= 0) throw new Error(`${path.basename(file)}: poster carries a moov box — it is a sequence, not a still`)
}

function assertWebpAnimated(file, expectedFrames) {
  const buffer = fs.readFileSync(file)
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error(`${path.basename(file)}: not a RIFF/WEBP file`)
  }
  // VP8X is the extended header that carries the animation flag; ANIM holds the
  // loop count; one ANMF per frame.
  for (const tag of ['VP8X', 'ANIM']) {
    if (readBox(buffer, tag) < 0) throw new Error(`${path.basename(file)}: missing ${tag} chunk — not animated`)
  }
  let frames = 0
  for (let at = buffer.indexOf('ANMF'); at >= 0; at = buffer.indexOf('ANMF', at + 4)) frames += 1
  if (Math.abs(frames - expectedFrames) > 2) {
    throw new Error(`${path.basename(file)}: ${frames} ANMF frames, expected ~${expectedFrames}`)
  }
  return frames
}

// --- manifest ---------------------------------------------------------------

function candidateList(indent, entries) {
  const pad = ' '.repeat(indent)
  return entries
    .map((entry) => `${pad}Object.freeze({ url: \`\${BASE}/${entry.name}\`, width: ${entry.width} }),`)
    .join('\n')
}

function manifestForClip(plan, frames, options) {
  const { clip, hash } = plan
  const pick = (kind) => plan.files.filter((file) => file.kind === kind).sort((a, b) => a.width - b.width)
  const durationMs = Math.round((frames * 1000) / options.fps)

  return `  ${clip.state}: Object.freeze({
    hash: '${hash}',
    // The CSS card box this art was composed for; also its exact aspect ratio,
    // which is why \`object-fit: fill\` never distorts a settled card.
    box: Object.freeze({ width: ${clip.box.width}, height: ${clip.box.height} }),
    fps: ${options.fps},
    frames: ${frames},
    durationMs: ${durationMs},
    avif: Object.freeze([
${candidateList(6, pick('anim-avif'))}
    ]),
    webp: Object.freeze([
${candidateList(6, pick('anim-webp'))}
    ]),
    poster: Object.freeze({
      avif: Object.freeze([
${candidateList(8, pick('poster-avif'))}
      ]),
      webp: Object.freeze([
${candidateList(8, pick('poster-webp'))}
      ]),
    }),
  }),`
}

function writeManifest(results, options, versions) {
  const states = results.map((result) => result.plan.clip.state)
  const body = results.map((result) => manifestForClip(result.plan, result.frames, options)).join('\n')

  const source = `// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run build:animations
//
// Animated portal loops for the Thor card background, built from
// lootbox-thor/animation-source/ by scripts/build-card-animations.mjs.
//
// Paths are relative to lootbox-thor/index.html, exactly like icons.js: these are
// HTML attribute values, resolved against the document, not module specifiers.
//
// The hash in each filename is derived from the source video bytes plus the full
// encoder-settings object, so replacing a source video changes every URL and no
// CDN can serve a stale animation. Same source + same settings + same tools =>
// same names, so re-running this produces no git diff.
//
// AVIF carries the full ${DENSITIES[0]}x-${DENSITIES[DENSITIES.length - 1]}x ladder; the animated-WebP fallback stops at
// ${WEBP_MAX_WIDTH}px wide on purpose — VP8 measures 3-4x the AVIF bytes on this
// material, and the browsers that need it are the older ones. They upscale the
// ${WEBP_MAX_WIDTH}-wide loop, which on a soft glow is imperceptible.
//
// Built with quality ${options.quality} (posters ${options.posterQuality}), ${options.fps} fps, no alpha, infinite loop,
// CICP ${CICP} limited range, ${versions.avifenc ? `avifenc ${versions.avifenc}` : 'avifenc'} / libwebp ${versions.libwebp} / ffmpeg ${versions.ffmpeg}.

const BASE = './assets/images/backgrounds-anim';

export const BG_ANIM = Object.freeze({
${body}
});

/** States that have an animated background; the rest keep their static raster. */
export const BG_ANIM_STATES = Object.freeze([${states.map((state) => `'${state}'`).join(', ')}]);
`

  fs.writeFileSync(MANIFEST_PATH, source)
}

// --- cleanup ----------------------------------------------------------------

/**
 * Deletes outputs that are no longer part of the plan — but ONLY files matching
 * OUTPUT_NAME_RE. Anything unrecognised is reported and kept: a bug in name
 * generation must not be able to unlink a stray file, and silent deletion is
 * exactly how an asset directory gets emptied.
 */
function pruneStale(expected) {
  if (!fs.existsSync(OUTPUT_DIR)) return { pruned: [], skipped: [] }
  const pruned = []
  const skipped = []

  for (const entry of fs.readdirSync(OUTPUT_DIR)) {
    if (expected.has(entry)) continue
    if (OUTPUT_NAME_RE.test(entry)) {
      fs.unlinkSync(path.join(OUTPUT_DIR, entry))
      pruned.push(entry)
    } else {
      skipped.push(entry)
    }
  }
  return { pruned, skipped }
}

// --- reporting --------------------------------------------------------------

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`

function report(results, prune, options) {
  process.stdout.write(`\n${path.relative(repoRoot, OUTPUT_DIR)}/\n`)

  let total = 0
  const budgetRows = []

  for (const { plan, encoded, frames, skipped } of results) {
    const clipTotal = encoded.reduce((sum, file) => sum + file.bytes, 0)
    total += clipTotal

    process.stdout.write(`\n  ${plan.clip.state}  (${plan.clip.source}, hash ${plan.hash}, ${frames} frames`)
    process.stdout.write(skipped ? ', unchanged — skipped)\n' : ')\n')

    if (!skipped) {
      for (const file of encoded) {
        const seconds = file.ms > 0 ? `  ${(file.ms / 1000).toFixed(1)}s` : ''
        process.stdout.write(`    ${file.name.padEnd(44)} ${kb(file.bytes).padStart(7)}${seconds}\n`)
      }
    }

    const byKind = (kind) => encoded.filter((file) => file.kind === kind).reduce((sum, file) => sum + file.bytes, 0)
    process.stdout.write(
      `    ${'ladder'.padEnd(44)} ${kb(byKind('anim-avif')).padStart(7)} avif  ` +
        `${kb(byKind('anim-webp'))} webp  ${kb(byKind('poster-avif') + byKind('poster-webp'))} posters\n`,
    )

    const oneX = encoded.find((file) => file.kind === 'anim-avif' && file.width === plan.clip.box.width)
    if (oneX) budgetRows.push({ name: oneX.name, bytes: oneX.bytes })

    for (const file of encoded) {
      if (file.bytes > WARN_FILE_BYTES) {
        process.stdout.write(`    ! ${file.name} is ${kb(file.bytes)} — above the ${kb(WARN_FILE_BYTES)} sanity limit\n`)
      }
    }
    for (const avif of encoded.filter((file) => file.kind === 'anim-avif')) {
      const webp = encoded.find((file) => file.kind === 'anim-webp' && file.width === avif.width)
      // VP8 against AV1 on this material measures 3.1-3.8x, so the threshold sits
      // above that: it is here to catch a quality setting that maps pathologically
      // across the two formats, not to restate the format gap on every run.
      if (webp && webp.bytes > avif.bytes * 4.5) {
        process.stdout.write(
          `    ! ${webp.name} is ${(webp.bytes / avif.bytes).toFixed(1)}x its AVIF sibling — quality ${options.quality} may map badly across formats\n`,
        )
      }
    }
  }

  if (prune.pruned.length > 0) {
    process.stdout.write(`\n  pruned ${prune.pruned.length} stale file(s)\n`)
    for (const name of prune.pruned) process.stdout.write(`    - ${name}\n`)
  }
  if (prune.skipped.length > 0) {
    process.stdout.write(`\n  left alone (unrecognised, not deleted):\n`)
    for (const name of prune.skipped) process.stdout.write(`    ? ${name}\n`)
  }

  process.stdout.write(`\n  TOTAL ${kb(total)}\n`)

  process.stdout.write(`\n  Budget — 1x animated AVIF vs ${kb(BUDGET_1X_BYTES)}:\n`)
  let over = false
  for (const row of budgetRows) {
    const pct = Math.round((row.bytes / BUDGET_1X_BYTES) * 100)
    const verdict = row.bytes <= BUDGET_1X_BYTES ? 'ok' : 'OVER'
    if (row.bytes > BUDGET_1X_BYTES) over = true
    process.stdout.write(`    ${row.name.padEnd(44)} ${kb(row.bytes).padStart(7)}  ${verdict}  (${pct}% of budget)\n`)
  }

  if (over) {
    const message = `1x AVIF exceeds the ${kb(BUDGET_1X_BYTES)} budget — lower --quality or --fps`
    if (options.failOnBudget) throw new Error(message)
    process.stdout.write(`\n  WARNING: ${message}\n`)
  }
}

// --- main -------------------------------------------------------------------

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-anim-'))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function encodeClip(plan, options) {
  const source = path.join(SOURCE_DIR, plan.clip.source)
  const encoded = []
  let frames = 0

  withTempDir((tmp) => {
    for (const rung of plan.ladder) {
      const needsFrames = plan.files.some((file) => file.kind === 'anim-webp' && file.width === rung.width)
      let frameDir = null
      let frameNames = []

      if (needsFrames || options.emitFrames) {
        frameDir = options.emitFrames
          ? path.join(FRAMES_DIR, `${plan.clip.state}-${rung.width}w`)
          : path.join(tmp, `${rung.width}w`)
        const started = Date.now()
        frameNames = extractFrames(source, frameDir, rung, options)
        process.stdout.write(`    ${plan.clip.state} ${rung.width}w: ${frameNames.length} PNG frames (${((Date.now() - started) / 1000).toFixed(1)}s)\n`)
      }

      const posterPng = path.join(tmp, `poster-${rung.width}.png`)
      extractPoster(source, posterPng, rung)

      for (const file of plan.files.filter((candidate) => candidate.width === rung.width)) {
        const out = path.join(OUTPUT_DIR, file.name)
        const started = Date.now()

        switch (file.kind) {
          case 'anim-avif':
            encodeAnimAvif(source, out, rung, options)
            frames = assertAvifSequence(out, plan.targetFrames)
            break
          case 'anim-webp':
            encodeAnimWebp(frameDir, frameNames, out, options)
            assertWebpAnimated(out, plan.targetFrames)
            break
          case 'poster-avif':
            encodePosterAvif(posterPng, out, options)
            assertAvifStill(out)
            break
          case 'poster-webp':
            encodePosterWebp(posterPng, out, options)
            break
          default:
            throw new Error(`Unknown output kind: ${file.kind}`)
        }

        encoded.push({ ...file, bytes: fs.statSync(out).size, ms: Date.now() - started })
      }

      if (frameDir && !options.emitFrames) fs.rmSync(frameDir, { recursive: true, force: true })
    }
  })

  return { encoded, frames }
}

function readExistingFrames(plan) {
  const anim = plan.files.find((file) => file.kind === 'anim-avif')
  const file = path.join(OUTPUT_DIR, anim.name)
  return avifSampleCount(fs.readFileSync(file))
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const versions = preflight()
  const fingerprint = settingsFingerprint(options, versions)

  process.stdout.write(`ffmpeg ${versions.ffmpeg} (decode/scale) · avifenc ${versions.avifenc} · libwebp ${versions.libwebp}\n`)
  process.stdout.write(`quality ${options.quality} · posters ${options.posterQuality} · ${options.fps} fps · speed ${options.speed} · CICP ${CICP}\n`)

  // Every clip is planned even under --only, so the manifest and the prune set
  // stay complete. A partial plan would write a manifest pointing at files the
  // prune had just deleted.
  const plans = CLIPS.map((clip) => {
    const sourcePath = path.join(SOURCE_DIR, clip.source)
    if (!fs.existsSync(sourcePath)) throw new Error(`Missing source video: ${path.relative(repoRoot, sourcePath)}`)

    const probed = probeSource(sourcePath)
    assertRatioMatches(clip, probed)
    return planClip(clip, probed, hashClip(sourcePath, fingerprint), options)
  })

  const expected = new Set(plans.flatMap((plan) => plan.files.map((file) => file.name)))

  if (options.dryRun) {
    process.stdout.write('\n--dry-run: nothing will be encoded\n')
    for (const plan of plans) {
      process.stdout.write(`\n  ${plan.clip.state}  hash ${plan.hash}  ~${plan.targetFrames} frames\n`)
      for (const rung of plan.ladder) {
        process.stdout.write(`    ${rung.density}x  ${rung.width}x${rung.height}${rung.webp ? '  (+webp)' : ''}\n`)
      }
      const first = plan.ladder[0]
      process.stdout.write(`\n    ${avifAnimCommand(path.join(SOURCE_DIR, plan.clip.source), path.join(OUTPUT_DIR, plan.files[0].name), first, options)}\n`)
    }
    process.stdout.write(`\n  ${expected.size} files would be written to ${path.relative(repoRoot, OUTPUT_DIR)}/\n`)
    return
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const results = []
  for (const plan of plans) {
    const allPresent = plan.files.every((file) => {
      const at = path.join(OUTPUT_DIR, file.name)
      return fs.existsSync(at) && fs.statSync(at).size > 0
    })
    const selected = !options.only || options.only === plan.clip.state

    if (!selected) {
      if (!allPresent) {
        throw new Error(
          `--only=${options.only} but ${plan.clip.state}'s files are missing or stale (hash ${plan.hash}). ` +
            `Run without --only once so the manifest and the prune set stay truthful.`,
        )
      }
      results.push({ plan, encoded: describeExisting(plan), frames: readExistingFrames(plan), skipped: true })
      continue
    }

    if (allPresent && !options.force) {
      results.push({ plan, encoded: describeExisting(plan), frames: readExistingFrames(plan), skipped: true })
      continue
    }

    process.stdout.write(`\n  encoding ${plan.clip.state} (${plan.files.length} files)…\n`)
    const { encoded, frames } = encodeClip(plan, options)
    results.push({ plan, encoded, frames, skipped: false })
  }

  writeManifest(results, options, versions)
  const prune = pruneStale(expected)
  report(results, prune, options)

  process.stdout.write(`\n  manifest -> ${path.relative(repoRoot, MANIFEST_PATH)}\n`)
}

function describeExisting(plan) {
  return plan.files.map((file) => ({
    ...file,
    bytes: fs.statSync(path.join(OUTPUT_DIR, file.name)).size,
    ms: 0,
  }))
}

try {
  main()
} catch (err) {
  console.error(err.message || err)
  process.exit(1)
}

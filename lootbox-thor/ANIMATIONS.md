# Thor card animations — how the pipeline works

This document explains the whole path from a motion-designer's source video to a
pixel on screen: the conversion script, the file formats and the sizing ladder it
produces, the generated manifest, and the runtime code that decides which cards get
to animate and when. It is the deep-dive; [`README.md`](../README.md) has the short
version and the day-to-day commands.

Everything here is Thor-specific. Vegas has no animated backgrounds and none of
this applies to it.

## 1. What exists today

Two card states have an animated portal instead of a single static frame:

- **`available`** — today's card, and today's opened result (`prize` /
  `prediction` while `active: true`). Built from `active.mp4`.
- **`locked`**, but **only on the one card the player is actually waiting for** —
  the "next up" day the core already spotlights with `.lb-card--next`. Every other
  locked day (a month is up to 26 of them) shows the exact same portal as a single
  still frame. Built from `loked.mp4` (the typo is in the source filename, not a
  mistake here — see §3).

Everything else — `missed`, `missed-active`, `previous` — is unchanged: static
WebP rasters with their neon rim baked into the artwork, exactly as before this
feature existed.

The source videos live in `lootbox-thor/animation-source/` (git-tracked, ~3.3 MB).
They are a **build input**, not a shipped asset — `scripts/build.js` never touches
that folder, so no video reaches `dist/` or the CDN.

## 2. The conversion script

`scripts/build-card-animations.mjs`, run via:

```bash
npm run build:animations
```

### 2.1 What it needs, and why not just ffmpeg

The prerequisites are **system binaries**, not npm packages:

```bash
brew install ffmpeg libavif webp
```

The obvious design would be "ffmpeg does everything." It cannot, on this machine's
toolchain: Homebrew's ffmpeg 9.0 formula dropped `--enable-libaom` and
`--enable-libwebp`. Concretely:

- `ffmpeg -encoders` lists only `libsvtav1` for AV1. SVT-AV1 refuses
  single-picture AVIF mode in the versions that matter here, so it cannot produce
  the static posters at all — a hard blocker, not a quality tradeoff.
- ffmpeg's own `webp` / `webp_anim` codecs are **decode-only** in this build. There
  is no encoder for either static or animated WebP.

So the actual division of labour is:

- **ffmpeg** decodes the source video, resamples it to the target frame rate, and
  scales it. That is a job it does regardless of how its optional codecs were
  compiled, so it is the one piece of the pipeline that cannot regress under a
  future Homebrew upgrade.
- **`avifenc`** (from `libavif`, itself built on `libaom`) encodes every AVIF —
  animated and still. It is the reference encoder the AVIF ecosystem is built
  around, which matters for compatibility (see §4).
- **`img2webp`** and **`cwebp`** (from `libwebp`) encode animated and static WebP
  respectively.

The script's `preflight()` step checks for all of `ffmpeg`, `ffprobe`, `avifenc`,
`avifdec`, `img2webp`, `cwebp` before doing anything, and fails with the exact
`brew install …` line for whichever is missing — never a bare `ENOENT`.

### 2.2 The pipeline for one output file

For an animated AVIF rung, the shape is: decode + resample + scale in ffmpeg,
piped as raw YUV4MPEG straight into `avifenc` on stdin — no intermediate file.

```
ffmpeg -hide_banner -nostdin -loglevel error -y -i <source> \
  -map 0:v:0 -an -sn -dn -map_metadata -1 \
  -vf "fps=15,scale=<W>:<H>:flags=lanczos,format=yuv420p" \
  -fps_mode cfr -f yuv4mpegpipe - \
| avifenc --stdin --fps 15 -q 65 -s 6 -j all -k 0 \
  --repetition-count infinite --cicp 1/13/6 <out>.avif
```

Read left to right:

| Flag | What it does and why |
|---|---|
| `-map 0:v:0 -an -sn -dn` | Keeps only the video stream. Both source videos carry an AAC audio track that must go, plus any data/subtitle stream that would otherwise confuse a single-stream muxer. |
| `-map_metadata -1` | Drops creation-time and encoder tags — a public asset shouldn't carry authoring metadata, and it removes one source of run-to-run byte variance. |
| `fps=15,...` (fps first) | Frame-rate conversion happens **before** the expensive Lanczos scale, so scaling runs on 151 decimated frames instead of the source's 241. |
| `scale=W:H:flags=lanczos` | Every output rung is a downscale from the source (see §3), and Lanczos preserves the thin neon rim far better than the default bicubic filter — the rim runs to the very edge of the frame, so edge sharpness is the thing worth spending cycles on. |
| `format=yuv420p` | Forces 8-bit 4:2:0, opaque — see §5 for why this is load-bearing, not incidental. |
| `-fps_mode cfr` | Constant frame duration: every sample is exactly 1/15 s, so the sequence timescale `avifenc` writes downstream is honest. |
| `-f yuv4mpegpipe -` | Streams raw frames to stdout instead of writing an intermediate file. |
| `avifenc --stdin --fps 15` | Reads that stream; `--fps` sets the sequence timescale (each frame is 1 tick, so this is literally the frame rate). |
| `-q 65` | Quality 0–100 on `avifenc`'s own scale — used directly, no remapping needed (unlike some AVIF tools that only expose a quantizer). |
| `-s 6` | Encoder speed 0–10 (0 slowest/smallest, 10 fastest/largest). 6 is the balance this pipeline ships with; tune with `--speed`. |
| `-j all` | Use every core. |
| `-k 0` | No intermediate keyframes. A browser always starts an animated image at frame 0, so mid-sequence seek is worthless here and a single keyframe is pure bytes saved. |
| `--repetition-count infinite` | Loops forever. |
| `--cicp 1/13/6` | Colour tagging — see §3.3, this number was measured, not assumed. |

Animated WebP follows the same decode/resample/scale, but through a different
path: `img2webp` takes a directory of PNG frames, not a pipe, so the script
extracts frames to a temp directory first (`extractFrames`), then runs:

```bash
img2webp -loop 0 -lossy -q 65 -m 6 -d 67 <frames>/*.png -o <out>.webp
```

Two flags here are not optional defaults:

- **`-lossy` is mandatory.** `img2webp` defaults to *lossless* for PNG input,
  which turned a 290 KB loop into a 5.2 MB one during development. This is the
  single easiest way to blow the size budget by accident if this command is ever
  hand-edited.
- **`-d 67`** is the per-frame duration in whole milliseconds
  (`round(1000/fps)`). WebP cannot store fractional millisecond durations, so at
  15 fps the loop plays back at 151 × 67 ms ≈ 10.117 s against the AVIF's exact
  10.067 s — a 0.5 % drift, invisible on an ambient glow.

Static posters (one frame each, both formats, every density) are simpler: extract
frame 0 with `select=eq(n\,0)`, then `avifenc` (with `-still-picture` semantics —
see §4.2) or `cwebp`, at `--poster-quality` (default 82, matching the existing
static rasters elsewhere in the repo) rather than the animation's 65.

### 2.3 The size ladder

| Density | `available` box (0.65 ratio) | `locked` box (0.7222 ratio) | AVIF | Animated WebP |
|---|---|---|---|---|
| 1x | 208×320 | 208×288 | ✅ | ✅ |
| 1.5x | 312×480 | 312×432 | ✅ | ✅ |
| 2x | 416×640 | 416×576 | ✅ | ✅ |
| 2.5x | 520×800 | 520×720 | ✅ | — |
| 3x | 624×960 | 624×864 | ✅ | — |

1x is 208 CSS pixels — the card's width on a narrow viewport, where
`core/base.css`'s container query pins `--lb-card-width` to a flat 208px. 3x is
still a *downscale* from both source videos (see §3.1), so nothing in this ladder
ever upscales.

The animated-WebP fallback stops at 2x (416px) on purpose: VP8 measures 3–4× the
AVIF byte count on this material (see the size report in §2.6), and the browsers
that actually need the WebP fallback are the older ones — they upscale the
416-wide loop, which is imperceptible on a soft ambient glow. AVIF gets the full
ladder because it is cheap there.

Every rung also gets a static poster, in both formats — five densities × two
formats × two purposes (poster / animation) plus the WebP cap, which works out to
18 files per clip, 36 total.

### 2.4 Filenames, hashing, and why re-running is a no-op

Every output filename carries an 8-hex-character hash:

```
available-416w.e61cc802.avif
available-poster-416w.e61cc802.webp
locked-208w.aa2e4413.avif
```

The hash is **`sha256(source video bytes ‖ every encoder setting ‖ tool
versions)`**, truncated to 8 hex characters — one hash per clip, shared by all 18
of that clip's outputs.

This is deliberately a hash of the *inputs*, not of the *output bytes*. AV1
encoding is not bit-deterministic across `libaom` versions, thread counts, or
speed settings — hashing the outputs would rename all 36 files on a toolchain
bump even though nothing meaningful changed, which is both git noise and a
pointless CDN re-upload. Hashing the inputs instead gives the property that
actually matters: **replace a source video (or change `--quality`/`--fps`/
anything else in the fingerprint) and every URL for that clip changes**, so a CDN
can never serve a stale animation under an old URL. Unchanged inputs → unchanged
hash → unchanged filenames → a re-run is a true no-op with zero git diff.

The tool versions (`ffmpeg`, `avifenc`, `libwebp`) are part of the fingerprint for
the same reason: without them, upgrading the toolchain would silently change the
delivered bytes under an unchanged URL, which defeats the entire point of
content-hashing.

Because the hash already encodes "has anything relevant changed," the script
needs no separate state file: if all 18 expected files for a clip already exist on
disk, it skips re-encoding that clip entirely (`--force` overrides this). This
matters in practice — a full cold build takes several minutes of `libaom`/
`libwebp` encoding.

### 2.5 Validation — every output is checked, not just written

Both AVIF and WebP get structural checks immediately after encoding, because a
silently malformed animated image looks fine as a file and renders as a static
picture in a browser (see §4 for exactly what can go wrong and why).

- **`assertAvifSequence`** reads the raw bytes: the `ftyp` box's major brand must
  be `avis` (not `avif`), `avif` must appear among the compatible brands, and the
  `pitm`/`moov`/`iloc`/`iinf` boxes must all be present. It also reads the true
  frame count from the `stsz` box's sample count and checks it against the
  expected frame count — **not** from `ffprobe`, which cannot see it (§4.1).
- **`assertAvifStill`** checks the opposite for posters: major brand must be
  `avif` (a single-image file), and there must be **no** `moov` box — a poster
  that accidentally carries a sequence is not a poster.
- **`assertWebpAnimated`** checks for the `VP8X` extended header (the animation
  flag) and the `ANIM` chunk, then counts `ANMF` frame chunks against the
  expected count.

Any failure here throws immediately and the whole run exits non-zero — nothing
half-written reaches the manifest.

### 2.6 Stale-file cleanup and the size/budget report

After encoding, the script deletes anything in
`lootbox-thor/assets/images/backgrounds-anim/` that is not part of the current
plan — but **only** files matching the exact output-name pattern
(`^(available|locked)(-poster)?-\d+w\.[0-9a-f]{8}\.(avif|webp)$`). Anything that
doesn't match is reported and left alone; a bug in name generation must never be
able to delete an unrelated file, and silent deletion is exactly how an asset
directory gets emptied by accident.

The final report prints a per-file size table, per-clip totals, and a budget
check specifically for the **1x animated AVIF** — the file a mobile client
actually downloads first — against an 800 KB ceiling. As measured with the
current source videos: `available-208w` is ~81 KB (10 % of budget),
`locked-208w` is ~72 KB (9 %). `--fail-on-budget` turns a budget overrun into a
non-zero exit instead of a warning, for CI use.

### 2.7 Command-line flags

```
--quality=N          0-100 for the animated loops. Default 65.
--poster-quality=N   0-100 for the static posters. Default 82.
--fps=N              Output frame rate. Default 15.
--speed=N            avifenc speed 0-10, lower is smaller/slower. Default 6.
--only=STATE         Encode one clip (available|locked). The other clip's files
                     must already exist with the current hash — see below.
--force              Re-encode even when the hashed outputs are all present.
--fail-on-budget     Exit 1 instead of warning when a 1x AVIF exceeds 800KB.
--emit-frames        Also dump the 15fps PNG sequence per density, for manual
                     conversion elsewhere. See §6.
--dry-run            Print the plan, hashes and every ffmpeg/avifenc command
                     line; encode nothing.
--help               Usage text.
```

`--only` still *plans* both clips even though it only *encodes* one — otherwise
the generated manifest and the stale-file prune set would both be incomplete,
and running with `--only` would either delete the other clip's still-valid files
or write a manifest pointing at files that no longer exist. If the non-selected
clip's files are missing or hash-stale, the script refuses to proceed rather than
ship a manifest it cannot back up on disk.

## 3. The source videos, and the decisions that shaped the pipeline

### 3.1 What the sources actually are

| | `active.mp4` | `loked.mp4` |
|---|---|---|
| Maps to state | `available` | `locked` |
| Resolution | 776×1194 | 818×1132 |
| Ratio | 0.6499 | 0.7226 |
| Target card box | 208×320 (ratio 0.65) | 208×288 (ratio 0.7222) |
| Frame rate / duration / frames | 24 fps / 10.04 s / 241 | 24 fps / 10.04 s / 241 |
| Audio | AAC (stripped) | AAC (stripped) |

Both are pre-composed almost exactly to their target card ratio (0.06 % off),
which is why no cropping filter is needed anywhere in the pipeline — `scale`
alone is safe, and `object-fit: fill` at runtime never has to hide a mismatch (see
`lootbox-thor/theme.css`'s note on `.lb-card__bg`).

The script asserts the *raw* source dimensions (`776×1194` / `818×1132`) against
what it probes at the top of every run (`probeSource` + the `expect` field on each
`CLIPS` entry). If a source video is ever re-exported at a different resolution,
the build fails with an explicit message rather than silently reprocessing a file
whose ratio might no longer match its card box.

### 3.2 Frame rate: 24 → 15

The source is 24 fps; the pipeline resamples to 15. At 10.04 s that is 151 output
frames instead of 241 — roughly 37 % fewer frames to encode and store, on
material (a slow ambient portal glow) where the extra temporal resolution buys
nothing visible.

### 3.3 Colour tagging: measured, not assumed

Both source videos report all four colour-metadata fields as `unknown` — no
primaries, no transfer function, no matrix, no range. ffmpeg has to decode them
under *some* assumption, and the question the pipeline had to answer was: what
does it actually assume, so the AVIF output can be tagged to match (rather than
left as "unspecified," which pushes the guess onto every browser rendering it —
and inconsistently)?

This was settled by measurement, not documentation-reading: frame 0 was
round-tripped through candidate CICP matrices and compared, pixel-for-pixel,
against ffmpeg's own RGB decode of the same frame. Matrix 6 (BT.601) scored
39.7 dB PSNR against the reference; matrix 1 (BT.709) scored 29.9 dB, with the
green channel visibly off (SSIM 0.98 vs. 0.55). So the pipeline writes
`--cicp 1/13/6` — BT.709 primaries, sRGB transfer, **BT.601** matrix, limited
range — because that is what ffmpeg's decoder is actually doing with these two
files, regardless of what the "correct" tag for HD content is usually assumed to
be.

If the source videos are ever re-exported with real colour tags baked in, this
comparison should be re-run rather than assumed to still hold.

### 3.4 Even dimensions only

Every computed rung width/height is rounded to the nearest even number
(`toEven`). This is not cosmetic: `yuv420p` subsamples chroma by 2 in both
dimensions, so an odd dimension is invalid for that pixel format.

## 4. The one real risk: does this actually animate in a browser?

This is the question the whole pipeline exists to answer correctly, and getting
it wrong is **silent** — a malformed animated AVIF does not error, it just
displays as a still image.

### 4.1 Why `ffprobe` cannot be trusted here

ffmpeg's own AVIF demuxer only ever reads the *primary item* of an AVIF file —
which for an animated sequence is frame 0, stored as a still-image fallback for
software that doesn't understand animated AVIF at all. So `ffprobe` reports
`nb_frames=1` for a perfectly healthy 151-frame animated file. This is not a bug
in the file; it is ffmpeg's AVIF *reader* being conservative. The pipeline's own
validation (§2.5) reads the true frame count straight from the `stsz` box in the
container instead of trusting `ffprobe`.

This was cross-checked against Chrome's `ImageDecoder` (WebCodecs) API directly on
a built file, which reported `animated: true, frameCount: 151` — confirming the
container-level check and Chrome's own decoder agree, independent of `ffprobe`.

### 4.2 What actually makes an AVIF "animated" to a browser

An animated AVIF (the `avis` "AVIF Image Sequence" brand) needs, at minimum:

- `ftyp` major brand `avis` with `avif` among the compatible brands.
- A `pitm` (primary item) pointing at a still fallback frame — some engines
  (historically Firefox) require this to treat the file as animated at all,
  rather than only checking for a `moov`/sequence track.
- The `moov`/`iloc`/`iinf` machinery that actually describes the frame sequence.

`assertAvifSequence` (§2.5) checks exactly these markers on every file the
pipeline produces, so a future toolchain regression that silently drops one of
them fails the build instead of shipping a still image to production.

### 4.3 Why `avifenc`/`libaom`, and not an alternative AV1 encoder

`libsvtav1` — the only AV1 encoder ffmpeg 9.0 ships with on this machine — refuses
single-picture AVIF encoding in the versions available here, which rules it out
for the static posters outright. `avifenc` (driving `libaom`) is also the
reference tool the broader AVIF ecosystem is built and tested against, which
matters for exactly the compatibility question this section is about.

## 5. No alpha channel, anywhere, on purpose

Every encode — animated and still, AVIF and WebP — is opaque (`format=yuv420p`,
no alpha plane). This is not a size optimisation that happened to also help
compatibility; it is primarily a compatibility decision:

- Transparency is the one animated-AVIF bug class that has been reported as
  broken (and slow) simultaneously across Chromium, Firefox, and WebKit. Staying
  opaque sidesteps that class of bug entirely rather than working around it per
  engine.
- It also happens to be smaller, which helps the byte budget, but that is the
  secondary benefit.

The consequence is that the card's rounded corners and its 2px neon-coloured rim
**cannot** be baked into the video frame the way the three legacy (still) states
bake theirs in — a video frame has no alpha to round its corners with. Both are
drawn in CSS instead: `border-radius: inherit` all the way down through the
`<picture>` wrapper and the animation layer (see the `.lb-card__bg-frame` note in
`theme.css` — this exact chain was the source of a corner-artifact bug once, see
§8), and the rim is a `.lb-card::after` overlay coloured per state via a
`--lb-rim` custom property (`--lb-thor-rim-live: #ffe1ff` for the active card,
`--lb-thor-rim-locked: #4f5fef` for locked — both taken from the Figma reference,
nodes `215:35927` and `215:35929`).

## 6. The manual-conversion escape hatch: `--emit-frames`

If the automated encoders ever produce a file that fails validation, or a
completely different tool needs to take over, `--emit-frames` dumps the exact
15 fps PNG sequence the pipeline itself encodes from, per density, into
`lootbox-thor/animation-source/frames/<state>-<width>w/`. That directory is
`.gitignore`d and lives outside `assets/`, so it is never picked up by
`scripts/build.js` or by `scripts/convert-webp.mjs`'s recursive PNG→WebP sweep.

From there, any external tool or an online converter can take over — the frames
are already at the final resolution, frame rate, and colour handling the rest of
this pipeline assumes.

## 7. The generated manifest

`npm run build:animations` writes `lootbox-thor/backgrounds-anim.generated.js` —
marked **GENERATED, do not edit by hand** in its own header. It exports one frozen
object per animated state:

```js
export const BG_ANIM = Object.freeze({
  available: Object.freeze({
    hash: 'e61cc802',
    box: Object.freeze({ width: 208, height: 320 }),
    fps: 15,
    frames: 151,
    durationMs: 10067,
    avif: Object.freeze([ /* { url, width } ascending */ ]),
    webp: Object.freeze([ /* … */ ]),
    poster: Object.freeze({ avif: [...], webp: [...] }),
  }),
  locked: Object.freeze({ /* same shape, 208x288 box */ }),
});
```

This is a real `.js` module, not JSON — the widgets ship as plain ES modules with
no build step, so a manifest that needed a `fetch()` would be the wrong shape
entirely. Paths inside it (`./assets/images/backgrounds-anim/...`) are
document-relative HTML attribute values, exactly like the `BASE` constant in
`icons.js`, because that is what they are used as.

`lootbox-thor/icons.js` is the only consumer. It wraps each `BG_ANIM` entry into
the descriptor shape `render.js` actually needs — `{ poster: {avif, webp,
fallback}, anim: {avif, webp, fallback} | null }` — via three small helpers:

- **`animated(entry)`** — the full descriptor, poster **and** loop. Used for
  `BACKGROUNDS.available` and `BACKGROUNDS.locked`.
- **`posterOnly(entry)`** — same poster, `anim: null`. Used for
  `BACKGROUNDS.lockedStatic` — the same portal art, minus the loop, for every
  locked day that isn't the spotlighted one.
- **`still(url)`** — the pre-existing shape for the three legacy single-frame
  states, unchanged.

`anim` being present or `null` is the single signal the rest of the widget acts
on: it decides whether `render.js` emits the animation-layer markup at all, and
it is what `bg-anim.js`'s gate keys off of.

## 8. Runtime: who actually gets to animate, and when

This section is not the conversion pipeline, but it is why the pipeline's output
shape looks the way it does — the two are designed together.

### 8.1 Which card gets the loop

`backgroundFor` in `render.js` decides per card:

```js
case CARD_STATE.LOCKED:
  return spotlight ? BACKGROUNDS.locked : BACKGROUNDS.lockedStatic;
```

`spotlight` comes straight from the core (`findSpotlightLockedIndex` in
`core/runtime.js`, already used to add the `.lb-card--next` class) — it is `true`
for exactly one locked card, the first one immediately after a resolved day. Every
other locked card, and there can be up to 26 of them in a full month, renders
`lockedStatic`: the identical portal art, same CSS rim, just the first frame
instead of the loop. `available` has no such gate — today's card (and today's
opened result) always animates, because there is only ever one of it.

This is a deliberate scope decision, not a limitation of the tooling: the
pipeline is perfectly capable of producing 26 independent loops, the runtime
simply chooses not to run them all at once (see §8.3 for the containment
mechanism that exists anyway, on top of this).

### 8.2 Eager poster, lazy loop

Every animated background renders as **two layers**: an eager `<picture>`
(`.lb-card__bg-frame` → `.lb-card__bg`) with the responsive poster, and — only
when `anim` is present — a lazy `<span data-lb-bg-anim>` layered on top, holding
the loop's `<picture>` with its candidates parked in `data-srcset` (not
`srcset`) so nothing is requested until something promotes them.

Three details here are load-bearing, documented at length in `render.js`'s
`renderBackground`:

1. The poster must stay eager. `core/runtime.js`'s `whenImagesReady` gates the
   skeleton → content swap on every non-lazy `<img>`; the loop keeps
   `loading="lazy"` specifically so it is excluded from that gate, since an
   `<img>` with no `src` reports `complete` with `naturalWidth === 0` and fires
   neither `load` nor `error` — without the attribute it would stall the gate for
   the full 4-second timeout.
2. `data-srcset`, never `srcset`, until promoted — this is what keeps every
   locked card from requesting its loop the instant it is rendered.
3. `sizes` has to be present on every `<source>` **and** on the `<img>` — a
   `<source>` with width descriptors and no `sizes` defaults to `100vw`, which on
   a 208px card would select the largest (624px) candidate on every phone.

### 8.3 The IntersectionObserver gate (`bg-anim.js`)

Even with only two cards ever eligible to animate, `bg-anim.js` still gates
loading through an `IntersectionObserver` rather than relying on
`loading="lazy"` alone, because native lazy loading cannot do three things this
feature needs:

1. **Give decoded frames back.** A loaded `<img>` is never unloaded by the
   browser — once a loop has played, it keeps decoding forever unless something
   actively drops its source.
2. **Survive a subtree swap.** `swapToResult` in `open.js` (used by both the flip
   reveal and the missed-day burn settle) replaces a card's children wholesale,
   so any layer `loading="lazy"` was tracking is simply gone — a revealed card
   would never pick up its (brand new) loop layer without something re-attaching
   it.
3. **React to `prefers-reduced-motion` changing mid-session.** `loading="lazy"`
   has no opinion on this at all.

So the gate does its own accounting: one shared `IntersectionObserver` rooted on
the carousel track (`rootMargin: '0px 50%'`), one `MutationObserver` on that same
track standing in for a teardown hook the core doesn't provide (releasing a
card's observation when `mountCards`/`renderSkeleton` clear the row with
`innerHTML = ''`, and picking up newly-inserted cards that were handed over
before they had a box to intersect with), and a live `matchMedia
('prefers-reduced-motion: reduce')` query — not the one-shot
`core/transitions.js` helper, because a layer that lives as long as the card
needs to react to the setting changing after it mounted, not just read it once at
render time.

`observeBgAnim(card)` — called from `render.js`'s `onCardMounted` (the normal
mount path) and again explicitly at the end of `swapToResult` in `open.js` (the
flip-reveal and burn-settle path, which never goes through `core/card.js`) — is
the single entry point. It is a no-op for any card whose background has no
`[data-lb-bg-anim]` layer at all.

### 8.4 Reduced motion, end to end

Under `prefers-reduced-motion: reduce`, the loop is never *requested* at all —
not loaded-then-hidden. `theme.css` sets `.lb-card__bg-anim { display: none }`
inside the existing reduced-motion media block, and because nothing ever
intersects a `display: none` element, the `IntersectionObserver` in §8.3 never
fires for it and the gate never promotes `data-srcset` into `srcset`. The static
poster underneath is unaffected, so the card is never blank.

## 9. Regenerating after a source video changes

```bash
# replace the file(s) in lootbox-thor/animation-source/, then:
npm run build:animations
```

That's the whole procedure. The new hash follows automatically from the new file
bytes, every URL for the affected clip changes, `lootbox-thor/
backgrounds-anim.generated.js` is rewritten, and the old hashed files under
`assets/images/backgrounds-anim/` are pruned. Nothing else in the repo needs a
manual update unless the video's aspect ratio no longer matches its card box (the
script will refuse to run and say so) or its raw pixel dimensions changed (same).

Useful flags while iterating: `--dry-run` to see the plan and exact commands
without spending encode time, `--only=available` or `--only=locked` to work on
one clip, and `--emit-frames` if you need the raw frame sequence for something
this pipeline doesn't do.

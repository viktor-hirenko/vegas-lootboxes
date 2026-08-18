// Unit tests for the generated animation manifest and the two places its
// assumptions are duplicated by hand.
//
// `lootbox-2/backgrounds-anim.generated.js` is written by
// `npm run build:animations` and committed alongside the rasters it describes.
// Nothing at runtime notices if the two drift apart: a manifest entry pointing at
// a file that was never committed becomes a 404 the moment a real player scrolls
// the card into view, and a raster nothing references is dead weight that still
// ships to the CDN, since scripts/build.js copies the whole assets/ tree.
//
// The `sizes` check at the bottom guards a different kind of drift. BG_SIZES in
// icons.js restates the `--lb-card-width` formula from core/base.css in a second
// syntax, because `cqw` is not allowed in a `sizes` attribute. There is no way to
// derive one from the other at build time, so they are kept honest here instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BG_ANIM, BG_ANIM_STATES } from '../lootbox-2/backgrounds-anim.generated.js';
import { BG_SIZES, BACKGROUNDS } from '../lootbox-2/icons.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'lootbox-2');
const animDir = path.join(brandDir, 'assets/images/backgrounds-anim');

/** Every candidate list in the manifest, flattened and labelled. */
function allCandidates() {
  const out = [];
  for (const state of BG_ANIM_STATES) {
    const entry = BG_ANIM[state];
    for (const [label, list] of [
      ['avif', entry.avif],
      ['webp', entry.webp],
      ['poster.avif', entry.poster.avif],
      ['poster.webp', entry.poster.webp],
    ]) {
      for (const candidate of list) out.push({ state, label, ...candidate });
    }
  }
  return out;
}

test('every manifest URL points at a file that exists and has bytes', () => {
  const candidates = allCandidates();
  assert.ok(candidates.length > 0, 'manifest lists no candidates at all');

  const missing = [];
  const empty = [];
  for (const candidate of candidates) {
    // URLs are widget-relative ("./assets/…"), resolved against the brand folder.
    const file = path.join(brandDir, candidate.url);
    if (!fs.existsSync(file)) {
      missing.push(`${candidate.state}.${candidate.label} -> ${candidate.url}`);
      continue;
    }
    if (fs.statSync(file).size === 0) empty.push(candidate.url);
  }

  assert.deepEqual(missing, [], 'manifest references files that are not on disk');
  assert.deepEqual(empty, [], 'manifest references zero-byte files');
});

test('no raster on disk is left unreferenced by the manifest', () => {
  // Orphans are usually the residue of a re-encode: the hash changed, the new
  // files landed, and the previous generation was never swept. They cost CDN
  // space forever because the folder is copied wholesale.
  const referenced = new Set(allCandidates().map((candidate) => path.basename(candidate.url)));
  const onDisk = fs.readdirSync(animDir);
  const orphans = onDisk.filter((name) => !referenced.has(name));

  assert.deepEqual(orphans, [], 'files in backgrounds-anim/ that no manifest entry uses');
});

test('the size ladder ascends and starts at the artwork own width', () => {
  for (const state of BG_ANIM_STATES) {
    const entry = BG_ANIM[state];

    for (const [label, list] of [
      ['avif', entry.avif],
      ['webp', entry.webp],
      ['poster.avif', entry.poster.avif],
      ['poster.webp', entry.poster.webp],
    ]) {
      const widths = list.map((candidate) => candidate.width);
      assert.ok(widths.length > 0, `${state}.${label} has no candidates`);
      assert.equal(
        widths[0],
        entry.box.width,
        `${state}.${label} does not start at the intrinsic ${entry.box.width}px box`,
      );
      const ascending = widths.every((width, i) => i === 0 || width > widths[i - 1]);
      assert.ok(ascending, `${state}.${label} widths are not strictly ascending: ${widths}`);
    }
  }
});

test('a poster exists at every rung the loop can be served at', () => {
  // The poster is what the card falls back to and what the skeleton gate waits
  // on. If the loop had a rung with no matching poster, that rung would show the
  // fallback at the wrong resolution underneath a correctly sized animation.
  for (const state of BG_ANIM_STATES) {
    const entry = BG_ANIM[state];
    const posterWidths = new Set(entry.poster.avif.map((candidate) => candidate.width));

    for (const candidate of entry.avif) {
      assert.ok(
        posterWidths.has(candidate.width),
        `${state}: loop is served at ${candidate.width}w but no poster is`,
      );
    }
  }
});

test('the WebP loop ladder is a prefix of the AVIF one', () => {
  // WebP stops early on purpose — above ~416px a lossy VP8 sequence costs more
  // than the AVIF it is standing in for is worth (ANIMATIONS.md). It must still
  // be a genuine prefix: a browser without AVIF has to find every small rung.
  for (const state of BG_ANIM_STATES) {
    const avif = BG_ANIM[state].avif.map((candidate) => candidate.width);
    const webp = BG_ANIM[state].webp.map((candidate) => candidate.width);

    assert.ok(webp.length <= avif.length, `${state}: WebP ladder is longer than AVIF`);
    assert.deepEqual(webp, avif.slice(0, webp.length), `${state}: WebP ladder is not a prefix`);
  }
});

test('frame count, fps and duration agree with each other', () => {
  for (const state of BG_ANIM_STATES) {
    const { frames, fps, durationMs } = BG_ANIM[state];
    assert.ok(frames > 1, `${state} is not a sequence (${frames} frame(s))`);

    const expected = (frames / fps) * 1000;
    assert.ok(
      Math.abs(durationMs - expected) <= 1,
      `${state}: durationMs ${durationMs} does not match ${frames} frames at ${fps}fps (${expected})`,
    );
  }
});

test('only the states meant to animate carry a loop', () => {
  assert.ok(BACKGROUNDS.available.anim, 'today should animate');
  assert.ok(BACKGROUNDS.locked.anim, 'the spotlighted locked day should animate');

  assert.equal(BACKGROUNDS.lockedStatic.anim, null, 'a plain locked day must not animate');
  assert.equal(BACKGROUNDS.missed.anim, null, 'a missed day must not animate');
  assert.equal(BACKGROUNDS.missedActive.anim, null, 'a burning day must not animate');
  assert.equal(BACKGROUNDS.previous.anim, null, 'a past result must not animate');

  // lockedStatic is the same artwork with the loop dropped, not a second raster.
  assert.equal(BACKGROUNDS.lockedStatic.poster.avif, BACKGROUNDS.locked.poster.avif);
});

test('BG_SIZES still matches the --lb-card-width formula in base.css', () => {
  const css = fs.readFileSync(path.join(root, 'core/base.css'), 'utf8');

  const cssBase = /--lb-card-width:\s*(\d+)px/.exec(css);
  const cssBreakpoint = /@container\s*\(min-width:\s*(\d+)px\)/.exec(css);
  const cssFluid = /--lb-card-width:\s*calc\(100cqw\s*\*\s*(\d+)\s*\/\s*(\d+)\)/.exec(css);

  assert.ok(cssBase, 'could not find the flat --lb-card-width in base.css');
  assert.ok(cssBreakpoint, 'could not find the @container breakpoint in base.css');
  assert.ok(cssFluid, 'could not find the fluid --lb-card-width in base.css');

  const sizes =
    /^\(min-width:\s*(\d+)px\)\s*calc\(100vw\s*\*\s*(\d+)\s*\/\s*(\d+)\),\s*(\d+)px$/.exec(
      BG_SIZES,
    );
  assert.ok(sizes, `BG_SIZES is not in the expected shape: ${BG_SIZES}`);

  const [, sizesBreakpoint, sizesNumerator, sizesDenominator, sizesBase] = sizes;
  assert.equal(
    sizesBreakpoint,
    cssBreakpoint[1],
    'BG_SIZES switches at a different width than the @container query',
  );
  assert.equal(sizesNumerator, cssFluid[1], 'BG_SIZES uses a different fluid numerator');
  assert.equal(sizesDenominator, cssFluid[2], 'BG_SIZES uses a different fluid denominator');
  assert.equal(sizesBase, cssBase[1], 'BG_SIZES falls back to a different base width');

  // And the ladder has to start where that formula bottoms out, or the smallest
  // phone would already be upscaling.
  for (const state of BG_ANIM_STATES) {
    assert.equal(
      BG_ANIM[state].box.width,
      Number(cssBase[1]),
      `${state} artwork is not drawn at the ${cssBase[1]}px base card width`,
    );
  }
});

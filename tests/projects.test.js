// Guards the sandbox brand registry. A preset is plain data that points at a
// widget folder, so a typo there breaks the sandbox silently in the browser —
// these checks turn that into a failing test instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECTS, DEFAULT_PROJECT, resolveProjectKey } from '../lootbox-test/projects.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandboxDir = path.join(root, 'lootbox-test');

test('every preset points at a widget that exists', () => {
  for (const [key, preset] of Object.entries(PROJECTS)) {
    const entry = path.resolve(sandboxDir, preset.entry);
    assert.ok(fs.existsSync(entry), `${key}: missing widget entry ${preset.entry}`);
  }
});

test('every preset ships scenarios whose cards use its own vocabulary', () => {
  for (const [key, preset] of Object.entries(PROJECTS)) {
    assert.ok(preset.scenarios.length > 0, `${key}: no scenarios`);

    const ids = preset.scenarios.map((scenario) => scenario.id);
    assert.equal(new Set(ids).size, ids.length, `${key}: duplicate scenario ids`);

    for (const scenario of preset.scenarios) {
      assert.ok(scenario.label, `${key}/${scenario.id}: missing label`);
      assert.ok(scenario.cards.length > 0, `${key}/${scenario.id}: empty ribbon`);
      for (const card of scenario.cards) {
        if (!card.prizeType) continue;
        assert.ok(
          preset.prizeTypes.includes(card.prizeType),
          `${key}/${scenario.id}: prizeType "${card.prizeType}" is not in this brand's vocabulary`,
        );
      }
    }
  }
});

test('every preset declares a usable prize vocabulary', () => {
  for (const [key, preset] of Object.entries(PROJECTS)) {
    assert.ok(preset.prizeTypes.length > 0, `${key}: empty prizeTypes`);
    assert.ok(
      preset.prizeTypes.includes(preset.mockDefaults.prize.prizeType),
      `${key}: mock default prizeType is not in prizeTypes`,
    );
  }
});

test('bitmap stage backgrounds resolve to real files', () => {
  for (const [key, preset] of Object.entries(PROJECTS)) {
    for (const variant of ['desktop', 'mobile']) {
      const src = preset.stage[variant];
      if (!src) continue;
      assert.ok(
        fs.existsSync(path.resolve(sandboxDir, src)),
        `${key}: missing ${variant} background ${src}`,
      );
    }
    // A brand with no bitmaps must still have something to paint.
    const hasBitmaps = Boolean(preset.stage.desktop && preset.stage.mobile);
    assert.ok(
      hasBitmaps || preset.stage.gradient,
      `${key}: stage has neither both bitmaps nor a gradient fallback`,
    );
  }
});

test('an unknown or missing project key falls back to the default', () => {
  assert.equal(resolveProjectKey('nope'), DEFAULT_PROJECT);
  assert.equal(resolveProjectKey(null), DEFAULT_PROJECT);
  assert.equal(resolveProjectKey(undefined), DEFAULT_PROJECT);
  assert.equal(resolveProjectKey(''), DEFAULT_PROJECT);
  assert.ok(DEFAULT_PROJECT in PROJECTS);
});

test('a known key is matched case-insensitively', () => {
  assert.equal(resolveProjectKey('THOR'), 'thor');
});

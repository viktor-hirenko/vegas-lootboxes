// Parses the scalable query-parameter contract into a plain content object.
//
// Contract (documented in full in /INTEGRATION.md and on /lootbox-test/index.html):
//   Global:      lang, count, origin, debug
//   Per-card i:  c{i}_state, c{i}_id, c{i}_date, c{i}_title, c{i}_subtitle,
//                c{i}_cta, c{i}_tag, c{i}_prize (prize type),
//                c{i}_active ("true" -> today variant),
//                c{i}_timer / c{i}_timer_to (countdown badge)
//
// Naming bridge: the URL uses `c{i}_prize`, but the postMessage runtime protocol
// (setContent / setCardState) carries the same value as `prizeType`. Likewise
// `c{i}_timer_to` is `timerTo` at runtime. `c{i}_active` only accepts the literal
// string "true"; any other value is treated as false.
//
// Adding/removing cards never changes the contract shape — the parent simply
// adds/removes another `c{i}_*` group. Indices are 1-based and do not need to
// be contiguous (gaps are tolerated).

import { CARD_STATE, VALID_CARD_STATES, DEFAULT_LANG } from './protocol.js';
import { normalizeOrigin } from './message-bus.js';

const CARD_KEY_PATTERN = /^c(\d+)_/;

/**
 * @param {URLSearchParams} searchParams
 * @returns {number[]} sorted, de-duplicated list of card indices present in the URL
 */
function collectCardIndices(searchParams) {
  const indices = new Set();

  for (const key of searchParams.keys()) {
    const match = key.match(CARD_KEY_PATTERN);
    if (match) indices.add(Number(match[1]));
  }

  const explicitCount = Number.parseInt(searchParams.get('count') ?? '', 10);
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    for (let i = 1; i <= explicitCount; i += 1) indices.add(i);
  }

  return [...indices].sort((a, b) => a - b);
}

function normalizeState(rawState) {
  return VALID_CARD_STATES.includes(rawState) ? rawState : CARD_STATE.LOCKED;
}

/** Absolute unlock deadline in epoch ms. Non-numeric / past-epoch values are
 * dropped so a malformed param degrades to "no countdown" instead of NaN. */
function normalizeTimerTo(raw) {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * @param {URLSearchParams} searchParams
 * @returns {import('./content-store.js').LootboxCard[]}
 */
function parseCards(searchParams) {
  return collectCardIndices(searchParams).map((index) => ({
    index,
    id: searchParams.get(`c${index}_id`) || String(index),
    state: normalizeState(searchParams.get(`c${index}_state`)),
    date: searchParams.get(`c${index}_date`) || '',
    title: searchParams.get(`c${index}_title`) || '',
    subtitle: searchParams.get(`c${index}_subtitle`) || '',
    cta: searchParams.get(`c${index}_cta`) || '',
    tag: searchParams.get(`c${index}_tag`) || '',
    prizeType: searchParams.get(`c${index}_prize`) || '',
    active: searchParams.get(`c${index}_active`) === 'true',
    timer: searchParams.get(`c${index}_timer`) || '',
    timerTo: normalizeTimerTo(searchParams.get(`c${index}_timer_to`)),
  }));
}

/**
 * @param {string} [search] defaults to the current document location
 */
export function parseWidgetParams(search = window.location.search) {
  const searchParams = new URLSearchParams(search);

  return {
    lang: searchParams.get('lang') || DEFAULT_LANG,
    origin: normalizeOrigin(searchParams.get('origin')),
    debug: searchParams.get('debug') === 'true',
    cards: parseCards(searchParams),
  };
}

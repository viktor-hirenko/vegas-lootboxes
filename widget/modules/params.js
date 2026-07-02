// Parses the scalable query-parameter contract into a plain content object.
//
// Contract (documented in full in /INTEGRATION.md and on /test/index.html):
//   Global:      lang, heading, subtitle, count, origin, debug
//   Per-card i:  c{i}_state, c{i}_id, c{i}_date, c{i}_title, c{i}_cta, c{i}_tag
//
// Adding/removing cards never changes the contract shape — the parent simply
// adds/removes another `c{i}_*` group. Indices are 1-based and do not need to
// be contiguous (gaps are tolerated).

import { CARD_STATE, VALID_CARD_STATES, DEFAULT_LANG } from './constants.js';

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
    cta: searchParams.get(`c${index}_cta`) || '',
    tag: searchParams.get(`c${index}_tag`) || '',
  }));
}

/**
 * @param {string} [search] defaults to the current document location
 */
export function parseWidgetParams(search = window.location.search) {
  const searchParams = new URLSearchParams(search);

  return {
    lang: searchParams.get('lang') || DEFAULT_LANG,
    heading: searchParams.get('heading') || '',
    subtitle: searchParams.get('subtitle') || '',
    origin: searchParams.get('origin') || '',
    debug: searchParams.get('debug') === 'true',
    cards: parseCards(searchParams),
  };
}

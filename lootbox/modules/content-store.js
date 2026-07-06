// Minimal reactive store for the widget's card list.
// Exists so `setContent` / `setCardState` from the parent can update the DOM
// in place, without ever reloading the iframe — this is the mechanism that
// covers "backend replies a few seconds late" from the task.

/**
 * @typedef {object} LootboxCard
 * @property {number} index 1-based position, stable per card slot
 * @property {string} id stable identifier (defaults to String(index))
 * @property {'available'|'locked'|'prize'|'prediction'|'missed'} state
 * @property {string} date e.g. "1 Mar"
 * @property {string} title
 * @property {string} cta e.g. "Go to Bonuses" (prize state)
 * @property {string} tag status badge override ("Opened" / "Missed")
 * @property {'bonus-money'|'cash'|'coin'|'free-spins'|''} [prizeType] prize art selector
 * @property {boolean} [active] true = today's just-opened result (glow variant)
 */

function matchesCard(card, matcher = {}) {
  if (matcher.id !== undefined) return String(card.id) === String(matcher.id);
  if (matcher.index !== undefined) return card.index === Number(matcher.index);
  return false;
}

/** Drops undefined keys so partial patches never overwrite fields with undefined. */
function withoutUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

export function createContentStore(initial) {
  let state = { cards: [], ...initial };
  const listeners = new Set();

  function get() {
    return state;
  }

  function emit() {
    listeners.forEach((listener) => listener(state));
  }

  /** Shallow-merge patch into top-level state (cards). */
  function set(patch) {
    state = { ...state, ...withoutUndefined(patch) };
    emit();
  }

  /** Update a single card matched by `{ id }` or `{ index }`. Unknown matches are ignored. */
  function updateCard(matcher, patch) {
    const cleanPatch = withoutUndefined(patch);
    let didMatch = false;

    const cards = state.cards.map((card) => {
      if (!matchesCard(card, matcher)) return card;
      didMatch = true;
      return { ...card, ...cleanPatch };
    });

    if (!didMatch) return false;
    state = { ...state, cards };
    emit();
    return true;
  }

  function findCard(matcher) {
    return state.cards.find((card) => matchesCard(card, matcher));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, set, updateCard, findCard, subscribe };
}

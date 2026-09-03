// Brand presets for the sandbox. Adding a widget to the sandbox means adding an
// entry here — test.js reads everything it needs (entry path, stage dressing,
// prize vocabulary, example ribbons) from the selected preset and has no brand
// names of its own.

/**
 * @typedef {object} SandboxProject
 * @property {string} label       name shown in the switcher and page heading
 * @property {string} entry       widget entry, relative to the sandbox folder
 * @property {{ heading: string, subtitle: string }} header parent-page copy
 *   rendered above the iframe (it belongs to the site, not to the widget)
 * @property {{ color: string, desktop?: string, mobile?: string, gradient?: string }} stage
 *   preview backdrop: a base colour plus either bitmap variants or a CSS gradient
 * @property {string[]} prizeTypes values offered in the prize-type selects: the
 *   contract's six prize names plus `prediction`, which is not a prize but the
 *   marker for a day that had none (see INTEGRATION.md §11). It is in the list
 *   because QA has to be able to reproduce a missed no-prize day here.
 * @property {{ prize: object, prediction: object }} mockDefaults payload the mock
 *   backend falls back to when its fields are left blank
 * @property {{ prize: string, prediction: string }} mockOutcomeLabels copy for the
 *   mock-outcome select — must match each brand's open animation, not Vegas-only
 *   confetti wording on Thor
 * @property {string} integrationFlowReveal one line in the integration cheat sheet —
 *   how this brand's open animation reads after setCardState
 * @property {{ subtitle: boolean, timer: boolean, tagOnHistory: boolean }} supports
 *   which optional contract fields this brand renders. `subtitle` and `timer`
 *   gate whole inputs; `tagOnHistory` says whether an opened day keeps its
 *   status badge, which decides if the sandbox lets you type one
 * @property {Array<{ id: string, label: string, cards: object[] }>} scenarios
 *   ready-made day ribbons; the first one loads on boot
 */

/** Pad a ribbon out to 30 locked days, the way a real month looks. */
function month(ribbon) {
  const cards = ribbon.map(card => ({ ...card }))
  for (let day = ribbon.length + 1; day <= 30; day += 1) {
    cards.push({ state: 'locked', date: `${day} Mar` })
  }
  return cards
}

/**
 * The day ribbons from the Figma scenario board, expressed once and filled with
 * each brand's own prize vocabulary. The scenarios themselves are brand-agnostic
 * — only the prize art names differ.
 *
 * @param {{ win: string, winTitle: string, second: string, secondTitle: string }} art
 * @returns {Array<{ id: string, label: string, cards: object[] }>}
 */
function scenarios(art) {
  const day = n => `${n} Mar`
  const win = (n, extra = {}) => ({
    state: 'prize',
    date: day(n),
    title: art.winTitle,
    prizeType: art.win,
    ...extra,
  })
  const second = (n, extra = {}) => ({
    state: 'prize',
    date: day(n),
    title: art.secondTitle,
    prizeType: art.second,
    ...extra,
  })
  const missed = (n, extra = {}) => ({
    state: 'missed',
    date: day(n),
    title: art.secondTitle,
    prizeType: art.second,
    ...extra,
  })
  const available = n => ({ state: 'available', date: day(n) })
  // A day that carried no prize. `prizeType: 'prediction'` is the agreed marker
  // for both halves of that case — the missed one and the opened one.
  const noPrizeMissed = n => ({ state: 'missed', date: day(n), prizeType: 'prediction' })
  const noPrizeOpened = n => ({ state: 'prediction', date: day(n), prizeType: 'prediction' })

  return [
    {
      id: 'all-days',
      label: 'Усі дні (мікс станів)',
      cards: month([win(1), second(2), missed(3), available(4)]),
    },
    {
      id: 'day1-available',
      label: 'Перший день доступний',
      cards: month([available(1)]),
    },
    {
      id: 'day1-opened',
      label: 'Відкритий перший день, день 2 недоступний',
      cards: month([win(1, { active: true, cta: 'Go to Bonuses' })]),
    },
    {
      id: 'day1-prize-day2-open',
      label: 'День 1 із призом, день 2 відкритий',
      cards: month([win(1), available(2)]),
    },
    {
      id: 'no-prize-days',
      label: 'День без призу: пропущений і відкритий',
      cards: month([noPrizeMissed(1), noPrizeOpened(2), available(3)]),
    },
    {
      id: 'two-missed',
      label: 'Пропуск двох днів',
      cards: month([missed(1), missed(2), available(3)]),
    },
    {
      id: 'all-missed',
      label: 'Пропуск усіх днів',
      cards: month([missed(1), missed(2), missed(3), missed(4), missed(5), available(6)]),
    },
  ]
}

export const PROJECTS = Object.freeze({
  vegas: Object.freeze({
    label: 'Vegas Lootboxes',
    entry: '../lootbox/index.html',
    header: Object.freeze({
      heading: 'Vegas Lootboxes',
      subtitle: 'Visit every day to open a box and see what luck brings',
    }),
    stage: Object.freeze({
      color: '#15010a',
      desktop: './assets/backgrounds/bg-desktop.png',
      mobile: './assets/backgrounds/bg-mobile.png',
    }),
    prizeTypes: Object.freeze([
      'coins', 'cash', 'cashback', 'free-spins', 'free-chips', 'bonus-money',
      'prediction', // not a prize — the no-prize marker, see the typedef above
    ]),
    mockDefaults: Object.freeze({
      prize: Object.freeze({
        title: '20 CAD bonus',
        prizeType: 'coins',
        cta: 'Go to Bonuses',
        tag: 'Opened',
      }),
      prediction: Object.freeze({
        title: 'Something is waiting for you in the future',
        cta: 'Show prediction',
      }),
    }),
    mockOutcomeLabels: Object.freeze({
      prize: 'prize — виграш (спалах + конфетті)',
      prediction: 'prediction — передбачення (без конфетті)',
    }),
    integrationFlowReveal:
      'спалахом відкриває результат (конфетті лише для prize)',
    supports: Object.freeze({ subtitle: false, timer: false, tagOnHistory: true }),
    scenarios: scenarios({
      win: 'cash',
      winTitle: '20 CAD bonus',
      second: 'free-spins',
      secondTitle: '20 Free Spins',
    }),
  }),

  thor: Object.freeze({
    label: 'Thor Lootboxes',
    entry: '../lootbox-2/index.html',
    header: Object.freeze({
      heading: 'Prize boxes',
      subtitle: 'Visit every day to open a prize box and see what luck brings',
    }),
    stage: Object.freeze({
      color: '#110e1b',
      desktop: './assets/backgrounds/thor-bg-desktop.webp',
      mobile: './assets/backgrounds/thor-bg-mobile.webp',
    }),
    prizeTypes: Object.freeze([
      'coins', 'cash', 'cashback', 'free-spins', 'free-chips', 'bonus-money',
      'prediction', // not a prize — the no-prize marker, see the typedef above
    ]),
    mockDefaults: Object.freeze({
      // No `tag`: Thor keeps an opened result to a bare date pill, so a status
      // badge sent here would be dropped by the widget anyway.
      prize: Object.freeze({
        title: '20 Free Spins',
        prizeType: 'coins',
        cta: 'Go to Bonuses',
      }),
      prediction: Object.freeze({
        title: 'Something is waiting for you in the future',
        cta: 'Show prediction',
      }),
    }),
    mockOutcomeLabels: Object.freeze({
      prize: 'prize — виграш (flip + подарунок)',
      prediction: 'prediction — передбачення (без призу)',
    }),
    integrationFlowReveal: 'flip-анімацією відкриває результат',
    // `tagOnHistory: false` — an opened Thor day is a bare date pill, so a
    // status badge sent for it is dropped by the widget (same reason
    // `mockDefaults.prize` carries no `tag`).
    supports: Object.freeze({ subtitle: true, timer: true, tagOnHistory: false }),
    scenarios: scenarios({
      win: 'free-spins',
      winTitle: '20 Free Spins',
      second: 'cashback',
      secondTitle: 'Cashback',
    }),
  }),
})

export const DEFAULT_PROJECT = 'vegas'

/**
 * Resolve the `?project=` value to a known key, falling back to the default.
 * @param {string | null | undefined} raw
 * @returns {keyof typeof PROJECTS}
 */
export function resolveProjectKey(raw) {
  const key = String(raw ?? '').toLowerCase()
  return key in PROJECTS ? key : DEFAULT_PROJECT
}

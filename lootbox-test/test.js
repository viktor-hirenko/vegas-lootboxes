// Parent-page emulator for the Vegas Lootboxes widget sandbox.
// Vanilla JS, no build step — mirrors exactly what a real integrating page
// would do: build the initial iframe URL from query params, send/receive
// postMessage, and react to `resize` to size the iframe correctly.

const CARD_STATES = ['available', 'locked', 'prize', 'prediction', 'missed']
const PRIZE_TYPES = ['', 'bonus-money', 'cash', 'coin', 'free-spins']

function makeCard(overrides = {}) {
  return {
    state: 'locked',
    date: '',
    title: '',
    cta: '',
    tag: '',
    prizeType: '',
    active: false,
    ...overrides,
  }
}

// A realistic "all days" ribbon: a couple of past results, today's card, then upcoming.
const EXAMPLE_CARDS = [
  makeCard({ state: 'prize', date: '1 Mar', title: '20 CAD bonus', prizeType: 'bonus-money' }),
  makeCard({ state: 'missed', date: '2 Mar', title: '20 Free Spins', prizeType: 'free-spins' }),
  makeCard({ state: 'prediction', date: '3 Mar' }),
  makeCard({ state: 'available', date: '4 Mar' }),
  makeCard({ state: 'locked', date: '5 Mar' }),
  makeCard({ state: 'locked', date: '6 Mar' }),
  makeCard({ state: 'locked', date: '7 Mar' }),
  makeCard({ state: 'locked', date: '8 Mar' }),
  makeCard({ state: 'locked', date: '9 Mar' }),
  makeCard({ state: 'locked', date: '10 Mar' }),
  makeCard({ state: 'locked', date: '11 Mar' }),
  makeCard({ state: 'locked', date: '12 Mar' }),
  makeCard({ state: 'locked', date: '13 Mar' }),
  makeCard({ state: 'locked', date: '14 Mar' }),
  makeCard({ state: 'locked', date: '15 Mar' }),
  makeCard({ state: 'locked', date: '16 Mar' }),
  makeCard({ state: 'locked', date: '17 Mar' }),
  makeCard({ state: 'locked', date: '18 Mar' }),
  makeCard({ state: 'locked', date: '19 Mar' }),
  makeCard({ state: 'locked', date: '20 Mar' }),
  makeCard({ state: 'locked', date: '21 Mar' }),
  makeCard({ state: 'locked', date: '22 Mar' }),
  makeCard({ state: 'locked', date: '23 Mar' }),
  makeCard({ state: 'locked', date: '24 Mar' }),
  makeCard({ state: 'locked', date: '25 Mar' }),
  makeCard({ state: 'locked', date: '26 Mar' }),
  makeCard({ state: 'locked', date: '27 Mar' }),
  makeCard({ state: 'locked', date: '28 Mar' }),
  makeCard({ state: 'locked', date: '29 Mar' }),
  makeCard({ state: 'locked', date: '30 Mar' }),
]

/** Delay before setContent when "late backend" is enabled (skeleton demo). */
const LATE_BACKEND_DELAY_MS = 2000

/** Default prize payload when the mock config leaves fields blank. */
const DEFAULT_OPEN_PRIZE = {
  title: '20 CAD bonus',
  prizeType: 'coin',
  cta: 'Go to Bonuses',
  tag: 'Opened',
}

/** Default prediction payload for the mock backend panel. */
const DEFAULT_OPEN_PREDICTION = {
  title: 'Something is waiting for you in the future',
  cta: 'Show prediction',
}

/** Card ids/indexes currently waiting on the mock open API. */
const openInFlight = new Set()

// The widget always lives in the sibling `lootbox/` folder — same layout in
// the repo, in `dist/`, and on the CDN under `widgets-smartico/`.
const WIDGET_ENTRY_PATH = '../lootbox/index.html'

// Origin the widget iframe is served from. Since the entry path is relative,
// this resolves to the sandbox's own origin. Used to target outgoing
// postMessage and to filter incoming ones — exactly what a real parent page
// must do instead of trusting/using '*'. Resolves to 'null' under file://,
// where cross-window origin checks don't apply, so we fall back to '*' then.
// NOTE: must be declared before `state`, which reads them below.
const WIDGET_ORIGIN = new URL(WIDGET_ENTRY_PATH, window.location.href).origin
const HAS_STRICT_ORIGIN = WIDGET_ORIGIN && WIDGET_ORIGIN !== 'null'
const WIDGET_TARGET_ORIGIN = HAS_STRICT_ORIGIN ? WIDGET_ORIGIN : '*'

const state = {
  lang: 'en',
  // Pass our own origin to the widget so it locks postMessage to this page
  // (strict mode). Empty under file://, where the widget stays permissive.
  origin: HAS_STRICT_ORIGIN ? WIDGET_ORIGIN : '',
  debug: false,
  lateBackend: false,
  viewport: 'desktop',
  cards: JSON.parse(JSON.stringify(EXAMPLE_CARDS)),
  // Mock backend: what the "API" returns when an available card is clicked.
  // The sandbox listens for cardClick and, after `delayMs`, sends setCardState —
  // exactly what a real parent page does once its backend responds.
  mock: {
    enabled: true,
    outcome: 'prize', // 'prize' | 'prediction'
    prizeType: 'coin',
    title: '',
    cta: '',
    tag: '',
    delayMs: 1200,
  },
}

// --- DOM refs ----------------------------------------------------------

const iframe = document.getElementById('widget-frame')
const previewFrame = document.getElementById('preview-frame')
const previewStage = document.getElementById('preview-stage')
const urlDisplay = document.getElementById('url-display')
const logEl = document.getElementById('log')
const cardRowsEl = document.getElementById('card-rows')

const globalInputs = document.querySelectorAll('[data-global]')

// --- Helpers -------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {{ includeCards?: boolean }} [options]
 * @returns {string}
 */
function buildWidgetUrl({ includeCards = true } = {}) {
  const params = new URLSearchParams()
  if (state.lang) params.set('lang', state.lang)
  if (state.origin) params.set('origin', state.origin)
  if (state.debug) params.set('debug', 'true')

  if (includeCards) {
    state.cards.forEach((card, position) => {
      const i = position + 1
      if (card.state) params.set(`c${i}_state`, card.state)
      if (card.date) params.set(`c${i}_date`, card.date)
      if (card.title) params.set(`c${i}_title`, card.title)
      if (card.cta) params.set(`c${i}_cta`, card.cta)
      if (card.tag) params.set(`c${i}_tag`, card.tag)
      if (card.prizeType) params.set(`c${i}_prize`, card.prizeType)
      if (card.active) params.set(`c${i}_active`, 'true')
    })
  }

  return `${WIDGET_ENTRY_PATH}?${params.toString()}`
}

function sendCardsContent() {
  postToWidget('setContent', {
    cards: state.cards.map((card, position) => ({ index: position + 1, ...card })),
  })
}

/**
 * Resolve a card row index from a widget event payload ({ id } or 1-based { index }).
 * @param {{ id?: string|number, index?: number }} data
 * @returns {number}
 */
function findCardIndexFromEvent(data) {
  if (data?.id != null) {
    const byId = state.cards.findIndex(
      (card, position) => String(card.id ?? position + 1) === String(data.id),
    )
    if (byId >= 0) return byId
  }
  if (data?.index != null) {
    const index = Number(data.index) - 1
    if (index >= 0 && index < state.cards.length) return index
  }
  return -1
}

/**
 * Mock backend: fires on `cardClick` for an available card. After the configured
 * delay it sends `setCardState` with the chosen outcome — mirroring a real parent
 * page that calls its API on click and pushes the result when it resolves. The
 * widget charges while waiting, then flashes the result in.
 * @param {{ id?: string|number, index?: number, state?: string }} data
 */
function scheduleMockBackend(data) {
  if (!state.mock.enabled) return
  if (data?.state && data.state !== 'available') return

  const key = String(data?.id ?? data?.index ?? '')
  if (!key || openInFlight.has(key)) return

  const cardIndex = findCardIndexFromEvent(data)
  if (cardIndex < 0) return

  const card = state.cards[cardIndex]
  if (card.state !== 'available') return

  const { outcome, delayMs } = state.mock
  openInFlight.add(key)
  log('info', `mock backend: outcome="${outcome}", replying in ${delayMs}ms`)

  window.setTimeout(() => {
    openInFlight.delete(key)
    const id = String(data.id ?? cardIndex + 1)

    if (outcome === 'prediction') {
      const title = state.mock.title || DEFAULT_OPEN_PREDICTION.title
      const cta = state.mock.cta || DEFAULT_OPEN_PREDICTION.cta
      Object.assign(card, { state: 'prediction', title, cta, active: true })
      renderCardRows()
      postToWidget('setCardState', {
        index: cardIndex + 1,
        id,
        state: 'prediction',
        title,
        cta,
        date: card.date || undefined,
        active: true,
      })
    } else {
      const prizeType = state.mock.prizeType || DEFAULT_OPEN_PRIZE.prizeType
      const title = state.mock.title || DEFAULT_OPEN_PRIZE.title
      const cta = state.mock.cta || DEFAULT_OPEN_PRIZE.cta
      const tag = state.mock.tag || DEFAULT_OPEN_PRIZE.tag

      Object.assign(card, { state: 'prize', title, prizeType, cta, tag, active: true })
      renderCardRows()
      postToWidget('setCardState', {
        index: cardIndex + 1,
        id,
        state: 'prize',
        title,
        prizeType,
        cta,
        tag,
        date: card.date || undefined,
        active: true,
      })
    }
  }, delayMs)
}

const LOG_DIRECTION_LABEL = {
  sent: 'PARENT → WIDGET',
  received: 'WIDGET → PARENT',
  info: 'INFO',
}

function log(direction, type, data) {
  const entry = document.createElement('div')
  entry.className = `log-entry log-${direction}`
  const time = new Date().toLocaleTimeString()
  const label = LOG_DIRECTION_LABEL[direction] ?? 'INFO'
  entry.innerHTML = `
    <span class="log-time">${time}</span><span class="log-dir">${label}</span><strong>${escapeHtml(type)}</strong>
    ${data !== undefined ? `<pre class="log-data">${escapeHtml(JSON.stringify(data))}</pre>` : ''}
  `
  logEl.appendChild(entry)
  logEl.scrollTop = logEl.scrollHeight
}

function postToWidget(type, data) {
  if (!iframe.contentWindow) return
  iframe.contentWindow.postMessage({ type, data }, WIDGET_TARGET_ORIGIN)
  log('sent', type, data)
}

function fillGlobalInputs() {
  globalInputs.forEach(input => {
    const key = input.dataset.global
    if (input.type === 'checkbox') {
      input.checked = Boolean(state[key])
    } else {
      input.value = state[key] ?? ''
    }
  })
}

globalInputs.forEach(input => {
  const key = input.dataset.global
  const eventName = input.type === 'checkbox' ? 'change' : 'input'
  input.addEventListener(eventName, () => {
    state[key] = input.type === 'checkbox' ? input.checked : input.value
  })
})

// --- Rendering: card rows -------------------------------------------------

function cardRowTemplate(card, index) {
  const options = CARD_STATES.map(
    s => `<option value="${s}" ${s === card.state ? 'selected' : ''}>${s}</option>`
  ).join('')
  const prizeOptions = PRIZE_TYPES.map(
    p =>
      `<option value="${p}" ${p === (card.prizeType || '') ? 'selected' : ''}>${p || '— тип призу —'}</option>`
  ).join('')

  return `
    <div class="card-row" data-index="${index}">
      <div class="card-row__head">
        <strong>Картка №${index + 1}</strong>
        <button type="button" class="btn btn-danger btn-sm" data-action="remove">Видалити</button>
      </div>
      <div class="card-row__grid">
        <select data-field="state">${options}</select>
        <select data-field="prizeType">${prizeOptions}</select>
        <input type="text" data-field="date" placeholder="Дата (1 Mar)" value="${escapeHtml(card.date)}" />
        <label class="card-row__check"><input type="checkbox" data-field="active" ${card.active ? 'checked' : ''} /> active (сьогодні)</label>
        <input type="text" data-field="title" placeholder="Заголовок" value="${escapeHtml(card.title)}" style="grid-column: span 2" />
        <input type="text" data-field="cta" placeholder="CTA (лише prize)" value="${escapeHtml(card.cta)}" />
        <input type="text" data-field="tag" placeholder="Бейдж статусу (Opened/Not opened)" value="${escapeHtml(card.tag)}" />
      </div>
      <div class="card-row__actions">
        <button type="button" class="btn btn-secondary btn-sm" data-action="apply-state">Надіслати setCardState</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="play-open-prize" style="opacity: 0.65">playOpen (prize)</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="play-open-prediction" style="opacity: 0.65">playOpen (prediction)</button>
      </div>
    </div>
  `
}

function renderCardRows() {
  cardRowsEl.innerHTML = state.cards.map(cardRowTemplate).join('')
}

function syncCardField(event) {
  const row = event.target.closest('.card-row')
  const field = event.target.dataset.field
  if (!row || !field) return
  const index = Number(row.dataset.index)
  state.cards[index][field] =
    event.target.type === 'checkbox' ? event.target.checked : event.target.value
}

cardRowsEl.addEventListener('input', syncCardField)
cardRowsEl.addEventListener('change', syncCardField)

cardRowsEl.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]')
  const row = event.target.closest('.card-row')
  if (!button || !row) return
  const index = Number(row.dataset.index)
  const card = state.cards[index]

  if (button.dataset.action === 'remove') {
    state.cards.splice(index, 1)
    renderCardRows()
    return
  }

  if (button.dataset.action === 'apply-state') {
    postToWidget('setCardState', {
      index: index + 1,
      id: String(index + 1),
      state: card.state,
      title: card.title || undefined,
      cta: card.cta || undefined,
      tag: card.tag || undefined,
      date: card.date || undefined,
      prizeType: card.prizeType || undefined,
      active: card.active || undefined,
    })
  }

  if (button.dataset.action === 'play-open-prize') {
    postToWidget('playOpen', { index: index + 1, state: 'prize' })
  }

  if (button.dataset.action === 'play-open-prediction') {
    postToWidget('playOpen', { index: index + 1, state: 'prediction' })
  }
})

document.getElementById('btn-add-card').addEventListener('click', () => {
  state.cards.push(makeCard())
  renderCardRows()
})

document.getElementById('btn-load-example').addEventListener('click', () => {
  state.cards = JSON.parse(JSON.stringify(EXAMPLE_CARDS))
  renderCardRows()
})

// --- Iframe reload / setContent ------------------------------------------

/** @type {ReturnType<typeof setTimeout> | null} */
let lateBackendTimer = null

function reloadIframe() {
  if (lateBackendTimer != null) {
    clearTimeout(lateBackendTimer)
    lateBackendTimer = null
  }

  // Late backend: open iframe with no cards → widget shows skeleton, then
  // setContent arrives after LATE_BACKEND_DELAY_MS (see `ready` handler).
  const url = buildWidgetUrl({ includeCards: !state.lateBackend })
  urlDisplay.textContent = new URL(url, window.location.href).href
  iframe.style.height = '0'
  iframe.src = url
  log('info', 'iframe reload', {
    url: urlDisplay.textContent,
    lateBackend: state.lateBackend,
  })
}

document.getElementById('btn-reload').addEventListener('click', reloadIframe)

const lateBackendInput = document.getElementById('in-late-backend')
lateBackendInput?.addEventListener('change', () => {
  state.lateBackend = lateBackendInput.checked
})

document.getElementById('btn-copy-url').addEventListener('click', () => {
  navigator.clipboard?.writeText(urlDisplay.textContent || '')
})

document.getElementById('btn-send-content').addEventListener('click', () => {
  sendCardsContent()
})

document.getElementById('btn-loading-on').addEventListener('click', () => {
  postToWidget('setLoading', { loading: true })
})

document.getElementById('btn-loading-off').addEventListener('click', () => {
  postToWidget('setLoading', { loading: false })
})

document.getElementById('btn-clear-log').addEventListener('click', () => {
  logEl.innerHTML = ''
})

// --- Viewport toggle -------------------------------------------------------

const desktopBtn = document.getElementById('btn-viewport-desktop')
const mobileBtn = document.getElementById('btn-viewport-mobile')

function setViewport(mode) {
  state.viewport = mode
  const isMobile = mode === 'mobile'
  previewFrame.classList.toggle('is-mobile', isMobile)
  previewStage?.classList.toggle('is-mobile', isMobile)
  desktopBtn.classList.toggle('is-active', mode === 'desktop')
  mobileBtn.classList.toggle('is-active', mode === 'mobile')
}

desktopBtn.addEventListener('click', () => setViewport('desktop'))
mobileBtn.addEventListener('click', () => setViewport('mobile'))

// --- Mock backend panel ----------------------------------------------------

const mockEnabledInput = document.getElementById('mock-enabled')
const mockOutcomeInput = document.getElementById('mock-outcome')
const mockPrizeFields = document.getElementById('mock-prize-fields')
const mockPrizeTypeInput = document.getElementById('mock-prize-type')
const mockTitleInput = document.getElementById('mock-title')
const mockCtaInput = document.getElementById('mock-cta')
const mockTagInput = document.getElementById('mock-tag')
const mockDelayInput = document.getElementById('mock-delay')
const mockDelayVal = document.getElementById('mock-delay-val')

/** Prize-only fields (prize type, badge) are irrelevant for a prediction
 * outcome — dim just those. Title + CTA stay editable for both, since an active
 * prediction now also carries a heading and a button. */
function syncMockPrizeFieldsVisibility() {
  if (!mockPrizeFields) return
  const isPrize = state.mock.outcome === 'prize'
  mockPrizeFields.querySelectorAll('[data-prize-only]').forEach((el) => {
    el.style.opacity = isPrize ? '1' : '0.4'
    el.style.pointerEvents = isPrize ? 'auto' : 'none'
  })
}

/** When the mock outcome changes, pre-fill title + CTA with that outcome's defaults. */
function syncMockOutcomeDefaults() {
  const defaults =
    state.mock.outcome === 'prediction' ? DEFAULT_OPEN_PREDICTION : DEFAULT_OPEN_PRIZE
  state.mock.title = defaults.title
  state.mock.cta = defaults.cta
  if (mockTitleInput) mockTitleInput.value = defaults.title
  if (mockCtaInput) mockCtaInput.value = defaults.cta
}

mockEnabledInput?.addEventListener('change', () => {
  state.mock.enabled = mockEnabledInput.checked
})
mockOutcomeInput?.addEventListener('change', () => {
  state.mock.outcome = mockOutcomeInput.value
  syncMockOutcomeDefaults()
  syncMockPrizeFieldsVisibility()
})
mockPrizeTypeInput?.addEventListener('change', () => {
  state.mock.prizeType = mockPrizeTypeInput.value
})
mockTitleInput?.addEventListener('input', () => {
  state.mock.title = mockTitleInput.value
})
mockCtaInput?.addEventListener('input', () => {
  state.mock.cta = mockCtaInput.value
})
mockTagInput?.addEventListener('input', () => {
  state.mock.tag = mockTagInput.value
})
mockDelayInput?.addEventListener('input', () => {
  state.mock.delayMs = Number(mockDelayInput.value)
  if (mockDelayVal) mockDelayVal.textContent = mockDelayInput.value
})

function fillMockInputs() {
  if (mockEnabledInput) mockEnabledInput.checked = state.mock.enabled
  if (mockOutcomeInput) mockOutcomeInput.value = state.mock.outcome
  if (mockPrizeTypeInput) mockPrizeTypeInput.value = state.mock.prizeType
  // Empty title/cta on first load → show defaults for the selected outcome.
  if (!state.mock.title && !state.mock.cta) syncMockOutcomeDefaults()
  if (mockTitleInput) mockTitleInput.value = state.mock.title
  if (mockCtaInput) mockCtaInput.value = state.mock.cta
  if (mockTagInput) mockTagInput.value = state.mock.tag
  if (mockDelayInput) mockDelayInput.value = String(state.mock.delayMs)
  if (mockDelayVal) mockDelayVal.textContent = String(state.mock.delayMs)
  syncMockPrizeFieldsVisibility()
}

// --- Incoming messages from the widget ------------------------------------

window.addEventListener('message', event => {
  if (event.source !== iframe.contentWindow) return
  if (HAS_STRICT_ORIGIN && event.origin !== WIDGET_ORIGIN) return
  if (!event.data || typeof event.data !== 'object') return

  const { type, data } = event.data
  log('received', type, data)

  if (type === 'resize' && data?.height) {
    iframe.style.height = `${Math.ceil(data.height)}px`
  }

  // Simulate slow API: widget booted empty (skeleton), deliver cards after a delay.
  if (type === 'ready' && state.lateBackend) {
    if (lateBackendTimer != null) clearTimeout(lateBackendTimer)
    log('info', `late backend: waiting ${LATE_BACKEND_DELAY_MS}ms before setContent`)
    lateBackendTimer = setTimeout(() => {
      lateBackendTimer = null
      sendCardsContent()
    }, LATE_BACKEND_DELAY_MS)
  }

  // Card click on `available`: the parent starts its API request NOW (on click,
  // not on animationComplete). Sandbox simulates it via the mock backend, which
  // replies with setCardState after the configured delay.
  if (type === 'cardClick') {
    scheduleMockBackend(data)
  }

  // animationComplete now fires AFTER the flash reveal — the moment for the FE
  // to open its result popup. Sandbox only logs it (no popup here).
})

// --- Boot -------------------------------------------------------------------

fillGlobalInputs()
fillMockInputs()
renderCardRows()
reloadIframe()

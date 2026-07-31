// Parent-page emulator for the Lootboxes widgets sandbox.
// Vanilla JS, no build step — mirrors exactly what a real integrating page
// would do: build the initial iframe URL from query params, send/receive
// postMessage, and react to `resize` to size the iframe correctly.
//
// One sandbox serves every brand: `?project=<key>` picks a preset from
// projects.js, which supplies the widget entry, the stage dressing and the
// example data. Nothing below is brand-specific.

import { PROJECTS, resolveProjectKey } from './projects.js'

const CARD_STATES = ['available', 'locked', 'prize', 'prediction', 'missed']

const PROJECT_KEY = resolveProjectKey(new URLSearchParams(window.location.search).get('project'))
const project = PROJECTS[PROJECT_KEY]

function makeCard(overrides = {}) {
  return {
    state: 'locked',
    date: '',
    title: '',
    subtitle: '',
    cta: '',
    tag: '',
    prizeType: '',
    active: false,
    // Sandbox-only convenience: minutes from "send" until the card unlocks.
    // Translated to the contract's absolute `timerTo` (epoch ms) on send,
    // because only the parent page knows the real deadline.
    timerMin: '',
    ...overrides,
  }
}

/** Prize-type options for the selects: brand vocabulary plus an empty choice. */
const PRIZE_TYPES = ['', ...project.prizeTypes]

/** @param {string} id @returns {object[]} a fresh copy of that scenario's cards */
function scenarioCards(id) {
  const scenario = project.scenarios.find((s) => s.id === id) ?? project.scenarios[0]
  return scenario.cards.map((card) => makeCard(card))
}

/** Delay before setContent when "late backend" is enabled (skeleton demo). */
const LATE_BACKEND_DELAY_MS = 2000

/**
 * Cards between the click and the end of the reveal, mapped to their safety
 * timer. Two things read it: the mock, so a second click can't double-answer,
 * and auto-apply, so a `setContent` can't rebuild the row mid-animation.
 */
const openInFlight = new Map()

/**
 * `animationComplete` ends an open. The timer is only there so the sandbox
 * unblocks if that never arrives — the widget declining to animate must not
 * leave auto-apply wedged.
 */
const OPEN_SAFETY_MS = 6000

/** @param {string} key @param {number} [extraMs] time the reply itself will take */
function markOpenStarted(key, extraMs = 0) {
  markOpenFinished(key)
  openInFlight.set(
    key,
    window.setTimeout(() => openInFlight.delete(key), OPEN_SAFETY_MS + extraMs),
  )
}

/** @param {string} key */
function markOpenFinished(key) {
  const timer = openInFlight.get(key)
  if (timer != null) clearTimeout(timer)
  openInFlight.delete(key)
}

/** Row indexes edited since the last delivery, highlighted until the widget has them. */
const pendingRows = new Set()

/**
 * Row indexes currently unfolded. Reset from the row set on every full render
 * and then follows the user, so redrawing one row does not close it.
 * @type {Set<number>}
 */
let expandedRows = new Set()

// Widget entry for the selected brand. Layout is identical in the repo, in
// `dist/` and on the CDN under `widgets-smartico/`, so one relative path works
// in all three.
const WIDGET_ENTRY_PATH = project.entry

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
  // Republish the row on every edit. On by default because the form is only
  // useful as a preview when what you type is what you see; turning it off
  // leaves the buttons as the only way to deliver, which is the older flow.
  autoApply: true,
  viewport: 'desktop',
  scenario: project.scenarios[0].id,
  cards: scenarioCards(project.scenarios[0].id),
  // Mock backend: what the "API" returns when an available card is clicked.
  // The sandbox listens for cardClick and, after `delayMs`, sends setCardState —
  // exactly what a real parent page does once its backend responds.
  mock: {
    enabled: true,
    outcome: 'prize', // 'prize' | 'prediction'
    prizeType: project.mockDefaults.prize.prizeType,
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

// --- Project chrome --------------------------------------------------------

/**
 * Dress the sandbox for the selected brand: switcher state, page and iframe
 * titles, the fake parent-page header and the preview backdrop. Everything here
 * reads from the preset, so a new brand needs no changes in this file.
 */
function applyProjectChrome() {
  const switcher = document.getElementById('in-project')
  if (switcher) {
    switcher.innerHTML = Object.entries(PROJECTS)
      .map(
        ([key, preset]) =>
          `<option value="${key}"${key === PROJECT_KEY ? ' selected' : ''}>${escapeHtml(preset.label)}</option>`,
      )
      .join('')
    // A brand swap changes assets, vocabulary and example data, so reload the
    // sandbox with the new key instead of trying to migrate live state.
    switcher.addEventListener('change', () => {
      const url = new URL(window.location.href)
      url.searchParams.set('project', switcher.value)
      window.location.href = url.href
    })
  }

  document.title = `${project.label} · Пісочниця`
  const pageHeading = document.getElementById('page-heading')
  if (pageHeading) pageHeading.textContent = project.label
  iframe.title = `Карусель віджета ${project.label}`

  const heading = document.getElementById('site-heading')
  const subtitle = document.getElementById('site-subtitle')
  if (heading) heading.textContent = project.header.heading
  if (subtitle) subtitle.textContent = project.header.subtitle

  previewStage.style.backgroundColor = project.stage.color
  previewStage.style.backgroundImage = project.stage.gradient ?? 'none'

  const bgDesktop = document.getElementById('stage-bg-desktop')
  const bgMobile = document.getElementById('stage-bg-mobile')
  // A brand with no bitmap backdrop falls back to the gradient above.
  applyStageImage(bgDesktop, project.stage.desktop)
  applyStageImage(bgMobile, project.stage.mobile)

  const flowReveal = document.getElementById('flow-step-reveal')
  if (flowReveal && project.integrationFlowReveal) {
    flowReveal.textContent = project.integrationFlowReveal
  }
}

/**
 * @param {HTMLImageElement | null} img
 * @param {string} [src]
 */
function applyStageImage(img, src) {
  if (!img) return
  if (src) img.src = src
  // Inline `display` rather than `hidden`, because the viewport rules in the
  // stylesheet set `display: block` on these and would win over `[hidden]`.
  img.style.display = src ? '' : 'none'
}

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
      if (card.subtitle) params.set(`c${i}_subtitle`, card.subtitle)
      if (card.cta) params.set(`c${i}_cta`, card.cta)
      if (card.tag) params.set(`c${i}_tag`, card.tag)
      if (card.prizeType) params.set(`c${i}_prize`, card.prizeType)
      if (card.active) params.set(`c${i}_active`, 'true')
      const timerTo = deadlineFromMinutes(card.timerMin)
      if (timerTo) params.set(`c${i}_timer_to`, String(timerTo))
    })
  }

  return `${WIDGET_ENTRY_PATH}?${params.toString()}`
}

/**
 * Turn the sandbox's "minutes from now" input into the contract's absolute
 * deadline. Returns 0 when the field is empty or not a positive number.
 * @param {string | number} minutes
 * @returns {number}
 */
function deadlineFromMinutes(minutes) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Date.now() + value * 60_000
}

/** Strip sandbox-only fields and resolve the deadline for one card payload. */
function cardPayload(card, position) {
  const { timerMin, ...rest } = card
  const timerTo = deadlineFromMinutes(timerMin)
  return { index: position + 1, ...rest, ...(timerTo ? { timerTo } : {}) }
}

/**
 * A form row is the whole truth about its card, so the command carries every
 * field — blanks included. Omitting a field instead (or sending `undefined`,
 * which the widget's store drops) would make setCardState add-only: a CTA you
 * cleared would stay on screen and a checkbox you unticked would never take.
 * @param {ReturnType<typeof makeCard>} card
 * @param {number} position 0-based row index
 */
function cardStatePayload(card, position) {
  return {
    index: position + 1,
    id: String(position + 1),
    state: card.state,
    date: card.date ?? '',
    title: card.title ?? '',
    subtitle: card.subtitle ?? '',
    cta: card.cta ?? '',
    tag: card.tag ?? '',
    prizeType: card.prizeType ?? '',
    active: Boolean(card.active),
    // 0 reads as "no deadline" on the widget side, which is how a cleared
    // timer field gets through.
    timerTo: deadlineFromMinutes(card.timerMin),
  }
}

function sendCardsContent() {
  const activeCount = state.cards.reduce((count, card) => count + (card.active ? 1 : 0), 0)
  if (activeCount > 1) {
    log(
      'info',
      `⚠ у ряду ${activeCount} активні картки — у проді активний лише сьогоднішній день`,
    )
  }
  postToWidget('setContent', { cards: state.cards.map(cardPayload) })
  clearPendingRows()
}

/** Long enough to swallow a burst of keystrokes, short enough to feel live. */
const AUTO_APPLY_DEBOUNCE_MS = 300

/** @type {ReturnType<typeof setTimeout> | null} */
let autoApplyTimer = null

/**
 * Deliver the edited row without the user having to remember which button
 * republishes it. Debounced, because typing a title fires an event per keystroke.
 * @param {string} reason what the user just did, for the log
 */
function requestAutoApply(reason) {
  if (!state.autoApply) return
  if (autoApplyTimer != null) clearTimeout(autoApplyTimer)
  autoApplyTimer = window.setTimeout(() => {
    autoApplyTimer = null
    // A card is mid-open: setContent would rebuild the row and cut the reveal
    // off. Wait another beat instead of dropping the edit — an open always ends,
    // if not on animationComplete then on its safety timer.
    if (openInFlight.size > 0) {
      requestAutoApply(reason)
      return
    }
    log('info', `авто-застосування: ${reason}`)
    sendCardsContent()
  }, AUTO_APPLY_DEBOUNCE_MS)
}

/** @param {number} index */
function markRowPending(index) {
  pendingRows.add(index)
  cardRowsEl.querySelector(`.card-row[data-index="${index}"]`)?.classList.add('is-pending')
}

function clearPendingRows() {
  pendingRows.clear()
  cardRowsEl
    .querySelectorAll('.card-row.is-pending')
    .forEach((row) => row.classList.remove('is-pending'))
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
 * The mock rewrites the form row as well as the widget, so say so — otherwise
 * fields the user typed change under them with no explanation.
 * @param {number} cardIndex 0-based row index
 * @param {object} fields what the mock wrote
 */
function logMockOverwrite(cardIndex, fields) {
  log('info', `мок переписав картку №${cardIndex + 1} у формі`, fields)
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
  markOpenStarted(key, delayMs)
  log('info', `mock backend: outcome="${outcome}", replying in ${delayMs}ms`)

  window.setTimeout(() => {
    const id = String(data.id ?? cardIndex + 1)

    if (outcome === 'prediction') {
      const title = state.mock.title || project.mockDefaults.prediction.title
      const cta = state.mock.cta || project.mockDefaults.prediction.cta
      Object.assign(card, { state: 'prediction', title, cta, active: true })
      logMockOverwrite(cardIndex, { state: 'prediction', title, cta })
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
      const { prize } = project.mockDefaults
      const prizeType = state.mock.prizeType || prize.prizeType
      const title = state.mock.title || prize.title
      const cta = state.mock.cta || prize.cta
      const tag = state.mock.tag || prize.tag

      Object.assign(card, { state: 'prize', title, prizeType, cta, tag, active: true })
      logMockOverwrite(cardIndex, { state: 'prize', title, prizeType, cta, tag })
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

/**
 * Why a field has no effect on this card, or '' when it does. Every field stays
 * in the payload — the contract does not change with the state — so the ones
 * the widget will ignore are disabled and explained rather than hidden.
 * @param {ReturnType<typeof makeCard>} card
 * @returns {(field: string) => string}
 */
function inapplicableReason(card) {
  const isResult = card.state === 'prize' || card.state === 'prediction'

  return (field) => {
    switch (field) {
      case 'prizeType':
        return card.state === 'prize' || card.state === 'missed'
          ? ''
          : 'Малюнок призу віджет читає лише в станах prize і missed'
      case 'active':
        return isResult
          ? ''
          : 'active позначає сьогоднішній результат — лише prize і prediction'
      case 'cta':
        if (!isResult) return 'Кнопка є лише в результату дня — prize або prediction'
        return card.active ? '' : 'Кнопка з’являється лише в активної картки — увімкніть active'
      case 'tag':
        if (card.state === 'missed') return ''
        if (!isResult) return 'Бейдж статусу є лише на картці з результатом'
        return project.supports.tagOnHistory
          ? ''
          : 'Цей бренд лишає відкритий день із самою датою — бейдж не рендериться'
      case 'timerMin':
        return card.state === 'locked' ? '' : 'Таймер відлічує час до відкриття — лише стан locked'
      default:
        return ''
    }
  }
}

/**
 * playOpen replays the reveal without a click, which only makes sense for a day
 * that could actually be opened. On locked and missed it leaves the widget in a
 * state production never produces (a prize with no title), so it is blocked.
 * @param {ReturnType<typeof makeCard>} card
 * @returns {string} reason to block, or '' when playOpen is fair game
 */
function playOpenBlockedReason(card) {
  return card.state === 'locked' || card.state === 'missed'
    ? `playOpen на «${card.state}» зробив би результат, якого в проді не буває`
    : ''
}

function cardRowTemplate(card, index) {
  const reasonFor = inapplicableReason(card)
  /** @param {string} field */
  const lock = (field) => {
    const reason = reasonFor(field)
    return reason ? ` disabled title="${escapeHtml(reason)}"` : ''
  }

  const options = CARD_STATES.map(
    s => `<option value="${s}" ${s === card.state ? 'selected' : ''}>${s}</option>`
  ).join('')
  const prizeOptions = PRIZE_TYPES.map(
    p =>
      `<option value="${p}" ${p === (card.prizeType || '') ? 'selected' : ''}>${p || '— тип призу —'}</option>`
  ).join('')

  const subtitleInput = project.supports.subtitle
    ? `<input type="text" data-field="subtitle" placeholder="Підзаголовок (другий рядок)" value="${escapeHtml(card.subtitle)}" style="grid-column: span 2" />`
    : ''
  const timerInput = project.supports.timer
    ? `<input type="number" min="0" step="1" data-field="timerMin" placeholder="Таймер, хв до відкриття" value="${escapeHtml(card.timerMin)}"${lock('timerMin')} />`
    : ''

  const playOpenBlocked = playOpenBlockedReason(card)
  const playOpenAttrs = playOpenBlocked
    ? ` disabled title="${escapeHtml(playOpenBlocked)}"`
    : ''

  const summary = [card.date, card.title].filter(Boolean).join(' · ')

  return `
    <details class="card-row${pendingRows.has(index) ? ' is-pending' : ''}" data-index="${index}"${expandedRows.has(index) ? ' open' : ''}>
      <summary class="card-row__head">
        <span class="card-row__summary">
          <strong>№${index + 1}</strong>
          <span class="card-row__chip" data-state="${card.state}">${card.state}</span>
          <span class="card-row__meta">${escapeHtml(summary)}</span>
        </span>
        <button type="button" class="btn btn-danger btn-sm" data-action="remove">Видалити</button>
      </summary>
      <div class="card-row__grid">
        <select data-field="state">${options}</select>
        <select data-field="prizeType"${lock('prizeType')}>${prizeOptions}</select>
        <input type="text" data-field="date" placeholder="Дата (1 Mar)" value="${escapeHtml(card.date)}" />
        <label class="card-row__check" title="${escapeHtml(reasonFor('active') || 'Сьогоднішній результат: підсвічена картка, до якої їде карусель')}"><input type="checkbox" data-field="active" ${card.active ? 'checked' : ''}${lock('active')} /> active (сьогодні)</label>
        <input type="text" data-field="title" placeholder="Заголовок" value="${escapeHtml(card.title)}" style="grid-column: span 2" />
        ${subtitleInput}
        <input type="text" data-field="cta" placeholder="CTA (кнопка результату)" value="${escapeHtml(card.cta)}"${lock('cta')} />
        <input type="text" data-field="tag" placeholder="Бейдж статусу (Opened/Not opened)" value="${escapeHtml(card.tag)}"${lock('tag')} />
        ${timerInput}
      </div>
      <div class="card-row__actions">
        <button type="button" class="btn btn-secondary btn-sm" data-action="apply-state">Надіслати setCardState</button>
        <button type="button" class="btn btn-secondary btn-sm btn-test-only" data-action="play-open-prize"${playOpenAttrs}>playOpen (prize)</button>
        <button type="button" class="btn btn-secondary btn-sm btn-test-only" data-action="play-open-prediction"${playOpenAttrs}>playOpen (prediction)</button>
      </div>
    </details>
  `
}

/** Below this, folding the tail away costs more attention than it saves. */
const MIN_FOLDED_PADDING = 3

/**
 * Where the month's padding starts: the run of locked days that closes the row
 * and carries no scenario of its own. The first locked day is deliberately left
 * out of it — the widget spotlights it as "next", so it is part of the story.
 * @param {ReturnType<typeof makeCard>[]} cards
 * @returns {number} 0-based index, or -1 when there is nothing worth folding
 */
function paddingStartIndex(cards) {
  let runStart = cards.length
  while (runStart > 0 && cards[runStart - 1].state === 'locked') runStart -= 1

  const foldFrom = runStart + 1
  return cards.length - foldFrom >= MIN_FOLDED_PADDING ? foldFrom : -1
}

function renderCardRows() {
  const paddingStart = paddingStartIndex(state.cards)
  expandedRows = new Set(
    state.cards.map((_, index) => index).filter((index) => paddingStart < 0 || index < paddingStart),
  )

  const rows = state.cards.map(cardRowTemplate)
  const folded = paddingStart < 0 ? 0 : state.cards.length - paddingStart

  cardRowsEl.innerHTML = folded
    ? `${rows.slice(0, paddingStart).join('')}
       <details class="card-rows__tail">
         <summary>Заблоковані дні ${paddingStart + 1}–${state.cards.length} (${folded})</summary>
         <div class="card-rows">${rows.slice(paddingStart).join('')}</div>
       </details>`
    : rows.join('')

  syncMockTarget()
}

/**
 * Redraw one row in place. A full `renderCardRows()` would take the caret with
 * it, so anything that happens while the user is in the form goes through here.
 * @param {number} index
 */
function replaceCardRow(index) {
  const row = cardRowsEl.querySelector(`.card-row[data-index="${index}"]`)
  if (!row) return
  row.outerHTML = cardRowTemplate(state.cards[index], index)
  syncMockTarget()
}

/**
 * Keep the collapsed header truthful while the row below it is being typed
 * into — the header is what the row looks like once it folds back up.
 * @param {number} index
 */
function refreshRowSummary(index) {
  const row = cardRowsEl.querySelector(`.card-row[data-index="${index}"]`)
  if (!row) return
  const card = state.cards[index]
  row.querySelector('.card-row__meta').textContent = [card.date, card.title]
    .filter(Boolean)
    .join(' · ')
}

function syncCardField(event) {
  const row = event.target.closest('.card-row')
  const field = event.target.dataset.field
  if (!row || !field) return
  const index = Number(row.dataset.index)
  state.cards[index][field] =
    event.target.type === 'checkbox' ? event.target.checked : event.target.value

  markRowPending(index)
  // These two decide which of the remaining inputs the widget will even look
  // at, so the row has to redraw to match. Everything else only patches the
  // header, because redrawing would take the caret out of the field being typed
  // into.
  if (field === 'state' || field === 'active') replaceCardRow(index)
  else refreshRowSummary(index)
  requestAutoApply(`картка №${index + 1}, поле ${field}`)
}

cardRowsEl.addEventListener('input', syncCardField)
cardRowsEl.addEventListener('change', syncCardField)

// `toggle` does not bubble, so it is caught on the way down. Tracking it keeps
// a row open across the redraw that follows a state change.
cardRowsEl.addEventListener(
  'toggle',
  (event) => {
    const row = event.target
    if (!(row instanceof HTMLDetailsElement) || !row.classList.contains('card-row')) return
    const index = Number(row.dataset.index)
    if (row.open) expandedRows.add(index)
    else expandedRows.delete(index)
  },
  true,
)

cardRowsEl.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]')
  const row = event.target.closest('.card-row')
  if (!button || !row) return
  const index = Number(row.dataset.index)
  const card = state.cards[index]

  // The delete button sits inside the row's <summary>; without this a click on
  // it would also fold the row it is about to remove.
  if (button.closest('summary')) event.preventDefault()

  if (button.dataset.action === 'remove') {
    state.cards.splice(index, 1)
    pendingRows.clear()
    renderCardRows()
    requestAutoApply(`видалено картку №${index + 1}`)
    return
  }

  if (button.dataset.action === 'apply-state') {
    postToWidget('setCardState', cardStatePayload(card, index))
    pendingRows.delete(index)
    replaceCardRow(index)
  }

  const playOpenOutcome =
    button.dataset.action === 'play-open-prize'
      ? 'prize'
      : button.dataset.action === 'play-open-prediction'
        ? 'prediction'
        : ''

  if (playOpenOutcome) {
    markOpenStarted(String(index + 1))
    postToWidget('playOpen', { index: index + 1, state: playOpenOutcome })
    // playOpen mutates the widget directly, so the form has to follow it — an
    // out-of-date row means the next setContent silently rolls the reveal back.
    Object.assign(card, { state: playOpenOutcome, active: true })
    replaceCardRow(index)
    log('info', `playOpen перевів картку №${index + 1} у «${playOpenOutcome}» — рядок форми оновлено`)
  }
})

document.getElementById('btn-add-card').addEventListener('click', () => {
  state.cards.push(makeCard())
  renderCardRows()
  markRowPending(state.cards.length - 1)
  requestAutoApply(`додано картку №${state.cards.length}`)
})

const scenarioSelect = document.getElementById('in-scenario')

function fillScenarioOptions() {
  if (!scenarioSelect) return
  scenarioSelect.innerHTML = project.scenarios
    .map(
      (scenario) =>
        `<option value="${scenario.id}"${scenario.id === state.scenario ? ' selected' : ''}>${escapeHtml(scenario.label)}</option>`,
    )
    .join('')
}

scenarioSelect?.addEventListener('change', () => {
  state.scenario = scenarioSelect.value
  state.cards = scenarioCards(state.scenario)
  pendingRows.clear()
  renderCardRows()
  log('info', 'scenario loaded', { scenario: state.scenario })
  requestAutoApply(`сценарій «${state.scenario}»`)
})

document.getElementById('btn-load-example').addEventListener('click', () => {
  state.cards = scenarioCards(state.scenario)
  pendingRows.clear()
  renderCardRows()
  requestAutoApply('перезавантаження сценарію')
})

/**
 * Replay the missed-day transition the way production will trigger it: take the
 * current active day, mark it missed, promote the next day to available and push
 * the whole row with `setContent`. The widget diffs the row itself and animates.
 */
document.getElementById('btn-play-burn')?.addEventListener('click', () => {
  const activeIndex = state.cards.findIndex(
    (card) => card.state === 'available' || (card.active && card.state !== 'locked'),
  )
  if (activeIndex < 0) {
    log('info', 'burn: no active day in the current row — nothing to expire')
    return
  }

  const burnt = state.cards[activeIndex]
  Object.assign(burnt, {
    state: 'missed',
    active: false,
    cta: '',
    prizeType: burnt.prizeType || project.mockDefaults.prize.prizeType,
    title: burnt.title || project.mockDefaults.prize.title,
  })

  const next = state.cards[activeIndex + 1]
  if (next) Object.assign(next, { state: 'available', title: '', subtitle: '', timerMin: '' })

  renderCardRows()
  sendCardsContent()
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

const autoApplyInput = document.getElementById('in-auto-apply')
autoApplyInput?.addEventListener('change', () => {
  state.autoApply = autoApplyInput.checked
  log(
    'info',
    state.autoApply
      ? 'авто-застосування увімкнено — кожна правка форми йде у віджет'
      : 'авто-застосування вимкнено — доставляйте ряд кнопкою «Надіслати setContent»',
  )
  if (state.autoApply && pendingRows.size > 0) requestAutoApply('накопичені правки')
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
const mockTagField = document.getElementById('mock-tag-field')
const mockDelayInput = document.getElementById('mock-delay')
const mockDelayVal = document.getElementById('mock-delay-val')
const mockTargetEl = document.getElementById('mock-target')

/**
 * The mock only ever answers a click on the one openable day, so name it —
 * otherwise the panel reads as if it applied to the whole row.
 */
function syncMockTarget() {
  if (!mockTargetEl) return
  const index = state.cards.findIndex((card) => card.state === 'available')
  mockTargetEl.textContent =
    index >= 0
      ? `Відповідає на клік по картці №${index + 1}`
      : 'У ряду немає картки в стані available — мок не спрацює'
}

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
    state.mock.outcome === 'prediction'
      ? project.mockDefaults.prediction
      : project.mockDefaults.prize
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

function syncMockOutcomeLabels() {
  if (!mockOutcomeInput || !project.mockOutcomeLabels) return
  const { prize, prediction } = project.mockOutcomeLabels
  const prizeOpt = mockOutcomeInput.querySelector('option[value="prize"]')
  const predictionOpt = mockOutcomeInput.querySelector('option[value="prediction"]')
  if (prizeOpt) prizeOpt.textContent = prize
  if (predictionOpt) predictionOpt.textContent = prediction
}

function fillMockInputs() {
  syncMockOutcomeLabels()
  if (mockEnabledInput) mockEnabledInput.checked = state.mock.enabled
  if (mockOutcomeInput) mockOutcomeInput.value = state.mock.outcome
  if (mockPrizeTypeInput) {
    mockPrizeTypeInput.innerHTML = project.prizeTypes
      .map((type) => `<option value="${type}">${escapeHtml(type)}</option>`)
      .join('')
    mockPrizeTypeInput.value = state.mock.prizeType
  }
  // Empty title/cta on first load → show defaults for the selected outcome.
  if (!state.mock.title && !state.mock.cta) syncMockOutcomeDefaults()
  if (mockTitleInput) mockTitleInput.value = state.mock.title
  if (mockCtaInput) mockCtaInput.value = state.mock.cta
  if (mockTagInput) mockTagInput.value = state.mock.tag
  // A brand that drops the badge on an opened day has nothing to type here.
  if (mockTagField) mockTagField.hidden = !project.supports.tagOnHistory
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
  // to open its result popup. Sandbox only logs it (no popup here), and treats
  // it as the end of the open so auto-apply may deliver again.
  if (type === 'animationComplete') {
    markOpenFinished(String(data?.id ?? data?.index ?? ''))
  }
})

// --- Boot -------------------------------------------------------------------

applyProjectChrome()
fillScenarioOptions()
fillGlobalInputs()
fillMockInputs()
if (autoApplyInput) autoApplyInput.checked = state.autoApply
renderCardRows()
reloadIframe()

// Parent-page emulator for the Vegas Lootboxes widget sandbox.
// Vanilla JS, no build step — mirrors exactly what a real integrating page
// would do: build the initial iframe URL from query params, send/receive
// postMessage, and react to `resize` to size the iframe correctly.

const CARD_STATES = ['available', 'locked', 'prize', 'prediction', 'empty'];

const EXAMPLE_CARDS = [
  { state: 'available', date: '1 Mar', title: "See what's inside", cta: '', tag: '' },
  { state: 'locked', date: '2 Mar', title: '', cta: '', tag: '' },
  { state: 'prize', date: '1 Mar', title: '20 Free Spins', cta: 'Go to Bonuses', tag: 'Opened' },
  { state: 'prediction', date: '1 Mar', title: 'Something is waiting for you in the future', cta: '', tag: 'Opened' },
  { state: 'empty', date: '1 Mar', title: 'Come back tomorrow', cta: '', tag: 'Opened' },
  { state: 'locked', date: '6 Mar', title: '', cta: '', tag: '' },
  { state: 'locked', date: '7 Mar', title: '', cta: '', tag: '' },
];

const state = {
  heading: 'Fortune Drops',
  subtitle: 'Visit every day to open a Fortune Drop and see what luck brings',
  lang: 'en',
  origin: '',
  debug: false,
  viewport: 'desktop',
  cards: JSON.parse(JSON.stringify(EXAMPLE_CARDS)),
};

// --- DOM refs ----------------------------------------------------------

const iframe = document.getElementById('widget-frame');
const previewFrame = document.getElementById('preview-frame');
const urlDisplay = document.getElementById('url-display');
const logEl = document.getElementById('log');
const cardRowsEl = document.getElementById('card-rows');

const globalInputs = document.querySelectorAll('[data-global]');

// --- Helpers -------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildWidgetUrl() {
  const params = new URLSearchParams();
  if (state.lang) params.set('lang', state.lang);
  if (state.heading) params.set('heading', state.heading);
  if (state.subtitle) params.set('subtitle', state.subtitle);
  if (state.origin) params.set('origin', state.origin);
  if (state.debug) params.set('debug', 'true');

  state.cards.forEach((card, position) => {
    const i = position + 1;
    if (card.state) params.set(`c${i}_state`, card.state);
    if (card.date) params.set(`c${i}_date`, card.date);
    if (card.title) params.set(`c${i}_title`, card.title);
    if (card.cta) params.set(`c${i}_cta`, card.cta);
    if (card.tag) params.set(`c${i}_tag`, card.tag);
  });

  return `../widget/index.html?${params.toString()}`;
}

function log(direction, type, data) {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${direction}`;
  const time = new Date().toLocaleTimeString();
  const label = direction === 'sent' ? 'PARENT →' : direction === 'received' ? '← WIDGET' : 'INFO';
  entry.innerHTML = `
    <span class="log-time">${time}</span><span class="log-dir">${label}</span><strong>${escapeHtml(type)}</strong>
    ${data !== undefined ? `<pre class="log-data">${escapeHtml(JSON.stringify(data))}</pre>` : ''}
  `;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function postToWidget(type, data) {
  if (!iframe.contentWindow) return;
  iframe.contentWindow.postMessage({ type, data }, '*');
  log('sent', type, data);
}

// --- Rendering: global fields -------------------------------------------

function fillGlobalInputs() {
  globalInputs.forEach((input) => {
    const key = input.dataset.global;
    if (input.type === 'checkbox') {
      input.checked = Boolean(state[key]);
    } else {
      input.value = state[key] ?? '';
    }
  });
}

globalInputs.forEach((input) => {
  const key = input.dataset.global;
  const eventName = input.type === 'checkbox' ? 'change' : 'input';
  input.addEventListener(eventName, () => {
    state[key] = input.type === 'checkbox' ? input.checked : input.value;
  });
});

// --- Rendering: card rows -------------------------------------------------

function cardRowTemplate(card, index) {
  const options = CARD_STATES.map(
    (s) => `<option value="${s}" ${s === card.state ? 'selected' : ''}>${s}</option>`,
  ).join('');

  return `
    <div class="card-row" data-index="${index}">
      <div class="card-row__head">
        <strong>Card #${index + 1}</strong>
        <button type="button" class="btn btn-danger btn-sm" data-action="remove">Remove</button>
      </div>
      <div class="card-row__grid">
        <select data-field="state">${options}</select>
        <input type="text" data-field="date" placeholder="Date (1 Mar)" value="${escapeHtml(card.date)}" />
        <input type="text" data-field="title" placeholder="Title" value="${escapeHtml(card.title)}" style="grid-column: span 2" />
        <input type="text" data-field="cta" placeholder="CTA (prize only)" value="${escapeHtml(card.cta)}" />
        <input type="text" data-field="tag" placeholder="Tag (Opened/Missed)" value="${escapeHtml(card.tag)}" />
      </div>
      <div class="card-row__actions">
        <button type="button" class="btn btn-secondary btn-sm" data-action="apply-state">Send setCardState</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="play-open">Send playOpen</button>
      </div>
    </div>
  `;
}

function renderCardRows() {
  cardRowsEl.innerHTML = state.cards.map(cardRowTemplate).join('');
}

cardRowsEl.addEventListener('input', (event) => {
  const row = event.target.closest('.card-row');
  const field = event.target.dataset.field;
  if (!row || !field) return;
  const index = Number(row.dataset.index);
  state.cards[index][field] = event.target.value;
});

cardRowsEl.addEventListener('change', (event) => {
  const row = event.target.closest('.card-row');
  const field = event.target.dataset.field;
  if (!row || !field) return;
  const index = Number(row.dataset.index);
  state.cards[index][field] = event.target.value;
});

cardRowsEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  const row = event.target.closest('.card-row');
  if (!button || !row) return;
  const index = Number(row.dataset.index);
  const card = state.cards[index];

  if (button.dataset.action === 'remove') {
    state.cards.splice(index, 1);
    renderCardRows();
    return;
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
    });
  }

  if (button.dataset.action === 'play-open') {
    postToWidget('playOpen', { index: index + 1 });
  }
});

document.getElementById('btn-add-card').addEventListener('click', () => {
  state.cards.push({ state: 'locked', date: '', title: '', cta: '', tag: '' });
  renderCardRows();
});

document.getElementById('btn-load-example').addEventListener('click', () => {
  state.cards = JSON.parse(JSON.stringify(EXAMPLE_CARDS));
  renderCardRows();
});

// --- Iframe reload / setContent ------------------------------------------

function reloadIframe() {
  const url = buildWidgetUrl();
  urlDisplay.textContent = new URL(url, window.location.href).href;
  iframe.src = url;
  log('info', 'reload iframe', { url });
}

document.getElementById('btn-reload').addEventListener('click', reloadIframe);

document.getElementById('btn-copy-url').addEventListener('click', () => {
  navigator.clipboard?.writeText(urlDisplay.textContent || '');
});

document.getElementById('btn-send-content').addEventListener('click', () => {
  postToWidget('setContent', {
    heading: state.heading,
    subtitle: state.subtitle,
    cards: state.cards.map((card, position) => ({ index: position + 1, ...card })),
  });
});

document.getElementById('btn-loading-on').addEventListener('click', () => {
  postToWidget('setLoading', { loading: true });
});

document.getElementById('btn-loading-off').addEventListener('click', () => {
  postToWidget('setLoading', { loading: false });
});

document.getElementById('btn-clear-log').addEventListener('click', () => {
  logEl.innerHTML = '';
});

// --- Viewport toggle -------------------------------------------------------

const desktopBtn = document.getElementById('btn-viewport-desktop');
const mobileBtn = document.getElementById('btn-viewport-mobile');

function setViewport(mode) {
  state.viewport = mode;
  previewFrame.classList.toggle('is-mobile', mode === 'mobile');
  desktopBtn.classList.toggle('is-active', mode === 'desktop');
  mobileBtn.classList.toggle('is-active', mode === 'mobile');
}

desktopBtn.addEventListener('click', () => setViewport('desktop'));
mobileBtn.addEventListener('click', () => setViewport('mobile'));

// --- Incoming messages from the widget ------------------------------------

window.addEventListener('message', (event) => {
  if (event.source !== iframe.contentWindow) return;
  if (!event.data || typeof event.data !== 'object') return;

  const { type, data } = event.data;
  log('received', type, data);

  if (type === 'resize' && data?.height) {
    iframe.style.height = `${data.height}px`;
  }
});

// --- Boot -------------------------------------------------------------------

fillGlobalInputs();
renderCardRows();
reloadIframe();

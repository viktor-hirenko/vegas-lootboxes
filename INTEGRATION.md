# Vegas Lootboxes — Fortune Drops widget: integration guide

Short reference for the Front-End team integrating the draft iFrame widget. This
mirrors the documentation on the sandbox test page (`test/index.html`) — open that
page for a live, interactive version of everything below (edit data, fire
`postMessage` commands, watch the log).

> **Scope reminder:** this is a draft. Final open animation, pixel-perfect layout and
> final visual design are a separate task. What's locked down here is the
> **integration contract** — query params and `postMessage` — so Front-End work can
> proceed independently.

## 1. Embedding the widget

Plain static page, no framework, no build step required. Point an `<iframe>` at the
deployed `index.html` and pass initial content via query parameters:

```html
<iframe
  id="lootbox-widget"
  src="https://cdn.example.com/widgets-smartico/lootbox/index.html?heading=Fortune%20Drops&c1_state=available&c1_date=1%20Mar&c1_title=See%20what%27s%20inside&c2_state=locked&c2_date=2%20Mar"
  style="width: 100%; border: 0;"
  title="Fortune Drops"
></iframe>
```

The widget reports its real rendered height via a `resize` message — use it to size
the iframe so card glow effects are never clipped, instead of hardcoding a height.

## 2. Query parameters (Parent → iFrame)

The format scales to any number of cards without changing the contract: global
parameters describe the widget as a whole, and per-card parameters are grouped by a
1-based index `{i}`. Adding/removing a day only means adding/removing one `c{i}_*`
group — nothing else changes.

### Global parameters

| Param       | Type    | Default | Description |
|-------------|---------|---------|-------------|
| `heading`   | string  | —       | Widget title (e.g. "Fortune Drops"). Hidden if both heading and subtitle are empty. |
| `subtitle`  | string  | —       | Short description line under the heading. |
| `lang`      | string  | `en`    | Language code, passed through for future i18n/analytics use. |
| `count`     | number  | —       | Optional. Ensures indices `1..count` render even if some `c{i}_*` groups are omitted (missing ones default to `locked`). Useful for reserving future/upcoming day slots. |
| `origin`    | string  | —       | Parent origin used to restrict/allow `postMessage` in both directions. Falls back to `*` when omitted (fine for this draft/sandbox; tighten before production). |
| `debug`     | boolean | `false` | When `true`, exposes `window.__lootboxWidget` inside the iframe for manual inspection in devtools. |

### Per-card parameters — `c{i}_*` (i = 1, 2, 3…)

| Param          | Type   | Description |
|----------------|--------|-------------|
| `c{i}_state`   | enum   | One of `available`, `locked`, `prize`, `prediction`, `empty`. Unknown/missing values fall back to `locked`. |
| `c{i}_id`      | string | Optional stable identifier. Defaults to the index `i` as a string. |
| `c{i}_date`    | string | Display date, e.g. `1 Mar`. |
| `c{i}_title`   | string | Card title text (e.g. `"See what's inside"`, `"20 Free Spins"`). |
| `c{i}_cta`     | string | CTA button label, used for the `prize` state (e.g. `"Go to Bonuses"`). |
| `c{i}_tag`     | string | Small corner tag, e.g. `Opened` / `Missed`. |

Example — 5 cards, mixed states:

```text
?heading=Fortune%20Drops&subtitle=Visit%20every%20day...
&c1_state=available&c1_date=1%20Mar&c1_title=See%20what%27s%20inside
&c2_state=locked&c2_date=2%20Mar
&c3_state=prize&c3_title=20%20Free%20Spins&c3_cta=Go%20to%20Bonuses&c3_tag=Opened
&c4_state=prediction&c4_title=Something%20is%20waiting&c4_tag=Opened
&c5_state=empty&c5_date=5%20Mar
```

**No card params at all** is a valid, meaningful state: the widget shows the skeleton
loading placeholder until it receives a `setContent` message — this covers the
"backend replies a few seconds late" scenario from the task.

## 3. postMessage protocol

All messages — in both directions — share one envelope: `{ type: string, data?: object }`.
The parent should always check `event.source` (and `event.origin`, if `origin` was
configured) before trusting a message.

### iFrame → Parent

| `type`               | `data`                        |
|----------------------|-------------------------------|
| `ready`               | `{ count }`                   |
| `cardClick`           | `{ index, id, state }`        |
| `animationComplete`   | `{ index, id, state }`        |
| `resize`              | `{ height }`                  |

### Parent → iFrame

| `type`          | `data`                                              |
|-----------------|------------------------------------------------------|
| `setContent`    | `{ heading?, subtitle?, cards[] }`                    |
| `setCardState`  | `{ index\|id, state, title?, cta?, tag?, date? }`     |
| `playOpen`      | `{ index\|id }`                                       |
| `setLoading`    | `{ loading }`                                         |

### Event details

- **`ready`** — sent once, right after the widget finishes parsing query params and
  rendering its first frame (skeleton or real cards). Safe to start sending commands
  as soon as this arrives.
- **`cardClick`** — sent when the user clicks a card in the `available` state (other
  states are not clickable). The draft "open" transition starts immediately after.
- **`animationComplete`** — sent when the (draft, replaceable) open transition
  finishes. This is the signal the product/parent side listens for to show the
  prize/prediction popup on top of everything, per the task.
- **`resize`** — sent whenever the widget's rendered height changes (via
  `ResizeObserver`), including the extra space reserved for glow effects. Use it to
  keep the iframe height in sync instead of a fixed value.
- **`setContent`** — replaces heading/subtitle/cards **without reloading the
  iframe**. This is how a late backend response should update the widget after the
  initial (possibly skeleton) render.
- **`setCardState`** — updates a single card by `id` (preferred) or `index`. Only the
  fields you pass are changed.
- **`playOpen`** — programmatically triggers the same draft open animation as a user
  click, without requiring an actual click (useful for testing, or parent-driven
  flows).
- **`setLoading`** — force skeleton mode on/off regardless of whether card data is
  available. Mainly for testing; in normal operation the widget manages this
  automatically.

## 4. Skeleton loading

On boot, the widget parses query params. If at least one `c{i}_*` group (or `count`)
is present, it renders immediately with that data. Otherwise it shows skeleton
placeholder cards and waits — the skeleton is replaced by real cards only once
`setContent` (or `setCardState`) is received, so the backend can safely take a
couple of extra seconds without the user ever seeing an empty/broken widget.

## 5. Interaction order

1. **Parent** embeds the iframe with initial query params (or none, to start in skeleton mode).
2. **Widget** parses params, renders skeleton or cards, then sends `ready { count }`.
3. **Widget** sends `resize { height }` whenever its size changes (including right after first render).
4. **Parent** (optional) sends `setContent` once the real backend data resolves, if it wasn't already in the initial query params.
5. User clicks the `available` card → **Widget** sends `cardClick { index, id, state }` and starts the draft open transition.
6. **Widget** sends `animationComplete { index, id, state }` when the transition finishes.
7. **Parent** shows its prize/prediction popup on top of the page (outside the iframe) and, once the backend confirms the result, sends `setCardState` to persist the new visual state (e.g. `prize` or `empty`).

## 6. Example integration (vanilla JS)

```js
const iframe = document.getElementById('lootbox-widget');

window.addEventListener('message', (event) => {
  if (event.source !== iframe.contentWindow) return; // ignore unrelated messages
  const { type, data } = event.data || {};

  switch (type) {
    case 'ready':
      console.log('Widget ready, cards:', data.count);
      break;

    case 'resize':
      iframe.style.height = data.height + 'px';
      break;

    case 'cardClick':
      console.log('User clicked card', data.index, data.id);
      break;

    case 'animationComplete': {
      // Ask the backend for the real result, then show your popup and
      // persist the new state back into the widget:
      fetchLootboxResult(data.id).then((result) => {
        showPrizePopup(result); // your own UI, rendered above the iframe
        iframe.contentWindow.postMessage(
          {
            type: 'setCardState',
            data: {
              id: data.id,
              state: result.prize ? 'prize' : 'empty',
              title: result.prize ?? undefined,
              cta: result.prize ? 'Go to Bonuses' : undefined,
              tag: 'Opened',
            },
          },
          '*',
        );
      });
      break;
    }
  }
});

// Later, once the backend resolves (e.g. a couple of seconds after load):
iframe.contentWindow.postMessage(
  {
    type: 'setContent',
    data: {
      heading: 'Fortune Drops',
      cards: [
        { index: 1, id: 'day-1', state: 'available', date: '1 Mar', title: "See what's inside" },
        { index: 2, id: 'day-2', state: 'locked', date: '2 Mar' },
      ],
    },
  },
  '*',
);
```

## 7. Deployment

Manual upload, same as other widgets on this CDN — no automated pipeline was built
for this draft. See [`README.md`](./README.md) for the exact steps and destination
folder (`widgets-smartico/lootbox`).

## 8. Out of scope (this task)

Final open animation, pixel-perfect layout and final visual design are explicitly
out of scope — this widget and the sandbox exist to lock down the integration
contract above so Front-End work can proceed while the final animation is built
separately.

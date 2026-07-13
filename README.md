# Vegas Lootboxes — iFrame Widget

Production-shaped renderer for the Vegas Lootboxes cards row. Final animations are
integrated; the `postMessage` contract is frozen — integrators should treat
[`INTEGRATION.md`](./INTEGRATION.md) as the stable API.

**Stack: plain HTML, CSS and JavaScript. No runtime frameworks.** The widget runs
directly as static files — no build step is required. The `esbuild`/Node scripts in this
repo are optional developer conveniences only (local dev server, minified bundle).

The full integration contract (data passing, `postMessage` protocol, open-card
flow, examples) lives in [`INTEGRATION.md`](./INTEGRATION.md) — the single source of
truth for integrators. The sandbox at `lootbox-test/index.html` is an interactive
playground to exercise that contract by hand.

## Project structure

Folder names are identical everywhere — in the repo, in `dist/`, and on the CDN.
The widget always lives in `lootbox/`; the integration sandbox always lives in
`lootbox-test/`. There is no renaming step at any point.

```text
vegas-lootboxes/
├─ lootbox/             # the widget — this is what integrators embed
│  ├─ index.html        # widget entry point (the iframe src)
│  ├─ widget.css
│  ├─ widget.js         # bootstraps the widget
│  └─ modules/          # protocol + rendering modules (ES modules)
├─ lootbox-test/        # integration sandbox (parent-page emulator)
│  ├─ index.html
│  └─ test.js           # loads the widget from ../lootbox/index.html
├─ scripts/             # optional dev tooling (serve/build), not shipped
├─ INTEGRATION.md       # canonical integration contract (single source of truth)
└─ package.json
```

## Local development

No dependencies are required to just open the files, but a local server avoids
`file://` restrictions on ES modules and `fetch`:

```bash
npm install   # only needed for the optional build script (esbuild)
npm run dev
```

Then open:
- Widget alone: `http://localhost:4173/lootbox/index.html`
- Integration sandbox: `http://localhost:4173/lootbox-test/index.html`

## Production build (optional)

```bash
npm run build
```

Bundles and minifies `lootbox/widget.js` into `dist/lootbox/widget.min.js`, copies
`widget.css`, rewrites `dist/lootbox/index.html` to reference the minified script, and
copies the sandbox into `dist/lootbox-test/`. The output keeps the exact same folder
names as the source:

```text
dist/
├─ lootbox/             # minified widget, ready for the CDN
│  ├─ index.html
│  ├─ widget.css
│  ├─ widget.min.js
│  └─ assets/
└─ lootbox-test/        # sandbox, ready for the CDN
   ├─ index.html
   └─ test.js
```

Preview the build locally:

```bash
npm run serve:dist
```

This step is optional — `lootbox/` also works as-is, unbundled.

## Deployment

Per the task, this is deployed manually to the CDN bucket whose credentials live in
Vault (`bbq-cdn-wl-common`). After `npm run build`, upload the two folders from `dist/`
into the CDN prefix, keeping the same names:

```text
<cdn-bucket>/widgets-smartico/lootbox/       ← dist/lootbox/
<cdn-bucket>/widgets-smartico/lootbox-test/  ← dist/lootbox-test/
```

Manual steps:
1. `npm run build`
2. Upload `dist/lootbox/` into `widgets-smartico/lootbox/` on the bucket.
3. Upload `dist/lootbox-test/` into `widgets-smartico/lootbox-test/` on the bucket.
4. Share URLs with the integrating team:
   - Widget (iframe src): `https://<cdn-host>/widgets-smartico/lootbox/index.html`
   - Integration sandbox: `https://<cdn-host>/widgets-smartico/lootbox-test/index.html`

The sandbox loads the widget via the relative path `../lootbox/index.html`, so both
folders must stay **siblings** under the same CDN prefix (e.g. both under
`widgets-smartico/`).

Deploy is manual upload (same as other widgets on this CDN). If releases become
recurring, a follow-up script such as:

```bash
aws s3 sync ./dist/lootbox      s3://<bucket>/widgets-smartico/lootbox --delete
aws s3 sync ./dist/lootbox-test s3://<bucket>/widgets-smartico/lootbox-test --delete
```

would be the natural next step once bucket/profile naming conventions are confirmed.

## Scope

See [`INTEGRATION.md`](./INTEGRATION.md) for the full contract. Status: **production-shaped,
contract frozen.** Card states, scalable card count, navigation, the full `postMessage`
protocol, skeleton loading, and final motion-designer animations are implemented.

Animations include the spinning disco ball (animated AVIF with WebP fallback, 1×/2×),
rotating glow, the tapping-hand click hint, and a **two-phase open sequence** whose reveal
is driven by the backend result:

- **Phase 1 — charge** (on `cardClick`): the disco ball pulses in a loop, masking backend
  latency while the parent fetches the result.
- **Phase 2 — flash reveal** (on `setCardState`): a full-card flash covers the card and, at
  its peak, the content is swapped underneath to the final art — so the prize/prediction
  appears from inside the flash. Confetti bursts **only for `prize`**. Then `animationComplete`
  fires (popup time).

This keeps the flash "magic" (it hides the swap) and handles slow backends without any
infinite animation. The parent must start its API request on `cardClick` (see
[`INTEGRATION.md`](./INTEGRATION.md)). Animations respect `prefers-reduced-motion`.
Animation assets live under `lootbox/assets/images/animations/`.

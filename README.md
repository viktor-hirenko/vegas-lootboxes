# Lootboxes — iFrame Widgets

Production-shaped renderer for the daily Lootboxes cards row, released as one
widget per brand from a single shared core. The `postMessage` contract is frozen —
integrators should treat [`INTEGRATION.md`](./INTEGRATION.md) as the stable API.

| Brand | Folder | Status |
|-------|--------|--------|
| Vegas | `lootbox/` | Production. Final motion-designer animations integrated. |
| Thor  | `lootbox-thor/` | Draft for review. Full contract, final art, animations per the Figma motion spec. |

**Stack: plain HTML, CSS and JavaScript. No runtime frameworks.** The widgets run
directly as static files — no build step is required. The `esbuild`/Node scripts in
this repo are optional developer conveniences only (local dev server, minified
bundle).

The full integration contract (data passing, `postMessage` protocol, open-card
flow, per-brand appendices) lives in [`INTEGRATION.md`](./INTEGRATION.md) — the
single source of truth for integrators. The sandbox at `lootbox-test/index.html` is
an interactive playground to exercise that contract by hand against either brand.

## Project structure

Folder names are identical everywhere — in the repo, in `dist/`, and on the CDN.
There is no renaming step at any point.

```text
vegas-lootboxes/
├─ core/                 # brand-agnostic runtime, shared by every widget
│  ├─ runtime.js         # boots a widget from a brand config
│  ├─ protocol.js        # message types, card states — the contract in code
│  ├─ params.js          # query-param parsing
│  ├─ content-store.js   # card set + normalisation
│  ├─ card.js carousel.js resize.js skeleton.js countdown.js transitions.js
│  ├─ base.css fonts.css # structure and typography (no brand colours)
│  └─ assets/fonts/      # shared webfonts, copied into each brand on build
├─ lootbox/              # Vegas widget — this is what integrators embed
│  ├─ index.html         # widget entry point (the iframe src)
│  ├─ brand.config.js    # the only thing core/ reads from a brand
│  ├─ render.js icons.js vocabulary.js open.js open-animation.js
│  ├─ theme.css          # brand tokens, geometry, animations
│  └─ assets/
├─ lootbox-thor/         # Thor widget — same shape, different art
├─ lootbox-test/         # integration sandbox (parent-page emulator)
│  ├─ index.html
│  ├─ projects.js        # brand presets — add a brand here to get it in the switcher
│  └─ test.js            # loads the selected widget from ../<brand-folder>/index.html
├─ scripts/              # optional dev tooling (serve/build), not shipped
├─ INTEGRATION.md        # canonical integration contract (single source of truth)
└─ package.json
```

### Adding a brand

Everything brand-specific is one folder plus one sandbox entry. `core/` never
reaches into a brand folder — it only reads the object exported by
`brand.config.js`.

1. Copy an existing brand folder and replace `theme.css`, `assets/`, `icons.js`,
   `vocabulary.js`, `render.js` and the animation pair (`open.js`,
   `open-animation.js`).
2. Register the folder in `BRANDS` in `scripts/build.js`.
3. Add a preset to `lootbox-test/projects.js` so the sandbox can switch to it.
4. In §11 of `INTEGRATION.md`, add the brand to the `prizeType` table (which
   values it draws itself, which one stands in for the rest) and document the
   optional contract fields it renders.

## Local development

No dependencies are required to just open the files, but a local server avoids
`file://` restrictions on ES modules and `fetch`:

```bash
npm install   # only needed for the optional build script (esbuild)
npm run dev
```

Then open:
- Vegas widget alone: `http://localhost:4173/lootbox/index.html`
- Thor widget alone: `http://localhost:4173/lootbox-thor/index.html`
- Integration sandbox: `http://localhost:4173/lootbox-test/index.html` — the
  project switcher in the sidebar reloads with `?project=vegas` / `?project=thor`

Unit tests (Node's built-in runner, no dependencies):

```bash
npm test
```

## Production build (optional)

```bash
npm run build
```

For each brand it bundles and minifies `widget.js` into `widget.min.js`,
concatenates `core/fonts.css` + `core/base.css` + the brand `theme.css` into one
`widget.css`, rewrites `index.html` to reference both, and copies the brand assets
plus the shared fonts. Each CDN folder is therefore **self-contained** and can be
uploaded on its own. The sandbox is copied as-is.

```text
dist/
├─ lootbox/             # minified Vegas widget, ready for the CDN
│  ├─ index.html
│  ├─ widget.css
│  ├─ widget.min.js
│  └─ assets/
├─ lootbox-thor/        # minified Thor widget, same shape
└─ lootbox-test/        # sandbox, ready for the CDN
```

Preview the build locally:

```bash
npm run serve:dist
```

This step is optional — the brand folders also work as-is, unbundled.

## Deployment

Per the task, this is deployed manually to the CDN bucket whose credentials live in
Vault (`bbq-cdn-wl-common`). After `npm run build`, upload the folders from `dist/`
into the CDN prefix, keeping the same names:

```text
common/widgets-smartico/lootbox/       ← dist/lootbox/
common/widgets-smartico/lootbox-thor/  ← dist/lootbox-thor/
common/widgets-smartico/lootbox-test/  ← dist/lootbox-test/
```

Manual steps:
1. `npm run build`
2. Upload each `dist/<folder>/` into `common/widgets-smartico/<folder>/` on the bucket.
3. Share URLs with the integrating team:
   - Vegas widget (iframe src): `https://cdn-wl.s3.amazonaws.com/common/widgets-smartico/lootbox/index.html`
   - Thor widget (iframe src): `https://cdn-wl.s3.amazonaws.com/common/widgets-smartico/lootbox-thor/index.html`
   - Integration sandbox: `https://cdn-wl.s3.amazonaws.com/common/widgets-smartico/lootbox-test/index.html`
   - Origin for `event.origin` checks: `https://cdn-wl.s3.amazonaws.com`

> **Note — this address may change.** These are the current deployment paths. The
> host or the `common/widgets-smartico/…` prefix can change (different bucket/env,
> renamed folders). Integrators should keep the host + base path in a single
> constant so a move is a one-line change.

The sandbox loads a widget via a relative path (`../lootbox-thor/index.html`), so
all folders must stay **siblings** under the same CDN prefix.

Deploy is manual upload (same as other widgets on this CDN). If releases become
recurring, a follow-up script such as:

```bash
aws s3 sync ./dist/lootbox      s3://<bucket>/common/widgets-smartico/lootbox --delete
aws s3 sync ./dist/lootbox-thor s3://<bucket>/common/widgets-smartico/lootbox-thor --delete
aws s3 sync ./dist/lootbox-test s3://<bucket>/common/widgets-smartico/lootbox-test --delete
```

would be the natural next step once bucket/profile naming conventions are confirmed.

## Scope

See [`INTEGRATION.md`](./INTEGRATION.md) for the full contract. Card states,
scalable card count, navigation, the full `postMessage` protocol, skeleton loading
and the brand animations are implemented for both widgets.

The open sequence is the same two-phase model in every brand, because the reveal is
driven by the backend result rather than by a fixed timeline:

- **Phase 1 — charge** (on `cardClick`): a looping wait animation masks backend
  latency while the parent fetches the result.
- **Phase 2 — reveal** (on `setCardState`): a transition covers the card and swaps
  the content underneath to the final art, so the prize appears from inside the
  animation. Then `animationComplete` fires (popup time).

Vegas plays this as a pulsing disco ball into a full-card flash with confetti for a
prize; Thor wobbles the card and then turns it over in 3D. Thor additionally has a
countdown badge on the next locked day and a burn-out transition for a missed day.
Per-brand details are in §11 of [`INTEGRATION.md`](./INTEGRATION.md). Animations
respect `prefers-reduced-motion`.

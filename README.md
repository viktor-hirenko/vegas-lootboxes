# Vegas Lootboxes — Fortune Drops iFrame Widget (draft)

Draft iFrame widget for the Vegas Lootboxes ("Fortune Drops") cards row, built so the
Front-End team can start integration without waiting on the final animation/visual design.

**Stack: plain HTML, CSS and JavaScript. No runtime frameworks.** The widget runs
directly as static files — no build step is required. The `esbuild`/Node scripts in this
repo are optional developer conveniences only (local dev server, minified bundle).

Full integration contract (query parameters, `postMessage` events, examples) is
documented on the sandbox test page and mirrored in [`INTEGRATION.md`](./INTEGRATION.md).

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
├─ lootbox-test/        # integration sandbox (parent-page emulator + docs)
│  ├─ index.html
│  └─ test.js           # loads the widget from ../lootbox/index.html
├─ scripts/             # optional dev tooling (serve/build), not shipped
├─ INTEGRATION.md       # short integration guide (mirror of the sandbox docs)
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

No automated deploy script was built for this draft (manual upload, same as other
widgets on this CDN). If this becomes a recurring release, a follow-up script such as:

```bash
aws s3 sync ./dist/lootbox      s3://<bucket>/widgets-smartico/lootbox --delete
aws s3 sync ./dist/lootbox-test s3://<bucket>/widgets-smartico/lootbox-test --delete
```

would be the natural next step once bucket/profile naming conventions are confirmed.

## Scope

See [`INTEGRATION.md`](./INTEGRATION.md) and the docs section on the sandbox page for what
is/isn't covered. In short: card states, scalable card count, navigation, the full
`postMessage` protocol and skeleton loading are implemented. Final art and the final
open animation are explicitly out of scope for this task (draft transition only).

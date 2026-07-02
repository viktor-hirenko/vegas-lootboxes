# Vegas Lootboxes — Fortune Drops iFrame Widget (draft)

Draft iFrame widget for the Vegas Lootboxes ("Fortune Drops") cards row, built so the
Front-End team can start integration without waiting on the final animation/visual design.

**Stack: plain HTML, CSS and JavaScript. No runtime frameworks.** The widget runs
directly as static files — no build step is required. `esbuild`/Node scripts in this
repo are optional developer conveniences only (local dev server, minified bundle).

Full integration contract (query parameters, `postMessage` events, examples) is
documented on the sandbox test page and mirrored in [`INTEGRATION.md`](./INTEGRATION.md).

## Project structure

```text
vegas-lootboxes/
├─ widget/              # <-- this is what gets deployed to the CDN
│  ├─ index.html        # widget entry point (the iframe src)
│  ├─ widget.css
│  ├─ widget.js         # bootstraps the widget
│  └─ modules/          # protocol + rendering modules (ES modules)
├─ test/
│  └─ index.html        # parent-page emulator + full integration docs
├─ scripts/             # optional dev tooling (serve/build), not shipped
├─ INTEGRATION.md        # short integration guide (mirror of the test page docs)
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
- Widget alone: `http://localhost:4173/widget/index.html`
- Test / integration sandbox: `http://localhost:4173/test/index.html`

## Production build (optional)

```bash
npm run build
```

Bundles and minifies `widget/widget.js` into `dist/widget/widget.min.js`, copies
`widget.css` and rewrites `dist/widget/index.html` to reference the minified script.
This step is optional — `widget/` also works as-is, unbundled.

## Deployment

Per the task, this is deployed manually to the CDN bucket credentials for which live in
Vault (`bbq-cdn-wl-common`). We upload into a dedicated folder so it doesn't collide with
other widgets:

```text
<cdn-bucket>/widgets-smartico/lootbox/
```

Manual steps:
1. `npm run build` (or just use `widget/` directly for a quick draft deploy).
2. Upload the contents of `dist/widget/` (or `widget/`) into `widgets-smartico/lootbox/`
   on the bucket, using credentials from Vault.
3. Share the resulting URL (e.g. `https://<cdn-host>/widgets-smartico/lootbox/index.html`)
   with the integrating team, together with the query parameters from `INTEGRATION.md`.

No automated deploy script was built for this draft (manual upload, same as other
widgets on this CDN). If this becomes a recurring release, a follow-up script such as:

```bash
aws s3 sync ./dist/widget s3://<bucket>/widgets-smartico/lootbox --delete
```

would be the natural next step once bucket/profile naming conventions are confirmed.

## Scope

See [`INTEGRATION.md`](./INTEGRATION.md) and the docs section on the test page for what
is/isn't covered. In short: card states, scalable card count, navigation, the full
`postMessage` protocol and skeleton loading are implemented. Final art and the final
open animation are explicitly out of scope for this task (draft transition only).

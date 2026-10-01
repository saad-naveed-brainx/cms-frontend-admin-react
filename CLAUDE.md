# cms-admin — repo guide

Platform-wide guide and docs: **[../CLAUDE.md](../CLAUDE.md)** and **[../docs/](../docs/)**.
Read those first; this file covers only what is specific to this repo.

React 19 SPA on Vite. The authoring surface: content lists, block editor, media library, site
settings. Ships as a static build behind `admin.<domain>`. **No database access — REST only.**

## Invariants for this repo

1. **Never copy a block component into this repo.** Block types, registry, components and the theme
   system come from the `cms-blocks` package, so one implementation serves both the editor canvas
   and the public site. See `../docs/DECISIONS.md` D-008.
2. **The canvas is a same-origin `about:blank` iframe** with block components mounted into it via
   `createPortal` — for style isolation and so `@media` queries measure the canvas rather than the
   browser window. Never add a `sandbox` attribute without `allow-same-origin`; it would force an
   opaque origin and cut off all DOM access.
3. **Permission checks here are UI affordance, not enforcement.** The API enforces. A hidden button
   is not a security control.
4. The current site comes from the site switcher and travels with every request.

## Gotchas

- **Tailwind 4 does not scan `node_modules`.** `src/index.css` must declare
  `@source "../../node_modules/cms-blocks/src";` or shared block components render unstyled.
- **React must not be duplicated.** `cms-blocks` declares `react`/`react-dom` as peer dependencies;
  keep `resolve: { dedupe: ['react', 'react-dom'] }` in `vite.config.ts`. Two React copies produce
  `Invalid hook call`, usually right after `npm link`.
- **Drag sensors and the iframe.** dnd-kit listens on `document`; the iframe has a *different*
  `document`. List-panel dragging works normally; dragging inside the canvas needs sensors pointed at
  the iframe's document.
- Port is **5173** by default (`strictPort`); `vite.config.ts` reads `PORT` so a devflow slot or the
  browser tests (5190) can run beside it. Whatever port admin runs on must be in the API's `CORS_ORIGINS`.
- `VITE_API_URL` points at **`:4001`** locally, not 4000.

## Commands

```bash
npm run dev          # vite, port 5173 (or $PORT)
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve the build
npm run typecheck
npm run lint         # oxlint
npm run tokens       # no hex colours or raw px outside src/index.css
npm run test:e2e     # Playwright browser tests (port 5190, or the slot's)
npm run test:visual  # screenshots at 375/768/1280 vs the approved baselines
```

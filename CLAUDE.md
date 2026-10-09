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
- **Who is signed in lives in `src/session.ts`**, outside React. Storage keys: `cms-admin.session`
  (`{accessToken, expiresAt}` only) and `cms-admin.site` (the site being worked on). Everything else
  (person, sites, role, permissions) is asked of `GET /auth/me` on every load. Calls go through `authed()`,
  so the token and `X-Site-Id` travel with them and a 401 ends the session; `src/api.ts` is the only
  place that calls `fetch`. The session decides between sign-in, "checking" and the signed-in frame;
  inside the frame `react-router` does the rest (`BrowserRouter` in `main.tsx`, the routes in `Shell.tsx`:
  `/` overview, `/pages`, `/pages/new`, `/pages/:id`, and `/sites/new`). The page list keeps its filters and
  page number in the address (`../docs/DECISIONS.md` D-020, D-022).
- **New site** (`/sites/new`, `NewSite.tsx`, `sites-api.ts`) is about the person, not one site, so it is
  routed even when they belong to none. The organisation is asked only when they own several. After it is
  created, `reloadProfile(siteId)` (in `session.ts`) asks `/auth/me` again so the Site control lists the new
  site and selects it, then the screen goes to `/pages` with a "Site created." notice. The notice rides in
  the history entry, so a reload of that page shows it again (as with "Page created.").
- **No Prettier config in this repo.** `npx prettier --write` with its defaults rewrites every file
  (double quotes, semicolons). If you format, pass `--no-semi --single-quote --print-width 100` and
  check `git diff --stat` for files you did not mean to touch.
- **Three kinds of browser test.** `e2e` answers the API's calls itself (server down, a 500, no sites)
  and is what GitHub CI runs. `flow` is the real thing: it starts the **api repo** (`../api`) on its own
  port (`DEVFLOW_PORT_API` + 500) and database (`cms_wt<N>_flow`), creates the clients with the real seed
  command, and drives the real sign-in. It needs the api repo beside this one (in a slot:
  `devflow-wt new <slug> api admin`) and is not in CI yet (backlog B-26). Besides the two clients Olivia
  administers, `e2e/flow/tenants.ts` lists `people` (Paula, Mia), each seeded with a site of their own, for
  tests that count a list or change a person's sites: a test that changes someone's site list gets a person
  of its own. `visual` is macOS screenshots.

## Commands

```bash
npm run dev          # vite, port 5173 (or $PORT)
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve the build
npm run typecheck
npm run lint         # oxlint
npm run tokens       # no hex colours or raw px outside src/index.css
npm run test:e2e     # Playwright browser tests (port 5190, or the slot's)
npm run test:flow    # the real flow: starts ../api on its own database, then signs in for real
npm run test:visual  # screenshots at 375/768/1280 vs the approved baselines
```

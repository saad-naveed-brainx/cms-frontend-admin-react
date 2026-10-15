# cms-admin — repo guide

Platform-wide guide and docs: **[../CLAUDE.md](../CLAUDE.md)** and **[../docs/](../docs/)**.
Read those first; this file covers only what is specific to this repo.

React 19 SPA on Vite. The authoring surface: content lists, block editor, media library, site
settings. Ships as a static build behind `admin.<domain>`. **No database access — REST only.**

## Invariants for this repo

1. **`src/site-blocks/` is an exact copy of the website's block and theme code; never edit it here.**
   Change a block in `../web`, then `npm run blocks:sync` and commit both repos. The gate's `blocks`
   check fails when the copy differs from web (`../docs/DECISIONS.md` D-030, superseding D-008's package).
2. **The live preview is a same-origin `srcdoc` iframe** with the copied components mounted into it via
   `createPortal`, for style isolation (Tailwind's reset never reaches the admin) and so `@media`
   queries measure the preview, not the window. Never add a `sandbox` attribute without
   `allow-same-origin`; it would force an opaque origin and cut off all DOM access.
3. **Permission checks here are UI affordance, not enforcement.** The API enforces. A hidden button
   is not a security control.
4. The current site comes from the site switcher and travels with every request.

## Gotchas

- **Tailwind is only for the live preview.** `src/preview/preview.css` (`@import "tailwindcss" source(none)`,
  `@source "../site-blocks"`) is imported with `?inline` and written into the preview frame; the admin's own
  screens stay plain CSS (`src/index.css`). Fonts are self-hosted `@fontsource` packages, named as web's
  `next/font` names them (`--font-fraunces` and so on). `@/` points at `src/site-blocks` (`vite.config.ts`,
  `tsconfig.app.json`), so the copied files import exactly as they do in web.
- **The preview frame** (`PreviewFrame.tsx`) is the box both previews share: the Desktop/Mobile views, the same-origin frame and the portal.
  `src/site-blocks/site/` also holds exact copies of the website's site frame (`SiteChrome`, `SiteHeader`, `SiteFooter`,
  `types.ts`) and its ready-made palettes and contrast helper (`palettes.ts`, `contrast.ts`), for the Appearance screen.
- **Appearance** (`/appearance`, `Appearance.tsx`, `appearance-draft.ts`, `appearance-api.ts`, GOV-04, `../docs/DECISIONS.md`
  D-036): the site's name, tagline, footer note, logo and look, with the website's own header, home page and footer in the
  preview. Colours start from a ready-made palette, then the brand and accent colours (text on the brand colour is chosen
  for contrast; a faint accent or brand is warned about, not refused). Save sends only what changed (the theme whole),
  then asks `/auth/me` again so the top bar and the edit screen's preview use the new name and theme. In the menu only
  with `settings.manage`; opened without it, the screen is read-only. Tests write expected colours out rather than
  importing `src/site-blocks` (the test tsconfig does not resolve its `@/` imports).
- **The live preview** (`LivePreview.tsx`, `../docs/DECISIONS.md` D-030) sits under the Publish box on the edit screen
  and draws `drafts.map(cleanBlock)` (what Save would send) with web's `parseBlocks`, `BlockRenderer` and
  `SiteThemeRoot`, in the site's theme from sign-in (`site.theme`, laid over the default with `resolveTheme`).
  Desktop draws at 1280 pixels shrunk to fit; Mobile at 390. A block web would leave out is left out, with a note.
  Links inside it do nothing; the entrance motion is off.
- Port is **5173** by default (`strictPort`); `vite.config.ts` reads `PORT` so a devflow slot or the
  browser tests (5190) can run beside it. Whatever port admin runs on must be in the API's `CORS_ORIGINS`.
- `VITE_API_URL` points at **`:4001`** locally, not 4000.
- **Who is signed in lives in `src/session.ts`**, outside React. Storage keys: `cms-admin.session`
  (`{accessToken, expiresAt}` only) and `cms-admin.site` (the site being worked on). Everything else
  (person, sites, role, permissions) is asked of `GET /auth/me` on every load. Calls go through `authed()`,
  so the token and `X-Site-Id` travel with them and a 401 ends the session; `src/api.ts` is the only
  place that calls `fetch`. The session decides between sign-in, "checking" and the signed-in frame;
  inside the frame `react-router` does the rest (a data router in `main.tsx`, `createBrowserRouter` with one catch-all
  route around `<App />`, only so `useBlocker` works (D-034); the routes stay in `Shell.tsx`:
  `/` Dashboard, `/pages`, `/pages/new`, `/pages/:id`, `/media`, `/appearance`, `/sites` and `/sites/new`). The page list keeps its filters and
  page number in the address (`../docs/DECISIONS.md` D-020, D-022).
- **The frame looks like WordPress's admin** (`Shell.tsx`, `../docs/DECISIONS.md` D-027): a dark bar on top (site or
  Site switcher, New site, "Howdy, <name>", Sign out) and a dark menu on the left. The menu offers only what works:
  Dashboard, **one entry per content type of the site** (from `GET /content-types`, so `/pages?type=<slug>`, with All …
  and Add New; one "Content" entry if the types cannot load) and Sites. `/pages` with no type is "All content". The
  menu folds to icons at 960 pixels and hides behind a Menu button at 782, as WordPress's does. Light only: the
  colours are WordPress's admin palette, as tokens in `src/index.css`. Icons are `lucide-react`, pinned to an exact version.
- **Links to the website** (`src/site-links.ts`, `../docs/DECISIONS.md` D-028): sign-in gives each site its main address
  (`site.primaryHost`), and `siteUrl(host, path)` turns it into a link with `VITE_SITE_SCHEME` (`http` or `https`, default
  `https`) and `VITE_SITE_PORT` (default none), so locally `http://cafe.localhost:3000/` and in production
  `https://cafe.example.com/`. `/home` links to `/`. Visit Site (bar), Visit site (Dashboard), View (published rows only),
  View page (published edit screen) and Visit (Sites screen) open in a new tab. Every browser test runs the admin with
  `http` and port 3000 (`siteLinkEnv` in `e2e/flow/env.ts`), so expected links are exact.
  **Preview** (Publish box, any member, `../docs/DECISIONS.md` D-029; only while the page is not published: once it is, View page
  shows the same saved page, D-035) asks `POST /content/:id/preview` and opens
  `previewUrl(host, path, token)` (`<page address>?preview=<token>`): the tab is opened at the click, before the
  request, so it is not blocked as a pop-up, gets `opener = null`, and closes again if no link can be had. It waits
  for unsaved changes, because a preview shows the page as saved.
- **New site** (`/sites/new`, `NewSite.tsx`, `sites-api.ts`) is about the person, not one site, so it is
  routed even when they belong to none. The organisation is asked only when they own several. After it is
  created, `reloadProfile(siteId)` (in `session.ts`) asks `/auth/me` again so the Site control lists the new
  site and selects it, then the screen goes to `/pages` with a "Site created." notice. The notice rides in
  the history entry, so a reload of that page shows it again (as with "Page created."). Opened on this computer
  (`onThisComputer()` in `site-links.ts`: `localhost`, `127.0.0.1`, `*.localhost`), every address is saved as a
  `.localhost` one (`savedAddress()` in `helpers.ts`: `xyz` → `xyz.localhost`; `../docs/DECISIONS.md` D-038), shown as
  "Will be saved as …" under the box; on a live server addresses are sent as typed. Tests that type an address expect
  `.localhost` on it.
- **Deleting a site** (`Sites.tsx`, `deleteSite` in `sites-api.ts`, `../docs/DECISIONS.md` D-039): a **Delete** button on the
  Sites screen only where the membership says `ownsOrganization`; it opens a panel ("Delete <name>?") where the site's name
  must be typed exactly before **Delete this site** works (Enter deletes, Escape cancels). Then `reloadProfile()`, so the
  list, the Site control and the current site follow, and "<name> was deleted." A 403, a failure and a 404 are said in the
  panel. `request()` answers `null` for a 204.
- **The front page** (`FrontPageNotice.tsx`, `../docs/DECISIONS.md` D-037) is the page at `/home`, which every new site
  starts with, published. The Dashboard and the Pages list (all content, or Pages) ask `GET /content?path=/home`; when
  there is none, or it is not published, a notice says visitors see "Page not found" and offers **Create the front page**
  (Home, a hero with the site's name, published, then its edit screen) or **Publish the front page** (with
  `content.create`/`content.publish`; without them it asks for someone who can). A failed check shows nothing. List rows
  at `/home` read "Home — Front page". Tests that answer page lists themselves must tell the list's request from this
  check (`?path=`), or a 401 meant for the list lands on the Dashboard's check first.
- **The block editor** (`BlocksEditor.tsx`, `block-schemas.ts`, `block-drafts.ts`) is on the edit screen: a form
  per block, beside the live preview. `block-schemas.ts` (the forms' fields) is written by hand: a block type or
  field changed in `web/src/blocks/types.ts` and `parse-blocks.ts` must be changed here too, then
  `npm run blocks:sync` for the drawing. Empty fields are left out when saving; a block of a type the editor does not
  know is shown and saved exactly as it was; only what changed is sent; Publish waits
  for unsaved changes, since publishing does not save them. Links and image addresses are checked with the same rule
  the website applies (`https://`, `/`, `mailto:`, `tel:`), so a link the site would drop is refused here.
- **The Text block** (`richText`, `RichTextField.tsx`, `../docs/DECISIONS.md` D-041) is a TipTap editor (StarterKit, exact
  versions) with a toolbar: bold, italic, heading, subheading, lists, quote, link (a `window.prompt`, checked with
  `SAFE_LINK`). It is limited to what the API keeps (no code, rules or images; links without `target`/`rel`; no empty
  paragraph kept at the end) and sends `''` when empty. TipTap re-applies `useEditor`'s options on every render, so the
  box's `aria-*` attributes live there, not in a later `setOptions`. A value from outside (after a save) replaces the text
  without counting as a change. Pasted HTML goes through TipTap's schema, and the API cleans it again on save.
- **The media library** (`/media`, `Media.tsx`, `media-api.ts`, `../docs/DECISIONS.md` D-042): "Media" in the menu for every
  member; the grid of small copies (`thumbUrl`), newest first, 40 at a time ("Show more pictures"); **Add New Media File**
  (a file input inside a label, several files at once, sent one by one) only with `media.upload`. JPEG, PNG and WebP up to
  10 MB are checked before sending; the API checks again and its message is shown with the file's name. Uploads go through
  `authed()` with a `FormData` body (`request()` then sends no JSON `Content-Type`). Pictures load from the API's address
  (`url`, `thumbUrl`), never from the admin's. The stand-in is `fakeMedia` (every `/uploads/…` answers `SAMPLE_PNG`); the
  flow API stores uploads in a throwaway folder (`MEDIA_DIR` in `e2e/flow/start-api.mjs`).
- **Choosing a library picture** (`MediaPicker.tsx`, MED-03): a native modal `<dialog>` ("Choose a picture", "Choose a logo")
  with the library's grid; clicking a picture chooses it, "Upload a new picture" (with `media.upload`) adds one and chooses
  it, Escape or Cancel closes it. Render it only while choosing (`{open && <MediaPicker … />}`): it opens on mount and
  asks for the library each time. Picture groups (`picker: true` in `block-schemas.ts`: Hero and Image and text) show
  "Choose from library" / "Change picture" with a small view; choosing fills `src` with the picture's full address and
  moves to Alt text when it is empty (the site draws no picture without alt text, so neither does the preview). The
  Appearance screen's **Logo** (`logoUrl`, `''` for none) is chosen the same way, shown in the preview's header, and
  saved with Save; Remove logo clears it.
- **The search engines box** (`SeoBox.tsx`, `seo-fields.ts`, SEO-01, `../docs/DECISIONS.md` D-033) sits under the blocks
  on the edit screen, as Yoast's does: a search result preview that follows the typing, then SEO title, meta description
  (each with Google's rough length, 60 and 160, as a guide only), "Hide this page from search engines" and, under Advanced
  (open while it holds a value), the canonical address. The rules match the API's (200, 500, a full `https://` or
  `http://` address); an emptied box is sent as `null`, and only changed fields are sent, with the title and blocks. Its
  boxes' ids are their field names (`seoTitle`), so a problem focuses the box. Tests find the page's Title box with
  `getByLabel('Title', { exact: true })`: a loose match also finds "SEO title".
- **Save is in a bar along the bottom of the edit screen** (`.save-bar`, sticky, D-034), not in the Publish box: one Save
  button, with "You have unsaved changes." or "No unsaved changes." and any save error. While anything is unsaved the
  Publish box says "Save your changes first. Preview and Publish use the saved page." **Leaving with unsaved changes asks
  first** (`src/leave-guard.ts`): links and Back through `useBlocker`, the site switcher and Sign out through
  `confirmLeaving()` before they act, a reload or closing the tab through `beforeunload`. A new control that leaves the
  edit screen without a navigation must call `confirmLeaving()` too. Playwright dismisses a dialog it is not told to
  answer, so a test that leaves with unsaved changes must answer it (`e2e/flow/save-bar.spec.ts`).
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
  of its own. Sam (`stylist`) renames her site on the Appearance screen, so no other test uses her. `visual` is macOS screenshots.

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
npm run blocks:sync  # copy web's blocks and theme into src/site-blocks (after changing them in web)
npm run blocks:check # fail if src/site-blocks differs from ../web (skipped when ../web is absent)
```

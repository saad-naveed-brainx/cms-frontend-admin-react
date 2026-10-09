# Copied from cms-web. Do not edit here.

Everything in this folder except this note is an exact copy of the website's block and theme code
(`../web/src/blocks`, `../web/src/theme`, and three helpers), so the admin's live preview draws a block
exactly as the site does (`../../docs/DECISIONS.md` D-030).

- Change a block or the theme **in the web repo**, then run `npm run blocks:sync` here and commit both.
- `npm run blocks:check` (part of the quality gate) fails when a copy differs from web. It needs the web
  repo beside this one; in GitHub CI it is skipped.
- Imports inside the copy use web's `@/…` paths; `vite.config.ts` and `tsconfig.app.json` point `@/` here.

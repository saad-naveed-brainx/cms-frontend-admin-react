# cms-admin

React SPA (Vite) admin panel for the multi-tenant CMS: content editing, block
editor, media library, and per-site settings. Talks to `cms-api` over REST; it
has no database access of its own.

Deployed as a static build behind `admin.<domain>`.

## Prerequisites

- Node 22 (`.nvmrc`)
- `cms-api` running (default `http://localhost:4001`)

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev                 # http://localhost:5173
```

`.env.local`:

```
VITE_API_URL="http://localhost:4001"
```

The API must list `http://localhost:5173` in its `CORS_ORIGINS`.

## Scripts

| Script              | Does                              |
| ------------------- | --------------------------------- |
| `npm run dev`       | dev server on :5173 (strict port) |
| `npm run build`     | typecheck + build to `dist/`      |
| `npm run preview`   | serve the build locally           |
| `npm run lint`      | oxlint                            |
| `npm run typecheck` | `tsc -b --noEmit`                 |

## Notes

- No router or data-fetching library yet — added when the first real screens land.

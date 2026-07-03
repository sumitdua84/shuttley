# Shuttley

Badminton club app — match recording, club/session management, chat, rankings.

## Location & repo structure

Local path: `C:\Users\sumit\Projects\Shuttley\shuttley` (this folder).

The GitHub repo root (`sumitdua84/shuttley`) is one level up from here — it
contains only `README.md`, `Vercel.json`, and this `shuttley/` folder, which
is the actual Vite app. Run all npm commands from this folder, not the repo
root.

Migrated here from Google Drive (`Shared drives/Shuttley/App/shuttley`) on
2026-06-19 — see [docs/STAGING.md](docs/STAGING.md) for why and what's still
on Drive.

Active branch: `main` (production, live at `https://www.shuttley.club`, currently at
`03a800c`; V1 docs closeout `c530631`; app-code state `a56d509`). `develop` is the
staging/integration branch, served at `https://dev.shuttley.club`. V1
app-feel is live in production; V2 has not started. See
[PROJECT.md](PROJECT.md) and
`SHUTTLEY - V1 PRODUCTION RELEASE CLOSEOUT HANDOVER.md` for full status.

## Stack

- Vite 5 + React 18 (JSX, no TypeScript)
- react-router-dom 6 for routing
- Supabase (`@supabase/supabase-js`) for auth + database, client-side queries
- vite-plugin-pwa for the PWA manifest/service worker
- Vercel for hosting/deployment
- `api/` — Vercel serverless functions (push notifications via `web-push`,
  admin endpoints, an AI coach endpoint using `@anthropic-ai/sdk`)

## Commands

```
npm install
npm run dev       # vite dev server
npm run build     # production build to dist/
npm run preview   # preview the production build
```

## Known issues (see audit findings)

- All routes in `src/App.jsx` are eagerly imported — no `React.lazy()` code
  splitting. Production build emits a single ~690KB JS chunk.
- Largest pages (`MemberDashboard.jsx`, `ModeratorDashboard.jsx`,
  `MatchesPage.jsx`) are 1000+ lines each, fetch data via sequential
  (non-parallelized) Supabase `await` chains, and have no memoization.
- Staging exists: `develop` branch deploys to `https://dev.shuttley.club`
  against the `shuttley-dev` Supabase project (`ecdibuhrgdmsdvovmlvl`),
  separate from production Supabase (`wuvwvrgxbfcyhqsyoswd`) — see
  [docs/STAGING.md](docs/STAGING.md) before making major UI/perf/PWA changes.

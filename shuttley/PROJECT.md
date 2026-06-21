# Shuttley — Project Overview

Badminton club app: match recording, club/session management, chat, rankings,
splits, push notifications. Live on the App Store and Play Store.

Stack: Vite 5 + React 18 (JSX), react-router-dom 6, Supabase (auth + Postgres,
client-side queries), vite-plugin-pwa, Vercel hosting, Capacitor iOS shell.

Repo: `sumitdua84/shuttley` on GitHub. Local path:
`C:\Users\sumit\Projects\Shuttley\shuttley`. See [CLAUDE.md](CLAUDE.md) for
commands and [docs/STAGING.md](docs/STAGING.md) for environment history.

## Branches

- `main` — production, live App Store/Play Store build. Do not touch directly
  during this initiative.
- `develop` — staging/integration branch, tracks `origin/develop`.
- `feature/shuttley-app-feel-upgrade` — this initiative's working branch,
  created from `develop` on 2026-06-20.
- `docs/shuttley-v2-architecture-planning` — planning-only branch off
  `develop` holding `SHUTTLEY-V2-ARCHITECTURE.md`. No code on it.

## Current status (stopping point, 2026-06-21)

**Session paused here deliberately — see ISSUES.md §8 for this QA
session's full detail, and §6 for the restart-from-cold guide.**

- Active branch: `feature/shuttley-app-feel-upgrade`, off `develop`,
  **14 commits** (latest: `428abe6`, code-only — this docs update is a
  separate commit), clean working tree otherwise, **not pushed, not
  merged**.
- Production (`main`) untouched throughout — no schema changes, no
  deploys, confirmed at every step. Every SQL fix this session was
  applied directly to the shuttley-dev Supabase project only.
- App-feel work from the 2026-06-20 session, plus this session's QA
  fixes, are implemented and verified live against `shuttley-dev`:
  - **Splits** — fixed and verified end-to-end.
  - **Chat** — schema fixed, duplicate-conversation race fixed,
    app-feel polish done, converted to one mobile-first layout across
    desktop and mobile. Verified end-to-end.
  - **Account deletion / admin** — fixed in code (schema, RPC, table
    reference, and a new admin-visibility endpoint), but **not yet
    verified at runtime** — needs `vercel dev` or a deployment, since
    Vercel serverless functions don't execute under local `vite dev`.
    Confirm Delete has not been clicked; no account has been
    anonymized.
- **Do not merge to `develop` or `main` yet** — still-unverified areas:
  member removal/demotion, rotation-mode scheduling, PWA install/update,
  Vercel preview readiness, and the account-deletion runtime test noted
  above.
- Phase 3 (component cleanup) and Phase 4 (PWA polish) — **not started**,
  intentionally held.
- V2 architecture (`SHUTTLEY-V2-ARCHITECTURE.md`) — planning document
  only, on its own branch, **not approved for implementation yet**.

## Shuttley App-Feel Upgrade

**Why:** Shuttley is live and approved; current priority per the PM is user
acquisition, club onboarding, and growth — not new features. This initiative
makes the existing app *feel* faster, smoother, and more professional
("native app" feel instead of "wrapped website") without expanding scope,
changing the Supabase schema, or touching production until fully tested.

**Inspiration, not a template:** lessons are drawn from how TradePulse
(`C:\Users\sumit\Projects\TradePulse`) feels more modern — but TradePulse is
a Next.js App Router project, so most of its "modern feel" comes from
framework-level route splitting and server components, not portable code.
The applicable lessons are: route-level code splitting, deliberate loading
states, and a disciplined docs/component structure — not literal TradePulse
code. Shuttley stays a Vite SPA; no framework migration in this phase.

### Current problems found (Phase 0 audit, 2026-06-20)

- **No code splitting** — `src/App.jsx` eagerly imports all 18
  routes/pages. Production build emits a single JS chunk: **692.99 KB
  (181.14 KB gzip)**, with Vite warning about chunk size on every build.
- **Large monolithic pages** — `ModeratorDashboard.jsx` (1499 lines),
  `MemberDashboard.jsx` (1231), `MatchesPage.jsx` (1134),
  `SplitsPage.jsx` (1006), `ChatPage.jsx` (803). All fetch data and render
  in one file with no extracted sub-components.
- **Sequential Supabase calls** — e.g. `MemberDashboard.jsx` lines 142-176
  run ~6 independent `await supabase...` calls back-to-back instead of
  `Promise.all`, adding up latency on every dashboard load.
- **No skeleton/loading states** — the only loading UI is a single
  full-screen splash (pulsing logo) shown while `loading === true`;
  dashboards otherwise render nothing until all data resolves.
- **Browser-native dialogs** — 20 raw `alert()`/`confirm()`/
  `window.confirm()` calls across `AdminDashboard.jsx`, `MatchesPage.jsx`,
  `MemberDashboard.jsx`, `ModeratorDashboard.jsx`, `ProfilePage.jsx` for
  destructive-action confirmations and error messages. These break app feel
  and can't be styled.
- **console.log** — only 1 in the whole codebase; not a real problem.
- **Existing foundation is decent** — `src/index.css` already defines CSS
  custom-property tokens (colors, radii, fonts), has `env(safe-area-inset-*)`
  wired into `.topnav`/`.tabbar`, and has an unused `.toast` class ready to
  build on. This is not a from-scratch UI problem.

### What will be fixed in Phase 1 (this branch, in progress)

- Replace blank-load gaps with skeleton placeholders on dashboards.
- Add subtle (150-200ms) route/page transitions.
- Replace `alert`/`confirm` with in-app toast + confirm-modal components,
  without changing the underlying business logic of each action.
- Audit and tone down any janky/continuous animations.
- Confirm mobile safe-area handling is complete (it's already partially
  done — see CSS above) and there's no bottom-nav overlap.

### What will be deferred

- Route-level code splitting and Supabase call parallelization (Phase 2).
- Breaking up the large dashboard files into shared components (Phase 3).
- PWA/manifest/splash polish beyond what's already configured (Phase 4).
- React Query / caching — only added if Phase 2 shows clear benefit.
- Court booking and any other new feature (explicitly out of scope here —
  see [[project_shuttley_court_booking]] in memory, that work resumes
  separately after this phase and after App Store re-review).

### What must not be touched

- `main` branch / production deployment.
- Supabase schema (tables, RLS policies) — no schema changes planned;
  this is a frontend/UI initiative.
- Authentication flow.
- Existing working features — this is polish, not a rewrite.

### Staging/prod rules

- All work happens on `feature/shuttley-app-feel-upgrade`, branched from
  `develop`.
- No merge to `main`, no production deploy, until explicitly approved by
  Sumit after manual testing.
- Vercel preview deployments (from pushing this branch) are the test
  surface — not production.

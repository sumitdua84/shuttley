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

## Vercel projects

- **`shuttley`** — production project, serves `shuttley.club`, deploys
  from `main`. Real production Supabase. Do not touch during this
  initiative.
- **`shuttley-dev`** (added 2026-06-23) — dev-only project, `sumitdua84`
  personal Vercel account, same GitHub repo (`sumitdua84/shuttley`),
  Root Directory `shuttley`. Connected to shuttley-dev Supabase only
  (`https://ecdibuhrgdmsdvovmlvl.supabase.co`). No `shuttley.club`
  domain attached, no production Supabase keys used. Exists purely so
  Vercel serverless functions (`api/*.js`) can be exercised on a real
  runtime — `vite dev` cannot execute them locally. Test via this
  project's Preview deployments of `feature/shuttley-app-feel-upgrade`,
  never its "Production" deployment.

## Current status (close of day, 2026-06-21)

**Session closed for the night at commit `13ce90f`. Full restart
context: `SHUTTLEY — APP FEEL CLOSE OF DAY HANDOVER.md` (repo root, one
level up from this `shuttley/` folder). See also ISSUES.md's "Close of
day" entry at the bottom and §6 for the original restart-from-cold
guide.**

- Active branch: `feature/shuttley-app-feel-upgrade`, off `develop`,
  clean working tree, **not pushed, not merged**.
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
- **Member removal/demotion** — QA'd and fixed (last-admin protection
  added, promote confirmation added), verified end-to-end against
  shuttley-dev. See ISSUES.md and CHANGELOG.md.
- **Rotation-mode scheduling (Auto Schedule)** — QA'd, found a
  shuttley-dev schema drift bug in `rotation_matches`, fixed in code
  (toast + rollback on failure) and then Sumit applied the flagged SQL
  fix on shuttley-dev. **Re-verified end-to-end and fully working**:
  start session, score a match, New Cycle, Rebalance all confirmed
  consistent across `rotation_matches`/`matches`/`match_players`. Free
  Play retested, unaffected. See ISSUES.md and CHANGELOG.md. (Separately
  found and flagged, not fixed: "Add Guest" is also broken on
  shuttley-dev — missing RPC function, spun off as its own task.)
- **PWA install/update** — QA'd. Manifest, icons, service worker
  registration/activation, and the install-prompt UI all verified
  working against the real production build. Fixed a dead `logo.svg`
  reference and a stale `theme-color` mismatch (both `index.html` +
  `vite.config.js` only, no backend involved). Found and flagged, not
  fixed: the maskable icon has no safe-zone padding (needs a new image
  asset, not a code fix). **Real iOS Safari install, real Android
  Chrome install banner, and a genuine update-while-installed scenario
  still need manual device testing** — none of that is possible in
  this tool. See ISSUES.md and CHANGELOG.md.
- **Update 2026-06-23**: Vercel preview readiness and the
  account-deletion Vercel runtime test are now both **PASS** — see
  ISSUES.md and ROADMAP.md for detail. **Do not merge to `develop` or
  `main` yet** — still-unverified: the manual device QA noted above for
  PWA (iOS Safari install, Android Chrome install banner,
  update-while-installed).
- Phase 3 (component cleanup) and Phase 4 (PWA polish) — **not started**,
  intentionally held.
- V2 architecture (`SHUTTLEY-V2-ARCHITECTURE.md`) — planning document
  only, on its own branch, **not approved for implementation yet**.

## Strategy decision (2026-06-21)

The current production polish / app-feel upgrade (this branch) ships
**first**, as its own complete piece of work. V2 architecture
(groups/venues) starts **later**, as a separate phase on its own
branch — never folded into this polish branch. See
`SHUTTLEY-V2-ARCHITECTURE.md` and `docs/shuttley-v2-architecture-planning`
for the V2 direction (current clubs become Groups; real venues/clubs
become separate Venues; a Group can use multiple Venues; a venue/club
management portal; bookings/court availability; migration off the
current live app only after V2 itself is fully tested). V2 is **not
started** and does not begin until this branch is parked or merged.

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

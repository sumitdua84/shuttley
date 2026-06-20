# Shuttley — Changelog

## 2026-06-20 — Phase 0: Audit Shuttley app-feel upgrade scope

**Branch:** `feature/shuttley-app-feel-upgrade` (created from `develop`)

**Summary:** Audited the current frontend for the App-Feel Upgrade
initiative. No functional code changed yet — this entry covers the audit
and documentation setup only.

**Files changed:**
- `PROJECT.md` (new) — project overview, audit findings, scope boundaries
- `ROADMAP.md` (new) — phased plan and checklist
- `CHANGELOG.md` (new, this file)
- `ISSUES.md` (new) — known issues, risky areas, deferred items

**Audit findings (see PROJECT.md for detail):**
- Single 692.99 KB JS bundle (181.14 KB gzip), no route-level code splitting
- 5 pages over 800 lines (`ModeratorDashboard`, `MemberDashboard`,
  `MatchesPage`, `SplitsPage`, `ChatPage`)
- Sequential (non-parallel) Supabase calls on dashboard load
- No skeleton loading states, only a single full-screen splash
- 20 raw `alert()`/`confirm()` calls across 5 pages
- Existing CSS token system and safe-area handling already in good shape —
  not starting from a blank UI

**Testing performed:** `npm run build` run to confirm current bundle size
and baseline build health (passed, build succeeds, warning about chunk size
as expected and documented).

**Known issues:** see [ISSUES.md](ISSUES.md).

**Production touched:** No. No commits to `main`, no deployment triggered.

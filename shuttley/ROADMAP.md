# Shuttley — Roadmap

## In progress: App-Feel Upgrade (`feature/shuttley-app-feel-upgrade`)

Controlled frontend/UX upgrade. No new features, no schema changes, no
production deploys until tested. See [PROJECT.md](PROJECT.md) for full
context and audit findings.

- [x] Phase 0 — Audit current app, confirm branch strategy, write docs
- [x] Phase 1 — Safe app-feel improvements
  - [x] Skeleton loading states — `DashboardSkeleton` used on
        `MemberDashboard`, `ModeratorDashboard`, `RotationPage`, `SessionSummary`
  - [x] Subtle route transitions (180ms fade) wrapping `<Routes>` in `App.jsx`
  - [x] Replace `alert`/`confirm`/`window.confirm` with shared `Toast` +
        `ConfirmModal` (via `useConfirm()`) across all 7 affected pages
  - [ ] Reduce/remove janky or continuous animations — reviewed; existing
        animations (`splash` pulse, `toastin`, `tileIn`) are already short
        and subtle, nothing found worth changing
  - [x] Remove stray debug `console.log` — only 1 existed, left as-is
        (legitimate error logging, not noise)
  - [x] Verify mobile safe-area / bottom-nav / keyboard behaviour — already
        correctly wired via `env(safe-area-inset-*)`, no changes needed
- [x] Phase 2 — Performance and data loading (partial)
  - [x] Route-level code splitting (`React.lazy` + `Suspense`) in `App.jsx` —
        main bundle 692.99 KB → 394.10 KB (181.14 KB → 112.89 KB gzip)
  - [x] Parallelize independent Supabase calls (`Promise.all`) in
        `MemberDashboard.jsx` and `ModeratorDashboard.jsx` `fetchData()`
  - [ ] Add limits/filters to large queries — deferred, not yet needed
  - [ ] Extract shared data hooks (`useClubData`, `useMembers`, etc.) —
        deferred to Phase 3 component cleanup
  - [ ] Assess React Query / caching — deferred, no clear need yet
- [ ] Phase 3 — UI consistency and component cleanup
  - [ ] Shared components: `Skeleton`, `Toast`, `ConfirmModal`, `EmptyState`,
        `StatCard`, `ListRow`, `SectionHeader`, etc.
  - [ ] Begin breaking down `ModeratorDashboard.jsx`, `MemberDashboard.jsx`,
        `MatchesPage.jsx` incrementally — only where safe
- [ ] Phase 4 — PWA / mobile app polish
  - [ ] Review manifest/icons/splash/theme-color/status-bar (already mostly
        configured in `vite.config.js`, recheck for gaps)
  - [ ] Optional: pull-to-refresh, offline/error fallback — only if clean

## Verification status — CLOSED (2026-06-20)

Phase 1 + 2 are fully implemented and verified end-to-end against
`shuttley-dev` with two real test accounts. All verification gaps are
now closed — see `CHANGELOG.md`/`ISSUES.md` for full detail, and the
"Session Handover" section at the bottom of `ISSUES.md` for the
complete restart-from-cold summary.

- `SessionSummary.jsx`'s `PGRST201` issue — **resolved**. Root cause was
  an unused `profiles` embed in the query, not the underlying schema.
  Fixed by removing it; verified with multiple clean reloads including
  after a fresh `shuttley-dev` project restart.
- Vercel preview — **deliberately skipped**, not blocking. The project's
  env vars don't have a Preview-only override pointing at `shuttley-dev`,
  so pushing this branch risks a preview deployment writing test data
  into production. Revisit only if needed for phone/device testing.

**This branch is parked, not merged.** Sumit will review the diff
himself and decide whether to merge to `develop`. No further work
happens on this branch until that decision is made.

A separate **v2 architecture initiative** (groups/venues model) is
planned on its own branch (`docs/shuttley-v2-architecture-planning` →
future `feature/shuttley-v2-group-venue-architecture`), deliberately kept
independent of this branch and **not started**. See
`SHUTTLEY-V2-ARCHITECTURE.md`. Per Sumit, V2 review/implementation waits
until this app-feel branch is fully parked or merged.

## Deferred / not in this initiative

- **Court booking** — next planned feature after this upgrade and after
  current App Store re-review resolves. No schema/design work started.
- **GitHub/Vercel account split** for the dedicated Shuttley accounts — separate
  infra task, unrelated to app feel.
- **Apple rejection fixes** — camera usage string (MacBook/Xcode-only work)
  and demo account for App Store Connect — tracked separately, not blocking
  this branch since it doesn't touch `main`.

## Explicitly out of scope for this initiative

Major new features, schema migrations, Next.js migration, auth flow changes,
redesigning the whole product, anything that risks the live App Store build.

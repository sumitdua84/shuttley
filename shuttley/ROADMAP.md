# Shuttley — Roadmap

## In progress: App-Feel Upgrade (`feature/shuttley-app-feel-upgrade`)

Controlled frontend/UX upgrade. No new features, no schema changes, no
production deploys until tested. See [PROJECT.md](PROJECT.md) for full
context and audit findings.

- [x] Phase 0 — Audit current app, confirm branch strategy, write docs
- [ ] Phase 1 — Safe app-feel improvements
  - [ ] Skeleton loading states (dashboard stats, session/match/member lists)
  - [ ] Subtle route transitions (150-200ms fade/slide)
  - [ ] Replace `alert`/`confirm`/`prompt` with toast + confirm-modal UI
  - [ ] Reduce/remove janky or continuous animations
  - [ ] Remove stray debug `console.log` (only 1 found, low priority)
  - [ ] Verify mobile safe-area / bottom-nav / keyboard behaviour
- [ ] Phase 2 — Performance and data loading
  - [ ] Route-level code splitting (`React.lazy` + `Suspense`) in `App.jsx`
  - [ ] Parallelize independent Supabase calls (`Promise.all`) on
        dashboards, starting with `MemberDashboard.jsx` / `ModeratorDashboard.jsx`
  - [ ] Add limits/filters to large queries where data displayed is
        unnecessarily large (only where it doesn't change business meaning)
  - [ ] Extract shared data hooks (`useClubData`, `useMembers`, etc.) where
        it removes real duplication
  - [ ] Assess React Query / caching — only adopt if benefit is clear
- [ ] Phase 3 — UI consistency and component cleanup
  - [ ] Shared components: `Skeleton`, `Toast`, `ConfirmModal`, `EmptyState`,
        `StatCard`, `ListRow`, `SectionHeader`, etc.
  - [ ] Begin breaking down `ModeratorDashboard.jsx`, `MemberDashboard.jsx`,
        `MatchesPage.jsx` incrementally — only where safe
- [ ] Phase 4 — PWA / mobile app polish
  - [ ] Review manifest/icons/splash/theme-color/status-bar (already mostly
        configured in `vite.config.js`, recheck for gaps)
  - [ ] Optional: pull-to-refresh, offline/error fallback — only if clean

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

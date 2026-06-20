# Shuttley — Known Issues / Risk Log

## App-Feel Upgrade initiative (`feature/shuttley-app-feel-upgrade`)

### Risky areas to watch

- **`alert`/`confirm` replacements touch destructive actions** — match
  deletion, session deletion, member removal, account anonymisation. When
  swapping these for a `ConfirmModal`, the underlying Supabase call and
  business logic must not change, only the UI. Needs careful manual
  retest of each destructive flow (delete match, delete session, remove
  member, anonymise account, sign out) before this is considered done.
- **`MemberDashboard.jsx` / `ModeratorDashboard.jsx` are large and load
  many independent pieces of state** (club, memberships, active session,
  win stats, polls, club_features, splits). Parallelizing their Supabase
  calls (Phase 2) needs care to confirm no calls are secretly dependent on
  an earlier one's result before converting to `Promise.all`.
- **`club_features` table has no default RLS read access for members**
  (see prior incident, fixed once already) — if Phase 2/3 touches any new
  feature-flag-gated UI, re-verify members can actually read the flag, not
  just that admin can write it.
- **PWA service worker uses `injectManifest` with `autoUpdate`** — any
  route-splitting change (Phase 2) changes the chunk graph the service
  worker precaches; rebuild and reinstall the PWA locally after splitting
  to confirm the install/update flow still works before this ships.

### Deferred improvements (not done in this phase)

- Route-level code splitting (Phase 2)
- Supabase call parallelization (Phase 2)
- Breaking up the 5 large page files into shared components (Phase 3)
- React Query / caching adoption — deferred until Phase 2 shows it's
  clearly worth the new dependency
- PWA manifest/splash deeper polish (Phase 4)

### Needs Sumit review

- Final visual review of any new loading skeletons / toasts / modals
  against brand before merging to `develop`.
- Confirm whether `feature/shuttley-app-feel-upgrade` should merge to
  `develop` first (as staging) or wait and go straight through a longer
  manual QA pass given the live App Store build depends on `main` staying
  untouched.

### Bugs found

_None yet — Phase 0 was audit/documentation only, no code changed._

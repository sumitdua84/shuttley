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

---

## Phase 1 + 2 implementation (2026-06-20)

### Found and fixed: shuttley-dev database bugs (unrelated to this branch's code)

While testing with a real login (`sumitdua84@gmail.com`), found the
`shuttley-dev` Supabase project itself had three pre-existing bugs,
unrelated to this branch's code, all now fixed by Sumit running the
scripts below in the shuttley-dev SQL editor:
- `memberships.joined_at` column was missing (`42703`) — present in
  production's schema, missed during the manual table-by-table dev clone.
  Fixed in `supabase/fix_dev_memberships_recursion.sql`.
- Infinite recursion in **four** separate self-referencing `memberships`
  RLS policies (`42P17`) — `pg_policies` showed an older duplicate SELECT
  policy plus the UPDATE/DELETE moderator policies all self-joined
  `memberships` directly. Fixed in the same script with two
  `SECURITY DEFINER` helper functions.
- `clubs` had no way for a creator to read back their own just-inserted
  club before the membership row existed (`42501` on create) — this is a
  genuine **application bug** in `OnboardingPage.jsx`'s `createClub()`
  (insert-then-read-back happens before the membership insert), not just
  dev/prod drift. Fixed in `supabase/fix_dev_clubs_creator_visibility.sql`
  by adding `created_by = auth.uid()` to the clubs SELECT policy.
  **Sumit still needs to check whether production has the same gap** —
  the script includes a read-only query to check prod's `clubs` policies.

All three scripts have been run against shuttley-dev and verified working.

### Authenticated flows — verified in this session

With the dev DB fixed, logged in as `sumitdua84@gmail.com`, created a
test club ("App Feel Test Club"), and walked through:
- Login → Onboarding → club creation → landed on **ModeratorDashboard**
  (auto-routed correctly since creator is the club's moderator)
- `ModeratorDashboard`'s parallelized `fetchData()` — loaded cleanly,
  zero console/network errors from the `Promise.all()` restructure
- `ConfirmModal` via `ProfilePage`'s Sign Out button — rendered correctly,
  Cancel worked
- `ConfirmModal` via `ProfilePage`'s inline "Request to Delete Club"
  handler (the trickiest conversion, since it was an arrow function, not
  a named `async function`) — rendered and confirmed correctly, no errors
- Start Session modal (pre-existing UI, untouched) still works alongside
  the changes

**Not yet verified** (this test account only has one club with one
member, and no test matches/sessions/polls exist): match/session
deletion confirms, poll deletion, member removal/demotion, account
anonymisation (admin), `MemberDashboard` (test account is the club
moderator, never saw the member view), `RotationPage`/`SessionSummary`
skeletons (no session was started), route transition feel on a real
device, PWA install/update behaviour after the `React.lazy()` change.

### Risky areas to watch (carried over + new)

- `MemberDashboard.jsx` / `ModeratorDashboard.jsx` `fetchData()` were
  restructured to batch independent Supabase calls via `Promise.all()`.
  Each call was checked for data dependencies before batching (the
  splits-balance fetch correctly stays sequential after `featuresData`),
  but this is exactly the kind of change that can hide a subtle bug if a
  dependency was missed — worth an extra careful pass against the
  dashboards with real session/poll/splits data.
- `club_features` RLS gotcha (see below, unchanged) still applies if any
  future feature-flag work touches this code.

### Deferred improvements (not done in this phase)

- Query limits/filters on large reads
- Shared data hooks (`useClubData`, `useMembers`, etc.) — Phase 3
- Breaking up the 5 large page files into shared components — Phase 3
- React Query / caching adoption
- PWA manifest/splash deeper polish — Phase 4
- Parallelizing Supabase calls in `MatchesPage.jsx` / `RotationPage.jsx` —
  not done this round, kept scope to the two dashboards named in the brief

---

## Onboarding createClub() fix (2026-06-20)

### What changed

`OnboardingPage.jsx`'s `createClub()` previously did
`.insert(club).select().single()` — insert the club, then immediately
ask PostgREST to read it back — before the membership row existed. The
clubs SELECT policy requires a membership row, so this read-back could
be blocked by RLS purely due to ordering, independent of whether the
`created_by` RLS widening (from the dev DB fix above) is in place.

Fixed by generating the club's `id` client-side (`crypto.randomUUID()`,
same pattern already used in `AdminDashboard.jsx`'s `addGuest()`) and
sequencing strictly:
1. Insert the club (no `.select()` — no read-back, so no RLS dependency
   on membership existing yet)
2. Insert the membership row using the locally-generated id
3. Only then update local state / refresh the membership list

This makes the flow correct **regardless of the clubs SELECT policy
shape** — it no longer relies on the `created_by` RLS widening applied
to shuttley-dev to function correctly. That widening can stay (it's
harmless — it only lets a creator see their own club, which they could
already write to) but is no longer load-bearing for this flow.

### Defensive handling added

Each step now has its own error path instead of one generic catch-all:
- **Club insert fails** → toast "Could not create the club — please try
  again", `creating` flag cleared, nothing else attempted. Safe — no
  partial state created.
- **Membership insert fails** (club insert succeeded) → toast "Club
  created, but joining it failed — contact support". **Partial-failure
  risk**: the club row now exists with no membership pointing at it. The
  creator can't see it (no membership, and policy requires either
  `created_by` match or a membership row — the `created_by` clause does
  let them see it, so they could retry joining, but there's currently no
  UI path to retry joining your own orphaned club). Logged to console
  for debugging. Low likelihood (membership insert has no real reason to
  fail if the club insert just succeeded with the same `user.id`), but
  worth a cheap follow-up: either an admin cleanup query for orphaned
  clubs, or a "rejoin your club" affordance.
- **Refresh (`fetchMemberships()`) fails after creation succeeds** →
  toast "Club created — pull to refresh to see it". The club and
  membership both exist correctly at this point; only the local list is
  stale. Wrapped in try/catch even though `fetchMemberships()` currently
  swallows its own errors internally (defensive, in case that changes).

No navigation risk to call out — this flow only toggles local view state
(`setView('home')`), not a router `navigate()`, so there's no
navigation-failure case to handle here.

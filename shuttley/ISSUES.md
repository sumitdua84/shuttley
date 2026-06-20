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

---

## Full verification with a second test member (2026-06-20)

### What was tested end-to-end

Created a second test account (`shuttley.testmember+devqa@gmail.com`,
email/password signup, manually confirmed via Supabase Auth dashboard
since the dev project requires email confirmation) and used it alongside
`sumitdua84@gmail.com` to exercise every flow that needed two members:

- Member approval (moderator side) — pending → approved, member count
  updated correctly
- **`MemberDashboard`** (never tested before — the first account is
  always a club moderator) — loads via the parallelized `fetchData()`
  with zero errors, shows pending match confirmations correctly
- Free Play session: start → record match (auto-confirm) → delete match
  → record match (requires confirmation) → confirm as the other player →
  end session
- Poll: create → respond (Yes) → delete, all as a regular member
- `ConfirmModal` for: sign out, delete club request, match deletion, poll
  deletion — all rendered and worked correctly
- Mobile viewport (375×812): dashboard layout, bottom nav, and
  `ConfirmModal` all render correctly with no overflow

All of the above work correctly on `feature/shuttley-app-feel-upgrade`.

### Additional shuttley-dev bugs found and fixed along the way

Same pattern as before — pre-existing dev-clone drift, unrelated to this
branch's code, blocking testing until fixed:

1. **`sessions.started_by` missing** (`PGRST204`) — fixed, but the first
   attempt *added* a new column instead of renaming the existing
   `created_by`, which created a second foreign key to `profiles` and
   broke every query that embeds `profiles` on `sessions`
   (`PGRST201: more than one relationship was found`). Corrected by
   dropping the wrongly-added column and renaming `created_by` →
   `started_by` instead. **Lesson applied for the rest of the session:
   always check `information_schema.columns` before assuming a column is
   missing vs. misnamed.**
2. **`matches.created_by`/`match_type` vs. `recorded_by`/`type`** — same
   rename situation, fixed by `RENAME COLUMN` (not duplicated).
3. **`matches` had no DELETE policy** (`fix_match_rls.sql` defines one,
   but was never run against shuttley-dev) — match deletion silently did
   nothing (`DELETE` returned `204` with zero rows actually affected,
   since PostgREST doesn't error on a no-op delete). Fixed by running the
   existing `supabase/fix_match_rls.sql` against shuttley-dev.
4. **Cross-table RLS recursion between `matches` and `match_players`**
   (`42P17`) — `match_players`' SELECT policy joins `matches`+
   `memberships`; `matches`' UPDATE policy (from fix_match_rls.sql)
   checks `match_players`. The two-table cycle caused recursion when
   confirming a match. Fixed in
   `supabase/fix_dev_match_players_recursion.sql` with a
   `SECURITY DEFINER` `can_read_match()` helper, same pattern as the
   `memberships` recursion fix.
5. **`session_polls` missing `notes` and `session_time` columns** —
   straightforward drift, fixed with `ADD COLUMN IF NOT EXISTS`.
6. **`match_edit_log` missing `edited_at`** — same.

### RESOLVED: SessionSummary fixed at the code level

After fixing the `sessions.started_by` duplicate-column mistake (#1
above), `SessionSummary.jsx`'s `select('*, profiles(full_name)')` query
kept failing with `PGRST201` — even after Sumit did a full project
restart, and even though `pg_constraint` confirmed only one correct FK
definition (`sessions_created_by_fkey` now pointing at `started_by`)
existed. Several consecutive page reloads after the restart still
returned `300`, ruling out a simple cache-propagation delay.

Root cause turned out to be moot: `SessionSummary.jsx` fetched
`profiles(full_name)` via the `sessions.started_by` relationship but
**never actually used it anywhere in the component** (confirmed via
grep — `session.profiles` has zero references in the file). Fixed by
removing the unused embed entirely (`select('*, profiles(full_name))`
→ `select('*')`), which sidesteps the ambiguity regardless of its root
cause and is also simply not fetching data nobody reads. Verified
working with two consecutive clean page loads showing full session
detail, MVP, standings, and match history.

### Vercel preview — NOT pushed, and why

Checked whether it was safe to push this branch for a Vercel preview
(per the brief). Found that the single existing Vercel project
(`shuttley`) has `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` scoped to
**"Production and Preview"** — there is no separate Preview-only override
pointing at `shuttley-dev`. This means any preview deployment from this
project (including one triggered by pushing this branch) would connect
to **production** Supabase, not the dev project this branch has been
tested against. Pushing was deliberately skipped to avoid writing test
data into production. See main response for the suggested fix (add a
Preview-scoped env var override) — not done, needs Sumit's call since it
touches env config next to the production scope.

### Read-only production check — prepared, not run

`supabase/READONLY_production_check.sql` checks whether production has
any of the same RLS-recursion or column-shape patterns found on
shuttley-dev (clubs/memberships/matches/match_players policies, the
three `SECURITY DEFINER` helper functions, and the sessions/matches/
session_polls/match_edit_log column shapes). Pure `SELECT` statements
only — no writes. **Not run** — needs Sumit's explicit approval per the
brief before running against production.

### Minor: orphaned `note` columns on shuttley-dev (not a bug, no action taken)

While re-checking column shapes, found `session_polls.note` and
`match_edit_log.note` (singular) both already existed on shuttley-dev
*before* this session's fixes — confirmed by checking the fix scripts,
which only ever added `notes` (plural, `session_polls`) and `edited_at`
(`match_edit_log`), never `note`. The app code only reads/writes `notes`
and never references `note` singular on either table, so these are dead
columns from an earlier schema iteration, not a functional bug. Not
dropped — that's a destructive change not worth making unprompted on a
column that's merely unused, not broken. Sumit's call whether to clean
these up later.

### Credentials note

A Postgres connection string (session pooler, `aws-1-ap-northeast-2
.pooler.supabase.com`) and two consecutive freshly-reset database
passwords were shared in this session to try direct `psql`/`pg`-client
access for running fixes without relaying through Sumit. **Both
passwords failed pooler authentication** for unclear reasons (format and
tenant routing were confirmed correct via a deliberate negative test).
Abandoned in favor of the SQL-editor relay workflow, which worked
reliably throughout. Sumit reset the shuttley-dev database password
after this session to invalidate the shared values (confirmed done).
**No passwords or secrets are stored anywhere in these markdown files**
— only that a reset happened, never the values. Store any future
credentials in 1Password, not in chat or in this repo.

---

## Session Handover — Shuttley App-Feel Upgrade

**Written so this can be picked up cold — by Claude Code, ChatGPT, or
Sumit directly — without needing the conversation history that produced
it.** If you're starting fresh, read this section top to bottom before
touching anything.

### 1. Branch status right now

- Branch: **`feature/shuttley-app-feel-upgrade`**, created off `develop`.
- **12 commits**, working tree **clean** (`git status` shows nothing
  pending).
- **Not pushed to origin. Not merged to `develop`. Not merged to
  `main`.** (If this has changed since this doc was written, trust `git
  log`/`git status` over this paragraph — this is a snapshot.)
- **Production untouched** throughout the entire initiative — no schema
  changes, no RLS changes, no deploys to `main`/App Store build. All
  database fixes in this session targeted `shuttley-dev` only
  (`ecdibuhrgdmsdvovmlvl.supabase.co`).
- This session was stopped deliberately by Sumit ("this session has
  become heavy, so we are stopping here cleanly") — not because of a
  blocker. Everything that was in progress is finished and committed.

### 2. What was implemented (all done, all committed)

- Shared `Toast` + `ConfirmModal` components (`src/components/`) and a
  promise-based `useConfirm()` hook (`src/hooks/useConfirm.jsx`),
  replacing **all 27** native `alert()`/`confirm()`/`window.confirm()`
  calls across 7 pages (`AdminDashboard`, `MatchesPage`,
  `MemberDashboard`, `ModeratorDashboard`, `ProfilePage`, `RotationPage`,
  `SessionSummary`). Business logic untouched — only the UI mechanism
  changed.
- `Skeleton`/`SkeletonCard`/`SkeletonRow`/`DashboardSkeleton`
  (`src/components/Skeleton.jsx`) replacing the blank full-screen splash
  on 4 pages (`MemberDashboard`, `ModeratorDashboard`, `RotationPage`,
  `SessionSummary`).
- 180ms route fade transition wrapping `<Routes>` in `App.jsx`.
- Route-level code splitting via `React.lazy()` + `Suspense` for all 18
  routes in `App.jsx`. **Main JS bundle: 692.99 KB → 394.10 KB**
  (181.14 KB → 112.89 KB gzip).
- Parallelized independent Supabase calls (`Promise.all()`) in
  `MemberDashboard.jsx` and `ModeratorDashboard.jsx`'s `fetchData()` —
  each went from ~8 sequential round-trips to 1-2 batches.
- Fixed a genuine application bug in `OnboardingPage.jsx`'s
  `createClub()`: it inserted a club and immediately tried to read it
  back before the membership row existed, which RLS could legitimately
  block. Reordered to insert-club → insert-membership → refresh, with
  per-step error handling.
- Fixed a genuine application bug in `SessionSummary.jsx`: it fetched a
  `profiles` embed via `sessions.started_by` that was never used
  anywhere in the component, which was also tangled up with a
  dev-database schema mistake (see §5) that made the embed ambiguous.
  Removed the unused embed.
- 8 dev-only SQL scripts added under `supabase/` — 7 fix scripts (run
  against `shuttley-dev` only, all confirmed applied) plus 1 read-only
  production audit script (written, **not run**). Full list and purpose
  of each in §5 below and earlier in this file.

### 3. What was verified live (against shuttley-dev, two real accounts)

Using `sumitdua84@gmail.com` (moderator) and
`shuttley.testmember+devqa@gmail.com` (member) against the test club
"App Feel Test Club":

- Login (both accounts), onboarding, club creation
- Member approval (pending → approved)
- `ModeratorDashboard` and `MemberDashboard` — both load via the
  parallelized `fetchData()` with zero console/network errors
- Full session lifecycle: start session → record match (both
  auto-confirm and requires-confirmation variants) → confirm match (as
  the non-recorder) → delete match → end session → view
  `SessionSummary`
- Full poll lifecycle: create → respond (Yes/No) → delete
- Every `ConfirmModal` conversion exercised: sign out, delete-club
  request (the inline arrow-function variant), match deletion, poll
  deletion
- Mobile viewport (375×812 emulated): dashboard, bottom nav, confirm
  modal all render correctly, no overflow
- `SessionSummary` specifically — confirmed working after a fresh
  `shuttley-dev` project restart, multiple consecutive clean reloads,
  zero failed requests

### 4. What remains unverified (not known broken — just not reached)

These were never exercised this session because the test data/scope
didn't require them. No evidence either way that they work or don't:

- Splits (shared expense tracking) — `SplitsPage.jsx` untouched and
  untested
- Chat — `ChatPage.jsx` untouched and untested
- Account anonymization / admin flows — `AdminDashboard.jsx`'s
  `confirmDelete()` (the `ConfirmModal` conversion was made, but never
  actually triggered against real data)
- Member removal / demotion (`ModeratorDashboard.jsx`'s
  `removeMember()`/`demoteMod()`) — converted to `ConfirmModal`, never
  exercised
- `RotationPage.jsx`'s actual rotation-mode scheduling (auto-generated
  round-robin matches) — only **Free Play** mode sessions were tested
  this session
- PWA install/update behavior after the `React.lazy()` bundle
  restructure — the precache manifest shape changed (34 entries vs. 12
  before); never reinstalled the PWA locally to confirm
- Vercel preview deployment — deliberately not pushed (see §6)

### 5. Dev database (shuttley-dev) — what was broken and fixed

`shuttley-dev`'s schema was originally cloned from production manually,
table-by-table, and had drifted significantly. None of this was caused
by this branch's code — all found while trying to verify it. All fixes
below were applied to **shuttley-dev only**, never production:

1. **RLS recursion on `memberships`** (`42P17`) — four separate
   self-referencing policies. Fixed with two `SECURITY DEFINER` helper
   functions (`fix_dev_memberships_recursion.sql`).
2. **`memberships.joined_at` missing column** — same script.
3. **`clubs` RLS blocking club creation** — the creator couldn't read
   back their own club before their membership existed
   (`fix_dev_clubs_creator_visibility.sql`). Also independently fixed at
   the code level (see §2).
4. **`sessions`/`matches` column-name drift** — `created_by` vs.
   `started_by`, `match_type` vs. `type` — production presumably renamed
   these at some point; the dev clone predated that. Fixed via
   `RENAME COLUMN` (`fix_dev_sessions_missing_columns.sql`,
   `fix_dev_matches_missing_columns.sql`). **First attempt at the
   sessions fix mistakenly added a duplicate column instead of renaming
   — caught and corrected within the same session.**
5. **Missing `matches` DELETE policy** — an existing script
   (`supabase/fix_match_rls.sql`) defined it but had never been run
   against shuttley-dev. Match deletion was silently doing nothing
   (`DELETE` returned `204` with zero rows affected). Fixed by running
   that existing script.
6. **Cross-table RLS recursion between `matches` and `match_players`**
   (`42P17`) — fixed with a `SECURITY DEFINER` `can_read_match()` helper
   (`fix_dev_match_players_recursion.sql`).
7. **Missing columns on `session_polls` (`notes`, `session_time`) and
   `match_edit_log` (`edited_at`)** — straightforward `ADD COLUMN`
   drift (`fix_dev_session_polls_missing_column.sql`, also covered in
   the sessions/matches scripts).
8. **`SessionSummary.jsx`'s `PGRST201`** — looked like a stuck
   PostgREST cache at first (survived a full project restart), but
   turned out to be moot once the unused embed was removed at the code
   level (§2/§3).
9. **Orphaned `note` columns** (singular) on `session_polls` and
   `match_edit_log` — predate this session, unused by the app, not a
   bug, not touched.

The dev database password was reset by Sumit after this session to
invalidate values shared during a (failed, abandoned) direct-connection
attempt. **No secrets are stored in this repo or these docs.**

### 6. Recommended next restart point

In order, next time someone picks this up:

1. Confirm the shuttley-dev database password is stored in **1Password**
   only — never in chat, code, or markdown.
2. Review the `feature/shuttley-app-feel-upgrade` diff yourself
   (`git diff develop...feature/shuttley-app-feel-upgrade` or via
   GitHub once pushed).
3. Optionally, manually spot-check the unverified areas from §4 —
   splits, chat, admin anonymization, member removal/demotion,
   rotation-mode scheduling, PWA install/update.
4. Decide whether to merge `feature/shuttley-app-feel-upgrade` into
   `develop` as staging. **Do not merge to `main`/production** until a
   staging period and/or manual review is complete.
5. Only after the app-feel branch is either merged or consciously parked
   should `SHUTTLEY-V2-ARCHITECTURE.md` be reviewed.
6. After that review, decide whether to create
   `feature/shuttley-v2-group-venue-architecture` and begin V2 work — on
   its own branch, never mixed with app-feel or pushed toward production
   without an explicit, separate decision.

### 7. V2 architecture — approved direction, not yet started

For context, the agreed direction documented in full in
`SHUTTLEY-V2-ARCHITECTURE.md` (planning only, on
`docs/shuttley-v2-architecture-planning`, no code written against it):

- The live production Shuttley app **stays unchanged for now** — it
  keeps running, collecting real usage data, club/session/match activity,
  and App Store presence, while V2 is planned and built separately.
- Today's "clubs" are actually **social groups** — a circle of people who
  play together. The schema/UI conflates this with the idea of a real
  badminton venue, which doesn't exist as a concept anywhere in the app
  today.
- V2 separates **Groups** (social, private, today's `clubs` renamed) from
  **Venues** (real locations with courts, pricing, availability,
  bookings, managed by venue staff). A group can be linked to zero, one,
  or many venues — purely informational, not access-control.
- V2 will be built and fully tested in dev/staging first, with a
  copy-based migration (old tables stay intact, new tables built
  alongside), before any production cutover is even scheduled.
- **Production must never be slowly mutated into V2** — no incremental
  schema changes to `main`'s database under this initiative. The cutover,
  whenever it happens, is a deliberate, separate, planned event with its
  own rollback plan (see `SHUTTLEY-V2-ARCHITECTURE.md` §§7-9).
- Thirteen open questions for Sumit are listed at the end of
  `SHUTTLEY-V2-ARCHITECTURE.md` §13 — review those before any V2
  implementation branch is created.

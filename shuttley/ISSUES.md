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

**Updated 2026-06-21 — see §8 for the full QA session that closed out
Splits and Chat, and made progress on account deletion/admin.** This
list now reflects what's still genuinely unverified after that session:

- Account anonymization / admin flows — **fixed in code, needs Vercel
  runtime test.** Schema drift (`account_deletion_requests` missing
  `email`, `created_at`/`requested_at` mismatch, missing
  `get_next_deleted_seq` RPC) and a wrong table reference
  (`club_members` → `memberships`) in `api/delete-user.js` were found
  and fixed. A new admin-only service-role endpoint
  (`api/deletion-requests.js`) was added to fix a separate RLS
  visibility bug (admins couldn't see other users' pending requests).
  None of this has been exercised through a real Vercel runtime
  (`vite dev` can't execute serverless functions) — **Confirm Delete was
  never clicked, `/api/delete-user` was never called, no account was
  anonymized.** Two disposable test rows
  (`account_deletion_requests` for `sumitdua2@gmail.com`) are
  intentionally left pending on shuttley-dev for that later test. Full
  detail in §8.
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

~~Splits~~ and ~~Chat~~ are no longer on this list — both fixed and
verified end-to-end on shuttley-dev, see §8.

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

## 8. QA session — Splits, Chat, Account Deletion fixes (2026-06-21)

Picked up from the §6 restart point. Spot-checked the previously
unverified areas in order: Splits, Chat, Account deletion/admin. All
schema fixes were applied directly to **shuttley-dev only**, in the SQL
editor, by Sumit — never run by the assistant directly. Code committed
in `428abe6` (separate from this docs commit). **Production/main
untouched throughout — confirmed via git log and via every SQL change
being explicitly scoped to the shuttley-dev project.**

### Splits — fixed and verified

`splits_expenses` was missing `created_by`, `image_url`, `is_settlement`,
`edit_history` on shuttley-dev (dev-clone drift, same pattern as prior
sessions). Added via `supabase/fix_dev_splits_schema.sql`. Verified
end-to-end: add expense (all three split types), balance calculation,
settle-up, history — all working with no RLS issues encountered.

### Chat — fixed, polished, and converted to one mobile-first layout

Three separate issues found and fixed:
1. **Schema drift** — `chat_conversations` was missing `type`, `name`,
   `created_by`, `last_message_at`, `last_message_preview`;
   `chat_messages.user_id` needed renaming to `sender_id` (preserving
   its existing FK to `profiles`, not duplicating it — same lesson as
   the earlier `matches`/`sessions` rename fixes) and was missing
   `club_id`. Fixed via `supabase/fix_dev_chat_schema.sql`.
2. **Duplicate "All Members" conversation race** — `load()`'s
   check-then-insert had no atomicity; React StrictMode's double-invoke
   (and potentially slow networks/double tabs in real usage) could
   create duplicate `type='all'` rows per club. Fixed with a partial
   unique index (`chat_conversations_one_all_per_club` on
   `(club_id) WHERE type = 'all'`) plus an app-level `23505`
   conflict-and-refetch handler in `ChatPage.jsx`'s `load()`. Verified
   with repeated reloads post-fix — exactly one row per club, no
   duplicates recur.
3. **App-feel polish** — replaced the old full-bleed teal "S" splash
   loading screen with shared `Skeleton`/`SkeletonRow`, replaced the
   developer-facing error screen with a friendly card-styled one, added
   `Toast` feedback on send failure, removed a leftover debug
   `console.log`. Converted Chat from a separate 3-column desktop
   dashboard layout to **one mobile-first layout used on both desktop
   and mobile** (centered, max-width ~480px on wide screens) per Sumit's
   direction that Shuttley is primarily a mobile app and desktop
   shouldn't feel like a separate web dashboard.

All verified clean across multiple fresh dev-server restarts (ruling out
stale console/network log buffering, which was observed several times
this session — old entries persist in the preview tooling's logs across
reloads and can look like live failures when they aren't).

### Account deletion / admin — fixed in code, needs Vercel runtime test

Found the entire flow was broken on shuttley-dev, end to end:
- `account_deletion_requests` was missing `email`; had `created_at`
  where `AdminDashboard.jsx` expected `requested_at`; the
  `get_next_deleted_seq()` RPC `api/delete-user.js` calls didn't exist.
  All fixed via direct SQL (column add, rename, sequence + function
  create) on shuttley-dev.
- `api/delete-user.js` deleted from a table called `club_members`,
  which **does not exist anywhere in this schema** — the real table is
  `memberships`. Fixed. Also added a `chat_members` cleanup call
  alongside the existing `chat_messages` cleanup, so a departing user is
  fully removed from chat conversation membership too.
- Separately, even after the schema fixes, **Admin's Deletions tab
  silently showed "0 requests" with no error** even though real pending
  rows existed — root cause was RLS: the admin dashboard queried
  `account_deletion_requests` with the regular authenticated client, and
  Postgres RLS has no concept of the JS-only `SUPER_ADMINS` list, so it
  restricted reads to the requester's own row only. Fixed by adding a
  new service-role-backed endpoint, `api/deletion-requests.js` (mirrors
  `api/delete-user.js`'s existing auth pattern), and pointing
  `AdminDashboard.jsx`'s `fetchDeletionRequests()` at it instead of
  querying directly. **No RLS policy was changed** — this fix works
  entirely by routing the admin read through a trusted server-side
  endpoint instead.
- A confirmed-unused, dead Supabase Edge Function
  (`supabase/functions/delete-user/index.ts`) implementing a
  contradictory hard-delete strategy was found and flagged, but
  deliberately left alone — out of scope for this fix, not called from
  anywhere in the UI.

**None of this has been exercised through a real serverless runtime.**
`vite dev` cannot execute Vercel API routes locally (confirmed: requests
to `/api/delete-user` and the new `/api/deletion-requests` either 404 or
return the raw unexecuted source file instead of running) — the same
known limitation already accepted for `/api/coach` and
`/api/send-push`. **Confirm Delete was never clicked. `/api/delete-user`
was never called. No account was anonymized.**

A fresh disposable test account (`sumitdua2@gmail.com`, created this
session after the original second test account's password couldn't be
recovered — see note below) was used to submit two real pending
deletion requests, intentionally **left in place** on shuttley-dev for
the eventual Vercel runtime test:
- `account_deletion_requests.id = 90476878-de8a-42f4-b0a8-380eb94be9d3`
- `account_deletion_requests.id = 4cd59cbc-27d4-4b26-8f94-a5bdc4043fb4`

Both `status: pending`. **Do not delete these without checking with
Sumit first** — they're needed for the next test step.

### Note: original second test account's password lost

The `shuttley.testmember+devqa@gmail.com` account created in the
2026-06-20 session has no recoverable password — it was never recorded
anywhere (correctly, per this project's no-secrets-in-docs policy), and
Supabase's own password-reset flow rejected the address as invalid
during this session for unclear reasons. A fresh disposable account was
created instead rather than spending more time recovering the old one.
The old account is harmless and can be ignored/cleaned up later; it
holds no test data relevant to ongoing work.

### Note: local `.env.local` was temporarily disabled

To make the local dev server target shuttley-dev instead of whatever
`.env.local` pointed at (confirmed to be a different — production —
Supabase project ref), `.env.local` was renamed to `.env.local.disabled`
for the duration of this session. **This is a local filesystem change
only, never committed, never staged.** Rename it back to `.env.local`
if local work against that other project is needed again; otherwise
it's safe to leave renamed for continued shuttley-dev work.

### Still unverified after this session

- ~~Member removal / demotion~~ — verified and fixed, see below
  (2026-06-21)
- ~~`RotationPage.jsx` rotation-mode scheduling~~ — found blocked by a
  shuttley-dev schema drift bug, code-side error handling fixed, SQL
  fix needed and flagged below (2026-06-21)
- PWA install/update behavior
- Vercel preview readiness
- Account deletion's actual runtime execution (needs `vercel dev` or a
  deployment — see above)

---

## Member removal / demotion QA (2026-06-21)

Inspected `ModeratorDashboard.jsx`'s `promoteMod()`, `demoteMod()`, and
`removeMember()` (member list tab). Good news: **all three already use
the correct `memberships` table**, not the old `club_members` — no
schema-reference bug here (unlike the account-deletion bug found above).

### Bugs found and fixed

- **No last-admin protection**: `demoteMod()` and `removeMember()` had
  no guard against acting on the only remaining moderator, which could
  leave a club with zero admins and no way to manage it. Fixed by
  checking `moderatorCount <= 1` for the target before allowing the
  action; shows a toast (`Club must have at least one admin`) and
  aborts instead.
- **`promoteMod()` had no confirmation**, inconsistent with
  `demoteMod()`/`removeMember()` which both already used the app's
  `ConfirmModal` via `confirmDialog()`. Fixed by adding the same
  confirm step ("Make this person an admin?").

### Verified working, left unchanged

- Self-removal/self-demotion is blocked at the UI level (`m.user_id !==
  user.id` checks) — confirmed still in place and working in the
  browser test below.
- All three actions use `ConfirmModal`/`Toast`, no native
  `alert`/`confirm`.
- Member list is mobile-first/responsive, consistent with the rest of
  the app-feel work.

### Known gap, deliberately not touched this session

- The `memberships` DELETE RLS policy (`fix_dev_memberships_recursion.sql`)
  technically allows a user to delete their own membership row directly
  (`user_id = auth.uid()`), which is a backend-level self-removal path
  that bypasses the UI guard. No feature in the app currently uses
  self-delete (there's no "Leave Club" button), so this isn't exploited
  today, but it means the self-protection is UI-only, not enforced by
  RLS. Tightening this requires a SQL change on shuttley-dev — flagged
  for Sumit, not applied automatically. Suggested policy (shuttley-dev
  only, **not run**):

  ```sql
  -- shuttley-dev only — review before running
  DROP POLICY "Moderators can delete memberships" ON memberships;
  CREATE POLICY "Moderators can delete memberships" ON memberships
  FOR DELETE TO authenticated
  USING (public.is_club_moderator(club_id));
  ```

  This would remove the self-delete path entirely. Don't apply this
  if a future "Leave Club" feature is planned to reuse self-delete.

### Tested in browser against shuttley-dev

Using club `App Feel Test Club` (`afd39feb-9e7d-4524-b0ee-427988cc8506`)
with real user `Sam Dua` (sole moderator) and `Test Member`:
- Promote "Test Member" → confirm modal appeared ("Make this person an
  admin?") → confirmed → toast "Promoted to admin" → role updated to
  `(mod)`.
- Demote "Test Member" back to member (2 moderators present, so allowed)
  → confirm modal → toast "Admin rights removed" → role reverted.
- No console errors during either flow. `npm run build` succeeds.
- Self-action buttons (Remove Admin/Remove) correctly absent for the
  logged-in user (Sam) throughout.

No SQL run. No production access. Only `ModeratorDashboard.jsx` changed.

---

## RotationPage scheduling QA (2026-06-21)

Inspected `RotationPage.jsx`, `ModeratorDashboard.jsx`'s/`MemberDashboard.jsx`'s
"Start Session" → "Auto Schedule" flow, and `utils/scheduleGenerator.js`.
No old `club_members` references anywhere in this area, and `sessions`
already has the correct `match_type`/`rotation_player_ids` columns on
shuttley-dev (confirmed live). The bug is isolated to one table.

### Root cause: `rotation_matches` schema drift on shuttley-dev

`rotation_matches` on shuttley-dev still has an **old, pre-redesign
schema** that was never migrated to match `supabase/rotation.sql` (the
schema the current app code actually uses):

- **Actual columns on shuttley-dev:** `id, session_id, seq, team1, team2,
  sitting, status, team1_score, team2_score, created_at`
- **Columns the code expects** (per `rotation.sql` and every
  `RotationPage.jsx`/`ModeratorDashboard.jsx`/`MemberDashboard.jsx` call
  site): `id, session_id, club_id, p1, p2, p3, p4, seq, status, score1,
  score2, match_id, created_at`

Confirmed live in-browser via the real Supabase client (anon key, real
auth session) — selecting `p1`, `p2`, `p3`, `p4`, `club_id`, `score1`,
`score2`, `match_id` each returns `"column ... does not exist"`, while
inserting a row with only `session_id`/`seq`/`status` succeeds and
echoes back `team1`, `team2`, `sitting`, `team1_score`, `team2_score` —
proving the old columns are what's actually there. Confirmed via grep
that the current app code never reads/writes `team1`/`team2`/`sitting`/
`team1_score`/`team2_score` on `rotation_matches` (those names only
exist, separately and correctly, on the unrelated `matches` table) — so
the old columns are dead weight, safe to drop. The table is also
completely empty on shuttley-dev (0 rows, confirmed via count query), so
there's no data to migrate.

**Effect:** "Start Session" → "Auto Schedule" silently failed to
generate any matches. The session itself was still created (with
correct `match_type`/`rotation_player_ids`), so the moderator landed on
what looked like a "Free Play" session with no indication anything had
gone wrong — Auto Schedule was indistinguishable from Free Play. Verified
this is what's actually happening by reproducing it live with two real
shuttley-dev test accounts before changing any code.

### Code bug found and fixed (the part that doesn't need SQL)

All five places that insert into `rotation_matches` after generating a
schedule (`ModeratorDashboard.jsx` `startSessionWithRotation()`,
`MemberDashboard.jsx` `startSession()`, and `RotationPage.jsx`'s
`rebalance()`, `addPlayer()`, `newCycle()`) **never checked the insert's
`error`** — so the schema-drift failure above was swallowed completely
silently, with no toast, no console log, nothing. Fixed by checking
`error` on every one of these inserts:
- `rebalance()`/`addPlayer()`/`newCycle()` (existing active session) now
  show a toast naming the failure and refresh state.
- `startSessionWithRotation()`/`startSession()` (new session) now roll
  back by deleting the just-created `sessions` row and show a toast
  ("Could not generate schedule — session not started"), instead of
  navigating into a session that looks like Free Play but isn't. The
  modal stays open so the moderator can retry once the schema is fixed.

This fix makes the failure visible and non-destructive, but **does not
by itself make Auto Schedule work** — that needs the SQL below.

### SQL needed — shuttley-dev only, NOT run

```sql
-- shuttley-dev only — review before running. Confirmed 0 rows in
-- rotation_matches on shuttley-dev, so this is safe with no data loss.
-- Drops the old, unused, pre-redesign columns and adds the columns the
-- current app code (and supabase/rotation.sql) actually expects.

ALTER TABLE rotation_matches
  DROP COLUMN IF EXISTS team1,
  DROP COLUMN IF EXISTS team2,
  DROP COLUMN IF EXISTS sitting,
  DROP COLUMN IF EXISTS team1_score,
  DROP COLUMN IF EXISTS team2_score;

ALTER TABLE rotation_matches
  ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES clubs(id),
  ADD COLUMN IF NOT EXISTS p1 uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS p2 uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS p3 uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS p4 uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS score1 integer,
  ADD COLUMN IF NOT EXISTS score2 integer,
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES matches(id);

-- Safe to enforce NOT NULL since the table is currently empty.
ALTER TABLE rotation_matches
  ALTER COLUMN club_id SET NOT NULL,
  ALTER COLUMN p1 SET NOT NULL,
  ALTER COLUMN p3 SET NOT NULL;
```

RLS already exists on the table (it predates this session, came back
on every test query without needing changes) — not touched.

### Verified in browser against shuttley-dev

Using club `App Feel Test Club` (`afd39feb-9e7d-4524-b0ee-427988cc8506`)
with real users `Sam Dua` and `Test Member`:
- Reproduced the silent-failure bug first (Auto Schedule → landed on a
  session that displayed as Free Play with no error).
- After the code fix: same Auto Schedule attempt now stays on the
  dashboard's player-select step (doesn't navigate into the broken
  session), logs the underlying error to console, and leaves no
  orphaned `active` session or stray `rotation_matches` rows (confirmed
  via direct query after each test).
- Free Play mode (unaffected by this fix) still works correctly
  end-to-end — started, recorded, ended, deleted cleanly.
- `npm run build` succeeds. No console errors beyond the intentional
  `console.error` log added by the fix itself.
- All test sessions/rows created during this QA were cleaned up
  afterward; shuttley-dev was left in the same state it started in.

No SQL run. No production access. Only `RotationPage.jsx`,
`ModeratorDashboard.jsx`, and `MemberDashboard.jsx` changed (the latter
two only in their existing `rotation_matches` insert call site — no
unrelated changes).

**Auto Schedule rotation mode remains non-functional on shuttley-dev
until the SQL above is run.** Free Play mode is fully functional.

---

## RotationPage Auto Schedule — verified working after SQL fix (2026-06-21)

Sumit applied the SQL above manually in the shuttley-dev SQL editor.
Re-verified from scratch (didn't assume the doc was still accurate —
re-checked column existence and row count live before testing):
- `rotation_matches` now has `p1, p2, p3, p4, club_id, score1, score2,
  match_id` and no longer has `team1, team2, sitting, team1_score,
  team2_score`. Table was still 0 rows immediately before testing.
- `clubs`, `profiles`, `matches` (the new columns' FK targets) all
  confirmed reachable.

### End-to-end test (singles, 2 real players — `Sam Dua` + `Test
Member` in `App Feel Test Club`)

1. **Auto Schedule start** — selected Singles + Auto Schedule, selected
   both players, started. Navigated straight into the rotation session
   (no longer stuck on the dashboard) — confirmed 1 match was
   correctly inserted into `rotation_matches` with real `p1`/`p3`/
   `club_id`/`status: pending`.
2. **Session opens correctly** — round header, player chips, VS card
   all rendered as expected ("Round 1 of 1", "0/1 matches, 0% done").
3. **Refresh persistence** — reloaded the page; the same pending match
   was still there, unchanged.
4. **Score update** — incremented the score steppers to 3–1 and hit
   Save. Confirmed all three tables updated consistently:
   `rotation_matches` (`status: submitted`, `score1: 3`, `score2: 1`,
   `match_id` set), `matches` (`team1_score: 3`, `team2_score: 1`,
   `winner_side: team1`, `status: confirmed`), and `match_players` (one
   row per side, correct `user_id`s). Progress UI updated to "1/1
   matches, 100% done".
5. **New Cycle** — generated a fresh pending match (2/2 total, 50%
   done) for the same two players. Confirmed via DB.
6. **Rebalance** — with only 2 players who'd already played each
   other, rebalance correctly removed the redundant pending match
   (`status: removed`) and added no new one — this is correct behavior
   for the "all pairs already played" case, not a bug. Confirmed via
   DB: seq 1 `submitted`, seq 2 `removed`.
7. **Add Player** — could not be exercised live: the test club only
   has 2 real members (both already in the rotation), and the
   separate "Add Guest" feature turned out to be broken on
   shuttley-dev too (missing `create_guest_profile` RPC function,
   confirmed via direct call returning PGRST202 — same schema-drift
   pattern as the bug just fixed, but a different, unrelated table/
   function). Flagged as a separate follow-up task rather than fixed
   here, since it's outside this task's scope. `addPlayer()`'s
   `rotation_matches` insert uses the exact same shape already proven
   working by Rebalance/New Cycle above, so it's covered by the schema
   fix with high confidence even though it wasn't exercised live.
8. **Console/network** — no console errors at any point during this
   pass.
9. **Free Play** — started, displayed, ended, and deleted cleanly in a
   separate test — unaffected by any of this.
10. **Cleanup** — all test sessions, matches, match_players, and
    rotation_matches rows created during this QA pass were deleted
    afterward. shuttley-dev now has only the same 2 pre-existing ended
    sessions it had before this session started, and 0 rows in
    `rotation_matches`.

No code changes were needed — the error-handling fix from the previous
commit was already correctly wired to the new schema. `npm run build`
succeeds.

**Auto Schedule rotation mode is now fully functional on shuttley-dev.**

---

## PWA install/update QA (2026-06-21)

Inspected `vite.config.js` (VitePWA config), `index.html`, `src/sw.js`,
`src/App.jsx` (`AutoUpdate`), `src/pages/LoginPage.jsx` (install-prompt
UI), and the actual `public/*` icon files. No Supabase/schema
involvement in this area — purely frontend build config + static
assets, no backend access needed beyond loading the app.

### Testing approach

`vite dev` explicitly disables the service worker
(`devOptions.enabled: false` in `vite.config.js`), so SW/manifest
behavior can't be exercised under the normal dev server. Tested instead
against the real production build via `vite preview` (port 4173, added
as `shuttley-preview` in `.claude/launch.json` — local launch config
only, not committed without explicit approval per this session's
constraints).

The production build initially rendered a **blank page with zero
console output** under `vite preview`. Root cause: `vite build`
defaults to `mode=production`, which loads `.env.production`/`.env`/
`.env.local` — none of which exist locally (`.env.local` was
previously disabled in an earlier QA session specifically because it
pointed at *production* Supabase, not shuttley-dev). With no Supabase
URL/key, `createClient(undefined, undefined)` in `src/lib/supabase.js`
throws at module-load time, before React ever mounts — explaining the
blank page and why the service worker's own automatic registration
(via `useRegisterSW()` in `App.jsx`) never even attempted to run. This
is a **local-testing-environment gap, not an app bug** — the real
Vercel production deployment has its own env vars configured
separately (see `docs/STAGING.md`).

To get the production build to actually render so SW/install-prompt
behavior could be exercised, created `.env.production.local` (copied
from `.env.development`'s shuttley-dev credentials) for local testing
only. Added `.env.production` and `.env.production.local` to
`.gitignore` first (they weren't previously listed, unlike
`.env.local`/`.env`/`.env.development` — a real gap that could have
let a future `vite build` run with real credentials get accidentally
staged). Never committed, never staged, no secrets printed anywhere.
**Sumit: this file still exists locally at
`shuttley/.env.production.local` for future PWA/preview testing — it's
gitignored and harmless, but flagging its existence for awareness.**

### What's working (verified live against the real `dist/` build)

- Manifest (`/manifest.webmanifest`) is valid JSON, all 4 icon
  entries fetch 200 with pixel dimensions confirmed to exactly match
  their filenames (`64x64`, `192x192`, `512x512`,
  `apple-touch-icon-180x180`) via direct PNG IHDR-chunk inspection.
- Service worker registers and activates cleanly
  (`active.state: "activated"`) once the app actually renders; zero
  console errors at any point.
- Install-prompt UI in `LoginPage.jsx` verified live: dispatched a
  synthetic `beforeinstallprompt` event → the "+ Add Shuttley to Home
  Screen" button correctly appeared → clicking it calls
  `installPrompt.prompt()`/handles `userChoice` with no errors. The
  "already installed" check (`matchMedia('(display-mode: standalone)')`)
  and the iOS-specific instructional hints (Safari vs Chrome-iOS vs
  other-iOS-browsers) were verified by code review — correct logic,
  but iOS UA-spoofing couldn't survive a full page reload in this tool,
  so the iOS path itself needs real-device confirmation (see below).
- Offline fallback in `sw.js` (serves cached `/index.html` on failed
  navigation fetches) — confirmed `index.html` is actually present in
  the Workbox precache manifest (35 entries), so the fallback has
  something to serve. Couldn't simulate true network-offline in this
  tool; this is logic-reviewed, not live-tested.
- No stale-version trap: `sw.js`'s `self.skipWaiting()` on install +
  `clients.claim()` on activate, combined with `App.jsx`'s `AutoUpdate`
  component forcing `updateServiceWorker(true)` (a full reload) the
  instant `needRefresh` flips true, means users are never stuck on an
  old cached version — by design, this is silent/automatic rather than
  prompting the user, which is a reasonable existing trade-off, not
  something introduced or changed here.
- Mobile-first layout confirmed clean at 390×844 viewport.
- `npm run build` succeeds.

### Bugs found and fixed (smallest safe fix — `index.html` +
`vite.config.js` only)

1. **Dead `logo.svg` reference.** `index.html` had
   `<link rel="icon" href="/logo.svg" type="image/svg+xml">` and
   `vite.config.js`'s `includeAssets` listed `'logo.svg'` — but the
   file doesn't exist anywhere in the repo (confirmed via full
   repo-wide search). Live-fetching `/logo.svg` returned HTTP 200 with
   `content-type: text/html` — Vite/SPA-hosting's catch-all fallback
   serving `index.html` itself, not a real icon. No console error
   resulted (browsers silently ignore unparseable favicon links), but
   it's a stale/misleading reference left over from original
   scaffolding, never cleaned up when the real Shuttley icons were
   added. **Fixed: removed the dead `<link>` and the dead
   `includeAssets` entry.**
2. **`theme-color` mismatch.** `index.html` had
   `<meta name="theme-color" content="#0d1321">` (dark navy) while the
   manifest's `theme_color` and the entire actual design system
   (`--accent`/`--text` in `src/index.css`) use `#256575` (teal) on a
   white background — there is no dark theme anywhere in the CSS, so
   `#0d1321` was just stale. This affects the installed-PWA window
   chrome color and the mobile browser address-bar tint shown while
   browsing normally. **Fixed: aligned to `#256575`.**

### Found and flagged, NOT fixed — needs a real image asset

3. **Maskable icon has no safe-zone padding.**
   `public/maskable-icon-512x512.png` is **byte-for-byte identical**
   to `public/pwa-512x512.png` (confirmed via direct byte comparison).
   A maskable icon needs the logo confined to roughly the center 80%
   "safe zone" with padding around it, because Android (and other
   platforms) apply shape masks (circle, squircle, etc.) that can clip
   anything outside that zone. Right now the same un-padded icon is
   declared as both regular and maskable, so on platforms that apply
   aggressive masking, parts of the Shuttley logo could get cropped
   off the home-screen icon. **This needs a new image asset generated
   with proper padding — not something fixable in code. Flagged for
   Sumit/design, not touched.**

### Manual device QA still required (cannot be verified in this tool)

- Real iOS Safari "Add to Home Screen" → confirm the resulting
  standalone app's icon, status bar, and splash screen look correct.
- Real Android Chrome install banner → confirm the installed icon
  isn't clipped by the maskable-icon padding issue above.
- A genuine update-while-installed scenario (deploy a new version
  while the PWA is already installed and open on a device, confirm the
  silent auto-reload behaves smoothly and doesn't interrupt anything
  important like an in-progress score entry).

### Cleanup

`.claude/launch.json`'s new `shuttley-preview` entry was added only to
the local (uncommitted, home-directory-level) launch config used by
this tool — not part of this repo's tracked files. No git changes
beyond `.gitignore`, `index.html`, `vite.config.js`. No Supabase
access of any kind was needed for this task; shuttley-dev was not
touched.

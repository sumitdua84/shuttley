# Shuttley — Changelog

## 2026-06-21 — QA pass: fix Splits, Chat, and Account Deletion blockers

**Branch:** `feature/shuttley-app-feel-upgrade`

**Commit:** `428abe6` — "Fix Shuttley splits, chat, and account deletion
QA blockers" (code only; this docs update is a separate commit)

**Summary:** Picked up the §6 restart point from the 2026-06-20 handover
and spot-checked the previously unverified areas in order: Splits, Chat,
Account deletion/admin. All three had genuine shuttley-dev schema drift
or wrong table/RLS issues, all now fixed and verified except where noted.

**What happened:**
- **Splits** — fixed missing `splits_expenses` columns
  (`created_by`/`image_url`/`is_settlement`/`edit_history`) on
  shuttley-dev. Verified the full add/balance/settle/history flow
  end-to-end.
- **Chat** — fixed schema drift (`chat_conversations` missing 5 columns;
  `chat_messages.user_id` renamed to `sender_id`, `club_id` added),
  fixed a duplicate "All Members" conversation race condition with a DB
  unique index + app-level conflict handling, polished the loading/error
  states and send-failure feedback to match the rest of the app-feel
  work, and converted Chat from a separate 3-column desktop layout to
  one mobile-first layout used everywhere (per Sumit's direction that
  desktop shouldn't feel like a separate dashboard).
- **Account deletion / admin** — found the entire flow broken on
  shuttley-dev (missing `email` column, `created_at`/`requested_at`
  naming mismatch, missing `get_next_deleted_seq` RPC, and
  `api/delete-user.js` referencing a `club_members` table that doesn't
  exist anywhere in this schema — the real table is `memberships`).
  Fixed all of it, and separately found and fixed an RLS visibility gap
  where Admin's Deletions tab silently showed zero requests even with
  real pending ones — fixed via a new service-role-backed endpoint
  (`api/deletion-requests.js`) rather than any RLS policy change.
  **This part is fixed in code but not yet verified at runtime** — Vercel
  serverless functions don't execute under local `vite dev`, so this
  needs `vercel dev` or a deployment to fully confirm. Confirm Delete was
  never clicked; `/api/delete-user` was never called; no account was
  anonymized. Two disposable test deletion requests
  (`sumitdua2@gmail.com`) are intentionally left pending on shuttley-dev
  for that future test.
- Full detail, root causes, and exact SQL/code changes are in
  `ISSUES.md` §8.

**Decision:** Branch remains **parked, not merged**. Still-unverified
areas: member removal/demotion, `RotationPage.jsx` rotation-mode
scheduling, PWA install/update, Vercel preview readiness, and the
account-deletion runtime test noted above.

**Production touched:** No — every schema change was applied directly
to the shuttley-dev Supabase project only, confirmed by project ref at
every step. No commits beyond the working branch, no pushes, no merges.

## 2026-06-20 — Close out app-feel verification, park the branch

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** Closed the last open item (`SessionSummary.jsx`'s
`PGRST201` error) and stopped the session cleanly per Sumit's request,
without merging anywhere. Full restart guide written into the "Session
Handover" section at the bottom of `ISSUES.md`.

**What happened:**
- Root-caused `SessionSummary.jsx`'s embed ambiguity error: the
  `sessions → profiles` embed it fetched was never actually used
  anywhere in the component. Removed it (`select('*, profiles
  (full_name))` → `select('*')`), which resolves the error regardless of
  its underlying cause. Verified clean across multiple reloads,
  including a fresh `shuttley-dev` project restart Sumit performed.
- Documented an orphaned-but-harmless finding: `session_polls.note` and
  `match_edit_log.note` (singular) predate this session's fixes and are
  unused dead columns, not a bug — not touched.
- Updated all four docs (`PROJECT.md`/`ROADMAP.md`/`CHANGELOG.md`/
  `ISSUES.md`) with a clear stopping point and full session handover, so
  the branch can be picked up cold by anyone (Claude Code, ChatGPT, or
  Sumit directly) without needing this conversation's history.

**Decision:** Branch is **parked, not merged**. Sumit will review the
diff and the still-unverified areas (splits, chat, admin anonymization,
member removal/demotion, rotation-mode scheduling, PWA install/update)
before deciding whether to merge to `develop`. No Phase 3, Phase 4, or V2
work started.

**Production touched:** No.

## 2026-06-20 — Verify Shuttley app-feel flows with member test data

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** Closed out Phase 1 + 2 verification. Fixed the genuine
`OnboardingPage.jsx` `createClub()` ordering bug, added a second test
member, and exercised every remaining untested flow end-to-end against
`shuttley-dev`.

**Files changed:**
- `src/pages/OnboardingPage.jsx` — `createClub()` reordered (insert club
  → insert membership → refresh), with per-step error handling
- New dev-only SQL fix scripts in `supabase/`: `fix_dev_clubs_creator_
  visibility.sql`, `fix_dev_sessions_missing_columns.sql`, `fix_dev_
  matches_missing_columns.sql`, `fix_dev_match_players_recursion.sql`,
  `fix_dev_session_polls_missing_column.sql`, `seed_dev_test_member.sql`
- New `supabase/READONLY_production_check.sql` — read-only audit script,
  not yet run
- `ISSUES.md`, `PROJECT.md`, `ROADMAP.md` updated

**What was verified (full list):**
- Onboarding club creation — now succeeds with zero failed requests
  (previously always 403'd on the read-back race, even when it
  ultimately succeeded)
- Member approval flow (moderator side)
- `MemberDashboard` — never tested before this session; loads correctly
  via the parallelized `fetchData()`
- Session lifecycle: start → record match (auto-confirm and
  requires-confirmation variants) → delete match → confirm match (as the
  non-recorder) → end session
- Poll lifecycle: create → respond → delete
- Every remaining `ConfirmModal` conversion: sign out, delete club
  request, match deletion, poll deletion
- Mobile viewport (375×812): dashboard, bottom nav, confirm modal all
  render correctly

**Found and fixed along the way** (all pre-existing shuttley-dev bugs,
none caused by this branch — full detail in `ISSUES.md`):
- `clubs` RLS blocking the `createClub()` read-back race
- `sessions`/`matches` column-name drift (`created_by` vs `started_by`/
  `recorded_by`, `match_type` vs `type`) — one of these was first
  mis-fixed by adding a duplicate column instead of renaming, corrected
  after the mistake surfaced a new `PGRST201` ambiguity error
- Missing `matches` DELETE policy (an existing script,
  `fix_match_rls.sql`, was never run against shuttley-dev)
- Cross-table RLS recursion between `matches` and `match_players`
- Missing columns on `session_polls` and `match_edit_log`

**Known unresolved:** `SessionSummary.jsx`'s embedded-profile query still
returns `PGRST201` on shuttley-dev despite the schema being verified
correct — looks like a stuck PostgREST cache entry that standard reload
methods didn't clear. Likely needs a full project restart. Session
ending itself works correctly; only this one display page is affected.

**Vercel preview:** Not pushed. Found the single Vercel project's
Supabase env vars are scoped to "Production and Preview" with no
dev-only override — pushing would risk a live preview writing test data
into production. See `ISSUES.md` for the suggested fix.

**Production touched:** No.

## 2026-06-20 — Verify Phase 1 + 2 with a real login

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** Logged in as `sumitdua84@gmail.com` against `shuttley-dev`
to verify the authenticated flows flagged as untested in the previous
entry. Found and fixed three pre-existing shuttley-dev database bugs
(unrelated to this branch's code) that were blocking testing entirely,
then verified the actual app-feel changes work end-to-end.

**Files changed:**
- New: `supabase/fix_dev_memberships_recursion.sql`,
  `supabase/fix_dev_clubs_creator_visibility.sql`
- `ISSUES.md` updated with findings

**What was found and fixed (shuttley-dev only, run by Sumit):**
1. `memberships.joined_at` column missing + four self-referencing
   `memberships` RLS policies causing infinite recursion (`42P17`)
2. `clubs` RLS blocking a creator from reading back their own
   just-created club before their membership row exists (`42501`) — a
   genuine app bug in `OnboardingPage.jsx`'s `createClub()`, not just dev
   drift. **Sumit still needs to check if production has the same gap.**

**What was verified once the dev DB was fixed:**
- Login → club creation → auto-routed to `ModeratorDashboard`
- `ModeratorDashboard`'s parallelized `Promise.all()` `fetchData()` —
  loads cleanly, no errors
- `ConfirmModal` (both the named-function and inline-arrow-function
  conversions) — Sign Out and "Request to Delete Club" both work
  correctly
- No regressions in pre-existing UI (Start Session modal) alongside the
  changes

**Still not verified** (test club has no matches/sessions/polls/other
members yet): destructive-action confirms for match/session/poll
deletion and member management, `MemberDashboard` (test account is a
moderator), skeleton appearance with real session data, route transition
feel on a real device, PWA install/update after the bundle restructure.
See [ISSUES.md](ISSUES.md) for the full list.

**Production touched:** No.

## 2026-06-20 — Phase 1 + 2: App-feel polish, code splitting, Supabase parallelization

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** Combined Phase 1 (app-feel) and Phase 2 (performance) work in
one pass per Sumit's direction. No new features, no schema changes, no
production deploy.

**Files changed:**
- New: `src/components/Toast.jsx`, `src/components/ConfirmModal.jsx`,
  `src/components/Skeleton.jsx`, `src/hooks/useConfirm.jsx`
- Modified: `src/index.css` (skeleton shimmer, confirm modal, route fade
  CSS), `src/App.jsx` (React.lazy + Suspense + route transition wrapper),
  `src/pages/AdminDashboard.jsx`, `MatchesPage.jsx`, `MemberDashboard.jsx`,
  `ModeratorDashboard.jsx`, `ProfilePage.jsx`, `RotationPage.jsx`,
  `SessionSummary.jsx`

**What changed:**
1. Replaced all 27 raw `alert()`/`confirm()`/`window.confirm()` calls with
   a shared `Toast` component and a promise-based `useConfirm()` hook +
   `ConfirmModal`. Business logic and call order unchanged — only the UI
   mechanism for confirmation/error messaging changed.
2. Replaced blank-splash loading on `MemberDashboard`, `ModeratorDashboard`,
   `RotationPage`, `SessionSummary` with a `DashboardSkeleton` (skeleton
   cards + list rows) instead of a full-screen blank wait.
3. Added a 180ms fade route transition wrapping `<Routes>` in `App.jsx`.
4. Converted all 18 route imports in `App.jsx` to `React.lazy()` +
   `Suspense`. Main JS bundle dropped from **692.99 KB to 394.10 KB**
   (181.14 KB to 112.89 KB gzip); Vite's "chunk larger than 500kB" build
   warning is gone. Each route now loads its own small chunk on demand.
5. Parallelized independent Supabase calls in `MemberDashboard.jsx` and
   `ModeratorDashboard.jsx` `fetchData()` — both functions previously made
   ~8 sequential `await` round-trips; now batched into 1-2
   `Promise.all()` groups (only batching calls with no data dependency on
   each other; the splits-balance fetch correctly stays sequential since
   it depends on `featuresData`).

**Testing performed:**
- `npm run build` after every change group — all passed, no errors.
- Verified in the dev server (`shuttley-dev` Supabase project, not
  production) via browser automation: login page renders, lazy-loaded
  public routes (`/privacy`, `/join/:code`) load with zero console errors,
  full page reload works cleanly post-refactor.
- **Not verified:** authenticated dashboard flows (Member/Moderator
  dashboard, match recording, chat, splits) — no test login credentials
  available in this session. See [ISSUES.md](ISSUES.md).

**Known issues:** see [ISSUES.md](ISSUES.md).

**Production touched:** No. All work on `feature/shuttley-app-feel-upgrade`,
no merge to `develop` or `main`, no deploy.

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

# Shuttley — Changelog

## 2026-07-03 — Production hotfixes: polls, global chat, navigation

**Branch:** `main`  
**Production commits (today):**
- `d543222` — Bottom nav icons positioning on mobile (reduced top padding 10px→4px, adjusted .tab padding for lower icon placement on iPhone)
- `ce5ffaf` — Groups nav tab should go to /groups (join) not /my-groups (yours)
- `dc1a887` — Exclude guests from poll attendance display on Home (fetch non-guest members only for yes/no/maybe/no-response tallies)
- `42fb4c8` — Global chat directory improvements (cherry-picked: search, deleted/guest filtering, `/chat/:conversationId` routing, GlobalDMPage with shared groups)
- `a6c11b5` — Exclude guests from polls — visibility, counts, notifications (Home, Member/ModeratorDashboard)
- `0edaace` — Restore Home session poll start visibility for moderators (mods see open session polls even if they haven't answered yes)

**Summary:** Hotfix batch addressing poll privacy, guest visibility, chat routing, and mobile UI. All changes frontend-only; no schema/RLS/env changes.

**What fixed:**
1. **Poll privacy:** Guests completely excluded from polls (visibility, response counts, notifications). Members no longer see guest names in poll attendance tallies.
2. **Chat routing:** Global DM directory now navigates to `/chat/:conversationId` (new global DM page) instead of `/club/:clubId/chat`. Search, deleted/guest filtering, and shared group names visible on DM page.
3. **Navigation:** Groups button in bottom nav now goes to `/groups` (discover/join) instead of `/my-groups` (your groups list), consistent with Home behavior.
4. **Mobile UI:** Bottom nav icons positioned lower on iPhone to match standard mobile app patterns.
5. **Moderator workflows:** Home session poll start button now visible to moderators regardless of whether they've personally answered yes.

**Validation:** npm run build passes (115 modules, 0 errors). No production Supabase queries, schema migrations, or env changes.

---

## 2026-06-30 - V1 production release closeout docs

**Branch:** `main`
**Commit:** `c530631` - docs: close V1 production release before V2 (docs-only, no app code change)

**Summary:** Closed out V1 production release documentation. No app code, Supabase, SQL, schema, or Vercel changes. App-code state remains `a56d509`.

---

## 2026-06-30 - V1 app-feel live in production

**Branch:** `main`  
**Current production commit (app code):** `a56d509`

**Summary:** V1 app-feel release is live in production. The release was staged on `dev.shuttley.club`, promoted to `main`, and verified on `www.shuttley.club`. No production Supabase SQL, schema migration, RLS change, or data migration was run.

**Production follow-up fixes now on `main`:**
- `681cf8a` - support production `matches.type` column in stats via frontend fallback.
- `2b7fad1` - Home Sessions poll UI: View Attendance + Start Session.
- `8a6e5cd` - Stats ranking by win percentage with 10-match minimum.
- `505d91c` - Bottom nav order: Home, Chat, Session, Stats, More.
- `2cfbc6b` - Separate Home Sessions into clearer per-group cards.
- `a56d509` - Add Google Play app signing key to `assetlinks.json`; Android toolbar issue fixed.

**Verification:** Production loads, bundle points to production Supabase (`wuvwvrgxbfcyhqsyoswd`), service worker/manifest smoke checks passed, user verified Matches/Stats and Android shell fix.

**V2:** Not started. V2 should begin from current `main` in a new branch/session.

---
## 2026-06-29 — V1 app-feel upgrade merged to develop (PR #2)

**Branch:** `feature/shuttley-app-feel-upgrade` → `develop`
**Merge commit:** `73860e9`

**Commits included (this session):**
- `bf0c92b` — Super-admin profile link (Admin Dashboard card on ProfilePage, sumit@shuttley.club / sumitdua84@gmail.com only)
- `3ccc31d` — Auto Schedule visual polish (CSS vars, `● LIVE · AUTO SCHEDULE · DOUBLES` label, green player chips, collapsed add-player toggle)
- `ed38423` — Session participant scoping (Record Match + RotationPage free play default to present players; others collapsed under `▼ Add other players (N)`)
- `59e4938` — Named session modal, SessionPage redesign, MatchesPage GroupWorldHeader wired + `match.match_type` stats bug fixed

**QA:** Full browser QA on dev Supabase (`ecdibuhrgdmsdvovmlvl`) + LAN mobile UI/flow QA at 390×844 (production build preview). Guest RPC (`create_guest_profile`) verified. All flows passed.

**Deferred:** HTTPS PWA install QA (Add to Home Screen, service worker, standalone launch) — requires staging/HTTPS deploy.

**Production touched:** No. No production SQL. No production deploy. No `main` changes. V2 not started.

---

## 2026-06-23 — Vercel preview readiness + account-deletion runtime test: PASS

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** Closed out the two items left unverified from the
2026-06-21 session — Vercel preview readiness and the account-deletion
Vercel runtime test. No application code changes were required; the
code from the 2026-06-21 session worked once the environment was
correctly configured.

**Infra changes (Vercel dashboard/CLI, not app code):**
- Created a new dev-only Vercel project, `shuttley-dev`, under the
  `sumitdua84` personal Vercel account, same GitHub repo
  (`sumitdua84/shuttley`), Root Directory `shuttley`. Connected to
  shuttley-dev Supabase only (`https://ecdibuhrgdmsdvovmlvl.supabase.co`).
  No `shuttley.club` domain attached, no production Supabase keys used.
- Pushed `feature/shuttley-app-feel-upgrade` to GitHub for the first
  time (previously local-only) so the new Vercel project could deploy
  the correct branch — its first deployment had only seen `main` and
  served stale code, which made Admin → Deletions fall back to the old
  direct Supabase query instead of `/api/deletion-requests`.
- Found and fixed an env var scope bug in the new project:
  `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` and
  initially `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` were scoped to
  Production only, not Preview — caused a white screen
  (`supabaseUrl is required`) and then `500`s on `/api/admin-data` and
  `/api/deletion-requests` until Preview scope was added to all five.
- While cleaning up env var scopes, an accidental redeploy of the
  **existing production** Vercel project happened. Checked immediately
  after — production app confirmed still working. Production env vars
  were tightened to Production-only scope where applicable (cleanup,
  no functional change). No production deletion testing was done.

**Verification performed (real Vercel runtime, shuttley-dev only):**
- `GET /api/deletion-requests` → `200`, real pending rows returned —
  confirms the admin-visibility fix from 2026-06-21 works at runtime.
- `Confirm Delete` clicked on one disposable `sumitdua2@gmail.com`
  pending row. `POST /api/delete-user` → `200`. Runtime logs confirmed:
  super admin authorization passed, profile anonymized to `deleted_2`,
  auth email changed to `deleted_2@deleted.com`, removed from all
  clubs, chat messages cleared, removed from chat conversations,
  request marked `completed` in the UI. The second pending
  `sumitdua2@gmail.com` row was left untouched as fallback test data.

**Known issues:** see [ISSUES.md](ISSUES.md) — "Close of day
(2026-06-23)".

**Production touched:** No application code or schema change. One
accidental redeploy of the existing production Vercel project occurred
during env var cleanup; confirmed working immediately after, no
production Supabase data touched, no production SQL run. No merge to
`develop` or `main`. V2 not started.

## 2026-06-21 — Close Shuttley app-feel PWA QA session

**Branch:** `feature/shuttley-app-feel-upgrade`

End-of-day checkpoint at `13ce90f`. No code changes this entry — docs
only, recording where the session stopped. Full detail in
`SHUTTLEY — APP FEEL CLOSE OF DAY HANDOVER.md`. Verified before
closing: `main`/`develop` untouched, branch never pushed (no remote
tracking ref), nothing merged, nothing deployed, no `.env` file
staged, `.env.local.disabled`/`.claude/launch.json`/
`.env.production.local` all correctly untracked or gitignored.

Remaining before this branch is ready for review: Vercel preview
readiness, the account-deletion Vercel runtime test, and three manual
device tests (iOS Safari install, Android Chrome install,
update-while-installed). Two optional/non-blocking items also remain:
the Add Guest RPC schema-drift fix and the maskable-icon padding
asset.

## 2026-06-21 — Fix Shuttley PWA install and update QA blockers

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** QA pass on PWA install/update behavior. No backend
involvement — pure frontend build config and static assets. Tested
against the real production build (`vite preview`) since `vite dev`
disables the service worker entirely. Found that the production build
renders blank locally because no `.env.production`/`.env.local` exists
(a local-testing-environment gap, not an app bug — Vercel production
has its own env vars). Added a local-only, gitignored
`.env.production.local` to get the build to render for testing — never
committed, no secrets exposed. Also closed a real gitignore gap:
`.env.production`/`.env.production.local` weren't previously listed
alongside `.env.local`/`.env`/`.env.development`.

**What's verified working:** manifest validity, icon file integrity
(dimensions confirmed via byte inspection), service worker registration
and activation, the install-prompt UI (live-tested via a synthetic
`beforeinstallprompt` event), offline-fallback precaching, and the
no-stale-version auto-update design. Mobile layout clean at 390×844.
`npm run build` succeeds.

**Fixed (smallest safe fix, `index.html` + `vite.config.js` only):**
- Removed a dead `<link rel="icon" href="/logo.svg">` reference — the
  file doesn't exist anywhere in the repo and was silently served as
  the SPA's `index.html` fallback instead of a real icon.
- Fixed `theme-color` meta tag from a stale dark navy (`#0d1321`,
  matching no theme that exists in the CSS) to `#256575`, matching the
  manifest and the app's actual teal/white design.

**Found and flagged, NOT fixed (needs a real image asset, not code):**
the maskable icon (`maskable-icon-512x512.png`) is byte-identical to
the regular 512px icon — no safe-zone padding, risking edge-clipping
on platforms with aggressive icon masking. Documented in ISSUES.md for
design follow-up.

**Manual device QA still required:** real iOS Safari install flow,
real Android Chrome install banner (incl. the maskable-icon risk
above), and a genuine update-while-installed scenario — none of which
can be exercised in this tool.

No SQL run, no Supabase access needed, no production deploy.

## 2026-06-21 — Verify Shuttley rotation scheduling after dev schema fix

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** Sumit applied the `rotation_matches` schema fix SQL
(flagged in the previous entry below) manually on shuttley-dev. This
session re-verified the schema live (didn't assume the prior session's
findings were still accurate) and ran a full end-to-end QA pass on
Auto Schedule: start session, score a match, New Cycle, Rebalance, and
confirmed `rotation_matches`/`matches`/`match_players` all stay
consistent. Free Play retested as a regression check, unaffected.

**No code changes** — the error-handling fix from the previous commit
was already correctly wired to the new schema once it existed.

**Found and flagged separately (not fixed, out of scope):** the
"Add Guest" feature is also broken on shuttley-dev — missing
`create_guest_profile` RPC function, same schema-drift pattern as the
bug just fixed but a different, unrelated feature. Spun off as a
separate follow-up task rather than expanding this one's scope.

All QA test data (sessions, matches, rotation_matches rows) created
during this pass was cleaned up afterward. `npm run build` succeeds. No
SQL run by this session, no production access.

**Auto Schedule rotation mode is now fully functional on shuttley-dev.**

## 2026-06-21 — Fix Shuttley rotation scheduling QA blockers

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** QA pass on `RotationPage.jsx`'s Auto Schedule (rotation
mode). Found that Auto Schedule was silently broken on shuttley-dev:
the `rotation_matches` table still has an old, pre-redesign schema
(`team1`/`team2`/`sitting`/`team1_score`/`team2_score`) instead of the
columns the current app code and `supabase/rotation.sql` expect
(`p1`-`p4`, `club_id`, `score1`/`score2`, `match_id`). Every schedule
insert into that table failed, but nothing checked the error, so
moderators landed on a session that silently looked like Free Play
instead of the rotation they asked for.

**What changed:** Added error handling to all five `rotation_matches`
insert call sites (`ModeratorDashboard.jsx`'s `startSessionWithRotation()`,
`MemberDashboard.jsx`'s `startSession()`, and `RotationPage.jsx`'s
`rebalance()`/`addPlayer()`/`newCycle()`). On failure, in-session actions
now show a toast and refresh; starting a new session now rolls back the
just-created `sessions` row and keeps the moderator on the player-select
step instead of navigating into a broken-looking session.

**Not fixed by this commit:** Auto Schedule still won't actually
generate matches until the `rotation_matches` schema drift is fixed —
SQL is written up in [ISSUES.md](ISSUES.md), confirmed safe (table is
empty on shuttley-dev), **not run**, flagged for Sumit to review and
apply. Free Play mode is unaffected and fully functional.

Tested in-browser against shuttley-dev (`App Feel Test Club`), including
confirming the rollback leaves no orphaned sessions or stray rows. No
SQL run, no production access, only the three files above changed.

## 2026-06-21 — Fix Shuttley member removal and demotion QA blockers

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** QA pass on the member removal/demotion flows in
`ModeratorDashboard.jsx`, the next item from the unverified list. Unlike
the account-deletion bug, removal/demotion already used the correct
`memberships` table — no schema fix needed. Found and fixed two UX/safety
gaps: no protection against removing the last moderator from a club, and
no confirmation step on promotion (inconsistent with demote/remove).

**What changed:**
- `demoteMod()` / `removeMember()` now block acting on a club's last
  remaining moderator, showing a toast instead of proceeding.
- `promoteMod()` now shows a `ConfirmModal` confirmation, matching
  demote/remove.

**Verified, unchanged:** self-removal/self-demotion UI guard, use of
`ConfirmModal`/`Toast` (no native alert/confirm), mobile-first layout.

**Flagged, not applied:** the `memberships` DELETE RLS policy on
shuttley-dev technically permits self-delete (`user_id = auth.uid()`),
which is a backend-only gap since no UI feature uses it. SQL suggestion
left in [ISSUES.md](ISSUES.md) for Sumit to review — not run.

Tested in-browser against shuttley-dev (`App Feel Test Club`). No SQL
run, no production access, only `ModeratorDashboard.jsx` changed.

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

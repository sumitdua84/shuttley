# Shuttley — V1 App-Feel Post-Merge Handover
**Date:** 2026-06-29  
**Session:** V1 app-feel stabilisation, QA, and merge to develop

---

## Current branch and commit state

| Item | Value |
|---|---|
| Active branch | `develop` |
| Latest commit | `73860e9` — Merge pull request #2 from `feature/shuttley-app-feel-upgrade` |
| Feature branch | `feature/shuttley-app-feel-upgrade` (intact, not deleted) |
| Remote | Up to date with `origin/develop` |
| Git status | Clean (only intentionally untracked local dev files: `.gitignore`, `.env.local.disabled`, `.claude/`) |
| Production / `main` | Not touched in this session |
| Supabase production (`wuvwvrgxbfcyhqsyoswd`) | Not touched |

---

## What was completed in this session

### Commits landed on `feature/shuttley-app-feel-upgrade` → now on `develop`

| Commit | Description |
|---|---|
| `59e4938` | Named session modal, SessionPage redesign, MatchesPage GroupWorldHeader + stats fix |
| `ed38423` | Session participant scoping fix |
| `3ccc31d` | Auto Schedule visual polish |
| `bf0c92b` | Super-admin profile link (Admin Dashboard card on ProfilePage) |
| `73860e9` | Merge commit into `develop` (PR #2) |

### Feature detail

- **Named session modal** — editable session name, weekday pre-fill, match type pre-filled from SessionPage navigation state
- **SessionPage redesign** — hero "Ready to Play?" card, session history across groups, correct Home-world BottomNav
- **MatchesPage** — GroupWorldHeader wired; `match.match_type` bug fixed (doubles/singles stats were always 0)
- **Session participant scoping** — Record Match + RotationPage (free play) default to session-present players; non-present members collapsed under `▼ Add other players (N)` toggle
- **Poll-based session start** — skips player-picker Step 2, auto-fills yes-voters from poll responses
- **Auto Schedule visual polish** — CSS vars, `● LIVE · AUTO SCHEDULE · DOUBLES` label, green player chips, collapsed add-player toggle
- **Super-admin profile link** — "Admin Dashboard" card on ProfilePage, visible only to `sumit@shuttley.club` / `sumitdua84@gmail.com`
- **Guest RPC verification** — `create_guest_profile` RPC confirmed working on dev Supabase (`ecdibuhrgdmsdvovmlvl`)

---

## QA completed

- Full browser QA against dev Supabase (project `ecdibuhrgdmsdvovmlvl`) — safe, not production
- LAN mobile UI/flow QA at 390×844 viewport (production build, `npm run preview -- --host`, port 4173)
- All console errors traced — none introduced by this branch
- `/api/admin-data` local JSON error classified as expected Vite dev limitation (Vercel serverless function served as source file by Vite preview — not a real bug, not a pre-merge blocker)
- Build clean throughout (`npm run build` emits no errors or warnings beyond expected chunk size advisory)

### QA checklist passed

| # | Item | Result |
|---|---|---|
| 1 | Login renders + auth succeeds | ✅ |
| 1.5 | Auth persists across navigation | ✅ |
| 2 | Home dashboard (greeting, sessions, performance, groups) | ✅ |
| 3 | GroupWorldHeader + group switcher + GroupNav 6 tabs | ✅ |
| 4 | Session start modal (Step 1 + Step 2 player picker) | ✅ |
| 5 | Rotation/Auto Schedule page (ENDED · AUTO SCHEDULE · DOUBLES label, PLAYING · N, round nav) | ✅ |
| 7 | Matches/Stats (real data, GroupWorldHeader, win rate, rankings) | ✅ |
| 8 | Polls (session poll + custom polls) | ✅ |
| 9 | Chat (history loads, send message works) | ✅ |
| 10 | Profile (opens, Admin Dashboard card visible, navigates to /admin) | ✅ |
| PWA install | Add to Home Screen / service worker / standalone launch | ⏳ Deferred |

---

## Deferred checks

**HTTPS PWA install QA** — items 1.1–1.5 require an HTTPS deployment to verify:
- Add to Home Screen prompt appears
- Service worker registers and caches assets
- App launches in standalone mode (no browser chrome)
- Splash screen renders
- PWA icon correct

Deferred to post-merge staging deploy. Requires the `shuttley-dev` Vercel project to be set up first (see next steps).

---

## Safety status

- ✅ Production Supabase (`wuvwvrgxbfcyhqsyoswd`) — **not touched**
- ✅ `main` branch — **not touched**
- ✅ No production SQL executed
- ✅ No production deploy manually triggered
- ✅ V2 — **not started**
- ✅ All QA against dev Supabase (`ecdibuhrgdmsdvovmlvl`) only
- ✅ Feature branch left intact after merge

---

## Recommended next-session prompt

> **Shuttley — post-V1 app-feel release readiness**
>
> Current state:
> - Branch: `develop`, commit `73860e9` (V1 app-feel upgrade merged)
> - Git status clean
> - Production (`main`) not touched
> - Supabase production not touched
> - V2 not started
>
> Task: Assess the release path for promoting `develop` → `main` / production.
>
> Before doing anything else:
> 1. Set up the `shuttley-dev` Vercel project (second project under `sumitdua84` Vercel account, branch=`develop`, env vars from `.env.development`). See `shuttley/CLAUDE.md` for project layout.
> 2. Once `shuttley-dev` is deployed to an HTTPS URL, run the deferred PWA install QA (Add to Home Screen, service worker, standalone launch, splash screen, icon).
> 3. Assess whether develop is ready for production — check for any open issues, confirm build is clean, confirm no regressions.
> 4. Report your release recommendation before merging or deploying anything.
>
> Constraints:
> - Do not start V2.
> - Do not touch production Supabase (`wuvwvrgxbfcyhqsyoswd`).
> - Do not merge develop → main until release-readiness is confirmed.
> - Do not deploy to production until explicitly approved.
> - First assess, then report, then await approval before acting.

---

## Next steps (priority order)

1. **`shuttley-dev` Vercel project** — create second Vercel project under `sumitdua84` account, branch=`develop`, named `shuttley-dev`, with dev env vars. Point `dev.shuttley.club` at it. (Blocked previously on cross-account Vercel transfer — solution is second project under same account, not a new account.)
2. **HTTPS PWA install QA** — once `shuttley-dev` is live, run deferred PWA checklist items 1.1–1.5.
3. **Release-readiness assessment** — decide if `develop` is ready to promote to `main` / production.
4. **App Store demo account** — still owed to App Store Connect (separate from app-feel work).
5. **Court booking** — next planned feature, undesigned; build on `develop` after release decision.

# Shuttley — V1 App Feel Closeout Handover

> Last updated: 2026-06-27
> Session: V1 app-feel upgrade session (multi-day, ongoing)

---

## UPDATE 2026-06-27 — Group-World Polish + Bug Fixes

### Branch / Commit State

| Field | Value |
|---|---|
| **Branch** | `feature/shuttley-app-feel-upgrade` |
| **Latest committed** | `1510b38` — `fix: guard GroupWorldHeader against invalid group routes` |
| **Commits ahead of `origin/feature/...`** | 3 (unpushed) |
| **Commits ahead of `develop`** | 25+ |
| **Commits ahead of `main`** | 25+ |
| **Unstaged (not committed)** | `src/pages/ModeratorDashboard.jsx`, `src/pages/SessionPage.jsx`, `src/pages/MatchesPage.jsx` |
| **Production / main / develop** | ✅ UNTOUCHED |
| **Supabase / schema / RLS** | ✅ UNTOUCHED |
| **Deployed** | ❌ No |
| **V2** | ❌ Not started |

### Work completed this session

#### A — GroupWorldHeader component (`src/components/GroupWorldHeader.jsx`) ✅ COMMITTED

New shared component. Shows the group name and role/sublabel in the topnav of group-world pages. When the user belongs to more than one club, clicking the group name opens a dropdown to switch groups. Used in:
- `ModeratorDashboard.jsx` — shows group name + "Moderator", opens group-switcher
- `MemberDashboard.jsx` — shows group name + "Member"
- `MatchesPage.jsx` — shows group name + "Stats", `buildRoute` overrides to `/club/:id/matches`
- `ChatPage.jsx` — shows group name + "Chat", `buildRoute` overrides to `/club/:id/chat`

Fixed bugs in GroupWorldHeader:
- Membership filter was keeping rows where `club_id` was null (since `null !== uuid`), generating routes like `/club/null/matches`. Fixed: `data.filter(m => m.club_id && m.club_id !== clubId)`.
- Added `if (!m.club_id) return` guard in `switchTo()`.
- Added `type="button"` to all buttons.
- Removed dead `activeTab === 'stats'` / `activeTab === 'chat'` branches from `buildTargetRoute` — pages with non-dashboard routes always pass their own `buildRoute`.

#### B — Named Session modal (`src/pages/ModeratorDashboard.jsx`) ⚠️ UNSTAGED

Added `modalSessionName` state and a Session Name input field in the Step 1 Start Session modal. Pre-filled with a weekday default (`Monday Badminton`, `Friday Smash`, etc.). Editable before starting. Session is created with whatever name is in the field.

Module-level additions:
```js
const WEEKDAY_SESSION_NAMES = {
  0: 'Sunday Game', 1: 'Monday Badminton', 2: 'Tuesday Game',
  3: 'Wednesday Social', 4: 'Thursday Badminton', 5: 'Friday Smash', 6: 'Saturday Badminton',
}
function weekdaySessionName() { return WEEKDAY_SESSION_NAMES[new Date().getDay()] }
```

State: `const [modalSessionName, setModalSessionName] = useState(weekdaySessionName())`
(Important: initialised with plain call, NOT lazy initializer — see TDZ bug below.)

#### C — TDZ crash fix (`src/pages/ModeratorDashboard.jsx`) ⚠️ UNSTAGED

**Root cause of blank-page bug on group switch:**

The named-session fix initially wrote:
```js
// WRONG — causes ReferenceError on remount:
const [modalSessionName, setModalSessionName] = useState(() => prefillSessionNameRef.current || weekdaySessionName())
```
`prefillSessionNameRef` is declared with `const` on line ~73, AFTER this `useState` at line ~41. React calls lazy initializers synchronously at render time, before reaching line 73, so `prefillSessionNameRef` was in the Temporal Dead Zone → `ReferenceError: Cannot access 'prefillSessionNameRef' before initialization` → crash → blank page.

Only triggered on **remount** (switching clubs via GroupWorldHeader changes `RouteTransition`'s `key={location.pathname}` → full unmount/remount). This is why the page loaded fine on first visit but went blank after a group switch.

**Fix:**
```js
// CORRECT — no ref access at init time:
const [modalSessionName, setModalSessionName] = useState(weekdaySessionName())
```
Prefill from navigation state (`location.state.prefillName`) is consumed in the autoStart `useEffect`, where all refs are safely in scope.

#### D — SessionPage redesign (`src/pages/SessionPage.jsx`) ⚠️ UNSTAGED

Redesigned as a creation/lobby page:
- Hero card: LIVE block (if active session) or "Ready to Play?" (if not)
- Weekday session name pre-fill
- Moderators can start sessions from here → navigates to `/club/:clubId/mod` with `state: { prefillName, prefillType, autoStart: true }`
- Members see poll/RSVP status only

#### E — MatchesPage GroupWorldHeader wiring (`src/pages/MatchesPage.jsx`) ⚠️ UNSTAGED

- Added GroupWorldHeader with `buildRoute={(targetClubId) => /club/${targetClubId}/matches}` so switching groups from the Stats screen goes to the same-type route, not mod/member dashboard
- `subLabel="Stats"`, `activeTab="stats"`, `isMod={isModerator}`

### Files changed this session

| File | Status | Notes |
|---|---|---|
| `src/components/GroupWorldHeader.jsx` | ✅ Committed (`494e333`, `1510b38`) | New component, club_id guard fixed |
| `src/pages/ModeratorDashboard.jsx` | ⚠️ Unstaged | Named session modal + TDZ bug fix |
| `src/pages/SessionPage.jsx` | ⚠️ Unstaged | Redesigned creation/lobby page |
| `src/pages/MatchesPage.jsx` | ⚠️ Unstaged | GroupWorldHeader wired |

### Immediate next step before anything else

**Commit the 3 unstaged files:**
```
git add src/pages/ModeratorDashboard.jsx src/pages/SessionPage.jsx src/pages/MatchesPage.jsx
git commit -m "feat: session page redesign, named session modal, stats guest filter, TDZ fix"
```

Then push:
```
git push origin feature/shuttley-app-feel-upgrade
```

### Known open issues (this session)

| # | Issue | Status |
|---|---|---|
| 1 | Named session flow — end-to-end test | ❌ Not manually tested |
| 2 | Group-switch blank page fix — verify resolved | ❌ Not manually re-tested after TDZ fix |
| 3 | SessionPage → ModeratorDashboard autoStart flow | ❌ Not manually tested |
| 4 | No UI link to `/admin` — super admins must type URL | ⚠️ Known, deferred |
| 5 | All V1 manual QA checklist items from §6 below | ❌ Still not done |

### Safety constraints (unchanged)

- Do NOT touch Home (`src/pages/HomePage.jsx`)
- Do NOT touch RotationPage, SessionSummary, RecordMatch, BottomNav, GroupNav
- No V2, no merge, no deploy, no production
- No Supabase SQL without Sumit approval

---

---

## HOME DASHBOARD — DONE (2026-06-26 closeout)

**Home dashboard is now done for this V1 app-feel session.**

### Commit info

| Field | Value |
|---|---|
| **Branch** | `feature/shuttley-app-feel-upgrade` |
| **Home commit** | `da4b6dc` — `style: finalise Home dashboard` |
| **Build** | ✅ Clean — 111 modules, 0 errors, 0 warnings |
| **Push** | ✅ Pushed to `origin/feature/shuttley-app-feel-upgrade` |

### Home screen final layout / order

```
Good morning/afternoon/evening, {firstName}   [profile icon top-right]

── Action Needed (if any) ──────────────────────────────────
  Polls card: unanswered polls, grouped, group name prominent (accent, centred)
    Yes/No/Maybe inline for session polls
    Equal-width custom option buttons for custom polls
  Alerts card (amber): match-needs-attention + pending member approvals

── Sessions (if any) ───────────────────────────────────────
  Single card grouping ALL clubs alphabetically
  Per club:
    Active session first → teal block with group name inside (not floating above)
    Then that club's upcoming poll rows sorted date → time
  Group name shown in teal block (active) or first upcoming row (no active)
  "Open Current Session →" for active sessions
  "▶ Start Session from this Poll" for mods with no active session
  "View Poll →" for members — deep-links to specific poll (openPollId state)

── My Performance ──────────────────────────────────────────
  Period filter inside card (15d / 30d / 60d / All)
  Click stats row to expand per-group breakdown — rows inside same card
  No separate cards for groups

── My Groups ───────────────────────────────────────────────
  Up to 5 groups, tap → group world at ?tab=session
  Badge: "N open polls" (open session + custom polls user is engaged with)
  No "View all →" link on Home
```

### Action Needed behaviour

- Shown only when there are active polls OR alerts
- Polls card above alerts card (polls need user action before match alerts)
- Each poll shows group name prominently (centred, accent, 700 weight) above poll title
- Custom polls show equal-width grid buttons (not cramped)
- Alerts card is amber-styled, separate visual from polls card

### Sessions card behaviour

- Groups ALL clubs alphabetically into one shared card
- Active session (teal block) shown first within each club group
- Group name lives inside teal block — not floating above it
- Upcoming poll rows follow the active session for the same club
- When no active session: group name shown on first upcoming row only
- Sorted: club name A→Z → session date asc → session time asc

### Poll / custom poll behaviour

- `View Poll →` deep-links to specific poll via `location.state.openPollId`
  - ModeratorDashboard: already supported this pattern
  - MemberDashboard: `openPollIdRef` + useEffect added to match mod pattern
- Custom poll buttons use equal-width grid layout (fills card width)
- My Groups badge wording: "N open poll(s)" not "N polls"

### My Performance status

- Period filter inside the card (not beside the section label)
- Expanded per-group rows inside the same card (not separate cards)
- Click stats row toggles expand / collapse
- Filter pill clicks do not accidentally toggle expand

### My Groups status

- Up to 5 groups shown on Home
- Tapping group card enters group world at Session tab
- Poll badge counts unanswered + yes-answered open polls per club
- Badge wording: "1 open poll" / "3 open polls"

### Production / safety status

```
Branch:       feature/shuttley-app-feel-upgrade
Merged:       NOT merged to main
Deployed:     NOT deployed
Production:   UNTOUCHED
Supabase:     UNTOUCHED (schema, RLS, functions, policies unchanged)
V2:           NOT started
iOS/native:   UNTOUCHED
Push backend: UNTOUCHED
Auth:         UNTOUCHED
develop:      UNTOUCHED
main:         UNTOUCHED
```

### Files changed in this Home dashboard session (since `8523d67`)

```
src/pages/HomePage.jsx        — All Home layout, grouping, ordering, badge wording,
                                Action Needed section, Sessions grouping, Performance card,
                                View Poll deep-link, group name placement
src/pages/MemberDashboard.jsx — openPollIdRef + useEffect for View Poll deep-link
```

### Remaining next-session items

1. **Group-world screen polish** — Session screen, Polls screen, poll result deep-link QA
2. **Stats detailed screen** — QA and polish inside group world
3. **Record Match / Free Play** — screen polish
4. **Chat** — screen polish
5. **`match.type` vs `match.match_type`** — verify Stats doubles/singles breakdown (read `MatchesPage.jsx:209`)
6. **Add Guest** — RPC verification when ready; no production SQL without approval
7. **Full V1 manual QA** — required before any merge/deploy
8. **Merge decision** — merge `feature/shuttley-app-feel-upgrade` → `develop` only after QA passes

**V2 not started. Do not start V2 until V1 app-feel is merged or cleanly parked.**

---

---

## 1. Branch / Commit

| Field | Value |
|---|---|
| **Branch** | `feature/shuttley-app-feel-upgrade` |
| **Base** | `develop` |
| **Build status** | ✅ Passes — `npm run build` clean, 111 modules |
| **Commits ahead of remote** | 18 (at closeout) |
| **Push status** | Pushed at closeout |
| **Merged to main** | ❌ No |
| **Deployed to production** | ❌ No |

---

## 2. Navigation Model (Final Agreed)

### Main Dashboard (`/`)
- No BottomNav
- Top-right **profile icon** → `/profile`
- Header greeting: `Good morning/afternoon/evening, {firstName}`
- My Groups cards → enter group world at `?tab=session`

### Group World
- **GroupNav**: `Home | Stats | Session | Polls | Chat | More`
- **Home** tab → exits group world, navigates to `/`
- **Stats** tab → `/club/:clubId/matches?tab=stats` (detailed player stats)
- Session / Polls / Chat / More → group-scoped routes

### Profile Page (`/profile`)
- No BottomNav
- `← Home` back button in topnav

### All Groups Page (OnboardingPage, `/groups`)
- No BottomNav
- `← Home` back button in topnav
- Title: "All Groups"

---

## 3. Main Dashboard Section Order (Final — as implemented 2026-06-26)

```
Good morning/afternoon/evening, {firstName}   [profile icon top-right]

── Action Needed (if any) ──────────────────────────────────
  Polls card: unanswered polls with inline response buttons
  Alerts card: match-needs-attention + pending member approvals (mod only)

── Sessions (if any) ───────────────────────────────────────
  Single grouped card — all clubs alphabetically
  Active session first per club, then upcoming poll rows

── My Performance ──────────────────────────────────────────
  Period filter inside card: 15d | 30d | 60d | All
  Overall W/L/% (expandable → per-group breakdown inside same card)

── My Groups ───────────────────────────────────────────────
  Up to 5 groups, tap → group world at ?tab=session
  "N open polls" badge per group
  No "View all →" link on Home
```

**Key rule:** If a club has an active session, ALL session polls for that club are suppressed from both Sessions upcoming rows and Action Needed sections. They show only under the teal Session in Progress block.

---

## 4. Implemented Work (Confirmed in Code)

| Item | Status | Notes |
|---|---|---|
| Two-world navigation model | ✅ Implemented | Main dashboard + group world |
| Main dashboard — no BottomNav | ✅ Implemented | Removed |
| Profile icon top-right on Home | ✅ Implemented | SVG icon, navigates to /profile |
| Profile page ← Home back button | ✅ Implemented | ProfilePage.jsx |
| All Groups page ← Home back button | ✅ Implemented | OnboardingPage.jsx + "All Groups" title |
| GroupNav: Home \| Stats \| Session \| Polls \| Chat \| More | ✅ Implemented | GroupNav.jsx |
| GroupNav Home tab → `/` | ✅ Implemented | Exits group world |
| GroupNav Stats tab → `?tab=stats` | ✅ Implemented | Detailed player stats, was `?tab=leaderboard` |
| My Groups shortcut section on Home | ✅ Implemented | Up to 5, with poll count badge |
| Session in Progress card on Home | ✅ Implemented | Accent card, "Open Current Session →" |
| Upcoming Sessions section on Home | ✅ Implemented | Yes-polled sessions without active session |
| Poll response buttons inline on Home | ✅ Implemented | Yes/No/Maybe inline |
| Custom poll options on Home | ✅ Implemented | Compact flex-wrap buttons |
| My Performance section on Home | ✅ Implemented | Period filter, expand per group |
| Home section order (Performance→Groups→Session→Upcoming→Polls→Alerts) | ✅ Implemented | JSX reordered |
| Active session deduplication fix | ✅ Implemented | `notLive` suppresses ALL session polls for clubs with live sessions |
| Match-needs-attention alerts on Home | ✅ Implemented | Two-step query (match_players IDs → matches direct query) |
| Match alert navigates to group Session tab | ✅ Implemented | `/club/:clubId/mod?tab=session` or `member?tab=session` |
| Stats detailed view (`?tab=stats`) | ✅ Implemented | Full MatchesPage stats: player selector, summary, metrics, form, monthly, relationships, H2H |
| Stats counts pending+confirmed matches | ✅ Implemented | `status = 'confirmed' OR 'pending'` |
| Start Session from Poll → modal step 1 | ✅ Implemented | ModeratorDashboard: setModalStep(1) not skipping to step 2 |
| Custom poll display in dashboards | ✅ Implemented | Handles null session_date → "Custom poll" label |
| "Open Current Session →" wording | ✅ Implemented | MemberDashboard button label |
| "Group chat" wording | ✅ Implemented | "Club chat" → "Group chat" in MemberDashboard tile |
| RecordMatch isMod fallback detection | ✅ Implemented | Detects moderator role if not passed via state |
| Pinch-to-zoom disable | ✅ Implemented | From earlier in session |
| `.env.example` placeholder file | ✅ Added | All placeholder values, no real secrets |
| Add Guest fallback (no RPC) | ✅ Implemented | Graceful fallback if `create_guest_profile` RPC missing |

---

## 5. Known Open Issues

| # | Issue | Status | Notes |
|---|---|---|---|
| 1 | Add Guest — `create_guest_profile` Supabase RPC | ⚠️ Unverified | Fallback in code; real RPC may not exist in DB. Manual QA required. |
| 2 | Active session duplicate in Upcoming Sessions | ✅ Fixed in code | `notLive` filter now suppresses club-wide. **Manual QA not done.** |
| 3 | Match-needs-attention on Home | ✅ Fixed in code | Two-step query. **Manual QA not done.** |
| 4 | Stats detailed view | ✅ Fixed in code | GroupNav → `?tab=stats`. **Manual QA not done.** |
| 5 | Custom poll button layout | ✅ Fixed in code | `flexWrap: 'wrap'` compact buttons. **Manual QA not done.** |
| 6 | `match.type` vs `match.match_type` in Stats doubles breakdown | ⚠️ Unverified | If DB column is `match_type`, doubles/singles stats show 0. Read MatchesPage.jsx:209. |
| 7 | Manual QA | ❌ NOT DONE | Full device/browser QA required before considering merge |

---

## 6. Manual QA Status

**Manual QA: NOT DONE — required before merge**

### Checklist

```
[ ] Main dashboard loads
[ ] No bottom nav on main dashboard
[ ] Profile icon (top-right) opens /profile
[ ] My Groups enters group world at ?tab=session
[ ] Group nav is Home | Stats | Session | Polls | Chat | More
[ ] Home tab in group nav exits to main dashboard
[ ] Session in Progress card appears when active session exists
[ ] Session in Progress does NOT duplicate under Upcoming Sessions
[ ] Session in Progress does NOT duplicate under Polls
[ ] Upcoming Sessions shows future sessions user said Yes to
[ ] Start Session from Poll opens full modal (step 1, not player selection)
[ ] Open Current Session → works
[ ] Poll Yes/No/Maybe buttons work inline on Home
[ ] Custom poll compact buttons work (flex-wrap row)
[ ] Custom poll saves response and disappears from Home
[ ] My Performance section loads and period filter works
[ ] My Performance expand/collapse per-group breakdown works
[ ] My Groups "View all →" goes to /groups
[ ] Alerts section shows match-needs-attention when pending match exists
[ ] Tapping match alert navigates to group Session screen
[ ] Pending approval alert shows for moderators
[ ] Profile page has ← Home back button (no bottom nav)
[ ] All Groups page has ← Home back button and "All Groups" title
[ ] Enter group world → tap Stats → detailed stats screen loads
[ ] Stats tab is active (highlighted) in group nav
[ ] Stats player selector auto-selects current user
[ ] Stats summary card shows correctly
[ ] Stats metric cards show (streak, pts/game, last 30, best win)
[ ] Stats match type section shows
[ ] Stats score DNA shows
[ ] Stats recent form W/L bubbles show
[ ] Stats monthly activity bars show
[ ] Stats relationships section shows
[ ] Stats all partners section shows
[ ] Stats head-to-head section shows
[ ] Stats does NOT incorrectly show "no matches" when matches exist
[ ] Chat works
[ ] More works
[ ] Free Play works
[ ] Record Match works
[ ] Add Guest — test graceful behaviour (RPC may not exist)
[ ] Build passes: npm run build
```

---

## 7. Production Safety Status

```
Branch:       feature/shuttley-app-feel-upgrade
Merged:       NOT merged to main
Deployed:     NOT deployed
Production:   UNTOUCHED
Supabase:     UNTOUCHED (schema, RLS, functions, policies unchanged)
V2:           NOT started
iOS/native:   UNTOUCHED
Push backend: UNTOUCHED
Auth:         UNTOUCHED
```

---

## 8. Files Changed in This Session

```
src/pages/HomePage.jsx         — Major: section order, notLive filter, two-step match
                                 alert query, custom poll layout, profile icon,
                                 no BottomNav
src/components/GroupNav.jsx    — Stats tab: ?tab=leaderboard → ?tab=stats
                                 Home tab: navigate('/groups') → navigate('/')
src/pages/ProfilePage.jsx      — Remove BottomNav, add ← Home back button
src/pages/OnboardingPage.jsx   — Remove BottomNav, add ← Home + "All Groups" title
src/pages/MemberDashboard.jsx  — "Open Current Session →" label, custom poll label,
                                 "Group chat" wording
src/pages/ModeratorDashboard.jsx — Start from Poll → setModalStep(1),
                                   custom poll label for null session_date
src/pages/RecordMatch.jsx      — isMod state + fallback detection on load
.env.example                   — New: placeholder values only
```

---

## 9. Recommended Next Step

1. **Run full manual QA** on `feature/shuttley-app-feel-upgrade` in a real browser or on-device against the dev Supabase project.
2. **Verify match-needs-attention** appears on Home when a pending match exists.
3. **Verify active session** does not appear under Upcoming Sessions.
4. **Verify Stats** detailed screen loads when tapping Stats in group nav.
5. **Verify Add Guest** either works (RPC exists) or shows a clean fallback.
6. **Fix `match.type` vs `match.match_type`** if doubles/singles breakdown shows 0. Read `MatchesPage.jsx:209` — if DB column is `match_type`, change `match.type` → `match.match_type` in `getPlayerStats` and `calcPartnerships`.
7. Once QA passes, decide: **merge V1 app-feel to `develop`** (not main directly) or park it and plan V2.

---

## 10. Key Internal Name Reminders

- DB/internal: `clubs`, `club_id`, `/club/:clubId/`
- User-facing: **Groups**, **Moderator** (never "Clubs", "Admin")
- CSS: `--bg2`, `--accent: #256575`, `--text3`, `--radius`, `--radius-sm`

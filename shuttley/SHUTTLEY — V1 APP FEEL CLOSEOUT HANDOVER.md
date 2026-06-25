# Shuttley — V1 App Feel Closeout Handover

> Last updated: 2026-06-25
> Session: V1 app-feel upgrade session (multi-day, closed out)

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

## 3. Main Dashboard Section Order (Final)

```
Good morning/afternoon/evening, {firstName}   [profile icon top-right]

── My Performance ──────────────────────────────────────────
Period filter: 15d | 30d | 60d | All
Overall W/L/% (expandable → per-group breakdown)

── My Groups ───────────────────────────────────────────────
Up to 5 groups, tap → group world at ?tab=session
Open poll count badge per group
"View all →" → /groups

── Session in Progress (if any) ────────────────────────────
Accent card per active session
"Open Current Session →" button

── Upcoming Sessions (if any) ──────────────────────────────
Session polls where user answered Yes AND club has no active session
Mod: "▶ Start Session from this Poll" → opens Start Session modal at step 1
Member: "View Poll →"

── Polls Needing Your Response (if any) ─────────────────────
Unanswered session polls (where club has no active session)
Unanswered custom polls
Yes/No/Maybe inline buttons for session polls
Compact flex-wrap buttons for custom poll options

── Alerts Needing Attention (if any) ────────────────────────
Match-needs-attention (pending confirmation, not recorded by me) — per group
Pending membership approvals (mod only)
```

**Key rule:** If a club has an active session, ALL session polls for that club are suppressed from both Upcoming Sessions and Polls sections. They show only under Session in Progress.

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

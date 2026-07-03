# Shuttley V2 Planning Prep

Date: 2026-06-30
Branch: `docs/shuttley-v2-planning`
Base: current `main` (`03a800c`)
Status: planning only. No code, SQL, Supabase, Vercel, or deployment changes.

## Scope Boundary

V2 is the groups/venues architecture track described in
`SHUTTLEY-V2-ARCHITECTURE.md`.

In scope for V2 planning:
- Rename the current social-club model into a clearer Group model.
- Add Venues as a separate first-class model for real locations, courts,
  availability, pricing, staff, and bookings.
- Design a safe additive dev-only schema path before any SQL is run.
- Design RLS around helper functions from the start.

Out of scope for V2 planning:
- V1 polish Phase 3/4 cleanup.
- Production Supabase changes.
- Vercel settings changes.
- Production deploys.
- Payment implementation.
- App Store / Play Store release changes.

## Current V1 Touchpoints

The current app still uses `/club/:clubId` routes and `club_id` database
foreign keys throughout. V2 will need a compatibility or rename strategy for
both route naming and data access.

High-impact routes:
- `/groups` -> `OnboardingPage.jsx`
- `/join/:inviteCode` -> `JoinClub.jsx`
- `/club/:clubId` -> `ClubPage.jsx`
- `/club/:clubId/member` -> `MemberDashboard.jsx`
- `/club/:clubId/mod` -> `ModeratorDashboard.jsx`
- `/club/:clubId/matches` -> `MatchesPage.jsx`
- `/club/:clubId/record` -> `RecordMatch.jsx`
- `/club/:clubId/session/:sessionId` -> `SessionSummary.jsx`
- `/club/:clubId/session/:sessionId/rotation` -> `RotationPage.jsx`
- `/club/:clubId/splits` -> `SplitsPage.jsx`
- `/club/:clubId/chat` -> `ChatPage.jsx`

High-impact shared UI:
- `GroupWorldHeader.jsx`
- `GroupNav.jsx`
- `BottomNav.jsx`
- `CoachWidget.jsx`

High-impact server/API files:
- `api/admin-data.js`
- `api/coach.js`
- `api/delete-user.js`
- `api/deletion-requests.js`
- `api/send-push.js`

## V1 Tables To Map

Direct group-side mapping candidates:

| V1 table | V2 planning name | Risk |
|---|---|---|
| `clubs` | `groups` | Core identity, invite links, discovery RLS. |
| `memberships` | `group_members` | Role/status model and recursive RLS risk. |
| `sessions` | `group_sessions` | Active session flows, history, rotation links. |
| `matches` | `group_matches` | Stats, confirmations, disputes, `type`/`match_type` compatibility. |
| `match_players` | `group_match_players` | Cross-table RLS with matches. |
| `rotation_matches` | `group_rotation_matches` | Auto Schedule correctness. |
| `session_polls` | `group_polls` | Attendance and home dashboard. |
| `poll_responses` | `group_poll_responses` | Attendance response joins. |
| `club_features` | `group_features` | Splits/chat feature gates. |
| `splits_expenses` | `group_splits_expenses` | Shared costs and storage paths. |
| `splits_participants` | `group_splits_participants` | Expense participant joins. |
| `chat_conversations` | `group_chat_conversations` | All-members chat and DMs. |
| `chat_members` | `group_chat_members` | Conversation membership. |
| `chat_messages` | `group_chat_messages` | Sender cleanup and push notifications. |
| `match_edit_log` | `group_match_edit_log` | Audit history for edited matches. |
| `account_deletion_requests` | keep global | User/account lifecycle, not group-scoped. |
| `profiles` | keep global | One row per auth user. |
| `push_subscriptions` | keep global | Web push tokens. |
| `apns_tokens` | keep global | Native iOS push tokens. |
| `coach_memory` | keep global | Coach context by user. |
| `app_settings` | keep global | Platform settings. |

## Additive Schema Draft For Review

Do not run this as SQL yet. This is the intended table shape to review first.

Group-side tables should be added alongside V1 tables in shuttley-dev:
- `groups`
- `group_members`
- `group_sessions`
- `group_matches`
- `group_match_players`
- `group_rotation_matches`
- `group_polls`
- `group_poll_responses`
- `group_features`
- `group_splits_expenses`
- `group_splits_participants`
- `group_chat_conversations`
- `group_chat_members`
- `group_chat_messages`
- `group_match_edit_log`

Venue-side tables should be new and initially empty:
- `venues`
- `venue_staff`
- `group_venues`
- `courts`
- `court_pricing`
- `court_availability`
- `bookings`
- `user_venue_preferences`

Copy-migration principle:
- Copy, do not move.
- Keep V1 tables intact.
- Reuse IDs where possible, especially `groups.id = clubs.id`.
- Keep invite codes stable.
- Validate row counts before app work depends on copied tables.

## RLS Risk Plan

Known V1 lessons to carry into V2:
- Avoid direct self-referencing policies on membership tables.
- Avoid cyclic policies between match tables and match-player tables.
- Use `SECURITY DEFINER` helpers such as:
  - `is_approved_group_member(group_id)`
  - `is_group_moderator(group_id)`
  - `is_group_owner(group_id)`
  - `is_venue_staff(venue_id)`
  - `is_venue_manager(venue_id)`
  - `is_platform_admin()`
- Design group discovery intentionally. Non-members should not get broad
  `groups` SELECT access just to preview a join link.
- Design venue discovery differently from group discovery. Public venues are
  meant to be discoverable by authenticated users.

## Dev/Staging Safety Checklist

Before first V2 SQL attempt on shuttley-dev:
- Confirm branch is not `main`.
- Confirm Supabase target is `ecdibuhrgdmsdvovmlvl`.
- Snapshot or export the shuttley-dev schema.
- Record current shuttley-dev table list and row counts.
- Review additive schema diff.
- Review rollback plan for dev-only tables.

Before any V2 deploy:
- Confirm deployment target is the `shuttley-dev` Vercel project only.
- Confirm bundle uses shuttley-dev Supabase env vars.
- Confirm no production Vercel project settings changed.
- Confirm no production Supabase SQL has run.

Before any future production discussion:
- Produce a separate production migration plan.
- Decide maintenance-window vs dual-write cutover.
- Define old-table retention period.
- Define rollback trigger and owner.
- Confirm App Store / Play Store timing does not overlap with risky cutover.

## First Review Questions

1. Should V2 keep `/club/:clubId` routes during a transition, or introduce
   `/group/:groupId` routes immediately?
2. Should the initial V2 app read from copied `group_*` tables, or should it
   keep V1 reads and introduce venue features separately first?
3. Should group ownership become a distinct role, or keep today's multiple
   moderator model?
4. Should venue listings require platform approval before public discovery?
5. Are bookings payment-free in the first V2 cut?
6. Should rankings remain computed client-side for V2's first pass?

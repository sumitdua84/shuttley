# Shuttley V2 Architecture — Groups & Venues

**Status: planning only. No schema or code has been implemented from this
document. Do not build against this until Sumit explicitly approves it.**

This document was first drafted on `docs/shuttley-v2-architecture-planning`
before the V1 production release completed. It has now been carried forward
onto `docs/shuttley-v2-planning`, branched from current production `main`
after V1 went live. Keep planning separate from the future implementation
branch (`feature/shuttley-v2-group-venue-architecture`) so architecture work
does not mix with V1 hotfixes or V2 code.

---

## 1. Current production model

Shuttley today is a single-tenant-per-club model. The live schema
(confirmed via `pg_policies` against `shuttley-dev`, which mirrors
production's table shapes) is:

| Table | Purpose |
|---|---|
| `clubs` | The top-level entity. Has `name`, `description`, `created_by`, `invite_code`. |
| `memberships` | Join table: `user_id` × `club_id`, with `role` (`member`/`moderator`/`admin`) and `status` (`pending`/`approved`/`rejected`), `joined_at`. |
| `profiles` | One row per `auth.users` row — `full_name`, `avatar_url`, `coach_enabled`. |
| `sessions` | A playing session within a club — `started_at`, `ended_at`, `status`, `match_type`, `rotation_player_ids`. |
| `matches` | A single match — scores, `status` (`pending`/`confirmed`/`disputed`), `winner_side`, `recorded_by`. |
| `match_players` | Join table: which profiles played which side of a match. |
| `rotation_matches` | Auto-generated round-robin schedule entries tied to a session. |
| `session_polls` / `poll_responses` | "Are you coming?" polls per session. |
| `club_features` | Per-club feature flags (`splits`, `chat`), with `unlocked` (super-admin) and `enabled` (moderator) flags. |
| `splits_expenses` / `splits_participants` | Shared-cost tracking (e.g. court hire) within a club. |
| `chat_conversations` / `chat_members` / `chat_messages` | Club chat. |
| `account_deletion_requests`, `match_edit_log` | Admin/audit tables. |

Everything — sessions, matches, polls, rankings, chat, splits — is scoped
to a `club_id`. There is no concept of a physical venue, court, or
booking anywhere in the schema. "Creating a club" today really means
"creating a social circle of people who play together," not "registering
a real badminton venue."

## 2. Why current "clubs" are actually groups

The product has organically grown around one entity (`clubs`) carrying
two distinct real-world concepts that happen to coincide for most
existing users:

- **A social group** of people who play together regularly — this is
  what `clubs`/`memberships`/`sessions`/`matches`/`polls`/`chat`/`splits`
  actually model today, and it's working well.
- **A venue** — an actual badminton facility with courts, pricing, and
  availability — which the schema has no representation of at all.
  Today, if a group plays at "Riverside Badminton Centre," that's just
  free text the group might mention in chat or a session name; the app
  has no idea such a place exists, what courts it has, or whether it's
  free Tuesday at 7pm.

This conflation is fine for the current feature set (record matches,
rank players, chat, split costs) but blocks the next obvious thing users
will want: **finding and booking a court**. That requires venues to be a
first-class concept, decoupled from social groups, because:
- The same venue is played at by many unrelated groups.
- The same group sometimes plays at different venues (casual rotation
  between courts).
- Venue staff need to manage courts/pricing/availability without being
  a "member" of every social group that happens to book there.

## 3. Future Groups vs Venues model

```
                 ┌──────────────┐
                 │    Venues    │  (real courts, owned/managed by venue staff)
                 └──────┬───────┘
                        │ 0..N
                 ┌──────┴───────┐
                 │ Group-Venue   │  (which groups play at which venues)
                 │    Links      │
                 └──────┬───────┘
                        │ 0..N
                 ┌──────┴───────┐
                 │    Groups     │  (today's "clubs" — social circles)
                 └──────┬────────┘
                        │
        sessions, matches, polls, rankings, chat, splits
                 (all currently club-scoped, unchanged in shape)
```

- A **Group** is exactly what a `club` is today: a social circle with
  members, sessions, matches, rankings, chat, polls, splits.
- A **Venue** is a real place: courts, pricing, availability, bookings,
  managed by venue staff independent of any group.
- A **Group ↔ Venue link** says "this group regularly/sometimes plays
  here" — zero, one, or many per group, and a venue can be linked to many
  groups. This is purely a discovery/convenience relationship, not an
  access-control one — a venue link doesn't give the group's members any
  special rights over the venue's courts beyond what any user has
  (search availability, book).
- The **player app** experience stays group-first (your dashboard is
  still "your groups, your matches"), with venue search/booking as a new,
  separate surface that can optionally be entered from a group's screen
  ("find a place for us to play") or independently.

## 4. Proposed database schema

**Group side — directly renamed/ported from current tables, no shape
changes intended:**

| New table | Maps from | Notes |
|---|---|---|
| `groups` | `clubs` | Same columns; `invite_code` stays for group invites. |
| `group_members` | `memberships` | Same columns and role/status model. |
| `group_sessions` | `sessions` | Same columns, FK renamed to `group_id`. |
| `group_matches` | `matches` | Same columns, FK renamed to `group_id`. |
| `group_polls` | `session_polls` | Same columns, FK renamed to `group_id`. |
| `group_attendance` | new — currently there's no explicit attendance table; `poll_responses` + match participation imply it. Worth deciding during design whether this becomes a real table or stays implicit. |
| `group_rankings` | new — currently computed client-side from `matches` on every dashboard load (see `MemberDashboard.jsx`/`ModeratorDashboard.jsx` `fetchData()`). Could stay computed, or become a materialized table if computation cost becomes a problem. Not a blocking decision for V2's first cut. |

`match_players`, `rotation_matches`, `chat_*`, `splits_*`,
`club_features` → `group_features`, etc. all follow the same rename
pattern, FK renamed from `club_id` to `group_id`.

**Venue side — entirely new:**

| Table | Purpose |
|---|---|
| `venues` | A real location: name, address, geo (lat/lng for search), contact info, public/unlisted flag. |
| `venue_staff` | Join table: `user_id` × `venue_id` × role (see role model below). |
| `group_venues` | Join table: `group_id` × `venue_id` — "this group plays here." Purely informational/discovery, not access-control. |
| `courts` | A bookable unit within a venue — name/number, surface type, indoor/outdoor. |
| `court_pricing` | Price per court, by time-of-day/day-of-week tiers (peak/off-peak), effective date ranges. |
| `court_availability` | Either explicit open/blocked slots, or a recurring weekly template + exceptions (holidays, maintenance) — exact model is a design decision for the v2 build phase, not this doc. |
| `bookings` | A user's reservation of a court for a time slot — `user_id`, `court_id`, start/end time, status (pending/confirmed/cancelled), payment reference if/when payments are added. |
| `user_venue_preferences` | Favourited/recently-used venues per user, for search ranking — not access-control. |

## 5. Proposed RLS model

**Group data** (mirrors today's model, just renamed):
- Group members/moderators/owners can read their group's sessions,
  matches, polls, rankings, chat, member list.
- Same approved-membership-required pattern as today, but using
  `SECURITY DEFINER` helper functions from the start (e.g.
  `is_approved_group_member(group_id)`, `is_group_moderator(group_id)`)
  instead of direct self-joins — the recursive-policy bug found and
  fixed on `shuttley-dev` this session (see `ISSUES.md` on
  `feature/shuttley-app-feel-upgrade`) should inform V2's design from day
  one rather than being retrofitted later.
- **Open design question, carried from the app-feel branch's findings:**
  group discovery (search-to-join, invite links) needs *some* path for a
  non-member to read minimal group info (name, description, moderator
  name) before joining. The current production model doesn't have this
  either — worth deciding deliberately in V2 rather than inheriting the
  gap, e.g. a narrow `SECURITY DEFINER` RPC like
  `get_group_preview(invite_code)` that returns only the public preview
  fields, never general SELECT access to the table.

**Venue data:**
- Venue owners/managers can manage (read/write) their venue's courts,
  pricing, and availability.
- Venue staff (a lower tier) can read/write availability and bookings,
  but not pricing or ownership changes.
- **Public venue data** (name, address, court count, public availability)
  should be readable by any authenticated user, by design — this is the
  discovery surface the whole venue side exists for. This is explicitly
  *not* the same mistake as the groups-discovery gap: venues are meant to
  be found by strangers; groups are meant to be private to their members.

**Bookings:**
- A user can read/manage their own bookings.
- Venue staff can read/manage bookings for their venue (to handle
  cancellations, no-shows, walk-ins).
- `platform_admin` can read/manage everything, for support and disputes.

## 6. Proposed role model

**Group roles** (renamed from today's `memberships.role`):
- `group_owner` — today's "moderator" who created the group (currently
  conflated with `moderator`; V2 should decide whether to keep a single
  owner or allow multiple, given `memberships` today already supports
  multiple `moderator` rows per club).
- `group_moderator` — today's `moderator`/`admin` role values.
- `group_member` — today's `member`.

**Venue roles** (new):
- `venue_owner` — full control of the venue record, staff, pricing.
- `venue_manager` — can manage courts/pricing/availability, can't remove
  the owner or delete the venue.
- `venue_staff` — can manage day-to-day availability and bookings only.

**Platform role** (new):
- `platform_admin` — today's `SUPER_ADMINS` hardcoded email allowlist in
  `AdminDashboard.jsx`/`ModeratorDashboard.jsx`. V2 should turn this into
  a real role (table or claim) rather than a hardcoded array, since the
  surface area (venues, cross-group disputes) is growing.

## 7. Migration plan (design only — not run anywhere yet)

Conceptual mapping:

```
clubs                  → groups                  (rename + copy)
memberships            → group_members            (rename + copy, FK rename)
sessions               → group_sessions            (rename + copy, FK rename)
matches                → group_matches              (rename + copy, FK rename)
match_players          → group_match_players         (rename + copy, FK rename)
session_polls          → group_polls                  (rename + copy, FK rename)
poll_responses         → group_poll_responses          (rename + copy, FK rename)
rotation_matches       → group_rotation_matches         (rename + copy, FK rename)
club_features          → group_features                  (rename + copy, FK rename)
chat_*, splits_*       → group_chat_*, group_splits_*      (rename + copy, FK rename)
(new, empty at migration time) → venues, venue_staff, group_venues,
                                   courts, court_pricing,
                                   court_availability, bookings,
                                   user_venue_preferences
```

Suggested approach once this doc is approved and a v2 branch starts:
1. Write the new tables in `shuttley-dev` alongside the old ones (additive,
   nothing dropped) — this can be developed and tested with synthetic
   dev data with zero risk, independent of any production timeline.
2. Write a migration script that **copies** (not moves) old → new tables,
   so the old tables remain fully intact and the live app keeps working
   off them untouched, while the new tables/app can be tested in parallel
   against the copied data.
3. Old `club_id` → new `group_id` mapping: since this is a copy (not an
   in-place rename), the simplest safe approach is to reuse the same
   UUIDs (`groups.id = clubs.id`) so existing `invite_code` links,
   deep-links, and any external references keep working without a
   lookup table.
4. Validate row counts, spot-check RLS access patterns, and run the full
   app flow against the copied data before ever touching production.
5. **Production migration itself is a separate, later decision** — not
   scheduled or scoped by this document. It would need its own plan for
   downtime/dual-write strategy, which depends heavily on how much the v2
   schema has diverged by the time it's ready.

## 8. Cutover plan (high-level, future)

Not scheduled. When the time comes, the likely shape is:
1. Build and fully validate v2 in dev/staging against copied,
   sanitised production-style data (Section 7).
2. Decide on a cutover strategy: a maintenance-window migration (simplest,
   some downtime) vs. a dual-write/backfill period (no downtime, more
   complex). This decision should wait until the schema is stable and
   App Store re-review status (see `feature/shuttley-app-feel-upgrade`'s
   `ISSUES.md`) is resolved, so two risky changes don't overlap.
3. Ship a v2-compatible app build, run the production migration during
   the chosen window, verify, then route production traffic to v2.
4. Keep the old tables intact for a defined retention period (e.g. 30
   days) post-cutover as a rollback safety net before any cleanup.

## 9. Rollback plan (high-level, future)

Because the migration approach in Section 7 is copy-based, not
destructive:
- **Pre-cutover:** trivial — the old tables and old app code are never
  touched, so "rollback" is just not switching over.
- **Post-cutover, before old-table retention period ends:** point the
  (already-deployed) app config/feature flag back at the v1 schema and
  redeploy; no data loss since v1 tables were never dropped.
- **Post-cutover, after retention period:** rollback becomes much harder
  (any v2-only activity — new bookings, new groups — has no v1
  equivalent to fall back to). This is the reason for keeping a generous
  retention window before any cleanup of the old tables.

## 10. Dev/staging build plan

1. This document → review/approval (current step).
2. On approval, create `feature/shuttley-v2-group-venue-architecture`
   off current `main` (not off `develop` or the old app-feel branch), because
   V1 is already live in production and `main` contains the production
   hotfixes and closeout docs.
3. Build the new tables in `shuttley-dev` only, additive — old tables
   untouched, old app code untouched, both continue working.
4. Build a minimal "groups" app surface first (rename-compatible with
   current functionality) before touching venues at all, so the riskiest,
   most-used part of the schema (sessions/matches/rankings) gets
   validated first against a smaller, well-understood change.
5. Add venues/courts/bookings as a second phase once groups-on-v2-schema
   is solid.
6. Write and test the copy-migration script (Section 7) against
   sanitised dev data throughout, not as an afterthought at the end.

## 11. Production freeze rules

- `main` and the live App Store build are not touched by any v2 work.
- No schema changes to the production Supabase project from this
  initiative, at any point, without explicit separate approval.
- No production data is copied, exported, or used as direct migration
  input without being sanitised first (see Section 7 — "sanitised
  production-style data").
- `feature/shuttley-app-feel-upgrade` and
  `feature/shuttley-v2-group-venue-architecture` remain separate branches
  with separate scopes — no cross-merging until each is independently
  reviewed and approved.

## 12. Risks

- **Scope size** — this is a genuine architectural expansion (venues,
  courts, bookings, pricing, multiple new role tiers), not a refactor.
  Treat it as a multi-phase project, not a sprint.
- **Group discovery RLS gap carries over** — the same "how does a
  non-member see enough of a group to join it" problem found on the
  current schema (Section 5) needs a deliberate answer in v2, or it'll
  just be inherited.
- **Rankings/attendance computation** — currently computed client-side
  on every dashboard load from raw match rows (see the `Promise.all`
  parallelization work on `feature/shuttley-app-feel-upgrade`). At v2
  scale (many groups, possibly many more matches per group via easier
  venue-driven play), this may need to become a materialized/cached
  computation. Not urgent for the first v2 cut, but worth flagging now so
  it's not a surprise later.
- **Two concurrent initiatives** — running app-feel polish and v2
  architecture planning at the same time on the same small codebase
  raises merge-conflict risk if they're not kept strictly separate, which
  is why the branch separation rule in Section 10 matters.
- **Booking/payments territory** — `bookings` and `court_pricing` edge
  toward needing real payment handling eventually (court fees). This
  document deliberately does not propose a payments model — that's a
  much bigger decision (PCI scope, refunds, disputes) that shouldn't be
  implied by a schema table name alone.
- **App Store re-review timing** — per `feature/shuttley-app-feel-upgrade`'s
  `ISSUES.md`, production has a pending Apple re-review with two open
  items (camera usage string, demo account). Any future v2 cutover
  planning should sequence around that, not in parallel with it.

## 13. Questions for Sumit

1. **Group ownership model:** should a group have exactly one
   `group_owner`, or keep today's model where multiple `moderator` rows
   can exist with no single "owner" distinguished? This affects the
   `group_owner` vs `group_moderator` role split in Section 6.
2. **Venue listing model:** are venues self-registered by venue
   owners/managers (anyone can list their facility), curated/approved by
   Shuttley before going live, or both (self-register, then a
   `platform_admin` approval step)?
3. **Group-venue link purpose:** is `group_venues` purely informational
   ("we usually play here," shown on the group's profile), or should it
   ever grant the group anything extra (e.g. a recurring-booking
   priority, a group rate)? This doc assumed purely informational
   (Section 3) — confirm or correct.
4. **Booking/payment scope:** is payment collection for court bookings
   in scope for the *initial* v2 build, or should `bookings` /
   `court_pricing` be schema-only (no real payment flow) until a later,
   separately-scoped phase?
5. **Rankings/attendance as real tables vs. computed:** keep computing
   client-side as today (Section 4's `group_rankings` note), or invest in
   materialized tables from the start of v2?
6. **Discovery gap fix scope:** should the "how do non-members see a
   group preview" fix (Section 5) be designed once, for v2 only, or
   should the same fix also be considered for the *current* production
   schema in parallel (it affects today's search/invite-link flows too —
   see `feature/shuttley-app-feel-upgrade`'s `ISSUES.md` for where this
   was first found)?
7. **Timeline pressure:** is there a target date driving this (e.g. venue
   partnerships in progress), or is this purely exploratory until user
   growth on the current model justifies the investment?


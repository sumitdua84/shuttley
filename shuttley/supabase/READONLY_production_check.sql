-- ============================================================
-- READ-ONLY PRODUCTION CHECK — SAFE TO RUN
-- ============================================================
-- Purpose: check whether production has any of the same RLS/schema
-- gaps found and fixed on shuttley-dev while verifying
-- feature/shuttley-app-feel-upgrade. This script only reads metadata
-- (pg_policies, information_schema) — it contains no ALTER, UPDATE,
-- DELETE, INSERT, DROP, CREATE POLICY, or RLS-disabling statements of
-- any kind. Safe to run against production, but do not run unless
-- Sumit has explicitly approved it.
--
-- Run each block separately or all together; every statement is a
-- plain SELECT.

-- ------------------------------------------------------------
-- 1. clubs RLS policies
-- ------------------------------------------------------------
-- Checks for the createClub() race condition bug: does the clubs
-- SELECT policy let a creator read back their own just-inserted club
-- before a membership row exists (via created_by), or does it require
-- membership for any visibility?
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'clubs'
order by cmd;

-- ------------------------------------------------------------
-- 2. memberships RLS policies — recursion risk
-- ------------------------------------------------------------
-- shuttley-dev had FOUR self-referencing policies on memberships
-- (a SELECT policy querying memberships from within itself, plus
-- UPDATE/DELETE policies with the same pattern) causing
-- "infinite recursion detected in policy for relation memberships".
-- If production's qual text directly references "memberships" in a
-- subquery (rather than a SECURITY DEFINER function), it likely has
-- the same latent bug, even if it hasn't been triggered yet.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'memberships'
order by cmd;

-- ------------------------------------------------------------
-- 3. matches / match_players RLS policies — cross-table recursion risk
-- ------------------------------------------------------------
-- shuttley-dev hit "infinite recursion detected in policy for relation
-- matches" when confirming a match, caused by a two-table cycle:
-- matches' UPDATE policy checks match_players, and match_players'
-- SELECT policy checks matches+memberships. If production's
-- match_players SELECT policy inlines a join to matches (rather than
-- using a SECURITY DEFINER function), it may have the same risk.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('matches', 'match_players')
order by tablename, cmd;

-- ------------------------------------------------------------
-- 4. Helper functions — confirm none of these exist yet on production
-- ------------------------------------------------------------
-- These are the SECURITY DEFINER functions created on shuttley-dev to
-- fix the recursion issues above. If they already exist on production,
-- production was likely already patched for this; if not, and if
-- queries #2/#3 show inline self-referencing subqueries, production
-- may be vulnerable to the same recursion under the right conditions.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('is_approved_club_member', 'is_club_moderator', 'can_read_match');

-- ------------------------------------------------------------
-- 5. Column shape checks — sessions / matches / session_polls / match_edit_log
-- ------------------------------------------------------------
-- shuttley-dev had several column-name mismatches against what the
-- live app code expects (matches.created_by vs recorded_by,
-- matches.match_type vs type, sessions.created_by vs started_by,
-- missing session_polls.notes/session_time, missing
-- match_edit_log.edited_at). These were dev-clone drift, not expected
-- on production, but worth a quick visual diff against what the app
-- code in src/pages/*.jsx actually reads/writes.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('sessions', 'matches', 'session_polls', 'match_edit_log')
order by table_name, column_name;

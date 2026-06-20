-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY.
-- Do NOT run against production without Sumit reviewing first — see note
-- at the bottom, this is likely a production bug too.
--
-- Found while testing: confirming a match (MemberDashboard.jsx
-- confirmMatch()) fails with 42P17 "infinite recursion detected in
-- policy for relation matches". Root cause is a two-table RLS cycle:
--   - matches' "players_can_confirm_matches" UPDATE policy (from
--     fix_match_rls.sql) checks match_players via EXISTS
--   - match_players' "Members can read match_players" SELECT policy
--     checks matches via a JOIN to memberships
-- Postgres's RLS planner can hit infinite recursion on this kind of
-- mutual cross-table policy reference even though neither query is
-- actually unbounded. Same underlying issue as the memberships
-- recursion fixed earlier in this session, just between two different
-- tables. Fixed the same way: move the matches-membership check into a
-- SECURITY DEFINER function, which bypasses RLS internally and breaks
-- the cycle.

CREATE OR REPLACE FUNCTION public.can_read_match(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM matches m
    JOIN memberships mem ON mem.club_id = m.club_id
    WHERE m.id = p_match_id
      AND mem.user_id = auth.uid()
      AND mem.status = 'approved'
  );
$$;

DROP POLICY IF EXISTS "Members can read match_players" ON match_players;
DROP POLICY IF EXISTS "club_members_can_read_match_players" ON match_players;
CREATE POLICY "Members can read match_players" ON match_players
FOR SELECT TO authenticated
USING (public.can_read_match(match_id));

-- ============================================================
-- IMPORTANT — check production separately
-- ============================================================
-- This exact cross-table policy shape (match_players SELECT policy
-- joining matches+memberships, matches UPDATE policy checking
-- match_players) is the same structure described in
-- supabase/fix_match_rls.sql and supabase/fix_all_rls.sql, which are
-- presumably what's live in production too. If production has the same
-- shape, confirming a match there may hit this same recursion. Read-only
-- check (safe to run anywhere):
--   select policyname, qual from pg_policies
--   where schemaname = 'public' and tablename in ('matches', 'match_players');

-- Fix RLS policies for match confirmation flow
-- Run this in the Supabase SQL editor

-- ============================================================
-- MATCHES TABLE
-- ============================================================

-- Allow opposing team players to confirm or dispute pending matches
-- (any player in the match who did NOT record it)
DROP POLICY IF EXISTS "players_can_confirm_matches" ON matches;
CREATE POLICY "players_can_confirm_matches" ON matches
FOR UPDATE TO authenticated
USING (
  status = 'pending'
  AND recorded_by != auth.uid()
  AND EXISTS (
    SELECT 1 FROM match_players
    WHERE match_players.match_id = matches.id
    AND match_players.user_id = auth.uid()
  )
)
WITH CHECK (
  status IN ('confirmed', 'disputed')
);

-- Allow moderators to update any match in their club (for resolving disputes)
DROP POLICY IF EXISTS "moderators_can_update_matches" ON matches;
CREATE POLICY "moderators_can_update_matches" ON matches
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.club_id = matches.club_id
    AND memberships.user_id = auth.uid()
    AND memberships.role = 'moderator'
    AND memberships.status = 'approved'
  )
)
WITH CHECK (
  status IN ('confirmed', 'disputed', 'pending')
);

-- Allow moderators to delete matches (for voiding disputed matches)
DROP POLICY IF EXISTS "moderators_can_delete_matches" ON matches;
CREATE POLICY "moderators_can_delete_matches" ON matches
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.club_id = matches.club_id
    AND memberships.user_id = auth.uid()
    AND memberships.role = 'moderator'
    AND memberships.status = 'approved'
  )
);

-- ============================================================
-- MATCH_PLAYERS TABLE
-- ============================================================

-- Allow moderators to delete match_players rows (needed when voiding a match)
DROP POLICY IF EXISTS "moderators_can_delete_match_players" ON match_players;
CREATE POLICY "moderators_can_delete_match_players" ON match_players
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM matches m
    JOIN memberships mem ON mem.club_id = m.club_id
    WHERE m.id = match_players.match_id
    AND mem.user_id = auth.uid()
    AND mem.role = 'moderator'
    AND mem.status = 'approved'
  )
);

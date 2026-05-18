-- Comprehensive RLS fix — run this in the Supabase SQL editor
-- Allows club members to read all data within their shared clubs

-- ============================================================
-- PROFILES
-- ============================================================
DROP POLICY IF EXISTS "club_members_can_read_profiles" ON profiles;
CREATE POLICY "club_members_can_read_profiles" ON profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM memberships m1
    JOIN memberships m2 ON m1.club_id = m2.club_id
    WHERE m1.user_id = auth.uid()
      AND m2.user_id = profiles.id
      AND m1.status = 'approved'
      AND m2.status = 'approved'
  )
);

-- ============================================================
-- CLUBS
-- ============================================================
DROP POLICY IF EXISTS "club_members_can_read_clubs" ON clubs;
CREATE POLICY "club_members_can_read_clubs" ON clubs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.club_id = clubs.id
      AND memberships.user_id = auth.uid()
  )
);

-- ============================================================
-- MEMBERSHIPS
-- ============================================================
DROP POLICY IF EXISTS "club_members_can_read_memberships" ON memberships;
CREATE POLICY "club_members_can_read_memberships" ON memberships
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM memberships m2
    WHERE m2.club_id = memberships.club_id
      AND m2.user_id = auth.uid()
      AND m2.status = 'approved'
  )
);

-- ============================================================
-- MATCHES
-- ============================================================
DROP POLICY IF EXISTS "club_members_can_read_matches" ON matches;
CREATE POLICY "club_members_can_read_matches" ON matches
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.club_id = matches.club_id
      AND memberships.user_id = auth.uid()
      AND memberships.status = 'approved'
  )
);

-- ============================================================
-- MATCH_PLAYERS
-- ============================================================
DROP POLICY IF EXISTS "club_members_can_read_match_players" ON match_players;
CREATE POLICY "club_members_can_read_match_players" ON match_players
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM matches m
    JOIN memberships mem ON mem.club_id = m.club_id
    WHERE m.id = match_players.match_id
      AND mem.user_id = auth.uid()
      AND mem.status = 'approved'
  )
);

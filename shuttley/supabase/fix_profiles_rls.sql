-- Fix RLS policy so club members can read each other's profiles
-- Run this in the Supabase SQL editor

-- ============================================================
-- PROFILES TABLE
-- ============================================================

-- Allow users to read profiles of anyone in a shared club
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

-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY
-- (https://supabase.com/dashboard/project/ecdibuhrgdmsdvovmlvl/sql).
-- Do NOT run against production without Sumit reviewing first — see note
-- at the bottom, this may be a real production bug too, not just dev drift.
--
-- Bug found while testing feature/shuttley-app-feel-upgrade: creating a
-- club fails with 42501 "new row violates row-level security policy for
-- table clubs". Root cause is in src/pages/OnboardingPage.jsx createClub():
-- it does `.insert(club).select().single()` (insert, then immediately
-- read the row back), and only inserts the membership row on the next
-- line. At the moment of the read-back, the membership doesn't exist yet,
-- so the "Members can read clubs" SELECT policy (which requires an
-- existing membership row) denies it — even though the insert itself
-- succeeded under "Authenticated can create clubs".
--
-- Fix: let the creator see their own club immediately via created_by,
-- without waiting for the membership row.

DROP POLICY IF EXISTS "Members can read clubs" ON clubs;
CREATE POLICY "Members can read clubs" ON clubs
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.club_id = clubs.id
      AND memberships.user_id = auth.uid()
  )
);

-- ============================================================
-- IMPORTANT — check production separately
-- ============================================================
-- This same createClub() code is presumably already live in production.
-- If production's "clubs" SELECT policy has the same shape (no
-- created_by clause), club creation may be silently failing or relying
-- on a race condition there too. Worth running the read-only check below
-- against production (it's just a SELECT, no risk) before assuming
-- production is fine:
--   select policyname, qual from pg_policies
--   where schemaname = 'public' and tablename = 'clubs';

-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY
-- (https://supabase.com/dashboard/project/ecdibuhrgdmsdvovmlvl/sql).
-- Do NOT run against production.
--
-- Fixes two issues found while testing feature/shuttley-app-feel-upgrade
-- against shuttley-dev:
--   1. memberships.joined_at is missing (42703) — code orders by it.
--   2. "infinite recursion detected in policy for relation memberships"
--      (42P17) — the memberships SELECT policy (from fix_all_rls.sql)
--      queries memberships from within its own USING clause, which
--      Postgres can recurse into infinitely depending on plan. Fixed by
--      moving the self-check into a SECURITY DEFINER function, which
--      runs with RLS bypassed and breaks the recursive cycle.

-- ============================================================
-- 1. Missing column
-- ============================================================
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now() NOT NULL;

-- ============================================================
-- 2. Recursion-safe memberships SELECT policy
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_approved_club_member(p_club_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE club_id = p_club_id
      AND user_id = auth.uid()
      AND status = 'approved'
  );
$$;

DROP POLICY IF EXISTS "club_members_can_read_memberships" ON memberships;
CREATE POLICY "club_members_can_read_memberships" ON memberships
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_approved_club_member(club_id)
);

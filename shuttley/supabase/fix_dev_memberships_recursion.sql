-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY
-- (https://supabase.com/dashboard/project/ecdibuhrgdmsdvovmlvl/sql).
-- Do NOT run against production.
--
-- Fixes issues found while testing feature/shuttley-app-feel-upgrade
-- against shuttley-dev:
--   1. memberships.joined_at is missing (42703) — code orders by it.
--   2. "infinite recursion detected in policy for relation memberships"
--      (42P17). pg_policies showed FOUR separate policies on memberships
--      that each self-join the memberships table from within their own
--      USING clause: "Members can read memberships" (SELECT, duplicate
--      of/older than fix_all_rls.sql's "club_members_can_read_memberships"
--      — Postgres ORs all permissive SELECT policies together, so even
--      after the first fix attempt this older one kept recursing),
--      "Moderators can update memberships" (UPDATE), and
--      "Moderators can delete memberships" (DELETE). All three (plus the
--      one already fixed) are replaced below with SECURITY DEFINER
--      helper functions, which run with RLS bypassed and break the
--      recursive cycle.
--   This script is idempotent — safe to re-run in full, including the
--   parts already applied from the first version.

-- ============================================================
-- 1. Missing column
-- ============================================================
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now() NOT NULL;

-- ============================================================
-- 2. Helper functions (SECURITY DEFINER — bypass RLS internally,
--    so calling them from a memberships policy doesn't recurse)
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

CREATE OR REPLACE FUNCTION public.is_club_moderator(p_club_id uuid)
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
      AND role IN ('moderator', 'admin')
  );
$$;

-- ============================================================
-- 3. Drop every recursive policy found on memberships, then
--    recreate the SELECT/UPDATE/DELETE ones using the functions above.
--    ("Authenticated can join clubs" (INSERT) had no self-reference —
--    left untouched.)
-- ============================================================
DROP POLICY IF EXISTS "Members can read memberships" ON memberships;
DROP POLICY IF EXISTS "club_members_can_read_memberships" ON memberships;
CREATE POLICY "club_members_can_read_memberships" ON memberships
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_approved_club_member(club_id)
);

DROP POLICY IF EXISTS "Moderators can update memberships" ON memberships;
CREATE POLICY "Moderators can update memberships" ON memberships
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_club_moderator(club_id)
);

DROP POLICY IF EXISTS "Moderators can delete memberships" ON memberships;
CREATE POLICY "Moderators can delete memberships" ON memberships
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_club_moderator(club_id)
);

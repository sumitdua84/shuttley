-- Production RLS advisor repair for Supabase project wuvwvrgxbfcyhqsyoswd
-- Alert date: 2026-07-12, rls_disabled_in_public
--
-- Run in Supabase SQL Editor for the production shuttley project.
-- This script is idempotent: it enables RLS on known app-owned public tables,
-- installs conservative policies, and finishes with a verification query.

BEGIN;

-- Helper functions keep policy checks readable and avoid recursive RLS plans.
CREATE OR REPLACE FUNCTION public.is_approved_club_member(p_club_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
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
    SELECT 1
    FROM public.memberships
    WHERE club_id = p_club_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(auth.jwt() ->> 'email', '') IN (
    'sumit@shuttley.club',
    'sumitdua84@gmail.com'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_match(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = p_match_id
      AND public.is_approved_club_member(m.club_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_conversations c
    WHERE c.id = p_conversation_id
      AND public.is_approved_club_member(c.club_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.chat_members cm
    WHERE cm.conversation_id = p_conversation_id
      AND cm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_expense(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.splits_expenses e
    WHERE e.id = p_expense_id
      AND public.is_approved_club_member(e.club_id)
  );
$$;

-- Enable RLS on every public table the app uses directly. Storage buckets are
-- intentionally excluded; their access is controlled through Storage policies.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'account_deletion_requests',
    'apns_tokens',
    'app_settings',
    'chat_conversations',
    'chat_members',
    'chat_messages',
    'club_features',
    'clubs',
    'match_edit_log',
    'match_players',
    'matches',
    'memberships',
    'poll_responses',
    'profiles',
    'push_subscriptions',
    'rotation_matches',
    'session_polls',
    'sessions',
    'splits_expenses',
    'splits_participants'
  ] LOOP
    IF to_regclass('public.' || quote_ident(table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'super_admin_all_' || table_name, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
        'super_admin_all_' || table_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;

-- profiles
DROP POLICY IF EXISTS "profiles_select_member_visible" ON public.profiles;
CREATE POLICY "profiles_select_member_visible" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = profiles.id
      AND m.status = 'approved'
      AND public.is_approved_club_member(m.club_id)
  )
);

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

-- clubs: public SELECT preserves invite links and club search; writes are restricted.
DROP POLICY IF EXISTS "clubs_select_public" ON public.clubs;
CREATE POLICY "clubs_select_public" ON public.clubs
FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "clubs_insert_creator" ON public.clubs;
CREATE POLICY "clubs_insert_creator" ON public.clubs
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "clubs_update_moderator" ON public.clubs;
CREATE POLICY "clubs_update_moderator" ON public.clubs
FOR UPDATE TO authenticated
USING (public.is_club_moderator(id))
WITH CHECK (public.is_club_moderator(id));

DROP POLICY IF EXISTS "clubs_delete_moderator" ON public.clubs;
CREATE POLICY "clubs_delete_moderator" ON public.clubs
FOR DELETE TO authenticated
USING (public.is_club_moderator(id));

-- memberships
DROP POLICY IF EXISTS "memberships_select_member_visible" ON public.memberships;
CREATE POLICY "memberships_select_member_visible" ON public.memberships
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "memberships_insert_self" ON public.memberships;
CREATE POLICY "memberships_insert_self" ON public.memberships
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "memberships_update_self_or_moderator" ON public.memberships;
CREATE POLICY "memberships_update_self_or_moderator" ON public.memberships
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_club_moderator(club_id))
WITH CHECK (user_id = auth.uid() OR public.is_club_moderator(club_id));

DROP POLICY IF EXISTS "memberships_delete_self_or_moderator" ON public.memberships;
CREATE POLICY "memberships_delete_self_or_moderator" ON public.memberships
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_club_moderator(club_id));

-- club-scoped feature/config tables
DROP POLICY IF EXISTS "club_features_select_member" ON public.club_features;
CREATE POLICY "club_features_select_member" ON public.club_features
FOR SELECT TO authenticated
USING (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "club_features_write_moderator" ON public.club_features;
CREATE POLICY "club_features_write_moderator" ON public.club_features
FOR ALL TO authenticated
USING (public.is_club_moderator(club_id))
WITH CHECK (public.is_club_moderator(club_id));

-- sessions
DROP POLICY IF EXISTS "sessions_member_select" ON public.sessions;
CREATE POLICY "sessions_member_select" ON public.sessions
FOR SELECT TO authenticated
USING (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "sessions_member_insert" ON public.sessions;
CREATE POLICY "sessions_member_insert" ON public.sessions
FOR INSERT TO authenticated
WITH CHECK (public.is_approved_club_member(club_id) AND started_by = auth.uid());

DROP POLICY IF EXISTS "sessions_member_update" ON public.sessions;
CREATE POLICY "sessions_member_update" ON public.sessions
FOR UPDATE TO authenticated
USING (public.is_approved_club_member(club_id))
WITH CHECK (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "sessions_member_delete" ON public.sessions;
CREATE POLICY "sessions_member_delete" ON public.sessions
FOR DELETE TO authenticated
USING (public.is_approved_club_member(club_id));

-- matches and match players
DROP POLICY IF EXISTS "matches_member_select" ON public.matches;
CREATE POLICY "matches_member_select" ON public.matches
FOR SELECT TO authenticated
USING (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "matches_member_insert" ON public.matches;
CREATE POLICY "matches_member_insert" ON public.matches
FOR INSERT TO authenticated
WITH CHECK (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "matches_member_update" ON public.matches;
CREATE POLICY "matches_member_update" ON public.matches
FOR UPDATE TO authenticated
USING (public.is_approved_club_member(club_id))
WITH CHECK (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "matches_moderator_delete" ON public.matches;
CREATE POLICY "matches_moderator_delete" ON public.matches
FOR DELETE TO authenticated
USING (public.is_club_moderator(club_id));

DROP POLICY IF EXISTS "match_players_member_select" ON public.match_players;
CREATE POLICY "match_players_member_select" ON public.match_players
FOR SELECT TO authenticated
USING (public.can_read_match(match_id));

DROP POLICY IF EXISTS "match_players_member_insert" ON public.match_players;
CREATE POLICY "match_players_member_insert" ON public.match_players
FOR INSERT TO authenticated
WITH CHECK (public.can_read_match(match_id));

DROP POLICY IF EXISTS "match_players_member_delete" ON public.match_players;
CREATE POLICY "match_players_member_delete" ON public.match_players
FOR DELETE TO authenticated
USING (public.can_read_match(match_id));

DROP POLICY IF EXISTS "match_edit_log_member_select" ON public.match_edit_log;
CREATE POLICY "match_edit_log_member_select" ON public.match_edit_log
FOR SELECT TO authenticated
USING (public.can_read_match(match_id));

DROP POLICY IF EXISTS "match_edit_log_member_insert" ON public.match_edit_log;
CREATE POLICY "match_edit_log_member_insert" ON public.match_edit_log
FOR INSERT TO authenticated
WITH CHECK (public.can_read_match(match_id));

-- rotation
DROP POLICY IF EXISTS "rotation_matches_member_all" ON public.rotation_matches;
CREATE POLICY "rotation_matches_member_all" ON public.rotation_matches
FOR ALL TO authenticated
USING (public.is_approved_club_member(club_id))
WITH CHECK (public.is_approved_club_member(club_id));

-- polls
DROP POLICY IF EXISTS "session_polls_member_select" ON public.session_polls;
CREATE POLICY "session_polls_member_select" ON public.session_polls
FOR SELECT TO authenticated
USING (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "session_polls_member_insert" ON public.session_polls;
CREATE POLICY "session_polls_member_insert" ON public.session_polls
FOR INSERT TO authenticated
WITH CHECK (public.is_approved_club_member(club_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "session_polls_member_update" ON public.session_polls;
CREATE POLICY "session_polls_member_update" ON public.session_polls
FOR UPDATE TO authenticated
USING (public.is_approved_club_member(club_id))
WITH CHECK (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "session_polls_creator_delete" ON public.session_polls;
CREATE POLICY "session_polls_creator_delete" ON public.session_polls
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.is_club_moderator(club_id));

DROP POLICY IF EXISTS "poll_responses_member_select" ON public.poll_responses;
CREATE POLICY "poll_responses_member_select" ON public.poll_responses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.session_polls sp
    WHERE sp.id = poll_responses.poll_id
      AND public.is_approved_club_member(sp.club_id)
  )
);

DROP POLICY IF EXISTS "poll_responses_self_insert" ON public.poll_responses;
CREATE POLICY "poll_responses_self_insert" ON public.poll_responses
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.session_polls sp
    WHERE sp.id = poll_responses.poll_id
      AND public.is_approved_club_member(sp.club_id)
  )
);

DROP POLICY IF EXISTS "poll_responses_self_update" ON public.poll_responses;
CREATE POLICY "poll_responses_self_update" ON public.poll_responses
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- chat
DROP POLICY IF EXISTS "chat_conversations_member_select" ON public.chat_conversations;
CREATE POLICY "chat_conversations_member_select" ON public.chat_conversations
FOR SELECT TO authenticated
USING (public.is_approved_club_member(club_id) OR public.can_access_conversation(id));

DROP POLICY IF EXISTS "chat_conversations_member_insert" ON public.chat_conversations;
CREATE POLICY "chat_conversations_member_insert" ON public.chat_conversations
FOR INSERT TO authenticated
WITH CHECK (public.is_approved_club_member(club_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "chat_conversations_member_update" ON public.chat_conversations;
CREATE POLICY "chat_conversations_member_update" ON public.chat_conversations
FOR UPDATE TO authenticated
USING (public.is_approved_club_member(club_id))
WITH CHECK (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "chat_members_member_select" ON public.chat_members;
CREATE POLICY "chat_members_member_select" ON public.chat_members
FOR SELECT TO authenticated
USING (public.can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_members_member_insert" ON public.chat_members;
CREATE POLICY "chat_members_member_insert" ON public.chat_members
FOR INSERT TO authenticated
WITH CHECK (public.can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_members_self_or_moderator_delete" ON public.chat_members;
CREATE POLICY "chat_members_self_or_moderator_delete" ON public.chat_members
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_messages_member_select" ON public.chat_messages;
CREATE POLICY "chat_messages_member_select" ON public.chat_messages
FOR SELECT TO authenticated
USING (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "chat_messages_self_insert" ON public.chat_messages;
CREATE POLICY "chat_messages_self_insert" ON public.chat_messages
FOR INSERT TO authenticated
WITH CHECK (public.is_approved_club_member(club_id) AND sender_id = auth.uid());

DROP POLICY IF EXISTS "chat_messages_self_update" ON public.chat_messages;
CREATE POLICY "chat_messages_self_update" ON public.chat_messages
FOR UPDATE TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

-- splits
DROP POLICY IF EXISTS "splits_expenses_member_select" ON public.splits_expenses;
CREATE POLICY "splits_expenses_member_select" ON public.splits_expenses
FOR SELECT TO authenticated
USING (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "splits_expenses_member_insert" ON public.splits_expenses;
CREATE POLICY "splits_expenses_member_insert" ON public.splits_expenses
FOR INSERT TO authenticated
WITH CHECK (public.is_approved_club_member(club_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "splits_expenses_member_update" ON public.splits_expenses;
CREATE POLICY "splits_expenses_member_update" ON public.splits_expenses
FOR UPDATE TO authenticated
USING (public.is_approved_club_member(club_id))
WITH CHECK (public.is_approved_club_member(club_id));

DROP POLICY IF EXISTS "splits_participants_member_select" ON public.splits_participants;
CREATE POLICY "splits_participants_member_select" ON public.splits_participants
FOR SELECT TO authenticated
USING (public.can_access_expense(expense_id));

DROP POLICY IF EXISTS "splits_participants_member_insert" ON public.splits_participants;
CREATE POLICY "splits_participants_member_insert" ON public.splits_participants
FOR INSERT TO authenticated
WITH CHECK (public.can_access_expense(expense_id));

DROP POLICY IF EXISTS "splits_participants_member_delete" ON public.splits_participants;
CREATE POLICY "splits_participants_member_delete" ON public.splits_participants
FOR DELETE TO authenticated
USING (public.can_access_expense(expense_id));

-- user-owned notification and account tables
DROP POLICY IF EXISTS "push_subscriptions_owner_all" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_all" ON public.push_subscriptions
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "apns_tokens_owner_all" ON public.apns_tokens;
CREATE POLICY "apns_tokens_owner_all" ON public.apns_tokens
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "account_deletion_requests_owner_insert" ON public.account_deletion_requests;
CREATE POLICY "account_deletion_requests_owner_insert" ON public.account_deletion_requests
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "account_deletion_requests_owner_select" ON public.account_deletion_requests;
CREATE POLICY "account_deletion_requests_owner_select" ON public.account_deletion_requests
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- No client policies are added for app_settings. Service-role API routes can still read it.

COMMIT;

-- Verification: this should return zero rows for Shuttley app-owned public tables.
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname = ANY (ARRAY[
    'account_deletion_requests',
    'apns_tokens',
    'app_settings',
    'chat_conversations',
    'chat_members',
    'chat_messages',
    'club_features',
    'clubs',
    'match_edit_log',
    'match_players',
    'matches',
    'memberships',
    'poll_responses',
    'profiles',
    'push_subscriptions',
    'rotation_matches',
    'session_polls',
    'sessions',
    'splits_expenses',
    'splits_participants'
  ])
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- Sessions feature schema
-- Run in Supabase SQL Editor

-- 1. Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  started_by uuid REFERENCES profiles(id) NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'ended')) NOT NULL
);

-- 2. Add session_id to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES sessions(id);

-- 3. Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 4. Club members can read sessions
CREATE POLICY "club_members_can_read_sessions" ON sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.club_id = sessions.club_id
      AND memberships.user_id = auth.uid()
      AND memberships.status = 'approved'
  )
);

-- 5. Moderators can insert sessions
CREATE POLICY "moderators_can_insert_sessions" ON sessions
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.club_id = sessions.club_id
      AND memberships.user_id = auth.uid()
      AND memberships.role = 'moderator'
      AND memberships.status = 'approved'
  )
);

-- 6. Moderators can update sessions (to end them)
CREATE POLICY "moderators_can_update_sessions" ON sessions
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.club_id = sessions.club_id
      AND memberships.user_id = auth.uid()
      AND memberships.role = 'moderator'
      AND memberships.status = 'approved'
  )
);

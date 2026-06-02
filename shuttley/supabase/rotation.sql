-- Add rotation columns to sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS match_type text DEFAULT 'doubles',
  ADD COLUMN IF NOT EXISTS rotation_player_ids uuid[] DEFAULT '{}';

-- Rotation matches table: pre-generated schedule entries
CREATE TABLE IF NOT EXISTS rotation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id),
  p1 uuid NOT NULL REFERENCES profiles(id),
  p2 uuid REFERENCES profiles(id),          -- null for singles
  p3 uuid NOT NULL REFERENCES profiles(id),
  p4 uuid REFERENCES profiles(id),          -- null for singles
  seq integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',   -- pending | submitted | removed
  score1 integer,
  score2 integer,
  match_id uuid REFERENCES matches(id),     -- set when submitted
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rotation_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rotation_approved_members_all" ON rotation_matches
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM memberships
    WHERE club_id = rotation_matches.club_id
      AND user_id = auth.uid()
      AND status = 'approved'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM memberships
    WHERE club_id = rotation_matches.club_id
      AND user_id = auth.uid()
      AND status = 'approved'
  ));

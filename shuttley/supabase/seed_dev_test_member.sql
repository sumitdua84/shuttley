-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY.
-- Seeds a pending membership for the "Test Member" test account into
-- "App Feel Test Club", working around the club search / invite-link RLS
-- gap (see ISSUES.md) so app-feel verification can continue without
-- redesigning that flow. This is a one-off dev data seed, not a schema
-- or policy change.

INSERT INTO memberships (user_id, club_id, role, status)
SELECT
  (SELECT id FROM auth.users WHERE email = 'shuttley.testmember+devqa@gmail.com'),
  (SELECT id FROM clubs WHERE name = 'App Feel Test Club'),
  'member',
  'pending'
WHERE NOT EXISTS (
  SELECT 1 FROM memberships
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'shuttley.testmember+devqa@gmail.com')
    AND club_id = (SELECT id FROM clubs WHERE name = 'App Feel Test Club')
);

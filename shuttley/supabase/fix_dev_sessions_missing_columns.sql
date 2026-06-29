-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY.
-- Do NOT run against production.
--
-- CORRECTION to the earlier version of this script. That version added
-- a NEW `started_by` column when the table already had `created_by`
-- (same column, different name — same rename pattern as
-- matches.created_by -> recorded_by, fixed earlier in this session).
-- Having both created a second foreign key from sessions to profiles,
-- which broke any query embedding profiles on sessions with
-- "Could not embed because more than one relationship was found"
-- (PGRST201) — surfaced as "Session not found" on SessionSummary.jsx
-- after ending a session. No app code reads sessions.created_by
-- (confirmed via grep), so this is safe to collapse back to one column.
--
-- Also found while testing the session-end -> SessionSummary flow:
-- match_edit_log is missing `edited_at` (SessionSummary.jsx orders by
-- it after a match edit). edited_by exists; edited_at does not.

-- Undo the earlier mistake: drop the duplicate, rename the original.
ALTER TABLE sessions DROP COLUMN IF EXISTS started_by;
ALTER TABLE sessions RENAME COLUMN created_by TO started_by;

ALTER TABLE match_edit_log ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT now();

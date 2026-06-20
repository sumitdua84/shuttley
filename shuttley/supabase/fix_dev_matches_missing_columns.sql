-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY.
-- Do NOT run against production.
--
-- Correction: this isn't a missing-column problem, it's a renamed-column
-- one. information_schema.columns for shuttley-dev's matches table shows
-- created_by and match_type, but the live app code (RecordMatch.jsx,
-- RotationPage.jsx, MemberDashboard.jsx/ModeratorDashboard.jsx's
-- match.recorded_by checks) expects recorded_by and type. This looks
-- like production renamed these columns at some point and the manual
-- table-by-table dev clone predates that rename. Renaming (not adding
-- new columns) to avoid ending up with two redundant columns.
--
-- confirmed_by already exists correctly (added successfully by the
-- earlier version of this script) — not touched here.

ALTER TABLE matches RENAME COLUMN created_by TO recorded_by;
ALTER TABLE matches RENAME COLUMN match_type TO type;

-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY.
-- Do NOT run against production.
--
-- Found while testing: creating a poll fails with PGRST204 "Could not
-- find the 'notes' column of 'session_polls' in the schema cache".
-- supabase/polls.sql (the canonical schema script) defines notes text —
-- dev DB drift, same pattern as the other missing columns found this
-- session.

ALTER TABLE session_polls ADD COLUMN IF NOT EXISTS notes text;

-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY.
-- Do NOT run against production.
--
-- Found while spot-checking Splits on feature/shuttley-app-feel-upgrade:
-- adding an expense fails with PGRST204 "Could not find the 'created_by'
-- column of 'splits_expenses' in the schema cache".
--
-- Confirmed empirically (via PostgREST column probing, since shuttley-dev
-- has zero rows in splits_expenses so a SELECT * sample wasn't available)
-- that splits_expenses is missing four columns SplitsPage.jsx requires:
--   - created_by    (set on every insert, src/pages/SplitsPage.jsx:286,336)
--   - image_url      (set on every insert/update, used for receipt/proof display)
--   - is_settlement  (set on settle-up inserts, used to badge "Settlement" in history)
--   - edit_history   (appended to on edit, used to render the edit trail)
--
-- This is the same dev-clone drift pattern as the other fix_dev_*.sql
-- scripts in this folder. Unlike matches/sessions, there is no existing
-- same-purpose column under a different name to rename — confirmed by
-- probing candidates (user_id, added_by, owner_id, recorded_by,
-- submitted_by, notes, receipt_url, settled, type, session_id) and all
-- came back "column does not exist". This is a genuine ADD COLUMN case,
-- not a rename.
--
-- splits_participants (the other table this page uses) was checked too —
-- id, expense_id, user_id, share all already exist correctly. No change
-- needed there.

ALTER TABLE splits_expenses ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE splits_expenses ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE splits_expenses ADD COLUMN IF NOT EXISTS is_settlement boolean NOT NULL DEFAULT false;
ALTER TABLE splits_expenses ADD COLUMN IF NOT EXISTS edit_history jsonb NOT NULL DEFAULT '[]'::jsonb;

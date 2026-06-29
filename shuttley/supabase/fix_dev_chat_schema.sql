-- Run this in the Supabase SQL editor for the shuttley-dev project ONLY.
-- Do NOT run against production.
--
-- Found while inspecting Chat (feature/shuttley-app-feel-upgrade): ChatPage.jsx
-- cannot load, create, or send into ANY conversation on shuttley-dev. The very
-- first call in load() (fetch-or-create the "All Members" conversation) fails:
--   GET  chat_conversations?...&type=eq.all  -> 42703 column "type" does not exist
--   POST chat_conversations (fallback insert) -> PGRST204 'created_by' column not found
-- Both chat_conversations and chat_messages have 0 rows on shuttley-dev, so this
-- is genuinely empty/never-exercised schema drift, not a data-migration problem.
--
-- Confirmed by probing columns individually via PostgREST (table has 0 rows,
-- so a SELECT * sample isn't available) and by testing plausible rename
-- candidates (conv_type, kind, title, owner_id, last_active_at, preview, etc.)
-- for chat_conversations — none exist. Those 5 columns are genuinely missing,
-- not renamed.
--
-- chat_messages is different: it already has `user_id`, and a
-- `select('*, profiles(full_name, avatar_url))` embed against it succeeds
-- with no relationship error — confirming user_id already carries a working
-- FK to profiles(id). ChatPage.jsx expects this column to be called
-- `sender_id` (src/pages/ChatPage.jsx:244,245,261,662,664,665). Renaming
-- (not adding a second column) preserves the existing FK automatically and
-- matches the exact pattern already used twice in this project for the same
-- situation (matches.created_by -> recorded_by, sessions.created_by ->
-- started_by) — adding a *new* column instead of renaming caused duplicate
-- FKs and PGRST201 embed-ambiguity errors both previous times this drift was
-- hit. club_id is genuinely missing on chat_messages (no rename candidate
-- found either) and is always provided by the app on insert
-- (src/pages/ChatPage.jsx:261).

-- ── chat_conversations: 5 genuinely missing columns ──────────────────────────
-- Both tables have 0 rows, so NOT NULL can be added directly with no DEFAULT
-- needed to backfill (there are no existing rows to violate the constraint).
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS type text NOT NULL;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS last_message_preview text;

-- ── chat_messages: rename existing column, add the one genuinely missing one ─
ALTER TABLE chat_messages RENAME COLUMN user_id TO sender_id;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS club_id uuid NOT NULL REFERENCES clubs(id);

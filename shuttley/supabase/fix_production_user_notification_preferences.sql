-- Add personal notification preferences.
-- Production project: wuvwvrgxbfcyhqsyoswd

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_poll_notifications boolean NOT NULL DEFAULT true,
  chat_notifications boolean NOT NULL DEFAULT true,
  announcement_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_user_notification_preferences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_notification_preferences_updated_at ON public.user_notification_preferences;
CREATE TRIGGER set_user_notification_preferences_updated_at
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_user_notification_preferences_updated_at();

DROP POLICY IF EXISTS "user_notification_preferences_owner_select" ON public.user_notification_preferences;
CREATE POLICY "user_notification_preferences_owner_select" ON public.user_notification_preferences
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_notification_preferences_owner_insert" ON public.user_notification_preferences;
CREATE POLICY "user_notification_preferences_owner_insert" ON public.user_notification_preferences
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_notification_preferences_owner_update" ON public.user_notification_preferences;
CREATE POLICY "user_notification_preferences_owner_update" ON public.user_notification_preferences
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

COMMIT;

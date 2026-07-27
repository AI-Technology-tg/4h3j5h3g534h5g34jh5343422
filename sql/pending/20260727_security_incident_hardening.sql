BEGIN;

-- Incident 2026-07-27:
-- a user-owned profiles row was able to promote itself through is_site_creator.
-- Creator identity is now pinned to the canonical auth user and never trusts
-- editable profile metadata.
CREATE OR REPLACE FUNCTION public.is_site_creator_user_id(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = user_id
      AND u.id = 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb'::UUID
      AND lower(trim(coalesce(u.email::TEXT, ''))) = 'creator@reminko.com'
  );
$$;

REVOKE ALL ON FUNCTION public.is_site_creator_user_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_site_creator_user_id(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_site_creator_user_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_creator_user_id(UUID) TO service_role;

UPDATE public.profiles
SET is_site_creator = (id = 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb'::UUID)
WHERE is_site_creator IS DISTINCT FROM
  (id = 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb'::UUID);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_site_creator_identity_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_site_creator_identity_check
  CHECK (
    COALESCE(is_site_creator, false) = false
    OR id = 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb'::UUID
  );

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_email TEXT := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_jwt_role TEXT := lower(trim(coalesce(auth.jwt() ->> 'role', '')));
  v_trusted BOOLEAN :=
    (
      v_actor = 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb'::UUID
      AND v_actor_email = 'creator@reminko.com'
    )
    OR v_jwt_role = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin');
  v_privileged_change BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_privileged_change :=
      COALESCE(NEW.is_site_creator, false)
      OR lower(trim(coalesce(NEW.role, 'user'))) <> 'user'
      OR COALESCE(NEW.is_banned, false)
      OR NEW.ban_reason IS NOT NULL
      OR NEW.banned_at IS NOT NULL;
  ELSE
    v_privileged_change :=
      OLD.id IS DISTINCT FROM NEW.id
      OR OLD.created_at IS DISTINCT FROM NEW.created_at
      OR OLD.is_site_creator IS DISTINCT FROM NEW.is_site_creator
      OR OLD.role IS DISTINCT FROM NEW.role
      OR OLD.is_banned IS DISTINCT FROM NEW.is_banned
      OR OLD.ban_reason IS DISTINCT FROM NEW.ban_reason
      OR OLD.banned_at IS DISTINCT FROM NEW.banned_at;
  END IF;

  IF v_privileged_change AND NOT v_trusted THEN
    RAISE EXCEPTION 'profiles: protected security fields cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_security_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_security_fields_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_security_fields();

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

REVOKE INSERT, UPDATE ON public.profiles FROM anon;

-- Every notification now records its authenticated sender.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sender_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL
  DEFAULT auth.uid();
ALTER TABLE public.notifications
  ALTER COLUMN sender_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_notifications_sender_created
  ON public.notifications(sender_id, created_at DESC);

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_plain_text_payload_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_plain_text_payload_check
  CHECK (
    char_length(trim(title)) BETWEEN 1 AND 160
    AND char_length(message) <= 2000
    AND title !~ '[<>]'
    AND message !~ '[<>]'
    AND char_length(coalesce(type, '')) <= 64
    AND (
      link IS NULL
      OR trim(link) = ''
      OR (
        link !~ '[<>[:cntrl:]]'
        AND (
          trim(link) ~* '^https?://'
          OR (
            trim(link) !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:'
            AND trim(link) !~ '^//'
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_user" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_creator" ON public.notifications;

CREATE POLICY "notifications_insert_creator" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_site_creator_user_id(auth.uid())
  );

CREATE POLICY "notifications_insert_user" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (
        type IN ('minko', 'new_episode')
        AND user_id = auth.uid()
      )
      OR (
        type = 'friend_request'
        AND EXISTS (
          SELECT 1
          FROM public.friends f
          WHERE f.user_id = auth.uid()
            AND f.friend_id = notifications.user_id
            AND f.status = 'pending'
        )
      )
      OR (
        type = 'friend_accepted'
        AND EXISTS (
          SELECT 1
          FROM public.friends f
          WHERE f.user_id = notifications.user_id
            AND f.friend_id = auth.uid()
            AND f.status = 'accepted'
        )
      )
      OR (
        type = 'watch_together_invite'
        AND EXISTS (
          SELECT 1
          FROM public.friends f
          WHERE f.status = 'accepted'
            AND (
              (f.user_id = auth.uid() AND f.friend_id = notifications.user_id)
              OR
              (f.friend_id = auth.uid() AND f.user_id = notifications.user_id)
            )
        )
      )
      OR (
        type = 'watch_join_request'
        AND coalesce(data ->> 'session_id', '') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1
          FROM public.watch_together_sessions s
          WHERE s.id = (data ->> 'session_id')::UUID
            AND s.host_id = notifications.user_id
            AND s.is_active = true
            AND s.host_id <> auth.uid()
        )
      )
    )
  );

REVOKE INSERT, UPDATE ON public.notifications FROM anon;
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT INSERT ON public.notifications TO authenticated;
GRANT UPDATE (read, read_at) ON public.notifications TO authenticated;

COMMENT ON COLUMN public.notifications.sender_id IS
  'Authenticated originator of the notification; introduced after the 2026-07-27 incident.';

COMMIT;

BEGIN;

-- Notification links are internal navigation only. Remove legacy external or
-- malformed values before enforcing the invariant.
UPDATE public.notifications
SET link = NULL
WHERE link IS NOT NULL
  AND trim(link) <> ''
  AND (
    char_length(link) > 1024
    OR link ~ '[<>[:cntrl:]]'
    OR trim(link) ~* '^[a-z][a-z0-9+.-]*:'
    OR trim(link) ~ '^//'
    OR position(E'\\' in link) > 0
  );

UPDATE public.notifications
SET data = '{}'::JSONB
WHERE data IS NOT NULL
  AND (
    jsonb_typeof(data) <> 'object'
    OR octet_length(data::TEXT) > 4096
    OR data::TEXT ~ '[<>]'
  );

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
        char_length(link) <= 1024
        AND link !~ '[<>[:cntrl:]]'
        AND trim(link) !~* '^[a-z][a-z0-9+.-]*:'
        AND trim(link) !~ '^//'
        AND position(E'\\' in link) = 0
      )
    )
    AND (
      data IS NULL
      OR (
        jsonb_typeof(data) = 'object'
        AND octet_length(data::TEXT) <= 4096
        AND data::TEXT !~ '[<>]'
      )
    )
  );

-- Users may deactivate their own VIP, but cannot activate or extend it.
DROP POLICY IF EXISTS "vip_subscriptions_user_cancel" ON public.vip_subscriptions;
CREATE POLICY "vip_subscriptions_user_cancel" ON public.vip_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND is_active = false);

-- Keep all catalog mutations behind the canonical creator identity check.
DROP POLICY IF EXISTS "catalog_site_anime_update" ON public.catalog_site_anime;
DROP POLICY IF EXISTS "catalog_site_anime_delete" ON public.catalog_site_anime;
CREATE POLICY "catalog_site_anime_update" ON public.catalog_site_anime
  FOR UPDATE TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "catalog_site_anime_delete" ON public.catalog_site_anime
  FOR DELETE TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()));

COMMIT;

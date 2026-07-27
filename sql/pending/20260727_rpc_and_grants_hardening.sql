BEGIN;

-- Browser roles never need schema-management privileges. TRUNCATE is not
-- protected by RLS, so remove it everywhere as defense in depth.
REVOKE TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

-- Anonymous HTTP clients only need public reads from these tables.
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO anon;

REVOKE ALL ON public.catalog_site_anime FROM anon;
GRANT SELECT ON public.catalog_site_anime TO anon;

REVOKE ALL ON public.catalog_4k_anime FROM anon;
GRANT SELECT ON public.catalog_4k_anime TO anon;

REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.ai_subscriptions FROM anon;
REVOKE ALL ON public.vip_subscriptions FROM anon;

REVOKE DELETE ON public.profiles FROM authenticated;

-- Make browser-facing ownership policies explicit.
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_subscriptions_select" ON public.ai_subscriptions;
CREATE POLICY "ai_subscriptions_select" ON public.ai_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "vip_subscriptions_select" ON public.vip_subscriptions;
CREATE POLICY "vip_subscriptions_select" ON public.vip_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Supabase grants EXECUTE to PUBLIC by default. Remove anonymous execution
-- from every privileged function, then restore the one intentionally public
-- aggregate. Signed-in anonymous users use the authenticated role.
DO $$
DECLARE
  f REGPROCEDURE;
BEGIN
  FOR f IN
    SELECT p.oid::REGPROCEDURE
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION public.site_visit_online_count(integer) TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

REVOKE ALL ON FUNCTION public.handle_anon_user_meta_sync()
FROM PUBLIC, anon, authenticated;

-- Fix mutable search paths reported by the database security advisor.
ALTER FUNCTION public.giveaway_normalize_social_handle(TEXT)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.dm_group_members_enforce_limit()
  SET search_path = public, pg_temp;

-- The bucket is public, so object URLs work without a broad listing policy.
DROP POLICY IF EXISTS "anime_4k_videos_public_read" ON storage.objects;

COMMIT;

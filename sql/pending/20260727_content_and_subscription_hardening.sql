BEGIN;

-- Remove stored markup from user-controlled profile names before validating.
UPDATE public.profiles
SET username = 'user-' || left(id::TEXT, 8)
WHERE username ~ '[<>[:cntrl:]]'
   OR char_length(trim(username)) NOT BETWEEN 2 AND 40;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_plain_text_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_plain_text_check
  CHECK (
    char_length(trim(username)) BETWEEN 2 AND 40
    AND username !~ '[<>[:cntrl:]]'
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_safe_value_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_safe_value_check
  CHECK (
    avatar IS NULL
    OR (
      char_length(avatar) <= 2048
      AND avatar !~ '[<>[:cntrl:]]'
      AND avatar !~* '^\s*(javascript|vbscript):'
    )
  );

-- Subscription tiers are server/creator-owned. A user may read only their row.
DROP POLICY IF EXISTS "ai_subscriptions_insert" ON public.ai_subscriptions;
DROP POLICY IF EXISTS "ai_subscriptions_update" ON public.ai_subscriptions;
DROP POLICY IF EXISTS "ai_subscriptions_site_creator_all" ON public.ai_subscriptions;
CREATE POLICY "ai_subscriptions_site_creator_all" ON public.ai_subscriptions
  FOR ALL TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

DROP POLICY IF EXISTS "vip_subscriptions_insert" ON public.vip_subscriptions;
DROP POLICY IF EXISTS "vip_subscriptions_update" ON public.vip_subscriptions;
DROP POLICY IF EXISTS "vip_subscriptions_site_creator_all" ON public.vip_subscriptions;
CREATE POLICY "vip_subscriptions_site_creator_all" ON public.vip_subscriptions
  FOR ALL TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

-- Public catalogs are published content, not user-owned rows.
DROP POLICY IF EXISTS "catalog_site_anime_insert" ON public.catalog_site_anime;
DROP POLICY IF EXISTS "catalog_site_anime_insert_anon" ON public.catalog_site_anime;
DROP POLICY IF EXISTS "catalog_site_anime_insert_authenticated" ON public.catalog_site_anime;
CREATE POLICY "catalog_site_anime_insert_authenticated" ON public.catalog_site_anime
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_site_creator_user_id(auth.uid())
    AND added_by = auth.uid()
  );

DROP POLICY IF EXISTS "catalog_4k_anime_insert_anon" ON public.catalog_4k_anime;
DROP POLICY IF EXISTS "catalog_4k_anime_insert_authenticated" ON public.catalog_4k_anime;
CREATE POLICY "catalog_4k_anime_insert_authenticated" ON public.catalog_4k_anime
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_site_creator_user_id(auth.uid())
    AND added_by = auth.uid()
  );

REVOKE INSERT ON public.catalog_site_anime FROM anon;
REVOKE INSERT ON public.catalog_4k_anime FROM anon;

COMMIT;

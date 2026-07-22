-- Giveaway: статус участника с соцсетями + добавление второй сети без смены ref_code

DROP FUNCTION IF EXISTS public.giveaway_my_status();

CREATE OR REPLACE FUNCTION public.giveaway_my_status()
 RETURNS TABLE(
   is_participant boolean,
   ref_code text,
   share_path text,
   unique_clicks bigint,
   registrations bigint,
   joined_at timestamp with time zone,
   platform text,
   tiktok_handle text,
   instagram_handle text,
   can_add_social boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT;
  v_joined TIMESTAMPTZ;
  v_platform TEXT;
  v_tiktok TEXT;
  v_instagram TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::TEXT, 0::BIGINT, 0::BIGINT, NULL::TIMESTAMPTZ,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, false;
    RETURN;
  END IF;

  SELECT gp.ref_code, gp.joined_at INTO v_code, v_joined
  FROM public.giveaway_participants gp
  WHERE gp.user_id = v_uid;

  IF v_code IS NULL THEN
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::TEXT, 0::BIGINT, 0::BIGINT, NULL::TIMESTAMPTZ,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, false;
    RETURN;
  END IF;

  SELECT pr.platform, pr.tiktok_handle, pr.instagram_handle
  INTO v_platform, v_tiktok, v_instagram
  FROM public.giveaway_preregistrations pr
  WHERE pr.user_id = v_uid;

  RETURN QUERY
  SELECT
    true,
    v_code,
    '/r/' || v_code,
    (SELECT COUNT(*)::BIGINT FROM public.giveaway_ref_clicks c WHERE c.ref_code = v_code),
    (SELECT COUNT(*)::BIGINT FROM public.giveaway_ref_registrations r WHERE r.ref_code = v_code),
    v_joined,
    v_platform,
    v_tiktok,
    v_instagram,
    (
      coalesce(v_platform, '') <> 'both'
      AND (v_tiktok IS NULL OR v_instagram IS NULL)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.giveaway_add_social(
  p_platform text,
  p_tiktok_handle text DEFAULT NULL,
  p_instagram_handle text DEFAULT NULL
)
 RETURNS TABLE(
   success boolean,
   message text,
   platform text,
   tiktok_handle text,
   instagram_handle text,
   ref_code text,
   share_path text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT;
  v_platform TEXT;
  v_tiktok TEXT;
  v_instagram TEXT;
  v_new_platform TEXT;
  v_new_tiktok TEXT;
  v_new_instagram TEXT;
  v_ends_at TIMESTAMPTZ := TIMESTAMPTZ '2026-07-31 21:59:59+00';
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'Требуется авторизация', NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF NOW() > v_ends_at THEN
    RETURN QUERY SELECT false, 'Розыгрыш завершён', NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT gp.ref_code INTO v_code
  FROM public.giveaway_participants gp
  WHERE gp.user_id = v_uid;

  IF v_code IS NULL THEN
    RETURN QUERY SELECT false, 'Сначала нажмите «Участвую»', NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT pr.platform, pr.tiktok_handle, pr.instagram_handle
  INTO v_platform, v_tiktok, v_instagram
  FROM public.giveaway_preregistrations pr
  WHERE pr.user_id = v_uid;

  IF coalesce(v_platform, '') = 'both' AND v_tiktok IS NOT NULL AND v_instagram IS NOT NULL THEN
    RETURN QUERY SELECT false, 'Обе соцсети уже указаны', v_platform, v_tiktok, v_instagram, v_code, '/r/' || v_code;
    RETURN;
  END IF;

  v_new_tiktok := public.giveaway_normalize_social_handle(p_tiktok_handle);
  v_new_instagram := public.giveaway_normalize_social_handle(p_instagram_handle);

  IF v_tiktok IS NOT NULL THEN
    v_new_tiktok := v_tiktok;
  END IF;
  IF v_instagram IS NOT NULL THEN
    v_new_instagram := v_instagram;
  END IF;

  IF v_new_tiktok IS NULL AND v_new_instagram IS NULL THEN
    RETURN QUERY SELECT false, 'Укажите ник недостающей соцсети', v_platform, v_tiktok, v_instagram, v_code, '/r/' || v_code;
    RETURN;
  END IF;

  IF v_new_tiktok IS NOT NULL AND v_new_instagram IS NOT NULL THEN
    v_new_platform := 'both';
  ELSIF v_new_tiktok IS NOT NULL THEN
    v_new_platform := 'tiktok';
  ELSE
    v_new_platform := 'instagram';
  END IF;

  IF v_tiktok IS NOT NULL AND v_new_tiktok IS DISTINCT FROM v_tiktok THEN
    RETURN QUERY SELECT false, 'TikTok уже указан и не меняется', v_platform, v_tiktok, v_instagram, v_code, '/r/' || v_code;
    RETURN;
  END IF;
  IF v_instagram IS NOT NULL AND v_new_instagram IS DISTINCT FROM v_instagram THEN
    RETURN QUERY SELECT false, 'Instagram уже указан и не меняется', v_platform, v_tiktok, v_instagram, v_code, '/r/' || v_code;
    RETURN;
  END IF;

  INSERT INTO public.giveaway_preregistrations (
    user_id, platform, tiktok_handle, instagram_handle, updated_at
  ) VALUES (
    v_uid, v_new_platform, v_new_tiktok, v_new_instagram, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    platform = EXCLUDED.platform,
    tiktok_handle = EXCLUDED.tiktok_handle,
    instagram_handle = EXCLUDED.instagram_handle,
    updated_at = now();

  RETURN QUERY SELECT
    true,
    'Соцсеть добавлена',
    v_new_platform,
    v_new_tiktok,
    v_new_instagram,
    v_code,
    '/r/' || v_code;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.giveaway_my_status() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.giveaway_add_social(text, text, text) TO authenticated, service_role;

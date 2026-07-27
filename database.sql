-- ============================================
-- БАЗА ДАННЫХ RE-MINKO — ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ
-- ============================================
-- Все изменения схемы (таблицы, колонки, RLS, функции, триггеры) вносятся
-- ТОЛЬКО в этот файл. Папки sql/, supabase/migrations/ — справочные заглушки;
-- при правке проекта дописывайте сюда и прогоняйте файл в Supabase SQL Editor.
--
-- Выполните в Supabase SQL Editor (целиком или после точечных правок).
-- Скрипт идемпотентный: можно запускать повторно.
-- Таблицы создаются/обновляются, лишние удаляются.
--
-- ВАЖНО (приватность):
--   • watch_history: SELECT разрешён всем (USING true) — так фронт читает историю
--     чужого профиля. Если нужна только «своя» история — смените политику и уберите
--     выборку чужих строк в profile.js.
--   • notifications: INSERT ограничен разрешёнными сценариями, отправитель пишется
--     в sender_id, а HTML и опасные URL блокируются CHECK-ограничением.
--
-- ОПАСНО: блок «УДАЛЕНИЕ ТАБЛИЦ» ниже удаляет ЛЮБЫЕ public-таблицы не из списка.
-- Если добавляли свои таблицы — допишите их в _allowed или закомментируйте блок.
-- Схема синхронизирована с фронтом: таблиц соцленты (posts, fans и т.д.) в проекте нет — в БД они не создаются и при прогоне удаляются.
--
-- НОВЫЙ ПРОЕКТ SUPABASE: URL/ключи в этом файле НЕ хранятся. После создания проекта:
--   1) Выполните весь скрипт здесь (SQL Editor нового проекта).
--   2) Пропишите URL и anon JWT в scripts/config.js (или config.local.js) — см. SUPABASE_CHECKLIST.md
-- ============================================

-- ============================================
-- 1. СОЗДАНИЕ ТАБЛИЦ (IF NOT EXISTS)
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')) DEFAULT 'male',
  profile_setup_done BOOLEAN DEFAULT true,
  telegram_id TEXT,
  last_online TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.favorites_anime (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  anime_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, anime_id)
);

CREATE TABLE IF NOT EXISTS public.favorites_manga (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  manga_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, manga_id)
);

CREATE TABLE IF NOT EXISTS public.watch_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  anime_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  watched_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  ads_enabled BOOLEAN DEFAULT true,
  notifications_enabled BOOLEAN DEFAULT true,
  auto_play_next_episode BOOLEAN DEFAULT false,
  show_recommendations BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.minko_ai_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  is_angry BOOLEAN DEFAULT false,
  angry_until TIMESTAMP WITH TIME ZONE,
  blocked_forever BOOLEAN DEFAULT false,
  unauth_attempts INTEGER DEFAULT 0,
  trial_messages INTEGER DEFAULT 0,
  wrong_gender_count INTEGER DEFAULT 0,
  swear_count INTEGER DEFAULT 0,
  forgiven_count INTEGER DEFAULT 0,
  last_interaction TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  subscription_type TEXT CHECK (subscription_type IN ('free', 'premium', 'unlimited')) DEFAULT 'free',
  messages_limit INTEGER DEFAULT 50,
  messages_used INTEGER DEFAULT 0,
  last_reset_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.vip_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT false,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.watch_together_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  anime_id TEXT,
  manga_id TEXT,
  type TEXT CHECK (type IN ('anime', 'manga')) NOT NULL,
  current_episode INTEGER,
  current_chapter INTEGER,
  playback_position INTEGER DEFAULT 0,
  is_playing BOOLEAN DEFAULT false,
  playback_time FLOAT DEFAULT 0,
  video_source TEXT,
  is_active BOOLEAN DEFAULT true,
  session_code TEXT UNIQUE NOT NULL,
  max_participants INTEGER DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.watch_together_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES watch_together_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  has_vip BOOLEAN DEFAULT false,
  player_ready BOOLEAN DEFAULT false,
  player_ready_at TIMESTAMP WITH TIME ZONE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(session_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.watch_together_chat (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES watch_together_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Сигнaling WebRTC для голосового чата «Смотреть вместе» (mesh, только при всех VIP в комнате — проверка в UI)
CREATE TABLE IF NOT EXISTS public.watch_together_voice_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.watch_together_sessions(id) ON DELETE CASCADE NOT NULL,
  from_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  to_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'candidate', 'hangup', 'mod_mute')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.friends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending',
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS public.global_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  reply_to UUID REFERENCES public.global_chat_messages(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.global_chat_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.global_chat_messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  link TEXT,
  data JSONB,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  achievement_type TEXT NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, achievement_type)
);

CREATE TABLE IF NOT EXISTS public.custom_anime (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  title_alt TEXT NOT NULL,
  type TEXT DEFAULT 'Сериал',
  year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  total_episodes INTEGER DEFAULT 12,
  status TEXT DEFAULT 'Онгоинг',
  genres TEXT[] DEFAULT '{}',
  description TEXT,
  studio TEXT,
  rating DECIMAL(3,1) DEFAULT 0,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Глобальный каталог: тайтлы с MyAnimeList (Jikan), добавленные создателем; на сайте id = 10_000_000 + mal_id
CREATE TABLE IF NOT EXISTS public.catalog_site_anime (
  mal_id INTEGER PRIMARY KEY,
  jikan JSONB NOT NULL,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.catalog_site_anime ADD COLUMN IF NOT EXISTS title_ru TEXT;
ALTER TABLE public.catalog_site_anime ADD COLUMN IF NOT EXISTS description_ru TEXT;

-- Изолированный ≈4K каталог (id на сайте = 22_000_000 + mal_id)
CREATE TABLE IF NOT EXISTS public.catalog_4k_anime (
  mal_id INTEGER PRIMARY KEY,
  jikan JSONB NOT NULL,
  title_ru TEXT,
  description_ru TEXT,
  video_url TEXT,
  poster_url TEXT,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT true
);

-- Публичный флаг Minko AI (удалённое вкл/выкл чата). Строка id=1 — читают все с сайта и Netlify.
CREATE TABLE IF NOT EXISTS public.minko_ai_public_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  chat_enabled BOOLEAN NOT NULL DEFAULT true,
  offline_except_creator BOOLEAN NOT NULL DEFAULT false,
  maintenance_message TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

INSERT INTO public.minko_ai_public_state (id, chat_enabled, maintenance_message)
VALUES (1, true, '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.minko_ai_public_state
ADD COLUMN IF NOT EXISTS offline_except_creator BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.minko_ai_public_state
ADD COLUMN IF NOT EXISTS search_provider TEXT NOT NULL DEFAULT 'auto';

-- Логи серверной функции чата (Netlify + SUPABASE_SERVICE_ROLE_KEY — INSERT обходит RLS)
CREATE TABLE IF NOT EXISTS public.minko_ai_server_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT minko_ai_server_logs_level_len CHECK (char_length(level) <= 32),
  CONSTRAINT minko_ai_server_logs_message_len CHECK (char_length(message) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_minko_ai_server_logs_created ON public.minko_ai_server_logs(created_at DESC);

-- Лимит генераций аватара (ИИ / Grok): записи только с сервера (service_role), RLS без политик — доступ запрещён для anon/authenticated
CREATE TABLE IF NOT EXISTS public.avatar_ai_generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_avatar_ai_generations_user_created ON public.avatar_ai_generations(user_id, created_at DESC);

-- События посещений (дашборд создателя): просмотры страниц, гости и залогиненные
CREATE TABLE IF NOT EXISTS public.site_visit_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  page_title TEXT,
  referrer TEXT,
  user_agent TEXT,
  event_kind TEXT NOT NULL DEFAULT 'pageview',
  event_label TEXT,
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT site_visit_visitor_len CHECK (char_length(visitor_id) >= 8 AND char_length(visitor_id) <= 64),
  CONSTRAINT site_visit_path_len CHECK (char_length(path) <= 2048)
);

-- История чата Minko AI (панель создателя; INSERT — свой user_id)
CREATE TABLE IF NOT EXISTS public.minko_ai_chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT minko_ai_chat_logs_content_len CHECK (char_length(content) <= 12000)
);

CREATE INDEX IF NOT EXISTS idx_minko_ai_chat_logs_user_created
  ON public.minko_ai_chat_logs(user_id, created_at DESC);

-- Шёпот в общем чате: текст только у отправителя и адресата
CREATE TABLE IF NOT EXISTS public.global_chat_whisper_secrets (
  message_id UUID PRIMARY KEY REFERENCES public.global_chat_messages(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  CONSTRAINT gc_whisper_body_len CHECK (char_length(body) <= 2000)
);

-- Секреты создателя Minko AI (build hook Netlify и т.п.)
CREATE TABLE IF NOT EXISTS public.minko_ai_creator_secrets (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  netlify_build_hook_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

INSERT INTO public.minko_ai_creator_secrets (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Режим «В разработке» + метка выката на главной (баннер бета)
CREATE TABLE IF NOT EXISTS public.site_maintenance_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance_enabled BOOLEAN NOT NULL DEFAULT false,
  extra_allowed_routes TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  deploy_status_marked_at TIMESTAMPTZ
);

INSERT INTO public.site_maintenance_config (id, maintenance_enabled, extra_allowed_routes)
VALUES (1, false, ARRAY[]::text[])
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. МИГРАЦИЯ СУЩЕСТВУЮЩИХ ТАБЛИЦ
--    Добавление колонок которых может не быть
--    Изменение типов/дефолтов
-- ============================================

-- profiles: добавить колонки если их нет
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_online TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_setup_done BOOLEAN DEFAULT true;

-- minko_ai_state: убедиться что все поля на месте
ALTER TABLE public.minko_ai_state ADD COLUMN IF NOT EXISTS wrong_gender_count INTEGER DEFAULT 0;
ALTER TABLE public.minko_ai_state ADD COLUMN IF NOT EXISTS swear_count INTEGER DEFAULT 0;
ALTER TABLE public.minko_ai_state ADD COLUMN IF NOT EXISTS forgiven_count INTEGER DEFAULT 0;
ALTER TABLE public.minko_ai_state ADD COLUMN IF NOT EXISTS trial_messages INTEGER DEFAULT 0;

-- ai_subscriptions: миграция с 10 на 50 лимит и DATE → TIMESTAMP
ALTER TABLE public.ai_subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.ai_subscriptions ALTER COLUMN messages_limit SET DEFAULT 50;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'ai_subscriptions' AND column_name = 'last_reset_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE public.ai_subscriptions ALTER COLUMN last_reset_date TYPE TIMESTAMP WITH TIME ZONE USING last_reset_date::TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.ai_subscriptions ALTER COLUMN last_reset_date SET DEFAULT NOW();
  END IF;
END $$;

-- Обновить старые записи с лимитом 10 на 50 (бесплатные пользователи)
UPDATE public.ai_subscriptions
SET messages_limit = 50
WHERE subscription_type = 'free' AND messages_limit < 50;

-- watch_together_sessions: все колонки
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS manga_id TEXT;
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS current_chapter INTEGER;
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS playback_time FLOAT DEFAULT 0;
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS video_source TEXT;
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 4;

-- watch_together_participants: has_vip
ALTER TABLE public.watch_together_participants ADD COLUMN IF NOT EXISTS has_vip BOOLEAN DEFAULT false;
ALTER TABLE public.watch_together_participants ADD COLUMN IF NOT EXISTS player_ready BOOLEAN DEFAULT false;
ALTER TABLE public.watch_together_participants ADD COLUMN IF NOT EXISTS player_ready_at TIMESTAMP WITH TIME ZONE;
-- «Смотреть вместе»: глобальная пауза + поколение синхронизации + пинги
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS sync_hold BOOLEAN DEFAULT false;
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS sync_hold_reason TEXT;
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS sync_generation INTEGER DEFAULT 0;
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS host_screen_broadcast BOOLEAN DEFAULT false;
ALTER TABLE public.watch_together_participants ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());

UPDATE public.watch_together_participants
SET last_ping_at = COALESCE(last_ping_at, TIMEZONE('utc'::text, NOW()))
WHERE last_ping_at IS NULL;

UPDATE public.watch_together_participants
SET player_ready = false
WHERE player_ready IS NULL;

-- profiles: текущая активность и защищённый флаг единственного creator-аккаунта
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_activity JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_site_creator BOOLEAN DEFAULT false;

-- site_maintenance_config: колонка выката (если таблица создана до объединения схемы)
ALTER TABLE public.site_maintenance_config ADD COLUMN IF NOT EXISTS deploy_status_marked_at TIMESTAMPTZ;

-- global_chat: шёпот
ALTER TABLE public.global_chat_messages ADD COLUMN IF NOT EXISTS whisper_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- watch_together: активность комнаты для авто-закрытия
ALTER TABLE public.watch_together_sessions ADD COLUMN IF NOT EXISTS last_room_activity_at TIMESTAMPTZ;

UPDATE public.watch_together_sessions
SET last_room_activity_at = COALESCE(last_room_activity_at, updated_at, created_at, TIMEZONE('utc'::text, NOW()))
WHERE last_room_activity_at IS NULL AND is_active = true;

-- ============================================
-- ЛИЧНЫЕ СООБЩЕНИЯ
-- ============================================
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  edited_at TIMESTAMPTZ
);

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dm_sender ON public.direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_dm_receiver ON public.direct_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_dm_created ON public.direct_messages(created_at);

-- Нужно для Realtime DELETE/UPDATE: в payload.old полные поля (sender_id/receiver_id)
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dm_select" ON public.direct_messages;
DROP POLICY IF EXISTS "dm_insert" ON public.direct_messages;
DROP POLICY IF EXISTS "dm_update" ON public.direct_messages;
CREATE POLICY "dm_select" ON public.direct_messages FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);
CREATE POLICY "dm_insert" ON public.direct_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS "dm_update" ON public.direct_messages;
CREATE POLICY "dm_update" ON public.direct_messages
  FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = sender_id)
  WITH CHECK (auth.uid() = receiver_id OR auth.uid() = sender_id);
DROP POLICY IF EXISTS "dm_delete" ON public.direct_messages;
CREATE POLICY "dm_delete" ON public.direct_messages
  FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE OR REPLACE FUNCTION public.reminko_delete_dm_thread(p_other_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = uid THEN
    RAISE EXCEPTION 'invalid_peer';
  END IF;

  DELETE FROM public.direct_messages
  WHERE (sender_id = uid AND receiver_id = p_other_user_id)
     OR (sender_id = p_other_user_id AND receiver_id = uid);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_delete_dm_thread(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminko_delete_dm_thread(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reminko_edit_dm_message(p_message_id uuid, p_text text)
RETURNS public.direct_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.direct_messages;
  t text := left(trim(coalesce(p_text, '')), 120000);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF t IS NULL OR char_length(t) < 1 THEN
    RAISE EXCEPTION 'empty_message';
  END IF;

  UPDATE public.direct_messages
  SET message = t, edited_at = TIMEZONE('utc'::text, NOW())
  WHERE id = p_message_id AND sender_id = uid
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'not_found_or_forbidden';
  END IF;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_edit_dm_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminko_edit_dm_message(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reminko_unsend_dm_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM public.direct_messages
  WHERE id = p_message_id AND sender_id = uid;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_unsend_dm_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminko_unsend_dm_message(uuid) TO authenticated;

-- Группы ЛС (до 4 участников)
CREATE TABLE IF NOT EXISTS public.dm_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.dm_group_members (
  group_id UUID NOT NULL REFERENCES public.dm_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_group_members_user ON public.dm_group_members(user_id);

CREATE TABLE IF NOT EXISTS public.dm_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.dm_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  edited_at TIMESTAMPTZ
);

ALTER TABLE public.dm_group_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

ALTER TABLE public.dm_group_messages REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_dm_group_messages_group_created
  ON public.dm_group_messages(group_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.reminko_is_dm_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dm_group_members m
    WHERE m.group_id = p_group_id AND m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.reminko_is_dm_group_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminko_is_dm_group_member(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.dm_group_members_enforce_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM public.dm_group_members WHERE group_id = NEW.group_id;
  IF cnt >= 4 THEN
    RAISE EXCEPTION 'group_member_limit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_group_members_limit ON public.dm_group_members;
CREATE TRIGGER trg_dm_group_members_limit
  BEFORE INSERT ON public.dm_group_members
  FOR EACH ROW EXECUTE FUNCTION public.dm_group_members_enforce_limit();

ALTER TABLE public.dm_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dm_groups_select" ON public.dm_groups;
DROP POLICY IF EXISTS "dm_groups_insert" ON public.dm_groups;
DROP POLICY IF EXISTS "dm_groups_update" ON public.dm_groups;
DROP POLICY IF EXISTS "dm_groups_delete" ON public.dm_groups;
CREATE POLICY "dm_groups_select" ON public.dm_groups FOR SELECT
  USING (public.reminko_is_dm_group_member(id));
CREATE POLICY "dm_groups_insert" ON public.dm_groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "dm_groups_update" ON public.dm_groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_group_members m
      WHERE m.group_id = id AND m.user_id = auth.uid() AND m.role = 'owner'
    )
  );
CREATE POLICY "dm_groups_delete" ON public.dm_groups FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_group_members m
      WHERE m.group_id = id AND m.user_id = auth.uid() AND m.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "dm_group_members_select" ON public.dm_group_members;
DROP POLICY IF EXISTS "dm_group_members_insert" ON public.dm_group_members;
DROP POLICY IF EXISTS "dm_group_members_delete" ON public.dm_group_members;
CREATE POLICY "dm_group_members_select" ON public.dm_group_members FOR SELECT
  USING (public.reminko_is_dm_group_member(group_id));
CREATE POLICY "dm_group_members_insert" ON public.dm_group_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.dm_group_members m
      WHERE m.group_id = group_id AND m.user_id = auth.uid() AND m.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM public.dm_groups g
      WHERE g.id = group_id AND g.created_by = auth.uid()
    )
  );
CREATE POLICY "dm_group_members_delete" ON public.dm_group_members FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.dm_group_members m
      WHERE m.group_id = group_id AND m.user_id = auth.uid() AND m.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "dm_group_messages_select" ON public.dm_group_messages;
DROP POLICY IF EXISTS "dm_group_messages_insert" ON public.dm_group_messages;
DROP POLICY IF EXISTS "dm_group_messages_update" ON public.dm_group_messages;
DROP POLICY IF EXISTS "dm_group_messages_delete" ON public.dm_group_messages;
CREATE POLICY "dm_group_messages_select" ON public.dm_group_messages FOR SELECT
  USING (public.reminko_is_dm_group_member(group_id));
CREATE POLICY "dm_group_messages_insert" ON public.dm_group_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.reminko_is_dm_group_member(group_id)
  );
CREATE POLICY "dm_group_messages_update" ON public.dm_group_messages
  FOR UPDATE USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "dm_group_messages_delete" ON public.dm_group_messages
  FOR DELETE USING (auth.uid() = sender_id);

CREATE OR REPLACE FUNCTION public.reminko_edit_dm_group_message(p_message_id uuid, p_text text)
RETURNS public.dm_group_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.dm_group_messages;
  t text := left(trim(coalesce(p_text, '')), 120000);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF t IS NULL OR char_length(t) < 1 THEN
    RAISE EXCEPTION 'empty_message';
  END IF;

  UPDATE public.dm_group_messages
  SET message = t, edited_at = TIMEZONE('utc'::text, NOW())
  WHERE id = p_message_id AND sender_id = uid
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'not_found_or_forbidden';
  END IF;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_edit_dm_group_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminko_edit_dm_group_message(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reminko_unsend_dm_group_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM public.dm_group_messages
  WHERE id = p_message_id AND sender_id = uid;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_unsend_dm_group_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminko_unsend_dm_group_message(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reminko_create_dm_group(
  p_name text,
  p_member_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  gid uuid;
  mid uuid;
  uniq uuid[] := ARRAY[]::uuid[];
  n text := left(trim(coalesce(p_name, '')), 60);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF n IS NULL OR char_length(n) < 1 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  IF p_member_ids IS NOT NULL THEN
    FOREACH mid IN ARRAY p_member_ids LOOP
      IF mid IS NULL OR mid = uid THEN
        CONTINUE;
      END IF;
      IF NOT (mid = ANY (uniq)) THEN
        uniq := array_append(uniq, mid);
      END IF;
    END LOOP;
  END IF;

  IF coalesce(array_length(uniq, 1), 0) < 1 THEN
    RAISE EXCEPTION 'need_members';
  END IF;
  IF coalesce(array_length(uniq, 1), 0) > 3 THEN
    RAISE EXCEPTION 'group_member_limit';
  END IF;

  INSERT INTO public.dm_groups (name, created_by)
  VALUES (n, uid)
  RETURNING id INTO gid;

  INSERT INTO public.dm_group_members (group_id, user_id, role)
  VALUES (gid, uid, 'owner');

  FOREACH mid IN ARRAY uniq LOOP
    INSERT INTO public.dm_group_members (group_id, user_id, role)
    VALUES (gid, mid, 'member');
  END LOOP;

  RETURN gid;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_create_dm_group(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminko_create_dm_group(text, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.reminko_add_dm_group_member(
  p_group_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cnt integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dm_group_members
    WHERE group_id = p_group_id AND user_id = uid AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
  IF p_user_id IS NULL OR p_user_id = uid THEN
    RAISE EXCEPTION 'invalid_member';
  END IF;
  SELECT count(*) INTO cnt FROM public.dm_group_members WHERE group_id = p_group_id;
  IF cnt >= 4 THEN
    RAISE EXCEPTION 'group_member_limit';
  END IF;
  INSERT INTO public.dm_group_members (group_id, user_id, role)
  VALUES (p_group_id, p_user_id, 'member')
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_add_dm_group_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminko_add_dm_group_member(uuid, uuid) TO authenticated;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_group_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- ============================================
-- АДМИНЫ И МОДЕРАЦИЯ ЧАТА (используются admin-panel.js, admin-panel-creator.js)
-- ============================================

CREATE TABLE IF NOT EXISTS public.admins (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.site_team_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('moderator', 'admin', 'sponsor', 'promoter', 'support')),
  note TEXT,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_site_team_roles_role ON public.site_team_roles(role);

CREATE TABLE IF NOT EXISTS public.chat_mutes (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  muted_until TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chat_automod_rules (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  rule_key TEXT UNIQUE NOT NULL,
  pattern TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'substring' CHECK (match_mode IN ('substring', 'regex')),
  strike_weight INTEGER NOT NULL DEFAULT 1 CHECK (strike_weight >= 1),
  mute_minutes INTEGER NOT NULL DEFAULT 15 CHECK (mute_minutes >= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.chat_automod_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  strikes INTEGER NOT NULL DEFAULT 0 CHECK (strikes >= 0),
  muted_until TIMESTAMPTZ,
  last_violation_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.chat_automod_events (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matched_rule_id BIGINT REFERENCES public.chat_automod_rules(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  message_preview TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Аудит действий создателя (критические действия панели: удаления, блокировки, смена подписок и т.д.)
CREATE TABLE IF NOT EXISTS public.creator_audit_logs (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_chat_mutes_muted_until ON public.chat_mutes(muted_until);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_team_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_automod_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_automod_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_automod_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_audit_logs ENABLE ROW LEVEL SECURITY;

-- Единственный источник creator-авторизации. Функция создаётся до любых зависимых RLS-политик.
CREATE OR REPLACE FUNCTION public.is_site_creator_user_id(user_id uuid)
RETURNS boolean
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
      AND lower(trim(coalesce(u.email::text, ''))) = 'creator@reminko.com'
  );
$$;

REVOKE ALL ON FUNCTION public.is_site_creator_user_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_site_creator_user_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_site_creator_user_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_creator_user_id(uuid) TO service_role;

-- global_chat_messages: reply_to и deleted_at
ALTER TABLE public.global_chat_messages ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES public.global_chat_messages(id) ON DELETE SET NULL;
ALTER TABLE public.global_chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- notifications: дополнительные поля
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

-- vip_subscriptions
ALTER TABLE public.vip_subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- friends
ALTER TABLE public.friends ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;

-- profiles: модерация и админ-панель (раньше role дропали — возвращаем опциональные поля)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sender_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL
  DEFAULT auth.uid();
ALTER TABLE public.notifications
  ALTER COLUMN sender_id SET DEFAULT auth.uid();

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

-- user_settings: дополнительные поля
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS auto_play_next_episode BOOLEAN DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS show_recommendations BOOLEAN DEFAULT true;

-- ============================================
-- 3. УДАЛЕНИЕ ТАБЛИЦ КОТОРЫХ НЕТ В СХЕМЕ
-- ============================================

DO $$
DECLARE
  _tbl TEXT;
  _allowed TEXT[] := ARRAY[
    'profiles',
    'favorites_anime',
    'favorites_manga',
    'watch_history',
    'user_settings',
    'minko_ai_state',
    'ai_subscriptions',
    'vip_subscriptions',
    'watch_together_sessions',
    'watch_together_participants',
    'watch_together_chat',
    'watch_together_voice_signals',
    'friends',
    'global_chat_messages',
    'global_chat_likes',
    'notifications',
    'user_achievements',
    'custom_anime',
    'catalog_site_anime',
    'catalog_4k_anime',
    'minko_ai_public_state',
    'minko_ai_server_logs',
    'avatar_ai_generations',
    'security_events',
    'security_rate_limits',
    'site_visit_events',
    'direct_messages',
    'dm_groups',
    'dm_group_members',
    'dm_group_messages',
    'admins',
    'site_team_roles',
    'chat_mutes',
    'chat_automod_rules',
    'chat_automod_state',
    'chat_automod_events',
    'creator_audit_logs',
    'site_maintenance_config',
    'minko_ai_chat_logs',
    'global_chat_whisper_secrets',
    'minko_ai_creator_secrets',
    'giveaway_campaign',
    'giveaway_participants',
    'giveaway_ref_clicks',
    'giveaway_ref_registrations',
    'giveaway_preregistrations'
  ];
BEGIN
  FOR _tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != ALL(_allowed)
  LOOP
    RAISE NOTICE 'Удаление лишней таблицы: public.%', _tbl;
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', _tbl);
  END LOOP;
END $$;

-- ============================================
-- 4. ИНДЕКСЫ (IF NOT EXISTS)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_sender_created ON public.notifications(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_global_chat_messages_user_id ON public.global_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_global_chat_messages_created_at ON public.global_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_chat_messages_deleted ON public.global_chat_messages(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_global_chat_messages_whisper_to
  ON public.global_chat_messages(whisper_to_user_id)
  WHERE whisper_to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_global_chat_likes_message_id ON public.global_chat_likes(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_automod_state_muted_until ON public.chat_automod_state(muted_until);
CREATE INDEX IF NOT EXISTS idx_chat_automod_events_user_created ON public.chat_automod_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_automod_events_created ON public.chat_automod_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_favorites_anime_user_id ON public.favorites_anime(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_manga_user_id ON public.favorites_manga(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON public.watch_history(user_id);

CREATE INDEX IF NOT EXISTS idx_friends_user_id ON public.friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON public.friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON public.friends(status);

CREATE INDEX IF NOT EXISTS idx_profiles_last_online ON public.profiles(last_online DESC);
CREATE INDEX IF NOT EXISTS idx_wt_voice_sig_session_created ON public.watch_together_voice_signals(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_custom_anime_title ON public.custom_anime(title);
CREATE INDEX IF NOT EXISTS idx_site_visit_created ON public.site_visit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visit_visitor ON public.site_visit_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_site_visit_user_created ON public.site_visit_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_audit_logs_created_at ON public.creator_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_audit_logs_action_created ON public.creator_audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_audit_logs_target_user
  ON public.creator_audit_logs(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_anime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_site_anime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites_anime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites_manga ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minko_ai_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_together_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_together_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_together_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_together_voice_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_chat_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.minko_ai_public_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minko_ai_server_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minko_ai_creator_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minko_ai_chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_chat_whisper_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_ai_generations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_team_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mutes ENABLE ROW LEVEL SECURITY;

-- ЛС (повторное ENABLE безопасно — состояние «уже включено»)
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. RLS ПОЛИТИКИ (DROP IF EXISTS + CREATE)
-- ============================================

-- profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
REVOKE INSERT, UPDATE ON public.profiles FROM anon;

-- favorites_anime (SELECT публичный — чужие списки видны; менять только свои)
DROP POLICY IF EXISTS "favorites_anime_all" ON public.favorites_anime;
DROP POLICY IF EXISTS "favorites_anime_select" ON public.favorites_anime;
DROP POLICY IF EXISTS "favorites_anime_insert" ON public.favorites_anime;
DROP POLICY IF EXISTS "favorites_anime_update" ON public.favorites_anime;
DROP POLICY IF EXISTS "favorites_anime_delete" ON public.favorites_anime;
DROP POLICY IF EXISTS "Пользователи могут управлять своим избранным аниме" ON public.favorites_anime;
CREATE POLICY "favorites_anime_select" ON public.favorites_anime FOR SELECT USING (true);
CREATE POLICY "favorites_anime_insert" ON public.favorites_anime FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_anime_update" ON public.favorites_anime FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_anime_delete" ON public.favorites_anime FOR DELETE USING (auth.uid() = user_id);

-- favorites_manga
DROP POLICY IF EXISTS "favorites_manga_all" ON public.favorites_manga;
DROP POLICY IF EXISTS "favorites_manga_select" ON public.favorites_manga;
DROP POLICY IF EXISTS "favorites_manga_insert" ON public.favorites_manga;
DROP POLICY IF EXISTS "favorites_manga_update" ON public.favorites_manga;
DROP POLICY IF EXISTS "favorites_manga_delete" ON public.favorites_manga;
DROP POLICY IF EXISTS "Пользователи могут управлять своим избранным мангой" ON public.favorites_manga;
CREATE POLICY "favorites_manga_select" ON public.favorites_manga FOR SELECT USING (true);
CREATE POLICY "favorites_manga_insert" ON public.favorites_manga FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_manga_update" ON public.favorites_manga FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_manga_delete" ON public.favorites_manga FOR DELETE USING (auth.uid() = user_id);

-- watch_history
DROP POLICY IF EXISTS "watch_history_all" ON public.watch_history;
DROP POLICY IF EXISTS "watch_history_select" ON public.watch_history;
DROP POLICY IF EXISTS "watch_history_insert" ON public.watch_history;
DROP POLICY IF EXISTS "watch_history_update" ON public.watch_history;
DROP POLICY IF EXISTS "watch_history_delete" ON public.watch_history;
CREATE POLICY "watch_history_select" ON public.watch_history FOR SELECT USING (true);
CREATE POLICY "watch_history_insert" ON public.watch_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watch_history_update" ON public.watch_history FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watch_history_delete" ON public.watch_history FOR DELETE USING (auth.uid() = user_id);

-- user_settings
DROP POLICY IF EXISTS "user_settings_all" ON public.user_settings;
CREATE POLICY "user_settings_all" ON public.user_settings FOR ALL USING (auth.uid() = user_id);

-- minko_ai_state
DROP POLICY IF EXISTS "minko_ai_state_all" ON public.minko_ai_state;
CREATE POLICY "minko_ai_state_all" ON public.minko_ai_state FOR ALL USING (auth.uid() = user_id);

-- ai_subscriptions
DROP POLICY IF EXISTS "ai_subscriptions_select" ON public.ai_subscriptions;
DROP POLICY IF EXISTS "ai_subscriptions_insert" ON public.ai_subscriptions;
DROP POLICY IF EXISTS "ai_subscriptions_update" ON public.ai_subscriptions;
DROP POLICY IF EXISTS "ai_subscriptions_site_creator_all" ON public.ai_subscriptions;
CREATE POLICY "ai_subscriptions_select" ON public.ai_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "ai_subscriptions_site_creator_all" ON public.ai_subscriptions FOR ALL TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

-- vip_subscriptions
DROP POLICY IF EXISTS "vip_subscriptions_select" ON public.vip_subscriptions;
DROP POLICY IF EXISTS "vip_subscriptions_insert" ON public.vip_subscriptions;
DROP POLICY IF EXISTS "vip_subscriptions_update" ON public.vip_subscriptions;
DROP POLICY IF EXISTS "vip_subscriptions_site_creator_all" ON public.vip_subscriptions;
CREATE POLICY "vip_subscriptions_select" ON public.vip_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "vip_subscriptions_site_creator_all" ON public.vip_subscriptions FOR ALL TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));
DROP POLICY IF EXISTS "vip_subscriptions_user_cancel" ON public.vip_subscriptions;
CREATE POLICY "vip_subscriptions_user_cancel" ON public.vip_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND is_active = false);

-- watch_together_sessions
DROP POLICY IF EXISTS "wt_sessions_select" ON public.watch_together_sessions;
DROP POLICY IF EXISTS "wt_sessions_insert" ON public.watch_together_sessions;
DROP POLICY IF EXISTS "wt_sessions_update" ON public.watch_together_sessions;
CREATE POLICY "wt_sessions_select" ON public.watch_together_sessions FOR SELECT USING (true);
CREATE POLICY "wt_sessions_insert" ON public.watch_together_sessions FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "wt_sessions_update" ON public.watch_together_sessions FOR UPDATE USING (auth.uid() = host_id);

-- watch_together_participants
DROP POLICY IF EXISTS "wt_participants_select" ON public.watch_together_participants;
DROP POLICY IF EXISTS "wt_participants_insert" ON public.watch_together_participants;
DROP POLICY IF EXISTS "wt_participants_delete" ON public.watch_together_participants;
CREATE POLICY "wt_participants_select" ON public.watch_together_participants FOR SELECT USING (true);
CREATE POLICY "wt_participants_insert" ON public.watch_together_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wt_participants_delete" ON public.watch_together_participants FOR DELETE USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.watch_together_sessions s
    WHERE s.id = watch_together_participants.session_id
      AND s.host_id = auth.uid()
      AND watch_together_participants.user_id <> s.host_id
  )
);
DROP POLICY IF EXISTS "wt_participants_update_own" ON public.watch_together_participants;
CREATE POLICY "wt_participants_update_own" ON public.watch_together_participants FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- watch_together_chat (хост видит и пишет чат, даже если строка в participants утеряна у старых комнат)
DROP POLICY IF EXISTS "wt_chat_select" ON public.watch_together_chat;
DROP POLICY IF EXISTS "wt_chat_insert" ON public.watch_together_chat;
CREATE POLICY "wt_chat_select" ON public.watch_together_chat FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM watch_together_participants p
    WHERE p.session_id = watch_together_chat.session_id AND p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM watch_together_sessions s
    WHERE s.id = watch_together_chat.session_id AND s.host_id = auth.uid()
  )
);
CREATE POLICY "wt_chat_insert" ON public.watch_together_chat FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1 FROM watch_together_participants p
      WHERE p.session_id = watch_together_chat.session_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM watch_together_sessions s
      WHERE s.id = watch_together_chat.session_id AND s.host_id = auth.uid()
    )
  )
);

-- Голос Watch Together: видим только сигналы, адресованные нам или отправленные нами
DROP POLICY IF EXISTS "wt_voice_sig_select" ON public.watch_together_voice_signals;
DROP POLICY IF EXISTS "wt_voice_sig_insert" ON public.watch_together_voice_signals;
CREATE POLICY "wt_voice_sig_select" ON public.watch_together_voice_signals FOR SELECT USING (
  (
    EXISTS (
      SELECT 1 FROM watch_together_participants p
      WHERE p.session_id = watch_together_voice_signals.session_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM watch_together_sessions s
      WHERE s.id = watch_together_voice_signals.session_id AND s.host_id = auth.uid()
    )
  )
  AND (to_user_id = auth.uid() OR from_user_id = auth.uid())
);
CREATE POLICY "wt_voice_sig_insert" ON public.watch_together_voice_signals FOR INSERT WITH CHECK (
  auth.uid() = from_user_id
  AND (
    EXISTS (
      SELECT 1 FROM watch_together_participants p
      WHERE p.session_id = watch_together_voice_signals.session_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM watch_together_sessions s
      WHERE s.id = watch_together_voice_signals.session_id AND s.host_id = auth.uid()
    )
  )
  AND (
    EXISTS (
      SELECT 1 FROM watch_together_participants p
      WHERE p.session_id = watch_together_voice_signals.session_id AND p.user_id = watch_together_voice_signals.to_user_id
    )
    OR EXISTS (
      SELECT 1 FROM watch_together_sessions s
      WHERE s.id = watch_together_voice_signals.session_id AND s.host_id = watch_together_voice_signals.to_user_id
    )
  )
  AND (
    signal_type <> 'mod_mute'
    OR EXISTS (
      SELECT 1 FROM watch_together_sessions s
      WHERE s.id = watch_together_voice_signals.session_id AND s.host_id = auth.uid()
    )
  )
);

-- global_chat_messages
DROP POLICY IF EXISTS "chat_select" ON public.global_chat_messages;
DROP POLICY IF EXISTS "chat_insert" ON public.global_chat_messages;
DROP POLICY IF EXISTS "chat_update_own" ON public.global_chat_messages;
DROP POLICY IF EXISTS "chat_delete" ON public.global_chat_messages;
DROP POLICY IF EXISTS "chat_update_creator" ON public.global_chat_messages;
CREATE POLICY "chat_select" ON public.global_chat_messages FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "chat_insert" ON public.global_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_update_own" ON public.global_chat_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "chat_update_creator" ON public.global_chat_messages FOR UPDATE TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "chat_delete" ON public.global_chat_messages FOR DELETE USING (auth.uid() = user_id);

-- global_chat_likes
DROP POLICY IF EXISTS "chat_likes_select" ON public.global_chat_likes;
DROP POLICY IF EXISTS "chat_likes_insert" ON public.global_chat_likes;
DROP POLICY IF EXISTS "chat_likes_delete" ON public.global_chat_likes;
CREATE POLICY "chat_likes_select" ON public.global_chat_likes FOR SELECT USING (true);
CREATE POLICY "chat_likes_insert" ON public.global_chat_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_likes_delete" ON public.global_chat_likes FOR DELETE USING (auth.uid() = user_id);

-- notifications
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_user" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_creator" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notifications_insert_creator" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND auth.uid() = 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb'::UUID
    AND lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'creator@reminko.com'
  );
CREATE POLICY "notifications_insert_user" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (type IN ('minko', 'new_episode') AND user_id = auth.uid())
      OR (
        type = 'friend_request'
        AND EXISTS (
          SELECT 1 FROM public.friends f
          WHERE f.user_id = auth.uid()
            AND f.friend_id = notifications.user_id
            AND f.status = 'pending'
        )
      )
      OR (
        type = 'friend_accepted'
        AND EXISTS (
          SELECT 1 FROM public.friends f
          WHERE f.user_id = notifications.user_id
            AND f.friend_id = auth.uid()
            AND f.status = 'accepted'
        )
      )
      OR (
        type = 'watch_together_invite'
        AND EXISTS (
          SELECT 1 FROM public.friends f
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
          SELECT 1 FROM public.watch_together_sessions s
          WHERE s.id = (data ->> 'session_id')::UUID
            AND s.host_id = notifications.user_id
            AND s.is_active = true
            AND s.host_id <> auth.uid()
        )
      )
    )
  );
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE ON public.notifications FROM anon;
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT INSERT ON public.notifications TO authenticated;
GRANT UPDATE (read, read_at) ON public.notifications TO authenticated;

-- friends
DROP POLICY IF EXISTS "friends_select" ON public.friends;
DROP POLICY IF EXISTS "friends_insert" ON public.friends;
DROP POLICY IF EXISTS "friends_update" ON public.friends;
DROP POLICY IF EXISTS "friends_delete" ON public.friends;
CREATE POLICY "friends_select" ON public.friends FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friends_insert" ON public.friends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "friends_update" ON public.friends FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friends_delete" ON public.friends FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- custom_anime
DROP POLICY IF EXISTS "custom_anime_select" ON public.custom_anime;
CREATE POLICY "custom_anime_select" ON public.custom_anime FOR SELECT USING (true);

-- catalog_site_anime (читать всем; изменять публичный каталог может только Создатель)
DROP POLICY IF EXISTS "catalog_site_anime_select" ON public.catalog_site_anime;
DROP POLICY IF EXISTS "catalog_site_anime_insert" ON public.catalog_site_anime;
DROP POLICY IF EXISTS "catalog_site_anime_update" ON public.catalog_site_anime;
DROP POLICY IF EXISTS "catalog_site_anime_delete" ON public.catalog_site_anime;
CREATE POLICY "catalog_site_anime_select" ON public.catalog_site_anime FOR SELECT USING (true);
DROP POLICY IF EXISTS "catalog_site_anime_insert_authenticated" ON public.catalog_site_anime;
DROP POLICY IF EXISTS "catalog_site_anime_insert_anon" ON public.catalog_site_anime;
CREATE POLICY "catalog_site_anime_insert_authenticated" ON public.catalog_site_anime FOR INSERT TO authenticated
  WITH CHECK (
    public.is_site_creator_user_id(auth.uid())
    AND added_by = auth.uid()
  );
CREATE POLICY "catalog_site_anime_update" ON public.catalog_site_anime FOR UPDATE TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "catalog_site_anime_delete" ON public.catalog_site_anime FOR DELETE TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()));
REVOKE INSERT ON public.catalog_site_anime FROM anon;

ALTER TABLE public.catalog_4k_anime ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_4k_anime_select" ON public.catalog_4k_anime;
CREATE POLICY "catalog_4k_anime_select" ON public.catalog_4k_anime
  FOR SELECT USING (
    published = true
    OR public.is_site_creator_user_id(auth.uid())
  );

DROP POLICY IF EXISTS "catalog_4k_anime_insert_authenticated" ON public.catalog_4k_anime;
DROP POLICY IF EXISTS "catalog_4k_anime_insert_anon" ON public.catalog_4k_anime;
CREATE POLICY "catalog_4k_anime_insert_authenticated" ON public.catalog_4k_anime
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_site_creator_user_id(auth.uid())
    AND added_by = auth.uid()
  );
REVOKE INSERT ON public.catalog_4k_anime FROM anon;

DROP POLICY IF EXISTS "catalog_4k_anime_update" ON public.catalog_4k_anime;
CREATE POLICY "catalog_4k_anime_update" ON public.catalog_4k_anime
  FOR UPDATE TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

DROP POLICY IF EXISTS "catalog_4k_anime_delete" ON public.catalog_4k_anime;
CREATE POLICY "catalog_4k_anime_delete" ON public.catalog_4k_anime
  FOR DELETE TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()));

-- user_achievements
DROP POLICY IF EXISTS "achievements_select_all" ON public.user_achievements;
DROP POLICY IF EXISTS "achievements_select_own" ON public.user_achievements;
CREATE POLICY "achievements_select_all" ON public.user_achievements FOR SELECT USING (true);

-- Функции для политик (должны существовать до CREATE POLICY, где они используются)
CREATE OR REPLACE FUNCTION public.get_user_email(user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  em text;
  caller_lower text;
BEGIN
  IF caller_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF caller_id = user_id THEN
    SELECT u.email::text INTO em FROM auth.users u WHERE u.id = user_id;
    RETURN em;
  END IF;
  SELECT lower(trim(coalesce(u.email::text, ''))) INTO caller_lower FROM auth.users u WHERE u.id = caller_id;
  IF caller_lower IS NOT NULL AND caller_lower = 'creator@reminko.com' THEN
    SELECT u.email::text INTO em FROM auth.users u WHERE u.id = user_id;
    RETURN em;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_email(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO service_role;

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

COMMENT ON COLUMN public.notifications.sender_id IS
  'Authenticated originator of the notification; introduced after the 2026-07-27 incident.';

CREATE OR REPLACE FUNCTION public.creator_full_delete_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_deleted_auth INTEGER := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.is_site_creator_user_id(v_actor) THEN
    RAISE EXCEPTION 'creator_full_delete_user: access denied';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'creator_full_delete_user: p_user_id is required';
  END IF;

  DELETE FROM public.notifications WHERE user_id = p_user_id;
  DELETE FROM public.chat_mutes WHERE user_id = p_user_id OR created_by = p_user_id;
  DELETE FROM public.global_chat_likes WHERE user_id = p_user_id;
  DELETE FROM public.global_chat_whisper_secrets
  WHERE message_id IN (
    SELECT id
    FROM public.global_chat_messages
    WHERE user_id = p_user_id OR whisper_to_user_id = p_user_id
  );
  DELETE FROM public.global_chat_messages WHERE user_id = p_user_id OR whisper_to_user_id = p_user_id;
  DELETE FROM public.watch_together_voice_signals WHERE from_user_id = p_user_id OR to_user_id = p_user_id;
  DELETE FROM public.watch_together_participants WHERE user_id = p_user_id;
  DELETE FROM public.watch_together_sessions WHERE host_id = p_user_id;
  DELETE FROM public.watch_together_chat WHERE user_id = p_user_id;
  DELETE FROM public.direct_messages WHERE sender_id = p_user_id OR receiver_id = p_user_id;
  DELETE FROM public.friends WHERE user_id = p_user_id OR friend_id = p_user_id;
  DELETE FROM public.site_visit_events WHERE user_id = p_user_id;
  DELETE FROM public.avatar_ai_generations WHERE user_id = p_user_id;
  DELETE FROM public.minko_ai_chat_logs WHERE user_id = p_user_id;
  DELETE FROM public.ai_subscriptions WHERE user_id = p_user_id;
  DELETE FROM public.vip_subscriptions WHERE user_id = p_user_id;
  DELETE FROM public.watch_history WHERE user_id = p_user_id;
  DELETE FROM public.favorites_anime WHERE user_id = p_user_id;
  DELETE FROM public.favorites_manga WHERE user_id = p_user_id;
  DELETE FROM public.user_achievements WHERE user_id = p_user_id;
  DELETE FROM public.user_settings WHERE user_id = p_user_id;
  DELETE FROM public.admins WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  DELETE FROM auth.users WHERE id = p_user_id;
  GET DIAGNOSTICS v_deleted_auth = ROW_COUNT;

  INSERT INTO public.creator_audit_logs (
    actor_user_id,
    action,
    target_user_id,
    target_type,
    reason,
    details
  ) VALUES (
    v_actor,
    'user_delete_full',
    p_user_id,
    'user',
    v_reason,
    jsonb_build_object(
      'auth_deleted', (v_deleted_auth > 0),
      'at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'auth_deleted', (v_deleted_auth > 0),
    'target_user_id', p_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.creator_full_delete_user(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.creator_full_delete_user(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.creator_full_delete_user(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_full_delete_user(UUID, TEXT) TO service_role;

DROP VIEW IF EXISTS public.profiles_with_email;
CREATE VIEW public.profiles_with_email
WITH (security_invoker = true)
AS
SELECT p.*, public.get_user_email(p.id) AS email
FROM public.profiles p;

REVOKE ALL ON public.profiles_with_email FROM PUBLIC;
REVOKE ALL ON public.profiles_with_email FROM anon;
GRANT SELECT ON public.profiles_with_email TO authenticated;

-- Minko AI: публичное состояние читают все; логи — только создатель (JWT); INSERT логов с сервера — через service_role
DROP POLICY IF EXISTS "minko_public_state_select_anon" ON public.minko_ai_public_state;
DROP POLICY IF EXISTS "minko_public_state_creator_update" ON public.minko_ai_public_state;
DROP POLICY IF EXISTS "minko_public_state_creator_insert" ON public.minko_ai_public_state;
DROP POLICY IF EXISTS "minko_ai_public_state_select" ON public.minko_ai_public_state;
DROP POLICY IF EXISTS "minko_ai_public_state_update_creator" ON public.minko_ai_public_state;
DROP POLICY IF EXISTS "minko_ai_public_state_insert_creator" ON public.minko_ai_public_state;
CREATE POLICY "minko_ai_public_state_select" ON public.minko_ai_public_state
  FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "minko_ai_public_state_update_creator" ON public.minko_ai_public_state FOR UPDATE TO authenticated
  USING ((SELECT public.is_site_creator_user_id(auth.uid())))
  WITH CHECK ((SELECT public.is_site_creator_user_id(auth.uid())));
CREATE POLICY "minko_ai_public_state_insert_creator" ON public.minko_ai_public_state FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_site_creator_user_id(auth.uid())) AND id = 1);

DROP POLICY IF EXISTS "minko_logs_creator_select" ON public.minko_ai_server_logs;
DROP POLICY IF EXISTS "minko_logs_creator_insert" ON public.minko_ai_server_logs;
DROP POLICY IF EXISTS "minko_logs_creator_delete" ON public.minko_ai_server_logs;
DROP POLICY IF EXISTS "minko_ai_server_logs_creator_select" ON public.minko_ai_server_logs;
DROP POLICY IF EXISTS "minko_ai_server_logs_creator_insert" ON public.minko_ai_server_logs;
DROP POLICY IF EXISTS "minko_ai_server_logs_creator_delete" ON public.minko_ai_server_logs;
CREATE POLICY "minko_ai_server_logs_creator_select" ON public.minko_ai_server_logs FOR SELECT TO authenticated
  USING ((SELECT public.is_site_creator_user_id(auth.uid())));
CREATE POLICY "minko_ai_server_logs_creator_insert" ON public.minko_ai_server_logs FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_site_creator_user_id(auth.uid())));
CREATE POLICY "minko_ai_server_logs_creator_delete" ON public.minko_ai_server_logs FOR DELETE TO authenticated
  USING ((SELECT public.is_site_creator_user_id(auth.uid())));

DROP POLICY IF EXISTS "minko_ai_creator_secrets_creator_all" ON public.minko_ai_creator_secrets;
CREATE POLICY "minko_ai_creator_secrets_creator_all" ON public.minko_ai_creator_secrets FOR ALL TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

DROP POLICY IF EXISTS "minko_ai_chat_logs_insert_own" ON public.minko_ai_chat_logs;
CREATE POLICY "minko_ai_chat_logs_insert_own" ON public.minko_ai_chat_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "minko_ai_chat_logs_select_creator" ON public.minko_ai_chat_logs;
CREATE POLICY "minko_ai_chat_logs_select_creator" ON public.minko_ai_chat_logs
  FOR SELECT TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()));

GRANT SELECT, INSERT ON public.minko_ai_chat_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.minko_ai_creator_secrets TO authenticated;
GRANT SELECT ON public.minko_ai_public_state TO anon, authenticated;

DROP POLICY IF EXISTS "gc_whisper_secret_insert_sender" ON public.global_chat_whisper_secrets;
CREATE POLICY "gc_whisper_secret_insert_sender" ON public.global_chat_whisper_secrets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.global_chat_messages m
      WHERE m.id = message_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "gc_whisper_secret_select_parties" ON public.global_chat_whisper_secrets;
CREATE POLICY "gc_whisper_secret_select_parties" ON public.global_chat_whisper_secrets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.global_chat_messages m
      WHERE m.id = message_id
        AND (m.user_id = auth.uid() OR m.whisper_to_user_id = auth.uid())
    )
  );

GRANT SELECT, INSERT ON public.global_chat_whisper_secrets TO authenticated;

DROP POLICY IF EXISTS "admins_select" ON public.admins;
DROP POLICY IF EXISTS "admins_insert" ON public.admins;
DROP POLICY IF EXISTS "admins_update" ON public.admins;
DROP POLICY IF EXISTS "admins_delete" ON public.admins;
CREATE POLICY "admins_select" ON public.admins FOR SELECT USING (
  auth.uid() = user_id OR public.is_site_creator_user_id(auth.uid())
);
CREATE POLICY "admins_insert" ON public.admins FOR INSERT WITH CHECK (
  public.is_site_creator_user_id(auth.uid())
);
CREATE POLICY "admins_update" ON public.admins FOR UPDATE USING (
  public.is_site_creator_user_id(auth.uid())
) WITH CHECK (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "admins_delete" ON public.admins FOR DELETE USING (
  public.is_site_creator_user_id(auth.uid())
);

DROP POLICY IF EXISTS "site_team_roles_select" ON public.site_team_roles;
DROP POLICY IF EXISTS "site_team_roles_insert" ON public.site_team_roles;
DROP POLICY IF EXISTS "site_team_roles_update" ON public.site_team_roles;
DROP POLICY IF EXISTS "site_team_roles_delete" ON public.site_team_roles;
CREATE POLICY "site_team_roles_select" ON public.site_team_roles FOR SELECT USING (
  auth.uid() IS NOT NULL
);
CREATE POLICY "site_team_roles_insert" ON public.site_team_roles FOR INSERT WITH CHECK (
  public.is_site_creator_user_id(auth.uid())
);
CREATE POLICY "site_team_roles_update" ON public.site_team_roles FOR UPDATE USING (
  public.is_site_creator_user_id(auth.uid())
) WITH CHECK (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "site_team_roles_delete" ON public.site_team_roles FOR DELETE USING (
  public.is_site_creator_user_id(auth.uid())
);

DROP POLICY IF EXISTS "chat_mutes_select" ON public.chat_mutes;
DROP POLICY IF EXISTS "chat_mutes_insert" ON public.chat_mutes;
DROP POLICY IF EXISTS "chat_mutes_update" ON public.chat_mutes;
DROP POLICY IF EXISTS "chat_mutes_delete" ON public.chat_mutes;
CREATE POLICY "chat_mutes_select" ON public.chat_mutes FOR SELECT USING (
  auth.uid() = user_id OR public.is_site_creator_user_id(auth.uid())
);
CREATE POLICY "chat_mutes_insert" ON public.chat_mutes FOR INSERT WITH CHECK (
  public.is_site_creator_user_id(auth.uid())
);
CREATE POLICY "chat_mutes_update" ON public.chat_mutes FOR UPDATE USING (
  public.is_site_creator_user_id(auth.uid())
) WITH CHECK (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "chat_mutes_delete" ON public.chat_mutes FOR DELETE USING (
  public.is_site_creator_user_id(auth.uid())
);

DROP POLICY IF EXISTS "chat_automod_rules_select_creator" ON public.chat_automod_rules;
DROP POLICY IF EXISTS "chat_automod_rules_manage_creator" ON public.chat_automod_rules;
CREATE POLICY "chat_automod_rules_select_creator" ON public.chat_automod_rules
  FOR SELECT TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "chat_automod_rules_manage_creator" ON public.chat_automod_rules
  FOR ALL TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

DROP POLICY IF EXISTS "chat_automod_state_select_owner_or_creator" ON public.chat_automod_state;
DROP POLICY IF EXISTS "chat_automod_state_manage_creator" ON public.chat_automod_state;
CREATE POLICY "chat_automod_state_select_owner_or_creator" ON public.chat_automod_state
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "chat_automod_state_manage_creator" ON public.chat_automod_state
  FOR ALL TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

DROP POLICY IF EXISTS "chat_automod_events_select_creator" ON public.chat_automod_events;
DROP POLICY IF EXISTS "chat_automod_events_manage_creator" ON public.chat_automod_events;
CREATE POLICY "chat_automod_events_select_creator" ON public.chat_automod_events
  FOR SELECT TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "chat_automod_events_manage_creator" ON public.chat_automod_events
  FOR ALL TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

DROP POLICY IF EXISTS "creator_audit_logs_creator_select" ON public.creator_audit_logs;
DROP POLICY IF EXISTS "creator_audit_logs_creator_insert" ON public.creator_audit_logs;
CREATE POLICY "creator_audit_logs_creator_select" ON public.creator_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "creator_audit_logs_creator_insert" ON public.creator_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_site_creator_user_id(auth.uid())
    AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
  );

-- site_visit_events: запись с сайта (anon/auth); просмотр и удаление старых записей — только создатель
DROP POLICY IF EXISTS "site_visit_events_insert" ON public.site_visit_events;
DROP POLICY IF EXISTS "site_visit_events_select_creator" ON public.site_visit_events;
DROP POLICY IF EXISTS "site_visit_events_delete_creator" ON public.site_visit_events;
CREATE POLICY "site_visit_events_insert" ON public.site_visit_events
  FOR INSERT
  WITH CHECK (
    length(visitor_id) BETWEEN 8 AND 64
    AND length(path) BETWEEN 1 AND 2048
    AND (user_id IS NULL OR user_id = auth.uid())
  );
CREATE POLICY "site_visit_events_select_creator" ON public.site_visit_events
  FOR SELECT TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()));
CREATE POLICY "site_visit_events_delete_creator" ON public.site_visit_events
  FOR DELETE TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()));

GRANT SELECT, INSERT ON public.site_visit_events TO anon;
GRANT SELECT, INSERT ON public.site_visit_events TO authenticated;
GRANT SELECT, INSERT ON public.creator_audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.creator_audit_logs TO service_role;

-- ============================================
-- 7. ТРИГГЕРЫ И ФУНКЦИИ
-- ============================================

-- get_user_email / is_site_creator_user_id — выше (перед политиками site_visit и admins).

-- Сводка посещений для дашборда создателя (одна RPC вместо тяжёлых выборок с клиента)
CREATE OR REPLACE FUNCTION public.site_visit_creator_bundle(p_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_site_creator_user_id(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'summary', COALESCE((
      SELECT jsonb_build_object(
        'total_events', COUNT(*)::bigint,
        'pageviews', COUNT(*) FILTER (WHERE event_kind = 'pageview')::bigint,
        'unique_visitors', COUNT(DISTINCT visitor_id)::bigint,
        'unique_logged_accounts', COUNT(DISTINCT user_id)::bigint,
        'events_by_logged_in', COUNT(*) FILTER (WHERE user_id IS NOT NULL)::bigint
      )
      FROM public.site_visit_events
      WHERE created_at >= p_since
    ), '{"total_events":0,"pageviews":0,"unique_visitors":0,"unique_logged_accounts":0,"events_by_logged_in":0}'::jsonb),
    'top_paths', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cnt DESC)
      FROM (
        SELECT path, COUNT(*)::bigint AS cnt
        FROM public.site_visit_events
        WHERE created_at >= p_since AND event_kind = 'pageview' AND path IS NOT NULL AND path <> ''
        GROUP BY path
        ORDER BY cnt DESC
        LIMIT 30
      ) t
    ), '[]'::jsonb),
    'by_day', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.day)
      FROM (
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::bigint AS cnt
        FROM public.site_visit_events
        WHERE created_at >= p_since
        GROUP BY 1
        ORDER BY 1
      ) t
    ), '[]'::jsonb)
  ) INTO j;

  RETURN j;
END;
$$;

REVOKE ALL ON FUNCTION public.site_visit_creator_bundle(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_visit_creator_bundle(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_visit_creator_bundle(timestamptz) TO service_role;

-- Живой блок аналитики для панели создателя (последние N минут).
CREATE OR REPLACE FUNCTION public.site_visit_creator_live(p_window_minutes integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes integer := LEAST(60, GREATEST(1, COALESCE(p_window_minutes, 15)));
  v_since timestamptz := now() - make_interval(mins => v_minutes);
  j jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_site_creator_user_id(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'window_minutes', v_minutes,
    'events', COUNT(*)::bigint,
    'pageviews', COUNT(*) FILTER (WHERE event_kind = 'pageview')::bigint,
    'logins', COUNT(*) FILTER (WHERE event_kind = 'action' AND event_label = 'login')::bigint,
    'unique_visitors', COUNT(DISTINCT visitor_id)::bigint
  )
  INTO j
  FROM public.site_visit_events
  WHERE created_at >= v_since;

  RETURN COALESCE(j, jsonb_build_object(
    'window_minutes', v_minutes,
    'events', 0,
    'pageviews', 0,
    'logins', 0,
    'unique_visitors', 0
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.site_visit_creator_live(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_visit_creator_live(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_visit_creator_live(integer) TO service_role;

-- Публичный счётчик «онлайн сейчас» для шапки сайта (anon/auth).
CREATE OR REPLACE FUNCTION public.site_visit_online_count(p_window_minutes integer DEFAULT 5)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT visitor_id)::integer
  FROM public.site_visit_events
  WHERE created_at >= now() - make_interval(mins => LEAST(15, GREATEST(1, COALESCE(p_window_minutes, 5))))
    AND (
      event_kind = 'pageview'
      OR (event_kind = 'action' AND event_label = 'heartbeat')
    );
$$;

REVOKE ALL ON FUNCTION public.site_visit_online_count(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_visit_online_count(integer) TO anon, authenticated;

-- Список «сейчас в сети» для панели создателя.
CREATE OR REPLACE FUNCTION public.site_visit_creator_online_users(p_window_minutes integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_minutes integer := LEAST(15, GREATEST(1, COALESCE(p_window_minutes, 5)));
  v_since timestamptz := now() - make_interval(mins => v_minutes);
  j jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_site_creator_user_id(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'visitor_id', l.visitor_id,
        'user_id', l.user_id,
        'username', p.username,
        'email', u.email,
        'last_path', l.last_path,
        'last_page_title', l.last_page_title,
        'last_seen', l.last_seen
      )
      ORDER BY l.last_seen DESC
    ),
    '[]'::jsonb
  )
  INTO j
  FROM (
    SELECT DISTINCT ON (e.visitor_id)
      e.visitor_id,
      e.user_id,
      e.path AS last_path,
      e.page_title AS last_page_title,
      e.created_at AS last_seen
    FROM public.site_visit_events e
    WHERE e.created_at >= v_since
      AND (
        e.event_kind = 'pageview'
        OR (e.event_kind = 'action' AND e.event_label = 'heartbeat')
      )
    ORDER BY e.visitor_id, e.created_at DESC
  ) l
  LEFT JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN auth.users u ON u.id = l.user_id;

  RETURN j;
END;
$$;

REVOKE ALL ON FUNCTION public.site_visit_creator_online_users(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_visit_creator_online_users(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_visit_creator_online_users(integer) TO service_role;

-- Глобальная пауза комнаты: любой участник (плеер/сеть); снимает только хост.
CREATE OR REPLACE FUNCTION public.wt_raise_sync_hold(p_session_id uuid, p_reason text DEFAULT 'issue')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Требуется вход';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.watch_together_participants wtp
    WHERE wtp.session_id = p_session_id AND wtp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Вы не в этой комнате';
  END IF;

  UPDATE public.watch_together_sessions
  SET
    sync_hold = true,
    sync_hold_reason = LEFT(COALESCE(NULLIF(trim(p_reason), ''), 'issue'), 240),
    is_playing = false,
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = p_session_id
    AND is_active = true
    AND COALESCE(sync_hold, false) = false;
END;
$$;

REVOKE ALL ON FUNCTION public.wt_raise_sync_hold(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wt_raise_sync_hold(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wt_raise_sync_hold(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.wt_clear_sync_hold(
  p_session_id uuid,
  p_episode integer DEFAULT NULL,
  p_playback_sec double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Требуется вход';
  END IF;

  UPDATE public.watch_together_sessions
  SET
    sync_hold = false,
    sync_hold_reason = NULL,
    sync_generation = COALESCE(sync_generation, 0) + 1,
    current_episode = CASE WHEN p_episode IS NOT NULL THEN p_episode ELSE current_episode END,
    playback_time = CASE WHEN p_playback_sec IS NOT NULL THEN p_playback_sec ELSE playback_time END,
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = p_session_id
    AND host_id = auth.uid()
    AND is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.wt_clear_sync_hold(uuid, integer, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wt_clear_sync_hold(uuid, integer, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wt_clear_sync_hold(uuid, integer, double precision) TO service_role;

-- «Смотреть вместе»: сдвиг метки активности комнаты (участник, не только хост)
CREATE OR REPLACE FUNCTION public.wt_bump_room_activity(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.watch_together_sessions s
  SET last_room_activity_at = TIMEZONE('utc'::text, NOW()),
      updated_at = TIMEZONE('utc'::text, NOW())
  WHERE s.id = p_session_id
    AND s.is_active = true
    AND EXISTS (
      SELECT 1 FROM public.watch_together_participants p
      WHERE p.session_id = s.id
        AND p.user_id = auth.uid()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.wt_bump_room_activity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wt_bump_room_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wt_bump_room_activity(uuid) TO service_role;

-- «Смотреть вместе»: закрыть одну комнату при 30+ мин без чата, bumps и воспроизведения (не только с клиента хоста)
CREATE OR REPLACE FUNCTION public.wt_close_idle_session_if_needed(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.watch_together_sessions%ROWTYPE;
  v_last timestamptz;
  v_chat_last timestamptz;
BEGIN
  SELECT * INTO v_row
  FROM public.watch_together_sessions
  WHERE id = p_session_id;

  IF NOT FOUND OR NOT COALESCE(v_row.is_active, false) THEN
    RETURN false;
  END IF;

  IF COALESCE(v_row.is_playing, false) THEN
    RETURN false;
  END IF;

  SELECT MAX(c.created_at) INTO v_chat_last
  FROM public.watch_together_chat c
  WHERE c.session_id = p_session_id;

  v_last := GREATEST(
    v_row.created_at,
    COALESCE(v_row.last_room_activity_at, v_row.created_at),
    COALESCE(v_chat_last, v_row.created_at)
  );

  IF v_last >= TIMEZONE('utc'::text, NOW()) - interval '30 minutes' THEN
    RETURN false;
  END IF;

  UPDATE public.watch_together_sessions
  SET is_active = false,
      updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = p_session_id
    AND is_active = true;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.wt_close_idle_session_if_needed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_session_if_needed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_session_if_needed(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_session_if_needed(uuid) TO service_role;

-- Массовое закрытие простаивших комнат (вызывается с сайта по таймеру / при открытии друзей)
CREATE OR REPLACE FUNCTION public.wt_close_idle_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed integer := 0;
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT s.id
    FROM public.watch_together_sessions s
    WHERE s.is_active = true
      AND COALESCE(s.is_playing, false) = false
  LOOP
    IF public.wt_close_idle_session_if_needed(v_rec.id) THEN
      v_closed := v_closed + 1;
    END IF;
  END LOOP;
  RETURN v_closed;
END;
$$;

REVOKE ALL ON FUNCTION public.wt_close_idle_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_sessions() TO anon;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_sessions() TO service_role;

INSERT INTO public.chat_automod_rules (rule_key, pattern, match_mode, strike_weight, mute_minutes, is_active, note)
VALUES
  ('badword_blya', 'бля', 'substring', 1, 15, true, 'Нецензурная лексика'),
  ('badword_eban', 'ебан', 'substring', 1, 15, true, 'Нецензурная лексика'),
  ('badword_huy', 'хуй', 'substring', 1, 15, true, 'Нецензурная лексика'),
  ('badword_pizd', 'пизд', 'substring', 1, 15, true, 'Нецензурная лексика'),
  ('badword_suka', 'сука', 'substring', 1, 15, true, 'Оскорбления'),
  ('badword_nahuy', 'нахуй', 'substring', 1, 15, true, 'Нецензурная лексика'),
  ('badword_dolboeb', 'долбоеб', 'substring', 1, 15, true, 'Оскорбления'),
  ('badword_uebal', 'уеб', 'substring', 1, 15, true, 'Оскорбления')
ON CONFLICT (rule_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_global_chat_automod(p_user_id uuid, p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := p_user_id;
  v_msg text := COALESCE(p_message, '');
  v_norm text := lower(COALESCE(p_message, ''));
  v_rule public.chat_automod_rules%ROWTYPE;
  v_state public.chat_automod_state%ROWTYPE;
  v_now timestamptz := TIMEZONE('utc'::text, NOW());
  v_new_strikes integer := 0;
  v_mute_until timestamptz;
  v_block text := null;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'action', 'error', 'message', 'Пользователь не определён');
  END IF;
  IF v_msg IS NULL OR length(trim(v_msg)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'action', 'error', 'message', 'Пустое сообщение');
  END IF;
  IF length(v_msg) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'action', 'error', 'message', 'Слишком длинное сообщение');
  END IF;

  IF public.is_site_creator_user_id(v_uid) THEN
    RETURN jsonb_build_object('ok', true, 'action', 'allow', 'bypass', 'creator');
  END IF;

  SELECT * INTO v_state FROM public.chat_automod_state WHERE user_id = v_uid;

  IF v_state.user_id IS NOT NULL AND v_state.muted_until IS NOT NULL AND v_state.muted_until > v_now THEN
    v_block := 'Автомодерация: отправка временно заблокирована.';
    INSERT INTO public.chat_automod_events(user_id, action, message_preview, details)
    VALUES (
      v_uid,
      'blocked_mute',
      left(v_msg, 180),
      jsonb_build_object('muted_until', v_state.muted_until)
    );
    RETURN jsonb_build_object(
      'ok', false,
      'action', 'blocked_mute',
      'message', v_block,
      'muted_until', v_state.muted_until
    );
  END IF;

  SELECT *
  INTO v_rule
  FROM public.chat_automod_rules r
  WHERE r.is_active = true
    AND (
      (r.match_mode = 'substring' AND position(lower(r.pattern) in v_norm) > 0)
      OR (r.match_mode = 'regex' AND v_norm ~ r.pattern)
    )
  ORDER BY r.strike_weight DESC, r.id ASC
  LIMIT 1;

  IF v_rule.id IS NULL THEN
    IF v_state.user_id IS NOT NULL AND v_state.strikes > 0 THEN
      UPDATE public.chat_automod_state
      SET strikes = GREATEST(0, strikes - 1), updated_at = v_now
      WHERE user_id = v_uid;
    END IF;
    RETURN jsonb_build_object('ok', true, 'action', 'allow');
  END IF;

  INSERT INTO public.chat_automod_state(user_id, strikes, muted_until, last_violation_at, updated_at)
  VALUES (v_uid, v_rule.strike_weight, null, v_now, v_now)
  ON CONFLICT (user_id) DO UPDATE
    SET strikes = public.chat_automod_state.strikes + EXCLUDED.strikes,
        last_violation_at = v_now,
        updated_at = v_now
  RETURNING * INTO v_state;

  v_new_strikes := COALESCE(v_state.strikes, 0);

  IF v_new_strikes >= 2 THEN
    v_mute_until := v_now + make_interval(mins => GREATEST(1, COALESCE(v_rule.mute_minutes, 15)));

    INSERT INTO public.chat_mutes(user_id, muted_until, reason, created_by)
    VALUES (v_uid, v_mute_until, 'automod:toxic_language', null)
    ON CONFLICT (user_id) DO UPDATE
      SET muted_until = GREATEST(public.chat_mutes.muted_until, EXCLUDED.muted_until),
          reason = EXCLUDED.reason,
          created_by = null,
          created_at = v_now;

    UPDATE public.chat_automod_state
    SET muted_until = v_mute_until, updated_at = v_now
    WHERE user_id = v_uid;

    INSERT INTO public.chat_automod_events(user_id, matched_rule_id, action, message_preview, details)
    VALUES (
      v_uid,
      v_rule.id,
      'mute',
      left(v_msg, 180),
      jsonb_build_object('strikes', v_new_strikes, 'mute_minutes', v_rule.mute_minutes, 'muted_until', v_mute_until)
    );

    RETURN jsonb_build_object(
      'ok', false,
      'action', 'mute',
      'message', 'Обнаружена ругань. Чат временно заблокирован автоматической модерацией.',
      'muted_until', v_mute_until,
      'strikes', v_new_strikes
    );
  END IF;

  INSERT INTO public.chat_automod_events(user_id, matched_rule_id, action, message_preview, details)
  VALUES (
    v_uid,
    v_rule.id,
    'warn',
    left(v_msg, 180),
    jsonb_build_object('strikes', v_new_strikes)
  );

  RETURN jsonb_build_object(
    'ok', false,
    'action', 'warn',
    'message', 'Пожалуйста, без ругани. Следующее нарушение временно отключит отправку сообщений.',
    'strikes', v_new_strikes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_global_chat_automod(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_global_chat_automod(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_global_chat_automod(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_global_chat_automod_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check jsonb;
  v_action text;
BEGIN
  v_check := public.enforce_global_chat_automod(NEW.user_id, NEW.message);
  IF COALESCE((v_check->>'ok')::boolean, false) THEN
    RETURN NEW;
  END IF;

  v_action := COALESCE(v_check->>'action', 'error');

  IF v_action = 'warn' THEN
    RAISE EXCEPTION '%', 'AUTOMOD_WARN|' || COALESCE(v_check->>'message', 'Предупреждение модерации');
  ELSIF v_action IN ('mute', 'blocked_mute') THEN
    RAISE EXCEPTION '%', 'AUTOMOD_BLOCK|' || COALESCE(v_check->>'message', 'Чат временно заблокирован') || '|' || COALESCE(v_check->>'muted_until', '');
  ELSE
    RAISE EXCEPTION '%', 'AUTOMOD_ERROR|' || COALESCE(v_check->>'message', 'Сообщение отклонено модерацией');
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tr_global_chat_automod_before_insert ON public.global_chat_messages;
CREATE TRIGGER tr_global_chat_automod_before_insert
  BEFORE INSERT ON public.global_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_global_chat_automod_before_insert();

CREATE OR REPLACE FUNCTION public.send_global_chat_message_safe(
  p_message text,
  p_reply_to uuid DEFAULT NULL
)
RETURNS public.global_chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.global_chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.global_chat_messages (user_id, message, reply_to)
  VALUES (v_uid, trim(COALESCE(p_message, '')), p_reply_to)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.send_global_chat_message_safe(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_global_chat_message_safe(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_global_chat_message_safe(text, uuid) TO service_role;

-- Общий чат: хранить не более 50 неудалённых сообщений
CREATE OR REPLACE FUNCTION public._trim_global_chat_to_50()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  surplus uuid[];
BEGIN
  SELECT array_agg(id) INTO surplus
  FROM (
    SELECT id
    FROM public.global_chat_messages
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    OFFSET 50
  ) x;

  IF surplus IS NOT NULL AND array_length(surplus, 1) > 0 THEN
    DELETE FROM public.global_chat_messages WHERE id = ANY(surplus);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_global_chat_retention_50 ON public.global_chat_messages;
CREATE TRIGGER tr_global_chat_retention_50
  AFTER INSERT ON public.global_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public._trim_global_chat_to_50();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_username TEXT;
  telegram_id_val TEXT;
BEGIN
  -- Анонимный вход (messages.html): профиль создаёт клиент через upsert после ввода имени
  IF COALESCE(NEW.is_anonymous, false) = true THEN
    RETURN NEW;
  END IF;

  IF
    (NEW.email IS NULL OR length(trim(coalesce(NEW.email, ''))) = 0)
    AND (
      COALESCE(NEW.raw_app_meta_data->>'provider', '') = 'anonymous'
      OR (NEW.raw_app_meta_data->'providers')::text ILIKE '%"anonymous"%'
    )
  THEN
    RETURN NEW;
  END IF;

  telegram_id_val := NEW.raw_user_meta_data->>'telegram_id';

  IF telegram_id_val IS NOT NULL THEN
    profile_username := COALESCE(
      NEW.raw_user_meta_data->>'telegram_username',
      NEW.raw_user_meta_data->>'first_name',
      'Пользователь_' || substring(telegram_id_val from 1 for 8)
    );
  ELSE
    profile_username := COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
      NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(trim(split_part(coalesce(NEW.email, ''), '@', 1)), ''),
      'user_' || substring(replace(NEW.id::text, '-', '') from 1 for 8)
    );
  END IF;

  INSERT INTO public.profiles (id, username, avatar, gender, telegram_id, profile_setup_done)
  VALUES (
    NEW.id,
    profile_username,
    COALESCE(
      NEW.raw_user_meta_data->>'photo_url',
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture',
      NEW.raw_user_meta_data->>'avatar',
      'Fons/1 b.jpg'
    ),
    CASE
      WHEN lower(trim(coalesce(NEW.raw_user_meta_data->>'gender', ''))) IN ('male', 'female')
        THEN lower(trim(NEW.raw_user_meta_data->>'gender'))
      ELSE 'male'
    END,
    telegram_id_val,
    (lower(trim(coalesce(NEW.raw_user_meta_data->>'gender', ''))) IN ('male', 'female'))
  )
  ON CONFLICT (id) DO UPDATE SET
    telegram_id = COALESCE(EXCLUDED.telegram_id, profiles.telegram_id),
    updated_at = TIMEZONE('utc'::text, NOW());

  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.ai_subscriptions (user_id, subscription_type, messages_limit, messages_used, last_reset_date)
  VALUES (NEW.id, 'free', 50, 0, NOW()) ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Гостевые ЛС: RPC + sync metadata → profiles (см. sql/pending/20260724_guest_dm_profile_sync.sql)
CREATE OR REPLACE FUNCTION public.reminko_set_own_guest_profile(
  p_username text,
  p_avatar text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text := left(trim(coalesce(p_username, '')), 40);
  av text := nullif(trim(coalesce(p_avatar, '')), '');
  gender_val text;
  row_out public.profiles;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF uname IS NULL OR length(uname) < 3 THEN
    RAISE EXCEPTION 'invalid_username';
  END IF;
  IF lower(uname) IN ('guest', 'гость', 'anonymous', 'anon') THEN
    RAISE EXCEPTION 'invalid_username';
  END IF;
  IF uname ~* '^user_[a-f0-9]{6,}$' OR uname ~* '^guest[\W_0-9-]*$' THEN
    RAISE EXCEPTION 'invalid_username';
  END IF;

  av := coalesce(av, 'Fons/1 b.jpg');
  gender_val := CASE
    WHEN av ~* '(^|/)Fons/[0-9]+[[:space:]]+g\.jpg$' THEN 'female'
    ELSE 'male'
  END;

  INSERT INTO public.profiles AS p (id, username, avatar, gender)
  VALUES (uid, uname, av, gender_val)
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    avatar = EXCLUDED.avatar,
    gender = EXCLUDED.gender,
    updated_at = timezone('utc'::text, now())
  RETURNING * INTO row_out;

  RETURN row_out;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_set_own_guest_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminko_set_own_guest_profile(text, text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.handle_anon_user_meta_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uname text;
  av text;
  gender_val text;
BEGIN
  IF COALESCE(NEW.is_anonymous, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  uname := left(trim(COALESCE(
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    ''
  )), 40);
  av := nullif(trim(COALESCE(
    NEW.raw_user_meta_data->>'avatar',
    NEW.raw_user_meta_data->>'avatar_url',
    ''
  )), '');

  IF uname IS NULL OR length(uname) < 3 THEN
    RETURN NEW;
  END IF;
  IF lower(uname) IN ('guest', 'гость', 'anonymous', 'anon') THEN
    RETURN NEW;
  END IF;
  IF uname ~* '^user_[a-f0-9]{6,}$' OR uname ~* '^guest[\W_0-9-]*$' THEN
    RETURN NEW;
  END IF;

  av := coalesce(av, 'Fons/1 b.jpg');
  gender_val := CASE
    WHEN av ~* '(^|/)Fons/[0-9]+[[:space:]]+g\.jpg$' THEN 'female'
    ELSE 'male'
  END;

  INSERT INTO public.profiles AS p (id, username, avatar, gender)
  VALUES (NEW.id, uname, av, gender_val)
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    avatar = EXCLUDED.avatar,
    gender = EXCLUDED.gender,
    updated_at = timezone('utc'::text, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_anon_meta ON auth.users;
CREATE TRIGGER on_auth_user_anon_meta
  AFTER UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW
  WHEN (COALESCE(NEW.is_anonymous, false) = true)
  EXECUTE FUNCTION public.handle_anon_user_meta_sync();

CREATE OR REPLACE FUNCTION public.reset_cooldown_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_subscriptions
  SET messages_used = 0, last_reset_date = NOW()
  WHERE subscription_type = 'free'
    AND messages_used >= 50
    AND last_reset_date < NOW() - INTERVAL '12 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_session_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  code TEXT;
  exists_check INTEGER;
BEGIN
  LOOP
    code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
    SELECT COUNT(*) INTO exists_check FROM public.watch_together_sessions WHERE session_code = code;
    EXIT WHEN exists_check = 0;
  END LOOP;
  RETURN code;
END;
$$;

-- ============================================
-- 7.1. ПРАВА НА RPC-ФУНКЦИИ
-- ============================================

-- Служебные SECURITY DEFINER-функции нужны триггерам/серверу, но не должны быть публичными RPC.
REVOKE ALL ON FUNCTION public._trim_global_chat_to_50() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_global_chat_automod_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_global_chat_automod(uuid, text) FROM PUBLIC, anon, authenticated;

-- Клиентские RPC: только авторизованные пользователи и service_role.
REVOKE ALL ON FUNCTION public.send_global_chat_message_safe(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_global_chat_message_safe(text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.site_visit_creator_bundle(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_visit_creator_bundle(timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.site_visit_creator_live(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_visit_creator_live(integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.site_visit_online_count(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_visit_online_count(integer) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.site_visit_creator_online_users(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_visit_creator_online_users(integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.wt_raise_sync_hold(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_raise_sync_hold(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.wt_clear_sync_hold(uuid, integer, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_clear_sync_hold(uuid, integer, double precision) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.wt_bump_room_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_bump_room_activity(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.wt_close_idle_session_if_needed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_session_if_needed(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.wt_close_idle_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_sessions() TO authenticated, service_role;

-- Legacy helpers retained for compatibility but not exposed to browser clients.
REVOKE ALL ON FUNCTION public.reset_cooldown_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_cooldown_messages() TO service_role;

REVOKE ALL ON FUNCTION public.generate_session_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_session_code() TO service_role;

-- ============================================
-- 8. REALTIME
-- ============================================

DO $$ 
BEGIN 
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.global_chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.global_chat_likes;
  EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    -- ЛС: без этого Realtime-подписка в direct-messages.js (postgres_changes INSERT) не получает события
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    -- «Смотреть вместе»: мгновенный эфир/пауза у гостей (watch-together.js postgres_changes UPDATE)
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_together_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    -- Опционально: мгновенный голосовой сигналинг (сейчас клиент опрашивает таблицу)
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_together_voice_signals;
  EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- ============================================
-- 8b. RLS: site_maintenance_config (таблица создана в §1)
-- ============================================

ALTER TABLE public.site_maintenance_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_maintenance_select" ON public.site_maintenance_config;
DROP POLICY IF EXISTS "site_maintenance_update" ON public.site_maintenance_config;

CREATE POLICY "site_maintenance_select" ON public.site_maintenance_config FOR SELECT USING (true);

CREATE POLICY "site_maintenance_update" ON public.site_maintenance_config FOR UPDATE TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

DROP POLICY IF EXISTS "site_maintenance_insert" ON public.site_maintenance_config;
CREATE POLICY "site_maintenance_insert" ON public.site_maintenance_config FOR INSERT TO authenticated
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

-- REST API (anon): без GRANT PostgREST отдаёт 401/permission; колонки — только реальные
GRANT SELECT ON public.site_maintenance_config TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;

-- ============================================
-- 9. ОЧИСТКА УСТАРЕВШИХ ФУНКЦИЙ
-- ============================================

DROP FUNCTION IF EXISTS reset_daily_messages();

-- ============================================
-- 10. РОЗЫГРЫШ
-- ============================================

CREATE TABLE IF NOT EXISTS public.giveaway_preregistrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'both')),
  tiktok_handle TEXT,
  instagram_handle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT giveaway_prereg_handles CHECK (
    (platform = 'tiktok' AND tiktok_handle IS NOT NULL AND instagram_handle IS NULL)
    OR (platform = 'instagram' AND instagram_handle IS NOT NULL AND tiktok_handle IS NULL)
    OR (platform = 'both' AND tiktok_handle IS NOT NULL AND instagram_handle IS NOT NULL)
  ),
  CONSTRAINT giveaway_prereg_tiktok_fmt CHECK (
    tiktok_handle IS NULL OR tiktok_handle ~ '^[a-z0-9._]{1,30}$'
  ),
  CONSTRAINT giveaway_prereg_instagram_fmt CHECK (
    instagram_handle IS NULL OR instagram_handle ~ '^[a-z0-9._]{1,30}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_giveaway_prereg_created
  ON public.giveaway_preregistrations(created_at DESC);

ALTER TABLE public.giveaway_preregistrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "giveaway_prereg_own_read" ON public.giveaway_preregistrations;
CREATE POLICY "giveaway_prereg_own_read" ON public.giveaway_preregistrations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "giveaway_prereg_creator_all" ON public.giveaway_preregistrations;
CREATE POLICY "giveaway_prereg_creator_all" ON public.giveaway_preregistrations
  FOR ALL TO authenticated
  USING (public.is_site_creator_user_id(auth.uid()))
  WITH CHECK (public.is_site_creator_user_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.giveaway_normalize_social_handle(p_handle TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v TEXT;
BEGIN
  v := lower(trim(coalesce(p_handle, '')));
  IF v LIKE '@%' THEN
    v := substring(v from 2);
  END IF;
  IF v = '' OR v !~ '^[a-z0-9._]{1,30}$' THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.giveaway_prereg_save(
  p_platform TEXT,
  p_tiktok_handle TEXT DEFAULT NULL,
  p_instagram_handle TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  platform TEXT,
  tiktok_handle TEXT,
  instagram_handle TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_platform TEXT;
  v_tiktok TEXT;
  v_instagram TEXT;
  v_end TIMESTAMPTZ := '2026-07-31T21:59:59.000Z'::timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'Требуется авторизация', NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF now() > v_end THEN
    RETURN QUERY SELECT false, 'Розыгрыш завершён — предрегистрация закрыта', NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_platform := lower(trim(coalesce(p_platform, '')));
  IF v_platform NOT IN ('tiktok', 'instagram', 'both') THEN
    RETURN QUERY SELECT false, 'Выберите платформу: TikTok, Instagram или обе', NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_tiktok := public.giveaway_normalize_social_handle(p_tiktok_handle);
  v_instagram := public.giveaway_normalize_social_handle(p_instagram_handle);

  IF v_platform = 'tiktok' AND v_tiktok IS NULL THEN
    RETURN QUERY SELECT false, 'Укажите ник TikTok (например @username)', NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_platform = 'instagram' AND v_instagram IS NULL THEN
    RETURN QUERY SELECT false, 'Укажите ник Instagram (например @username)', NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_platform = 'both' AND (v_tiktok IS NULL OR v_instagram IS NULL) THEN
    RETURN QUERY SELECT false, 'Укажите ники для TikTok и Instagram', NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_platform = 'tiktok' THEN
    v_instagram := NULL;
  ELSIF v_platform = 'instagram' THEN
    v_tiktok := NULL;
  END IF;

  INSERT INTO public.giveaway_preregistrations (
    user_id, platform, tiktok_handle, instagram_handle, updated_at
  ) VALUES (
    v_uid, v_platform, v_tiktok, v_instagram, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    platform = EXCLUDED.platform,
    tiktok_handle = EXCLUDED.tiktok_handle,
    instagram_handle = EXCLUDED.instagram_handle,
    updated_at = now();

  RETURN QUERY SELECT true, 'Предрегистрация сохранена', v_platform, v_tiktok, v_instagram;
END;
$$;

REVOKE ALL ON FUNCTION public.giveaway_prereg_save(TEXT, TEXT, TEXT) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.giveaway_prereg_my_status()
RETURNS TABLE(
  is_registered BOOLEAN,
  platform TEXT,
  tiktok_handle TEXT,
  instagram_handle TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    true,
    gp.platform,
    gp.tiktok_handle,
    gp.instagram_handle,
    gp.created_at,
    gp.updated_at
  FROM public.giveaway_preregistrations gp
  WHERE gp.user_id = v_uid;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.giveaway_prereg_my_status() FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.giveaway_prereg_creator_list()
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  email TEXT,
  platform TEXT,
  tiktok_handle TEXT,
  instagram_handle TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_site_creator_user_id(auth.uid()) THEN
    RAISE EXCEPTION 'Доступ только для создателя сайта';
  END IF;

  RETURN QUERY
  SELECT
    gp.user_id,
    coalesce(p.username, '—') AS username,
    coalesce(u.email::text, '—') AS email,
    gp.platform,
    gp.tiktok_handle,
    gp.instagram_handle,
    gp.created_at,
    gp.updated_at
  FROM public.giveaway_preregistrations gp
  LEFT JOIN public.profiles p ON p.id = gp.user_id
  LEFT JOIN auth.users u ON u.id = gp.user_id
  ORDER BY gp.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.giveaway_prereg_creator_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.giveaway_prereg_creator_list() TO authenticated;

-- Участие: ник соцсети + реф-ссылка одним шагом
DROP FUNCTION IF EXISTS public.giveaway_join();
DROP FUNCTION IF EXISTS public.giveaway_creator_stats();

CREATE OR REPLACE FUNCTION public.giveaway_join(
  p_platform TEXT,
  p_tiktok_handle TEXT DEFAULT NULL,
  p_instagram_handle TEXT DEFAULT NULL
)
RETURNS TABLE(
  ref_code TEXT,
  share_path TEXT,
  joined_at TIMESTAMPTZ,
  platform TEXT,
  tiktok_handle TEXT,
  instagram_handle TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT;
  v_joined TIMESTAMPTZ;
  v_starts_at TIMESTAMPTZ := TIMESTAMPTZ '2026-07-17 22:00:00+00';
  v_ends_at TIMESTAMPTZ := TIMESTAMPTZ '2026-07-31 21:59:59+00';
  v_platform TEXT;
  v_tiktok TEXT;
  v_instagram TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.giveaway_campaign WHERE id = 1 AND is_active = true) THEN
    RAISE EXCEPTION 'Розыгрыш сейчас не активен';
  END IF;

  IF NOW() < v_starts_at THEN
    RAISE EXCEPTION 'Участие откроется 18 июля 2026';
  END IF;

  IF NOW() > v_ends_at THEN
    RAISE EXCEPTION 'Розыгрыш завершён';
  END IF;

  SELECT gp.ref_code, gp.joined_at INTO v_code, v_joined
  FROM public.giveaway_participants gp
  WHERE gp.user_id = v_uid;

  IF v_code IS NOT NULL THEN
    SELECT pr.platform, pr.tiktok_handle, pr.instagram_handle
    INTO v_platform, v_tiktok, v_instagram
    FROM public.giveaway_preregistrations pr
    WHERE pr.user_id = v_uid;

    RETURN QUERY SELECT v_code, '/r/' || v_code, v_joined, v_platform, v_tiktok, v_instagram;
    RETURN;
  END IF;

  v_platform := lower(trim(coalesce(p_platform, '')));
  IF v_platform NOT IN ('tiktok', 'instagram', 'both') THEN
    RAISE EXCEPTION 'Выберите платформу: TikTok, Instagram или обе';
  END IF;

  v_tiktok := public.giveaway_normalize_social_handle(p_tiktok_handle);
  v_instagram := public.giveaway_normalize_social_handle(p_instagram_handle);

  IF v_platform = 'tiktok' AND v_tiktok IS NULL THEN
    RAISE EXCEPTION 'Укажите ник TikTok (например @username)';
  END IF;

  IF v_platform = 'instagram' AND v_instagram IS NULL THEN
    RAISE EXCEPTION 'Укажите ник Instagram (например @username)';
  END IF;

  IF v_platform = 'both' AND (v_tiktok IS NULL OR v_instagram IS NULL) THEN
    RAISE EXCEPTION 'Укажите ники для TikTok и Instagram';
  END IF;

  IF v_platform = 'tiktok' THEN
    v_instagram := NULL;
  ELSIF v_platform = 'instagram' THEN
    v_tiktok := NULL;
  END IF;

  INSERT INTO public.giveaway_preregistrations (
    user_id, platform, tiktok_handle, instagram_handle, updated_at
  ) VALUES (
    v_uid, v_platform, v_tiktok, v_instagram, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    platform = EXCLUDED.platform,
    tiktok_handle = EXCLUDED.tiktok_handle,
    instagram_handle = EXCLUDED.instagram_handle,
    updated_at = now();

  LOOP
    v_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.giveaway_participants p WHERE p.ref_code = v_code
    );
  END LOOP;

  INSERT INTO public.giveaway_participants AS gp (user_id, ref_code)
  VALUES (v_uid, v_code)
  RETURNING gp.joined_at INTO v_joined;

  RETURN QUERY SELECT v_code, '/r/' || v_code, v_joined, v_platform, v_tiktok, v_instagram;
END;
$$;

REVOKE ALL ON FUNCTION public.giveaway_join(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.giveaway_join(TEXT, TEXT, TEXT) TO authenticated;

-- Статус участника + добавление второй соцсети + правка профиля (ref_code не меняется)
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
   can_add_social boolean,
   can_edit_profile boolean
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
  v_ends_at TIMESTAMPTZ := TIMESTAMPTZ '2026-07-31 21:59:59+00';
  v_can_edit BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::TEXT, 0::BIGINT, 0::BIGINT, NULL::TIMESTAMPTZ,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, false, false;
    RETURN;
  END IF;

  SELECT gp.ref_code, gp.joined_at INTO v_code, v_joined
  FROM public.giveaway_participants gp
  WHERE gp.user_id = v_uid;

  IF v_code IS NULL THEN
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::TEXT, 0::BIGINT, 0::BIGINT, NULL::TIMESTAMPTZ,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, false, false;
    RETURN;
  END IF;

  SELECT pr.platform, pr.tiktok_handle, pr.instagram_handle
  INTO v_platform, v_tiktok, v_instagram
  FROM public.giveaway_preregistrations pr
  WHERE pr.user_id = v_uid;

  v_can_edit := NOW() <= v_ends_at;

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
      AND v_can_edit
    ),
    v_can_edit;
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

CREATE OR REPLACE FUNCTION public.giveaway_update_profile(
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
  v_starts_at TIMESTAMPTZ := TIMESTAMPTZ '2026-07-17 22:00:00+00';
  v_ends_at TIMESTAMPTZ := TIMESTAMPTZ '2026-07-31 21:59:59+00';
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'Требуется авторизация', NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF NOW() < v_starts_at THEN
    RETURN QUERY SELECT false, 'Участие ещё не открыто', NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF NOW() > v_ends_at THEN
    RETURN QUERY SELECT false, 'Розыгрыш завершён — данные больше нельзя менять', NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT gp.ref_code INTO v_code
  FROM public.giveaway_participants gp
  WHERE gp.user_id = v_uid;

  IF v_code IS NULL THEN
    RETURN QUERY SELECT false, 'Сначала нажмите «Участвую»', NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_platform := lower(trim(coalesce(p_platform, '')));
  IF v_platform NOT IN ('tiktok', 'instagram', 'both') THEN
    RETURN QUERY SELECT false, 'Выберите платформу: TikTok, Instagram или обе', NULL::TEXT, NULL::TEXT, NULL::TEXT, v_code, '/r/' || v_code;
    RETURN;
  END IF;

  v_tiktok := public.giveaway_normalize_social_handle(p_tiktok_handle);
  v_instagram := public.giveaway_normalize_social_handle(p_instagram_handle);

  IF v_platform = 'tiktok' AND v_tiktok IS NULL THEN
    RETURN QUERY SELECT false, 'Укажите ник TikTok (например @username)', NULL::TEXT, NULL::TEXT, NULL::TEXT, v_code, '/r/' || v_code;
    RETURN;
  END IF;

  IF v_platform = 'instagram' AND v_instagram IS NULL THEN
    RETURN QUERY SELECT false, 'Укажите ник Instagram (например @username)', NULL::TEXT, NULL::TEXT, NULL::TEXT, v_code, '/r/' || v_code;
    RETURN;
  END IF;

  IF v_platform = 'both' AND (v_tiktok IS NULL OR v_instagram IS NULL) THEN
    RETURN QUERY SELECT false, 'Укажите ники для TikTok и Instagram', NULL::TEXT, NULL::TEXT, NULL::TEXT, v_code, '/r/' || v_code;
    RETURN;
  END IF;

  IF v_platform = 'tiktok' THEN
    v_instagram := NULL;
  ELSIF v_platform = 'instagram' THEN
    v_tiktok := NULL;
  END IF;

  INSERT INTO public.giveaway_preregistrations (
    user_id, platform, tiktok_handle, instagram_handle, updated_at
  ) VALUES (
    v_uid, v_platform, v_tiktok, v_instagram, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    platform = EXCLUDED.platform,
    tiktok_handle = EXCLUDED.tiktok_handle,
    instagram_handle = EXCLUDED.instagram_handle,
    updated_at = now();

  RETURN QUERY SELECT
    true,
    'Данные обновлены',
    v_platform,
    v_tiktok,
    v_instagram,
    v_code,
    '/r/' || v_code;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.giveaway_my_status() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.giveaway_add_social(text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.giveaway_update_profile(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.giveaway_update_profile(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.giveaway_creator_stats()
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  email TEXT,
  ref_code TEXT,
  joined_at TIMESTAMPTZ,
  unique_clicks BIGINT,
  registrations BIGINT,
  last_click_at TIMESTAMPTZ,
  platform TEXT,
  tiktok_handle TEXT,
  instagram_handle TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_site_creator_user_id(auth.uid()) THEN
    RAISE EXCEPTION 'Доступ только для создателя сайта';
  END IF;

  RETURN QUERY
  SELECT
    gp.user_id,
    coalesce(p.username, '—') AS username,
    coalesce(u.email::text, '—') AS email,
    gp.ref_code,
    gp.joined_at,
    (SELECT COUNT(*)::BIGINT FROM public.giveaway_ref_clicks c WHERE c.ref_code = gp.ref_code),
    (SELECT COUNT(*)::BIGINT FROM public.giveaway_ref_registrations r WHERE r.ref_code = gp.ref_code),
    (SELECT MAX(c.created_at) FROM public.giveaway_ref_clicks c WHERE c.ref_code = gp.ref_code),
    pr.platform,
    pr.tiktok_handle,
    pr.instagram_handle
  FROM public.giveaway_participants gp
  LEFT JOIN public.profiles p ON p.id = gp.user_id
  LEFT JOIN auth.users u ON u.id = gp.user_id
  LEFT JOIN public.giveaway_preregistrations pr ON pr.user_id = gp.user_id
  ORDER BY 7 DESC, 6 DESC, gp.joined_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.giveaway_creator_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.giveaway_creator_stats() TO authenticated;

-- ============================================
-- 11. ФИНАЛЬНОЕ УСИЛЕНИЕ ПРАВ БРАУЗЕРНЫХ РОЛЕЙ
-- ============================================

-- Эти права не нужны браузеру; TRUNCATE не защищается RLS.
REVOKE TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO anon;
REVOKE DELETE ON public.profiles FROM authenticated;

REVOKE ALL ON public.catalog_site_anime FROM anon;
GRANT SELECT ON public.catalog_site_anime TO anon;
REVOKE ALL ON public.catalog_4k_anime FROM anon;
GRANT SELECT ON public.catalog_4k_anime TO anon;

REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.ai_subscriptions FROM anon;
REVOKE ALL ON public.vip_subscriptions FROM anon;

-- У Supabase EXECUTE по умолчанию выдаётся PUBLIC. Для SECURITY DEFINER
-- анонимный вызов запрещён; единственное исключение — публичный счётчик online.
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

-- Публичный bucket отдаёт файлы по URL без разрешения на листинг объектов.
DROP POLICY IF EXISTS "anime_4k_videos_public_read" ON storage.objects;

-- ============================================
-- ГОТОВО
-- ============================================

DO $$ 
BEGIN 
  RAISE NOTICE '✅ База данных Re-Minko готова! Таблицы обновлены, лишние удалены.';
END $$;

-- ============================================
-- SECURITY OBSERVABILITY AND ACCESS HARDENING (2026-07-27)
-- Applied migrations: security_observability_and_access_hardening,
-- security_trigger_function_grants, profile_directory_security_invoker.
-- ============================================

-- Security observability and access hardening after the 2026-07-27 incident.
-- Idempotent migration; database.sql remains the canonical bootstrap schema.

-- ---------------------------------------------------------------------------
-- 1. Central security events and distributed rate limits
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_events (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::TEXT, NOW()),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  source TEXT NOT NULL DEFAULT 'database',
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT,
  target_id TEXT,
  request_id TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  path TEXT,
  fingerprint TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT security_events_type_check
    CHECK (event_type ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  CONSTRAINT security_events_severity_check
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT security_events_source_check
    CHECK (source ~ '^[a-z0-9][a-z0-9._-]{1,39}$'),
  CONSTRAINT security_events_lengths_check
    CHECK (
      char_length(COALESCE(target_type, '')) <= 80
      AND char_length(COALESCE(target_id, '')) <= 200
      AND char_length(COALESCE(request_id, '')) <= 160
      AND char_length(COALESCE(ip_hash, '')) <= 128
      AND char_length(COALESCE(user_agent, '')) <= 512
      AND char_length(COALESCE(path, '')) <= 1024
      AND char_length(COALESCE(fingerprint, '')) <= 128
      AND octet_length(details::TEXT) <= 8192
    ),
  CONSTRAINT security_events_no_top_level_secrets_check
    CHECK (
      NOT (
        details ?| ARRAY[
          'authorization', 'cookie', 'password', 'access_token', 'refresh_token',
          'service_role', 'secret', 'api_key', 'apikey'
        ]
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_security_events_occurred
  ON public.security_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity_occurred
  ON public.security_events(severity, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_occurred
  ON public.security_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_actor_occurred
  ON public.security_events(actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_fingerprint_occurred
  ON public.security_events(fingerprint, occurred_at DESC)
  WHERE fingerprint IS NOT NULL;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.security_events_id_seq TO service_role;

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count >= 1),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, key_hash, window_started_at),
  CONSTRAINT security_rate_limits_scope_check
    CHECK (scope ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  CONSTRAINT security_rate_limits_key_check
    CHECK (char_length(key_hash) BETWEEN 16 AND 128)
);

CREATE INDEX IF NOT EXISTS idx_security_rate_limits_expires
  ON public.security_rate_limits(expires_at);

ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.security_consume_rate_limit(
  p_scope TEXT,
  p_key_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := TIMEZONE('utc'::TEXT, NOW());
  v_scope TEXT := lower(trim(COALESCE(p_scope, '')));
  v_key TEXT := lower(trim(COALESCE(p_key_hash, '')));
  v_limit INTEGER := LEAST(10000, GREATEST(1, COALESCE(p_limit, 1)));
  v_window INTEGER := LEAST(86400, GREATEST(10, COALESCE(p_window_seconds, 60)));
  v_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF v_scope !~ '^[a-z0-9][a-z0-9._-]{1,79}$'
     OR char_length(v_key) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'invalid_rate_limit_key' USING ERRCODE = '22023';
  END IF;

  v_start := to_timestamp(
    floor(extract(epoch FROM v_now) / v_window) * v_window
  );

  DELETE FROM public.security_rate_limits
  WHERE scope = v_scope
    AND key_hash = v_key
    AND expires_at < v_now;

  INSERT INTO public.security_rate_limits(
    scope, key_hash, window_started_at, request_count, expires_at
  )
  VALUES (
    v_scope, v_key, v_start, 1, v_start + make_interval(secs => v_window * 2)
  )
  ON CONFLICT (scope, key_hash, window_started_at) DO UPDATE
    SET request_count = public.security_rate_limits.request_count + 1,
        expires_at = EXCLUDED.expires_at
  RETURNING request_count INTO v_count;

  RETURN QUERY
  SELECT
    v_count <= v_limit,
    GREATEST(0, v_limit - v_count),
    v_start + make_interval(secs => v_window);
END;
$$;

REVOKE ALL ON FUNCTION public.security_consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.security_event_summary(
  p_since TIMESTAMPTZ DEFAULT (TIMEZONE('utc'::TEXT, NOW()) - INTERVAL '24 hours')
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_since TIMESTAMPTZ := GREATEST(
    COALESCE(p_since, TIMEZONE('utc'::TEXT, NOW()) - INTERVAL '24 hours'),
    TIMEZONE('utc'::TEXT, NOW()) - INTERVAL '90 days'
  );
  v_result JSONB;
BEGIN
  IF lower(COALESCE(auth.jwt() ->> 'role', '')) <> 'service_role'
     AND (
       auth.uid() IS NULL
       OR NOT public.is_site_creator_user_id(auth.uid())
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'since', v_since,
    'total', COUNT(*)::BIGINT,
    'critical', COUNT(*) FILTER (WHERE severity = 'critical')::BIGINT,
    'high', COUNT(*) FILTER (WHERE severity = 'high')::BIGINT,
    'medium', COUNT(*) FILTER (WHERE severity = 'medium')::BIGINT,
    'by_type', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.count DESC, t.event_type)
      FROM (
        SELECT event_type, COUNT(*)::BIGINT AS count, MAX(occurred_at) AS last_seen_at
        FROM public.security_events
        WHERE occurred_at >= v_since
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 50
      ) t
    ), '[]'::JSONB)
  )
  INTO v_result
  FROM public.security_events
  WHERE occurred_at >= v_since;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.security_event_summary(TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_event_summary(TIMESTAMPTZ)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.security_delete_expired_events(
  p_retention_days INTEGER DEFAULT 180
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days INTEGER := LEAST(730, GREATEST(30, COALESCE(p_retention_days, 180)));
  v_count INTEGER;
BEGIN
  DELETE FROM public.security_events
  WHERE occurred_at < TIMEZONE('utc'::TEXT, NOW()) - make_interval(days => v_days);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.security_rate_limits
  WHERE expires_at < TIMEZONE('utc'::TEXT, NOW());

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.security_delete_expired_events(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_delete_expired_events(INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.security_audit_sensitive_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::JSONB END;
  v_target_id TEXT;
  v_type TEXT := lower(TG_TABLE_NAME || '.' || TG_OP);
  v_severity TEXT := 'medium';
  v_changed TEXT[] := ARRAY[]::TEXT[];
  v_request_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'profiles' AND TG_OP = 'UPDATE' THEN
    IF OLD.is_site_creator IS DISTINCT FROM NEW.is_site_creator THEN v_changed := array_append(v_changed, 'is_site_creator'); END IF;
    IF OLD.role IS DISTINCT FROM NEW.role THEN v_changed := array_append(v_changed, 'role'); END IF;
    IF OLD.is_banned IS DISTINCT FROM NEW.is_banned THEN v_changed := array_append(v_changed, 'is_banned'); END IF;
    IF OLD.ban_reason IS DISTINCT FROM NEW.ban_reason THEN v_changed := array_append(v_changed, 'ban_reason'); END IF;
    IF OLD.banned_at IS DISTINCT FROM NEW.banned_at THEN v_changed := array_append(v_changed, 'banned_at'); END IF;
    IF COALESCE(array_length(v_changed, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;
    v_type := 'profile.security_fields_changed';
    v_severity := 'high';
  ELSIF TG_TABLE_NAME IN ('admins', 'site_team_roles') THEN
    v_type := 'authorization.' || lower(TG_TABLE_NAME) || '.' || lower(TG_OP);
    v_severity := 'critical';
  ELSIF TG_TABLE_NAME IN ('site_maintenance_config', 'minko_ai_public_state') THEN
    v_type := 'site_control.' || lower(TG_TABLE_NAME) || '.' || lower(TG_OP);
    v_severity := 'high';
  ELSIF TG_TABLE_NAME IN ('ai_subscriptions', 'vip_subscriptions') THEN
    v_type := 'subscription.' || lower(TG_TABLE_NAME) || '.' || lower(TG_OP);
    v_severity := 'high';
  ELSIF TG_TABLE_NAME IN ('catalog_site_anime', 'catalog_4k_anime') THEN
    v_type := 'catalog.' || lower(TG_TABLE_NAME) || '.' || lower(TG_OP);
    v_severity := 'high';
  ELSIF TG_TABLE_NAME = 'notifications' THEN
    v_type := 'notification.' || lower(TG_OP);
    v_severity := 'medium';
  END IF;

  v_target_id := COALESCE(
    v_row ->> 'id',
    v_row ->> 'user_id',
    v_row ->> 'target_user_id',
    v_row ->> 'key'
  );

  BEGIN
    v_request_id := left(
      COALESCE(
        current_setting('request.headers', true)::JSONB ->> 'x-request-id',
        current_setting('request.headers', true)::JSONB ->> 'x-client-info',
        ''
      ),
      160
    );
  EXCEPTION WHEN OTHERS THEN
    v_request_id := NULL;
  END;

  INSERT INTO public.security_events(
    event_type,
    severity,
    source,
    actor_user_id,
    target_type,
    target_id,
    request_id,
    fingerprint,
    details
  )
  VALUES (
    left(v_type, 80),
    v_severity,
    'database',
    v_actor,
    left(TG_TABLE_NAME, 80),
    left(COALESCE(v_target_id, ''), 200),
    NULLIF(v_request_id, ''),
    encode(
      extensions.digest(
        left(v_type, 80) || ':' || COALESCE(v_actor::TEXT, 'system') || ':' || COALESCE(v_target_id, ''),
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_object(
      'operation', TG_OP,
      'changed_fields', to_jsonb(v_changed),
      'db_role', current_user
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'profiles',
    'admins',
    'site_team_roles',
    'site_maintenance_config',
    'minko_ai_public_state',
    'ai_subscriptions',
    'vip_subscriptions',
    'catalog_site_anime',
    'catalog_4k_anime',
    'notifications'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS security_audit_change ON public.%I', v_table);
      EXECUTE format(
        'CREATE TRIGGER security_audit_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.security_audit_sensitive_change()',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Profiles: safe directory view; private base rows
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.profile_directory
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  id,
  username,
  avatar,
  gender,
  created_at,
  last_online,
  current_activity,
  is_site_creator
FROM public.profiles;

REVOKE ALL ON TABLE public.profile_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profile_directory TO anon, authenticated, service_role;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_safe_value_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_safe_value_check
  CHECK (
    avatar IS NULL
    OR (
      char_length(avatar) <= 2048
      AND avatar !~ '[<>[:cntrl:]]'
      AND (
        trim(avatar) ~* '^https://[^[:space:]<>]+$'
        OR (
          trim(avatar) !~* '^[a-z][a-z0-9+.-]*:'
          AND trim(avatar) !~ '^//'
          AND position(E'\\' in avatar) = 0
        )
        OR trim(avatar) ~* '^data:image/(png|jpe?g|gif|webp);base64,[a-z0-9+/=[:space:]]+$'
      )
    )
  );

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_creator" ON public.profiles;
CREATE POLICY "profiles_select_own_or_creator" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.is_site_creator_user_id(auth.uid())
  );

REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE SELECT ON TABLE public.profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_email(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_caller <> user_id AND NOT public.is_site_creator_user_id(v_caller) THEN
    RETURN NULL;
  END IF;
  SELECT u.email::TEXT INTO v_email FROM auth.users u WHERE u.id = user_id;
  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_email(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_email(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_jwt_role TEXT := lower(trim(COALESCE(auth.jwt() ->> 'role', '')));
  v_trusted BOOLEAN :=
    public.is_site_creator_user_id(v_actor)
    OR v_jwt_role = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin');
  v_privileged_change BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_privileged_change :=
      COALESCE(NEW.is_site_creator, false)
      OR lower(trim(COALESCE(NEW.role, 'user'))) <> 'user'
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
    RAISE LOG 'SECURITY_EVENT|profile_privilege_change_blocked|actor=%|target=%|operation=%',
      COALESCE(v_actor::TEXT, 'anonymous'), COALESCE(NEW.id::TEXT, ''), TG_OP;
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

-- Social data remains available to signed-in users, but no longer to the anon key.
DROP POLICY IF EXISTS "favorites_anime_select" ON public.favorites_anime;
CREATE POLICY "favorites_anime_select" ON public.favorites_anime
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "favorites_manga_select" ON public.favorites_manga;
CREATE POLICY "favorites_manga_select" ON public.favorites_manga
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "watch_history_select" ON public.watch_history;
CREATE POLICY "watch_history_select" ON public.watch_history
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "achievements_select_all" ON public.user_achievements;
CREATE POLICY "achievements_select_all" ON public.user_achievements
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON TABLE public.favorites_anime, public.favorites_manga,
  public.watch_history, public.user_achievements FROM anon;
GRANT SELECT ON TABLE public.favorites_anime, public.favorites_manga,
  public.watch_history, public.user_achievements TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Direct and group messages: immutable identities and bounded payloads
-- ---------------------------------------------------------------------------

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS hidden_for UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_safe_payload_check;
ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_safe_payload_check
  CHECK (
    sender_id <> receiver_id
    AND char_length(trim(message)) BETWEEN 1 AND 12000
    AND COALESCE(cardinality(hidden_for), 0) <= 2
    AND hidden_for <@ ARRAY[sender_id, receiver_id]
  );

CREATE OR REPLACE FUNCTION public.protect_direct_message_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.sender_id := auth.uid();
      NEW.read := false;
      NEW.created_at := TIMEZONE('utc'::TEXT, NOW());
      NEW.edited_at := NULL;
      NEW.hidden_for := ARRAY[]::UUID[];
    ELSE
      IF OLD.id IS DISTINCT FROM NEW.id
         OR OLD.sender_id IS DISTINCT FROM NEW.sender_id
         OR OLD.receiver_id IS DISTINCT FROM NEW.receiver_id
         OR OLD.message IS DISTINCT FROM NEW.message
         OR OLD.created_at IS DISTINCT FROM NEW.created_at
         OR OLD.edited_at IS DISTINCT FROM NEW.edited_at
         OR OLD.hidden_for IS DISTINCT FROM NEW.hidden_for
         OR NEW.read IS DISTINCT FROM true THEN
        RAISE LOG 'SECURITY_EVENT|direct_message_tamper_blocked|actor=%|message=%',
          COALESCE(auth.uid()::TEXT, 'anonymous'), COALESCE(OLD.id::TEXT, '');
        RAISE EXCEPTION 'direct_messages: only read=true can be changed directly'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_direct_message_fields_trigger ON public.direct_messages;
CREATE TRIGGER protect_direct_message_fields_trigger
BEFORE INSERT OR UPDATE ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.protect_direct_message_fields();

DROP POLICY IF EXISTS "dm_select" ON public.direct_messages;
DROP POLICY IF EXISTS "dm_insert" ON public.direct_messages;
DROP POLICY IF EXISTS "dm_update" ON public.direct_messages;
DROP POLICY IF EXISTS "dm_delete" ON public.direct_messages;
DROP POLICY IF EXISTS "dm_mark_read" ON public.direct_messages;
CREATE POLICY "dm_select" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT (auth.uid() = ANY(hidden_for))
  );
CREATE POLICY "dm_insert" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND sender_id <> receiver_id);
CREATE POLICY "dm_mark_read" ON public.direct_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

REVOKE ALL ON TABLE public.direct_messages FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.direct_messages FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.direct_messages TO authenticated;
GRANT UPDATE (read) ON TABLE public.direct_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.direct_messages TO service_role;
CREATE OR REPLACE FUNCTION public.reminko_delete_dm_thread(p_other_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = v_uid THEN
    RAISE EXCEPTION 'invalid_peer';
  END IF;

  UPDATE public.direct_messages
  SET hidden_for = ARRAY(
    SELECT DISTINCT x
    FROM unnest(hidden_for || ARRAY[v_uid]) AS x
  )
  WHERE (
      (sender_id = v_uid AND receiver_id = p_other_user_id)
      OR (sender_id = p_other_user_id AND receiver_id = v_uid)
    )
    AND NOT (v_uid = ANY(hidden_for));

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.direct_messages
  WHERE cardinality(hidden_for) >= 2;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_delete_dm_thread(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reminko_delete_dm_thread(UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reminko_edit_dm_message(p_message_id UUID, p_text TEXT)
RETURNS public.direct_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.direct_messages;
  v_text TEXT := left(trim(COALESCE(p_text, '')), 12000);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF char_length(v_text) < 1 THEN RAISE EXCEPTION 'empty_message'; END IF;

  UPDATE public.direct_messages
  SET message = v_text,
      edited_at = TIMEZONE('utc'::TEXT, NOW())
  WHERE id = p_message_id AND sender_id = v_uid
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'not_found_or_forbidden'; END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_edit_dm_message(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reminko_edit_dm_message(UUID, TEXT)
  TO authenticated, service_role;

ALTER TABLE public.dm_group_messages
  DROP CONSTRAINT IF EXISTS dm_group_messages_safe_payload_check;
ALTER TABLE public.dm_group_messages
  ADD CONSTRAINT dm_group_messages_safe_payload_check
  CHECK (char_length(trim(message)) BETWEEN 1 AND 12000);

DROP POLICY IF EXISTS "dm_group_members_select" ON public.dm_group_members;
DROP POLICY IF EXISTS "dm_group_members_insert" ON public.dm_group_members;
DROP POLICY IF EXISTS "dm_group_members_insert_owner_only" ON public.dm_group_members;
DROP POLICY IF EXISTS "dm_group_members_delete" ON public.dm_group_members;
CREATE POLICY "dm_group_members_select" ON public.dm_group_members
  FOR SELECT TO authenticated
  USING (public.reminko_is_dm_group_member(group_id));

REVOKE ALL ON TABLE public.dm_group_members FROM anon;
REVOKE INSERT, UPDATE ON TABLE public.dm_group_members FROM authenticated;
GRANT SELECT, DELETE ON TABLE public.dm_group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dm_group_members TO service_role;

CREATE OR REPLACE FUNCTION public.reminko_is_dm_group_owner(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dm_group_members m
    WHERE m.group_id = p_group_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.reminko_is_dm_group_owner(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reminko_is_dm_group_owner(UUID)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "dm_group_members_insert_owner_only" ON public.dm_group_members;
DROP POLICY IF EXISTS "dm_group_members_delete" ON public.dm_group_members;
CREATE POLICY "dm_group_members_insert_owner_only" ON public.dm_group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    role = 'member'
    AND public.reminko_is_dm_group_owner(group_id)
  );
CREATE POLICY "dm_group_members_delete" ON public.dm_group_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.reminko_is_dm_group_owner(group_id)
  );

DROP POLICY IF EXISTS "dm_group_messages_update" ON public.dm_group_messages;
DROP POLICY IF EXISTS "dm_group_messages_delete" ON public.dm_group_messages;
REVOKE ALL ON TABLE public.dm_group_messages FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.dm_group_messages FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.dm_group_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dm_group_messages TO service_role;

CREATE OR REPLACE FUNCTION public.touch_dm_group_after_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.dm_groups
  SET updated_at = TIMEZONE('utc'::TEXT, NOW())
  WHERE id = NEW.group_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_dm_group_after_message_trigger ON public.dm_group_messages;
CREATE TRIGGER touch_dm_group_after_message_trigger
AFTER INSERT ON public.dm_group_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_dm_group_after_message();

CREATE OR REPLACE FUNCTION public.reminko_edit_dm_group_message(
  p_message_id UUID,
  p_text TEXT
)
RETURNS public.dm_group_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.dm_group_messages;
  v_text TEXT := left(trim(COALESCE(p_text, '')), 12000);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF char_length(v_text) < 1 THEN RAISE EXCEPTION 'empty_message'; END IF;

  UPDATE public.dm_group_messages
  SET message = v_text,
      edited_at = TIMEZONE('utc'::TEXT, NOW())
  WHERE id = p_message_id AND sender_id = v_uid
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'not_found_or_forbidden'; END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.reminko_edit_dm_group_message(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reminko_edit_dm_group_message(UUID, TEXT)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Watch Together: server-created rooms, server-calculated VIP, private rows
-- ---------------------------------------------------------------------------

ALTER TABLE public.watch_together_sessions
  DROP CONSTRAINT IF EXISTS watch_together_sessions_safe_values_check;
ALTER TABLE public.watch_together_sessions
  ADD CONSTRAINT watch_together_sessions_safe_values_check
  CHECK (
    session_code ~ '^[A-Z0-9]{8,16}$'
    AND max_participants BETWEEN 2 AND 4
    AND char_length(COALESCE(anime_id, '')) <= 128
    AND char_length(COALESCE(manga_id, '')) <= 128
    AND char_length(COALESCE(video_source, '')) <= 2048
    AND COALESCE(video_source, '') !~ '[<>[:cntrl:]]'
  );

ALTER TABLE public.watch_together_chat
  DROP CONSTRAINT IF EXISTS watch_together_chat_safe_payload_check;
ALTER TABLE public.watch_together_chat
  ADD CONSTRAINT watch_together_chat_safe_payload_check
  CHECK (char_length(trim(message)) BETWEEN 1 AND 2000);

ALTER TABLE public.watch_together_voice_signals
  DROP CONSTRAINT IF EXISTS watch_together_voice_payload_size_check;
ALTER TABLE public.watch_together_voice_signals
  ADD CONSTRAINT watch_together_voice_payload_size_check
  CHECK (octet_length(payload::TEXT) <= 32768);

CREATE OR REPLACE FUNCTION public.wt_has_active_vip(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_site_creator_user_id(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.vip_subscriptions v
      WHERE v.user_id = p_user_id
        AND v.is_active = true
        AND (v.expires_at IS NULL OR v.expires_at > TIMEZONE('utc'::TEXT, NOW()))
    );
$$;

REVOKE ALL ON FUNCTION public.wt_has_active_vip(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wt_has_active_vip(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.wt_can_view_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.watch_together_sessions s
      WHERE s.id = p_session_id
        AND (
          s.host_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.watch_together_participants p
            WHERE p.session_id = s.id AND p.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.friends f
            WHERE f.status = 'accepted'
              AND (
                (f.user_id = auth.uid() AND f.friend_id = s.host_id)
                OR (f.friend_id = auth.uid() AND f.user_id = s.host_id)
              )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.wt_can_view_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_can_view_session(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wt_create_session(
  p_type TEXT,
  p_anime_id TEXT DEFAULT NULL,
  p_manga_id TEXT DEFAULT NULL
)
RETURNS public.watch_together_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT;
  v_row public.watch_together_sessions;
  v_attempt INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  IF p_type NOT IN ('anime', 'manga') THEN
    RAISE EXCEPTION 'invalid_room_type' USING ERRCODE = '22023';
  END IF;
  IF NOT public.wt_has_active_vip(v_uid) THEN
    RAISE EXCEPTION 'vip_required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    SELECT r.allowed
    FROM public.security_consume_rate_limit(
      'watch_together.create',
      encode(extensions.digest(v_uid::TEXT, 'sha256'), 'hex'),
      10,
      3600
    ) r
  ) THEN
    RAISE LOG 'SECURITY_EVENT|watch_together_create_rate_limited|actor=%', v_uid;
    RAISE EXCEPTION 'room_creation_rate_limited' USING ERRCODE = '54000';
  END IF;

  FOR v_attempt IN 1..8 LOOP
    v_code := upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10));
    BEGIN
      INSERT INTO public.watch_together_sessions(
        host_id,
        anime_id,
        manga_id,
        type,
        current_episode,
        current_chapter,
        playback_position,
        is_playing,
        playback_time,
        is_active,
        session_code,
        max_participants,
        last_room_activity_at
      )
      VALUES (
        v_uid,
        CASE WHEN p_type = 'anime' THEN left(NULLIF(trim(p_anime_id), ''), 128) ELSE NULL END,
        CASE WHEN p_type = 'manga' THEN left(NULLIF(trim(p_manga_id), ''), 128) ELSE NULL END,
        p_type,
        CASE WHEN p_type = 'anime' THEN 1 ELSE NULL END,
        CASE WHEN p_type = 'manga' THEN 1 ELSE NULL END,
        0,
        false,
        0,
        true,
        v_code,
        4,
        TIMEZONE('utc'::TEXT, NOW())
      )
      RETURNING * INTO v_row;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt = 8 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO public.watch_together_participants(session_id, user_id, has_vip)
  VALUES (v_row.id, v_uid, public.wt_has_active_vip(v_uid))
  ON CONFLICT (session_id, user_id) DO UPDATE
    SET has_vip = EXCLUDED.has_vip;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.wt_create_session(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_create_session(TEXT, TEXT, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wt_join_session(
  p_session_id UUID DEFAULT NULL,
  p_session_code TEXT DEFAULT NULL
)
RETURNS public.watch_together_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT := upper(trim(COALESCE(p_session_code, '')));
  v_row public.watch_together_sessions;
  v_count INTEGER;
  v_vip_count INTEGER;
  v_non_vip_count INTEGER;
  v_has_vip BOOLEAN;
  v_authorized BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL AND v_code = '' THEN
    RAISE EXCEPTION 'room_identifier_required' USING ERRCODE = '22023';
  END IF;

  IF v_code <> '' AND NOT (
    SELECT r.allowed
    FROM public.security_consume_rate_limit(
      'watch_together.join_code',
      encode(extensions.digest(v_uid::TEXT, 'sha256'), 'hex'),
      30,
      300
    ) r
  ) THEN
    RAISE LOG 'SECURITY_EVENT|watch_together_join_rate_limited|actor=%', v_uid;
    RAISE EXCEPTION 'room_join_rate_limited' USING ERRCODE = '54000';
  END IF;

  IF v_code <> '' THEN
    SELECT * INTO v_row
    FROM public.watch_together_sessions
    WHERE session_code = v_code
    FOR UPDATE;
    v_authorized := FOUND;
  ELSE
    SELECT * INTO v_row
    FROM public.watch_together_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF FOUND THEN
      v_authorized :=
        v_row.host_id = v_uid
        OR EXISTS (
          SELECT 1
          FROM public.watch_together_participants p
          WHERE p.session_id = v_row.id AND p.user_id = v_uid
        )
        OR EXISTS (
          SELECT 1
          FROM public.friends f
          WHERE f.status = 'accepted'
            AND (
              (f.user_id = v_uid AND f.friend_id = v_row.host_id)
              OR (f.friend_id = v_uid AND f.user_id = v_row.host_id)
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.notifications n
          WHERE n.user_id = v_uid
            AND n.sender_id = v_row.host_id
            AND n.type = 'watch_together_invite'
            AND n.data ->> 'session_id' = v_row.id::TEXT
        );
    END IF;
  END IF;

  IF v_row.id IS NULL OR NOT v_authorized OR NOT COALESCE(v_row.is_active, false) THEN
    RAISE EXCEPTION 'room_not_found_or_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.watch_together_participants
  WHERE session_id = v_row.id;

  SELECT
    COUNT(*) FILTER (WHERE has_vip),
    COUNT(*) FILTER (WHERE NOT has_vip)
  INTO v_vip_count, v_non_vip_count
  FROM public.watch_together_participants
  WHERE session_id = v_row.id;

  v_has_vip := public.wt_has_active_vip(v_uid);

  IF NOT EXISTS (
    SELECT 1 FROM public.watch_together_participants
    WHERE session_id = v_row.id AND user_id = v_uid
  ) AND v_count >= LEAST(4, GREATEST(2, COALESCE(v_row.max_participants, 4))) THEN
    RAISE EXCEPTION 'room_full' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_has_vip
     AND NOT EXISTS (
       SELECT 1 FROM public.watch_together_participants
       WHERE session_id = v_row.id AND user_id = v_uid
     )
     AND (v_vip_count = 0 OR v_non_vip_count >= 1) THEN
    RAISE EXCEPTION 'vip_required_or_guest_slot_full' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.watch_together_participants(session_id, user_id, has_vip)
  VALUES (v_row.id, v_uid, v_has_vip)
  ON CONFLICT (session_id, user_id) DO UPDATE
    SET has_vip = EXCLUDED.has_vip,
        last_ping_at = TIMEZONE('utc'::TEXT, NOW());

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.wt_join_session(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_join_session(UUID, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_watch_together_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.has_vip := public.wt_has_active_vip(NEW.user_id);
    NEW.joined_at := TIMEZONE('utc'::TEXT, NOW());
    NEW.player_ready := false;
    NEW.player_ready_at := NULL;
    NEW.last_ping_at := TIMEZONE('utc'::TEXT, NOW());
  ELSE
    NEW.id := OLD.id;
    NEW.session_id := OLD.session_id;
    NEW.user_id := OLD.user_id;
    NEW.has_vip := OLD.has_vip;
    NEW.joined_at := OLD.joined_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_watch_together_participant_trigger
  ON public.watch_together_participants;
CREATE TRIGGER protect_watch_together_participant_trigger
BEFORE INSERT OR UPDATE ON public.watch_together_participants
FOR EACH ROW EXECUTE FUNCTION public.protect_watch_together_participant();

DROP POLICY IF EXISTS "wt_sessions_select" ON public.watch_together_sessions;
DROP POLICY IF EXISTS "wt_sessions_insert" ON public.watch_together_sessions;
DROP POLICY IF EXISTS "wt_sessions_update" ON public.watch_together_sessions;
CREATE POLICY "wt_sessions_select" ON public.watch_together_sessions
  FOR SELECT TO authenticated
  USING (public.wt_can_view_session(id));
CREATE POLICY "wt_sessions_update" ON public.watch_together_sessions
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS "wt_participants_select" ON public.watch_together_participants;
DROP POLICY IF EXISTS "wt_participants_insert" ON public.watch_together_participants;
DROP POLICY IF EXISTS "wt_participants_update_own" ON public.watch_together_participants;
CREATE POLICY "wt_participants_select" ON public.watch_together_participants
  FOR SELECT TO authenticated
  USING (public.wt_can_view_session(session_id));
CREATE POLICY "wt_participants_update_own" ON public.watch_together_participants
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.watch_together_sessions FROM anon;
REVOKE INSERT, DELETE, UPDATE ON TABLE public.watch_together_sessions FROM authenticated;
GRANT SELECT ON TABLE public.watch_together_sessions TO authenticated;
GRANT UPDATE (
  anime_id, manga_id, current_episode, current_chapter, playback_position,
  is_playing, playback_time, video_source, is_active, updated_at,
  sync_hold, sync_hold_reason, sync_generation, host_screen_broadcast,
  last_room_activity_at
) ON TABLE public.watch_together_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.watch_together_sessions TO service_role;

REVOKE ALL ON TABLE public.watch_together_participants FROM anon;
REVOKE INSERT, UPDATE ON TABLE public.watch_together_participants FROM authenticated;
GRANT SELECT, DELETE ON TABLE public.watch_together_participants TO authenticated;
GRANT UPDATE (player_ready, player_ready_at, last_ping_at)
  ON TABLE public.watch_together_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.watch_together_participants TO service_role;

REVOKE ALL ON TABLE public.watch_together_chat, public.watch_together_voice_signals FROM anon;
GRANT SELECT, INSERT ON TABLE public.watch_together_chat, public.watch_together_voice_signals
  TO authenticated;

CREATE OR REPLACE FUNCTION public.wt_close_idle_session_if_needed(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.watch_together_sessions%ROWTYPE;
  v_last TIMESTAMPTZ;
  v_chat_last TIMESTAMPTZ;
  v_is_service BOOLEAN :=
    current_user IN ('postgres', 'service_role')
    OR lower(COALESCE(auth.jwt() ->> 'role', '')) = 'service_role';
BEGIN
  SELECT * INTO v_row
  FROM public.watch_together_sessions
  WHERE id = p_session_id;

  IF NOT FOUND OR NOT COALESCE(v_row.is_active, false) THEN
    RETURN false;
  END IF;

  IF NOT v_is_service
     AND auth.uid() <> v_row.host_id
     AND NOT EXISTS (
       SELECT 1 FROM public.watch_together_participants p
       WHERE p.session_id = p_session_id AND p.user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_row.is_playing, false) THEN RETURN false; END IF;

  SELECT MAX(c.created_at) INTO v_chat_last
  FROM public.watch_together_chat c
  WHERE c.session_id = p_session_id;

  v_last := GREATEST(
    v_row.created_at,
    COALESCE(v_row.last_room_activity_at, v_row.created_at),
    COALESCE(v_chat_last, v_row.created_at)
  );

  IF v_last >= TIMEZONE('utc'::TEXT, NOW()) - INTERVAL '30 minutes' THEN
    RETURN false;
  END IF;

  UPDATE public.watch_together_sessions
  SET is_active = false,
      updated_at = TIMEZONE('utc'::TEXT, NOW())
  WHERE id = p_session_id AND is_active = true;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.wt_close_idle_session_if_needed(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_session_if_needed(UUID)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wt_close_idle_sessions()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wt_close_idle_sessions()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Server-only analytics ingestion
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_site_visit_visitor_created
  ON public.site_visit_events(visitor_id, created_at DESC);

ALTER TABLE public.site_visit_events
  DROP CONSTRAINT IF EXISTS site_visit_events_safe_payload_check;
ALTER TABLE public.site_visit_events
  ADD CONSTRAINT site_visit_events_safe_payload_check
  CHECK (
    char_length(visitor_id) BETWEEN 8 AND 64
    AND char_length(path) BETWEEN 1 AND 1024
    AND char_length(COALESCE(page_title, '')) <= 300
    AND char_length(COALESCE(referrer, '')) <= 1024
    AND char_length(COALESCE(user_agent, '')) <= 512
    AND event_kind IN ('pageview', 'action')
    AND char_length(COALESCE(event_label, '')) <= 200
    AND octet_length(COALESCE(meta, '{}'::JSONB)::TEXT) <= 4096
    AND created_at <= TIMEZONE('utc'::TEXT, NOW()) + INTERVAL '1 minute'
  );

CREATE OR REPLACE FUNCTION public.normalize_site_visit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.created_at := TIMEZONE('utc'::TEXT, NOW());
  NEW.visitor_id := left(trim(NEW.visitor_id), 64);
  NEW.path := left(split_part(trim(NEW.path), '?', 1), 1024);
  NEW.page_title := NULLIF(left(trim(COALESCE(NEW.page_title, '')), 300), '');
  NEW.referrer := NULLIF(left(trim(COALESCE(NEW.referrer, '')), 1024), '');
  NEW.user_agent := NULLIF(left(trim(COALESCE(NEW.user_agent, '')), 512), '');
  NEW.event_kind := CASE WHEN NEW.event_kind = 'action' THEN 'action' ELSE 'pageview' END;
  NEW.event_label := NULLIF(left(trim(COALESCE(NEW.event_label, '')), 200), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_site_visit_event_trigger ON public.site_visit_events;
CREATE TRIGGER normalize_site_visit_event_trigger
BEFORE INSERT ON public.site_visit_events
FOR EACH ROW EXECUTE FUNCTION public.normalize_site_visit_event();

DROP POLICY IF EXISTS "site_visit_events_insert" ON public.site_visit_events;
REVOKE INSERT, UPDATE ON TABLE public.site_visit_events FROM anon, authenticated;
REVOKE SELECT, DELETE ON TABLE public.site_visit_events FROM anon;
GRANT SELECT, DELETE ON TABLE public.site_visit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_visit_events TO service_role;

DELETE FROM public.site_visit_events
WHERE created_at < TIMEZONE('utc'::TEXT, NOW()) - INTERVAL '90 days';

-- ---------------------------------------------------------------------------
-- 6. Friend transitions, chat mutation controls, notification anti-spam
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_friend_request_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.user_id := auth.uid();
      IF NEW.friend_id IS NULL OR NEW.friend_id = auth.uid() THEN
        RAISE EXCEPTION 'invalid_friend' USING ERRCODE = '22023';
      END IF;
      SELECT r.allowed INTO v_allowed
      FROM public.security_consume_rate_limit(
        'friend.request',
        encode(extensions.digest(auth.uid()::TEXT, 'sha256'), 'hex'),
        30,
        3600
      ) r;
      IF NOT COALESCE(v_allowed, false) THEN
        RAISE LOG 'SECURITY_EVENT|friend_request_rate_limited|actor=%', auth.uid();
        RAISE EXCEPTION 'friend_request_rate_limited' USING ERRCODE = '54000';
      END IF;
      NEW.status := 'pending';
      NEW.accepted_at := NULL;
      NEW.created_at := TIMEZONE('utc'::TEXT, NOW());
    ELSE
      IF OLD.user_id IS DISTINCT FROM NEW.user_id
         OR OLD.friend_id IS DISTINCT FROM NEW.friend_id
         OR OLD.created_at IS DISTINCT FROM NEW.created_at
         OR auth.uid() <> OLD.friend_id
         OR OLD.status <> 'pending'
         OR NEW.status NOT IN ('accepted', 'blocked') THEN
        RAISE LOG 'SECURITY_EVENT|friend_transition_blocked|actor=%|friendship=%',
          COALESCE(auth.uid()::TEXT, 'anonymous'), COALESCE(OLD.id::TEXT, '');
        RAISE EXCEPTION 'invalid_friend_transition' USING ERRCODE = '42501';
      END IF;
      NEW.accepted_at := CASE
        WHEN NEW.status = 'accepted' THEN TIMEZONE('utc'::TEXT, NOW())
        ELSE NULL
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_friend_request_transition_trigger ON public.friends;
CREATE TRIGGER protect_friend_request_transition_trigger
BEFORE INSERT OR UPDATE ON public.friends
FOR EACH ROW EXECUTE FUNCTION public.protect_friend_request_transition();

DROP POLICY IF EXISTS "friends_insert" ON public.friends;
DROP POLICY IF EXISTS "friends_update" ON public.friends;
DROP POLICY IF EXISTS "friends_update_recipient" ON public.friends;
CREATE POLICY "friends_insert" ON public.friends
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND user_id <> friend_id
    AND status = 'pending'
  );
CREATE POLICY "friends_update_recipient" ON public.friends
  FOR UPDATE TO authenticated
  USING (auth.uid() = friend_id AND status = 'pending')
  WITH CHECK (auth.uid() = friend_id);

REVOKE ALL ON TABLE public.friends FROM anon;
REVOKE UPDATE ON TABLE public.friends FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.friends TO authenticated;
GRANT UPDATE (status, accepted_at) ON TABLE public.friends TO authenticated;

ALTER TABLE public.global_chat_messages
  DROP CONSTRAINT IF EXISTS global_chat_messages_safe_payload_check;
ALTER TABLE public.global_chat_messages
  ADD CONSTRAINT global_chat_messages_safe_payload_check
  CHECK (char_length(trim(message)) BETWEEN 1 AND 300);

DROP TRIGGER IF EXISTS tr_global_chat_automod_before_insert
  ON public.global_chat_messages;
DROP TRIGGER IF EXISTS tr_global_chat_automod_before_write
  ON public.global_chat_messages;
CREATE TRIGGER tr_global_chat_automod_before_write
BEFORE INSERT OR UPDATE OF message ON public.global_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_global_chat_automod_before_insert();

DROP POLICY IF EXISTS "chat_update_own" ON public.global_chat_messages;
DROP POLICY IF EXISTS "chat_delete" ON public.global_chat_messages;
DROP POLICY IF EXISTS "chat_update_creator" ON public.global_chat_messages;
DROP POLICY IF EXISTS "chat_soft_delete_own" ON public.global_chat_messages;
CREATE POLICY "chat_soft_delete_own" ON public.global_chat_messages
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_site_creator_user_id(auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_site_creator_user_id(auth.uid())
  );
REVOKE INSERT, UPDATE, DELETE ON TABLE public.global_chat_messages FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.global_chat_messages FROM authenticated;
GRANT SELECT ON TABLE public.global_chat_messages TO anon, authenticated;
GRANT INSERT ON TABLE public.global_chat_messages TO authenticated;
GRANT UPDATE (deleted_at) ON TABLE public.global_chat_messages TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_global_chat_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'message_already_deleted' USING ERRCODE = '42501';
    END IF;
    NEW.deleted_at := TIMEZONE('utc'::TEXT, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_global_chat_soft_delete_trigger
  ON public.global_chat_messages;
CREATE TRIGGER normalize_global_chat_soft_delete_trigger
BEFORE UPDATE OF deleted_at ON public.global_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.normalize_global_chat_soft_delete();

CREATE OR REPLACE FUNCTION public.protect_notification_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.sender_id := auth.uid();
    NEW.created_at := TIMEZONE('utc'::TEXT, NOW());
    NEW.read := false;
    NEW.read_at := NULL;

    IF NOT public.is_site_creator_user_id(auth.uid()) THEN
      SELECT r.allowed INTO v_allowed
      FROM public.security_consume_rate_limit(
        'notification.send',
        encode(extensions.digest(auth.uid()::TEXT, 'sha256'), 'hex'),
        20,
        60
      ) r;
      IF NOT COALESCE(v_allowed, false) THEN
        RAISE LOG 'SECURITY_EVENT|notification_rate_limited|actor=%', auth.uid();
        RAISE EXCEPTION 'notification_rate_limited' USING ERRCODE = '54000';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_notification_write_trigger ON public.notifications;
CREATE TRIGGER protect_notification_write_trigger
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.protect_notification_write();

DROP POLICY IF EXISTS "notifications_insert_creator" ON public.notifications;
CREATE POLICY "notifications_insert_creator" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_site_creator_user_id(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 7. Server-owned state, giveaway integrity, storage identity
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "minko_ai_state_all" ON public.minko_ai_state;
DROP POLICY IF EXISTS "minko_ai_state_select_own" ON public.minko_ai_state;
CREATE POLICY "minko_ai_state_select_own" ON public.minko_ai_state
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
REVOKE ALL ON TABLE public.minko_ai_state FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.minko_ai_state FROM authenticated;
GRANT SELECT ON TABLE public.minko_ai_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.minko_ai_state TO service_role;

CREATE OR REPLACE FUNCTION public.is_verified_nonanonymous_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_user_id
      AND u.email IS NOT NULL
      AND u.email_confirmed_at IS NOT NULL
      AND COALESCE((u.raw_app_meta_data ->> 'provider') = 'anonymous', false) = false
  );
$$;

REVOKE ALL ON FUNCTION public.is_verified_nonanonymous_user(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_verified_nonanonymous_user(UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_verified_giveaway_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row JSONB := to_jsonb(NEW);
  v_uid UUID := COALESCE(
    auth.uid(),
    NULLIF(v_row ->> 'user_id', '')::UUID,
    NULLIF(v_row ->> 'registered_user_id', '')::UUID
  );
BEGIN
  IF v_uid IS NOT NULL
     AND NOT public.is_verified_nonanonymous_user(v_uid) THEN
    RAISE LOG 'SECURITY_EVENT|giveaway_unverified_identity_blocked|actor=%|table=%',
      COALESCE(auth.uid()::TEXT, 'anonymous'), TG_TABLE_NAME;
    RAISE EXCEPTION 'verified_account_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'giveaway_participants',
    'giveaway_preregistrations',
    'giveaway_ref_registrations'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS enforce_verified_giveaway_identity_trigger ON public.%I', v_table);
      EXECUTE format(
        'CREATE TRIGGER enforce_verified_giveaway_identity_trigger BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_giveaway_identity()',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.giveaway_record_click(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.giveaway_record_click(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

DROP POLICY IF EXISTS "anime_4k_videos_creator_write" ON storage.objects;
CREATE POLICY "anime_4k_videos_creator_write"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'anime-4k-videos'
  AND public.is_site_creator_user_id(auth.uid())
)
WITH CHECK (
  bucket_id = 'anime-4k-videos'
  AND public.is_site_creator_user_id(auth.uid())
);

-- ---------------------------------------------------------------------------
-- 8. Atomic avatar generation quota
-- ---------------------------------------------------------------------------

ALTER TABLE public.avatar_ai_generations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE public.avatar_ai_generations
  DROP CONSTRAINT IF EXISTS avatar_ai_generations_status_check;
ALTER TABLE public.avatar_ai_generations
  ADD CONSTRAINT avatar_ai_generations_status_check
  CHECK (status IN ('reserved', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_avatar_ai_generations_quota
  ON public.avatar_ai_generations(user_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.reserve_avatar_ai_generation(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 3,
  p_window_hours INTEGER DEFAULT 24
)
RETURNS TABLE(
  allowed BOOLEAN,
  reservation_id UUID,
  used INTEGER,
  remaining INTEGER,
  resets_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := TIMEZONE('utc'::TEXT, NOW());
  v_limit INTEGER := LEAST(20, GREATEST(1, COALESCE(p_limit, 3)));
  v_hours INTEGER := LEAST(168, GREATEST(1, COALESCE(p_window_hours, 24)));
  v_used INTEGER;
  v_id UUID;
  v_oldest TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT COUNT(*)::INTEGER, MIN(created_at)
  INTO v_used, v_oldest
  FROM public.avatar_ai_generations
  WHERE user_id = p_user_id
    AND created_at >= v_now - make_interval(hours => v_hours)
    AND (
      status = 'completed'
      OR (status = 'reserved' AND created_at >= v_now - INTERVAL '10 minutes')
    );

  IF v_used >= v_limit THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      v_used,
      0,
      COALESCE(v_oldest + make_interval(hours => v_hours), v_now + make_interval(hours => v_hours));
    RETURN;
  END IF;

  INSERT INTO public.avatar_ai_generations(user_id, status, created_at)
  VALUES (p_user_id, 'reserved', v_now)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT
    true,
    v_id,
    v_used + 1,
    GREATEST(0, v_limit - v_used - 1),
    NULL::TIMESTAMPTZ;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_avatar_ai_generation(
  p_reservation_id UUID,
  p_success BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.avatar_ai_generations
  SET status = CASE WHEN COALESCE(p_success, false) THEN 'completed' ELSE 'failed' END
  WHERE id = p_reservation_id
    AND status = 'reserved';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.avatar_ai_generation_quota(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 3,
  p_window_hours INTEGER DEFAULT 24
)
RETURNS TABLE(used INTEGER, remaining INTEGER, resets_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH params AS (
    SELECT
      LEAST(20, GREATEST(1, COALESCE(p_limit, 3))) AS lim,
      LEAST(168, GREATEST(1, COALESCE(p_window_hours, 24))) AS hours,
      TIMEZONE('utc'::TEXT, NOW()) AS now_at
  ),
  usage AS (
    SELECT COUNT(*)::INTEGER AS cnt, MIN(g.created_at) AS oldest
    FROM public.avatar_ai_generations g, params p
    WHERE g.user_id = p_user_id
      AND g.created_at >= p.now_at - make_interval(hours => p.hours)
      AND (
        g.status = 'completed'
        OR (g.status = 'reserved' AND g.created_at >= p.now_at - INTERVAL '10 minutes')
      )
  )
  SELECT
    u.cnt,
    GREATEST(0, p.lim - u.cnt),
    CASE WHEN u.cnt >= p.lim THEN u.oldest + make_interval(hours => p.hours) ELSE NULL END
  FROM usage u CROSS JOIN params p;
$$;

REVOKE ALL ON FUNCTION public.reserve_avatar_ai_generation(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_avatar_ai_generation(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.avatar_ai_generation_quota(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_avatar_ai_generation(UUID, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_avatar_ai_generation(UUID, BOOLEAN)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.avatar_ai_generation_quota(UUID, INTEGER, INTEGER)
  TO service_role;

-- Keep only the intended browser/service grants after legacy defaults.
REVOKE TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Follow-up to security_observability_and_access_hardening.
-- Trigger functions are internal implementation details and must not be RPC-callable.

REVOKE ALL ON FUNCTION public.security_audit_sensitive_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_security_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_direct_message_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_dm_group_after_message()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_watch_together_participant()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_site_visit_event()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_friend_request_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_global_chat_soft_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_notification_write()
  FROM PUBLIC, anon, authenticated;

-- Giveaway validation needs privileged auth.users access only while running as a trigger.
ALTER FUNCTION public.enforce_verified_giveaway_identity() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.enforce_verified_giveaway_identity()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_verified_nonanonymous_user(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_verified_nonanonymous_user(UUID)
  TO service_role;

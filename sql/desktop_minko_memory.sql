-- Desktop Minko shared/device memory (service_role only via Netlify).
CREATE TABLE IF NOT EXISTS public.desktop_minko_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash text NOT NULL,
  scope text NOT NULL DEFAULT 'device',
  kind text NOT NULL DEFAULT 'voice-command',
  said text NOT NULL DEFAULT '',
  intent text NOT NULL DEFAULT '',
  section text,
  title text,
  hits integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS desktop_minko_memory_unique
  ON public.desktop_minko_memory (device_hash, kind, said);

ALTER TABLE public.desktop_minko_memory ENABLE ROW LEVEL SECURITY;

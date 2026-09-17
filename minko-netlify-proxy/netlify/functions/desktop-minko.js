/**
 * Desktop Minko backend: memory + OpenAI proxy.
 * Keys never leave Netlify. The WinUI client only sends speech/text.
 *
 * GET  ?action=ping
 * GET  ?action=memory
 * POST ?action=lookup     { said }
 * POST ?action=correct    { said }
 * POST ?action=remember   { said, intent, section, title }
 * POST ?action=chat       { model, temperature, max_tokens, messages }
 * POST ?action=transcribe { wavBase64 }
 */
const {
  consumeRateLimit,
  fetchWithTimeout,
  hashValue,
  readJsonWithLimit,
  readTextWithLimit,
  recordSecurityEvent,
  safeText,
  supabaseRequest
} = require('./_security');

const DEVICE_ID = /^[a-f0-9]{64}$/;
const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.MINKO_GPT_API_KEY || '';
const CHAT_MODEL = (process.env.MINKO_DESKTOP_MODEL || 'gpt-4o-mini').trim();
const TRANSCRIBE_MODEL = (process.env.MINKO_DESKTOP_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe').trim();

function headers() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Re-Minko-Device',
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(statusCode, body) {
  return { statusCode, headers: headers(), body: JSON.stringify(body) };
}

function header(event, name) {
  const headersMap = event.headers || {};
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headersMap)) {
    if (String(key).toLowerCase() === wanted) return String(value || '');
  }
  return '';
}

function deviceIdFrom(event, body = {}) {
  return String(header(event, 'x-re-minko-device') || body.deviceId || '')
    .trim()
    .toLowerCase();
}

function bearerToken(event) {
  const match = header(event, 'authorization').match(/^Bearer\s+(\S+)/i);
  return match ? match[1].trim() : '';
}

function readJson(event) {
  let raw = event.body || '';
  if (event.isBase64Encoded && raw) {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }
  if (!String(raw).trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return null;
  }
}

function deviceHash(deviceId) {
  return hashValue(deviceId, 'desktop-device');
}

function tokenHash(token) {
  return hashValue(token, 'desktop-token');
}

async function findActivatedDevice(deviceId, token) {
  if (!DEVICE_ID.test(deviceId) || !token) return null;
  const rows = await supabaseRequest(
    `/rest/v1/desktop_activated_devices?device_hash=eq.${encodeURIComponent(deviceHash(deviceId))}` +
      `&token_hash=eq.${encodeURIComponent(tokenHash(token))}` +
      `&revoked_at=is.null&select=id,staff_role&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function requireDevice(event, body = {}) {
  const deviceId = deviceIdFrom(event, body);
  const token = bearerToken(event);
  const device = await findActivatedDevice(deviceId, token);
  if (!device?.id) return { error: json(401, { error: 'unauthorized' }) };
  return { deviceId, hash: deviceHash(deviceId), role: device.staff_role || 'tester_pr' };
}

const SHARED_SEED = [
  { said: 'открой каталог', intent: 'OpenSection', section: 'catalog' },
  { said: 'покажи каталог', intent: 'OpenSection', section: 'catalog' },
  { said: 'каталог', intent: 'OpenSection', section: 'catalog' },
  { said: 'в каталог', intent: 'OpenSection', section: 'catalog' },
  { said: 'открой аниме', intent: 'OpenSection', section: 'catalog' },
  { said: 'открой мангу', intent: 'OpenSection', section: 'manga' },
  { said: 'покажи мангу', intent: 'OpenSection', section: 'manga' },
  { said: 'манга', intent: 'OpenSection', section: 'manga' },
  { said: 'открой календарь', intent: 'OpenSection', section: 'calendar' },
  { said: 'покажи календарь', intent: 'OpenSection', section: 'calendar' },
  { said: 'календарь', intent: 'OpenSection', section: 'calendar' },
  { said: 'открой главную', intent: 'OpenSection', section: 'home' },
  { said: 'на главную', intent: 'OpenSection', section: 'home' },
  { said: 'главная', intent: 'OpenSection', section: 'home' },
  { said: 'домой', intent: 'OpenSection', section: 'home' },
  { said: 'открой чат', intent: 'OpenSection', section: 'ai' },
  { said: 'открой минко', intent: 'OpenSection', section: 'ai' },
  { said: 'чат', intent: 'OpenSection', section: 'ai' },
  { said: 'открой друзей', intent: 'OpenSection', section: 'friends' },
  { said: 'друзья', intent: 'OpenSection', section: 'friends' },
  { said: 'открой настройки', intent: 'OpenSection', section: 'settings' },
  { said: 'настройки', intent: 'OpenSection', section: 'settings' },
  { said: 'открой профиль', intent: 'OpenSection', section: 'profile' },
  { said: 'профиль', intent: 'OpenSection', section: 'profile' },
  { said: 'открой комнаты', intent: 'OpenSection', section: 'party' },
  { said: 'комнаты', intent: 'OpenSection', section: 'party' },
  { said: 'открой вип', intent: 'OpenSection', section: 'vip' },
  { said: 'случайное аниме', intent: 'RandomAnime', section: null },
  { said: 'случайное', intent: 'RandomAnime', section: null },
  { said: 'рандом', intent: 'RandomAnime', section: null }
];

let seedPromise = null;

function normalizeSaid(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{Nd}]+/gu, ' ')
    .trim();
}

function tokens(value) {
  return normalizeSaid(value).split(/\s+/).filter((item) => item.length >= 3);
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  const next = new Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    next[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = next[j];
  }
  return prev[right.length];
}

function tokenClose(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))) return true;
  return Math.min(left.length, right.length) >= 5 && levenshtein(left, right) <= 2;
}

function closePhrase(text, phrase) {
  const left = normalizeSaid(text);
  const right = normalizeSaid(phrase);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.startsWith(right) && left.length - right.length <= 8) return true;
  if (right.startsWith(left) && left.length >= (right.length * 4) / 5) return true;
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;
  const rightInLeft = rightTokens.every((item) => leftTokens.some((token) => tokenClose(token, item)));
  const leftInRight = leftTokens.every((item) => rightTokens.some((token) => tokenClose(token, item)));
  return rightInLeft || leftInRight;
}

function findClose(items, said) {
  const hits = (items || []).filter(
    (item) =>
      closePhrase(said, item.said) ||
      closePhrase(item.said, said) ||
      (item.title && (closePhrase(said, item.title) || closePhrase(item.title, said)))
  );
  if (!hits.length) return null;
  hits.sort((a, b) => Number(Boolean(b.title)) - Number(Boolean(a.title)) || b.said.length - a.said.length);
  return hits[0];
}

async function ensureSharedSeed() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const rows = await supabaseRequest(
      '/rest/v1/desktop_minko_memory?device_hash=eq.shared&kind=eq.voice-command&select=said'
    );
    const have = new Set((Array.isArray(rows) ? rows : []).map((row) => normalizeSaid(row.said)));
    for (const item of SHARED_SEED) {
      if (have.has(item.said)) continue;
      await supabaseRequest('/rest/v1/desktop_minko_memory', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          device_hash: 'shared',
          scope: 'shared',
          kind: 'voice-command',
          said: item.said,
          intent: item.intent,
          section: item.section,
          title: null,
          hits: 1,
          payload: {},
          updated_at: new Date().toISOString()
        })
      }).catch(() => {});
    }
  })().catch((error) => {
    seedPromise = null;
    throw error;
  });
  return seedPromise;
}

function mapMemoryRow(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    said: String(row.said || ''),
    intent: String(row.intent || ''),
    section: row.section || null,
    title: row.title || null,
    hits: Number(row.hits || 1),
    envelope: Array.isArray(payload.envelope) ? payload.envelope : null,
    sampleCount: Number(payload.sampleCount || 0)
  };
}

async function getMemory(hash) {
  const rows = await supabaseRequest(
    `/rest/v1/desktop_minko_memory?or=(device_hash.eq.shared,device_hash.eq.${encodeURIComponent(hash)})` +
      `&kind=eq.voice-command&select=said,intent,section,title,hits,payload,scope,updated_at&limit=400`
  );
  return Array.isArray(rows) ? rows.map(mapMemoryRow) : [];
}

async function insertMemory(row) {
  try {
    await supabaseRequest('/rest/v1/desktop_minko_memory', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row)
    });
    return true;
  } catch (error) {
    if (String(error.message || '').includes('supabase_409')) return false;
    throw error;
  }
}

async function lookup(hash, said) {
  await ensureSharedSeed();
  const items = await getMemory(hash);
  return findClose(items, said);
}

async function remember(hash, body) {
  const said = normalizeSaid(safeText(body.said, 80));
  const intent = safeText(body.intent, 40);
  if (said.length < 4 || !intent) return json(400, { error: 'invalid_entry' });
  const section = body.section ? safeText(body.section, 40) : null;
  const title = body.title ? safeText(body.title, 80) : null;
  await ensureSharedSeed();
  const existing = await lookup(hash, said);
  if (existing) return json(200, { ok: true, existed: true });

  const now = new Date().toISOString();
  await insertMemory({
    device_hash: hash,
    scope: 'device',
    kind: 'voice-command',
    said,
    intent,
    section,
    title,
    hits: 1,
    payload: {},
    updated_at: now
  });

  if (intent === 'OpenSection' || intent === 'RandomAnime' || intent === 'FindAnime') {
    await insertMemory({
      device_hash: 'shared',
      scope: 'shared',
      kind: 'voice-command',
      said,
      intent,
      section,
      title,
      hits: 1,
      payload: {},
      updated_at: now
    });
  }

  return json(200, { ok: true, existed: false });
}

const ALLOWED_INTENTS = new Set(['OpenSection', 'FindAnime', 'RandomAnime']);
const ALLOWED_SECTIONS = new Set([
  'catalog',
  'manga',
  'calendar',
  'home',
  'ai',
  'friends',
  'settings',
  'profile',
  'party',
  'vip'
]);

async function saveCommand(hash, said, intent, section, title) {
  const existing = findClose(await getMemory(hash), said);
  if (existing) {
    return {
      said: existing.said,
      intent: existing.intent,
      section: existing.section,
      title: existing.title || title || null
    };
  }
  const now = new Date().toISOString();
  const row = {
    device_hash: hash,
    scope: 'device',
    kind: 'voice-command',
    said,
    intent,
    section,
    title,
    hits: 1,
    payload: {},
    updated_at: now
  };
  await insertMemory(row);
  await insertMemory({ ...row, device_hash: 'shared', scope: 'shared' });
  return { said, intent, section, title, hits: 1 };
}

function snapTitle(title, candidates) {
  const wanted = normalizeSaid(title);
  if (!wanted) return '';
  const list = (candidates || []).map((item) => safeText(item, 80)).filter(Boolean);
  if (!list.length) return safeText(title, 80);
  const exact = list.find((item) => normalizeSaid(item) === wanted);
  if (exact) return exact;
  let best = list[0];
  let bestDist = 99;
  for (const item of list) {
    const dist = levenshtein(wanted, normalizeSaid(item));
    if (dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return bestDist <= 8 ? best : '';
}

async function correctWithOpenAi(said, candidates) {
  const list = (candidates || []).map((item) => safeText(item, 80)).filter(Boolean).slice(0, 28);
  const catalogBlock = list.length
    ? `Если это поиск аниме, title возьми ТОЛЬКО из списка каталога, буква в букву:\n${list
        .map((item, index) => `${index + 1}. ${item}`)
        .join('\n')}\nЕсли ничего не подходит — intent None.`
    : 'Если это поиск аниме, верни официальное название. Не выдумывай редкие тайтлы.';
  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content:
              'Нормализуй голосовую команду приложения Re-Minko. Верни только JSON ' +
              '{"intent":"OpenSection|FindAnime|RandomAnime|None","section":"catalog|manga|calendar|home|ai|friends|settings|profile|party|vip|null","title":"каноническое название или null","canonical":"правильная короткая фраза","alias":"как сказал пользователь"}. ' +
              'Кашу в названии превращай в официальный тайтл. Исполнять нужно исправленное название, не сырую опечатку. ' +
              catalogBlock
          },
          { role: 'user', content: said }
        ]
      })
    },
    16000
  );
  if (!response.ok) return null;
  const payload = await readJsonWithLimit(response, 64 * 1024, 4000);
  const text = String(payload?.choices?.[0]?.message?.content || '');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const intent = safeText(parsed.intent, 40);
    if (!ALLOWED_INTENTS.has(intent)) return null;
    const section = parsed.section ? safeText(parsed.section, 40) : null;
    if (intent === 'OpenSection' && !ALLOWED_SECTIONS.has(section || '')) return null;
    const title =
      intent === 'FindAnime'
        ? snapTitle(parsed.title || parsed.canonical || '', candidates)
        : null;
    if (intent === 'FindAnime' && (!title || title.length < 2)) return null;
    return {
      intent,
      section: intent === 'OpenSection' ? section : null,
      title,
      canonical: normalizeSaid(safeText(parsed.canonical || title || said, 80)),
      alias: normalizeSaid(safeText(parsed.alias || said, 80))
    };
  } catch (_) {
    return null;
  }
}

async function correct(hash, rawSaid, candidates = []) {
  const said = normalizeSaid(safeText(rawSaid, 80));
  if (said.length < 3) return json(400, { error: 'invalid_entry' });
  const existing = await lookup(hash, said);
  if (existing) return json(200, { item: existing, existed: true });
  if (!OPENAI_KEY) return json(200, { item: null, existed: false });

  const parsed = await correctWithOpenAi(said, candidates);
  if (!parsed) return json(200, { item: null, existed: false });

  if (parsed.alias) {
    await saveCommand(hash, parsed.alias, parsed.intent, parsed.section, parsed.title);
  }
  const item = await saveCommand(
    hash,
    parsed.canonical || parsed.title || said,
    parsed.intent,
    parsed.section,
    parsed.title
  );
  return json(200, {
    item: {
      said: parsed.canonical || item.said,
      intent: parsed.intent,
      section: parsed.section,
      title: parsed.title
    },
    existed: false,
    corrected: true
  });
}

async function proxyChat(body) {
  if (!OPENAI_KEY) return json(503, { error: 'openai_missing' });
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 14) : [];
  if (messages.length === 0) return json(400, { error: 'invalid_messages' });
  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: Math.min(1.2, Math.max(0, Number(body.temperature ?? 0.72))),
        max_tokens: Math.min(4096, Math.max(16, Number(body.max_tokens || 1024))),
        messages
      })
    },
    24000
  );
  const text = await readTextWithLimit(response, 256 * 1024, 8000);
  if (!response.ok) return json(502, { error: 'openai_failed' });
  return {
    statusCode: 200,
    headers: headers(),
    body: text
  };
}

async function proxyTranscribe(body) {
  if (!OPENAI_KEY) return json(503, { error: 'openai_missing' });
  const raw = String(body.wavBase64 || '').replace(/\s+/g, '');
  if (raw.length < 80 || raw.length > 900000) return json(400, { error: 'invalid_audio' });
  const wav = Buffer.from(raw, 'base64');
  if (wav.length < 64 || wav.length > 650000) return json(400, { error: 'invalid_audio' });

  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
  form.append('model', TRANSCRIBE_MODEL);
  form.append('language', 'ru');
  form.append(
    'prompt',
    'открой каталог, открой мангу, открой календарь, найди аниме, случайное аниме'
  );

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form
    },
    20000
  );
  if (!response.ok) {
    const err = safeText(await readTextWithLimit(response, 4096), 200);
    return json(502, { error: 'transcribe_failed', detail: err });
  }
  const payload = await readJsonWithLimit(response, 64 * 1024, 4000);
  return json(200, { text: String(payload?.text || '').trim() });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  const action = String(event.queryStringParameters?.action || '').trim().toLowerCase();
  const body = event.httpMethod === 'GET' ? {} : readJson(event);
  if (body == null) return json(400, { error: 'invalid_json' });

  try {
    const gate = await requireDevice(event, body);
    if (gate.error) return gate.error;

    if (action === 'ping') return json(200, { ok: true, role: gate.role });

    if (action === 'memory' && event.httpMethod === 'GET') {
      await ensureSharedSeed();
      const items = await getMemory(gate.hash);
      return json(200, { items });
    }

    if (action === 'lookup' && event.httpMethod === 'POST') {
      const item = await lookup(gate.hash, body.said || '');
      return json(200, { item });
    }

    if (action === 'correct' && event.httpMethod === 'POST') {
      const limit = await consumeRateLimit('desktop-minko-correct', gate.hash, 60, 3600);
      if (!limit.allowed) return json(429, { error: 'rate_limited' });
      return correct(gate.hash, body.said || '', body.candidates || []);
    }

    if (action === 'remember' && event.httpMethod === 'POST') {
      const limit = await consumeRateLimit('desktop-minko-remember', gate.hash, 120, 3600);
      if (!limit.allowed) return json(429, { error: 'rate_limited' });
      return remember(gate.hash, body);
    }

    if (action === 'chat' && event.httpMethod === 'POST') {
      const limit = await consumeRateLimit('desktop-minko-chat', gate.hash, 80, 3600);
      if (!limit.allowed) return json(429, { error: 'rate_limited' });
      void recordSecurityEvent(event, {
        eventType: 'desktop.minko_chat',
        severity: 'low',
        source: 'desktop',
        path: '/desktop/minko',
        details: { action: 'chat' }
      }).catch(() => {});
      return proxyChat(body);
    }

    if (action === 'transcribe' && event.httpMethod === 'POST') {
      const limit = await consumeRateLimit('desktop-minko-stt', gate.hash, 40, 3600);
      if (!limit.allowed) return json(429, { error: 'rate_limited' });
      return proxyTranscribe(body);
    }

    return json(400, { error: 'unknown_action' });
  } catch (error) {
    return json(500, { error: 'server_error', detail: safeText(error?.message, 160) });
  }
};

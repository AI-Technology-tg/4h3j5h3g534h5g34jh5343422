/**
 * Desktop Minko backend: memory + OpenAI proxy.
 * Keys never leave Netlify. The WinUI client only sends speech/text.
 *
 * GET  ?action=ping
 * GET  ?action=memory
 * POST ?action=remember   { said, intent, section, title, hits, payload }
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
      `&kind=eq.voice-command&select=said,intent,section,title,hits,payload,scope,updated_at&limit=200`
  );
  return Array.isArray(rows) ? rows.map(mapMemoryRow) : [];
}

async function remember(hash, body) {
  const said = safeText(body.said, 80);
  const intent = safeText(body.intent, 40);
  if (said.length < 4 || !intent) return json(400, { error: 'invalid_entry' });
  const section = body.section ? safeText(body.section, 40) : null;
  const title = body.title ? safeText(body.title, 80) : null;
  const hits = Math.max(1, Math.min(9999, Number(body.hits || 1)));
  const envelope = Array.isArray(body.envelope)
    ? body.envelope.slice(0, 96).map((value) => Number(value) || 0)
    : null;
  const sampleCount = Math.max(0, Number(body.sampleCount || 0));
  const payload = envelope ? { envelope, sampleCount } : {};

  await supabaseRequest('/rest/v1/desktop_minko_memory?on_conflict=device_hash,kind,said', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      device_hash: hash,
      scope: 'device',
      kind: 'voice-command',
      said,
      intent,
      section,
      title,
      hits,
      payload,
      updated_at: new Date().toISOString()
    })
  });

  if (intent === 'OpenSection' || intent === 'RandomAnime') {
    await supabaseRequest('/rest/v1/desktop_minko_memory?on_conflict=device_hash,kind,said', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        device_hash: 'shared',
        scope: 'shared',
        kind: 'voice-command',
        said,
        intent,
        section,
        title,
        hits: 1,
        payload: {},
        updated_at: new Date().toISOString()
      })
    }).catch(() => {});
  }

  return json(200, { ok: true });
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
    'Команды: открой каталог, открой мангу, открой календарь, найди аниме, случайное аниме.'
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
      const items = await getMemory(gate.hash);
      return json(200, { items });
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

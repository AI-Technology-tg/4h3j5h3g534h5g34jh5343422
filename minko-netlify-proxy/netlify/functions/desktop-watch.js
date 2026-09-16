/**
 * Комнаты совместного просмотра для WinUI (до 4 человек).
 * Авторизация — тот же device token, что desktop-release.
 */
const { hashValue, supabaseRequest } = require('./_security');

const DEVICE_ID = /^[a-f0-9]{64}$/;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MEMBERS = 4;
const MESSAGE_MAX = 400;

function headers() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Re-Minko-Device',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(statusCode, body) {
  return { statusCode, headers: headers(), body: JSON.stringify(body) };
}

function header(event, name) {
  const map = event.headers || {};
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    if (String(key).toLowerCase() === wanted) return String(value || '');
  }
  return '';
}

function readJson(event) {
  let raw = event.body || '';
  if (event.isBase64Encoded && raw) raw = Buffer.from(raw, 'base64').toString('utf8');
  if (!String(raw).trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
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

function makeCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)];
  return code;
}

function safeName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return name || 'Гость';
}

function safeText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function findActivatedDevice(deviceId, token) {
  if (!DEVICE_ID.test(deviceId) || !token) return null;
  const rows = await supabaseRequest(
    `/rest/v1/desktop_activated_devices?device_hash=eq.${encodeURIComponent(deviceHash(deviceId))}` +
      `&token_hash=eq.${encodeURIComponent(tokenHash(token))}` +
      `&revoked_at=is.null&select=id&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function requireDevice(event, body = {}) {
  const deviceId = String(header(event, 'x-re-minko-device') || body.deviceId || '')
    .trim()
    .toLowerCase();
  const match = header(event, 'authorization').match(/^Bearer\s+(\S+)/i);
  const token = match ? match[1].trim() : '';
  const device = await findActivatedDevice(deviceId, token);
  if (!device) return null;
  return { deviceId, hash: deviceHash(deviceId) };
}

async function getRoomByCode(code) {
  const rows = await supabaseRequest(
    `/rest/v1/desktop_watch_rooms?code=eq.${encodeURIComponent(code)}` +
      `&closed_at=is.null&select=*&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getRoomById(id) {
  const rows = await supabaseRequest(
    `/rest/v1/desktop_watch_rooms?id=eq.${encodeURIComponent(id)}` +
      `&closed_at=is.null&select=*&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function listParticipantsSafe(roomId) {
  const rows = await supabaseRequest(
    `/rest/v1/desktop_watch_participants?room_id=eq.${encodeURIComponent(roomId)}` +
      `&select=*&order=last_seen_at.asc`
  );
  return Array.isArray(rows) ? rows : [];
}

async function listMessages(roomId) {
  const rows = await supabaseRequest(
    `/rest/v1/desktop_watch_messages?room_id=eq.${encodeURIComponent(roomId)}` +
      `&select=id,display_name,body,created_at&order=created_at.asc&limit=80`
  );
  return Array.isArray(rows) ? rows : [];
}

async function snapshot(room, hash) {
  const [people, messages] = await Promise.all([
    listParticipantsSafe(room.id),
    listMessages(room.id)
  ]);
  const me = people.find((p) => p.device_hash === hash);
  const now = Date.now();
    return {
    selfPeerId: hash,
    room: {
      id: room.id,
      code: room.code,
      title: room.title,
      animeId: room.anime_id || '',
      animeTitle: room.anime_title,
      episode: Number(room.episode) || 1,
      isPlaying: !!room.is_playing,
      playbackTime: Number(room.playback_time) || 0,
      voiceEnabled: !!room.voice_enabled,
      memberCount: people.length,
      isHost: !!(me && me.is_host)
    },
    participants: people.map((p) => ({
      peerId: p.device_hash,
      displayName: p.display_name,
      isHost: !!p.is_host,
      voiceOn: !!p.voice_on,
      isOnline: now - new Date(p.last_seen_at).getTime() < 45000
    })),
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.display_name,
      text: m.body,
      createdAt: m.created_at
    }))
  };
}

async function touch(roomId, hash) {
  await supabaseRequest(
    `/rest/v1/desktop_watch_participants?room_id=eq.${encodeURIComponent(roomId)}` +
      `&device_hash=eq.${encodeURIComponent(hash)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() })
    }
  ).catch(() => {});
}

async function requireMember(roomId, hash) {
  const room = await getRoomById(roomId);
  if (!room) return { error: json(404, { error: 'room_not_found' }) };
  const people = await listParticipantsSafe(room.id);
  const me = people.find((p) => p.device_hash === hash);
  if (!me) return { error: json(403, { error: 'not_in_room' }) };
  return { room, me, people };
}

async function createRoom(actor, body) {
  const title = safeName(body.title) === 'Гость' ? 'Комната Re — Minko' : safeName(body.title);
  const displayName = safeName(body.displayName);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    try {
      const created = await supabaseRequest('/rest/v1/desktop_watch_rooms', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          code,
          title,
          host_device_hash: actor.hash
        })
      });
      const room = Array.isArray(created) ? created[0] : created;
      await supabaseRequest('/rest/v1/desktop_watch_participants', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          room_id: room.id,
          device_hash: actor.hash,
          display_name: displayName,
          is_host: true
        })
      });
      await supabaseRequest('/rest/v1/desktop_watch_messages', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          room_id: room.id,
          device_hash: actor.hash,
          display_name: 'Система',
          body: `${displayName} создал комнату. Код: ${code}`
        })
      });
      return json(200, await snapshot(room, actor.hash));
    } catch (error) {
      if (!String(error.message || '').includes('23505') || attempt === 7) throw error;
    }
  }
  return json(500, { error: 'code_failed' });
}

async function joinRoom(actor, body) {
  const code = String(body.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return json(400, { error: 'invalid_code' });
  const room = await getRoomByCode(code);
  if (!room) return json(404, { error: 'room_not_found' });
  const people = await listParticipantsSafe(room.id);
  const existing = people.find((p) => p.device_hash === actor.hash);
  if (existing) {
    await touch(room.id, actor.hash);
    return json(200, await snapshot(room, actor.hash));
  }
  if (people.length >= MAX_MEMBERS) return json(409, { error: 'room_full' });
  const displayName = safeName(body.displayName);
  await supabaseRequest('/rest/v1/desktop_watch_participants', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      room_id: room.id,
      device_hash: actor.hash,
      display_name: displayName,
      is_host: false
    })
  });
  await supabaseRequest('/rest/v1/desktop_watch_messages', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      room_id: room.id,
      device_hash: actor.hash,
      display_name: 'Система',
      body: `${displayName} вошёл в комнату`
    })
  });
  return json(200, await snapshot(room, actor.hash));
}

async function leaveRoom(actor, body) {
  const roomId = String(body.roomId || '');
  const found = await requireMember(roomId, actor.hash);
  if (found.error) return found.error;
  if (found.me.is_host) {
    await supabaseRequest(
      `/rest/v1/desktop_watch_rooms?id=eq.${encodeURIComponent(roomId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ closed_at: new Date().toISOString() })
      }
    );
    return json(200, { ok: true, closed: true });
  }
  await supabaseRequest(
    `/rest/v1/desktop_watch_participants?id=eq.${encodeURIComponent(found.me.id)}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
  );
  return json(200, { ok: true, closed: false });
}

async function stateRoom(actor, body, query) {
  const roomId = String(body.roomId || query.roomId || '');
  const found = await requireMember(roomId, actor.hash);
  if (found.error) return found.error;
  await touch(roomId, actor.hash);
  return json(200, await snapshot(found.room, actor.hash));
}

async function setAnime(actor, body) {
  const found = await requireMember(String(body.roomId || ''), actor.hash);
  if (found.error) return found.error;
  if (!found.me.is_host) return json(403, { error: 'host_only' });
  const patch = {
    anime_id: safeText(body.animeId, 80),
    anime_title: safeText(body.animeTitle, 120) || 'Аниме ещё не выбрано',
    episode: Math.max(1, Number.parseInt(body.episode, 10) || 1),
    is_playing: false,
    playback_time: 0,
    updated_at: new Date().toISOString()
  };
  await supabaseRequest(
    `/rest/v1/desktop_watch_rooms?id=eq.${encodeURIComponent(found.room.id)}`,
    { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }
  );
  const room = { ...found.room, ...{ anime_id: patch.anime_id, anime_title: patch.anime_title, episode: patch.episode } };
  return json(200, await snapshot(room, actor.hash));
}

async function setPlayer(actor, body) {
  const found = await requireMember(String(body.roomId || ''), actor.hash);
  if (found.error) return found.error;
  if (!found.me.is_host) return json(403, { error: 'host_only' });
  const patch = {
    episode: Math.max(1, Number.parseInt(body.episode, 10) || found.room.episode || 1),
    is_playing: body.isPlaying !== false,
    playback_time: Math.max(0, Number(body.playbackTime) || 0),
    updated_at: new Date().toISOString()
  };
  await supabaseRequest(
    `/rest/v1/desktop_watch_rooms?id=eq.${encodeURIComponent(found.room.id)}`,
    { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }
  );
  return json(200, await snapshot({ ...found.room, ...patch, is_playing: patch.is_playing }, actor.hash));
}

async function sendChat(actor, body) {
  const found = await requireMember(String(body.roomId || ''), actor.hash);
  if (found.error) return found.error;
  const text = safeText(body.text, MESSAGE_MAX);
  if (!text) return json(400, { error: 'empty_message' });
  await supabaseRequest('/rest/v1/desktop_watch_messages', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      room_id: found.room.id,
      device_hash: actor.hash,
      display_name: found.me.display_name,
      body: text
    })
  });
  await touch(found.room.id, actor.hash);
  return json(200, await snapshot(found.room, actor.hash));
}

async function voiceToggle(actor, body) {
  const found = await requireMember(String(body.roomId || ''), actor.hash);
  if (found.error) return found.error;
  const voiceOn = body.voiceOn === true;
  await supabaseRequest(
    `/rest/v1/desktop_watch_participants?id=eq.${encodeURIComponent(found.me.id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ voice_on: voiceOn, last_seen_at: new Date().toISOString() })
    }
  );
  if (found.me.is_host) {
    await supabaseRequest(
      `/rest/v1/desktop_watch_rooms?id=eq.${encodeURIComponent(found.room.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ voice_enabled: voiceOn, updated_at: new Date().toISOString() })
      }
    );
  }
  return json(200, await snapshot(found.room, actor.hash));
}

async function voiceSignal(actor, body) {
  const found = await requireMember(String(body.roomId || ''), actor.hash);
  if (found.error) return found.error;
  const type = String(body.signalType || '');
  if (!['offer', 'answer', 'candidate', 'hangup'].includes(type)) {
    return json(400, { error: 'bad_signal' });
  }
  const to = String(body.toPeerId || '');
  if (!to || to === actor.hash) return json(400, { error: 'bad_peer' });
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  await supabaseRequest('/rest/v1/desktop_watch_voice_signals', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      room_id: found.room.id,
      from_device_hash: actor.hash,
      to_device_hash: to,
      signal_type: type,
      payload
    })
  });
  return json(200, { ok: true });
}

async function voicePoll(actor, body, query) {
  const found = await requireMember(String(body.roomId || query.roomId || ''), actor.hash);
  if (found.error) return found.error;
  const since = String(body.since || query.since || '');
  let path =
    `/rest/v1/desktop_watch_voice_signals?room_id=eq.${encodeURIComponent(found.room.id)}` +
    `&or=(to_device_hash.eq.${encodeURIComponent(actor.hash)},from_device_hash.eq.${encodeURIComponent(actor.hash)})` +
    `&select=id,from_device_hash,to_device_hash,signal_type,payload,created_at&order=created_at.asc&limit=80`;
  if (since) path += `&created_at=gt.${encodeURIComponent(since)}`;
  const rows = await supabaseRequest(path);
  return json(200, {
    peerId: actor.hash,
    signals: Array.isArray(rows) ? rows : []
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers(), body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }
  const query = event.queryStringParameters || {};
  const body = event.httpMethod === 'POST' ? readJson(event) : {};
  if (body === null) return json(400, { error: 'invalid_json' });
  try {
    const actor = await requireDevice(event, body);
    if (!actor) return json(401, { error: 'unauthorized' });
    const action = String(query.action || body.action || 'state');
    switch (action) {
      case 'create':
        return await createRoom(actor, body);
      case 'join':
        return await joinRoom(actor, body);
      case 'leave':
        return await leaveRoom(actor, body);
      case 'state':
        return await stateRoom(actor, body, query);
      case 'set-anime':
        return await setAnime(actor, body);
      case 'set-player':
        return await setPlayer(actor, body);
      case 'chat':
        return await sendChat(actor, body);
      case 'voice-toggle':
        return await voiceToggle(actor, body);
      case 'voice-signal':
        return await voiceSignal(actor, body);
      case 'voice-poll':
        return await voicePoll(actor, body, query);
      default:
        return json(400, { error: 'unknown_action' });
    }
  } catch (error) {
    return json(500, { error: 'watch_failed', detail: String(error.message || error).slice(0, 180) });
  }
};

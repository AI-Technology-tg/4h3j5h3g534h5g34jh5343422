/**
 * Комнаты и друзья WinUI. Вход в комнату только по друзьям.
 * Вызывается из desktop-release, отдельный URL может быть не задеплоен.
 */
const { hashValue, supabaseRequest } = require('./_security');

const DEVICE_ID = /^[a-f0-9]{64}$/;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MEMBERS = 4;
const MESSAGE_MAX = 400;
const HANDLE_RE = /^@[a-z0-9_]{3,20}$/;

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

function normalizeHandle(value) {
  let handle = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
  if (handle.length < 3) return '';
  return `@${handle}`;
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

async function requireDevice(event, body = {}, options = {}) {
  const deviceId = String(header(event, 'x-re-minko-device') || body.deviceId || '')
    .trim()
    .toLowerCase();
  const match = header(event, 'authorization').match(/^Bearer\s+(\S+)/i);
  const token = match ? match[1].trim() : '';
  const device = await findActivatedDevice(deviceId, token);
  if (!device) return null;
  const hash = deviceHash(deviceId);
  if (options.touch !== false) {
    await supabaseRequest(
      `/rest/v1/desktop_profiles?device_hash=eq.${encodeURIComponent(hash)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ last_seen_at: new Date().toISOString() })
      }
    ).catch(() => {});
  }
  return { deviceId, hash };
}

async function getProfile(hash) {
  const rows = await supabaseRequest(
    `/rest/v1/desktop_profiles?device_hash=eq.${encodeURIComponent(hash)}&select=*&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getProfiles(hashes) {
  const unique = [...new Set(hashes.filter(Boolean))];
  if (!unique.length) return [];
  if (unique.length === 1) {
    const row = await getProfile(unique[0]);
    return row ? [row] : [];
  }
  const or = unique.map((item) => `device_hash.eq.${encodeURIComponent(item)}`).join(',');
  try {
    const rows = await supabaseRequest(`/rest/v1/desktop_profiles?or=(${or})&select=*`);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    const collected = [];
    for (const hash of unique) {
      const row = await getProfile(hash).catch(() => null);
      if (row) collected.push(row);
    }
    return collected;
  }
}

async function getRoomById(id) {
  const rows = await supabaseRequest(
    `/rest/v1/desktop_watch_rooms?id=eq.${encodeURIComponent(id)}` +
      `&closed_at=is.null&select=*&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getRoomsByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const map = {};
  if (!unique.length) return map;
  let rows;
  if (unique.length === 1) {
    const one = await getRoomById(unique[0]);
    rows = one ? [one] : [];
  } else {
    const or = unique.map((id) => `id.eq.${encodeURIComponent(id)}`).join(',');
    rows = await supabaseRequest(`/rest/v1/desktop_watch_rooms?or=(${or})&closed_at=is.null&select=*`);
    rows = Array.isArray(rows) ? rows : [];
  }
  for (const room of rows) map[room.id] = room;
  return map;
}

function playerPayload(room, hash, isHost, memberCount = 0) {
  return {
    selfPeerId: hash,
    room: {
      id: room.id,
      title: room.title,
      animeId: room.anime_id || '',
      animeTitle: room.anime_title,
      episode: Number(room.episode) || 1,
      isPlaying: !!room.is_playing,
      playbackTime: Number(room.playback_time) || 0,
      updatedAt: room.updated_at || null,
      voiceEnabled: !!room.voice_enabled,
      memberCount: Number(memberCount) || 0,
      isHost: !!isHost
    },
    participants: [],
    messages: []
  };
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
      title: room.title,
      animeId: room.anime_id || '',
      animeTitle: room.anime_title,
      episode: Number(room.episode) || 1,
      isPlaying: !!room.is_playing,
      playbackTime: Number(room.playback_time) || 0,
      updatedAt: room.updated_at || null,
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

async function areFriends(a, b) {
  const rows = await supabaseRequest(
    `/rest/v1/desktop_friendships?status=eq.accepted&or=(and(requester_hash.eq.${encodeURIComponent(a)},addressee_hash.eq.${encodeURIComponent(b)}),and(requester_hash.eq.${encodeURIComponent(b)},addressee_hash.eq.${encodeURIComponent(a)}))&select=id&limit=1`
  );
  return Array.isArray(rows) && rows[0];
}

async function findOpenRoomsByHashes(hashes, hostOnly = false) {
  const unique = [...new Set((hashes || []).filter(Boolean))];
  const result = {};
  if (!unique.length) return result;
  const hostFilter = hostOnly ? '&is_host=eq.true' : '';
  let parts;
  if (unique.length === 1) {
    parts = await supabaseRequest(
      `/rest/v1/desktop_watch_participants?device_hash=eq.${encodeURIComponent(unique[0])}` +
        `${hostFilter}&select=device_hash,room_id,last_seen_at&order=last_seen_at.desc`
    );
  } else {
    const or = unique.map((item) => `device_hash.eq.${encodeURIComponent(item)}`).join(',');
    parts = await supabaseRequest(
      `/rest/v1/desktop_watch_participants?or=(${or})${hostFilter}&select=device_hash,room_id,last_seen_at`
    );
  }
  const list = (Array.isArray(parts) ? parts : []).sort(
    (a, b) => new Date(b.last_seen_at || 0) - new Date(a.last_seen_at || 0)
  );
  const roomIds = [...new Set(list.map((row) => row.room_id).filter(Boolean))];
  if (!roomIds.length) return result;
  let rooms = [];
  if (roomIds.length === 1) {
    const one = await getRoomById(roomIds[0]);
    rooms = one ? [one] : [];
  } else {
    const or = roomIds.map((id) => `id.eq.${encodeURIComponent(id)}`).join(',');
    const rows = await supabaseRequest(
      `/rest/v1/desktop_watch_rooms?or=(${or})&closed_at=is.null&select=*`
    );
    rooms = Array.isArray(rows) ? rows : [];
  }
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  for (const row of list) {
    const room = roomMap.get(row.room_id);
    if (room && !result[row.device_hash]) result[row.device_hash] = room;
  }
  return result;
}

async function syncRoom(actor, body, query) {
  const roomId = String(body.roomId || query.roomId || '');
  const room = await getRoomById(roomId);
  if (!room) return json(404, { error: 'room_not_found' });
  const rows = await supabaseRequest(
    `/rest/v1/desktop_watch_participants?room_id=eq.${encodeURIComponent(room.id)}` +
      `&device_hash=eq.${encodeURIComponent(actor.hash)}&select=device_hash,is_host&limit=1`
  );
  const me = Array.isArray(rows) ? rows[0] : null;
  if (!me) return json(403, { error: 'not_in_room' });
  return json(200, playerPayload(room, actor.hash, me.is_host));
}

async function findOpenRoomFor(hash, hostOnly = false) {
  const hostFilter = hostOnly ? '&is_host=eq.true' : '';
  const rows = await supabaseRequest(
    `/rest/v1/desktop_watch_participants?device_hash=eq.${encodeURIComponent(hash)}` +
      `${hostFilter}&select=room_id,is_host,last_seen_at&order=is_host.desc,last_seen_at.desc`
  );
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const room = await getRoomById(row.room_id);
    if (room) return room;
  }
  return null;
}

async function addParticipant(room, hash, displayName, isHost) {
  await supabaseRequest('/rest/v1/desktop_watch_participants', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      room_id: room.id,
      device_hash: hash,
      display_name: displayName,
      is_host: !!isHost
    })
  });
}

async function addSystemMessage(roomId, hash, body) {
  await supabaseRequest('/rest/v1/desktop_watch_messages', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      room_id: roomId,
      device_hash: hash,
      display_name: 'Система',
      body
    })
  });
}

async function createRoom(actor, body) {
  const title = safeName(body.title) === 'Гость' ? 'Комната Re — Minko' : safeName(body.title);
  const profile = await getProfile(actor.hash);
  const displayName = safeName(body.displayName || profile?.display_name);
  const existing = await findOpenRoomFor(actor.hash, true);
  if (existing) {
    await touch(existing.id, actor.hash);
    return json(200, await snapshot(existing, actor.hash));
  }
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
      await addParticipant(room, actor.hash, displayName, true);
      await addSystemMessage(room.id, actor.hash, `${displayName} создал комнату. Пригласите друзей.`);
      return json(200, await snapshot(room, actor.hash));
    } catch (error) {
      if (!String(error.message || '').includes('23505') || attempt === 7) throw error;
    }
  }
  return json(500, { error: 'room_failed' });
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
  return json(200, playerPayload({ ...found.room, ...patch }, actor.hash, true, found.people.length));
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

async function syncProfile(actor, body) {
  const displayName = safeName(body.displayName);
  let handle = normalizeHandle(body.handle);
  if (!HANDLE_RE.test(handle)) {
    handle = `@rm${actor.hash.slice(0, 6)}`;
  }
  const existing = await getProfile(actor.hash);
  const taken = await supabaseRequest(
    `/rest/v1/desktop_profiles?handle=eq.${encodeURIComponent(handle)}&select=device_hash&limit=1`
  );
  if (Array.isArray(taken) && taken[0] && taken[0].device_hash !== actor.hash) {
    handle = `@rm${actor.hash.slice(0, 8)}`;
  }
  const payload = {
    device_hash: actor.hash,
    handle,
    display_name: displayName,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (existing) {
    await supabaseRequest(
      `/rest/v1/desktop_profiles?device_hash=eq.${encodeURIComponent(actor.hash)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      }
    );
  } else {
    await supabaseRequest('/rest/v1/desktop_profiles', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    });
  }
  return json(200, { handle, displayName });
}

function mapFriend(profile, room, now) {
  const lastSeen = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
  const online = now - lastSeen < 90000;
  return {
    id: profile.device_hash,
    displayName: profile.display_name || 'Гость',
    handle: profile.handle || '@user',
    presence: online ? 'В сети' : 'Не в сети',
    isOnline: online,
    watching: room?.anime_title || room?.title || null,
    roomId: room?.id || null,
    roomTitle: room ? room.title : null
  };
}

async function socialInbox(actor) {
  const now = Date.now();
  const friendRows = await supabaseRequest(
    `/rest/v1/desktop_friendships?or=(requester_hash.eq.${encodeURIComponent(actor.hash)},addressee_hash.eq.${encodeURIComponent(actor.hash)})&select=*`
  );
  let inviteRows = [];
  try {
    inviteRows = await supabaseRequest(
      `/rest/v1/desktop_watch_invites?or=(from_hash.eq.${encodeURIComponent(actor.hash)},to_hash.eq.${encodeURIComponent(actor.hash)})&status=eq.pending&select=*`
    );
  } catch (_) {
    inviteRows = [];
  }
  const friendships = Array.isArray(friendRows) ? friendRows : [];
  const invites = Array.isArray(inviteRows) ? inviteRows : [];
  const hashes = new Set([actor.hash]);
  for (const row of friendships) {
    hashes.add(row.requester_hash);
    hashes.add(row.addressee_hash);
  }
  for (const row of invites) {
    hashes.add(row.from_hash);
    hashes.add(row.to_hash);
  }
  const profiles = await getProfiles([...hashes]).catch(() => []);
  const profileMap = new Map(profiles.map((item) => [item.device_hash, item]));
  const accepted = friendships.filter((row) => row.status === 'accepted');
  const friendHashes = accepted.map((row) =>
    row.requester_hash === actor.hash ? row.addressee_hash : row.requester_hash
  );
  let rooms = {};
  try {
    rooms = await findOpenRoomsByHashes(friendHashes, true);
  } catch (_) {
    rooms = {};
  }
  let myHostedRoom = null;
  let membership = null;
  try {
    const hosted = await findOpenRoomsByHashes([actor.hash], true);
    myHostedRoom = hosted[actor.hash] || null;
    const mine = await findOpenRoomsByHashes([actor.hash], false);
    membership = mine[actor.hash] || myHostedRoom;
  } catch (_) {}
  const friends = friendHashes
    .map((hash) => profileMap.get(hash))
    .filter(Boolean)
    .map((profile) => mapFriend(profile, rooms[profile.device_hash], now));
  const incomingFriends = friendships
    .filter((row) => row.status === 'pending' && row.addressee_hash === actor.hash)
    .map((row) => {
      const profile = profileMap.get(row.requester_hash);
      return {
        id: row.id,
        displayName: profile?.display_name || 'Гость',
        handle: profile?.handle || '@user',
        incoming: true
      };
    });
  const outgoingFriends = friendships
    .filter((row) => row.status === 'pending' && row.requester_hash === actor.hash)
    .map((row) => {
      const profile = profileMap.get(row.addressee_hash);
      return {
        id: row.id,
        displayName: profile?.display_name || 'Гость',
        handle: profile?.handle || '@user',
        incoming: false
      };
    });
  const incomingInvites = invites.filter((row) => row.to_hash === actor.hash);
  let inviteRooms = {};
  try {
    inviteRooms = await getRoomsByIds(incomingInvites.map((row) => row.room_id));
  } catch (_) {
    inviteRooms = {};
  }
  const roomInvites = [];
  for (const row of incomingInvites) {
    const from = profileMap.get(row.from_hash);
    const room = inviteRooms[row.room_id];
    if (!room) continue;
    roomInvites.push({
      id: row.id,
      roomId: room.id,
      roomTitle: room.title,
      actorName: from?.display_name || 'Гость',
      actorHandle: from?.handle || '@user',
      kind: row.kind,
      actionLabel: row.kind === 'invite' ? 'Принять приглашение' : 'Принять заявку'
    });
  }
  let activeRoom = null;
  if (membership) {
    try { activeRoom = await snapshot(membership, actor.hash); } catch (_) {}
  }
  return json(200, {
    friends,
    incomingFriends,
    outgoingFriends,
    roomInvites,
    myRoomId: myHostedRoom?.id || null,
    activeRoom
  });
}

async function addFriend(actor, body) {
  const handle = normalizeHandle(body.handle);
  if (!HANDLE_RE.test(handle)) return json(400, { error: 'bad_handle' });
  const rows = await supabaseRequest(
    `/rest/v1/desktop_profiles?handle=eq.${encodeURIComponent(handle)}&select=*&limit=1`
  );
  const target = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!target) return json(404, { error: 'user_not_found' });
  if (target.device_hash === actor.hash) return json(400, { error: 'self' });
  const existing = await supabaseRequest(
    `/rest/v1/desktop_friendships?or=(and(requester_hash.eq.${encodeURIComponent(actor.hash)},addressee_hash.eq.${encodeURIComponent(target.device_hash)}),and(requester_hash.eq.${encodeURIComponent(target.device_hash)},addressee_hash.eq.${encodeURIComponent(actor.hash)}))&select=*&limit=1`
  );
  const row = Array.isArray(existing) && existing[0] ? existing[0] : null;
  if (row?.status === 'accepted') return json(200, { ok: true, already: true });
  if (row?.status === 'pending' && row.addressee_hash === actor.hash) {
    await supabaseRequest(
      `/rest/v1/desktop_friendships?id=eq.${encodeURIComponent(row.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'accepted', updated_at: new Date().toISOString() })
      }
    );
    return json(200, { ok: true, accepted: true });
  }
  if (row?.status === 'pending') return json(200, { ok: true, pending: true });
  if (row?.status === 'declined') {
    await supabaseRequest(
      `/rest/v1/desktop_friendships?id=eq.${encodeURIComponent(row.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          requester_hash: actor.hash,
          addressee_hash: target.device_hash,
          status: 'pending',
          updated_at: new Date().toISOString()
        })
      }
    );
    return json(200, { ok: true, pending: true });
  }
  await supabaseRequest('/rest/v1/desktop_friendships', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      requester_hash: actor.hash,
      addressee_hash: target.device_hash,
      status: 'pending'
    })
  });
  return json(200, { ok: true, pending: true });
}

async function setFriendship(actor, body, status) {
  const id = String(body.friendshipId || body.id || '');
  if (!id) return json(400, { error: 'bad_id' });
  const rows = await supabaseRequest(
    `/rest/v1/desktop_friendships?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return json(404, { error: 'not_found' });
  if (row.addressee_hash !== actor.hash && row.requester_hash !== actor.hash) {
    return json(403, { error: 'forbidden' });
  }
  if (status === 'accepted' && row.addressee_hash !== actor.hash) {
    return json(403, { error: 'forbidden' });
  }
  await supabaseRequest(
    `/rest/v1/desktop_friendships?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() })
    }
  );
  return json(200, { ok: true });
}

async function createRoomInvite(actor, body, kind) {
  const friendHash = String(body.friendId || body.toHash || '');
  if (!friendHash || friendHash === actor.hash) return json(400, { error: 'bad_friend' });
  if (!(await areFriends(actor.hash, friendHash))) return json(403, { error: 'not_friends' });
  const me = await getProfile(actor.hash);
  const friend = await getProfile(friendHash);
  if (!friend) return json(404, { error: 'user_not_found' });

  let room = null;
  if (kind === 'invite') {
    room = String(body.roomId || '') ? await getRoomById(body.roomId) : await findOpenRoomFor(actor.hash, true);
    if (!room) {
      const created = await createRoom(actor, { title: body.title || 'Комната Re — Minko', displayName: me?.display_name });
      const payload = JSON.parse(created.body);
      room = payload.room ? { id: payload.room.id, title: payload.room.title } : null;
      if (!room) return created;
      room = await getRoomById(room.id);
    }
    if (room.host_device_hash !== actor.hash) return json(403, { error: 'host_only' });
  } else {
    room = String(body.roomId || '') ? await getRoomById(body.roomId) : await findOpenRoomFor(friendHash, true);
    if (!room) return json(404, { error: 'room_not_found' });
  }

  const people = await listParticipantsSafe(room.id);
  if (people.some((p) => p.device_hash === (kind === 'invite' ? friendHash : actor.hash))) {
    return json(200, await snapshot(room, actor.hash));
  }
  if (people.length >= MAX_MEMBERS) return json(409, { error: 'room_full' });

  const from = kind === 'invite' ? actor.hash : actor.hash;
  const to = kind === 'invite' ? friendHash : room.host_device_hash;
  try {
    await supabaseRequest('/rest/v1/desktop_watch_invites', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        room_id: room.id,
        from_hash: from,
        to_hash: to,
        kind
      })
    });
  } catch (error) {
    if (!String(error.message || '').includes('23505')) throw error;
  }
  return json(200, {
    ok: true,
    roomId: room.id,
    ...(kind === 'invite' && people.some((p) => p.device_hash === actor.hash)
      ? await snapshot(room, actor.hash)
      : {})
  });
}

async function decideRoomInvite(actor, body, status) {
  const id = String(body.inviteId || body.id || '');
  if (!id) return json(400, { error: 'bad_id' });
  const rows = await supabaseRequest(
    `/rest/v1/desktop_watch_invites?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  );
  const invite = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!invite || invite.status !== 'pending') return json(404, { error: 'invite_not_found' });
  if (invite.to_hash !== actor.hash) return json(403, { error: 'forbidden' });

  await supabaseRequest(
    `/rest/v1/desktop_watch_invites?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() })
    }
  );
  if (status !== 'accepted') return json(200, { ok: true });

  const room = await getRoomById(invite.room_id);
  if (!room) return json(404, { error: 'room_not_found' });
  const joinerHash = invite.kind === 'invite' ? invite.to_hash : invite.from_hash;
  const people = await listParticipantsSafe(room.id);
  if (people.length >= MAX_MEMBERS && !people.some((p) => p.device_hash === joinerHash)) {
    return json(409, { error: 'room_full' });
  }
  if (!people.some((p) => p.device_hash === joinerHash)) {
    const joiner = await getProfile(joinerHash);
    await addParticipant(room, joinerHash, joiner?.display_name || 'Гость', false);
    await addSystemMessage(room.id, joinerHash, `${joiner?.display_name || 'Гость'} вошёл в комнату`);
  }
  if (actor.hash !== joinerHash && !people.some((p) => p.device_hash === actor.hash)) {
    return json(200, { ok: true, roomId: room.id });
  }
  return json(200, await snapshot(room, actor.hash));
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
    const action = String(query.action || body.action || 'watch-state');
    const light =
      action === 'watch-sync' ||
      action === 'watch-set-player' ||
      action === 'set-player' ||
      action === 'voice-poll' ||
      action === 'watch-voice-poll' ||
      action === 'voice-signal' ||
      action === 'watch-voice-signal';
    const actor = await requireDevice(event, body, { touch: !light });
    if (!actor) return json(401, { error: 'unauthorized' });
    switch (action) {
      case 'watch-create':
      case 'create':
        return await createRoom(actor, body);
      case 'watch-leave':
      case 'leave':
        return await leaveRoom(actor, body);
      case 'watch-state':
      case 'state':
        return await stateRoom(actor, body, query);
      case 'watch-sync':
        return await syncRoom(actor, body, query);
      case 'watch-set-anime':
      case 'set-anime':
        return await setAnime(actor, body);
      case 'watch-set-player':
      case 'set-player':
        return await setPlayer(actor, body);
      case 'watch-chat':
      case 'chat':
        return await sendChat(actor, body);
      case 'watch-voice-toggle':
      case 'voice-toggle':
        return await voiceToggle(actor, body);
      case 'watch-voice-signal':
      case 'voice-signal':
        return await voiceSignal(actor, body);
      case 'watch-voice-poll':
      case 'voice-poll':
        return await voicePoll(actor, body, query);
      case 'social-sync':
        return await syncProfile(actor, body);
      case 'social-inbox':
        return await socialInbox(actor);
      case 'social-add-friend':
        return await addFriend(actor, body);
      case 'social-accept-friend':
        return await setFriendship(actor, body, 'accepted');
      case 'social-decline-friend':
        return await setFriendship(actor, body, 'declined');
      case 'social-invite':
        return await createRoomInvite(actor, body, 'invite');
      case 'social-ask':
        return await createRoomInvite(actor, body, 'request');
      case 'social-accept-room':
        return await decideRoomInvite(actor, body, 'accepted');
      case 'social-decline-room':
        return await decideRoomInvite(actor, body, 'declined');
      default:
        return json(400, { error: 'unknown_action' });
    }
  } catch (error) {
    return json(500, { error: 'watch_failed', detail: String(error.message || error).slice(0, 180) });
  }
};

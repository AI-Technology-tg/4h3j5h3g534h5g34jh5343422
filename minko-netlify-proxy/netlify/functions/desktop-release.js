/**
 * Private desktop release gateway.
 *
 * GET  ?action=access
 * GET  ?action=latest
 * GET  ?action=installer
 * GET  ?action=download&tag=v1.2.3&asset=update.zip
 * POST ?action=request-access  { deviceId }
 * POST ?action=activate        { deviceId, code }
 */
const { randomBytes, randomInt } = require('node:crypto');
const { isIP } = require('node:net');
const { clientIp } = require('./_cors');
const { hashValue, supabaseRequest } = require('./_security');

const RELEASE_REPO =
  process.env.DESKTOP_RELEASE_REPO || 'AI-Technology-tg/Re-Minko-WinUI-PC';
const DEFAULT_TEST_IP = '203.0.113.77';
const ALLOWED_ASSETS = new Set(['app.7z', 'update.zip', 'update.zip.sha256']);
const INSTALLER_ASSET = /^Re-Minko-Installer-\d+\.\d+\.\d+\.exe$/;
const DEVICE_ID = /^[a-f0-9]{64}$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const DISCORD_CHANNEL =
  process.env.REMINKO_DISCORD_CHANNEL_ID || '1545611587430256693';

function isAllowedAsset(name) {
  return ALLOWED_ASSETS.has(name) || INSTALLER_ASSET.test(name);
}

function headers(contentType = 'application/json; charset=utf-8') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Re-Minko-Device',
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': contentType,
    Vary: 'Origin'
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: headers(),
    body: JSON.stringify(body)
  };
}

function allowedIps() {
  const configured = String(process.env.REMINKO_ALLOWED_IPS || DEFAULT_TEST_IP);
  return new Set(
    configured
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
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
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function ipAccess(event) {
  const ip = String(clientIp(event) || 'unknown').trim();
  return { allowed: isIP(ip) > 0 && allowedIps().has(ip), currentIp: ip };
}

function deviceHash(deviceId) {
  return hashValue(deviceId, 'desktop-device');
}

function codeHash(code) {
  return hashValue(String(code), 'desktop-code');
}

function tokenHash(token) {
  return hashValue(token, 'desktop-token');
}

function shortDevice(deviceId) {
  return String(deviceId || '').slice(0, 8);
}

function githubToken() {
  return String(process.env.DESKTOP_GH_TOKEN || '').trim();
}

function discordToken() {
  return String(process.env.REMINKO_DISCORD_BOT_TOKEN || '').trim();
}

async function github(path, options = {}) {
  const token = githubToken();
  if (!token) throw new Error('DESKTOP_GH_TOKEN missing');
  return fetch(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: options.accept || 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Re-Minko-Desktop-Gateway',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    redirect: options.redirect || 'follow',
    signal: AbortSignal.timeout(12000)
  });
}

async function releaseByTag(tag) {
  const suffix = tag === 'latest'
    ? 'releases/latest'
    : `releases/tags/${encodeURIComponent(tag)}`;
  const response = await github(`/repos/${RELEASE_REPO}/${suffix}`);
  if (!response.ok) throw new Error(`GitHub release HTTP ${response.status}`);
  return response.json();
}

function ownOrigin(event) {
  const host = event.headers?.host || event.headers?.Host || 're-minko-anime.com';
  const proto = event.headers?.['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function publicRelease(release, event) {
  const origin = ownOrigin(event);
  const assets = {};
  for (const asset of release.assets || []) {
    if (!isAllowedAsset(asset.name)) continue;
    assets[asset.name] =
      `${origin}/.netlify/functions/desktop-release?action=download` +
      `&tag=${encodeURIComponent(release.tag_name)}&asset=${encodeURIComponent(asset.name)}`;
  }
  return {
    tag: release.tag_name,
    version: String(release.tag_name || '').replace(/^v/i, ''),
    publishedAt: release.published_at || null,
    assets
  };
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

async function resolveAccess(event) {
  const ip = ipAccess(event);
  const deviceId = deviceIdFrom(event);
  const token = bearerToken(event);
  if (ip.allowed) return { ...ip, via: 'ip' };
  try {
    const device = await findActivatedDevice(deviceId, token);
    if (device?.id) {
      await supabaseRequest(
        `/rest/v1/desktop_activated_devices?id=eq.${encodeURIComponent(device.id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ last_seen_at: new Date().toISOString() })
        }
      ).catch(() => {});
      return { allowed: true, currentIp: ip.currentIp, via: 'device' };
    }
  } catch (_) {
    /* fall through to deny */
  }
  return { allowed: false, currentIp: ip.currentIp, via: 'none' };
}

async function notifyDiscord({ code, deviceId, ip }) {
  const token = discordToken();
  if (!token) throw new Error('discord_bot_missing');
  const response = await fetch(
    `https://discord.com/api/v10/channels/${DISCORD_CHANNEL}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: [
          '**Re — Minko · код доступа**',
          `Код: \`${code}\``,
          `Устройство: \`${shortDevice(deviceId)}\``,
          `IP: \`${ip}\``,
          'Действует 10 минут. Передайте код тестеру — после ввода он больше не понадобится.'
        ].join('\n')
      }),
      signal: AbortSignal.timeout(10000)
    }
  );
  if (!response.ok) {
    throw new Error(`discord_http_${response.status}`);
  }
}

async function requestAccess(event) {
  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });
  const deviceId = deviceIdFrom(event, body);
  if (!DEVICE_ID.test(deviceId)) return json(400, { error: 'invalid_device' });
  if (!discordToken()) return json(503, { error: 'discord_not_configured' });

  const hash = deviceHash(deviceId);
  const existing = await supabaseRequest(
    `/rest/v1/desktop_activated_devices?device_hash=eq.${encodeURIComponent(hash)}` +
      `&revoked_at=is.null&select=id&limit=1`
  );
  if (Array.isArray(existing) && existing[0]) {
    return json(409, { error: 'already_activated' });
  }

  const recent = await supabaseRequest(
    `/rest/v1/desktop_activation_requests?device_hash=eq.${encodeURIComponent(hash)}` +
      `&used_at=is.null&expires_at=gte.${encodeURIComponent(new Date().toISOString())}` +
      `&select=id,created_at&order=created_at.desc&limit=1`
  );
  if (Array.isArray(recent) && recent[0]?.created_at) {
    const age = Date.now() - Date.parse(recent[0].created_at);
    if (Number.isFinite(age) && age < 60 * 1000) {
      return json(429, { error: 'code_already_requested' });
    }
  }

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await supabaseRequest('/rest/v1/desktop_activation_requests', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      device_hash: hash,
      code_hash: codeHash(code),
      expires_at: expiresAt
    })
  });

  try {
    await notifyDiscord({
      code,
      deviceId,
      ip: ipAccess(event).currentIp
    });
  } catch (error) {
    console.error('[desktop-release] discord', String(error?.message || error).slice(0, 180));
    return json(502, { error: 'discord_delivery_failed' });
  }

  return json(200, { ok: true, expiresInSec: 600 });
}

async function activate(event) {
  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });
  const deviceId = deviceIdFrom(event, body);
  const code = String(body.code || '').replace(/\D/g, '');
  if (!DEVICE_ID.test(deviceId)) return json(400, { error: 'invalid_device' });
  if (!/^\d{6}$/.test(code)) return json(400, { error: 'invalid_code' });

  const hash = deviceHash(deviceId);
  const rows = await supabaseRequest(
    `/rest/v1/desktop_activation_requests?device_hash=eq.${encodeURIComponent(hash)}` +
      `&code_hash=eq.${encodeURIComponent(codeHash(code))}` +
      `&used_at=is.null&expires_at=gte.${encodeURIComponent(new Date().toISOString())}` +
      `&select=id,attempts&limit=1`
  );
  const request = Array.isArray(rows) ? rows[0] : null;
  if (!request?.id) {
    return json(403, { error: 'code_invalid' });
  }
  if (Number(request.attempts || 0) >= 8) {
    return json(429, { error: 'too_many_attempts' });
  }

  const marked = await supabaseRequest(
    `/rest/v1/desktop_activation_requests?id=eq.${encodeURIComponent(request.id)}&used_at=is.null`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        used_at: new Date().toISOString(),
        attempts: Number(request.attempts || 0) + 1
      })
    }
  );
  if (!Array.isArray(marked) || !marked[0]) {
    return json(409, { error: 'code_already_used' });
  }

  const token = randomBytes(32).toString('hex');
  await supabaseRequest('/rest/v1/desktop_activated_devices?on_conflict=device_hash', {
    method: 'POST',
    headers: {
      Prefer: 'return=minimal,resolution=merge-duplicates',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      device_hash: hash,
      token_hash: tokenHash(token),
      activated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      revoked_at: null
    })
  });

  return json(200, { allowed: true, token });
}

async function download(event, tag, assetName) {
  if (!/^v\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(tag)) {
    return json(400, { error: 'invalid_tag' });
  }
  if (!isAllowedAsset(assetName)) {
    return json(403, { error: 'asset_not_allowed' });
  }

  const release = await releaseByTag(tag);
  const asset = (release.assets || []).find((item) => item.name === assetName);
  if (!asset?.id) return json(404, { error: 'asset_missing' });

  const response = await github(`/repos/${RELEASE_REPO}/releases/assets/${asset.id}`, {
    accept: 'application/octet-stream',
    redirect: 'manual',
    method: event.httpMethod === 'HEAD' ? 'HEAD' : 'GET'
  });
  const location = response.headers.get('location');
  if ([301, 302, 303, 307, 308].includes(response.status) && location) {
    return {
      statusCode: 302,
      headers: { ...headers('application/octet-stream'), Location: location },
      body: ''
    };
  }
  return json(502, { error: 'github_asset_failed', status: response.status });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  const action = String(event.queryStringParameters?.action || 'access');
  try {
    if (event.httpMethod === 'POST') {
      if (action === 'request-access') return requestAccess(event);
      if (action === 'activate') return activate(event);
      return json(400, { error: 'unknown_action' });
    }
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
      return json(405, { error: 'method_not_allowed' });
    }

    if (action === 'access') {
      const access = await resolveAccess(event);
      return json(200, {
        allowed: access.allowed,
        currentIp: access.currentIp
      });
    }

    if (action === 'installer') {
      if (!githubToken()) return json(503, { error: 'release_gateway_not_configured' });
      const release = await releaseByTag('latest');
      const installer = (release.assets || []).find((item) => INSTALLER_ASSET.test(item.name));
      if (!installer) return json(404, { error: 'installer_missing' });
      return download(event, release.tag_name, installer.name);
    }

    const access = await resolveAccess(event);
    if (!access.allowed) return json(403, { error: 'not_authorized', ...access });
    if (!githubToken()) return json(503, { error: 'release_gateway_not_configured' });

    if (action === 'latest') {
      return json(200, publicRelease(await releaseByTag('latest'), event));
    }
    if (action === 'download') {
      return download(
        event,
        String(event.queryStringParameters?.tag || ''),
        String(event.queryStringParameters?.asset || '')
      );
    }
    return json(400, { error: 'unknown_action' });
  } catch (error) {
    console.error('[desktop-release]', String(error?.message || error).slice(0, 200));
    return json(502, { error: 'release_gateway_failed' });
  }
};

exports._test = {
  allowedIps,
  accessFor: ipAccess,
  publicRelease,
  isAllowedAsset,
  deviceIdFrom,
  bearerToken,
  DEVICE_ID,
  ALLOWED_ASSETS
};

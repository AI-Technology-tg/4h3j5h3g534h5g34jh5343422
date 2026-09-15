/**
 * Private desktop release gateway.
 *
 * GET ?action=access
 * GET ?action=latest
 * GET ?action=download&tag=v1.2.3&asset=update.zip
 */
const { clientIp } = require('./_cors');
const { isIP } = require('node:net');

const RELEASE_REPO =
  process.env.DESKTOP_RELEASE_REPO || 'AI-Technology-tg/Re-Minko-WinUI-PC';
const DEFAULT_TEST_IP = '203.0.113.77';
const ALLOWED_ASSETS = new Set(['app.7z', 'update.zip', 'update.zip.sha256']);
const INSTALLER_ASSET = /^Re-Minko-Installer-\d+\.\d+\.\d+\.exe$/;

function isAllowedAsset(name) {
  return ALLOWED_ASSETS.has(name) || INSTALLER_ASSET.test(name);
}

function headers(contentType = 'application/json; charset=utf-8') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

function accessFor(event) {
  const ip = String(clientIp(event) || 'unknown').trim();
  return { allowed: isIP(ip) > 0 && allowedIps().has(ip), currentIp: ip };
}

function githubToken() {
  return String(process.env.DESKTOP_GH_TOKEN || '').trim();
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
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' });
  }

  const access = accessFor(event);
  const action = String(event.queryStringParameters?.action || 'access');
  if (action === 'access') return json(200, access);
  if (!access.allowed) return json(403, { error: 'ip_not_allowed', ...access });
  if (!githubToken()) return json(503, { error: 'release_gateway_not_configured' });

  try {
    if (action === 'latest') {
      return json(200, publicRelease(await releaseByTag('latest'), event));
    }
    if (action === 'installer') {
      const release = await releaseByTag('latest');
      const installer = (release.assets || []).find((item) => INSTALLER_ASSET.test(item.name));
      if (!installer) return json(404, { error: 'installer_missing' });
      return download(event, release.tag_name, installer.name);
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

exports._test = { allowedIps, accessFor, publicRelease, isAllowedAsset, ALLOWED_ASSETS };

/**
 * Приватная раздача мобильных обновлений.
 * APK лежит в private GitHub Releases; наружу — только по ключу MOBILE_UPDATE_KEY.
 *
 * GET ?meta=1  → JSON манифест
 * GET ?dl=1    → 302 на временный signed URL GitHub (без публичного релиза)
 */
const RELEASE_REPO = process.env.MOBILE_RELEASE_REPO || 'AI-Technology-tg/4h3j5h3g534h5g34jh5343422';
const ASSET_NAME = 'Re-Minko-Mobile.apk';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Reminko-Mobile-Key, Authorization',
    'Cache-Control': 'no-store',
    ...extra
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function getKey(event) {
  const headers = event.headers || {};
  const headerKey =
    headers['x-reminko-mobile-key'] ||
    headers['X-Reminko-Mobile-Key'] ||
    '';
  const q = event.queryStringParameters || {};
  return String(headerKey || q.key || '').trim();
}

function authorized(event) {
  const expected = String(process.env.MOBILE_UPDATE_KEY || '').trim();
  if (!expected) return false;
  const got = getKey(event);
  return got.length > 0 && got === expected;
}

function ghToken() {
  return (
    process.env.MOBILE_GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ''
  ).trim();
}

async function ghFetch(path, { accept = 'application/vnd.github+json', redirect = 'follow' } = {}) {
  const token = ghToken();
  if (!token) throw new Error('MOBILE_GH_TOKEN missing');
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      'User-Agent': 'ReMinko-Mobile-Update',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    redirect
  });
  return res;
}

function parseVersionCode(body) {
  const m = String(body || '').match(/versionCode\s*:\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function versionNameFromTag(tag) {
  return String(tag || '').replace(/^mobile-v/i, '');
}

async function findLatestMobileRelease() {
  const res = await ghFetch(`/repos/${RELEASE_REPO}/releases?per_page=30`);
  if (!res.ok) throw new Error(`GitHub releases HTTP ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('Bad releases payload');

  const mobiles = list
    .filter((r) => r && !r.draft && String(r.tag_name || '').startsWith('mobile-v'))
    .sort((a, b) => {
      const ca = parseVersionCode(a.body);
      const cb = parseVersionCode(b.body);
      if (ca !== cb) return cb - ca;
      return Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0);
    });

  return mobiles[0] || null;
}

function siteOrigin(event) {
  const host = event.headers?.host || event.headers?.Host || 're-minko-anime.com';
  const proto = event.headers?.['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

async function handleMeta(event) {
  const release = await findLatestMobileRelease();
  if (!release) return json(404, { error: 'no_mobile_release' });

  const asset = (release.assets || []).find((a) => a.name === ASSET_NAME);
  if (!asset) return json(404, { error: 'apk_asset_missing' });

  const versionCode = parseVersionCode(release.body);
  const versionName = versionNameFromTag(release.tag_name);
  if (!versionCode || !versionName) return json(500, { error: 'bad_release_meta' });

  const origin = siteOrigin(event);
  return json(200, {
    versionCode,
    versionName,
    apkUrl: `${origin}/.netlify/functions/mobile-apk?dl=1`,
    notes: String(release.body || '')
      .split('\n')
      .filter((line) => !/versionCode\s*:/i.test(line))
      .join('\n')
      .trim()
      .slice(0, 400),
    publishedAt: release.published_at || null
  });
}

async function handleDownload() {
  const release = await findLatestMobileRelease();
  if (!release) return json(404, { error: 'no_mobile_release' });

  const asset = (release.assets || []).find((a) => a.name === ASSET_NAME);
  if (!asset?.id) return json(404, { error: 'apk_asset_missing' });

  const res = await ghFetch(`/repos/${RELEASE_REPO}/releases/assets/${asset.id}`, {
    accept: 'application/octet-stream',
    redirect: 'manual'
  });

  const location = res.headers.get('location') || res.headers.get('Location');
  if ((res.status === 302 || res.status === 301) && location) {
    return {
      statusCode: 302,
      headers: {
        ...corsHeaders(),
        Location: location
      },
      body: ''
    };
  }

  // Некоторые ответы GitHub уже отдают 200 с редиректом через proxy — тогда нельзя стримить 50MB.
  if (res.status >= 200 && res.status < 300) {
    return json(502, { error: 'expected_redirect_from_github', status: res.status });
  }

  const text = await res.text().catch(() => '');
  return json(res.status || 502, {
    error: 'github_asset_failed',
    detail: text.slice(0, 200)
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' });
  }
  if (!authorized(event)) {
    return json(401, { error: 'unauthorized' });
  }
  if (!ghToken()) {
    return json(500, { error: 'server_token_missing' });
  }

  const q = event.queryStringParameters || {};
  try {
    if (q.meta === '1' || q.action === 'meta') return await handleMeta(event);
    if (q.dl === '1' || q.download === '1') return await handleDownload();
    return json(400, { error: 'use_meta_or_dl' });
  } catch (err) {
    console.error('[mobile-apk]', err);
    return json(500, { error: 'server_error', message: String(err?.message || err) });
  }
};

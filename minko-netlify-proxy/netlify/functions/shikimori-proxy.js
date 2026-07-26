/**
 * Прокси Shikimori REST API — обход CORS для re-minko-anime.com.
 * GET /.netlify/functions/shikimori-proxy?path=/animes/123
 * GET /.netlify/functions/shikimori-proxy?path=/calendar
 */
// .one теперь редиректит через DDoS Guard и зависает в Netlify Functions.
const SHIKI_ORIGIN = 'https://shikimori.io';
const SHIKI_UA = 'Re-Minko/1.0 (https://re-minko-anime.com; +contact@re-minko-anime.com)';
const { corsHeaders: buildCorsHeaders } = require('./_cors');

function corsHeaders(event) {
    return {
        ...buildCorsHeaders(event, 'GET, OPTIONS'),
        'Content-Type': 'application/json; charset=utf-8'
    };
}

function normalizePath(raw) {
    const p = String(raw || '').trim();
    if (!p || p === '/') return null;
    const normalized = p.startsWith('/') ? p : `/${p}`;
    if (/[@\\]/.test(normalized) || normalized.includes('..')) return null;
    if (!/^\/(calendar|animes(\/\d+)?)$/.test(normalized)) return null;
    return normalized;
}

exports.handler = async (event) => {
    const headers = corsHeaders(event);
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const q = event.queryStringParameters || {};
    const path = normalizePath(q.path);
    if (!path) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Shikimori path not allowed' }) };
    }

    let target;
    try {
        target = new URL(`${SHIKI_ORIGIN}/api${path}`);
    } catch (_) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Shikimori path not allowed' }) };
    }
    if (target.origin !== SHIKI_ORIGIN) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Shikimori path not allowed' }) };
    }

    Object.keys(q).forEach((key) => {
        if (key === 'path') return;
        const v = q[key];
        if (v !== undefined && v !== null && String(v) !== '') {
            target.searchParams.set(key, String(v));
        }
    });

    try {
        const res = await fetch(target.toString(), {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': SHIKI_UA
            },
            redirect: 'follow'
        });
        const text = await res.text();
        return {
            statusCode: res.status,
            headers,
            body: text || (res.ok ? 'null' : '{}')
        };
    } catch (e) {
        console.error('[shikimori-proxy]', e);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Shikimori proxy error' })
        };
    }
};

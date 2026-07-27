/**
 * Прокси Shikimori REST API — обход CORS для re-minko-anime.com.
 * GET /.netlify/functions/shikimori-proxy?path=/animes/123
 * GET /.netlify/functions/shikimori-proxy?path=/calendar
 */
// .one теперь редиректит через DDoS Guard и зависает в Netlify Functions.
const SHIKI_ORIGIN = 'https://shikimori.io';
const SHIKI_UA = 'Re-Minko/1.0 (https://re-minko-anime.com; +contact@re-minko-anime.com)';
const { allowedOrigin, corsHeaders: buildCorsHeaders } = require('./_cors');
const {
    consumeRateLimit,
    fetchWithTimeout,
    ipHash,
    readTextWithLimit,
    recordSecurityEvent,
    safeText
} = require('./_security');
const ALLOWED_PARAMS = new Set(['search', 'limit', 'status', 'order', 'page', 'censored']);

function corsHeaders(event) {
    return {
        ...buildCorsHeaders(event, 'GET, OPTIONS'),
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
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
    if (!allowedOrigin(event)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origin not allowed' }) };
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
        if (key === 'path' || !ALLOWED_PARAMS.has(key)) return;
        let value = safeText(q[key], key === 'search' ? 160 : 40);
        if (!value) return;
        if (key === 'limit') value = String(Math.min(50, Math.max(1, Number(value) || 20)));
        if (key === 'page') value = String(Math.min(100, Math.max(1, Number(value) || 1)));
        if (key === 'censored') value = /^(1|true)$/i.test(value) ? 'true' : 'false';
        if (key === 'status' && !/^[a-z_,]{1,60}$/i.test(value)) return;
        if (key === 'order' && !/^[a-z_]{1,40}$/i.test(value)) return;
        target.searchParams.set(key, value);
    });

    try {
        const rate = await consumeRateLimit('proxy.shikimori', ipHash(event), 120, 300);
        if (!rate.allowed) {
            console.warn('SECURITY_EVENT|shikimori_proxy_rate_limited');
            await recordSecurityEvent(event, {
                eventType: 'api.shikimori_proxy_rate_limited',
                severity: 'medium',
                source: 'netlify',
                targetType: 'proxy_path',
                targetId: path
            }).catch(() => {});
            return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests' }) };
        }
        const res = await fetchWithTimeout(target.toString(), {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': SHIKI_UA
            },
            redirect: 'error'
        }, 12000);
        const text = await readTextWithLimit(res, 2 * 1024 * 1024, 12000);
        return {
            statusCode: res.status,
            headers,
            body: text || (res.ok ? 'null' : '{}')
        };
    } catch (e) {
        console.error('[shikimori-proxy]', safeText(e?.message, 200));
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Shikimori proxy error' })
        };
    }
};

/**
 * Прокси ReManga API — обход CORS в браузере.
 * GET /.netlify/functions/remanga-proxy?url=https://api.remanga.org/api/...
 */
const ALLOWED_HOST = 'api.remanga.org';
const { allowedOrigin, corsHeaders: buildCorsHeaders } = require('./_cors');
const {
    consumeRateLimit,
    fetchWithTimeout,
    ipHash,
    readTextWithLimit,
    recordSecurityEvent,
    safeText
} = require('./_security');
const ALLOWED_QUERY_PARAMS = new Set(['query', 'count', 'page', 'branch_id', 'ordering']);

function corsHeaders(event) {
    return {
        ...buildCorsHeaders(event, 'GET, OPTIONS'),
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
        'Content-Type': 'application/json; charset=utf-8'
    };
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

    const raw = (event.queryStringParameters || {}).url;
    if (!raw) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url parameter' }) };
    }

    let target;
    try {
        target = new URL(raw);
    } catch (_) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid url' }) };
    }

    const allowedPath =
        /^\/api\/v2\/titles\/[a-zA-Z0-9_-]{1,160}\/$/.test(target.pathname) ||
        /^\/api\/titles\/chapters\/(?:\d+\/)?$/.test(target.pathname) ||
        target.pathname === '/api/search/';
    if (
        target.protocol !== 'https:' ||
        target.hostname !== ALLOWED_HOST ||
        target.port ||
        target.username ||
        target.password ||
        !allowedPath
    ) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Host not allowed' }) };
    }
    const safeParams = new URLSearchParams();
    for (const [key, rawValue] of target.searchParams.entries()) {
        if (!ALLOWED_QUERY_PARAMS.has(key)) continue;
        let value = safeText(rawValue, key === 'query' ? 160 : 40);
        if (!value) continue;
        if (key === 'count') value = String(Math.min(100, Math.max(1, Number(value) || 20)));
        if (key === 'page') value = String(Math.min(200, Math.max(1, Number(value) || 1)));
        if (key === 'branch_id' && !/^\d{1,16}$/.test(value)) continue;
        if (key === 'ordering' && !/^-?[a-z_]{1,40}$/i.test(value)) continue;
        safeParams.set(key, value);
    }
    target.search = safeParams.toString();

    try {
        const rate = await consumeRateLimit('proxy.remanga', ipHash(event), 120, 300);
        if (!rate.allowed) {
            console.warn('SECURITY_EVENT|remanga_proxy_rate_limited');
            await recordSecurityEvent(event, {
                eventType: 'api.remanga_proxy_rate_limited',
                severity: 'medium',
                source: 'netlify',
                targetType: 'proxy_path',
                targetId: target.pathname
            }).catch(() => {});
            return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests' }) };
        }
        const res = await fetchWithTimeout(target.toString(), {
            method: 'GET',
            headers: {
                Accept: 'application/json, */*',
                Referer: 'https://remanga.org/'
            },
            redirect: 'error'
        }, 12000);
        const text = await readTextWithLimit(res, 4 * 1024 * 1024, 12000);
        return { statusCode: res.status, headers, body: text || '{}' };
    } catch (e) {
        console.error('[remanga-proxy]', safeText(e?.message, 200));
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Upstream fetch failed' })
        };
    }
};

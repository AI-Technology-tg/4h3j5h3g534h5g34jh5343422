/**
 * Прокси Kodik API — токен только на сервере (Netlify env: KODIK_API_TOKEN).
 * GET/POST /.netlify/functions/kodik-proxy?path=/search&title=...
 */
const KODIK_ORIGIN = 'https://kodik-api.com';
const TOKEN = (process.env.KODIK_API_TOKEN || '').trim();
const ALLOWED_PATHS = new Set(['/search', '/list', '/translations/v2', '/qualities', '/countries', '/genres', '/years']);
const { allowedOrigin, corsHeaders: buildCorsHeaders } = require('./_cors');
const {
    consumeRateLimit,
    fetchWithTimeout,
    ipHash,
    readTextWithLimit,
    recordSecurityEvent,
    safeText
} = require('./_security');
const ALLOWED_PARAM_NAME = /^[a-z][a-z0-9_]{0,39}$/i;

function corsHeaders(event) {
    return {
        ...buildCorsHeaders(event, 'GET, POST, OPTIONS'),
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        'Content-Type': 'application/json; charset=utf-8'
    };
}

function normalizePath(raw) {
    const p = String(raw || '/search').trim();
    if (!p || p === '/') return '/search';
    const normalized = p.startsWith('/') ? p : `/${p}`;
    if (/[@\\]/.test(normalized) || normalized.includes('..')) {
        return null;
    }
    return normalized;
}

function buildKodikTarget(path) {
    let target;
    try {
        target = new URL(path, KODIK_ORIGIN + '/');
    } catch (_) {
        return null;
    }
    if (target.origin !== KODIK_ORIGIN) return null;
    return target;
}

exports.handler = async (event) => {
    const headers = corsHeaders(event);
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    if (!allowedOrigin(event)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origin not allowed' }) };
    }
    if (!TOKEN) {
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({
                error: 'KODIK_API_TOKEN не задан в переменных окружения Netlify'
            })
        };
    }

    const q = event.queryStringParameters || {};
    const path = normalizePath(q.path);
    if (!path || !ALLOWED_PATHS.has(path)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Kodik path not allowed' }) };
    }
    const params = {};
    for (const [key, rawValue] of Object.entries(q).slice(0, 30)) {
        if (key === 'path' || key === 'token' || !ALLOWED_PARAM_NAME.test(key)) continue;
        const value = safeText(rawValue, 500);
        if (value) params[key] = value;
    }
    if (params.limit) {
        params.limit = String(Math.min(50, Math.max(1, Number.parseInt(params.limit, 10) || 20)));
    }
    params.token = TOKEN;

    const target = buildKodikTarget(path);
    if (!target) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Kodik path not allowed' }) };
    }
    Object.keys(params).forEach((key) => {
        const v = params[key];
        if (v !== undefined && v !== null && String(v) !== '') {
            target.searchParams.set(key, String(v));
        }
    });

    try {
        const rate = await consumeRateLimit(
            'proxy.kodik',
            `${ipHash(event)}:${path}`,
            120,
            300
        );
        if (!rate.allowed) {
            console.warn('SECURITY_EVENT|kodik_proxy_rate_limited');
            await recordSecurityEvent(event, {
                eventType: 'api.kodik_proxy_rate_limited',
                severity: 'medium',
                source: 'netlify',
                targetType: 'proxy_path',
                targetId: path
            }).catch(() => {});
            return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests' }) };
        }
        let res;
        if (event.httpMethod === 'POST') {
            let body = event.body || '';
            if (event.isBase64Encoded && body) {
                body = Buffer.from(body, 'base64').toString('utf8');
            }
            if (Buffer.byteLength(body, 'utf8') > 8192) {
                return { statusCode: 413, headers, body: JSON.stringify({ error: 'Payload too large' }) };
            }
            const incoming = new URLSearchParams(body);
            const form = new URLSearchParams();
            for (const [key, rawValue] of [...incoming.entries()].slice(0, 30)) {
                if (key === 'token' || !ALLOWED_PARAM_NAME.test(key)) continue;
                const value = safeText(rawValue, 500);
                if (value) form.set(key, value);
            }
            if (form.has('limit')) {
                form.set(
                    'limit',
                    String(Math.min(50, Math.max(1, Number.parseInt(form.get('limit'), 10) || 20)))
                );
            }
            form.set('token', TOKEN);
            res = await fetchWithTimeout(target.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: form.toString(),
                redirect: 'error'
            }, 12000);
        } else {
            res = await fetchWithTimeout(
                target.toString(),
                { method: 'GET', redirect: 'error' },
                12000
            );
        }
        const text = await readTextWithLimit(res, 2 * 1024 * 1024, 12000);
        return {
            statusCode: res.status,
            headers,
            body: text || '{}'
        };
    } catch (e) {
        console.error('[kodik-proxy]', safeText(e?.message, 200));
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Kodik proxy error' })
        };
    }
};

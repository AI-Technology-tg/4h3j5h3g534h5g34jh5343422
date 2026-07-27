/**
 * Прокси Alloha TV API — токен только на сервере (Netlify env: ALLOHA_API_TOKEN).
 * GET /.netlify/functions/alloha-proxy?shikimori=123&season=1&episode=1
 */
const ALLOHA_ORIGIN = 'https://api.alloha.tv';
const TOKEN = (process.env.ALLOHA_API_TOKEN || '').trim();
const ALLOWED_PARAMS = new Set([
    'mal',
    'shikimori',
    'kp',
    'imdb',
    'tmdb',
    'wa_id',
    'world_art',
    'name',
    'list',
    'order',
    'page',
    'uhd'
]);
const { allowedOrigin, corsHeaders: buildCorsHeaders } = require('./_cors');
const {
    consumeRateLimit,
    fetchWithTimeout,
    ipHash,
    readTextWithLimit,
    recordSecurityEvent,
    safeText
} = require('./_security');

function corsHeaders(event) {
    return {
        ...buildCorsHeaders(event, 'GET, OPTIONS'),
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        'Content-Type': 'application/json; charset=utf-8'
    };
}

function hasLookupId(q) {
    return ['mal', 'shikimori', 'kp', 'imdb', 'tmdb', 'wa_id', 'world_art', 'name'].some((k) => {
        const v = q[k];
        return v !== undefined && v !== null && String(v).trim() !== '';
    });
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
    if (!TOKEN) {
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({
                error: 'ALLOHA_API_TOKEN не задан в переменных окружения Netlify'
            })
        };
    }

    const q = event.queryStringParameters || {};
    if (!hasLookupId(q)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Укажите mal, shikimori, kp или другой id для поиска' })
        };
    }

    let target;
    try {
        target = new URL(`${ALLOHA_ORIGIN}/`);
    } catch (_) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Alloha proxy error' }) };
    }
    target.searchParams.set('token', TOKEN);
    Object.keys(q).forEach((key) => {
        if (!ALLOWED_PARAMS.has(key)) return;
        let value = safeText(q[key], key === 'name' ? 160 : 64);
        if (!value) return;
        if (['mal', 'shikimori', 'kp', 'tmdb', 'wa_id', 'world_art', 'page'].includes(key)) {
            if (!/^\d{1,12}$/.test(value)) return;
            if (key === 'page') value = String(Math.min(100, Math.max(1, Number(value))));
        }
        if (key === 'imdb' && !/^tt\d{1,12}$/i.test(value)) return;
        if (key === 'uhd') value = /^(1|true)$/i.test(value) ? '1' : '0';
        if (key === 'order' && !/^[a-z_]{1,30}$/i.test(value)) return;
        if (key === 'list' && !/^[a-z0-9_-]{1,30}$/i.test(value)) return;
        target.searchParams.set(key, value);
    });

    if (!hasLookupId(Object.fromEntries(target.searchParams.entries()))) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Некорректный идентификатор для поиска' })
        }
    }

    try {
        const rate = await consumeRateLimit('proxy.alloha', ipHash(event), 90, 300);
        if (!rate.allowed) {
            console.warn('SECURITY_EVENT|alloha_proxy_rate_limited');
            await recordSecurityEvent(event, {
                eventType: 'api.alloha_proxy_rate_limited',
                severity: 'medium',
                source: 'netlify',
                targetType: 'proxy',
                targetId: 'alloha'
            }).catch(() => {});
            return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests' }) };
        }
        const res = await fetchWithTimeout(
            target.toString(),
            { method: 'GET', redirect: 'error' },
            12000
        );
        const text = await readTextWithLimit(res, 2 * 1024 * 1024, 12000);
        return {
            statusCode: res.status,
            headers,
            body: text || '{}'
        };
    } catch (e) {
        console.error('[alloha-proxy]', safeText(e?.message, 200));
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Alloha proxy error' })
        };
    }
};

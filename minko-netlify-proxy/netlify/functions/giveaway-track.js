/**
 * POST JSON: { refCode, deviceHash, visitorId?, landingPath? }
 * Запись уникального перехода по реф-ссылке розыгрыша.
 */
const { allowedOrigin, corsHeaders } = require('./_cors');
const {
    consumeRateLimit,
    fetchWithTimeout,
    hashValue,
    ipHash,
    readJsonWithLimit,
    readTextWithLimit,
    recordSecurityEvent,
    safePath,
    safeText
} = require('./_security');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function recordClick(payload) {
    const url = `${SUPABASE_URL}/rest/v1/rpc/giveaway_record_click`;
    const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            p_ref_code: payload.refCode,
            p_device_hash: payload.deviceHash,
            p_visitor_id: payload.visitorId || null,
            p_ip_hash: payload.ipHash || null,
            p_user_agent: payload.userAgent || null,
            p_landing_path: payload.landingPath || null
        })
    }, 10000);
    if (!res.ok) {
        const text = await readTextWithLimit(res, 16384);
        throw new Error(text.slice(0, 400));
    }
    const rows = await readJsonWithLimit(res, 128 * 1024);
    return Array.isArray(rows) && rows[0] ? rows[0] : { recorded: true, reason: 'ok' };
}

exports.handler = async function handler(event) {
    const headers = corsHeaders(event, 'POST, OPTIONS');

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    if (!allowedOrigin(event)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origin not allowed' }) };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Service unavailable' }) };
    }
    if (Buffer.byteLength(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8') > 8192) {
        return { statusCode: 413, headers, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    let body;
    try {
        const raw = event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString('utf8')
            : event.body || '{}';
        body = JSON.parse(raw);
    } catch (_) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const refCode = String(body.refCode || body.ref_code || '').trim().toLowerCase();
    const clientDeviceHash = String(body.deviceHash || body.device_hash || '').trim();
    const visitorId = String(body.visitorId || body.visitor_id || '').trim().slice(0, 64);
    const landingPath = safePath(body.landingPath || body.landing_path || '/').slice(0, 512);

    if (!/^[a-z0-9]{8,16}$/.test(refCode)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid ref code' }) };
    }
    if (clientDeviceHash.length < 16 || clientDeviceHash.length > 128) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid device hash' }) };
    }

    try {
        const serverIpHash = ipHash(event);
        const rate = await consumeRateLimit(
            'giveaway.click',
            serverIpHash,
            40,
            60
        );
        if (!rate.allowed) {
            console.warn('SECURITY_EVENT|giveaway_click_rate_limited');
            await recordSecurityEvent(event, {
                eventType: 'api.giveaway_click_rate_limited',
                severity: 'medium',
                source: 'netlify',
                targetType: 'giveaway_ref',
                targetId: refCode
            }).catch(() => {});
            return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests' }) };
        }

        const userAgent = safeText(
            event.headers['user-agent'] || event.headers['User-Agent'] || '',
            512
        );
        const deviceHash = hashValue(
            `${serverIpHash}:${userAgent}`,
            'giveaway-device'
        );
        const result = await recordClick({
            refCode,
            deviceHash,
            visitorId,
            ipHash: serverIpHash,
            userAgent,
            landingPath
        });
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };
    } catch (e) {
        console.error('[giveaway-track]', safeText(e?.message, 200));
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Track failed' }) };
    }
};

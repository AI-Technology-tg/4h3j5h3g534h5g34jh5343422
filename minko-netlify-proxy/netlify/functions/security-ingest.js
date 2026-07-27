const { allowedOrigin, corsHeaders } = require('./_cors');
const {
    consumeRateLimit,
    getAuthenticatedUser,
    hashValue,
    ipHash,
    isConfigured,
    recordSecurityEvent,
    safeOrigin,
    safePath,
    safeText,
    sanitizeDetails
} = require('./_security');

const ALLOWED_EVENTS = new Map([
    ['client.csp_violation', 'medium'],
    ['client.script_error', 'medium'],
    ['client.promise_rejection', 'low'],
    ['client.resource_error', 'medium'],
    ['client.auth_anomaly', 'medium'],
    ['client.blocked_navigation', 'medium']
]);

function response(statusCode, headers, body) {
    return {
        statusCode,
        headers: {
            ...headers,
            'Cache-Control': 'no-store'
        },
        body: body ? JSON.stringify(body) : ''
    };
}

function normalizeClientDetails(body) {
    const details = sanitizeDetails(body.details || {});
    const output = {
        category: safeText(body.category || details?.category, 80) || null,
        error_name: safeText(body.errorName || details?.error_name, 80) || null,
        message: safeText(body.message || details?.message, 240) || null,
        source_origin: safeOrigin(body.sourceUrl || details?.source_url),
        source_path: safePath(body.sourceUrl || details?.source_path || '') || null,
        line_bucket: Math.max(
            0,
            Math.min(100000, Math.floor(Number(body.line || details?.line || 0) / 10) * 10)
        ),
        directive: safeText(body.directive || details?.directive, 120) || null,
        blocked_origin: safeOrigin(body.blockedUrl || details?.blocked_url),
        disposition: safeText(body.disposition || details?.disposition, 40) || null
    };
    return Object.fromEntries(Object.entries(output).filter(([, value]) => value != null && value !== ''));
}

exports.handler = async function handler(event) {
    const headers = corsHeaders(event, 'POST, OPTIONS', 'Content-Type, Authorization');

    if (event.httpMethod === 'OPTIONS') return response(204, headers);
    if (event.httpMethod !== 'POST') {
        return response(405, headers, { error: 'Method not allowed' });
    }
    if (!allowedOrigin(event)) {
        return response(403, headers, { error: 'Origin not allowed' });
    }
    if (!isConfigured()) {
        return response(503, headers, { error: 'Security logging unavailable' });
    }
    if (Buffer.byteLength(event.body || '', 'utf8') > 12288) {
        return response(413, headers, { error: 'Payload too large' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (_) {
        return response(400, headers, { error: 'Invalid JSON' });
    }

    const eventType = safeText(body.eventType || body.event_type, 80).toLowerCase();
    if (!ALLOWED_EVENTS.has(eventType)) {
        return response(400, headers, { error: 'Unsupported event type' });
    }

    const rateKey = `${ipHash(event)}:${safeText(body.clientId || '', 128)}`;
    try {
        const rate = await consumeRateLimit('security.client_ingest', rateKey, 30, 300);
        if (!rate.allowed) {
            console.warn('SECURITY_EVENT|client_ingest_rate_limited');
            return response(429, headers, {
                error: 'Too many events',
                resetAt: rate.resetAt
            });
        }

        const user = await getAuthenticatedUser(event);
        const details = normalizeClientDetails(body);
        const path = safePath(body.path || event.path || '/');
        const fingerprint = hashValue(
            [
                eventType,
                details.category || '',
                details.error_name || '',
                details.source_origin || '',
                details.source_path || '',
                details.directive || '',
                details.blocked_origin || ''
            ].join(':'),
            'client-event'
        );

        await recordSecurityEvent(event, {
            eventType,
            severity: ALLOWED_EVENTS.get(eventType),
            source: 'browser',
            actorUserId: user?.id || null,
            targetType: details.directive ? 'csp_directive' : 'client_runtime',
            targetId: details.directive || details.source_path || null,
            path,
            fingerprint,
            details
        });
        return response(202, headers, { accepted: true });
    } catch (error) {
        console.error('SECURITY_EVENT|security_ingest_failed', safeText(error?.message, 240));
        return response(503, headers, { error: 'Logging unavailable' });
    }
};

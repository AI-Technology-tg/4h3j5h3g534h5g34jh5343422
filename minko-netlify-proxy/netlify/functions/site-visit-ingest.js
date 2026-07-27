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
    sanitizeDetails,
    supabaseRequest
} = require('./_security');

function response(statusCode, headers, body) {
    return {
        statusCode,
        headers: { ...headers, 'Cache-Control': 'no-store' },
        body: body ? JSON.stringify(body) : ''
    };
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
        return response(503, headers, { error: 'Analytics unavailable' });
    }
    if (Buffer.byteLength(event.body || '', 'utf8') > 8192) {
        return response(413, headers, { error: 'Payload too large' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (_) {
        return response(400, headers, { error: 'Invalid JSON' });
    }

    const rawVisitorId = safeText(body.visitor_id || body.visitorId, 64);
    const eventKind = body.event_kind === 'action' ? 'action' : 'pageview';
    const eventLabel = safeText(body.event_label || body.eventLabel, 200).toLowerCase();
    if (rawVisitorId.length < 8) {
        return response(400, headers, { error: 'Invalid visitor' });
    }
    if (eventKind === 'action' && !/^[a-z0-9._-]{1,80}$/.test(eventLabel)) {
        return response(400, headers, { error: 'Invalid event label' });
    }

    const visitorId = `v_${hashValue(rawVisitorId, 'visitor').slice(0, 40)}`;
    const rateKey = ipHash(event);
    try {
        const rate = await consumeRateLimit('analytics.ingest', rateKey, 180, 300);
        if (!rate.allowed) {
            console.warn('SECURITY_EVENT|analytics_ingest_rate_limited');
            await recordSecurityEvent(event, {
                eventType: 'api.analytics_rate_limited',
                severity: 'medium',
                source: 'netlify',
                targetType: 'visitor',
                targetId: visitorId,
                path: safePath(body.path || '/'),
                details: { event_kind: eventKind }
            }).catch(() => {});
            return response(429, headers, { error: 'Too many events', resetAt: rate.resetAt });
        }

        const user = await getAuthenticatedUser(event);
        const meta = sanitizeDetails(body.meta || {});
        await supabaseRequest('/rest/v1/site_visit_events', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
                visitor_id: visitorId,
                user_id: user?.id || null,
                path: safePath(body.path || '/'),
                page_title: safeText(body.page_title || body.pageTitle, 300) || null,
                referrer: safeOrigin(body.referrer) || null,
                user_agent: safeText(
                    event?.headers?.['user-agent'] || event?.headers?.['User-Agent'],
                    512
                ) || null,
                event_kind: eventKind,
                event_label: eventKind === 'action' ? eventLabel : null,
                meta: meta && Object.keys(meta).length ? meta : null
            })
        });
        return response(202, headers, { accepted: true });
    } catch (error) {
        console.error('SECURITY_EVENT|analytics_ingest_failed', safeText(error?.message, 240));
        return response(503, headers, { error: 'Analytics unavailable' });
    }
};

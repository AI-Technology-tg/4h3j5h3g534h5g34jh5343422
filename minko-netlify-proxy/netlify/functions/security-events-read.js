const { allowedOrigin, corsHeaders } = require('./_cors');
const {
    CREATOR_USER_ID,
    consumeRateLimit,
    getAuthenticatedUser,
    hashValue,
    isConfigured,
    recordSecurityEvent,
    safeText,
    supabaseRequest
} = require('./_security');

function response(statusCode, headers, body) {
    return {
        statusCode,
        headers: { ...headers, 'Cache-Control': 'no-store, private' },
        body: JSON.stringify(body || {})
    };
}

exports.handler = async function handler(event) {
    const headers = corsHeaders(event, 'GET, OPTIONS', 'Content-Type, Authorization');
    if (event.httpMethod === 'OPTIONS') return response(204, headers);
    if (event.httpMethod !== 'GET') {
        return response(405, headers, { error: 'Method not allowed' });
    }
    if (!allowedOrigin(event)) {
        return response(403, headers, { error: 'Origin not allowed' });
    }
    if (!isConfigured()) {
        return response(503, headers, { error: 'Security log unavailable' });
    }

    try {
        const user = await getAuthenticatedUser(event);
        if (!user || String(user.id).toLowerCase() !== CREATOR_USER_ID) {
            console.warn('SECURITY_EVENT|security_log_access_denied');
            return response(403, headers, { error: 'Forbidden' });
        }

        const rate = await consumeRateLimit('security.events_read', user.id, 60, 300);
        if (!rate.allowed) {
            return response(429, headers, { error: 'Too many requests', resetAt: rate.resetAt });
        }

        const query = event.queryStringParameters || {};
        const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || 100));
        const sinceDate = new Date(query.since || Date.now() - 24 * 60 * 60 * 1000);
        const oldest = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const since = new Date(
            Math.max(oldest, Number.isFinite(sinceDate.getTime()) ? sinceDate.getTime() : oldest)
        ).toISOString();
        const severity = ['low', 'medium', 'high', 'critical'].includes(query.severity)
            ? query.severity
            : null;
        const eventType = /^[a-z0-9][a-z0-9._-]{1,79}$/.test(query.eventType || '')
            ? query.eventType
            : null;

        const params = new URLSearchParams({
            select:
                'id,occurred_at,event_type,severity,source,actor_user_id,target_type,target_id,request_id,ip_hash,user_agent,path,fingerprint,details',
            occurred_at: `gte.${since}`,
            order: 'occurred_at.desc',
            limit: String(limit)
        });
        if (severity) params.set('severity', `eq.${severity}`);
        if (eventType) params.set('event_type', `eq.${eventType}`);

        const [events, summary] = await Promise.all([
            supabaseRequest(`/rest/v1/security_events?${params.toString()}`, { method: 'GET' }),
            supabaseRequest('/rest/v1/rpc/security_event_summary', {
                method: 'POST',
                body: JSON.stringify({ p_since: since })
            })
        ]);

        await recordSecurityEvent(event, {
            eventType: 'security.log_read',
            severity: 'low',
            source: 'netlify',
            actorUserId: user.id,
            targetType: 'security_events',
            targetId: hashValue(`${since}:${limit}:${severity || ''}:${eventType || ''}`, 'log-query'),
            details: { since, limit, severity, event_type: eventType }
        }).catch(() => {});

        return response(200, headers, {
            summary: Array.isArray(summary) ? summary[0] || summary : summary,
            events: Array.isArray(events) ? events : []
        });
    } catch (error) {
        console.error('SECURITY_EVENT|security_log_read_failed', safeText(error?.message, 240));
        return response(503, headers, { error: 'Security log unavailable' });
    }
};

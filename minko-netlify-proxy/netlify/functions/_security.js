const nodeCrypto = require('crypto');
const { clientIp } = require('./_cors');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SECURITY_LOG_SALT =
    process.env.SECURITY_LOG_SALT ||
    process.env.GIVEAWAY_IP_SALT ||
    SUPABASE_SERVICE_ROLE_KEY;
const CREATOR_USER_ID = 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb';

const SECRET_KEY_PATTERN =
    /(authorization|cookie|password|passcode|access.?token|refresh.?token|service.?role|secret|api.?key|apikey)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const QUERY_SECRET_PATTERN =
    /([?&](?:token|key|secret|code|password|access_token|refresh_token)=)[^&#\s]*/gi;
const CONTROL_CHAR_PATTERN = /\p{Cc}/gu;

function isConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SECURITY_LOG_SALT);
}

function safeText(value, maxLength = 200) {
    return String(value == null ? '' : value)
        .replace(CONTROL_CHAR_PATTERN, ' ')
        .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
        .replace(JWT_PATTERN, '[JWT_REDACTED]')
        .replace(EMAIL_PATTERN, '[EMAIL_REDACTED]')
        .replace(QUERY_SECRET_PATTERN, '$1[REDACTED]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function safePath(value) {
    const text = safeText(value, 2048);
    if (!text) return '/';
    try {
        const url = new URL(text, 'https://re-minko-anime.com');
        return `${url.pathname || '/'}`
            .replace(CONTROL_CHAR_PATTERN, '')
            .slice(0, 1024);
    } catch (_) {
        return (text.split(/[?#]/, 1)[0] || '/').slice(0, 1024);
    }
}

function safeOrigin(value) {
    try {
        const url = new URL(String(value || ''));
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return url.origin.slice(0, 255);
    } catch (_) {
        return null;
    }
}

function hashValue(value, namespace = 'generic') {
    if (!SECURITY_LOG_SALT) return '';
    return nodeCrypto
        .createHmac('sha256', SECURITY_LOG_SALT)
        .update(`${namespace}:${String(value || '')}`)
        .digest('hex');
}

function ipHash(event) {
    return hashValue(clientIp(event), 'ip');
}

function sanitizeDetails(input, depth = 0) {
    if (depth > 2 || input == null) return null;
    if (typeof input === 'boolean' || typeof input === 'number') return input;
    if (typeof input === 'string') return safeText(input, 300);
    if (Array.isArray(input)) {
        return input.slice(0, 20).map((item) => sanitizeDetails(item, depth + 1));
    }
    if (typeof input !== 'object') return safeText(input, 100);

    const output = {};
    for (const [rawKey, rawValue] of Object.entries(input).slice(0, 30)) {
        const key = String(rawKey || '')
            .replace(/[^a-zA-Z0-9_.-]/g, '_')
            .slice(0, 60);
        if (!key || SECRET_KEY_PATTERN.test(key)) continue;
        output[key] = sanitizeDetails(rawValue, depth + 1);
    }
    return output;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

async function readTextWithLimit(response, maxBytes = 1024 * 1024, timeoutMs = 10000) {
    const declared = Number(response?.headers?.get?.('content-length') || 0);
    if (declared > maxBytes) throw new Error('upstream_response_too_large');

    if (!response?.body?.getReader) {
        let timeout;
        const buffer = Buffer.from(
            await Promise.race([
                response.arrayBuffer(),
                new Promise((_, reject) => {
                    timeout = setTimeout(
                        () => reject(new Error('upstream_response_timeout')),
                        Math.max(1000, timeoutMs)
                    );
                })
            ]).finally(() => clearTimeout(timeout))
        );
        if (buffer.length > maxBytes) throw new Error('upstream_response_too_large');
        return buffer.toString('utf8');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        void reader.cancel('upstream_response_timeout').catch(() => {});
    }, Math.max(1000, timeoutMs));
    try {
        while (total <= maxBytes) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel().catch(() => {});
                throw new Error('upstream_response_too_large');
            }
            text += decoder.decode(value, { stream: true });
        }
        if (timedOut) throw new Error('upstream_response_timeout');
        text += decoder.decode();
        return text;
    } finally {
        clearTimeout(timeout);
        reader.releaseLock();
    }
}

async function readJsonWithLimit(response, maxBytes = 1024 * 1024, timeoutMs = 10000) {
    const text = await readTextWithLimit(response, maxBytes, timeoutMs);
    if (!text) return null;
    return JSON.parse(text);
}

async function supabaseRequest(path, options = {}) {
    if (!isConfigured()) throw new Error('security_backend_not_configured');
    const headers = {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    const response = await fetchWithTimeout(`${SUPABASE_URL}${path}`, {
        ...options,
        headers
    }, 10000);
    if (!response.ok) {
        const text = safeText(await readTextWithLimit(response, 16384), 400);
        throw new Error(`supabase_${response.status}:${text}`);
    }
    if (response.status === 204) return null;
    return readJsonWithLimit(response, 3 * 1024 * 1024);
}

async function getAuthenticatedUser(event) {
    const header =
        event?.headers?.authorization ||
        event?.headers?.Authorization ||
        '';
    const match = String(header).match(/^Bearer\s+(.+)$/i);
    if (!match || !isConfigured()) return null;

    const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${match[1]}`
        }
    }, 8000);
    if (!response.ok) return null;
    const user = await readJsonWithLimit(response, 128 * 1024);
    return user && typeof user.id === 'string' ? user : null;
}

async function consumeRateLimit(scope, key, limit, windowSeconds) {
    const rows = await supabaseRequest('/rest/v1/rpc/security_consume_rate_limit', {
        method: 'POST',
        body: JSON.stringify({
            p_scope: safeText(scope, 80).toLowerCase(),
            p_key_hash: hashValue(key, `rate:${scope}`),
            p_limit: limit,
            p_window_seconds: windowSeconds
        })
    });
    const result = Array.isArray(rows) ? rows[0] : rows;
    return {
        allowed: result?.allowed === true,
        remaining: Number(result?.remaining || 0),
        resetAt: result?.reset_at || null
    };
}

async function recordSecurityEvent(event, payload = {}) {
    const eventType = safeText(payload.eventType, 80).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(eventType)) {
        throw new Error('invalid_security_event_type');
    }
    const severity = ['low', 'medium', 'high', 'critical'].includes(payload.severity)
        ? payload.severity
        : 'low';
    const actorUserId =
        typeof payload.actorUserId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(payload.actorUserId)
            ? payload.actorUserId
            : null;
    const fingerprint =
        payload.fingerprint ||
        hashValue(
            `${eventType}:${actorUserId || ''}:${safePath(payload.path || '')}:${safeText(
                payload.targetId,
                200
            )}`,
            'fingerprint'
        );

    await supabaseRequest('/rest/v1/security_events', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
            event_type: eventType,
            severity,
            source: safeText(payload.source || 'netlify', 40).toLowerCase(),
            actor_user_id: actorUserId,
            target_type: safeText(payload.targetType, 80) || null,
            target_id: safeText(payload.targetId, 200) || null,
            request_id: safeText(
                event?.headers?.['x-nf-request-id'] ||
                    event?.headers?.['X-Nf-Request-Id'] ||
                    event?.headers?.['x-request-id'],
                160
            ) || null,
            ip_hash: payload.includeIp === false ? null : ipHash(event),
            user_agent: safeText(
                event?.headers?.['user-agent'] || event?.headers?.['User-Agent'],
                512
            ) || null,
            path: safePath(payload.path || event?.path || '/') || null,
            fingerprint: safeText(fingerprint, 128) || null,
            details: sanitizeDetails(payload.details || {})
        })
    });
}

module.exports = {
    CREATOR_USER_ID,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    consumeRateLimit,
    fetchWithTimeout,
    getAuthenticatedUser,
    hashValue,
    ipHash,
    isConfigured,
    recordSecurityEvent,
    readJsonWithLimit,
    readTextWithLimit,
    safeOrigin,
    safePath,
    safeText,
    sanitizeDetails,
    supabaseRequest
};

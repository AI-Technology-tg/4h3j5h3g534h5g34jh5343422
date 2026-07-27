const { corsHeaders } = require('./_cors');
const {
    consumeRateLimit,
    hashValue,
    ipHash,
    isConfigured,
    recordSecurityEvent,
    safeOrigin,
    safePath,
    safeText
} = require('./_security');

function response(statusCode, headers) {
    return {
        statusCode,
        headers: { ...headers, 'Cache-Control': 'no-store' },
        body: ''
    };
}

exports.handler = async function handler(event) {
    const headers = corsHeaders(event, 'POST, OPTIONS', 'Content-Type');
    if (event.httpMethod === 'OPTIONS') return response(204, headers);
    if (event.httpMethod !== 'POST') return response(405, headers);
    if (!isConfigured()) return response(503, headers);
    if (Buffer.byteLength(event.body || '', 'utf8') > 16384) return response(413, headers);

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (_) {
        return response(400, headers);
    }

    const report = body['csp-report'] || body.body || body;
    const directive = safeText(
        report['effective-directive'] || report.effectiveDirective || report['violated-directive'],
        120
    );
    const documentPath = safePath(
        report['document-uri'] || report.documentURL || report.documentUrl || '/'
    );
    const blockedOrigin = safeOrigin(
        report['blocked-uri'] || report.blockedURL || report.blockedUrl
    );
    const sourceOrigin = safeOrigin(report['source-file'] || report.sourceFile);
    const disposition = safeText(report.disposition, 40);
    if (!directive) return response(400, headers);

    try {
        const rate = await consumeRateLimit(
            'security.csp_report',
            ipHash(event),
            60,
            300
        );
        if (!rate.allowed) {
            console.warn('SECURITY_EVENT|csp_report_rate_limited');
            return response(429, headers);
        }

        await recordSecurityEvent(event, {
            eventType: 'client.csp_violation',
            severity: 'medium',
            source: 'csp_report',
            targetType: 'csp_directive',
            targetId: directive,
            path: documentPath,
            fingerprint: hashValue(
                `${directive}:${blockedOrigin || ''}:${sourceOrigin || ''}:${documentPath}`,
                'csp-report'
            ),
            details: {
                directive,
                blocked_origin: blockedOrigin,
                source_origin: sourceOrigin,
                disposition: disposition || null,
                status_code: Math.max(
                    0,
                    Math.min(599, Number(report['status-code'] || report.statusCode || 0))
                )
            }
        });
        return response(204, headers);
    } catch (error) {
        console.error('SECURITY_EVENT|csp_report_failed', safeText(error?.message, 240));
        return response(503, headers);
    }
};

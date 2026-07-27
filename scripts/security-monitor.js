(function reminkoSecurityMonitor(global) {
    'use strict';

    if (!global || global.__reminkoSecurityMonitorLoaded) return;
    global.__reminkoSecurityMonitorLoaded = true;

    const isProduction = String(global.location?.hostname || '').toLowerCase() === 're-minko-anime.com';
    const endpoint = '/.netlify/functions/security-ingest';
    const maxEventsPerSession = 20;
    const sentFingerprints = new Set();
    const controlCharPattern = /\p{Cc}/gu;
    let sentCount = 0;

    function redact(value, maxLength) {
        return String(value == null ? '' : value)
            .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, 'Bearer [REDACTED]')
            .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[JWT_REDACTED]')
            .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_REDACTED]')
            .replace(/([?&](?:token|key|secret|code|password)=)[^&#\s]*/gi, '$1[REDACTED]')
            .replace(controlCharPattern, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength || 240);
    }

    function pathOnly(value) {
        try {
            const url = new URL(String(value || ''), global.location.origin);
            return url.origin === global.location.origin ? url.pathname : url.origin;
        } catch (_) {
            return String(value || '').split(/[?#]/, 1)[0].slice(0, 500);
        }
    }

    function clientId() {
        const key = 'reminko_security_client_v1';
        try {
            let value = sessionStorage.getItem(key);
            if (!value) {
                value =
                    typeof crypto !== 'undefined' && crypto.randomUUID
                        ? crypto.randomUUID()
                        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                sessionStorage.setItem(key, value);
            }
            return value;
        } catch (_) {
            return 'session';
        }
    }

    function fingerprint(payload) {
        return [
            payload.eventType,
            payload.category || '',
            payload.errorName || '',
            pathOnly(payload.sourceUrl || ''),
            payload.directive || '',
            pathOnly(payload.blockedUrl || '')
        ].join('|');
    }

    async function accessToken() {
        try {
            if (!global.supabaseClient?.auth?.getSession) return '';
            const { data } = await global.supabaseClient.auth.getSession();
            return data?.session?.access_token || '';
        } catch (_) {
            return '';
        }
    }

    async function report(payload) {
        if (!isProduction || sentCount >= maxEventsPerSession || !payload?.eventType) return;
        const key = fingerprint(payload);
        if (sentFingerprints.has(key)) return;
        sentFingerprints.add(key);
        sentCount += 1;

        const token = await accessToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const body = {
            eventType: payload.eventType,
            category: redact(payload.category, 80),
            errorName: redact(payload.errorName, 80),
            message: redact(payload.message, 240),
            sourceUrl: pathOnly(payload.sourceUrl),
            blockedUrl: pathOnly(payload.blockedUrl),
            directive: redact(payload.directive, 120),
            disposition: redact(payload.disposition, 40),
            line: Number(payload.line || 0),
            path: global.location.pathname || '/',
            clientId: clientId()
        };

        try {
            await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                credentials: 'omit',
                keepalive: true
            });
        } catch (_) {
            /* Мониторинг не должен влиять на интерфейс. */
        }
    }

    global.addEventListener(
        'error',
        (event) => {
            const target = event.target;
            if (target && target !== global) {
                const sourceUrl = target.currentSrc || target.src || target.href || '';
                if (!sourceUrl) return;
                void report({
                    eventType: 'client.resource_error',
                    category: String(target.tagName || 'resource').toLowerCase(),
                    sourceUrl
                });
                return;
            }
            void report({
                eventType: 'client.script_error',
                category: 'window_error',
                errorName: event.error?.name || 'Error',
                message: event.message || event.error?.message || 'Script error',
                sourceUrl: event.filename || '',
                line: event.lineno || 0
            });
        },
        true
    );

    global.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        void report({
            eventType: 'client.promise_rejection',
            category: 'unhandled_rejection',
            errorName: reason?.name || 'PromiseRejection',
            message: reason?.message || reason || 'Unhandled rejection'
        });
    });

    global.addEventListener('securitypolicyviolation', (event) => {
        void report({
            eventType: 'client.csp_violation',
            category: 'csp',
            directive: event.effectiveDirective || event.violatedDirective,
            blockedUrl: event.blockedURI,
            sourceUrl: event.sourceFile,
            disposition: event.disposition,
            line: event.lineNumber || 0
        });
    });

    global.reminkoReportSecuritySignal = function reminkoReportSecuritySignal(eventType, details) {
        const allowed = new Set(['client.auth_anomaly', 'client.blocked_navigation']);
        if (!allowed.has(eventType)) return;
        void report({ eventType, ...(details || {}) });
    };
})(window);

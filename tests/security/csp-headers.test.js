'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const headersPath = path.join(__dirname, '..', '..', '_headers');
const headers = fs.readFileSync(headersPath, 'utf8');

describe('CSP baseline in _headers', () => {
    it('enforces hard base controls', () => {
        assert.match(
            headers,
            /Content-Security-Policy:\s*base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests/
        );
        assert.match(headers, /report-uri \/\.netlify\/functions\/security-csp-report/);
    });

    it('ships Report-Only policy with report-uri', () => {
        assert.match(headers, /Content-Security-Policy-Report-Only:/);
        assert.match(
            headers,
            /Content-Security-Policy-Report-Only:[\s\S]*report-uri \/\.netlify\/functions\/security-csp-report/
        );
        assert.match(headers, /script-src 'self' 'unsafe-inline'/);
        assert.match(headers, /object-src 'none'/);
        assert.match(headers, /connect-src[\s\S]*https:\/\/mc\.yandex\.com/);
        assert.match(headers, /connect-src[\s\S]*wss:\/\/mc\.yandex\.com/);
    });

    it('keeps core browser hardening headers', () => {
        assert.match(headers, /X-Content-Type-Options:\s*nosniff/);
        assert.match(headers, /X-Frame-Options:\s*SAMEORIGIN/);
        assert.match(headers, /Referrer-Policy:\s*strict-origin-when-cross-origin/);
        assert.match(headers, /Strict-Transport-Security:/);
    });
});

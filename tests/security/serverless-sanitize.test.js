'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const security = require(
    path.join(
        __dirname,
        '..',
        '..',
        'minko-netlify-proxy',
        'netlify',
        'functions',
        '_security.js'
    )
);

describe('serverless security helpers', () => {
    it('redacts secrets and emails from safeText', () => {
        const text = security.safeText(
            'Bearer eyJhbGciOi.abc.def contact admin@example.com ?token=supersecret'
        );
        assert.match(text, /Bearer \[REDACTED\]/);
        assert.match(text, /\[EMAIL_REDACTED\]/);
        assert.match(text, /token=\[REDACTED\]/);
        assert.equal(text.includes('supersecret'), false);
        assert.equal(text.includes('admin@example.com'), false);
    });

    it('drops secret keys from sanitizeDetails', () => {
        const sanitized = security.sanitizeDetails({
            password: 'secret',
            api_key: 'k',
            note: 'ok',
            nested: { Authorization: 'Bearer x', safe: true }
        });
        assert.equal(sanitized.password, undefined);
        assert.equal(sanitized.api_key, undefined);
        assert.equal(sanitized.note, 'ok');
        assert.equal(sanitized.nested.Authorization, undefined);
        assert.equal(sanitized.nested.safe, true);
    });

    it('accepts only http(s) origins', () => {
        assert.equal(security.safeOrigin('https://re-minko-anime.com'), 'https://re-minko-anime.com');
        assert.equal(security.safeOrigin('javascript:alert(1)'), null);
        assert.equal(security.safeOrigin('file:///etc/passwd'), null);
    });

    it('caps oversized upstream text responses', async () => {
        const huge = 'x'.repeat(64);
        const response = {
            headers: { get: () => String(huge.length) },
            body: null,
            async arrayBuffer() {
                return Buffer.from(huge);
            }
        };
        await assert.rejects(
            () => security.readTextWithLimit(response, 32, 2000),
            /upstream_response_too_large/
        );
    });
});

'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const functionsDir = path.join(
    __dirname,
    '..',
    '..',
    'minko-netlify-proxy',
    'netlify',
    'functions'
);
const securityPath = path.join(functionsDir, '_security.js');
const handlerPath = path.join(functionsDir, 'security-csp-report.js');

it('rate-limits CSP reports by IP, not by client-controlled directive', async () => {
    const security = require(securityPath);
    const originals = {
        consumeRateLimit: security.consumeRateLimit,
        ipHash: security.ipHash,
        isConfigured: security.isConfigured,
        recordSecurityEvent: security.recordSecurityEvent
    };
    const rateKeys = [];

    security.consumeRateLimit = async (_scope, key) => {
        rateKeys.push(key);
        return { allowed: true };
    };
    security.ipHash = () => 'stable-ip-hash';
    security.isConfigured = () => true;
    security.recordSecurityEvent = async () => {};

    delete require.cache[require.resolve(handlerPath)];
    const { handler } = require(handlerPath);

    try {
        for (const directive of ['script-src-elem', 'attacker-controlled-directive']) {
            const result = await handler({
                httpMethod: 'POST',
                headers: {},
                body: JSON.stringify({
                    'csp-report': {
                        'effective-directive': directive,
                        'document-uri': 'https://re-minko-anime.com/'
                    }
                })
            });
            assert.equal(result.statusCode, 204);
        }

        assert.deepEqual(rateKeys, ['stable-ip-hash', 'stable-ip-hash']);
    } finally {
        Object.assign(security, originals);
        delete require.cache[require.resolve(handlerPath)];
    }
});

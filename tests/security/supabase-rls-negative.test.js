'use strict';

/**
 * Negative permission probes against LIVE Supabase (pre-migration baseline).
 * Does not apply SQL. After migration, security_events must stay denied to anon.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const SUPABASE_URL = 'https://ipsawgtsicxwkkkipchp.supabase.co';
const ANON_KEY =
    process.env.SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwc2F3Z3RzaWN4d2tra2lwY2hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTk2NDQsImV4cCI6MjA5MjI3NTY0NH0.vBlwtvBnE3_bjLfELqsGt6pPaZTlMiBsqzS2R-buKLk';

async function rest(pathname, { method = 'GET', body } = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
        method,
        headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: method === 'GET' ? 'count=exact' : 'return=minimal'
        },
        body: body == null ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (_) {
        json = { raw: text };
    }
    return { status: response.status, json, text };
}

function isDenied(status, json) {
    if (![401, 403, 404].includes(status)) return false;
    const message = String(json?.message || json?.raw || '');
    return (
        /permission denied|row-level security|Could not find the table|PGRST205|42501/i.test(
            message
        ) || status === 404
    );
}

describe('live Supabase anon negative permissions', () => {
    it('denies anon reads of privileged tables', async () => {
        const notifications = await rest('notifications?select=*&limit=1');
        assert.equal(notifications.status, 401);
        assert.match(String(notifications.json?.message || ''), /permission denied/i);

        const vip = await rest('vip_subscriptions?select=*&limit=1');
        assert.equal(vip.status, 401);
        assert.match(String(vip.json?.message || ''), /permission denied/i);
    });

    it('blocks anon writes to DMs, AI state, notifications and foreign profiles', async () => {
        const dm = await rest('direct_messages', {
            method: 'POST',
            body: {
                sender_id: '00000000-0000-4000-8000-000000000001',
                receiver_id: '00000000-0000-4000-8000-000000000002',
                message: 'xss'
            }
        });
        assert.ok(isDenied(dm.status, dm.json) || dm.status === 401, JSON.stringify(dm.json));

        const ai = await rest('minko_ai_state', {
            method: 'POST',
            body: { user_id: '00000000-0000-4000-8000-000000000001' }
        });
        assert.ok(isDenied(ai.status, ai.json) || ai.status === 401, JSON.stringify(ai.json));

        const notifications = await rest('notifications', {
            method: 'POST',
            body: {
                user_id: '00000000-0000-4000-8000-000000000001',
                type: 'system',
                title: 'x',
                message: 'y'
            }
        });
        assert.equal(notifications.status, 401);

        const profilePatch = await rest(
            'profiles?id=eq.df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb',
            {
                method: 'PATCH',
                body: { username: 'hacked-by-anon' }
            }
        );
        assert.equal(profilePatch.status, 401);
    });

    it('keeps security_events unreachable to anon (missing now, denied after migration)', async () => {
        const events = await rest('security_events?select=*&limit=1');
        assert.ok(
            events.status === 404 || events.status === 401 || events.status === 403,
            `unexpected security_events status ${events.status}: ${events.text}`
        );
        if (events.status === 200 || events.status === 206) {
            assert.fail('anon must never read security_events rows');
        }
    });

    it('does not leak DM rows to anonymous selects', async () => {
        const dm = await rest('direct_messages?select=*&limit=5');
        if ([401, 403].includes(dm.status)) {
            assert.match(String(dm.json?.message || ''), /permission denied|row-level security/i);
            return;
        }
        assert.ok([200, 206].includes(dm.status), `unexpected status ${dm.status}`);
        assert.ok(Array.isArray(dm.json));
        assert.equal(dm.json.length, 0);
    });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const databasePath = path.join(__dirname, '..', '..', 'database.sql');
const sql = fs.readFileSync(databasePath, 'utf8');

describe('database security contract', () => {
    it('creates observability tables with anon/authenticated revoke', () => {
        assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.security_events/);
        assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.security_rate_limits/);
        assert.match(
            sql,
            /REVOKE ALL ON TABLE public\.security_events FROM PUBLIC,\s*anon,\s*authenticated/
        );
        assert.match(
            sql,
            /REVOKE ALL ON TABLE public\.security_rate_limits FROM PUBLIC,\s*anon,\s*authenticated/
        );
    });

    it('hardens minko_ai_state and site_visit_events writes', () => {
        assert.match(sql, /CREATE POLICY "minko_ai_state_select_own"/);
        assert.match(sql, /REVOKE ALL ON TABLE public\.minko_ai_state FROM anon/);
        assert.match(
            sql,
            /REVOKE INSERT,\s*UPDATE,\s*DELETE ON TABLE public\.minko_ai_state FROM authenticated/
        );
        assert.match(
            sql,
            /REVOKE INSERT,\s*UPDATE ON TABLE public\.site_visit_events FROM anon,\s*authenticated/
        );
    });

    it('tightens profile/DM/favorites select policies', () => {
        assert.match(sql, /CREATE POLICY "profiles_select_own_or_creator"/);
        assert.match(sql, /CREATE POLICY "dm_select"/);
        assert.match(sql, /CREATE POLICY "favorites_anime_select"/);
        assert.match(sql, /CREATE POLICY "notifications_insert_creator"/);
    });

    it('keeps statements idempotent', () => {
        assert.match(sql, /DROP POLICY IF EXISTS/g);
        assert.ok((sql.match(/DROP POLICY IF EXISTS/g) || []).length >= 20);
        assert.match(sql, /CREATE TABLE IF NOT EXISTS/);
        assert.match(sql, /CREATE OR REPLACE FUNCTION/);
    });

    it('preserves security tables and hides trigger functions from RPC roles', () => {
        assert.match(
            sql,
            /'security_events',\s*'security_rate_limits',\s*'site_visit_events'/
        );
        assert.match(
            sql,
            /REVOKE ALL ON FUNCTION public\.security_audit_sensitive_change\(\)\s+FROM PUBLIC,\s*anon,\s*authenticated/
        );
        assert.match(
            sql,
            /REVOKE ALL ON FUNCTION public\.protect_notification_write\(\)\s+FROM PUBLIC,\s*anon,\s*authenticated/
        );
    });
});

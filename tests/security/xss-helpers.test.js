'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadUtilsHelpers } = require('./_load-utils-helpers');

const {
    reminkoEscapeHtml,
    reminkoSafeImageUrl,
    reminkoSafeCssUrl,
    reminkoResolveAssetUrl
} = loadUtilsHelpers();

describe('XSS helpers', () => {
    it('escapes HTML metacharacters', () => {
        assert.equal(
            reminkoEscapeHtml(`<img src=x onerror="alert(1)">&'"'`),
            '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;&quot;&#39;'
        );
    });

    it('rejects javascript and data non-image URLs', () => {
        const fallback = '/Fons/ok.jpg';
        assert.equal(reminkoSafeImageUrl('javascript:alert(1)', fallback), reminkoResolveAssetUrl(fallback));
        assert.equal(reminkoSafeImageUrl('data:text/html,<script>', fallback), reminkoResolveAssetUrl(fallback));
        assert.equal(reminkoSafeImageUrl('//evil.example/a.png', fallback), reminkoResolveAssetUrl(fallback));
        assert.equal(reminkoSafeImageUrl('http://insecure.example/a.png', fallback), reminkoResolveAssetUrl(fallback));
    });

    it('allows https and local asset paths', () => {
        assert.equal(
            reminkoSafeImageUrl('https://cdn.example/cover.png'),
            'https://cdn.example/cover.png'
        );
        assert.match(reminkoSafeImageUrl('/Fons/1 b.jpg'), /Fons\/1(?:%20| )b\.jpg/);
    });

    it('neutralizes CSS url breakouts', () => {
        const escaped = reminkoSafeCssUrl('/Fons/cover"\');hack.jpg');
        assert.equal(/['"\\\n\r\f()]/.test(escaped), false);
        assert.match(escaped, /%22/);
        assert.match(escaped, /%27/);
        assert.match(escaped, /%28|%29/);
    });
});

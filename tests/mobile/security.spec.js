const { test, expect } = require('@playwright/test');
const { preparePage, openRoute } = require('./helpers');

test.describe('security incident regressions', () => {
    test('creator UI identity ignores mutable profile fields', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop-901', 'Security identity regression runs once');

        await preparePage(page);
        await openRoute(page, '/');

        const result = await page.evaluate(() => ({
            forged: window.reminkoIsSiteCreatorProfile({
                id: '00000000-0000-4000-8000-000000000001',
                username: 'Subarik',
                is_site_creator: true,
                isSiteCreator: true
            }),
            emailOnly: window.reminkoIsSiteCreatorProfile({
                id: '00000000-0000-4000-8000-000000000001',
                email: 'creator@reminko.com'
            }),
            canonical: window.reminkoIsSiteCreatorProfile({
                id: 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb'
            })
        }));

        expect(result.forged).toBe(false);
        expect(result.emailOnly).toBe(false);
        expect(result.canonical).toBe(true);
    });

    test('XSS URL helpers reject dangerous schemes in browser', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop-901', 'Security helper regression runs once');

        await preparePage(page);
        await openRoute(page, '/');

        const result = await page.evaluate(() => {
            const fallback = '/Fons/1 b.jpg';
            return {
                escape: window.reminkoEscapeHtml('<script>alert(1)</script>'),
                js: window.reminkoSafeImageUrl('javascript:alert(1)', fallback),
                proto: window.reminkoSafeImageUrl('http://evil.example/a.png', fallback),
                css: window.reminkoSafeCssUrl(`https://cdn.example/a"');hack`),
                https: window.reminkoSafeImageUrl('https://cdn.example/cover.png')
            };
        });

        expect(result.escape).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(result.js).toContain('Fons/');
        expect(result.js).not.toMatch(/^javascript:/i);
        expect(result.proto).toContain('Fons/');
        expect(result.css).not.toMatch(/['"\\\n\r\f()]/);
        expect(result.https).toBe('https://cdn.example/cover.png');
    });
});

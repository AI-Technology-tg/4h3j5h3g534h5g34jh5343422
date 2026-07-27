const { test, expect } = require('@playwright/test');
const { preparePage, openRoute } = require('./helpers');

test.describe('security incident regressions', () => {
    test('stored notification HTML stays inert', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop-901', 'Security DOM regression runs once');

        const errors = await preparePage(page);
        await openRoute(page, '/');
        await page.waitForFunction(
            () => window.notificationService && document.getElementById('notificationsList')
        );
        // Дождаться завершения фоновой первоначальной загрузки, чтобы она не
        // перезаписала вручную подставленный regression payload.
        await page.waitForTimeout(2000);

        await page.evaluate(() => {
            window.__notificationXssExecuted = false;
            window.notificationService.notifications = [
                {
                    id: '00000000-0000-4000-8000-000000000001',
                    user_id: '00000000-0000-4000-8000-000000000001',
                    type: 'system',
                    title: '<iframe src="https://www.youtube.com/embed/test"></iframe>',
                    message:
                        '<img src="x" onerror="window.__notificationXssExecuted=true"><style>body{display:none}</style>',
                    link: 'javascript:window.__notificationXssExecuted=true',
                    read: false,
                    created_at: new Date().toISOString()
                }
            ];
            window.notificationService.renderNotifications();
        });

        const list = page.locator('#notificationsList');
        const item = list.locator('.notification-item');
        await expect(item).toHaveCount(1);
        await expect(item).toContainText('<iframe');
        await expect(list.locator('iframe, script, style, img')).toHaveCount(0);
        await expect(item).not.toHaveAttribute('onclick', /.+/);

        await item.dispatchEvent('click');
        expect(await page.evaluate(() => window.__notificationXssExecuted)).toBe(false);
        expect(page.url()).not.toMatch(/^javascript:/i);

        const links = await page.evaluate(() => ({
            javascript: window.notificationService._safeNavigationLink(
                'javascript:window.__notificationXssExecuted=true'
            ),
            external: window.notificationService._safeNavigationLink('https://evil.example/phish'),
            internal: window.notificationService._safeNavigationLink('/profile.html')
        }));
        expect(links.javascript).toBe('');
        expect(links.external).toBe('');
        expect(new URL(links.internal).pathname).toBe('/profile.html');
        expect(errors.runtimeErrors).toEqual([]);
    });

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

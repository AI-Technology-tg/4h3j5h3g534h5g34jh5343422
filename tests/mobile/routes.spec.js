const { test, expect } = require('@playwright/test');
const {
    preparePage,
    openRoute,
    readLayout,
    readSmallPrimaryTargets
} = require('./helpers');

const USER_ROUTES = [
    '/',
    '/catalog/anime.html',
    '/catalog/calendar.html',
    '/catalog/manga.html',
    '/catalog/anime-4k.html',
    '/anime/view.html?id=1',
    '/anime/view-4k.html?id=1',
    '/manga/view.html?id=1',
    '/manga/reader.html?id=1',
    '/profile.html',
    '/friends.html',
    '/messages.html',
    '/favorites.html',
    '/favorites-manga.html',
    '/history.html',
    '/minko-ai.html',
    '/watch-together.html',
    '/info.html',
    '/terms-of-service.html',
    '/privacy-policy.html',
    '/account-deletion.html',
    '/reset-password.html',
    '/payment-success.html',
    '/cancel-success.html',
    '/Mini%20Game%20Minko/index.html'
];

const PRIMARY_TOUCH_ROUTES = [
    '/',
    '/catalog/anime.html',
    '/catalog/calendar.html',
    '/catalog/manga.html',
    '/anime/view.html?id=1',
    '/manga/reader.html?id=1',
    '/profile.html',
    '/friends.html',
    '/messages.html',
    '/favorites.html',
    '/favorites-manga.html',
    '/history.html',
    '/minko-ai.html',
    '/watch-together.html',
    '/info.html',
    '/reset-password.html',
    '/Mini%20Game%20Minko/index.html'
];

for (const theme of ['white', 'dark']) {
    test.describe(`${theme} theme`, () => {
        for (const route of USER_ROUTES) {
            test(`${route} не выходит за viewport`, async ({ page }, testInfo) => {
                const errors = await preparePage(page, theme);
                await openRoute(page, route, theme);

                const layout = await readLayout(page);
                if (
                    layout.rootOverflow > 1 ||
                    layout.bodyOverflow > 1 ||
                    layout.escapedFixed.length
                ) {
                    await testInfo.attach('layout-debug', {
                        body: Buffer.from(JSON.stringify(layout, null, 2)),
                        contentType: 'application/json'
                    });
                    await testInfo.attach('viewport', {
                        body: await page.screenshot({ fullPage: false }),
                        contentType: 'image/png'
                    });
                }

                expect(layout.rootOverflow, 'documentElement horizontal overflow').toBeLessThanOrEqual(
                    1
                );
                expect(layout.bodyOverflow, 'body horizontal overflow').toBeLessThanOrEqual(1);
                expect(layout.escapedFixed, 'fixed/sticky элементы за viewport').toEqual([]);
                expect(errors.runtimeErrors, 'необработанные JavaScript exceptions').toEqual([]);
                expect(errors.consoleErrors, 'критичные console errors').toEqual([]);
            });
        }
    });
}

test.describe('mobile interaction contract', () => {
    for (const theme of ['white', 'dark']) {
        for (const route of PRIMARY_TOUCH_ROUTES) {
            test(`${theme}: ${route} имеет достаточные hit areas`, async ({ page }, testInfo) => {
                test.skip(
                    !/mobile|iphone|tablet|boundary/.test(testInfo.project.name),
                    'Проверка только для ≤900px'
                );
                await preparePage(page, theme);
                await openRoute(page, route, theme);
                const small = await readSmallPrimaryTargets(page);
                if (small.length) {
                    await testInfo.attach('small-targets', {
                        body: Buffer.from(JSON.stringify(small, null, 2)),
                        contentType: 'application/json'
                    });
                }
                expect(small, 'Основные touch targets должны быть минимум 44×44px').toEqual([]);
            });
        }
    }

    test('нижнее меню содержит ключевые desktop-функции', async ({ page }, testInfo) => {
        test.skip(
            !/mobile|iphone|tablet|boundary/.test(testInfo.project.name),
            'Проверка только для ≤900px'
        );
        await preparePage(page, 'white');
        await openRoute(page, '/', 'white');
        const hrefs = await page
            .locator('.sidebar .sidebar-link[href]')
            .evaluateAll((links) => links.map((link) => link.getAttribute('href') || ''));
        for (const expectedHref of [
            'catalog/anime.html',
            'catalog/calendar.html',
            'favorites.html',
            'history.html',
            'messages.html',
            'friends.html',
            'profile.html'
        ]) {
            expect(
                hrefs.some((href) => href.includes(expectedHref)),
                `В mobile nav отсутствует ${expectedHref}`
            ).toBeTruthy();
        }

        const scrollState = await page.locator('.sidebar').evaluate((sidebar) => {
            const last = sidebar.querySelector('.sidebar-link:last-of-type');
            last?.scrollIntoView({ inline: 'end', block: 'nearest' });
            return new Promise((resolve) =>
                requestAnimationFrame(() =>
                    resolve({
                        clientWidth: sidebar.clientWidth,
                        scrollWidth: sidebar.scrollWidth,
                        scrollLeft: sidebar.scrollLeft
                    })
                )
            );
        });
        expect(scrollState.scrollWidth).toBeGreaterThan(scrollState.clientWidth);
        expect(scrollState.scrollLeft).toBeGreaterThan(0);
    });
});

const { test, expect } = require('@playwright/test');
const { preparePage, openRoute, readLayout } = require('./helpers');

function isMobileProject(testInfo) {
    return /mobile|iphone|tablet|boundary/.test(testInfo.project.name);
}

test.describe('mobile device contract', () => {
    test('ключевые страницы сохраняют layout в portrait и landscape', async ({
        page
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'mobile-320', 'Один полный orientation smoke');
        await preparePage(page, 'white');

        for (const viewport of [
            { width: 320, height: 658 },
            { width: 844, height: 390 }
        ]) {
            await page.setViewportSize(viewport);
            for (const route of [
                '/',
                '/catalog/anime.html',
                '/reset-password.html'
            ]) {
                await openRoute(page, route, 'white');
                const layout = await readLayout(page);
                expect(
                    layout.rootOverflow,
                    `${route} overflow при ${viewport.width}×${viewport.height}`
                ).toBeLessThanOrEqual(1);
                expect(layout.escapedFixed, `${route}: fixed-слои внутри viewport`).toEqual([]);
            }
        }
    });

    test('viewport и shell учитывают safe-area', async ({ page }, testInfo) => {
        test.skip(!isMobileProject(testInfo), 'Проверка mobile safe-area');
        await preparePage(page, 'white');
        await openRoute(page, '/', 'white');

        const shell = await page.evaluate(() => {
            const viewport = document.querySelector('meta[name="viewport"]')?.content || '';
            const rootStyle = getComputedStyle(document.documentElement);
            const header = document.querySelector('.top-navbar')?.getBoundingClientRect();
            const tabbar = document.querySelector('.sidebar')?.getBoundingClientRect();
            return {
                viewport,
                safeTop: rootStyle.getPropertyValue('--reminko-safe-top').trim(),
                safeBottom: rootStyle.getPropertyValue('--reminko-safe-bottom').trim(),
                headerTop: Math.round(header?.top || 0),
                tabbarBottom: Math.round(tabbar?.bottom || 0),
                viewportHeight: innerHeight
            };
        });

        expect(shell.viewport).toContain('viewport-fit=cover');
        expect(shell.safeTop).not.toBe('');
        expect(shell.safeBottom).not.toBe('');
        expect(shell.headerTop).toBeGreaterThanOrEqual(0);
        expect(shell.tabbarBottom).toBeLessThanOrEqual(shell.viewportHeight + 1);
    });

    test('resize 900→901 переключает tabbar в desktop sidebar', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'boundary-900', 'Только граничный viewport');
        await preparePage(page, 'white');
        await page.setViewportSize({ width: 900, height: 800 });
        await openRoute(page, '/', 'white');

        const readSidebar = () =>
            page.locator('.sidebar').evaluate((sidebar) => {
                const style = getComputedStyle(sidebar);
                const rect = sidebar.getBoundingClientRect();
                return {
                    position: style.position,
                    bottom: style.bottom,
                    top: style.top,
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight
                };
            });

        const mobile = await readSidebar();
        await page.setViewportSize({ width: 901, height: 800 });
        await page.waitForTimeout(100);
        const desktop = await readSidebar();

        expect(mobile.position).toBe('fixed');
        expect(mobile.bottom).not.toBe('auto');
        expect(mobile.width).toBe(900);
        expect(mobile.height).toBeLessThan(mobile.viewportHeight);
        expect(desktop.position).toBe('sticky');
        expect(desktop.bottom).toBe('auto');
        expect(desktop.top).not.toBe('auto');
        expect(desktop.width).toBeLessThan(901);
        expect(desktop.height).toBeGreaterThan(mobile.height);
    });

    test('поиск на каталоге остаётся доступен на узком экране', async ({
        page
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'iphone-se', 'Один keyboard smoke');
        await preparePage(page, 'dark');
        await openRoute(page, '/catalog/anime.html', 'dark');
        await page.setViewportSize({ width: 375, height: 420 });
        await page.waitForTimeout(150);

        const geometry = await page.evaluate(() => {
            const input = document.querySelector('#topSearchInput, .top-search-input, input[type="search"]');
            const inputRect = input?.getBoundingClientRect();
            return {
                inputHeight: Math.round(inputRect?.height || 0),
                bodyHeight: Math.round(document.body.getBoundingClientRect().height),
                viewportHeight: window.innerHeight
            };
        });

        expect(geometry.bodyHeight).toBeLessThanOrEqual(geometry.viewportHeight + 80);
        expect(geometry.inputHeight).toBeGreaterThanOrEqual(36);
    });

    test('standalone-страницы не резервируют место под отсутствующий tabbar', async ({
        page
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'mobile-320', 'Один standalone smoke');
        await preparePage(page, 'white');

        for (const route of [
            '/reset-password.html'
        ]) {
            await openRoute(page, route, 'white');
            const geometry = await page.evaluate(() => ({
                hasTabbar: Boolean(document.querySelector('.sidebar')),
                paddingBottom: parseFloat(getComputedStyle(document.body).paddingBottom) || 0
            }));
            expect(geometry.hasTabbar, `${route}: tabbar отсутствует`).toBeFalsy();
            expect(geometry.paddingBottom, `${route}: нет лишнего резерва tabbar`).toBeLessThan(40);
        }
    });

    test('длинный mobile-контент и ползунки сохраняют контракт', async ({
        page
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'mobile-320', 'Один content stress');
        await preparePage(page, 'white');

        await openRoute(page, '/catalog/anime.html', 'white');
        const ranges = await page
            .locator('.filter-year-slider, .anime-fb-range')
            .evaluateAll((items) =>
                items
                    .filter((item) => {
                        const rect = item.getBoundingClientRect();
                        return getComputedStyle(item).display !== 'none' && rect.width > 0;
                    })
                    .map((item) => Math.round(item.getBoundingClientRect().height))
            );
        expect(ranges.length).toBeGreaterThan(0);
        expect(ranges.every((height) => height >= 44)).toBeTruthy();
    });

    test('reduced motion отключает декоративные анимации', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'mobile-360', 'Один reduced-motion smoke');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await preparePage(page, 'white');
        await openRoute(page, '/', 'white');

        const duration = await page.evaluate(() => {
            const probe = document.createElement('div');
            probe.className = 'home-social-panel';
            probe.style.animationName = 'pulse';
            document.body.appendChild(probe);
            return getComputedStyle(probe).animationDuration;
        });
        expect(parseFloat(duration || '0')).toBeLessThanOrEqual(0.01);
    });

    test('mobile shell остаётся доступным при медленной загрузке данных', async ({
        page
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'mobile-430', 'Один slow-network smoke');
        await preparePage(page, 'white');
        await page.route(/127\.0\.0\.1:4173\/.*\.json(?:\?|$)/, async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 250));
            await route.continue();
        });
        await openRoute(page, '/', 'white');

        await expect(page.locator('.top-navbar')).toBeVisible();
        await expect(page.locator('.sidebar')).toBeVisible();
        const layout = await readLayout(page);
        expect(layout.rootOverflow).toBeLessThanOrEqual(1);
        expect(layout.escapedFixed).toEqual([]);
    });
});

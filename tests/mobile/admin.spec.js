const { test, expect } = require('@playwright/test');
const { preparePage, openRoute, readLayout } = require('./helpers');

function isMobileProject(testInfo) {
    return /mobile|iphone|tablet|boundary/.test(testInfo.project.name);
}

async function readSmallAdminTargets(page) {
    return page.evaluate(() => {
        if (innerWidth > 900) return [];
        const result = [];
        document
            .querySelectorAll(
                [
                    '.admin-tab',
                    '.admin-btn',
                    '.mod-tab-btn',
                    '.users-view-btn',
                    '.users-card-btn',
                    '.anime4k-admin button',
                    '.minko-logs-user',
                    '.minko-edit-video-actions button',
                    '.admin-container input:not([type="checkbox"]):not([type="radio"])',
                    '.admin-container select',
                    '.admin-container textarea'
                ].join(',')
            )
            .forEach((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                if (
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    rect.width === 0 ||
                    rect.height === 0
                ) {
                    return;
                }
                if (rect.width < 43.5 || rect.height < 43.5) {
                    result.push({
                        text: (element.textContent || element.getAttribute('aria-label') || '')
                            .trim()
                            .slice(0, 40),
                        className: String(element.className || ''),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    });
                }
            });
        return result.slice(0, 30);
    });
}

for (const theme of ['white', 'dark']) {
    test.describe(`admin ${theme}`, () => {
        test('панель создателя не выходит за viewport во всех вкладках', async ({
            page
        }, testInfo) => {
            const errors = await preparePage(page, theme, { creator: true });
            await openRoute(page, '/admin.html', theme);
            await page.waitForTimeout(350);
            expect(page.url()).toContain('/admin.html');

            const tabs = page.locator('.admin-tab');
            const count = await tabs.count();
            expect(count).toBeGreaterThan(0);
            for (let index = 0; index < count; index += 1) {
                await tabs.nth(index).click();
                await page.waitForTimeout(30);
                const layout = await readLayout(page);
                expect(
                    layout.rootOverflow,
                    `admin tab ${index}: documentElement overflow`
                ).toBeLessThanOrEqual(1);
                expect(layout.bodyOverflow, `admin tab ${index}: body overflow`).toBeLessThanOrEqual(
                    1
                );
                expect(layout.escapedFixed, `admin tab ${index}: fixed escape`).toEqual([]);
            }

            if (isMobileProject(testInfo)) {
                await tabs.first().click();
                const small = await readSmallAdminTargets(page);
                expect(small, 'Admin touch targets должны быть минимум 44×44px').toEqual([]);
            }
            expect(errors.runtimeErrors, 'Admin JavaScript exceptions').toEqual([]);
            expect(errors.consoleErrors, 'Admin critical console errors').toEqual([]);
        });

        test('Minko Edit public и creator layouts помещаются в viewport', async ({
            page
        }, testInfo) => {
            const errors = await preparePage(page, theme, { creator: true });
            await openRoute(page, '/minko-edit.html', theme);

            for (const mode of ['public', 'creator']) {
                await page.evaluate((selectedMode) => {
                    const publicView = document.getElementById('minkoEditPublicView');
                    const creatorView = document.getElementById('minkoEditCreatorView');
                    if (publicView) publicView.hidden = selectedMode !== 'public';
                    if (creatorView) creatorView.hidden = selectedMode !== 'creator';
                }, mode);
                const layout = await readLayout(page);
                expect(layout.rootOverflow, `${mode}: root overflow`).toBeLessThanOrEqual(1);
                expect(layout.bodyOverflow, `${mode}: body overflow`).toBeLessThanOrEqual(1);
                expect(layout.escapedFixed, `${mode}: fixed escape`).toEqual([]);
            }

            if (isMobileProject(testInfo)) {
                const small = await readSmallAdminTargets(page);
                expect(small, 'Creator touch targets должны быть минимум 44×44px').toEqual([]);
            }
            expect(errors.runtimeErrors, 'Minko Edit JavaScript exceptions').toEqual([]);
            expect(errors.consoleErrors, 'Minko Edit critical console errors').toEqual([]);
        });
    });
}

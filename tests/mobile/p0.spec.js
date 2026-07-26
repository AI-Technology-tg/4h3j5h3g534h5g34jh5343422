const { test, expect } = require('@playwright/test');
const { preparePage, openRoute } = require('./helpers');

function skipDesktop(testInfo) {
    return !/mobile|iphone|tablet|boundary/.test(testInfo.project.name);
}

test.describe('P0 mobile screens', () => {
    test('messages chat has a visible back path through 900px', async ({ page }, testInfo) => {
        test.skip(skipDesktop(testInfo), 'Проверка mobile split-view');
        await preparePage(page, 'white');
        await openRoute(page, '/messages.html', 'white');

        const result = await page.evaluate(() => {
            const sidebar = document.getElementById('msgV2Sidebar');
            const main = document.getElementById('msgV2Main');
            const back = document.querySelector('.msg-v2-back');
            sidebar?.classList.add('is-hidden-mobile');
            main?.classList.add('is-open-mobile');
            const empty = document.getElementById('msgV2EmptyState');
            const active = document.getElementById('msgV2ActiveChat');
            if (empty) empty.style.display = 'none';
            active?.classList.add('is-visible');
            const backRect = back?.getBoundingClientRect();
            return {
                sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : '',
                mainDisplay: main ? getComputedStyle(main).display : '',
                backDisplay: back ? getComputedStyle(back).display : '',
                backWidth: Math.round(backRect?.width || 0),
                backHeight: Math.round(backRect?.height || 0)
            };
        });

        expect(result.sidebarDisplay).toBe('none');
        expect(result.mainDisplay).not.toBe('none');
        expect(result.backDisplay).not.toBe('none');
        expect(result.backWidth).toBeGreaterThanOrEqual(44);
        expect(result.backHeight).toBeGreaterThanOrEqual(44);
    });

    test('manga controls stay below header and expose 44px actions', async ({ page }, testInfo) => {
        test.skip(skipDesktop(testInfo), 'Проверка mobile reader');
        await preparePage(page, 'white');
        await openRoute(page, '/manga/reader.html?id=1', 'white');

        const geometry = await page.evaluate(() => {
            const header = document.querySelector('.top-navbar')?.getBoundingClientRect();
            const controls = document.querySelector('.manga-reader-controls')?.getBoundingClientRect();
            const buttons = Array.from(document.querySelectorAll('.reader-btn')).map((button) => {
                const rect = button.getBoundingClientRect();
                return { width: Math.round(rect.width), height: Math.round(rect.height) };
            });
            return {
                headerBottom: Math.round(header?.bottom || 0),
                controlsTop: Math.round(controls?.top || 0),
                buttons
            };
        });

        expect(geometry.controlsTop).toBeGreaterThanOrEqual(geometry.headerBottom - 2);
        expect(geometry.buttons.length).toBeGreaterThan(0);
        for (const button of geometry.buttons) {
            expect(button.width).toBeGreaterThanOrEqual(44);
            expect(button.height).toBeGreaterThanOrEqual(44);
        }
    });

    test('Watch Together workspace ends above bottom tabbar', async ({ page }, testInfo) => {
        test.skip(skipDesktop(testInfo), 'Проверка mobile Watch Together');
        await preparePage(page, 'white');
        await openRoute(page, '/watch-together.html', 'white');

        const geometry = await page.evaluate(() => {
            document.querySelectorAll('.wt-join-modal, .modal').forEach((modal) => {
                modal.style.display = 'none';
            });
            const workspace = document.querySelector('.main-content-wrapper.wt2-page');
            const tabbar = document.querySelector('.sidebar');
            const workspaceRect = workspace?.getBoundingClientRect();
            const tabbarRect = tabbar?.getBoundingClientRect();
            return {
                workspaceBottom: Math.round(workspaceRect?.bottom || 0),
                tabbarTop: Math.round(tabbarRect?.top || innerHeight),
                workspaceWidth: Math.round(workspaceRect?.width || 0)
            };
        });

        expect(geometry.workspaceWidth).toBeGreaterThan(0);
        expect(geometry.workspaceBottom).toBeLessThanOrEqual(geometry.tabbarTop + 2);
    });

    test('anime overlay players fit visual viewport', async ({ page }, testInfo) => {
        test.skip(skipDesktop(testInfo), 'Проверка mobile player overlay');
        await preparePage(page, 'white');
        await openRoute(page, '/anime/view.html?id=1', 'white');

        const geometry = await page.evaluate(() => {
            const overlay = document.createElement('div');
            overlay.className = 'reminko-player';
            overlay.innerHTML = `
                <div class="player-container">
                    <div class="player-header">
                        <div class="player-title"><h3>Тестовый тайтл</h3></div>
                        <button class="player-btn" type="button">×</button>
                    </div>
                    <div class="player-video-wrapper"><div class="player-video"></div></div>
                    <div class="player-bottom">
                        <div class="player-sources">
                            <button class="source-btn" type="button">Источник</button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            const overlayRect = overlay.getBoundingClientRect();
            const buttonRect = overlay.querySelector('.player-btn').getBoundingClientRect();
            return {
                viewportHeight: Math.round(
                    window.visualViewport?.height || window.innerHeight
                ),
                overlayHeight: Math.round(overlayRect.height),
                buttonWidth: Math.round(buttonRect.width),
                buttonHeight: Math.round(buttonRect.height)
            };
        });

        expect(geometry.overlayHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
        expect(geometry.buttonWidth).toBeGreaterThanOrEqual(44);
        expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44);
    });
});

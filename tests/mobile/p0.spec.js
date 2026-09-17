const { test, expect } = require('@playwright/test');
const { preparePage, openRoute } = require('./helpers');

function skipDesktop(testInfo) {
    return !/mobile|iphone|tablet|boundary/.test(testInfo.project.name);
}

test.describe('P0 mobile screens', () => {
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

const { defineConfig } = require('@playwright/test');
const fs = require('fs');

const localChrome =
    process.platform === 'win32' &&
    fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : undefined;

function mobileProject(name, width, height) {
    return {
        name,
        use: {
            viewport: { width, height },
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: width >= 390 ? 3 : 2
        }
    };
}

module.exports = defineConfig({
    testDir: './tests/mobile',
    timeout: 45_000,
    expect: { timeout: 8_000 },
    fullyParallel: true,
    workers: process.env.CI ? 2 : 4,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    outputDir: 'test-results/mobile',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        locale: 'ru-RU',
        timezoneId: 'Europe/Kyiv',
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        serviceWorkers: 'block',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'off',
        launchOptions: localChrome ? { executablePath: localChrome } : {}
    },
    projects: [
        mobileProject('mobile-320', 320, 658),
        mobileProject('mobile-360', 360, 800),
        mobileProject('iphone-se', 375, 667),
        mobileProject('iphone-pro', 393, 852),
        mobileProject('mobile-430', 430, 932),
        mobileProject('tablet-768', 768, 1024),
        mobileProject('boundary-900', 900, 800),
        { name: 'desktop-901', use: { viewport: { width: 901, height: 800 } } },
        { name: 'desktop-1280', use: { viewport: { width: 1280, height: 720 } } }
    ],
    webServer: {
        command: 'node node_modules/http-server/bin/http-server . -p 4173 -c-1 -s',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    }
});

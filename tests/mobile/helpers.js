const { expect } = require('@playwright/test');

const PROJECT_REF = 'ipsawgtsicxwkkkipchp';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyMDAwMDAwMDAwLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImVtYWlsIjoibW9iaWxlLXRlc3RAZXhhbXBsZS5pbnZhbGlkIn0.' +
    'test-signature';

const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'mobile-test@example.invalid',
    is_anonymous: false,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { username: 'Mobile Test' },
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
};

const profile = {
    id: USER_ID,
    username: 'Mobile Test',
    avatar: 'Fons/1 b.jpg',
    gender: 'male',
    profile_setup_done: true,
    is_banned: false,
    is_site_creator: false,
    last_online: '2026-01-01T00:00:00.000Z'
};

const session = {
    access_token: TOKEN,
    refresh_token: 'mobile-test-refresh-token',
    expires_in: 3600,
    expires_at: 2_000_000_000,
    token_type: 'bearer',
    user
};

async function preparePage(page, theme = 'white') {
    const runtimeErrors = [];
    const consoleErrors = [];

    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (
            /ERR_ABORTED|ERR_FAILED|favicon|net::|Failed to load resource/i.test(text) ||
            /Shikimori|Jikan|Kodik|analytics|metrika/i.test(text)
        ) {
            return;
        }
        consoleErrors.push(text);
    });

    await page.addInitScript(
        ({ authKey, authSession, currentUser, selectedTheme }) => {
            localStorage.setItem(authKey, JSON.stringify(authSession));
            localStorage.setItem('isAuth', 'true');
            localStorage.setItem('rem_transform_theme', selectedTheme);
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        },
        {
            authKey: `sb-${PROJECT_REF}-auth-token`,
            authSession: session,
            currentUser: profile,
            selectedTheme: theme
        }
    );

    await page.route('**/config.local.js', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/javascript; charset=utf-8',
            body:
                'window.APP_CONFIG=Object.assign(window.APP_CONFIG||{},' +
                '{siteOrigin:window.location.origin});'
        })
    );

    await page.route('**/.netlify/functions/shikimori-proxy**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());

    await page.route(`https://${PROJECT_REF}.supabase.co/**`, async (route) => {
        const request = route.request();
        const url = request.url();
        const method = request.method();
        const headers = {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'content-type': 'application/json'
        };

        if (method === 'OPTIONS') {
            await route.fulfill({ status: 204, headers, body: '' });
            return;
        }
        if (/\/auth\/v1\/user(?:\?|$)/.test(url)) {
            await route.fulfill({ status: 200, headers, body: JSON.stringify(user) });
            return;
        }
        if (/\/rest\/v1\/profiles(?:\?|$)/.test(url)) {
            const wantsObject = String(request.headers().accept || '').includes(
                'application/vnd.pgrst.object'
            );
            await route.fulfill({
                status: 200,
                headers: { ...headers, 'content-range': '0-0/1' },
                body: JSON.stringify(wantsObject ? profile : [profile])
            });
            return;
        }
        if (/\/rest\/v1\/rpc\/site_visit_online_count/.test(url)) {
            await route.fulfill({ status: 200, headers, body: '0' });
            return;
        }

        await route.fulfill({
            status: method === 'GET' ? 200 : 201,
            headers: { ...headers, 'content-range': '*/0' },
            body: method === 'GET' ? '[]' : '{}'
        });
    });

    return { runtimeErrors, consoleErrors };
}

async function openRoute(page, path, theme = 'white') {
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(response, `Нет HTTP-ответа для ${path}`).not.toBeNull();
    expect(response.status(), `${path} должен открываться`).toBeLessThan(400);

    await page
        .waitForFunction(
            () =>
                document.body &&
                (document.body.classList.contains('reminko-content-revealed') ||
                    !document.getElementById('loadingScreen')),
            null,
            { timeout: 5_000 }
        )
        .catch(() => {});

    await page.evaluate((selectedTheme) => {
        const dark = selectedTheme === 'dark';
        document.documentElement.dataset.remTheme = dark ? 'dark' : 'white';
        document.body?.classList.toggle('theme-dark', dark);
        document.body?.classList.toggle('theme-white', !dark);
        document.body?.classList.add('reminko-content-revealed', 'reminko-ui-ready');
        const loader = document.getElementById('loadingScreen');
        if (loader) {
            loader.classList.add('hidden');
            loader.style.display = 'none';
        }
    }, theme);

    await page.waitForTimeout(250);
}

async function readLayout(page) {
    return page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const viewportWidth = window.innerWidth;
        const visible = (el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                Number(style.opacity || 1) > 0 &&
                rect.width > 0 &&
                rect.height > 0
            );
        };

        const escapedFixed = [];
        document.querySelectorAll('*').forEach((el) => {
            if (!visible(el)) return;
            const style = getComputedStyle(el);
            if (!['fixed', 'sticky'].includes(style.position)) return;
            const rect = el.getBoundingClientRect();
            if (rect.right > viewportWidth + 2 || rect.left < -2) {
                escapedFixed.push({
                    selector:
                        el.id
                            ? `#${el.id}`
                            : `${el.tagName.toLowerCase()}.${String(el.className)
                                  .trim()
                                  .split(/\s+/)
                                  .slice(0, 2)
                                  .join('.')}`,
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    width: Math.round(rect.width)
                });
            }
        });

        return {
            viewportWidth,
            rootOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
            bodyOverflow: Math.max(0, body.scrollWidth - body.clientWidth),
            escapedFixed: escapedFixed.slice(0, 12)
        };
    });
}

async function readSmallPrimaryTargets(page) {
    return page.evaluate(() => {
        if (window.innerWidth > 900) return [];
        const selector = [
            '.sidebar-link',
            '.top-nav-actions button',
            '.top-nav-actions a',
            '.btn',
            '.reader-btn',
            '.player-btn',
            '.filter-chip',
            '.filter-option',
            '.msg-v2-back',
            'button[type="submit"]'
        ].join(',');
        const result = [];
        document.querySelectorAll(selector).forEach((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                rect.width === 0 ||
                rect.height === 0
            ) {
                return;
            }
            if (rect.width < 40 || rect.height < 40) {
                result.push({
                    text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
                    className: String(el.className || ''),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                });
            }
        });
        return result.slice(0, 20);
    });
}

module.exports = {
    preparePage,
    openRoute,
    readLayout,
    readSmallPrimaryTargets
};

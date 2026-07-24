// Универсальный скрипт для применения навигации ко всем страницам
// Добавляется в конец body перед закрывающим тегом

(function injectEmailConfirmScript() {
    if (typeof window === 'undefined' || window.__reminkoEmailConfirmInjected) return;
    window.__reminkoEmailConfirmInjected = true;
    try {
        var cur = document.currentScript;
        if (!cur || !cur.src) {
            var list = document.querySelectorAll('script[src*="apply-navigation"]');
            cur = list[list.length - 1];
        }
        if (!cur || !cur.src) return;
        var base = cur.src.replace(/[^/]+$/, '');
        var av =
            (typeof window.reminkoAssetVersion === 'function' && window.reminkoAssetVersion()) ||
            window.REMINKO_ASSET_VERSION ||
            (window.APP_CONFIG && window.APP_CONFIG.assetVersion) ||
            '1';
        var s = document.createElement('script');
        s.src = base + 'email-confirm.js?v=' + encodeURIComponent(av);
        s.async = false;
        (document.head || document.documentElement).appendChild(s);
    } catch (e) {
        console.warn('[Email confirm] inject:', e);
    }
})();

(function injectRemGiveawayScript() {
    if (typeof window === 'undefined' || window.__reminkoGiveawayInjected) return;
    window.__reminkoGiveawayInjected = true;
    try {
        var cur = document.currentScript;
        if (!cur || !cur.src) {
            var list = document.querySelectorAll('script[src*="apply-navigation"]');
            cur = list[list.length - 1];
        }
        if (!cur || !cur.src) return;
        var base = cur.src.replace(/[^/]+$/, '');
        var av =
            (typeof window.reminkoAssetVersion === 'function' && window.reminkoAssetVersion()) ||
            window.REMINKO_ASSET_VERSION ||
            (window.APP_CONFIG && window.APP_CONFIG.assetVersion) ||
            '1';
        var s = document.createElement('script');
        s.src = base + 'giveaway.js?v=' + encodeURIComponent(av);
        s.async = true;
        (document.head || document.documentElement).appendChild(s);
    } catch (e) {
        console.warn('[Giveaway] inject:', e);
    }
})();

(function injectRemThemeTransform() {
    if (typeof window === 'undefined' || window.__remThemeBootInject) return;
    window.__remThemeBootInject = true;
    try {
        var cur = document.currentScript;
        if (!cur || !cur.src) {
            var list = document.querySelectorAll('script[src*="apply-navigation"]');
            cur = list[list.length - 1];
        }
        if (!cur || !cur.src) return;
        var base = cur.src.replace(/[^/]+$/, '');
        var av =
            (typeof window.reminkoAssetVersion === 'function' && window.reminkoAssetVersion()) ||
            window.REMINKO_ASSET_VERSION ||
            (window.APP_CONFIG && window.APP_CONFIG.assetVersion) ||
            'rem-theme-4';
        var s = document.createElement('script');
        s.src = base + 'theme-transform-boot.js?v=' + encodeURIComponent(av);
        s.async = false;
        (document.head || document.documentElement).appendChild(s);
    } catch (e) {
        console.warn('[RemTheme] inject boot:', e);
    }
})();

(function injectLive2dWidgetEverywhere() {
    if (typeof window === 'undefined' || window.__reminkoLive2dInjected) return;
    // Live2D тяжёлый для скролла на телефонах — только desktop (>900px)
    var isMobile = false;
    try {
        if (typeof window.reminkoIsMobileLayout === 'function') {
            isMobile = !!window.reminkoIsMobileLayout();
        } else if (window.matchMedia) {
            isMobile = window.matchMedia('(max-width: 900px)').matches;
        }
    } catch (_) {
        isMobile = false;
    }
    if (isMobile) return;
    window.__reminkoLive2dInjected = true;
    try {
        var cur = document.currentScript;
        if (!cur || !cur.src) {
            var list = document.querySelectorAll('script[src*="apply-navigation"]');
            cur = list[list.length - 1];
        }
        if (!cur || !cur.src) return;
        var base = cur.src.replace(/[^/]+$/, '');
        var s = document.createElement('script');
        s.src = base + 'live2d-widget-init.js?v=live2d-desktop-only-1';
        s.async = true;
        (document.head || document.documentElement).appendChild(s);
    } catch (e) {
        console.warn('[Live2D] inject:', e);
    }
})();

(function injectSupportMinkoChatScript() {
    if (typeof window === 'undefined' || window.__reminkoSupportChatInjected) return;
    window.__reminkoSupportChatInjected = true;
    var base = '';
    try {
        var cur = document.currentScript;
        if (!cur || !cur.src) {
            var list = document.querySelectorAll('script[src*="apply-navigation"]');
            cur = list[list.length - 1];
        }
        if (cur && cur.src) base = cur.src.replace(/[^/]+$/, '');
    } catch (_) {
        base = '';
    }
    if (!base) return;
    function doInject() {
        try {
            var s = document.createElement('script');
            s.src = base + 'support-minko-chat.js?v=20260723a';
            s.async = true;
            (document.body || document.documentElement).appendChild(s);
        } catch (e) {
            console.warn('[Support Minko] inject:', e);
        }
    }
    // После первого paint / idle — меньше удар по скроллу на мобилке
    function schedule() {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(function () { doInject(); }, { timeout: 2500 });
        } else {
            setTimeout(doInject, 1200);
        }
    }
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
})();

(function() {
    'use strict';
    
    // Проверяем, нужно ли применять навигацию
    const path = window.location.pathname;
    const skipPages = ['reset-password.html', 'payment-success.html', 'cancel-success.html'];
    const shouldSkip = skipPages.some(page => path.includes(page));
    
    if (shouldSkip) {
        const fireSkip = () => {
            document.body.classList.add('reminko-ui-ready');
            try {
                window.dispatchEvent(new CustomEvent('reminko:navigation-applied'));
            } catch (e) {
                /* ignore */
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fireSkip, { once: true });
        } else {
            fireSkip();
        }
        return;
    }
    
    let __reminkoNavInitPromise = null;

    async function initNavigation() {
        if (__reminkoNavInitPromise) return __reminkoNavInitPromise;

        __reminkoNavInitPromise = (async () => {
            while (!window.navigationManager) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            try {
                if (typeof window.reminkoEnsureMaintenanceGate === 'function') {
                    await window.reminkoEnsureMaintenanceGate();
                }
            } catch (e) {
                console.warn('[Maintenance gate]', e);
            }
            if (window.__reminkoMaintenancePageReplaced) {
                try {
                    window.dispatchEvent(new CustomEvent('reminko:navigation-applied'));
                } catch (err) {
                    /* ignore */
                }
                return;
            }
            window.navigationManager.applyNavigation();
        })();

        return __reminkoNavInitPromise;
    }

    function scheduleNavigationInit() {
        const run = () => {
            void initNavigation();
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
            run();
        }
    }

    scheduleNavigationInit();
})();

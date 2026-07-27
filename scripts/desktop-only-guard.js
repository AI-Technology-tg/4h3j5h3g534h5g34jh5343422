/**
 * ????????? ??????? ???????? ??? ???? ????????? ? ????? ??????? (?900px).
 * REMINKO_ASSET_VERSION ? ??????? ??? ?????? ?????? (??. APP_CONFIG.assetVersion).
 */
(function reminkoAssetVersionGate() {
    if (typeof window === 'undefined' || window.__reminkoAssetVersionGate) return;
    window.__reminkoAssetVersionGate = true;

    var V = '20260727security2';
    window.REMINKO_ASSET_VERSION = V;
    var KEY = 'reminko_asset_v';

    try {
        var prev = localStorage.getItem(KEY);
        if (prev && prev !== V) {
            localStorage.setItem(KEY, V);
            try {
                sessionStorage.removeItem('reminko_online_display_v2');
                sessionStorage.removeItem('reminko_online_bias_v2');
                localStorage.removeItem('reminko_poster_mal_v3');
            } catch (_) {
                /* ignore */
            }
            var u = new URL(window.location.href);
            if (u.searchParams.get('_av') !== V) {
                u.searchParams.set('_av', V);
                window.location.replace(u.toString());
                return;
            }
        }
        if (!prev) localStorage.setItem(KEY, V);
    } catch (_) {
        /* ignore */
    }
})();

(function reminkoSecurityMonitorBoot(w, d) {
    if (!w || w.__reminkoSecurityMonitorBoot) return;
    w.__reminkoSecurityMonitorBoot = true;
    var path = w.location.pathname || '';
    var root = /\/(catalog|manga|anime)\//i.test(path) ? '../' : '';
    var script = d.createElement('script');
    script.src = root + 'scripts/security-monitor.js?v=20260727security2';
    script.defer = true;
    (d.head || d.documentElement).appendChild(script);
})(window, document);

/** ?????? AniList ? ???????? (???? ?? ?????? ?????????????? ????????). */
(function reminkoBlockAniListFetch() {
    if (typeof window === 'undefined' || window.__reminkoAniListFetchBlocked) return;
    window.__reminkoAniListFetchBlocked = true;
    var nativeFetch = window.fetch;
    if (typeof nativeFetch !== 'function') return;
    window.fetch = function reminkoFetchGuard(input, init) {
        try {
            var url =
                typeof input === 'string'
                    ? input
                    : input && typeof input.url === 'string'
                      ? input.url
                      : '';
            if (/graphql\.anilist\.co/i.test(url)) {
                return Promise.resolve(
                    new Response('{}', {
                        status: 204,
                        statusText: 'No Content',
                        headers: { 'Content-Type': 'application/json' },
                    })
                );
            }
        } catch (_) {
            /* ignore */
        }
        return nativeFetch.apply(this, arguments);
    };
})();
(function reminkoLateThirdPartyScheduler(w, d) {
    if (w.__reminkoScheduleLateThirdParty) return;
    w.__reminkoScheduleLateThirdParty = function (fn, delayMs) {
        if (typeof fn !== 'function') return;
        var delay = Math.max(0, Number(delayMs) || 0);
        var queue = function () {
            if (w.ReminkoBoot && typeof w.ReminkoBoot.lateIdle === 'function') {
                w.ReminkoBoot.lateIdle(fn, delay);
                return;
            }
            w.setTimeout(function () {
                if ('requestIdleCallback' in w) w.requestIdleCallback(fn, { timeout: 2500 });
                else fn();
            }, delay);
        };
        if (d.readyState === 'loading') {
            d.addEventListener('DOMContentLoaded', queue, { once: true });
        } else {
            queue();
        }
    };
})(window, document);

(function reminkoGtmBoot(w, d, s, l, i) {
    if (w.__reminkoGtmBoot) return;
    w.__reminkoGtmBoot = true;

    w[l] = w[l] || [];
    w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

    function inject() {
        var tagSrc = 'https://www.googletagmanager.com/gtm.js?id=' + i;
        var scripts = d.getElementsByTagName(s);
        for (var j = 0; j < scripts.length; j++) {
            if (scripts[j].src === tagSrc) return;
        }

        var f = scripts[0];
        var gtm = d.createElement(s);
        var dl = l !== 'dataLayer' ? '&l=' + l : '';
        gtm.async = true;
        gtm.src = tagSrc + dl;
        if (f && f.parentNode) f.parentNode.insertBefore(gtm, f);
        else (d.head || d.documentElement).appendChild(gtm);

        if (d.getElementById('reminko-gtm-noscript')) return;
        var ns = d.createElement('noscript');
        ns.id = 'reminko-gtm-noscript';
        ns.innerHTML =
            '<iframe src="https://www.googletagmanager.com/ns.html?id=' +
            i +
            '" height="0" width="0" style="display:none;visibility:hidden"></iframe>';
        if (d.body) d.body.insertBefore(ns, d.body.firstChild);
        else d.addEventListener('DOMContentLoaded', function () {
            if (!d.getElementById('reminko-gtm-noscript') && d.body) {
                d.body.insertBefore(ns, d.body.firstChild);
            }
        }, { once: true });
    }

    // Аналитика сохраняется, но не конкурирует с первыми секундами страницы.
    w.__reminkoScheduleLateThirdParty(inject, 5500);
})(window, document, 'script', 'dataLayer', 'GTM-W4RSMVH3');

(function reminkoGtagBoot(w, d, s, measureId) {
    if (w.__reminkoGtagBoot) return;
    w.__reminkoGtagBoot = true;

    w.dataLayer = w.dataLayer || [];
    w.gtag =
        w.gtag ||
        function gtag() {
            w.dataLayer.push(arguments);
        };
    w.gtag('js', new Date());
    w.gtag('config', measureId);

    function inject() {
        var src = 'https://www.googletagmanager.com/gtag/js?id=' + measureId;
        var scripts = d.getElementsByTagName(s);
        for (var j = 0; j < scripts.length; j++) {
            if (scripts[j].src === src) return;
        }

        var tag = d.createElement(s);
        tag.async = true;
        tag.src = src;
        var first = scripts[0];
        if (first && first.parentNode) first.parentNode.insertBefore(tag, first);
        else (d.head || d.documentElement).appendChild(tag);
    }

    w.__reminkoScheduleLateThirdParty(inject, 6000);
})(window, document, 'script', 'G-S9CBJW9NLK');

(function remThemeEarlyBoot() {
    if (typeof window === 'undefined' || window.__remThemeEarlyBoot) return;
    window.__remThemeEarlyBoot = true;

    var STORAGE = 'rem_transform_theme';

    function assetRoot() {
        var p = window.location.pathname || '';
        return /\/(catalog|manga|anime)\//i.test(p) ? '../' : '';
    }

    try {
        var theme = localStorage.getItem(STORAGE) === 'dark' ? 'dark' : 'white';
        var root = assetRoot();
        var docEl = document.documentElement;
        docEl.setAttribute('data-rem-theme', theme);

        if (theme === 'dark') {
            if (!document.getElementById('rem-theme-dark-css')) {
                var css = document.createElement('link');
                css.id = 'rem-theme-dark-css';
                css.rel = 'stylesheet';
                css.href = root + 'styles/theme-dark.css?v=20260726mobile3';
                document.head.appendChild(css);
            }
            if (!document.getElementById('rem-dark-bg-preload')) {
                var preload = document.createElement('link');
                preload.id = 'rem-dark-bg-preload';
                preload.rel = 'preload';
                preload.as = 'image';
                preload.href = root + 'Fons/rem-dark-bg.png';
                document.head.appendChild(preload);
            }
        }

        function applyBodyThemeClass() {
            if (!document.body) return;
            document.body.classList.remove('theme-white', 'theme-dark');
            document.body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-white');
        }

        if (document.body) applyBodyThemeClass();
        else document.addEventListener('DOMContentLoaded', applyBodyThemeClass, { once: true });
    } catch (_) {
        /* ignore */
    }
})();

(function () {
    if (typeof window === 'undefined' || window.__reminkoDesktopGuardRan) return;
    window.__reminkoDesktopGuardRan = true;

    var PHONE_MAX_LONG_SIDE = 1000;
    var PHONE_MAX_SHORT_SIDE = 540;
    var MOBILE_PREVIEW_CLASS = 'reminko-mobile-preview';
    var MOBILE_LAYOUT_MQ = '(max-width: 900px)';

    function isLikelySearchOrPreviewBot(userAgent) {
        var ua = userAgent || '';
        return /Googlebot|Google-InspectionTool|AdsBot-Google|Mediapartners-Google|bingbot|YandexBot|YandexImages|Slurp|DuckDuckBot|facebookexternalhit|Facebot|TelegramBot|vkShare|Twitterbot|LinkedInBot|Applebot|ia_archiver/i.test(
            ua
        );
    }

    function isLikelyDesktopOs(userAgent) {
        var ua = userAgent || '';
        if (/iPhone|iPod|iPad|Android.*Mobile|Mobile Safari|IEMobile|Opera Mini/i.test(ua)) {
            return false;
        }
        if (/Windows NT|Win64|WOW64|Win32/i.test(ua)) return true;
        if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return true;
        if (/CrOS/i.test(ua)) return true;
        if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return true;
        return false;
    }

    function hasMobileClientHintsSync() {
        try {
            if (navigator.userAgentData && navigator.userAgentData.mobile === true) return true;
        } catch (_) {
            /* ignore */
        }
        return false;
    }

    /** Android / iOS ? Client Hints ? ???? ??? ??????? ??? ??? ? Chrome. */
    function hasMobilePlatformHintSync() {
        try {
            var platform = navigator.userAgentData && navigator.userAgentData.platform;
            if (platform && /Android|iOS/i.test(String(platform))) return true;
        } catch (_) {
            /* ignore */
        }
        return false;
    }

    function hasFinePointerAndHover() {
        try {
            if (!window.matchMedia) return false;
            return (
                window.matchMedia('(pointer: fine)').matches &&
                window.matchMedia('(hover: hover)').matches
            );
        } catch (_) {
            return false;
        }
    }

    /**
     * ????????? ??/???????: ?????????? UA + ??? mobile-hints + ??????? ????? ??? ????.
     * ?? ?????? ? ????????? ? ?????? ??????? ??? ??? (??? UA ??????????, ?? hints/????? ? ???).
     */
    function isLikelyRealDesktop(userAgent) {
        var ua = userAgent || '';
        if (!isLikelyDesktopOs(ua)) return false;
        if (hasMobileClientHintsSync()) return false;
        if (hasMobilePlatformHintSync()) return false;
        if (hasMobileApplePlatform()) return false;

        var sides = getScreenSides();
        if (sides.max > PHONE_MAX_LONG_SIDE && sides.min > PHONE_MAX_SHORT_SIDE) return true;
        if (hasFinePointerAndHover() && sides.max > PHONE_MAX_LONG_SIDE) return true;
        return false;
    }

    function hasMobileUserAgent(userAgent) {
        var ua = userAgent || '';
        if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini|Mobile Safari|Silk|Kindle|KFAPWI/i.test(ua)) {
            return true;
        }
        if (/iPad/i.test(ua)) return true;
        if (/Android/i.test(ua)) return true;
        return false;
    }

    function hasMobileApplePlatform() {
        try {
            var p = navigator.platform || '';
            if (/iPhone|iPad|iPod/i.test(p)) return true;
        } catch (_) {
            /* ignore */
        }
        return false;
    }

    function getScreenSides() {
        var sw = (window.screen && window.screen.width) || 0;
        var sh = (window.screen && window.screen.height) || 0;
        return {
            max: Math.max(sw, sh),
            min: Math.min(sw, sh)
        };
    }

    /** ?????????? ????? ???????? + ??? ? ??????????? ???? ??? ?????????? UA. */
    function hasPhoneLikeHardware() {
        var sides = getScreenSides();
        if (sides.max <= 0 || sides.min <= 0) return false;
        if (sides.max > PHONE_MAX_LONG_SIDE || sides.min > PHONE_MAX_SHORT_SIDE) return false;

        var touch = 0;
        try {
            touch = navigator.maxTouchPoints || 0;
        } catch (_) {
            /* ignore */
        }

        var coarse = false;
        var noHover = false;
        try {
            if (window.matchMedia) {
                coarse = window.matchMedia('(pointer: coarse)').matches;
                noHover = window.matchMedia('(hover: none)').matches;
            }
        } catch (_) {
            /* ignore */
        }

        if (coarse && noHover && touch >= 1) return true;
        // ??????? ??? ??? ? Chrome: UA ??????????, ?? ????? ???????? ? ??? ????????
        if (touch >= 1 && sides.max <= PHONE_MAX_LONG_SIDE) return true;

        return false;
    }

    function isReminkoNativeApp(userAgent) {
        var ua = userAgent || navigator.userAgent || '';
        if (/ReMinkoMobile\//i.test(ua)) return true;
        if (/ReMinkoTV\//i.test(ua)) return true;
        try {
            if (window.__reminkoNativeApp === true) return true;
            if (window.__reminkoTvApp === true) return true;
            if (document.documentElement && document.documentElement.getAttribute('data-reminko-app') === '1') {
                return true;
            }
            if (document.documentElement && document.documentElement.getAttribute('data-reminko-tv') === '1') {
                return true;
            }
            var q = window.location && window.location.search ? window.location.search : '';
            if (/[?&]app=native(?:&|$)/i.test(q)) return true;
            if (/[?&]app=tv(?:&|$)/i.test(q)) return true;
        } catch (_) {
            /* ignore */
        }
        return false;
    }

    function shouldBlockMobileBrowsing(userAgent) {
        if (isReminkoNativeApp(userAgent)) return false;
        var ua = userAgent || navigator.userAgent || '';
        if (!ua) return false;
        if (isLikelySearchOrPreviewBot(ua)) return false;
        if (isLikelyRealDesktop(ua)) return false;
        if (hasMobileClientHintsSync()) return true;
        if (hasMobilePlatformHintSync()) return true;
        if (hasMobileUserAgent(ua)) return true;
        if (hasMobileApplePlatform()) return true;
        if (hasPhoneLikeHardware()) return true;
        return false;
    }

    function isNarrowViewport() {
        try {
            return window.matchMedia && window.matchMedia(MOBILE_LAYOUT_MQ).matches;
        } catch (_) {
            return false;
        }
    }

    function markMobilePreviewAllowed() {
        try {
            var root = document.documentElement;
            if (root) {
                root.classList.add(MOBILE_PREVIEW_CLASS);
                root.setAttribute('data-reminko-mobile-preview', '1');
            }
            if (document.body) document.body.classList.add(MOBILE_PREVIEW_CLASS);
            window.__reminkoMobilePreviewAllowed = true;
            var wall = document.getElementById('reminko-desktop-only-wall');
            if (wall) wall.remove();
            if (document.body) document.body.style.overflow = '';
            if (root) root.style.overflow = '';
        } catch (_) {
            /* ignore */
        }
    }

    function syncMobileLayout() {
        if (shouldBlockMobileBrowsing() || isNarrowViewport()) {
            markMobilePreviewAllowed();
        }
    }

    function boot() {
        syncMobileLayout();
        try {
            var mq = window.matchMedia(MOBILE_LAYOUT_MQ);
            if (mq) {
                if (typeof mq.addEventListener === 'function') {
                    mq.addEventListener('change', syncMobileLayout);
                } else if (typeof mq.addListener === 'function') {
                    mq.addListener(syncMobileLayout);
                }
            }
        } catch (_) {
            /* ignore */
        }
        window.addEventListener('orientationchange', syncMobileLayout, { passive: true });
    }

    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot);
})();

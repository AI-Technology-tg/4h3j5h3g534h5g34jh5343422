(function () {
    'use strict';

    if (typeof window === 'undefined' || window.__remThemeBoot) return;
    window.__remThemeBoot = true;

    var STORAGE = 'rem_transform_theme';
    var SKIP = 'rem_transform_skip_loading';

    function scriptRoot() {
        var cur = document.currentScript;
        if (!cur || !cur.src) {
            var list = document.querySelectorAll('script[src*="theme-transform-boot"]');
            cur = list[list.length - 1];
        }
        if (!cur || !cur.src) return '';
        return cur.src.replace(/scripts\/theme-transform-boot\.js.*$/i, '');
    }

    function siteRootFromPage() {
        var p = window.location.pathname || '';
        if (/\/(catalog|manga|anime)\//i.test(p)) return '../';
        return '';
    }

    function injectOnce(id, tag, attrs) {
        if (document.getElementById(id)) return;
        var el = document.createElement(tag);
        el.id = id;
        Object.keys(attrs).forEach(function (k) {
            el.setAttribute(k, attrs[k]);
        });
        (document.head || document.documentElement).appendChild(el);
    }

    function applyThemeClass() {
        var theme = 'white';
        try {
            theme = localStorage.getItem(STORAGE) === 'dark' ? 'dark' : 'white';
        } catch (e) {
            /* ignore */
        }
        var body = document.body;
        if (!body) {
            document.addEventListener('DOMContentLoaded', applyThemeClass, { once: true });
            return;
        }
        body.classList.remove('theme-white', 'theme-dark');
        body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-white');
        document.documentElement.setAttribute('data-rem-theme', theme);
    }

    function boot() {
        var root = scriptRoot() || siteRootFromPage();
        injectOnce('rem-theme-dark-css', 'link', {
            rel: 'stylesheet',
            href: root + 'styles/theme-dark.css?v=20260724a'
        });
        injectOnce('rem-transform-overlay-css', 'link', {
            rel: 'stylesheet',
            href: root + 'styles/transform-overlay.css?v=rem-theme-4'
        });

        applyThemeClass();

        if (!window.__remThemeEasterEggLoaded) {
            window.__remThemeEasterEggLoaded = true;
            var s = document.createElement('script');
            s.src = root + 'scripts/theme-easter-egg.js?v=rem-theme-5';
            s.defer = true;
            (document.body || document.head).appendChild(s);
        }
    }

    try {
        if (sessionStorage.getItem(SKIP) === '1') {
            sessionStorage.removeItem(SKIP);
            window.__reminkoSkipTransformLoading = true;
        }
    } catch (e2) {
        /* ignore */
    }

    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();

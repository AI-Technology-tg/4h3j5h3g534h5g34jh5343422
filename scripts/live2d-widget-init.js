/**
 * Live2D после полной загрузки и скрытия экрана загрузки. Только модель Рэм.
 * @see https://www.npmjs.com/package/live2d-widget
 */
(function () {
    if (window.__reminkoLive2dWidgetStarted) return;

    var REM = {
        jsonPath: 'https://unpkg.com/live2d-widget-model-rem@1.0.1/assets/rem.model.json',
        scale: 1.22,
        display: { width: 232, height: 464, vOffset: -115 },
        opacity: 0.62
    };

    var REM_MOBILE = {
        scale: 1.05,
        display: { width: 180, height: 360, vOffset: -54 },
        opacity: 0.28
    };

    function isMobileLayout() {
        try {
            return !!(
                (typeof window.reminkoIsMobileLayout === 'function' &&
                    window.reminkoIsMobileLayout()) ||
                window.matchMedia('(max-width: 900px)').matches ||
                window.__reminkoMobilePreviewAllowed ||
                document.documentElement.classList.contains('reminko-mobile-preview')
            );
        } catch (_) {
            return false;
        }
    }

    function injectLive2dCss() {
        if (document.getElementById('reminko-live2d-css')) return;
        var cur = document.currentScript;
        if (!cur || !cur.src) {
            var list = document.querySelectorAll('script[src*="live2d-widget-init"]');
            cur = list[list.length - 1];
        }
        if (!cur || !cur.src) return;
        var href;
        try {
            href = new URL('../styles/live2d-widget.css?v=20260726mobile1', cur.src).href;
        } catch (e) {
            return;
        }
        var link = document.createElement('link');
        link.id = 'reminko-live2d-css';
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    function startLive2d() {
        if (window.__reminkoLive2dWidgetStarted) return;
        window.__reminkoLive2dWidgetStarted = true;
        injectLive2dCss();
        var sc = document.createElement('script');
        sc.src =
            'https://cdn.jsdelivr.net/npm/live2d-widget@3.1.4/lib/L2Dwidget.min.js';
        sc.charset = 'utf-8';
        sc.onload = function () {
            var remConfig = isMobileLayout() ? REM_MOBILE : REM;
            var targetOpacity = remConfig.opacity != null ? remConfig.opacity : 0.75;
            var display = {
                position: 'right',
                width: remConfig.display.width,
                height: remConfig.display.height,
                hOffset: 0,
                vOffset: remConfig.display.vOffset != null ? remConfig.display.vOffset : -20
            };

            L2Dwidget.on('create-container', function (el) {
                if (!el || !el.style) return;
                el.style.setProperty('background', 'transparent', 'important');
                el.style.setProperty('border', '0', 'important');
                el.style.setProperty('box-shadow', 'none', 'important');
                el.style.setProperty('outline', '0', 'important');
                el.style.setProperty('transition', 'opacity 0.55s ease', 'important');
                el.style.setProperty('opacity', '0', 'important');
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        el.style.setProperty('opacity', String(targetOpacity), 'important');
                    });
                });
            });
            L2Dwidget.init({
                model: {
                    jsonPath: REM.jsonPath,
                    scale: remConfig.scale
                },
                display: display,
                mobile: {
                    show: true,
                    scale: isMobileLayout() ? 0.82 : 0.5,
                    motion: true
                },
                react: {
                    opacity: targetOpacity
                }
            });
        };
        document.head.appendChild(sc);
    }

    function hideLive2dImmediately() {
        var el = document.getElementById('live2d-widget');
        if (!el || !el.style) return;
        el.style.setProperty('transition', 'none', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('background', 'transparent', 'important');
    }

    function showLive2dIfReady() {
        if (!window.__reminkoLive2dWidgetStarted) return;
        if (!loadingOverlayGone()) return;
        var el = document.getElementById('live2d-widget');
        if (!el || !el.style) return;
        var remConfig = isMobileLayout() ? REM_MOBILE : REM;
        var targetOpacity = remConfig.opacity != null ? remConfig.opacity : 0.75;
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('opacity', String(targetOpacity), 'important');
        el.style.setProperty('transition', 'opacity 0.55s ease', 'important');
    }

    function targetNavigationLink(target) {
        var node = target;
        while (node && node !== document.documentElement) {
            if (node.tagName && String(node.tagName).toLowerCase() === 'a') return node;
            node = node.parentNode;
        }
        return null;
    }

    function shouldHideForNavigationLink(link) {
        if (!link) return false;
        var href = link.getAttribute('href') || '';
        if (!href || href.charAt(0) === '#') return false;
        if (link.target && link.target !== '_self') return false;
        if (link.hasAttribute('download')) return false;
        return true;
    }

    function bindEarlyHideTriggers() {
        document.addEventListener(
            'click',
            function (e) {
                if (shouldHideForNavigationLink(targetNavigationLink(e.target))) hideLive2dImmediately();
            },
            true
        );
        document.addEventListener(
            'submit',
            function () {
                hideLive2dImmediately();
            },
            true
        );
        window.addEventListener(
            'keydown',
            function (e) {
                var key = String(e.key || '').toLowerCase();
                if (key === 'f5' || ((e.ctrlKey || e.metaKey) && key === 'r')) hideLive2dImmediately();
            },
            true
        );
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') return;
            showLive2dIfReady();
        });
        window.addEventListener('reminko:loading-screen-shown', hideLive2dImmediately);
    }

    function watchLoadingOverlayReturn() {
        var el = document.getElementById('loadingScreen');
        if (!el || typeof MutationObserver === 'undefined') return;
        var lastGone = loadingOverlayGone();
        var obs = new MutationObserver(function () {
            var gone = loadingOverlayGone();
            if (lastGone && !gone) hideLive2dImmediately();
            lastGone = gone;
        });
        obs.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    function loadingOverlayGone() {
        var el = document.getElementById('loadingScreen');
        if (!el) return true;
        if (el.style.display === 'none') return true;
        if (el.classList.contains('hidden')) return true;
        try {
            var st = window.getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    function afterWindowLoad(cb) {
        if (document.readyState === 'complete') cb();
        else window.addEventListener('load', cb, { once: true });
    }

    function startLive2dWhenIdle() {
        function run() {
            startLive2d();
        }
        // Функциональность та же; декоративный WebGL-виджет не конкурирует
        // с первыми секундами взаимодействия и метриками загрузки.
        if (
            typeof window.ReminkoBoot !== 'undefined' &&
            typeof window.ReminkoBoot.lateIdle === 'function'
        ) {
            window.ReminkoBoot.lateIdle(run, 5000);
            return;
        }
        if (typeof requestIdleCallback === 'function') {
            setTimeout(function () {
                requestIdleCallback(run, { timeout: 2500 });
            }, 5000);
        } else {
            setTimeout(run, 5000);
        }
    }

    function schedule() {
        afterWindowLoad(function () {
            var reduceDecor =
                typeof window.reminkoShouldReduceHeavyDecor === 'function'
                    ? window.reminkoShouldReduceHeavyDecor()
                    : !!(
                          navigator.connection &&
                          navigator.connection.saveData
                      ) ||
                      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (reduceDecor) {
                window.__reminkoLive2dSkippedForCapability = true;
                return;
            }
            var el = document.getElementById('loadingScreen');
            if (!el) {
                startLive2dWhenIdle();
                return;
            }
            var done = false;
            var poll = null;
            function go() {
                if (done || window.__reminkoLive2dWidgetStarted) return;
                if (!loadingOverlayGone()) return;
                done = true;
                if (poll) clearInterval(poll);
                window.removeEventListener('reminko:loading-screen-hidden', go);
                startLive2dWhenIdle();
            }
            window.addEventListener('reminko:loading-screen-hidden', go);
            poll = setInterval(go, 80);
            setTimeout(function () {
                if (poll) clearInterval(poll);
                go();
            }, 16000);
        });
    }

    window.addEventListener('pagehide', hideLive2dImmediately);
    window.addEventListener('beforeunload', hideLive2dImmediately);
    bindEarlyHideTriggers();
    afterWindowLoad(watchLoadingOverlayReturn);

    schedule();
})();

// Управление экраном загрузки

(function () {
    if (sessionStorage.getItem('rem_transform_skip_loading') === '1') {
        sessionStorage.removeItem('rem_transform_skip_loading');
        window.__reminkoSkipTransformLoading = true;
    }
})();

(function reminkoMaybeSkipLoaderOnRevisit() {
    try {
        var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        if (nav && (nav.type === 'reload' || nav.type === 'back_forward')) {
            window.__reminkoSkipInitialLoading = true;
        }
        // Профиль должен открываться сразу — без полноэкранного «Загрузка…»
        var path = (window.location && window.location.pathname) || '';
        if (/profile\.html$/i.test(path)) {
            window.__reminkoSkipInitialLoading = true;
        }
    } catch (_) {
        /* ignore */
    }
})();

function getLoadingVideoSrc() {
    const path = window.location.pathname || '';
    if (path.includes('/catalog/') || path.includes('/anime/') || path.includes('/manga/')) {
        return '../Fons/loading.mp4';
    }
    return 'Fons/loading.mp4';
}

/** В контейнере может быть только пустой div — тогда видео никогда не создавалось */
function ensureLoadingVideo(loadingScreen) {
    const spinnerElement = loadingScreen.querySelector('.loading-spinner');
    const textElement = loadingScreen.querySelector('.loading-text');

    const showFallback = () => {
        const vc = loadingScreen.querySelector('.loading-video-container');
        if (vc) vc.style.display = 'none';
        if (spinnerElement) spinnerElement.style.display = 'block';
        if (textElement) textElement.style.display = 'block';
    };

    let videoContainer = loadingScreen.querySelector('.loading-video-container');
    if (!videoContainer) {
        videoContainer = document.createElement('div');
        videoContainer.className = 'loading-video-container';
        loadingScreen.insertBefore(videoContainer, loadingScreen.firstChild);
    }

    let video = videoContainer.querySelector('video.loading-video');
    const videoPath = getLoadingVideoSrc();

    if (!video) {
        video = document.createElement('video');
        video.className = 'loading-video';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        video.preload = 'auto';
        video.src = videoPath;
        video.onerror = showFallback;
        videoContainer.appendChild(video);
        video.play().catch(() => {});
        return;
    }

    video.muted = true;
    video.onerror = video.onerror || showFallback;
    const hasSourceChild = video.querySelector('source[src]');
    if (!hasSourceChild && (!video.getAttribute('src') || !video.currentSrc)) {
        video.src = videoPath;
    }
    videoContainer.style.display = '';
    try {
        video.currentTime = 0;
    } catch (_) {}
    video.play().catch(() => {});
}

function dispatchReminkoLoadingHidden() {
    try {
        window.dispatchEvent(new CustomEvent('reminko:loading-screen-hidden'));
    } catch (e) {}
}
window.dispatchReminkoLoadingHidden = dispatchReminkoLoadingHidden;

// Показать экран загрузки
function showLoading(message = null) {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        const spinnerElement = loadingScreen.querySelector('.loading-spinner');
        const textElement = loadingScreen.querySelector('.loading-text');
        const characterElement = loadingScreen.querySelector('.loading-character');
        const animeElement = loadingScreen.querySelector('.loading-anime');

        // Сразу экран загрузки с видео: спиннер только если видео недоступно
        if (characterElement) characterElement.style.display = 'none';
        if (animeElement) animeElement.style.display = 'none';
        if (spinnerElement) spinnerElement.style.display = 'none';
        if (textElement) textElement.style.display = 'none';

        ensureLoadingVideo(loadingScreen);

        loadingScreen.classList.remove('hidden');
        loadingScreen.style.display = '';
    }
    document.body.classList.remove('reminko-content-revealed');
}

// Скрыть экран загрузки
function hideLoading() {
    if (document.body.classList.contains('reminko-loading-dismissed')) {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            loadingScreen.style.display = 'none';
        }
        dispatchReminkoLoadingHidden();
        if (!document.body.classList.contains('reminko-ui-ready')) {
            document.body.classList.add('reminko-ui-ready');
        }
        document.body.classList.add('reminko-content-revealed');
        return;
    }
    document.body.classList.add('reminko-loading-dismissed');
    const loadingScreen = document.getElementById('loadingScreen');
    const revealUi = () => {
        if (!document.body.classList.contains('reminko-ui-ready')) {
            document.body.classList.add('reminko-ui-ready');
        }
        document.body.classList.add('reminko-content-revealed');
        dispatchReminkoLoadingHidden();
    };
    if (loadingScreen) {
        /** Раньше оверлей уходил в opacity:0 раньше, чем включался контент — под полупрозрачным слоём была «пустота» и видна только боковая колонка. Сначала показываем лейаут под непрозрачным оверлеем, затем убираем видео. */
        revealUi();
        const contentFadeMs = 80;
        const overlayFadeMs = 180;
        const finalizeOverlay = () => {
            loadingScreen.classList.add('hidden');
            const removeNode = () => {
                if (loadingScreen.parentNode) {
                    loadingScreen.style.display = 'none';
                }
            };
            const kill = setTimeout(removeNode, overlayFadeMs + 100);
            loadingScreen.addEventListener(
                'transitionend',
                (ev) => {
                    if (ev.target === loadingScreen && ev.propertyName === 'opacity') {
                        clearTimeout(kill);
                        removeNode();
                    }
                },
                { once: true }
            );
        };
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(finalizeOverlay, contentFadeMs);
            });
        });
    } else {
        revealUi();
    }
}

let __reminkoLoadingSettled = false;
let __reminkoNavigationApplied = false;
let __reminkoLoadingBooted = false;

function reminkoRevealAfterPaint(callback) {
    requestAnimationFrame(function () {
        requestAnimationFrame(callback);
    });
}

function reminkoWhenThemeCssReady(callback) {
    var theme = 'white';
    try {
        theme =
            document.documentElement.getAttribute('data-rem-theme') ||
            (localStorage.getItem('rem_transform_theme') === 'dark' ? 'dark' : 'white');
    } catch (_) {
        /* ignore */
    }

    if (theme !== 'dark') {
        reminkoRevealAfterPaint(callback);
        return;
    }

    var link = document.getElementById('rem-theme-dark-css');
    var done = false;
    var finish = function () {
        if (done) return;
        done = true;
        reminkoRevealAfterPaint(callback);
    };

    if (!link) {
        finish();
        return;
    }

    try {
        if (link.sheet) {
            finish();
            return;
        }
    } catch (_) {
        /* cross-origin or not ready */
    }

    link.addEventListener('load', finish, { once: true });
    link.addEventListener('error', finish, { once: true });
    setTimeout(finish, 400);
}

function reminkoWhenLayoutReady(callback) {
    if (__reminkoNavigationApplied) {
        reminkoWhenThemeCssReady(callback);
        return;
    }
    window.addEventListener(
        'reminko:navigation-applied',
        function () {
            reminkoWhenThemeCssReady(callback);
        },
        { once: true }
    );
}

function reminkoHideLoadingOnce() {
    if (__reminkoLoadingSettled) return;
    reminkoWhenLayoutReady(function () {
        if (__reminkoLoadingSettled) return;
        __reminkoLoadingSettled = true;
        hideLoading();
    });
}

function reminkoTryHideAfterNavigation() {
    if (__reminkoLoadingSettled || !__reminkoNavigationApplied) return;
    setTimeout(function () {
        reminkoHideLoadingOnce();
    }, 60);
}

/** Слушатель сразу при загрузке скрипта — до defer/initNavigation и до DOMContentLoaded */
window.addEventListener('reminko:navigation-applied', () => {
    __reminkoNavigationApplied = true;
    reminkoTryHideAfterNavigation();
});

function reminkoBootLoadingScreen() {
    if (__reminkoLoadingBooted) return;
    __reminkoLoadingBooted = true;

    if (window.__reminkoSkipTransformLoading || window.__reminkoSkipInitialLoading) {
        document.body.classList.add('reminko-loading-dismissed');
        var skipLs = document.getElementById('loadingScreen');
        if (skipLs) {
            skipLs.classList.add('hidden');
            skipLs.style.display = 'none';
        }
        reminkoTryHideAfterNavigation();
        setTimeout(function () {
            reminkoHideLoadingOnce();
        }, 10000);
        return;
    }

    showLoading();

    // Абсолютный предел ожидания (если навигация так и не применилась)
    setTimeout(() => reminkoHideLoadingOnce(), 10000);

    // Если навигация уже успела отработать до boot (редкий порядок скриптов)
    reminkoTryHideAfterNavigation();

    // Страховка: не оставляем контент невидимым
    setTimeout(() => {
        if (!document.body.classList.contains('reminko-content-revealed')) {
            document.body.classList.add('reminko-ui-ready');
            document.body.classList.add('reminko-content-revealed');
            dispatchReminkoLoadingHidden();
            const ls = document.getElementById('loadingScreen');
            if (ls) {
                ls.classList.add('hidden');
                ls.style.display = 'none';
            }
        }
    }, 8000);
}

reminkoBootLoadingScreen();

// bfcache / «Назад» в вкладку: иначе loadingScreen остаётся поверх
window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    reminkoHideLoadingOnce();
    document.body.classList.add('reminko-content-revealed', 'reminko-loading-dismissed');
    const ls = document.getElementById('loadingScreen');
    if (ls) {
        ls.classList.add('hidden');
        ls.style.display = 'none';
    }
});

// Перехватываем клики по ссылкам для показа загрузки
// Используем capture phase с высоким приоритетом, но проверяем кнопки входа/регистрации первыми
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    if (link.classList.contains('top-logo') || link.closest('.top-logo')) {
        return;
    }
    
    // Исключаем кнопки входа и регистрации - они открывают модальные окна без загрузки
    // Проверяем по ID, классам и тексту кнопки ПЕРВЫМ ДЕЛОМ
    const linkId = link.id || '';
    const linkClasses = link.className || '';
    const linkText = link.textContent.trim() || '';
    const href = link.getAttribute('href') || '';
    
    // Проверяем все возможные варианты кнопок входа/регистрации
    const isLoginRegisterBtn = 
        linkId.includes('Login') || linkId.includes('Register') || 
        linkId === 'topLoginBtn' || linkId === 'loginBtn' ||
        linkId === 'topRegisterBtn' || linkId === 'registerBtn' ||
        linkId === 'topLogoutBtn' ||
        linkClasses.includes('btn-top-login') || linkClasses.includes('btn-login') ||
        linkClasses.includes('btn-top-register') || linkClasses.includes('btn-register') ||
        linkClasses.includes('btn-top-logout') ||
        linkText === 'Войти' || linkText === 'Регистрация' || linkText === 'Выйти' ||
        (href === '#' && (linkText === 'Войти' || linkText === 'Регистрация' || linkText === 'Выйти'));
    
    if (isLoginRegisterBtn) {
        // НЕ показываем загрузку для кнопок входа/регистрации
        return;
    }
    
    // Проверяем ссылки с href="#"
    if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:')) {
        return; // Не показываем загрузку для якорных ссылок
    }
    
    // Проверяем, что это внутренняя ссылка
    if (href && !href.startsWith('http') && !href.startsWith('mailto:')) {
        // Профиль — без полноэкранного лоадера (там свой быстрый каркас)
        if (/profile\.html/i.test(href)) {
            try {
                sessionStorage.setItem('rem_transform_skip_loading', '1');
            } catch (_) {
                /* ignore */
            }
            return;
        }
        showLoading(); // Используем рандомную фразу
    }
}, true); // Capture phase - срабатывает раньше других обработчиков

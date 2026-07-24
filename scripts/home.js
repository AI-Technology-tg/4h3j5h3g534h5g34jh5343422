// Главная страница - Re-Minko

const JIKAN_HOME_BASE = 'https://api.jikan.moe/v4';
const JIKAN_HOME_CACHE_KEY = 'home_jikan_cache_v7';
const JIKAN_ANNOUNCED_HOME_LIMIT = 120;
const JIKAN_HOME_CACHE_TTL = 25 * 60 * 1000; // 25 мин — новинки сезона и анонсы свежее

function initHomeBetaBanner() {
    /* Плашка «Бета» — только статичный текст в разметке index.html */
}

/** Совпадает с giveaway-info.js */
const HOME_GIVEAWAY_START_ISO = '2026-07-17T22:00:00.000Z';
const HOME_GIVEAWAY_END_ISO = '2026-07-31T21:59:59.000Z';

function initHomeGiveawayBanner() {
    const banner = document.getElementById('homeGiveawayBanner');
    if (!banner) return;
    const end = Date.parse(HOME_GIVEAWAY_END_ISO);
    if (!Number.isNaN(end) && Date.now() >= end) {
        banner.hidden = true;
    }
}

function getHomeCache() {
    try {
        const raw = sessionStorage.getItem(JIKAN_HOME_CACHE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (Date.now() - data.ts > JIKAN_HOME_CACHE_TTL) {
            sessionStorage.removeItem(JIKAN_HOME_CACHE_KEY);
            return null;
        }
        const meta = typeof getJikanSeasonMeta === 'function' ? getJikanSeasonMeta() : null;
        if (meta && data.seasonSeasonKey && data.seasonSeasonKey !== meta.seasonKey) {
            delete data.season;
            delete data.seasonSeasonKey;
            try {
                sessionStorage.setItem(JIKAN_HOME_CACHE_KEY, JSON.stringify(data));
            } catch {
                /* ignore */
            }
        }
        return data;
    } catch {
        return null;
    }
}

function setHomeCache(key, value) {
    try {
        const existing = getHomeCache() || { ts: Date.now() };
        existing[key] = value;
        if (key === 'season' && typeof getJikanSeasonMeta === 'function') {
            existing.seasonSeasonKey = getJikanSeasonMeta().seasonKey;
        }
        existing.ts = Date.now();
        sessionStorage.setItem(JIKAN_HOME_CACHE_KEY, JSON.stringify(existing));
    } catch {
        /* ignore */
    }
}

async function jikanHomeFetch(url) {
    if (typeof reminkoJikanFetch === 'function') {
        return reminkoJikanFetch(url);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Jikan ${res.status}`);
    return res.json();
}

const HOME_SOCIAL_INFO = {
    telegram: {
        title: 'Telegram',
        img: 'Fons/Sociale/Telegram.png',
        url: 'https://telegram.me/re_minko',
        goLabel: 'Перейти в Telegram',
        text: 'На канале чаще всего публикуется информация о разработке и проводятся розыгрыши. Также есть Telegram-группа для общения с сообществом.',
    },
    tiktok: {
        title: 'TikTok',
        img: 'Fons/Sociale/TikTok.png',
        url: 'https://www.tiktok.com/@re.minko',
        goLabel: 'Перейти в TikTok',
        text: 'Здесь — ролики создателя. Разработка сайта не главная тема, но иногда проскакивают промокоды и халява.',
    },
    instagram: {
        title: 'Instagram',
        img: 'Fons/Sociale/Instagram.png',
        url: 'https://www.instagram.com/re.minko/',
        goLabel: 'Перейти в Instagram',
        text: 'Публикации комбинированные: важные объявления, новости и короткие видео в одной ленте.',
    },
    facebook: {
        title: 'Facebook',
        img: 'Fons/Sociale/Facebook.png',
        url: 'https://www.facebook.com/share/1ayMx4Pi6F/',
        goLabel: 'Перейти в Facebook',
        text: 'По сути то же, что и в Instagram, но на Facebook чаще появляются скрытые функции и пасхалки сайта.',
    },
    twitter: {
        title: 'Twitter (X)',
        img: 'Fons/Sociale/Twitter.png',
        url: 'https://x.com/re_minko',
        goLabel: 'Перейти в Twitter',
        text: 'Короткие анонсы и новости проекта: обновления сайта, важные объявления и быстрые ссылки на разделы Re-Minko.',
    },
    vk: {
        title: 'ВКонтакте',
        img: 'Fons/Sociale/VK.png',
        url: '',
        goLabel: 'ВКонтакте скоро',
        text: 'Группа во «ВКонтакте» для новостей и розыгрышей. Ссылка появится, когда сообщество будет готово.',
    },
    discord: {
        title: 'Discord',
        img: 'Fons/Sociale/Discord.png',
        url: '',
        goLabel: 'Сервер скоро',
        text: 'Discord-сервер для информирования и проведения розыгрышей прямо на сайте. Ссылка появится, когда сервер будет готов.',
    },
    android: {
        title: 'Приложения Re-Minko',
        img: 'Fons/androids.png',
        imgFallback: 'Fons/Sociale/ReMinkoAndroid.svg',
        imgLarge: true,
        hideTitle: true,
        isAppsHub: true,
        text: 'Все версии сейчас в разработке. Следите за новостями в Telegram — ссылки на скачивание появятся здесь.',
        appDownloads: [
            { label: 'Скачать для Android', sub: 'Телефон и планшет' },
            { label: 'Скачать для ПК', sub: 'Windows' },
            { label: 'Скачать для TV', sub: 'Smart TV, Android TV' },
        ],
    },
};

function openHomeSocialPanel(key) {
    const info = HOME_SOCIAL_INFO[key];
    const panel = document.getElementById('homeSocialPanel');
    if (!info || !panel) return;

    const iconEl = document.getElementById('homeSocialPanelIcon');
    const titleEl = document.getElementById('homeSocialPanelTitle');
    const textEl = document.getElementById('homeSocialPanelText');
    const goEl = document.getElementById('homeSocialPanelGo');
    const appsEl = document.getElementById('homeSocialPanelApps');

    if (titleEl) {
        titleEl.textContent = info.title || '';
        if (info.hideTitle) {
            titleEl.hidden = true;
        } else {
            titleEl.hidden = false;
        }
    }
    if (textEl) textEl.textContent = info.text;

    if (iconEl) {
        iconEl.className = 'home-social-panel__icon';
        if (info.imgLarge) iconEl.classList.add('home-social-panel__icon--large');
        if (info.img) {
            const fallback = info.imgFallback ? ` onerror="this.onerror=null;this.src='${info.imgFallback}'"` : '';
            const size = info.imgLarge ? 'width="280" height="200"' : 'width="72" height="72"';
            iconEl.innerHTML = `<img src="${info.img}" alt="" ${size} decoding="async"${fallback}>`;
        } else if (info.iconLetter) {
            const variant = info.iconVariant || 'letter';
            iconEl.classList.add(`home-social-panel__icon--${variant}`);
            iconEl.textContent = info.iconLetter;
        }
    }

    if (goEl) {
        if (info.isAppsHub && Array.isArray(info.appDownloads) && appsEl) {
            goEl.hidden = true;
            appsEl.hidden = false;
            appsEl.innerHTML = info.appDownloads
                .map(
                    (item) => `<button type="button" class="home-social-panel__app-btn is-disabled" disabled aria-disabled="true">
                        <span class="home-social-panel__app-btn-label">${item.label}</span>
                        ${item.sub ? `<span class="home-social-panel__app-btn-sub">${item.sub}</span>` : ''}
                        <span class="home-social-panel__app-btn-badge">скоро</span>
                    </button>`
                )
                .join('');
        } else {
            if (appsEl) {
                appsEl.hidden = true;
                appsEl.innerHTML = '';
            }
            goEl.hidden = false;
            if (info.url) {
                goEl.href = info.url;
                goEl.textContent = info.goLabel;
                goEl.classList.remove('is-disabled');
                goEl.removeAttribute('aria-disabled');
            } else {
                goEl.href = '#';
                goEl.textContent = info.goLabel;
                goEl.classList.add('is-disabled');
                goEl.setAttribute('aria-disabled', 'true');
            }
        }
    }

    panel.hidden = false;
    document.body.style.overflow = 'hidden';
    const closeBtn = panel.querySelector('.home-social-panel__close');
    if (closeBtn) closeBtn.focus();
}

function closeHomeSocialPanel() {
    const panel = document.getElementById('homeSocialPanel');
    if (!panel) return;
    panel.hidden = true;
    document.body.style.overflow = '';
}

function initHomeSocialPanel() {
    document.querySelectorAll('[data-social]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-social');
            if (key) openHomeSocialPanel(key);
        });
    });

    const panel = document.getElementById('homeSocialPanel');
    if (!panel) return;

    panel.querySelector('.home-social-panel__close')?.addEventListener('click', closeHomeSocialPanel);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel && !panel.hidden) closeHomeSocialPanel();
    });

    const goEl = document.getElementById('homeSocialPanelGo');
    if (goEl) {
        goEl.addEventListener('click', (e) => {
            if (goEl.classList.contains('is-disabled')) e.preventDefault();
        });
    }
}

function initHomeAppButtons() {
    initHomeSocialPanel();
}

document.addEventListener('DOMContentLoaded', () => {
    function initHome() {
        if (typeof animeDatabase === 'undefined' || !animeDatabase.all) {
            setTimeout(initHome, 50);
            return;
        }

        if (typeof initPosterObserver === 'function') {
            initPosterObserver();
        }

        initHomeBetaBanner();
        initHomeGiveawayBanner();
        initHomeAppButtons();

        updateHeroStats();
        loadHeroWatchHistory();
        loadHeroFavorites();

        if (typeof window.KodikCatalogStore?.load === 'function') {
            window.KodikCatalogStore.load()
                .then(() => {
                    updateHeroStats();
                    if (typeof initKodikHomeSections === 'function') initKodikHomeSections();
                })
                .catch(() => {
                    updateHeroStats();
                    if (typeof initKodikHomeSections === 'function') initKodikHomeSections();
                });
        } else if (typeof initKodikHomeSections === 'function') {
            initKodikHomeSections();
        }

        // Манга-каталог (~16 МБ) — после idle, чтобы не бить по первому скроллу
        function loadRemangaWhenIdle() {
            if (typeof window.RemangaCatalogStore?.load !== 'function') return;
            window.RemangaCatalogStore.load()
                .catch((e) => console.warn('[Home] ReManga catalog:', e))
                .finally(() => {
                    if (typeof updateHeroStats === 'function') updateHeroStats();
                });
        }
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(loadRemangaWhenIdle, { timeout: 6000 });
        } else {
            setTimeout(loadRemangaWhenIdle, 2800);
        }

        if (typeof loadHeroWatchHistory === 'function') {
            void (async () => {
                if (typeof window.KodikCatalogStore?.load === 'function') {
                    try {
                        await window.KodikCatalogStore.load();
                    } catch (_) {
                        /* ignore */
                    }
                }
                loadHeroWatchHistory();
                loadHeroFavorites();
            })();
        }

        if (
            !window.__homeRecentAuthHook &&
            typeof supabaseClient !== 'undefined' &&
            supabaseClient?.auth?.onAuthStateChange
        ) {
            window.__homeRecentAuthHook = true;
            supabaseClient.auth.onAuthStateChange(() => {
                loadHeroWatchHistory();
                loadHeroFavorites();
            });
        }

        if (!window.__homeFavoritesHook) {
            window.__homeFavoritesHook = true;
            window.addEventListener('reminko:favorites-loaded', () => {
                if (typeof loadHeroFavorites === 'function') loadHeroFavorites();
            });
        }

    }

    initHome();
});

window.addEventListener('reminko-kodik-catalog-loaded', () => {
    if (typeof updateHeroStats === 'function') updateHeroStats();
    if (typeof initKodikHomeSections === 'function') initKodikHomeSections();
    if (typeof loadHeroWatchHistory === 'function') loadHeroWatchHistory();
});

window.addEventListener('reminko-watch-history-updated', () => {
    if (typeof loadHeroWatchHistory === 'function') loadHeroWatchHistory();
});

window.addEventListener('reminko:favorites-loaded', () => {
    if (typeof loadHeroFavorites === 'function') loadHeroFavorites();
});

window.addEventListener('reminko-remanga-catalog-loaded', () => {
    if (typeof updateHeroStats === 'function') updateHeroStats();
});

function formatHeroStatCount(n) {
    const num = parseInt(n, 10);
    if (!Number.isFinite(num) || num < 0) return '0';
    return num.toLocaleString('ru-RU');
}

function updateHeroStats() {
    const animeCountEl = document.getElementById('statAnimeCount');
    const mangaCountEl = document.getElementById('statMangaCount');

    if (animeCountEl) {
        const meta =
            typeof window.KodikCatalogStore?.getMeta === 'function'
                ? window.KodikCatalogStore.getMeta()
                : null;
        let animeCount = null;
        if (typeof getAllAnime === 'function') {
            const visible = getAllAnime();
            if (visible.length > 0) {
                animeCount = new Set(
                    visible.map((a) => parseInt(a.id, 10)).filter(Number.isFinite)
                ).size;
            }
        }
        if (animeCount == null && meta && Number.isFinite(meta.count)) {
            animeCount = meta.count;
        }
        if (animeCount == null) {
            const anime = Array.isArray(animeDatabase?.all) ? animeDatabase.all : [];
            animeCount = new Set(anime.map((a) => parseInt(a.id, 10)).filter(Number.isFinite)).size;
        }

        animeCountEl.textContent = formatHeroStatCount(animeCount);
    }
    if (mangaCountEl) {
        mangaCountEl.textContent = 'В работе';
    }

    const seasonBadge = document.querySelector('.badge-season');
    if (seasonBadge && typeof getJikanSeasonMeta === 'function') {
        const m = getJikanSeasonMeta();
        seasonBadge.textContent = `${m.labelRu} ${m.year}`;
    }
}

// ==================== Jikan API секции ====================

/** Пауза между стартами автосдвига (сама анимация ~HOME_CAROUSEL_ANIM_MS) */
const HOME_CAROUSEL_INTERVAL_MS = 3200;
/** Длительность плавного шага на одну карточку */
const HOME_CAROUSEL_ANIM_MS = 780;
/** Порог «сдвинули ленту»; меньше — ложные срабатывания на тапе/тачскролле */
const HOME_CAROUSEL_DRAG_PX = 22;
const HOME_CAROUSEL_PAUSE_MS = 5000;
const HOME_CAROUSEL_TAP_MAX_MS = 380;

function homeCarouselEaseOutCubic(t) {
    const x = Math.min(1, Math.max(0, t));
    return 1 - Math.pow(1 - x, 3);
}

function homeCarouselPrefersReducedMotion() {
    try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
        return false;
    }
}

if (typeof window !== 'undefined' && !window.__homeCarouselEls) {
    window.__homeCarouselEls = new Set();
}

function dedupeMal(list) {
    const m = new Map();
    for (const x of list) {
        if (x && x.mal_id && !m.has(x.mal_id)) m.set(x.mal_id, x);
    }
    return [...m.values()];
}

async function jikanFetchPaged(pathWithLeadingSlash, maxItems, maxPages) {
    const all = [];
    let page = 1;
    const cap = maxItems || 50;
    const pageLimit = maxPages || 2;
    while (all.length < cap && page <= pageLimit) {
        const sep = pathWithLeadingSlash.includes('?') ? '&' : '?';
        const url = `${JIKAN_HOME_BASE}${pathWithLeadingSlash}${sep}page=${page}`;
        try {
            const data = await jikanHomeFetch(url);
            const chunk = data.data || [];
            all.push(...chunk);
            if (!data.pagination?.has_next_page || chunk.length === 0) break;
        } catch (e) {
            if (all.length) {
                console.warn('[Home] Jikan частичная загрузка:', e);
                break;
            }
            throw e;
        }
        page++;
        if (all.length < cap) await new Promise((r) => setTimeout(r, 1100));
    }
    return dedupeMal(all).slice(0, cap);
}

function registerCarouselEl(container) {
    if (typeof window === 'undefined' || !window.__homeCarouselEls) return;
    window.__homeCarouselEls.add(container);
    ensureHomeCarouselMaster();
    if (typeof window.__homeCarouselRegisterHook === 'function') {
        window.__homeCarouselRegisterHook(container);
    }
}

function unregisterCarouselEl(container) {
    if (typeof window === 'undefined' || !window.__homeCarouselEls) return;
    window.__homeCarouselEls.delete(container);
}

function ensureHomeCarouselMaster() {
    if (typeof window === 'undefined' || window.__homeCarouselMasterStarted) return;
    window.__homeCarouselMasterStarted = true;
    if (!window.__homeCarouselVisible) window.__homeCarouselVisible = new WeakSet();

    // Fallback без IntersectionObserver — старое поведение
    if (typeof IntersectionObserver === 'undefined') {
        let lastTick = 0;
        function frame(now) {
            if (!document.hidden && now - lastTick >= HOME_CAROUSEL_INTERVAL_MS) {
                lastTick = now;
                window.__homeCarouselEls.forEach((el) => {
                    if (typeof el._homeCarouselAdvance === 'function') el._homeCarouselAdvance();
                });
            }
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        return;
    }

    // Крутим rAF только когда хотя бы одна лента видна и вкладка активна
    let lastTick = 0;
    let rafId = 0;
    let running = false;

    function anyVisible() {
        let found = false;
        window.__homeCarouselEls.forEach((el) => {
            if (window.__homeCarouselVisible.has(el)) found = true;
        });
        return found;
    }

    function frame(now) {
        rafId = 0;
        if (document.hidden || !anyVisible()) {
            running = false;
            return;
        }
        if (now - lastTick >= HOME_CAROUSEL_INTERVAL_MS) {
            lastTick = now;
            window.__homeCarouselEls.forEach((el) => {
                if (
                    window.__homeCarouselVisible.has(el) &&
                    typeof el._homeCarouselAdvance === 'function'
                ) {
                    el._homeCarouselAdvance();
                }
            });
        }
        rafId = requestAnimationFrame(frame);
    }

    function startLoop() {
        if (running || document.hidden || !anyVisible()) return;
        running = true;
        rafId = requestAnimationFrame(frame);
    }

    function stopLoop() {
        running = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    if (!window.__homeCarouselIo) {
        window.__homeCarouselIo = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const el = entry.target;
                    if (entry.isIntersecting && entry.intersectionRatio > 0.05) {
                        window.__homeCarouselVisible.add(el);
                    } else {
                        window.__homeCarouselVisible.delete(el);
                    }
                });
                if (anyVisible() && !document.hidden) startLoop();
                else stopLoop();
            },
            { root: null, threshold: [0, 0.05, 0.2] }
        );
    }

    window.__homeCarouselEls.forEach((el) => {
        try {
            window.__homeCarouselIo.observe(el);
        } catch (_) {
            /* ignore */
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopLoop();
        else startLoop();
    });

    const prevRegister = window.__homeCarouselRegisterHook;
    window.__homeCarouselRegisterHook = function (container) {
        if (typeof prevRegister === 'function') prevRegister(container);
        try {
            window.__homeCarouselIo.observe(container);
        } catch (_) {
            /* ignore */
        }
        startLoop();
    };

    startLoop();
}

function teardownHomeHorizontalScroll(container) {
    if (!container || typeof container._homeHorizontalTeardown !== 'function') return;
    container._homeHorizontalTeardown();
    container._homeHorizontalTeardown = null;
}

function getHomeScrollStep(container) {
    const card = container.querySelector('.jikan-card');
    if (!card) return 176;
    const style = window.getComputedStyle(container);
    const gap = parseFloat(style.gap || style.columnGap) || 16;
    return card.getBoundingClientRect().width + gap;
}

/** Горизонтальная лента: одна копия карточек, автопрокрутка с переходом в начало; пауза 5 с после ручного жеста */
function enhanceHomeHorizontalScroll(container) {
    if (!container) return;
    teardownHomeHorizontalScroll(container);

    let pauseUntil = 0;
    const bumpPause = () => {
        pauseUntil = Date.now() + HOME_CAROUSEL_PAUSE_MS;
    };

    let drag = false;
    let dragged = false;
    let captureApplied = false;
    let startX = 0;
    let startScroll = 0;
    let activePointer = null;
    let pointerDownAt = 0;
    let maxAbsDx = 0;
    let animRaf = 0;
    let animating = false;

    function cancelAutoScrollAnim() {
        if (animRaf) {
            cancelAnimationFrame(animRaf);
            animRaf = 0;
        }
        animating = false;
    }

    function animateScrollTo(targetLeft, durationMs) {
        cancelAutoScrollAnim();
        const from = container.scrollLeft;
        const to = targetLeft;
        const dist = to - from;
        if (Math.abs(dist) < 0.5) {
            container.scrollLeft = to;
            return;
        }
        if (homeCarouselPrefersReducedMotion() || durationMs <= 0) {
            container.scrollLeft = to;
            return;
        }
        animating = true;
        const started = performance.now();
        function tick(now) {
            if (!animating) return;
            const t = (now - started) / durationMs;
            if (t >= 1) {
                container.scrollLeft = to;
                animating = false;
                animRaf = 0;
                return;
            }
            container.scrollLeft = from + dist * homeCarouselEaseOutCubic(t);
            animRaf = requestAnimationFrame(tick);
        }
        animRaf = requestAnimationFrame(tick);
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('.jikan-card-go-btn')) return;
        cancelAutoScrollAnim();
        delete container.dataset.suppressJikanClick;
        drag = true;
        dragged = false;
        captureApplied = false;
        pointerDownAt = Date.now();
        maxAbsDx = 0;
        startX = e.clientX;
        startScroll = container.scrollLeft;
        activePointer = e.pointerId;
        container.classList.add('is-dragging');
    }

    function onPointerMove(e) {
        if (!drag || e.pointerId !== activePointer) return;
        const dx = e.clientX - startX;
        maxAbsDx = Math.max(maxAbsDx, Math.abs(dx));
        if (!captureApplied && Math.abs(dx) > HOME_CAROUSEL_DRAG_PX) {
            captureApplied = true;
            try {
                container.setPointerCapture(e.pointerId);
            } catch (_) { /* ignore */ }
        }
        if (Math.abs(dx) > HOME_CAROUSEL_DRAG_PX) {
            dragged = true;
            bumpPause();
        }
        container.scrollLeft = startScroll - dx;
    }

    function onPointerEnd(e) {
        if (!drag || e.pointerId !== activePointer) return;
        drag = false;
        container.classList.remove('is-dragging');
        if (captureApplied) {
            try {
                container.releasePointerCapture(e.pointerId);
            } catch (_) { /* ignore */ }
        }
        captureApplied = false;
        activePointer = null;
        const tapLike =
            Date.now() - pointerDownAt < HOME_CAROUSEL_TAP_MAX_MS &&
            maxAbsDx <= HOME_CAROUSEL_DRAG_PX;
        if (tapLike) dragged = false;
        if (dragged) {
            container.dataset.suppressJikanClick = '1';
        }
    }

    function onWheel(e) {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) bumpPause();
    }

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove, { passive: false });
    container.addEventListener('pointerup', onPointerEnd);
    container.addEventListener('pointercancel', onPointerEnd);
    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener(
        'dragstart',
        (e) => {
            e.preventDefault();
        },
        true
    );
    if (typeof reminkoLockDragScrollLinks === 'function') {
        reminkoLockDragScrollLinks(container, 'a, .jikan-card');
    }

    container.addEventListener(
        'click',
        (e) => {
            if (container.dataset.suppressJikanClick !== '1') return;
            // После свайпа ленты глотаем «фантомный» клик по постеру, но не блокируем явное нажатие «Перейти»
            if (e.target.closest('.jikan-card-go-btn')) {
                delete container.dataset.suppressJikanClick;
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            delete container.dataset.suppressJikanClick;
        },
        true
    );

    container._homeCarouselAdvance = () => {
        if (document.hidden) return;
        if (Date.now() < pauseUntil) return;
        if (drag || animating) return;
        const step = getHomeScrollStep(container);
        const maxLeft = container.scrollWidth - container.clientWidth;
        if (maxLeft <= 0) return;
        const atEnd = container.scrollLeft >= maxLeft - 0.5;
        if (atEnd) {
            // В начало без «отмотки» назад по всем карточкам
            container.scrollLeft = 0;
            return;
        }
        let next = container.scrollLeft + step;
        if (next > maxLeft) next = maxLeft;
        animateScrollTo(next, HOME_CAROUSEL_ANIM_MS);
    };

    registerCarouselEl(container);

    container._homeHorizontalTeardown = () => {
        cancelAutoScrollAnim();
        unregisterCarouselEl(container);
        delete container._homeCarouselAdvance;
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerEnd);
        container.removeEventListener('pointercancel', onPointerEnd);
        container.removeEventListener('wheel', onWheel);
        delete container.dataset.suppressJikanClick;
    };
}

if (typeof window !== 'undefined') {
    window.enhanceHomeHorizontalScroll = enhanceHomeHorizontalScroll;
}

function initialEpLine(anime) {
    if (typeof window !== 'undefined' && window.shikimoriApi && window.shikimoriApi.formatAiredTotal) {
        const t = window.shikimoriApi.formatAiredTotal(anime, null);
        if (t) return t;
    }
    const ep = anime.episodes;
    if (ep != null && ep > 0) return `? / ${ep} эп.`;
    return '';
}

function createJikanCard(anime) {
    const card = document.createElement('div');
    card.className = 'jikan-card';
    card.dataset.malId = String(anime.mal_id);

    const cachedPoster =
        typeof readMalPosterCache === 'function' ? readMalPosterCache(anime.mal_id) : '';
    const imgUrl =
        (typeof jikanPosterFromAnime === 'function' ? jikanPosterFromAnime(anime) : '') ||
        cachedPoster ||
        anime.images?.jpg?.large_image_url ||
        anime.images?.jpg?.image_url ||
        '';
    const imgSrc =
        imgUrl ||
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const score = anime.score ? anime.score.toFixed(1) : '—';
    const titleEn = anime.title_english || anime.title || anime.title_japanese || '—';
    const cachedShiki =
        anime.mal_id && window.shikimoriApi?.readCachedByMalId
            ? window.shikimoriApi.readCachedByMalId(anime.mal_id)
            : null;
    const catalogTitle =
        anime.mal_id && window.KodikCatalogStore?.getAll
            ? (window.KodikCatalogStore.getAll() || []).find((a) => String(a.mal_id) === String(anime.mal_id))?.title
            : '';
    const titleDisplay =
        (catalogTitle && /[а-яё]/i.test(catalogTitle) ? catalogTitle : '') ||
        (cachedShiki?.russian || '') ||
        (anime.title_russian || '') ||
        (anime.title && /[а-яё]/i.test(anime.title) ? anime.title : '') ||
        titleEn;
    const epLine = initialEpLine(anime);
    const status =
        anime.status === 'Currently Airing'
            ? 'В эфире'
            : anime.status === 'Not yet aired'
              ? 'Анонс'
              : anime.status === 'Finished Airing'
                ? 'Завершён'
                : '';
    const genres = (anime.genres || [])
        .slice(0, 2)
        .map((g) => (typeof mapJikanGenreName === 'function' ? mapJikanGenreName(g.name) : g.name))
        .join(', ');

    card.innerHTML = `
        <div class="jikan-card-poster">
            <img src="${imgSrc}" alt="" decoding="async" loading="lazy" referrerpolicy="no-referrer" data-jikan-poster="1">
            <div class="jikan-card-poster-hover" aria-hidden="true">
                <button type="button" class="jikan-card-go-btn">Перейти</button>
            </div>
            ${score !== '—' ? `<div class="jikan-card-score">${score}</div>` : ''}
            ${status ? `<div class="jikan-card-status">${status}</div>` : ''}
        </div>
        <div class="jikan-card-info">
            <div class="jikan-card-title"></div>
            <div class="jikan-card-meta">
                ${epLine ? `<span class="jikan-card-ep">${epLine}</span>` : ''}
                ${genres ? `<span>${genres}</span>` : ''}
            </div>
        </div>
    `;

    const titleEl = card.querySelector('.jikan-card-title');
    if (titleEl) {
        titleEl.textContent = titleDisplay;
        titleEl.setAttribute('title', titleDisplay);
    }
    const posterImg = card.querySelector('.jikan-card-poster img');
    if (posterImg) {
        posterImg.alt = titleDisplay || 'Постер аниме';
        if (typeof attachJikanPosterFallback === 'function') {
            attachJikanPosterFallback(posterImg, anime.mal_id, anime);
        }
    }

    const goJikan = () => {
        if (typeof navigateToJikanAnnouncedAnime === 'function') {
            navigateToJikanAnnouncedAnime(anime);
            return;
        }
        const mal = anime.mal_id || 0;
        const virtualId = 10000000 + mal;
        try {
            sessionStorage.setItem('jikanAnimeData', JSON.stringify(anime));
            sessionStorage.setItem('previousUrl', window.location.href);
            sessionStorage.setItem('viewAnimeId', String(virtualId));
        } catch (_) {
            /* ignore */
        }
        const isCatalog =
            window.location.pathname.includes('/catalog/') ||
            window.location.pathname.includes('/anime/') ||
            window.location.pathname.includes('/manga/');
        const base = isCatalog ? '../anime/view.html' : 'anime/view.html';
        const q = `?id=${encodeURIComponent(String(virtualId))}&mal_id=${encodeURIComponent(String(mal))}`;
        window.location.href = base + q;
    };

    const goBtn = card.querySelector('.jikan-card-go-btn');
    if (goBtn) {
        goBtn.addEventListener(
            'click',
            (e) => {
                e.preventDefault();
                e.stopPropagation();
                const scroll = card.closest('.home-horizontal-scroll');
                if (scroll) delete scroll.dataset.suppressJikanClick;
                goJikan();
            },
            true
        );
    }
    card.addEventListener('click', (e) => {
        if (e.target.closest('.jikan-card-go-btn')) return;
        const scroll = card.closest('.home-horizontal-scroll');
        if (scroll?.dataset?.suppressJikanClick === '1') return;
        goJikan();
    });

    return card;
}

const HOME_SHIKI_PREFETCH = 10;

function applyShikiPatchToCards(container, anime, sh) {
    if (typeof patchJikanVirtualShiki === 'function') patchJikanVirtualShiki(anime.mal_id, sh);
    const epText =
        sh && window.shikimoriApi && window.shikimoriApi.formatAiredTotal
            ? window.shikimoriApi.formatAiredTotal(anime, sh)
            : '';
    const baseTitle =
        anime.title_english || anime.title || anime.title_japanese || '';
    container.querySelectorAll(`[data-mal-id="${anime.mal_id}"]`).forEach((c) => {
        const t = c.querySelector('.jikan-card-title');
        const ep = c.querySelector('.jikan-card-ep');
        if (sh && sh.russian && t) {
            t.textContent = sh.russian;
            t.setAttribute('title', sh.russian);
        }
        if (ep && epText) ep.textContent = epText;
        if (sh?.image?.original) {
            const u =
                typeof shikimoriPosterUrlFromPath === 'function'
                    ? shikimoriPosterUrlFromPath(sh.image.original)
                    : '';
            if (u && typeof isShikimoriPlaceholderPoster === 'function' && !isShikimoriPlaceholderPoster(u)) {
                const img = c.querySelector('.jikan-card-poster img');
                if (img) {
                    img.classList.remove('is-poster-missing');
                    img.src = u;
                    if (typeof writeMalPosterCache === 'function') writeMalPosterCache(anime.mal_id, u);
                }
            }
        }
    });
}

function scheduleShikiForAnime(container, anime) {
    if (!window.shikimoriApi) return;
    const searchTitle = anime.title_english || anime.title || '';
    window.shikimoriApi.enqueueFetchShikimoriByMalId(anime.mal_id, searchTitle).then((sh) => {
        applyShikiPatchToCards(container, anime, sh);
    }).catch(() => {});
}

function applyShikimoriToStrip(container, originalList) {
    if (!window.shikimoriApi || typeof patchJikanVirtualShiki !== 'function') return;

    const unique = [];
    const seen = new Set();
    for (const anime of originalList) {
        if (!anime.mal_id || seen.has(anime.mal_id)) continue;
        seen.add(anime.mal_id);
        unique.push(anime);
    }

    const prefetch = unique.slice(0, HOME_SHIKI_PREFETCH);
    prefetch.forEach((anime) => scheduleShikiForAnime(container, anime));

    const rest = unique.slice(HOME_SHIKI_PREFETCH);
    if (rest.length === 0) return;

    const loaded = new Set(prefetch.map((a) => a.mal_id));
    if (typeof IntersectionObserver === 'undefined') {
        rest.forEach((anime) => scheduleShikiForAnime(container, anime));
        return;
    }

    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((ent) => {
                if (!ent.isIntersecting) return;
                const card = ent.target;
                const malId = parseInt(card.dataset.malId, 10);
                io.unobserve(card);
                if (!malId || loaded.has(malId)) return;
                loaded.add(malId);
                const anime = unique.find((a) => a.mal_id === malId);
                if (anime) scheduleShikiForAnime(container, anime);
            });
        },
        { root: container, rootMargin: '140px', threshold: 0.02 }
    );

    container.querySelectorAll('.jikan-card').forEach((card) => {
        const malId = parseInt(card.dataset.malId, 10);
        if (malId && !loaded.has(malId)) io.observe(card);
    });
}

function renderJikanCards(containerId, animeList) {
    const container = document.getElementById(containerId);
    if (!container) return;
    teardownHomeHorizontalScroll(container);
    container.innerHTML = '';

    if (!animeList || animeList.length === 0) {
        container.innerHTML = '<div class="home-loading-placeholder">Нет данных</div>';
        return;
    }

    if (typeof registerJikanHomeList === 'function') {
        registerJikanHomeList(animeList);
    }

    let displayList = animeList;
    if (typeof filterJikanItemsRestricted === 'function') {
        displayList = filterJikanItemsRestricted(animeList);
    }
    if (!displayList || displayList.length === 0) {
        container.innerHTML = '<div class="home-loading-placeholder">Нет данных</div>';
        return;
    }

    displayList.forEach((anime) => {
        container.appendChild(createJikanCard(anime));
    });

    requestAnimationFrame(() => {
        enhanceHomeHorizontalScroll(container);
        applyShikimoriToStrip(container, displayList);
    });

    if (typeof prefetchPosterUrlsForMals === 'function') {
        void prefetchPosterUrlsForMals(displayList.slice(0, 24), { concurrency: 3, delayMs: 400 }).then(
            () => {
                if (typeof readMalPosterCache !== 'function') return;
                container.querySelectorAll('img[data-jikan-poster]').forEach((img) => {
                    const card = img.closest('.jikan-card');
                    const mal = parseInt(card?.dataset?.malId, 10);
                    if (!Number.isFinite(mal) || mal <= 0) return;
                    const url = readMalPosterCache(mal);
                    if (url && img.src !== url) {
                        img.src = url;
                        img.classList.remove('is-poster-missing');
                    }
                });
            }
        );
    }
}

function appendJikanCards(containerId, animeList, excludeMalIds) {
    const container = document.getElementById(containerId);
    if (!container || !Array.isArray(animeList) || animeList.length === 0) return;

    if (typeof registerJikanHomeList === 'function') {
        registerJikanHomeList(animeList);
    }

    const exclude = excludeMalIds instanceof Set ? excludeMalIds : new Set(excludeMalIds || []);
    let displayList = animeList.filter((anime) => anime && !exclude.has(String(anime.mal_id)));
    if (typeof filterJikanItemsRestricted === 'function') {
        displayList = filterJikanItemsRestricted(displayList);
    }
    if (!displayList.length) return;

    displayList.forEach((anime) => {
        container.appendChild(createJikanCard(anime));
    });

    requestAnimationFrame(() => {
        applyShikimoriToStrip(container, displayList);
    });
}

async function loadSeasonAnime() {
    const cache = getHomeCache();
    if (cache && cache.season) {
        renderJikanCards('seasonAnimeGrid', cache.season);
        return;
    }

    const meta = typeof getJikanSeasonMeta === 'function' ? getJikanSeasonMeta() : null;
    const y = meta ? meta.year : new Date().getFullYear();
    const s = meta ? meta.season : 'winter';

    try {
        let list = await jikanFetchPaged(
            `/seasons/${y}/${s}?limit=25&order_by=members&sort=desc`,
            52
        );
        if (!list || list.length < 10) {
            const also = await jikanFetchPaged('/seasons/now?limit=25&order_by=score&sort=desc', 52);
            list = dedupeMal([...(list || []), ...(also || [])]).slice(0, 56);
        }
        setHomeCache('season', list);
        renderJikanCards('seasonAnimeGrid', list);
    } catch (e) {
        console.warn('[Home] Season load error:', e);
        try {
            const list = await jikanFetchPaged('/seasons/now?limit=25&order_by=score&sort=desc', 52);
            setHomeCache('season', list);
            renderJikanCards('seasonAnimeGrid', list);
        } catch (e2) {
            console.warn('[Home] Season fallback error:', e2);
            const el = document.getElementById('seasonAnimeGrid');
            if (el) el.innerHTML = '<div class="home-loading-placeholder">Не удалось загрузить</div>';
        }
    }
}

async function loadUpcomingAnime() {
    try {
        const list = await fetchJikanAnnouncedListCached();
        if (list?.length) {
            renderJikanCards('upcomingAnimeGrid', list.slice(0, JIKAN_ANNOUNCED_HOME_LIMIT));
            return;
        }
        const el = document.getElementById('upcomingAnimeGrid');
        if (el) el.innerHTML = '<div class="home-loading-placeholder">Анонсы временно недоступны</div>';
    } catch (e) {
        const el = document.getElementById('upcomingAnimeGrid');
        if (el) el.innerHTML = '<div class="home-loading-placeholder">Анонсы временно недоступны</div>';
    }
}

async function fetchJikanAnnouncedListCached(opts) {
    if (typeof window.fetchJikanAnnouncedList === 'function') {
        const list = await window.fetchJikanAnnouncedList(opts || {});
        setHomeCache('announced', list);
        return list;
    }
    return [];
}

async function loadAnnouncedHomeSection(mediaType) {
    const section = document.getElementById('kodikHomeAnnounced');
    const gridId = 'kodikAnnouncedGrid';
    if (!section) return;

    const m = mediaType === 'film' ? 'film' : 'serial';
    section.hidden = false;
    section.removeAttribute('aria-hidden');
    section.dataset.activeMedia = m;
    section.querySelectorAll('.home-type-toggle-btn').forEach((b) => {
        const btnMedia = b.dataset.media === 'film' ? 'film' : 'serial';
        const active = btnMedia === m;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const more = section.querySelector('.section-more-link');
    if (more) more.href = 'catalog/anime.html?filter=upcoming';

    const container = document.getElementById(gridId);
    const renderAnnounced = (raw) => {
        const list =
            typeof filterAnnouncedJikanByMedia === 'function'
                ? filterAnnouncedJikanByMedia(raw, m)
                : raw;
        renderJikanCards(gridId, list.slice(0, JIKAN_ANNOUNCED_HOME_LIMIT));
    };

    const cached =
        typeof window.getJikanAnnouncedCachedSync === 'function'
            ? window.getJikanAnnouncedCachedSync()
            : [];
    if (cached.length) {
        renderAnnounced(cached);
    } else if (container) {
        container.innerHTML = '<div class="home-loading-placeholder">Загрузка анонсов…</div>';
    }

    try {
        const raw = await fetchJikanAnnouncedListCached({
            onProgress: (partial) => {
                if (partial?.length) renderAnnounced(partial);
            },
        });
        if (raw?.length) {
            renderAnnounced(raw);
        } else if (container && !cached.length) {
            container.innerHTML =
                '<div class="home-loading-placeholder">Анонсы временно недоступны — загляните позже</div>';
        }
    } catch (e) {
        if (container && !cached.length) {
            container.innerHTML =
                '<div class="home-loading-placeholder">Анонсы временно недоступны — загляните позже</div>';
        }
    }
}

if (typeof window !== 'undefined') {
    window.loadAnnouncedHomeSection = loadAnnouncedHomeSection;
    window.appendAnnouncedHomeSection = async function appendAnnouncedHomeSection(mediaType, excludeMalIds) {
        const raw = await fetchJikanAnnouncedListCached();
        const m = mediaType === 'film' ? 'film' : 'serial';
        const list =
            typeof filterAnnouncedJikanByMedia === 'function'
                ? filterAnnouncedJikanByMedia(raw, m)
                : raw;
        appendJikanCards('kodikAnnouncedGrid', list.slice(0, JIKAN_ANNOUNCED_HOME_LIMIT), excludeMalIds);
    };
}

// ==================== Недавно просмотренные ====================

function getGroupedRecentAnimeHistory(userId, maxTitles) {
    if (typeof getWatchHistory !== 'function') return [];
    const history = getWatchHistory(userId).filter(
        (e) => e && e.type === 'anime' && e.animeId != null && !Number.isNaN(parseInt(e.animeId, 10))
    );
    if (!history.length) return [];

    // По тайтлу: максимальная серия (прогресс) + самое свежее watchedAt (для сортировки ленты)
    const grouped = {};
    for (const entry of history) {
        const id = parseInt(entry.animeId, 10);
        const ep = parseInt(entry.episodeNumber, 10) || 1;
        const prev = grouped[id];
        if (!prev) {
            grouped[id] = { ...entry, episodeNumber: ep };
            continue;
        }
        const prevEp = parseInt(prev.episodeNumber, 10) || 1;
        if (ep > prevEp) {
            grouped[id] = {
                ...entry,
                episodeNumber: ep,
                watchedAt:
                    new Date(entry.watchedAt) > new Date(prev.watchedAt)
                        ? entry.watchedAt
                        : prev.watchedAt,
            };
        } else if (new Date(entry.watchedAt) > new Date(prev.watchedAt)) {
            grouped[id] = {
                ...prev,
                watchedAt: entry.watchedAt,
            };
        }
    }

    const cap = maxTitles || 18;
    return Object.values(grouped)
        .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))
        .slice(0, cap);
}

async function homeHeroIsLoggedIn() {
    if (typeof isAuthenticatedSync === 'function' && !isAuthenticatedSync()) return false;
    if (typeof getCurrentUser === 'function') {
        try {
            const user = await getCurrentUser();
            return !!(user && user.id && !user.isAnonymous);
        } catch (_) {
            /* fall through */
        }
    }
    const sync = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
    return !!(sync && sync.id && !sync.isAnonymous);
}

/** История в hero — тот же формат, что избранное (горизонтальные постеры + ссылка «вся история»). */
async function loadHeroWatchHistory() {
    const box = document.getElementById('heroWatchHistory');
    const bigSection = document.getElementById('recentlyWatchedSection');
    if (bigSection) bigSection.style.display = 'none';

    if (!box) return;

    const showEmpty = (text) => {
        box.hidden = false;
        box.innerHTML =
            '<p class="home-hero-watch-label">Недавно смотрели</p>' +
            `<p class="home-hero-watch-empty">${text}</p>`;
    };

    if (!(await homeHeroIsLoggedIn())) {
        showEmpty('Войдите в аккаунт — тогда история просмотров появится здесь.');
        return;
    }
    const user = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
    if (!user?.id) {
        showEmpty('Войдите в аккаунт — тогда история просмотров появится здесь.');
        return;
    }

    const entries = getGroupedRecentAnimeHistory(user.id, 12);
    if (!entries.length) {
        showEmpty('Откройте тайтл в каталоге и посмотрите серию минуту — история сохранится здесь.');
        return;
    }

    const rows = [];
    for (const entry of entries) {
        const anime = typeof getAnimeById === 'function' ? getAnimeById(entry.animeId) : null;
        if (!anime) continue;
        if (typeof filterAdultAnimeList === 'function' && !filterAdultAnimeList([anime]).length) {
            continue;
        }
        rows.push({ anime, episodeNumber: entry.episodeNumber });
        if (rows.length >= 12) break;
    }

    if (!rows.length) {
        showEmpty('История есть, но тайтлы не найдены в каталоге. Смотрите аниме из раздела «Каталог».');
        return;
    }

    box.hidden = false;
    box.innerHTML =
        '<p class="home-hero-watch-label">Недавно смотрели</p>' +
        '<div class="home-hero-watch-row" tabindex="0" role="list" aria-label="Недавно смотрели"></div>' +
        '<a class="home-hero-watch-more" href="history.html">Вся история →</a>';
    const rowEl = box.querySelector('.home-hero-watch-row');

    for (const row of rows) {
        const a = row.anime;
        const href = `anime/view.html?id=${encodeURIComponent(a.id)}`;
        const gradient =
            typeof generateGradient === 'function'
                ? generateGradient(a.id)
                : 'linear-gradient(135deg, #6c5ce7, #a29bfe)';

        const card = document.createElement('div');
        card.className = 'home-hero-watch-card';
        card.dataset.animeId = String(a.id);
        card.setAttribute('role', 'listitem');

        const item = document.createElement('a');
        item.className = 'home-hero-watch-item';
        item.href = href;
        item.title = `${a.title || 'Аниме'} · серия ${row.episodeNumber}`;

        const posterWrap = document.createElement('span');
        posterWrap.className = 'home-hero-watch-poster';
        posterWrap.style.background = gradient;

        const posterImg = document.createElement('img');
        posterImg.className = 'home-hero-watch-poster-img';
        posterImg.alt = '';
        posterImg.decoding = 'async';
        posterImg.referrerPolicy = 'no-referrer';
        const knownPoster = a.posterUrl || '';
        if (knownPoster) posterImg.src = knownPoster;
        posterWrap.appendChild(posterImg);

        const epBadge = document.createElement('span');
        epBadge.className = 'home-hero-watch-ep-badge';
        const epNum = parseInt(row.episodeNumber, 10) || 1;
        epBadge.textContent = `${epNum} сер.`;
        epBadge.title = `Серия ${epNum}`;
        posterWrap.appendChild(epBadge);

        const needsCd =
            typeof reminkoAnimeNeedsEpisodeCountdown === 'function' &&
            reminkoAnimeNeedsEpisodeCountdown(a);
        if (needsCd) {
            const cd = document.createElement('span');
            cd.className = 'home-hero-watch-countdown';
            cd.setAttribute('aria-live', 'polite');
            posterWrap.appendChild(cd);
        }

        const title = document.createElement('span');
        title.className = 'home-hero-watch-title';
        title.textContent = a.title || 'Аниме';

        item.appendChild(posterWrap);
        item.appendChild(title);

        const malId = a.mal_id != null ? parseInt(a.mal_id, 10) : NaN;
        if (Number.isFinite(malId) && malId > 0 && typeof attachJikanPosterFallback === 'function') {
            attachJikanPosterFallback(posterImg, malId, a);
        } else if (!knownPoster) {
            void (async () => {
                const searchTitles =
                    typeof reminkoCollectPosterSearchTitles === 'function'
                        ? reminkoCollectPosterSearchTitles(a, malId)
                        : a.titleAlt
                          ? [a.titleAlt, a.title]
                          : [a.title];
                if (typeof getAnimePosterFast !== 'function') return;
                const url = await getAnimePosterFast(searchTitles);
                const ph = typeof POSTER_PLACEHOLDER !== 'undefined' ? POSTER_PLACEHOLDER : '';
                if (url && url !== ph && posterImg.isConnected) posterImg.src = url;
            })();
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'home-hero-watch-remove';
        removeBtn.setAttribute('aria-label', 'Убрать из истории');
        removeBtn.title = 'Убрать из истории';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof removeAnimeFromWatchHistory === 'function') {
                removeAnimeFromWatchHistory(a.id);
            }
        });

        card.appendChild(item);
        card.appendChild(removeBtn);
        rowEl.appendChild(card);
    }

    if (typeof reminkoEnhanceHorizontalDragScroll === 'function') {
        reminkoEnhanceHorizontalDragScroll(rowEl, { linkSelector: 'a.home-hero-watch-item' });
    }
    if (typeof initPosterObserver === 'function') initPosterObserver();
    void hydrateHeroPosterCountdowns(
        rows.map((r) => r.anime),
        '.home-hero-watch-card',
        'data-anime-id'
    );
}

/** Таймер до серии на постерах истории / избранного (онгоинги). */
async function hydrateHeroPosterCountdowns(animeList, cardSelector, idAttr) {
    if (!Array.isArray(animeList) || !animeList.length) return;
    if (typeof reminkoResolveAnimeCountdownIso !== 'function') return;
    if (typeof reminkoAnimeNeedsEpisodeCountdown !== 'function') return;

    for (const a of animeList) {
        if (!a || !reminkoAnimeNeedsEpisodeCountdown(a)) continue;
        const card = document.querySelector(
            `${cardSelector}[${idAttr}="${CSS.escape(String(a.id))}"]`
        );
        if (!card) continue;
        let countdownEl = card.querySelector('.home-hero-watch-countdown, .home-hero-fav-countdown');
        if (!countdownEl) {
            const poster = card.querySelector(
                '.home-hero-watch-poster, .home-hero-fav-poster'
            );
            if (!poster) continue;
            countdownEl = document.createElement('span');
            countdownEl.className =
                cardSelector.includes('fav')
                    ? 'home-hero-fav-countdown'
                    : 'home-hero-watch-countdown';
            countdownEl.setAttribute('aria-live', 'polite');
            poster.appendChild(countdownEl);
        }
        if (countdownEl.getAttribute('data-countdown-iso')) continue;

        const mal = a.mal_id != null ? parseInt(a.mal_id, 10) : NaN;
        let shiki = null;
        if (Number.isFinite(mal) && mal > 0 && window.shikimoriApi?.readCachedByMalId) {
            shiki = window.shikimoriApi.readCachedByMalId(mal);
        }

        let iso = reminkoResolveAnimeCountdownIso(a, shiki);
        if (!iso && Number.isFinite(mal) && mal > 0 && window.shikimoriApi?.enqueueFetchShikimoriByMalId) {
            try {
                shiki = await window.shikimoriApi.enqueueFetchShikimoriByMalId(
                    mal,
                    a.titleAlt || a.title || ''
                );
                iso = reminkoResolveAnimeCountdownIso(a, shiki);
            } catch (_) {
                /* ignore */
            }
        }

        if (iso && typeof reminkoApplyCompactCountdown === 'function') {
            reminkoApplyCompactCountdown(countdownEl, iso);
        }
    }
}

function loadRecentlyWatched() {
    loadHeroWatchHistory();
}

/** Избранное справа от истории в hero */
async function loadHeroFavorites() {
    const box = document.getElementById('heroFavorites');
    if (!box) return;

    const showEmpty = (text) => {
        box.hidden = false;
        box.innerHTML =
            '<p class="home-hero-favs-label">Избранное</p>' +
            `<p class="home-hero-favs-empty">${text}</p>`;
    };

    if (!(await homeHeroIsLoggedIn())) {
        showEmpty('Войдите в аккаунт — избранные тайтлы появятся здесь, и можно будет открывать их прямо с главной.');
        return;
    }

    try {
        if (typeof loadFavorites === 'function') {
            await loadFavorites();
        }
    } catch (_) {
        /* ignore */
    }

    const ids =
        typeof getFavoriteAnimeIds === 'function' ? getFavoriteAnimeIds() : [];
    if (!ids.length) {
        showEmpty('Добавляйте аниме в избранное — они появятся здесь для быстрого доступа.');
        return;
    }

    const rows = [];
    for (const id of ids) {
        const anime = typeof getAnimeById === 'function' ? getAnimeById(id) : null;
        if (!anime) continue;
        if (typeof filterAdultAnimeList === 'function' && !filterAdultAnimeList([anime]).length) {
            continue;
        }
        rows.push(anime);
        if (rows.length >= 12) break;
    }

    if (!rows.length) {
        showEmpty('В избранном есть записи, но тайтлы не найдены в каталоге.');
        return;
    }

    box.hidden = false;
    box.innerHTML =
        '<p class="home-hero-favs-label">Избранное</p>' +
        '<div class="home-hero-favs-row" tabindex="0" role="list" aria-label="Избранные аниме"></div>' +
        '<a class="home-hero-favs-more" href="favorites.html">Все избранное →</a>';
    const rowEl = box.querySelector('.home-hero-favs-row');

    for (const a of rows) {
        const href = `anime/view.html?id=${encodeURIComponent(a.id)}`;
        const gradient =
            typeof generateGradient === 'function'
                ? generateGradient(a.id)
                : 'linear-gradient(135deg, #6c5ce7, #a29bfe)';
        const card = document.createElement('a');
        card.className = 'home-hero-fav-card';
        card.href = href;
        card.title = a.title || 'Аниме';
        card.dataset.animeId = String(a.id);
        card.setAttribute('role', 'listitem');

        const poster = document.createElement('span');
        poster.className = 'home-hero-fav-poster';
        poster.style.background = gradient;

        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        const knownPoster = a.posterUrl || '';
        if (knownPoster) img.src = knownPoster;
        poster.appendChild(img);

        if (
            typeof reminkoAnimeNeedsEpisodeCountdown === 'function' &&
            reminkoAnimeNeedsEpisodeCountdown(a)
        ) {
            const cd = document.createElement('span');
            cd.className = 'home-hero-fav-countdown';
            cd.setAttribute('aria-live', 'polite');
            poster.appendChild(cd);
        }

        const title = document.createElement('span');
        title.className = 'home-hero-fav-title';
        title.textContent = a.title || 'Аниме';

        card.appendChild(poster);
        card.appendChild(title);
        rowEl.appendChild(card);

        const malId = a.mal_id != null ? parseInt(a.mal_id, 10) : NaN;
        if (Number.isFinite(malId) && malId > 0 && typeof attachJikanPosterFallback === 'function') {
            attachJikanPosterFallback(img, malId, a);
        } else if (!knownPoster) {
            void (async () => {
                const searchTitles =
                    typeof reminkoCollectPosterSearchTitles === 'function'
                        ? reminkoCollectPosterSearchTitles(a, malId)
                        : a.titleAlt
                          ? [a.titleAlt, a.title]
                          : [a.title];
                if (typeof getAnimePosterFast !== 'function') return;
                const url = await getAnimePosterFast(searchTitles);
                const ph = typeof POSTER_PLACEHOLDER !== 'undefined' ? POSTER_PLACEHOLDER : '';
                if (url && url !== ph && img.isConnected) img.src = url;
            })();
        }
    }

    if (typeof reminkoEnhanceHorizontalDragScroll === 'function') {
        reminkoEnhanceHorizontalDragScroll(rowEl, { linkSelector: 'a.home-hero-fav-card' });
    }
    if (typeof initPosterObserver === 'function') initPosterObserver();
    void hydrateHeroPosterCountdowns(rows, '.home-hero-fav-card', 'data-anime-id');
}

window.loadHeroFavorites = loadHeroFavorites;

// ==================== Локальные секции ====================

function loadTopRated() {
    const container = document.getElementById('topRatedGrid');
    if (!container) return;

    const all = animeDatabase.all;
    if (!all || all.length === 0) {
        container.innerHTML = '<div class="home-loading-placeholder">Каталог пуст</div>';
        return;
    }

    let sorted = all.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (typeof filterAdultAnimeList === 'function') {
        sorted = filterAdultAnimeList(sorted);
    }
    const top15 = sorted.slice(0, 15);

    container.innerHTML = '';
    top15.forEach(anime => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.dataset.id = anime.id;

        const gradient = typeof generateGradient === 'function' ? generateGradient(anime.id) : 'linear-gradient(135deg, #6c5ce7, #a29bfe)';
        const a = typeof initAnimeStats === 'function' ? initAnimeStats(anime) : anime;

        card.innerHTML = `
            <div class="anime-poster" style="background: ${gradient};">
                <div class="anime-year">${a.year || ''}</div>
                ${a.status ? `<div class="anime-status">${a.status}</div>` : ''}
            </div>
            <div class="anime-info">
                <h3 class="anime-title">${a.title}</h3>
                <div class="anime-meta">
                    <div class="anime-rating">${a.rating || 0}</div>
                    ${a.episodes ? `<div class="anime-episodes">${a.episodes} эп.</div>` : ''}
                </div>
                ${a.studio ? `<div class="anime-studio">${a.studio}</div>` : ''}
                ${a.genres ? `<div class="anime-genres">${a.genres.slice(0, 2).join(', ')}</div>` : ''}
            </div>
        `;

        card.onclick = () => {
            if (typeof openAnimePage === 'function') {
                openAnimePage(a.id);
            } else {
                sessionStorage.setItem('viewAnimeId', String(a.id));
                window.location.href = `anime/view.html?id=${a.id}`;
            }
        };

        if (typeof loadAnimePosterLazy === 'function') {
            const titles = a.titleAlt ? [a.titleAlt, a.title] : a.title;
            loadAnimePosterLazy(card, titles, gradient);
        }

        container.appendChild(card);
    });
}

async function loadFriendsWatching() {
    const section = document.getElementById('friendsWatchingSection');
    const grid = document.getElementById('friendsWatchingGrid');
    if (!section || !grid || !supabaseClient) return;

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user) return;
        const userId = session.user.id;

        if (typeof window.friendsService === 'undefined') return;

        const friends = await window.friendsService.getFriends(userId);
        if (!friends || friends.length === 0) return;

        const friendIds = friends
            .map(f => f.friend?.id || f.friendUserId || f.id)
            .filter(Boolean);
        const profiles =
            typeof reminkoFetchProfilesIn === 'function'
                ? await reminkoFetchProfilesIn(supabaseClient, friendIds)
                : (
                      await supabaseClient
                          .from('profiles')
                          .select('id, username, avatar, current_activity')
                          .in('id', friendIds)
                  ).data;

        if (!profiles || !profiles.length) return;

        const watchingAnimeIds = new Set();
        const cards = [];

        for (const p of profiles) {
            if (p.current_activity && p.current_activity.type === 'watching' && p.current_activity.animeId) {
                const aId = parseInt(p.current_activity.animeId);
                if (!watchingAnimeIds.has(aId)) {
                    watchingAnimeIds.add(aId);
                    const anime = typeof getAnimeById === 'function' ? getAnimeById(aId) : null;
                    if (anime) {
                        cards.push({ anime, friend: p, live: true });
                    }
                }
            }
        }

        if (cards.length === 0) return;

        section.style.display = 'block';
        grid.innerHTML = '';

        for (const info of cards) {
            const card = createAnimeCard(info.anime);
            const badge = document.createElement('div');
            badge.style.cssText = 'font-size:0.72rem;color:#22c55e;display:flex;align-items:center;gap:0.3rem;margin-bottom:0.3rem;';
            badge.innerHTML = `<img class="reminko-avatar-img" src="${info.friend.avatar || 'Fons/seitFon.jpg'}" alt="" width="18" height="18" style="width:18px;height:18px;border-radius:50%;object-fit:cover;object-position:center;flex-shrink:0;" decoding="async"> ${info.friend.username || ''} смотрит`;
            const infoEl = card.querySelector('.anime-info');
            if (infoEl) infoEl.prepend(badge);
            grid.appendChild(card);
        }
    } catch (e) {
        console.warn('[Home] Friends watching error:', e);
    }
}

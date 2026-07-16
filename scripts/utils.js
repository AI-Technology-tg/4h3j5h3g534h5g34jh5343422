// Общие функции для работы с аниме

/**
 * Кодирует сегменты пути (пробелы в «Creator ava.png», «1 b.jpg» и т.д.).
 */
function reminkoEncodeAssetPath(pathStr) {
    const raw = String(pathStr || '').replace(/\\/g, '/');
    return raw
        .split('/')
        .map((seg) => {
            if (!seg) return seg;
            try {
                return encodeURIComponent(decodeURIComponent(seg));
            } catch (_) {
                return encodeURIComponent(seg);
            }
        })
        .join('/');
}

/**
 * Путь к статике сайта (аватары Fons/...) с корня домена.
 * Убирает 404 вида /catalog/Fons/... при относительных путях на вложенных страницах.
 */
function reminkoResolveAssetUrl(url) {
    if (url == null || url === '') return reminkoEncodeAssetPath('/Fons/1 b.jpg');
    const s = String(url).trim();
    if (/^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
    const rel = s.startsWith('/') ? s.slice(1) : s.replace(/^\.\//, '').replace(/^\/+/, '');
    return '/' + reminkoEncodeAssetPath(rel);
}
window.reminkoResolveAssetUrl = reminkoResolveAssetUrl;

/** Узкий экран или мобильная вёрстка (≤900px). */
function reminkoIsMobileLayout() {
    try {
        if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) return true;
    } catch (_) {
        /* ignore */
    }
    return !!(
        document.documentElement &&
        document.documentElement.classList.contains('reminko-mobile-preview')
    );
}
window.reminkoIsMobileLayout = reminkoIsMobileLayout;

/** Jikan API: повтор при 429 и временных 502/503/504 (общий для всего сайта). */
const REMINKO_JIKAN_RETRY_STATUSES = new Set([429, 502, 503, 504]);
const REMINKO_JIKAN_MAX_ATTEMPTS = 3;
const REMINKO_JIKAN_CIRCUIT_MS = 2 * 60 * 1000;
const REMINKO_JIKAN_JSON_CACHE_MS = 45 * 60 * 1000;
const REMINKO_JIKAN_FETCH_TIMEOUT_MS = 12000;

const _reminkoJikanInflight = new Map();
const _reminkoJikanJsonCache = new Map();
let _reminkoJikanCircuitUntil = 0;

/** Kodik id (20M+mal) или Jikan-virtual (10M+mal) → MAL id */
function reminkoNormalizeMalId(raw) {
    let n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    if (n >= 20000000) return n - 20000000;
    if (n >= 10000000 && n < 20000000) return n - 10000000;
    return n;
}
window.reminkoNormalizeMalId = reminkoNormalizeMalId;

function reminkoJikanIsCircuitOpen() {
    return Date.now() < _reminkoJikanCircuitUntil;
}
window.reminkoJikanIsCircuitOpen = reminkoJikanIsCircuitOpen;

function reminkoJikanTripCircuit() {
    _reminkoJikanCircuitUntil = Date.now() + REMINKO_JIKAN_CIRCUIT_MS;
}
window.reminkoJikanTripCircuit = reminkoJikanTripCircuit;

function reminkoJikanCacheGet(url, allowStale) {
    const e = _reminkoJikanJsonCache.get(url);
    if (!e) return null;
    if (!allowStale && Date.now() - e.ts > REMINKO_JIKAN_JSON_CACHE_MS) {
        _reminkoJikanJsonCache.delete(url);
        return null;
    }
    return e.data;
}

function reminkoJikanCacheSet(url, data) {
    if (data == null) return;
    _reminkoJikanJsonCache.set(url, { data, ts: Date.now() });
}

function reminkoSleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/** fetch с таймаутом — не даёт странице зависнуть на «висящем» HTTP. */
async function reminkoFetchWithTimeout(url, opts, timeoutMs) {
    const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : REMINKO_JIKAN_FETCH_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...(opts || {}), signal: ctrl.signal, credentials: 'omit' });
    } finally {
        clearTimeout(timer);
    }
}
window.reminkoFetchWithTimeout = reminkoFetchWithTimeout;
window.reminkoSleep = reminkoSleep;

function reminkoJikanRetryDelayMs(status, attempt, retryAfterHeader) {
    const ra = parseInt(retryAfterHeader || '', 10);
    if (Number.isFinite(ra) && ra > 0) return ra * 1000;
    if (status === 429) return 4000 + attempt * 2500;
    return 2800 + attempt * 3200;
}

function reminkoJikanFetchError(status) {
    const err = new Error(
        status === 429
            ? 'Jikan rate limit'
            : status === 503
              ? 'Jikan temporarily unavailable'
              : `Jikan ${status}`
    );
    err.status = status;
    return err;
}

async function reminkoJikanFetchCore(url, attempt = 0) {
    let res;
    try {
        res = await reminkoFetchWithTimeout(url, {}, REMINKO_JIKAN_FETCH_TIMEOUT_MS);
    } catch (netErr) {
        if (attempt < REMINKO_JIKAN_MAX_ATTEMPTS - 1) {
            await reminkoSleep(reminkoJikanRetryDelayMs(503, attempt, ''));
            return reminkoJikanFetchCore(url, attempt + 1);
        }
        reminkoJikanTripCircuit();
        const stale = reminkoJikanCacheGet(url, true);
        if (stale) return stale;
        throw netErr;
    }

    if (!res.ok) {
        if (REMINKO_JIKAN_RETRY_STATUSES.has(res.status)) {
            reminkoJikanTripCircuit();
            const stale = reminkoJikanCacheGet(url, true);
            if (stale) return stale;
            if (attempt < REMINKO_JIKAN_MAX_ATTEMPTS - 1) {
                await reminkoSleep(reminkoJikanRetryDelayMs(res.status, attempt, res.headers.get('Retry-After')));
                return reminkoJikanFetchCore(url, attempt + 1);
            }
        }
        throw reminkoJikanFetchError(res.status);
    }

    const data = await res.json();
    reminkoJikanCacheSet(url, data);
    return data;
}

async function reminkoJikanFetch(url) {
    const fresh = reminkoJikanCacheGet(url, false);
    if (fresh) return fresh;

    if (reminkoJikanIsCircuitOpen()) {
        const stale = reminkoJikanCacheGet(url, true);
        if (stale) return stale;
        throw reminkoJikanFetchError(503);
    }

    if (_reminkoJikanInflight.has(url)) {
        return _reminkoJikanInflight.get(url);
    }

    const promise = reminkoJikanFetchCore(url).finally(() => {
        _reminkoJikanInflight.delete(url);
    });
    _reminkoJikanInflight.set(url, promise);
    return promise;
}
window.reminkoJikanFetch = reminkoJikanFetch;

function reminkoLockDragScrollLinks(root, linkSel) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(linkSel).forEach((el) => {
        el.setAttribute('draggable', 'false');
    });
}

/** Горизонтальная лента: перетаскивание мышью / пальцем (как на главной, без автопрокрутки). */
function reminkoEnhanceHorizontalDragScroll(container, opts) {
    if (!container || container._reminkoDragScrollBound) return;
    container._reminkoDragScrollBound = true;

    const dragPx = (opts && opts.dragPx) || 22;
    const tapMaxMs = (opts && opts.tapMaxMs) || 380;
    const linkSel = (opts && opts.linkSelector) || 'a';
    const goBtnSel = (opts && opts.goBtnSelector) || '';

    reminkoLockDragScrollLinks(container, linkSel);

    let drag = false;
    let dragged = false;
    let captureApplied = false;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let activePointer = null;
    let pointerDownAt = 0;
    let maxAbsDx = 0;

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (goBtnSel && e.target.closest(goBtnSel)) return;
        delete container.dataset.suppressDragClick;
        drag = true;
        dragged = false;
        captureApplied = false;
        pointerDownAt = Date.now();
        maxAbsDx = 0;
        startX = e.clientX;
        startY = e.clientY;
        startScroll = container.scrollLeft;
        activePointer = e.pointerId;
    }

    function onPointerMove(e) {
        if (!drag || e.pointerId !== activePointer) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (
            typeof reminkoIsMobileLayout === 'function' &&
            reminkoIsMobileLayout() &&
            Math.abs(dy) > Math.abs(dx) + 6
        ) {
            drag = false;
            captureApplied = false;
            activePointer = null;
            container.classList.remove('is-dragging');
            return;
        }
        maxAbsDx = Math.max(maxAbsDx, Math.abs(dx));
        if (!captureApplied && Math.abs(dx) > dragPx) {
            captureApplied = true;
            dragged = true;
            container.classList.add('is-dragging');
            try {
                container.setPointerCapture(e.pointerId);
            } catch (_) {
                /* ignore */
            }
        }
        if (Math.abs(dx) > dragPx) {
            dragged = true;
            container.classList.add('is-dragging');
            e.preventDefault();
            container.scrollLeft = startScroll - dx;
        }
    }

    function onPointerEnd(e) {
        if (!drag || e.pointerId !== activePointer) return;
        drag = false;
        container.classList.remove('is-dragging');
        if (captureApplied) {
            try {
                container.releasePointerCapture(e.pointerId);
            } catch (_) {
                /* ignore */
            }
        }
        captureApplied = false;
        activePointer = null;
        const tapLike = Date.now() - pointerDownAt < tapMaxMs && maxAbsDx <= dragPx;
        if (tapLike) dragged = false;
        if (dragged) container.dataset.suppressDragClick = '1';
    }

    function onDragStart(e) {
        e.preventDefault();
    }

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove, { passive: false });
    container.addEventListener('pointerup', onPointerEnd);
    container.addEventListener('pointercancel', onPointerEnd);
    container.addEventListener('dragstart', onDragStart, true);

    container.addEventListener(
        'click',
        (e) => {
            if (container.dataset.suppressDragClick !== '1') return;
            if (goBtnSel && e.target.closest(goBtnSel)) {
                delete container.dataset.suppressDragClick;
                return;
            }
            if (e.target.closest(linkSel)) {
                e.preventDefault();
                e.stopPropagation();
            }
            delete container.dataset.suppressDragClick;
        },
        true
    );

    if (typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver(() => reminkoLockDragScrollLinks(container, linkSel));
        obs.observe(container, { childList: true, subtree: true });
        container._reminkoDragScrollObserver = obs;
    }
}
window.reminkoEnhanceHorizontalDragScroll = reminkoEnhanceHorizontalDragScroll;
window.reminkoLockDragScrollLinks = reminkoLockDragScrollLinks;

function reminkoIsProfileSelectColumnError(error) {
    if (!error) return false;
    const msg = String(error.message || error.details || error.hint || '').toLowerCase();
    const code = String(error.code || '');
    return (
        code === '42703' ||
        code === 'PGRST204' ||
        msg.includes('column') ||
        msg.includes('does not exist') ||
        msg.includes('is_banned') ||
        msg.includes('ban_reason') ||
        msg.includes('is_site_creator') ||
        msg.includes('schema cache')
    );
}

/** Профиль текущего пользователя — цепочка select при отсутствии колонок (is_banned, ban_reason). */
async function reminkoFetchOwnProfile(supabaseClient, userId) {
    if (!supabaseClient || !userId) return { profile: null, error: { message: 'no client' } };
    const chains = [
        'username, avatar, gender, is_banned, ban_reason, is_site_creator',
        'username, avatar, gender, is_banned, is_site_creator',
        'username, avatar, gender, is_site_creator',
        'username, avatar, gender'
    ];
    let lastErr = null;
    for (const sel of chains) {
        const { data, error } = await supabaseClient.from('profiles').select(sel).eq('id', userId).maybeSingle();
        if (!error) return { profile: data, error: null };
        lastErr = error;
        if (!reminkoIsProfileSelectColumnError(error)) break;
    }
    return { profile: null, error: lastErr };
}
window.reminkoFetchOwnProfile = reminkoFetchOwnProfile;

/** Создатель сайта (синхронно из кэша сессии). */
function reminkoIsSiteCreatorView() {
    try {
        const raw = sessionStorage.getItem('currentUser');
        if (raw) {
            const u = JSON.parse(raw);
            if (reminkoIsSiteCreatorProfile(u)) return true;
        }
    } catch (_) {
        /* ignore */
    }
    return false;
}
window.reminkoIsSiteCreatorView = reminkoIsSiteCreatorView;

/** Обёртка dev-текста: видна только создателю, с пометкой «скрыто от пользователей». */
function reminkoWrapDevOnlyHtml(html, badgeLabel) {
    const label = badgeLabel || 'Скрыто от пользователей';
    return (
        `<div class="reminko-dev-only" data-hidden-from-users="1">` +
        `<span class="reminko-dev-only__badge" title="Обычные пользователи этого не видят">${label}</span>` +
        `<div class="reminko-dev-only__body">${html}</div></div>`
    );
}
window.reminkoWrapDevOnlyHtml = reminkoWrapDevOnlyHtml;

function reminkoDevOnlySetElement(el, html, badgeLabel) {
    if (!el) return;
    const isCreator = reminkoIsSiteCreatorView();
    if (!isCreator) {
        el.hidden = true;
        el.textContent = '';
        el.innerHTML = '';
        return;
    }
    el.hidden = false;
    el.classList.add('reminko-dev-only-host');
    el.innerHTML = reminkoWrapDevOnlyHtml(html, badgeLabel);
}
window.reminkoDevOnlySetElement = reminkoDevOnlySetElement;

/** Профили по списку id — цепочка select при отсутствии колонок в Supabase */
async function reminkoFetchProfilesIn(supabaseClient, userIds) {
    if (!supabaseClient || !userIds || !userIds.length) return [];
    const ids = [...new Set(userIds.filter(Boolean))];
    const chains = [
        'id, username, avatar, last_online, current_activity, is_site_creator',
        'id, username, avatar, last_online, current_activity',
        'id, username, avatar, last_online',
        'id, username, avatar'
    ];
    for (const sel of chains) {
        const { data, error } = await supabaseClient.from('profiles').select(sel).in('id', ids);
        if (!error) return data || [];
        if (!reminkoIsProfileSelectColumnError(error)) break;
    }
    return [];
}
window.reminkoFetchProfilesIn = reminkoFetchProfilesIn;

/** UUID создателя: config → is_site_creator → ник dubina */
async function reminkoResolveSiteCreatorUserId(supabaseClient) {
    const cfg =
        typeof window !== 'undefined' &&
        window.APP_CONFIG &&
        typeof window.APP_CONFIG.siteCreatorUserId === 'string' &&
        window.APP_CONFIG.siteCreatorUserId.trim();
    if (cfg && /^[0-9a-f-]{36}$/i.test(cfg)) return cfg.trim();
    if (!supabaseClient) return null;
    try {
        const flagged = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('is_site_creator', true)
            .limit(1)
            .maybeSingle();
        if (!flagged.error && flagged.data?.id) return flagged.data.id;
    } catch (_) { /* колонка может отсутствовать */ }
    for (const pattern of ['dubina', '%dubina%']) {
        try {
            const q =
                pattern.includes('%')
                    ? supabaseClient.from('profiles').select('id').ilike('username', pattern).limit(1)
                    : supabaseClient.from('profiles').select('id').eq('username', pattern).limit(1);
            const { data, error } = await q.maybeSingle();
            if (!error && data?.id) return data.id;
        } catch (_) { /* noop */ }
    }
    return null;
}
window.reminkoResolveSiteCreatorUserId = reminkoResolveSiteCreatorUserId;

/** Async-проверка UUID создателя (для ЛС, профиля, друзей). */
async function userIdIsSiteCreator(userId) {
    if (!userId) return false;
    if (typeof reminkoUserIdIsSiteCreatorSync === 'function' && reminkoUserIdIsSiteCreatorSync(userId)) {
        return true;
    }
    if (typeof reminkoIsSiteCreatorProfile === 'function' && reminkoIsSiteCreatorProfile({ id: userId })) {
        return true;
    }
    if (typeof reminkoResolveSiteCreatorUserId === 'function' && typeof supabaseClient !== 'undefined') {
        try {
            const cid = await reminkoResolveSiteCreatorUserId(supabaseClient);
            if (cid && String(cid).toLowerCase() === String(userId).trim().toLowerCase()) {
                if (typeof window !== 'undefined') window.__reminkoSiteCreatorUserId = cid;
                return true;
            }
        } catch (_) {
            /* ignore */
        }
    }
    return false;
}
window.userIdIsSiteCreator = userIdIsSiteCreator;

// Генерация градиента для постера
function generateGradient(id) {
    const hue1 = (id * 137.508) % 360; // Золотой угол для распределения цветов
    const hue2 = (hue1 + 60) % 360;
    return `linear-gradient(135deg, 
        hsl(${hue1}, 70%, 50%), 
        hsl(${hue2}, 70%, 60%))`;
}

// Создание карточки аниме
function createAnimeCard(anime, clickHandler) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.dataset.id = anime.id;
    if (anime.mal_id != null && anime.mal_id !== '') {
        card.dataset.malId = String(anime.mal_id);
    }
    
    // Получаем статистику если функция доступна (виртуальные тайтлы с главной — без локальной статистики)
    let stats = anime;
    if (!anime.isJikanVirtual && typeof getAnimeStats === 'function') {
        const animeStats = getAnimeStats(anime.id);
        if (animeStats) {
            stats = { ...anime, ...animeStats };
        } else if (typeof initAnimeStats === 'function') {
            stats = initAnimeStats(anime);
        }
    }
    
    const gradient = generateGradient(anime.id);
    const posterUrl = stats.posterUrl || anime.posterUrl || null;
    const posterSafe = posterUrl ? String(posterUrl).replace(/'/g, "\\'") : '';

    // Постер: только url() — иначе градиент сверху перекрывал картинку
    const posterStyle = posterSafe
        ? `background-image:url('${posterSafe}');background-size:cover;background-position:center;`
        : `background:${gradient};`;
    
    const seoHref = anime.isAnime4k
        ? reminkoContentViewUrl('anime4k', anime.id)
        : reminkoContentViewUrl('anime', anime.id);

    const needsCountdown =
        typeof reminkoAnimeNeedsEpisodeCountdown === 'function'
            ? reminkoAnimeNeedsEpisodeCountdown(anime)
            : anime.status === 'Онгоинг' && anime.type !== 'Фильм';

    card.innerHTML = `
        <a class="anime-card-seo-link" href="${seoHref}" tabindex="-1" aria-hidden="true">${stats.title}</a>
        <div class="anime-poster" style="${posterStyle}">
            <div class="anime-poster-hover" aria-hidden="true">
                <button type="button" class="anime-poster-go-btn">Перейти</button>
            </div>
            <div class="anime-year">${stats.year}</div>
            ${stats.status ? `<div class="anime-status">${stats.status}</div>` : ''}
            ${needsCountdown ? '<div class="anime-poster-countdown" data-countdown-slot aria-live="polite" hidden></div>' : ''}
        </div>
        <div class="anime-info">
            <h3 class="anime-title">${stats.title}</h3>
            <div class="anime-meta">
                <div class="anime-rating">
                    ⭐ ${stats.rating || anime.rating || 0}
                    ${stats.ratingCount ? `<span class="rating-count">(${formatNumber(stats.ratingCount)})</span>` : ''}
                </div>
                ${stats.episodes ? `<div class="anime-episodes">${stats.episodes}</div>` : ''}
                ${stats.duration ? `<div class="anime-episodes">${stats.duration}</div>` : ''}
            </div>
            <div class="anime-stats">
                ${stats.views ? `<span class="stat-item">👁 ${formatNumber(stats.views)}</span>` : ''}
                ${stats.favoritesCount ? `<span class="stat-item">❤️ ${formatNumber(stats.favoritesCount)}</span>` : ''}
            </div>
            ${stats.genres ? `<div class="anime-genres">${stats.genres.slice(0, 2).join(', ')}</div>` : ''}
        </div>
    `;

    const navigateAnimeCard = () => {
        if (clickHandler) {
            clickHandler(anime);
            return;
        }
        if (anime.isJikanVirtual && anime._jikanRaw) {
            try {
                sessionStorage.setItem('jikanAnimeData', JSON.stringify(anime._jikanRaw));
            } catch (_) {
                /* ignore */
            }
        }
        if (anime.isAnime4k && typeof openAnime4kPage === 'function') {
            openAnime4kPage(anime.id);
            return;
        }
        if (typeof openAnimePage === 'function') {
            openAnimePage(anime.id);
        } else {
            sessionStorage.setItem('viewAnimeId', String(anime.id));
            sessionStorage.setItem('previousUrl', window.location.href);
            const path =
                window.location.pathname.includes('/catalog/') ||
                window.location.pathname.includes('/anime/') ||
                window.location.pathname.includes('/manga/')
                    ? '../anime/view.html'
                    : 'anime/view.html';
            window.location.href = `${path}?id=${encodeURIComponent(String(anime.id))}`;
        }
    };

    card.addEventListener('click', navigateAnimeCard);
    const goBtn = card.querySelector('.anime-poster-go-btn');
    if (goBtn) {
        goBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigateAnimeCard();
        });
    }

    // Загружаем постер из API с lazy loading, если его еще нет
    if (!posterUrl && !anime.isJikanVirtual && typeof getAnimePoster === 'function' && stats.title) {
        // Пробуем оба названия (сначала titleAlt для API, потом title)
        const searchTitles = stats.titleAlt ? [stats.titleAlt, stats.title] : stats.title;
        card.dataset.posterDisplayTitle = stats.title;
        loadAnimePosterLazy(card, searchTitles, gradient);
    }
    
    return card;
}

// Lazy loading для постеров аниме и других изображений
let posterObserver = null;
let imageObserver = null;

// Инициализация Intersection Observer для lazy loading постеров
function initPosterObserver() {
    if (posterObserver) return;
    
    // Создаем Observer только если он поддерживается
    if ('IntersectionObserver' in window) {
        posterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const card = entry.target.closest('.anime-card, .manga-card, .wt-anime-pick');
                    if (card && card.dataset.posterNeedsLoad) {
                        let title = card.dataset.posterTitle;
                        // Парсим JSON если это массив
                        try {
                            title = JSON.parse(title);
                        } catch (e) {
                            // Не массив, оставляем как строку
                        }
                        const gradient = card.dataset.posterGradient || '';
                        
                        // Загружаем постер
                        loadAnimePosterAsync(card, title, gradient);
                        
                        // Удаляем из наблюдения
                        posterObserver.unobserve(entry.target);
                        delete card.dataset.posterNeedsLoad;
                    }
                }
            });
        }, {
            rootMargin: '600px'
        });
    }
}

// Инициализация Intersection Observer для обычных изображений
function initImageObserver() {
    if (imageObserver) return;
    
    if ('IntersectionObserver' in window) {
        imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.dataset.src || img.dataset.lazySrc;
                    
                    if (src) {
                        // Создаем новый Image для предзагрузки
                        const imageLoader = new Image();
                        imageLoader.onload = () => {
                            img.src = src;
                            img.classList.add('lazy-loaded');
                            img.removeAttribute('data-src');
                            img.removeAttribute('data-lazy-src');
                        };
                        imageLoader.onerror = () => {
                            img.classList.add('lazy-error');
                        };
                        imageLoader.src = src;
                    }
                    
                    // Удаляем из наблюдения
                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px'
        });
    }
}

// Инициализация lazy loading для всех изображений на странице
function initLazyLoading() {
    initPosterObserver();
    initImageObserver();
    
    // Находим все изображения с data-src или data-lazy-src
    if (imageObserver) {
        document.querySelectorAll('img[data-src], img[data-lazy-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }
    
    // Находим все изображения с loading="lazy" (нативная поддержка)
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
        // Браузер сам обработает, но можем добавить fallback
        if (!('loading' in HTMLImageElement.prototype)) {
            // Fallback для старых браузеров
            if (imageObserver) {
                imageObserver.observe(img);
            }
        }
    });
}

// Асинхронная загрузка постера для карточки с lazy loading
async function loadAnimePosterAsync(card, title, fallbackGradient) {
    if (!card || !title) return;
    
    const posterElement = card.querySelector('.anime-poster');
    if (!posterElement) return;
    
    try {
        let posterUrl = null;
        const contentType = card.dataset.contentType || 'anime';
        
        // Определяем названия для поиска (может быть массив или строка)
        const searchTitle = Array.isArray(title) ? title[0] : title;
        
        // Приоритет 1: Новый быстрый API (параллельные запросы к Kitsu, AniList, Jikan)
        if (typeof getPosterFast === 'function') {
            posterUrl = await getPosterFast(searchTitle, contentType);
        }
        // Приоритет 2: Старый Jikan API
        else if (typeof getAnimeDetails === 'function') {
            const searchTitles = Array.isArray(title) ? title : [title];
            
            for (const st of searchTitles) {
                if (!st) continue;
                try {
                    const details = contentType === 'manga' 
                        ? await getMangaDetails(st)
                        : await getAnimeDetails(st);
                    posterUrl = details?.poster || details?.cover || null;
                    if (posterUrl) break;
                } catch (e) {
                    continue;
                }
            }
        }
        // Приоритет 3: Заглушка
        else if (typeof getAnimePoster === 'function') {
            posterUrl = await getAnimePoster(title, {});
        }
        
        if (posterUrl && !posterUrl.startsWith('data:image/svg+xml')) {
            // Плавная смена градиента на изображение с предзагрузкой
            const img = new Image();
            
            img.onload = () => {
                posterElement.style.backgroundImage = `url('${posterUrl}')`;
                posterElement.style.backgroundSize = 'cover';
                posterElement.style.backgroundPosition = 'center';
                posterElement.classList.add('poster-loaded');
            };
            
            img.onerror = () => {
                posterElement.classList.add('poster-error');
            };
            
            img.src = posterUrl;
        } else {
            posterElement.classList.add('poster-placeholder');
        }
    } catch (error) {
        posterElement.classList.add('poster-error');
    }
}

// Загрузка постера с lazy loading (использует Intersection Observer)
function loadAnimePosterLazy(card, title, fallbackGradient) {
    const posterElement = card.querySelector('.anime-poster');
    if (!posterElement) return;
    
    // Инициализируем Observer если еще не создан
    initPosterObserver();
    
    // Сохраняем данные для загрузки
    card.dataset.posterNeedsLoad = 'true';
    card.dataset.posterTitle = Array.isArray(title) ? JSON.stringify(title) : title;
    card.dataset.posterGradient = fallbackGradient;
    if (!card.dataset.posterDisplayTitle) {
        card.dataset.posterDisplayTitle = Array.isArray(title) ? title[0] || title : title;
    }
    
    // Если Observer не поддерживается, загружаем сразу
    if (!posterObserver) {
        loadAnimePosterAsync(card, title, fallbackGradient);
        return;
    }
    
    // Начинаем наблюдение за элементом
    posterObserver.observe(posterElement);
}

/** URL страницы тайтла с ?id= для SEO и навигации */
function reminkoContentViewUrl(kind, contentId) {
    const prefix = typeof reminkoGetHtmlBasePath === 'function' ? reminkoGetHtmlBasePath() : '';
    const id = contentId != null && String(contentId).trim() !== '' ? String(contentId) : '';
    const is4k =
        kind === 'anime4k' ||
        (typeof window.Anime4kCatalogStore?.isAnime4kId === 'function' &&
            window.Anime4kCatalogStore.isAnime4kId(id));
    const page = kind === 'manga' ? 'manga/view.html' : is4k ? 'anime/view-4k.html' : 'anime/view.html';
    return id ? `${prefix}${page}?id=${encodeURIComponent(id)}` : `${prefix}${page}`;
}

// Открыть страницу аниме
function openAnimePage(animeId) {
    sessionStorage.setItem('viewAnimeId', String(animeId));
    sessionStorage.setItem('previousUrl', window.location.href);
    sessionStorage.setItem('scrollPosition', window.scrollY.toString());
    window.location.href = reminkoContentViewUrl('anime', animeId);
}

// Получить параметры из URL
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        search: params.get('search') || '',
        genre: params.getAll('genre') || [],
        type: params.get('type') || '',
        status: params.get('status') || '',
        yearFrom: params.get('yearFrom') || '',
        yearTo: params.get('yearTo') || '',
        ratingMin: params.get('ratingMin') || '',
        sort: params.get('sort') || 'rating-desc'
    };
}

// Установить параметры URL
function setUrlParams(params) {
    const url = new URL(window.location);
    Object.keys(params).forEach(key => {
        if (params[key]) {
            if (Array.isArray(params[key])) {
                url.searchParams.delete(key);
                params[key].forEach(value => url.searchParams.append(key, value));
            } else {
                url.searchParams.set(key, params[key]);
            }
        } else {
            url.searchParams.delete(key);
        }
    });
    window.history.pushState({}, '', url);
}

// Форматирование числа
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Показать карточки порциями с анимацией появления (по 3 за раз).
 * @param {HTMLElement} container - контейнер (сетка)
 * @param {Array} items - массив элементов (аниме/манга)
 * @param {Function} createCardFn - функция (item) => HTMLElement
 * @param {Object} options - { batchSize: 3, batchDelayMs: 450, staggerMs: 80 }
 */
// Глобальный флаг для предотвращения параллельных вызовов appendCardsInBatches
let isAppendingCards = false;

function appendCardsInBatches(container, items, createCardFn, options) {
    if (!container || !items || items.length === 0) return;
    
    // Предотвращаем параллельные вызовы
    if (isAppendingCards) {
        console.warn('[Utils] appendCardsInBatches уже выполняется, пропускаем вызов');
        return;
    }
    
    isAppendingCards = true;
    const opts = Object.assign({ batchSize: 3, batchDelayMs: 450, staggerMs: 80 }, options || {});
    
    // Очищаем контейнер перед добавлением
    container.innerHTML = '';
    
    // Удаляем дубликаты по ID перед добавлением (дополнительная защита)
    const seenIds = new Set();
    const uniqueItems = [];
    for (const item of items) {
        const id = item.id ? parseInt(item.id) : null;
        if (id && !seenIds.has(id)) {
            seenIds.add(id);
            uniqueItems.push(item);
        } else if (!id) {
            // Если нет ID, добавляем все равно (может быть новый элемент)
            uniqueItems.push(item);
        }
    }
    
    // Дополнительная проверка: удаляем дубликаты по dataset.id в уже существующих карточках
    const existingIds = new Set();
    if (container.children.length > 0) {
        Array.from(container.children).forEach(child => {
            const existingId = child.dataset.id ? parseInt(child.dataset.id) : null;
            if (existingId) existingIds.add(existingId);
        });
    }
    
    // Фильтруем элементы, которые уже есть в DOM
    const finalItems = uniqueItems.filter(item => {
        const id = item.id ? parseInt(item.id) : null;
        return !id || !existingIds.has(id);
    });

    (function runBatch(index) {
        if (index >= finalItems.length) {
            isAppendingCards = false;
            return;
        }
        const batch = finalItems.slice(index, index + opts.batchSize);
        const cards = batch.map(item => createCardFn(item));
        
        // Проверяем дубликаты перед добавлением в DOM
        const batchIds = new Set();
        cards.forEach(card => {
            const cardId = card.dataset.id ? parseInt(card.dataset.id) : null;
            if (cardId && !batchIds.has(cardId)) {
                batchIds.add(cardId);
                card.classList.add('card-enter');
                container.appendChild(card);
            }
        });
        
        cards.forEach((card, j) => {
            setTimeout(() => card.classList.add('card-enter-visible'), j * opts.staggerMs);
        });
        const nextIndex = index + opts.batchSize;
        const delay = opts.batchDelayMs + batch.length * opts.staggerMs;
        setTimeout(() => runBatch(nextIndex), delay);
    })(0);
}

// Открыть страницу манги (глобальная функция для использования в профиле)
function openMangaPage(mangaId) {
    sessionStorage.setItem('viewMangaId', String(mangaId));
    sessionStorage.setItem('previousUrl', window.location.href);
    sessionStorage.setItem('scrollPosition', window.scrollY.toString());
    window.location.href = reminkoContentViewUrl('manga', mangaId);
}

/** Статичный запасной аватар Создателя, если в профиле нет своей картинки. */
const REMINKO_CREATOR_AVATAR_REL = 'Fons/Creator ava.png';

/** Синхронно: UUID совпадает с создателем (config / кэш страницы). */
function reminkoUserIdIsSiteCreatorSync(userId) {
    if (!userId) return false;
    const id = String(userId).trim().toLowerCase();
    const cfg =
        typeof window !== 'undefined' &&
        window.APP_CONFIG &&
        typeof window.APP_CONFIG.siteCreatorUserId === 'string' &&
        window.APP_CONFIG.siteCreatorUserId.trim();
    if (cfg && cfg.trim().toLowerCase() === id) return true;
    const cached =
        typeof window !== 'undefined' && window.__reminkoSiteCreatorUserId
            ? String(window.__reminkoSiteCreatorUserId).trim().toLowerCase()
            : '';
    return !!(cached && cached === id);
}
window.reminkoUserIdIsSiteCreatorSync = reminkoUserIdIsSiteCreatorSync;

/**
 * Создатель сайта: флаг профиля, UUID, ник dubina/creator или e-mail.
 * @param {{ id?: string, username?: string, email?: string, isSiteCreator?: boolean, is_site_creator?: boolean }|null|undefined} p
 */
function reminkoIsSiteCreatorProfile(p) {
    if (!p) return false;
    if (p.isSiteCreator === true || p.is_site_creator === true) return true;
    if (p.id && reminkoUserIdIsSiteCreatorSync(p.id)) return true;
    const u = String(p.username || '')
        .toLowerCase()
        .trim();
    if (u === 'creator' || u === 'creator@reminko.com' || u === 'dubina' || u === 'subarik') return true;
    if (p.email && String(p.email).toLowerCase() === 'creator@reminko.com') return true;
    return false;
}

/** Подготовка профиля для аватара в чатах и ЛС. */
function reminkoProfileForAvatar(p, userId) {
    const base = p && typeof p === 'object' ? { ...p } : {};
    if (userId != null && !base.id) base.id = userId;
    const isCreator =
        reminkoIsSiteCreatorProfile(base) ||
        (userId != null && reminkoUserIdIsSiteCreatorSync(userId));
    if (isCreator) {
        base.is_site_creator = true;
        base.isSiteCreator = true;
    }
    return base;
}
window.reminkoProfileForAvatar = reminkoProfileForAvatar;

function reminkoCreatorAvatarUrl() {
    return reminkoResolveAssetUrl(REMINKO_CREATOR_AVATAR_REL);
}

/**
 * URL картинки для аватара в списках. Сначала avatar из профиля; для Создателя без своей картинки — запасной файл.
 * @param {{ username?: string, avatar?: string, email?: string, isSiteCreator?: boolean, is_site_creator?: boolean }|null|undefined} p
 * @returns {string|null}
 */
function reminkoProfileAvatarImageUrl(p) {
    if (!p) return null;
    const a = p.avatar && String(p.avatar).trim();
    if (a) {
        if (/^https?:\/\//i.test(a) || a.startsWith('data:') || a.startsWith('blob:')) return a;
        return reminkoResolveAssetUrl(a);
    }
    if (reminkoIsSiteCreatorProfile(p)) return reminkoCreatorAvatarUrl();
    return null;
}

/**
 * URL для <img> когда нужен запасной плейсхолдер (поиск друзей и т.д.).
 * @param {{ username?: string, avatar?: string, email?: string, isSiteCreator?: boolean, is_site_creator?: boolean }|null|undefined} p
 * @param {string} [placeholderRel] — например Fons/seitFon.jpg
 */
function reminkoProfileListAvatarSrc(p, placeholderRel) {
    const normalized =
        typeof reminkoProfileForAvatar === 'function' && p
            ? reminkoProfileForAvatar(p, p.id)
            : p;
    const fromProfile = reminkoProfileAvatarImageUrl(normalized);
    if (fromProfile) return fromProfile;
    return reminkoResolveAssetUrl(placeholderRel || 'Fons/seitFon.jpg');
}

/** Нормализация ника для проверки «служебных» имён (без пробелов и знаков). */
function reminkoNormalizeUsernameForGuard(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z\u0430-\u044f\u04510-9]/gi, '');
}

const REMINKO_RESERVED_USERNAME_FRAGMENTS = [
    'создател',
    'creator',
    'subarik',
    'dubina',
    'админ',
    'admin',
    'administrator',
    'модера',
    'moderator',
    'moder',
    'модер',
    'разработ',
    'developer',
    'devteam',
    'devops',
    'программист',
    'tester',
    'тестер',
    'betatest',
    'owner',
    'владел',
    'official',
    'официал',
    'support',
    'поддерж',
    'саппорт',
    'staff',
    'персонал',
    'спонсор',
    'sponsor',
    'promoter',
    'пиар',
    'reminko',
    'создательсайта',
    'sitecreator',
    'teamlead',
    'техподдерж'
];

/**
 * Запрет «служебных» ников для обычных пользователей.
 * @param {string} username
 * @param {{ allowStaff?: boolean }} [options] — true для создателя при выдаче ролей
 * @returns {{ ok: boolean, message?: string }}
 */
function reminkoValidatePublicUsername(username, options) {
    const opts = options && typeof options === 'object' ? options : {};
    if (opts.allowStaff) return { ok: true };
    const raw = String(username || '').trim();
    if (raw.length < 3) {
        return { ok: false, message: 'Имя должно быть не короче 3 символов.' };
    }
    const norm = reminkoNormalizeUsernameForGuard(raw);
    if (!norm) return { ok: true };
    for (const frag of REMINKO_RESERVED_USERNAME_FRAGMENTS) {
        if (norm.includes(frag)) {
            return {
                ok: false,
                message:
                    'Такой ник звучит как должность команды сайта — без самовыдвижения 😄 Выбери имя, которое не похоже на разработчика, модератора, админа или другую роль проекта.'
            };
        }
    }
    return { ok: true };
}
window.reminkoValidatePublicUsername = reminkoValidatePublicUsername;

/**
 * Ссылка на messages.html с учётом вложенных путей (/anime/, /catalog/, …).
 * @param {string} [userId]
 * @param {{ creator?: boolean }} [params]
 */
function reminkoMessagesLink(userId, params) {
    const q = new URLSearchParams();
    if (userId) q.set('user', String(userId));
    if (params && params.creator) q.set('creator', '1');
    const qs = q.toString();
    const rel = 'messages.html' + (qs ? '?' + qs : '');
    if (typeof globalThis !== 'undefined' && globalThis.location) {
        const loc = globalThis.location;
        if (loc.origin && !String(loc.protocol).startsWith('file')) {
            return '/' + rel.replace(/^\//, '');
        }
        const depth =
            loc.pathname && loc.pathname.includes('/')
                ? (loc.pathname.replace(/\\/g, '/').match(/\//g) || []).length - 1
                : 0;
        if (depth > 0) return '../'.repeat(depth) + rel;
    }
    return rel;
}
window.reminkoMessagesLink = reminkoMessagesLink;

// Экспорт функций
window.reminkoContentViewUrl = reminkoContentViewUrl;
window.openAnimePage = openAnimePage;
window.openMangaPage = openMangaPage;
window.initLazyLoading = initLazyLoading;
window.initImageObserver = initImageObserver;
window.initPosterObserver = initPosterObserver;
window.loadAnimePosterLazy = loadAnimePosterLazy;
window.loadAnimePosterAsync = loadAnimePosterAsync;
window.appendCardsInBatches = appendCardsInBatches;
window.createAnimeCard = createAnimeCard;
window.generateGradient = generateGradient;
window.formatNumber = formatNumber;
/**
 * Относительный префикс к корню сайта для HTML-страниц (как у NavigationManager.getBasePath):
 * `../` только из вложенных /catalog/, /anime/, /manga/.
 */
function reminkoGetHtmlBasePath() {
    const path = window.location && window.location.pathname ? window.location.pathname : '';
    if (path.includes('/catalog/') || path.includes('/anime/') || path.includes('/manga/')) {
        return '../';
    }
    return '';
}

window.reminkoGetHtmlBasePath = reminkoGetHtmlBasePath;
window.reminkoIsSiteCreatorProfile = reminkoIsSiteCreatorProfile;
window.reminkoCreatorAvatarUrl = reminkoCreatorAvatarUrl;
window.reminkoProfileAvatarImageUrl = reminkoProfileAvatarImageUrl;
window.reminkoProfileListAvatarSrc = reminkoProfileListAvatarSrc;

/**
 * Колесо над вложенной панелью (фильтры, сайдбар, модалки…) не «пробрасывает» скролл на страницу
 * при достижении верха/низа списка.
 */
(function reminkoInitNestedPanelWheelTrap() {
    if (typeof document === 'undefined' || window.__reminkoNestedPanelWheelTrap) return;
    window.__reminkoNestedPanelWheelTrap = true;

    function reminkoWheelDeltaY(e) {
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        else if (e.deltaMode === 2) dy *= window.innerHeight || 800;
        return dy;
    }

    function reminkoIsRootScrollEl(el) {
        return el === document.body || el === document.documentElement;
    }

    function reminkoCanScrollVertically(el) {
        const st = getComputedStyle(el);
        const oy = st.overflowY;
        const o = st.overflow;
        const allowed =
            oy === 'auto' || oy === 'scroll' || oy === 'overlay' ||
            o === 'auto' || o === 'scroll' || o === 'overlay';
        return allowed && el.scrollHeight > el.clientHeight + 1;
    }

    function reminkoFindNestedVerticalScroller(from) {
        let el = from;
        while (el && el instanceof Element) {
            if (reminkoCanScrollVertically(el) && !reminkoIsRootScrollEl(el)) return el;
            el = el.parentElement;
        }
        return null;
    }

    /** Горизонтальные ленты без вертикального скролла — не перехватываем. */
    function reminkoSkipHorizontalOnlyScroller(scroller, e) {
        const st = getComputedStyle(scroller);
        const ox = st.overflowX;
        const scrollsX =
            (ox === 'auto' || ox === 'scroll' || ox === 'overlay') &&
            scroller.scrollWidth > scroller.clientWidth + 1;
        const scrollsY = scroller.scrollHeight > scroller.clientHeight + 1;
        return scrollsX && !scrollsY && Math.abs(e.deltaY) >= Math.abs(e.deltaX);
    }

    document.addEventListener(
        'wheel',
        (e) => {
            if (e.defaultPrevented || e.ctrlKey) return;

            const scroller = reminkoFindNestedVerticalScroller(e.target);
            if (!scroller || reminkoSkipHorizontalOnlyScroller(scroller, e)) return;

            const dy = reminkoWheelDeltaY(e);
            if (!dy) return;

            e.preventDefault();
            e.stopPropagation();

            const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            let next = scroller.scrollTop + dy;
            if (next < 0) next = 0;
            else if (next > maxTop) next = maxTop;
            scroller.scrollTop = next;
        },
        { capture: true, passive: false }
    );
})();

// Автоматическая инициализация lazy loading при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLazyLoading);
} else {
    initLazyLoading();
}

const REMINKO_NO_DRAG_CARD_SELECTOR =
    'a[href], .jikan-card, .anime-card, .anime-franchise-card, .anime-similar-card, .home-horizontal-scroll, .anime-franchise-strip__scroll';

/** Запрет перетаскивания постеров/ссылок и выделения <img> (в т.ч. динамически добавленных). */
(function reminkoDisableImageDragSelect() {
    function isImageNode(node) {
        return node instanceof HTMLImageElement;
    }

    function lockImg(img) {
        if (!isImageNode(img)) return;
        img.draggable = false;
        img.setAttribute('draggable', 'false');
    }

    function lockAnchor(anchor) {
        if (!(anchor instanceof HTMLAnchorElement)) return;
        anchor.draggable = false;
        anchor.setAttribute('draggable', 'false');
    }

    function lockImagesIn(root) {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('img').forEach(lockImg);
        root.querySelectorAll('a[href]').forEach(lockAnchor);
    }

    function onPointerTargetImage(e) {
        const t = e.target;
        return isImageNode(t) || (t instanceof Element && !!t.closest('picture img'));
    }

    function shouldBlockDragStart(e) {
        if (onPointerTargetImage(e)) return true;
        const t = e.target;
        if (!(t instanceof Element)) return false;
        if (t instanceof HTMLAnchorElement) return true;
        return !!t.closest(REMINKO_NO_DRAG_CARD_SELECTOR);
    }

    document.addEventListener(
        'dragstart',
        (e) => {
            if (shouldBlockDragStart(e)) e.preventDefault();
        },
        { capture: true }
    );

    document.addEventListener(
        'selectstart',
        (e) => {
            if (isImageNode(e.target)) e.preventDefault();
        },
        { capture: true }
    );

    document.addEventListener(
        'mousedown',
        (e) => {
            if (e.detail > 1 && isImageNode(e.target)) e.preventDefault();
        },
        { capture: true }
    );

    function boot() {
        lockImagesIn(document);
        if (typeof MutationObserver === 'undefined') return;
        const obs = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (isImageNode(node)) lockImg(node);
                    else if (node instanceof Element) lockImagesIn(node);
                });
            });
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

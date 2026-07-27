// Каталог аниме - полнофункциональный

let currentPage = 1;
const itemsPerPage = 24;
let allResults = [];
const CATALOG_ALLOWED_SORTS = new Set(['rating-desc', 'year-desc']);
const CATALOG_DEFAULT_SORT = 'year-desc';

function catalogFindInputByValue(panelId, value) {
    return [...document.querySelectorAll(`#${panelId} input`)].find(
        (input) => input.value === String(value)
    );
}

function normalizeCatalogSort(sortValue) {
    const v = String(sortValue || '').trim();
    return CATALOG_ALLOWED_SORTS.has(v) ? v : CATALOG_DEFAULT_SORT;
}

/** Текст над сеткой: без дублирования номера страницы (пагинация ниже). */
function formatCatalogResultsInfo(total, page, hasActiveFilters) {
    const n = Math.max(0, parseInt(total, 10) || 0);
    const formatted = n.toLocaleString('ru-RU');
    const prefix = hasActiveFilters ? 'Найдено' : 'В каталоге';
    if (n === 0) return `${prefix}: 0 аниме`;
    const totalPages = Math.max(1, Math.ceil(n / itemsPerPage));
    const safePage = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
    if (totalPages <= 1) return `${prefix}: ${formatted} аниме`;
    const start = (safePage - 1) * itemsPerPage + 1;
    const end = Math.min(safePage * itemsPerPage, n);
    return `${prefix}: ${formatted} аниме · ${start.toLocaleString('ru-RU')}–${end.toLocaleString('ru-RU')}`;
}

function catalogHasActiveFilters(filters) {
    if (!filters) return false;
    if (filters.search && String(filters.search).trim()) return true;
    if (filters.genre && filters.genre.length) return true;
    if (filters.type && filters.type.length) return true;
    if (filters.status && filters.status.length) return true;
    if (filters.yearFrom != null && !Number.isNaN(filters.yearFrom)) return true;
    if (filters.yearTo != null && !Number.isNaN(filters.yearTo)) return true;
    if (filters.ratingMin != null && !Number.isNaN(filters.ratingMin)) return true;
    return false;
}

// Переход на страницу
function goToPage(page) {
    currentPage = page;
    displayResults(allResults, { hasActiveFilters: catalogHasActiveFilters(getFilters()) });
    updatePagination(allResults.length);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Глобальная функция для пагинации (доступна из HTML)
window.goToPage = goToPage;

/**
 * apply-navigation.js пересобирает .main-layout и <main> — ранние addEventListener с фильтров слетают.
 * Инициализация только после reminko:navigation-applied (см. navigation.js).
 */
function initAnimeCatalogAfterNavigation() {
    const urlFilter = new URLSearchParams(window.location.search).get('filter');
    if (urlFilter === 'season' || urlFilter === 'upcoming') return;
    if (!document.getElementById('filterGenrePanel') || !document.getElementById('catalogResults')) return;
    void ensureKodikCatalogForPage().then(() => {
        loadGenres();
    });
}

async function ensureKodikCatalogForPage() {
    if (window.KodikCatalogStore && typeof window.KodikCatalogStore.load === 'function') {
        try {
            await window.KodikCatalogStore.load();
        } catch (e) {
            console.warn('[Catalog] Kodik catalog:', e);
        }
    }
    if (typeof ensureCatalogAnnouncedSourcesLoaded === 'function') {
        try {
            await ensureCatalogAnnouncedSourcesLoaded();
        } catch (e) {
            console.warn('[Catalog] Announced sources:', e);
        }
    } else if (typeof ensureKodikAnnouncedRowsLoaded === 'function') {
        try {
            await ensureKodikAnnouncedRowsLoaded();
        } catch (e) {
            console.warn('[Catalog] Announced list:', e);
        }
    }
    if (typeof reminkoLoadAllCalendarData === 'function') {
        try {
            await reminkoLoadAllCalendarData();
        } catch (e) {
            console.warn('[Catalog] Calendar load:', e);
        }
    }
}

function applyCatalogCountdownToCard(anime, shiki) {
    if (!anime || anime.id == null) return;
    const card = [...document.querySelectorAll('#catalogResults .anime-card[data-id]')].find(
        (item) => item.dataset.id === String(anime.id)
    );
    if (!card) return;
    const slot = card.querySelector('[data-countdown-slot]');
    if (!slot) return;
    const iso =
        typeof reminkoResolveAnimeCountdownIso === 'function'
            ? reminkoResolveAnimeCountdownIso(anime, shiki)
            : '';
    if (!iso) return;
    if (typeof reminkoApplyCompactCountdown === 'function') {
        reminkoApplyCompactCountdown(slot, iso);
    }
}

function scheduleCatalogCountdownForPage(container, pageItems) {
    if (!container || !Array.isArray(pageItems)) return;

    const targets = pageItems.filter(
        (a) =>
            a &&
            a.mal_id != null &&
            (typeof reminkoAnimeNeedsEpisodeCountdown === 'function'
                ? reminkoAnimeNeedsEpisodeCountdown(a)
                : a.status === 'Онгоинг' && a.type !== 'Фильм')
    );
    if (!targets.length) return;

    const needFetch = [];
    for (const anime of targets) {
        const mal = parseInt(anime.mal_id, 10);
        if (!Number.isFinite(mal) || mal <= 0) continue;
        const cached =
            window.shikimoriApi && typeof window.shikimoriApi.readCachedByMalId === 'function'
                ? window.shikimoriApi.readCachedByMalId(mal)
                : null;
        const iso =
            typeof reminkoResolveAnimeCountdownIso === 'function'
                ? reminkoResolveAnimeCountdownIso(anime, cached)
                : '';
        if (iso) {
            applyCatalogCountdownToCard(anime, cached);
            continue;
        }
        needFetch.push(anime);
    }

    if (!window.shikimoriApi || typeof window.shikimoriApi.enqueueFetchShikimoriByMalId !== 'function') {
        return;
    }

    const prefetch = needFetch.slice(0, 24);
    prefetch.forEach((anime) => {
        const t = anime.titleAlt || anime.title || '';
        window.shikimoriApi.enqueueFetchShikimoriByMalId(anime.mal_id, t).then((sh) => {
            applyCatalogCountdownToCard(anime, sh);
        });
    });

    const rest = needFetch.slice(24);
    if (!rest.length || typeof IntersectionObserver === 'undefined') return;

    const loaded = new Set(prefetch.map((x) => x.mal_id));
    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((ent) => {
                if (!ent.isIntersecting) return;
                const cardEl = ent.target;
                const mid = parseInt(cardEl.dataset.malId, 10);
                io.unobserve(cardEl);
                if (!mid || loaded.has(mid)) return;
                loaded.add(mid);
                const anime = rest.find((x) => parseInt(x.mal_id, 10) === mid);
                if (!anime) return;
                const t = anime.titleAlt || anime.title || '';
                window.shikimoriApi.enqueueFetchShikimoriByMalId(anime.mal_id, t).then((sh) => {
                    applyCatalogCountdownToCard(anime, sh);
                });
            });
        },
        { root: null, rootMargin: '160px', threshold: 0.02 }
    );

    container.querySelectorAll('.anime-card[data-mal-id] [data-countdown-slot]').forEach((slot) => {
        const card = slot.closest('.anime-card');
        if (!card || card.querySelector('[data-countdown-iso]')) return;
        const mid = parseInt(card.dataset.malId, 10);
        if (mid && rest.some((x) => parseInt(x.mal_id, 10) === mid)) io.observe(card);
    });
}
window.addEventListener('reminko:navigation-applied', initAnimeCatalogAfterNavigation);

document.addEventListener('DOMContentLoaded', () => {
    const urlFilter = new URLSearchParams(window.location.search).get('filter');
    if (urlFilter === 'season' || urlFilter === 'upcoming') {
        loadJikanCatalogPage(urlFilter);
    }
});

function _malPosterUrlCatalog(malId) {
    const mal = parseInt(malId, 10);
    if (!Number.isFinite(mal) || mal <= 0) return '';
    return `https://shikimori.one/system/animes/${mal}/original.jpg`;
}

function _createCalendarAnnouncedCard(row) {
    const card = document.createElement('div');
    card.className = 'jikan-card';
    card.style.cursor = 'pointer';
    const mal = parseInt(row.mal_id, 10);
    const title = (row.title_ru && String(row.title_ru).trim()) || `MAL #${mal}`;
    const imgUrl = reminkoSafeImageUrl(_malPosterUrlCatalog(mal), '');
    const dateStr =
        typeof reminkoFormatReleaseDateShort === 'function'
            ? reminkoFormatReleaseDateShort(row.next_at)
            : '';
    card.innerHTML = `
        <div class="jikan-card-poster">
            <img src="${reminkoEscapeHtml(imgUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
            <div class="jikan-card-status">Анонс</div>
        </div>
        <div class="jikan-card-info">
            <div class="jikan-card-title"></div>
            <div class="jikan-card-meta">
                <span>1-я серия${dateStr ? ` · ${reminkoEscapeHtml(dateStr)}` : ''}</span>
            </div>
        </div>
    `;
    const titleEl = card.querySelector('.jikan-card-title');
    if (titleEl) {
        titleEl.textContent = title;
        titleEl.title = title;
    }
    const img = card.querySelector('img');
    if (img) {
        img.alt = title;
        if (typeof attachJikanPosterFallback === 'function') {
            attachJikanPosterFallback(img, mal, row);
        } else {
            img.onerror = () => {
                img.style.display = 'none';
            };
        }
    }
    card.addEventListener('click', () => {
        try {
            sessionStorage.setItem('previousUrl', location.href);
        } catch (_) {
            /* ignore */
        }
        location.href = `../anime/view.html?mal_id=${encodeURIComponent(String(mal))}`;
    });
    return card;
}

async function loadUpcomingFromCalendarCatalog(container) {
    if (!container) return;

    container.innerHTML =
        '<div class="home-loading-placeholder" style="padding:2rem;text-align:center;">Загрузка всех анонсов из Jikan…<br><small style="opacity:0.75">Первый раз может занять до минуты</small></div>';

    let list = [];
    try {
        if (typeof fetchJikanAnnouncedList === 'function') {
            list = await fetchJikanAnnouncedList();
        }
        if (typeof filterJikanItemsRestricted === 'function') {
            list = filterJikanItemsRestricted(list);
        }
    } catch (e) {
        console.warn('[Catalog] Jikan upcoming load:', e);
    }

    container.innerHTML = '';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
    container.style.gap = '1.2rem';
    if (!list.length) {
        container.innerHTML =
            '<div class="home-loading-placeholder">Пока нет анонсов. Попробуйте обновить страницу позже.</div>';
        return;
    }
    for (const anime of list) {
        container.appendChild(_createJikanCatalogCard(anime));
    }
}

async function loadJikanCatalogPage(mode) {
    const container = document.getElementById('catalogResults');
    const filtersArea = document.querySelector('.catalog-filters, .filters-container, .catalog-controls');
    const pagination = document.getElementById('catalogPagination') || document.querySelector('.pagination');
    const header = document.querySelector('.catalog-header h1, .catalog-title');

    if (filtersArea) filtersArea.style.display = 'none';
    if (pagination) pagination.style.display = 'none';
    if (header) {
        header.textContent = mode === 'season' ? 'Новинки сезона' : 'Анонсы аниме (Jikan)';
    }
    if (container) {
        container.innerHTML =
            '<div class="home-loading-placeholder" style="padding:2rem;text-align:center;">Загрузка…</div>';
    }

    if (mode === 'upcoming') {
        try {
            await loadUpcomingFromCalendarCatalog(container);
        } catch (e) {
            console.error('[Catalog] Upcoming calendar error:', e);
            if (container) {
                container.innerHTML =
                    '<div class="home-loading-placeholder">Не удалось загрузить анонсы. Попробуйте позже.</div>';
            }
        }
        return;
    }

    const JIKAN_BASE = 'https://api.jikan.moe/v4';
    let url;
    if (mode === 'season' && typeof getJikanSeasonMeta === 'function') {
        const m = getJikanSeasonMeta();
        url = `${JIKAN_BASE}/seasons/${m.year}/${m.season}?limit=25&order_by=members&sort=desc`;
    } else {
        url = `${JIKAN_BASE}/seasons/now?limit=25&order_by=score&sort=desc`;
    }

    const jikanFetch =
        typeof reminkoJikanFetch === 'function'
            ? reminkoJikanFetch
            : (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Jikan ${r.status}`))));

    try {
        let page1 = await jikanFetch(url);
        let allAnime = page1.data || [];
        if (mode === 'season' && (!allAnime || allAnime.length < 8) && url.indexOf('seasons/now') === -1) {
            const p2 = await jikanFetch(`${JIKAN_BASE}/seasons/now?limit=25&order_by=score&sort=desc`);
            const more = p2.data || [];
            const seen = new Set((allAnime || []).map((a) => a.mal_id));
            for (const x of more) {
                if (x && x.mal_id && !seen.has(x.mal_id)) {
                    seen.add(x.mal_id);
                    allAnime.push(x);
                }
            }
        }
        if (typeof filterJikanItemsRestricted === 'function') {
            allAnime = filterJikanItemsRestricted(allAnime);
        }

        if (container) {
            container.innerHTML = '';
            container.style.display = 'grid';
            container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
            container.style.gap = '1.2rem';

            allAnime.forEach((anime) => {
                const card = _createJikanCatalogCard(anime);
                container.appendChild(card);
            });
        }
    } catch (e) {
        console.error('[Catalog] Jikan error:', e);
        if (container) container.innerHTML = '<div class="home-loading-placeholder">Не удалось загрузить данные. Попробуйте позже.</div>';
    }
}

function _createJikanCatalogCard(anime) {
    const card = document.createElement('div');
    card.className = 'jikan-card';
    card.style.cursor = 'pointer';

    const imgUrl = reminkoSafeImageUrl(
        (typeof jikanPosterFromAnime === 'function' ? jikanPosterFromAnime(anime) : '') ||
        anime.images?.jpg?.large_image_url ||
        anime.images?.jpg?.image_url ||
        '',
        ''
    );
    const score = anime.score ? anime.score.toFixed(1) : '—';
    const title =
        (anime.title_english && String(anime.title_english).trim()) ||
        (anime.title && String(anime.title).trim()) ||
        (anime.title_japanese && String(anime.title_japanese).trim()) ||
        '—';
    const episodes = anime.episodes ? `${anime.episodes} эп.` : '';
    const status = anime.status === 'Currently Airing' ? 'В эфире' :
                   anime.status === 'Not yet aired' ? 'Анонс' :
                   anime.status === 'Finished Airing' ? 'Завершён' : '';
    const genres = (anime.genres || [])
        .slice(0, 2)
        .map((g) => (typeof mapJikanGenreName === 'function' ? mapJikanGenreName(g.name) : g.name))
        .join(', ');

    card.innerHTML = `
        <div class="jikan-card-poster">
            <img src="${reminkoEscapeHtml(imgUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-jikan-poster="1">
            ${score !== '—' ? `<div class="jikan-card-score">${reminkoEscapeHtml(score)}</div>` : ''}
            ${status ? `<div class="jikan-card-status">${reminkoEscapeHtml(status)}</div>` : ''}
        </div>
        <div class="jikan-card-info">
            <div class="jikan-card-title" title="${reminkoEscapeHtml(title)}">${reminkoEscapeHtml(title)}</div>
            <div class="jikan-card-meta">
                ${episodes ? `<span>${reminkoEscapeHtml(episodes)}</span>` : ''}
                ${genres ? `<span>${reminkoEscapeHtml(genres)}</span>` : ''}
            </div>
        </div>
    `;

    const posterImg = card.querySelector('.jikan-card-poster img');
    if (posterImg) {
        posterImg.alt = title || 'Постер аниме';
        if (typeof attachJikanPosterFallback === 'function') {
            attachJikanPosterFallback(posterImg, anime.mal_id, anime);
        }
    }

    card.addEventListener('click', () => {
        if (typeof navigateToJikanAnnouncedAnime === 'function') {
            navigateToJikanAnnouncedAnime(anime, '../anime/view.html');
            return;
        }
        const virtualId = 10000000 + (anime.mal_id || 0);
        if (typeof openAnimePage === 'function') {
            openAnimePage(virtualId);
        } else {
            try {
                sessionStorage.setItem('jikanAnimeData', JSON.stringify(anime));
                sessionStorage.setItem('viewAnimeId', String(virtualId));
            } catch (_) {
                /* ignore */
            }
            window.location.href = `../anime/view.html?id=${virtualId}&mal_id=${anime.mal_id}`;
        }
    });

    return card;
}

// Загрузка фильтров из URL
function loadFilters() {
    const params = getUrlParams();
    
    // Поиск
    const searchInput = document.getElementById('catalogSearch');
    if (searchInput && params.search) {
        searchInput.value = params.search;
    }
    
    // Жанры (чекбоксы)
    if (params.genre && Array.isArray(params.genre)) {
        params.genre.forEach(genre => {
            const checkbox = catalogFindInputByValue('filterGenrePanel', genre);
            if (checkbox) checkbox.checked = true;
        });
        updateFilterButtonText('filterGenreBtn', params.genre);
    }
    
    // Типы (чекбоксы)
    if (params.type && Array.isArray(params.type)) {
        params.type.forEach(type => {
            const checkbox = catalogFindInputByValue('filterTypePanel', type);
            if (checkbox) checkbox.checked = true;
        });
        updateFilterButtonText('filterTypeBtn', params.type);
    } else if (params.type) {
        const checkbox = catalogFindInputByValue('filterTypePanel', params.type);
        if (checkbox) checkbox.checked = true;
        updateFilterButtonText('filterTypeBtn', [params.type]);
    }
    
    // Статусы (чекбоксы)
    if (params.status && Array.isArray(params.status)) {
        params.status.forEach(status => {
            const checkbox = catalogFindInputByValue('filterStatusPanel', status);
            if (checkbox) checkbox.checked = true;
        });
        updateFilterButtonText('filterStatusBtn', params.status);
    } else if (params.status) {
        const checkbox = catalogFindInputByValue('filterStatusPanel', params.status);
        if (checkbox) checkbox.checked = true;
        updateFilterButtonText('filterStatusBtn', [params.status]);
    }
    
    // Год ОТ
    const yearFromRange = document.getElementById('filterYearFromRange');
    const yearFromSpan = document.getElementById('filterYearFrom');
    if (yearFromRange && params.yearFrom) {
        yearFromRange.value = params.yearFrom;
        if (yearFromSpan) yearFromSpan.textContent = params.yearFrom;
    }
    
    // Год ДО
    const yearToRange = document.getElementById('filterYearToRange');
    const yearToSpan = document.getElementById('filterYearTo');
    if (yearToRange && params.yearTo) {
        yearToRange.value = params.yearTo;
        if (yearToSpan) yearToSpan.textContent = params.yearTo;
    }
    
    // Сортировка
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = normalizeCatalogSort(params.sort);
    }
}

// Обновление текста кнопки фильтра
function updateFilterButtonText(btnId, values) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    
    const valueEl = btn.querySelector('.filter-chip-value');
    const defaultText = btnId.includes('Genre') ? 'Все' : btnId.includes('Type') ? 'Все' : 'Все';
    const displayText = values.length === 0 ? defaultText : values.length === 1 ? values[0] : `Выбрано: ${values.length}`;
    
    if (valueEl) {
        valueEl.textContent = displayText;
    } else {
        const svg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        const label =
            values.length === 0
                ? btnId.includes('Genre')
                    ? 'Выберите жанр'
                    : btnId.includes('Type')
                      ? 'Выберите тип'
                      : 'Выберите статус'
                : displayText;
        btn.innerHTML = `${reminkoEscapeHtml(label)} ${svg}`;
    }
}

/** ID тайтлов, которые всегда в начале списка каталога (сохраняется порядок) */
const CATALOG_PINNED_FIRST_IDS = [451];

function applyCatalogPinnedFirst(list) {
    if (!list || !list.length || !CATALOG_PINNED_FIRST_IDS.length) return list;
    const order = new Map(CATALOG_PINNED_FIRST_IDS.map((id, i) => [id, i]));
    const head = [];
    const tail = [];
    for (const a of list) {
        const id = parseInt(a.id, 10);
        if (order.has(id)) head.push(a);
        else tail.push(a);
    }
    head.sort(
        (a, b) =>
            order.get(parseInt(a.id, 10)) - order.get(parseInt(b.id, 10))
    );
    return head.concat(tail);
}

// Применение фильтров
let isApplyingFilters = false; // Флаг для предотвращения множественных вызовов
let _applyFiltersSeq = 0;
function applyFilters(smoothScroll = true) {
    // Предотвращаем множественные одновременные вызовы
    if (isApplyingFilters) {
        console.log('[Catalog] Фильтры уже применяются, пропускаем вызов');
        return;
    }

    isApplyingFilters = true;
    const filters = getFilters();
    const seq = ++_applyFiltersSeq;

    showLoadingIndicator();

    void (async () => {
        try {
            // Фильтр «Анонс» — дождаться kodik-announced + Shikimori, иначе список пустой
            if (filters.status && filters.status.includes('Анонс')) {
                if (typeof ensureCatalogAnnouncedSourcesLoaded === 'function') {
                    await ensureCatalogAnnouncedSourcesLoaded();
                } else if (typeof ensureKodikAnnouncedRowsLoaded === 'function') {
                    await ensureKodikAnnouncedRowsLoaded();
                }
            } else if (typeof ensureKodikAnnouncedRowsLoaded === 'function') {
                // Фоном, без блокировки остальных фильтров
                void ensureKodikAnnouncedRowsLoaded();
            }

            if (seq !== _applyFiltersSeq) return;

            await new Promise((r) => setTimeout(r, 30));

            let results = filterAnime(filters);

            results = sortAnime(results, normalizeCatalogSort(filters.sort));
            if (normalizeCatalogSort(filters.sort) === 'rating-desc') {
                results = applyCatalogPinnedFirst(results);
            }

            const seenIds = new Map();
            const uniqueResults = [];
            for (const anime of results) {
                const id = parseInt(anime.id, 10);
                const key = Number.isFinite(id) ? id : String(anime.id);
                if (!seenIds.has(key)) {
                    seenIds.set(key, true);
                    uniqueResults.push(anime);
                }
            }

            if (seq !== _applyFiltersSeq) return;

            allResults = uniqueResults;
            currentPage = 1;

            displayResults(uniqueResults, { hasActiveFilters: catalogHasActiveFilters(filters) });
            updatePagination(uniqueResults.length);
            updateFiltersInUrl(filters);

            if (smoothScroll) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (error) {
            console.error('[Catalog] Ошибка применения фильтров:', error);
        } finally {
            if (seq === _applyFiltersSeq) {
                hideLoadingIndicator();
                isApplyingFilters = false;
            }
        }
    })();
}

// Получение значений фильтров из формы
function getFilters() {
    const searchInput = document.getElementById('catalogSearch');
    const sortSelect = document.getElementById('sortSelect');
    
    // Получаем жанры из чекбоксов (можно несколько)
    const genreCheckboxes = document.querySelectorAll('#filterGenrePanel input[type="checkbox"]:checked');
    const genre = Array.from(genreCheckboxes).map(cb => cb.value);
    
    // Получаем типы из чекбоксов
    const typeCheckboxes = document.querySelectorAll('#filterTypePanel input[type="checkbox"]:checked');
    const type = Array.from(typeCheckboxes).map(cb => cb.value);
    
    // Получаем статусы из чекбоксов
    const statusCheckboxes = document.querySelectorAll('#filterStatusPanel input[type="checkbox"]:checked');
    const status = Array.from(statusCheckboxes).map(cb => cb.value);
    
    // Получаем год ОТ и ДО
    const yearFromRange = document.getElementById('filterYearFromRange');
    const yearToRange = document.getElementById('filterYearToRange');
    const yearFrom = yearFromRange ? parseInt(yearFromRange.value) : null;
    const yearTo = yearToRange ? parseInt(yearToRange.value) : null;
    
    return {
        search: searchInput ? searchInput.value.trim() : '',
        genre: genre,
        type: type,
        status: status,
        yearFrom: yearFrom,
        yearTo: yearTo,
        ratingMin: null, // Убрали рейтинг
        sort: normalizeCatalogSort(sortSelect ? sortSelect.value : CATALOG_DEFAULT_SORT),
        // В каталоге показываем все сезоны/части Kodik — не сливаем по названию.
        removeDuplicates: false
    };
}

const CATALOG_SHIKI_PREFETCH = 14;

function shikiGenresToLabels(sh) {
    if (!sh || !Array.isArray(sh.genres)) return [];
    return sh.genres
        .map((g) => {
            if (!g) return '';
            if (typeof g === 'string') return g.trim();
            return String(g.russian || g.name || '').trim();
        })
        .filter(Boolean);
}

function applyCatalogShikiToCard(anime, sh) {
    if (!anime || anime.mal_id == null) return;
    if (typeof patchJikanVirtualShiki === 'function') patchJikanVirtualShiki(anime.mal_id, sh);
    if (typeof patchSiteCatalogJikanShiki === 'function') patchSiteCatalogJikanShiki(anime.mal_id, sh);
    const id = String(anime.id);
    const card = [...document.querySelectorAll('#catalogResults .anime-card[data-id]')].find(
        (item) => item.dataset.id === String(id)
    );
    if (!card) return;
    const h = card.querySelector('.anime-title');
    if (sh && sh.russian && h && anime.isJikanVirtual) {
        h.textContent = sh.russian;
        h.setAttribute('title', sh.russian);
    }
    // Жанры с Shikimori — как на странице тайтла (Kodik часто отдаёт шаблонный набор)
    const labels = shikiGenresToLabels(sh);
    const slot = card.querySelector('[data-genres-slot]');
    if (slot && labels.length) {
        slot.textContent = labels.slice(0, 3).join(', ');
        slot.hidden = false;
        anime.genres = labels;
    }
}

function scheduleCatalogShikimoriForPage(container, pageItems) {
    if (!window.shikimoriApi || typeof window.shikimoriApi.enqueueFetchShikimoriByMalId !== 'function') {
        return;
    }
    const keyed = [];
    const seenMal = new Set();
    for (const a of pageItems) {
        const mal = parseInt(a && a.mal_id, 10);
        if (!a || !Number.isFinite(mal) || mal <= 0) continue;
        if (seenMal.has(mal)) continue;
        seenMal.add(mal);
        keyed.push(a);
    }
    if (keyed.length === 0) return;

    const prefetch = keyed.slice(0, CATALOG_SHIKI_PREFETCH);
    prefetch.forEach((anime) => {
        const t = anime.titleAlt || anime.title || '';
        window.shikimoriApi.enqueueFetchShikimoriByMalId(anime.mal_id, t).then((sh) => {
            applyCatalogShikiToCard(anime, sh);
        });
    });

    const rest = keyed.slice(CATALOG_SHIKI_PREFETCH);
    if (rest.length === 0) return;

    const loaded = new Set(prefetch.map((x) => parseInt(x.mal_id, 10)));
    if (typeof IntersectionObserver === 'undefined') {
        rest.forEach((anime) => {
            const t = anime.titleAlt || anime.title || '';
            window.shikimoriApi.enqueueFetchShikimoriByMalId(anime.mal_id, t).then((sh) => {
                applyCatalogShikiToCard(anime, sh);
            });
        });
        return;
    }

    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((ent) => {
                if (!ent.isIntersecting) return;
                const cardEl = ent.target;
                const mid = parseInt(cardEl.dataset.malId, 10);
                io.unobserve(cardEl);
                if (!mid || loaded.has(mid)) return;
                loaded.add(mid);
                const anime = keyed.find((x) => parseInt(x.mal_id, 10) === mid);
                if (!anime) return;
                const t = anime.titleAlt || anime.title || '';
                window.shikimoriApi.enqueueFetchShikimoriByMalId(anime.mal_id, t).then((sh) => {
                    applyCatalogShikiToCard(anime, sh);
                });
            });
        },
        { root: null, rootMargin: '140px', threshold: 0.02 }
    );

    container.querySelectorAll('.anime-card[data-mal-id]').forEach((c) => {
        const mid = parseInt(c.dataset.malId, 10);
        if (mid && !loaded.has(mid)) io.observe(c);
    });
}

// Отображение результатов
function displayResults(results, options) {
    const infoOpts = options && typeof options === 'object' ? options : {};
    const container = document.getElementById('catalogResults');
    if (!container) {
        return;
    }

    container.innerHTML = '';

    try {
        // Удаляем дубликаты по ID перед отображением (дополнительная защита)
        const seenIds = new Map();
        const uniqueResults = [];
        for (const anime of results) {
            const idKey =
                anime && anime.id != null && String(anime.id).trim() !== ''
                    ? String(anime.id)
                    : anime && anime.mal_id != null
                      ? `mal:${anime.mal_id}`
                      : '';
            if (!idKey || seenIds.has(idKey)) continue;
            seenIds.set(idKey, true);
            uniqueResults.push(anime);
        }
        
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageResults = uniqueResults.slice(start, end);
        
        if (pageResults.length === 0) {
            let catalogSize = 0;
            try {
                if (typeof window.KodikCatalogStore?.getAll === 'function') {
                    catalogSize = window.KodikCatalogStore.getAll().length;
                } else if (typeof getAllAnime === 'function') {
                    catalogSize = (getAllAnime() || []).length;
                }
            } catch (_) {
                /* ignore */
            }
            const catalogLoading =
                catalogSize === 0 &&
                typeof window.KodikCatalogStore?.isLoaded === 'function' &&
                !window.KodikCatalogStore.isLoaded();
            const noMatches = uniqueResults.length === 0;
            let emptyTitle = 'Ничего не найдено';
            let emptyText = 'Попробуйте изменить параметры поиска или фильтры.';
            if (catalogLoading) {
                emptyTitle = 'Загрузка каталога';
                emptyText = 'Подождите немного и обновите страницу.';
            } else if (catalogSize === 0) {
                emptyTitle = 'Каталог временно недоступен';
                emptyText = 'Попробуйте обновить страницу чуть позже.';
            } else if (noMatches) {
                emptyTitle = 'Ничего не найдено';
                emptyText = 'Попробуйте изменить параметры поиска или фильтры.';
            }
            container.innerHTML = `
                <div class="page-placeholder">
                    <h2>${emptyTitle}</h2>
                    <p>${emptyText}</p>
                </div>
            `;
            const resultsInfoEmpty = document.getElementById('resultsInfo');
            if (resultsInfoEmpty) {
                resultsInfoEmpty.textContent = formatCatalogResultsInfo(
                    uniqueResults.length,
                    currentPage,
                    infoOpts.hasActiveFilters
                );
            }
            return;
        }
        
        // Удаляем дубликаты по ID еще раз на уровне страницы (на всякий случай)
        const pageSeenIds = new Set();
        const uniquePageResults = [];
        for (const anime of pageResults) {
            const idKey =
                anime && anime.id != null && String(anime.id).trim() !== ''
                    ? String(anime.id)
                    : anime && anime.mal_id != null
                      ? `mal:${anime.mal_id}`
                      : '';
            if (!idKey || pageSeenIds.has(idKey)) continue;
            pageSeenIds.add(idKey);
            uniquePageResults.push(anime);
        }
        
        const items = uniquePageResults.map(anime => {
            if (typeof initAnimeStats === 'function') return initAnimeStats(anime);
            return anime;
        });
        
        // Финальная проверка на дубликаты перед отображением
        const finalSeenIds = new Set();
        const finalUniqueItems = [];
        for (const item of items) {
            const id = parseInt(item.id);
            if (!finalSeenIds.has(id)) {
                finalSeenIds.add(id);
                finalUniqueItems.push(item);
            }
        }
        
        finalUniqueItems.forEach((anime) => container.appendChild(createAnimeCard(anime)));
        scheduleCatalogShikimoriForPage(container, finalUniqueItems);
        scheduleCatalogCountdownForPage(container, finalUniqueItems);

        const resultsInfo = document.getElementById('resultsInfo');
        if (resultsInfo) {
            resultsInfo.textContent = formatCatalogResultsInfo(
                uniqueResults.length,
                currentPage,
                infoOpts.hasActiveFilters
            );
        }
    } catch (error) {
        console.error('[Catalog] Ошибка отображения результатов:', error);
    }
}

// Обновление пагинации
function updatePagination(totalItems) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Кнопка "Назад"
    html += `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">← Назад</button>`;
    
    // Номера страниц
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<span class="pagination-dots">...</span>`;
        }
    }
    
    // Кнопка "Вперёд"
    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">Вперёд →</button>`;
    
    pagination.innerHTML = html;
}

// Показать индикатор загрузки
function showLoadingIndicator() {
    const container = document.getElementById('catalogResults');
    if (container) {
        container.style.opacity = '0.5';
        container.style.pointerEvents = 'none';
    }
}

// Скрыть индикатор загрузки
function hideLoadingIndicator() {
    const container = document.getElementById('catalogResults');
    if (container) {
        container.style.opacity = '1';
        container.style.pointerEvents = 'auto';
    }
}

// Инициализация событий фильтров
/**
 * navigation.applyNavigation() копирует <main> через innerHTML — прямые addEventListener на фильтрах слетают.
 * Вешаем обработчики один раз на document (делегирование), тогда фильтры работают и до, и после пересборки layout.
 */
function initFilterEvents() {
    // Совместимость: старые вызовы loadGenres → initFilterEvents оставляем, но биндим только один раз.
    reminkoBindCatalogFilterDelegation();
}

let _reminkoSearchDebounce;
let _reminkoYearDebounce;
function reminkoBindCatalogFilterDelegation() {
    if (typeof window === 'undefined' || window.__reminkoCatalogFilterDelegation) return;
    window.__reminkoCatalogFilterDelegation = true;

    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !t.closest) return;

        if (t.closest('#resetFilters')) {
            e.preventDefault();
            resetFilters(e);
            return;
        }

        const closeBtn = t.closest('[data-filter-panel-close]');
        if (closeBtn) {
            e.preventDefault();
            e.stopPropagation();
            const panelId = closeBtn.dataset.filterPanelClose;
            const panel = panelId ? document.getElementById(panelId) : closeBtn.closest('.filter-select-panel');
            if (panel) panel.classList.remove('active');
            if (panel && panel.id) {
                const btn = document.getElementById(panel.id.replace('Panel', 'Btn'));
                if (btn) btn.classList.remove('active');
            }
            return;
        }

        const chip = t.closest('.filter-select-btn');
        if (chip && chip.dataset && chip.dataset.target) {
            e.stopPropagation();
            const panel = document.getElementById(chip.dataset.target);
            if (!panel) return;
            const isActive = panel.classList.contains('active');
            document.querySelectorAll('.filter-select-panel').forEach((p) => p.classList.remove('active'));
            document.querySelectorAll('.filter-select-btn').forEach((b) => b.classList.remove('active'));
            if (!isActive) {
                panel.classList.add('active');
                chip.classList.add('active');
            }
            return;
        }
    });

    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el) return;
        if (el.id === 'filterYearFromRange' || el.id === 'filterYearToRange') {
            const value = parseInt(el.value, 10);
            if (el.id === 'filterYearFromRange') {
                const yearFromSpan = document.getElementById('filterYearFrom');
                if (yearFromSpan) yearFromSpan.textContent = value;
                const yearToRange = document.getElementById('filterYearToRange');
                const yTo = document.getElementById('filterYearTo');
                if (yearToRange && !Number.isNaN(value) && value > parseInt(yearToRange.value, 10)) {
                    yearToRange.value = value;
                    if (yTo) yTo.textContent = value;
                }
            } else {
                const yearToSpan = document.getElementById('filterYearTo');
                if (yearToSpan) yearToSpan.textContent = value;
                const yearFromRange = document.getElementById('filterYearFromRange');
                const yFrom = document.getElementById('filterYearFrom');
                if (yearFromRange && !Number.isNaN(value) && value < parseInt(yearFromRange.value, 10)) {
                    yearFromRange.value = value;
                    if (yFrom) yFrom.textContent = value;
                }
            }
            clearTimeout(_reminkoYearDebounce);
            _reminkoYearDebounce = setTimeout(() => applyFilters(false), 350);
            return;
        }
        if (el.id === 'catalogSearch') {
            clearTimeout(_reminkoSearchDebounce);
            _reminkoSearchDebounce = setTimeout(() => applyFilters(false), 500);
        }
    });

    document.addEventListener('change', (e) => {
        const el = e.target;
        if (!el) return;

        if (el.id === 'sortSelect') {
            applyFilters(false);
            return;
        }

        if (el.type !== 'checkbox') return;
        const panel = el.closest &&
            (el.closest('#filterTypePanel') || el.closest('#filterGenrePanel') || el.closest('#filterStatusPanel'));
        if (!panel || !panel.id) return;
        const panelId = panel.id;
        const btnId = panelId.replace('Panel', 'Btn');
        const checked = panel.querySelectorAll('input[type="checkbox"]:checked');
        const values = Array.from(checked).map((cb) => cb.value);
        updateFilterButtonText(btnId, values);
        if (panelId === 'filterGenrePanel') {
            const bubble = el.closest('.genre-watch-bubble');
            if (bubble) bubble.classList.toggle('is-checked', !!el.checked);
            updateGenreWatchSelectedLabel();
        }
        applyFilters(false);
    });
}

// Сброс фильтров
function resetFilters(e) {
    if (e) e.preventDefault();
    
    // Очищаем все поля формы
    const searchInput = document.getElementById('catalogSearch');
    if (searchInput) searchInput.value = '';
    
    // Сброс чекбоксов типов
    document.querySelectorAll('#filterTypePanel input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateFilterButtonText('filterTypeBtn', []);
    
    // Сброс чекбоксов жанров
    document.querySelectorAll('#filterGenrePanel input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
        const bubble = cb.closest('.genre-watch-bubble');
        if (bubble) bubble.classList.remove('is-checked');
    });
    updateFilterButtonText('filterGenreBtn', []);
    updateGenreWatchSelectedLabel();
    
    // Сброс чекбоксов статусов
    document.querySelectorAll('#filterStatusPanel input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateFilterButtonText('filterStatusBtn', []);
    
    // Сброс слайдера года ОТ
    const yearFromRange = document.getElementById('filterYearFromRange');
    const yearFromSpan = document.getElementById('filterYearFrom');
    if (yearFromRange) {
        yearFromRange.value = yearFromRange.min || '1990';
        if (yearFromSpan) yearFromSpan.textContent = yearFromRange.value;
    }
    
    // Сброс слайдера года ДО
    const yearToRange = document.getElementById('filterYearToRange');
    const yearToSpan = document.getElementById('filterYearTo');
    if (yearToRange) {
        yearToRange.value = yearToRange.max || '2026';
        if (yearToSpan) yearToSpan.textContent = yearToRange.value;
    }
    
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.value = CATALOG_DEFAULT_SORT;
    
    // Очистка URL
    const url = new URL(window.location);
    url.search = '';
    window.history.pushState({}, '', url);
    
    // Применяем пустые фильтры
    applyFilters();
}

// Обновление фильтров в URL
function updateFiltersInUrl(filters) {
    const params = {};
    if (filters.search) params.search = filters.search;
    if (filters.genre.length > 0) params.genre = filters.genre;
    if (filters.type.length > 0) params.type = filters.type;
    if (filters.status.length > 0) params.status = filters.status;
    if (filters.yearFrom) params.yearFrom = filters.yearFrom;
    if (filters.yearTo) params.yearTo = filters.yearTo;
    if (filters.sort) params.sort = filters.sort;
    
    setUrlParams(params);
}

function escGenreAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function updateGenreWatchSelectedLabel() {
    const el = document.getElementById('genreWatchSelected');
    if (!el) return;
    const checked = document.querySelectorAll('#genreWatchCloud input[type="checkbox"]:checked');
    if (!checked.length) {
        el.textContent = 'Все';
        return;
    }
    if (checked.length === 1) {
        el.textContent = checked[0].value;
        return;
    }
    el.textContent = `${checked.length} выбрано`;
}

function layoutGenreWatchBubbles() {
    const cloud = document.getElementById('genreWatchCloud');
    const stage = document.getElementById('genreWatchStage');
    if (!cloud || !stage) return;
    const bubbles = [...cloud.querySelectorAll('.genre-watch-bubble')];
    if (!bubbles.length) return;

    const n = bubbles.length;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const radiusStep = 38;
    bubbles.forEach((bubble, i) => {
        const r = 8 + radiusStep * Math.sqrt(i + 0.35);
        const a = i * golden;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        bubble.dataset.wx = String(x);
        bubble.dataset.wy = String(y);
        const len = String(bubble.dataset.label || '').length;
        const size = len > 12 ? 'sm' : len > 8 ? 'md' : 'lg';
        bubble.dataset.size = size;
    });
    applyGenreWatchTransforms();
}

function applyGenreWatchTransforms() {
    const cloud = document.getElementById('genreWatchCloud');
    const stage = document.getElementById('genreWatchStage');
    if (!cloud || !stage) return;
    const panX = parseFloat(cloud.dataset.panX || '0') || 0;
    const panY = parseFloat(cloud.dataset.panY || '0') || 0;
    const cx = stage.clientWidth / 2;
    const cy = stage.clientHeight / 2;
    const maxDist = Math.max(120, Math.min(cx, cy) * 0.92);

    cloud.querySelectorAll('.genre-watch-bubble').forEach((bubble) => {
        const wx = parseFloat(bubble.dataset.wx || '0') || 0;
        const wy = parseFloat(bubble.dataset.wy || '0') || 0;
        const x = cx + wx + panX;
        const y = cy + wy + panY;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const t = Math.min(1, dist / maxDist);
        const scale = Math.max(0.42, 1.18 - t * 0.9);
        const opacity = Math.max(0.28, 1 - t * 0.75);
        const z = Math.round(1000 - dist);
        bubble.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
        bubble.style.opacity = String(opacity);
        bubble.style.zIndex = String(z);
    });
}

function bindGenreWatchInteractionOnce() {
    const stage = document.getElementById('genreWatchStage');
    const cloud = document.getElementById('genreWatchCloud');
    if (!stage || !cloud || stage.dataset.watchBound === '1') return;
    stage.dataset.watchBound = '1';

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let basePanX = 0;
    let basePanY = 0;
    let raf = 0;

    const onMove = (clientX, clientY) => {
        if (!dragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
        cloud.dataset.panX = String(basePanX + dx);
        cloud.dataset.panY = String(basePanY + dy);
        if (!raf) {
            raf = requestAnimationFrame(() => {
                raf = 0;
                applyGenreWatchTransforms();
            });
        }
    };

    stage.addEventListener(
        'pointerdown',
        (e) => {
            if (e.button != null && e.button !== 0) return;
            dragging = true;
            moved = false;
            startX = e.clientX;
            startY = e.clientY;
            basePanX = parseFloat(cloud.dataset.panX || '0') || 0;
            basePanY = parseFloat(cloud.dataset.panY || '0') || 0;
            stage.setPointerCapture?.(e.pointerId);
            stage.classList.add('is-dragging');
        },
        { passive: true }
    );

    stage.addEventListener(
        'pointermove',
        (e) => {
            onMove(e.clientX, e.clientY);
        },
        { passive: true }
    );

    const endDrag = () => {
        dragging = false;
        stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    cloud.addEventListener('click', (e) => {
        if (moved) {
            e.preventDefault();
            e.stopPropagation();
            moved = false;
            return;
        }
        const bubble = e.target.closest('.genre-watch-bubble');
        if (!bubble || bubble.classList.contains('genre-adult-locked')) return;
        const input = bubble.querySelector('input[type="checkbox"]');
        if (!input || input.disabled) return;
        // label handles toggle; sync UI after tick
        setTimeout(() => {
            bubble.classList.toggle('is-checked', !!input.checked);
            updateGenreWatchSelectedLabel();
            if (typeof applyFilters === 'function') applyFilters(false);
            if (typeof updateFilterButtonText === 'function') {
                const selected = [
                    ...document.querySelectorAll('#genreWatchCloud input[type="checkbox"]:checked')
                ].map((cb) => cb.value);
                updateFilterButtonText('filterGenreBtn', selected);
            }
        }, 0);
    });

    // Keep transforms fresh when panel opens / resizes
    const panel = document.getElementById('filterGenrePanel');
    if (panel && typeof MutationObserver !== 'undefined') {
        const mo = new MutationObserver(() => {
            if (panel.classList.contains('active')) {
                requestAnimationFrame(() => {
                    layoutGenreWatchBubbles();
                });
            }
        });
        mo.observe(panel, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener(
        'resize',
        () => {
            if (panel && panel.classList.contains('active')) applyGenreWatchTransforms();
        },
        { passive: true }
    );
}

function bindGenreAdultPanelOnce() {
    const panel = document.getElementById('filterGenrePanel');
    if (!panel || panel.dataset.adultGenreBound === '1') return;
    panel.dataset.adultGenreBound = '1';
    panel.addEventListener('click', (e) => {
        const row = e.target.closest('.genre-adult-locked');
        if (!row) return;
        if (typeof isAdultContentEnabled === 'function' && isAdultContentEnabled()) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof openAdultUnlockModal === 'function') openAdultUnlockModal();
    });
}

// Загрузка жанров в фильтры (Apple Watch–style облако)
function loadGenres() {
    const panel = document.getElementById('filterGenrePanel');
    if (!panel) return;

    const cloud = document.getElementById('genreWatchCloud') || panel.querySelector('.filter-dropdown-inner, .filter-genres-grid');
    if (!cloud) return;

    const adultLabels =
        (typeof window.reminkoAdultGenreLabels !== 'undefined' && window.reminkoAdultGenreLabels) || [
            'Хентай',
            'Эротика'
        ];
    const genres = getAllGenres().filter((g) => !adultLabels.includes(g));
    const unlocked = typeof isAdultContentEnabled === 'function' && isAdultContentEnabled();

    const makeBubble = (genre, opts = {}) => {
        const v = escGenreAttr(genre);
        const id = `genre_${String(genre).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)}`;
        const locked = !!opts.locked;
        const adult = !!opts.adult;
        const cls = [
            'genre-watch-bubble',
            'filter-option',
            'filter-checkbox-item',
            adult ? 'genre-adult-row' : '',
            locked ? 'genre-adult-locked' : ''
        ]
            .filter(Boolean)
            .join(' ');
        return `
        <label class="${cls}" data-label="${v}" ${adult ? 'data-adult-genre="1"' : ''}>
            <input type="checkbox" value="${v}" id="${id}" ${locked ? 'disabled aria-disabled="true"' : ''}>
            <span class="genre-watch-bubble__text">${reminkoEscapeHtml(genre)}</span>
            ${locked ? '<span class="genre-adult-lock" title="Включите отображение жанров 18+ в настройках профиля">🔒</span>' : ''}
        </label>`;
    };

    const normalHtml = genres.map((genre) => makeBubble(genre)).join('');
    const adultHtml = adultLabels
        .map((genre) => makeBubble(genre, { adult: true, locked: !unlocked }))
        .join('');

    cloud.innerHTML = normalHtml + adultHtml;
    cloud.dataset.panX = '0';
    cloud.dataset.panY = '0';

    bindGenreAdultPanelOnce();
    bindGenreWatchInteractionOnce();
    layoutGenreWatchBubbles();
    updateGenreWatchSelectedLabel();

    // После загрузки жанров применяем фильтры из URL и инициализируем события
    loadFilters();
    initFilterEvents();
    // Применяем фильтры после загрузки (с небольшой задержкой, чтобы все элементы были готовы)
    setTimeout(() => {
        document.querySelectorAll('#genreWatchCloud input[type="checkbox"]').forEach((cb) => {
            const bubble = cb.closest('.genre-watch-bubble');
            if (bubble) bubble.classList.toggle('is-checked', !!cb.checked);
        });
        updateGenreWatchSelectedLabel();
        applyFilters(false);
    }, 100);
}

window.addEventListener('reminko-adult-changed', () => {
    if (document.getElementById('filterGenrePanel') && typeof loadGenres === 'function') {
        loadGenres();
    }
});

window.addEventListener('reminko-kodik-catalog-loaded', () => {
    if (document.getElementById('filterGenrePanel') && typeof loadGenres === 'function') {
        loadGenres();
    }
    if (document.getElementById('catalogResults') && typeof applyFilters === 'function') {
        applyFilters(false);
    }
});

window.addEventListener('reminko-site-catalog-jikan-loaded', () => {
    if (document.getElementById('catalogResults') && typeof applyFilters === 'function') {
        applyFilters(false);
    }
});

reminkoBindCatalogFilterDelegation();

/**
 * Главная: анонсы — календарь Kodik (data/kodik-announced.json); выходит и популярное — каталог Kodik.
 */
(function (global) {
    'use strict';

    const KODIK_HOME_LIMIT = 120;
    const KODIK_ANNOUNCED_LIMIT = 120;
    const KODIK_POPULAR_LIMIT = 50;
    const POPULAR_YEAR_FROM = 2022;
    const POPULAR_YEAR_TO = 2026;
    const POPULAR_MIN_RATING = 7.7;
    let _catalog = [];
    let _calendarItems = [];
    let _kodikCalendarItems = [];
    let _kodikAnnouncedItems = [];
    let _calendarMalIds = new Set();
    let _inited = false;
    let _initPromise = null;

    const KODIK_SECTIONS = [
        {
            id: 'airing',
            sectionEl: 'kodikHomeAiring',
            gridId: 'kodikAiringGrid',
            pick: pickAiring,
            moreHref: (media) => {
                if (media === 'film') {
                    const now = new Date();
                    const y = now.getFullYear();
                    return `catalog/anime.html?type=Фильм&status=Завершён&yearFrom=${y}&yearTo=${y}&sort=year-desc`;
                }
                return 'catalog/anime.html?status=Онгоинг&type=Сериал';
            },
        },
        {
            id: 'popular',
            sectionEl: 'kodikHomePopular',
            gridId: 'kodikPopularGrid',
            pick: pickPopular,
            moreHref: (media) =>
                `catalog/anime.html?yearFrom=${POPULAR_YEAR_FROM}&yearTo=${POPULAR_YEAR_TO}&type=${media === 'film' ? 'Фильм' : 'Сериал'}&sort=rating-desc`,
        },
    ];

    function catalogUrl(rel) {
        const cfg = global.APP_CONFIG && global.APP_CONFIG.kodik;
        const path = rel || 'data/kodik-calendar.json';
        if (/^https?:\/\//i.test(path)) return path;
        const base =
            (global.APP_CONFIG && global.APP_CONFIG.siteOrigin) ||
            (global.location && global.location.origin) ||
            '';
        if (base && !base.includes('localhost') && !String(global.location?.protocol).startsWith('file')) {
            return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
        }
        const depth =
            global.location && global.location.pathname
                ? (global.location.pathname.match(/\//g) || []).length - 1
                : 0;
        const prefix = depth > 0 ? '../'.repeat(depth) : '';
        return prefix + path.replace(/^\//, '');
    }

    async function loadKodikAnnouncedItems() {
        try {
            const res = await fetch(catalogUrl('data/kodik-announced.json'), {
                credentials: 'omit',
                cache: 'default',
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            _kodikAnnouncedItems = Array.isArray(data?.items) ? data.items : [];
        } catch (_) {
            _kodikAnnouncedItems = [];
        }
    }

    function kodikAnnouncedFilter() {
        return global.ReminkoKodikAnnouncedFilter || null;
    }

    function isKodikAnnouncedRowActive(row) {
        const filter = kodikAnnouncedFilter();
        if (!filter || !row) return false;
        const mal = parseInt(row.mal_id, 10);
        const meta = Number.isFinite(mal) && mal > 0 ? catalogByMalMap().get(mal) : null;
        if (!filter.isKodikAnnouncedRow(row, meta)) return false;
        // Уже выходят серии в каталоге — это онгоинг, не анонс
        if (meta && kodikReleasedEpisodes(meta) >= 1) return false;
        if (meta && meta.status === 'Онгоинг' && kodikReleasedEpisodes(meta) >= 1) return false;
        return true;
    }

    async function loadCalendarMalIds() {
        try {
            if (typeof global.reminkoLoadCalendarData === 'function') {
                _kodikCalendarItems = (await global.reminkoLoadCalendarData()) || [];
            }
            if (typeof global.reminkoLoadAllCalendarData === 'function') {
                await global.reminkoLoadAllCalendarData();
            } else if (typeof global.reminkoLoadCalendarData === 'function') {
                await global.reminkoLoadCalendarData();
            }
            if (typeof global.reminkoMergedCalendarItems === 'function') {
                _calendarItems = global.reminkoMergedCalendarItems();
            } else if (_kodikCalendarItems.length) {
                _calendarItems = _kodikCalendarItems;
            } else if (typeof global.reminkoLoadCalendarData === 'function') {
                _calendarItems = (await global.reminkoLoadCalendarData()) || [];
            }
            const set = new Set();
            for (const row of _calendarItems) {
                const mal = parseInt(row.mal_id, 10);
                if (!Number.isNaN(mal) && mal > 0) set.add(mal);
            }
            _calendarMalIds = set;
        } catch (_) {
            _calendarItems = [];
            _kodikCalendarItems = [];
            _calendarMalIds = new Set();
        }
    }

    function mergedCalendarRowForMal(malId) {
        if (typeof global.reminkoCalendarRowForMal === 'function') {
            return global.reminkoCalendarRowForMal(malId);
        }
        return calendarRowForMal(malId);
    }

    function kodikReleasedEpisodes(anime) {
        if (!anime) return 0;
        if (anime._kodik && anime._kodik.lastEpisode != null) {
            const n = parseInt(anime._kodik.lastEpisode, 10);
            if (Number.isFinite(n)) return Math.max(0, n);
        }
        if (anime.episodes === '0' || anime.episodes === 0) return 0;
        const epStr = anime.episodes != null ? String(anime.episodes).trim() : '';
        if (epStr) {
            const range = epStr.match(/(\d+)\s*-\s*(\d+)/);
            if (range) {
                const hi = parseInt(range[2], 10);
                const lo = parseInt(range[1], 10);
                if (Number.isFinite(hi) && hi > 0) return hi;
                if (Number.isFinite(lo) && lo > 0) return lo;
            }
            const single = parseInt(epStr, 10);
            if (Number.isFinite(single) && single > 0) return single;
        }
        const total = parseInt(anime.totalEpisodes, 10);
        if (anime.status === 'Онгоинг' && Number.isFinite(total) && total > 0) return Math.max(1, total);
        if (anime.status === 'Онгоинг') return 1;
        return 0;
    }

    function calendarRowForMal(malId) {
        const mal = parseInt(malId, 10);
        if (Number.isNaN(mal)) return null;
        return _kodikCalendarItems.find((r) => parseInt(r.mal_id, 10) === mal) || null;
    }

    function kodikAnnouncedRowForMal(malId) {
        const mal = parseInt(malId, 10);
        if (Number.isNaN(mal)) return null;
        return _kodikAnnouncedItems.find((r) => parseInt(r.mal_id, 10) === mal) || null;
    }

    function isKodikHomeAnnounced(anime) {
        if (!anime) return false;
        if (anime.isKodikCalendarAnnounced || anime.isCalendarAnnounced) return true;
        if (anime.status === 'Анонс' && anime.type === 'Сериал' && kodikReleasedEpisodes(anime) === 0) {
            return true;
        }
        return false;
    }

    /** Выходит: онгоинг и уже есть ≥1 серия; не анонс; не завершённый тайтл с ошибочным статусом. */
    function isKodikHomeAiring(anime) {
        if (!anime || isKodikHomeAnnounced(anime)) return false;
        const effective =
            typeof global.reminkoIsTrueAiringAnime === 'function'
                ? global.reminkoIsTrueAiringAnime(anime)
                : anime.status === 'Онгоинг';
        if (!effective) return false;
        if (anime.type === 'Фильм') return true;
        return kodikReleasedEpisodes(anime) >= 1;
    }

    /**
     * Детские / ежедневные мультсериалы — не в ленте «Сейчас выходят».
     * Только явный kids-фильтр (MAL/жанр/название).
     * НЕ вызывать reminkoIsKidsCartoonCalendarRow: там mislabeled-premiere
     * помечает любой онгоинг с 2+ сериями как «мульт» → лента пустеет.
     */
    function isKidsCartoonForHomeAiring(anime) {
        if (!anime) return false;
        const filter = kodikAnnouncedFilter();
        if (!filter || typeof filter.isKidsCartoonRow !== 'function') return false;
        return filter.isKidsCartoonRow(
            { mal_id: anime.mal_id, title_ru: anime.title, title: anime.title },
            anime
        );
    }

    function malPosterUrl(malId) {
        const mal = parseInt(malId, 10);
        if (Number.isNaN(mal) || mal <= 0) return '';
        const kodikAnn = kodikAnnouncedRowForMal(mal);
        if (kodikAnn?.posterUrl && String(kodikAnn.posterUrl).trim()) {
            return String(kodikAnn.posterUrl).trim();
        }
        const kodikCal = calendarRowForMal(mal);
        if (kodikCal?.posterUrl && String(kodikCal.posterUrl).trim()) {
            return String(kodikCal.posterUrl).trim();
        }
        if (typeof global.readMalPosterCache === 'function') {
            const cached = global.readMalPosterCache(mal);
            if (cached) return cached;
        }
        return '';
    }

    function isValidHomePosterUrl(url) {
        const u = String(url || '').trim();
        if (!u || u.startsWith('data:')) return false;
        if (
            typeof global.isShikimoriPlaceholderPoster === 'function' &&
            global.isShikimoriPlaceholderPoster(u)
        ) {
            return false;
        }
        if (
            typeof global.isShikimoriDirectMalPoster === 'function' &&
            global.isShikimoriDirectMalPoster(u)
        ) {
            return false;
        }
        return true;
    }

    function resolveKodikHomePosterUrl(anime) {
        if (!anime) return '';
        const mal = parseInt(anime.mal_id, 10);
        const candidates = [];
        if (anime.posterUrl) candidates.push(String(anime.posterUrl).trim());
        const row =
            anime._calendarRow ||
            (anime.isKodikCalendarAnnounced ? kodikAnnouncedRowForMal(anime.mal_id) : null) ||
            (anime.isKodikCalendarAnnounced ? null : mergedCalendarRowForMal(anime.mal_id));
        if (row?.posterUrl) candidates.push(String(row.posterUrl).trim());
        if (Number.isFinite(mal) && mal > 0) {
            candidates.push(malPosterUrl(mal));
            if (global.shikimoriApi?.readCachedByMalId) {
                const sh = global.shikimoriApi.readCachedByMalId(mal);
                if (sh?.image?.original && typeof global.shikimoriPosterUrlFromPath === 'function') {
                    candidates.push(global.shikimoriPosterUrlFromPath(sh.image.original));
                }
            }
        }
        for (const u of candidates) {
            if (isValidHomePosterUrl(u)) return u;
        }
        return '';
    }

    function animeContextForKodikHomeCard(anime) {
        if (!anime) return null;
        const mal = parseInt(anime.mal_id, 10);
        const cal =
            anime._calendarRow ||
            (anime.isKodikCalendarAnnounced ? kodikAnnouncedRowForMal(anime.mal_id) : null) ||
            mergedCalendarRowForMal(anime.mal_id);
        const searchTitles = Array.isArray(anime._posterSearchTitles)
            ? [...anime._posterSearchTitles]
            : [];
        if (cal?.title_en) searchTitles.push(cal.title_en);
        if (cal?.title_ru) searchTitles.push(cal.title_ru);
        if (anime.titleAlt) searchTitles.push(anime.titleAlt);
        return {
            ...anime,
            mal_id: mal,
            posterUrl: resolveKodikHomePosterUrl(anime) || anime.posterUrl || '',
            titleAlt: anime.titleAlt || cal?.title_en || cal?.title_ru || anime.title || '',
            _calendarRow: cal || anime._calendarRow,
            _posterSearchTitles: searchTitles.length ? searchTitles : anime._posterSearchTitles,
        };
    }

    function applyShikiPosterToKodikCard(card, malId, sh) {
        if (!card || !sh?.image?.original) return;
        const u =
            typeof global.shikimoriPosterUrlFromPath === 'function'
                ? global.shikimoriPosterUrlFromPath(sh.image.original)
                : '';
        if (!isValidHomePosterUrl(u)) return;
        const img = card.querySelector('.jikan-card-poster img');
        if (!img) return;
        img.classList.remove('is-poster-missing');
        img.src = u;
        if (typeof global.writeMalPosterCache === 'function') {
            global.writeMalPosterCache(malId, u);
        }
    }

    function applyShikimoriToKodikHomeStrip(container, items) {
        if (!container || !global.shikimoriApi?.enqueueFetchShikimoriByMalId) return;
        const seen = new Set();
        for (const anime of items || []) {
            const mal = parseInt(anime?.mal_id, 10);
            if (!Number.isFinite(mal) || mal <= 0 || seen.has(mal)) continue;
            seen.add(mal);
            const card = container.querySelector(`.kodik-home-card[data-mal-id="${mal}"]`);
            if (!card) continue;
            const searchTitle = anime.titleAlt || anime.title || '';
            void global.shikimoriApi
                .enqueueFetchShikimoriByMalId(mal, searchTitle)
                .then((sh) => applyShikiPosterToKodikCard(card, mal, sh))
                .catch(() => {});
        }
    }

    function jikanRawFromKodikHomeAnime(anime) {
        if (anime._jikanRaw) return anime._jikanRaw;
        const mal = parseInt(anime.mal_id, 10);
        if (!Number.isFinite(mal) || mal <= 0) return null;
        const row = anime._calendarRow;
        let poster = (anime.posterUrl && String(anime.posterUrl).trim()) || '';
        if (
            poster &&
            typeof global.isShikimoriDirectMalPoster === 'function' &&
            global.isShikimoriDirectMalPoster(poster)
        ) {
            poster = '';
        }
        if (!poster && row?.posterUrl) poster = String(row.posterUrl).trim();
        const titleEn = anime.titleAlt || row?.title_ru || anime.title || '';
        const stub = {
            mal_id: mal,
            title: titleEn,
            title_english: anime.titleAlt || titleEn,
            status: 'Not yet aired',
            type: anime.type === 'Фильм' ? 'Movie' : 'TV',
            score: anime.rating || 0,
            synopsis: 'Описание появится позже.'
        };
        if (poster) stub.images = { jpg: { image_url: poster, large_image_url: poster } };
        return stub;
    }

    function filterAdult(list) {
        const adultOk =
            typeof global.isAdultContentEnabled === 'function' && global.isAdultContentEnabled();
        if (adultOk || typeof global.animeHasRestrictedGenre !== 'function') return list;
        return list.filter((a) => !global.animeHasRestrictedGenre(a));
    }

    function normalizeMediaType(mediaType) {
        return mediaType === 'film' ? 'film' : 'serial';
    }

    function matchMedia(anime, mediaType) {
        const m = normalizeMediaType(mediaType);
        if (m === 'film') return anime && anime.type === 'Фильм';
        return anime && anime.type === 'Сериал';
    }

    function currentYearMonth() {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    }

    /** Дата выхода фильма: календарь Shikimori или дата обновления в Kodik. */
    function parseFilmReleaseDate(anime) {
        if (!anime) return null;
        const cal = mergedCalendarRowForMal(anime.mal_id);
        if (cal && isCalendarRowFilm(cal)) {
            const t = Date.parse(cal.next_at || cal.nextAt);
            if (Number.isFinite(t)) return new Date(t);
        }
        if (anime._kodik && anime._kodik.updatedAt) {
            const t = Date.parse(anime._kodik.updatedAt);
            if (Number.isFinite(t)) return new Date(t);
        }
        return null;
    }

    /** Фильм уже вышел в текущем календарном месяце. */
    function isFilmReleasedThisMonth(anime) {
        if (!anime || anime.type !== 'Фильм') return false;
        if (isKodikHomeAnnounced(anime)) return false;
        const d = parseFilmReleaseDate(anime);
        if (!d || d.getTime() > Date.now()) return false;
        const { year, month } = currentYearMonth();
        return d.getFullYear() === year && d.getMonth() === month;
    }

    function pickAiringFilmsThisMonth(all) {
        const list = all.filter((a) => isFilmReleasedThisMonth(a));
        list.sort((a, b) => {
            const da = parseFilmReleaseDate(a);
            const db = parseFilmReleaseDate(b);
            const ta = da ? da.getTime() : 0;
            const tb = db ? db.getTime() : 0;
            if (tb !== ta) return tb - ta;
            return (b.rating || 0) - (a.rating || 0);
        });
        return list.slice(0, KODIK_HOME_LIMIT);
    }

    function pickAiring(all, mediaType) {
        if (normalizeMediaType(mediaType) === 'film') {
            return pickAiringFilmsThisMonth(all);
        }
        const list = all.filter(
            (a) =>
                matchMedia(a, mediaType) &&
                isKodikHomeAiring(a) &&
                !isKidsCartoonForHomeAiring(a)
        );
        list.sort((a, b) => {
            const ac = mergedCalendarRowForMal(a.mal_id) || a._calendar;
            const bc = mergedCalendarRowForMal(b.mal_id) || b._calendar;
            const ap = ac && a.mal_id != null && _calendarMalIds.has(a.mal_id) ? 2 : 0;
            const bp = bc && b.mal_id != null && _calendarMalIds.has(b.mal_id) ? 2 : 0;
            if (bp !== ap) return bp - ap;
            const at = ac && (ac.next_at || ac.nextAt) ? Date.parse(ac.next_at || ac.nextAt) || Infinity : Infinity;
            const bt = bc && (bc.next_at || bc.nextAt) ? Date.parse(bc.next_at || bc.nextAt) || Infinity : Infinity;
            if (at !== bt) return at - bt;
            const ar = a.rating || 0;
            const br = b.rating || 0;
            if (br !== ar) return br - ar;
            return (b._kodikScore || 0) - (a._kodikScore || 0);
        });
        return list.slice(0, KODIK_HOME_LIMIT);
    }

    function catalogByMalMap() {
        const map = new Map();
        for (const a of _catalog) {
            const mal = parseInt(a.mal_id, 10);
            if (Number.isFinite(mal) && mal > 0) map.set(mal, a);
        }
        return map;
    }

    function isCalendarRowFilm(row) {
        if (!row) return false;
        if (row.type === 'Фильм') return true;
        const k = String(row.kind || '').toLowerCase();
        return k === 'movie' || k === 'mv' || k === 'film';
    }

    function calendarRowMatchesMedia(row, mediaType) {
        const m = normalizeMediaType(mediaType);
        const isFilm = isCalendarRowFilm(row);
        return m === 'film' ? isFilm : !isFilm;
    }

    function announcedCardFromKodikRow(row, catMap) {
        const mal = parseInt(row.mal_id, 10);
        const calRow = {
            mal_id: mal,
            next_episode: row.next_episode,
            next_at: row.next_at,
            title_ru: row.title_ru,
            title_en: row.title_en,
            kind: row.kind,
            status: row.status,
            episodes_aired: row.episodes_aired,
            posterUrl: row.posterUrl || '',
            score: row.score || 0,
        };
        const catalogItem = Number.isFinite(mal) && mal > 0 ? catMap.get(mal) : null;
        if (catalogItem && kodikReleasedEpisodes(catalogItem) >= 1) {
            return null;
        }
        if (catalogItem && catalogItem.isKodikCatalog !== false) {
            return {
                ...catalogItem,
                title: row.title_ru || catalogItem.title,
                titleAlt: row.title_en || catalogItem.titleAlt || catalogItem.title,
                posterUrl: calRow.posterUrl || catalogItem.posterUrl || '',
                status: 'Анонс',
                isKodikCalendarAnnounced: true,
                _calendarRow: calRow,
            };
        }
        const isFilm = isCalendarRowFilm(row);
        return {
            id: `kodik-ann-${mal}`,
            mal_id: mal,
            title: row.title_ru || '—',
            titleAlt: row.title_en || row.title_ru || '',
            type: isFilm ? 'Фильм' : 'Сериал',
            status: 'Анонс',
            isKodikCalendarAnnounced: true,
            rating: row.score || 0,
            genres: [],
            posterUrl: calRow.posterUrl || '',
            _calendarRow: calRow,
        };
    }

    function pickAnnouncedCatalogSerialSupplement(existingMals) {
        const filter = kodikAnnouncedFilter();
        const out = [];
        for (const anime of _catalog) {
            if (!anime || anime.type !== 'Сериал' || anime.isKodikCatalog === false) continue;
            const mal = parseInt(anime.mal_id, 10);
            if (!Number.isFinite(mal) || mal <= 0 || existingMals.has(mal)) continue;
            if (anime.status !== 'Анонс' || kodikReleasedEpisodes(anime) > 0) continue;
            if (filter && filter.isKidsCartoonRow({ mal_id: mal, title_ru: anime.title }, anime)) {
                continue;
            }
            out.push({ ...anime, isKodikCatalogAnnounced: true });
        }
        return out;
    }

    function pickAnnounced(_all, mediaType) {
        const m = normalizeMediaType(mediaType);
        const catMap = catalogByMalMap();
        const list = [];

        for (const row of _kodikAnnouncedItems || []) {
            if (!isKodikAnnouncedRowActive(row)) continue;
            if (!calendarRowMatchesMedia(row, m)) continue;
            const card = announcedCardFromKodikRow(row, catMap);
            if (card) list.push(card);
        }

        const existingMals = new Set(
            list.map((a) => parseInt(a.mal_id, 10)).filter((mal) => Number.isFinite(mal) && mal > 0)
        );

        if (m === 'serial') {
            for (const extra of pickAnnouncedCatalogSerialSupplement(existingMals)) {
                list.push(extra);
                existingMals.add(extra.mal_id);
            }
        }

        list.sort((a, b) => {
            const ac = a._calendarRow || kodikAnnouncedRowForMal(a.mal_id);
            const bc = b._calendarRow || kodikAnnouncedRowForMal(b.mal_id);
            const at =
                ac && (ac.next_at || ac.nextAt) ? Date.parse(ac.next_at || ac.nextAt) || Infinity : Infinity;
            const bt =
                bc && (bc.next_at || bc.nextAt) ? Date.parse(bc.next_at || bc.nextAt) || Infinity : Infinity;
            if (at !== bt) return at - bt;
            return (b.rating || 0) - (a.rating || 0);
        });

        return list.slice(0, KODIK_ANNOUNCED_LIMIT);
    }

    async function hydrateAnnouncedPosterForCard(img, anime) {
        if (!img || !anime) return;
        const mal = parseInt(anime.mal_id, 10);
        if (!Number.isFinite(mal) || mal <= 0) return;

        const ctx = animeContextForKodikHomeCard(anime);
        const syncUrl = resolveKodikHomePosterUrl(ctx);
        if (syncUrl && isValidHomePosterUrl(syncUrl)) {
            img.classList.remove('is-poster-missing');
            img.src = syncUrl;
            if (typeof global.writeMalPosterCache === 'function') {
                global.writeMalPosterCache(mal, syncUrl);
            }
            return;
        }

        if (typeof global.fetchPosterUrlForMal === 'function') {
            const url = await global.fetchPosterUrlForMal(mal, ctx);
            if (url && img.isConnected) {
                img.classList.remove('is-poster-missing');
                img.src = url;
                return;
            }
        }

        if (img.isConnected && img.naturalWidth <= 1) {
            img.classList.add('is-poster-missing');
        }
    }

    function hydrateAnnouncedPostersForGrid(container, items) {
        if (!container || !Array.isArray(items)) return;
        for (const anime of items) {
            const mal = parseInt(anime?.mal_id, 10);
            if (!Number.isFinite(mal) || mal <= 0) continue;
            const card = container.querySelector(`.kodik-home-card[data-mal-id="${mal}"]`);
            const img = card?.querySelector('.jikan-card-poster img');
            if (img) void hydrateAnnouncedPosterForCard(img, anime);
        }
    }

    function resolveCardCountdownIso(anime, shiki) {
        const cal =
            mergedCalendarRowForMal(anime.mal_id) ||
            anime._calendarRow ||
            anime._calendar ||
            (anime.mal_id != null ? calendarRowForMal(anime.mal_id) : null);
        if (typeof global.reminkoResolveCountdownTargetIso === 'function') {
            const iso = global.reminkoResolveCountdownTargetIso(anime, shiki || null, {
                calendar: cal,
                _calendar: cal
            });
            if (iso && Date.parse(iso) > Date.now()) return iso;
        }
        const raw = cal && (cal.next_at || cal.nextAt);
        if (raw && Date.parse(raw) > Date.now()) return String(raw);
        if (shiki && shiki.next_episode_at && Date.parse(shiki.next_episode_at) > Date.now()) {
            return String(shiki.next_episode_at);
        }
        return '';
    }

    function applyCountdownToCard(card, iso) {
        if (!card || !iso) return;
        const poster = card.querySelector('.jikan-card-poster');
        if (!poster) return;
        let el = poster.querySelector('.jikan-card-countdown');
        if (!el) {
            el = document.createElement('div');
            el.className = 'jikan-card-countdown';
            el.setAttribute('aria-live', 'polite');
            poster.appendChild(el);
        }
        el.setAttribute('data-countdown-iso', iso);
        if (typeof global.reminkoStartLiveCountdown === 'function') {
            global.reminkoStartLiveCountdown(el, iso, {
                compact: true,
                unknownText: '',
                expiredText: 'скоро'
            });
        }
    }

    function updateCardEpLine(card, anime, iso) {
        if (!card || !iso || isKodikHomeAnnounced(anime)) return;
        const epEl = card.querySelector('.jikan-card-ep');
        const existing = epEl ? epEl.textContent.trim() : '';
        if (existing && (existing.includes('Серия ') || existing.includes('След. серия'))) return;

        const cal =
            mergedCalendarRowForMal(anime.mal_id) || anime._calendarRow || anime._calendar;
        const nextEp = cal && cal.next_episode != null ? parseInt(cal.next_episode, 10) : null;
        try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return;
            const dateStr = d.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
            const line =
                nextEp && nextEp > 1 ? `Серия ${nextEp}: ${dateStr}` : `След. серия: ${dateStr}`;
            if (epEl) epEl.textContent = line;
            else {
                const meta = card.querySelector('.jikan-card-meta');
                if (meta) {
                    const span = document.createElement('span');
                    span.className = 'jikan-card-ep';
                    span.textContent = line;
                    meta.prepend(span);
                }
            }
        } catch (_) {
            /* ignore */
        }
    }

    async function hydrateHomeCardCountdowns(container, items) {
        if (!container || !Array.isArray(items) || !items.length) return;
        if (!global.shikimoriApi) return;

        const byId = new Map(items.map((a) => [String(a.id), a]));
        const cards = [...container.querySelectorAll('.kodik-home-card')];
        const needFetch = [];

        for (const card of cards) {
            if (card.querySelector('.jikan-card-countdown[data-countdown-iso]')) continue;
            const anime = byId.get(card.dataset.id);
            if (!anime || anime.mal_id == null) continue;
            const mal = parseInt(anime.mal_id, 10);
            if (!Number.isFinite(mal) || mal <= 0) continue;

            const cached =
                typeof global.shikimoriApi.readCachedByMalId === 'function'
                    ? global.shikimoriApi.readCachedByMalId(mal)
                    : null;
            const iso = resolveCardCountdownIso(anime, cached);
            if (iso) {
                applyCountdownToCard(card, iso);
                updateCardEpLine(card, anime, iso);
                continue;
            }
            needFetch.push({ card, anime, mal });
        }

        const limit = container.id === 'kodikAiringGrid' ? 28 : 14;
        for (const job of needFetch.slice(0, limit)) {
            try {
                const shiki = await global.shikimoriApi.enqueueFetchShikimoriByMalId(
                    job.mal,
                    job.anime.titleAlt || job.anime.title || ''
                );
                const iso = resolveCardCountdownIso(job.anime, shiki);
                if (iso) {
                    applyCountdownToCard(job.card, iso);
                    updateCardEpLine(job.card, job.anime, iso);
                }
            } catch (_) {
                /* ignore */
            }
        }
    }

    function popularYear(anime) {
        const y = parseInt(anime && anime.year, 10);
        return Number.isFinite(y) ? y : 0;
    }

    function isPopularRecentHit(anime) {
        if (!anime || isKodikHomeAnnounced(anime)) return false;
        const year = popularYear(anime);
        if (year < POPULAR_YEAR_FROM || year > POPULAR_YEAR_TO) return false;
        if ((anime.rating || 0) < POPULAR_MIN_RATING) return false;
        return anime.status === 'Завершён' || anime.status === 'Онгоинг';
    }

    function pickPopular(all, mediaType) {
        const list = all.filter((a) => matchMedia(a, mediaType) && isPopularRecentHit(a));
        list.sort((a, b) => {
            const rd = (b.rating || 0) - (a.rating || 0);
            if (rd !== 0) return rd;
            return popularYear(b) - popularYear(a);
        });
        return list.slice(0, KODIK_POPULAR_LIMIT);
    }

    function statusLabel(anime) {
        if (!anime) return '';
        if (anime.type === 'Фильм' && isFilmReleasedThisMonth(anime)) return 'Вышел';
        if (isKodikHomeAnnounced(anime)) return 'Анонс';
        if (anime.status === 'Онгоинг') return 'Выходит';
        if (anime.status === 'Завершён') return 'Завершён';
        return anime.status || '';
    }

    function epLine(anime) {
        if (!anime) return '';
        if (anime.type === 'Фильм') {
            const d = parseFilmReleaseDate(anime);
            if (d && !Number.isNaN(d.getTime())) {
                return d.toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
            }
            const y = parseInt(anime.year, 10);
            return Number.isFinite(y) && y > 0 ? String(y) : '';
        }
        const cal =
            anime._calendarRow ||
            kodikAnnouncedRowForMal(anime.mal_id) ||
            (anime.isKodikCalendarAnnounced ? null : mergedCalendarRowForMal(anime.mal_id)) ||
            anime._calendar ||
            (anime.mal_id != null ? calendarRowForMal(anime.mal_id) : null);
        const nextAt = cal && (cal.next_at || cal.nextAt);
        const nextEp = cal && cal.next_episode != null ? parseInt(cal.next_episode, 10) : null;

        if (isKodikHomeAnnounced(anime)) {
            if (nextAt) {
                try {
                    const d = new Date(nextAt);
                    if (!Number.isNaN(d.getTime())) {
                        const dateStr = d.toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        return nextEp === 1 ? `1-я серия: ${dateStr}` : `Премьера: ${dateStr}`;
                    }
                } catch (_) {
                    /* ignore */
                }
            }
            return '0 эп.';
        }

        if (!isKodikHomeAnnounced(anime)) {
            const mal = parseInt(anime.mal_id, 10);
            const cached =
                Number.isFinite(mal) &&
                mal > 0 &&
                global.shikimoriApi &&
                typeof global.shikimoriApi.readCachedByMalId === 'function'
                    ? global.shikimoriApi.readCachedByMalId(mal)
                    : null;
            const countdownIso = resolveCardCountdownIso(anime, cached);
            const showAt = countdownIso || nextAt;
            if (showAt) {
                try {
                    const d = new Date(showAt);
                    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) {
                        const dateStr = d.toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        if (nextEp && nextEp > 1) return `Серия ${nextEp}: ${dateStr}`;
                        return `След. серия: ${dateStr}`;
                    }
                } catch (_) {
                    /* ignore */
                }
            }
        }

        if (anime.episodes) return `${anime.episodes} эп.`;
        if (anime.totalEpisodes) return `${anime.totalEpisodes} эп.`;
        return '';
    }

    function cardCountdownHtml(anime) {
        const mal = parseInt(anime.mal_id, 10);
        const cached =
            Number.isFinite(mal) &&
            mal > 0 &&
            global.shikimoriApi &&
            typeof global.shikimoriApi.readCachedByMalId === 'function'
                ? global.shikimoriApi.readCachedByMalId(mal)
                : null;
        const iso = resolveCardCountdownIso(anime, cached);
        if (!iso) return '';
        return `<div class="jikan-card-countdown" data-countdown-iso="${String(iso).replace(/"/g, '&quot;')}" aria-live="polite"></div>`;
    }

    function navigateKodikCard(anime) {
        try {
            global.sessionStorage.setItem('previousUrl', global.location.href);
            if ((anime.isKodikCalendarAnnounced || anime.isCalendarAnnounced) && anime.mal_id != null) {
                const mal = parseInt(anime.mal_id, 10);
                if (Number.isFinite(mal) && mal > 0) {
                    const raw = jikanRawFromKodikHomeAnime(anime);
                    const virtualId = 10_000_000 + mal;
                    if (raw) {
                        global.sessionStorage.setItem('jikanAnimeData', JSON.stringify(raw));
                    }
                    global.sessionStorage.setItem('viewAnimeId', String(virtualId));
                    global.location.href = `anime/view.html?id=${encodeURIComponent(String(virtualId))}&mal_id=${encodeURIComponent(String(mal))}`;
                    return;
                }
            }
            global.sessionStorage.setItem('viewAnimeId', String(anime.id));
        } catch (_) {
            /* ignore */
        }
        global.location.href = `anime/view.html?id=${encodeURIComponent(String(anime.id))}`;
    }

    function createKodikHomeCard(anime) {
        const card = document.createElement('div');
        card.className = 'jikan-card kodik-home-card';
        card.dataset.id = String(anime.id);
        if (anime.mal_id != null) card.dataset.malId = String(anime.mal_id);

        const imgUrl = resolveKodikHomePosterUrl(anime);
        const score = anime.rating ? Number(anime.rating).toFixed(1) : '—';
        const title = anime.title || anime.titleAlt || '—';
        const status = statusLabel(anime);
        const genres = Array.isArray(anime.genres) ? anime.genres.slice(0, 2).join(', ') : '';
        const ep = epLine(anime);
        const countdown = cardCountdownHtml(anime);

        card.innerHTML = `
        <div class="jikan-card-poster">
            <img src="${imgUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" alt="" decoding="async" loading="lazy" referrerpolicy="no-referrer" data-poster-fallback="1">
            <div class="jikan-card-poster-hover" aria-hidden="true">
                <button type="button" class="jikan-card-go-btn">Перейти</button>
            </div>
            ${score !== '—' ? `<div class="jikan-card-score">${score}</div>` : ''}
            ${status ? `<div class="jikan-card-status">${status}</div>` : ''}
            ${countdown}
        </div>
        <div class="jikan-card-info">
            <div class="jikan-card-title"></div>
            <div class="jikan-card-meta">
                ${ep ? `<span class="jikan-card-ep">${ep}</span>` : ''}
                ${genres ? `<span>${genres}</span>` : ''}
            </div>
        </div>
    `;

        const titleEl = card.querySelector('.jikan-card-title');
        if (titleEl) {
            titleEl.textContent = title;
            titleEl.setAttribute('title', title);
        }
        const posterImg = card.querySelector('.jikan-card-poster img');
        if (posterImg) {
            posterImg.alt = title;
            void hydrateAnnouncedPosterForCard(posterImg, anime);
        }

        const go = () => navigateKodikCard(anime);
        card.addEventListener('click', go);
        const goBtn = card.querySelector('.jikan-card-go-btn');
        if (goBtn) {
            goBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                go();
            });
        }
        return card;
    }

    async function hydrateKodikHomePosters(container, items) {
        if (!container) return;
        const imgs = container.querySelectorAll('img[data-poster-fallback]');
        for (const img of imgs) {
            const card = img.closest('.kodik-home-card');
            let malId = card?.dataset?.malId;
            if (!malId) continue;
            if (typeof global.reminkoNormalizeMalId === 'function') {
                const norm = global.reminkoNormalizeMalId(malId);
                if (Number.isFinite(norm) && norm > 0) malId = String(norm);
            }
            if (typeof global.attachJikanPosterFallback === 'function') {
                const cardAnime = Array.isArray(items)
                    ? items.find((a) => parseInt(a?.mal_id, 10) === parseInt(malId, 10))
                    : null;
                const ctx = cardAnime ? animeContextForKodikHomeCard(cardAnime) : { mal_id: parseInt(malId, 10) };
                const hasPoster =
                    img.src &&
                    !img.src.startsWith('data:') &&
                    isValidHomePosterUrl(img.src);
                if (!hasPoster) {
                    global.attachJikanPosterFallback(img, malId, ctx);
                }
            }
        }
    }

    function renderSectionGrid(gridId, items) {
        const container = document.getElementById(gridId);
        if (!container) return;

        if (container._homeHorizontalTeardown) {
            container._homeHorizontalTeardown();
        }

        container.innerHTML = '';
        if (!items.length) {
            container.innerHTML = '<div class="home-loading-placeholder">Пока нет тайтлов в этой категории</div>';
            return;
        }

        for (const anime of items) {
            container.appendChild(createKodikHomeCard(anime));
        }

        void hydrateAnnouncedPostersForGrid(container, items);
        applyShikimoriToKodikHomeStrip(container, items);

        if (typeof global.reminkoStartLiveCountdown === 'function') {
            container.querySelectorAll('.jikan-card-countdown[data-countdown-iso]').forEach((el) => {
                const iso = el.getAttribute('data-countdown-iso');
                if (!iso) return;
                global.reminkoStartLiveCountdown(el, iso, {
                    compact: true,
                    unknownText: '',
                    expiredText: 'скоро'
                });
            });
        }

        void hydrateHomeCardCountdowns(container, items);

        global.requestAnimationFrame(() => {
            if (typeof global.enhanceHomeHorizontalScroll === 'function') {
                global.enhanceHomeHorizontalScroll(container);
            }
        });
    }

    function getSectionMedia(section) {
        return section && section.dataset.activeMedia === 'film' ? 'film' : 'serial';
    }

    function setSectionMediaUi(section, media) {
        if (!section) return;
        section.dataset.activeMedia = media;
        section.querySelectorAll('.home-type-toggle-btn').forEach((b) => {
            const btnMedia = b.dataset.media === 'film' ? 'film' : 'serial';
            const active = btnMedia === media;
            b.classList.toggle('is-active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    function renderSection(cfg, media) {
        const section = document.getElementById(cfg.sectionEl);
        if (!section) return;
        const m = normalizeMediaType(media);
        section.hidden = false;
        section.removeAttribute('aria-hidden');
        setSectionMediaUi(section, m);
        renderSectionGrid(cfg.gridId, cfg.pick(_catalog, m));
        const more = section.querySelector('.section-more-link');
        if (more && cfg.moreHref) more.href = cfg.moreHref(m);
    }

    function renderAnnouncedSection(media) {
        const m = normalizeMediaType(media);
        const section = document.getElementById('kodikHomeAnnounced');
        if (section) {
            section.hidden = false;
            section.removeAttribute('aria-hidden');
            setSectionMediaUi(section, m);
            const more = section.querySelector('.section-more-link');
            if (more) {
                more.href = 'catalog/calendar.html';
            }
        }

        renderSectionGrid('kodikAnnouncedGrid', pickAnnounced(_catalog, m));
    }

    async function renderAllSections(defaultMedia) {
        const media = normalizeMediaType(defaultMedia);
        for (const cfg of KODIK_SECTIONS) {
            renderSection(cfg, media);
        }
        void renderAnnouncedSection(media);
    }

    function refreshKodikHomeSections(skipAnnounced) {
        if (!document.querySelector('.home-page')) return;
        for (const cfg of KODIK_SECTIONS) {
            const section = document.getElementById(cfg.sectionEl);
            if (!section || !_catalog.length) continue;
            renderSection(cfg, getSectionMedia(section));
        }
        if (!skipAnnounced) {
            const annSection = document.getElementById('kodikHomeAnnounced');
            void renderAnnouncedSection(annSection ? getSectionMedia(annSection) : 'serial');
        }
    }

    /** Делегирование: apply-navigation копирует main через innerHTML — прямые listeners слетают. */
    function bindKodikHomeToggleDelegation() {
        if (global.__reminkoKodikHomeToggleDelegation) return;
        global.__reminkoKodikHomeToggleDelegation = true;

        document.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest && e.target.closest('.home-type-toggle-btn');
            if (!btn) return;
            const section = btn.closest('.home-section--kodik');
            if (!section) return;

            e.preventDefault();
            const media = btn.dataset.media === 'film' ? 'film' : 'serial';

            if (section.id === 'kodikHomeAnnounced') {
                void renderAnnouncedSection(media);
                return;
            }

            const cfg = KODIK_SECTIONS.find((s) => s.sectionEl === section.id);
            if (!cfg || !_catalog.length) return;
            renderSection(cfg, media);
        });
    }

    async function initKodikHomeSections() {
        if (!document.querySelector('.home-page')) return;
        if (_initPromise) return _initPromise;

        _initPromise = (async () => {
            bindKodikHomeToggleDelegation();

            await loadKodikAnnouncedItems();

            if (typeof global.KodikCatalogStore?.load === 'function') {
                try {
                    await global.KodikCatalogStore.load();
                } catch (_) {
                    /* ignore */
                }
            }
            const raw =
                typeof global.KodikCatalogStore?.getAll === 'function'
                    ? global.KodikCatalogStore.getAll()
                    : typeof global.getAllAnime === 'function'
                      ? global.getAllAnime().filter((a) => a.isKodikCatalog)
                      : [];
            _catalog = filterAdult(raw);
            await loadCalendarMalIds();
            await renderAllSections('serial');
            _inited = true;

            const stats = document.getElementById('heroStats');
            if (stats) stats.hidden = false;
        })();

        return _initPromise;
    }

    global.initKodikHomeSections = initKodikHomeSections;
    global.refreshKodikHomeSections = refreshKodikHomeSections;

    global.addEventListener('reminko-kodik-catalog-loaded', () => {
        if (!_inited) initKodikHomeSections();
        else refreshKodikHomeSections();
    });

    global.addEventListener('reminko:navigation-applied', (e) => {
        if (!_inited) {
            void initKodikHomeSections();
            return;
        }
        if (e?.detail?.preservedMain) {
            refreshKodikHomeSections(false);
            return;
        }
        refreshKodikHomeSections(false);
    });
})(typeof window !== 'undefined' ? window : globalThis);

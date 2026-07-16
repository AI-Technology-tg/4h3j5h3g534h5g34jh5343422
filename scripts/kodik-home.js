/**
 * Главная: анонсы — Jikan; выходит и популярное — Kodik. Переключатель Сериалы|Фильмы.
 */
(function (global) {
    'use strict';

    const KODIK_HOME_LIMIT = 56;
    const KODIK_POPULAR_LIMIT = 50;
    const POPULAR_YEAR_FROM = 2022;
    const POPULAR_YEAR_TO = 2026;
    const POPULAR_MIN_RATING = 7.7;
    let _catalog = [];
    let _calendarItems = [];
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
        return path.replace(/^\//, '');
    }

    async function loadCalendarMalIds() {
        try {
            if (typeof global.reminkoLoadAllCalendarData === 'function') {
                await global.reminkoLoadAllCalendarData();
            } else if (typeof global.reminkoLoadCalendarData === 'function') {
                await global.reminkoLoadCalendarData();
            }
            if (typeof global.reminkoMergedCalendarItems === 'function') {
                _calendarItems = global.reminkoMergedCalendarItems();
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
        return _calendarItems.find((r) => parseInt(r.mal_id, 10) === mal) || null;
    }

    /**
     * Анонс: сериал без ни одной вышедшей серии (или явный статус «Анонс»).
     * Фильм: только статус «Анонс» (в Kodik у фильмов нет счётчика серий).
     */
    function isKodikHomeAnnounced(anime) {
        if (!anime) return false;
        if (anime.isCalendarAnnounced) return true;
        if (anime.status === 'Анонс') return true;
        if (anime.type === 'Фильм') return anime.status === 'Анонс';
        const released = kodikReleasedEpisodes(anime);
        return released === 0;
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

    function malPosterUrl(malId) {
        const mal = parseInt(malId, 10);
        if (Number.isNaN(mal) || mal <= 0) return '';
        if (typeof global.readMalPosterCache === 'function') {
            const cached = global.readMalPosterCache(mal);
            if (cached) return cached;
        }
        return '';
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
        const list = all.filter((a) => matchMedia(a, mediaType) && isKodikHomeAiring(a));
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
        const k = String(row && row.kind ? row.kind : '').toLowerCase();
        return k === 'movie' || k === 'mv' || k === 'film';
    }

    function calendarRowMatchesMedia(row, mediaType) {
        const m = normalizeMediaType(mediaType);
        const isFilm = isCalendarRowFilm(row);
        return m === 'film' ? isFilm : !isFilm;
    }

    function virtualAnimeFromCalendarRow(row) {
        const mal = parseInt(row.mal_id, 10);
        const isFilm = isCalendarRowFilm(row);
        const ep = parseInt(row.next_episode, 10) || 1;
        const isAnn = row.status === 'anons' || ep <= 1;
        return {
            id: `shiki-cal-${mal}`,
            mal_id: mal,
            title: row.title_ru || '—',
            titleAlt: row.title_ru || '',
            type: isFilm ? 'Фильм' : 'Сериал',
            status: isAnn ? 'Анонс' : 'Онгоинг',
            isCalendarAnnounced: isAnn,
            rating: row.score || 0,
            genres: [],
            posterUrl:
                (row.posterUrl && String(row.posterUrl).trim()) ||
                (Number.isFinite(mal) && mal > 0 ? malPosterUrl(mal) : ''),
            _calendarRow: row
        };
    }

    function pickShikimoriAnnouncedExtras(all, mediaType, excludeMal) {
        if (
            typeof global.reminkoMergedCalendarItems !== 'function' ||
            typeof global.reminkoSplitCalendarRows !== 'function'
        ) {
            return [];
        }
        const metaByMal = catalogByMalMap();
        const merged = global.reminkoMergedCalendarItems();
        const { announced } = global.reminkoSplitCalendarRows(merged, metaByMal);
        const now = Date.now();
        const out = [];
        for (const row of announced) {
            const mal = parseInt(row.mal_id, 10);
            if (!Number.isFinite(mal) || mal <= 0) continue;
            if (excludeMal.has(mal)) continue;
            if (!calendarRowMatchesMedia(row, mediaType)) continue;
            const t = Date.parse(row.next_at || row.nextAt);
            if (!Number.isFinite(t) || t <= now) continue;
            if (metaByMal.has(mal)) continue;
            out.push(virtualAnimeFromCalendarRow(row));
        }
        return out;
    }

    function pickAnnounced(all, mediaType) {
        const list = all.filter((a) => matchMedia(a, mediaType) && isKodikHomeAnnounced(a));
        list.sort((a, b) => {
            const ac = mergedCalendarRowForMal(a.mal_id) || a._calendar;
            const bc = mergedCalendarRowForMal(b.mal_id) || b._calendar;
            const at = ac && (ac.next_at || ac.nextAt) ? Date.parse(ac.next_at || ac.nextAt) || Infinity : Infinity;
            const bt = bc && (bc.next_at || bc.nextAt) ? Date.parse(bc.next_at || bc.nextAt) || Infinity : Infinity;
            if (at !== bt) return at - bt;
            return (b.rating || 0) - (a.rating || 0);
        });
        return list.slice(0, KODIK_HOME_LIMIT);
    }

    function pickAnnouncedMerged(all, mediaType) {
        const kodikItems = pickAnnounced(all, mediaType);
        const seenMal = new Set(
            kodikItems.map((a) => parseInt(a.mal_id, 10)).filter((m) => Number.isFinite(m) && m > 0)
        );
        const shikiExtras = pickShikimoriAnnouncedExtras(all, mediaType, seenMal);
        const merged = [...kodikItems, ...shikiExtras];
        merged.sort((a, b) => {
            const ac = mergedCalendarRowForMal(a.mal_id) || a._calendarRow || a._calendar;
            const bc = mergedCalendarRowForMal(b.mal_id) || b._calendarRow || b._calendar;
            const at = ac && (ac.next_at || ac.nextAt) ? Date.parse(ac.next_at || ac.nextAt) || Infinity : Infinity;
            const bt = bc && (bc.next_at || bc.nextAt) ? Date.parse(bc.next_at || bc.nextAt) || Infinity : Infinity;
            if (at !== bt) return at - bt;
            return (b.rating || 0) - (a.rating || 0);
        });
        return merged.slice(0, KODIK_HOME_LIMIT);
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
            mergedCalendarRowForMal(anime.mal_id) ||
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
            if (anime.isCalendarAnnounced && anime.mal_id != null) {
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

        const imgUrl =
            anime.posterUrl &&
            typeof global.isShikimoriPlaceholderPoster === 'function' &&
            !global.isShikimoriPlaceholderPoster(anime.posterUrl)
                ? anime.posterUrl
                : anime.posterUrl &&
                    typeof global.isShikimoriPlaceholderPoster !== 'function'
                  ? anime.posterUrl
                  : '';
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
            if (anime.mal_id != null && typeof global.attachJikanPosterFallback === 'function') {
                global.attachJikanPosterFallback(posterImg, anime.mal_id, anime._jikanRaw || anime);
            }
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

    async function hydrateKodikHomePosters(container) {
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
                global.attachJikanPosterFallback(img, malId, null);
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

        void hydrateKodikHomePosters(container);

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

    async function renderAnnouncedSection(media) {
        const m = normalizeMediaType(media);
        const section = document.getElementById('kodikHomeAnnounced');
        if (section) {
            section.hidden = false;
            section.removeAttribute('aria-hidden');
            setSectionMediaUi(section, m);
            const more = section.querySelector('.section-more-link');
            if (more) {
                more.href = `catalog/anime.html?status=Анонс&type=${m === 'film' ? 'Фильм' : 'Сериал'}`;
            }
        }

        const items = pickAnnouncedMerged(_catalog, m);
        if (items.length) {
            renderSectionGrid('kodikAnnouncedGrid', items);
            if (typeof global.appendAnnouncedHomeSection === 'function') {
                const exclude = new Set(
                    items
                        .map((anime) => (anime && anime.mal_id != null ? String(anime.mal_id) : ''))
                        .filter(Boolean)
                );
                void global.appendAnnouncedHomeSection(m, exclude);
            }
            return;
        }

        if (typeof global.loadAnnouncedHomeSection === 'function') {
            await global.loadAnnouncedHomeSection(m);
        }
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
            refreshKodikHomeSections(true);
            return;
        }
        refreshKodikHomeSections(false);
    });
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Все анонсы аниме из Jikan (seasons/upcoming + top/upcoming).
 * Общий источник для главной, каталога и календаря (вкладка «Анонсы»).
 */
(function (global) {
    'use strict';

    const JIKAN_BASE = 'https://api.jikan.moe/v4';
    const CACHE_KEY = 'reminko_jikan_announced_v3';
    const CACHE_LS_KEY = 'reminko_jikan_announced_ls_v2';
    const CACHE_TTL = 25 * 60 * 1000;
    const CACHE_LS_TTL = 7 * 24 * 60 * 60 * 1000;
    /** Меньше страниц: seasons/upcoming часто 504, основное — Shikimori */
    const SEASONS_MAX_PAGES = 2;
    const TOP_MAX_PAGES = 2;

    let _fetchPromise = null;
    let _listCache = null;

    function dedupeMal(list) {
        const m = new Map();
        for (const x of list || []) {
            if (!x || !x.mal_id) continue;
            const prev = m.get(x.mal_id);
            if (!prev) {
                m.set(x.mal_id, x);
                continue;
            }
            // Склеиваем: Jikan-метаданные + русское название/описание с Shikimori
            const ru =
                (x.title_russian && String(x.title_russian).trim()) ||
                (prev.title_russian && String(prev.title_russian).trim()) ||
                '';
            const syn =
                (prev.synopsis && String(prev.synopsis).trim()) ||
                (x.synopsis && String(x.synopsis).trim()) ||
                '';
            const base = prev._fromShikimori && !x._fromShikimori ? x : prev;
            const other = base === prev ? x : prev;
            m.set(x.mal_id, {
                ...other,
                ...base,
                title_russian: ru || base.title_russian || other.title_russian || '',
                synopsis: syn || base.synopsis || other.synopsis || '',
                images: base.images || other.images,
                genres: (base.genres && base.genres.length ? base.genres : other.genres) || [],
                members: Math.max(base.members || 0, other.members || 0) || base.members,
                _shiki: base._shiki || other._shiki,
                _fromShikimori: !!(base._fromShikimori || other._fromShikimori)
            });
        }
        return [...m.values()];
    }

    function filterJikanAnnouncedForHome(list) {
        if (!Array.isArray(list)) return [];
        const kidsGenres = new Set(['kids', 'детское', 'детский']);
        return list.filter((a) => {
            if (!a || !a.mal_id) return false;
            if (a.type === 'Music') return false;
            if (
                a.type &&
                a.type !== 'TV' &&
                a.type !== 'Movie' &&
                a.type !== 'OVA' &&
                a.type !== 'ONA'
            ) {
                return false;
            }
            if (Array.isArray(a.genres)) {
                const hasKids = a.genres.some((g) => {
                    const n = String(g?.name || g || '')
                        .trim()
                        .toLowerCase();
                    return kidsGenres.has(n);
                });
                if (hasKids) return false;
            }
            const st = String(a.status || '').trim();
            if (st === 'Currently Airing' || st === 'Finished Airing') return false;
            return st === 'Not yet aired';
        });
    }

    function filterAnnouncedJikanByMedia(list, mediaType) {
        const isFilm = mediaType === 'film';
        return filterJikanAnnouncedForHome(list).filter((a) => {
            const isMovie = a.type === 'Movie';
            if (isFilm) return isMovie;
            return !isMovie;
        });
    }

    function readSessionCache(allowStale) {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o?.list?.length) return null;
            if (!allowStale && Date.now() - (o.ts || 0) > CACHE_TTL) {
                return null;
            }
            return o.list;
        } catch (_) {
            return null;
        }
    }

    function readStaleSessionCache() {
        return readSessionCache(true) || null;
    }

    function readLocalStorageCache(allowStale) {
        try {
            const raw = localStorage.getItem(CACHE_LS_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o?.list?.length) return null;
            if (!allowStale && Date.now() - (o.ts || 0) > CACHE_LS_TTL) return null;
            return o.list;
        } catch (_) {
            return null;
        }
    }

    function readAnyAnnouncedCache(allowStale) {
        return (
            readSessionCache(allowStale) ||
            readLocalStorageCache(allowStale) ||
            (_listCache?.length ? _listCache : null)
        );
    }

    function writeSessionCache(list) {
        const payload = JSON.stringify({ ts: Date.now(), list });
        try {
            sessionStorage.setItem(CACHE_KEY, payload);
        } catch (_) {
            /* ignore */
        }
        try {
            localStorage.setItem(CACHE_LS_KEY, payload);
        } catch (_) {
            /* ignore */
        }
    }

    async function jikanAnnouncedFetch(url) {
        if (
            typeof global.reminkoJikanIsCircuitOpen === 'function' &&
            global.reminkoJikanIsCircuitOpen()
        ) {
            const err = new Error('Jikan temporarily unavailable');
            err.status = 503;
            err.reminkoSilent = true;
            throw err;
        }
        try {
            if (typeof global.reminkoJikanFetch === 'function') {
                return await global.reminkoJikanFetch(url);
            }
        } catch (e) {
            if (isJikanTransientError(e)) {
                e.reminkoSilent = true;
            }
            throw e;
        }
        const res = await fetch(url);
        if (!res.ok) {
            const err = new Error(`Jikan ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return res.json();
    }

    function isJikanTransientError(err) {
        const st = err && err.status;
        if (st === 429 || st === 502 || st === 503 || st === 504) return true;
        const msg = String(err && err.message ? err.message : err).toLowerCase();
        return (
            msg.includes('503') ||
            msg.includes('502') ||
            msg.includes('504') ||
            msg.includes('rate limit') ||
            msg.includes('temporarily unavailable') ||
            msg.includes('failed to fetch')
        );
    }

    async function jikanAnnouncedFetchPaged(pathWithQuery, maxPages, onChunk) {
        const all = [];
        for (let page = 1; page <= maxPages; page++) {
            const sep = pathWithQuery.includes('?') ? '&' : '?';
            const url = `${JIKAN_BASE}${pathWithQuery}${sep}page=${page}`;
            try {
                const data = await jikanAnnouncedFetch(url);
                const chunk = data.data || [];
                all.push(...chunk);
                if (typeof onChunk === 'function') {
                    onChunk(dedupeMal(all), page);
                }
                if (!data.pagination?.has_next_page || chunk.length === 0) break;
            } catch (e) {
                if (all.length) break;
                if (isJikanTransientError(e)) break;
                throw e;
            }
            if (page < maxPages) await new Promise((r) => setTimeout(r, 1100));
        }
        return dedupeMal(all);
    }

    function getJikanAnnouncedCachedSync() {
        if (_listCache?.length) return _listCache;
        return readAnyAnnouncedCache(true) || [];
    }

    function normalizeFetchOpts(forceOrOpts, maybeOpts) {
        if (typeof forceOrOpts === 'object' && forceOrOpts !== null && !Array.isArray(forceOrOpts)) {
            return {
                force: !!forceOrOpts.force,
                onProgress: typeof forceOrOpts.onProgress === 'function' ? forceOrOpts.onProgress : null,
            };
        }
        const onProgress =
            maybeOpts && typeof maybeOpts.onProgress === 'function' ? maybeOpts.onProgress : null;
        return { force: !!forceOrOpts, onProgress };
    }

    function emitAnnouncedProgress(rawList, onProgress) {
        if (!onProgress) return;
        const list = sortAnnouncedList(filterJikanAnnouncedForHome(dedupeMal(rawList)));
        try {
            onProgress(list);
        } catch (_) {
            /* ignore */
        }
    }

    function sortAnnouncedList(list) {
        return [...list].sort((a, b) => {
            const ta = a.aired?.from ? Date.parse(a.aired.from) : Infinity;
            const tb = b.aired?.from ? Date.parse(b.aired.from) : Infinity;
            if (ta !== tb) return ta - tb;
            return (b.members || b.scored_by || 0) - (a.members || a.scored_by || 0);
        });
    }

    function mapShikiKindToJikanType(kind) {
        const k = String(kind || '').toLowerCase();
        if (k === 'movie') return 'Movie';
        if (k === 'ova') return 'OVA';
        if (k === 'ona') return 'ONA';
        if (k === 'special' || k === 'tv_special') return 'Special';
        if (k === 'music') return 'Music';
        return 'TV';
    }

    /** Shikimori anons → формат карточек Jikan (с русским title_russian). */
    function shikimoriAnonsToJikanShape(item) {
        if (!item) return null;
        // В списке /animes?status=anons часто нет myanimelist_id — id Shikimori обычно = MAL
        const mal = parseInt(
            item.myanimelist_id != null && item.myanimelist_id !== ''
                ? item.myanimelist_id
                : item.id,
            10
        );
        if (!Number.isFinite(mal) || mal <= 0) return null;
        const poster = shikimoriPosterUrlFromPath(item.image?.original || item.image?.preview);
        const ru = String(item.russian || '').trim();
        const en = String(item.name || '').trim();
        const desc = global.shikimoriApi?.stripHtml
            ? global.shikimoriApi.stripHtml(item.description || '')
            : String(item.description || '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
        const kind = String(item.kind || '').toLowerCase();
        // Спешлы/музыка не нужны в ленте анонсов
        if (kind === 'music' || kind === 'pv') return null;
        return {
            mal_id: mal,
            title: en || ru || `MAL #${mal}`,
            title_english: en || '',
            title_russian: ru || '',
            title_japanese: '',
            synopsis: desc || '',
            type: mapShikiKindToJikanType(item.kind),
            status: 'Not yet aired',
            episodes: item.episodes || null,
            score: item.score ? Number(item.score) : null,
            members: Number(item.scores_stats_total || item.rates_count || 0) || 0,
            aired: { from: item.aired_on || item.released_on || null },
            images: poster
                ? {
                      jpg: {
                          image_url: poster,
                          large_image_url: poster,
                          small_image_url: poster
                      }
                  }
                : undefined,
            genres: [],
            _shiki: item,
            _fromShikimori: true
        };
    }

    async function fetchShikimoriAnnouncedAsJikan() {
        if (!global.shikimoriApi?.fetchShikimoriAnnounced) return [];
        try {
            const raw = await global.shikimoriApi.fetchShikimoriAnnounced(false);
            const out = [];
            for (const item of raw || []) {
                const row = shikimoriAnonsToJikanShape(item);
                if (row) out.push(row);
            }
            return out;
        } catch (e) {
            console.warn('[announced] Shikimori anons:', e);
            return [];
        }
    }

    /** Подтянуть русские названия с Shikimori для англ. записей Jikan. */
    async function enrichAnnouncedWithRussianTitles(list) {
        if (!Array.isArray(list) || !list.length) return list || [];
        if (!global.shikimoriApi?.enqueueFetchShikimoriByMalId) return list;

        const need = list.filter(
            (a) =>
                a &&
                a.mal_id &&
                !String(a.title_russian || '').trim() &&
                !/[а-яё]/i.test(String(a.title || ''))
        );
        // Не больше 12 сетевых запросов за проход — остальное из кэша / уже RU с Shiki-ленты
        const slice = need.slice(0, 12);
        await Promise.all(
            slice.map(async (a) => {
                try {
                    const sh = await global.shikimoriApi.enqueueFetchShikimoriByMalId(
                        a.mal_id,
                        a.title_english || a.title || ''
                    );
                    if (sh?.russian) {
                        a.title_russian = String(sh.russian).trim();
                    }
                    if (sh?.description && !a.synopsis) {
                        a.synopsis = global.shikimoriApi.stripHtml
                            ? global.shikimoriApi.stripHtml(sh.description)
                            : String(sh.description).replace(/<[^>]+>/g, ' ').trim();
                    }
                } catch (_) {
                    /* ignore */
                }
            })
        );
        return list;
    }

    function announcedFallbackOrEmpty() {
        const stale = readAnyAnnouncedCache(true);
        return stale?.length ? stale : [];
    }

    async function fetchJikanAnnouncedList(forceOrOpts, maybeOpts) {
        const { force, onProgress } = normalizeFetchOpts(forceOrOpts, maybeOpts);

        if (!force && _listCache?.length) {
            if (onProgress) onProgress(_listCache);
            return _listCache;
        }
        if (!force) {
            const cached = readAnyAnnouncedCache(false);
            if (cached?.length) {
                _listCache = cached;
                if (onProgress) onProgress(cached);
                return cached;
            }
        }
        if (
            !force &&
            typeof global.reminkoJikanIsCircuitOpen === 'function' &&
            global.reminkoJikanIsCircuitOpen()
        ) {
            const stale = announcedFallbackOrEmpty();
            _listCache = stale;
            if (onProgress) onProgress(stale);
            return stale;
        }
        if (_fetchPromise && !force) {
            if (onProgress) {
                const list = await _fetchPromise;
                onProgress(list);
                return list;
            }
            return _fetchPromise;
        }

        _fetchPromise = (async () => {
            let seasons = [];
            let top = [];
            let shiki = [];

            // 1) Сначала Shikimori — быстрый RU-источник, без зависимости от Jikan 504
            try {
                shiki = await fetchShikimoriAnnouncedAsJikan();
            } catch (_) {
                shiki = [];
            }
            if (shiki.length) {
                const early = sortAnnouncedList(filterJikanAnnouncedForHome(shiki));
                _listCache = early;
                writeSessionCache(early);
                emitAnnouncedProgress(early, onProgress);
            }

            // 2) Jikan — только если circuit закрыт (иначе seasons/upcoming сыплет 504)
            const jikanOk =
                typeof global.reminkoJikanIsCircuitOpen !== 'function' ||
                !global.reminkoJikanIsCircuitOpen();
            if (jikanOk) {
                try {
                    seasons = await jikanAnnouncedFetchPaged(
                        '/seasons/upcoming?limit=25&order_by=members&sort=desc',
                        SEASONS_MAX_PAGES,
                        (chunk) => {
                            emitAnnouncedProgress(dedupeMal([...shiki, ...chunk]), onProgress);
                        }
                    );
                } catch (e) {
                    if (!isJikanTransientError(e) && !shiki.length) throw e;
                }

                if (seasons.length) {
                    await new Promise((r) => setTimeout(r, 800));
                }
                const stillOk =
                    typeof global.reminkoJikanIsCircuitOpen !== 'function' ||
                    !global.reminkoJikanIsCircuitOpen();
                if (stillOk) {
                    try {
                        top = await jikanAnnouncedFetchPaged(
                            '/top/anime?filter=upcoming&limit=25',
                            TOP_MAX_PAGES,
                            (chunk) => {
                                emitAnnouncedProgress(
                                    dedupeMal([...shiki, ...seasons, ...chunk]),
                                    onProgress
                                );
                            }
                        );
                    } catch (e) {
                        if (!seasons.length && !shiki.length && !isJikanTransientError(e)) throw e;
                    }
                }
            }

            const combined = dedupeMal([...shiki, ...seasons, ...top]);
            if (!combined.length) {
                const stale = announcedFallbackOrEmpty();
                _listCache = stale;
                if (onProgress) onProgress(stale);
                _fetchPromise = null;
                return stale;
            }

            let list = sortAnnouncedList(filterJikanAnnouncedForHome(combined));
            try {
                list = await enrichAnnouncedWithRussianTitles(list);
            } catch (_) {
                /* ignore */
            }
            _listCache = list;
            writeSessionCache(list);
            if (onProgress) onProgress(list);
            _fetchPromise = null;
            return list;
        })();

        try {
            return await _fetchPromise;
        } catch (e) {
            _fetchPromise = null;
            const stale = announcedFallbackOrEmpty();
            _listCache = stale;
            if (onProgress) onProgress(stale);
            if (stale.length || isJikanTransientError(e)) return stale;
            throw e;
        }
    }

    function jikanPosterFromAnime(anime) {
        if (!anime) return '';
        const jpg = anime.images?.jpg;
        const webp = anime.images?.webp;
        if (jpg) return jpg.large_image_url || jpg.image_url || jpg.small_image_url || '';
        if (webp) return webp.large_image_url || webp.image_url || webp.small_image_url || '';
        return '';
    }

    function isShikimoriPlaceholderPoster(url) {
        const s = String(url || '').toLowerCase();
        if (!s) return true;
        return s.includes('missing_') || s.includes('/assets/globals/missing');
    }

    function shikimoriPosterUrlFromPath(path) {
        const p = String(path || '').trim();
        if (!p || isShikimoriPlaceholderPoster(p)) return '';
        if (/^https?:\/\//i.test(p)) return p;
        return `https://shikimori.one${p.startsWith('/') ? p : `/${p}`}`;
    }

    function isShikimoriDirectMalPoster(url) {
        return /shikimori\.(one|me)\/system\/animes\/\d+\/original\.jpg/i.test(String(url || ''));
    }

    /** Слабые/общие постеры: плейсхолдеры, «общий» KP на все сезоны, шаблонный Shiki. */
    function isWeakPosterSource(url) {
        const s = String(url || '').toLowerCase();
        if (!s || s.startsWith('data:')) return true;
        if (isShikimoriPlaceholderPoster(s)) return true;
        if (isShikimoriDirectMalPoster(s)) return true;
        if (s.includes('st.kp.yandex.net') || s.includes('kinopoisk')) return true;
        return false;
    }

    // v4: не кэшируем постер из каталога без проверки по MAL (дубли сезонов)
    const POSTER_MAL_CACHE_KEY = 'reminko_poster_mal_v4';
    const POSTER_MAL_CACHE_TTL = 30 * 86400000;
    const _posterMalMem = new Map();

    function readMalPosterCache(malId) {
        const mal = parseInt(malId, 10);
        if (!Number.isFinite(mal) || mal <= 0) return '';
        if (_posterMalMem.has(mal)) {
            const u = _posterMalMem.get(mal);
            return isWeakPosterSource(u) ? '' : u;
        }
        try {
            const raw = localStorage.getItem(POSTER_MAL_CACHE_KEY);
            if (!raw) return '';
            const o = JSON.parse(raw);
            const e = o[String(mal)];
            if (e?.url && Date.now() - (e.ts || 0) < POSTER_MAL_CACHE_TTL) {
                if (isWeakPosterSource(e.url)) return '';
                _posterMalMem.set(mal, e.url);
                return e.url;
            }
        } catch (_) {
            /* ignore */
        }
        return '';
    }

    function writeMalPosterCache(malId, url) {
        const mal = parseInt(malId, 10);
        if (!Number.isFinite(mal) || mal <= 0 || !url || isWeakPosterSource(url)) return;
        _posterMalMem.set(mal, url);
        try {
            const raw = localStorage.getItem(POSTER_MAL_CACHE_KEY);
            const o = raw ? JSON.parse(raw) : {};
            o[String(mal)] = { url, ts: Date.now() };
            localStorage.setItem(POSTER_MAL_CACHE_KEY, JSON.stringify(o));
        } catch (_) {
            /* ignore */
        }
    }

    function pickKnownPosterUrl(anime) {
        if (!anime) return '';
        const mal = parseInt(anime.mal_id, 10);
        const calPoster =
            (typeof global.reminkoCalendarRowForMal === 'function' && Number.isFinite(mal) && mal > 0
                ? global.reminkoCalendarRowForMal(mal)?.posterUrl
                : '') ||
            anime._calendarRow?.posterUrl ||
            anime._calendar?.posterUrl ||
            '';
        const candidates = [
            jikanPosterFromAnime(anime._jikan),
            jikanPosterFromAnime(anime._jikanRaw),
            jikanPosterFromAnime(anime),
            shikimoriPosterUrlFromPath(anime.image?.original),
            calPoster,
            anime.posterUrl,
        ];
        // Сначала сильные (не KP / не missing), потом любые непустые
        for (const url of candidates) {
            if (url && !isWeakPosterSource(url)) return url;
        }
        for (const url of candidates) {
            if (url && !isShikimoriPlaceholderPoster(url)) return url;
        }
        return '';
    }

    /** Скрытые названия для поиска постера (не показываются на сайте) */
    function reminkoCollectPosterSearchTitles(anime, malId) {
        const seen = new Set();
        const out = [];
        const push = (value) => {
            const s = String(value || '').trim();
            if (!s || s.length < 2) return;
            const key = s.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(s);
        };

        const src = anime && typeof anime === 'object' ? anime : {};
        if (Array.isArray(src._posterSearchTitles)) src._posterSearchTitles.forEach(push);
        if (Array.isArray(src._searchTitles)) src._searchTitles.forEach(push);

        push(src.titleAlt);
        push(src.title_alt);
        push(src.title_en);
        push(src.title_english);
        push(src.title_japanese);

        const jikan = src._jikan || src._jikanRaw || src;
        push(jikan.title_english);
        push(jikan.title_japanese);
        push(jikan.title);

        push(src.title);
        push(russianTitleFromCatalogMal(malId));

        return out;
    }

    function russianTitleFromCatalogMal(malId) {
        const mal = parseInt(malId, 10);
        if (!Number.isFinite(mal) || mal <= 0) return '';
        if (typeof global.KodikCatalogStore?.getAll === 'function') {
            const hit = global.KodikCatalogStore.getAll().find(
                (a) => a && parseInt(a.mal_id, 10) === mal
            );
            if (hit?.title && String(hit.title).trim()) return String(hit.title).trim();
        }
        if (typeof global.getAnimeById === 'function') {
            for (const id of [mal, 20_000_000 + mal, 20_500_000 + mal, 10_000_000 + mal]) {
                const a = global.getAnimeById(id);
                if (a?.title && String(a.title).trim()) return String(a.title).trim();
            }
        }
        return '';
    }

    function jikanAnnouncedToCalendarRow(anime) {
        if (!anime?.mal_id) return null;
        const fromCatalog = russianTitleFromCatalogMal(anime.mal_id);
        const title =
            fromCatalog ||
            (anime.title_russian && String(anime.title_russian).trim()) ||
            (anime.title && /[а-яё]/i.test(anime.title) ? String(anime.title).trim() : '') ||
            (anime.title_english && String(anime.title_english).trim()) ||
            (anime.title && String(anime.title).trim()) ||
            (anime.title_japanese && String(anime.title_japanese).trim()) ||
            `MAL #${anime.mal_id}`;
        const from = anime.aired?.from ? String(anime.aired.from) : '';
        return {
            mal_id: anime.mal_id,
            title_ru: title,
            next_at: from,
            next_episode: 1,
            _jikan: anime,
            _jikanAnnounced: true,
        };
    }

    function jikanAnnouncedToCalendarRows(list) {
        const rows = [];
        for (const a of list || []) {
            const row = jikanAnnouncedToCalendarRow(a);
            if (row) rows.push(row);
        }
        const byTime = (x, y) => {
            const tx = Date.parse(x.next_at) || Infinity;
            const ty = Date.parse(y.next_at) || Infinity;
            return tx - ty;
        };
        rows.sort(byTime);
        return rows;
    }

    function jikanVirtualAnimeId(malId) {
        const mal = parseInt(malId, 10);
        if (!Number.isFinite(mal) || mal <= 0) return null;
        return 10_000_000 + mal;
    }

    function navigateToJikanAnnouncedAnime(anime, baseHref) {
        if (!anime?.mal_id) return;
        const mal = anime.mal_id;
        const virtualId = jikanVirtualAnimeId(mal);
        const base =
            baseHref ||
            (global.location.pathname.includes('/catalog/') ||
            global.location.pathname.includes('/anime/') ||
            global.location.pathname.includes('/manga/')
                ? '../anime/view.html'
                : 'anime/view.html');
        try {
            global.sessionStorage.setItem('jikanAnimeData', JSON.stringify(anime));
            global.sessionStorage.setItem('previousUrl', global.location.href);
            if (virtualId != null) {
                global.sessionStorage.setItem('viewAnimeId', String(virtualId));
            }
        } catch (_) {
            /* ignore */
        }
        global.location.href = `${base}?id=${encodeURIComponent(String(virtualId))}&mal_id=${encodeURIComponent(String(mal))}`;
    }

    const _posterResolveInflight = new Map();
    const _posterResolveQueue = [];
    let _posterResolveActive = 0;
    const POSTER_RESOLVE_CONCURRENCY = 2;

    function enqueuePosterResolve(fn) {
        return new Promise((resolve) => {
            _posterResolveQueue.push({ fn, resolve });
            pumpPosterResolveQueue();
        });
    }

    function pumpPosterResolveQueue() {
        while (_posterResolveActive < POSTER_RESOLVE_CONCURRENCY && _posterResolveQueue.length) {
            const job = _posterResolveQueue.shift();
            _posterResolveActive += 1;
            Promise.resolve()
                .then(() => job.fn())
                .then(
                    (v) => job.resolve(v),
                    () => job.resolve('')
                )
                .finally(() => {
                    _posterResolveActive -= 1;
                    pumpPosterResolveQueue();
                });
        }
    }

    async function fetchVerifiedPosterUrlForMal(malId, anime) {
        const mal = parseInt(malId, 10);
        if (!Number.isFinite(mal) || mal <= 0) return '';

        const cached = readMalPosterCache(mal);
        if (cached) return cached;

        // Dedupe параллельных запросов по одному MAL
        if (_posterResolveInflight.has(mal)) {
            return _posterResolveInflight.get(mal);
        }

        const run = enqueuePosterResolve(async () => {
            // 1) Shikimori из памяти (без сети)
            if (global.shikimoriApi?.readCachedByMalId) {
                const sh = global.shikimoriApi.readCachedByMalId(mal);
                const u = shikimoriPosterUrlFromPath(sh?.image?.original);
                if (u && !isWeakPosterSource(u)) {
                    writeMalPosterCache(mal, u);
                    return u;
                }
            }

            // 2) Shikimori по MAL — без AniList (в браузере CORS/рейтлимит → лаги)
            const searchTitles = reminkoCollectPosterSearchTitles(anime, mal);
            if (global.shikimoriApi?.enqueueFetchShikimoriByMalId) {
                try {
                    const sh = await global.shikimoriApi.enqueueFetchShikimoriByMalId(
                        mal,
                        searchTitles[0] || ''
                    );
                    const u = shikimoriPosterUrlFromPath(sh?.image?.original);
                    if (u && !isWeakPosterSource(u)) {
                        writeMalPosterCache(mal, u);
                        return u;
                    }
                } catch (_) {
                    /* ignore */
                }
            }

            // 3) Jikan по MAL (свой rate-limit)
            try {
                if (typeof global.jikanFetchPosterByMalId === 'function') {
                    const u = await global.jikanFetchPosterByMalId(mal);
                    if (u && !isWeakPosterSource(u)) {
                        writeMalPosterCache(mal, u);
                        return u;
                    }
                }
            } catch (_) {
                /* ignore */
            }

            return '';
        });

        _posterResolveInflight.set(mal, run);
        return run;
    }

    async function fetchPosterUrlForMal(malId, anime) {
        const mal = parseInt(malId, 10);
        if (!Number.isFinite(mal) || mal <= 0) return '';

        const verified = await fetchVerifiedPosterUrlForMal(mal, anime);
        if (verified) return verified;

        const known = pickKnownPosterUrl(anime);
        if (known && !isWeakPosterSource(known)) {
            // Показываем, но не кэшируем — мог быть общий постер на несколько сезонов
            return known;
        }

        const calOnly =
            typeof global.reminkoCalendarRowForMal === 'function'
                ? global.reminkoCalendarRowForMal(mal)?.posterUrl
                : '';
        if (calOnly && !isShikimoriPlaceholderPoster(calOnly) && !isWeakPosterSource(calOnly)) {
            return calOnly;
        }
        if (known) return known;
        if (calOnly && !isShikimoriPlaceholderPoster(calOnly)) return calOnly;

        return '';
    }

    function attachJikanPosterFallback(img, malId, anime) {
        if (!img) return;
        if (img.dataset.posterHydrating === '1') return;
        img.dataset.posterHydrating = '1';
        const mal = parseInt(malId, 10);
        if (!Number.isFinite(mal) || mal <= 0) return;

        img.referrerPolicy = 'no-referrer';
        img.decoding = 'async';

        const initial = String(img.getAttribute('src') || img.src || '');
        const initialOk = initial && !isWeakPosterSource(initial) && !initial.startsWith('data:');

        // Уже нормальный постер: только sync-апгрейд из кэша Shiki/MAL, без сетевого шторма
        if (initialOk) {
            const cached = readMalPosterCache(mal);
            if (cached && cached !== initial) {
                img.src = cached;
            } else if (global.shikimoriApi?.readCachedByMalId) {
                const sh = global.shikimoriApi.readCachedByMalId(mal);
                const u = shikimoriPosterUrlFromPath(sh?.image?.original);
                if (u && !isWeakPosterSource(u) && u !== initial) {
                    writeMalPosterCache(mal, u);
                    img.src = u;
                }
            }
            img.onerror = () => {
                if (!img.isConnected) return;
                void fetchPosterUrlForMal(mal, anime).then((url) => {
                    if (url && img.isConnected) {
                        img.classList.remove('is-poster-missing');
                        img.src = url;
                    } else {
                        img.classList.add('is-poster-missing');
                    }
                });
            };
            return;
        }

        const cached = readMalPosterCache(mal);
        if (cached) {
            img.classList.remove('is-poster-missing');
            img.src = cached;
            return;
        }

        if (!initial || initial.startsWith('data:') || isWeakPosterSource(initial)) {
            img.src =
                'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        }

        img.onerror = () => {
            if (img.isConnected) img.classList.add('is-poster-missing');
        };

        void (async () => {
            const url = await fetchPosterUrlForMal(mal, anime);
            if (!img.isConnected) return;
            if (!url) {
                if (img.naturalWidth <= 1 && img.naturalHeight <= 1) {
                    img.classList.add('is-poster-missing');
                }
                return;
            }
            img.classList.remove('is-poster-missing');
            img.src = url;
        })();
    }

    async function prefetchPosterUrlsForMals(entries, opts) {
        const concurrency = Math.max(1, Math.min(3, parseInt(opts?.concurrency, 10) || 2));
        const delayMs = Math.max(0, parseInt(opts?.delayMs, 10) || 450);
        const list = Array.isArray(entries) ? entries : [];
        const queue = [];
        const seen = new Set();
        for (const item of list) {
            const mal = parseInt(item?.mal_id ?? item?.malId, 10);
            if (!Number.isFinite(mal) || mal <= 0 || seen.has(mal)) continue;
            if (readMalPosterCache(mal)) continue;
            seen.add(mal);
            queue.push({ mal, anime: item?.anime || item?.meta || item });
        }
        for (let i = 0; i < queue.length; i += concurrency) {
            const batch = queue.slice(i, i + concurrency);
            await Promise.all(
                batch.map(({ mal, anime }) =>
                    fetchPosterUrlForMal(mal, anime).catch(() => '')
                )
            );
            if (i + concurrency < queue.length && delayMs > 0) {
                await new Promise((r) => setTimeout(r, delayMs));
            }
        }
    }

    global.shikimoriPosterUrlFromPath = shikimoriPosterUrlFromPath;
    global.fetchJikanAnnouncedList = fetchJikanAnnouncedList;
    global.fetchShikimoriAnnouncedAsJikan = fetchShikimoriAnnouncedAsJikan;
    global.shikimoriAnonsToJikanShape = shikimoriAnonsToJikanShape;
    global.getJikanAnnouncedCachedSync = getJikanAnnouncedCachedSync;
    global.filterJikanAnnouncedForHome = filterJikanAnnouncedForHome;
    global.filterAnnouncedJikanByMedia = filterAnnouncedJikanByMedia;
    global.jikanAnnouncedToCalendarRow = jikanAnnouncedToCalendarRow;
    global.jikanAnnouncedToCalendarRows = jikanAnnouncedToCalendarRows;
    global.jikanPosterFromAnime = jikanPosterFromAnime;
    global.isShikimoriPlaceholderPoster = isShikimoriPlaceholderPoster;
    global.isShikimoriDirectMalPoster = isShikimoriDirectMalPoster;
    global.isWeakPosterSource = isWeakPosterSource;
    global.readMalPosterCache = readMalPosterCache;
    global.writeMalPosterCache = writeMalPosterCache;
    global.pickKnownPosterUrl = pickKnownPosterUrl;
    global.reminkoCollectPosterSearchTitles = reminkoCollectPosterSearchTitles;
    global.fetchPosterUrlForMal = fetchPosterUrlForMal;
    global.fetchVerifiedPosterUrlForMal = fetchVerifiedPosterUrlForMal;
    global.attachJikanPosterFallback = attachJikanPosterFallback;
    global.prefetchPosterUrlsForMals = prefetchPosterUrlsForMals;
    global.navigateToJikanAnnouncedAnime = navigateToJikanAnnouncedAnime;
    global.jikanVirtualAnimeId = jikanVirtualAnimeId;
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Shikimori.one API — русские названия, описания, серии (episodes_aired).
 * На проде запросы идут через Netlify-прокси (обход CORS).
 */
(function () {
    const SHIKI_BASE = 'https://shikimori.one/api';
    const CACHE_PREFIX = 'reminko_shiki_mal_';
    const CALENDAR_CACHE_KEY = 'reminko_shiki_calendar';
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const CALENDAR_CACHE_TTL_MS = 30 * 60 * 1000;
    const MAX_QUEUE = 1;
    const MIN_GAP_MS = 550;
    let active = 0;
    const waiters = [];
    let lastRequestAt = 0;

    function shikiCfg() {
        return (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.shikimori) || {};
    }

    function isLocalDevHost() {
        if (typeof window === 'undefined' || !window.location) return true;
        const h = window.location.hostname || '';
        return h === 'localhost' || h === '127.0.0.1' || window.location.protocol === 'file:';
    }

    function proxyUrl() {
        const rel = shikiCfg().apiProxyUrl || '/.netlify/functions/shikimori-proxy';
        if (/^https?:\/\//i.test(rel)) return rel;
        if (typeof window !== 'undefined' && window.location && window.location.origin) {
            return window.location.origin.replace(/\/$/, '') + (rel.startsWith('/') ? rel : '/' + rel);
        }
        return rel;
    }

    function useShikiProxy() {
        if (shikiCfg().useShikimoriProxy === false) return false;
        return !isLocalDevHost();
    }

    function shikiHeaders() {
        return { Accept: 'application/json' };
    }

    async function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    async function shikiFetch(path, attempt = 0) {
        const now = Date.now();
        const gapWait = Math.max(0, MIN_GAP_MS - (now - lastRequestAt));
        if (gapWait) await sleep(gapWait);
        lastRequestAt = Date.now();

        const apiPath = path.startsWith('/') ? path : `/${path}`;

        try {
            let res;
            if (useShikiProxy()) {
                const qIdx = apiPath.indexOf('?');
                const pathOnly = qIdx >= 0 ? apiPath.slice(0, qIdx) : apiPath;
                const url = new URL(proxyUrl());
                url.searchParams.set('path', pathOnly);
                if (qIdx >= 0) {
                    const extra = new URLSearchParams(apiPath.slice(qIdx + 1));
                    extra.forEach((v, k) => url.searchParams.set(k, v));
                }
                res = await fetch(url.toString(), { headers: shikiHeaders(), credentials: 'omit' });
            } else {
                res = await fetch(`${SHIKI_BASE}${apiPath}`, { headers: shikiHeaders(), credentials: 'omit' });
            }

            if (res.status === 429 && attempt < 6) {
                const ra = parseInt(res.headers.get('Retry-After') || '', 10);
                const base = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2500;
                await sleep(base + attempt * 800);
                lastRequestAt = 0;
                return shikiFetch(path, attempt + 1);
            }

            if (!res.ok) return null;
            return await res.json();
        } catch (_) {
            return null;
        }
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function runQueue() {
        while (active < MAX_QUEUE && waiters.length) {
            const job = waiters.shift();
            active++;
            Promise.resolve()
                .then(() => job.fn())
                .then(job.resolve, job.reject)
                .finally(() => {
                    active--;
                    runQueue();
                });
        }
    }

    function enqueueShikiTask(fn) {
        return new Promise((resolve, reject) => {
            waiters.push({ fn, resolve, reject });
            runQueue();
        });
    }

    function readCache(malId) {
        try {
            const raw = sessionStorage.getItem(CACHE_PREFIX + malId);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (Date.now() - o.ts > CACHE_TTL_MS) {
                sessionStorage.removeItem(CACHE_PREFIX + malId);
                return null;
            }
            return o.data;
        } catch {
            return null;
        }
    }

    function writeCache(malId, data) {
        try {
            sessionStorage.setItem(CACHE_PREFIX + malId, JSON.stringify({ ts: Date.now(), data }));
        } catch {
            /* ignore */
        }
    }

    function readCalendarCache() {
        try {
            const raw = sessionStorage.getItem(CALENDAR_CACHE_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (Date.now() - o.ts > CALENDAR_CACHE_TTL_MS) {
                sessionStorage.removeItem(CALENDAR_CACHE_KEY);
                return null;
            }
            return o.data;
        } catch {
            return null;
        }
    }

    function writeCalendarCache(data) {
        try {
            sessionStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch {
            /* ignore */
        }
    }

    async function fetchShikimoriCalendar(force) {
        if (!force) {
            const cached = readCalendarCache();
            if (Array.isArray(cached)) return cached;
        }
        const data = await enqueueShikiTask(async () => {
            const list = await shikiFetch('/calendar?censored=true');
            return Array.isArray(list) ? list : [];
        }).catch(() => []);
        writeCalendarCache(data);
        return data;
    }

    async function fetchShikimoriByMalId(malId, searchTitle) {
        if (!malId) return null;
        const cached = readCache(malId);
        if (cached) return cached;

        try {
            const direct = await shikiFetch(`/animes/${malId}`);
            if (direct && direct.myanimelist_id === malId) {
                writeCache(malId, direct);
                return direct;
            }

            const q = encodeURIComponent((searchTitle || '').trim() || String(malId));
            const list = await shikiFetch(`/animes?search=${q}&limit=10`);
            if (!Array.isArray(list) || list.length === 0) {
                writeCache(malId, null);
                return null;
            }

            const maxCheck = Math.min(list.length, 6);
            for (let i = 0; i < maxCheck; i++) {
                const item = list[i];
                if (!item || !item.id) continue;
                const d = await shikiFetch(`/animes/${item.id}`);
                if (d && d.myanimelist_id === malId) {
                    writeCache(malId, d);
                    return d;
                }
            }

            writeCache(malId, null);
            return null;
        } catch (_) {
            return null;
        }
    }

    function enqueueFetchShikimoriByMalId(malId, searchTitle) {
        return enqueueShikiTask(() => fetchShikimoriByMalId(malId, searchTitle)).catch(() => null);
    }

    function readCachedByMalId(malId) {
        if (!malId) return null;
        return readCache(malId);
    }

    function searchAnimesByQuery(query, limit = 15) {
        const lim = Math.min(25, Math.max(1, parseInt(limit, 10) || 15));
        const q = String(query || '').trim();
        if (!q) return Promise.resolve([]);
        return enqueueShikiTask(async () => {
            const list = await shikiFetch(`/animes?search=${encodeURIComponent(q)}&limit=${lim}`);
            return Array.isArray(list) ? list : [];
        }).catch(() => []);
    }

    const ANONS_CACHE_KEY = 'reminko_shiki_anons_v1';
    const ANONS_CACHE_TTL_MS = 45 * 60 * 1000;

    function readAnonsCache() {
        try {
            const raw = sessionStorage.getItem(ANONS_CACHE_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (Date.now() - (o.ts || 0) > ANONS_CACHE_TTL_MS) return null;
            return Array.isArray(o.data) ? o.data : null;
        } catch {
            return null;
        }
    }

    function writeAnonsCache(data) {
        try {
            sessionStorage.setItem(ANONS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch {
            /* ignore */
        }
    }

    /**
     * Анонсы с Shikimori (русские названия из коробки) — доп. источник к Jikan.
     * @returns {Promise<object[]>} сырые объекты Shikimori
     */
    async function fetchShikimoriAnnounced(force) {
        if (!force) {
            const cached = readAnonsCache();
            if (cached?.length) return cached;
        }
        const all = [];
        const seen = new Set();
        const maxPages = 5;
        for (let page = 1; page <= maxPages; page++) {
            const chunk = await enqueueShikiTask(async () => {
                const list = await shikiFetch(
                    `/animes?status=anons&order=popularity&limit=50&page=${page}&censored=true`
                );
                return Array.isArray(list) ? list : [];
            }).catch(() => []);
            if (!chunk.length) break;
            for (const item of chunk) {
                if (!item || !item.id) continue;
                const key = item.myanimelist_id || item.id;
                if (seen.has(key)) continue;
                seen.add(key);
                all.push(item);
            }
            if (chunk.length < 50) break;
            await sleep(400);
        }
        writeAnonsCache(all);
        return all;
    }

    function formatAiredTotal(jikanAnime, shiki) {
        const totalJ = jikanAnime.episodes;
        let aired = null;
        let total = totalJ != null && totalJ > 0 ? totalJ : null;

        if (shiki) {
            if (shiki.episodes_aired > 0) aired = shiki.episodes_aired;
            if (shiki.episodes > 0) total = shiki.episodes;
        }

        const q = '?';
        if (aired != null && total != null) return `${aired} / ${total} эп.`;
        if (aired != null) return `${aired} / ${total != null ? total : q} эп.`;
        if (total != null) return `${q} / ${total} эп.`;
        return '';
    }

    window.shikimoriApi = {
        fetchShikimoriByMalId,
        enqueueFetchShikimoriByMalId,
        readCachedByMalId,
        searchAnimesByQuery,
        fetchShikimoriCalendar,
        fetchShikimoriAnnounced,
        stripHtml,
        formatAiredTotal,
        useShikiProxy
    };
})();

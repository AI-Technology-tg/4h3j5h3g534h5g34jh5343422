/**
 * Уведомления о новых сериях для избранных онгоингов (Kodik-каталог: _kodik.lastEpisode).
 * Проверка при заходе на сайт и каждые 30 мин, пока вкладка открыта.
 */
(function (global) {
    'use strict';

    const CACHE_KEY = 'reminko_episode_notify_v1';
    const CHECK_MS = 30 * 60 * 1000;
    const KODIK_ID_BASE = 20_000_000;
    const JIKAN_ID_BASE = 10_000_000;

    let _service = null;
    let _timer = null;
    let _running = false;
    let _catalogById = new Map();
    let _catalogByMal = new Map();

    function readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    function writeCache(all) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(all));
        } catch (_) {
            /* quota */
        }
    }

    function userCacheKey(userId) {
        return String(userId || 'anon');
    }

    function getUserEpisodeMap(userId) {
        const all = readCache();
        const key = userCacheKey(userId);
        if (!all[key] || typeof all[key] !== 'object') all[key] = {};
        return { all, key, map: all[key] };
    }

    function saveUserEpisodeMap(userId, map) {
        const all = readCache();
        all[userCacheKey(userId)] = map;
        writeCache(all);
    }

    function catalogUrl() {
        const cfg = global.APP_CONFIG && global.APP_CONFIG.kodik;
        const rel = (cfg && cfg.catalogPath) || 'data/kodik-anime-catalog.json';
        if (/^https?:\/\//i.test(rel)) return rel;
        const base =
            (global.APP_CONFIG && global.APP_CONFIG.siteOrigin) ||
            (global.location && global.location.origin) ||
            '';
        const path = rel.replace(/^\//, '');
        if (base && !base.includes('localhost') && !String(global.location?.protocol).startsWith('file')) {
            return base.replace(/\/$/, '') + '/' + path;
        }
        const depth =
            global.location && global.location.pathname
                ? (global.location.pathname.match(/\//g) || []).length - 1
                : 0;
        const prefix = depth > 0 ? '../'.repeat(depth) : '';
        return prefix + path;
    }

    function indexCatalog(items) {
        _catalogById = new Map();
        _catalogByMal = new Map();
        for (const a of items || []) {
            if (!a || a.id == null) continue;
            const id = parseInt(a.id, 10);
            if (!Number.isNaN(id)) _catalogById.set(id, a);
            if (a.mal_id != null) {
                const mal = parseInt(a.mal_id, 10);
                if (!Number.isNaN(mal) && mal > 0) _catalogByMal.set(mal, a);
            }
        }
    }

    async function ensureCatalogLoaded() {
        if (global.KodikCatalogStore && typeof global.KodikCatalogStore.load === 'function') {
            const items = await global.KodikCatalogStore.load();
            indexCatalog(items);
            return items;
        }
        const res = await fetch(catalogUrl(), { credentials: 'omit', cache: 'default' });
        if (!res.ok) throw new Error('catalog HTTP ' + res.status);
        const data = await res.json();
        const items = (data && data.items) || data || [];
        indexCatalog(items);
        return items;
    }

    function releasedEpisodes(anime) {
        if (!anime) return 0;
        if (anime._kodik && anime._kodik.lastEpisode != null) {
            const n = parseInt(anime._kodik.lastEpisode, 10);
            if (Number.isFinite(n)) return Math.max(0, n);
        }
        return 0;
    }

    function resolveCatalogAnime(animeId) {
        const id = parseInt(animeId, 10);
        if (Number.isNaN(id)) return null;

        let anime = _catalogById.get(id);
        if (!anime && id >= KODIK_ID_BASE) {
            anime = _catalogByMal.get(id - KODIK_ID_BASE);
        }
        if (!anime && id >= JIKAN_ID_BASE && id < KODIK_ID_BASE) {
            anime = _catalogByMal.get(id - JIKAN_ID_BASE);
        }
        if (!anime && typeof getAnimeById === 'function') {
            anime = getAnimeById(id);
        }
        return anime || null;
    }

    function animeViewLink(animeId) {
        const path = '/anime/view.html?id=' + encodeURIComponent(String(animeId));
        if (global.location && global.location.origin && !String(global.location.protocol).startsWith('file')) {
            return path;
        }
        const depth =
            global.location && global.location.pathname
                ? (global.location.pathname.match(/\//g) || []).length - 1
                : 0;
        const prefix = depth > 0 ? '../'.repeat(depth) : '';
        return prefix + 'anime/view.html?id=' + encodeURIComponent(String(animeId));
    }

    function buildNotifyPayload(animeId) {
        const anime = resolveCatalogAnime(animeId);
        if (!anime) return null;
        if (anime.type === 'Фильм') return null;
        if (anime.status !== 'Онгоинг') return null;

        const lastEpisode = releasedEpisodes(anime);
        if (lastEpisode < 1) return null;

        const linkId = anime.id != null ? parseInt(anime.id, 10) : parseInt(animeId, 10);
        const title = anime.title || anime.titleRu || anime.title_alt || 'Аниме';
        const malId =
            anime.mal_id != null
                ? parseInt(anime.mal_id, 10)
                : linkId >= KODIK_ID_BASE
                  ? linkId - KODIK_ID_BASE
                  : linkId >= JIKAN_ID_BASE
                    ? linkId - JIKAN_ID_BASE
                    : null;

        return {
            animeId: linkId,
            malId: Number.isFinite(malId) ? malId : null,
            title,
            lastEpisode,
            link: animeViewLink(linkId),
        };
    }

    async function areNotificationsEnabled(userId) {
        if (typeof global.reminkoGetNotificationPrefs === 'function') {
            const prefs = global.reminkoGetNotificationPrefs();
            if (!prefs.toastSite && !prefs.browserPush) return false;
        }
        if (typeof getUserData === 'function') {
            const ud = getUserData(userId);
            if (ud && ud.settings && ud.settings.notificationsEnabled === false) return false;
        }
        if (typeof supabaseClient !== 'undefined' && supabaseClient && userId) {
            try {
                const { data } = await supabaseClient
                    .from('user_settings')
                    .select('notifications_enabled')
                    .eq('user_id', userId)
                    .maybeSingle();
                if (data && data.notifications_enabled === false) return false;
            } catch (_) {
                /* ignore */
            }
        }
        return true;
    }

    function isEpisodeNotifySourceEnabled(source) {
        if (typeof global.reminkoGetNotificationPrefs !== 'function') return true;
        const prefs = global.reminkoGetNotificationPrefs();
        if (source === 'favorite') return prefs.newEpisodeFavorites !== false;
        if (source === 'recent') return prefs.newEpisodeRecent !== false;
        return true;
    }

    function getRecentAnimeIds(userId, maxTitles) {
        if (typeof getWatchHistory !== 'function') return [];
        const history = getWatchHistory(userId).filter(
            (e) => e && e.type === 'anime' && e.animeId != null && !Number.isNaN(parseInt(e.animeId, 10))
        );
        if (!history.length) return [];

        const grouped = {};
        for (const entry of history) {
            const id = parseInt(entry.animeId, 10);
            const prev = grouped[id];
            if (!prev || new Date(entry.watchedAt) > new Date(prev.watchedAt)) {
                grouped[id] = entry;
            }
        }

        const cap = maxTitles || 18;
        return Object.values(grouped)
            .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))
            .slice(0, cap)
            .map((e) => e.animeId);
    }

    function showEpisodeAlert(payload, source) {
        const ep = payload.lastEpisode;
        const title = 'Новая серия';
        const message = `${payload.title} — вышла серия ${ep}`;
        const notifyType = source === 'recent' ? 'new_episode_recent' : 'new_episode_favorite';

        if (
            typeof global.reminkoIsNotifyTypeEnabled === 'function' &&
            !global.reminkoIsNotifyTypeEnabled(notifyType)
        ) {
            if (typeof global.reminkoShowBrowserNotification === 'function') {
                void global.reminkoShowBrowserNotification(title, message, {
                    type: notifyType,
                    link: payload.link,
                    tag: 'reminko-ep-' + String(payload.animeId)
                });
            }
            return;
        }

        if (_service && typeof _service.showNotification === 'function') {
            _service.showNotification(
                { title, message, type: 'new_episode', link: payload.link },
                'new_episode',
                { link: payload.link, withSound: true }
            );
        }

        if (typeof global.reminkoShowBrowserNotification === 'function') {
            void global.reminkoShowBrowserNotification(title, message, {
                type: notifyType,
                link: payload.link,
                tag: 'reminko-ep-' + String(payload.animeId)
            });
        }
    }

    async function notifyNewEpisode(userId, payload, source) {
        if (!_service || typeof _service.createNotification !== 'function') return;
        const ep = payload.lastEpisode;
        const title = 'Новая серия';
        const message = `${payload.title} — вышла серия ${ep}`;
        await _service.createNotification(userId, 'new_episode', title, message, payload.link, {
            anime_id: payload.animeId,
            mal_id: payload.malId,
            episode_number: ep,
            source: source || 'favorite'
        });
    }

    async function processAnimeIdsForEpisodes(userId, animeIds, source, map) {
        let changed = false;
        for (const rawId of animeIds) {
            if (!isEpisodeNotifySourceEnabled(source)) continue;

            const payload = buildNotifyPayload(rawId);
            if (!payload) continue;

            const key = String(payload.animeId);
            const prev = map[key];

            if (prev == null) {
                map[key] = payload.lastEpisode;
                changed = true;
                continue;
            }

            const prevNum = parseInt(prev, 10);
            if (!Number.isFinite(prevNum)) {
                map[key] = payload.lastEpisode;
                changed = true;
                continue;
            }

            if (payload.lastEpisode > prevNum) {
                showEpisodeAlert(payload, source);
                await notifyNewEpisode(userId, payload, source);
                map[key] = payload.lastEpisode;
                changed = true;
            }
        }
        return changed;
    }

    async function checkNewEpisodes() {
        if (_running) return;
        _running = true;
        try {
            let user = null;
            if (typeof getCurrentUser === 'function') user = await getCurrentUser();
            if (!user || !user.id || user.isAnonymous) return;
            if (!(await areNotificationsEnabled(user.id))) return;

            await ensureCatalogLoaded();

            let favoriteIds = [];
            if (typeof global.getFavoriteAnimeIds === 'function') {
                favoriteIds = await global.getFavoriteAnimeIds();
            } else if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const { data } = await supabaseClient
                    .from('favorites_anime')
                    .select('anime_id')
                    .eq('user_id', user.id);
                favoriteIds = (data || []).map((r) => r.anime_id);
            }

            const recentIds = getRecentAnimeIds(user.id, 18);
            if (!favoriteIds.length && !recentIds.length) return;

            const { map } = getUserEpisodeMap(user.id);
            let changed = false;

            changed =
                (await processAnimeIdsForEpisodes(user.id, favoriteIds, 'favorite', map)) || changed;
            changed = (await processAnimeIdsForEpisodes(user.id, recentIds, 'recent', map)) || changed;

            if (changed) saveUserEpisodeMap(user.id, map);

            if (_service && typeof _service.loadNotifications === 'function') {
                await _service.loadNotifications();
            }
        } catch (e) {
            console.warn('[episode-notify]', e);
        } finally {
            _running = false;
        }
    }

    global.reminkoEpisodeNotifySeedFavorite = async function reminkoEpisodeNotifySeedFavorite(animeId) {
        let user = null;
        if (typeof getCurrentUser === 'function') user = await getCurrentUser();
        if (!user || !user.id) return;

        await ensureCatalogLoaded();
        const payload = buildNotifyPayload(animeId);
        if (!payload) return;

        const { map } = getUserEpisodeMap(user.id);
        map[String(payload.animeId)] = payload.lastEpisode;
        saveUserEpisodeMap(user.id, map);
    };

    global.reminkoEpisodeNotifyInit = function reminkoEpisodeNotifyInit(notificationService) {
        _service = notificationService;
        const isHome = !!(document.querySelector && document.querySelector('.home-page'));
        // На главной не тянем 17MB каталог сразу — проверка серий позже
        if (isHome) {
            const boot = () => {
                void checkNewEpisodes();
            };
            if (typeof global.requestIdleCallback === 'function') {
                global.requestIdleCallback(boot, { timeout: 45000 });
            } else {
                setTimeout(boot, 20000);
            }
        } else {
            checkNewEpisodes();
        }
        if (_timer) clearInterval(_timer);
        _timer = setInterval(checkNewEpisodes, CHECK_MS);
    };

    global.addEventListener('reminko-kodik-catalog-loaded', () => {
        if (_service) checkNewEpisodes();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && _service) {
            checkNewEpisodes();
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);

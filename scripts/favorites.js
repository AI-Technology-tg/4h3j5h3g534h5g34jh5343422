/**
 * Избранное аниме: Supabase favorites_anime + зеркало в localStorage (userData.favorites).
 * Также рендер страницы favorites.html (свой / чужой список через ?user=).
 */
(function (global) {
    'use strict';

    const _cache = new Set();
    let _loaded = false;
    let _loading = null;

    function parseAnimeId(animeId) {
        const n = parseInt(animeId, 10);
        return Number.isNaN(n) ? null : n;
    }

    function syncLocalFavorites(userId, ids) {
        if (!userId || typeof updateUserData !== 'function') return;
        const numeric = ids
            .map((id) => parseInt(id, 10))
            .filter((n) => !Number.isNaN(n));
        updateUserData(userId, { favorites: numeric });
    }

    function dispatchFavoritesLoaded() {
        try {
            global.dispatchEvent(
                new CustomEvent('reminko:favorites-loaded', { detail: { count: _cache.size } })
            );
        } catch (_) {
            /* ignore */
        }
    }

    /** Локальные избранные → Supabase, чтобы чужие профили их видели. */
    async function pushMissingFavoritesToSupabase(userId, knownIds) {
        if (!userId || typeof supabaseClient === 'undefined' || !supabaseClient) return;
        if (typeof getUserData !== 'function') return;
        const ud = getUserData(userId);
        const local = (ud && Array.isArray(ud.favorites) ? ud.favorites : []) || [];
        const have = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
        const missing = [];
        for (const raw of local) {
            const id = parseAnimeId(raw);
            if (id == null) continue;
            const s = String(id);
            if (have.has(s)) continue;
            have.add(s);
            missing.push(s);
        }
        if (!missing.length) return;
        const rows = missing.map((anime_id) => ({ user_id: userId, anime_id }));
        try {
            const { error } = await supabaseClient
                .from('favorites_anime')
                .upsert(rows, { onConflict: 'user_id,anime_id', ignoreDuplicates: true });
            if (error) console.warn('[favorites] sync local→cloud:', error);
        } catch (e) {
            console.warn('[favorites] sync local→cloud:', e);
        }
    }

    async function loadFavorites(force) {
        if (_loaded && !force) return _cache;
        if (_loading && !force) return _loading;

        _loading = (async () => {
            const next = new Set();
            let user = null;
            const authPending =
                typeof global.isAuthenticatedSync === 'function' && global.isAuthenticatedSync();

            if (typeof getCurrentUser === 'function') {
                user = await getCurrentUser();
                if (authPending && (!user || user.isAnonymous)) {
                    for (let i = 0; i < 6 && (!user || user.isAnonymous); i++) {
                        await new Promise((r) => setTimeout(r, 250));
                        user = await getCurrentUser(true);
                    }
                }
            } else if (typeof global.getCurrentUserSync === 'function') {
                user = global.getCurrentUserSync();
            }

            if (user && typeof getUserData === 'function') {
                const ud = getUserData(user.id);
                const favs = (ud && ud.favorites) || [];
                for (const id of favs) {
                    const n = parseAnimeId(id);
                    if (n != null) next.add(String(n));
                }
            }

            if (user && !user.isAnonymous && typeof supabaseClient !== 'undefined' && supabaseClient) {
                try {
                    const { data, error } = await supabaseClient
                        .from('favorites_anime')
                        .select('anime_id')
                        .eq('user_id', user.id);
                    if (!error && Array.isArray(data)) {
                        for (const row of data) {
                            if (row && row.anime_id != null) next.add(String(row.anime_id));
                        }
                    }
                    // Старые избранные жили только в localStorage — выгружаем в облако
                    await pushMissingFavoritesToSupabase(user.id, next);
                    syncLocalFavorites(user.id, [...next]);
                    _cache.clear();
                    for (const id of next) _cache.add(id);
                    _loaded = true;
                    dispatchFavoritesLoaded();
                    return _cache;
                } catch (e) {
                    console.warn('[favorites] Supabase:', e);
                }
            }

            _cache.clear();
            for (const id of next) _cache.add(id);

            const deferLoaded = authPending && (!user || user.isAnonymous) && _cache.size === 0;
            if (!deferLoaded) {
                _loaded = true;
            }
            dispatchFavoritesLoaded();
            return _cache;
        })().finally(() => {
            _loading = null;
        });

        return _loading;
    }

    function isInFavorites(animeId) {
        const id = parseAnimeId(animeId);
        if (id == null) return false;
        return _cache.has(String(id));
    }

    function getFavoriteAnimeIds() {
        return [..._cache];
    }

    async function fetchFavoriteAnimeIdsForUser(userId) {
        const uid = String(userId || '').trim();
        if (!uid || typeof supabaseClient === 'undefined' || !supabaseClient) return [];
        try {
            const { data, error } = await supabaseClient
                .from('favorites_anime')
                .select('anime_id')
                .eq('user_id', uid);
            if (error || !Array.isArray(data)) return [];
            return data.map((r) => r && r.anime_id).filter((id) => id != null).map(String);
        } catch (_) {
            return [];
        }
    }

    async function addToFavorites(animeId) {
        const id = parseAnimeId(animeId);
        if (id == null) return { success: false, message: 'Некорректный id' };

        await loadFavorites();
        const idStr = String(id);
        if (_cache.has(idStr)) return { success: true, already: true, message: 'Уже в избранном' };

        let user = null;
        if (typeof getCurrentUser === 'function') user = await getCurrentUser();
        if (!user || user.isAnonymous) {
            return { success: false, message: 'auth_required' };
        }

        _cache.add(idStr);

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { error } = await supabaseClient.from('favorites_anime').insert({
                user_id: user.id,
                anime_id: idStr,
            });
            if (error && error.code !== '23505') {
                _cache.delete(idStr);
                console.warn('[favorites] insert:', error);
                return { success: false, message: error.message };
            }
            if (error && error.code === '23505') {
                return { success: true, already: true, message: 'Уже в избранном' };
            }
        }

        syncLocalFavorites(user.id, [..._cache]);

        if (typeof global.reminkoEpisodeNotifySeedFavorite === 'function') {
            try {
                await global.reminkoEpisodeNotifySeedFavorite(id);
            } catch (_) {
                /* ignore */
            }
        }

        dispatchFavoritesLoaded();
        return { success: true, message: 'Добавлено в избранное — сообщим о новых сериях 🎬' };
    }

    async function removeFromFavorites(animeId) {
        const id = parseAnimeId(animeId);
        if (id == null) return { success: false, message: 'Некорректный id' };

        await loadFavorites();
        const idStr = String(id);
        if (!_cache.has(idStr)) return { success: true, already: true, message: 'Уже удалено из избранного' };

        let user = null;
        if (typeof getCurrentUser === 'function') user = await getCurrentUser();
        if (!user || user.isAnonymous) {
            return { success: false, message: 'auth_required' };
        }

        _cache.delete(idStr);

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { error } = await supabaseClient
                .from('favorites_anime')
                .delete()
                .eq('user_id', user.id)
                .eq('anime_id', idStr);
            if (error) {
                _cache.add(idStr);
                console.warn('[favorites] delete:', error);
                return { success: false, message: error.message };
            }
        }

        syncLocalFavorites(user.id, [..._cache]);
        dispatchFavoritesLoaded();
        return { success: true, message: 'Удалено из избранного' };
    }

    async function resolveFavoriteAnime(rawId) {
        const id = parseAnimeId(rawId);
        if (id == null) return null;
        let anime = typeof getAnimeById === 'function' ? getAnimeById(id) : null;
        if (!anime && typeof global.KodikCatalogStore?.getById === 'function') {
            anime =
                global.KodikCatalogStore.getById(id) ||
                global.KodikCatalogStore.getById(String(id));
        }
        if (!anime) {
            return {
                id,
                title: 'Аниме #' + id,
                year: '',
                rating: 0,
                genres: [],
                posterUrl: null
            };
        }
        return typeof initAnimeStats === 'function' ? initAnimeStats(anime) : anime;
    }

    async function renderFavoritesPage() {
        const grid = document.getElementById('favoritesGrid');
        const empty = document.getElementById('emptyFavorites');
        if (!grid) return;

        const params = new URLSearchParams(window.location.search || '');
        const viewUserId = (params.get('user') || '').trim();
        let selfId = null;
        try {
            if (typeof getCurrentUser === 'function') {
                const u = await getCurrentUser();
                selfId = u && !u.isAnonymous ? u.id : null;
            }
        } catch (_) {
            selfId = null;
        }

        const isOther = !!(viewUserId && (!selfId || String(viewUserId) !== String(selfId)));
        let ids = [];
        let ownerName = '';

        if (isOther) {
            ids = await fetchFavoriteAnimeIdsForUser(viewUserId);
            try {
                const { data: p } = await supabaseClient
                    .from('profiles')
                    .select('username')
                    .eq('id', viewUserId)
                    .maybeSingle();
                ownerName = (p && p.username) || 'пользователя';
            } catch (_) {
                ownerName = 'пользователя';
            }
        } else {
            const isAuth =
                typeof isAuthenticated === 'function'
                    ? await isAuthenticated()
                    : typeof isAuthenticatedSync === 'function' && isAuthenticatedSync();
            if (!isAuth) {
                window.location.href = 'index.html';
                return;
            }
            await loadFavorites(true);
            ids = getFavoriteAnimeIds();
        }

        const titleEl = document.querySelector('.page-header .section-title');
        if (titleEl) {
            titleEl.textContent = isOther
                ? `Избранное аниме — ${ownerName}`
                : 'Избранное';
        }
        const back = document.querySelector('.page-header a.btn');
        if (back && isOther) {
            back.href = 'profile.html?user=' + encodeURIComponent(viewUserId);
            back.textContent = '← К профилю';
        }

        try {
            if (typeof global.KodikCatalogStore?.load === 'function') {
                await global.KodikCatalogStore.load();
            }
        } catch (_) {}

        const items = [];
        for (const id of ids) {
            const a = await resolveFavoriteAnime(id);
            if (a) items.push(a);
        }

        grid.innerHTML = '';
        if (!items.length) {
            if (empty) {
                empty.style.display = 'block';
                empty.innerHTML = isOther
                    ? `<h2>Нет избранных аниме</h2><p>У этого пользователя пока пусто</p><a href="profile.html?user=${encodeURIComponent(viewUserId)}" class="btn btn-primary">К профилю</a>`
                    : `<h2>У вас пока нет избранных аниме</h2><p>Добавьте аниме в избранное, чтобы они отображались здесь</p><a href="catalog/anime.html" class="btn btn-primary">Перейти в каталог</a>`;
            }
            return;
        }
        if (empty) empty.style.display = 'none';

        for (const anime of items) {
            if (typeof createAnimeCard === 'function') {
                grid.appendChild(createAnimeCard(anime));
            } else {
                const card = document.createElement('div');
                card.className = 'anime-card';
                card.onclick = () => {
                    if (typeof openAnimePage === 'function') openAnimePage(anime.id);
                    else window.location.href = 'anime/view.html?id=' + anime.id;
                };
                card.innerHTML = `<div class="anime-info"><h3 class="anime-title">${String(anime.title || '').replace(/</g, '&lt;')}</h3></div>`;
                grid.appendChild(card);
            }
        }

        // Таймеры до следующей серии для онгоингов в избранном
        void hydrateFavoritesCountdowns(items);
    }

    async function hydrateFavoritesCountdowns(items) {
        if (!Array.isArray(items) || !items.length) return;
        if (typeof reminkoResolveAnimeCountdownIso !== 'function') return;
        if (typeof reminkoAnimeNeedsEpisodeCountdown !== 'function') return;
        for (const a of items) {
            if (!a || !reminkoAnimeNeedsEpisodeCountdown(a)) continue;
            const card = document.querySelector(
                `#favoritesGrid .anime-card[data-id="${CSS.escape(String(a.id))}"]`
            );
            if (!card) continue;
            const slot = card.querySelector('[data-countdown-slot]');
            if (!slot || slot.getAttribute('data-countdown-iso')) continue;
            const mal = a.mal_id != null ? parseInt(a.mal_id, 10) : NaN;
            let shiki = null;
            if (Number.isFinite(mal) && mal > 0 && window.shikimoriApi?.readCachedByMalId) {
                shiki = window.shikimoriApi.readCachedByMalId(mal);
            }
            let iso = reminkoResolveAnimeCountdownIso(a, shiki);
            if (
                !iso &&
                Number.isFinite(mal) &&
                mal > 0 &&
                window.shikimoriApi?.enqueueFetchShikimoriByMalId
            ) {
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
                reminkoApplyCompactCountdown(slot, iso);
            }
        }
    }

    const api = {
        addToFavorites,
        removeFromFavorites,
        isInFavorites,
        loadFavorites,
        getFavoriteAnimeIds,
        fetchFavoriteAnimeIdsForUser
    };
    global.__reminkoFavoritesApi = api;
    global.addToFavorites = addToFavorites;
    global.removeFromFavorites = removeFromFavorites;
    global.isInFavorites = isInFavorites;
    global.loadFavorites = loadFavorites;
    global.getFavoriteAnimeIds = getFavoriteAnimeIds;
    global.fetchFavoriteAnimeIdsForUser = fetchFavoriteAnimeIdsForUser;

    function bindAuthFavoritesReload() {
        if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth?.onAuthStateChange) return;
        supabaseClient.auth.onAuthStateChange((event) => {
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                _loaded = false;
                void loadFavorites(true);
            }
            if (event === 'SIGNED_OUT') {
                _cache.clear();
                _loaded = false;
                dispatchFavoritesLoaded();
            }
        });
    }

    function boot() {
        bindAuthFavoritesReload();
        if (document.getElementById('favoritesGrid')) {
            void renderFavoritesPage();
        } else {
            void loadFavorites();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(typeof window !== 'undefined' ? window : globalThis);

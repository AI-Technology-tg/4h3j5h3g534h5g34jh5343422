// Функции для управления историей просмотров (+ зеркало в Supabase watch_history)

function reminkoWatchHistoryAnimeKey(animeId) {
    const n = parseInt(animeId, 10);
    return Number.isFinite(n) ? String(n) : '';
}

async function reminkoUpsertWatchHistoryRemote(userId, animeId, episodeNumber) {
    if (!userId || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    const animeKey = reminkoWatchHistoryAnimeKey(animeId);
    const episodeNum = parseInt(episodeNumber, 10);
    if (!animeKey || !Number.isFinite(episodeNum) || episodeNum < 1) return;

    try {
        // Подтянуть сессию: иначе RLS auth.uid() пустой и insert молча не проходит
        try {
            await supabaseClient.auth.getSession();
        } catch (_) {
            /* ignore */
        }

        const { data: existing } = await supabaseClient
            .from('watch_history')
            .select('id')
            .eq('user_id', userId)
            .eq('anime_id', animeKey)
            .eq('episode_number', episodeNum)
            .maybeSingle();

        const watchedAt = new Date().toISOString();
        if (existing && existing.id) {
            const { error } = await supabaseClient
                .from('watch_history')
                .update({ watched_at: watchedAt })
                .eq('id', existing.id);
            if (error) console.warn('[watch_history] update:', error);
        } else {
            const { error } = await supabaseClient.from('watch_history').insert({
                user_id: userId,
                anime_id: animeKey,
                episode_number: episodeNum,
                watched_at: watchedAt
            });
            if (error && error.code !== '23505') {
                console.warn('[watch_history] insert:', error);
            }
        }
    } catch (e) {
        console.warn('[watch_history] sync:', e);
    }
}

/** Выгрузить локальную историю в Supabase (фоном, без блокировки UI). */
function reminkoPushLocalWatchHistoryToSupabase(userId) {
    if (!userId || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    if (typeof getUserData !== 'function') return;
    const userData = getUserData(userId);
    const list = (userData && userData.watchHistory) || [];
    if (!list.length) return;

    const seen = new Set();
    const jobs = [];
    for (const entry of list) {
        if (!entry || entry.type === 'manga') continue;
        const animeKey = reminkoWatchHistoryAnimeKey(entry.animeId);
        const ep = parseInt(entry.episodeNumber, 10);
        if (!animeKey || !Number.isFinite(ep) || ep < 1) continue;
        const k = `${animeKey}:${ep}`;
        if (seen.has(k)) continue;
        seen.add(k);
        jobs.push({ animeKey, ep });
        if (jobs.length >= 80) break;
    }

    void (async () => {
        for (const job of jobs) {
            await reminkoUpsertWatchHistoryRemote(userId, job.animeKey, job.ep);
        }
    })();
}

function addToWatchHistory(animeId, episodeNumber) {
    let authed = typeof isAuthenticatedSync === 'function' ? isAuthenticatedSync() : false;
    if (!authed && localStorage.getItem('isAuth') === 'true') {
        try {
            const raw = sessionStorage.getItem('currentUser');
            authed = !!(raw && JSON.parse(raw)?.id);
        } catch (_) {
            authed = false;
        }
    }
    if (!authed) return;

    let user = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
    if (!user || !user.id) {
        try {
            user = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
        } catch (_) {
            user = null;
        }
    }
    if (!user || !user.id) return;

    if (typeof ensureUserDataRecord === 'function') {
        ensureUserDataRecord(user.id);
    }

    const userData = typeof getUserData === 'function' ? getUserData(user.id) : null;
    if (!userData) return;

    if (!userData.watchHistory) {
        userData.watchHistory = [];
    }

    const animeIdInt = parseInt(animeId, 10);
    const episodeNum = parseInt(episodeNumber, 10);
    if (!Number.isFinite(animeIdInt) || !Number.isFinite(episodeNum) || episodeNum < 1) return;

    userData.watchHistory = userData.watchHistory.filter(
        (entry) =>
            !(
                parseInt(entry.animeId, 10) === animeIdInt &&
                parseInt(entry.episodeNumber, 10) === episodeNum
            )
    );

    userData.watchHistory.unshift({
        animeId: animeIdInt,
        episodeNumber: episodeNum,
        watchedAt: new Date().toISOString(),
        type: 'anime'
    });

    if (userData.watchHistory.length > 500) {
        userData.watchHistory = userData.watchHistory.slice(0, 500);
    }

    if (typeof updateUserData === 'function') {
        updateUserData(user.id, { watchHistory: userData.watchHistory });
    }

    void reminkoUpsertWatchHistoryRemote(user.id, animeIdInt, episodeNum);

    try {
        window.dispatchEvent(new CustomEvent('reminko-watch-history-updated'));
    } catch (_) {
        /* ignore */
    }
}

function addToMangaHistory(mangaId, chapterNumber) {
    if (!isAuthenticatedSync()) return;

    const user = getCurrentUserSync();
    if (!user) return;

    const userData = getUserData(user.id);
    if (!userData) return;

    if (!userData.mangaHistory) {
        userData.mangaHistory = [];
    }

    const mangaIdInt = parseInt(mangaId, 10);
    const chapterNum = parseInt(chapterNumber, 10);

    userData.mangaHistory = userData.mangaHistory.filter(
        (entry) => !(entry.mangaId === mangaIdInt && entry.chapterNumber === chapterNum)
    );

    userData.mangaHistory.unshift({
        mangaId: mangaIdInt,
        chapterNumber: chapterNum,
        watchedAt: new Date().toISOString(),
        type: 'manga'
    });

    if (userData.mangaHistory.length > 500) {
        userData.mangaHistory = userData.mangaHistory.slice(0, 500);
    }

    updateUserData(user.id, { mangaHistory: userData.mangaHistory });
}

function getWatchHistory(userId) {
    const userData = getUserData(userId);
    if (!userData || !userData.watchHistory) {
        return [];
    }
    return userData.watchHistory;
}

function getMangaHistory(userId) {
    const userData = getUserData(userId);
    if (!userData || !userData.mangaHistory) {
        return [];
    }
    return userData.mangaHistory;
}

function getLastWatchedEpisode(animeId) {
    if (!isAuthenticatedSync()) return null;

    const user = getCurrentUserSync();
    if (!user) return null;

    const history = getWatchHistory(user.id);
    const animeIdInt = parseInt(animeId, 10);
    if (!Number.isFinite(animeIdInt)) return null;

    let best = null;
    for (const entry of history) {
        if (!entry || entry.type !== 'anime') continue;
        if (parseInt(entry.animeId, 10) !== animeIdInt) continue;
        const ep = parseInt(entry.episodeNumber, 10);
        if (!Number.isFinite(ep) || ep < 1) continue;
        if (best == null || ep > best) best = ep;
    }
    return best;
}

function getLastReadChapter(mangaId) {
    if (!isAuthenticatedSync()) return null;

    const user = getCurrentUserSync();
    if (!user) return null;

    const history = getMangaHistory(user.id);
    const mangaIdInt = parseInt(mangaId, 10);

    const entry = history.find(
        (e) => e.mangaId === mangaIdInt && e.type === 'manga'
    );
    return entry ? entry.chapterNumber : null;
}

/** Удалить все записи по тайтлу из истории аниме (для блока на главной и страницы истории). */
function removeAnimeFromWatchHistory(animeId) {
    if (typeof isAuthenticatedSync !== 'function' || !isAuthenticatedSync()) return false;

    const user = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
    if (!user?.id) return false;

    if (typeof ensureUserDataRecord === 'function') {
        ensureUserDataRecord(user.id);
    }

    const userData = getUserData(user.id);
    if (!userData?.watchHistory?.length) return false;

    const id = parseInt(animeId, 10);
    if (Number.isNaN(id)) return false;

    const next = userData.watchHistory.filter(
        (entry) => entry && parseInt(entry.animeId, 10) !== id
    );
    if (next.length === userData.watchHistory.length) return false;

    updateUserData(user.id, { watchHistory: next });

    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        void supabaseClient
            .from('watch_history')
            .delete()
            .eq('user_id', user.id)
            .eq('anime_id', String(id))
            .then(({ error }) => {
                if (error) console.warn('[watch_history] delete anime:', error);
            });
    }

    try {
        window.dispatchEvent(new CustomEvent('reminko-watch-history-updated'));
    } catch (_) {
        /* ignore */
    }
    return true;
}

function clearWatchHistory() {
    if (!isAuthenticatedSync()) return;

    const user = getCurrentUserSync();
    if (!user) return;

    updateUserData(user.id, { watchHistory: [] });

    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        void supabaseClient
            .from('watch_history')
            .delete()
            .eq('user_id', user.id)
            .then(({ error }) => {
                if (error) console.warn('[watch_history] clear:', error);
            });
    }

    try {
        window.dispatchEvent(new CustomEvent('reminko-watch-history-updated'));
    } catch (_) {
        /* ignore */
    }
}

function clearMangaHistory() {
    if (!isAuthenticatedSync()) return;

    const user = getCurrentUserSync();
    if (!user) return;

    updateUserData(user.id, { mangaHistory: [] });
}

if (typeof window !== 'undefined') {
    window.reminkoPushLocalWatchHistoryToSupabase = reminkoPushLocalWatchHistoryToSupabase;
    window.reminkoUpsertWatchHistoryRemote = reminkoUpsertWatchHistoryRemote;
}

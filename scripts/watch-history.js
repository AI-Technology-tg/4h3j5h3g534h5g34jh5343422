// Функции для управления историей просмотров

function addToWatchHistory(animeId, episodeNumber) {
    if (typeof isAuthenticatedSync !== 'function' || !isAuthenticatedSync()) return;
    
    const user = getCurrentUserSync();
    if (!user) return;

    if (typeof ensureUserDataRecord === 'function') {
        ensureUserDataRecord(user.id);
    }
    
    const userData = getUserData(user.id);
    if (!userData) return;
    
    if (!userData.watchHistory) {
        userData.watchHistory = [];
    }
    
    const animeIdInt = parseInt(animeId);
    const episodeNum = parseInt(episodeNumber);
    
    userData.watchHistory = userData.watchHistory.filter(
        (entry) =>
            !(parseInt(entry.animeId, 10) === animeIdInt && parseInt(entry.episodeNumber, 10) === episodeNum)
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
    
    updateUserData(user.id, { watchHistory: userData.watchHistory });

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
    
    const mangaIdInt = parseInt(mangaId);
    const chapterNum = parseInt(chapterNumber);
    
    userData.mangaHistory = userData.mangaHistory.filter(
        entry => !(entry.mangaId === mangaIdInt && entry.chapterNumber === chapterNum)
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
    const mangaIdInt = parseInt(mangaId);
    
    const entry = history.find(entry => entry.mangaId === mangaIdInt && entry.type === 'manga');
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

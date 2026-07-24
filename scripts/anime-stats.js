// Система статистики аниме (рейтинги, просмотры, избранное)

// Инициализация статистики для аниме
function initAnimeStats(anime) {
    const statsKey = `anime_stats_${anime.id}`;
    let stats = JSON.parse(localStorage.getItem(statsKey) || 'null');
    
    if (!stats) {
        // Создаем начальную статистику
        stats = {
            rating: anime.rating || 0,
            ratingCount: Math.floor(Math.random() * 5000) + 100, // 100-5100
            views: Math.floor(Math.random() * 50000) + 1000, // 1000-51000
            favoritesCount: Math.floor(Math.random() * 500) + 10 // 10-510
        };
        localStorage.setItem(statsKey, JSON.stringify(stats));
    }
    
    return { ...anime, ...stats };
}

// Получить статистику аниме
function getAnimeStats(animeId) {
    const statsKey = `anime_stats_${animeId}`;
    return JSON.parse(localStorage.getItem(statsKey) || 'null');
}

// Обновить статистику аниме
function updateAnimeStats(animeId, stats) {
    const statsKey = `anime_stats_${animeId}`;
    localStorage.setItem(statsKey, JSON.stringify(stats));
}

// Добавить просмотр
function addView(animeId) {
    const stats = getAnimeStats(animeId);
    if (stats) {
        stats.views = (stats.views || 0) + 1;
        updateAnimeStats(animeId, stats);
    }
}

// Добавить оценку
function addRating(animeId, rating) {
    const stats = getAnimeStats(animeId);
    if (stats) {
        const oldRating = stats.rating || 0;
        const oldCount = stats.ratingCount || 0;
        
        // Пересчитываем средний рейтинг
        const newRating = ((oldRating * oldCount) + rating) / (oldCount + 1);
        
        stats.rating = Math.round(newRating * 10) / 10; // Округляем до 1 знака
        stats.ratingCount = oldCount + 1;
        updateAnimeStats(animeId, stats);
    }
}

// Избранное — каноническая реализация в favorites.js (не перезаписывать window.*)
function addToFavorites(animeId) {
    if (typeof window !== 'undefined' && window.__reminkoFavoritesApi?.addToFavorites) {
        return window.__reminkoFavoritesApi.addToFavorites(animeId);
    }
    return { success: false, message: 'Модуль избранного не загружен' };
}

function removeFromFavorites(animeId) {
    if (typeof window !== 'undefined' && window.__reminkoFavoritesApi?.removeFromFavorites) {
        return window.__reminkoFavoritesApi.removeFromFavorites(animeId);
    }
    return { success: false, message: 'Модуль избранного не загружен' };
}

function isInFavorites(animeId) {
    if (typeof window !== 'undefined' && window.__reminkoFavoritesApi?.isInFavorites) {
        return window.__reminkoFavoritesApi.isInFavorites(animeId);
    }
    return false;
}

// Получить аниме с актуальной статистикой
function getAnimeWithStats(animeId) {
    const anime = getAnimeById(animeId);
    if (!anime) return null;
    
    return initAnimeStats(anime);
}

// Получить все аниме с статистикой
function getAllAnimeWithStats() {
    return getAllAnime().map(anime => initAnimeStats(anime));
}

// Не экспортируем favorites-API здесь — favorites.js задаёт window.* после загрузки
window.getAnimeStats = getAnimeStats;
window.initAnimeStats = initAnimeStats;
window.addView = addView;

// Страница истории просмотров

document.addEventListener('DOMContentLoaded', async () => {
    // Проверка авторизации
    if (!(typeof isAuthenticated === 'function' && await isAuthenticated())) {
        window.location.href = 'index.html';
        return;
    }
    
    await loadHistory();
});

async function loadHistory() {
    const user = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    const userData = getUserData(user.id);
    if (!userData) {
        window.location.href = 'index.html';
        return;
    }
    
    // Загружаем историю аниме
    const animeHistory = getWatchHistory(user.id);
    renderAnimeHistory(animeHistory);
    
    // Загружаем историю манги
    const mangaHistory = getMangaHistory(user.id);
    renderMangaHistory(mangaHistory);
}

function renderAnimeHistory(history) {
    const container = document.getElementById('animeHistoryList');
    const emptyState = document.getElementById('emptyAnimeHistory');
    
    if (!container || !emptyState) return;
    
    if (history.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    container.style.display = 'flex';
    emptyState.style.display = 'none';
    
    // Группируем по аниме (показываем только последний просмотренный эпизод каждого аниме)
    const groupedHistory = {};
    history.forEach(entry => {
        if (!groupedHistory[entry.animeId] || new Date(entry.watchedAt) > new Date(groupedHistory[entry.animeId].watchedAt)) {
            groupedHistory[entry.animeId] = entry;
        }
    });
    
    const historyEntries = Object.values(groupedHistory)
        .map(entry => {
            const anime = getAnimeById(entry.animeId);
            if (!anime) return null;
            return {
                anime,
                episodeNumber: entry.episodeNumber,
                watchedAt: entry.watchedAt
            };
        })
        .filter(entry => entry !== null)
        .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt)); // Сортируем по дате (новые сверху)
    
    container.innerHTML = historyEntries.map(entry => {
        const animeId = parseInt(entry.anime.id, 10) || 0;
        const gradient = generateGradient(animeId);
        const watchedDate = new Date(entry.watchedAt).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        return `
            <div class="watch-history-item" onclick="openAnimePage(${animeId})">
                <div class="watch-history-poster" style="background: ${reminkoEscapeHtml(gradient)};"></div>
                <div class="watch-history-info">
                    <div class="watch-history-title">${reminkoEscapeHtml(entry.anime.title)}</div>
                    <div class="watch-history-episode">Серия ${reminkoEscapeHtml(entry.episodeNumber)}</div>
                    <div class="watch-history-date">${reminkoEscapeHtml(watchedDate)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderMangaHistory(history) {
    const container = document.getElementById('mangaHistoryList');
    const emptyState = document.getElementById('emptyMangaHistory');
    
    if (!container || !emptyState) return;
    
    if (history.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    container.style.display = 'flex';
    emptyState.style.display = 'none';
    
    // Группируем по манге (показываем только последнюю прочитанную главу каждой манги)
    const groupedHistory = {};
    history.forEach(entry => {
        if (!groupedHistory[entry.mangaId] || new Date(entry.watchedAt) > new Date(groupedHistory[entry.mangaId].watchedAt)) {
            groupedHistory[entry.mangaId] = entry;
        }
    });
    
    const historyEntries = Object.values(groupedHistory)
        .map(entry => {
            const manga = typeof getMangaById === 'function' ? getMangaById(entry.mangaId) : null;
            if (!manga) return null;
            return {
                manga,
                chapterNumber: entry.chapterNumber,
                watchedAt: entry.watchedAt
            };
        })
        .filter(entry => entry !== null)
        .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt)); // Сортируем по дате (новые сверху)
    
    container.innerHTML = historyEntries.map(entry => {
        const mangaId = parseInt(entry.manga.id, 10) || 0;
        const gradient = generateGradient(mangaId);
        const watchedDate = new Date(entry.watchedAt).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        return `
            <div class="watch-history-item" onclick="openMangaPage(${mangaId})">
                <div class="watch-history-poster" style="background: ${reminkoEscapeHtml(gradient)};"></div>
                <div class="watch-history-info">
                    <div class="watch-history-title">${reminkoEscapeHtml(entry.manga.title)}</div>
                    <div class="watch-history-episode">Глава ${reminkoEscapeHtml(entry.chapterNumber)}</div>
                    <div class="watch-history-date">${reminkoEscapeHtml(watchedDate)}</div>
                </div>
            </div>
        `;
    }).join('');
}


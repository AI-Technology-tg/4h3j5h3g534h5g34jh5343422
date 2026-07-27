// Страница избранных манг

document.addEventListener('DOMContentLoaded', async () => {
    const isAuth = await isAuthenticated();
    if (!isAuth) {
        window.location.href = 'index.html';
        return;
    }
    
    loadFavoritesManga();
});

function loadFavoritesManga() {
    const user = getCurrentUserSync();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    const userData = getUserData(user.id);
    if (!userData) {
        window.location.href = 'index.html';
        return;
    }
    
    const mangaFavorites = userData.mangaFavorites || [];
    renderFavoritesManga(mangaFavorites);
}

function renderFavoritesManga(mangaFavorites) {
    const container = document.getElementById('favoritesContainer');
    if (!container) return;
    
    if (mangaFavorites.length === 0) {
        container.innerHTML = `
            <div class="page-placeholder">
                <h1>У вас пока нет избранных манг</h1>
                <p>Добавьте мангу в избранное, чтобы она отображалась здесь.</p>
                <a href="catalog/manga.html" class="btn btn-primary" style="margin-top: 1rem;">Перейти в каталог манги</a>
            </div>
        `;
        return;
    }
    
    const favoritesManga = mangaFavorites.map(id => {
        const manga = typeof getMangaById === 'function' ? getMangaById(id) : null;
        return manga;
    }).filter(m => m !== null);
    
    const grid = document.createElement('div');
    grid.className = 'anime-grid';
    favoritesManga.forEach((manga) => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        const gradient = generateGradient(manga.id);
        card.innerHTML = `
            <div class="anime-poster" style="background: ${reminkoEscapeHtml(gradient)};">
                <div class="anime-year">${reminkoEscapeHtml(manga.year)}</div>
                ${manga.status ? `<div class="anime-status">${reminkoEscapeHtml(manga.status)}</div>` : ''}
            </div>
            <div class="anime-info">
                <h3 class="anime-title">${reminkoEscapeHtml(manga.title)}</h3>
                <div class="anime-meta">
                    <div class="anime-rating">⭐ ${reminkoEscapeHtml(manga.rating || 0)}</div>
                    ${manga.totalChapters ? `<div class="anime-episodes">Глав: ${reminkoEscapeHtml(manga.totalChapters)}</div>` : ''}
                </div>
                ${manga.author ? `<div class="anime-studio">Автор: ${reminkoEscapeHtml(manga.author)}</div>` : ''}
                ${manga.genres ? `<div class="anime-genres">${reminkoEscapeHtml(manga.genres.slice(0, 2).join(', '))}</div>` : ''}
            </div>
        `;
        card.addEventListener('click', () => openMangaPage(manga.id));
        grid.appendChild(card);
    });
    container.replaceChildren(grid);
}

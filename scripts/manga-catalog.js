// Каталог манги - полнофункциональный

let currentPage = 1;
const itemsPerPage = 24;
let allResults = [];

// Обновление текста кнопки фильтра
function updateFilterButtonText(btnId, values) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    
    if (!Array.isArray(values)) values = values ? [values] : [];
    
    const valueEl = btn.querySelector('.filter-chip-value');
    const defaultText = 'Все';
    const displayText = values.length === 0 ? defaultText : values.length === 1 ? values[0] : `Выбрано: ${values.length}`;
    
    if (valueEl) {
        valueEl.textContent = displayText;
    } else {
        const svg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        btn.innerHTML = (values.length === 0 ? (btnId.includes('Genre') ? 'Выберите жанр' : btnId.includes('Type') ? 'Выберите тип' : 'Выберите статус') : displayText) + ' ' + svg;
    }
}

// Переход на страницу
function goToPage(page) {
    currentPage = page;
    displayResults(allResults);
    updatePagination(allResults.length);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Глобальная функция для пагинации (доступна из HTML)
window.goToPage = goToPage;

document.addEventListener('DOMContentLoaded', () => {
    // loadGenres вызывается после загрузки каталога ReManga
});

async function ensureRemangaCatalogForPage() {
    if (typeof ensureRemangaCatalogLoaded === 'function') {
        await ensureRemangaCatalogLoaded();
    }
}

function initMangaCatalogAfterNavigation() {
    if (!document.getElementById('catalogResults')) return;
    void ensureRemangaCatalogForPage().then(() => {
        loadGenres();
    });
}

window.addEventListener('reminko:navigation-applied', initMangaCatalogAfterNavigation);
window.addEventListener('reminko-remanga-catalog-loaded', () => {
    if (!document.getElementById('catalogResults')) return;
    loadGenres();
});

document.addEventListener('DOMContentLoaded', () => {
    void ensureRemangaCatalogForPage().then(() => {
        if (document.getElementById('filterGenrePanel')) loadGenres();
    });
});

// Загрузка фильтров из URL
function loadFilters() {
    const params = getUrlParams();
    
    // Поиск
    const searchInput = document.getElementById('catalogSearch');
    if (searchInput && params.search) {
        searchInput.value = params.search;
    }
    
    // Жанры (чекбоксы)
    if (params.genre && Array.isArray(params.genre)) {
        params.genre.forEach(genre => {
            const checkbox = document.querySelector(`#filterGenrePanel input[value="${genre}"]`);
            if (checkbox) checkbox.checked = true;
        });
        updateFilterButtonText('filterGenreBtn', params.genre);
    }
    
    // Типы (чекбоксы)
    if (params.type && Array.isArray(params.type)) {
        params.type.forEach(type => {
            const checkbox = document.querySelector(`#filterTypePanel input[value="${type}"]`);
            if (checkbox) checkbox.checked = true;
        });
        updateFilterButtonText('filterTypeBtn', params.type);
    } else if (params.type) {
        const checkbox = document.querySelector(`#filterTypePanel input[value="${params.type}"]`);
        if (checkbox) checkbox.checked = true;
        updateFilterButtonText('filterTypeBtn', [params.type]);
    }
    
    // Статусы (чекбоксы)
    if (params.status && Array.isArray(params.status)) {
        params.status.forEach(status => {
            const checkbox = document.querySelector(`#filterStatusPanel input[value="${status}"]`);
            if (checkbox) checkbox.checked = true;
        });
        updateFilterButtonText('filterStatusBtn', params.status);
    } else if (params.status) {
        const checkbox = document.querySelector(`#filterStatusPanel input[value="${params.status}"]`);
        if (checkbox) checkbox.checked = true;
        updateFilterButtonText('filterStatusBtn', [params.status]);
    }
    
    // Год ОТ
    const yearFromRange = document.getElementById('filterYearFromRange');
    const yearFromSpan = document.getElementById('filterYearFrom');
    if (yearFromRange && params.yearFrom) {
        yearFromRange.value = params.yearFrom;
        if (yearFromSpan) yearFromSpan.textContent = params.yearFrom;
    }
    
    // Год ДО
    const yearToRange = document.getElementById('filterYearToRange');
    const yearToSpan = document.getElementById('filterYearTo');
    if (yearToRange && params.yearTo) {
        yearToRange.value = params.yearTo;
        if (yearToSpan) yearToSpan.textContent = params.yearTo;
    }
    
    // Сортировка
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect && params.sort) {
        sortSelect.value = params.sort;
    }
}

// Применение фильтров
function applyFilters(smoothScroll = true) {
    const filters = getFilters();
    
    // Показываем индикатор загрузки
    showLoadingIndicator();
    
    // Используем setTimeout для предотвращения прыжков страницы
    setTimeout(() => {
        // Получаем все результаты с применением фильтров
        allResults = filterManga(filters);
        
        // Сортируем результаты
        const sortSelect = document.getElementById('sortSelect');
        const sortBy = sortSelect ? sortSelect.value : 'rating-desc';
        allResults = sortManga(allResults, sortBy);
        
        // Обновляем URL
        filters.sort = sortBy;
        updateFiltersInUrl(filters);
        
        // Отображаем результаты
        currentPage = 1;
        displayResults(allResults);
        updatePagination(allResults.length);
        
        // Скрываем индикатор загрузки
        hideLoadingIndicator();
        
        // Прокручиваем вверх если нужно
        if (smoothScroll) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, 100);
}

// Получить текущие фильтры
function getFilters() {
    const searchInput = document.getElementById('catalogSearch');
    const sortSelect = document.getElementById('sortSelect');
    
    // Получаем жанры из чекбоксов (можно несколько)
    const genreCheckboxes = document.querySelectorAll('#filterGenrePanel input[type="checkbox"]:checked');
    const genre = Array.from(genreCheckboxes).map(cb => cb.value);
    
    // Получаем типы из чекбоксов
    const typeCheckboxes = document.querySelectorAll('#filterTypePanel input[type="checkbox"]:checked');
    const type = Array.from(typeCheckboxes).map(cb => cb.value);
    
    // Получаем статусы из чекбоксов
    const statusCheckboxes = document.querySelectorAll('#filterStatusPanel input[type="checkbox"]:checked');
    const status = Array.from(statusCheckboxes).map(cb => cb.value);
    
    // Получаем год ОТ и ДО
    const yearFromRange = document.getElementById('filterYearFromRange');
    const yearToRange = document.getElementById('filterYearToRange');
    const yearFrom = yearFromRange ? parseInt(yearFromRange.value) : null;
    const yearTo = yearToRange ? parseInt(yearToRange.value) : null;
    
    return {
        search: searchInput ? searchInput.value.trim() : '',
        genre: genre,
        type: type,
        status: status,
        yearFrom: yearFrom,
        yearTo: yearTo,
        ratingMin: null, // Убрали рейтинг
        sort: sortSelect ? sortSelect.value : 'rating-desc'
    };
}

// Отображение результатов
function displayResults(results) {
    const container = document.getElementById('catalogResults');
    if (!container) return;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageResults = results.slice(startIndex, endIndex);
    
    if (pageResults.length === 0) {
        const isEmptyCatalog = results.length === 0;
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <p style="font-size: 1.2rem; color: var(--text-secondary);">${isEmptyCatalog ? 'Каталог манги пуст' : 'Манга не найдена'}</p>
                <p style="color: var(--text-secondary); margin-top: 0.5rem;">${isEmptyCatalog ? 'Тайтлы пока не добавлены.' : 'Попробуйте изменить фильтры'}</p>
            </div>
        `;
        return;
    }
    
    if (typeof appendCardsInBatches === 'function') {
        appendCardsInBatches(container, pageResults, (manga) => createMangaCard(manga), { batchSize: 3, batchDelayMs: 400, staggerMs: 80 });
    } else {
        container.innerHTML = '';
        pageResults.forEach(manga => container.appendChild(createMangaCard(manga)));
    }
    
    // Обновляем информацию о результатах
    const resultsInfo = document.getElementById('resultsInfo');
    if (resultsInfo) {
        resultsInfo.textContent = `Найдено: ${results.length} манги`;
    }
}

// Создание карточки манги
function createMangaCard(manga) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.dataset.id = manga.id;
    
    const gradient = generateGradient(manga.id);
    const coverSrc =
        typeof ReManga !== 'undefined' && ReManga.normalizeCover
            ? ReManga.normalizeCover(manga)
            : manga.cover || manga.poster || null;
    const posterStyle = coverSrc
        ? `background-image: url('${coverSrc.replace(/'/g, '%27')}'); background-size: cover; background-position: center;`
        : `background: ${gradient};`;
    const metaLine = [manga.type, manga.year].filter(Boolean).join(' · ');
    
    card.innerHTML = `
        <div class="anime-poster" style="${posterStyle}">
            <div class="anime-year">${manga.year}</div>
            ${manga.status ? `<div class="anime-status">${manga.status}</div>` : ''}
        </div>
        <div class="anime-info">
            <h3 class="anime-title">${manga.title}</h3>
            ${metaLine ? `<div class="anime-studio" style="opacity:0.85;font-size:0.85rem">${metaLine}</div>` : ''}
            <div class="anime-meta">
                <div class="anime-rating">⭐ ${manga.rating || 0}</div>
                ${manga.totalChapters ? `<div class="anime-episodes">Глав: ${manga.totalChapters}</div>` : ''}
            </div>
            ${manga.author ? `<div class="anime-studio">Автор: ${manga.author}</div>` : ''}
            ${manga.genres ? `<div class="anime-genres">${manga.genres.slice(0, 2).join(', ')}</div>` : ''}
        </div>
    `;
    
    const seoHref =
        typeof reminkoContentViewUrl === 'function'
            ? reminkoContentViewUrl('manga', manga.id)
            : `../manga/view.html?id=${encodeURIComponent(String(manga.id))}`;
    card.innerHTML =
        `<a class="anime-card-seo-link" href="${seoHref}" tabindex="-1" aria-hidden="true">${manga.title}</a>` +
        card.innerHTML;
    card.onclick = () => openMangaPage(manga.id);
    
    // Обложка из API, если в каталоге нет cover
    if (!coverSrc && typeof loadAnimePosterLazy === 'function') {
        card.dataset.contentType = 'manga';
        const searchTitles = manga.titleAlt ? [manga.titleAlt, manga.title] : manga.title;
        loadAnimePosterLazy(card, searchTitles, gradient);
    }
    
    return card;
}

// Открытие страницы манги
function openMangaPage(mangaId) {
    sessionStorage.setItem('scrollPosition', window.scrollY.toString());
    sessionStorage.setItem('previousUrl', window.location.href);
    sessionStorage.setItem('viewMangaId', String(mangaId));
    window.location.href =
        typeof reminkoContentViewUrl === 'function'
            ? reminkoContentViewUrl('manga', mangaId)
            : `../manga/view.html?id=${encodeURIComponent(String(mangaId))}`;
}

// Глобальная функция для открытия страницы манги
window.openMangaPage = openMangaPage;

// Обновление пагинации
function updatePagination(totalItems) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Кнопка "Назад"
    html += `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">← Назад</button>`;
    
    // Номера страниц
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<span class="pagination-dots">...</span>`;
        }
    }
    
    // Кнопка "Вперёд"
    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">Вперёд →</button>`;
    
    pagination.innerHTML = html;
}

// Показать индикатор загрузки
function showLoadingIndicator() {
    const container = document.getElementById('catalogResults');
    if (container) {
        container.style.opacity = '0.5';
        container.style.pointerEvents = 'none';
    }
}

// Скрыть индикатор загрузки
function hideLoadingIndicator() {
    const container = document.getElementById('catalogResults');
    if (container) {
        container.style.opacity = '1';
        container.style.pointerEvents = 'auto';
    }
}

// Инициализация событий фильтров (делегирование — переживает пересборку layout)
function initFilterEvents() {
    reminkoBindMangaCatalogFilterDelegation();
}

let _reminkoMangaSearchDebounce;
let _reminkoMangaYearDebounce;
function reminkoBindMangaCatalogFilterDelegation() {
    if (typeof window === 'undefined' || window.__reminkoMangaCatalogFilterDelegation) return;
    window.__reminkoMangaCatalogFilterDelegation = true;

    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !t.closest) return;

        if (t.closest('#resetFilters')) {
            e.preventDefault();
            resetFilters(e);
            return;
        }

        const closeBtn = t.closest('[data-filter-panel-close]');
        if (closeBtn) {
            e.preventDefault();
            e.stopPropagation();
            const panelId = closeBtn.dataset.filterPanelClose;
            const panel = panelId ? document.getElementById(panelId) : closeBtn.closest('.filter-select-panel');
            if (panel) panel.classList.remove('active');
            if (panel && panel.id) {
                const btn = document.getElementById(panel.id.replace('Panel', 'Btn'));
                if (btn) btn.classList.remove('active');
            }
            return;
        }

        const chip = t.closest('.filter-select-btn');
        if (chip && chip.dataset && chip.dataset.target) {
            e.stopPropagation();
            const panel = document.getElementById(chip.dataset.target);
            if (!panel) return;
            const isActive = panel.classList.contains('active');
            document.querySelectorAll('.filter-select-panel').forEach((p) => p.classList.remove('active'));
            document.querySelectorAll('.filter-select-btn').forEach((b) => b.classList.remove('active'));
            if (!isActive) {
                panel.classList.add('active');
                chip.classList.add('active');
            }
            return;
        }
    });

    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el) return;

        if (el.id === 'filterYearFromRange' || el.id === 'filterYearToRange') {
            const value = parseInt(el.value, 10);
            if (el.id === 'filterYearFromRange') {
                const yearFromSpan = document.getElementById('filterYearFrom');
                if (yearFromSpan) yearFromSpan.textContent = value;
                const yearToRange = document.getElementById('filterYearToRange');
                const yTo = document.getElementById('filterYearTo');
                if (yearToRange && !Number.isNaN(value) && value > parseInt(yearToRange.value, 10)) {
                    yearToRange.value = value;
                    if (yTo) yTo.textContent = value;
                }
            } else {
                const yearToSpan = document.getElementById('filterYearTo');
                if (yearToSpan) yearToSpan.textContent = value;
                const yearFromRange = document.getElementById('filterYearFromRange');
                const yFrom = document.getElementById('filterYearFrom');
                if (yearFromRange && !Number.isNaN(value) && value < parseInt(yearFromRange.value, 10)) {
                    yearFromRange.value = value;
                    if (yFrom) yFrom.textContent = value;
                }
            }
            clearTimeout(_reminkoMangaYearDebounce);
            _reminkoMangaYearDebounce = setTimeout(() => applyFilters(false), 350);
            return;
        }

        if (el.id === 'catalogSearch') {
            clearTimeout(_reminkoMangaSearchDebounce);
            _reminkoMangaSearchDebounce = setTimeout(() => applyFilters(false), 500);
        }
    });

    document.addEventListener('change', (e) => {
        const el = e.target;
        if (!el) return;

        if (el.id === 'sortSelect') {
            applyFilters(false);
            return;
        }

        if (el.type !== 'checkbox') return;
        const panel = el.closest &&
            (el.closest('#filterTypePanel') || el.closest('#filterGenrePanel') || el.closest('#filterStatusPanel'));
        if (!panel || !panel.id) return;
        const btnId = panel.id.replace('Panel', 'Btn');
        const checked = panel.querySelectorAll('input[type="checkbox"]:checked');
        updateFilterButtonText(btnId, Array.from(checked).map((cb) => cb.value));
        applyFilters(false);
    });
}

// Сброс фильтров
function resetFilters(e) {
    if (e) e.preventDefault();
    
    // Очищаем все поля формы
    const searchInput = document.getElementById('catalogSearch');
    if (searchInput) searchInput.value = '';
    
    // Сброс чекбоксов типов
    document.querySelectorAll('#filterTypePanel input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateFilterButtonText('filterTypeBtn', []);
    
    // Сброс чекбоксов жанров
    document.querySelectorAll('#filterGenrePanel input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateFilterButtonText('filterGenreBtn', []);
    
    // Сброс чекбоксов статусов
    document.querySelectorAll('#filterStatusPanel input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateFilterButtonText('filterStatusBtn', []);
    
    // Сброс слайдера года ОТ
    const yearFromRange = document.getElementById('filterYearFromRange');
    const yearFromSpan = document.getElementById('filterYearFrom');
    if (yearFromRange) {
        yearFromRange.value = yearFromRange.min || '1970';
        if (yearFromSpan) yearFromSpan.textContent = yearFromRange.value;
    }
    
    // Сброс слайдера года ДО
    const yearToRange = document.getElementById('filterYearToRange');
    const yearToSpan = document.getElementById('filterYearTo');
    if (yearToRange) {
        yearToRange.value = yearToRange.max || '2026';
        if (yearToSpan) yearToSpan.textContent = yearToRange.value;
    }
    
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.value = 'rating-desc';
    
    // Очистка URL
    const url = new URL(window.location);
    url.search = '';
    window.history.pushState({}, '', url);
    
    // Применяем пустые фильтры
    applyFilters();
}

// Обновление фильтров в URL
function updateFiltersInUrl(filters) {
    const params = {};
    if (filters.search) params.search = filters.search;
    if (filters.genre.length > 0) params.genre = filters.genre;
    if (filters.type.length > 0) params.type = filters.type;
    if (filters.status.length > 0) params.status = filters.status;
    if (filters.yearFrom) params.yearFrom = filters.yearFrom;
    if (filters.yearTo) params.yearTo = filters.yearTo;
    if (filters.sort) params.sort = filters.sort;
    
    setUrlParams(params);
}

// Загрузка жанров в фильтры
function loadGenres() {
    const panel = document.getElementById('filterGenrePanel');
    if (!panel) return;

    const scrollPosition = sessionStorage.getItem('scrollPosition');
    if (scrollPosition) {
        setTimeout(() => {
            window.scrollTo({ top: parseInt(scrollPosition, 10), behavior: 'auto' });
            sessionStorage.removeItem('scrollPosition');
        }, 100);
    }
    
    const container = panel.querySelector('.filter-dropdown-inner, .filter-genres-grid') || panel;
    const genres = getAllMangaGenres();
    container.innerHTML = genres.map(genre => `
        <label class="filter-option filter-checkbox-item">
            <input type="checkbox" value="${genre}" id="genre_${genre.replace(/\s+/g, '_')}">
            <span>${genre}</span>
        </label>
    `).join('');
    
    // После загрузки жанров применяем фильтры из URL и инициализируем события
    loadFilters();
    initFilterEvents();
    applyFilters();
}

reminkoBindMangaCatalogFilterDelegation();


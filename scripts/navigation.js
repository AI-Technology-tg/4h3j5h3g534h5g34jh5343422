// Общий компонент навигации для всех страниц
// Автоматически определяет текущую страницу и применяет активный класс

const REMINKO_ONLINE_WINDOW_MINUTES = 5;
const REMINKO_ONLINE_POLL_MS = 45000;

async function reminkoFetchRealOnlineCount() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return null;
    try {
        const { data, error } = await supabaseClient.rpc('site_visit_online_count', {
            p_window_minutes: REMINKO_ONLINE_WINDOW_MINUTES
        });
        if (error) {
            console.warn('[Online widget]', error);
            return null;
        }
        const n = Number(data);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    } catch (e) {
        console.warn('[Online widget]', e);
        return null;
    }
}

class NavigationManager {
    constructor() {
        this.currentPage = this.detectCurrentPage();
        this.basePath = this.getBasePath();
    }

    // Определение текущей страницы
    detectCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        
        if (filename === 'index.html' || path.endsWith('/')) return 'home';
        if (filename.includes('anime-4k.html')) return 'catalog-4k';
        if (filename.includes('anime.html')) return 'catalog';
        if (filename === 'calendar.html') return 'calendar';
        if (filename.includes('manga.html')) return 'manga';
        if (filename === 'profile.html') return 'profile';
        if (filename === 'favorites.html') return 'favorites';
        if (filename === 'favorites-manga.html') return 'favorites-manga';
        if (filename === 'history.html') return 'history';
        if (filename === 'friends.html') return 'friends';
        if (filename === 'watch-together.html') return 'watch-together';
        if (filename === 'minko-ai.html') return 'ai';
        if (filename === 'minko-edit.html') return 'minko-edit';
        if (filename === 'messages.html') return 'messages';
        if (filename === 'info.html') return 'info';
        if (filename === 'privacy-policy.html') return 'privacy';
        if (filename === 'terms-of-service.html') return 'terms';
        if (filename === 'admin.html') return 'admin';
        if (filename.includes('view.html')) {
            if (path.includes('anime')) return 'anime-view';
            if (path.includes('manga')) return 'manga-view';
        }
        if (filename === 'view-4k.html') return 'anime-view-4k';
        if (filename === 'reader.html') return 'manga-reader';
        
        return 'home';
    }

    // Получение базового пути для ссылок
    getBasePath() {
        const path = window.location.pathname;
        if (path.includes('/catalog/') || path.includes('/anime/') || path.includes('/manga/')) {
            return '../';
        }
        return '';
    }

    // Создание верхней панели
    createTopNavbar() {
        return `
            <nav class="top-navbar">
                <button class="sidebar-toggle" id="sidebarToggle" style="display: none;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                <div class="top-nav-container">
                    <a href="${this.basePath}index.html" class="top-logo">
                        <img src="${this.basePath}Fons/fonG.jpg" alt="Re-Minko Logo" class="top-logo-img" width="32" height="32" decoding="async" fetchpriority="high">
                        <span class="top-logo-text">Re-Minko</span>
                    </a>
                    <div class="top-online-widget" id="topOnlineWidget" title="Сейчас на сайте" aria-live="polite">
                        <span class="top-online-dot" aria-hidden="true"></span>
                        <span class="top-online-label">Онлайн</span>
                        <strong class="top-online-count" id="topOnlineCount">—</strong>
                    </div>
                    
                    <div class="top-search-wrapper">
                        <div class="top-search-input-wrapper">
                            <svg class="top-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                            </svg>
                            <input type="text" id="topSearchInput" class="top-search-input" placeholder="Поиск аниме..." autocomplete="off">
                        </div>
                        <div class="search-dropdown" id="searchDropdown"></div>
                    </div>
                    <span class="top-random-anime-slot" role="presentation">
                        <img
                            class="top-random-anime-btn"
                            id="topRandomAnimeBtn"
                            data-random-anime
                            src="${this.basePath}Fons/slu4ainoe.webp"
                            alt="Случайное аниме"
                            width="88"
                            height="88"
                            decoding="async"
                            role="button"
                            tabindex="0"
                            title="Случайное аниме"
                            aria-label="Случайное аниме"
                        >
                    </span>
                    <div class="top-nav-actions">
                        <button class="top-notifications-btn" id="topNotificationsBtn" style="display: none;" title="Уведомления" aria-label="Уведомления">
                            <svg class="top-notifications-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 3c-2.2 0-3.9 1.55-3.9 3.45v.85c0 2.15-1.05 3.9-2.7 4.95-.2.15-.35.4-.4.65-.05.25 0 .5.15.7.15.2.4.35.65.35h12.4c.25 0 .5-.15.65-.35.15-.2.2-.45.15-.7-.05-.25-.2-.5-.4-.65-1.65-1.05-2.7-2.8-2.7-4.95v-.85C15.9 4.55 14.2 3 12 3z" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M10 19a2 2 0 004 0" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
                            </svg>
                            <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
                        </button>
                        <a href="${this.basePath}profile.html" class="top-nav-link" id="topProfileLink" style="display: none;" data-maint-lock="profile">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            Профиль
                        </a>
                        <a href="#" class="top-nav-link btn-top-login" id="topLoginBtn">Войти</a>
                        <a href="#" class="top-nav-link btn-top-register" id="topRegisterBtn" data-maint-lock="register">Регистрация</a>
                        <a href="#" class="top-nav-link btn-top-logout" id="topLogoutBtn" style="display: none;">Выйти</a>
                    </div>
                </div>
            </nav>
        `;
    }

    // Проверка, показывать ли фильтры каталога (только в каталогах)
    shouldShowCatalogFilters() {
        return this.currentPage === 'catalog' || 
               this.currentPage === 'catalog-4k' ||
               this.currentPage === 'manga' || 
               this.currentPage === 'anime-view' || 
               this.currentPage === 'anime-view-4k' ||
               this.currentPage === 'manga-view';
    }

    // Создание боковой панели
    createSidebar() {
        const activeClass = (page) => (this.currentPage === page ? 'active' : '');

        return `
            <aside class="sidebar">
                <nav class="sidebar-nav">
                    <a href="${this.basePath}index.html" class="sidebar-link ${activeClass('home')}" data-page="home">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        <span>Главная</span>
                    </a>
                    <a href="${this.basePath}catalog/anime.html" class="sidebar-link ${activeClass('catalog')} ${activeClass('anime-view')}" data-page="catalog">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="9" y1="3" x2="9" y2="21"></line>
                        </svg>
                        <span>Каталог аниме</span>
                    </a>
                    <a href="${this.basePath}catalog/calendar.html" class="sidebar-link ${activeClass('calendar')}" data-page="calendar" data-maint-lock="calendar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        <span>Календарь</span>
                    </a>
                    <a href="${this.basePath}catalog/manga.html" class="sidebar-link ${activeClass('manga')} ${activeClass('manga-view')} ${activeClass('manga-reader')}" data-page="manga" data-maint-lock="manga_catalog">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                        </svg>
                        <span>Каталог манги</span>
                    </a>
                    <a href="${this.basePath}catalog/anime-4k.html" class="sidebar-link ${activeClass('catalog-4k')} ${activeClass('anime-view-4k')}" data-page="catalog-4k" data-maint-lock="anime_4k">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                            <path d="M8 21h8"></path>
                            <path d="M12 17v4"></path>
                            <path d="m7 7 3 3 7-7"></path>
                        </svg>
                        <span>≈4K каталог</span>
                    </a>
                    <div class="sidebar-divider"></div>
                    <a href="${this.basePath}minko-ai.html" class="sidebar-link ${activeClass('ai')}" data-page="ai" data-maint-lock="minko_ai">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                            <path d="M2 17l10 5 10-5"></path>
                            <path d="M2 12l10 5 10-5"></path>
                        </svg>
                        <span>Minko AI</span>
                    </a>
                    <a href="#" class="sidebar-link sidebar-link-disabled" data-page="minko-edit" data-reminko-disabled-link="true" aria-disabled="true" title="А нужно ли это здесь?">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="3" width="20" height="18" rx="3"></rect>
                            <polygon points="10 8 16 12 10 16 10 8"></polygon>
                        </svg>
                        <span>Minko Edit</span>
                        <span class="contemplation-badge">В размышлении</span>
                    </a>
                    <a href="${this.basePath}friends.html" class="sidebar-link ${activeClass('friends')}" data-page="friends" id="friendsLink" data-maint-lock="friends">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>Друзья</span>
                        <span class="friends-badge hidden" id="friendsBadge">0</span>
                    </a>
                    <a href="${this.basePath}watch-together.html" class="sidebar-link ${activeClass('watch-together')}" data-page="watch-together" id="watchTogetherLink" data-maint-lock="watch_together">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            <circle cx="19" cy="5" r="3"></circle>
                        </svg>
                        <span>Смотреть вместе</span>
                        <span class="vip-badge">VIP</span>
                    </a>
                    <div class="sidebar-divider"></div>
                    <a href="${this.basePath}messages.html" class="sidebar-link ${activeClass('messages')}" data-page="messages" id="messagesLink" data-maint-lock="messages">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                        <span>Сообщения</span>
                        <span class="friends-badge hidden" id="dmBadge">0</span>
                    </a>
                    <a href="${this.basePath}info.html" class="sidebar-link ${activeClass('info')}" data-page="info">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <line x1="10" y1="9" x2="8" y2="9"></line>
                        </svg>
                        <span>Инфо</span>
                    </a>
                    <a href="${this.basePath}admin.html" class="sidebar-link sidebar-link-creator ${activeClass('admin')}" id="sidebarCreatorAdminLink" data-page="admin" style="display: none;" title="Панель Создателя" data-maint-lock="admin">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                        <span>Создатель</span>
                    </a>
                    <a href="#" class="sidebar-link" id="supportMinkoSidebarLink" data-page="support-minko" title="Поддержка Минко AI" data-maint-lock="support">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 18.72a9.09 9.09 0 0 0 2.27-.7 1 1 0 0 0 .64-1.11 6.48 6.48 0 0 0-1.28-3.12 1 1 0 0 0-.16-.22l-.8-.96a1 1 0 0 0-1.58.38 4 4 0 0 1-6.78 0 1 1 0 0 0-1.58-.38l-.8.96a1 1 0 0 0-.16.22 6.48 6.48 0 0 0-1.28 3.12 1 1 0 0 0 .64 1.11A9.09 9.09 0 0 0 18 18.72z"></path>
                            <circle cx="12" cy="8" r="4"></circle>
                        </svg>
                        <span>Поддержка</span>
                    </a>
                    <div class="sidebar-legal-wrap" role="group" aria-label="Юридическая информация">
                        <div class="sidebar-divider"></div>
                        <a href="${this.basePath}privacy-policy.html" class="sidebar-link sidebar-link-legal ${activeClass('privacy')}" data-page="privacy-policy">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                            <span>Политика конфиденциальности</span>
                        </a>
                        <a href="${this.basePath}terms-of-service.html" class="sidebar-link sidebar-link-legal ${activeClass('terms')}" data-page="terms-of-service">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                            </svg>
                            <span>Условия использования</span>
                        </a>
                    </div>
                    <div class="sidebar-analytics-footer" aria-hidden="true">
                        <div class="sidebar-liveinternet-wrap">
                            <!--LiveInternet counter (скрыт, учёт через img)-->
                            <a href="https://www.liveinternet.ru/click" target="_blank" rel="noopener noreferrer" tabindex="-1">
                                <img id="licnt3A61" width="1" height="1" style="border:0"
                                    title="LiveInternet"
                                    src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAIBTAA7"
                                    alt="" />
                            </a>
                            <!--/LiveInternet-->
                        </div>
                        <div class="sidebar-yandex-metrika">
                            <noscript>
                                <div>
                                    <img src="https://mc.yandex.ru/watch/110777722" width="1" height="1" alt="" />
                                </div>
                            </noscript>
                        </div>
                    </div>
                </nav>
            </aside>
        `;
    }

    initTopSearch() {
        const topSearchInput = document.getElementById('topSearchInput');
        const dropdown = document.getElementById('searchDropdown');
        if (!topSearchInput || !dropdown) return;
        
        const basePath = this.basePath;
        let debounceTimer = null;
        const navScriptLoads = {};

        const loadNavScriptOnce = (file) => {
            const src = `${basePath}scripts/${file}`;
            if (navScriptLoads[src]) return navScriptLoads[src];
            if (file === 'anime4k-catalog-store.js' && window.Anime4kCatalogStore) {
                return Promise.resolve();
            }
            if (file === 'anime4k-data.js' && typeof searchAnime4k === 'function') {
                return Promise.resolve();
            }
            navScriptLoads[src] = new Promise((resolve) => {
                const existing = document.querySelector(`script[src="${src}"]`);
                if (existing) {
                    existing.addEventListener('load', () => resolve(), { once: true });
                    existing.addEventListener('error', () => resolve(), { once: true });
                    if (existing.dataset.loaded === '1') resolve();
                    return;
                }
                const s = document.createElement('script');
                s.src = src;
                s.async = true;
                s.onload = () => {
                    s.dataset.loaded = '1';
                    resolve();
                };
                s.onerror = () => resolve();
                document.head.appendChild(s);
            });
            return navScriptLoads[src];
        };

        const ensureAnime4kSearchReady = async () => {
            if (typeof searchAnime4k !== 'function') {
                if (!window.Anime4kCatalogStore) {
                    await loadNavScriptOnce('anime4k-catalog-store.js');
                }
                await loadNavScriptOnce('anime4k-data.js');
            }
            if (typeof window.Anime4kCatalogStore?.load === 'function') {
                try {
                    await window.Anime4kCatalogStore.load();
                } catch (_) {
                    /* ignore */
                }
            }
        };
        
        const performSearch = () => {
            const query = topSearchInput.value.trim();
            if (query.length < 2) {
                if (typeof showWarning === 'function') {
                    showWarning('Введите минимум 2 символа для поиска');
                }
                return;
            }
            dropdown.style.display = 'none';
            window.location.href = `${basePath}catalog/anime.html?search=${encodeURIComponent(query)}`;
        };
        
        const searchPosterFromCache = (item, isManga) => {
            if (typeof getPosterFromCacheV3 !== 'function') return null;
            const type = isManga ? 'manga' : 'anime';
            const ph = typeof window.POSTER_PLACEHOLDER === 'string' ? window.POSTER_PLACEHOLDER : '';
            const titles = [item.titleAlt, item.title].filter(Boolean);
            for (const t of titles) {
                const key = `${type}:${String(t).toLowerCase().trim()}`;
                const u = getPosterFromCacheV3(key);
                if (u && u !== ph) return u;
            }
            return null;
        };

        const hydrateNavSearchPosters = async (dd, list) => {
            if (typeof getPosterFast !== 'function') return;
            const ph = typeof window.POSTER_PLACEHOLDER === 'string' ? window.POSTER_PLACEHOLDER : '';
            const rows = dd.querySelectorAll('.search-dropdown-item:not(.search-dropdown-footer)');
            for (let i = 0; i < rows.length && i < list.length; i++) {
                const row = rows[i];
                const item = list[i];
                const slot = row.querySelector('.search-item-poster');
                if (!slot || slot.querySelector('.search-item-poster-img')) continue;
                const title = item.titleAlt || item.title;
                if (!title) continue;
                try {
                    const url = await getPosterFast(title, item._isManga ? 'manga' : 'anime');
                    if (url && url !== ph) {
                        const img = document.createElement('img');
                        img.className = 'search-item-poster-img';
                        img.alt = '';
                        img.loading = 'lazy';
                        const safeUrl =
                            typeof window.reminkoSafeImageUrl === 'function'
                                ? window.reminkoSafeImageUrl(url, '')
                                : url;
                        if (!safeUrl) continue;
                        img.src = safeUrl;
                        img.onerror = () => img.remove();
                        slot.appendChild(img);
                    }
                } catch (_) { /* ignore */ }
            }
        };

        const ensureKodikCatalogForSearch = async () => {
            if (typeof window.KodikCatalogStore?.load !== 'function') return;
            if (typeof window.KodikCatalogStore.isLoaded === 'function' && window.KodikCatalogStore.isLoaded()) {
                return;
            }
            try {
                dropdown.innerHTML = '<div class="search-dropdown-empty">Загрузка каталога…</div>';
                dropdown.style.display = 'block';
                await window.KodikCatalogStore.load();
            } catch (_) {
                /* ignore — поиск по уже загруженному */
            }
        };

        const showSuggestions = async (query) => {
            if (query.length < 2 || typeof searchAnime !== 'function') {
                dropdown.style.display = 'none';
                return;
            }

            await ensureAnime4kSearchReady();
            await ensureKodikCatalogForSearch();
            
            let defaultAnime = searchAnime(query).slice(0, 10);
            let anime4kHits = typeof searchAnime4k === 'function' ? searchAnime4k(query).slice(0, 6) : [];
            
            // Also search manga if available
            let mangaResults = [];
            if (typeof window.searchManga === 'function') {
                mangaResults = window.searchManga(query).slice(0, 4);
            }

            const results = [
                ...anime4kHits.map((a) => ({ ...a, _catalog: '4k', _isAnime4k: true })),
                ...defaultAnime.map((a) => ({ ...a, _catalog: 'default' })),
                ...mangaResults.map((m) => ({ ...m, _isManga: true }))
            ];
            
            if (results.length === 0) {
                dropdown.innerHTML = '<div class="search-dropdown-empty">Ничего не найдено</div>';
                dropdown.style.display = 'block';
                return;
            }
            
            dropdown.replaceChildren();
            for (const item of results) {
                const isManga = item._isManga;
                const is4k = item._isAnime4k || item.isAnime4k;
                let href;
                if (isManga) {
                    href = `${basePath}manga/view.html?id=${encodeURIComponent(item.id || '')}`;
                } else if (is4k) {
                    href = `${basePath}anime/view-4k.html?id=${encodeURIComponent(item.id || '')}`;
                } else {
                    href = `${basePath}anime/view.html?id=${encodeURIComponent(item.id || '')}`;
                }
                const generatedGradient =
                    typeof generateGradient === 'function' ? generateGradient(item.id) : '';
                const gradient =
                    typeof generatedGradient === 'string' &&
                    /^linear-gradient\([^;{}]+\)$/i.test(generatedGradient)
                        ? generatedGradient
                        : 'linear-gradient(135deg, #6366f1, #8b5cf6)';
                const cached = searchPosterFromCache(item, isManga);

                const link = document.createElement('a');
                link.href = href;
                link.className = 'search-dropdown-item';

                const poster = document.createElement('div');
                poster.className = 'search-item-poster';
                poster.style.background = gradient;
                const posterUrl = cached || item.posterUrl || '';
                const safePoster =
                    typeof window.reminkoSafeImageUrl === 'function'
                        ? window.reminkoSafeImageUrl(posterUrl, '')
                        : posterUrl;
                if (safePoster) {
                    const img = document.createElement('img');
                    img.className = 'search-item-poster-img';
                    img.src = safePoster;
                    img.alt = '';
                    img.loading = 'lazy';
                    img.onerror = () => img.remove();
                    poster.appendChild(img);
                }

                const info = document.createElement('div');
                info.className = 'search-item-info';
                const title = document.createElement('div');
                title.className = 'search-item-title';
                title.appendChild(document.createTextNode(String(item.title || 'Без названия')));
                const badge = document.createElement('span');
                badge.className = `search-item-badge ${
                    isManga ? 'badge-manga' : is4k ? 'badge-4k' : 'badge-anime'
                }`;
                badge.textContent = isManga ? 'Манга' : is4k ? '≈4K' : 'Каталог';
                title.appendChild(badge);

                const meta = document.createElement('div');
                meta.className = 'search-item-meta';
                const metaParts = [];
                if (item.year) metaParts.push(String(item.year));
                if (item.type) metaParts.push(String(item.type));
                if (Array.isArray(item.genres) && item.genres.length) {
                    metaParts.push(item.genres.slice(0, 2).map(String).join(', '));
                }
                meta.textContent = metaParts.join(' · ');
                info.append(title, meta);
                link.append(poster, info);
                dropdown.appendChild(link);
            }

            const appendFooter = (href, label) => {
                const footer = document.createElement('a');
                footer.href = href;
                footer.className = 'search-dropdown-footer';
                footer.textContent = label;
                dropdown.appendChild(footer);
            };
            if (anime4kHits.length) {
                appendFooter(
                    `${basePath}catalog/anime-4k.html?search=${encodeURIComponent(query)}`,
                    'Все в каталоге ≈4K'
                );
            }
            appendFooter(
                `${basePath}catalog/anime.html?search=${encodeURIComponent(query)}`,
                'Все в каталоге аниме'
            );
            dropdown.style.display = 'block';
            hydrateNavSearchPosters(dropdown, results);
        };
        
        topSearchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                showSuggestions(topSearchInput.value.trim());
            }, 200);
        });
        
        topSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
        
        topSearchInput.addEventListener('focus', () => {
            if (topSearchInput.value.trim().length >= 2) {
                showSuggestions(topSearchInput.value.trim());
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.top-search-wrapper')) {
                dropdown.style.display = 'none';
            }
        });
    }

    // Загрузка жанров в боковую панель (только в каталогах)
    loadSidebarGenres() {
        if (!this.shouldShowCatalogFilters()) return;
        
        const genresContainer = document.getElementById('sidebarGenres');
        if (!genresContainer) return;
        
        if (typeof getAllGenres !== 'function') {
            console.error('getAllGenres не найдена');
            return;
        }
        
        // Определяем, какой каталог - аниме или манга
        const isManga = this.currentPage === 'manga' || this.currentPage === 'manga-view' || this.currentPage === 'manga-reader';
        const catalogPath = isManga ? `${this.basePath}catalog/manga.html` : `${this.basePath}catalog/anime.html`;
        
        const adultHide =
            (typeof window !== 'undefined' && Array.isArray(window.reminkoAdultGenreLabels)
                ? window.reminkoAdultGenreLabels
                : ['Хентай', 'Эротика', 'Этти', 'Яой', 'Юри']);
        const allGenres = getAllGenres().filter((genre) => !adultHide.includes(genre));
        
        genresContainer.innerHTML = allGenres.map(genre => `
            <a href="${catalogPath}?genre=${encodeURIComponent(genre)}" class="sidebar-genre-link" data-genre="${genre}">
                <span>${genre}</span>
            </a>
        `).join('');
        
        const allGenresLink = document.createElement('a');
        allGenresLink.href = catalogPath;
        allGenresLink.className = 'sidebar-genre-link sidebar-genre-link-all';
        allGenresLink.innerHTML = '<span>Все жанры →</span>';
        genresContainer.appendChild(allGenresLink);
    }

    /** Случайное аниме — кнопка со значком в шапке рядом с поиском */
    initTopRandomAnime() {
        const buttons = Array.from(document.querySelectorAll('[data-random-anime]'));
        if (!buttons.length) return;
        const filterRandomPool = (list) => {
            if (!Array.isArray(list) || !list.length) return [];
            const adultOk =
                typeof isAdultContentEnabled === 'function' && isAdultContentEnabled();
            if (adultOk) return list;
            if (typeof filterAdultAnimeList === 'function') {
                return filterAdultAnimeList(list);
            }
            return list.filter((a) => {
                if (typeof animeHasRestrictedGenre === 'function') {
                    return !animeHasRestrictedGenre(a);
                }
                const genres = Array.isArray(a && a.genres) ? a.genres : [];
                return !genres.some((g) => {
                    const n = String(g || '').toLowerCase();
                    return (
                        n.includes('хентай') ||
                        n.includes('hentai') ||
                        n.includes('эротик') ||
                        n.includes('erotic')
                    );
                });
            });
        };
        const goRandom = (e) => {
            if (e) e.preventDefault();
            if (typeof getAllAnime !== 'function') return;
            const allAnime = filterRandomPool(getAllAnime());
            if (allAnime.length === 0) {
                if (typeof showWarning === 'function') showWarning('Аниме не найдено');
                return;
            }
            const randomAnime = allAnime[Math.floor(Math.random() * allAnime.length)];
            if (typeof openAnimePage === 'function') {
                openAnimePage(randomAnime.id);
            } else {
                sessionStorage.setItem('viewAnimeId', String(randomAnime.id));
                window.location.href = `${this.basePath}anime/view.html?id=${randomAnime.id}`;
            }
        };
        buttons.forEach((btn) => {
            btn.addEventListener('click', goRandom);
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goRandom(e);
                }
            });
        });
    }

    // Инициализация защищённых ссылок.
    // Примечание: проверка авторизации выполняется на самих страницах.
    // Здесь не блокируем переход, чтобы пользователь мог увидеть дружелюбное сообщение.
    initProtectedLinks() {
        // Убрана блокировка перехода - теперь страницы сами показывают панель для неавторизованных
        // Это позволяет пользователю увидеть дружелюбное сообщение вместо модального окна
    }

    // Инициализация мобильного меню
    initMobileMenu() {
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.querySelector('.sidebar');
        const mainLayout = document.querySelector('.main-layout');
        
        if (!sidebarToggle || !sidebar || !mainLayout) return;

        // На ≤900px sidebar является нижним scroll-tabbar, drawer больше не нужен.
        const syncLayout = () => {
            const isMobile =
                typeof window.reminkoIsMobileLayout === 'function'
                    ? window.reminkoIsMobileLayout()
                    : window.matchMedia?.('(max-width: 900px)').matches;
            sidebarToggle.style.display = 'none';
            sidebarToggle.hidden = true;
            sidebar.classList.remove('active');
            mainLayout.classList.remove('sidebar-open');
            document.body.classList.toggle('reminko-mobile-layout', !!isMobile);
            if (isMobile) {
                const activeLink = sidebar.querySelector('.sidebar-link.active');
                requestAnimationFrame(() => {
                    activeLink?.scrollIntoView({
                        block: 'nearest',
                        inline: 'center',
                        behavior: 'auto'
                    });
                });
            }
        };

        syncLayout();
        const media = window.matchMedia?.('(max-width: 900px)');
        if (media?.addEventListener) media.addEventListener('change', syncLayout);
        else window.addEventListener('resize', syncLayout, { passive: true });
    }

    /** Раньше добавлял нижний футер; ссылки перенесены в конец боковой панели (createSidebar). */
    appendLegalFooter(contentWrapper) {
        void contentWrapper;
    }

    initNavigationPrefetch() {
        if (typeof document === 'undefined') return;
        const links = document.querySelectorAll('.sidebar a[href], .top-navbar a[href]');
        links.forEach((a) => {
            if (a.dataset.reminkoPrefetchBound === '1') return;
            a.dataset.reminkoPrefetchBound = '1';
            const warm = () => {
                const href = a.getAttribute('href');
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.as = 'document';
                link.href = href;
                document.head.appendChild(link);
                a.removeEventListener('mouseenter', warm);
                a.removeEventListener('focus', warm);
            };
            a.addEventListener('mouseenter', warm, { passive: true });
            a.addEventListener('focus', warm, { passive: true });
        });
    }

    initLiveInternetCounter() {
        const img = document.getElementById('licnt3A61');
        if (!img || img.dataset.reminkoLiHit === '1') return;
        img.dataset.reminkoLiHit = '1';
        try {
            const s = typeof screen !== 'undefined' ? screen : null;
            const scr =
                s && s.width
                    ? ';s' +
                      s.width +
                      '*' +
                      s.height +
                      '*' +
                      (s.colorDepth || s.pixelDepth || '')
                    : '';
            img.src =
                'https://counter.yadro.ru/hit?t26.8;r' +
                escape(document.referrer || '') +
                scr +
                ';u' +
                escape(document.URL || '') +
                ';h' +
                escape(String(document.title || '').substring(0, 150)) +
                ';' +
                Math.random();
        } catch (_) {
            /* ignore */
        }
    }

    /** Яндекс.Метрика — без видимого виджета на сайте */
    initYandexMetrika() {
        if (window.__reminkoYandexMetrikaInit) return;
        window.__reminkoYandexMetrikaInit = true;

        const counterId = 110777722;
        const tagUrl = `https://mc.yandex.ru/metrika/tag.js?id=${counterId}`;

        const boot = () => {
            try {
                for (let j = 0; j < document.scripts.length; j++) {
                    if (document.scripts[j].src === tagUrl) return;
                }
                window.ym =
                    window.ym ||
                    function () {
                        (window.ym.a = window.ym.a || []).push(arguments);
                    };
                window.ym.l = Date.now();
                const s = document.createElement('script');
                s.async = true;
                s.src = tagUrl;
                document.head.appendChild(s);
                window.ym(counterId, 'init', {
                    clickmap: true,
                    trackLinks: true,
                    accurateTrackBounce: true,
                    webvisor: true,
                    ecommerce: 'dataLayer'
                });
            } catch (_) {
                /* ignore */
            }
        };

        if (window.ReminkoBoot && typeof window.ReminkoBoot.lateIdle === 'function') {
            window.ReminkoBoot.lateIdle(boot, 6000);
        } else if ('requestIdleCallback' in window) {
            setTimeout(() => requestIdleCallback(boot, { timeout: 2500 }), 6000);
        } else {
            setTimeout(boot, 6000);
        }
    }

    initSiteOnlineWidget() {
        const countEl = document.getElementById('topOnlineCount');
        if (!countEl) return;

        if (window.__reminkoOnlineWidgetTimer) {
            clearTimeout(window.__reminkoOnlineWidgetTimer);
            window.__reminkoOnlineWidgetTimer = null;
        }

        countEl.textContent = '—';

        const refresh = async () => {
            if (!countEl.isConnected) return;

            const count = await reminkoFetchRealOnlineCount();
            if (count != null) {
                countEl.textContent = String(count);
            }

            window.__reminkoOnlineWidgetTimer = setTimeout(refresh, REMINKO_ONLINE_POLL_MS);
        };

        void refresh();
    }

    /** Общая инициализация после вставки/обновления шапки и сайдбара */
    finishNavigationInit(preservedMain) {
        this.initTopSearch();
        this.initTopRandomAnime();
        this.initNotifications();
        this.initMobileMenu();
        this.initNavigationPrefetch();
        this.initProtectedLinks();
        this.initDisabledNavLinks();
        this.updateAuthLinks();
        const initLateCounters = () => {
            this.initLiveInternetCounter();
        };
        if (window.ReminkoBoot && typeof window.ReminkoBoot.lateIdle === 'function') {
            window.ReminkoBoot.lateIdle(initLateCounters, 5000);
        } else {
            setTimeout(initLateCounters, 5000);
        }
        this.initYandexMetrika();
        const initIdleNetwork = () => {
            this.initSiteOnlineWidget();
            if (
                typeof reminkoEnsureSiteCreatorUserIdCached === 'function' &&
                typeof supabaseClient !== 'undefined'
            ) {
                void reminkoEnsureSiteCreatorUserIdCached();
            }
        };
        if (window.ReminkoBoot && typeof window.ReminkoBoot.on === 'function') {
            window.ReminkoBoot.on('Idle', initIdleNetwork);
        } else {
            setTimeout(initIdleNetwork, 1200);
        }

        const navManagerInstance = this;
        setTimeout(() => {
            if (window.navigationManager && typeof window.navigationManager.updateNotificationBadge === 'function') {
                window.navigationManager.updateNotificationBadge();
            } else if (typeof navManagerInstance.updateNotificationBadge === 'function') {
                navManagerInstance.updateNotificationBadge();
            }
        }, 500);

        if (typeof initLoginRegisterHandlers === 'function') {
            setTimeout(() => {
                initLoginRegisterHandlers();
            }, 100);
        }

        // Обработчики делегированы document; тяжёлый DOM модалок создаётся
        // только при первом реальном открытии.
        this.initModalHandlers();
        document.body.classList.add('reminko-ui-ready');

        if (typeof window.reminkoApplySidebarMaintenanceLocks === 'function') {
            window.reminkoApplySidebarMaintenanceLocks();
        }
        try {
            window.dispatchEvent(
                new CustomEvent('reminko:navigation-applied', {
                    detail: { preservedMain: !!preservedMain }
                })
            );
        } catch (e) {
            /* ignore */
        }
    }

    initDisabledNavLinks() {
        document.querySelectorAll('[data-reminko-disabled-link="true"]').forEach((link) => {
            if (link.dataset.reminkoDisabledBound === '1') return;
            link.dataset.reminkoDisabledBound = '1';
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
    }

    /** Только шапка и сайдбар — без пересборки main через innerHTML (нет «второй перезагрузки») */
    refreshNavigationChromeOnly() {
        const oldNav = document.querySelector('.navbar:not(.top-navbar)');
        if (oldNav) oldNav.remove();

        const existingTopNav = document.querySelector('.top-navbar');
        if (existingTopNav) existingTopNav.remove();
        document.body.insertAdjacentHTML('afterbegin', this.createTopNavbar());

        const existingSidebar = document.querySelector('.sidebar');
        if (existingSidebar) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.createSidebar();
            const newSidebar = tempDiv.querySelector('.sidebar');
            if (newSidebar) existingSidebar.replaceWith(newSidebar);
        }

        this.finishNavigationInit(true);
    }

    // Применить навигацию к странице
    applyNavigation(skipSidebar = false) {
        // Проверяем, нужно ли применять навигацию (исключения)
        const path = window.location.pathname;
        const skipPages = ['reset-password.html', 'payment-success.html'];
        const shouldSkip = skipPages.some(page => path.includes(page));
        
        if (shouldSkip) {
            document.body.classList.add('reminko-ui-ready');
            return;
        }

        const existingLayout = document.querySelector('.main-layout');
        const existingSidebar = document.querySelector('.sidebar');
        const existingMain =
            existingLayout &&
            (existingLayout.querySelector('.main-content-wrapper') || existingLayout.querySelector('main'));

        /** Контент main не трогаем — только шапка и сайдбар (без innerHTML-клона, нет «второй перезагрузки»). */
        if (!skipSidebar && existingLayout && existingMain) {
            const oldNav = document.querySelector('.navbar:not(.top-navbar)');
            if (oldNav) oldNav.remove();

            const existingTopNav = document.querySelector('.top-navbar');
            if (existingTopNav) existingTopNav.remove();
            document.body.insertAdjacentHTML('afterbegin', this.createTopNavbar());

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.createSidebar();
            const newSidebar = tempDiv.querySelector('.sidebar');
            if (newSidebar) {
                if (existingSidebar) {
                    existingSidebar.replaceWith(newSidebar);
                } else {
                    existingLayout.insertBefore(newSidebar, existingMain);
                }
            }

            document.body.dataset.reminkoNavApplied = '1';
            this.finishNavigationInit(true);
            return;
        }

        if (
            !skipSidebar &&
            document.body.dataset.reminkoNavApplied === '1' &&
            existingLayout &&
            existingSidebar &&
            existingMain
        ) {
            this.refreshNavigationChromeOnly();
            return;
        }
        
        // Удаляем старую навигацию если есть
        const oldNav = document.querySelector('.navbar:not(.top-navbar)');
        if (oldNav) {
            oldNav.remove();
        }
        
        // ВСЕГДА заменяем верхнюю панель для единообразия
        const body = document.body;
        const existingTopNav = document.querySelector('.top-navbar');
        if (existingTopNav) {
            existingTopNav.remove();
        }
        body.insertAdjacentHTML('afterbegin', this.createTopNavbar());
        
        // ВСЕГДА заменяем боковую панель и обертку (если не пропущена)
        if (!skipSidebar) {
            const layoutNode = document.querySelector('.main-layout');
            const sidebarNode = document.querySelector('.sidebar');
            
            // Сохраняем контент перед заменой
            let mainContent = null;
            if (layoutNode) {
                mainContent = layoutNode.querySelector('.main-content-wrapper') || layoutNode.querySelector('main');
                if (!mainContent && layoutNode.children.length > 1) {
                    // Если есть sidebar, берем следующий элемент
                    const sidebarIndex = Array.from(layoutNode.children).findIndex(child => child.classList.contains('sidebar'));
                    if (sidebarIndex >= 0 && layoutNode.children[sidebarIndex + 1]) {
                        mainContent = layoutNode.children[sidebarIndex + 1];
                    }
                }
            } else {
                mainContent = document.querySelector('main.main-content') || document.querySelector('main');
            }
            
            // ВСЕГДА создаем новую навигацию из createSidebar()
            const newSidebarHTML = this.createSidebar();
            
            if (layoutNode && mainContent) {
                // Сохраняем содержимое
                const contentHTML = mainContent.innerHTML;
                const contentClasses = mainContent.className;
                const contentId = mainContent.id;
                
                // Полностью заменяем layout новым
                const wrapper = document.createElement('div');
                wrapper.className = 'main-layout';
                wrapper.innerHTML = newSidebarHTML;
                
                // Создаем обертку для контента
                const contentWrapper = document.createElement('main');
                contentWrapper.className = 'main-content-wrapper';
                if (contentClasses) {
                    const classList = contentClasses.split(' ').filter(c => c && c !== 'main-content-wrapper');
                    contentWrapper.className = 'main-content-wrapper ' + classList.join(' ');
                }
                if (contentId) {
                    contentWrapper.id = contentId;
                }
                contentWrapper.innerHTML = contentHTML;
                
                // Добавляем контент в wrapper
                this.appendLegalFooter(contentWrapper);
                wrapper.appendChild(contentWrapper);
                
                // Заменяем старую структуру
                layoutNode.replaceWith(wrapper);
            } else if (layoutNode && sidebarNode) {
                // Если есть layout но нет mainContent - заменяем только sidebar
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = newSidebarHTML;
                const newSidebar = tempDiv.querySelector('.sidebar');
                if (newSidebar) {
                    sidebarNode.replaceWith(newSidebar);
                }
            } else if (mainContent) {
                // Если нет layout но есть mainContent
                const contentHTML = mainContent.innerHTML;
                const contentClasses = mainContent.className;
                const contentId = mainContent.id;
                
                const wrapper = document.createElement('div');
                wrapper.className = 'main-layout';
                wrapper.innerHTML = newSidebarHTML;
                
                const contentWrapper = document.createElement('main');
                contentWrapper.className = 'main-content-wrapper';
                if (contentClasses) {
                    const classList = contentClasses.split(' ').filter(c => c && c !== 'main-content-wrapper');
                    contentWrapper.className = 'main-content-wrapper ' + classList.join(' ');
                }
                if (contentId) {
                    contentWrapper.id = contentId;
                }
                contentWrapper.innerHTML = contentHTML;
                
                this.appendLegalFooter(contentWrapper);
                wrapper.appendChild(contentWrapper);
                mainContent.replaceWith(wrapper);
            } else {
                // Если нет ничего - создаем структуру с нуля
                const wrapper = document.createElement('div');
                wrapper.className = 'main-layout';
                wrapper.innerHTML = newSidebarHTML;
                
                const contentWrapper = document.createElement('main');
                contentWrapper.className = 'main-content-wrapper';
                this.appendLegalFooter(contentWrapper);
                wrapper.appendChild(contentWrapper);
                
                body.appendChild(wrapper);
            }
        }

        document.body.dataset.reminkoNavApplied = '1';
        this.finishNavigationInit();
    }
    
    // Обновление ссылок в зависимости от авторизации
    async updateAuthLinks() {
        if (typeof getCurrentUser === 'function') {
            try {
                const user = await getCurrentUser();
                const friendsLink = document.getElementById('friendsLink');
                const messagesLink = document.getElementById('messagesLink');
                const watchTogetherLink = document.getElementById('watchTogetherLink');
                const topProfileLink = document.getElementById('topProfileLink');
                const notificationsBtn = document.getElementById('topNotificationsBtn');
                const topLoginBtn = document.getElementById('topLoginBtn');
                const topRegisterBtn = document.getElementById('topRegisterBtn');
                const topLogoutBtn = document.getElementById('topLogoutBtn');
                const resetAuthButtons = (mode) => {
                    if (topLoginBtn) {
                        topLoginBtn.textContent = 'Войти';
                        topLoginBtn.style.display = mode === 'guest' ? 'flex' : 'none';
                    }
                    if (topRegisterBtn) {
                        topRegisterBtn.style.display = mode === 'guest' ? 'flex' : 'none';
                    }
                    if (topLogoutBtn) {
                        topLogoutBtn.style.display = mode === 'user' ? 'flex' : 'none';
                    }
                };
                const maintOn = !!(window.__reminkoMaintenance && window.__reminkoMaintenance.enabled);
                let maintCreator = false;
                if (maintOn && typeof window.reminkoIsUserSiteCreator === 'function') {
                    maintCreator = await window.reminkoIsUserSiteCreator();
                }
                const showSocialLockedForGuests = maintOn && !maintCreator;

                const basePath = this.basePath != null ? this.basePath : '';
                const setMessagesHref = (toCreator) => {
                    if (!messagesLink) return;
                    messagesLink.setAttribute('href', basePath + (toCreator ? 'messages.html?creator=1' : 'messages.html'));
                };
                if (user && !user.isAnonymous) {
                    let isSiteCreatorAcc =
                        (typeof window.reminkoIsSiteCreatorProfile === 'function' &&
                            window.reminkoIsSiteCreatorProfile(user));
                    if (!isSiteCreatorAcc && typeof window.reminkoIsUserSiteCreator === 'function') {
                        try {
                            isSiteCreatorAcc = await window.reminkoIsUserSiteCreator();
                        } catch (_) {
                            /* ignore */
                        }
                    }
                    const creatorAdminLink = document.getElementById('sidebarCreatorAdminLink');
                    if (creatorAdminLink) {
                        const em = (user.email || '').toLowerCase().trim();
                        creatorAdminLink.style.display =
                            isSiteCreatorAcc || em === 'creator@reminko.com' ? '' : 'none';
                    }
                    setMessagesHref(false);
                    if (friendsLink) friendsLink.style.display = '';
                    if (messagesLink) messagesLink.style.display = '';
                    if (watchTogetherLink) watchTogetherLink.style.display = '';
                    if (topProfileLink) topProfileLink.style.display = 'flex';
                    if (notificationsBtn) notificationsBtn.style.display = 'flex';
                    resetAuthButtons('user');

                    // Обновляем счетчик уведомлений
                    try {
                        if (window.navigationManager && typeof window.navigationManager.updateNotificationBadge === 'function') {
                            window.navigationManager.updateNotificationBadge();
                        }
                    } catch (e) {
                        // Игнорируем ошибки обновления бейджа
                    }

                    // Обновляем счетчик заявок в друзья
                    try {
                        if (window.friendsService && typeof window.friendsService.getUnreadRequestsCount === 'function') {
                            window.friendsService.getUnreadRequestsCount(user.id).then(count => {
                                const friendsBadge = document.getElementById('friendsBadge');
                                if (friendsBadge) {
                                    if (count > 0) {
                                        friendsBadge.textContent = count > 99 ? '99+' : count;
                                        friendsBadge.style.display = 'flex';
                                    } else {
                                        friendsBadge.style.display = 'none';
                                    }
                                }
                            });
                        }
                    } catch (e) {}

                    try {
                        if (typeof window.reminkoUpdateDmBadge === 'function') {
                            window.reminkoUpdateDmBadge();
                        }
                    } catch (e) {}
                } else if (user && user.isAnonymous) {
                    const creatorAdminLink = document.getElementById('sidebarCreatorAdminLink');
                    if (creatorAdminLink) creatorAdminLink.style.display = 'none';
                    if (friendsLink) friendsLink.style.display = 'none';
                    if (watchTogetherLink) watchTogetherLink.style.display = 'none';
                    if (messagesLink) {
                        messagesLink.style.display = '';
                        setMessagesHref(true);
                    }
                    if (topProfileLink) topProfileLink.style.display = 'none';
                    if (notificationsBtn) notificationsBtn.style.display = 'none';
                    resetAuthButtons('guest');
                    try {
                        if (typeof window.reminkoUpdateDmBadge === 'function') {
                            window.reminkoUpdateDmBadge();
                        }
                    } catch (e) {}
                } else {
                    const creatorAdminLink = document.getElementById('sidebarCreatorAdminLink');
                    if (creatorAdminLink) creatorAdminLink.style.display = 'none';
                    if (showSocialLockedForGuests) {
                        if (friendsLink) friendsLink.style.display = '';
                        if (messagesLink) {
                            messagesLink.style.display = '';
                            setMessagesHref(true);
                        }
                        if (watchTogetherLink) watchTogetherLink.style.display = '';
                    } else {
                        if (friendsLink) friendsLink.style.display = 'none';
                        if (messagesLink) {
                            messagesLink.style.display = '';
                            setMessagesHref(true);
                        }
                        if (watchTogetherLink) watchTogetherLink.style.display = 'none';
                    }
                    if (topProfileLink) topProfileLink.style.display = 'none';
                    if (notificationsBtn) notificationsBtn.style.display = 'none';
                    resetAuthButtons('guest');
                }
            } catch (e) {
                // Игнорируем ошибки
            }
        }
    }
    
    // Обновить бейдж уведомлений
    updateNotificationBadge() {
        if (typeof window.notificationService === 'undefined' || !window.notificationService) {
            return;
        }

        const badge = document.getElementById('notificationBadge');
        if (!badge) return;

        const unreadCount = window.notificationService.unreadCount || 0;
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // Инициализация уведомлений
    initNotifications() {
        const notificationsBtn = document.getElementById('topNotificationsBtn');
        if (!notificationsBtn) return;

        const notifyPrefsScriptPath = (() => {
            const depth = (window.location.pathname.match(/\//g) || []).length - 1;
            const prefix = depth > 0 ? '../'.repeat(depth) : '';
            return prefix + 'scripts/notification-preferences.js';
        })();

        const ensureNotificationPrefsLoaded = () => {
            if (typeof window.reminkoOpenNotificationPrefsModal === 'function') {
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                const existing = document.querySelector('script[data-reminko-notify-prefs]');
                if (existing) {
                    existing.addEventListener('load', () => resolve(), { once: true });
                    existing.addEventListener('error', () => resolve(), { once: true });
                    return;
                }
                const s = document.createElement('script');
                s.src = notifyPrefsScriptPath;
                s.dataset.reminkoNotifyPrefs = '1';
                s.onload = () => resolve();
                s.onerror = () => resolve();
                document.head.appendChild(s);
            });
        };

        const closeNotificationsUi = () => {
            const panel = document.getElementById('notificationsPanel');
            const backdrop = document.getElementById('notificationsBackdrop');
            if (panel) {
                panel.classList.remove('active');
                panel.setAttribute('aria-hidden', 'true');
            }
            if (backdrop) {
                backdrop.classList.remove('active');
                backdrop.setAttribute('aria-hidden', 'true');
            }
            document.body.classList.remove('notifications-sheet-open');
        };

        // Создаём затемнение и панель-«шторку»
        if (!document.getElementById('notificationsPanel')) {
            const backdrop = document.createElement('div');
            backdrop.id = 'notificationsBackdrop';
            backdrop.className = 'notifications-backdrop';
            backdrop.setAttribute('aria-hidden', 'true');

            const panel = document.createElement('div');
            panel.id = 'notificationsPanel';
            panel.className = 'notifications-panel notifications-panel--sheet';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-labelledby', 'notificationsPanelTitle');
            panel.setAttribute('aria-hidden', 'true');
            panel.innerHTML = `
                <div class="notifications-panel-header">
                    <div class="notifications-panel-title" id="notificationsPanelTitle">Уведомления</div>
                    <button type="button" class="notifications-panel-close" id="notificationsPanelCloseBtn" aria-label="Закрыть">×</button>
                </div>
                <div class="notifications-panel-body" id="notificationsList">
                    <div class="notifications-loading">Загрузка...</div>
                </div>
                <div class="notifications-footer" id="notificationsFooter">
                    <div class="notifications-footer-actions">
                        <button type="button" class="notifications-foot-btn notifications-foot-btn--prefs" id="notificationsPrefsBtn">Настройки</button>
                        <button type="button" class="notifications-foot-btn notifications-foot-btn--secondary" id="notificationsMarkReadBtn">Все прочитаны</button>
                        <button type="button" class="notifications-foot-btn notifications-foot-btn--danger" id="notificationsClearAllBtn">Очистить</button>
                    </div>
                </div>
            `;
            document.body.appendChild(backdrop);
            document.body.appendChild(panel);

            panel.querySelector('#notificationsPanelCloseBtn')?.addEventListener('click', closeNotificationsUi);
            panel.querySelector('#notificationsMarkReadBtn')?.addEventListener('click', () => {
                if (window.notificationService) void window.notificationService.markAllAsRead();
            });
            panel.querySelector('#notificationsPrefsBtn')?.addEventListener('click', () => {
                closeNotificationsUi();
                void ensureNotificationPrefsLoaded().then(() => {
                    if (typeof window.reminkoOpenNotificationPrefsModal === 'function') {
                        window.reminkoOpenNotificationPrefsModal();
                    }
                });
            });
            panel.querySelector('#notificationsClearAllBtn')?.addEventListener('click', () => {
                if (window.notificationService) {
                    void window.notificationService.deleteAllNotifications();
                }
            });
        }

        notificationsBtn.addEventListener('click', () => {
            const panel = document.getElementById('notificationsPanel');
            const backdrop = document.getElementById('notificationsBackdrop');
            if (panel) {
                const isActive = panel.classList.contains('active');
                if (isActive) {
                    closeNotificationsUi();
                } else {
                    backdrop?.classList.add('active');
                    backdrop?.setAttribute('aria-hidden', 'false');
                    panel.classList.add('active');
                    panel.setAttribute('aria-hidden', 'false');
                    document.body.classList.add('notifications-sheet-open');
                }
                if (panel.classList.contains('active') && window.notificationService) {
                    window.notificationService.renderNotifications();
                    setTimeout(() => {
                        if (window.navigationManager && typeof window.navigationManager.updateNotificationBadge === 'function') {
                            window.navigationManager.updateNotificationBadge();
                        }
                    }, 100);
                }
            }
        });
        
        // Обновляем бейдж каждые 60 секунд (реже, чтобы не нагружать сервер)
        // Используем один интервал для всех страниц
        if (!window.notificationUpdateInterval) {
            const navManager = this;
            window.notificationUpdateInterval = setInterval(() => {
                if (window.notificationService) {
                    // Обновляем только бейдж, не загружаем все уведомления
                    if (typeof navManager.updateNotificationBadge === 'function') {
                        navManager.updateNotificationBadge();
                    }
                }
            }, 60000); // 60 секунд вместо 30
        }
        
    }
    
    // Убедиться, что модальные окна есть на странице
    ensureModalsExist() {
        // Модальное окно входа
        if (!document.getElementById('loginModal')) {
            const loginModal = document.createElement('div');
            loginModal.id = 'loginModal';
            loginModal.className = 'modal';
            loginModal.innerHTML = `
                <div class="modal-content auth-modal">
                    <span class="close" id="closeLoginModal">&times;</span>
                    <h2 class="modal-title">Вход на сайт</h2>
                    <form class="login-form" id="loginForm" onsubmit="event.preventDefault(); const btn = document.getElementById('loginSubmit'); if(btn) btn.click(); return false;">
                        <div class="form-group">
                            <label for="loginEmail">Почта:</label>
                            <input type="email" id="loginEmail" placeholder="Введите вашу почту" required autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="loginPassword">Пароль:</label>
                            <div style="position: relative;">
                                <input type="password" id="loginPassword" placeholder="Введите пароль" required autocomplete="current-password" style="padding-right: 45px;">
                                <button type="button" id="toggleLoginPassword" class="password-toggle-btn" title="Показать/скрыть пароль" aria-label="Показать/скрыть пароль">
                                    <svg id="loginPasswordEyeIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="form-options">
                            <label class="checkbox-label">
                                <input type="checkbox"> Не запоминать меня
                            </label>
                            <a href="#" class="forgot-password">Забыли пароль?</a>
                        </div>
                        <div id="loginError" class="error-message"></div>
                        <button type="submit" class="btn btn-primary btn-block" id="loginSubmit">Войти на сайт</button>
                        <div class="divider">
                            <span>или</span>
                        </div>
                        <button type="button" class="btn btn-google" id="googleLogin">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Войти через Google
                        </button>
                        <div class="register-link">
                            <p>Нет аккаунта? <a href="#" id="switchToRegister" data-maint-lock="register">Регистрация</a></p>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(loginModal);
        }
        
        // Модальное окно регистрации
        if (!document.getElementById('registerModal')) {
            const registerModal = document.createElement('div');
            registerModal.id = 'registerModal';
            registerModal.className = 'modal';
            registerModal.innerHTML = `
                <div class="modal-content auth-modal">
                    <span class="close" id="closeRegisterModal">&times;</span>
                    <h2 class="modal-title">Регистрация</h2>
                    <div class="login-form">
                        <div class="form-group">
                            <label for="registerEmail">Почта:</label>
                            <input type="email" id="registerEmail" placeholder="Введите вашу почту" required autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="registerPassword">Пароль:</label>
                            <input type="password" id="registerPassword" placeholder="Введите пароль (минимум 6 символов)" required autocomplete="new-password">
                        </div>
                        <div class="form-group">
                            <label for="registerUsername">Имя пользователя:</label>
                            <input type="text" id="registerUsername" placeholder="Введите имя" required autocomplete="username">
                        </div>
                        <div class="form-group">
                            <span class="form-label">Ваш пол:</span>
                            <div class="gender-selection">
                                <label class="gender-label">
                                    <input type="radio" name="registerGender" value="male" checked class="gender-radio">
                                    Мужской
                                </label>
                                <label class="gender-label">
                                    <input type="radio" name="registerGender" value="female" class="gender-radio">
                                    Женский
                                </label>
                            </div>
                        </div>
                        <div class="form-group">
                            <span class="form-label">Выберите аватар:</span>
                            <div class="avatar-selection-grid" id="avatarSelectionGrid"></div>
                        </div>
                        <div id="registerError" class="error-message"></div>
                        <button type="button" class="btn btn-primary btn-block" id="registerSubmit" data-maint-lock="register">Зарегистрироваться</button>
                        <div class="register-link">
                            <p>Уже есть аккаунт? <a href="#" id="switchToLogin">Войти</a></p>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(registerModal);
        }
        
        // Модальное окно восстановления пароля
        if (!document.getElementById('passwordResetModal')) {
            const passwordResetModal = document.createElement('div');
            passwordResetModal.id = 'passwordResetModal';
            passwordResetModal.className = 'modal';
            passwordResetModal.innerHTML = `
                <div class="modal-content auth-modal">
                    <span class="close" id="closePasswordResetModal">&times;</span>
                    <h2 class="modal-title">Восстановление пароля</h2>
                    <div class="login-form">
                        <div class="text-center mb-1-5">
                            <div class="font-size-3rem mb-1">🔐</div>
                            <p class="text-secondary mb-0-5">
                                Введите email, на который мы отправим ссылку для восстановления пароля
                            </p>
                        </div>
                        <div class="form-group">
                            <label for="passwordResetEmail">Email:</label>
                            <input type="email" id="passwordResetEmail" placeholder="Введите ваш email" required autocomplete="email">
                        </div>
                        <div id="passwordResetError" class="error-message"></div>
                        <div id="passwordResetSuccess" class="success-message success-message-custom hidden">
                            Письмо с инструкцией по восстановлению пароля отправлено на ваш email. Проверьте почту (включая папку "Спам").
                        </div>
                        <button class="btn btn-primary btn-block" id="passwordResetSubmit">Отправить письмо</button>
                        <div class="text-center mt-1">
                            <a href="#" id="backToLogin" class="link-primary">Вернуться к входу</a>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(passwordResetModal);
        }
        
        // Модальное окно подтверждения email (если нужно)
        if (!document.getElementById('emailConfirmModal')) {
            const emailConfirmModal = document.createElement('div');
            emailConfirmModal.id = 'emailConfirmModal';
            emailConfirmModal.className = 'modal';
            emailConfirmModal.innerHTML = `
                <div class="modal-content auth-modal">
                    <span class="close" id="closeEmailConfirmModal">&times;</span>
                    <h2 class="modal-title">Подтверждение email</h2>
                    <div class="login-form">
                        <div class="text-center mb-1-5">
                            <div class="font-size-3rem mb-1">📧</div>
                            <p class="text-secondary mb-0-5">
                                Мы отправили код подтверждения на ваш email
                            </p>
                            <p id="confirmEmailAddress" class="font-bold text-primary"></p>
                        </div>
                        <div class="form-group">
                            <label for="emailConfirmCode">Код подтверждения:</label>
                            <input type="text" id="emailConfirmCode" placeholder="Введите код из 6–8 цифр" maxlength="8" pattern="[0-9]{6,8}" required autocomplete="one-time-code">
                            <small class="text-secondary font-size-0-85em mt-1 display-block">
                                Проверьте папку "Спам", если письмо не пришло
                            </small>
                        </div>
                        <div id="emailConfirmError" class="error-message"></div>
                        <button type="button" class="btn btn-primary btn-block" id="emailConfirmSubmit">Подтвердить email</button>
                        <div class="text-center mt-1">
                            <button type="button" class="btn btn-link btn-link-reset" id="resendConfirmCode">
                                Отправить код повторно
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(emailConfirmModal);
        }
        
        // Модальное окно подтверждения отмены регистрации
        if (!document.getElementById('cancelRegistrationModal')) {
            const cancelModal = document.createElement('div');
            cancelModal.id = 'cancelRegistrationModal';
            cancelModal.className = 'modal hidden';
            cancelModal.innerHTML = `
                <div class="modal-content auth-modal modal-max-width-500">
                    <h2 class="modal-title text-center mb-1-5">Ну ты кудаа? 😊</h2>
                    <div class="login-form">
                        <div class="text-center mb-1-5">
                            <div style="font-size: 3rem; margin-bottom: 1rem;">🤔</div>
                            <p style="color: var(--text-secondary); font-size: 1.1rem; line-height: 1.6;">
                                Тебе чуточек осталось! Осталось всего лишь ввести код и нажать кнопку "Подтвердить email".
                            </p>
                            <p style="color: var(--text-secondary); font-size: 1rem; margin-top: 1rem;">
                                Но если так хочешь, то ладно... 😔
                            </p>
                        </div>
                        
                        <div class="flex gap-1 mt-2">
                            <button type="button" class="btn btn-secondary btn-secondary-custom flex-1" id="cancelRegistrationCancel">
                                Отмена
                            </button>
                            <button type="button" class="btn btn-primary flex-1" id="cancelRegistrationConfirm">
                                Да, отменить
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(cancelModal);
        }
        
        const avatarGrid = document.getElementById('avatarSelectionGrid');
        if (
            avatarGrid &&
            !avatarGrid.children.length &&
            typeof window.loadAvatarOptions === 'function'
        ) {
            window.loadAvatarOptions();
        } else if (
            avatarGrid &&
            !avatarGrid.children.length &&
            typeof loadAvatarOptions === 'function'
        ) {
            loadAvatarOptions();
        }

        if (!this._authModalsReadySignaled) {
            this._authModalsReadySignaled = true;
            try {
                window.dispatchEvent(new CustomEvent('reminko:auth-modals-created'));
            } catch (_) {
                /* ignore */
            }
        }

        // Инициализируем обработчики для динамически созданных модальных окон
        this.initModalHandlers();
    }
    
    // Инициализация обработчиков модальных окон
    initModalHandlers() {
        if (this._modalHandlersBound) return;
        this._modalHandlersBound = true;

        const openLoginModalSafe = () => {
            this.ensureModalsExist();
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.classList.add('active');
        };
        const openRegisterModalSafe = () => {
            this.ensureModalsExist();
            const registerModal = document.getElementById('registerModal');
            if (registerModal) registerModal.classList.add('active');
        };

        // Закрытие модальных окон по ESC (кроме окна подтверждения email)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.keyCode === 27) {
                const modals = document.querySelectorAll('.modal.active');
                modals.forEach(modal => {
                    // Не закрываем окно подтверждения email по ESC
                    if (modal.id !== 'emailConfirmModal') {
                        modal.classList.remove('active');
                    }
                });
            }
        });
        
        // Используем делегирование событий для закрытия модальных окон
        document.addEventListener('click', (e) => {
            // Резерв: глобальное открытие входа/регистрации из любой вкладки.
            const openLoginBtn = e.target.closest('#topLoginBtn, #loginBtn, .btn-top-login, .btn-login');
            if (openLoginBtn) {
                e.preventDefault();
                openLoginModalSafe();
                return;
            }
            const openRegisterBtn = e.target.closest('#topRegisterBtn, #registerBtn, .btn-top-register, .btn-register');
            if (openRegisterBtn) {
                e.preventDefault();
                openRegisterModalSafe();
                return;
            }

            // Закрытие модального окна входа
            if (e.target.id === 'closeLoginModal' || (e.target.classList.contains('close') && e.target.closest('#loginModal'))) {
                const loginModal = document.getElementById('loginModal');
                if (loginModal) {
                    loginModal.classList.remove('active');
                }
            }
            
            // Закрытие модального окна регистрации
            if (e.target.id === 'closeRegisterModal' || (e.target.classList.contains('close') && e.target.closest('#registerModal'))) {
                const registerModal = document.getElementById('registerModal');
                if (registerModal) {
                    registerModal.classList.remove('active');
                }
            }
            
            // Закрытие модального окна восстановления пароля
            if (e.target.id === 'closePasswordResetModal' || (e.target.classList.contains('close') && e.target.closest('#passwordResetModal'))) {
                const passwordResetModal = document.getElementById('passwordResetModal');
                if (passwordResetModal) {
                    passwordResetModal.classList.remove('active');
                }
            }
            
            // Закрытие модального окна подтверждения email обрабатывается в email-confirm.js
            // Не закрываем здесь, чтобы не было конфликтов
            
            // Ссылка "Забыли пароль?"
            if (e.target.classList.contains('forgot-password') || e.target.closest('.forgot-password')) {
                e.preventDefault();
                const loginModal = document.getElementById('loginModal');
                const passwordResetModal = document.getElementById('passwordResetModal');
                if (loginModal) loginModal.classList.remove('active');
                if (passwordResetModal) passwordResetModal.classList.add('active');
            }
            
            // Переключение между входом и регистрацией
            if (e.target.id === 'switchToRegister' || e.target.closest('#switchToRegister')) {
                e.preventDefault();
                const loginModal = document.getElementById('loginModal');
                const registerModal = document.getElementById('registerModal');
                if (loginModal) loginModal.classList.remove('active');
                if (registerModal) registerModal.classList.add('active');
            }
            
            if (e.target.id === 'switchToLogin' || e.target.closest('#switchToLogin')) {
                e.preventDefault();
                const registerModal = document.getElementById('registerModal');
                const loginModal = document.getElementById('loginModal');
                if (registerModal) registerModal.classList.remove('active');
                if (loginModal) loginModal.classList.add('active');
            }
            
            // Возврат к форме входа из восстановления пароля
            if (e.target.id === 'backToLogin' || e.target.closest('#backToLogin')) {
                e.preventDefault();
                const passwordResetModal = document.getElementById('passwordResetModal');
                const loginModal = document.getElementById('loginModal');
                if (passwordResetModal) passwordResetModal.classList.remove('active');
                if (loginModal) loginModal.classList.add('active');
            }
            
            // Обработка кнопки просмотра пароля
            if (e.target.id === 'toggleLoginPassword' || e.target.closest('#toggleLoginPassword')) {
                e.preventDefault();
                e.stopPropagation();
                const loginPassword = document.getElementById('loginPassword');
                const loginPasswordEyeIcon = document.getElementById('loginPasswordEyeIcon');
                
                if (loginPassword && loginPasswordEyeIcon) {
                    if (loginPassword.type === 'password') {
                        loginPassword.type = 'text';
                        loginPasswordEyeIcon.innerHTML = `
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                            <line x1="1" y1="1" x2="23" y2="23"></line>
                        `;
                    } else {
                        loginPassword.type = 'password';
                        loginPasswordEyeIcon.innerHTML = `
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        `;
                    }
                }
            }

            // Fallback входа: если main.js не загрузился, но loginUser доступен.
            if (e.target.id === 'loginSubmit' && !window.__reminkoMainScriptLoaded) {
                e.preventDefault();
                const email = (document.getElementById('loginEmail')?.value || '').trim();
                const password = document.getElementById('loginPassword')?.value || '';
                const errorDiv = document.getElementById('loginError');
                if (!email || !password) {
                    if (errorDiv) {
                        errorDiv.textContent = 'Заполните почту и пароль';
                        errorDiv.style.display = 'block';
                    }
                    return;
                }
                if (typeof loginUser !== 'function') return;
                Promise.resolve(loginUser(email, password))
                    .then(async (result) => {
                        if (result && result.success) {
                            if (errorDiv) {
                                errorDiv.textContent = '';
                                errorDiv.style.display = 'none';
                            }
                            const loginModal = document.getElementById('loginModal');
                            if (loginModal) loginModal.classList.remove('active');
                            if (typeof this.updateAuthLinks === 'function') {
                                await this.updateAuthLinks();
                            }
                            if (typeof showSuccess === 'function') showSuccess(result.message || 'Вход выполнен');
                            return;
                        }
                        if (errorDiv) {
                            errorDiv.textContent = (result && result.message) || 'Ошибка входа';
                            errorDiv.style.display = 'block';
                        }
                    })
                    .catch((err) => {
                        if (errorDiv) {
                            errorDiv.textContent = err?.message || 'Ошибка входа';
                            errorDiv.style.display = 'block';
                        }
                    });
            }
        });
    }
}

/**
 * Бейдж непрочитанных ЛС у «Сообщения». У #dmBadge класс .hidden с !important — снимаем при показе.
 */
window.reminkoUpdateDmBadge = function reminkoUpdateDmBadge() {
    if (typeof DirectMessagesService === 'undefined' || typeof DirectMessagesService.getTotalUnread !== 'function') {
        return;
    }
    DirectMessagesService.getTotalUnread()
        .then((count) => {
            const dmBadge = document.getElementById('dmBadge');
            if (!dmBadge) return;
            if (count > 0) {
                dmBadge.textContent = count > 99 ? '99+' : String(count);
                dmBadge.classList.remove('hidden');
                dmBadge.style.display = 'flex';
            } else {
                dmBadge.classList.add('hidden');
                dmBadge.style.display = 'none';
            }
        })
        .catch(() => {});
};

// Глобальный экземпляр
window.navigationManager = new NavigationManager();

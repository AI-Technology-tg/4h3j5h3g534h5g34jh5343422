// Страница профиля пользователя

const favoritesPerPage = 10; // 5x2 для аниме
const mangaFavoritesPerPage = 10; // 5x2 для манги
let currentFavoritesPage = 0;
let currentMangaFavoritesPage = 0;

/**
 * Пресеты в Fons: 1–5 — «N b.jpg» / «N g.jpg», с 6 по 15 в папке — «N B.jpg» / «N G.jpg».
 */
function reminkoBuildAvailablePresetAvatars() {
    const out = [];
    for (let i = 1; i <= 5; i++) {
        out.push(`Fons/${i} b.jpg`);
    }
    for (let i = 6; i <= 15; i++) {
        out.push(`Fons/${i} B.jpg`);
    }
    for (let i = 1; i <= 5; i++) {
        out.push(`Fons/${i} g.jpg`);
    }
    for (let i = 6; i <= 15; i++) {
        out.push(`Fons/${i} G.jpg`);
    }
    return out;
}

const availableAvatars = reminkoBuildAvailablePresetAvatars();

// Получить доступные аватары для пользователя
async function getAvailableAvatarsForUser(userId, userGender, userAchievements) {
    return [...availableAvatars];
}

// Получить случайный аватар
function getRandomAvatar() {
    return availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
}

document.addEventListener('DOMContentLoaded', async () => {
    // Проверяем параметр user из URL
    const urlParams = new URLSearchParams(window.location.search);
    const userIdFromUrl = (urlParams.get('user') || urlParams.get('id') || '').trim();

    if (userIdFromUrl) {
        // Загружаем профиль другого пользователя
        await loadUserProfile(userIdFromUrl);
    } else {
        // Загружаем свой профиль
        const isAuth = await isAuthenticated();
        if (!isAuth) {
            window.location.href = 'index.html';
            return;
        }

        await loadProfile();
        initAvatarPicker();
    }
});

// Загрузить профиль другого пользователя
async function loadUserProfile(userId) {
    if (!supabaseClient) {
        if (typeof showError === 'function') {
            showError('Не удалось загрузить профиль пользователя');
        }
        return;
    }
    
    try {
        // Загружаем профиль пользователя из Supabase
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        
        if (error || !profile) {
            if (typeof showError === 'function') {
                showError('Профиль пользователя не найден или нет доступа');
            }
            return;
        }

        let isCreator = false;
        if (typeof userIdIsSiteCreator === 'function') {
            try {
                isCreator = await userIdIsSiteCreator(userId);
            } catch (_) { /* noop */ }
        }
        
        const userData = {
            id: profile.id,
            email: '',
            username: profile.username || 'Пользователь',
            avatar: isCreator ? 'Fons/Creator ava.png' : (profile.avatar || 'Fons/1 b.jpg'),
            gender: profile.gender || 'male',
            registerDate: profile.created_at || null,
            isSiteCreator: isCreator
        };
        
        await renderProfile(userData, true); // true = просмотр чужого профиля
        initFavoritesScroll();
        if (typeof hideLoading === 'function') hideLoading();
    } catch (err) {
        console.error('Ошибка загрузки профиля пользователя:', err);
        showProfileLoadError('Не удалось загрузить профиль пользователя');
        if (typeof showError === 'function') {
            showError('Не удалось загрузить профиль пользователя');
        }
    }
}

async function loadProfile() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    // Базовые данные от Supabase Auth
    let finalUserData = {
        id: user.id,
        email: user.email || '',
        username: user.username || user.email?.split('@')[0] || 'Пользователь',
        avatar: user.avatar || 'Fons/1 b.jpg',
        gender: user.gender || 'male'
    };
    
    // Обогащаем из localStorage (favorites, watchHistory, settings)
    const localData = getUserData(user.id);
    if (localData) {
        finalUserData = {
            ...localData,
            id: user.id,
            email: user.email || localData.email || '',
            username: user.username || localData.username || user.email?.split('@')[0] || 'Пользователь',
            avatar: user.avatar || localData.avatar || 'Fons/1 b.jpg',
            gender: localData.gender || user.gender || 'male'
        };
    }
    
    // Дополнительно из Supabase profiles
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data: profile, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            
            if (profile && !error) {
                finalUserData.username = profile.username || finalUserData.username;
                finalUserData.avatar = profile.avatar || finalUserData.avatar;
                finalUserData.gender = profile.gender || finalUserData.gender;
                if (profile.created_at) finalUserData.registerDate = profile.created_at;
            }
        } catch (err) {
            console.error('Ошибка загрузки профиля из Supabase:', err);
        }
    }
    
    await renderProfile(finalUserData);
    initFavoritesScroll();
}

// Глобальные переменные для аватаров пользователя
let currentUserAvatars = [];
let currentUserAchievements = [];
let currentUserGender = 'male';

// Проверка, является ли ID UUID
function isUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

const REMINKO_VIP_WATCH_STRIPE_URL = 'https://buy.stripe.com/fZu8wQfZJ4L68x7beWcEw0a';
const REMINKO_VIP_BETA_PROMO_CODE = 'REBETA26';

function reminkoBuildVipWatchCheckoutUrl(clientUserId) {
    try {
        const u = new URL(REMINKO_VIP_WATCH_STRIPE_URL);
        if (clientUserId) u.searchParams.set('client_reference_id', String(clientUserId));
        u.searchParams.set('prefilled_promo_code', REMINKO_VIP_BETA_PROMO_CODE);
        return u.toString();
    } catch {
        const q = new URLSearchParams();
        if (clientUserId) q.set('client_reference_id', String(clientUserId));
        q.set('prefilled_promo_code', REMINKO_VIP_BETA_PROMO_CODE);
        return `${REMINKO_VIP_WATCH_STRIPE_URL}?${q.toString()}`;
    }
}

async function renderProfile(userData, isViewMode = false) {
    const container = document.getElementById('profileContainer');
    if (!container) return;
    
    // ID профиля, который смотрим
    const profileUserId = userData.id;
    const isUUIDFormat = profileUserId && isUUID(profileUserId.toString());

    // Для своего профиля загружаем данные текущего пользователя
    const currentUser = !isViewMode ? await getCurrentUser() : null;
    const ownUserId = currentUser ? currentUser.id : null;

    let userAchievements = [];
    let vipSubscription = null;
    let friendsList = [];
    let friendProfiles = [];

    if (!isViewMode && ownUserId && isUUID(ownUserId.toString()) && typeof window.achievementsService !== 'undefined') {
        userAchievements = await window.achievementsService.getUserAchievements(ownUserId);
    }

    if (!isViewMode) {
        currentUserAchievements = userAchievements;
        currentUserGender = userData.gender || 'male';
        currentUserAvatars = await getAvailableAvatarsForUser(ownUserId, currentUserGender, userAchievements);
    }

    if (isUUIDFormat && typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data: vipData } = await supabaseClient
                .from('vip_subscriptions').select('*')
                .eq('user_id', profileUserId).eq('is_active', true).maybeSingle();
            if (vipData) vipSubscription = vipData;

            const { data: friendsData } = await supabaseClient
                .from('friends').select('*')
                .or(`user_id.eq.${profileUserId},friend_id.eq.${profileUserId}`)
                .eq('status', 'accepted');
            friendsList = friendsData || [];

            // Загружаем профили друзей для плиток
            if (friendsList.length > 0) {
                const friendIds = friendsList.map(f =>
                    f.user_id === profileUserId ? f.friend_id : f.user_id
                ).filter(Boolean);
                const { data: profiles } = await supabaseClient
                    .from('profiles').select('id, username, avatar')
                    .in('id', friendIds);
                friendProfiles = profiles || [];
            }
        } catch (error) {
            console.error('Ошибка загрузки данных из Supabase:', error);
        }
    }

    const registerDate = userData.registerDate ? new Date(userData.registerDate).toLocaleDateString('ru-RU') : 'Неизвестно';

    // Избранное — для чужого профиля загружаем из Supabase
    let favoritesAnime = [];
    let favoritesManga = [];
    if (isViewMode && isUUIDFormat && supabaseClient) {
        try {
            const { data: favAnime } = await supabaseClient
                .from('favorites_anime').select('anime_id')
                .eq('user_id', profileUserId);
            if (favAnime) {
                favoritesAnime = favAnime.map(f => {
                    const anime = getAnimeById(parseInt(f.anime_id));
                    return anime ? (typeof initAnimeStats === 'function' ? initAnimeStats(anime) : anime) : null;
                }).filter(Boolean);
            }
            const { data: favManga } = await supabaseClient
                .from('favorites_manga').select('manga_id')
                .eq('user_id', profileUserId);
            if (favManga) {
                favoritesManga = favManga.map(f => {
                    return typeof getMangaById === 'function' ? getMangaById(parseInt(f.manga_id)) : null;
                }).filter(Boolean);
            }
        } catch (_) {}
    } else {
        const favorites = userData.favorites || [];
        const mangaFavs = userData.mangaFavorites || [];
        favoritesAnime = favorites.map(id => {
            const anime = getAnimeById(id);
            return anime ? (typeof initAnimeStats === 'function' ? initAnimeStats(anime) : anime) : null;
        }).filter(Boolean);
        favoritesManga = mangaFavs.map(id => {
            return typeof getMangaById === 'function' ? getMangaById(id) : null;
        }).filter(Boolean);
    }
    const totalFavorites = favoritesAnime.length + favoritesManga.length;

    // Аватар
    const creatorByEmail = (userData.email || '').toLowerCase() === 'creator@reminko.com';
    const creatorByName =
        ['creator@reminko.com', 'creator', 'subarik', 'dubina'].includes(
            (userData.username || '').toLowerCase()
        ) ||
        (typeof reminkoUserIdIsSiteCreatorSync === 'function' &&
            reminkoUserIdIsSiteCreatorSync(profileUserId));
    const isCreatorAccount =
        Boolean(userData.isSiteCreator || userData.is_site_creator) || creatorByEmail || creatorByName;

    if (typeof reminkoEnsureSiteCreatorUserIdCached === 'function') {
        await reminkoEnsureSiteCreatorUserIdCached();
    }
    if (typeof reminkoPrefetchTeamRoles === 'function') {
        await reminkoPrefetchTeamRoles([profileUserId]);
    }
    const profileTeamRole =
        typeof reminkoResolveProfileTeamRole === 'function'
            ? reminkoResolveProfileTeamRole(userData, profileUserId)
            : null;

    let avatarUrl = isCreatorAccount ? 'Fons/Creator ava.png' : (userData.avatar || 'Fons/1 b.jpg');
    if (!isViewMode) {
        const userAvatars = currentUserAvatars.length > 0 ? currentUserAvatars : availableAvatars;
        if (!isCreatorAccount && (!avatarUrl || !userAvatars.includes(avatarUrl))) {
            avatarUrl = getRandomAvatar();
            updateUserData(userData.id, { avatar: avatarUrl });
        }
    }
    const avatarUrlCss =
        typeof reminkoResolveAssetUrl === 'function' ? reminkoResolveAssetUrl(avatarUrl) : avatarUrl;
    /* Как у всех: круг 150×150 из CSS, cover + center — без 92% / 18%, иначе «плывёт» круг */
    const avatarStyle = `background-image: url('${avatarUrlCss.replace(/'/g, "\\'")}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;

    // Время просмотра (для своего профиля из localStorage, для чужого из Supabase)
    let watchTimeLabel = '0 мин';
    if (!isViewMode) {
        const watchHistory = userData.watchHistory || [];
        const uniqueEpisodes = new Set();
        const uniqueChapters = new Set();
        watchHistory.forEach(entry => {
            if (entry.type === 'manga') {
                uniqueChapters.add(`${entry.mangaId || entry.animeId}-${entry.chapterNumber || entry.episodeNumber}`);
            } else {
                uniqueEpisodes.add(`${entry.animeId}-${entry.episodeNumber}`);
            }
        });
        const totalMinutes = (uniqueEpisodes.size * 24) + (uniqueChapters.size * 5);
        if (totalMinutes >= 60) {
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            watchTimeLabel = mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
        } else {
            watchTimeLabel = `${totalMinutes} мин`;
        }
    } else if (isUUIDFormat && supabaseClient) {
        try {
            const { data: watchedRows } = await supabaseClient
                .from('watch_history')
                .select('anime_id, episode_number')
                .eq('user_id', profileUserId);
            const uniqueEpisodes = new Set(
                (watchedRows || []).map(row => `${row.anime_id}-${row.episode_number}`)
            );
            const totalMinutes = uniqueEpisodes.size * 24;
            if (totalMinutes >= 60) {
                const hours = Math.floor(totalMinutes / 60);
                const mins = totalMinutes % 60;
                watchTimeLabel = mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
            } else {
                watchTimeLabel = `${totalMinutes} мин`;
            }
        } catch (_) {}
    }

    const profileName = userData.username || 'Пользователь';

    function renderFavTiles(items, type) {
        return items.slice(0, 10).map(item => {
            const gradient = typeof generateGradient === 'function' ? generateGradient(item.id) : 'linear-gradient(135deg, #6c5ce7, #a29bfe)';
            const onclick = type === 'anime' ? `openAnimePage(${item.id})` : `openMangaPage(${item.id})`;
            const title = item.title || '';
            const shortTitle = title.length > 15 ? title.substring(0, 15) + '...' : title;
            const searchTitle = item.titleAlt || item.title || '';
            return `<div class="favorite-mini-card" onclick="${onclick}" title="${title}" data-fav-type="${type}" data-fav-title="${searchTitle.replace(/"/g, '&quot;')}">
                <div class="favorite-mini-poster" style="background: ${gradient};">
                    <div class="favorite-mini-year">${item.year || ''}</div>
                </div>
                <div class="favorite-mini-title">${shortTitle}</div>
            </div>`;
        }).join('');
    }

    function friendTileAvatar(p) {
        if (p && p.avatar && String(p.avatar).trim()) {
            const av = p.avatar;
            return (typeof reminkoResolveAssetUrl === 'function' ? reminkoResolveAssetUrl(av) : av).replace(
                /"/g,
                '&quot;'
            );
        }
        const un = (p.username || '').toLowerCase();
        const isCr =
            (p.email && String(p.email).toLowerCase() === 'creator@reminko.com') ||
            un === 'creator' ||
            un === 'creator@reminko.com' ||
            p.isSiteCreator === true;
        const av = isCr ? 'Fons/Creator ava.png' : 'Fons/1 b.jpg';
        return (typeof reminkoResolveAssetUrl === 'function' ? reminkoResolveAssetUrl(av) : av).replace(/"/g, '&quot;');
    }

    function renderFriendTiles(profiles) {
        if (!profiles || profiles.length === 0) return '';
        return profiles.slice(0, 12).map(p => `
            <a href="profile.html?user=${p.id}" class="profile-friend-tile" title="${p.username || 'Пользователь'}">
                <img src="${friendTileAvatar(p)}" alt="" class="profile-friend-tile-avatar reminko-avatar-img" width="56" height="56" decoding="async" onerror="this.onerror=null;this.src='/Fons/1 b.jpg'">
                <div class="profile-friend-tile-name">${(p.username || 'Пользователь').length > 10 ? (p.username || '').substring(0, 10) + '…' : (p.username || 'Пользователь')}</div>
            </a>
        `).join('');
    }

    function friendsCountWord(n) {
        if (n === 1) return 'друг';
        if (n >= 2 && n <= 4) return 'друга';
        return 'друзей';
    }

    // VIP бейджи для имени
    let vipBadge = '';
    if (isCreatorAccount) {
        vipBadge =
            typeof reminkoTeamRoleBadgeHtml === 'function'
                ? reminkoTeamRoleBadgeHtml('creator', 'profile-creator-badge')
                : '<img class="profile-creator-badge" src="Fons/creator znak.png" alt="Создатель" title="Создатель сайта" onerror="this.onerror=null;this.src=\'Fons/Creator ava.png\'">';
        if (!isViewMode) {
            vipBadge +=
                '<span class="profile-vip-badge" title="VIP «Смотреть вместе» — навсегда">🎬 Watch</span>';
        }
    } else if (profileTeamRole && profileTeamRole !== 'creator') {
        vipBadge =
            typeof reminkoTeamRoleBadgeHtml === 'function'
                ? reminkoTeamRoleBadgeHtml(profileTeamRole, 'profile-team-role-badge')
                : '';
    } else if (!isViewMode) {
        if (vipSubscription && vipSubscription.is_active) vipBadge += '<span class="profile-vip-badge" title="VIP Просмотр вместе">🎬 Watch</span>';
    }

    container.innerHTML = `
        <div class="profile-modern">
            <div class="profile-top">
                <div class="profile-avatar-wrap">
                    <div class="profile-avatar${isCreatorAccount ? ' profile-avatar--site-creator' : ''}" id="profileAvatar" style="${avatarStyle}" ${!isViewMode ? 'onclick="openAvatarPicker()"' : ''}></div>
                    ${!isViewMode ? `
                        <button class="avatar-change-btn" onclick="openAvatarPicker()" title="Сменить аватар">
                            ✎
                        </button>
                    ` : ''}
                </div>
                <div class="profile-head-main">
                    <h1 class="profile-name">${profileName} ${vipBadge}</h1>
                    ${!isViewMode ? `<p class="profile-email">${userData.email || ''}</p>` : ''}
                </div>
                <div class="profile-actions-row">
                    ${!isViewMode ? `
                        <button class="btn btn-primary" onclick="editProfile()">Редактировать</button>
                        <button class="btn btn-secondary" onclick="openSettingsModal()">Настройки</button>
                    ` : `
                        <a href="messages.html?user=${profileUserId}" class="btn btn-secondary">Написать</a>
                    `}
                </div>
            </div>

            <div class="profile-stats">
                <div class="stat-card">
                    <div class="stat-value">${totalFavorites}</div>
                    <div class="stat-label">В избранном</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${watchTimeLabel}</div>
                    <div class="stat-label">Время просмотра</div>
                </div>
            </div>

            <div class="profile-tabs">
                <button class="profile-tab-btn active" data-tab-target="profileTabFavorites">Избранное</button>
                <button class="profile-tab-btn" data-tab-target="profileTabInfo">Инфо</button>
                ${!isViewMode ? `<button class="profile-tab-btn" data-tab-target="profileTabFriends">Друзья</button>` : ''}
                ${!isViewMode ? `<button class="profile-tab-btn" data-tab-target="profileTabServices">Услуги</button>` : ''}
            </div>

            <div class="profile-tab-content active" id="profileTabFavorites">
                <div class="profile-section">
                    <div class="profile-section-header">
                        <h2 class="section-title">${isViewMode ? `Избранное аниме ${profileName}` : 'Избранное аниме'}</h2>
                        ${!isViewMode ? '<a href="favorites.html" class="btn btn-primary btn-sm">Все избранное</a>' : ''}
                    </div>
                    ${favoritesAnime.length > 0 ? `
                        <div class="favorites-tiles-row">${renderFavTiles(favoritesAnime, 'anime')}</div>
                    ` : `<div class="empty-favorites"><p>${isViewMode ? 'Нет избранных аниме' : 'У вас пока нет избранных аниме'}</p></div>`}
                </div>
                <div class="profile-section">
                    <div class="profile-section-header">
                        <h2 class="section-title">${isViewMode ? `Избранная манга ${profileName}` : 'Избранная манга'}</h2>
                        ${!isViewMode ? '<a href="favorites-manga.html" class="btn btn-primary btn-sm">Все избранное</a>' : ''}
                    </div>
                    ${favoritesManga.length > 0 ? `
                        <div class="favorites-tiles-row">${renderFavTiles(favoritesManga, 'manga')}</div>
                    ` : `<div class="empty-favorites"><p>${isViewMode ? 'Нет избранных манг' : 'У вас пока нет избранных манг'}</p></div>`}
                </div>
            </div>

            <div class="profile-tab-content" id="profileTabInfo">
                <div class="profile-section">
                    <h2 class="section-title">Информация</h2>
                    ${isCreatorAccount ? `
                    <p class="profile-creator-notice" role="note">
                        <strong>Создатель Re-Minko</strong> — разработчик и владелец портала Re-Minko (re-minko-anime.com). Вопросы, идеи и отзывы можно оставлять в общем чате или через контакты в шапке сайта.
                    </p>` : ''}
                    ${!isViewMode && userData.email ? `<div class="profile-info-item">
                        <span class="info-label">Email:</span>
                        <span class="info-value">${userData.email}</span>
                    </div>` : ''}
                    <div class="profile-info-item">
                        <span class="info-label">Дата регистрации:</span>
                        <span class="info-value">${registerDate}</span>
                    </div>
                </div>
            </div>

            ${!isViewMode ? `
            <div class="profile-tab-content" id="profileTabFriends">
                <div class="profile-section">
                    <div class="profile-section-header">
                        <h2 class="section-title">Друзья</h2>
                        <a href="friends.html" class="btn btn-primary btn-sm">Управление</a>
                    </div>
                    ${friendsList.length > 0 ? `
                        <div class="friends-count-info">У вас ${friendsList.length} ${friendsCountWord(friendsList.length)}</div>
                        <div class="profile-friends-grid">
                            ${renderFriendTiles(friendProfiles)}
                        </div>
                    ` : `
                        <div class="empty-favorites">
                            <p>У вас пока нет друзей</p>
                            <a href="friends.html" class="btn btn-primary" style="margin-top: 1rem;">Найти друзей</a>
                        </div>
                    `}
                </div>
            </div>
            ` : ''}
            ${!isViewMode ? `
            <div class="profile-tab-content" id="profileTabServices">
                <div class="profile-section">
                    <h2 class="section-title">Услуги</h2>
                    <div class="vip-cards-grid">
                        <div class="vip-card vip-card-watch">
                            <div class="vip-card-icon">🎬</div>
                            <h3 class="vip-card-title">VIP Смотреть вместе</h3>
                            ${isCreatorAccount ? `
                                <p class="vip-card-desc vip-active-label">Активна навсегда</p>
                                <p class="vip-card-desc" style="font-size:0.88rem;opacity:0.88;">Полный доступ к совместному просмотру для вашей учётной записи.</p>
                            ` : (vipSubscription && vipSubscription.is_active) ? `
                                <p class="vip-card-desc vip-active-label">Подписка активна</p>
                                <a href="https://billing.stripe.com/p/login/dRm00keVF91mfZz1EmcEw00" class="btn btn-danger vip-card-btn" target="_blank">Управление</a>
                            ` : `
                                <p class="vip-card-desc">VIP «Смотреть вместе»: создание комнаты и расширенные лимиты.</p>
                                <p class="vip-card-desc" style="font-size:0.85rem;opacity:0.88;margin-top:0.35rem;">Бета-тест: возможны баги и недоработки. Скидка 50% — промокод <strong>${REMINKO_VIP_BETA_PROMO_CODE}</strong> (на странице оплаты подставляется автоматически; при необходимости введите вручную).</p>
                                <a href="${reminkoBuildVipWatchCheckoutUrl(ownUserId)}" class="btn btn-primary vip-card-btn" target="_blank" rel="noopener noreferrer">Купить VIP Watch</a>
                            `}
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
        ${!isViewMode ? `
        <div id="avatarModal" class="modal avatar-modal-reminko" aria-hidden="true">
            <div class="modal-content avatar-modal-content">
                <span class="close" id="closeAvatarModal" role="button" tabindex="0" aria-label="Закрыть">&times;</span>
                <h3 class="avatar-modal-title">Аватар</h3>
                <p class="avatar-modal-lead">Выберите пресет, загрузите своё фото или опишите образ для ИИ. Генерация — в аниме-стиле, только безопасный контент.</p>
                <div class="avatar-modal-toolbar-reminko">
                    <button type="button" class="avatar-tool-btn avatar-tool-btn--upload" id="avatarUploadBtn">
                        <span class="avatar-tool-btn__ic" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        </span>
                        <span class="avatar-tool-btn__txt">Загрузить с устройства</span>
                    </button>
                    <input type="file" id="avatarFileInput" accept="image/*" hidden />
                    <div class="avatar-gen-stack">
                        <label class="avatar-gen-label" for="avatarGenPrompt">Описание для ИИ (аниме-стиль)</label>
                        <textarea id="avatarGenPrompt" class="avatar-gen-textarea" maxlength="400" rows="3" placeholder="Например: парень в худи, бирюзовые волосы, наушники, нейтральный фон…"></textarea>
                        <button type="button" class="avatar-tool-btn avatar-tool-btn--ai" id="avatarGenerateBtn">
                            <span class="avatar-tool-btn__ic" aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 14l-.8 2.4-2.4.8 2.4.8.8 2.4.8-2.4 2.4-.8-2.4-.8-.8-2.4z"/></svg>
                            </span>
                            <span class="avatar-tool-btn__txt">Сгенерировать ИИ</span>
                        </button>
                        <p id="avatarGenQuota" class="avatar-gen-quota" aria-live="polite"></p>
                    </div>
                </div>
                <div id="avatarGrid" class="avatar-grid"></div>
            </div>
        </div>` : ''}
    `;
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    initProfileTabs(tabParam);
}

function initProfileTabs(defaultTab = null) {
    const buttons = document.querySelectorAll('.profile-tab-btn');
    const tabs = document.querySelectorAll('.profile-tab-content');
    if (!buttons.length || !tabs.length) return;

    const normalizedMap = {
        favorites: 'profileTabFavorites',
        posts: 'profileTabFavorites',
        info: 'profileTabInfo',
        friends: 'profileTabFriends',
        services: 'profileTabServices'
    };
    const resolvedDefault = defaultTab
        ? (normalizedMap[defaultTab.toLowerCase()] || defaultTab)
        : 'profileTabFavorites';

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.tabTarget;
            if (!targetId) return;
            const target = document.getElementById(targetId);
            if (!target) return;

            buttons.forEach(b => b.classList.remove('active'));
            tabs.forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            target.classList.add('active');
        });
    });

    if (resolvedDefault) {
        const targetBtn = Array.from(buttons).find(b => b.dataset.tabTarget === resolvedDefault);
        if (targetBtn) targetBtn.click();
    }
}

// Функции для просмотра вместе
async function createWatchTogetherSession() {
    if (typeof window.watchTogetherService !== 'undefined') {
        const user = await getCurrentUser();
        if (!user) return;
        
        const result = await window.watchTogetherService.createSession(user.id);
        if (result.success) {
            alert(`Сессия создана! Код для друзей: ${result.code}`);
        } else {
            alert(result.message || 'Не удалось создать сессию');
        }
    } else {
        alert('Функция в разработке');
    }
}

async function joinWatchTogetherSession() {
    const code = prompt('Введите код сессии:');
    if (!code) return;
    
    if (typeof window.watchTogetherService !== 'undefined') {
        const user = await getCurrentUser();
        if (!user) return;
        
        const result = await window.watchTogetherService.joinSession(user.id, code);
        if (result.success) {
            alert('Вы присоединились к сессии!');
        } else {
            alert(result.message || 'Не удалось присоединиться к сессии');
        }
    } else {
        alert('Функция в разработке');
    }
}

window.createWatchTogetherSession = createWatchTogetherSession;
window.joinWatchTogetherSession = joinWatchTogetherSession;

/** URL POST/GET для ИИ-аватара: Grok на Netlify или явный legacy minkoAvatarProxy (BOT /avatar). */
function reminkoGetMinkoAvatarProxyUrl() {
    const cfg = typeof window !== 'undefined' && window.APP_CONFIG ? window.APP_CONFIG : {};
    if (typeof cfg.minkoAvatarProxy === 'string' && cfg.minkoAvatarProxy.trim()) {
        return cfg.minkoAvatarProxy.trim();
    }
    if (typeof cfg.minkoAvatarGrokUrl === 'string' && cfg.minkoAvatarGrokUrl.trim()) {
        return cfg.minkoAvatarGrokUrl.trim();
    }
    return '';
}

async function refreshAvatarGenQuota() {
    const el = document.getElementById('avatarGenQuota');
    if (!el) return;
    const url = reminkoGetMinkoAvatarProxyUrl();
    if (!url) {
        if (typeof reminkoDevOnlySetElement === 'function') {
            reminkoDevOnlySetElement(
                el,
                'ИИ-аватар: задайте minkoAvatarGrokUrl в config.local.js (…/minko-avatar-grok на Netlify).',
                'Скрыто от пользователей'
            );
        } else {
            el.textContent = '';
            el.hidden = true;
        }
        return;
    }
    const isLegacyLocal = /localhost:\s*3334|127\.0\.0\.1:\s*3334/i.test(url) || /\/avatar\/?$/i.test(url);
    if (isLegacyLocal) {
        if (typeof reminkoDevOnlySetElement === 'function') {
            reminkoDevOnlySetElement(
                el,
                'ИИ (Grok): до 3 генераций за 24 ч. На этом адресе включена старая точка /avatar — задайте в config.local.js полный URL …/minko-avatar-grok с Netlify.',
                'Скрыто от пользователей'
            );
        } else {
            el.textContent = '';
            el.hidden = true;
        }
        return;
    }
    if (!window.supabaseClient) {
        el.textContent = '';
        el.hidden = true;
        return;
    }
    try {
        const { data: sess } = await supabaseClient.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) {
            el.textContent = '';
            el.hidden = true;
            return;
        }
        const r = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            if (typeof reminkoDevOnlySetElement === 'function') {
                reminkoDevOnlySetElement(
                    el,
                    'Не удалось получить лимит. Проверьте деплой функции minko-avatar-grok и переменные Netlify.',
                    'Скрыто от пользователей'
                );
            } else {
                el.textContent = '';
                el.hidden = true;
            }
            return;
        }
        const rem = j.remaining != null ? j.remaining : Math.max(0, (j.limit || 3) - (j.used || 0));
        let line = `ИИ: осталось ${rem} из ${j.limit || 3} генераций за 24 ч. Только аниме-стиль, без порнографии и сексуального контента.`;
        if (j.resetsAt && rem <= 0) {
            try {
                line += ` Лимит обновится около ${new Date(j.resetsAt).toLocaleString('ru-RU')}.`;
            } catch (_) {
                /* noop */
            }
        }
        el.hidden = false;
        el.classList.remove('reminko-dev-only-host');
        el.textContent = line;
    } catch (_) {
        el.textContent = '';
        el.hidden = true;
    }
}

async function reminkoRunAvatarGeneration() {
    const genBtn = document.getElementById('avatarGenerateBtn');
    const ta = document.getElementById('avatarGenPrompt');
    if (!genBtn || !ta) return;
    const user = await getCurrentUser();
    if (!user?.id) return;
    const prompt = (ta.value || '').trim();
    if (prompt.length < 4) {
        if (typeof showWarning === 'function') showWarning('Опиши образ хотя бы в нескольких словах.');
        return;
    }
    const url = reminkoGetMinkoAvatarProxyUrl();
    if (!url) {
        const msg =
            'ИИ-аватар не настроен. В config.local.js укажите minkoAvatarGrokUrl на Netlify (…/minko-avatar-grok).';
        if (typeof showError === 'function') showError(msg);
        return;
    }
    if (!window.supabaseClient) {
        if (typeof showError === 'function') showError('Нет подключения к аккаунту.');
        return;
    }
    const { data: sess } = await supabaseClient.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) {
        if (typeof showError === 'function') showError('Войдите в аккаунт снова.');
        return;
    }
    const prevHtml = genBtn.innerHTML;
    genBtn.disabled = true;
    genBtn.innerHTML =
        '<span class="avatar-tool-btn__ic avatar-tool-btn__ic--spin" aria-hidden="true"></span><span class="avatar-tool-btn__txt">Генерация…</span>';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ prompt })
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 402 || res.status === 429) {
            const msg =
                data.error?.message ||
                'Лимит генераций на сутки исчерпан. Подождите до сброса окна (24 ч с первой из трёх).';
            if (typeof showWarning === 'function') showWarning(msg);
            await refreshAvatarGenQuota();
            return;
        }

        if (!res.ok) {
            throw new Error(data.error?.message || `Ошибка сервера (${res.status})`);
        }
        if (!data.url) {
            throw new Error('Сервер не вернул изображение');
        }

        await applyAvatarChoice(data.url);
        await refreshAvatarGenQuota();
    } catch (e) {
        console.warn('[avatar AI]', e);
        const devMsg =
            e.message ||
            'Не удалось сгенерировать аватар. Нужны Netlify-функция minko-avatar-grok, XAI_API_KEY и таблица avatar_ai_generations в Supabase.';
        const userMsg = 'Не удалось сгенерировать аватар. Попробуйте позже или выберите готовый аватар из списка.';
        if (typeof showError === 'function') {
            showError(
                typeof reminkoIsSiteCreatorView === 'function' && reminkoIsSiteCreatorView()
                    ? devMsg
                    : userMsg
            );
        }
    } finally {
        genBtn.disabled = false;
        genBtn.innerHTML = prevHtml;
    }
}

async function openAvatarPicker() {
    const modal = document.getElementById('avatarModal');
    if (!modal) return;
    
    const grid = document.getElementById('avatarGrid');
    if (!grid) return;
    
    const user = await getCurrentUser();
    if (!user) return;
    
    let avatarsToShow = availableAvatars;
    
    // Если у нас есть сохраненные данные - используем их, иначе загружаем заново
    if (currentUserAvatars.length > 0) {
        avatarsToShow = currentUserAvatars;
    } else {
        const userData = getUserData(user.id);
        const gender = userData?.gender || 'male';
        // Загружаем ачивки только если ID - UUID (для Supabase)
        const userId = user.id;
        const isUUIDFormat = userId && isUUID(userId.toString());
        let achievements = currentUserAchievements;
        if (achievements.length === 0 && isUUIDFormat && typeof window.achievementsService !== 'undefined') {
            achievements = await window.achievementsService.getUserAchievements(userId);
        }
        avatarsToShow = await getAvailableAvatarsForUser(userId, gender, achievements);
        currentUserAvatars = avatarsToShow;
    }
    
    // Показываем все доступные аватары
    grid.innerHTML = avatarsToShow.map((avatarPath, index) => {
        // Используем путь как data-атрибут для точного соответствия
        const encodedPath = encodeURIComponent(avatarPath);
        const cssUrl =
            typeof reminkoResolveAssetUrl === 'function'
                ? reminkoResolveAssetUrl(avatarPath).replace(/'/g, "\\'")
                : String(avatarPath).replace(/'/g, "\\'");
        return `
            <div class="avatar-option" style="background-image: url('${cssUrl}'); background-size: cover; background-position: center;" data-avatar-path="${encodedPath}" onclick="selectAvatarByPath('${encodedPath}')"></div>
        `;
    }).join('');
    
    modal.classList.add('active');
    void refreshAvatarGenQuota();
}

/** Сжатие загруженного изображения в JPEG data URL (для сохранения в профиле). */
function reminkoCompressImageToDataUrl(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const blobUrl = URL.createObjectURL(file);
        img.onload = () => {
            try {
                URL.revokeObjectURL(blobUrl);
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                if (!w || !h) {
                    reject(new Error('size'));
                    return;
                }
                const scale = Math.min(1, maxSide / Math.max(w, h));
                const tw = Math.max(1, Math.round(w * scale));
                const th = Math.max(1, Math.round(h * scale));
                const canvas = document.createElement('canvas');
                canvas.width = tw;
                canvas.height = th;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('ctx'));
                    return;
                }
                ctx.drawImage(img, 0, 0, tw, th);
                resolve(canvas.toDataURL('image/jpeg', quality));
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            reject(new Error('load'));
        };
        img.src = blobUrl;
    });
}

/** Применить путь/URL/data URL аватара и синхронизировать с Supabase через updateUserData. */
async function applyAvatarChoice(avatarPath) {
    const user = await getCurrentUser();
    if (!user) return;

    if (typeof ensureUserDataRecord === 'function') {
        ensureUserDataRecord(user.id);
    }

    updateUserData(user.id, { avatar: avatarPath });
    if (typeof clearUserCache === 'function') clearUserCache();

    const enc = encodeURIComponent(avatarPath);
    document.querySelectorAll('.avatar-option').forEach((opt) => {
        const sel = opt.getAttribute('data-avatar-path') === enc;
        opt.classList.toggle('selected', sel);
    });

    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) {
        const displayUrl =
            typeof reminkoResolveAssetUrl === 'function'
                ? reminkoResolveAssetUrl(avatarPath)
                : avatarPath;
        const safe = String(displayUrl).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        profileAvatar.style.backgroundImage = `url('${safe}')`;
        profileAvatar.style.backgroundSize = 'cover';
        profileAvatar.style.backgroundPosition = 'center';
        profileAvatar.style.backgroundRepeat = 'no-repeat';
    }

    setTimeout(() => {
        const modal = document.getElementById('avatarModal');
        if (modal) modal.classList.remove('active');
        if (typeof showSuccess === 'function') {
            showSuccess('Аватар изменён');
        }
    }, 400);
}

// Выбрать аватар по пути (новая функция)
async function selectAvatarByPath(encodedPath) {
    let avatarPath;
    try {
        avatarPath = decodeURIComponent(encodedPath);
    } catch (e) {
        return;
    }
    await applyAvatarChoice(avatarPath);
}

// Обратная совместимость - используем новую функцию
function selectAvatarByIndex(index) {
    if (currentUserAvatars.length > 0 && index >= 0 && index < currentUserAvatars.length) {
        const avatarPath = currentUserAvatars[index];
        const encodedPath = encodeURIComponent(avatarPath);
        selectAvatarByPath(encodedPath);
    } else if (index >= 0 && index < availableAvatars.length) {
        const avatarPath = availableAvatars[index];
        const encodedPath = encodeURIComponent(avatarPath);
        selectAvatarByPath(encodedPath);
    }
}

// Обратная совместимость
function selectAvatar(avatarPath) {
    const encodedPath = encodeURIComponent(avatarPath);
    selectAvatarByPath(encodedPath);
}

function initAvatarPicker() {
    const modal = document.getElementById('avatarModal');
    const closeBtn = document.getElementById('closeAvatarModal');

    if (modal && !modal.dataset.reminkoInit) {
        modal.dataset.reminkoInit = '1';
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.classList.remove('active'));
            closeBtn.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    modal.classList.remove('active');
                }
            });
        }
    }

    if (window.__reminkoAvatarDelegation) return;
    window.__reminkoAvatarDelegation = true;

    document.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.closest && t.closest('#avatarUploadBtn')) {
            e.preventDefault();
            document.getElementById('avatarFileInput')?.click();
            return;
        }
        if (t && t.closest && t.closest('#avatarGenerateBtn')) {
            e.preventDefault();
            void reminkoRunAvatarGeneration();
        }
    });

    document.addEventListener('change', async (e) => {
        const inp = e.target;
        if (!inp || inp.id !== 'avatarFileInput') return;
        const f = inp.files && inp.files[0];
        inp.value = '';
        if (!f || !String(f.type || '').startsWith('image/')) return;
        if (f.size > 8 * 1024 * 1024) {
            if (typeof showError === 'function') showError('Файл слишком большой (макс. 8 МБ)');
            return;
        }
        try {
            const dataUrl = await reminkoCompressImageToDataUrl(f, 256, 0.88);
            await applyAvatarChoice(dataUrl);
        } catch (err) {
            console.warn('[avatar upload]', err);
            if (typeof showError === 'function') showError('Не удалось обработать изображение');
        }
    });
}

// Функция прокрутки избранного аниме
function scrollAnimeFavorites(direction) {
    const grid = document.getElementById('animeFavoritesPreviewGrid');
    if (!grid) return;
    
    const user = getCurrentUserSync();
    if (!user) return;
    
    const userData = getUserData(user.id);
    if (!userData) return;
    
    const favorites = userData.favorites || [];
    const totalPages = Math.ceil(favorites.length / favoritesPerPage);
    
    if (direction === 'left') {
        if (currentFavoritesPage > 0) {
            currentFavoritesPage--;
        }
    } else {
        if (currentFavoritesPage < totalPages - 1) {
            currentFavoritesPage++;
        }
    }
    
    // Перерисовываем сетку
    renderAnimeFavoritesGrid(grid, favorites, currentFavoritesPage);
    updateAnimeFavoritesScrollButtons(favorites.length);
}

// Функция прокрутки избранного манги
function scrollMangaFavorites(direction) {
    const grid = document.getElementById('mangaFavoritesPreviewGrid');
    if (!grid) return;
    
    const user = getCurrentUserSync();
    if (!user) return;
    
    const userData = getUserData(user.id);
    if (!userData) return;
    
    const mangaFavorites = userData.mangaFavorites || [];
    const totalPages = Math.ceil(mangaFavorites.length / mangaFavoritesPerPage);
    
    if (direction === 'left') {
        if (currentMangaFavoritesPage > 0) {
            currentMangaFavoritesPage--;
        }
    } else {
        if (currentMangaFavoritesPage < totalPages - 1) {
            currentMangaFavoritesPage++;
        }
    }
    
    // Перерисовываем сетку
    renderMangaFavoritesGrid(grid, mangaFavorites, currentMangaFavoritesPage);
    updateMangaFavoritesScrollButtons(mangaFavorites.length);
}

// Рендеринг сетки избранного аниме
function renderAnimeFavoritesGrid(container, favorites, page) {
    const startIndex = page * favoritesPerPage;
    const endIndex = startIndex + favoritesPerPage;
    const pageFavorites = favorites.slice(startIndex, endIndex);
    
    container.innerHTML = pageFavorites.map(animeId => {
        const anime = getAnimeById(animeId);
        if (!anime) return '';
        const gradient = generateGradient(anime.id);
        return `
            <div class="favorite-mini-card" onclick="openAnimePage(${anime.id})" title="${anime.title}">
                <div class="favorite-mini-poster" style="background: ${gradient};">
                    <div class="favorite-mini-year">${anime.year}</div>
                </div>
                <div class="favorite-mini-title">${anime.title.length > 15 ? anime.title.substring(0, 15) + '...' : anime.title}</div>
            </div>
        `;
    }).join('');
    
    // Заполняем пустые ячейки, если нужно
    const emptyCells = favoritesPerPage - pageFavorites.length;
    for (let i = 0; i < emptyCells; i++) {
        container.innerHTML += '<div class="favorite-mini-card" style="visibility: hidden;"></div>';
    }
}

// Рендеринг сетки избранного манги
function renderMangaFavoritesGrid(container, mangaFavorites, page) {
    const startIndex = page * mangaFavoritesPerPage;
    const endIndex = startIndex + mangaFavoritesPerPage;
    const pageFavorites = mangaFavorites.slice(startIndex, endIndex);
    
    container.innerHTML = pageFavorites.map(mangaId => {
        const manga = typeof getMangaById === 'function' ? getMangaById(mangaId) : null;
        if (!manga) return '';
        const gradient = generateGradient(manga.id);
        return `
            <div class="favorite-mini-card" onclick="openMangaPage(${manga.id})" title="${manga.title}">
                <div class="favorite-mini-poster" style="background: ${gradient};">
                    <div class="favorite-mini-year">${manga.year}</div>
                </div>
                <div class="favorite-mini-title">${manga.title.length > 15 ? manga.title.substring(0, 15) + '...' : manga.title}</div>
            </div>
        `;
    }).join('');
    
    // Заполняем пустые ячейки, если нужно
    const emptyCells = mangaFavoritesPerPage - pageFavorites.length;
    for (let i = 0; i < emptyCells; i++) {
        container.innerHTML += '<div class="favorite-mini-card" style="visibility: hidden;"></div>';
    }
}

// Обновление видимости кнопок прокрутки аниме
function updateAnimeFavoritesScrollButtons(totalFavorites) {
    const leftBtn = document.getElementById('animeFavoritesScrollLeft');
    const rightBtn = document.getElementById('animeFavoritesScrollRight');
    
    if (!leftBtn || !rightBtn) return;
    
    const totalPages = Math.ceil(totalFavorites / favoritesPerPage);
    
    if (currentFavoritesPage > 0) {
        leftBtn.style.display = 'flex';
        leftBtn.style.opacity = '1';
    } else {
        leftBtn.style.display = 'none';
    }
    
    if (currentFavoritesPage < totalPages - 1) {
        rightBtn.style.display = 'flex';
        rightBtn.style.opacity = '1';
    } else {
        rightBtn.style.display = 'none';
    }
}

// Обновление видимости кнопок прокрутки манги
function updateMangaFavoritesScrollButtons(totalFavorites) {
    const leftBtn = document.getElementById('mangaFavoritesScrollLeft');
    const rightBtn = document.getElementById('mangaFavoritesScrollRight');
    
    if (!leftBtn || !rightBtn) return;
    
    const totalPages = Math.ceil(totalFavorites / mangaFavoritesPerPage);
    
    if (currentMangaFavoritesPage > 0) {
        leftBtn.style.display = 'flex';
        leftBtn.style.opacity = '1';
    } else {
        leftBtn.style.display = 'none';
    }
    
    if (currentMangaFavoritesPage < totalPages - 1) {
        rightBtn.style.display = 'flex';
        rightBtn.style.opacity = '1';
    } else {
        rightBtn.style.display = 'none';
    }
}

// Сохранение настройки
// options.silent = true — не показывать уведомление «Настройка сохранена» (если вызывающий уже показывает своё)
function saveSetting(key, value, options) {
    const user = getCurrentUserSync();
    if (!user) return;

    const userData =
        typeof ensureUserDataRecord === 'function'
            ? ensureUserDataRecord(user.id)
            : getUserData(user.id);
    if (!userData) return;
    
    if (!userData.settings) {
        userData.settings = {};
    }
    
    userData.settings[key] = value;
    updateUserData(user.id, { settings: userData.settings });
    if (!(options && options.silent) && typeof showSuccess === 'function') showSuccess('Настройка сохранена');
}

function initFavoritesScroll() {
    loadFavoritePosters();
}

async function loadFavoritePosters() {
    const cards = document.querySelectorAll('.favorite-mini-card[data-fav-title]');
    if (!cards.length) return;
    
    for (const card of cards) {
        const title = card.dataset.favTitle;
        const type = card.dataset.favType || 'anime';
        if (!title) continue;
        
        const posterEl = card.querySelector('.favorite-mini-poster');
        if (!posterEl) continue;
        
        try {
            let posterUrl = null;
            if (type === 'anime' && typeof getAnimePosterFast === 'function') {
                posterUrl = await getAnimePosterFast(title);
            } else if (type === 'manga' && typeof getMangaPosterFast === 'function') {
                posterUrl = await getMangaPosterFast(title);
            }
            
            if (posterUrl && posterUrl !== POSTER_PLACEHOLDER) {
                const img = new Image();
                img.onload = () => {
                    posterEl.style.backgroundImage = `url('${posterUrl}')`;
                    posterEl.style.backgroundSize = 'cover';
                    posterEl.style.backgroundPosition = 'center';
                };
                img.src = posterUrl;
            }
        } catch {}
    }
}

// Глобальные функции
window.openAvatarPicker = openAvatarPicker;
window.selectAvatar = selectAvatar;
window.selectAvatarByIndex = selectAvatarByIndex;
window.selectAvatarByPath = selectAvatarByPath;
window.scrollAnimeFavorites = scrollAnimeFavorites;
window.scrollMangaFavorites = scrollMangaFavorites;
window.saveSetting = saveSetting;
window.openSettingsModal = typeof openSettingsModal !== 'undefined' ? openSettingsModal : function() {};

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

/** Нормализация пути аватара (без ведущего /, без лишних пробелов). */
function reminkoNormalizeAvatarPath(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
    s = s.replace(/^\/+/, '');
    // Частый косяк кэша: "/Fons/1 b.jpg" vs "Fons/1 b.jpg"
    if (/^fons\//i.test(s)) {
        s = 'Fons/' + s.slice(5);
    }
    return s;
}

function reminkoIsRemoteOrCustomAvatar(url) {
    const s = String(url || '').trim();
    if (!s) return false;
    if (/^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return true;
    if (/googleusercontent|gravatar|supabase\.co\/storage/i.test(s)) return true;
    const norm = reminkoNormalizeAvatarPath(s);
    if (!norm) return false;
    if (reminkoIsKnownPresetAvatar(norm)) return false;
    if (/^Fons\/Creator/i.test(norm)) return false;
    // Неизвестный путь — не затирать случайным пресетом
    return true;
}

function reminkoIsKnownPresetAvatar(url) {
    const norm = reminkoNormalizeAvatarPath(url);
    if (!norm) return false;
    if (availableAvatars.includes(norm)) return true;
    // Регистр B/G у 6–15
    const lowerMap = new Map(availableAvatars.map((a) => [a.toLowerCase(), a]));
    return lowerMap.has(norm.toLowerCase());
}

function reminkoResolvePresetAvatarPath(url) {
    const norm = reminkoNormalizeAvatarPath(url);
    if (!norm) return '';
    if (availableAvatars.includes(norm)) return norm;
    const hit = availableAvatars.find((a) => a.toLowerCase() === norm.toLowerCase());
    return hit || norm;
}

/** Мгновенный каркас профиля из session — без ожидания Supabase/каталога */
function reminkoPaintProfileShell(userData, isViewMode) {
    const container = document.getElementById('profileContainer');
    if (!container || !userData) return;
    const name = String(userData.username || 'Пользователь').replace(/[<>&]/g, '');
    const rawAv = reminkoNormalizeAvatarPath(userData.avatar);
    // Не рисуем дефолт Fons/1, если аватар ещё неизвестен — меньше мигания
    const hasRealAv = !!(rawAv && rawAv !== 'Fons/1 b.jpg');
    const av = hasRealAv
        ? typeof reminkoResolveAssetUrl === 'function'
            ? reminkoResolveAssetUrl(rawAv)
            : rawAv
        : '';
    const avCss = String(av).replace(/'/g, "\\'");
    const avStyle = avCss
        ? `background-image:url('${avCss}');background-size:cover;background-position:center;background-color:#2a2a32`
        : 'background-color:#2a2a32';
    container.innerHTML = `
        <div class="profile-modern profile-modern--shell">
            <div class="profile-top">
                <div class="profile-avatar-wrap">
                    <div class="profile-avatar" style="${avStyle}"></div>
                </div>
                <div class="profile-head-main">
                    <h1 class="profile-name">${name}</h1>
                    <p class="profile-email">${isViewMode ? 'Профиль пользователя' : 'Ваш профиль'}</p>
                </div>
            </div>
            <div class="profile-tabs" aria-hidden="true">
                <button type="button" class="profile-tab-btn active">Обзор</button>
                <button type="button" class="profile-tab-btn">Избранное</button>
            </div>
            <div class="profile-section profile-shell-hint">Открываем профиль…</div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Проверяем параметр user из URL
    const urlParams = new URLSearchParams(window.location.search);
    const userIdFromUrl = (urlParams.get('user') || urlParams.get('id') || '').trim();

    if (userIdFromUrl) {
        // Загружаем профиль другого пользователя
        await loadUserProfile(userIdFromUrl);
    } else {
        // Сразу рисуем каркас из кэша сессии — без «Загрузка профиля…»
        const syncUser = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
        if (syncUser && syncUser.id) {
            reminkoPaintProfileShell(syncUser, false);
            if (typeof hideLoading === 'function') hideLoading();
        }

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
            avatar: isCreator
                ? 'Fons/Creator ava.png'
                : reminkoNormalizeAvatarPath(profile.avatar) || 'Fons/1 b.jpg',
            gender: profile.gender || 'male',
            registerDate: profile.created_at || null,
            isSiteCreator: isCreator
        };

        // Сразу каркас с реальным аватаром из profiles — без мигания дефолта
        reminkoPaintProfileShell(userData, true);
        
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
        avatar: reminkoNormalizeAvatarPath(user.avatar) || 'Fons/1 b.jpg',
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
            avatar:
                reminkoNormalizeAvatarPath(user.avatar) ||
                reminkoNormalizeAvatarPath(localData.avatar) ||
                'Fons/1 b.jpg',
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
                finalUserData.avatar =
                    reminkoNormalizeAvatarPath(profile.avatar) || finalUserData.avatar;
                finalUserData.gender = profile.gender || finalUserData.gender;
                if (profile.created_at) finalUserData.registerDate = profile.created_at;
            }
        } catch (err) {
            console.error('Ошибка загрузки профиля из Supabase:', err);
        }
    }

    // Выгрузить локальные избранные/историю в облако (чужие профили + счётчик)
    if (typeof loadFavorites === 'function') {
        try {
            await loadFavorites(true);
        } catch (_) {
            /* ignore */
        }
    }
    if (typeof reminkoPushLocalWatchHistoryToSupabase === 'function') {
        reminkoPushLocalWatchHistoryToSupabase(user.id);
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

    // Сразу показываем каркас — не ждём VIP/друзей/каталог
    reminkoPaintProfileShell(userData, isViewMode);
    if (typeof hideLoading === 'function') hideLoading();
    
    // ID профиля, который смотрим
    const profileUserId = userData.id;
    const isUUIDFormat = profileUserId && isUUID(profileUserId.toString());

    // Для своего профиля — sync-кэш, без лишнего await getCurrentUser
    const currentUser = !isViewMode
        ? typeof getCurrentUserSync === 'function'
            ? getCurrentUserSync()
            : null
        : null;
    const ownUserId = currentUser ? currentUser.id : userData.id;

    let userAchievements = [];
    let vipSubscription = null;
    let friendsList = [];
    let friendProfiles = [];

    const achievementsPromise =
        !isViewMode &&
        ownUserId &&
        isUUID(ownUserId.toString()) &&
        typeof window.achievementsService !== 'undefined'
            ? window.achievementsService.getUserAchievements(ownUserId).catch(() => [])
            : Promise.resolve([]);

    const socialPromise = (async () => {
        if (!isUUIDFormat || typeof supabaseClient === 'undefined' || !supabaseClient) {
            return { vip: null, friends: [], profiles: [] };
        }
        try {
            const [{ data: vipData }, { data: friendsData }] = await Promise.all([
                supabaseClient
                    .from('vip_subscriptions')
                    .select('*')
                    .eq('user_id', profileUserId)
                    .eq('is_active', true)
                    .maybeSingle(),
                supabaseClient
                    .from('friends')
                    .select('*')
                    .or(`user_id.eq.${profileUserId},friend_id.eq.${profileUserId}`)
                    .eq('status', 'accepted')
            ]);
            const friends = friendsData || [];
            let profiles = [];
            if (friends.length > 0) {
                const friendIds = friends
                    .map((f) => (f.user_id === profileUserId ? f.friend_id : f.user_id))
                    .filter(Boolean);
                const { data: p } = await supabaseClient
                    .from('profiles')
                    .select('id, username, avatar')
                    .in('id', friendIds);
                profiles = p || [];
            }
            return { vip: vipData || null, friends, profiles };
        } catch (error) {
            console.error('Ошибка загрузки данных из Supabase:', error);
            return { vip: null, friends: [], profiles: [] };
        }
    })();

    const [achievementsResult, socialResult] = await Promise.all([
        achievementsPromise,
        socialPromise
    ]);
    userAchievements = achievementsResult || [];
    vipSubscription = socialResult.vip;
    friendsList = socialResult.friends;
    friendProfiles = socialResult.profiles;

    if (!isViewMode) {
        currentUserAchievements = userAchievements;
        currentUserGender = userData.gender || 'male';
        currentUserAvatars = await getAvailableAvatarsForUser(
            ownUserId,
            currentUserGender,
            userAchievements
        );
    }

    const registerDate = userData.registerDate ? new Date(userData.registerDate).toLocaleDateString('ru-RU') : 'Неизвестно';

    // Избранное — ждём каталог коротко, чтобы постеры/названия были у чужих профилей
    let favoritesAnime = [];
    let favoritesManga = [];
    try {
        if (typeof window.KodikCatalogStore?.load === 'function') {
            await Promise.race([
                window.KodikCatalogStore.load(),
                new Promise((r) => setTimeout(r, 4500))
            ]);
        }
    } catch (_) {
        /* ignore */
    }

    const resolveFavAnime = (rawId) => {
        const id = parseInt(rawId, 10);
        if (Number.isNaN(id)) return null;
        let anime = typeof getAnimeById === 'function' ? getAnimeById(id) : null;
        if (!anime && typeof window.KodikCatalogStore?.getById === 'function') {
            anime =
                window.KodikCatalogStore.getById(id) ||
                window.KodikCatalogStore.getById(String(id));
        }
        if (!anime) {
            return { id, title: 'Аниме #' + id, year: '', posterUrl: null };
        }
        return typeof initAnimeStats === 'function' ? initAnimeStats(anime) : anime;
    };

    let animeIds = [];
    let mangaIds = [];
    if (supabaseClient && profileUserId) {
        try {
            const { data: favAnime, error: favErr } = await supabaseClient
                .from('favorites_anime')
                .select('anime_id')
                .eq('user_id', profileUserId);
            if (favErr) console.warn('[profile] favorites_anime:', favErr);
            if (Array.isArray(favAnime)) {
                animeIds = favAnime.map((f) => f && f.anime_id).filter((id) => id != null);
            }
            const { data: favManga } = await supabaseClient
                .from('favorites_manga')
                .select('manga_id')
                .eq('user_id', profileUserId);
            if (Array.isArray(favManga)) {
                mangaIds = favManga.map((f) => f && f.manga_id).filter((id) => id != null);
            }
        } catch (_) {}
    }
    if (!isViewMode) {
        if (typeof loadFavorites === 'function') {
            try {
                await loadFavorites(true);
            } catch (_) {}
        }
        if (typeof getFavoriteAnimeIds === 'function') {
            const localIds = getFavoriteAnimeIds() || [];
            const merged = new Set([
                ...animeIds.map(String),
                ...localIds.map(String)
            ]);
            animeIds = [...merged];
        } else if (!animeIds.length) {
            animeIds = userData.favorites || [];
        }
    }
    if (!mangaIds.length && !isViewMode) {
        mangaIds = userData.mangaFavorites || [];
    }

    favoritesAnime = animeIds.map(resolveFavAnime).filter(Boolean);
    favoritesManga = mangaIds
        .map((id) => (typeof getMangaById === 'function' ? getMangaById(parseInt(id, 10)) : null))
        .filter(Boolean);
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

    await Promise.all([
        typeof reminkoEnsureSiteCreatorUserIdCached === 'function'
            ? reminkoEnsureSiteCreatorUserIdCached().catch(() => {})
            : Promise.resolve(),
        typeof reminkoPrefetchTeamRoles === 'function'
            ? reminkoPrefetchTeamRoles([profileUserId]).catch(() => {})
            : Promise.resolve()
    ]);
    const profileTeamRole =
        typeof reminkoResolveProfileTeamRole === 'function'
            ? reminkoResolveProfileTeamRole(userData, profileUserId)
            : null;

    let avatarUrl = isCreatorAccount
        ? 'Fons/Creator ava.png'
        : reminkoNormalizeAvatarPath(userData.avatar) || 'Fons/1 b.jpg';
    if (reminkoIsKnownPresetAvatar(avatarUrl)) {
        avatarUrl = reminkoResolvePresetAvatarPath(avatarUrl);
    }
    if (!isViewMode) {
        const userAvatars = currentUserAvatars.length > 0 ? currentUserAvatars : availableAvatars;
        const isCustom = reminkoIsRemoteOrCustomAvatar(avatarUrl);
        const inPresets =
            userAvatars.includes(avatarUrl) || reminkoIsKnownPresetAvatar(avatarUrl);
        // Не перезаписывать Google/HTTPS/кастом и валидные пресеты случайным Fons
        if (!isCreatorAccount && !avatarUrl) {
            avatarUrl = getRandomAvatar();
            updateUserData(userData.id, { avatar: avatarUrl });
        } else if (!isCreatorAccount && !isCustom && !inPresets && /^Fons\//i.test(avatarUrl)) {
            // Битый путь пресета (регистр/слеш) — попробуем починить, иначе оставить как есть
            const fixed = reminkoResolvePresetAvatarPath(avatarUrl);
            if (reminkoIsKnownPresetAvatar(fixed)) {
                avatarUrl = fixed;
            }
        }
    }
    const avatarUrlCss =
        typeof reminkoResolveAssetUrl === 'function' ? reminkoResolveAssetUrl(avatarUrl) : avatarUrl;
    /* Как у всех: круг 150×150 из CSS, cover + center — без 92% / 18%, иначе «плывёт» круг */
    const avatarStyle = `background-image: url('${avatarUrlCss.replace(/'/g, "\\'")}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;

    function formatWatchMinutes(totalMinutes) {
        const m = Math.max(0, parseInt(totalMinutes, 10) || 0);
        if (m >= 60) {
            const hours = Math.floor(m / 60);
            const mins = m % 60;
            return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
        }
        return `${m} мин`;
    }

    // Время просмотра: свой = local ∪ Supabase; чужой = Supabase
    let watchTimeLabel = '0 мин';
    const uniqueEpisodes = new Set();
    const uniqueChapters = new Set();

    if (!isViewMode) {
        const watchHistory = userData.watchHistory || [];
        watchHistory.forEach((entry) => {
            if (entry.type === 'manga') {
                uniqueChapters.add(
                    `${entry.mangaId || entry.animeId}-${entry.chapterNumber || entry.episodeNumber}`
                );
            } else {
                uniqueEpisodes.add(`${entry.animeId}-${entry.episodeNumber}`);
            }
        });
    }

    if (isUUIDFormat && supabaseClient) {
        try {
            const { data: watchedRows } = await supabaseClient
                .from('watch_history')
                .select('anime_id, episode_number')
                .eq('user_id', profileUserId);
            (watchedRows || []).forEach((row) => {
                uniqueEpisodes.add(`${row.anime_id}-${row.episode_number}`);
            });
        } catch (_) {
            /* ignore */
        }
    }

    watchTimeLabel = formatWatchMinutes(uniqueEpisodes.size * 24 + uniqueChapters.size * 5);
    if (isCreatorAccount) {
        watchTimeLabel = 'Несколько лет';
    }

    const profileName = userData.username || 'Пользователь';

    function renderFavTiles(items, type) {
        return (items || []).map((item) => {
            const gradient =
                typeof generateGradient === 'function'
                    ? generateGradient(item.id)
                    : 'linear-gradient(135deg, #6c5ce7, #a29bfe)';
            const poster =
                item.posterUrl ||
                (item.images && item.images.jpg && item.images.jpg.image_url) ||
                '';
            const posterStyle = poster
                ? `background-image:url('${String(poster).replace(/'/g, "\\'")}');background-size:cover;background-position:center;`
                : `background: ${gradient};`;
            const onclick =
                type === 'anime' ? `openAnimePage(${item.id})` : `openMangaPage(${item.id})`;
            const title = item.title || '';
            const shortTitle = title.length > 15 ? title.substring(0, 15) + '...' : title;
            const searchTitle = item.titleAlt || item.title || '';
            const malAttr =
                type === 'anime' && item.mal_id != null && Number(item.mal_id) > 0
                    ? ` data-fav-mal-id="${String(item.mal_id).replace(/"/g, '')}"`
                    : '';
            return `<div class="favorite-mini-card" onclick="${onclick}" title="${title.replace(/"/g, '&quot;')}" data-fav-type="${type}" data-fav-title="${searchTitle.replace(/"/g, '&quot;')}"${malAttr}>
                <div class="favorite-mini-poster" style="${posterStyle}">
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
                        ${
                            favoritesAnime.length > 0
                                ? `<a href="favorites.html${isViewMode ? '?user=' + encodeURIComponent(profileUserId) : ''}" class="btn btn-primary btn-sm">Все избранное</a>`
                                : ''
                        }
                    </div>
                    ${favoritesAnime.length > 0 ? `
                        <div class="favorites-tiles-scroll" tabindex="0" role="region" aria-label="Избранные аниме, листайте вбок">
                            <div class="favorites-tiles-row">${renderFavTiles(favoritesAnime, 'anime')}</div>
                        </div>
                    ` : `<div class="empty-favorites"><p>${isViewMode ? 'Нет избранных аниме' : 'У вас пока нет избранных аниме'}</p></div>`}
                </div>
                <div class="profile-section">
                    <div class="profile-section-header">
                        <h2 class="section-title">${isViewMode ? `Избранная манга ${profileName}` : 'Избранная манга'}</h2>
                        ${
                            !isViewMode && favoritesManga.length > 0
                                ? '<a href="favorites-manga.html" class="btn btn-primary btn-sm">Все избранное</a>'
                                : ''
                        }
                    </div>
                    ${favoritesManga.length > 0 ? `
                        <div class="favorites-tiles-scroll" tabindex="0" role="region" aria-label="Избранная манга, листайте вбок">
                            <div class="favorites-tiles-row">${renderFavTiles(favoritesManga, 'manga')}</div>
                        </div>
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
                    <p class="vip-coming-soon-lead">Скоро появятся VIP-подписки. Оплата пока недоступна.</p>
                    <div class="vip-cards-grid">
                        <div class="vip-card vip-card-watch vip-card-soon">
                            <div class="vip-card-media">
                                <img src="Fons/vip Prosmotr vmeste for strite.jpg" alt="VIP Смотреть вместе" loading="lazy" decoding="async">
                                <span class="vip-soon-badge">Скоро</span>
                            </div>
                            <h3 class="vip-card-title">VIP Смотреть вместе</h3>
                            <p class="vip-card-desc">Создание комнат совместного просмотра и расширенные лимиты — в скором обновлении.</p>
                            <button type="button" class="btn btn-secondary vip-card-btn" disabled>Скоро</button>
                        </div>
                        <div class="vip-card vip-card-ai vip-card-soon">
                            <div class="vip-card-media">
                                <img src="Fons/vip Minko Ai for strite.jpg" alt="VIP Minko AI" loading="lazy" decoding="async">
                                <span class="vip-soon-badge">Скоро</span>
                            </div>
                            <h3 class="vip-card-title">VIP Minko AI</h3>
                            <p class="vip-card-desc">Расширенный доступ к Minko AI — появится вместе с VIP на просмотр.</p>
                            <button type="button" class="btn btn-secondary vip-card-btn" disabled>Скоро</button>
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
                <p class="avatar-modal-lead">Выберите пресет из списка.</p>
                <div class="avatar-modal-toolbar-reminko avatar-modal-toolbar-reminko--dev">
                    <p class="avatar-gen-quota" style="margin:0;">Загрузка фото и генерация ИИ — в разработке.</p>
                </div>
                <div id="avatarGrid" class="avatar-grid"></div>
            </div>
        </div>` : ''}
    `;
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    initProfileTabs(tabParam);
    initFavoritesTilesDragScroll();
}

/** Свайп/drag по постерам в горизонтальном избранном */
function initFavoritesTilesDragScroll() {
    if (typeof reminkoEnhanceHorizontalDragScroll !== 'function') return;
    document.querySelectorAll('.favorites-tiles-scroll').forEach((el) => {
        if (el.dataset.dragScrollBound === '1') return;
        el.dataset.dragScrollBound = '1';
        reminkoEnhanceHorizontalDragScroll(el, { linkSelector: '.favorite-mini-card' });
    });
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
        if (typeof showError === 'function') showError('ИИ-аватар временно недоступен. Попробуйте позже.');
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
            // Только реальный жест пользователя по кнопке (не синтетический клик)
            if (!e.isTrusted) return;
            e.preventDefault();
            e.stopPropagation();
            const modal = document.getElementById('avatarModal');
            if (modal && !modal.classList.contains('active')) return;
            const inp = document.getElementById('avatarFileInput');
            if (!inp) return;
            inp.setAttribute('tabindex', '-1');
            inp.setAttribute('aria-hidden', 'true');
            inp.style.pointerEvents = 'none';
            inp.click();
            return;
        }
        if (t && t.closest && t.closest('#avatarGenerateBtn')) {
            if (!e.isTrusted) return;
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
    const cards = document.querySelectorAll('.favorite-mini-card[data-fav-title], .favorite-mini-card[data-fav-mal-id]');
    if (!cards.length) return;
    
    for (const card of cards) {
        const title = card.dataset.favTitle;
        const type = card.dataset.favType || 'anime';
        const mal = parseInt(card.dataset.favMalId, 10);
        
        const posterEl = card.querySelector('.favorite-mini-poster');
        if (!posterEl) continue;
        
        try {
            let posterUrl = null;
            if (
                type === 'anime' &&
                Number.isFinite(mal) &&
                mal > 0 &&
                typeof fetchPosterUrlForMal === 'function'
            ) {
                posterUrl = await fetchPosterUrlForMal(mal, {
                    mal_id: mal,
                    title,
                    titleAlt: title,
                });
            } else if (type === 'anime' && title && typeof getAnimePosterFast === 'function') {
                posterUrl = await getAnimePosterFast(title);
            } else if (type === 'manga' && title && typeof getMangaPosterFast === 'function') {
                posterUrl = await getMangaPosterFast(title);
            }

            const weak =
                typeof isWeakPosterSource === 'function' ? isWeakPosterSource(posterUrl) : !posterUrl;
            const ph = typeof POSTER_PLACEHOLDER !== 'undefined' ? POSTER_PLACEHOLDER : '';
            
            if (posterUrl && posterUrl !== ph && !weak) {
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

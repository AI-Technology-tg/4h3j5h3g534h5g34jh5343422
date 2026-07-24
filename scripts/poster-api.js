// Система быстрой загрузки постеров с несколькими API
// Kitsu API - основной (без CORS, без лимитов)
// Jikan API - резервный (с rate limiting)

// ==================== НАСТРОЙКИ ====================
const POSTER_CACHE_KEY_V3 = 'poster_cache_v3';
const POSTER_CACHE_MAX_SIZE = 1000;
const POSTER_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 дней

// Placeholder изображение (экспорт для profile, watch-together и др.)
const POSTER_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="400"%3E%3Crect width="300" height="400" fill="%23333"/%3E%3Ctext x="50%25" y="50%25" font-family="Arial" font-size="18" fill="%23666" text-anchor="middle" dominant-baseline="middle"%3EЗагрузка...%3C/text%3E%3C/svg%3E';
window.POSTER_PLACEHOLDER = POSTER_PLACEHOLDER;

// ==================== КЭШИРОВАНИЕ ====================
const posterMemoryCache = new Map();

function getPosterCacheV3() {
    try {
        const data = localStorage.getItem(POSTER_CACHE_KEY_V3);
        if (!data) return {};
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

function savePosterToCacheV3(key, url) {
    if (!key || !url) return;
    try {
        const cache = getPosterCacheV3();
        cache[key] = { url, ts: Date.now() };
        
        // Ограничиваем размер кэша
        const keys = Object.keys(cache);
        if (keys.length > POSTER_CACHE_MAX_SIZE) {
            const sorted = keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
            sorted.slice(0, 200).forEach(k => delete cache[k]);
        }
        
        localStorage.setItem(POSTER_CACHE_KEY_V3, JSON.stringify(cache));
        posterMemoryCache.set(key, url);
    } catch (e) {
        // Игнорируем ошибки кэша
    }
}

function getPosterFromCacheV3(key) {
    if (!key) return null;
    
    // Сначала проверяем память (мгновенно)
    if (posterMemoryCache.has(key)) {
        return posterMemoryCache.get(key);
    }
    
    try {
        const cache = getPosterCacheV3();
        const entry = cache[key];
        if (entry && entry.url && (Date.now() - entry.ts) < POSTER_CACHE_TTL) {
            posterMemoryCache.set(key, entry.url);
            return entry.url;
        }
    } catch (e) {}
    return null;
}

// ==================== KITSU API ====================
// Бесплатный API без ограничений, без CORS проблем
async function fetchFromKitsu(title, type = 'anime') {
    try {
        const endpoint = type === 'manga' 
            ? 'https://kitsu.io/api/edge/manga'
            : 'https://kitsu.io/api/edge/anime';
        
        const url = `${endpoint}?filter[text]=${encodeURIComponent(title)}&page[limit]=1`;
        
        const response = await fetch(url, {
            headers: { 'Accept': 'application/vnd.api+json' }
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.data && data.data.length > 0) {
            const item = data.data[0];
            const posterImage = item.attributes?.posterImage;
            if (posterImage) {
                return posterImage.large || posterImage.medium || posterImage.original || posterImage.small;
            }
        }
    } catch (e) {
        // Тихо игнорируем ошибки
    }
    return null;
}

// ==================== JIKAN API с Rate Limiting ====================
// MyAnimeList API - резервный, с контролем частоты запросов
let jikanLastRequest = 0;
const JIKAN_MIN_DELAY = 1500; // Минимум 1.5 сек между запросами
const jikanQueue = [];
let jikanProcessing = false;

async function processJikanQueue() {
    if (jikanProcessing || jikanQueue.length === 0) return;
    jikanProcessing = true;
    
    while (jikanQueue.length > 0) {
        const { title, type, resolve } = jikanQueue.shift();
        
        // Ждём минимальную задержку
        const now = Date.now();
        const waitTime = Math.max(0, JIKAN_MIN_DELAY - (now - jikanLastRequest));
        if (waitTime > 0) {
            await new Promise(r => setTimeout(r, waitTime));
        }
        
        try {
            const endpoint = type === 'manga'
                ? 'https://api.jikan.moe/v4/manga'
                : 'https://api.jikan.moe/v4/anime';
            
            const url = `${endpoint}?q=${encodeURIComponent(title)}&limit=1&sfw=true`;
            jikanLastRequest = Date.now();
            
            const response = await fetch(url);
            
            if (response.status === 429) {
                // Too Many Requests - ждём дольше
                await new Promise(r => setTimeout(r, 5000));
                jikanQueue.unshift({ title, type, resolve }); // Возвращаем в очередь
                continue;
            }
            
            if (!response.ok) {
                resolve(null);
                continue;
            }
            
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                const item = data.data[0];
                const images = item.images?.jpg;
                if (images) {
                    resolve(images.large_image_url || images.image_url);
                    continue;
                }
            }
            resolve(null);
        } catch (e) {
            resolve(null);
        }
    }
    
    jikanProcessing = false;
}

function fetchFromJikan(title, type = 'anime') {
    return new Promise(resolve => {
        jikanQueue.push({ title, type, resolve });
        processJikanQueue();
    });
}

// ==================== ANILIST BY MAL ID ====================
// Клиентский AniList отключён: рейтлимит/WAF отдаёт ответы без CORS → лавина ошибок.
async function fetchAnilistPosterByMalId(/* malId */) {
    return '';
}

// ==================== ГЛАВНАЯ ФУНКЦИЯ ====================
/**
 * Получить постер - сначала Kitsu (быстрый), потом Jikan (резервный)
 * @param {string} title - Название аниме/манги
 * @param {string} type - 'anime' или 'manga'
 * @returns {Promise<string>} URL постера
 */
async function getPosterFast(title, type = 'anime') {
    if (!title) return POSTER_PLACEHOLDER;
    
    // Нормализуем название для кэша
    const cacheKey = `${type}:${title.toLowerCase().trim()}`;
    
    // 1. Проверяем кэш (мгновенно)
    const cached = getPosterFromCacheV3(cacheKey);
    if (cached) return cached;
    
    // 2. Пробуем Kitsu (основной, быстрый, без лимитов)
    let poster = await fetchFromKitsu(title, type);
    
    // 3. Если Kitsu не нашёл - пробуем Jikan (с rate limiting)
    if (!poster) {
        poster = await fetchFromJikan(title, type);
    }
    
    // 4. Сохраняем в кэш если нашли
    if (poster) {
        savePosterToCacheV3(cacheKey, poster);
        return poster;
    }
    
    return POSTER_PLACEHOLDER;
}

/**
 * Получить постер аниме
 * @param {string|Array<string>} title - Название или массив названий
 * @returns {Promise<string>} URL постера
 */
async function getAnimePosterFast(title) {
    // Если массив - пробуем каждое название
    if (Array.isArray(title)) {
        for (const t of title) {
            const poster = await getPosterFast(t, 'anime');
            if (poster && poster !== POSTER_PLACEHOLDER) {
                return poster;
            }
        }
        return POSTER_PLACEHOLDER;
    }
    return getPosterFast(title, 'anime');
}

/**
 * Получить постер манги
 * @param {string|Array<string>} title - Название или массив названий
 * @returns {Promise<string>} URL постера
 */
async function getMangaPosterFast(title) {
    if (Array.isArray(title)) {
        for (const t of title) {
            const poster = await getPosterFast(t, 'manga');
            if (poster && poster !== POSTER_PLACEHOLDER) {
                return poster;
            }
        }
        return POSTER_PLACEHOLDER;
    }
    return getPosterFast(title, 'manga');
}

// ==================== ПАКЕТНАЯ ЗАГРУЗКА ====================
/**
 * Загрузить постеры для нескольких элементов параллельно
 * @param {Array<{title: string, titleAlt?: string}>} items - Массив элементов
 * @param {string} type - 'anime' или 'manga'
 * @param {number} concurrency - Количество параллельных запросов
 * @returns {Promise<Map<string, string>>} Map название -> URL постера
 */
async function batchLoadPosters(items, type = 'anime', concurrency = 6) {
    const results = new Map();
    const queue = [...items];
    const workers = [];
    
    async function worker() {
        while (queue.length > 0) {
            const item = queue.shift();
            if (!item) continue;
            
            const title = item.titleAlt || item.title;
            const cacheKey = title.toLowerCase().trim();
            
            // Проверяем кэш сначала
            const cached = getPosterFromCacheV3(`${type}:${cacheKey}`);
            if (cached) {
                results.set(cacheKey, cached);
                continue;
            }
            
            // Загружаем
            const poster = await getPosterFast(title, type);
            results.set(cacheKey, poster);
        }
    }
    
    // Запускаем workers параллельно
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
    }
    
    await Promise.all(workers);
    return results;
}

// ==================== ЭКСПОРТ ====================
window.getPosterFromCacheV3 = getPosterFromCacheV3;
window.fetchAnilistPosterByMalId = fetchAnilistPosterByMalId;
window.getPosterFast = getPosterFast;
window.getAnimePosterFast = getAnimePosterFast;
window.getMangaPosterFast = getMangaPosterFast;
window.batchLoadPosters = batchLoadPosters;
window.POSTER_PLACEHOLDER = POSTER_PLACEHOLDER;

// Для обратной совместимости
window.fastGetAnimePoster = getAnimePosterFast;
window.fastGetMangaPoster = getMangaPosterFast;

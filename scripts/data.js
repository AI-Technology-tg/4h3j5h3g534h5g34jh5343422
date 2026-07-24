// База данных аниме
const animeDatabase = {
    all: []
};


// Кэш для пользовательских аниме
let customAnimeCache = null;
let customAnimeCacheTime = 0;
const CUSTOM_ANIME_CACHE_DURATION = 5 * 60 * 1000; // 5 минут

// Получить пользовательские аниме из Supabase (или localStorage как fallback)
async function getCustomAnimeFromStorage() {
    // Проверяем кэш
    if (customAnimeCache && Date.now() - customAnimeCacheTime < CUSTOM_ANIME_CACHE_DURATION) {
        return customAnimeCache;
    }
    
    // Пытаемся загрузить из Supabase
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('custom_anime')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            const result = (data || []).map(item => ({
                id: item.id,
                title: item.title || item.title_ru || '',
                titleAlt: item.title_alt || item.title_en || item.title || '',
                rating: item.rating || 0,
                year: item.year || new Date().getFullYear(),
                genres: item.genres || [],
                episodes: item.episodes || '',
                totalEpisodes: item.total_episodes || 0,
                status: item.status || 'Онгоинг',
                type: item.type || 'Сериал',
                description: item.description || '',
                studio: item.studio || ''
            }));
            
            customAnimeCache = result;
            customAnimeCacheTime = Date.now();
            return result;
        } catch (e) {
            console.error('[Data] Ошибка загрузки пользовательских аниме из Supabase:', e);
        }
    }
    
    // Fallback: загружаем из localStorage
    try {
        const data = localStorage.getItem('customAnimeDatabase');
        const result = data ? JSON.parse(data) : [];
        customAnimeCache = result;
        customAnimeCacheTime = Date.now();
        return result;
    } catch (e) {
        console.error('[Data] Ошибка загрузки пользовательских аниме из localStorage:', e);
        return [];
    }
}

// Синхронная версия (использует кэш)
function getCustomAnimeFromStorageSync() {
    if (customAnimeCache) {
        return customAnimeCache;
    }
    
    // Fallback: загружаем из localStorage
    try {
        const data = localStorage.getItem('customAnimeDatabase');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Локальные карточки Jikan (localStorage) + глобальный каталог с сервера (catalog_site_anime).
 * При совпадении mal_id приоритет у данных с сервера.
 */
function getMergedJikanVirtualRows() {
    if (typeof window === 'undefined') return [];
    const byMal = new Map();
    for (const row of window.__JIKAN_VIRTUAL_ROWS || []) {
        if (row && row.mal_id != null) byMal.set(Number(row.mal_id), row);
    }
    for (const row of window.__SITE_CATALOG_JIKAN_ROWS || []) {
        if (row && row.mal_id != null) byMal.set(Number(row.mal_id), row);
    }
    return [...byMal.values()];
}

function getJikanVirtualAnimeList() {
    if (typeof window === 'undefined') return [];
    const out = [];
    for (const row of getMergedJikanVirtualRows()) {
        const a = jikanRowToVirtualAnime(row);
        if (a) out.push(a);
    }
    return out;
}

/** Нормализация для дедупа «то же тайтл» (база сайта vs виртуальная карточка Jikan). */
function normalizeAnimeDedupeKey(s) {
    if (!s || typeof s !== 'string') return '';
    let t = s.toLowerCase().trim();
    try {
        t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {
        /* ignore */
    }
    return t
        .replace(/[^a-zа-яё0-9\u3040-\u30ff\u4e00-\u9fff]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildBaseTitleKeysForVirtualDedupe(...lists) {
    const keys = new Set();
    const scan = (a) => {
        if (!a || a.isJikanVirtual === true) return;
        const k1 = normalizeAnimeDedupeKey(a.title || '');
        const k2 = normalizeAnimeDedupeKey(a.titleAlt || '');
        if (k1.length >= 3) keys.add(k1);
        if (k2.length >= 3) keys.add(k2);
    };
    for (const list of lists) {
        (list || []).forEach(scan);
    }
    return keys;
}

function shouldSkipVirtualAnimeAsDuplicate(anime, baseKeys) {
    if (!anime || !baseKeys || baseKeys.size === 0) return false;
    const raw = anime._jikanRaw && typeof anime._jikanRaw === 'object' ? anime._jikanRaw : null;
    const candidates = [
        anime.titleAlt,
        anime.title,
        raw && raw.title_english,
        raw && raw.title,
        raw && raw.title_japanese
    ];
    for (const c of candidates) {
        const k = normalizeAnimeDedupeKey(c || '');
        if (k.length >= 3 && baseKeys.has(k)) return true;
    }
    return false;
}

/**
 * Свести строку к латинице для поиска: кириллица «е/ё» совпадает с латинской «e» и т.д.
 */
function reminkoFoldForSearch(s) {
    if (!s || typeof s !== 'string') return '';
    const map = {
        а: 'a',
        б: 'b',
        в: 'v',
        г: 'g',
        д: 'd',
        е: 'e',
        ё: 'e',
        ж: 'zh',
        з: 'z',
        и: 'i',
        й: 'j',
        к: 'k',
        л: 'l',
        м: 'm',
        н: 'n',
        о: 'o',
        п: 'p',
        р: 'r',
        с: 's',
        т: 't',
        у: 'u',
        ф: 'f',
        х: 'h',
        ц: 'c',
        ч: 'ch',
        ш: 'sh',
        щ: 'sch',
        ъ: '',
        ы: 'y',
        ь: '',
        э: 'e',
        ю: 'yu',
        я: 'ya'
    };
    let out = '';
    const low = s.toLowerCase();
    for (let i = 0; i < low.length; i++) {
        const ch = low[i];
        out += Object.prototype.hasOwnProperty.call(map, ch) ? map[ch] : ch;
    }
    try {
        out = out.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {
        /* ignore */
    }
    return out;
}

/** Пунктуация и лишние пробелы убираются — «Re: Zero» ≈ «re zero». */
function reminkoNormalizeSearchText(s) {
    if (!s || typeof s !== 'string') return '';
    let t = reminkoFoldForSearch(s.toLowerCase());
    t = t.replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
}

function textMatchesSearchQuery(haystack, queryLower) {
    if (!queryLower) return true;
    if (haystack == null || haystack === '') return false;
    const h = String(haystack);
    const hl = h.toLowerCase();
    if (hl.includes(queryLower)) return true;
    const fq = reminkoFoldForSearch(queryLower);
    const fh = reminkoFoldForSearch(h);
    if (fq && fh.includes(fq)) return true;

    const nq = reminkoNormalizeSearchText(queryLower);
    const nh = reminkoNormalizeSearchText(h);
    if (!nq) return false;
    if (nh.includes(nq)) return true;

    const tokens = nq.split(' ').filter((tok) => tok.length >= 2);
    if (tokens.length > 1) {
        return tokens.every((tok) => nh.includes(tok));
    }
    return false;
}

function forEachJikanSearchTitle(raw, fn) {
    if (!raw || typeof raw !== 'object' || typeof fn !== 'function') return;
    const add = (x) => {
        if (x != null && String(x).trim()) fn(String(x));
    };
    add(raw.title);
    add(raw.title_english);
    add(raw.title_japanese);
    if (Array.isArray(raw.titles)) {
        for (const x of raw.titles) {
            if (x && x.title) add(x.title);
        }
    }
}

function getKodikCatalogAnimeList() {
    if (typeof window !== 'undefined' && window.KodikCatalogStore && typeof window.KodikCatalogStore.getAll === 'function') {
        return window.KodikCatalogStore.getAll();
    }
    return [];
}

function mergeAnimeListsUniqueById(lists) {
    const seenIds = new Map();
    const uniqueAnime = [];
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const anime of list) {
            const id = parseInt(anime.id, 10);
            if (Number.isNaN(id) || seenIds.has(id)) continue;
            seenIds.set(id, true);
            uniqueAnime.push(anime);
        }
    }
    return uniqueAnime;
}

function dedupeAnimeByMalId(animeList) {
    const byMal = new Map();
    const noMal = [];
    const priority = (a) => {
        if (a && a.isSiteCatalog) return 5;
        if (a && a.isJikanVirtual) return 4;
        if (a && a.isKodikCatalog) return 3;
        if (a && a.isCustom) return 2;
        return 1;
    };
    for (const a of animeList) {
        const mal = a.mal_id != null ? parseInt(a.mal_id, 10) : a._jikanRaw?.mal_id != null ? parseInt(a._jikanRaw.mal_id, 10) : null;
        if (mal == null || Number.isNaN(mal)) {
            noMal.push(a);
            continue;
        }
        const key =
            a && a.isKodikCatalog
                ? `k:${mal}:${a.type || ''}`
                : `m:${mal}`;
        const prev = byMal.get(key);
        if (!prev || priority(a) > priority(prev)) byMal.set(key, a);
    }
    return [...byMal.values(), ...noMal];
}

function getAllAnime() {
    const customAnime = getCustomAnimeFromStorageSync();
    const virtualAnime = getJikanVirtualAnimeList();
    const kodikAnime = getKodikCatalogAnimeList();
    const baseKeysForVirtualDedupe = buildBaseTitleKeysForVirtualDedupe(animeDatabase.all, customAnime, kodikAnime);
    const mergedRaw = [...animeDatabase.all, ...customAnime, ...virtualAnime, ...kodikAnime];
    const dedupedMal = dedupeAnimeByMalId(mergedRaw);

    const adultOk =
        typeof window !== 'undefined' &&
        typeof window.isAdultContentEnabled === 'function' &&
        window.isAdultContentEnabled();
    let merged = dedupedMal;
    if (!adultOk) {
        if (typeof window !== 'undefined' && typeof window.filterAdultAnimeList === 'function') {
            merged = window.filterAdultAnimeList(dedupedMal);
        } else if (
            typeof window !== 'undefined' &&
            typeof window.animeHasRestrictedGenre === 'function'
        ) {
            merged = dedupedMal.filter((a) => !window.animeHasRestrictedGenre(a));
        } else {
            merged = dedupedMal.filter((a) => {
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
        }
    }

    const seenIds = new Map();
    const uniqueAnime = [];

    for (const anime of merged) {
        const id = parseInt(anime.id, 10);
        if (seenIds.has(id)) continue;

        if (
            anime &&
            anime.isJikanVirtual === true &&
            shouldSkipVirtualAnimeAsDuplicate(anime, baseKeysForVirtualDedupe)
        ) {
            continue;
        }

        seenIds.set(id, true);
        uniqueAnime.push(anime);
    }

    return uniqueAnime;
}

/**
 * Каталог для «Смотреть вместе»: база сайта, пользовательские карточки и локально добавленные по названию (MAL/Jikan).
 * Виртуальные id = 10_000_000 + mal_id; Kodik подбирается по тем же правилам, что на странице просмотра.
 */
function getWatchTogetherAnimeCatalog() {
    const customAnime = getCustomAnimeFromStorageSync();
    const virtualAnime = getJikanVirtualAnimeList();
    const kodikAnime = getKodikCatalogAnimeList();
    const mergedRaw = [...animeDatabase.all, ...customAnime, ...virtualAnime, ...kodikAnime];
    const dedupedMal = dedupeAnimeByMalId(mergedRaw);
    const adultOk =
        typeof window !== 'undefined' &&
        typeof window.isAdultContentEnabled === 'function' &&
        window.isAdultContentEnabled();
    let list = dedupedMal;
    if (!adultOk && typeof window !== 'undefined' && typeof window.animeHasRestrictedGenre === 'function') {
        list = dedupedMal.filter((a) => !window.animeHasRestrictedGenre(a));
    }
    const seenIds = new Map();
    const uniqueAnime = [];
    for (const anime of list) {
        const id = parseInt(anime.id, 10);
        if (Number.isNaN(id)) continue;
        if (!seenIds.has(id)) {
            seenIds.set(id, true);
            uniqueAnime.push(anime);
        }
    }
    return uniqueAnime;
}

async function getWatchTogetherAnimeCatalogAsync() {
    if (typeof window !== 'undefined' && window.KodikCatalogStore && typeof window.KodikCatalogStore.load === 'function') {
        try {
            await window.KodikCatalogStore.load();
        } catch (_) {
            /* ignore */
        }
    }
    return getWatchTogetherAnimeCatalog();
}

function searchWatchTogetherAnimeCatalog(query) {
    const lowerQuery = (query || '').toLowerCase().trim();
    const allAnime = getWatchTogetherAnimeCatalog();
    if (!lowerQuery) return allAnime;
    return allAnime.filter(
        (anime) =>
            textMatchesSearchQuery(anime.title, lowerQuery) ||
            textMatchesSearchQuery(anime.titleAlt, lowerQuery) ||
            (anime.genres && anime.genres.some((g) => textMatchesSearchQuery(g, lowerQuery))) ||
            textMatchesSearchQuery(anime.studio, lowerQuery)
    );
}

// Асинхронная версия getAllAnime (для случаев, когда нужны свежие данные)
async function getAllAnimeAsync() {
    if (typeof window !== 'undefined' && window.KodikCatalogStore && typeof window.KodikCatalogStore.load === 'function') {
        try {
            await window.KodikCatalogStore.load();
        } catch (_) {
            /* ignore */
        }
    }
    return getAllAnime();
}

// Автоматическая предзагрузка пользовательских аниме из Supabase при загрузке страницы
if (typeof window !== 'undefined') {
    // Ждём загрузки Supabase
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        getCustomAnimeFromStorage().catch(err => {
            console.warn('[Data] Не удалось предзагрузить пользовательские аниме:', err);
        });
        hydrateSiteCatalogJikanFromSupabase().catch((err) => {
            console.warn('[Data] Не удалось загрузить catalog_site_anime:', err);
        });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    getCustomAnimeFromStorage().catch(err => {
                        console.warn('[Data] Не удалось предзагрузить пользовательские аниме:', err);
                    });
                    hydrateSiteCatalogJikanFromSupabase().catch((err) => {
                        console.warn('[Data] Не удалось загрузить catalog_site_anime:', err);
                    });
                }
            }, 1000);
        });
    }
}

// Получить аниме по ID (сравнение через число — id в данных может быть number или string)
function getAnimeById(id) {
    const allAnime = getAllAnime();
    const num = parseInt(id, 10);
    if (Number.isNaN(num)) return undefined;
    return allAnime.find(anime => parseInt(anime.id, 10) === num);
}

// === Аниме с главной (Jikan) в каталоге и поиске; id = 10_000_000 + mal_id ===
const JIKAN_VIRTUAL_LS_KEY = 'reminko_jikan_virtual_rows_v1';

function persistJikanVirtualRows() {
    if (typeof window === 'undefined' || !window.__JIKAN_VIRTUAL_ROWS) return;
    try {
        const slim = window.__JIKAN_VIRTUAL_ROWS.map((r) => ({
            mal_id: r.mal_id,
            jikan: r.jikan
        }));
        localStorage.setItem(JIKAN_VIRTUAL_LS_KEY, JSON.stringify(slim));
    } catch {
        /* quota / private mode */
    }
}

function hydrateJikanVirtualRows() {
    if (typeof window === 'undefined') return;
    try {
        const raw = localStorage.getItem(JIKAN_VIRTUAL_LS_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        window.__JIKAN_VIRTUAL_ROWS = arr
            .filter((x) => x && x.mal_id && x.jikan)
            .map((x) => ({ mal_id: x.mal_id, jikan: x.jikan, shiki: null }));
    } catch {
        /* ignore */
    }
}

if (typeof window !== 'undefined') {
    window.__JIKAN_VIRTUAL_ROWS = [];
    window.__SITE_CATALOG_JIKAN_ROWS = [];
    hydrateJikanVirtualRows();
    try {
        localStorage.removeItem('customAnimeDatabase');
    } catch (_) {
        /* ignore */
    }
}

/**
 * Нормализует поле jikan из БД: распарсить строку, снять обёртку { data }, подставить mal_id из колонки.
 */
function normalizeCatalogJikanFromDb(jRaw, malIdColumn) {
    let j = jRaw;
    if (j == null) return null;
    if (typeof j === 'string') {
        try {
            j = JSON.parse(j);
        } catch {
            return null;
        }
    }
    if (typeof j !== 'object') return null;
    if (j.data && typeof j.data === 'object' && j.data.mal_id != null) {
        j = j.data;
    }
    const col = malIdColumn != null ? Number(malIdColumn) : NaN;
    const fromJ = j.mal_id != null ? Number(j.mal_id) : NaN;
    const mid = !Number.isNaN(fromJ) ? fromJ : !Number.isNaN(col) ? col : NaN;
    if (Number.isNaN(mid) || mid <= 0) return null;
    if (j.mal_id == null || Number(j.mal_id) !== mid) {
        j = { ...j, mal_id: mid };
    }
    return j;
}

/**
 * Подтягивает глобальный каталог Jikan с Supabase (панель создателя).
 */
async function hydrateSiteCatalogJikanFromSupabase() {
    if (typeof window === 'undefined') return;
    if (!window.__SITE_CATALOG_JIKAN_ROWS) window.__SITE_CATALOG_JIKAN_ROWS = [];
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('catalog_site_anime')
            .select('mal_id,jikan,title_ru,description_ru');
        if (error) throw error;
        const out = [];
        for (const x of data || []) {
            if (!x || x.mal_id == null) continue;
            const mid = typeof x.mal_id === 'number' ? x.mal_id : parseInt(x.mal_id, 10);
            if (Number.isNaN(mid)) continue;
            const j = normalizeCatalogJikanFromDb(x.jikan, mid);
            if (!j) continue;
            out.push({
                mal_id: mid,
                jikan: j,
                shiki: null,
                title_ru: x.title_ru || null,
                description_ru: x.description_ru || null
            });
        }
        window.__SITE_CATALOG_JIKAN_ROWS = out;
        try {
            window.dispatchEvent(new CustomEvent('reminko-site-catalog-jikan-loaded'));
        } catch {
            /* ignore */
        }
        void warmShikimoriCacheForSiteCatalog(12);
    } catch (e) {
        console.warn('[Data] catalog_site_anime:', e);
    }
}

/**
 * Фоново подтягивает русские названия Shikimori в кэш и в строки каталога (для поиска по-русски).
 */
async function warmShikimoriCacheForSiteCatalog(limit = 10) {
    if (typeof window === 'undefined' || !window.__SITE_CATALOG_JIKAN_ROWS?.length) return;
    const api = window.shikimoriApi;
    if (!api?.readCachedByMalId || !api?.enqueueFetchShikimoriByMalId) return;
    let warmed = 0;
    let patched = false;
    for (const r of window.__SITE_CATALOG_JIKAN_ROWS) {
        if (warmed >= limit) break;
        if (!r?.mal_id) continue;
        const mid = Number(r.mal_id);
        if (r.shiki && String(r.shiki.russian || '').trim()) continue;
        if (api.readCachedByMalId(mid)) continue;
        warmed++;
        try {
            const sh = await api.enqueueFetchShikimoriByMalId(
                mid,
                (r.jikan && (r.jikan.title_english || r.jikan.title)) || ''
            );
            if (sh) {
                patchSiteCatalogJikanShiki(mid, sh);
                patched = true;
            }
        } catch {
            /* ignore */
        }
    }
    if (patched) {
        try {
            window.dispatchEvent(new CustomEvent('reminko-site-catalog-jikan-loaded'));
        } catch {
            /* ignore */
        }
    }
}

function patchSiteCatalogJikanShiki(malId, shiki) {
    if (typeof window === 'undefined' || !window.__SITE_CATALOG_JIKAN_ROWS) return;
    const r = window.__SITE_CATALOG_JIKAN_ROWS.find((x) => Number(x.mal_id) === Number(malId));
    if (r) r.shiki = shiki || null;
}

if (typeof window !== 'undefined') {
    window.refreshSiteCatalogJikanFromSupabase = hydrateSiteCatalogJikanFromSupabase;
}

/** Сразу добавить строку в память (legacy catalog_site_anime). */
function mergeSiteCatalogRowIntoMemory(malId, jikanFull, titleRu, descriptionRu) {
    if (typeof window === 'undefined') return;
    if (!window.__SITE_CATALOG_JIKAN_ROWS) window.__SITE_CATALOG_JIKAN_ROWS = [];
    const mid = Number(malId);
    if (Number.isNaN(mid) || mid <= 0) return;
    const jNorm = normalizeCatalogJikanFromDb(jikanFull, mid) || (jikanFull && typeof jikanFull === 'object' ? { ...jikanFull, mal_id: mid } : null);
    if (!jNorm) return;
    const row = {
        mal_id: mid,
        jikan: jNorm,
        shiki: null,
        title_ru: titleRu != null ? titleRu : null,
        description_ru: descriptionRu != null ? descriptionRu : null
    };
    const arr = window.__SITE_CATALOG_JIKAN_ROWS;
    const i = arr.findIndex((r) => Number(r.mal_id) === mid);
    if (i >= 0) arr[i] = row;
    else arr.push(row);
}

function registerJikanHomeList(list) {
    if (typeof window === 'undefined' || !Array.isArray(list) || !list.length) return;
    if (!window.__JIKAN_VIRTUAL_ROWS) window.__JIKAN_VIRTUAL_ROWS = [];
    for (const item of list) {
        if (!item) continue;
        let jikan = item.jikan != null ? item.jikan : item;
        if (typeof jikan === 'string') {
            try {
                jikan = JSON.parse(jikan);
            } catch {
                continue;
            }
        }
        if (jikan && typeof jikan === 'object' && jikan.data && jikan.data.mal_id != null) {
            jikan = jikan.data;
        }
        const mal =
            jikan && jikan.mal_id != null
                ? Number(jikan.mal_id)
                : item.mal_id != null
                  ? Number(item.mal_id)
                  : NaN;
        if (Number.isNaN(mal) || mal <= 0) continue;
        const row = {
            mal_id: mal,
            jikan,
            shiki: item.shiki || null,
            title_ru: item.title_ru || null,
            description_ru: item.description_ru || null
        };
        const i = window.__JIKAN_VIRTUAL_ROWS.findIndex((x) => Number(x.mal_id) === mal);
        if (i >= 0) window.__JIKAN_VIRTUAL_ROWS[i] = { ...window.__JIKAN_VIRTUAL_ROWS[i], ...row };
        else window.__JIKAN_VIRTUAL_ROWS.push(row);
    }
    persistJikanVirtualRows();
}

function patchJikanVirtualShiki(malId, shiki) {
    if (typeof window === 'undefined' || !window.__JIKAN_VIRTUAL_ROWS) return;
    const r = window.__JIKAN_VIRTUAL_ROWS.find((x) => x.mal_id === malId);
    if (r) r.shiki = shiki || null;
}

function mapJikanTypeToCatalog(t) {
    if (!t) return 'Сериал';
    const u = String(t).toLowerCase();
    if (u === 'movie') return 'Фильм';
    return 'Сериал';
}

function mapJikanStatusToCatalog(s) {
    if (s === 'Currently Airing') return 'Онгоинг';
    if (s === 'Finished Airing') return 'Завершён';
    if (s === 'Not yet aired') return 'Анонс';
    return 'Онгоинг';
}

/** Англ. названия жанров/тем Jikan → русские (как в основном каталоге) */
const JIKAN_GENRE_EN_TO_RU = {
    action: 'Экшен',
    adventure: 'Приключения',
    cars: 'Машины',
    comedy: 'Комедия',
    dementia: 'Деменция',
    demons: 'Демоны',
    drama: 'Драма',
    ecchi: 'Этти',
    fantasy: 'Фэнтези',
    game: 'Игры',
    harem: 'Гарем',
    hentai: 'Хентай',
    historical: 'Исторический',
    horror: 'Ужасы',
    josei: 'Дзёсей',
    kids: 'Детский',
    magic: 'Магия',
    'martial arts': 'Боевые искусства',
    mecha: 'Меха',
    military: 'Военный',
    music: 'Музыка',
    mystery: 'Детектив',
    parody: 'Пародия',
    police: 'Полиция',
    psychological: 'Психологическое',
    romance: 'Романтика',
    samurai: 'Самураи',
    school: 'Школа',
    'sci-fi': 'Фантастика',
    seinen: 'Сэйнэн',
    shoujo: 'Сёдзё',
    'shoujo ai': 'Сёдзё-ай',
    shounen: 'Сёнэн',
    'shounen ai': 'Сёнэн-ай',
    'slice of life': 'Повседневность',
    space: 'Космос',
    sports: 'Спорт',
    'super power': 'Суперсила',
    supernatural: 'Сверхъестественное',
    thriller: 'Триллер',
    vampire: 'Вампиры',
    yaoi: 'Яой',
    yuri: 'Юри',
    erotica: 'Эротика',
    isekai: 'Исекай',
    award: 'Премия',
    'avant garde': 'Авангард',
    'boy love': 'Бойс-лав',
    'girl love': 'Гёрлс-лав',
    'gender bender': 'Смена пола',
    'gag humor': 'Юмор',
    'gore': 'Гуро',
    'adult cast': 'Взрослые герои',
    anthropomorphic: 'Антропоморфизм',
    'cgdct': 'Милашки',
    childcare: 'Уход за детьми',
    'combat sports': 'Спортивные единоборства',
    'crossdressing': 'Кроссдрессинг',
    delinquents: 'Делинквенты',
    detective: 'Детектив',
    educational: 'Образовательное',
    'ensemble cast': 'Ансамбль героев',
    'gender neutral': 'Без гендера',
    gyaru: 'Гяру',
    'high stakes game': 'Игра на выживание',
    idols: 'Айдолы',
    iyashikei: 'Иясикэй',
    love: 'Любовь',
    'love polygon': 'Любовный многоугольник',
    'magical sex shift': 'Магическая смена пола',
    mahou: 'Махо-сёдзё',
    medical: 'Медицина',
    'memory manipulation': 'Манипуляция памятью',
    meta: 'Мета',
    'organized crime': 'Организованная преступность',
    otaku: 'Отаку',
    'performing arts': 'Искусство',
    pets: 'Питомцы',
    reincarnation: 'Реинкарнация',
    reverse: 'Реверс-гарем',
    romantic: 'Романтика',
    russia: 'Россия',
    'showbiz': 'Шоу-бизнес',
    strategy: 'Стратегия',
    'survival': 'Выживание',
    'time travel': 'Путешествие во времени',
    video: 'Видеоигры',
    visual: 'Визуальная новелла',
    workplace: 'Работа',
    zombie: 'Зомби'
};

function mapJikanGenreName(name) {
    const n = String(name || '').trim();
    if (!n) return '';
    const key = n.toLowerCase().replace(/\s+/g, ' ').trim();
    if (JIKAN_GENRE_EN_TO_RU[key]) return JIKAN_GENRE_EN_TO_RU[key];
    if (/[а-яёА-ЯЁ]/.test(n)) return n;
    return JIKAN_GENRE_EN_TO_RU[key] || n;
}

function jikanPreferredTitle(j, sh) {
    if (sh && sh.russian && String(sh.russian).trim()) return String(sh.russian).trim();
    const en = j.title_english ? String(j.title_english).trim() : '';
    const def = j.title ? String(j.title).trim() : '';
    const jp = j.title_japanese ? String(j.title_japanese).trim() : '';
    const hasCjk = (s) => /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(s);
    if (en && !hasCjk(en)) return en;
    if (def && !hasCjk(def)) return def || en;
    return en || def || jp || '—';
}

function jikanRowToVirtualAnime(row) {
    if (!row) return null;
    let j = row.jikan;
    if (typeof j === 'string') {
        try {
            j = JSON.parse(j);
        } catch {
            return null;
        }
    }
    if (!j || typeof j !== 'object') return null;
    if (j.data && typeof j.data === 'object' && j.data.mal_id != null) {
        j = j.data;
    }
    const malNum =
        j.mal_id != null ? Number(j.mal_id) : row.mal_id != null ? Number(row.mal_id) : NaN;
    if (Number.isNaN(malNum) || malNum <= 0) return null;
    j = { ...j, mal_id: malNum };
    let sh = row.shiki || null;
    if (!sh && typeof window !== 'undefined' && window.shikimoriApi?.readCachedByMalId) {
        sh = window.shikimoriApi.readCachedByMalId(malNum) || null;
    }
    const dbTitleRu = row.title_ru && String(row.title_ru).trim() ? String(row.title_ru).trim() : '';
    const titleRu = dbTitleRu || jikanPreferredTitle(j, sh);
    const titleAlt = j.title_english || j.title || j.title_japanese || '';
    const studioName = (j.studios && j.studios[0] && j.studios[0].name) || '';
    const genreNames = [...(j.genres || []), ...(j.themes || [])]
        .map((g) => mapJikanGenreName(g.name))
        .filter(Boolean);
    const dbDescRu = row.description_ru && String(row.description_ru).trim() ? String(row.description_ru).trim() : '';
    let desc = dbDescRu;
    if (!desc && sh && typeof window !== 'undefined' && window.shikimoriApi && window.shikimoriApi.stripHtml) {
        desc = window.shikimoriApi.stripHtml(sh.description_html || sh.description || '');
    }
    if (!desc && j.synopsis) {
        desc = String(j.synopsis).replace(/\s+/g, ' ').trim().slice(0, 800);
    }
    return {
        id: 10000000 + j.mal_id,
        mal_id: j.mal_id,
        title: titleRu,
        titleAlt,
        year: j.year || new Date().getFullYear(),
        rating: j.score || 0,
        genres: genreNames,
        type: mapJikanTypeToCatalog(j.type),
        status: mapJikanStatusToCatalog(j.status),
        episodes: j.episodes != null ? String(j.episodes) : '?',
        totalEpisodes: j.episodes || 1,
        studio: studioName,
        description: desc,
        isJikanVirtual: true,
        posterUrl: j.images?.jpg?.large_image_url || j.images?.jpg?.image_url || null,
        _jikanRaw: j
    };
}

function getVirtualAnimeSearchHits(lowerQuery) {
    if (typeof window === 'undefined' || !lowerQuery) return [];
    const adultOk =
        typeof window.isAdultContentEnabled === 'function' && window.isAdultContentEnabled();
    const hits = [];
    for (const row of getMergedJikanVirtualRows()) {
        if (
            !adultOk &&
            typeof window.jikanItemHasRestrictedGenre === 'function' &&
            window.jikanItemHasRestrictedGenre(row.jikan)
        ) {
            continue;
        }
        const a = jikanRowToVirtualAnime(row);
        if (!a) continue;
        const jj = row.jikan && typeof row.jikan === 'object' ? row.jikan : null;
        let shLow = '';
        if (row.shiki && (row.shiki.russian || row.shiki.name)) {
            shLow = String(row.shiki.russian || row.shiki.name).toLowerCase();
        } else if (typeof window !== 'undefined' && window.shikimoriApi?.readCachedByMalId && row.mal_id) {
            const c = window.shikimoriApi.readCachedByMalId(Number(row.mal_id));
            if (c && (c.russian || c.name)) shLow = String(c.russian || c.name).toLowerCase();
        }

        let matched = false;
        if (row.title_ru && textMatchesSearchQuery(row.title_ru, lowerQuery)) matched = true;
        if (!matched && shLow && textMatchesSearchQuery(shLow, lowerQuery)) matched = true;
        if (!matched && textMatchesSearchQuery(a.title, lowerQuery)) matched = true;
        if (!matched && textMatchesSearchQuery(a.titleAlt, lowerQuery)) matched = true;
        if (!matched && jj) {
            forEachJikanSearchTitle(jj, (t) => {
                if (textMatchesSearchQuery(t, lowerQuery)) matched = true;
            });
        }
        if (
            !matched &&
            a.genres &&
            a.genres.some((g) => textMatchesSearchQuery(g, lowerQuery))
        ) {
            matched = true;
        }
        if (!matched && a.studio && textMatchesSearchQuery(a.studio, lowerQuery)) matched = true;

        if (matched) hits.push(a);
    }
    return hits;
}

function animeTitleMatchesQuery(anime, lowerQuery) {
    if (!lowerQuery || !anime) return false;
    const raw = anime._jikanRaw && typeof anime._jikanRaw === 'object' ? anime._jikanRaw : null;
    let shRu = '';
    let shName = '';
    if (anime.mal_id && typeof window !== 'undefined' && window.shikimoriApi?.readCachedByMalId) {
        const sh = window.shikimoriApi.readCachedByMalId(Number(anime.mal_id));
        if (sh) {
            if (sh.russian) shRu = String(sh.russian).toLowerCase();
            if (sh.name) shName = String(sh.name).toLowerCase();
        }
    }
    if (textMatchesSearchQuery(anime.title, lowerQuery)) return true;
    if (textMatchesSearchQuery(anime.titleAlt, lowerQuery)) return true;
    if (raw) {
        let hit = false;
        forEachJikanSearchTitle(raw, (t) => {
            if (textMatchesSearchQuery(t, lowerQuery)) hit = true;
        });
        if (hit) return true;
    }
    if (shRu && textMatchesSearchQuery(shRu, lowerQuery)) return true;
    if (shName && textMatchesSearchQuery(shName, lowerQuery)) return true;
    if (anime.genres && anime.genres.some((g) => textMatchesSearchQuery(g, lowerQuery))) return true;
    if (anime.studio && textMatchesSearchQuery(anime.studio, lowerQuery)) return true;
    return false;
}

function searchAnimeSortKey(anime, queryLower) {
    if (!queryLower || !anime) return 0;
    const variants = [anime.title, anime.titleAlt];
    if (anime._jikanRaw) {
        forEachJikanSearchTitle(anime._jikanRaw, (t) => variants.push(t));
    }
    const nq = reminkoNormalizeSearchText(queryLower);
    let best = 0;
    for (const v of variants) {
        if (v == null || v === '') continue;
        const vl = String(v).toLowerCase();
        const nv = reminkoNormalizeSearchText(v);
        if (vl === queryLower || (nq && nv === nq)) best = Math.max(best, 100);
        else if (vl.startsWith(queryLower) || (nq && nv.startsWith(nq))) best = Math.max(best, 82);
        else if (vl.includes(queryLower) || (nq && nv.includes(nq))) best = Math.max(best, 65);
        else if (textMatchesSearchQuery(v, queryLower)) best = Math.max(best, 48);
    }
    return best;
}

// Поиск аниме
function searchAnime(query) {
    const lowerQuery = query.toLowerCase().trim();
    const allAnime = getAllAnime();
    const local = allAnime.filter((anime) => animeTitleMatchesQuery(anime, lowerQuery));
    const virtual = lowerQuery ? getVirtualAnimeSearchHits(lowerQuery) : [];
    const seenIds = new Set();
    const merged = [];
    for (const a of virtual) {
        const id = parseInt(a.id, 10);
        if (Number.isNaN(id) || seenIds.has(id)) continue;
        seenIds.add(id);
        merged.push(a);
    }
    for (const a of local) {
        const id = parseInt(a.id, 10);
        if (Number.isNaN(id) || seenIds.has(id)) continue;
        seenIds.add(id);
        merged.push(a);
    }
    merged.sort((a, b) => {
        const da = searchAnimeSortKey(a, lowerQuery);
        const db = searchAnimeSortKey(b, lowerQuery);
        if (db !== da) return db - da;
        return (b.rating || 0) - (a.rating || 0);
    });
    const adultOk =
        typeof window !== 'undefined' &&
        typeof window.isAdultContentEnabled === 'function' &&
        window.isAdultContentEnabled();
    if (!adultOk && typeof window !== 'undefined' && typeof window.animeHasRestrictedGenre === 'function') {
        return merged.filter((a) => !window.animeHasRestrictedGenre(a));
    }
    return merged;
}

// Фильтрация аниме
function filterAnime(filters) {
    let results = getAllAnime();
    
    if (filters.genre && filters.genre.length > 0) {
        // Если выбрано 2 или больше жанров - показываем только аниме со ВСЕМИ выбранными жанрами (логика И)
        // Если выбран 1 жанр - показываем аниме с этим жанром
        if (filters.genre.length >= 2) {
            results = results.filter(anime => {
                // Проверяем точное совпадение всех выбранных жанров
                return filters.genre.every(selectedGenre => 
                    anime.genres.some(animeGenre => 
                        animeGenre.toLowerCase().trim() === selectedGenre.toLowerCase().trim()
                    )
                );
            });
        } else {
            // Для одного жанра проверяем точное совпадение
            const selectedGenre = filters.genre[0].toLowerCase().trim();
            results = results.filter(anime => 
                anime.genres.some(genre => 
                    genre.toLowerCase().trim() === selectedGenre
                )
            );
        }
    }
    
    if (filters.type && filters.type.length > 0) {
        results = results.filter(anime => filters.type.includes(anime.type));
    }
    
    if (filters.status && filters.status.length > 0) {
        const statusAliases = (sel, animeSt) => {
            if (sel === 'Вышел' && (animeSt === 'Завершён' || animeSt === 'Вышел')) return true;
            return animeSt === sel;
        };
        const effectiveStatus =
            typeof window.reminkoEffectiveAnimeStatus === 'function'
                ? (anime) => window.reminkoEffectiveAnimeStatus(anime)
                : (anime) => anime.status;
        const releasedEps = (anime) => {
            if (!anime) return 0;
            const last = parseInt(anime._kodik && anime._kodik.lastEpisode, 10);
            if (Number.isFinite(last) && last >= 0) return last;
            const epStr = String(anime.episodes != null ? anime.episodes : '').trim();
            const range = epStr.match(/(\d+)\s*-\s*(\d+)/);
            if (range) return parseInt(range[2], 10) || 0;
            const n = parseInt(epStr, 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };
        results = results.filter((anime) =>
            filters.status.some((s) => {
                if (!statusAliases(s, effectiveStatus(anime))) return false;
                // «Анонс» только реально не вышедшие (фильмы с плеером / серии — отсекаем)
                if (s === 'Анонс') {
                    if (releasedEps(anime) >= 1) return false;
                    if (anime.type === 'Фильм' && anime._kodik && anime._kodik.link) return false;
                }
                return true;
            })
        );
    }
    
    if (filters.yearFrom) {
        results = results.filter((anime) => reminkoAnimeSortYear(anime) >= filters.yearFrom);
    }
    
    if (filters.yearTo) {
        results = results.filter((anime) => reminkoAnimeSortYear(anime) <= filters.yearTo);
    }
    
    if (filters.ratingMin) {
        results = results.filter(anime => anime.rating >= filters.ratingMin);
    }
    
    const searchTrimForFilter =
        filters.search && String(filters.search).trim() ? String(filters.search).trim() : '';
    if (searchTrimForFilter) {
        const searchResults = searchAnime(searchTrimForFilter);
        const hitIds = new Set(
            searchResults.map((a) => parseInt(a.id, 10)).filter((n) => !Number.isNaN(n))
        );
        // Пересечение с уже отфильтрованным списком — как в шапке, плюс уважение жанра/года и т.д.
        results = results.filter((anime) => hitIds.has(parseInt(anime.id, 10)));
    }

    // Удаляем дубликаты если указано
    if (filters.removeDuplicates !== false) {
        // Сначала удаляем дубликаты по ID
        const seenIds = new Map();
        const uniqueById = [];
        for (const anime of results) {
            const id = parseInt(anime.id);
            if (!seenIds.has(id)) {
                seenIds.set(id, true);
                uniqueById.push(anime);
            }
        }
        const searchActive = !!searchTrimForFilter;
        // При текстовом поиске не сливаем разные тайтлы по похожести названия — иначе счётчик
        // и состав выдачи расходятся с поиском в шапке.
        results = searchActive ? uniqueById : removeDuplicates(uniqueById);
    }
    
    return results;
}

function reminkoAnimeSortYear(anime) {
    if (!anime || typeof anime !== 'object') return 0;
    const directYear = parseInt(anime.year, 10);
    if (!Number.isNaN(directYear) && directYear > 0) return directYear;

    const dateCandidates = [
        anime.releaseDate,
        anime.released_at,
        anime.created_at,
        anime.updated_at,
        anime.aired_on,
        anime.aired_from,
        anime.premiered
    ];
    for (const candidate of dateCandidates) {
        const raw = String(candidate || '').trim();
        if (!raw) continue;
        const match = raw.match(/\b(19|20)\d{2}\b/);
        if (match) {
            const y = parseInt(match[0], 10);
            if (!Number.isNaN(y)) return y;
        }
    }
    return 0;
}

// Сортировка аниме
function sortAnime(animeList, sortBy) {
    const sorted = [...animeList];
    
    switch(sortBy) {
        case 'rating-desc':
            return sorted.sort((a, b) => b.rating - a.rating);
        case 'rating-asc':
            return sorted.sort((a, b) => a.rating - b.rating);
        case 'year-desc':
            return sorted.sort((a, b) => {
                const yearDiff = reminkoAnimeSortYear(b) - reminkoAnimeSortYear(a);
                if (yearDiff !== 0) return yearDiff;
                const ratingDiff = (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
                if (ratingDiff !== 0) return ratingDiff;
                return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
            });
        case 'year-asc':
            return sorted.sort((a, b) => a.year - b.year);
        case 'title-asc':
            return sorted.sort((a, b) => a.title.localeCompare(b.title));
        case 'title-desc':
            return sorted.sort((a, b) => b.title.localeCompare(a.title));
        default:
            return sorted;
    }
}

// Получить все уникальные жанры
function getAllGenres() {
    const genres = new Set();
    const source =
        typeof getAllAnime === 'function'
            ? getAllAnime()
            : [...animeDatabase.all, ...getCustomAnimeFromStorageSync()];
    source.forEach((anime) => {
        (anime.genres || []).forEach((genre) => {
            if (genre) genres.add(genre);
        });
    });
    if (typeof window !== 'undefined') {
        for (const row of getMergedJikanVirtualRows()) {
            const j = row.jikan;
            if (!j) continue;
            for (const g of [...(j.genres || []), ...(j.themes || [])]) {
                if (g && g.name) genres.add(mapJikanGenreName(g.name));
            }
        }
    }
    genres.add('Хентай');
    genres.add('Эротика');
    return Array.from(genres).sort((a, b) => a.localeCompare(b, 'ru'));
}

// Удаление дубликатов и объединение сезонов
// Оставляем только один элемент для каждого базового аниме (первый сезон или лучший по рейтингу)
function removeDuplicates(animeList) {
    const seen = new Map();
    const seenIds = new Set();
    
    // Сначала удаляем дубликаты по ID
    const uniqueById = [];
    for (const anime of animeList) {
        const id = parseInt(anime.id);
        if (!seenIds.has(id)) {
            seenIds.add(id);
            uniqueById.push(anime);
        }
    }
    
    // Затем удаляем дубликаты по названиям (карточки из MAL/каталога сайта не сливаем с основной базой по названию)
    uniqueById.forEach(anime => {
        if (anime.isJikanVirtual === true) {
            seen.set(`__jikan_vid:${anime.id}`, anime);
            return;
        }
        // Нормализуем русское название - убираем сезоны, номера, части, знаки препинания
        let titleKey = anime.title.toLowerCase()
            .replace(/\s*сезон\s*\d+/gi, '')
            .replace(/\s*часть\s*\d+/gi, '')
            .replace(/\s*\d+$/gi, '')
            .replace(/\s*\(20\d{2}\)$/gi, '')
            .replace(/[:\-–—\.]/g, ' ')  // Убираем двоеточия, тире, точки
            .replace(/\s+/g, ' ')
            .trim();
        
        // Нормализуем английское название - убираем сезоны, номера, части
        let titleAltKey = (anime.titleAlt || anime.title).toLowerCase()
            .replace(/\s*season\s*\d+/gi, '')           // Season 2, Season 3
            .replace(/\s*s\d+$/gi, '')                  // S2, S3
            .replace(/\s+\d+$/gi, '')                   // "Title 2", "Title 3"
            .replace(/\s*:\s*the\s+final\s+season/gi, '') // : The Final Season
            .replace(/\s*part\s*\d+/gi, '')            // Part 1, Part 2
            .replace(/\s*cour\s*\d+/gi, '')            // Cour 1, Cour 2
            .replace(/\s*\d+(st|nd|rd|th)\s+season/gi, '') // 2nd Season
            .replace(/\s*ii+$/gi, '')                  // II, III, IV
            .replace(/\s*\(20\d{2}\)$/gi, '')          // (2023)
            .replace(/[:\-–—\.]/g, ' ')  // Убираем двоеточия, тире, точки
            .replace(/\s+/g, ' ')
            .trim();
        
        // Используем оба ключа для проверки дубликатов
        const key = titleKey + '|' + titleAltKey;
        
        // Если аниме еще не видели или у текущего выше рейтинг - сохраняем
        if (!seen.has(key) || seen.get(key).rating < anime.rating) {
            seen.set(key, anime);
        }
    });
    
    return Array.from(seen.values());
}

// Получить популярные аниме (топ по рейтингу, без дубликатов)
function getPopularAnime(limit = 12) {
    const serials = animeDatabase.all.filter(a => a.type === 'Сериал');
    const unique = removeDuplicates(serials);
    return sortAnime(unique, 'rating-desc').slice(0, limit);
}

// Получить фильмы (без дубликатов)
function getFilms(limit = 8) {
    const films = animeDatabase.all.filter(a => a.type === 'Фильм');
    const unique = removeDuplicates(films);
    return sortAnime(unique, 'rating-desc').slice(0, limit);
}

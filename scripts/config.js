// Конфигурация приложения
// ВАЖНО: Не коммитьте этот файл с реальными секретами в публичный репозиторий!
// Используйте переменные окружения или отдельный файл config.local.js
// 
// Для локальной разработки создайте config.local.js в корне проекта:
// window.APP_CONFIG = { supabase: { url: '...', anonKey: '...' }, ... }

/** Ссылки-заглушки из примеров: иначе перекрывают авто-URL того же домена на Netlify */
function _isPlaceholderMinkoChatProxyUrl(url) {
    const s = String(url || '').trim().toLowerCase();
    if (!s) return true;
    if (s.includes('your-netlify-subdomain')) return true;
    if (s.includes('ваш-поддомен') || s.includes('ваш-сайт')) return true;
    if (s.includes('<ваш') || s.includes('xxxx.netlify.app')) return true;
    return false;
}

// Конфигурация по умолчанию (для разработки)
// Если есть window.APP_CONFIG от config.local.js, используем его значения
const APP_CONFIG = {
    /**
     * Меняйте при каждом деплое: пользователи получат свежие HTML/JS без Ctrl+F5.
     * Должно совпадать с REMINKO_ASSET_VERSION в scripts/desktop-only-guard.js.
     */
    assetVersion: '20260718a',
    /**
     * Публичный URL сайта без слэша в конце (для ссылок из JS). На проде задайте в config.local.js.
     * Должен совпадать с доменом в canonical (index.html) и sitemap.xml.
     */
    siteOrigin:
        typeof window.APP_CONFIG?.siteOrigin === 'string' && window.APP_CONFIG.siteOrigin.trim()
            ? window.APP_CONFIG.siteOrigin.trim().replace(/\/$/, '')
            : typeof window !== 'undefined' &&
                window.location?.origin &&
                !window.location.hostname.includes('localhost') &&
                !window.location.hostname.includes('127.0.0.1')
              ? window.location.origin
              : 'https://re-minko-anime.com',

    /**
     * UUID профиля Создателя в Supabase (auth.users / profiles) для гостевого «Написать Создателю».
     * Без него UUID ищется по profiles.is_site_creator = true, если в БД есть такая запись.
     * Задайте в config.local.js для гарантированного совпадения.
     */
    siteCreatorUserId: (() => {
        const v = window.APP_CONFIG?.siteCreatorUserId;
        if (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v.trim())) return v.trim();
        // Subarik — запасной UUID, если config.local.js не задан
        return 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb';
    })(),

    // Supabase настройки
    supabase: {
        url: window.APP_CONFIG?.supabase?.url || 'https://ipsawgtsicxwkkkipchp.supabase.co',
        // Публичный ключ: sb_publishable_… или legacy anon JWT. sb_secret_ / service_role — только на сервере.
        anonKey:
            window.APP_CONFIG?.supabase?.anonKey ||
            'sb_publishable_dcESewUuxxhwdhag8VqsDg_NklGox9v'
    },

    // Kodik: встраивание через Kodik API (kodik-api.com/search), не через kodik.info/find-player.
    kodik: {
        /** Основной плеер (ссылки из API ведут на kodikplayer.com) */
        playerOrigin:
            (window.APP_CONFIG?.kodik?.playerOrigin || 'https://kodikplayer.com').replace(
                /\/$/,
                ''
            ),
        /** Плеер для соцсетей */
        socialPlayerOrigin:
            (window.APP_CONFIG?.kodik?.socialPlayerOrigin || 'https://kodikonline.com').replace(
                /\/$/,
                ''
            ),
        /** API Kodik (домен запросов) */
        apiOrigin:
            (window.APP_CONFIG?.kodik?.apiOrigin || 'https://kodik-api.com').replace(/\/$/, ''),
        /**
         * Токен Kodik API — только config.local.js (локальная разработка).
         * На проде: Netlify env KODIK_API_TOKEN + прокси apiProxyUrl (токен не в файлах).
         */
        /**
         * Прокси Kodik на Netlify (/.netlify/functions/kodik-proxy). На проде без apiToken в config.local.js.
         */
        apiProxyUrl:
            typeof window.APP_CONFIG?.kodik?.apiProxyUrl === 'string' &&
            window.APP_CONFIG.kodik.apiProxyUrl.trim()
                ? window.APP_CONFIG.kodik.apiProxyUrl.trim()
                : '/.netlify/functions/kodik-proxy',
        useKodikProxy:
            window.APP_CONFIG?.kodik?.useKodikProxy !== false,
        /**
         * Компактный каталог из дампа Kodik (сборка: node scripts/build/kodik-build-catalog.js)
         */
        catalogPath:
            typeof window.APP_CONFIG?.kodik?.catalogPath === 'string' &&
            window.APP_CONFIG.kodik.catalogPath.trim()
                ? window.APP_CONFIG.kodik.catalogPath.trim()
                : 'data/kodik-anime-catalog.json',
        /** Папка с сырыми дампами Kodik (обновление раз в час с kodik-api.com) */
        dumpDir: window.APP_CONFIG?.kodik?.dumpDir || 'kodik base',
        apiToken:
            typeof window.APP_CONFIG?.kodik?.apiToken === 'string'
                ? window.APP_CONFIG.kodik.apiToken.trim()
                : '',
        /**
         * Опционально: переопределение для scripts/kodik-change-domains.js
         * (fromDomains, toDomain, onDomReady)
         */
        domainReplace: window.APP_CONFIG?.kodik?.domainReplace,
        /**
         * Загрузка change-domains.min.js с kodik-add.com (подмена старых доменов в ссылках плеера).
         * По умолчанию выключено.
         */
        loadChangeDomainsScript:
            window.APP_CONFIG?.kodik?.loadChangeDomainsScript === true
    },

    /** Shikimori REST — на проде через /.netlify/functions/shikimori-proxy (CORS) */
    shikimori: {
        apiProxyUrl:
            typeof window.APP_CONFIG?.shikimori?.apiProxyUrl === 'string' &&
            window.APP_CONFIG.shikimori.apiProxyUrl.trim()
                ? window.APP_CONFIG.shikimori.apiProxyUrl.trim()
                : '/.netlify/functions/shikimori-proxy',
        useShikimoriProxy: window.APP_CONFIG?.shikimori?.useShikimoriProxy !== false
    },

    /**
     * Alloha TV — iframe-плеер. На проде: ALLOHA_API_TOKEN в Netlify + прокси alloha-proxy.
     * Локально: alloha.apiToken в config.local.js.
     */
    alloha: {
        apiProxyUrl:
            typeof window.APP_CONFIG?.alloha?.apiProxyUrl === 'string' &&
            window.APP_CONFIG.alloha.apiProxyUrl.trim()
                ? window.APP_CONFIG.alloha.apiProxyUrl.trim()
                : '/.netlify/functions/alloha-proxy',
        useAllohaProxy: window.APP_CONFIG?.alloha?.useAllohaProxy !== false,
        apiToken:
            typeof window.APP_CONFIG?.alloha?.apiToken === 'string'
                ? window.APP_CONFIG.alloha.apiToken.trim()
                : ''
    },

    /** Каталог русской манги ReManga (сборка: node scripts/build/remanga-build-catalog.js) */
    remanga: {
        catalogPath:
            typeof window.APP_CONFIG?.remanga?.catalogPath === 'string' &&
            window.APP_CONFIG.remanga.catalogPath.trim()
                ? window.APP_CONFIG.remanga.catalogPath.trim()
                : 'data/remanga-manga-catalog.json',
        siteOrigin:
            (window.APP_CONFIG?.remanga?.siteOrigin || 'https://remanga.org').replace(/\/$/, ''),
    },
    
    /**
     * URL прокси чата Minko (POST /chat). На проде — Netlify из папки minko-netlify-proxy; иначе localhost.
     * Переопределите в config.local.js, если другой поддомен Netlify.
     */
    minkoChatProxy: (() => {
        const raw =
            typeof window.APP_CONFIG?.minkoChatProxy === 'string' && window.APP_CONFIG.minkoChatProxy.trim()
                ? window.APP_CONFIG.minkoChatProxy.trim()
                : '';
        const c = raw && !_isPlaceholderMinkoChatProxyUrl(raw) ? raw : '';
        if (c) return c;
        try {
            const h = window.location?.hostname || '';
            const proto = window.location?.protocol || '';
            const isLocal = h === 'localhost' || h === '127.0.0.1';
            // Один деплой на Netlify: POST /chat на том же origin (корневой netlify.toml).
            if (!isLocal && h && (proto === 'https:' || proto === 'http:')) {
                const origin = window.location.origin.replace(/\/$/, '');
                if (origin) return `${origin}/chat`;
            }
        } catch (_) {}
        return 'http://localhost:3334/chat';
    })(),

    /** POST генерации аватара (OpenAI через прокси BOT). По умолчанию тот же хост, что и чат, путь /avatar */
    minkoAvatarProxy:
        typeof window.APP_CONFIG?.minkoAvatarProxy === 'string' && window.APP_CONFIG.minkoAvatarProxy.trim()
            ? window.APP_CONFIG.minkoAvatarProxy.trim()
            : null,

    /**
     * POST/GET генерации аватара через Grok (xAI) на Netlify.
     * По умолчанию: /.netlify/functions/minko-avatar-grok на том же origin (не localhost).
     * На localhost задайте полный URL деплоя в config.local.js.
     */
    minkoAvatarGrokUrl: (() => {
        const raw =
            typeof window.APP_CONFIG?.minkoAvatarGrokUrl === 'string' && window.APP_CONFIG.minkoAvatarGrokUrl.trim()
                ? window.APP_CONFIG.minkoAvatarGrokUrl.trim()
                : '';
        if (raw && !_isPlaceholderMinkoChatProxyUrl(raw)) return raw;
        const prodOrigin = (() => {
            const fromCfg =
                typeof window.APP_CONFIG?.siteOrigin === 'string' && window.APP_CONFIG.siteOrigin.trim()
                    ? window.APP_CONFIG.siteOrigin.trim().replace(/\/$/, '')
                    : '';
            if (fromCfg) return fromCfg;
            return 'https://re-minko-anime.com';
        })();
        try {
            const h = window.location?.hostname || '';
            const proto = window.location?.protocol || '';
            const isLocal = h === 'localhost' || h === '127.0.0.1';
            if (!isLocal && h && (proto === 'https:' || proto === 'http:')) {
                const origin = window.location.origin.replace(/\/$/, '');
                if (origin) return `${origin}/.netlify/functions/minko-avatar-grok`;
            }
            if (isLocal && prodOrigin) {
                return `${prodOrigin}/.netlify/functions/minko-avatar-grok`;
            }
        } catch (_) {}
        return prodOrigin ? `${prodOrigin}/.netlify/functions/minko-avatar-grok` : '';
    })(),

    /**
     * Опционально: URL для проверки «картиночного» прокси (Grok) в статусе чата.
     * На проде localhost:3333 не пингуем; задайте публичный health, если нужен точный флаг.
     */
    minkoGrokHealth:
        typeof window.APP_CONFIG?.minkoGrokHealth === 'string' && window.APP_CONFIG.minkoGrokHealth.trim()
            ? window.APP_CONFIG.minkoGrokHealth.trim()
            : null,

    // Minko AI использует только Grok через локальный прокси

    // Настройки окружения
    environment: {
        isDev: window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ||
               window.location.search.includes('debug=true'),
        isProduction: !window.location.hostname.includes('localhost') && 
                      !window.location.hostname.includes('127.0.0.1')
    },

    /**
     * Рекламные блоки Яндекса (РСЯ) для отдельных страниц.
     * ID блоков вида R-A-12345678-1 из кабинета РСЯ → Конструктор → Код блока.
     * Задаётся в config.local.js: window.APP_CONFIG.yandexRtb = { infoPageBlockIds: ['R-A-...'] };
     */
    yandexRtb: {
        infoPageBlockIds: Array.isArray(window.APP_CONFIG?.yandexRtb?.infoPageBlockIds)
            ? window.APP_CONFIG.yandexRtb.infoPageBlockIds.filter(
                  (id) => typeof id === 'string' && id.trim().length > 0
              )
            : []
    },

    /**
     * ≈4K: лимит размера одного файла для загрузки в Supabase Storage (байты).
     * На Free тарифе глобальный лимит Supabase — 50 MB (bucket 5 GB не помогает).
     * После Pro: Dashboard → Storage → Settings → Global file size limit (до 5 GB),
     * затем в config.local.js: anime4k: { maxUploadBytes: 5368709120 }
     */
    anime4k: {
        maxUploadBytes:
            window.APP_CONFIG?.anime4k?.maxUploadBytes != null &&
            Number.isFinite(Number(window.APP_CONFIG.anime4k.maxUploadBytes))
                ? Number(window.APP_CONFIG.anime4k.maxUploadBytes)
                : 52_428_800
    }
    
};

// Экспортируем конфигурацию
window.APP_CONFIG = APP_CONFIG;

function reminkoAssetVersion() {
    return (
        (typeof window !== 'undefined' && window.REMINKO_ASSET_VERSION) ||
        APP_CONFIG.assetVersion ||
        '1'
    );
}
window.reminkoAssetVersion = reminkoAssetVersion;

// Для обратной совместимости
if (typeof SUPABASE_URL === 'undefined') {
    window.SUPABASE_URL = APP_CONFIG.supabase.url;
    window.SUPABASE_ANON_KEY = APP_CONFIG.supabase.anonKey;
}

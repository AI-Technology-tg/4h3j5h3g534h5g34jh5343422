// РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ РїСЂРёР»РѕР¶РµРЅРёСЏ
// Р’РђР–РќРћ: РќРµ РєРѕРјРјРёС‚СЊС‚Рµ СЌС‚РѕС‚ С„Р°Р№Р» СЃ СЂРµР°Р»СЊРЅС‹РјРё СЃРµРєСЂРµС‚Р°РјРё РІ РїСѓР±Р»РёС‡РЅС‹Р№ СЂРµРїРѕР·РёС‚РѕСЂРёР№!
// РСЃРїРѕР»СЊР·СѓР№С‚Рµ РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ РёР»Рё РѕС‚РґРµР»СЊРЅС‹Р№ С„Р°Р№Р» config.local.js
// 
// Р”Р»СЏ Р»РѕРєР°Р»СЊРЅРѕР№ СЂР°Р·СЂР°Р±РѕС‚РєРё СЃРѕР·РґР°Р№С‚Рµ config.local.js РІ РєРѕСЂРЅРµ РїСЂРѕРµРєС‚Р°:
// window.APP_CONFIG = { supabase: { url: '...', anonKey: '...' }, ... }

/** РЎСЃС‹Р»РєРё-Р·Р°РіР»СѓС€РєРё РёР· РїСЂРёРјРµСЂРѕРІ: РёРЅР°С‡Рµ РїРµСЂРµРєСЂС‹РІР°СЋС‚ Р°РІС‚Рѕ-URL С‚РѕРіРѕ Р¶Рµ РґРѕРјРµРЅР° РЅР° Netlify */
function _isPlaceholderMinkoChatProxyUrl(url) {
    const s = String(url || '').trim().toLowerCase();
    if (!s) return true;
    if (s.includes('your-netlify-subdomain')) return true;
    if (s.includes('РІР°С€-РїРѕРґРґРѕРјРµРЅ') || s.includes('РІР°С€-СЃР°Р№С‚')) return true;
    if (s.includes('<РІР°С€') || s.includes('xxxx.netlify.app')) return true;
    return false;
}

// РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ (РґР»СЏ СЂР°Р·СЂР°Р±РѕС‚РєРё)
// Р•СЃР»Рё РµСЃС‚СЊ window.APP_CONFIG РѕС‚ config.local.js, РёСЃРїРѕР»СЊР·СѓРµРј РµРіРѕ Р·РЅР°С‡РµРЅРёСЏ
const APP_CONFIG = {
    /**
     * РњРµРЅСЏР№С‚Рµ РїСЂРё РєР°Р¶РґРѕРј РґРµРїР»РѕРµ: РїРѕР»СЊР·РѕРІР°С‚РµР»Рё РїРѕР»СѓС‡Р°С‚ СЃРІРµР¶РёРµ HTML/JS Р±РµР· Ctrl+F5.
     * Р”РѕР»Р¶РЅРѕ СЃРѕРІРїР°РґР°С‚СЊ СЃ REMINKO_ASSET_VERSION РІ scripts/desktop-only-guard.js.
     */
    assetVersion: '20260724b',
    /**
     * РџСѓР±Р»РёС‡РЅС‹Р№ URL СЃР°Р№С‚Р° Р±РµР· СЃР»СЌС€Р° РІ РєРѕРЅС†Рµ (РґР»СЏ СЃСЃС‹Р»РѕРє РёР· JS). РќР° РїСЂРѕРґРµ Р·Р°РґР°Р№С‚Рµ РІ config.local.js.
     * Р”РѕР»Р¶РµРЅ СЃРѕРІРїР°РґР°С‚СЊ СЃ РґРѕРјРµРЅРѕРј РІ canonical (index.html) Рё sitemap.xml.
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
     * UUID РїСЂРѕС„РёР»СЏ РЎРѕР·РґР°С‚РµР»СЏ РІ Supabase (auth.users / profiles) РґР»СЏ РіРѕСЃС‚РµРІРѕРіРѕ В«РќР°РїРёСЃР°С‚СЊ РЎРѕР·РґР°С‚РµР»СЋВ».
     * Р‘РµР· РЅРµРіРѕ UUID РёС‰РµС‚СЃСЏ РїРѕ profiles.is_site_creator = true, РµСЃР»Рё РІ Р‘Р” РµСЃС‚СЊ С‚Р°РєР°СЏ Р·Р°РїРёСЃСЊ.
     * Р—Р°РґР°Р№С‚Рµ РІ config.local.js РґР»СЏ РіР°СЂР°РЅС‚РёСЂРѕРІР°РЅРЅРѕРіРѕ СЃРѕРІРїР°РґРµРЅРёСЏ.
     */
    siteCreatorUserId: (() => {
        const v = window.APP_CONFIG?.siteCreatorUserId;
        if (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v.trim())) return v.trim();
        // Subarik вЂ” Р·Р°РїР°СЃРЅРѕР№ UUID, РµСЃР»Рё config.local.js РЅРµ Р·Р°РґР°РЅ
        return 'df1fe2c6-e1ad-4d7b-9676-0dc508ac04fb';
    })(),

    // Supabase РЅР°СЃС‚СЂРѕР№РєРё
    supabase: {
        url: window.APP_CONFIG?.supabase?.url || 'https://ipsawgtsicxwkkkipchp.supabase.co',
        // РџСѓР±Р»РёС‡РЅС‹Р№ РєР»СЋС‡: sb_publishable_вЂ¦ РёР»Рё legacy anon JWT. sb_secret_ / service_role вЂ” С‚РѕР»СЊРєРѕ РЅР° СЃРµСЂРІРµСЂРµ.
        anonKey:
            window.APP_CONFIG?.supabase?.anonKey ||
            'sb_publishable_dcESewUuxxhwdhag8VqsDg_NklGox9v'
    },

    // Kodik: РІСЃС‚СЂР°РёРІР°РЅРёРµ С‡РµСЂРµР· Kodik API (kodik-api.com/search), РЅРµ С‡РµСЂРµР· kodik.info/find-player.
    kodik: {
        /** РћСЃРЅРѕРІРЅРѕР№ РїР»РµРµСЂ (СЃСЃС‹Р»РєРё РёР· API РІРµРґСѓС‚ РЅР° kodikplayer.com) */
        playerOrigin:
            (window.APP_CONFIG?.kodik?.playerOrigin || 'https://kodikplayer.com').replace(
                /\/$/,
                ''
            ),
        /** РџР»РµРµСЂ РґР»СЏ СЃРѕС†СЃРµС‚РµР№ */
        socialPlayerOrigin:
            (window.APP_CONFIG?.kodik?.socialPlayerOrigin || 'https://kodikonline.com').replace(
                /\/$/,
                ''
            ),
        /** API Kodik (РґРѕРјРµРЅ Р·Р°РїСЂРѕСЃРѕРІ) */
        apiOrigin:
            (window.APP_CONFIG?.kodik?.apiOrigin || 'https://kodik-api.com').replace(/\/$/, ''),
        /**
         * РўРѕРєРµРЅ Kodik API вЂ” С‚РѕР»СЊРєРѕ config.local.js (Р»РѕРєР°Р»СЊРЅР°СЏ СЂР°Р·СЂР°Р±РѕС‚РєР°).
         * РќР° РїСЂРѕРґРµ: Netlify env KODIK_API_TOKEN + РїСЂРѕРєСЃРё apiProxyUrl (С‚РѕРєРµРЅ РЅРµ РІ С„Р°Р№Р»Р°С…).
         */
        /**
         * РџСЂРѕРєСЃРё Kodik РЅР° Netlify (/.netlify/functions/kodik-proxy). РќР° РїСЂРѕРґРµ Р±РµР· apiToken РІ config.local.js.
         */
        apiProxyUrl:
            typeof window.APP_CONFIG?.kodik?.apiProxyUrl === 'string' &&
            window.APP_CONFIG.kodik.apiProxyUrl.trim()
                ? window.APP_CONFIG.kodik.apiProxyUrl.trim()
                : '/.netlify/functions/kodik-proxy',
        useKodikProxy:
            window.APP_CONFIG?.kodik?.useKodikProxy !== false,
        /**
         * РљРѕРјРїР°РєС‚РЅС‹Р№ РєР°С‚Р°Р»РѕРі РёР· РґР°РјРїР° Kodik (СЃР±РѕСЂРєР°: node scripts/build/kodik-build-catalog.js)
         */
        catalogPath:
            typeof window.APP_CONFIG?.kodik?.catalogPath === 'string' &&
            window.APP_CONFIG.kodik.catalogPath.trim()
                ? window.APP_CONFIG.kodik.catalogPath.trim()
                : 'data/kodik-anime-catalog.json',
        /** РџР°РїРєР° СЃ СЃС‹СЂС‹РјРё РґР°РјРїР°РјРё Kodik (РѕР±РЅРѕРІР»РµРЅРёРµ СЂР°Р· РІ С‡Р°СЃ СЃ kodik-api.com) */
        dumpDir: window.APP_CONFIG?.kodik?.dumpDir || 'kodik base',
        apiToken:
            typeof window.APP_CONFIG?.kodik?.apiToken === 'string'
                ? window.APP_CONFIG.kodik.apiToken.trim()
                : '',
        /**
         * РћРїС†РёРѕРЅР°Р»СЊРЅРѕ: РїРµСЂРµРѕРїСЂРµРґРµР»РµРЅРёРµ РґР»СЏ scripts/kodik-change-domains.js
         * (fromDomains, toDomain, onDomReady)
         */
        domainReplace: window.APP_CONFIG?.kodik?.domainReplace,
        /**
         * Р—Р°РіСЂСѓР·РєР° change-domains.min.js СЃ kodik-add.com (РїРѕРґРјРµРЅР° СЃС‚Р°СЂС‹С… РґРѕРјРµРЅРѕРІ РІ СЃСЃС‹Р»РєР°С… РїР»РµРµСЂР°).
         * РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ РІС‹РєР»СЋС‡РµРЅРѕ.
         */
        loadChangeDomainsScript:
            window.APP_CONFIG?.kodik?.loadChangeDomainsScript === true
    },

    /** Shikimori REST вЂ” РЅР° РїСЂРѕРґРµ С‡РµСЂРµР· /.netlify/functions/shikimori-proxy (CORS) */
    shikimori: {
        apiProxyUrl:
            typeof window.APP_CONFIG?.shikimori?.apiProxyUrl === 'string' &&
            window.APP_CONFIG.shikimori.apiProxyUrl.trim()
                ? window.APP_CONFIG.shikimori.apiProxyUrl.trim()
                : '/.netlify/functions/shikimori-proxy',
        useShikimoriProxy: window.APP_CONFIG?.shikimori?.useShikimoriProxy !== false
    },

    /**
     * Alloha TV вЂ” iframe-РїР»РµРµСЂ. РќР° РїСЂРѕРґРµ: ALLOHA_API_TOKEN РІ Netlify + РїСЂРѕРєСЃРё alloha-proxy.
     * Р›РѕРєР°Р»СЊРЅРѕ: alloha.apiToken РІ config.local.js.
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

    /** РљР°С‚Р°Р»РѕРі СЂСѓСЃСЃРєРѕР№ РјР°РЅРіРё ReManga (СЃР±РѕСЂРєР°: node scripts/build/remanga-build-catalog.js) */
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
     * URL РїСЂРѕРєСЃРё С‡Р°С‚Р° Minko (POST /chat). РќР° РїСЂРѕРґРµ вЂ” Netlify РёР· РїР°РїРєРё minko-netlify-proxy; РёРЅР°С‡Рµ localhost.
     * РџРµСЂРµРѕРїСЂРµРґРµР»РёС‚Рµ РІ config.local.js, РµСЃР»Рё РґСЂСѓРіРѕР№ РїРѕРґРґРѕРјРµРЅ Netlify.
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
            // РћРґРёРЅ РґРµРїР»РѕР№ РЅР° Netlify: POST /chat РЅР° С‚РѕРј Р¶Рµ origin (РєРѕСЂРЅРµРІРѕР№ netlify.toml).
            if (!isLocal && h && (proto === 'https:' || proto === 'http:')) {
                const origin = window.location.origin.replace(/\/$/, '');
                if (origin) return `${origin}/chat`;
            }
        } catch (_) {}
        return 'http://localhost:3334/chat';
    })(),

    /** POST РіРµРЅРµСЂР°С†РёРё Р°РІР°С‚Р°СЂР° (OpenAI С‡РµСЂРµР· РїСЂРѕРєСЃРё BOT). РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ С‚РѕС‚ Р¶Рµ С…РѕСЃС‚, С‡С‚Рѕ Рё С‡Р°С‚, РїСѓС‚СЊ /avatar */
    minkoAvatarProxy:
        typeof window.APP_CONFIG?.minkoAvatarProxy === 'string' && window.APP_CONFIG.minkoAvatarProxy.trim()
            ? window.APP_CONFIG.minkoAvatarProxy.trim()
            : null,

    /**
     * POST/GET РіРµРЅРµСЂР°С†РёРё Р°РІР°С‚Р°СЂР° С‡РµСЂРµР· Grok (xAI) РЅР° Netlify.
     * РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ: /.netlify/functions/minko-avatar-grok РЅР° С‚РѕРј Р¶Рµ origin (РЅРµ localhost).
     * РќР° localhost Р·Р°РґР°Р№С‚Рµ РїРѕР»РЅС‹Р№ URL РґРµРїР»РѕСЏ РІ config.local.js.
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
     * РћРїС†РёРѕРЅР°Р»СЊРЅРѕ: URL РґР»СЏ РїСЂРѕРІРµСЂРєРё В«РєР°СЂС‚РёРЅРѕС‡РЅРѕРіРѕВ» РїСЂРѕРєСЃРё (Grok) РІ СЃС‚Р°С‚СѓСЃРµ С‡Р°С‚Р°.
     * РќР° РїСЂРѕРґРµ localhost:3333 РЅРµ РїРёРЅРіСѓРµРј; Р·Р°РґР°Р№С‚Рµ РїСѓР±Р»РёС‡РЅС‹Р№ health, РµСЃР»Рё РЅСѓР¶РµРЅ С‚РѕС‡РЅС‹Р№ С„Р»Р°Рі.
     */
    minkoGrokHealth:
        typeof window.APP_CONFIG?.minkoGrokHealth === 'string' && window.APP_CONFIG.minkoGrokHealth.trim()
            ? window.APP_CONFIG.minkoGrokHealth.trim()
            : null,

    // Minko AI РёСЃРїРѕР»СЊР·СѓРµС‚ С‚РѕР»СЊРєРѕ Grok С‡РµСЂРµР· Р»РѕРєР°Р»СЊРЅС‹Р№ РїСЂРѕРєСЃРё

    // РќР°СЃС‚СЂРѕР№РєРё РѕРєСЂСѓР¶РµРЅРёСЏ
    environment: {
        isDev: window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ||
               window.location.search.includes('debug=true'),
        isProduction: !window.location.hostname.includes('localhost') && 
                      !window.location.hostname.includes('127.0.0.1')
    },

    /**
     * Р РµРєР»Р°РјРЅС‹Рµ Р±Р»РѕРєРё РЇРЅРґРµРєСЃР° (Р РЎРЇ) РґР»СЏ РѕС‚РґРµР»СЊРЅС‹С… СЃС‚СЂР°РЅРёС†.
     * ID Р±Р»РѕРєРѕРІ РІРёРґР° R-A-12345678-1 РёР· РєР°Р±РёРЅРµС‚Р° Р РЎРЇ в†’ РљРѕРЅСЃС‚СЂСѓРєС‚РѕСЂ в†’ РљРѕРґ Р±Р»РѕРєР°.
     * Р—Р°РґР°С‘С‚СЃСЏ РІ config.local.js: window.APP_CONFIG.yandexRtb = { infoPageBlockIds: ['R-A-...'] };
     */
    yandexRtb: {
        infoPageBlockIds: Array.isArray(window.APP_CONFIG?.yandexRtb?.infoPageBlockIds)
            ? window.APP_CONFIG.yandexRtb.infoPageBlockIds.filter(
                  (id) => typeof id === 'string' && id.trim().length > 0
              )
            : []
    },

    /**
     * в‰€4K: Р»РёРјРёС‚ СЂР°Р·РјРµСЂР° РѕРґРЅРѕРіРѕ С„Р°Р№Р»Р° РґР»СЏ Р·Р°РіСЂСѓР·РєРё РІ Supabase Storage (Р±Р°Р№С‚С‹).
     * РќР° Free С‚Р°СЂРёС„Рµ РіР»РѕР±Р°Р»СЊРЅС‹Р№ Р»РёРјРёС‚ Supabase вЂ” 50 MB (bucket 5 GB РЅРµ РїРѕРјРѕРіР°РµС‚).
     * РџРѕСЃР»Рµ Pro: Dashboard в†’ Storage в†’ Settings в†’ Global file size limit (РґРѕ 5 GB),
     * Р·Р°С‚РµРј РІ config.local.js: anime4k: { maxUploadBytes: 5368709120 }
     */
    anime4k: {
        maxUploadBytes:
            window.APP_CONFIG?.anime4k?.maxUploadBytes != null &&
            Number.isFinite(Number(window.APP_CONFIG.anime4k.maxUploadBytes))
                ? Number(window.APP_CONFIG.anime4k.maxUploadBytes)
                : 52_428_800
    }
    
};

// Р­РєСЃРїРѕСЂС‚РёСЂСѓРµРј РєРѕРЅС„РёРіСѓСЂР°С†РёСЋ
window.APP_CONFIG = APP_CONFIG;

function reminkoAssetVersion() {
    return (
        (typeof window !== 'undefined' && window.REMINKO_ASSET_VERSION) ||
        APP_CONFIG.assetVersion ||
        '1'
    );
}
window.reminkoAssetVersion = reminkoAssetVersion;

// Р”Р»СЏ РѕР±СЂР°С‚РЅРѕР№ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё
if (typeof SUPABASE_URL === 'undefined') {
    window.SUPABASE_URL = APP_CONFIG.supabase.url;
    window.SUPABASE_ANON_KEY = APP_CONFIG.supabase.anonKey;
}

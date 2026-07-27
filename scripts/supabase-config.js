// Supabase конфигурация
// Использует конфигурацию из config.js
// Для изменения настроек отредактируйте scripts/config.js

const SUPABASE_URL = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.supabase?.url) 
    ? APP_CONFIG.supabase.url 
    : 'https://ipsawgtsicxwkkkipchp.supabase.co';
    
const SUPABASE_ANON_KEY = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.supabase?.anonKey) 
    ? APP_CONFIG.supabase.anonKey 
    : 'sb_publishable_dcESewUuxxhwdhag8VqsDg_NklGox9v';

// Инициализация Supabase клиента
let supabaseClient = null;

// Функция инициализации Supabase
function initSupabase() {
    // Проверяем, доступен ли Supabase SDK
    if (typeof supabase === 'undefined') {
        if (typeof logger !== 'undefined') logger.error('Supabase библиотека не загружена! Убедитесь, что скрипт Supabase подключен в HTML перед этим файлом.');
        return null;
    }
    
    // Проверяем, что URL и ключ указаны
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        if (typeof logger !== 'undefined') logger.warn('⚠️ Supabase не настроен! Укажите SUPABASE_URL и SUPABASE_ANON_KEY в scripts/supabase-config.js');
        return null;
    }
    
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                flowType: 'pkce',
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        });
        if (typeof logger !== 'undefined') logger.log('✅ Supabase клиент инициализирован');
        return supabaseClient;
    } catch (error) {
        if (typeof logger !== 'undefined') logger.error('❌ Ошибка при инициализации Supabase:', error);
        return null;
    }
}

// Инициализируем клиент
supabaseClient = initSupabase();

// Экспортируем клиент для использования в других модулях
window.supabaseClient = supabaseClient;

// Функция для проверки подключения
async function checkSupabaseConnection() {
    if (!supabaseClient) {
        if (typeof logger !== 'undefined') logger.error('Supabase клиент не инициализирован');
        return false;
    }
    
    try {
        // Проверяем подключение через auth.getSession() - это более надежный способ
        const { data, error } = await supabaseClient.auth.getSession();
        
        // Если нет ошибки или ошибка связана только с отсутствием сессии - подключение работает
        if (!error || error.message?.includes('session') || error.message?.includes('JWT')) {
            if (typeof logger !== 'undefined') logger.log('✅ Supabase подключение успешно');
            return true;
        }
        
        // Если другая ошибка - возможно проблема с подключением
        if (typeof logger !== 'undefined') logger.warn('⚠️ Предупреждение при проверке подключения:', error);
        return true; // Все равно считаем что подключение работает, так как клиент создан
    } catch (error) {
        // Если ошибка сети - это проблема
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
            if (typeof logger !== 'undefined') logger.error('❌ Ошибка сети при подключении к Supabase:', error);
            return false;
        }
        if (typeof logger !== 'undefined') logger.warn('⚠️ Предупреждение при проверке подключения:', error);
        return true; // В остальных случаях считаем что подключение работает
    }
}

// Проверяем подключение при загрузке
if (supabaseClient) {
    checkSupabaseConnection();
}

function reminkoSyncAuthStorage(session) {
    if (session && session.user) {
        localStorage.setItem('isAuth', 'true');
        localStorage.setItem('userId', session.user.id);
        let prev = {};
        try {
            prev = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        } catch (_) {
            prev = {};
        }
        const prevAv = String(prev.avatar || '')
            .trim()
            .replace(/^\/+/, '');
        sessionStorage.setItem(
            'currentUser',
            JSON.stringify({
                id: session.user.id,
                email: session.user.email || prev.email || '',
                username:
                    prev.username ||
                    (session.user.email && session.user.email.split('@')[0]) ||
                    'Пользователь',
                // Не затираем реальный аватар дефолтом и без ведущего «/»
                avatar: prevAv || 'Fons/1 b.jpg'
            })
        );
    } else {
        localStorage.removeItem('isAuth');
        localStorage.removeItem('userId');
        sessionStorage.removeItem('currentUser');
    }
    if (typeof window.clearUserCache === 'function') {
        window.clearUserCache();
    }
    if (window.navigationManager && typeof window.navigationManager.updateAuthLinks === 'function') {
        queueMicrotask(() => window.navigationManager.updateAuthLinks());
    }
    if (typeof window.checkAuth === 'function') {
        queueMicrotask(() => window.checkAuth());
    }
}
window.reminkoSyncAuthStorage = reminkoSyncAuthStorage;

function reminkoScheduleServerAuthValidate(reason) {
    const run = () => {
        if (typeof window.reminkoValidateServerAuthOrSignOut === 'function') {
            window.reminkoValidateServerAuthOrSignOut(reason);
        }
    };
    setTimeout(run, 0);
}

if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session && session.user) {
            reminkoSyncAuthStorage(session);
            reminkoScheduleServerAuthValidate('initial');
        }
    });
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            reminkoSyncAuthStorage(null);
            return;
        }
        if (event === 'INITIAL_SESSION') {
            if (session && session.user) {
                reminkoSyncAuthStorage(session);
                reminkoScheduleServerAuthValidate('initial');
            } else {
                reminkoSyncAuthStorage(null);
            }
            return;
        }
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session && session.user) {
            reminkoSyncAuthStorage(session);
            if (event === 'TOKEN_REFRESHED') {
                reminkoScheduleServerAuthValidate('token');
            }
            if (event === 'SIGNED_IN' && session.user) {
                try {
                    const k = 'reminko_login_evt_' + session.user.id;
                    if (!sessionStorage.getItem(k)) {
                        sessionStorage.setItem(k, '1');
                        if (typeof window.reminkoTrackSiteEvent === 'function') {
                            void window.reminkoTrackSiteEvent('login', {
                                provider: session.user.app_metadata?.provider || 'session'
                            });
                        }
                    }
                } catch (_) {
                    /* ignore */
                }
            }
        }
        if (typeof window.reminkoApplySidebarMaintenanceLocks === 'function') {
            queueMicrotask(() => window.reminkoApplySidebarMaintenanceLocks());
        }
    });
}

const REMINKO_CREATOR_EMAIL = 'creator@reminko.com';
const REMINKO_MAINT_STORAGE_KEY = 'reminko_maintenance_v1';
/** Ключи data-maint-lock, открытые даже без записи в extra_allowed_routes (см. reminkoPathAllowedDuringMaintenance). */
const REMINKO_MAINT_ALWAYS_UNLOCK_KEYS = new Set(['messages']);

function reminkoMaintPathname() {
    return String(window.location.pathname || '').replace(/\\/g, '/');
}

/** Информационная страница: info.html, /info, /info/ (часто без расширения на хостинге). */
function reminkoPathIsInfoPage(pathname) {
    const p = String(pathname || '').toLowerCase().replace(/\\/g, '/');
    const file = p.split('/').filter(Boolean).pop() || '';
    if (file === 'info.html' || file === 'info.htm') return true;
    if (file === 'info') return true;
    if (p.includes('info.html') || p.includes('info.htm')) return true;
    if (/\/info\/?$/i.test(p)) return true;
    return false;
}

/** Юридические страницы — всегда доступны (OAuth, подвал меню, регистрация). */
function reminkoPathIsLegalPage(pathname) {
    const p = String(pathname || '').toLowerCase().replace(/\\/g, '/');
    const file = p.split('/').filter(Boolean).pop() || '';
    if (file === 'privacy-policy.html' || file === 'privacy-policy.htm') return true;
    if (file === 'terms-of-service.html' || file === 'terms-of-service.htm') return true;
    if (file === 'account-deletion.html' || file === 'account-deletion.htm') return true;
    if (p.includes('privacy-policy') || p.includes('terms-of-service') || p.includes('account-deletion')) return true;
    return false;
}

function reminkoPathMatchesExtraRoute(pathname, key) {
    const p = pathname.toLowerCase();
    const file = p.split('/').pop() || '';
    switch (key) {
        case 'info':
            return reminkoPathIsInfoPage(pathname);
        case 'home':
            return file === 'index.html' || (p.endsWith('/') && !file.includes('.'));
        case 'messages':
            return file === 'messages.html';
        case 'friends':
            return file === 'friends.html';
        case 'watch_together':
            return file === 'watch-together.html';
        case 'profile':
            return file === 'profile.html';
        case 'favorites':
            return file === 'favorites.html';
        case 'history':
            return file === 'history.html';
        case 'favorites-manga':
            return file === 'favorites-manga.html';
        case 'manga_catalog':
            return (
                p.includes('/catalog/manga') ||
                (file === 'manga.html' && p.includes('catalog')) ||
                (p.includes('/manga/') && (file === 'view.html' || file === 'reader.html'))
            );
        case 'minko_ai':
            return file === 'minko-ai.html';
        case 'calendar':
            return p.includes('/catalog/calendar') || file === 'calendar.html';
        case 'anime_4k':
            return p.includes('/catalog/anime-4k') || file === 'anime-4k.html';
        case 'admin':
            return file === 'admin.html';
        case 'privacy':
            return reminkoPathIsLegalPage(pathname) && (file === 'privacy-policy.html' || p.includes('privacy-policy'));
        case 'terms':
            return reminkoPathIsLegalPage(pathname) && (file === 'terms-of-service.html' || p.includes('terms-of-service'));
        case 'reader':
            return file === 'reader.html';
        case 'support':
            return false;
        case 'register':
            return false;
        default:
            return false;
    }
}

function reminkoPathAllowedDuringMaintenance(pathname, extraRoutes) {
    const p = pathname.toLowerCase();
    const file = p.split('/').pop() || '';
    if (reminkoPathIsInfoPage(pathname)) return true;
    if (reminkoPathIsLegalPage(pathname)) return true;
    if (file === 'index.html' || (p.endsWith('/') && (!file || !file.includes('.')))) return true;
    if (p.includes('/catalog/anime-4k') || file === 'anime-4k.html') return true;
    if (p.includes('/anime/') && file === 'view-4k.html') return true;
    if (p.includes('/catalog/anime') || (file === 'anime.html' && p.includes('catalog'))) return true;
    if (p.includes('/anime/') && file === 'view.html') return true;
    if (p.includes('/catalog/manga') || (file === 'manga.html' && p.includes('catalog'))) return true;
    if (p.includes('/manga/') && (file === 'view.html' || file === 'reader.html')) return true;
    if (file === 'reset-password.html' || file === 'payment-success.html' || file === 'cancel-success.html') {
        return true;
    }
    // ЛС и гостевой «Написать Создателю» (messages.html?creator=1) — не дублируем в extra_allowed_routes
    if (file === 'messages.html') {
        return true;
    }

    const extras = new Set(extraRoutes || []);
    for (const k of extras) {
        if (reminkoPathMatchesExtraRoute(pathname, k)) return true;
    }
    return false;
}

async function reminkoFetchMaintenanceConfig() {
    let fallback = null;
    try {
        const raw = localStorage.getItem(REMINKO_MAINT_STORAGE_KEY);
        if (raw) fallback = JSON.parse(raw);
    } catch (_) {
        fallback = null;
    }

    if (!supabaseClient) {
        return (
            fallback || {
                maintenance_enabled: false,
                extra_allowed_routes: []
            }
        );
    }

    const { data, error } = await supabaseClient
        .from('site_maintenance_config')
        .select('maintenance_enabled, extra_allowed_routes')
        .eq('id', 1)
        .maybeSingle();

    if (error || !data) {
        return (
            fallback || {
                maintenance_enabled: false,
                extra_allowed_routes: []
            }
        );
    }
    return data;
}

async function reminkoIsUserSiteCreator() {
    if (!supabaseClient) return false;
    try {
        const {
            data: { session }
        } = await supabaseClient.auth.getSession();
        if (!session || !session.user) return false;
        const em = (session.user.email || '').toLowerCase().trim();
        if (em === REMINKO_CREATOR_EMAIL) return true;
        const { data: ok, error } = await supabaseClient.rpc('is_site_creator_user_id', {
            user_id: session.user.id
        });
        if (!error && ok === true) return true;
    } catch (_) {
        /* ignore */
    }
    return false;
}

window.reminkoIsUserSiteCreator = reminkoIsUserSiteCreator;

let __reminkoMaintGatePromise = null;

function reminkoMaintAssetPrefix() {
    const p = reminkoMaintPathname();
    if (p.includes('/catalog/') || p.includes('/anime/') || p.includes('/manga/')) return '../';
    return '';
}

function reminkoShowMaintenanceOverlay() {
    if (document.getElementById('reminkoMaintenanceOverlay')) return;
    window.__reminkoMaintenancePageReplaced = true;
    const pre = reminkoMaintAssetPrefix();
    const wrap = document.createElement('div');
    wrap.id = 'reminkoMaintenanceOverlay';
    wrap.className = 'reminko-maintenance-overlay';
    wrap.innerHTML =
        '<div class="reminko-maintenance-overlay-card">' +
        '<h1 class="reminko-maintenance-title">Раздел в доработке</h1>' +
        '<p class="reminko-maintenance-text">Эта страница временно закрыта. Загляните на главную, в каталог аниме или на страницу «Инфо».</p>' +
        '<div class="reminko-maintenance-actions">' +
        `<a class="reminko-maintenance-btn" href="${pre}index.html">На главную</a>` +
        `<a class="reminko-maintenance-btn reminko-maintenance-btn-secondary" href="${pre}info.html">Инфо</a>` +
        '</div></div>';
    document.body.appendChild(wrap);
    document.body.classList.add('reminko-maintenance-active');
    if (typeof hideLoading === 'function') hideLoading();
}

window.reminkoEnsureMaintenanceGate = async function reminkoEnsureMaintenanceGate() {
    if (__reminkoMaintGatePromise) return __reminkoMaintGatePromise;
    __reminkoMaintGatePromise = (async () => {
        const config = await reminkoFetchMaintenanceConfig();
        window.__reminkoMaintenance = {
            enabled: !!(config && config.maintenance_enabled),
            extra_allowed_routes: (config && config.extra_allowed_routes) || []
        };

        if (!window.__reminkoMaintenance.enabled) {
            window.__reminkoMaintenancePageReplaced = false;
            return;
        }

        const creator = await reminkoIsUserSiteCreator();
        if (creator) {
            window.__reminkoMaintenancePageReplaced = false;
            return;
        }

        const path = reminkoMaintPathname();
        if (reminkoPathAllowedDuringMaintenance(path, window.__reminkoMaintenance.extra_allowed_routes)) {
            window.__reminkoMaintenancePageReplaced = false;
            return;
        }

        reminkoShowMaintenanceOverlay();
    })();
    return __reminkoMaintGatePromise;
};

const LOCK_SVG =
    '<svg class="reminko-maint-lock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';

window.reminkoApplySidebarMaintenanceLocks = async function reminkoApplySidebarMaintenanceLocks() {
    const rows = document.querySelectorAll('[data-maint-lock]');
    if (!rows.length) return;

    const enabled = window.__reminkoMaintenance && window.__reminkoMaintenance.enabled;
    const extras = new Set((window.__reminkoMaintenance && window.__reminkoMaintenance.extra_allowed_routes) || []);
    const creator = enabled ? await reminkoIsUserSiteCreator() : false;

    rows.forEach((el) => {
        const key = el.getAttribute('data-maint-lock');
        if (!key) return;

        const shouldLock =
            enabled && !creator && !extras.has(key) && !REMINKO_MAINT_ALWAYS_UNLOCK_KEYS.has(key);
        const tag = el.tagName;
        const isAnchor = tag === 'A' && el.hasAttribute('href');

        if (!shouldLock) {
            el.classList.remove('reminko-maint-locked', 'sidebar-link--maint-locked');
            el.removeAttribute('aria-disabled');
            if (el.hasAttribute('data-maint-href-backup')) {
                const backupHref = el.getAttribute('data-maint-href-backup');
                if (isAnchor) {
                    if (backupHref !== '') el.setAttribute('href', backupHref);
                    else el.setAttribute('href', '#');
                }
                el.removeAttribute('data-maint-href-backup');
            }
            if (el.hasAttribute('data-maint-disabled-backup')) {
                const wasDisabled = el.getAttribute('data-maint-disabled-backup') === '1';
                if (tag === 'BUTTON' || tag === 'INPUT' || el.getAttribute('role') === 'button') {
                    el.disabled = wasDisabled;
                }
                el.removeAttribute('data-maint-disabled-backup');
            }
            const backupTitle = el.getAttribute('data-maint-title-backup');
            if (backupTitle != null) {
                if (backupTitle === '') el.removeAttribute('title');
                else el.setAttribute('title', backupTitle);
            }
            el.removeAttribute('data-maint-title-backup');
            const ic = el.querySelector('.reminko-maint-lock-icon');
            if (ic) ic.remove();
            return;
        }

        if (isAnchor) {
            if (!el.hasAttribute('data-maint-href-backup')) {
                const h = el.getAttribute('href');
                el.setAttribute('data-maint-href-backup', h == null ? '' : h);
            }
            el.setAttribute('href', '#');
        } else {
            if (!el.hasAttribute('data-maint-disabled-backup')) {
                el.setAttribute('data-maint-disabled-backup', el.disabled ? '1' : '0');
            }
            el.disabled = true;
        }
        if (!el.hasAttribute('data-maint-title-backup')) {
            const t = el.getAttribute('title');
            el.setAttribute('data-maint-title-backup', t == null ? '' : t);
        }
        el.setAttribute('title', 'Разрабатывается');
        el.setAttribute('aria-disabled', 'true');
        el.classList.add('reminko-maint-locked', 'sidebar-link--maint-locked');
        if (!el.querySelector('.reminko-maint-lock-icon')) {
            el.insertAdjacentHTML('beforeend', LOCK_SVG);
        }
    });
};

if (!window.__reminkoMaintNavClickBound) {
    window.__reminkoMaintNavClickBound = true;
    document.addEventListener(
        'click',
        (e) => {
            const t = e.target.closest('.reminko-maint-locked');
            if (t) {
                e.preventDefault();
                e.stopPropagation();
            }
        },
        true
    );
}

// --- Учёт посещений страниц (дашборд создателя; не трекаем панель admin)
(function reminkoSiteVisitTracking() {
    const LS_VISITOR = 'reminko_visitor_id_v1';
    const SS_DEDUP = 'reminko_pv_dedup_v1';

    function skipPage() {
        try {
            const p = (window.location.pathname || '').toLowerCase();
            const f = p.split('/').pop() || '';
            if (f === 'admin.html') return true;
        } catch (_) {
            /* ignore */
        }
        return false;
    }

    function getVisitorId() {
        try {
            let v = localStorage.getItem(LS_VISITOR);
            if (v && v.length >= 16) return v.slice(0, 64);
            v = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2);
            localStorage.setItem(LS_VISITOR, v);
            return v.slice(0, 64);
        } catch (_) {
            return ('sess-' + Date.now()).slice(0, 64);
        }
    }

    async function sendVisitPayload(payload) {
        let accessToken = '';
        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const {
                    data: { session }
                } = await supabaseClient.auth.getSession();
                accessToken = session?.access_token || '';
            }
        } catch (_) {
            /* anonymous event */
        }

        const headers = { 'Content-Type': 'application/json' };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        try {
            await fetch('/.netlify/functions/site-visit-ingest', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                keepalive: true,
                credentials: 'omit'
            });
        } catch (_) {
            /* аналитика не должна мешать странице */
        }
    }

    async function sendPageView() {
        if (skipPage()) return;
        if (window.__reminkoSiteVisitPageviewSent) return;
        const path = String(window.location.pathname || '') + String(window.location.search || '');
        if (!path || path.length > 2048) return;

        try {
            const raw = sessionStorage.getItem(SS_DEDUP);
            const now = Date.now();
            if (raw) {
                const o = JSON.parse(raw);
                if (o && o.p === path && now - o.t < 25000) return;
            }
            sessionStorage.setItem(SS_DEDUP, JSON.stringify({ p: path, t: now }));
        } catch (_) {
            /* ignore */
        }

        window.__reminkoSiteVisitPageviewSent = true;
        const payload = {
            visitor_id: getVisitorId(),
            path: path.slice(0, 2048),
            page_title: String(document.title || '').slice(0, 300) || null,
            referrer: String(document.referrer || '').slice(0, 1000) || null,
            event_kind: 'pageview',
            event_label: null,
            meta: null
        };

        await sendVisitPayload(payload);
    }

    /**
     * Доп. событие (кнопка, действие). label — короткая метка, meta — JSON-совместимый объект.
     */
    window.reminkoTrackSiteEvent = async function reminkoTrackSiteEvent(label, meta) {
        if (skipPage()) return;
        const path = String(window.location.pathname || '') + String(window.location.search || '');
        const payload = {
            visitor_id: getVisitorId(),
            path: path.slice(0, 2048),
            page_title: String(document.title || '').slice(0, 300) || null,
            referrer: null,
            event_kind: 'action',
            event_label: label ? String(label).slice(0, 200) : null,
            meta: meta && typeof meta === 'object' ? meta : null
        };
        await sendVisitPayload(payload);
    };

    async function sendHeartbeat() {
        if (skipPage()) return;
        const path = String(window.location.pathname || '') + String(window.location.search || '');
        const payload = {
            visitor_id: getVisitorId(),
            path: path.slice(0, 2048),
            page_title: String(document.title || '').slice(0, 300) || null,
            referrer: null,
            event_kind: 'action',
            event_label: 'heartbeat',
            meta: { ts: Date.now() }
        };
        await sendVisitPayload(payload);
    }

    window.reminkoSendSiteHeartbeat = sendHeartbeat;

    function boot() {
        sendPageView();
        sendHeartbeat();
        if (!window.__reminkoSiteHeartbeatTimer) {
            window.__reminkoSiteHeartbeatTimer = setInterval(sendHeartbeat, 45000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

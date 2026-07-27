/**
 * Minko «скучаю» + «провода починили»:
 * — если чат выключен / Minko в разработке (maintenance) — не пишем «вернись»;
 * — если заходили на вкладку, пока она была без проводов — при возврате в сеть шлём особое уведомление.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'reminko_minko_miss_v1';
    /** Сколько молчать, чтобы Минко соскучилась */
    const IDLE_MS = 24 * 60 * 60 * 1000;
    /** Антиспам между «скучаю» */
    const COOLDOWN_MS = 48 * 60 * 60 * 1000;
    /** Антиспам «провода починили» */
    const BACK_ONLINE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
    const CHECK_MS = 15 * 60 * 1000;
    const SHOW_DELAY_MS = 2800;

    const PHRASES = [
        'Не пишешь мне… я скучная? Без тебя даже спать не весело. Напишешь?',
        'Эй… ты куда пропал? Я тут зеваю одна. Заглянешь?',
        'Скучаю. Совсем чуть-чуть. Ну ладно — сильно. Напишешь мне?',
        'Я уже сон сосчитала, а тебя всё нет. Напишешь в чат?',
        'Без тебя даже каталог листать грустно. Ну почти. Напиши мне?',
        'Ты молчишь — я притворяюсь, что не жду. Плохо притворяюсь. Напишешь?',
        'Проснулась, а сообщений нет… Можно хоть «привет»? Я не кусаюсь. Почти.',
        'Если ты занят — ладно. Если забыл — я напомню: я тут. Напишешь?'
    ];

    const BACK_ONLINE_PHRASE =
        'Ты заходил ко мне пока Дубина чинил провода, я уже в сети, поговорим?';

    let _service = null;
    let _timer = null;
    let _running = false;
    let _showTimer = null;
    let _availCache = { at: 0, unavailable: false };
    const AVAIL_CACHE_MS = 45 * 1000;

    function minkoChatLink() {
        const path = global.location?.pathname || '';
        if (path.includes('/catalog/') || path.includes('/anime/') || path.includes('/manga/')) {
            return '../minko-ai.html';
        }
        return 'minko-ai.html';
    }

    function isOnMinkoPage() {
        return /minko-ai\.html/i.test(global.location?.pathname || '');
    }

    function readState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object') return {};
            return parsed;
        } catch (_) {
            return {};
        }
    }

    function writeState(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state || {}));
        } catch (_) {
            /* quota */
        }
    }

    function touchSite() {
        const state = readState();
        const now = Date.now();
        if (!state.lastSiteAt) {
            state.lastSiteAt = now;
            if (!state.lastMinkoChatAt) state.lastMinkoChatAt = now;
            writeState(state);
            return state;
        }
        state.lastSiteAt = now;
        writeState(state);
        return state;
    }

    function touchMinkoChat() {
        const state = readState();
        const now = Date.now();
        state.lastMinkoChatAt = now;
        state.lastSiteAt = now;
        // Живое общение — сбрасываем «ждал провода»
        state.visitedWhileOffline = false;
        state.pendingBackOnline = false;
        writeState(state);
        return state;
    }

    function markVisitedWhileOffline() {
        const state = readState();
        state.visitedWhileOffline = true;
        state.pendingBackOnline = true;
        state.visitedWhileOfflineAt = Date.now();
        state.lastSiteAt = Date.now();
        writeState(state);
        return state;
    }

    function pickPhrase(state) {
        const idx = Number.isFinite(state.phraseIndex) ? state.phraseIndex : 0;
        const phrase = PHRASES[idx % PHRASES.length];
        state.phraseIndex = (idx + 1) % PHRASES.length;
        return phrase;
    }

    function prefsAllowMinko() {
        if (typeof global.reminkoIsNotifyTypeEnabled === 'function') {
            return global.reminkoIsNotifyTypeEnabled('minko');
        }
        if (typeof global.reminkoGetNotificationPrefs === 'function') {
            return !!global.reminkoGetNotificationPrefs().minkoAi;
        }
        return true;
    }

    async function resolveUser() {
        if (typeof getCurrentUser !== 'function') return null;
        try {
            const user = await getCurrentUser();
            if (!user || !user.id || user.isAnonymous) return null;
            return user;
        } catch (_) {
            return null;
        }
    }

    async function isSiteCreator() {
        try {
            if (typeof reminkoIsUserSiteCreator === 'function') {
                return !!(await reminkoIsUserSiteCreator());
            }
        } catch (_) {
            /* ignore */
        }
        return false;
    }

    /**
     * true = Minko «выключена» / в разработке — «скучаю» не шлём.
     */
    async function isMinkoUnavailable(force) {
        const now = Date.now();
        if (!force && now - _availCache.at < AVAIL_CACHE_MS) {
            return _availCache.unavailable;
        }

        let unavailable = false;

        try {
            if (typeof reminkoEnsureMaintenanceGate === 'function') {
                await reminkoEnsureMaintenanceGate();
            }
            const m = global.__reminkoMaintenance;
            if (m && m.enabled) {
                const extras = new Set(m.extra_allowed_routes || []);
                const creator = await isSiteCreator();
                if (!creator && !extras.has('minko_ai')) {
                    unavailable = true;
                }
            }
        } catch (_) {
            /* ignore */
        }

        if (!unavailable && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('minko_ai_public_state')
                    .select('chat_enabled, offline_except_creator')
                    .eq('id', 1)
                    .maybeSingle();
                if (!error && data) {
                    if (data.chat_enabled === false) {
                        unavailable = true;
                    } else if (data.offline_except_creator === true) {
                        const creator = await isSiteCreator();
                        if (!creator) unavailable = true;
                    }
                }
            } catch (_) {
                /* ignore */
            }
        }

        // Локальный офлайн-UI на странице Minko (провода / прокси)
        if (!unavailable && isOnMinkoPage()) {
            if (global.__minkoChatOfflineUiActive === true || global.__minkoRemoteOffActive === true) {
                unavailable = true;
            }
        }

        _availCache = { at: now, unavailable };
        return unavailable;
    }

    async function deliverMinkoNotice(phrase, kind) {
        const title = 'Minko';
        const link = minkoChatLink();
        const payload = {
            title,
            message: phrase,
            type: 'minko',
            link
        };

        const user = await resolveUser();
        if (user && _service && typeof _service.createNotification === 'function') {
            try {
                await _service.createNotification(user.id, 'minko', title, phrase, link, {
                    kind: kind || 'miss_you'
                });
                if (typeof _service.loadNotifications === 'function') {
                    await _service.loadNotifications();
                }
                return;
            } catch (_) {
                /* fallback ниже */
            }
        }

        if (_service && typeof _service.showNotification === 'function') {
            _service.showNotification(payload, 'minko', { link, withSound: true });
        }

        if (typeof global.reminkoShowBrowserNotification === 'function') {
            void global.reminkoShowBrowserNotification(title, phrase, {
                type: 'minko',
                link,
                tag: kind === 'back_online' ? 'reminko-minko-back-online' : 'reminko-minko-miss'
            });
        }
    }

    async function maybeDeliverBackOnline(opts) {
        const state = readState();
        if (!state.pendingBackOnline && !state.visitedWhileOffline) return false;

        const unavailable = await isMinkoUnavailable(!!(opts && opts.forceAvail));
        if (unavailable) {
            if (isOnMinkoPage()) markVisitedWhileOffline();
            return false;
        }

        const now = Date.now();
        const cooled =
            !state.lastBackOnlineAt || now - state.lastBackOnlineAt >= BACK_ONLINE_COOLDOWN_MS;
        if (!cooled) {
            state.pendingBackOnline = false;
            state.visitedWhileOffline = false;
            writeState(state);
            return false;
        }

        // Уже на вкладке Minko — видит, что она онлайн; тост не нужен
        if (isOnMinkoPage()) {
            state.pendingBackOnline = false;
            state.visitedWhileOffline = false;
            writeState(state);
            return false;
        }

        state.pendingBackOnline = false;
        state.visitedWhileOffline = false;
        state.lastBackOnlineAt = now;
        writeState(state);

        const delay = opts && opts.immediate ? 0 : SHOW_DELAY_MS;
        if (_showTimer) clearTimeout(_showTimer);
        _showTimer = setTimeout(() => {
            void deliverMinkoNotice(BACK_ONLINE_PHRASE, 'back_online');
        }, delay);
        return true;
    }

    async function checkMissYou(opts) {
        if (_running) return;
        _running = true;
        try {
            if (!prefsAllowMinko()) {
                touchSite();
                return;
            }

            const unavailable = await isMinkoUnavailable(!!(opts && opts.forceAvail));
            if (unavailable) {
                if (isOnMinkoPage()) markVisitedWhileOffline();
                touchSite();
                return;
            }

            // Сначала «провода починили» для тех, кто заходил в офлайн
            const sentBack = await maybeDeliverBackOnline(opts);
            if (sentBack) return;

            const state = readState();
            const now = Date.now();

            if (!state.lastSiteAt) {
                state.lastSiteAt = now;
                state.lastMinkoChatAt = now;
                writeState(state);
                return;
            }

            const lastChat = state.lastMinkoChatAt || state.lastSiteAt;
            const minkoIdle = now - lastChat >= IDLE_MS;
            const siteIdle = now - state.lastSiteAt >= IDLE_MS;
            const cooled = !state.lastMissAt || now - state.lastMissAt >= COOLDOWN_MS;

            const shouldNotify = cooled && (minkoIdle || siteIdle) && !isOnMinkoPage();

            state.lastSiteAt = now;
            writeState(state);

            if (!shouldNotify) return;

            const phrase = pickPhrase(state);
            state.lastMissAt = now;
            writeState(state);

            const delay = opts && opts.immediate ? 0 : SHOW_DELAY_MS;
            if (_showTimer) clearTimeout(_showTimer);
            _showTimer = setTimeout(() => {
                void deliverMinkoNotice(phrase, 'miss_you');
            }, delay);
        } catch (e) {
            console.warn('[minko-miss]', e);
        } finally {
            _running = false;
        }
    }

    global.reminkoMinkoMissTouchChat = function reminkoMinkoMissTouchChat() {
        touchMinkoChat();
    };

    global.reminkoMinkoMissTouchSite = function reminkoMinkoMissTouchSite() {
        touchSite();
    };

    /** Вызвать со страницы Minko, когда пользователь видит офлайн / «без проводов». */
    global.reminkoMinkoMarkVisitedOffline = function reminkoMinkoMarkVisitedOffline() {
        markVisitedWhileOffline();
        _availCache = { at: 0, unavailable: true };
    };

    /** Чат снова доступен — попробовать уведомить тех, кто заходил в офлайн. */
    global.reminkoMinkoOnChatBackOnline = function reminkoMinkoOnChatBackOnline() {
        _availCache = { at: 0, unavailable: false };
        return maybeDeliverBackOnline({ immediate: true, forceAvail: true });
    };

    /** Для отладки в консоли: reminkoMinkoMissForceCheck() */
    global.reminkoMinkoMissForceCheck = function reminkoMinkoMissForceCheck() {
        const state = readState();
        state.lastMinkoChatAt = Date.now() - IDLE_MS - 1000;
        state.lastSiteAt = Date.now() - IDLE_MS - 1000;
        state.lastMissAt = 0;
        writeState(state);
        return checkMissYou({ immediate: true, forceAvail: true });
    };

    global.reminkoMinkoMissInit = function reminkoMinkoMissInit(notificationService) {
        _service = notificationService || _service;
        void checkMissYou();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(() => void checkMissYou({ immediate: true }), CHECK_MS);
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && _service) {
            void checkMissYou({ immediate: true });
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);

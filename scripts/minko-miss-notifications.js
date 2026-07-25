/**
 * Minko «скучаю»: если пользователь давно не заходил или не писал в Minko AI —
 * мягкое уведомление с приглашением в чат (тост + inbox + browser push).
 * Срабатывает при открытой вкладке / возврате на сайт (как episode-notifications).
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'reminko_minko_miss_v1';
    /** Сколько молчать, чтобы Минко соскучилась */
    const IDLE_MS = 24 * 60 * 60 * 1000;
    /** Антиспам между «скучаю» */
    const COOLDOWN_MS = 48 * 60 * 60 * 1000;
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

    let _service = null;
    let _timer = null;
    let _running = false;
    let _showTimer = null;

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

    async function deliverMissYou(phrase) {
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
                // Inbox + realtime-тост/push — без локального дубля
                await _service.createNotification(user.id, 'minko', title, phrase, link, {
                    kind: 'miss_you'
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
                tag: 'reminko-minko-miss'
            });
        }
    }

    async function checkMissYou(opts) {
        if (_running) return;
        _running = true;
        try {
            if (!prefsAllowMinko()) {
                touchSite();
                return;
            }

            const state = readState();
            const now = Date.now();

            // Первый заход — только базовая отметка, без «скучаю»
            if (!state.lastSiteAt) {
                state.lastSiteAt = now;
                state.lastMinkoChatAt = now;
                writeState(state);
                return;
            }

            const lastChat = state.lastMinkoChatAt || state.lastSiteAt;
            const minkoIdle = now - lastChat >= IDLE_MS;
            const siteIdle = now - state.lastSiteAt >= IDLE_MS;
            const cooled =
                !state.lastMissAt || now - state.lastMissAt >= COOLDOWN_MS;

            // Обновляем визит сайта после проверки (иначе siteIdle всегда ложный)
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
                void deliverMissYou(phrase);
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

    /** Для отладки в консоли: reminkoMinkoMissForceCheck() */
    global.reminkoMinkoMissForceCheck = function reminkoMinkoMissForceCheck() {
        const state = readState();
        state.lastMinkoChatAt = Date.now() - IDLE_MS - 1000;
        state.lastSiteAt = Date.now() - IDLE_MS - 1000;
        state.lastMissAt = 0;
        writeState(state);
        return checkMissYou({ immediate: true });
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

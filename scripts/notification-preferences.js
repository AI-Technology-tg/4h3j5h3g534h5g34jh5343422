/**
 * Настройки уведомлений сайта: тосты, звук, push браузера.
 * Модалка открывается только вручную (колокольчик → Настройки / профиль).
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'reminko_notification_prefs_v1';

    const DEFAULT_PREFS = {
        toastSite: true,
        sound: true,
        browserPush: true,
        browserPushWhenHidden: true,
        browserPushWhenUnfocused: true,
        browserPushOnOtherPage: true,
        newEpisodeFavorites: true,
        newEpisodeRecent: true,
        directMessages: true,
        friendRequests: true,
        systemNews: true,
        minkoAi: true
    };

    function mergePrefs(raw) {
        const out = { ...DEFAULT_PREFS };
        if (raw && typeof raw === 'object') {
            for (const key of Object.keys(DEFAULT_PREFS)) {
                if (typeof raw[key] === 'boolean') out[key] = raw[key];
            }
        }
        return out;
    }

    function readStoredPrefs() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? mergePrefs(JSON.parse(raw)) : null;
        } catch (_) {
            return null;
        }
    }

    function readUserPrefs() {
        if (typeof getCurrentUserSync !== 'function') return null;
        const user = getCurrentUserSync();
        if (!user?.id) return null;
        const ud =
            typeof ensureUserDataRecord === 'function'
                ? ensureUserDataRecord(user.id)
                : typeof getUserData === 'function'
                  ? getUserData(user.id)
                  : null;
        const prefs = ud?.settings?.notificationPrefs;
        return prefs ? mergePrefs(prefs) : null;
    }

    function globalNotificationsDisabled() {
        if (typeof getCurrentUserSync !== 'function') return false;
        const user = getCurrentUserSync();
        if (!user?.id) return false;
        const ud =
            typeof ensureUserDataRecord === 'function'
                ? ensureUserDataRecord(user.id)
                : typeof getUserData === 'function'
                  ? getUserData(user.id)
                  : null;
        if (ud?.settings?.notificationsEnabled === false) return true;
        return false;
    }

    function reminkoGetNotificationPrefs() {
        if (globalNotificationsDisabled()) {
            const muted = { ...DEFAULT_PREFS };
            for (const key of Object.keys(muted)) muted[key] = false;
            return muted;
        }
        return readUserPrefs() || readStoredPrefs() || { ...DEFAULT_PREFS };
    }

    function reminkoSaveNotificationPrefs(prefs, opts) {
        const merged = mergePrefs(prefs);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch (_) {
            /* ignore */
        }

        if (typeof getCurrentUserSync === 'function') {
            const user = getCurrentUserSync();
            if (user?.id) {
                const patch = { notificationPrefs: merged, notificationsEnabled: merged.toastSite };
                if (typeof saveSetting === 'function') {
                    saveSetting('notificationPrefs', merged, { silent: true });
                    saveSetting('notificationsEnabled', merged.toastSite, { silent: true });
                } else if (typeof updateUserData === 'function') {
                    const ud =
                        typeof ensureUserDataRecord === 'function'
                            ? ensureUserDataRecord(user.id)
                            : getUserData(user.id);
                    if (ud) {
                        ud.settings = { ...(ud.settings || {}), ...patch };
                        updateUserData(user.id, { settings: ud.settings });
                    }
                }
            }
        }

        if (!(opts && opts.silent) && typeof showSuccess === 'function') {
            showSuccess('Настройки уведомлений сохранены');
        }
        return merged;
    }

    function reminkoIsNotifyTypeEnabled(type) {
        const prefs = reminkoGetNotificationPrefs();
        if (!prefs.toastSite) return false;
        const map = {
            new_episode: prefs.newEpisodeFavorites || prefs.newEpisodeRecent,
            new_episode_favorite: prefs.newEpisodeFavorites,
            new_episode_recent: prefs.newEpisodeRecent,
            dm: prefs.directMessages,
            direct_message: prefs.directMessages,
            friend_request: prefs.friendRequests,
            friend_accepted: prefs.friendRequests,
            admin_message: prefs.systemNews,
            system: prefs.systemNews,
            info: prefs.systemNews,
            minko: prefs.minkoAi
        };
        if (type && Object.prototype.hasOwnProperty.call(map, type)) {
            return !!map[type];
        }
        return true;
    }

    function reminkoShouldPlayNotificationSound() {
        const prefs = reminkoGetNotificationPrefs();
        return prefs.toastSite && prefs.sound;
    }

    function reminkoShouldShowBrowserPush(context) {
        const prefs = reminkoGetNotificationPrefs();
        if (!prefs.browserPush) return false;
        if (context?.type && !reminkoIsNotifyTypeEnabled(context.type)) return false;

        const hidden = document.hidden;
        const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
        const onMessagesPage = /messages\.html/i.test(global.location?.pathname || '');
        const onSite = /^https?:/i.test(global.location?.protocol || '');

        if (!onSite) return false;

        if (hidden && prefs.browserPushWhenHidden) return true;
        if (!focused && prefs.browserPushWhenUnfocused) return true;

        if (
            prefs.browserPushOnOtherPage &&
            context?.type === 'dm' &&
            !onMessagesPage
        ) {
            return true;
        }

        if (
            prefs.browserPushOnOtherPage &&
            (context?.type === 'new_episode' ||
                context?.type === 'new_episode_favorite' ||
                context?.type === 'new_episode_recent' ||
                context?.type === 'minko')
        ) {
            return hidden || !focused;
        }

        return false;
    }

    function reminkoSiteNotifyIconUrl() {
        const base = (
            (global.APP_CONFIG && global.APP_CONFIG.siteOrigin) ||
            global.location?.origin ||
            ''
        ).replace(/\/$/, '');
        const rel = 'Fons/vavo/favicon-32x32.png';
        if (base && !base.startsWith('file:')) return `${base}/${rel}`;
        return rel;
    }

    function reminkoSafeBrowserNotificationLink(value) {
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return '';
        try {
            const configuredOrigin =
                global.APP_CONFIG && typeof global.APP_CONFIG.siteOrigin === 'string'
                    ? global.APP_CONFIG.siteOrigin
                    : global.location.origin;
            const base = `${String(configuredOrigin || global.location.origin).replace(/\/$/, '')}/`;
            const url = new URL(raw, base);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
            const allowedOrigins = new Set([new URL(base).origin]);
            if (global.location.protocol === 'http:' || global.location.protocol === 'https:') {
                allowedOrigins.add(global.location.origin);
            }
            return allowedOrigins.has(url.origin) ? url.href : '';
        } catch (_) {
            return '';
        }
    }

    async function reminkoRequestBrowserNotifyPermission() {
        if (typeof Notification === 'undefined') return 'unsupported';
        if (Notification.permission === 'granted') return 'granted';
        if (Notification.permission === 'denied') return 'denied';
        try {
            return await Notification.requestPermission();
        } catch (_) {
            return Notification.permission;
        }
    }

    async function reminkoShowBrowserNotification(title, body, opts) {
        if (typeof Notification === 'undefined') return null;
        const context = opts && typeof opts === 'object' ? opts : {};
        if (!reminkoShouldShowBrowserPush(context)) return null;

        if (Notification.permission === 'default') {
            await reminkoRequestBrowserNotifyPermission();
        }
        if (Notification.permission !== 'granted') return null;

        try {
            const n = new Notification(String(title || 'Re-Minko'), {
                body: String(body || '').slice(0, 240),
                icon: context.icon || reminkoSiteNotifyIconUrl(),
                tag: context.tag || 'reminko-' + (context.type || 'info'),
                renotify: true
            });
            const safeLink = reminkoSafeBrowserNotificationLink(context.link);
            if (safeLink) {
                n.onclick = () => {
                    try {
                        global.focus();
                    } catch (_) {
                        /* ignore */
                    }
                    global.location.assign(safeLink);
                    n.close();
                };
            }
            return n;
        } catch (_) {
            return null;
        }
    }

    function ensurePrefsModal() {
        let modal = document.getElementById('notificationPrefsModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'notificationPrefsModal';
        modal.innerHTML = `
            <div class="modal-content notification-prefs-modal">
                <span class="close notification-prefs-close" aria-label="Закрыть">&times;</span>
                <h2 class="modal-title" id="notificationPrefsTitle">Как вам удобнее получать уведомления?</h2>
                <p class="notification-prefs-lead">Выберите, что показывать на сайте, со звуком и на устройстве (push браузера).</p>
                <div class="notification-prefs-groups" id="notificationPrefsForm"></div>
                <div class="notification-prefs-footer">
                    <button type="button" class="btn btn-secondary" id="notificationPrefsTestSound">Проверить звук</button>
                    <button type="button" class="btn btn-secondary" id="notificationPrefsEnablePush">Разрешить push</button>
                    <button type="button" class="btn btn-primary" id="notificationPrefsSave">Сохранить</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const groups = [
            {
                title: 'На сайте',
                items: [
                    { key: 'toastSite', label: 'Всплывающие уведомления (тосты)', desc: 'Как сообщение в приложении — в углу экрана' },
                    { key: 'sound', label: 'Звук', desc: 'Короткий сигнал при новом событии' }
                ]
            },
            {
                title: 'На устройстве (браузер)',
                items: [
                    { key: 'browserPush', label: 'Push-уведомления ОС', desc: 'Когда вкладка скрыта или вы на другой странице' },
                    { key: 'browserPushWhenHidden', label: '…если вкладка не видна', desc: 'Другая вкладка или свёрнут браузер' },
                    { key: 'browserPushWhenUnfocused', label: '…если окно не в фокусе', desc: 'Вы в другом приложении, вкладка Re-Minko открыта' },
                    { key: 'browserPushOnOtherPage', label: '…на других страницах сайта', desc: 'Например, ЛС — когда вы не в «Сообщениях»' }
                ]
            },
            {
                title: 'О чём сообщать',
                items: [
                    { key: 'newEpisodeFavorites', label: 'Новая серия — избранное', desc: 'Онгоинги из вашего списка' },
                    { key: 'newEpisodeRecent', label: 'Новая серия — недавно смотрели', desc: 'Тайтлы из истории просмотра' },
                    { key: 'directMessages', label: 'Личные сообщения', desc: 'Когда пишут в ЛС' },
                    { key: 'friendRequests', label: 'Друзья', desc: 'Заявки и принятие в друзья' },
                    { key: 'systemNews', label: 'Новости и системные', desc: 'Обновления сайта, админ-сообщения' },
                    {
                        key: 'minkoAi',
                        label: 'Minko AI',
                        desc: '«Скучаю», пробуждение и события ассистента'
                    }
                ]
            }
        ];

        const form = modal.querySelector('#notificationPrefsForm');
        for (const group of groups) {
            const section = document.createElement('section');
            section.className = 'notification-prefs-group';
            section.innerHTML = `<h3 class="notification-prefs-group-title">${group.title}</h3>`;
            for (const item of group.items) {
                const row = document.createElement('label');
                row.className = 'notification-prefs-row';
                row.innerHTML = `
                    <span class="notification-prefs-row-text">
                        <span class="notification-prefs-row-label">${item.label}</span>
                        <span class="notification-prefs-row-desc">${item.desc}</span>
                    </span>
                    <span class="toggle-switch">
                        <input type="checkbox" data-pref-key="${item.key}">
                        <span class="toggle-slider"></span>
                    </span>
                `;
                section.appendChild(row);
            }
            form.appendChild(section);
        }

        modal.querySelector('.notification-prefs-close')?.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        modal.querySelector('#notificationPrefsSave')?.addEventListener('click', () => {
            const prefs = {};
            modal.querySelectorAll('[data-pref-key]').forEach((input) => {
                prefs[input.dataset.prefKey] = input.checked;
            });
            reminkoSaveNotificationPrefs(prefs);
            modal.classList.remove('active');
        });

        modal.querySelector('#notificationPrefsTestSound')?.addEventListener('click', () => {
            if (global.notificationService?._playNotificationSound) {
                global.notificationService._playNotificationSound(true);
            }
        });

        modal.querySelector('#notificationPrefsEnablePush')?.addEventListener('click', async () => {
            const result = await reminkoRequestBrowserNotifyPermission();
            if (result === 'granted' && typeof showSuccess === 'function') {
                showSuccess('Push-уведомления разрешены');
            } else if (result === 'denied' && typeof showWarning === 'function') {
                showWarning('Push заблокированы в настройках браузера');
            }
        });

        return modal;
    }

    function reminkoOpenNotificationPrefsModal() {
        const modal = ensurePrefsModal();
        const prefs = reminkoGetNotificationPrefs();
        modal.querySelectorAll('[data-pref-key]').forEach((input) => {
            input.checked = !!prefs[input.dataset.prefKey];
        });
        const titleEl = modal.querySelector('#notificationPrefsTitle');
        const leadEl = modal.querySelector('.notification-prefs-lead');
        if (titleEl) titleEl.textContent = 'Настройки уведомлений';
        if (leadEl) {
            leadEl.textContent =
                'Тосты на сайте, звук и push браузера. Изменения сохраняются в вашем аккаунте.';
        }
        modal.classList.add('active');
    }

    global.reminkoGetNotificationPrefs = reminkoGetNotificationPrefs;
    global.reminkoSaveNotificationPrefs = reminkoSaveNotificationPrefs;
    global.reminkoIsNotifyTypeEnabled = reminkoIsNotifyTypeEnabled;
    global.reminkoShouldPlayNotificationSound = reminkoShouldPlayNotificationSound;
    global.reminkoShouldShowBrowserPush = reminkoShouldShowBrowserPush;
    global.reminkoShowBrowserNotification = reminkoShowBrowserNotification;
    global.reminkoRequestBrowserNotifyPermission = reminkoRequestBrowserNotifyPermission;
    global.reminkoOpenNotificationPrefsModal = reminkoOpenNotificationPrefsModal;
})(typeof window !== 'undefined' ? window : globalThis);

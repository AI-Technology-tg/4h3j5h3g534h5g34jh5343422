// Система уведомлений
/** Корень сайта — иначе на /catalog/ запрашивается /catalog/sound/... (404) */
const NOTIFICATION_SOUND_FILES = [
    '/sound/notify-respawn.mp3',
    '/sound/Rezero Respawn Sound Effect (Clean Perfect).mp3'
];
const NOTIFICATION_SOUND_VOLUME = 0.25;

function reminkoNotificationSoundUrl(filePath) {
    const rel = String(filePath || NOTIFICATION_SOUND_FILES[0]).replace(/^\//, '');
    const segments = rel.split('/').filter(Boolean).map((part) => encodeURIComponent(part));
    const path = '/' + segments.join('/');
    const origin = (
        (window.APP_CONFIG && window.APP_CONFIG.siteOrigin) ||
        window.location.origin ||
        ''
    ).replace(/\/$/, '');
    if (origin && !String(window.location.protocol).startsWith('file:')) {
        return origin + path;
    }
    const depth =
        window.location && window.location.pathname
            ? (window.location.pathname.match(/\//g) || []).length - 1
            : 0;
    const prefix = depth > 0 ? '../'.repeat(depth) : '';
    return prefix + segments.join('/');
}

window.reminkoNotificationSoundUrl = reminkoNotificationSoundUrl;

class NotificationService {
    constructor() {
        this.notifications = [];
        this.unreadCount = 0;
        this.currentUser = null;
        this._notificationAudio = null;
        this._notificationAudioSrc = '';
        this._soundFallbackReady = false;
        /** Антиспам: одинаковые тосты подряд */
        this._toastDedupeKey = '';
        this._toastDedupeAt = 0;
        this._dmInboxChannel = null;
    }

    _escapeAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    _playNotificationSoundFallback() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = this._audioCtx || new AudioCtx();
            this._audioCtx = ctx;
            if (ctx.state === 'suspended') void ctx.resume();

            const now = ctx.currentTime;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(Math.min(0.22, NOTIFICATION_SOUND_VOLUME + 0.05), now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
            gain.connect(ctx.destination);

            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);
            osc.connect(gain);
            osc.start(now);
            osc.stop(now + 0.46);
        } catch (e) {}
    }

    _playNotificationSound(force) {
        if (!force && typeof window.reminkoShouldPlayNotificationSound === 'function') {
            if (!window.reminkoShouldPlayNotificationSound()) return;
        }
        const files = Array.isArray(NOTIFICATION_SOUND_FILES) ? NOTIFICATION_SOUND_FILES : [];
        const tryPlay = (index) => {
            if (index >= files.length) {
                this._playNotificationSoundFallback();
                return;
            }
            const url = reminkoNotificationSoundUrl(files[index]);
            try {
                if (!this._notificationAudio || this._notificationAudioSrc !== url) {
                    this._notificationAudio = new Audio(url);
                    this._notificationAudioSrc = url;
                }
                this._notificationAudio.volume = Math.min(1, Math.max(0, NOTIFICATION_SOUND_VOLUME));
                this._notificationAudio.currentTime = 0;
                const playPromise = this._notificationAudio.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => tryPlay(index + 1));
                }
            } catch (e) {
                tryPlay(index + 1);
            }
        };
        tryPlay(0);
    }

    _maybeBrowserPush(title, body, context) {
        if (typeof window.reminkoShowBrowserNotification !== 'function') return;
        void window.reminkoShowBrowserNotification(title, body, context);
    }

    _siteToastsEnabled(type) {
        if (typeof window.reminkoGetNotificationPrefs === 'function') {
            const prefs = window.reminkoGetNotificationPrefs();
            if (!prefs.toastSite) return false;
        }
        if (type && typeof window.reminkoIsNotifyTypeEnabled === 'function') {
            return window.reminkoIsNotifyTypeEnabled(type);
        }
        return true;
    }

    async init() {
        if (typeof getCurrentUser === 'function') {
            this.currentUser = await getCurrentUser();
            if (this.currentUser) {
                this.loadNotifications();
                this.setupRealtime();
                this.setupDirectMessagesInbox();
                if (typeof window.reminkoEpisodeNotifyInit === 'function') {
                    window.reminkoEpisodeNotifyInit(this);
                }
            }
        }
        // Гости тоже получают «скучаю» (тост/push); inbox — только для залогиненных
        if (typeof window.reminkoMinkoMissInit === 'function') {
            window.reminkoMinkoMissInit(this);
        }
    }

    /**
     * Входящие ЛС: тост + бейдж (Realtime на direct_messages).
     */
    setupDirectMessagesInbox() {
        if (!this.currentUser || !supabaseClient) return;
        if (this._dmInboxChannel) return;
        if (typeof DirectMessagesService === 'undefined') return;

        const myId = this.currentUser.id;
        const uid = String(myId).replace(/"/g, '');

        try {
            this._dmInboxChannel = supabaseClient
                .channel(`dm-inbox-global-${uid}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'direct_messages',
                        filter: `receiver_id=eq.${uid}`
                    },
                    async (payload) => {
                        const row = payload.new;
                        if (!row || !row.sender_id) return;
                        if (String(row.sender_id) === String(myId)) return;

                        const onMessagesPage = /messages\.html/i.test(window.location.pathname || '');
                        const openChat = window.__reminkoDmOpenChatId;
                        if (onMessagesPage && openChat && String(openChat) === String(row.sender_id)) {
                            if (typeof window.reminkoUpdateDmBadge === 'function') {
                                window.reminkoUpdateDmBadge();
                            }
                            return;
                        }

                        const prof =
                            typeof DirectMessagesService.getProfile === 'function'
                                ? await DirectMessagesService.getProfile(row.sender_id, true)
                                : null;
                        const name = (prof && prof.username) || 'Сообщение';
                        const av = prof && prof.avatar ? prof.avatar : '';

                        this.showDmNotification(
                            name,
                            row.message || '',
                            row.sender_id,
                            av
                        );
                        this._maybeBrowserPush(name, row.message || 'Новое сообщение', {
                            type: 'dm',
                            link:
                                typeof reminkoMessagesLink === 'function'
                                    ? reminkoMessagesLink(row.sender_id)
                                    : `messages.html?user=${encodeURIComponent(String(row.sender_id))}`,
                            tag: 'reminko-dm-' + String(row.sender_id)
                        });
                        if (typeof window.reminkoUpdateDmBadge === 'function') {
                            window.reminkoUpdateDmBadge();
                        }
                    }
                )
                .subscribe();
        } catch (e) {
            console.warn('[DM inbox realtime]', e);
        }
    }

    // Загрузка уведомлений
    async loadNotifications() {
        if (!this.currentUser || !supabaseClient) return;

        try {
            // Проверяем существование таблицы через попытку запроса
            const { data, error } = await supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) {
                // Если таблица не существует, просто игнорируем
                if (error.code === 'PGRST205' || error.message?.includes('not found')) {
                    console.warn('Таблица notifications не найдена. Создайте таблицу в Supabase для работы уведомлений.');
                    this.notifications = [];
                    this.unreadCount = 0;
                    return;
                }
                // Не логируем ошибки загрузки уведомлений
                return;
            }

            this.notifications = data || [];
            this.unreadCount = this.notifications.filter(n => !n.read).length;
            this.updateNotificationBadge();
            this.renderNotifications();
        } catch (error) {
            // Не логируем ошибки загрузки уведомлений
        }
    }

    // Настройка realtime подписки
    setupRealtime() {
        if (!this.currentUser || !supabaseClient) return;

        // Пытаемся подписаться, но не падаем, если таблица не существует
        try {
            supabaseClient
                .channel('notifications')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${this.currentUser.id}`
                }, (payload) => {
                    this.notifications.unshift(payload.new);
                    this.unreadCount++;
                    this.updateNotificationBadge();
                    this.renderNotifications();
                    if (this._siteToastsEnabled(payload.new?.type)) {
                        this.showToast(payload.new);
                    }
                    this._maybeBrowserPush(
                        payload.new?.title || 'Re-Minko',
                        payload.new?.message || '',
                        {
                            type: payload.new?.type || 'info',
                            link: payload.new?.link || '',
                            tag: 'reminko-db-' + String(payload.new?.id || payload.new?.type || 'info')
                        }
                    );
                })
                .subscribe();
        } catch (error) {
            console.warn('Не удалось настроить realtime подписку для уведомлений:', error);
        }
    }

    // Создать уведомление
    async createNotification(userId, type, title, message, link = null, data = {}) {
        if (!supabaseClient) return { success: false };

        try {
            const { error } = await supabaseClient
                .from('notifications')
                .insert({
                    user_id: userId,
                    type: type,
                    title: title,
                    message: message,
                    link: link,
                    data: data
                });

            if (error) {
                // Если таблица не существует, возвращаем успех (чтобы не ломать функционал)
                if (error.code === 'PGRST205' || error.message?.includes('not found')) {
                    console.warn('Таблица notifications не найдена. Уведомление не создано.');
                    return { success: false, message: 'Таблица notifications не настроена' };
                }
                console.error('Ошибка создания уведомления:', error);
                return { success: false, message: error.message };
            }

            return { success: true };
        } catch (error) {
            console.error('Ошибка создания уведомления:', error);
            return { success: false, message: error.message };
        }
    }

    // Отметить как прочитанное
    async markAsRead(notificationId) {
        if (!supabaseClient) return;

        try {
            await supabaseClient
                .from('notifications')
                .update({ read: true, read_at: new Date().toISOString() })
                .eq('id', notificationId);

            const notification = this.notifications.find(n => n.id === notificationId);
            if (notification && !notification.read) {
                notification.read = true;
                this.unreadCount = Math.max(0, this.unreadCount - 1);
                this.updateNotificationBadge();
            }
        } catch (error) {
            console.error('Ошибка отметки уведомления:', error);
        }
    }

    // Отметить все как прочитанные
    async markAllAsRead() {
        if (!this.currentUser || !supabaseClient) return;

        try {
            await supabaseClient
                .from('notifications')
                .update({ read: true, read_at: new Date().toISOString() })
                .eq('user_id', this.currentUser.id)
                .eq('read', false);

            this.notifications.forEach(n => n.read = true);
            this.unreadCount = 0;
            this.updateNotificationBadge();
            this.renderNotifications();
        } catch (error) {
            console.error('Ошибка отметки всех уведомлений:', error);
        }
    }

    /** Полностью удалить все уведомления пользователя из БД */
    async deleteAllNotifications() {
        if (!this.currentUser || !supabaseClient) return;

        try {
            const { error } = await supabaseClient
                .from('notifications')
                .delete()
                .eq('user_id', this.currentUser.id);

            if (error) {
                if (error.code === 'PGRST205' || error.message?.includes('not found')) {
                    this.notifications = [];
                    this.unreadCount = 0;
                    this.updateNotificationBadge();
                    this.renderNotifications();
                    return;
                }
                console.error('Ошибка удаления уведомлений:', error);
                return;
            }

            this.notifications = [];
            this.unreadCount = 0;
            this.updateNotificationBadge();
            this.renderNotifications();
        } catch (error) {
            console.error('Ошибка удаления уведомлений:', error);
        }
    }

    // Обновить бейдж уведомлений
    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    _ensureToastShell() {
        let container = document.getElementById('notifications-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notifications-container';
            document.body.appendChild(container);
        }
        let toolbar = container.querySelector('.notifications-stack-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.className = 'notifications-stack-toolbar';
            toolbar.setAttribute('hidden', '');
            const label = document.createElement('span');
            label.className = 'notifications-stack-toolbar-label';
            label.textContent = 'Уведомления';
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'notifications-clear-all-btn';
            clearBtn.textContent = 'Очистить все';
            clearBtn.addEventListener('click', () => this.clearAllToasts());
            toolbar.appendChild(label);
            toolbar.appendChild(clearBtn);
            container.prepend(toolbar);
        }
        return { container, toolbar };
    }

    /** Не больше max видимых тостов: самый старый внизу стека убирается */
    _capVisibleToasts(container, max = 5) {
        if (!container) return;
        while (container.querySelectorAll(':scope > .notification').length >= max) {
            const all = container.querySelectorAll(':scope > .notification');
            all[all.length - 1]?.remove();
        }
    }

    _syncToastToolbar() {
        const container = document.getElementById('notifications-container');
        if (!container) return;
        const toolbar = container.querySelector('.notifications-stack-toolbar');
        if (!toolbar) return;
        const n = container.querySelectorAll(':scope > .notification').length;
        if (n > 0) toolbar.removeAttribute('hidden');
        else toolbar.setAttribute('hidden', '');
    }

    clearAllToasts() {
        const container = document.getElementById('notifications-container');
        if (!container) return;
        container.querySelectorAll(':scope > .notification').forEach((el) => {
            el.classList.add('hiding');
            setTimeout(() => el.remove(), 280);
        });
        setTimeout(() => this._syncToastToolbar(), 300);
    }

    _dismissToastEl(notificationEl) {
        if (!notificationEl || !notificationEl.parentNode) return;
        notificationEl.classList.add('hiding');
        setTimeout(() => {
            notificationEl.remove();
            this._syncToastToolbar();
        }, 320);
    }

    _attachSwipeToDismiss(notificationEl, onDone) {
        let sx = 0;
        let sy = 0;
        let dx = 0;
        let dy = 0;
        let dragging = false;
        let gestureDone = false;

        const finish = () => {
            if (gestureDone) return;
            gestureDone = true;
            dragging = false;
            const dismiss = Math.abs(dx) > 72 || dy < -56;
            if (dismiss) {
                notificationEl.style.transition = 'opacity 0.22s ease, transform 0.28s ease';
                notificationEl.style.transform = `translateX(${dx > 0 ? '120%' : '-120%'}) translateY(${Math.min(dy, 0)}px)`;
                notificationEl.style.opacity = '0';
                setTimeout(() => {
                    onDone();
                    this._syncToastToolbar();
                }, 280);
            } else {
                gestureDone = false;
                notificationEl.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                notificationEl.style.transform = '';
                notificationEl.style.opacity = '';
                setTimeout(() => {
                    notificationEl.style.transition = '';
                }, 220);
            }
            dx = 0;
            dy = 0;
        };

        notificationEl.addEventListener(
            'touchstart',
            (e) => {
                if (
                    e.target.closest('.notification-close') ||
                    e.target.closest('.notification-reply-area') ||
                    e.target.closest('.notification-dm-hint-wrap')
                ) {
                    return;
                }
                gestureDone = false;
                const t = e.changedTouches[0];
                sx = t.clientX;
                sy = t.clientY;
                dragging = true;
                dx = 0;
                dy = 0;
            },
            { passive: true }
        );

        notificationEl.addEventListener(
            'touchmove',
            (e) => {
                if (!dragging) return;
                const t = e.changedTouches[0];
                dx = t.clientX - sx;
                dy = t.clientY - sy;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) e.preventDefault();
                notificationEl.style.transition = 'none';
                notificationEl.style.transform = `translateX(${dx}px) translateY(${dy < 0 ? dy * 0.45 : 0}px)`;
                notificationEl.style.opacity = String(Math.max(0.38, 1 - Math.abs(dx) / 200));
            },
            { passive: false }
        );

        notificationEl.addEventListener('touchend', () => {
            if (!dragging) return;
            finish();
        });
        notificationEl.addEventListener('touchcancel', () => {
            if (!dragging) return;
            finish();
        });
    }

    // Показать уведомление (строка, тип или объект из БД; options.link — переход по тапу)
    showNotification(messageOrObject, type = 'info', options = {}) {
        if (typeof options === 'string') {
            options = { link: options };
        }
        let headline;
        let message;
        let notifType;
        let link = '';

        if (typeof messageOrObject === 'object' && messageOrObject !== null) {
            headline = messageOrObject.title || 'Re-Minko';
            message =
                messageOrObject.message != null
                    ? String(messageOrObject.message)
                    : String(messageOrObject.title || '');
            notifType = messageOrObject.type || 'info';
            if (messageOrObject.link) link = String(messageOrObject.link).trim();
        } else {
            message = String(messageOrObject || '');
            notifType = type;
            headline = this.getTypeTitle(notifType);
            if (options && typeof options.link === 'string') link = options.link.trim();
        }

        if (!this._siteToastsEnabled(notifType)) {
            if (options.withSound) this._playNotificationSound();
            return;
        }

        const dedupeKey = `${notifType}\0${headline}\0${message}\0${link}`;
        const now = Date.now();
        if (dedupeKey === this._toastDedupeKey && now - this._toastDedupeAt < 2000) {
            return;
        }
        this._toastDedupeKey = dedupeKey;
        this._toastDedupeAt = now;

        const { container, toolbar } = this._ensureToastShell();
        this._capVisibleToasts(container, 5);

        const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ', dm: '✉', minko: '✦' };
        const icon = icons[notifType] || 'ℹ';

        const notificationEl = document.createElement('div');
        notificationEl.className = `notification notification-${notifType}`;
        if (link) {
            notificationEl.classList.add('notification--has-link');
            notificationEl.dataset.notifLink = link;
        }

        const content = document.createElement('div');
        content.className = 'notification-content';
        content.innerHTML = `
            <div class="notification-icon-circle">${icon}</div>
            <div class="notification-body">
                <div class="notification-app-name"></div>
                <div class="notification-message"></div>
            </div>
            <span class="notification-time-label">сейчас</span>
        `;
        content.querySelector('.notification-app-name').textContent = headline;
        content.querySelector('.notification-message').textContent = message;

        const progress = document.createElement('div');
        progress.className = 'notification-progress';
        const bar = document.createElement('div');
        bar.className = 'notification-progress-bar';
        progress.appendChild(bar);

        notificationEl.appendChild(content);
        notificationEl.appendChild(progress);

        if (toolbar.nextSibling) {
            container.insertBefore(notificationEl, toolbar.nextSibling);
        } else {
            container.appendChild(notificationEl);
        }
        this._syncToastToolbar();

        notificationEl.addEventListener('click', (e) => {
            if (e.target.closest('.notification-close') || e.target.closest('.notification-reply-area')) return;
            const href = notificationEl.dataset.notifLink;
            if (href) {
                window.location.assign(href);
            }
            this._dismissToastEl(notificationEl);
        });

        this._attachSwipeToDismiss(notificationEl, () => {
            notificationEl.remove();
        });

        if (options.withSound) {
            this._playNotificationSound();
        }
        requestAnimationFrame(() => notificationEl.classList.add('show'));

        const hideMs =
            notifType === 'error' ? 7000 : notifType === 'success' ? 3600 : notifType === 'warning' ? 4800 : 5200;
        let autoHideTimer = setTimeout(() => {
            this._dismissToastEl(notificationEl);
        }, hideMs);

        notificationEl.addEventListener('mouseenter', () => clearTimeout(autoHideTimer));
        notificationEl.addEventListener('mouseleave', () => {
            autoHideTimer = setTimeout(() => this._dismissToastEl(notificationEl), 2200);
        });
    }
    
    // Получить заголовок по типу
    getTypeTitle(type) {
        const titles = {
            'success': 'Успешно',
            'error': 'Ошибка',
            'warning': 'Внимание',
            'info': 'Информация',
            'new_episode': 'Новая серия',
            'minko': 'Minko AI',
        };
        return titles[type] || 'Уведомление';
    }
    
    showToast(notification) {
        if (notification && typeof notification === 'object') {
            if (!this._siteToastsEnabled(notification.type)) {
                this._maybeBrowserPush(
                    notification.title || 'Re-Minko',
                    notification.message || '',
                    {
                        type: notification.type || 'info',
                        link: notification.link || '',
                        tag: 'reminko-toast-' + String(notification.type || 'info')
                    }
                );
                return;
            }
            this.showNotification(notification, notification.type || 'info', { withSound: true });
            this._maybeBrowserPush(
                notification.title || 'Re-Minko',
                notification.message || '',
                {
                    type: notification.type || 'info',
                    link: notification.link || '',
                    tag:
                        notification.type === 'new_episode' && notification.data?.anime_id
                            ? 'reminko-ep-' + String(notification.data.anime_id)
                            : 'reminko-toast-' + String(notification.type || 'info')
                }
            );
        } else {
            this.showNotification(notification, 'info', { withSound: true });
        }
    }

    showDmNotification(senderName, message, senderId, avatarUrl) {
        const dmLink =
            typeof reminkoMessagesLink === 'function'
                ? reminkoMessagesLink(senderId)
                : `messages.html?user=${encodeURIComponent(String(senderId || ''))}`;
        if (!this._siteToastsEnabled('dm')) {
            this._playNotificationSound();
            this._maybeBrowserPush(senderName, message, {
                type: 'dm',
                link: dmLink,
                tag: 'reminko-dm-' + String(senderId || '')
            });
            return;
        }
        const { container, toolbar } = this._ensureToastShell();
        this._capVisibleToasts(container, 5);
        const sid = String(senderId || '').replace(/'/g, '');
        let hideTimer = null;

        const el = document.createElement('div');
        el.className = 'notification notification-dm notification--has-link';
        el.dataset.notifLink = dmLink;
        try {
            if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
                el.classList.add('notification-dm--touch');
            }
        } catch (e) {
            /* ignore */
        }

        const resolvedAva =
            avatarUrl && String(avatarUrl).trim()
                ? typeof reminkoResolveAssetUrl === 'function'
                    ? reminkoResolveAssetUrl(avatarUrl)
                    : String(avatarUrl).trim()
                : '';

        const content = document.createElement('div');
        content.className = 'notification-content';
        const iconHtml = resolvedAva
            ? `<div class="notification-dm-icon-wrap"><img class="notification-dm-avatar reminko-avatar-img" src="${this._escapeAttr(resolvedAva)}" alt="" width="32" height="32" decoding="async" onerror="this.style.visibility='hidden'"></div>`
            : `<div class="notification-icon-circle">✉</div>`;
        content.innerHTML = `
            ${iconHtml}
            <div class="notification-body">
                <div class="notification-app-name"></div>
                <div class="notification-message"></div>
            </div>
            <span class="notification-time-label">сейчас</span>
        `;
        content.querySelector('.notification-app-name').textContent = senderName || 'Сообщение';
        content.querySelector('.notification-message').textContent = String(message || '');

        const hint = document.createElement('div');
        hint.className = 'notification-dm-hint-wrap';
        const replyPill = document.createElement('button');
        replyPill.type = 'button';
        replyPill.className = 'notification-dm-reply-pill';
        replyPill.textContent = 'Ответить';
        hint.appendChild(replyPill);

        const reply = document.createElement('div');
        reply.className = 'notification-reply-area';
        reply.innerHTML = `
            <input class="notification-reply-input" type="text" placeholder="Сообщение…" maxlength="300" autocomplete="off">
            <button type="button" class="notification-reply-send" aria-label="Отправить">➤</button>
        `;
        const sendBtn = reply.querySelector('.notification-reply-send');
        const inputEl = reply.querySelector('.notification-reply-input');
        sendBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.notificationService._sendQuickReply(sendBtn, sid);
        });
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                window.notificationService._sendQuickReply(sendBtn, sid);
            }
        });

        replyPill.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            el.classList.add('is-reply-open');
            if (hideTimer) clearTimeout(hideTimer);
            inputEl.focus();
        });

        const progress = document.createElement('div');
        progress.className = 'notification-progress';
        const bar = document.createElement('div');
        bar.className = 'notification-progress-bar';
        bar.style.animationDuration = '8s';
        progress.appendChild(bar);

        el.appendChild(content);
        el.appendChild(hint);
        el.appendChild(reply);
        el.appendChild(progress);

        if (toolbar.nextSibling) {
            container.insertBefore(el, toolbar.nextSibling);
        } else {
            container.appendChild(el);
        }
        this._syncToastToolbar();

        const goChat = () => {
            window.location.href = dmLink;
        };

        el.addEventListener('click', (e) => {
            if (
                e.target.closest('.notification-reply-area') ||
                e.target.closest('.notification-dm-hint-wrap')
            ) {
                return;
            }
            if (el.classList.contains('is-reply-open')) return;
            goChat();
        });

        this._attachSwipeToDismiss(el, () => {
            el.remove();
        });

        this._playNotificationSound();
        requestAnimationFrame(() => el.classList.add('show'));

        this._maybeBrowserPush(senderName || 'Сообщение', String(message || ''), {
            type: 'dm',
            link: dmLink,
            tag: 'reminko-dm-' + sid
        });

        hideTimer = setTimeout(() => {
            if (el.classList.contains('is-reply-open')) return;
            el.classList.add('hiding');
            setTimeout(() => {
                el.remove();
                this._syncToastToolbar();
            }, 320);
        }, 8000);

        el.addEventListener('mouseenter', () => {
            if (hideTimer && !el.classList.contains('is-reply-open')) clearTimeout(hideTimer);
        });
        el.addEventListener('mouseleave', () => {
            if (el.classList.contains('is-reply-open')) return;
            hideTimer = setTimeout(() => {
                el.classList.add('hiding');
                setTimeout(() => {
                    el.remove();
                    this._syncToastToolbar();
                }, 320);
            }, 3000);
        });

        el.addEventListener(
            'focusin',
            () => {
                if (hideTimer) clearTimeout(hideTimer);
            },
            true
        );
    }

    async _sendQuickReply(btn, receiverId) {
        const area = btn.closest('.notification-reply-area');
        const input = area?.querySelector('.notification-reply-input');
        if (!input || !input.value.trim()) return;
        const text = input.value.trim();
        input.value = '';

        if (typeof DirectMessagesService !== 'undefined') {
            const result = await DirectMessagesService.sendMessage(receiverId, text);
            if (result && result.ok && result.data) {
                const el = btn.closest('.notification');
                if (el) {
                    el.classList.add('hiding');
                    setTimeout(() => el.remove(), 350);
                }
                if (typeof window.reminkoUpdateDmBadge === 'function') {
                    window.reminkoUpdateDmBadge();
                }
                this.showNotification('Ответ отправлен', 'success');
            } else if (result && result.error) {
                this.showNotification(result.error, 'error');
            }
        }
    }

    // Получить иконку для типа уведомления
    getNotificationIcon(type) {
        const icons = {
            'chat_reply': '💬',
            'new_episode': '🎬',
            'admin_message': '📢',
            'friend_request': '👥',
            'friend_accepted': '✅',
            'watch_invite': '🎬',
            'watch_together_invite': '📺',
            'system': '🔔',
            'info': 'ℹ️',
            'warning': '⚠️',
            'error': '❌',
            'success': '✅'
        };
        return icons[type] || '🔔';
    }

    // Отобразить список уведомлений
    renderNotifications() {
        const container = document.getElementById('notificationsList');
        if (!container) return;

        // Скрываем/показываем кнопку "Отметить все как прочитанные"
        const footer = document.getElementById('notificationsFooter');
        if (footer) {
            footer.style.display = this.notifications.length > 0 ? 'flex' : 'none';
        }

        if (this.notifications.length === 0) {
            container.innerHTML =
                '<div class="notifications-empty-hint">Пока пусто — новые события появятся здесь.</div>';
            return;
        }

        container.innerHTML = this.notifications.map(notif => `
            <div class="notification-item ${notif.read ? '' : 'unread'}" onclick="window.notificationService.markAsRead('${notif.id}'); ${notif.link ? `window.location.href='${notif.link}'` : ''}">
                <div class="notification-icon">${this.getNotificationIcon(notif.type)}</div>
                <div class="notification-item-body">
                    <div class="notification-title">${notif.title}</div>
                    <div class="notification-message">${notif.message}</div>
                    <div class="notification-time">${this.formatTime(notif.created_at)}</div>
                </div>
            </div>
        `).join('');
    }

    // Форматирование времени
    formatTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'только что';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} дн назад`;
        
        return date.toLocaleDateString('ru-RU');
    }
}

// Глобальный экземпляр
window.notificationService = new NotificationService();
window.clearAllToastNotifications = () => {
    if (window.notificationService) window.notificationService.clearAllToasts();
};

// Инициализация: после FirstPaint → Interactive (не блокирует первый рендер).
// Realtime/loadNotifications логика внутри init() без изменений.
(function scheduleNotificationServiceInit() {
    const run = () => {
        if (!window.notificationService || typeof window.notificationService.init !== 'function') return;
        if (window.notificationService.__reminkoBootInitStarted) return;
        window.notificationService.__reminkoBootInitStarted = true;
        void window.notificationService.init();
    };

    if (typeof window.ReminkoBoot?.on === 'function') {
        window.ReminkoBoot.on('Interactive', run);
        return;
    }

    // Fallback без BootManager (страницы без boot-manager.js)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();

/** Minko AI — пробуждение после глубокого сна: тост со звуком, колокольчик, push браузера */
(function reminkoMinkoWakeNotifyModule() {
    const SLEEP_KEY = 'reWakeMinko_sleepUntil';
    const FORCE_WAKE_KEY = 'reWakeMinko_forceWakeNextAt';
    const SLEEP_REASON_KEY = 'minko_ai_sleep_reason';
    const DEDUP_KEY = 'reWakeMinko_wakeNotifiedAt';

    let wasSleeping = minkoSleepRemainMs() > 0;

    function minkoSleepRemainMs() {
        try {
            const until = parseInt(localStorage.getItem(SLEEP_KEY) || '0', 10);
            if (!until) return 0;
            return Math.max(0, until - Date.now());
        } catch (_) {
            return 0;
        }
    }

    function clearMinkoSleepKeys() {
        try {
            localStorage.removeItem(SLEEP_KEY);
            localStorage.removeItem(FORCE_WAKE_KEY);
            localStorage.removeItem(SLEEP_REASON_KEY);
        } catch (_) {}
    }

    function minkoWakeLink() {
        const path = window.location.pathname || '';
        if (path.includes('/catalog/') || path.includes('/anime/') || path.includes('/manga/')) {
            return '../minko-ai.html';
        }
        return 'minko-ai.html';
    }

    function minkoWakeIconUrl() {
        const base = (
            (window.APP_CONFIG && window.APP_CONFIG.siteOrigin) ||
            window.location.origin ||
            ''
        ).replace(/\/$/, '');
        const rel = 'Fons/vavo/favicon-32x32.png';
        if (base && !base.startsWith('file:')) {
            return `${base}/${rel}`;
        }
        return rel;
    }

    window.reminkoNotifyMinkoWakeUp = async function reminkoNotifyMinkoWakeUp(opts) {
        const now = Date.now();
        const last = parseInt(sessionStorage.getItem(DEDUP_KEY) || '0', 10);
        if (now - last < 8000) return;
        sessionStorage.setItem(DEDUP_KEY, String(now));
        wasSleeping = false;
        clearMinkoSleepKeys();

        const title = 'Minko AI';
        const message = (opts && opts.message) || 'Minko проснулась — можно снова писать ✨';
        const link = (opts && opts.link) || minkoWakeLink();

        // Одно уведомление: toast (без дубля в inbox + OS)
        if (window.notificationService && typeof window.notificationService.showNotification === 'function') {
            window.notificationService.showNotification(
                { title, message, type: 'success', link },
                'success',
                { link, withSound: true }
            );
        } else if (typeof showSuccess === 'function') {
            showSuccess(message, { link, withSound: true });
        }
    };

    function tickMinkoSleepWake() {
        const remain = minkoSleepRemainMs();
        if (remain > 0) {
            wasSleeping = true;
            return;
        }
        if (wasSleeping) {
            wasSleeping = false;
            clearMinkoSleepKeys();
            window.reminkoNotifyMinkoWakeUp();
        }
    }

    tickMinkoSleepWake();
    setInterval(tickMinkoSleepWake, 1500);
    window.addEventListener('storage', (e) => {
        if (e.key === SLEEP_KEY) tickMinkoSleepWake();
    });
})();

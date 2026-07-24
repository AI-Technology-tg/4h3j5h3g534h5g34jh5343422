// Админ панель Создателя - полнофункциональная

function reminkoFormatUploadBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
}

function reminkoGetAnime4kMaxUploadBytes() {
    const fromCfg =
        typeof APP_CONFIG !== 'undefined' && APP_CONFIG.anime4k?.maxUploadBytes != null
            ? Number(APP_CONFIG.anime4k.maxUploadBytes)
            : NaN;
    if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg;
    return 52_428_800;
}

function reminkoExplainAnime4kSizeError(rawMessage, fileSize) {
    const msg = String(rawMessage || '');
    const lower = msg.toLowerCase();
    if (
        lower.includes('maximum allowed size') ||
        lower.includes('entitytoolarge') ||
        lower.includes('maximum size exceeded') ||
        lower.includes('413')
    ) {
        const maxB = reminkoGetAnime4kMaxUploadBytes();
        const fileLabel = fileSize ? reminkoFormatUploadBytes(fileSize) : 'файл';
        return (
            `Supabase отклонил ${fileLabel}: превышен лимит (${reminkoFormatUploadBytes(maxB)}). ` +
            `На Free тарифе глобальный лимит Storage — 50 MB, даже если bucket настроен на 5 GB. ` +
            `Варианты: (1) Supabase Pro → Storage → Settings → Global file size limit до 5 GB, ` +
            `и в config.local.js: anime4k.maxUploadBytes = 5368709120; ` +
            `(2) залить MP4 на Bunny/R2/CDN и вставить прямую ссылку в поле URL в таблице ниже.`
        );
    }
    return msg || 'Ошибка загрузки в Storage';
}

function reminkoUploadAnime4kToStorage(bucket, storagePath, file, onProgress) {
    return new Promise(async (resolve, reject) => {
        if (!supabaseClient) {
            reject(new Error('Нет клиента Supabase'));
            return;
        }
        const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
        if (sessionErr) {
            reject(sessionErr);
            return;
        }
        const token = sessionData?.session?.access_token;
        if (!token) {
            reject(new Error('Войдите в аккаунт создателя'));
            return;
        }

        const baseUrl =
            (typeof window !== 'undefined' && window.SUPABASE_URL) ||
            (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '');
        const apiKey =
            (typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) ||
            (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '');
        if (!baseUrl || !apiKey) {
            reject(new Error('Supabase URL не настроен'));
            return;
        }

        const encodedPath = String(storagePath)
            .split('/')
            .map((part) => encodeURIComponent(part))
            .join('/');
        const url = `${String(baseUrl).replace(/\/$/, '')}/storage/v1/object/${bucket}/${encodedPath}`;
        const started = Date.now();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('apikey', apiKey);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.setRequestHeader('x-upsert', 'true');
        xhr.setRequestHeader('cache-control', '3600');

        xhr.upload.onprogress = (evt) => {
            if (typeof onProgress !== 'function') return;
            const total = evt.lengthComputable ? evt.total : file.size || 0;
            const loaded = evt.loaded || 0;
            const pct = total > 0 ? Math.min(95, Math.round((loaded / total) * 95)) : 0;
            const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
            const speed = loaded / elapsed;
            const etaSec = speed > 0 && total > loaded ? (total - loaded) / speed : null;
            onProgress({
                phase: 'storage',
                percent: pct,
                loaded,
                total,
                etaSec,
                label: `Загрузка в Storage: ${reminkoFormatUploadBytes(loaded)} / ${reminkoFormatUploadBytes(total)}`
            });
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(true);
                return;
            }
            let msg = `Storage HTTP ${xhr.status}`;
            try {
                const j = JSON.parse(xhr.responseText);
                if (j?.message) msg = j.message;
                else if (j?.error) msg = j.error;
            } catch (_) {}
            reject(new Error(msg));
        };
        xhr.onerror = () =>
            reject(new Error('Сеть оборвалась. Не закрывайте вкладку и проверьте интернет.'));
        xhr.onabort = () => reject(new Error('Загрузка отменена'));
        xhr.send(file);
    });
}

class CreatorAdminPanel {
    constructor() {
        this.isCreator = false;
        this.currentUser = null;
        this.currentTab = 'dashboard';
    }

    // Панель только у учётной записи создателя сайта (email/RPC), без ролей в БД
    async checkCreatorStatus(userId) {
        if (!userId || !supabaseClient) return false;

        try {
            const { data, error } = await supabaseClient.rpc('is_site_creator_user_id', {
                user_id: userId
            });
            if (!error && data === true) {
                this.isCreator = true;
                return true;
            }
        } catch (_) {
            /* fallback ниже */
        }

        try {
            const {
                data: { user },
                error: userError
            } = await supabaseClient.auth.getUser();
            if (userError || !user) return false;
            const currentEmail = String(user.email || '').toLowerCase().trim();
            if (typeof isSiteCreatorEmail === 'function') {
                const ok = isSiteCreatorEmail(currentEmail);
                this.isCreator = !!ok;
                if (ok) return true;
            } else {
                const creatorEmail =
                    typeof SITE_CREATOR_EMAIL !== 'undefined'
                        ? String(SITE_CREATOR_EMAIL).toLowerCase().trim()
                        : 'creator@reminko.com';
                if (currentEmail && currentEmail === creatorEmail) {
                    this.isCreator = true;
                    return true;
                }
            }

            const targetEmail = await this._getUserEmailById(userId);
            if (targetEmail && typeof isSiteCreatorEmail === 'function') {
                const ok = isSiteCreatorEmail(targetEmail);
                this.isCreator = !!ok;
                return !!ok;
            }
            this.isCreator = false;
            return false;
        } catch (error) {
            console.error('Ошибка проверки создателя:', error);
            this.isCreator = false;
            return false;
        }
    }

    async _getUserEmailById(userId) {
        if (!userId || !supabaseClient) return null;
        try {
            const { data, error } = await supabaseClient.rpc('get_user_email', { user_id: userId });
            if (error) return null;
            return data || null;
        } catch {
            return null;
        }
    }

    async _rpcWithFallback(name, payloads) {
        if (!supabaseClient) return { data: null, error: new Error('Нет Supabase') };
        const attempts = Array.isArray(payloads) ? payloads : [payloads];
        let lastError = null;
        for (const args of attempts) {
            try {
                const { data, error } = await supabaseClient.rpc(name, args || {});
                if (!error) return { data, error: null };
                lastError = error;
            } catch (e) {
                lastError = e;
            }
        }
        return { data: null, error: lastError };
    }

    async _assertCallerIsSiteCreator() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const email = (user && user.email) || '';
        if (typeof isSiteCreatorEmail === 'function') {
            if (!isSiteCreatorEmail(email)) {
                return {
                    ok: false,
                    message: 'Управление услугами доступно только учётной записи создателя сайта.'
                };
            }
        } else if (email.toLowerCase() !== 'creator@reminko.com') {
            return { ok: false, message: 'Управление услугами доступно только создателю сайта.' };
        }
        return { ok: true, user };
    }

    async _assertTargetServicesManageable() {
        // Создатель имеет право управлять любым аккаунтом без исключений.
        return { ok: true };
    }

    async appendCreatorAuditLog(action, options = {}) {
        if (!supabaseClient) return { success: false, message: 'Нет подключения' };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { success: false, message: gate.message };
        try {
            const {
                targetUserId = null,
                targetType = 'user',
                reason = null,
                details = {},
                actorUserId = this.currentUser && this.currentUser.id ? this.currentUser.id : null,
            } = options || {};
            const { error } = await supabaseClient.from('creator_audit_logs').insert({
                actor_user_id: actorUserId,
                action: String(action || 'unknown_action').slice(0, 120),
                target_user_id: targetUserId || null,
                target_type: targetType || null,
                reason: reason || null,
                details: details && typeof details === 'object' ? details : {},
            });
            if (error) {
                console.warn('[CreatorAdmin] appendCreatorAuditLog:', error);
                return { success: false, message: error.message || 'Ошибка записи аудита' };
            }
            return { success: true };
        } catch (e) {
            console.warn('[CreatorAdmin] appendCreatorAuditLog exception:', e);
            return { success: false, message: e.message || 'Ошибка записи аудита' };
        }
    }

    async getCreatorAuditLogs(limit = 120, actionFilter = '') {
        if (!supabaseClient) return { rows: [], error: 'Нет подключения' };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { rows: [], error: gate.message };
        try {
            const safeLimit = Math.min(300, Math.max(1, parseInt(limit, 10) || 120));
            let query = supabaseClient
                .from('creator_audit_logs')
                .select('id, created_at, actor_user_id, action, target_user_id, target_type, reason, details')
                .order('created_at', { ascending: false })
                .limit(safeLimit);
            if (actionFilter) {
                query = query.eq('action', actionFilter);
            }
            const { data, error } = await query;
            if (error) return { rows: [], error: error.message || 'Ошибка загрузки лога' };

            const rows = data || [];
            const ids = [...new Set(rows.flatMap((r) => [r.actor_user_id, r.target_user_id]).filter(Boolean))];
            let profilesMap = new Map();
            if (ids.length) {
                const { data: profs } = await supabaseClient.from('profiles').select('id, username').in('id', ids);
                profilesMap = new Map((profs || []).map((p) => [p.id, p.username]));
            }
            return {
                rows: rows.map((r) => ({
                    ...r,
                    actor_name: profilesMap.get(r.actor_user_id) || null,
                    target_name: profilesMap.get(r.target_user_id) || null,
                })),
                error: null,
            };
        } catch (e) {
            return { rows: [], error: e.message || 'Ошибка загрузки лога' };
        }
    }

    async getGiveawayCreatorStats() {
        if (!supabaseClient) return { rows: [], error: 'Нет подключения' };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { rows: [], error: gate.message };
        try {
            const { data, error } = await supabaseClient.rpc('giveaway_creator_stats');
            if (error) return { rows: [], error: error.message || 'Ошибка загрузки розыгрыша' };
            return { rows: data || [], error: null };
        } catch (e) {
            return { rows: [], error: e.message || 'Ошибка загрузки розыгрыша' };
        }
    }

    async getGiveawayPreregCreatorList() {
        if (!supabaseClient) return { rows: [], error: 'Нет подключения' };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { rows: [], error: gate.message };
        try {
            const { data, error } = await supabaseClient.rpc('giveaway_prereg_creator_list');
            if (error) return { rows: [], error: error.message || 'Ошибка загрузки предрегистрации' };
            return { rows: data || [], error: null };
        } catch (e) {
            return { rows: [], error: e.message || 'Ошибка загрузки предрегистрации' };
        }
    }

    // Получить расширенную статистику
    async getAdvancedStats() {
        if (!supabaseClient) return null;
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return null;

        try {
            const now = new Date();
            const todayUtc = new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
            );
            const weekAgo = new Date(todayUtc);
            weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

            const [{ count: usersCount }, { count: newUsersToday }, { count: newUsersWeek }] =
                await Promise.all([
                    supabaseClient
                        .from('profiles')
                        .select('*', { count: 'exact', head: true }),
                    supabaseClient
                        .from('profiles')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', todayUtc.toISOString()),
                    supabaseClient
                        .from('profiles')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', weekAgo.toISOString())
                ]);

            const [{ count: chatMessagesCount }, { count: chatMessagesToday }, { count: bannedCount }] =
                await Promise.all([
                    supabaseClient
                        .from('global_chat_messages')
                        .select('*', { count: 'exact', head: true })
                        .is('deleted_at', null),
                    supabaseClient
                        .from('global_chat_messages')
                        .select('*', { count: 'exact', head: true })
                        .is('deleted_at', null)
                        .gte('created_at', todayUtc.toISOString()),
                    supabaseClient
                        .from('profiles')
                        .select('*', { count: 'exact', head: true })
                        .eq('is_banned', true)
                ]);

            let vipCount = 0;
            const vipCandidates = [
                () =>
                    supabaseClient
                        .from('vip_subscriptions')
                        .select('*', { count: 'exact', head: true })
                        .eq('is_active', true),
                () =>
                    supabaseClient
                        .from('ai_subscriptions')
                        .select('*', { count: 'exact', head: true })
                        .neq('subscription_type', 'free')
            ];
            for (const load of vipCandidates) {
                try {
                    const { count, error } = await load();
                    if (!error) {
                        vipCount = count || 0;
                        break;
                    }
                } catch (_) {
                    // следующая таблица
                }
            }

            let activeUsers = 0;
            try {
                const [eventsRes, chatRes] = await Promise.all([
                    supabaseClient
                        .from('site_visit_events')
                        .select('user_id')
                        .gte('created_at', weekAgo.toISOString())
                        .not('user_id', 'is', null)
                        .limit(5000),
                    supabaseClient
                        .from('global_chat_messages')
                        .select('user_id')
                        .gte('created_at', weekAgo.toISOString())
                        .is('deleted_at', null)
                        .not('user_id', 'is', null)
                        .limit(5000)
                ]);
                const uniq = new Set();
                (eventsRes.data || []).forEach((r) => r.user_id && uniq.add(r.user_id));
                (chatRes.data || []).forEach((r) => r.user_id && uniq.add(r.user_id));
                activeUsers = uniq.size;
            } catch (_) {
                activeUsers = 0;
            }

            return {
                users: usersCount || 0,
                newUsersToday: newUsersToday || 0,
                chatMessages: chatMessagesCount || 0,
                chatMessagesToday: chatMessagesToday || 0,
                vipSubscriptions: vipCount || 0,
                bannedUsers: bannedCount || 0,
                activeUsers: activeUsers || 0,
                newUsersWeek: newUsersWeek || 0
            };
        } catch (error) {
            console.error('Ошибка получения статистики:', error);
            return {
                users: 0,
                newUsersToday: 0,
                chatMessages: 0,
                chatMessagesToday: 0,
                vipSubscriptions: 0,
                bannedUsers: 0,
                activeUsers: 0,
                newUsersWeek: 0
            };
        }
    }

    /**
     * Сводная лента для дашборда: чат и новые профили (последние по времени).
     * @returns {Promise<Array<{ type: string, at: string, title: string, body: string }>>}
     */
    async getRecentDashboardActivity(limit = 12) {
        if (!supabaseClient) return [];

        const esc = (t) =>
            String(t ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');

        try {
            const [chatRes, profilesRes, loginRes] = await Promise.all([
                supabaseClient
                    .from('global_chat_messages')
                    .select('message, created_at, user_id')
                    .is('deleted_at', null)
                    .order('created_at', { ascending: false })
                    .limit(8),
                supabaseClient
                    .from('profiles')
                    .select('username, created_at')
                    .order('created_at', { ascending: false })
                    .limit(8),
                supabaseClient
                    .from('site_visit_events')
                    .select('created_at, user_id, meta')
                    .eq('event_kind', 'action')
                    .eq('event_label', 'login')
                    .order('created_at', { ascending: false })
                    .limit(10)
            ]);

            const chatRows = chatRes.data || [];
            const chatUserIds = [...new Set(chatRows.map((r) => r.user_id).filter(Boolean))];
            const loginRows = loginRes.data || [];
            const loginUserIds = [...new Set(loginRows.map((r) => r.user_id).filter(Boolean))];
            let chatNameById = new Map();
            const nameIds = [...new Set([...chatUserIds, ...loginUserIds])];
            if (nameIds.length) {
                const { data: chatProfiles } = await supabaseClient
                    .from('profiles')
                    .select('id, username')
                    .in('id', nameIds);
                chatNameById = new Map((chatProfiles || []).map((p) => [p.id, p.username]));
            }

            const items = [];

            chatRows.forEach((r) => {
                const name = chatNameById.get(r.user_id) || 'Пользователь';
                const msg = (r.message || '').trim();
                items.push({
                    type: 'chat',
                    at: r.created_at,
                    title: `💬 ${esc(name)}`,
                    body: esc(msg.length > 140 ? `${msg.slice(0, 140)}…` : msg)
                });
            });

            (loginRows || []).forEach((r) => {
                if (!r.user_id) return;
                const name = chatNameById.get(r.user_id) || 'Аккаунт';
                const prov =
                    r.meta && typeof r.meta === 'object' && r.meta.provider
                        ? String(r.meta.provider)
                        : 'вход';
                items.push({
                    type: 'login',
                    at: r.created_at,
                    title: `🔑 Вход: ${esc(name)}`,
                    body: esc(prov)
                });
            });

            (profilesRes.data || []).forEach((r) => {
                const name = r.username || 'Без ника';
                items.push({
                    type: 'join',
                    at: r.created_at,
                    title: '👤 Новый пользователь',
                    body: esc(name)
                });
            });

            items.sort((a, b) => new Date(b.at) - new Date(a.at));
            return items.slice(0, limit);
        } catch (e) {
            console.warn('getRecentDashboardActivity:', e);
            return [];
        }
    }

    // Получить список пользователей с фильтрами
    async getUsersAdvanced(page = 1, limit = 50, filters = {}) {
        if (!supabaseClient) return { users: [], total: 0 };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { users: [], total: 0, error: gate.message };

        try {
            let query = supabaseClient
                .from('profiles')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false });

            // Фильтр по банам
            if (filters.banned !== undefined) {
                query = query.eq('is_banned', filters.banned);
            }

            // Поиск
            if (filters.search) {
                const safe = String(filters.search).trim();
                if (safe) {
                    try {
                        query = query.or(`username.ilike.%${safe}%,email.ilike.%${safe}%`);
                    } catch (_) {
                        query = query.ilike('username', `%${safe}%`);
                    }
                }
            }

            if (filters.excludeUserId) {
                query = query.neq('id', filters.excludeUserId);
            }

            query = query.range((page - 1) * limit, page * limit - 1);

            const { data, error, count } = await query;

            if (error) {
                console.error('Ошибка получения пользователей:', error);
                return { users: [], total: 0 };
            }

            // Получаем email и дополнительную информацию для каждого пользователя
            const usersWithDetails = await Promise.all((data || []).map(async (user) => {
                try {
                    // Email через RPC
                    const { data: emailData } = await supabaseClient
                        .rpc('get_user_email', { user_id: user.id });
                    
                    // VIP подписка
                    const { data: vip } = await supabaseClient
                        .from('vip_subscriptions')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('is_active', true)
                        .maybeSingle();

                    // Статистика активности
                    const { count: chatMessages } = await supabaseClient
                        .from('global_chat_messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('user_id', user.id)
                        .is('deleted_at', null);

                    const emailStr = emailData || '';
                    const isCreatorAcc =
                        typeof isSiteCreatorEmail === 'function'
                            ? isSiteCreatorEmail(emailStr)
                            : emailStr.toLowerCase() === 'creator@reminko.com';

                    return {
                        ...user,
                        email: emailData || 'Не указан',
                        is_site_creator_account: isCreatorAcc,
                        vip: vip
                            ? {
                                  is_active: true,
                                  expires_at: vip.expires_at
                              }
                            : null,
                        ai_subscription: { type: 'sleepy' },
                        activity: {
                            chat_messages: chatMessages || 0
                        }
                    };
                } catch (err) {
                    console.error('Ошибка получения деталей пользователя:', err);
                    return { ...user, email: 'Не указан', vip: null, ai_subscription: { type: 'sleepy' }, activity: { chat_messages: 0 } };
                }
            }));

            return { users: usersWithDetails, total: count || 0 };
        } catch (error) {
            console.error('Ошибка получения пользователей:', error);
            return { users: [], total: 0 };
        }
    }

    // Назначение ролей отключено: панель только у создателя по email
    async updateUserRole() {
        return {
            success: false,
            message:
                'Назначение ролей отключено. Доступ к панели есть только у учётной записи создателя сайта.'
        };
    }

    async _banViaRpc(userId, ban, reason) {
        const rpcList = [
            {
                fn: 'creator_set_user_ban',
                args: { p_user_id: userId, p_is_banned: !!ban, p_reason: reason || null }
            },
            { fn: 'set_user_ban', args: { p_user_id: userId, p_ban: !!ban, p_reason: reason || null } },
            { fn: 'toggle_user_ban', args: { p_user_id: userId, p_ban: !!ban, p_reason: reason || null } }
        ];
        for (const rpc of rpcList) {
            try {
                const { error } = await supabaseClient.rpc(rpc.fn, rpc.args);
                if (!error) return { success: true };
            } catch (_) {
                // fallback дальше
            }
        }
        return { success: false };
    }

    // Забанить/разбанить пользователя
    async toggleUserBan(userId, ban = true, reason = '') {
        if (!supabaseClient) return { success: false, message: 'Нет подключения' };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { success: false, message: gate.message };

        try {
            const rpcRes = await this._banViaRpc(userId, ban, reason);
            if (!rpcRes.success) {
                return {
                    success: false,
                    message: 'Ошибка изменения статуса. Нужны права создателя в Supabase (RPC ban).'
                };
            }

            await this.appendCreatorAuditLog('user_ban_toggle', {
                targetUserId: userId,
                targetType: 'user',
                reason: reason || null,
                details: { banned: !!ban },
            });
            return { success: true, message: ban ? 'Пользователь забанен' : 'Пользователь разбанен' };
        } catch (error) {
            console.error('Ошибка изменения статуса бана:', error);
            return { success: false, message: 'Ошибка изменения статуса' };
        }
    }

    // Получить сообщения чата с фильтрами
    async getChatMessages(filters = {}) {
        if (!supabaseClient) return [];

        try {
            // Сначала получаем сообщения
            let query = supabaseClient
                .from('global_chat_messages')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(filters.limit || 100);

            if (filters.userId) {
                query = query.eq('user_id', filters.userId);
            }

            if (filters.search) {
                query = query.ilike('message', `%${filters.search}%`);
            }

            if (filters.fromDate) {
                query = query.gte('created_at', filters.fromDate);
            }

            if (filters.toDate) {
                query = query.lte('created_at', filters.toDate);
            }

            const { data: messages, error } = await query;

            if (error) {
                console.error('Ошибка получения сообщений:', error);
                return [];
            }

            if (!messages || messages.length === 0) {
                return [];
            }

            // Получаем профили пользователей отдельно
            const userIds = [...new Set(messages.map(msg => msg.user_id))];
            const { data: profiles } = await supabaseClient
                .from('profiles')
                .select('id, username, avatar')
                .in('id', userIds);

            // Создаем мапу профилей
            const profilesMap = {};
            if (profiles) {
                profiles.forEach(profile => {
                    profilesMap[profile.id] = profile;
                });
            }

            // Объединяем данные
            return messages.map(msg => ({
                ...msg,
                user: profilesMap[msg.user_id] || { id: msg.user_id, username: 'Пользователь', avatar: null }
            }));
        } catch (error) {
            console.error('Ошибка получения сообщений:', error);
            return [];
        }
    }

    // Удалить сообщение чата
    async deleteChatMessage(messageId, reason = '') {
        if (!supabaseClient) return { success: false };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { success: false, message: gate.message };

        try {
            const { error } = await supabaseClient
                .from('global_chat_messages')
                .update({
                    deleted_at: new Date().toISOString()
                })
                .eq('id', messageId);

            if (error) {
                console.error('Ошибка удаления сообщения:', error);
                return { success: false, message: 'Ошибка удаления' };
            }

            await this.appendCreatorAuditLog('chat_message_delete', {
                targetType: 'chat_message',
                reason: reason || 'Удалено администратором',
                details: { message_id: messageId },
            });
            return { success: true, message: 'Сообщение удалено' };
        } catch (error) {
            console.error('Ошибка удаления сообщения:', error);
            return { success: false, message: 'Ошибка удаления' };
        }
    }

    // Мут пользователя в чате
    async muteUserChat(userId, hours, reason = '') {
        if (!supabaseClient) return { success: false };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { success: false, message: gate.message };

        try {
            const mutedUntil = new Date();
            mutedUntil.setHours(mutedUntil.getHours() + hours);

            const { error } = await supabaseClient
                .from('chat_mutes')
                .upsert({
                    user_id: userId,
                    muted_until: mutedUntil.toISOString(),
                    reason: reason || 'Мут от администратора',
                    created_by: this.currentUser.id
                }, {
                    onConflict: 'user_id'
                });

            if (error) {
                console.error('Ошибка мута пользователя:', error);
                return { success: false, message: 'Ошибка мута' };
            }

            await this.appendCreatorAuditLog('user_chat_mute', {
                targetUserId: userId,
                targetType: 'user',
                reason: reason || null,
                details: { hours, muted_until: mutedUntil.toISOString() },
            });
            return { success: true, message: `Пользователь замьючен до ${mutedUntil.toLocaleString('ru-RU')}` };
        } catch (error) {
            console.error('Ошибка мута пользователя:', error);
            return { success: false, message: 'Ошибка мута' };
        }
    }

    async getChatAutomodConfig() {
        if (!supabaseClient) return { ok: false, message: 'Нет подключения', rules: [], enabled: false };
        try {
            const gate = await this._assertCallerIsSiteCreator();
            if (!gate.ok) return { ok: false, message: gate.message, rules: [], enabled: false };

            const { data: rules, error } = await supabaseClient
                .from('chat_automod_rules')
                .select('id, rule_key, pattern, match_mode, strike_weight, mute_minutes, is_active, note')
                .order('id', { ascending: true });
            if (error) {
                return { ok: false, message: error.message || 'Ошибка загрузки правил', rules: [], enabled: false };
            }
            const list = Array.isArray(rules) ? rules : [];
            const enabled = list.some((r) => !!r.is_active);
            return { ok: true, rules: list, enabled, message: '' };
        } catch (e) {
            return { ok: false, message: e.message || 'Ошибка загрузки правил', rules: [], enabled: false };
        }
    }

    async saveChatAutomodConfig(payload = {}) {
        if (!supabaseClient) return { success: false, message: 'Нет подключения' };
        try {
            const gate = await this._assertCallerIsSiteCreator();
            if (!gate.ok) return { success: false, message: gate.message };

            const enabled = !!payload.enabled;
            const rules = Array.isArray(payload.rules) ? payload.rules : [];
            for (const item of rules) {
                const id = Number(item.id || 0);
                if (!Number.isFinite(id) || id <= 0) continue;
                const strikeWeight = Math.max(1, parseInt(item.strike_weight, 10) || 1);
                const muteMinutes = Math.max(1, parseInt(item.mute_minutes, 10) || 15);
                const rowActive = enabled ? !!item.is_active : false;
                const { error } = await supabaseClient
                    .from('chat_automod_rules')
                    .update({
                        strike_weight: strikeWeight,
                        mute_minutes: muteMinutes,
                        is_active: rowActive
                    })
                    .eq('id', id);
                if (error) return { success: false, message: error.message || `Ошибка сохранения правила ${id}` };
            }

            await this.appendCreatorAuditLog('chat_automod_settings_save', {
                targetType: 'chat_automod',
                details: {
                    enabled,
                    rules_count: rules.length
                }
            });
            return { success: true, message: 'Настройки автомодерации сохранены' };
        } catch (e) {
            return { success: false, message: e.message || 'Ошибка сохранения автомодерации' };
        }
    }

    async getChatAutomodRecentEvents(limit = 40) {
        if (!supabaseClient) return { ok: false, message: 'Нет подключения', rows: [] };
        try {
            const gate = await this._assertCallerIsSiteCreator();
            if (!gate.ok) return { ok: false, message: gate.message, rows: [] };

            const safeLimit = Math.min(120, Math.max(1, parseInt(limit, 10) || 40));
            const { data, error } = await supabaseClient
                .from('chat_automod_events')
                .select('id, created_at, user_id, matched_rule_id, action, message_preview, details')
                .order('created_at', { ascending: false })
                .limit(safeLimit);
            if (error) return { ok: false, message: error.message || 'Ошибка загрузки событий', rows: [] };

            const rows = Array.isArray(data) ? data : [];
            const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
            const ruleIds = [...new Set(rows.map((r) => r.matched_rule_id).filter(Boolean))];

            let usersMap = new Map();
            let rulesMap = new Map();
            if (userIds.length) {
                const { data: profiles } = await supabaseClient
                    .from('profiles')
                    .select('id, username')
                    .in('id', userIds);
                usersMap = new Map((profiles || []).map((p) => [p.id, p.username]));
            }
            if (ruleIds.length) {
                const { data: rules } = await supabaseClient
                    .from('chat_automod_rules')
                    .select('id, rule_key')
                    .in('id', ruleIds);
                rulesMap = new Map((rules || []).map((r) => [r.id, r.rule_key]));
            }

            return {
                ok: true,
                rows: rows.map((r) => ({
                    ...r,
                    username: usersMap.get(r.user_id) || null,
                    rule_key: rulesMap.get(r.matched_rule_id) || null
                })),
                message: ''
            };
        } catch (e) {
            return { ok: false, message: e.message || 'Ошибка загрузки событий', rows: [] };
        }
    }

    async resetChatAutomodUserState(userId, reason = '') {
        if (!supabaseClient) return { success: false, message: 'Нет подключения' };
        try {
            const gate = await this._assertCallerIsSiteCreator();
            if (!gate.ok) return { success: false, message: gate.message };
            const uid = String(userId || '').trim();
            if (!uid) return { success: false, message: 'Укажите user id' };

            const { error: e1 } = await supabaseClient.from('chat_automod_state').delete().eq('user_id', uid);
            if (e1) return { success: false, message: e1.message || 'Ошибка сброса состояния' };
            const { error: e2 } = await supabaseClient
                .from('chat_mutes')
                .delete()
                .eq('user_id', uid)
                .eq('reason', 'automod:toxic_language');
            if (e2) return { success: false, message: e2.message || 'Ошибка снятия авто-мута' };

            await this.appendCreatorAuditLog('chat_automod_state_reset', {
                targetUserId: uid,
                targetType: 'chat_automod',
                reason: reason || null,
                details: { reset: true }
            });
            return { success: true, message: 'Состояние автомодерации пользователя сброшено' };
        } catch (e) {
            return { success: false, message: e.message || 'Ошибка сброса автомодерации' };
        }
    }

    // Управление VIP подпиской (только создатель сайта)
    async manageVIPSubscription(userId, action, days = null) {
        if (!supabaseClient) return { success: false };

        try {
            const gate = await this._assertCallerIsSiteCreator();
            if (!gate.ok) return { success: false, message: gate.message };

            if (action === 'grant' && days) {
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + days);

                const { error } = await supabaseClient
                    .from('vip_subscriptions')
                    .upsert({
                        user_id: userId,
                        is_active: true,
                        expires_at: expiresAt.toISOString()
                    }, {
                        onConflict: 'user_id'
                    });

                if (error) {
                    console.error('Ошибка выдачи VIP:', error);
                    return {
                        success: false,
                        message:
                            error.message ||
                            error.details ||
                            'Ошибка выдачи VIP. Проверьте SQL: политика vip_subscriptions_site_creator_all.'
                    };
                }

                await this.appendCreatorAuditLog('vip_subscription_manage', {
                    targetUserId: userId,
                    targetType: 'user',
                    details: { action: 'grant', days, expires_at: expiresAt.toISOString() },
                });
                return { success: true, message: `VIP выдан до ${expiresAt.toLocaleDateString('ru-RU')}` };
            } else if (action === 'revoke') {
                const { data: updated, error } = await supabaseClient
                    .from('vip_subscriptions')
                    .update({ is_active: false })
                    .eq('user_id', userId)
                    .select('user_id');

                if (error) {
                    console.error('Ошибка отзыва VIP:', error);
                    return {
                        success: false,
                        message: error.message || error.details || 'Ошибка отзыва VIP'
                    };
                }
                if (!updated || updated.length === 0) {
                    return { success: true, message: 'VIP не был активен (запись не найдена)' };
                }

                await this.appendCreatorAuditLog('vip_subscription_manage', {
                    targetUserId: userId,
                    targetType: 'user',
                    details: { action: 'revoke' },
                });
                return { success: true, message: 'VIP «Смотреть вместе» снят' };
            }

            return { success: false, message: 'Неверное действие' };
        } catch (error) {
            console.error('Ошибка управления VIP:', error);
            return { success: false, message: 'Ошибка управления VIP' };
        }
    }

    // Управление подпиской ИИ (только создатель сайта)
    async manageAISubscription(userId, subscriptionType, days = null) {
        if (!supabaseClient) return { success: false };

        try {
            const gate = await this._assertCallerIsSiteCreator();
            if (!gate.ok) return { success: false, message: gate.message };

            let expiresAt = null;
            if (subscriptionType === 'free') {
                expiresAt = null;
            } else if (days) {
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + days);
            }

            if (typeof aiSubscriptionService !== 'undefined') {
                const result = await aiSubscriptionService.updateSubscriptionType(
                    userId, 
                    subscriptionType, 
                    expiresAt ? expiresAt.toISOString() : null
                );
                const payload = {
                    success: result,
                    message: result
                        ? subscriptionType === 'free'
                            ? 'Minko AI: переведён на Free'
                            : 'Тариф Minko AI обновлён'
                        : 'Ошибка обновления подписки ИИ. Проверьте политику ai_subscriptions_site_creator_all в SQL.'
                };
                if (result) {
                    await this.appendCreatorAuditLog('ai_subscription_manage', {
                        targetUserId: userId,
                        targetType: 'user',
                        details: {
                            subscription_type: subscriptionType,
                            days: days || null,
                            expires_at: expiresAt ? expiresAt.toISOString() : null,
                        },
                    });
                }
                return payload;
            }

            const { error } = await supabaseClient
                .from('ai_subscriptions')
                .upsert({
                    user_id: userId,
                    subscription_type: subscriptionType,
                    expires_at: expiresAt ? expiresAt.toISOString() : null
                }, {
                    onConflict: 'user_id'
                });

            if (error) {
                console.error('Ошибка обновления подписки ИИ:', error);
                return {
                    success: false,
                    message: error.message || error.details || 'Ошибка обновления подписки ИИ'
                };
            }

            await this.appendCreatorAuditLog('ai_subscription_manage', {
                targetUserId: userId,
                targetType: 'user',
                details: {
                    subscription_type: subscriptionType,
                    days: days || null,
                    expires_at: expiresAt ? expiresAt.toISOString() : null,
                },
            });
            return {
                success: true,
                message:
                    subscriptionType === 'free'
                        ? 'Minko AI: переведён на Free'
                        : 'Тариф Minko AI обновлён'
            };
        } catch (error) {
            console.error('Ошибка обновления подписки ИИ:', error);
            return { success: false, message: 'Ошибка обновления подписки' };
        }
    }

    // Получить популярный контент
    async getPopularContent(type = 'anime', limit = 10) {
        // Это будет работать с локальной базой данных
        // В будущем можно интегрировать с Supabase, если есть таблица просмотров
        return [];
    }

    // Отправить уведомление пользователю
    async sendNotificationToUser(userId, title, message, type = 'system', link = null) {
        if (!supabaseClient) return { success: false };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { success: false, message: gate.message };

        try {
            const { error } = await supabaseClient
                .from('notifications')
                .insert({
                    user_id: userId,
                    type: type,
                    title: title,
                    message: message,
                    link: link
                });

            if (error) {
                console.error('Ошибка отправки уведомления:', error);
                return { success: false, message: 'Ошибка отправки уведомления' };
            }

            await this.appendCreatorAuditLog('notification_send_single', {
                targetUserId: userId,
                targetType: 'user',
                details: { type, title: String(title || '').slice(0, 160), has_link: !!link },
            });
            return { success: true, message: 'Уведомление отправлено' };
        } catch (error) {
            console.error('Ошибка отправки уведомления:', error);
            return { success: false, message: 'Ошибка отправки уведомления' };
        }
    }

    // Массовая отправка уведомлений
    async sendBulkNotifications(userIds, title, message, type = 'system', link = null) {
        if (!supabaseClient || !userIds || userIds.length === 0) return { success: false };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { success: false, message: gate.message };

        try {
            const notifications = userIds.map(userId => ({
                user_id: userId,
                type: type,
                title: title,
                message: message,
                link: link
            }));

            const { error } = await supabaseClient
                .from('notifications')
                .insert(notifications);

            if (error) {
                console.error('Ошибка массовой отправки уведомлений:', error);
                return { success: false, message: 'Ошибка отправки уведомлений' };
            }

            await this.appendCreatorAuditLog('notification_send_bulk', {
                targetType: 'users',
                details: {
                    recipients_count: userIds.length,
                    type,
                    title: String(title || '').slice(0, 160),
                    has_link: !!link,
                },
            });
            return { success: true, message: `Уведомления отправлены ${userIds.length} пользователям` };
        } catch (error) {
            console.error('Ошибка массовой отправки уведомлений:', error);
            return { success: false, message: 'Ошибка отправки уведомлений' };
        }
    }

    // Получить активность пользователя
    async getUserActivity(userId, days = 7) {
        if (!supabaseClient) return null;

        try {
            const dateFrom = new Date();
            dateFrom.setDate(dateFrom.getDate() - days);

            // Сообщения в чате
            const { count: chatMessages } = await supabaseClient
                .from('global_chat_messages')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .is('deleted_at', null)
                .gte('created_at', dateFrom.toISOString());

            return {
                chat_messages: chatMessages || 0,
                total: chatMessages || 0
            };
        } catch (error) {
            console.error('Ошибка получения активности:', error);
            return null;
        }
    }

    /** Записи глобального каталога (Jikan / MyAnimeList), id на сайте = 10_000_000 + mal_id */
    async listCatalogSiteAnime() {
        if (!supabaseClient) return { success: false, message: 'Supabase не инициализирован', rows: [] };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { success: false, message: gate.message, rows: [] };
        try {
            const { data, error } = await supabaseClient
                .from('catalog_site_anime')
                .select('mal_id, created_at, jikan, title_ru, description_ru')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { success: true, rows: data || [] };
        } catch (e) {
            console.error('[CreatorAdmin] listCatalogSiteAnime', e);
            return {
                success: false,
                message: e.message || 'Ошибка загрузки catalog_site_anime',
                rows: []
            };
        }
    }

    async upsertCatalogSiteAnime(jikanFull, options = {}) {
        if (!supabaseClient) return { success: false, message: 'Нет клиента Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const mal = jikanFull && jikanFull.mal_id;
        if (!mal) return { success: false, message: 'В ответе Jikan нет mal_id' };
        const tr =
            options.title_ru != null && String(options.title_ru).trim()
                ? String(options.title_ru).trim()
                : null;
        const dr =
            options.description_ru != null && String(options.description_ru).trim()
                ? String(options.description_ru).trim()
                : null;
        try {
            const { error } = await supabaseClient.from('catalog_site_anime').upsert(
                {
                    mal_id: mal,
                    jikan: jikanFull,
                    added_by: a.user.id,
                    title_ru: tr,
                    description_ru: dr
                },
                { onConflict: 'mal_id' }
            );
            if (error) throw error;
            return { success: true, message: 'Аниме добавлено в каталог на сайте' };
        } catch (e) {
            console.error('[CreatorAdmin] upsertCatalogSiteAnime', e);
            return { success: false, message: e.message || 'Ошибка записи в Supabase' };
        }
    }

    async deleteCatalogSiteAnime(malId) {
        if (!supabaseClient) return { success: false, message: 'Нет клиента' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const mid = parseInt(malId, 10);
        if (!mid || Number.isNaN(mid)) return { success: false, message: 'Некорректный mal_id' };
        try {
            const { error } = await supabaseClient.from('catalog_site_anime').delete().eq('mal_id', mid);
            if (error) throw error;
            return { success: true, message: 'Удалено из каталога сайта' };
        } catch (e) {
            console.error('[CreatorAdmin] deleteCatalogSiteAnime', e);
            return { success: false, message: e.message || 'Ошибка удаления' };
        }
    }

    async listCatalog4kAnime() {
        if (!supabaseClient) return { success: false, message: 'Supabase не инициализирован', rows: [] };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { success: false, message: gate.message, rows: [] };
        try {
            const { data, error } = await supabaseClient
                .from('catalog_4k_anime')
                .select('mal_id, created_at, jikan, title_ru, description_ru, video_url, poster_url, published')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { success: true, rows: data || [] };
        } catch (e) {
            console.error('[CreatorAdmin] listCatalog4kAnime', e);
            return { success: false, message: e.message || 'Ошибка загрузки catalog_4k_anime', rows: [] };
        }
    }

    async upsertCatalog4kAnime(jikanFull, options = {}) {
        if (!supabaseClient) return { success: false, message: 'Нет клиента Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const mal = jikanFull && jikanFull.mal_id;
        if (!mal) return { success: false, message: 'В ответе Jikan нет mal_id' };
        const tr =
            options.title_ru != null && String(options.title_ru).trim()
                ? String(options.title_ru).trim()
                : null;
        const dr =
            options.description_ru != null && String(options.description_ru).trim()
                ? String(options.description_ru).trim()
                : null;
        const videoUrl =
            options.video_url != null && String(options.video_url).trim()
                ? String(options.video_url).trim()
                : null;
        const posterUrl =
            options.poster_url != null && String(options.poster_url).trim()
                ? String(options.poster_url).trim()
                : null;
        const published = options.published !== false;
        try {
            const payload = {
                mal_id: mal,
                jikan: jikanFull,
                added_by: a.user.id,
                published
            };
            if (tr != null) payload.title_ru = tr;
            if (dr != null) payload.description_ru = dr;
            if (videoUrl != null) payload.video_url = videoUrl;
            if (posterUrl != null) payload.poster_url = posterUrl;
            const { error } = await supabaseClient.from('catalog_4k_anime').upsert(payload, { onConflict: 'mal_id' });
            if (error) throw error;
            return { success: true, message: 'Добавлено в ≈4K каталог', mal_id: mal };
        } catch (e) {
            console.error('[CreatorAdmin] upsertCatalog4kAnime', e);
            return { success: false, message: e.message || 'Ошибка записи в Supabase' };
        }
    }

    async updateCatalog4kVideoUrl(malId, videoUrl) {
        return this.updateCatalog4kAnimeMeta(malId, { video_url: videoUrl });
    }

    async updateCatalog4kAnimeMeta(malId, fields = {}) {
        if (!supabaseClient) return { success: false, message: 'Нет клиента' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const mid = parseInt(malId, 10);
        if (!mid || Number.isNaN(mid)) return { success: false, message: 'Некорректный mal_id' };

        const payload = {};
        if (fields.title_ru !== undefined) {
            const t = String(fields.title_ru || '').trim();
            payload.title_ru = t || null;
        }
        if (fields.description_ru !== undefined) {
            const d = String(fields.description_ru || '').trim();
            payload.description_ru = d || null;
        }
        if (fields.poster_url !== undefined) {
            const p = String(fields.poster_url || '').trim();
            payload.poster_url = p || null;
        }
        if (fields.video_url !== undefined) {
            const v = String(fields.video_url || '').trim();
            payload.video_url = v || null;
        }
        if (fields.published !== undefined) {
            payload.published = fields.published !== false;
        }
        if (!Object.keys(payload).length) {
            return { success: false, message: 'Нет полей для сохранения' };
        }

        try {
            const { data, error } = await supabaseClient
                .from('catalog_4k_anime')
                .update(payload)
                .eq('mal_id', mid)
                .select('mal_id')
                .maybeSingle();
            if (error) throw error;
            if (!data) {
                return {
                    success: false,
                    message: 'Запись не обновлена — нет доступа или тайтл не найден в ≈4K каталоге'
                };
            }
            return { success: true, message: 'Карточка ≈4K сохранена' };
        } catch (e) {
            console.error('[CreatorAdmin] updateCatalog4kAnimeMeta', e);
            return { success: false, message: e.message || 'Ошибка сохранения' };
        }
    }

    async uploadCatalog4kVideo(malId, file, options = {}) {
        if (!supabaseClient) return { success: false, message: 'Нет клиента Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const mid = parseInt(malId, 10);
        if (!mid || Number.isNaN(mid)) return { success: false, message: 'Некорректный mal_id' };
        if (!file || !(file instanceof Blob)) return { success: false, message: 'Нет файла' };
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const report = (payload) => {
            if (onProgress) onProgress(payload);
        };
        const name = (file.name && String(file.name).trim()) || 'video.mp4';
        const safeName = name.replace(/[^\w.\-()+]/g, '_').slice(0, 120);
        const path = `${mid}/${Date.now()}_${safeName}`;
        const maxBytes = reminkoGetAnime4kMaxUploadBytes();
        if (file.size > maxBytes) {
            return {
                success: false,
                message: reminkoExplainAnime4kSizeError('maximum allowed size', file.size)
            };
        }
        try {
            report({ phase: 'prepare', percent: 0, label: 'Проверка доступа…' });
            await reminkoUploadAnime4kToStorage('anime-4k-videos', path, file, report);
            report({ phase: 'db', percent: 97, label: 'Сохранение ссылки в каталоге…' });
            const { data: pub } = supabaseClient.storage.from('anime-4k-videos').getPublicUrl(path);
            const url = pub && pub.publicUrl ? pub.publicUrl : '';
            if (!url) throw new Error('Не удалось получить public URL');
            const { error: dbErr } = await supabaseClient
                .from('catalog_4k_anime')
                .update({ video_url: url })
                .eq('mal_id', mid);
            if (dbErr) throw dbErr;
            report({ phase: 'done', percent: 100, label: 'Готово! Видео привязано к каталогу.' });
            return { success: true, message: 'Видео загружено и привязано к каталогу', video_url: url };
        } catch (e) {
            console.error('[CreatorAdmin] uploadCatalog4kVideo', e);
            return {
                success: false,
                message: reminkoExplainAnime4kSizeError(e.message, file.size)
            };
        }
    }

    async deleteCatalog4kAnime(malId) {
        if (!supabaseClient) return { success: false, message: 'Нет клиента' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const mid = parseInt(malId, 10);
        if (!mid || Number.isNaN(mid)) return { success: false, message: 'Некорректный mal_id' };
        try {
            const { error } = await supabaseClient.from('catalog_4k_anime').delete().eq('mal_id', mid);
            if (error) throw error;
            return { success: true, message: 'Удалено из ≈4K каталога' };
        } catch (e) {
            console.error('[CreatorAdmin] deleteCatalog4kAnime', e);
            return { success: false, message: e.message || 'Ошибка удаления' };
        }
    }

    /**
     * Посещения сайта: сводка (RPC) + последние события. Только учётка создателя.
     * @param {number} days 1…90
     */
    async getSiteVisitAnalytics(days = 7) {
        if (!supabaseClient) return { bundle: null, recent: [], error: 'Supabase не инициализирован' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { bundle: null, recent: [], error: a.message };
        const d = Math.min(90, Math.max(1, parseInt(days, 10) || 7));
        const since = new Date();
        since.setDate(since.getDate() - d);
        since.setHours(0, 0, 0, 0);
        const sinceIso = since.toISOString();
        try {
            let bundle = null;
            let live = null;
            const rpcRes = await this._rpcWithFallback('site_visit_creator_bundle', [
                { p_since: sinceIso },
                { since: sinceIso },
                { days: d },
                {}
            ]);
            if (!rpcRes.error) {
                bundle = rpcRes.data || null;
            }
            const liveRes = await this._rpcWithFallback('site_visit_creator_live', [
                { p_window_minutes: 15 },
                { window_minutes: 15 },
                {}
            ]);
            if (!liveRes.error) {
                live = liveRes.data || null;
            }
            const { data: recent, error: e2 } = await supabaseClient
                .from('site_visit_events')
                .select(
                    'id, created_at, path, page_title, referrer, user_agent, visitor_id, user_id, event_kind, event_label, meta'
                )
                .gte('created_at', sinceIso)
                .order('created_at', { ascending: false })
                .limit(120);
            if (e2) throw e2;
            if (!bundle) {
                const summary = {
                    pageviews: 0,
                    total_events: 0,
                    unique_visitors: 0,
                    unique_logged_accounts: 0,
                    events_by_logged_in: 0
                };
                const pathCount = new Map();
                const dayCount = new Map();
                const visitorSet = new Set();
                const accountSet = new Set();
                (recent || []).forEach((row) => {
                    summary.total_events += 1;
                    if (row.event_kind === 'pageview') summary.pageviews += 1;
                    if (row.visitor_id) visitorSet.add(row.visitor_id);
                    if (row.user_id) {
                        accountSet.add(row.user_id);
                        summary.events_by_logged_in += 1;
                    }
                    const p = String(row.path || '').slice(0, 500);
                    if (p) pathCount.set(p, (pathCount.get(p) || 0) + 1);
                    const day = row.created_at ? String(row.created_at).slice(0, 10) : '';
                    if (day) dayCount.set(day, (dayCount.get(day) || 0) + 1);
                });
                summary.unique_visitors = visitorSet.size;
                summary.unique_logged_accounts = accountSet.size;
                const top_paths = [...pathCount.entries()]
                    .sort((a1, b1) => b1[1] - a1[1])
                    .slice(0, 12)
                    .map(([path, cnt]) => ({ path, cnt }));
                const by_day = [...dayCount.entries()]
                    .sort((a1, b1) => (a1[0] < b1[0] ? -1 : 1))
                    .map(([day, cnt]) => ({ day, cnt }));
                bundle = { summary, top_paths, by_day };
            }
            if (!live) {
                const cutoffMs = Date.now() - 15 * 60 * 1000;
                const rows = (recent || []).filter((r) => new Date(r.created_at || 0).getTime() >= cutoffMs);
                const events = rows.length;
                const pageviews = rows.filter((r) => r.event_kind === 'pageview').length;
                const logins = rows.filter((r) => r.event_kind === 'action' && String(r.event_label || '') === 'login').length;
                live = {
                    window_minutes: 15,
                    events,
                    pageviews,
                    logins,
                    unique_visitors: new Set(rows.map((r) => String(r.visitor_id || '')).filter(Boolean)).size,
                };
            }
            return { bundle: { ...(bundle || {}), live }, recent: recent || [], error: null };
        } catch (e) {
            console.error('[CreatorAdmin] getSiteVisitAnalytics', e);
            return {
                bundle: null,
                recent: [],
                error:
                    e.message ||
                    'Не удалось загрузить аналитику. Выполните миграцию: site_visit_events и site_visit_creator_bundle в database.sql'
            };
        }
    }

    /** Кто сейчас на сайте (уникальные visitor_id за последние N минут). Только создатель. */
    async getSiteOnlineUsers(windowMinutes = 5) {
        if (!supabaseClient) return { rows: [], error: 'Supabase не инициализирован' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { rows: [], error: a.message };
        const mins = Math.min(15, Math.max(1, parseInt(windowMinutes, 10) || 5));
        try {
            const rpcRes = await this._rpcWithFallback('site_visit_creator_online_users', [
                { p_window_minutes: mins },
                { window_minutes: mins },
                {}
            ]);
            if (rpcRes.error) throw rpcRes.error;
            const raw = rpcRes.data;
            const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? raw : [];
            return { rows, error: null };
        } catch (e) {
            console.error('[CreatorAdmin] getSiteOnlineUsers', e);
            return { rows: [], error: e.message || 'Не удалось загрузить список онлайн' };
        }
    }

    /** Состояние удалённого сервера Minko AI (Supabase + опционально Netlify hook) */
    async getMinkoAiServerBundle() {
        if (!supabaseClient) return { ok: false, message: 'Нет Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { ok: false, message: a.message };
        try {
            const pub = await supabaseClient
                .from('minko_ai_public_state')
                .select('chat_enabled, maintenance_message, offline_except_creator, search_provider, updated_at')
                .eq('id', 1)
                .maybeSingle();
            const sec = await supabaseClient
                .from('minko_ai_creator_secrets')
                .select('netlify_build_hook_url, updated_at')
                .eq('id', 1)
                .maybeSingle();
            const logs = await supabaseClient
                .from('minko_ai_server_logs')
                .select('id, level, message, details, created_at')
                .order('created_at', { ascending: false })
                .limit(80);
            const errs = [pub.error, sec.error, logs.error].filter(Boolean);
            if (errs.length && !pub.data && pub.error) {
                return {
                    ok: false,
                    message:
                        pub.error.message ||
                        'Нет таблиц Minko. Выполните supabase/minko_ai_server.sql в SQL Editor.'
                };
            }
            return {
                ok: true,
                public: pub.data || {
                    chat_enabled: true,
                    maintenance_message: '',
                    offline_except_creator: false,
                    search_provider: 'auto',
                    updated_at: null,
                },
                secrets: sec.data || { netlify_build_hook_url: null },
                logs: logs.data || []
            };
        } catch (e) {
            console.error('[CreatorAdmin] getMinkoAiServerBundle', e);
            return { ok: false, message: e.message || 'Ошибка загрузки' };
        }
    }

    async saveMinkoAiServerSettings(
        chatEnabled,
        maintenanceMessage,
        offlineExceptCreator = false,
        searchProvider = 'auto'
    ) {
        if (!supabaseClient) return { success: false, message: 'Нет Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const sp = String(searchProvider || 'auto').trim().toLowerCase();
        const search_provider = sp === 'free' || sp === 'tavily' ? sp : 'auto';
        const row = {
            id: 1,
            chat_enabled: !!chatEnabled,
            maintenance_message: String(maintenanceMessage || '').slice(0, 2000),
            offline_except_creator: !!offlineExceptCreator,
            search_provider,
            updated_at: new Date().toISOString()
        };
        const { error } = await supabaseClient.from('minko_ai_public_state').upsert(row, { onConflict: 'id' });
        if (error) return { success: false, message: error.message };
        await this.appendCreatorAuditLog('minko_server_settings_save', {
            targetType: 'site',
            details: {
                chat_enabled: !!chatEnabled,
                offline_except_creator: !!offlineExceptCreator,
                search_provider,
                message_len: String(maintenanceMessage || '').length,
            },
        });
        return { success: true, message: 'Сохранено' };
    }

    async deleteUserAccountFully(userId, reason = '') {
        if (!supabaseClient) return { success: false, message: 'Нет подключения' };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { success: false, message: gate.message };
        if (!userId) return { success: false, message: 'Не указан userId' };
        try {
            const { data, error } = await this._rpcWithFallback('creator_full_delete_user', [
                { p_user_id: userId, p_reason: reason || null },
                { user_id: userId, reason: reason || null },
            ]);
            if (error) {
                return {
                    success: false,
                    message:
                        error.message ||
                        'Не удалось удалить пользователя. Нужна функция creator_full_delete_user в database.sql',
                };
            }
            return {
                success: true,
                message: 'Аккаунт и связанные данные удалены',
                details: data || null,
            };
        } catch (e) {
            return { success: false, message: e.message || 'Ошибка полного удаления аккаунта' };
        }
    }

    async saveMinkoNetlifyBuildHook(hookUrl) {
        if (!supabaseClient) return { success: false, message: 'Нет Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const url = String(hookUrl || '').trim();
        const { error } = await supabaseClient.from('minko_ai_creator_secrets').upsert(
            {
                id: 1,
                netlify_build_hook_url: url || null,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
        );
        if (error) return { success: false, message: error.message };
        return { success: true, message: 'Build hook сохранён' };
    }

    async triggerMinkoNetlifyDeploy() {
        if (!supabaseClient) return { success: false, message: 'Нет Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const { data, error } = await supabaseClient
            .from('minko_ai_creator_secrets')
            .select('netlify_build_hook_url')
            .eq('id', 1)
            .maybeSingle();
        if (error) return { success: false, message: error.message };
        const hook = data && data.netlify_build_hook_url;
        if (!hook || !String(hook).trim()) {
            return {
                success: false,
                message:
                    'Укажите URL Build hook (Netlify → Site → Build & deploy → Build hooks → Add build hook).'
            };
        }
        try {
            await fetch(String(hook).trim(), { method: 'POST', mode: 'no-cors' });
            return {
                success: true,
                message: 'Запрос на деплой отправлен. Проверьте вкладку Deploys на Netlify через минуту.'
            };
        } catch (e) {
            return { success: false, message: e.message || 'Не удалось вызвать hook' };
        }
    }

    async appendMinkoAiServerLog(level, message, details) {
        if (!supabaseClient) return { success: false, message: 'Нет Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const { error } = await supabaseClient.from('minko_ai_server_logs').insert({
            level: String(level || 'info').slice(0, 32),
            message: String(message || '').slice(0, 4000),
            details: details && typeof details === 'object' ? details : null
        });
        if (error) return { success: false, message: error.message };
        return { success: true };
    }

    async clearMinkoAiServerLogs() {
        if (!supabaseClient) return { success: false, message: 'Нет Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        const { error } = await supabaseClient
            .from('minko_ai_server_logs')
            .delete()
            .gte('created_at', '2000-01-01T00:00:00Z');
        if (error) return { success: false, message: error.message };
        return { success: true, message: 'Логи очищены' };
    }

    /** Метка выката на главной (только кнопка в панели). */
    async getDeployStatusMark() {
        if (!supabaseClient) return { at: null, error: 'Нет Supabase' };
        const gate = await this._assertCallerIsSiteCreator();
        if (!gate.ok) return { at: null, error: gate.message };
        try {
            const { data, error } = await supabaseClient
                .from('site_maintenance_config')
                .select('deploy_status_marked_at')
                .eq('id', 1)
                .maybeSingle();
            if (error) return { at: null, error: error.message };
            return { at: data?.deploy_status_marked_at || null, error: null };
        } catch (e) {
            return { at: null, error: e.message || 'Ошибка' };
        }
    }

    async touchDeployStatusMark() {
        if (!supabaseClient) return { success: false, message: 'Нет Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { success: false, message: a.message };
        try {
            const nowIso = new Date().toISOString();
            const { error } = await supabaseClient
                .from('site_maintenance_config')
                .update({ deploy_status_marked_at: nowIso })
                .eq('id', 1);
            if (error) {
                if ((error.message || '').includes('deploy_status') || error.code === '42703') {
                    return {
                        success: false,
                        message:
                            'Колонка deploy_status_marked_at не найдена. Выполните sql/reminko_deploy_whisper_minko_logs.sql в Supabase.'
                    };
                }
                return { success: false, message: error.message };
            }
            return { success: true, at: nowIso };
        } catch (e) {
            return { success: false, message: e.message || 'Ошибка' };
        }
    }

    /** Пользователи, у которых есть логи Minko AI (для панели). */
    async listMinkoAiChatUsers(limitRows = 600) {
        if (!supabaseClient) return { users: [], error: 'Нет Supabase' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { users: [], error: a.message };
        try {
            const { data, error } = await supabaseClient
                .from('minko_ai_chat_logs')
                .select('user_id, created_at')
                .order('created_at', { ascending: false })
                .limit(limitRows);
            if (error) {
                if ((error.message || '').includes('does not exist') || error.code === '42P01') {
                    return {
                        users: [],
                        error:
                            'Таблица minko_ai_chat_logs отсутствует. Выполните sql/reminko_deploy_whisper_minko_logs.sql.'
                    };
                }
                return { users: [], error: error.message };
            }
            const seen = new Map();
            for (const row of data || []) {
                if (!row.user_id || seen.has(row.user_id)) continue;
                seen.set(row.user_id, row.created_at);
            }
            const ids = [...seen.keys()];
            let names = new Map();
            if (ids.length) {
                const { data: profs } = await supabaseClient
                    .from('profiles')
                    .select('id, username')
                    .in('id', ids);
                names = new Map((profs || []).map((p) => [p.id, p.username]));
            }
            const users = ids.map((id) => ({
                user_id: id,
                last_at: seen.get(id),
                username: names.get(id) || id.slice(0, 8)
            }));
            return { users, error: null };
        } catch (e) {
            return { users: [], error: e.message || 'Ошибка' };
        }
    }

    async getMinkoAiChatLogsForUser(userId, limit = 400) {
        if (!supabaseClient || !userId) return { rows: [], error: 'Нет данных' };
        const a = await this._assertCallerIsSiteCreator();
        if (!a.ok) return { rows: [], error: a.message };
        try {
            const { data, error } = await supabaseClient
                .from('minko_ai_chat_logs')
                .select('role, content, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: true })
                .limit(limit);
            if (error) return { rows: [], error: error.message };
            return { rows: data || [], error: null };
        } catch (e) {
            return { rows: [], error: e.message || 'Ошибка' };
        }
    }
}

// Глобальный экземпляр
window.creatorAdminPanel = new CreatorAdminPanel();

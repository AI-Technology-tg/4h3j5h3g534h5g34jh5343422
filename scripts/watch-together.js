// VIP услуга - Просмотр вместе с синхронизацией и чатом
// Логика VIP: 
// - 1 VIP может пригласить 1 без VIP (2 человека)
// - 2 VIP могут пригласить 1 без VIP (3 человека)
// - Максимум 4 человека, все должны иметь VIP

/** 30 мин без идёт чата, голоса (см. wt_bump) и is_playing — комната закрывается (только на клиенте хоста) */
const WT_ROOM_INACTIVITY_MS = 30 * 60 * 1000;
const WT_INACTIVITY_CHECK_MS = 45 * 1000;

class WatchTogetherService {
    constructor() {
        this.currentSession = null;
        this.syncInterval = null;
        this.heartbeatInterval = null;
        this.chatPollInterval = null;
        this.isHost = false;
        this.participants = [];
        this.chatMessages = [];
        this.realtimeChannel = null;
        this.lastChatMessageId = null;
        /** @type {string | null} курсор опроса по времени (UUID id не упорядочен по времени) */
        this.lastChatCreatedAt = null;
        this._heartbeatUserId = null;
        this._raiseHoldInFlight = false;
        /** @type {ReturnType<typeof setInterval> | null} */
        this._inactivityInterval = null;
        this._inactivityCloseInProgress = false;
        /** true если last_room_activity_at / RPC в БД ещё не применили */
        this._roomActivityFallback = false;
    }

    async _fetchPublicProfilesMap(userIds) {
        const ids = [...new Set((userIds || []).filter(Boolean))];
        const map = {};
        if (!ids.length || !supabaseClient) return map;

        let rows = [];
        if (typeof window.reminkoFetchProfilesIn === 'function') {
            rows = await window.reminkoFetchProfilesIn(supabaseClient, ids);
        } else {
            for (const source of ['profile_directory', 'profiles']) {
                const result = await supabaseClient
                    .from(source)
                    .select('id, username, avatar')
                    .in('id', ids);
                if (!result.error) {
                    rows = result.data || [];
                    break;
                }
            }
        }
        for (const row of rows || []) map[row.id] = row;
        return map;
    }

    // Проверить VIP подписку
    async checkVIPSubscription(userId) {
        if (!userId || !supabaseClient) return false;

        try {
            if (typeof userIdIsSiteCreator === 'function' && (await userIdIsSiteCreator(userId))) {
                return true;
            }

            const { data, error } = await supabaseClient
                .from('vip_subscriptions')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true)
                .maybeSingle();

            if (error || !data) return false;

            // Проверяем срок действия
            if (data.expires_at) {
                const expiresAt = new Date(data.expires_at);
                if (expiresAt < new Date()) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Ошибка проверки VIP:', error);
            return false;
        }
    }

    // Подсчитать сколько VIP участников в сессии
    async countVIPParticipants(sessionId) {
        if (!sessionId || !supabaseClient) return 0;

        try {
            const { data, error } = await supabaseClient
                .from('watch_together_participants')
                .select('user_id, has_vip')
                .eq('session_id', sessionId);

            if (error || !data) return 0;

            return data.filter(p => p.has_vip).length;
        } catch (error) {
            return 0;
        }
    }

    // Получить количество участников
    async getParticipantCount(sessionId) {
        if (!sessionId || !supabaseClient) return 0;

        try {
            const { count, error } = await supabaseClient
                .from('watch_together_participants')
                .select('*', { count: 'exact', head: true })
                .eq('session_id', sessionId);

            return error ? 0 : count;
        } catch (error) {
            return 0;
        }
    }

    // Проверить, может ли пользователь присоединиться
    async canJoinSession(userId, sessionId) {
        const hasVIP = await this.checkVIPSubscription(userId);
        const participantCount = await this.getParticipantCount(sessionId);
        const vipCount = await this.countVIPParticipants(sessionId);

        // Максимум 4 участника
        if (participantCount >= 4) {
            return { canJoin: false, reason: 'Сессия заполнена (максимум 4 участника)' };
        }

        // Логика VIP:
        // - 1 VIP = может быть 1 не-VIP (всего 2)
        // - 2 VIP = может быть 1 не-VIP (всего 3)
        // - 3 VIP = может быть 1 не-VIP (всего 4)
        // - 4 участника = все должны быть VIP

        const nonVipCount = participantCount - vipCount;
        const maxNonVip = Math.min(vipCount, 1); // Максимум 1 не-VIP на каждого VIP (но не более 1 общего)

        if (!hasVIP) {
            // Не-VIP пользователь
            if (nonVipCount >= 1) {
                return { canJoin: false, reason: 'В сессии уже есть гость без VIP. Для присоединения нужна VIP подписка.' };
            }
            if (vipCount === 0) {
                return { canJoin: false, reason: 'Для создания/присоединения к сессии нужен хотя бы один VIP участник' };
            }
        }

        return { canJoin: true };
    }

    // Создать сессию просмотра
    async createSession(userId, animeId = null, mangaId = null, type = 'anime') {
        if (!userId || !supabaseClient) return { success: false, message: 'Ошибка создания сессии' };

        // Проверяем VIP подписку для создания
        const hasVIP = await this.checkVIPSubscription(userId);
        if (!hasVIP) {
            return { success: false, message: 'Для создания сессии просмотра нужна VIP подписка "Смотреть вместе"' };
        }

        try {
            const { data: rpcData, error } = await supabaseClient.rpc('wt_create_session', {
                p_type: type,
                p_anime_id: type === 'anime' ? animeId : null,
                p_manga_id: type === 'manga' ? mangaId : null
            });
            const data = Array.isArray(rpcData) ? rpcData[0] : rpcData;

            if (error) {
                console.error('Ошибка создания сессии:', error);
                const message = String(error.message || '');
                if (/vip_required/i.test(message)) {
                    return { success: false, message: 'Для создания комнаты нужна активная VIP-подписка' };
                }
                if (/rate_limited/i.test(message)) {
                    return { success: false, message: 'Слишком много комнат. Попробуйте позже.' };
                }
                return { success: false, message: 'Не удалось создать сессию' };
            }
            if (!data?.id) {
                return { success: false, message: 'Сервер не вернул созданную комнату' };
            }

            this.currentSession = data;
            this.isHost = true;

            // Начинаем синхронизацию
            this.startSync(userId);
            this.startChatPolling();

            return { success: true, session: data, code: data.session_code };
        } catch (error) {
            console.error('Ошибка создания сессии:', error);
            return { success: false, message: 'Ошибка создания сессии' };
        }
    }

    // Присоединиться к сессии по ID (для приглашений)
    async joinSessionById(userId, sessionId) {
        if (!userId || !sessionId || !supabaseClient) return { success: false, message: 'Ошибка данных' };

        try {
            const { data: rpcData, error } = await supabaseClient.rpc('wt_join_session', {
                p_session_id: sessionId,
                p_session_code: null
            });
            const session = Array.isArray(rpcData) ? rpcData[0] : rpcData;
            if (error || !session?.id) {
                const message = String(error?.message || '');
                if (/room_full/i.test(message)) {
                    return { success: false, message: 'Сессия заполнена (максимум 4 участника)' };
                }
                if (/vip_required|guest_slot/i.test(message)) {
                    return { success: false, message: 'Гостевое место занято — нужна VIP-подписка' };
                }
                return { success: false, message: 'Комната не найдена, закрыта или приглашение недействительно' };
            }

            this.currentSession = session;
            this.isHost = session.host_id === userId;

            this.startSync(userId);
            this.startChatPolling();

            return { success: true, session: session };
        } catch (error) {
            console.error('Ошибка присоединения:', error);
            return { success: false, message: 'Ошибка присоединения' };
        }
    }

    // Присоединиться к сессии по коду (оставлено для совместимости)
    async joinSession(userId, sessionCode) {
        if (!userId || !sessionCode || !supabaseClient) return { success: false };

        try {
            const { data: rpcData, error } = await supabaseClient.rpc('wt_join_session', {
                p_session_id: null,
                p_session_code: String(sessionCode).toUpperCase()
            });
            const session = Array.isArray(rpcData) ? rpcData[0] : rpcData;
            if (error || !session?.id) {
                const message = String(error?.message || '');
                if (/room_full/i.test(message)) {
                    return { success: false, message: 'Сессия заполнена (максимум 4 участника)' };
                }
                if (/vip_required|guest_slot/i.test(message)) {
                    return { success: false, message: 'Гостевое место занято — нужна VIP-подписка' };
                }
                if (/rate_limited/i.test(message)) {
                    return { success: false, message: 'Слишком много попыток. Попробуйте через несколько минут.' };
                }
                return { success: false, message: 'Сессия не найдена или уже завершена' };
            }

            this.currentSession = session;
            this.isHost = session.host_id === userId;

            // Начинаем синхронизацию
            this.startSync(userId);
            this.startChatPolling();

            return { success: true, session };
        } catch (error) {
            console.error('Ошибка присоединения:', error);
            return { success: false, message: 'Ошибка присоединения' };
        }
    }

    // Покинуть сессию
    async leaveSession(userId) {
        if (!userId || !this.currentSession || !supabaseClient) return;

        try {
            await supabaseClient
                .from('watch_together_participants')
                .delete()
                .eq('session_id', this.currentSession.id)
                .eq('user_id', userId);

            // Если хост покинул - закрываем сессию
            if (this.isHost) {
                await this.closeSession(userId);
            } else {
                this.stopSync();
                this.stopChatPolling();
                this.currentSession = null;
            }
        } catch (error) {
            console.error('Ошибка выхода из сессии:', error);
        }
    }

    /**
     * Выгнать участника (только создатель сессии, не себя).
     */
    async removeParticipant(hostUserId, participantUserId) {
        if (!hostUserId || !participantUserId || !this.currentSession || !supabaseClient) {
            return { success: false, message: 'Ошибка данных' };
        }
        if (this.currentSession.host_id !== hostUserId) {
            return { success: false, message: 'Только создатель может выгнать' };
        }
        if (participantUserId === hostUserId) {
            return { success: false, message: 'Используйте «Выйти»' };
        }
        try {
            const { error } = await supabaseClient
                .from('watch_together_participants')
                .delete()
                .eq('session_id', this.currentSession.id)
                .eq('user_id', participantUserId);
            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Ошибка выгона:', e);
            return { success: false, message: 'Не удалось выгнать участника' };
        }
    }

    // Закрыть сессию (для хоста)
    /**
     * @param {string} userId
     * @param {{ reason?: 'host_close' | 'room_idle' }} [options] — room_idle: авто по неактивности
     */
    async closeSession(userId, options = {}) {
        if (!userId || !this.currentSession || !supabaseClient) return;

        try {
            this.unsubscribeSessionRowRealtime();
            await supabaseClient
                .from('watch_together_sessions')
                .update({ is_active: false })
                .eq('id', this.currentSession.id)
                .eq('host_id', userId);

            this.stopSync();
            this.stopChatPolling();
            this.currentSession = null;
            this.isHost = false;
            const reason = options?.reason == null ? 'host_close' : options.reason;
            window.dispatchEvent(
                new CustomEvent('watchTogetherClosed', { detail: { reason } })
            );
        } catch (error) {
            console.error('Ошибка закрытия сессии:', error);
        }
    }

    /**
     * Метка активности: RPC для любого участника, иначе update (часто только хост в RLS).
     * Сообщения чата учитываются отдельно (max created_at) в проверке неактивности.
     */
    async bumpSessionRoomActivity() {
        if (!this.currentSession?.id || !supabaseClient) return;

        const sessionId = this.currentSession.id;
        if (!this._roomActivityFallback) {
            const { error: rpcErr } = await supabaseClient.rpc('wt_bump_room_activity', {
                p_session_id: sessionId
            });
            if (!rpcErr) {
                const ts = new Date().toISOString();
                this.currentSession = { ...this.currentSession, last_room_activity_at: ts, updated_at: ts };
                return;
            }
            if (
                (rpcErr.message && rpcErr.message.includes('function')) ||
                rpcErr.code === 'PGRST202' ||
                rpcErr.code === '42883'
            ) {
                this._roomActivityFallback = true;
            }
        }

        const ts = new Date().toISOString();
        const { error } = await supabaseClient
            .from('watch_together_sessions')
            .update({ last_room_activity_at: ts, updated_at: ts })
            .eq('id', sessionId);

        if (error) {
            if ((error.message || '').toLowerCase().includes('last_room_activity')) {
                this._roomActivityFallback = true;
            }
        } else {
            this.currentSession = { ...this.currentSession, last_room_activity_at: ts, updated_at: ts };
        }
    }

    async _getLastChatActivityTimeMs() {
        if (!this.currentSession || !supabaseClient) return 0;
        const { data, error } = await supabaseClient
            .from('watch_together_chat')
            .select('created_at')
            .eq('session_id', this.currentSession.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error || !data?.created_at) return 0;
        return new Date(data.created_at).getTime();
    }

    _startInactivityMonitor() {
        this._stopInactivityMonitor();
        if (!this.isHost) return;
        void this.maybeAutoCloseInactiveRoom();
        this._inactivityInterval = setInterval(() => {
            void this.maybeAutoCloseInactiveRoom();
        }, WT_INACTIVITY_CHECK_MS);
    }

    _stopInactivityMonitor() {
        if (this._inactivityInterval) {
            clearInterval(this._inactivityInterval);
            this._inactivityInterval = null;
        }
    }

    /**
     * Только у хоста: плеер идёт (is_playing) — не закрываем; иначе с последней активности
     * (создание, чат, last_room_activity_at, bumps с миком) более 30 мин — закрыть.
     */
    _isMissingWtRpc(error) {
        if (!error) return false;
        const msg = String(error.message || '').toLowerCase();
        return (
            error.code === 'PGRST202' ||
            error.code === '42883' ||
            msg.includes('function') ||
            msg.includes('wt_close_idle')
        );
    }

    async _closeIdleSessionViaRpc(sessionId) {
        if (!sessionId || !supabaseClient) return false;
        try {
            const { data, error } = await supabaseClient.rpc('wt_close_idle_session_if_needed', {
                p_session_id: sessionId
            });
            if (error) {
                if (!this._isMissingWtRpc(error)) {
                    console.warn('[WatchTogether] wt_close_idle_session_if_needed', error);
                }
                return false;
            }
            return data === true;
        } catch (e) {
            console.warn('[WatchTogether] wt_close_idle_session_if_needed', e);
            return false;
        }
    }

    /** Закрывает все простаившие комнаты в БД (без входа хоста в комнату). */
    async sweepIdleRooms() {
        if (!supabaseClient) return 0;
        try {
            const { data, error } = await supabaseClient.rpc('wt_close_idle_sessions');
            if (error) {
                if (!this._isMissingWtRpc(error)) {
                    console.warn('[WatchTogether] sweepIdleRooms', error);
                }
                return 0;
            }
            return typeof data === 'number' ? data : parseInt(data, 10) || 0;
        } catch (e) {
            console.warn('[WatchTogether] sweepIdleRooms', e);
            return 0;
        }
    }

    async _clientFallbackCloseIdleRoom(sessionId) {
        if (!this.isHost || !this.currentSession || this.currentSession.id !== sessionId || !supabaseClient) {
            return false;
        }
        const { data: row, error } = await supabaseClient
            .from('watch_together_sessions')
            .select('id, host_id, is_active, is_playing, created_at, last_room_activity_at')
            .eq('id', sessionId)
            .maybeSingle();

        if (error || !row || !row.is_active || row.is_playing) return false;

        const tCreated = new Date(row.created_at).getTime();
        const tBumped = row.last_room_activity_at ? new Date(row.last_room_activity_at).getTime() : 0;
        const tChat = await this._getLastChatActivityTimeMs();
        const last = Math.max(tCreated, tBumped, tChat);

        if (Date.now() - last < WT_ROOM_INACTIVITY_MS) return false;

        await this.closeSession(row.host_id, { reason: 'room_idle' });
        return true;
    }

    async maybeAutoCloseInactiveRoom() {
        if (!this.isHost || !this.currentSession || this._inactivityCloseInProgress || !supabaseClient) {
            return;
        }

        const sessionId = this.currentSession.id;
        this._inactivityCloseInProgress = true;
        try {
            let closed = await this._closeIdleSessionViaRpc(sessionId);
            if (!closed) {
                closed = await this._clientFallbackCloseIdleRoom(sessionId);
            }
            if (closed && this.currentSession?.id === sessionId) {
                this.stopSync();
                this.stopChatPolling();
                this.currentSession = null;
                this.isHost = false;
                window.dispatchEvent(
                    new CustomEvent('watchTogetherClosed', { detail: { reason: 'room_idle' } })
                );
            }
        } catch (e) {
            console.warn('[WatchTogether] maybeAutoCloseInactiveRoom', e);
        } finally {
            this._inactivityCloseInProgress = false;
        }
    }

    // Управление плеером (только для хоста)
    async setPlaying(isPlaying) {
        if (!this.currentSession || !this.isHost || !supabaseClient) return;

        try {
            await supabaseClient
                .from('watch_together_sessions')
                .update({ 
                    is_playing: isPlaying,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentSession.id);
        } catch (error) {
            console.error('Ошибка обновления состояния:', error);
        }
    }

    // Обновить время воспроизведения
    async setCurrentTime(time) {
        if (!this.currentSession || !this.isHost || !supabaseClient) return;

        try {
            await supabaseClient
                .from('watch_together_sessions')
                .update({ 
                    playback_time: time,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentSession.id);
        } catch (error) {
            console.error('Ошибка обновления времени:', error);
        }
    }

    // Сменить эпизод
    async setEpisode(episode, videoSource = null) {
        if (!this.currentSession || !this.isHost || !supabaseClient) return;

        try {
            const updateData = { 
                current_episode: episode,
                playback_time: 0,
                is_playing: false,
                updated_at: new Date().toISOString()
            };
            
            if (videoSource) {
                updateData.video_source = videoSource;
            }

            await supabaseClient
                .from('watch_together_sessions')
                .update(updateData)
                .eq('id', this.currentSession.id);
            void this.bumpSessionRoomActivity();
        } catch (error) {
            console.error('Ошибка смены эпизода:', error);
        }
    }

    // Сменить источник видео
    async setVideoSource(source) {
        if (!this.currentSession || !this.isHost || !supabaseClient) return;

        try {
            await supabaseClient
                .from('watch_together_sessions')
                .update({ 
                    video_source: source,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentSession.id);
            void this.bumpSessionRoomActivity();
        } catch (error) {
            console.error('Ошибка смены источника:', error);
        }
    }

    async setParticipantPlayerReady(userId, ready) {
        if (!this.currentSession || !userId || !supabaseClient) {
            return { success: false, message: 'Нет комнаты' };
        }

        try {
            const patch = {
                player_ready: !!ready,
                player_ready_at: ready ? new Date().toISOString() : null
            };
            const { error } = await supabaseClient
                .from('watch_together_participants')
                .update(patch)
                .eq('session_id', this.currentSession.id)
                .eq('user_id', userId);

            if (error) return { success: false, message: error.message };

            this.participants = (this.participants || []).map((p) =>
                String(p.user_id) === String(userId) ? { ...p, ...patch } : p
            );
            window.dispatchEvent(new CustomEvent('watchTogetherParticipantsUpdate', {
                detail: this.participants
            }));
            return { success: true };
        } catch (e) {
            return { success: false, message: String(e) };
        }
    }

    _sessionChangeFlags(prevSession, data) {
        return {
            isPlaying: prevSession.is_playing !== data.is_playing,
            currentTime: Math.abs((prevSession.playback_time || 0) - (data.playback_time || 0)) > 0.5,
            episode: prevSession.current_episode !== data.current_episode,
            source: prevSession.video_source !== data.video_source,
            syncHold: !!prevSession.sync_hold !== !!data.sync_hold,
            syncGeneration: (prevSession.sync_generation || 0) !== (data.sync_generation || 0),
            screenBroadcast: !!prevSession.host_screen_broadcast !== !!data.host_screen_broadcast
        };
    }

    _emitSessionRowWatchUpdate(prevSession, data) {
        window.dispatchEvent(
            new CustomEvent('watchTogetherUpdate', {
                detail: {
                    session: data,
                    changed: this._sessionChangeFlags(prevSession, data)
                }
            })
        );
    }

    /**
     * Мгновенное обновление эфира/паузы для гостей (дополнение к опросу раз в секунду).
     * На проекте в Supabase SQL нужно: ALTER PUBLICATION supabase_realtime ADD TABLE watch_together_sessions;
     */
    subscribeSessionRowRealtime() {
        this.unsubscribeSessionRowRealtime();
        const sid = this.currentSession?.id;
        if (!sid || !supabaseClient) return;

        try {
            const ch = supabaseClient
                .channel(`wt-session-${sid}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'watch_together_sessions',
                        filter: `id=eq.${sid}`
                    },
                    (payload) => {
                        const row = payload.new;
                        if (!row || !this.currentSession || row.id !== this.currentSession.id) return;
                        if (!row.is_active) {
                            this.stopSync();
                            this.stopChatPolling();
                            window.dispatchEvent(new CustomEvent('watchTogetherClosed'));
                            return;
                        }
                        const prevSession = this.currentSession;
                        this.currentSession = row;
                        this._emitSessionRowWatchUpdate(prevSession, row);
                    }
                )
                .subscribe((status, err) => {
                    if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
                        console.warn('[WatchTogether] realtime сессии:', status, err?.message || '');
                    }
                });
            this.realtimeChannel = ch;
        } catch (e) {
            console.warn('[WatchTogether] подписка realtime:', e);
        }
    }

    unsubscribeSessionRowRealtime() {
        if (this.realtimeChannel && supabaseClient) {
            supabaseClient.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
    }

    // Начать синхронизацию
    startSync(userId) {
        if (this.syncInterval) return;

        this._heartbeatUserId = userId || null;
        this.startHeartbeat(userId);
        this.subscribeSessionRowRealtime();

        const STALE_MS = 14000;

        // Синхронизация каждую секунду для плавности
        this.syncInterval = setInterval(async () => {
            if (!this.currentSession || !supabaseClient) return;

            try {
                const { data, error } = await supabaseClient
                    .from('watch_together_sessions')
                    .select('*')
                    .eq('id', this.currentSession.id)
                    .maybeSingle();

                if (!error && data) {
                    const prevSession = this.currentSession;
                    this.currentSession = data;

                    // Проверяем, не закрыта ли сессия
                    if (!data.is_active) {
                        this.stopSync();
                        this.stopChatPolling();
                        window.dispatchEvent(new CustomEvent('watchTogetherClosed'));
                        return;
                    }

                    await this.refreshParticipants();

                    if (
                        this.isHost &&
                        !data.sync_hold &&
                        this.participants &&
                        this.participants.length > 0
                    ) {
                        const now = Date.now();
                        for (const p of this.participants) {
                            const raw = p.last_ping_at;
                            if (!raw) continue;
                            if (now - new Date(raw).getTime() > STALE_MS) {
                                await this.raiseSyncHold('heartbeat');
                                break;
                            }
                        }
                    }

                    this._emitSessionRowWatchUpdate(prevSession, data);
                } else {
                    await this.refreshParticipants();
                }
            } catch (error) {
                console.error('Ошибка синхронизации:', error);
            }
        }, 1000);

        this._startInactivityMonitor();
    }

    startHeartbeat(userId) {
        if (!userId || this.heartbeatInterval) return;

        const ping = async () => {
            if (!this.currentSession || !supabaseClient || !userId) return;
            try {
                await supabaseClient
                    .from('watch_together_participants')
                    .update({ last_ping_at: new Date().toISOString() })
                    .eq('session_id', this.currentSession.id)
                    .eq('user_id', userId);
            } catch (e) {
                console.warn('[WatchTogether] ping', e);
            }
        };

        ping();
        this.heartbeatInterval = setInterval(ping, 4000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this._heartbeatUserId = null;
    }

    /** Глобальная пауза комнаты — любой участник (RPC wt_raise_sync_hold) */
    async raiseSyncHold(reason) {
        if (!this.currentSession || !supabaseClient) return;
        if (this.currentSession.sync_hold || this._raiseHoldInFlight) return;
        this._raiseHoldInFlight = true;
        try {
            const { error } = await supabaseClient.rpc('wt_raise_sync_hold', {
                p_session_id: this.currentSession.id,
                p_reason: String(reason || 'issue').slice(0, 240)
            });
            if (error) console.error('[WT] raiseSyncHold', error);
        } catch (e) {
            console.error('[WT] raiseSyncHold', e);
        } finally {
            this._raiseHoldInFlight = false;
        }
    }

    /** Снять паузу и продолжить — только создатель комнаты */
    async clearSyncHold(episode = null, playbackSec = null) {
        if (!this.currentSession || !supabaseClient || !this.isHost) {
            return { success: false, message: 'Нет прав' };
        }
        try {
            const { error } = await supabaseClient.rpc('wt_clear_sync_hold', {
                p_session_id: this.currentSession.id,
                p_episode: episode == null ? null : episode,
                p_playback_sec: playbackSec == null ? null : playbackSec
            });
            if (error) {
                console.error('[WT] clearSyncHold', error);
                return { success: false, message: error.message };
            }
            void this.bumpSessionRoomActivity();
            return { success: true };
        } catch (e) {
            console.error('[WT] clearSyncHold', e);
            return { success: false, message: String(e) };
        }
    }

    /** Legacy-флаг старого screen-share режима: нужен только для сброса активных старых комнат. */
    async setHostScreenBroadcast(enabled) {
        if (!this.currentSession || !supabaseClient || !this.isHost) {
            return { success: false, message: 'Нет прав' };
        }
        try {
            const { error } = await supabaseClient
                .from('watch_together_sessions')
                .update({
                    host_screen_broadcast: !!enabled,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentSession.id);
            if (error) return { success: false, message: error.message };
            const prev = this.currentSession;
            this.currentSession = {
                ...this.currentSession,
                host_screen_broadcast: !!enabled
            };
            this._emitWatchTogetherUpdate(this.currentSession, this._sessionChangeFlags(prev, this.currentSession));
            if (enabled) void this.bumpSessionRoomActivity();
            return { success: true };
        } catch (e) {
            return { success: false, message: String(e) };
        }
    }

    /** Создатель: зафиксировать серию и секунду для всех (перезагрузка плеера у гостей, без автозапуска) */
    async hostPushPlaybackAnchor(episode, playbackSec) {
        if (!this.currentSession || !supabaseClient || !this.isHost) return { success: false };
        const ep = Math.max(1, parseInt(episode, 10) || 1);
        const sec = Math.max(0, parseFloat(playbackSec) || 0);
        const nextGen = (this.currentSession.sync_generation || 0) + 1;
        try {
            const { error } = await supabaseClient
                .from('watch_together_sessions')
                .update({
                    current_episode: ep,
                    playback_time: sec,
                    sync_generation: nextGen,
                    is_playing: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentSession.id);

            if (error) return { success: false, message: error.message };
            const prev = this.currentSession;
            this.currentSession = {
                ...this.currentSession,
                current_episode: ep,
                playback_time: sec,
                sync_generation: nextGen,
                is_playing: false
            };
            this._emitWatchTogetherUpdate(this.currentSession, {
                isPlaying: prev.is_playing !== this.currentSession.is_playing,
                syncGeneration: true,
                episode: prev.current_episode !== this.currentSession.current_episode,
                currentTime: Math.abs((prev.playback_time || 0) - (this.currentSession.playback_time || 0)) > 0.5
            });
            void this.bumpSessionRoomActivity();
            return { success: true };
        } catch (e) {
            return { success: false, message: String(e) };
        }
    }

    _emitWatchTogetherUpdate(session, changed) {
        window.dispatchEvent(
            new CustomEvent('watchTogetherUpdate', {
                detail: { session, changed }
            })
        );
    }

    /** Трансляция: все гости с этой серии/секунды и с автозапуском (как нажали Play у ведущего) */
    async hostBroadcastPlay(episode, playbackSec) {
        if (!this.currentSession || !supabaseClient || !this.isHost) return { success: false };
        const ep = Math.max(1, parseInt(episode, 10) || 1);
        const sec = Math.max(0, parseFloat(playbackSec) || 0);
        const nextGen = (this.currentSession.sync_generation || 0) + 1;
        try {
            const { error } = await supabaseClient
                .from('watch_together_sessions')
                .update({
                    current_episode: ep,
                    playback_time: sec,
                    sync_generation: nextGen,
                    is_playing: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentSession.id);

            if (error) return { success: false, message: error.message };
            const prev = this.currentSession;
            this.currentSession = {
                ...this.currentSession,
                current_episode: ep,
                playback_time: sec,
                sync_generation: nextGen,
                is_playing: true
            };
            this._emitWatchTogetherUpdate(this.currentSession, {
                isPlaying: prev.is_playing !== this.currentSession.is_playing,
                syncGeneration: true,
                episode: prev.current_episode !== this.currentSession.current_episode,
                currentTime: Math.abs((prev.playback_time || 0) - (this.currentSession.playback_time || 0)) > 0.5
            });
            return { success: true };
        } catch (e) {
            return { success: false, message: String(e) };
        }
    }

    /** Пауза трансляции у всех гостей (плеер перезагрузится на том же кадре без воспроизведения) */
    async hostBroadcastPause() {
        if (!this.currentSession || !supabaseClient || !this.isHost) return { success: false };
        const nextGen = (this.currentSession.sync_generation || 0) + 1;
        try {
            const { error } = await supabaseClient
                .from('watch_together_sessions')
                .update({
                    sync_generation: nextGen,
                    is_playing: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentSession.id);

            if (error) return { success: false, message: error.message };
            const prev = this.currentSession;
            this.currentSession = {
                ...this.currentSession,
                sync_generation: nextGen,
                is_playing: false
            };
            this._emitWatchTogetherUpdate(this.currentSession, {
                isPlaying: prev.is_playing !== this.currentSession.is_playing,
                syncGeneration: true,
                episode: false,
                currentTime: false
            });
            return { success: true };
        } catch (e) {
            return { success: false, message: String(e) };
        }
    }

    // Остановить синхронизацию
    stopSync() {
        this._stopInactivityMonitor();
        this.unsubscribeSessionRowRealtime();
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.stopHeartbeat();
    }

    // Обновить список участников
    async refreshParticipants() {
        if (!this.currentSession || !supabaseClient) return;

        try {
            const { data, error } = await supabaseClient
                .from('watch_together_participants')
                .select('*')
                .eq('session_id', this.currentSession.id);

            if (!error && data) {
                const profileMap = await this._fetchPublicProfilesMap(data.map((p) => p.user_id));
                for (const p of data) {
                    p.profile =
                        profileMap[p.user_id] ||
                        { id: p.user_id, username: 'Аноним', avatar: null };
                }
                this.participants = data;
                window.dispatchEvent(new CustomEvent('watchTogetherParticipantsUpdate', { 
                    detail: data 
                }));
            }
        } catch (error) {
            console.error('Ошибка обновления участников:', error);
        }
    }

    // === ЧАТ КОМНАТЫ ===

    // Отправить сообщение в чат комнаты
    async sendChatMessage(userId, message) {
        if (!userId || !message || !this.currentSession || !supabaseClient) {
            return { success: false, error: 'Нет сессии или данных' };
        }

        try {
            const { data, error } = await supabaseClient
                .from('watch_together_chat')
                .insert({
                    session_id: this.currentSession.id,
                    user_id: userId,
                    message: message.trim()
                })
                .select()
                .single();

            if (error) {
                console.error('Ошибка отправки сообщения:', error);
                return { success: false, error: error.message || 'Не удалось отправить' };
            }

            let row = data;
            if (row) {
                const profileMap = await this._fetchPublicProfilesMap([userId]);
                row = {
                    ...row,
                    profile: profileMap[userId] || { id: userId, username: 'Вы', avatar: null }
                };
                const seen = this.chatMessages.some((m) => m.id === row.id);
                if (!seen) {
                    this.chatMessages = [...this.chatMessages, row];
                    this.lastChatMessageId = row.id;
                    this.lastChatCreatedAt = row.created_at;
                    window.dispatchEvent(new CustomEvent('watchTogetherNewMessages', { detail: [row] }));
                }
            }

            return { success: true, data: row };
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            return { success: false, error: error && error.message ? error.message : 'Ошибка сети' };
        }
    }

    // Получить сообщения чата
    async getChatMessages(limit = 50) {
        if (!this.currentSession || !supabaseClient) return [];

        try {
            const { data, error } = await supabaseClient
                .from('watch_together_chat')
                .select('*')
                .eq('session_id', this.currentSession.id)
                .order('created_at', { ascending: true })
                .limit(limit);

            if (error) {
                console.error('Ошибка получения сообщений:', error);
                return [];
            }

            const msgs = data || [];
            const profileCache = await this._fetchPublicProfilesMap(msgs.map((m) => m.user_id));
            for (const m of msgs) {
                m.profile =
                    profileCache[m.user_id] ||
                    { id: m.user_id, username: 'Аноним', avatar: null };
            }
            this.chatMessages = msgs;
            if (msgs.length > 0) {
                const last = msgs[msgs.length - 1];
                this.lastChatMessageId = last.id;
                this.lastChatCreatedAt = last.created_at;
            } else {
                this.lastChatMessageId = null;
                this.lastChatCreatedAt = null;
            }
            return this.chatMessages;
        } catch (error) {
            console.error('Ошибка получения сообщений:', error);
            return [];
        }
    }

    // Начать polling чата
    startChatPolling() {
        if (this.chatPollInterval) return;

        // Загружаем начальные сообщения
        this.getChatMessages().then((messages) => {
            window.dispatchEvent(
                new CustomEvent('watchTogetherChatUpdate', {
                    detail: messages
                })
            );
        });

        // Polling каждую секунду
        this.chatPollInterval = setInterval(async () => {
            if (!this.currentSession || !supabaseClient) return;

            try {
                let query = supabaseClient
                    .from('watch_together_chat')
                    .select('*')
                    .eq('session_id', this.currentSession.id)
                    .order('created_at', { ascending: true });

                if (this.lastChatCreatedAt) {
                    query = query.gt('created_at', this.lastChatCreatedAt);
                }

                const { data, error } = await query;

                if (!error && data && data.length > 0) {
                    const existingIds = new Set(this.chatMessages.map((m) => m.id));
                    const fresh = data.filter((m) => !existingIds.has(m.id));
                    if (!fresh.length) return;
                    const missingIds = fresh
                        .filter(
                            (m) =>
                                !this.chatMessages.some(
                                    (c) => c.user_id === m.user_id && c.profile
                                )
                        )
                        .map((m) => m.user_id);
                    const profileMap = await this._fetchPublicProfilesMap(missingIds);

                    for (const m of fresh) {
                        const cached = this.chatMessages.find((c) => c.user_id === m.user_id && c.profile);
                        if (cached) {
                            m.profile = cached.profile;
                        } else {
                            m.profile =
                                profileMap[m.user_id] ||
                                { id: m.user_id, username: 'Аноним', avatar: null };
                        }
                    }
                    this.chatMessages = [...this.chatMessages, ...fresh];
                    const last = fresh[fresh.length - 1];
                    this.lastChatMessageId = last.id;
                    this.lastChatCreatedAt = last.created_at;

                    window.dispatchEvent(
                        new CustomEvent('watchTogetherNewMessages', {
                            detail: fresh
                        })
                    );
                }
            } catch (error) {
                console.error('Ошибка polling чата:', error);
            }
        }, 1000);
    }

    // Остановить polling чата
    stopChatPolling() {
        if (this.chatPollInterval) {
            clearInterval(this.chatPollInterval);
            this.chatPollInterval = null;
        }
        this.chatMessages = [];
        this.lastChatMessageId = null;
        this.lastChatCreatedAt = null;
    }

    // Получить участников сессии
    async getParticipants(sessionId) {
        const sid = sessionId || this.currentSession?.id;
        if (!sid || !supabaseClient) return [];

        try {
            const { data, error } = await supabaseClient
                .from('watch_together_participants')
                .select('*')
                .eq('session_id', sid);

            if (error) {
                console.error('Ошибка получения участников:', error);
                return [];
            }

            const result = data || [];
            const profileMap = await this._fetchPublicProfilesMap(result.map((p) => p.user_id));
            for (const p of result) {
                p.profile =
                    profileMap[p.user_id] ||
                    { id: p.user_id, username: 'Аноним', avatar: null };
            }
            return result;
        } catch (error) {
            console.error('Ошибка получения участников:', error);
            return [];
        }
    }

    // Получить активную сессию пользователя
    async getActiveSession(userId) {
        if (!userId || !supabaseClient) return null;

        try {
            await this.sweepIdleRooms();

            // Проверяем как хост
            let { data: hostSession } = await supabaseClient
                .from('watch_together_sessions')
                .select('*')
                .eq('host_id', userId)
                .eq('is_active', true)
                .maybeSingle();

            if (hostSession) {
                const closed = await this._closeIdleSessionViaRpc(hostSession.id);
                if (closed) {
                    this.currentSession = null;
                    this.isHost = false;
                    return null;
                }
                const { data: refreshed } = await supabaseClient
                    .from('watch_together_sessions')
                    .select('*')
                    .eq('id', hostSession.id)
                    .eq('is_active', true)
                    .maybeSingle();
                if (!refreshed) {
                    this.currentSession = null;
                    this.isHost = false;
                    return null;
                }
                this.currentSession = refreshed;
                this.isHost = true;
                return refreshed;
            }

            // Проверяем как участник
            const { data: participation } = await supabaseClient
                .from('watch_together_participants')
                .select('session_id')
                .eq('user_id', userId);

            if (participation && participation.length > 0) {
                for (const p of participation) {
                    await this._closeIdleSessionViaRpc(p.session_id);
                    const { data: sess } = await supabaseClient
                        .from('watch_together_sessions')
                        .select('*')
                        .eq('id', p.session_id)
                        .eq('is_active', true)
                        .maybeSingle();
                    if (sess) {
                        this.currentSession = sess;
                        this.isHost = sess.host_id === userId;
                        return sess;
                    }
                }
            }

            this.currentSession = null;
            this.isHost = false;
            return null;
        } catch (error) {
            console.error('Ошибка получения активной сессии:', error);
            return null;
        }
    }

    // Сгенерировать код сессии
    generateSessionCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // Пригласить друга (отправить уведомление со ссылкой на комнату)
    async inviteFriend(userId, friendId) {
        if (!userId || !friendId || !this.currentSession || !supabaseClient) return { success: false };

        try {
            const sessionId = this.currentSession.id;
            const profileMap = await this._fetchPublicProfilesMap([userId]);
            const profile = profileMap[userId];
            const username = profile?.username || 'Кто-то';

            await supabaseClient.from('notifications').insert({
                user_id: friendId,
                type: 'watch_together_invite',
                title: '🎬 Приглашение смотреть вместе',
                message: `${username} приглашает вас смотреть аниме вместе!`,
                link: `watch-together.html?session=${sessionId}`,
                data: { session_id: sessionId, inviter_id: userId },
                read: false
            });

            return { success: true };
        } catch (error) {
            console.error('Ошибка приглашения:', error);
            return { success: false };
        }
    }

    /**
     * Активные комнаты, где хост входит в список id (например друзья).
     */
    async getActiveSessionsForHosts(hostIds) {
        if (!supabaseClient || !hostIds || hostIds.length === 0) return [];
        try {
            await this.sweepIdleRooms();
            const { data: sessions, error } = await supabaseClient
                .from('watch_together_sessions')
                .select('id, host_id, anime_id, manga_id, type, session_code, created_at')
                .in('host_id', hostIds)
                .eq('is_active', true);
            if (error || !sessions?.length) return [];
            const out = [];
            for (const s of sessions) {
                const participantCount = await this.getParticipantCount(s.id);
                out.push({ ...s, participantCount });
            }
            return out;
        } catch (e) {
            console.error('getActiveSessionsForHosts', e);
            return [];
        }
    }

    /**
     * Заявка на вход: уведомление создателю комнаты (он решает в комнате / по ссылке).
     */
    async sendJoinRequestNotification(requesterId, sessionId, hostId) {
        if (!supabaseClient || !requesterId || !sessionId || !hostId) {
            return { success: false, message: 'Нет данных' };
        }
        if (String(requesterId) === String(hostId)) {
            return { success: false, message: 'Это ваша комната' };
        }
        try {
            const profileMap = await this._fetchPublicProfilesMap([requesterId]);
            const profile = profileMap[requesterId];
            const name = profile?.username || 'Кто-то';
            const { error } = await supabaseClient.from('notifications').insert({
                user_id: hostId,
                type: 'watch_join_request',
                title: 'Заявка на вход в комнату',
                message: `${name} просит разрешение присоединиться к просмотру`,
                link: `watch-together.html?session=${sessionId}`,
                data: { session_id: sessionId, requester_id: requesterId },
                read: false
            });
            if (error) {
                console.error('sendJoinRequestNotification', error);
                return { success: false, message: 'Не удалось отправить заявку' };
            }
            return { success: true };
        } catch (e) {
            console.error('sendJoinRequestNotification', e);
            return { success: false, message: 'Ошибка отправки' };
        }
    }
}

// Создаем глобальный экземпляр
window.watchTogetherService = new WatchTogetherService();

/** Фоновое закрытие простаивших комнат (не ждём повторного входа хоста). */
(function wtScheduleGlobalIdleRoomSweep() {
    const SWEEP_MS = 90 * 1000;
    let lastSweep = 0;

    async function runSweep() {
        if (!window.supabaseClient || !window.watchTogetherService?.sweepIdleRooms) return;
        const now = Date.now();
        if (now - lastSweep < SWEEP_MS) return;
        lastSweep = now;
        try {
            await window.watchTogetherService.sweepIdleRooms();
        } catch (_) {
            /* ignore */
        }
    }

    function boot() {
        setTimeout(runSweep, 2500);
        setInterval(runSweep, SWEEP_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

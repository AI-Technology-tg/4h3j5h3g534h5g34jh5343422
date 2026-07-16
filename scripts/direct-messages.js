const DirectMessagesService = {
    _realtimeChannel: null,
    _currentChatUserId: null,
    _profileCache: {},
    _cachedUserId: null,
    _cachedAccessToken: null,

    async getCurrentUserId(forceRefresh) {
        if (!forceRefresh && this._cachedUserId) return this._cachedUserId;
        if (!supabaseClient) return null;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            this._cachedUserId = session?.user?.id || null;
            this._cachedAccessToken = session?.access_token || null;
            return this._cachedUserId;
        } catch (e) {
            return null;
        }
    },

    _normalizeProfileRow(userId, data) {
        if (!data) return null;
        let p = { ...data, id: data.id || userId };
        let isCreator =
            p.is_site_creator === true ||
            p.isSiteCreator === true ||
            (typeof window.reminkoUserIdIsSiteCreatorSync === 'function' &&
                window.reminkoUserIdIsSiteCreatorSync(userId)) ||
            (typeof window.reminkoIsSiteCreatorProfile === 'function' &&
                window.reminkoIsSiteCreatorProfile(p)) ||
            (window.__reminkoSiteCreatorUserId &&
                String(window.__reminkoSiteCreatorUserId).toLowerCase() ===
                    String(userId || '').toLowerCase());
        if (isCreator) {
            p = {
                ...p,
                is_site_creator: true,
                isSiteCreator: true,
                avatar: 'Fons/Creator ava.png'
            };
        }
        if (typeof window.reminkoProfileForAvatar === 'function') {
            p = window.reminkoProfileForAvatar(p, userId);
        }
        return p;
    },

    async getProfile(userId, forceRefresh) {
        if (forceRefresh) delete this._profileCache[userId];
        if (this._profileCache[userId]) return this._profileCache[userId];
        try {
            let data = null;
            if (typeof reminkoFetchProfilesIn === 'function') {
                const list = await reminkoFetchProfilesIn(supabaseClient, [userId]);
                data = list[0] || null;
            } else {
                let row = await supabaseClient
                    .from('profiles')
                    .select('id, username, avatar, last_online, current_activity, is_site_creator')
                    .eq('id', userId)
                    .maybeSingle();
                if (row.error) {
                    row = await supabaseClient
                        .from('profiles')
                        .select('id, username, avatar, last_online')
                        .eq('id', userId)
                        .maybeSingle();
                }
                data = row.data;
            }
            if (data) {
                const p = this._normalizeProfileRow(userId, data);
                this._profileCache[userId] = p;
                return p;
            }
            return data;
        } catch (e) {
            return null;
        }
    },

    async getProfilesMap(userIds) {
        const ids = [...new Set((userIds || []).filter(Boolean))];
        const map = {};
        if (!ids.length) return map;

        const missing = [];
        for (const id of ids) {
            if (this._profileCache[id]) map[id] = this._profileCache[id];
            else missing.push(id);
        }
        if (!missing.length) return map;

        try {
            if (typeof reminkoFetchProfilesIn === 'function') {
                const rows = await reminkoFetchProfilesIn(supabaseClient, missing);
                for (const row of rows || []) {
                    const p = this._normalizeProfileRow(row.id, row);
                    if (p) {
                        this._profileCache[row.id] = p;
                        map[row.id] = p;
                    }
                }
            }
        } catch (_) {
            /* ignore */
        }

        for (const id of missing) {
            if (!map[id]) {
                const p = await this.getProfile(id);
                if (p) map[id] = p;
            }
        }
        return map;
    },

    async getConversations() {
        const userId = await this.getCurrentUserId();
        if (!userId) return [];

        try {
            const selectCols = 'id, sender_id, receiver_id, message, read, created_at';
            const perSideLimit = 180;
            const [sentRes, recvRes, unreadRes] = await Promise.all([
                supabaseClient
                    .from('direct_messages')
                    .select(selectCols)
                    .eq('sender_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(perSideLimit),
                supabaseClient
                    .from('direct_messages')
                    .select(selectCols)
                    .eq('receiver_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(perSideLimit),
                supabaseClient
                    .from('direct_messages')
                    .select('sender_id')
                    .eq('receiver_id', userId)
                    .eq('read', false)
                    .limit(500)
            ]);

            if (sentRes.error && recvRes.error) {
                console.error('DM getConversations error:', sentRes.error || recvRes.error);
                return [];
            }

            const messages = [...(sentRes.data || []), ...(recvRes.data || [])];
            messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            const unreadBySender = {};
            for (const row of unreadRes.data || []) {
                if (!row.sender_id) continue;
                unreadBySender[row.sender_id] = (unreadBySender[row.sender_id] || 0) + 1;
            }

            const convMap = {};
            for (const msg of messages) {
                const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
                if (!otherId) continue;
                if (!convMap[otherId]) {
                    convMap[otherId] = {
                        userId: otherId,
                        lastMessage: msg,
                        unreadCount: unreadBySender[otherId] || 0
                    };
                }
            }

            const conversations = Object.values(convMap);

            let creatorId = null;
            if (typeof reminkoEnsureSiteCreatorUserIdCached === 'function') {
                creatorId = await reminkoEnsureSiteCreatorUserIdCached();
            } else if (window.__reminkoSiteCreatorUserId) {
                creatorId = window.__reminkoSiteCreatorUserId;
            } else if (window.APP_CONFIG?.siteCreatorUserId) {
                creatorId = window.APP_CONFIG.siteCreatorUserId;
            }

            const profileIds = conversations.map((c) => c.userId);
            if (creatorId && !profileIds.some((id) => String(id) === String(creatorId))) {
                profileIds.push(creatorId);
            }
            const profileMap = await this.getProfilesMap(profileIds);
            for (const conv of conversations) {
                conv.profile = profileMap[conv.userId] || null;
            }

            if (creatorId) {
                const cid = String(creatorId);
                const hasCreator = conversations.some((c) => String(c.userId) === cid);
                if (!hasCreator) {
                    const creatorProfile =
                        profileMap[cid] || (await this.getProfile(cid)) || null;
                    conversations.push({
                        userId: cid,
                        lastMessage: {
                            id: 'stub-creator',
                            message: '',
                            created_at: new Date(0).toISOString(),
                            sender_id: userId,
                            receiver_id: cid
                        },
                        unreadCount: 0,
                        profile: creatorProfile,
                        isCreatorSlot: true
                    });
                }
            }

            conversations.sort(
                (a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)
            );
            return conversations;
        } catch (e) {
            console.error('DM getConversations exception:', e);
            return [];
        }
    },

    async getMessages(otherUserId, limit = 100) {
        const userId = await this.getCurrentUserId();
        if (!userId) return [];

        try {
            const { data, error } = await supabaseClient
                .from('direct_messages')
                .select('*')
                .or(
                    `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`
                )
                .order('created_at', { ascending: true })
                .limit(limit);

            if (error) { console.error('DM getMessages error:', error); return []; }
            return data || [];
        } catch (e) { return []; }
    },

    async sendMessage(receiverId, messageText) {
        const userId = await this.getCurrentUserId(true);
        const text = String(messageText || '').trim();
        if (!userId) {
            return { ok: false, error: 'Нет сессии. Войдите в аккаунт или обновите страницу.' };
        }
        if (!text) {
            return { ok: false, error: 'Пустое сообщение.' };
        }
        if (text.length > 120000) {
            return { ok: false, error: 'Сообщение слишком длинное. Уменьшите текст или вложение.' };
        }
        const rid = String(receiverId || '').trim();
        if (!rid) {
            return { ok: false, error: 'Получатель не указан.' };
        }

        try {
            const { data, error } = await supabaseClient
                .from('direct_messages')
                .insert({
                    sender_id: userId,
                    receiver_id: rid,
                    message: text
                })
                .select()
                .single();

            if (error) {
                console.error('DM send error:', error);
                const msg =
                    error.message ||
                    (error.code === '42501'
                        ? 'Нет прав на отправку (проверьте вход в аккаунт).'
                        : 'Не удалось отправить сообщение.');
                return { ok: false, error: msg, code: error.code || null };
            }
            return { ok: true, data };
        } catch (e) {
            console.error('DM send exception:', e);
            return { ok: false, error: e.message || 'Ошибка отправки.' };
        }
    },

    async markAsRead(otherUserId) {
        const userId = await this.getCurrentUserId();
        if (!userId) return;

        try {
            await supabaseClient
                .from('direct_messages')
                .update({ read: true })
                .eq('sender_id', otherUserId)
                .eq('receiver_id', userId)
                .eq('read', false);
        } catch (e) {}
    },

    async getTotalUnread() {
        const userId = await this.getCurrentUserId();
        if (!userId) return 0;

        try {
            const { count, error } = await supabaseClient
                .from('direct_messages')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', userId)
                .eq('read', false);

            if (error) return 0;
            return typeof count === 'number' ? count : 0;
        } catch (e) { return 0; }
    },

    subscribeToChat(otherUserId, onNewMessage) {
        this.unsubscribeFromChat();
        this._currentChatUserId = otherUserId;

        this._realtimeChannel = supabaseClient
            .channel(`dm-${Date.now()}-${otherUserId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'direct_messages'
            }, (payload) => {
                const msg = payload.new;
                const isRelevant =
                    (msg.sender_id === otherUserId || msg.receiver_id === otherUserId);
                if (isRelevant && onNewMessage) {
                    onNewMessage(msg);
                }
            })
            .subscribe();
    },

    unsubscribeFromChat() {
        if (this._realtimeChannel) {
            supabaseClient.removeChannel(this._realtimeChannel);
            this._realtimeChannel = null;
        }
        this._currentChatUserId = null;
    },

    async updateActivity(activity) {
        const userId = await this.getCurrentUserId();
        if (!userId) return;

        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ current_activity: activity, last_online: new Date().toISOString() })
                .eq('id', userId);
            if (error) console.warn('[DM] updateActivity error:', error.message);
        } catch (e) { console.warn('[DM] updateActivity exception:', e); }
    },

    async clearActivity() {
        await this.updateActivity(null);
    },

    resetSessionCache() {
        this._cachedUserId = null;
        this._cachedAccessToken = null;
    }
};

window.DirectMessagesService = DirectMessagesService;

window.addEventListener('beforeunload', () => {
    if (DirectMessagesService._cachedUserId && typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${DirectMessagesService._cachedUserId}`;
            fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${DirectMessagesService._cachedAccessToken || SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ current_activity: null, last_online: new Date().toISOString() }),
                keepalive: true
            });
        } catch (e) {}
    }
});

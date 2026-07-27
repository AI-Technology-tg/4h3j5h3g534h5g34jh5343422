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
                for (const source of ['profile_directory', 'profiles']) {
                    const row = await supabaseClient
                        .from(source)
                        .select(
                            'id, username, avatar, last_online, current_activity, is_site_creator'
                        )
                        .eq('id', userId)
                        .maybeSingle();
                    if (!row.error) {
                        data = row.data;
                        break;
                    }
                }
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

            const currentIsCreator =
                creatorId &&
                userId &&
                (String(creatorId).toLowerCase() === String(userId).toLowerCase() ||
                    (typeof window.reminkoUserIdIsSiteCreatorSync === 'function' &&
                        window.reminkoUserIdIsSiteCreatorSync(userId)));

            if (currentIsCreator) {
                return conversations.filter(
                    (c) => String(c.userId).toLowerCase() !== String(creatorId).toLowerCase()
                );
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

    subscribeToChat(otherUserId, onNewMessage, onMessageChange) {
        this.unsubscribeFromChat();
        this._currentChatUserId = otherUserId;
        const peer = String(otherUserId || '');
        const relevant = (msg) => {
            if (!msg) return false;
            // DELETE без REPLICA IDENTITY FULL часто даёт только id — пропускаем по id в UI
            if (!msg.sender_id && !msg.receiver_id && msg.id) return true;
            return String(msg.sender_id) === peer || String(msg.receiver_id) === peer;
        };

        this._realtimeChannel = supabaseClient
            .channel(`dm-${Date.now()}-${otherUserId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'direct_messages'
            }, (payload) => {
                const msg = payload.new;
                if (relevant(msg) && onNewMessage) onNewMessage(msg);
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'direct_messages'
            }, (payload) => {
                const msg = payload.new;
                if (relevant(msg) && onMessageChange) onMessageChange({ type: 'update', msg });
            })
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'direct_messages'
            }, (payload) => {
                const msg = payload.old;
                if (relevant(msg) && onMessageChange) onMessageChange({ type: 'delete', msg });
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
    },

    /**
     * Удаление чата только у себя (локальное скрытие списка).
     * Сообщения у собеседника не трогаем.
     */
    async deleteThread(otherUserId) {
        const rid = String(otherUserId || '').trim();
        if (!rid) return { ok: false, error: 'Собеседник не указан.' };
        return { ok: true, mode: 'hide-self', peerId: rid };
    },

    async editMessage(messageId, newText) {
        const text = String(newText || '').trim();
        if (!messageId) return { ok: false, error: 'Сообщение не указано.' };
        if (!text) return { ok: false, error: 'Пустой текст.' };
        try {
            const { data, error } = await supabaseClient.rpc('reminko_edit_dm_message', {
                p_message_id: messageId,
                p_text: text
            });
            if (error) return { ok: false, error: error.message || 'Не удалось изменить.' };
            return { ok: true, data };
        } catch (e) {
            return { ok: false, error: e.message || 'Ошибка правки.' };
        }
    },

    async unsendMessage(messageId) {
        if (!messageId) return { ok: false, error: 'Сообщение не указано.' };
        try {
            const { data, error } = await supabaseClient.rpc('reminko_unsend_dm_message', {
                p_message_id: messageId
            });
            if (error) return { ok: false, error: error.message || 'Не удалось отменить.' };
            return { ok: true, removed: !!data };
        } catch (e) {
            return { ok: false, error: e.message || 'Ошибка отмены.' };
        }
    },

    async editGroupMessage(messageId, newText) {
        const text = String(newText || '').trim();
        if (!messageId) return { ok: false, error: 'Сообщение не указано.' };
        if (!text) return { ok: false, error: 'Пустой текст.' };
        try {
            const { data, error } = await supabaseClient.rpc('reminko_edit_dm_group_message', {
                p_message_id: messageId,
                p_text: text
            });
            if (error) return { ok: false, error: error.message || 'Не удалось изменить.' };
            return { ok: true, data };
        } catch (e) {
            return { ok: false, error: e.message || 'Ошибка правки.' };
        }
    },

    async unsendGroupMessage(messageId) {
        if (!messageId) return { ok: false, error: 'Сообщение не указано.' };
        try {
            const { data, error } = await supabaseClient.rpc('reminko_unsend_dm_group_message', {
                p_message_id: messageId
            });
            if (error) return { ok: false, error: error.message || 'Не удалось отменить.' };
            return { ok: true, removed: !!data };
        } catch (e) {
            return { ok: false, error: e.message || 'Ошибка отмены.' };
        }
    },

    async getGroupConversations() {
        const userId = await this.getCurrentUserId();
        if (!userId) return [];
        try {
            const { data: memberships, error: mErr } = await supabaseClient
                .from('dm_group_members')
                .select('group_id, role')
                .eq('user_id', userId);
            if (mErr || !memberships?.length) return [];

            const groupIds = memberships.map((m) => m.group_id);
            const roleMap = Object.fromEntries(memberships.map((m) => [m.group_id, m.role]));

            const { data: groups, error: gErr } = await supabaseClient
                .from('dm_groups')
                .select('id, name, created_by, created_at, updated_at')
                .in('id', groupIds);
            if (gErr || !groups?.length) return [];

            const { data: allMembers } = await supabaseClient
                .from('dm_group_members')
                .select('group_id, user_id, role')
                .in('group_id', groupIds);

            const memberIds = [...new Set((allMembers || []).map((m) => m.user_id))];
            const profileMap = await this.getProfilesMap(memberIds);

            const out = [];
            for (const g of groups) {
                const members = (allMembers || [])
                    .filter((m) => m.group_id === g.id)
                    .map((m) => ({
                        userId: m.user_id,
                        role: m.role,
                        profile: profileMap[m.user_id] || null
                    }));

                let lastMessage = {
                    id: 'stub-group',
                    message: '',
                    created_at: g.created_at || g.updated_at || new Date(0).toISOString(),
                    sender_id: g.created_by,
                    receiver_id: null
                };
                const { data: lastRows } = await supabaseClient
                    .from('dm_group_messages')
                    .select('id, group_id, sender_id, message, created_at')
                    .eq('group_id', g.id)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (lastRows && lastRows[0]) {
                    lastMessage = lastRows[0];
                }

                out.push({
                    kind: 'group',
                    groupId: g.id,
                    userId: 'g:' + g.id,
                    name: g.name,
                    createdBy: g.created_by,
                    myRole: roleMap[g.id] || 'member',
                    members,
                    lastMessage,
                    unreadCount: 0,
                    profile: {
                        username: g.name,
                        avatar: null,
                        isGroup: true
                    },
                    isGroup: true
                });
            }
            return out;
        } catch (e) {
            console.warn('[DM] getGroupConversations:', e);
            return [];
        }
    },

    async createGroup(name, memberIds) {
        const userId = await this.getCurrentUserId(true);
        if (!userId) return { ok: false, error: 'Войдите в аккаунт.' };
        const ids = [...new Set((memberIds || []).map(String).filter(Boolean))];
        if (!String(name || '').trim()) return { ok: false, error: 'Укажите название группы.' };
        if (!ids.length) return { ok: false, error: 'Выберите хотя бы одного участника.' };
        if (ids.length > 3) return { ok: false, error: 'В группе максимум 4 человека (вы + 3).' };
        try {
            const { data, error } = await supabaseClient.rpc('reminko_create_dm_group', {
                p_name: String(name).trim().slice(0, 60),
                p_member_ids: ids
            });
            if (error) {
                const msg = String(error.message || '');
                if (/group_member_limit/i.test(msg)) {
                    return { ok: false, error: 'В группе максимум 4 человека.' };
                }
                if (/need_members/i.test(msg)) {
                    return { ok: false, error: 'Выберите участников группы.' };
                }
                return { ok: false, error: error.message || 'Не удалось создать группу.' };
            }
            return { ok: true, groupId: data };
        } catch (e) {
            return { ok: false, error: e.message || 'Ошибка создания группы.' };
        }
    },

    async getGroupMessages(groupId, limit = 100) {
        if (!groupId) return [];
        try {
            const { data, error } = await supabaseClient
                .from('dm_group_messages')
                .select('id, group_id, sender_id, message, created_at')
                .eq('group_id', groupId)
                .order('created_at', { ascending: true })
                .limit(limit);
            if (error) {
                console.error('DM getGroupMessages:', error);
                return [];
            }
            return data || [];
        } catch (_) {
            return [];
        }
    },

    async sendGroupMessage(groupId, messageText) {
        const userId = await this.getCurrentUserId(true);
        const text = String(messageText || '').trim();
        if (!userId) return { ok: false, error: 'Нет сессии.' };
        if (!text) return { ok: false, error: 'Пустое сообщение.' };
        if (!groupId) return { ok: false, error: 'Группа не указана.' };
        try {
            const { data, error } = await supabaseClient
                .from('dm_group_messages')
                .insert({ group_id: groupId, sender_id: userId, message: text })
                .select()
                .single();
            if (error) {
                return { ok: false, error: error.message || 'Не удалось отправить.' };
            }
            await supabaseClient
                .from('dm_groups')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', groupId);
            return { ok: true, data };
        } catch (e) {
            return { ok: false, error: e.message || 'Ошибка отправки.' };
        }
    },

    async leaveGroup(groupId) {
        const userId = await this.getCurrentUserId(true);
        if (!userId || !groupId) return { ok: false, error: 'Нет данных.' };
        try {
            const { error } = await supabaseClient
                .from('dm_group_members')
                .delete()
                .eq('group_id', groupId)
                .eq('user_id', userId);
            if (error) return { ok: false, error: error.message };
            const { count } = await supabaseClient
                .from('dm_group_members')
                .select('*', { count: 'exact', head: true })
                .eq('group_id', groupId);
            if (!count) {
                await supabaseClient.from('dm_groups').delete().eq('id', groupId);
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message || 'Не удалось выйти.' };
        }
    },

    async deleteGroup(groupId) {
        const userId = await this.getCurrentUserId(true);
        if (!userId || !groupId) return { ok: false, error: 'Нет данных.' };
        try {
            const { error } = await supabaseClient.from('dm_groups').delete().eq('id', groupId);
            if (error) return { ok: false, error: error.message || 'Только владелец может удалить группу.' };
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message || 'Ошибка удаления группы.' };
        }
    },

    async addGroupMember(groupId, memberId) {
        try {
            const { error } = await supabaseClient.rpc('reminko_add_dm_group_member', {
                p_group_id: groupId,
                p_user_id: memberId
            });
            if (error) {
                if (/group_member_limit/i.test(error.message || '')) {
                    return { ok: false, error: 'В группе уже 4 человека.' };
                }
                return { ok: false, error: error.message || 'Не удалось добавить.' };
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message || 'Ошибка.' };
        }
    },

    subscribeToGroupChat(groupId, onNewMessage, onMessageChange) {
        this.unsubscribeFromChat();
        this._currentChatUserId = 'g:' + groupId;
        this._realtimeChannel = supabaseClient
            .channel(`dm-group-${Date.now()}-${groupId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'dm_group_messages',
                    filter: `group_id=eq.${groupId}`
                },
                (payload) => {
                    if (payload.new && onNewMessage) onNewMessage(payload.new);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'dm_group_messages',
                    filter: `group_id=eq.${groupId}`
                },
                (payload) => {
                    if (payload.new && onMessageChange) {
                        onMessageChange({ type: 'update', msg: payload.new });
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'dm_group_messages',
                    filter: `group_id=eq.${groupId}`
                },
                (payload) => {
                    if (payload.old && onMessageChange) {
                        onMessageChange({ type: 'delete', msg: payload.old });
                    }
                }
            )
            .subscribe();
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

// Система друзей с онлайн-статусом и приглашениями
class FriendsService {
    constructor() {
        this.friends = [];
        this.pendingRequests = [];
        this.onlineStatusInterval = null;
        this.ONLINE_THRESHOLD_MINUTES = 5; // Считать онлайн, если был активен в последние 5 минут
    }

    // Получить список друзей с онлайн-статусом
    async getFriends(userId) {
        if (!userId || !supabaseClient) return [];

        try {
            // Получаем записи где пользователь - инициатор дружбы
            const { data: asUser, error: error1 } = await supabaseClient
                .from('friends')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'accepted');

            // Получаем записи где пользователь - получатель заявки
            const { data: asFriend, error: error2 } = await supabaseClient
                .from('friends')
                .select('*')
                .eq('friend_id', userId)
                .eq('status', 'accepted');

            if (error1 || error2) {
                console.error('Ошибка получения друзей:', error1 || error2);
                return [];
            }

            // Объединяем и получаем ID друзей
            const allFriends = [];
            
            // Из записей где мы user_id, друг - это friend_id
            for (const f of (asUser || [])) {
                allFriends.push({ ...f, friendUserId: f.friend_id });
            }
            
            // Из записей где мы friend_id, друг - это user_id
            for (const f of (asFriend || [])) {
                allFriends.push({ ...f, friendUserId: f.user_id });
            }

            // Получаем профили всех друзей
            const friendIds = allFriends.map(f => f.friendUserId).filter(Boolean);
            if (friendIds.length === 0) {
                this.friends = [];
                return [];
            }

            const profiles =
                typeof reminkoFetchProfilesIn === 'function'
                    ? await reminkoFetchProfilesIn(supabaseClient, friendIds)
                    : [];

            if (typeof reminkoEnsureSiteCreatorUserIdCached === 'function') {
                await reminkoEnsureSiteCreatorUserIdCached();
            }
            if (typeof reminkoPrefetchTeamRoles === 'function') {
                await reminkoPrefetchTeamRoles(friendIds);
            }

            // Объединяем данные
            const profilesMap = new Map((profiles || []).map(p => [p.id, p]));
            this.friends = allFriends.map(f => ({
                ...f,
                friend: profilesMap.get(f.friendUserId) || null
            })).filter(f => f.friend);

            return this.friends;
        } catch (error) {
            console.error('Ошибка получения друзей:', error);
            return [];
        }
    }

    // Получить входящие заявки
    async getIncomingRequests(userId) {
        if (!userId || !supabaseClient) return [];

        try {
            // Получаем входящие заявки
            const { data: requests, error } = await supabaseClient
                .from('friends')
                .select('*')
                .eq('friend_id', userId)
                .eq('status', 'pending');

            if (error) {
                console.error('Ошибка получения заявок:', error);
                return [];
            }

            if (!requests || requests.length === 0) {
                this.pendingRequests = [];
                return [];
            }

            // Получаем профили отправителей
            const userIds = requests.map(r => r.user_id).filter(Boolean);
            const profiles =
                typeof reminkoFetchProfilesIn === 'function'
                    ? await reminkoFetchProfilesIn(supabaseClient, userIds)
                    : [];

            // Объединяем данные
            const profilesMap = new Map((profiles || []).map(p => [p.id, p]));
            this.pendingRequests = requests.map(r => ({
                ...r,
                user: profilesMap.get(r.user_id) || null
            })).filter(r => r.user);

            return this.pendingRequests;
        } catch (error) {
            console.error('Ошибка получения заявок:', error);
            return [];
        }
    }

    // Отправить заявку в друзья с уведомлением
    async sendFriendRequest(userId, friendId) {
        if (!userId || !friendId || !supabaseClient) return { success: false, message: 'Ошибка отправки заявки' };

        if (userId === friendId) {
            return { success: false, message: 'Нельзя отправить заявку самому себе' };
        }

        try {
            // Проверяем, не существует ли уже заявка
            const { data: existingRows } = await supabaseClient
                .from('friends')
                .select('*')
                .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)
                .limit(2);
            const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

            if (existing) {
                if (existing.status === 'accepted') {
                    return { success: false, message: 'Вы уже друзья' };
                }
                if (existing.status === 'pending') {
                    return { success: false, message: 'Заявка уже отправлена' };
                }
            }

            const { error } = await supabaseClient
                .from('friends')
                .insert({
                    user_id: userId,
                    friend_id: friendId,
                    status: 'pending'
                });

            if (error) {
                console.error('Ошибка отправки заявки:', error);
                return { success: false, message: 'Не удалось отправить заявку' };
            }

            const senderProfiles =
                typeof window.reminkoFetchProfilesIn === 'function'
                    ? await window.reminkoFetchProfilesIn(supabaseClient, [userId])
                    : [];
            const senderProfile = senderProfiles[0] || null;
            const senderName = senderProfile?.username || 'Кто-то';
            await this.sendNotificationWithLink(
                friendId, 'friend_request',
                'Новая заявка в друзья',
                `${senderName} хочет добавить вас в друзья!`,
                'friends.html?tab=requests'
            );

            return { success: true, message: 'Заявка отправлена' };
        } catch (error) {
            console.error('Ошибка отправки заявки:', error);
            return { success: false, message: 'Ошибка отправки заявки' };
        }
    }

    // Принять заявку
    async acceptFriendRequest(userId, requestId) {
        if (!userId || !requestId || !supabaseClient) return { success: false };

        try {
            // Находим заявку
            const { data: request } = await supabaseClient
                .from('friends')
                .select('*')
                .eq('id', requestId)
                .eq('friend_id', userId)
                .eq('status', 'pending')
                .single();

            if (!request) {
                return { success: false, message: 'Заявка не найдена' };
            }

            // Обновляем статус
            const { error } = await supabaseClient
                .from('friends')
                .update({
                    status: 'accepted',
                    accepted_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (error) {
                console.error('Ошибка принятия заявки:', error);
                return { success: false, message: 'Не удалось принять заявку' };
            }

            await this.sendNotificationWithLink(
                request.user_id, 'friend_accepted',
                'Заявка принята',
                'Ваша заявка в друзья была принята!',
                'friends.html'
            );

            return { success: true, message: 'Заявка принята' };
        } catch (error) {
            console.error('Ошибка принятия заявки:', error);
            return { success: false, message: 'Ошибка принятия заявки' };
        }
    }

    // Отклонить заявку
    async declineFriendRequest(userId, requestId) {
        if (!userId || !requestId || !supabaseClient) return { success: false };

        try {
            const { error } = await supabaseClient
                .from('friends')
                .delete()
                .eq('id', requestId)
                .eq('friend_id', userId)
                .eq('status', 'pending');

            if (error) {
                console.error('Ошибка отклонения заявки:', error);
                return { success: false, message: 'Не удалось отклонить заявку' };
            }

            return { success: true, message: 'Заявка отклонена' };
        } catch (error) {
            console.error('Ошибка отклонения заявки:', error);
            return { success: false, message: 'Ошибка отклонения заявки' };
        }
    }

    // Удалить из друзей
    async removeFriend(userId, friendId) {
        if (!userId || !friendId || !supabaseClient) return { success: false };

        try {
            // Удаляем обе связи (user_id -> friend_id и friend_id -> user_id)
            await supabaseClient
                .from('friends')
                .delete()
                .eq('user_id', userId)
                .eq('friend_id', friendId);
            
            await supabaseClient
                .from('friends')
                .delete()
                .eq('user_id', friendId)
                .eq('friend_id', userId);

            return { success: true, message: 'Друг удален' };
        } catch (error) {
            console.error('Ошибка удаления друга:', error);
            return { success: false, message: 'Ошибка удаления друга' };
        }
    }

    // Поиск пользователей
    async searchUsers(query, excludeUserId = null) {
        if (!supabaseClient || !query || query.length < 2) return [];

        try {
            let lastError = null;
            for (const source of ['profile_directory', 'profiles']) {
                let queryBuilder = supabaseClient
                    .from(source)
                    .select('id, username, avatar, last_online, is_site_creator')
                    .ilike('username', `%${query}%`)
                    .limit(20);

                if (excludeUserId) {
                    queryBuilder = queryBuilder.neq('id', excludeUserId);
                }

                const { data, error } = await queryBuilder;
                if (!error) return data || [];
                lastError = error;
            }
            console.error('Ошибка поиска пользователей:', lastError);
            return [];
        } catch (error) {
            console.error('Ошибка поиска пользователей:', error);
            return [];
        }
    }

    // Проверить онлайн-статус пользователя
    isUserOnline(lastOnline) {
        if (!lastOnline) return false;
        const lastOnlineDate = new Date(lastOnline);
        const now = new Date();
        const diffMinutes = (now - lastOnlineDate) / (1000 * 60);
        return diffMinutes < this.ONLINE_THRESHOLD_MINUTES;
    }

    // Обновить свой онлайн-статус
    async updateOnlineStatus(userId) {
        if (!userId || !supabaseClient) return;

        try {
            await supabaseClient
                .from('profiles')
                .update({ last_online: new Date().toISOString() })
                .eq('id', userId);
        } catch (error) {
            console.error('Ошибка обновления онлайн-статуса:', error);
        }
    }

    // Начать отслеживание онлайн-статуса
    startOnlineStatusTracking(userId) {
        if (this.onlineStatusInterval) {
            clearInterval(this.onlineStatusInterval);
        }

        // Обновляем сразу
        this.updateOnlineStatus(userId);

        // Обновляем каждые 2 минуты
        this.onlineStatusInterval = setInterval(() => {
            this.updateOnlineStatus(userId);
        }, 2 * 60 * 1000);
    }

    // Остановить отслеживание онлайн-статуса
    stopOnlineStatusTracking() {
        if (this.onlineStatusInterval) {
            clearInterval(this.onlineStatusInterval);
            this.onlineStatusInterval = null;
        }
    }

    // Отправить уведомление
    async sendNotification(userId, type, title, message) {
        if (!userId || !supabaseClient) return;
        try {
            await supabaseClient.from('notifications').insert({
                user_id: userId, type, title, message, read: false
            });
        } catch (error) {
            console.error('Ошибка отправки уведомления:', error);
        }
    }

    // Отправить уведомление с ссылкой
    async sendNotificationWithLink(userId, type, title, message, link, data = null) {
        if (!userId || !supabaseClient) return;
        try {
            const row = { user_id: userId, type, title, message, read: false };
            if (link) row.link = link;
            if (data) row.data = data;
            await supabaseClient.from('notifications').insert(row);
        } catch (error) {
            console.error('Ошибка отправки уведомления:', error);
        }
    }

    // Пригласить друга смотреть вместе (через ссылку на сессию)
    async inviteToWatch(userId, friendId, sessionId, animeTitle = null) {
        if (!userId || !friendId || !sessionId || !supabaseClient) {
            return { success: false, message: 'Ошибка приглашения' };
        }

        try {
            const senderProfiles =
                typeof window.reminkoFetchProfilesIn === 'function'
                    ? await window.reminkoFetchProfilesIn(supabaseClient, [userId])
                    : [];
            const senderProfile = senderProfiles[0] || null;
            const senderName = senderProfile?.username || 'Друг';
            const title = '🎬 Приглашение смотреть вместе';
            const message = animeTitle 
                ? `${senderName} приглашает вас смотреть "${animeTitle}" вместе!`
                : `${senderName} приглашает вас смотреть аниме вместе!`;

            await this.sendNotificationWithLink(
                friendId, 'watch_together_invite', title, message,
                `watch-together.html?session=${sessionId}`,
                { session_id: sessionId, inviter_id: userId }
            );
            
            return { success: true, message: 'Приглашение отправлено' };
        } catch (error) {
            console.error('Ошибка приглашения:', error);
            return { success: false, message: 'Ошибка отправки приглашения' };
        }
    }

    // Получить онлайн друзей
    async getOnlineFriends(userId) {
        const friends = await this.getFriends(userId);
        return friends.filter(f => f.friend && this.isUserOnline(f.friend.last_online));
    }

    // Получить количество непрочитанных заявок
    async getUnreadRequestsCount(userId) {
        if (!userId || !supabaseClient) return 0;

        try {
            // GET + count (не HEAD): надёжнее в DevTools и при некоторых прокси
            const { count, error } = await supabaseClient
                .from('friends')
                .select('*', { count: 'exact' })
                .eq('friend_id', userId)
                .eq('status', 'pending')
                .limit(1);

            return error ? 0 : count || 0;
        } catch (error) {
            return 0;
        }
    }

    // Проверить, являются ли пользователи друзьями
    async areFriends(userId1, userId2) {
        if (!userId1 || !userId2 || !supabaseClient) return false;

        try {
            const { data: rows } = await supabaseClient
                .from('friends')
                .select('*')
                .or(`and(user_id.eq.${userId1},friend_id.eq.${userId2}),and(user_id.eq.${userId2},friend_id.eq.${userId1})`)
                .eq('status', 'accepted')
                .limit(1);

            return !!(rows && rows.length > 0);
        } catch (error) {
            return false;
        }
    }

    // Заблокировать пользователя
    async blockUser(userId, blockedUserId) {
        if (!userId || !blockedUserId || !supabaseClient) return { success: false };

        try {
            // Удаляем дружбу, если есть
            await this.removeFriend(userId, blockedUserId);

            // Создаем запись о блокировке
            const { error } = await supabaseClient
                .from('friends')
                .insert({
                    user_id: userId,
                    friend_id: blockedUserId,
                    status: 'blocked'
                });

            if (error && error.code !== '23505') { // Игнорируем, если уже существует
                console.error('Ошибка блокировки:', error);
                return { success: false, message: 'Ошибка блокировки' };
            }

            return { success: true, message: 'Пользователь заблокирован' };
        } catch (error) {
            console.error('Ошибка блокировки:', error);
            return { success: false, message: 'Ошибка блокировки' };
        }
    }

    // Разблокировать пользователя
    async unblockUser(userId, blockedUserId) {
        if (!userId || !blockedUserId || !supabaseClient) return { success: false };

        try {
            const { error } = await supabaseClient
                .from('friends')
                .delete()
                .eq('user_id', userId)
                .eq('friend_id', blockedUserId)
                .eq('status', 'blocked');

            if (error) {
                console.error('Ошибка разблокировки:', error);
                return { success: false, message: 'Ошибка разблокировки' };
            }

            return { success: true, message: 'Пользователь разблокирован' };
        } catch (error) {
            console.error('Ошибка разблокировки:', error);
            return { success: false, message: 'Ошибка разблокировки' };
        }
    }

    // Проверить, заблокирован ли пользователь
    async isBlocked(userId, targetUserId) {
        if (!userId || !targetUserId || !supabaseClient) return false;

        try {
            const { data } = await supabaseClient
                .from('friends')
                .select('*')
                .eq('user_id', userId)
                .eq('friend_id', targetUserId)
                .eq('status', 'blocked')
                .maybeSingle();

            return !!data;
        } catch (error) {
            return false;
        }
    }
}

// Создаем глобальный экземпляр
window.friendsService = new FriendsService();

// Автоматически начинаем отслеживание онлайн-статуса при авторизации
document.addEventListener('DOMContentLoaded', () => {
    // Проверяем авторизацию и начинаем отслеживание
    const checkAuthAndStartTracking = () => {
        if (typeof isAuthenticatedSync === 'function' && isAuthenticatedSync()) {
            const user = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
            if (user && user.id) {
                window.friendsService.startOnlineStatusTracking(user.id);
            }
        }
    };

    // Polling / last_online — Idle (не на Critical/FirstPaint)
    const scheduleTrackingBoot = () => {
        if (typeof window.ReminkoBoot?.on === 'function') {
            window.ReminkoBoot.on('Idle', checkAuthAndStartTracking);
        } else {
            setTimeout(checkAuthAndStartTracking, 1000);
        }
    };
    scheduleTrackingBoot();

    // Также слушаем событие входа (без задержки — UX входа важен)
    window.addEventListener('userLoggedIn', (e) => {
        if (e.detail && e.detail.id) {
            window.friendsService.startOnlineStatusTracking(e.detail.id);
        }
    });

    // Останавливаем при выходе
    window.addEventListener('userLoggedOut', () => {
        window.friendsService.stopOnlineStatusTracking();
    });
});


// Админ панель
class AdminPanel {
    constructor() {
        this.isAdmin = false;
        this.currentUser = null;
    }

    // Проверить является ли пользователь админом
    async checkAdminStatus(userId) {
        if (!userId || !supabaseClient) return false;

        try {
            const { data, error } = await supabaseClient
                .from('admins')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                // Ошибка infinite recursion в политиках - это проблема конфигурации базы, не критично
                if (error.code === '42P17' || error.message?.includes('infinite recursion')) {
                    // Используем fallback - проверка по email (для создателя)
                    try {
                        if (typeof getCurrentUser === 'function') {
                            const user = await getCurrentUser();
                            if (user && user.email && user.email.toLowerCase() === 'creator@reminko.com') {
                                this.isAdmin = true;
                                return true;
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибки fallback
                    }
                }
                // Не логируем ошибку, чтобы не засорять консоль
                this.isAdmin = false;
                return false;
            }

            if (!data) {
                this.isAdmin = false;
                return false;
            }

            this.isAdmin = true;
            return true;
        } catch (error) {
            // Не логируем ошибку, чтобы не засорять консоль
            this.isAdmin = false;
            return false;
        }
    }

    // Инициализация админ панели
    async init() {
        if (!supabaseClient) return;

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) {
                this.hideAdminPanel();
                return;
            }

            // Проверяем админа только по email (без запроса к базе, чтобы избежать ошибки 500)
            if (typeof getCurrentUser === 'function') {
                const currentUser = await getCurrentUser();
                if (currentUser && currentUser.email && currentUser.email.toLowerCase() === 'creator@reminko.com') {
                    this.isAdmin = true;
                    this.showAdminPanel();
                    return; // Выходим, не делаем запрос к базе
                }
            }
            
            // Если не создатель - скрываем панель без запроса к базе
            this.hideAdminPanel();
        } catch (error) {
            // Не логируем ошибки инициализации
            this.hideAdminPanel();
        }
    }

    // Показать админ панель
    showAdminPanel() {
        // Проверяем, есть ли уже ссылка в HTML (на странице admin.html)
        const existingAdminLink = document.querySelector('a[href="admin.html"].nav-link');
        if (existingAdminLink) {
            // Если ссылка уже есть в HTML, просто показываем её
            if (existingAdminLink.parentElement) {
                existingAdminLink.parentElement.style.display = 'block';
            }
            return;
        }
        
        let adminLink = document.getElementById('adminPanelLink');
        if (!adminLink) {
            // Создаем ссылку в навигации
            const navMenu = document.querySelector('.nav-menu');
            if (navMenu) {
                adminLink = document.createElement('li');
                adminLink.innerHTML = '<a href="admin.html" class="nav-link" id="adminPanelLink">Админ панель</a>';
                const profileLink = document.getElementById('profileLink');
                if (profileLink && profileLink.parentElement) {
                    profileLink.parentElement.insertAdjacentElement('afterend', adminLink);
                } else {
                    navMenu.appendChild(adminLink);
                }
            }
        }
        if (adminLink) {
            adminLink.style.display = 'block';
        }
    }

    // Скрыть админ панель
    hideAdminPanel() {
        const adminLink = document.getElementById('adminPanelLink');
        if (adminLink) {
            adminLink.style.display = 'none';
        }
    }

    // Загрузить данные для админ панели
    async loadAdminData() {
        // Загружаем статистику, пользователей и т.д.
        // Это будет использоваться на странице admin.html
    }

    // Получить статистику сайта
    async getSiteStats() {
        if (!supabaseClient || !this.isAdmin) return null;

        try {
            // Подсчет пользователей
            const { count: usersCount } = await supabaseClient
                .from('profiles')
                .select('*', { count: 'exact', head: true });

            return {
                users: usersCount || 0
            };
        } catch (error) {
            // Не логируем ошибки статистики
            return null;
        }
    }

    // Получить список пользователей
    async getUsers(page = 1, limit = 50, search = '') {
        if (!supabaseClient || !this.isAdmin) return { users: [], total: 0 };

        try {
            // Используем view profiles_with_email, если доступен, иначе обычный запрос
            let query = supabaseClient
                .from('profiles_with_email')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false });

            if (search) {
                query = query.ilike('username', `%${search}%`);
            }

            query = query.range((page - 1) * limit, page * limit - 1);

            const { data, error, count } = await query;

            // Если view не доступен, пробуем обычный запрос и получаем email через RPC
            if (error && error.message?.includes('relation') || error?.code === '42P01') {
                console.log('View не доступен, используем RPC функцию для получения email');
                
                // Обычный запрос к profiles
                let basicQuery = supabaseClient
                    .from('profiles')
                    .select('*', { count: 'exact' })
                    .order('created_at', { ascending: false });

                if (search) {
                    basicQuery = basicQuery.ilike('username', `%${search}%`);
                }

                basicQuery = basicQuery.range((page - 1) * limit, page * limit - 1);
                const { data: basicData, error: basicError, count: basicCount } = await basicQuery;

                if (basicError) {
                    // Не логируем ошибки
                    return { users: [], total: 0 };
                }

                // Получаем email для каждого пользователя через RPC функцию
                const usersWithEmail = await Promise.all((basicData || []).map(async (user) => {
                    try {
                        const { data: emailData, error: emailError } = await supabaseClient
                            .rpc('get_user_email', { user_id: user.id });
                        
                        if (!emailError && emailData) {
                            return { ...user, email: emailData };
                        }
                    } catch (err) {
                        // Не логируем ошибки получения email
                    }
                    return { ...user, email: 'Не указан' };
                }));

                return { users: usersWithEmail, total: basicCount || 0 };
            }

            if (error) {
                // Не логируем ошибки получения пользователей
                return { users: [], total: 0 };
            }

            return { users: data || [], total: count || 0 };
        } catch (error) {
            // Не логируем ошибки
            return { users: [], total: 0 };
        }
    }

    // Обновить VIP подписку
    async updateVIP(userId, isActive, expiresAt = null) {
        if (!supabaseClient || !this.isAdmin) return { success: false, message: 'Нет доступа' };

        try {
            const { error } = await supabaseClient
                .from('vip_subscriptions')
                .upsert({
                    user_id: userId,
                    is_active: isActive,
                    expires_at: expiresAt
                }, {
                    onConflict: 'user_id'
                });

            if (error) {
                // Не логируем ошибки
                return { success: false, message: 'Не удалось обновить VIP подписку' };
            }

            return { success: true };
        } catch (error) {
            // Не логируем ошибки
            return { success: false, message: 'Ошибка обновления VIP подписки' };
        }
    }

    // Управление подписками пользователей
    async updateUserSubscription(userId, subscriptionType, expiresAt = null) {
        if (!supabaseClient || !this.isAdmin) return { success: false };

        try {
            if (typeof aiSubscriptionService !== 'undefined') {
                const success = await aiSubscriptionService.updateSubscriptionType(userId, subscriptionType, expiresAt);
                return { success };
            }

            return { success: false, message: 'Сервис подписок не доступен' };
        } catch (error) {
            // Не логируем ошибки
            return { success: false, message: 'Ошибка обновления подписки' };
        }
    }

    // Управление VIP подписками
    async updateVIPSubscription(userId, isActive, expiresAt = null) {
        if (!supabaseClient || !this.isAdmin) return { success: false };

        try {
            // Используем upsert вместо проверки существования
            const { error } = await supabaseClient
                .from('vip_subscriptions')
                .upsert({
                    user_id: userId,
                    is_active: isActive,
                    expires_at: expiresAt
                }, {
                    onConflict: 'user_id'
                });

            if (error) {
                // Не логируем ошибки
                return { success: false, message: 'Не удалось обновить VIP подписку' };
            }

            return { success: true };
        } catch (error) {
            // Не логируем ошибки
            return { success: false, message: 'Ошибка обновления VIP подписки' };
        }
    }

    // Удалить сообщение из общего чата
    async deleteChatMessage(messageId) {
        if (!supabaseClient || !this.isAdmin) return { success: false };

        try {
            const { error } = await supabaseClient
                .from('global_chat_messages')
                .update({
                    deleted_at: new Date().toISOString()
                })
                .eq('id', messageId);

            if (error) {
                // Не логируем ошибки
                return { success: false };
            }

            return { success: true };
        } catch (error) {
            // Не логируем ошибки
            return { success: false };
        }
    }

    // Добавить админа
    async addAdmin(userId, role = 'admin') {
        if (!supabaseClient || !this.isAdmin) return { success: false };

        try {
            const { error } = await supabaseClient
                .from('admins')
                .insert({
                    user_id: userId,
                    role: role
                })
                .select()
                .single();

            if (error && error.code !== '23505') {
                // Не логируем ошибки
                return { success: false, message: 'Не удалось добавить админа' };
            }

            return { success: true };
        } catch (error) {
            // Не логируем ошибки
            return { success: false, message: 'Ошибка добавления админа' };
        }
    }
}

// Создаем глобальный экземпляр
window.adminPanel = new AdminPanel();

// Инициализация при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.adminPanel) {
            window.adminPanel.init();
        }
    });
} else {
    if (window.adminPanel) {
        window.adminPanel.init();
    }
}


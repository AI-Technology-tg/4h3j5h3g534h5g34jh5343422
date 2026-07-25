// Система авторизации и регистрации

// Проверка валидности email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Проверка валидности пароля (минимум 6 символов)
function isValidPassword(password) {
    return password && password.length >= 6;
}

/**
 * Человекочитаемое сообщение об ошибке signUp (лимиты, сеть, занятый email).
 * @param {any} authError — объект error из ответа Supabase
 */
function mapSignUpAuthError(authError) {
    const raw = authError?.message || '';
    const msg = String(raw).toLowerCase();
    const status = authError?.status;
    const code = String(authError?.code || '').toLowerCase();

    if (
        status === 429 ||
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('too_many_requests') ||
        code.includes('over_request') ||
        msg.includes('only request this after')
    ) {
        const sec = raw.match(/(\d+)\s*seconds?/i)?.[1];
        return sec
            ? `Слишком много запросов. Подождите ${sec} сек. и попробуйте снова. Не нажимайте «Зарегистрироваться» несколько раз подряд — это усиливает лимит Supabase.`
            : `Слишком много попыток регистрации (лимит Supabase). Подождите 1–2 минуты без новых нажатий и попробуйте ещё раз.`;
    }

    if (
        status === 504 ||
        status === 503 ||
        status === 502 ||
        msg.includes('gateway') ||
        msg.includes('timeout') ||
        msg.includes('timed out')
    ) {
        return 'Сервер регистрации временно не ответил (таймаут или перегрузка). Подождите минуту и нажмите кнопку ещё раз один раз.';
    }

    if (
        msg.includes('user already registered') ||
        msg.includes('already registered') ||
        msg.includes('already been registered') ||
        status === 422
    ) {
        return 'Пользователь с таким email уже зарегистрирован. Используйте другой email или войдите в существующий аккаунт.';
    }

    if (
        msg.includes('error sending confirmation email') ||
        msg.includes('confirmation email')
    ) {
        return 'Ошибка отправки письма подтверждения. Проверьте настройки SMTP в Supabase Dashboard (см. SMTP_SETUP_GUIDE.md).';
    }

    return raw || 'Ошибка регистрации';
}

// Регистрация пользователя через Supabase Auth
async function registerUser(email, password, username, avatar, gender = 'male') {
    if (typeof logger !== 'undefined') logger.log('🔵 [REGISTER] Начало регистрации:', { email, username, gender });
    
    if (!isValidEmail(email)) {
        if (typeof logger !== 'undefined') logger.log('❌ [REGISTER] Неверный формат email');
        return { success: false, message: 'Некорректный формат email' };
    }
    
    if (!isValidPassword(password)) {
        if (typeof logger !== 'undefined') logger.log('❌ [REGISTER] Пароль слишком короткий');
        return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
    }
    
    if (!username || username.trim().length < 3) {
        if (typeof logger !== 'undefined') logger.log('❌ [REGISTER] Имя пользователя слишком короткое');
        return { success: false, message: 'Имя пользователя должно содержать минимум 3 символа' };
    }
    
    // Проверяем наличие Supabase клиента
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (typeof logger !== 'undefined') logger.error('❌ [REGISTER] Supabase клиент не найден! Регистрация через localStorage не поддерживается.');
        return { success: false, message: 'Ошибка подключения к базе данных' };
    }
    
    if (typeof logger !== 'undefined') logger.log('✅ [REGISTER] Supabase клиент найден, продолжаем регистрацию через Supabase Auth');
    
    // Примечание: Проверку существования email оставляем на Supabase
    // Если email уже зарегистрирован, Supabase вернет ошибку при signUp
    // Обработка этой ошибки находится ниже в коде
    
    // Используем переданный аватар или случайный
    const availableAvatars = [
        'Fons/1 b.jpg', 'Fons/2 b.jpg', 'Fons/3 b.jpg', 'Fons/4 b.jpg', 'Fons/5 b.jpg',
        'Fons/1 g.jpg', 'Fons/2 g.jpg', 'Fons/3 g.jpg', 'Fons/4 g.jpg', 'Fons/5 g.jpg'
    ];
    const userAvatar = avatar || availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
    
    try {
        if (typeof logger !== 'undefined') logger.log('🔄 [REGISTER] Вызов supabaseClient.auth.signUp...');
        
        // Регистрируем пользователя через Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username,
                    avatar: userAvatar,
                    gender: gender
                }
            }
        });
        
        if (typeof logger !== 'undefined') logger.log('📦 [REGISTER] Ответ от Supabase Auth:', { 
            hasUser: !!authData?.user, 
            hasSession: !!authData?.session,
            error: authError,
            userId: authData?.user?.id 
        });
        
        if (authError) {
            if (typeof logger !== 'undefined') logger.error('❌ [REGISTER] Ошибка регистрации в Supabase:', authError);
            return { success: false, message: mapSignUpAuthError(authError) };
        }
        
        if (!authData.user) {
            if (typeof logger !== 'undefined') logger.error('❌ [REGISTER] Пользователь не создан (authData.user = null)');
            return { success: false, message: 'Не удалось создать пользователя' };
        }
        
        if (typeof logger !== 'undefined') logger.log('✅ [REGISTER] Пользователь создан в Supabase Auth! ID:', authData.user.id);
        if (typeof logger !== 'undefined') logger.log('📝 [REGISTER] Данные пользователя:', {
            id: authData.user.id,
            email: authData.user.email,
            emailConfirmed: authData.user.email_confirmed_at ? 'да' : 'нет',
            hasSession: !!authData.session
        });
        
        // Профиль создается автоматически через триггер handle_new_user
        // Пытаемся обновить его с правильными данными, но не критично если не получится
        // Не логируем ошибки 401, так как это нормально - профиль создастся триггером
        if (authData.session) {
            try {
                const { error: profileError } = await supabaseClient
                    .from('profiles')
                    .upsert({
                        id: authData.user.id,
                        username: username,
                        avatar: userAvatar,
                        gender: gender,
                        profile_setup_done: true
                    }, {
                        onConflict: 'id'
                    });
                
                // Ошибка 401 - это нормально, профиль создастся триггером
                // Не логируем, чтобы не засорять консоль
            } catch (profileErr) {
                // Игнорируем ошибки создания профиля - он создастся триггером
            }
        }
        
        // Автоматически входим только если email подтвержден и есть сессия
        // В Supabase по умолчанию email подтверждение может быть включено
        if (authData.session && authData.user.email_confirmed_at) {
            if (typeof logger !== 'undefined') logger.log('✅ [REGISTER] Сессия создана и email подтвержден, сохраняем данные в sessionStorage');
            sessionStorage.setItem('currentUser', JSON.stringify({
                id: authData.user.id,
                email: authData.user.email,
                username: username,
                avatar: userAvatar
            }));
            localStorage.setItem('isAuth', 'true');
            if (typeof ensureUserDataRecord === 'function') {
                ensureUserDataRecord(authData.user.id);
            }
        } else if (authData.session && !authData.user.email_confirmed_at) {
            // Сессия есть, но email не подтвержден - не сохраняем авторизацию
            if (typeof logger !== 'undefined') logger.log('⚠️ [REGISTER] Сессия создана, но email не подтвержден - требуется подтверждение');
        } else {
            // Сессии нет - не пытаемся автоматически входить, так как email не подтвержден
            if (typeof logger !== 'undefined') logger.log('⚠️ [REGISTER] Сессия не создана - требуется подтверждение email');
        }
        
        if (typeof logger !== 'undefined') logger.log('✅ [REGISTER] Регистрация завершена успешно!');

        if (authData.session && typeof window.reminkoGiveawayAttributeRegistration === 'function') {
            try {
                await window.reminkoGiveawayAttributeRegistration();
            } catch (_) {
                /* ignore */
            }
        }
        
        // Если email не подтвержден, возвращаем информацию для показа модального окна
        if (!authData.session && !authData.user.email_confirmed_at) {
            return { 
                success: true, 
                needsEmailConfirmation: true,
                message: 'Регистрация успешна! Проверьте email для подтверждения.',
                user: authData.user,
                email: email
            };
        }
        
        return { 
            success: true, 
            message: 'Регистрация успешна! ' + (authData.session ? 'Добро пожаловать!' : 'Проверьте email для подтверждения.'),
            user: authData.user,
            session: authData.session
        };
    } catch (error) {
        if (typeof logger !== 'undefined') logger.error('❌ [REGISTER] Исключение при регистрации:', error);
        const name = error?.name || '';
        const em = String(error?.message || '');
        if (
            name === 'AuthRetryableFetchError' ||
            em.includes('504') ||
            em.includes('503') ||
            em.includes('502') ||
            em.toLowerCase().includes('timeout') ||
            em.toLowerCase().includes('fetch')
        ) {
            return {
                success: false,
                message:
                    'Не удалось связаться с сервером регистрации (сеть или таймаут). Подождите минуту и нажмите «Зарегистрироваться» один раз.'
            };
        }
        return { success: false, message: em || 'Ошибка регистрации' };
    }
}

// Вход пользователя через Supabase Auth
async function loginUser(email, password, codePassword = null, codePhrase = null) {
    if (typeof logger !== 'undefined') logger.log('🔵 [LOGIN] Начало входа:', { email });
    
    if (!isValidEmail(email)) {
        if (typeof logger !== 'undefined') logger.log('❌ [LOGIN] Неверный формат email');
        return { success: false, message: 'Некорректный формат email' };
    }
    
    if (!isValidPassword(password)) {
        if (typeof logger !== 'undefined') logger.log('❌ [LOGIN] Пароль слишком короткий');
        return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
    }
    
    // Специальная логика для входа создателя удалена - теперь роль определяется из базы данных
    
    // Проверяем наличие Supabase клиента
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (typeof logger !== 'undefined') logger.error('❌ [LOGIN] Supabase клиент не найден!');
        return { success: false, message: 'Ошибка подключения к базе данных' };
    }
    
    if (typeof logger !== 'undefined') logger.log('✅ [LOGIN] Supabase клиент найден, продолжаем вход через Supabase Auth');
    
    try {
        if (typeof logger !== 'undefined') logger.log('🔄 [LOGIN] Вызов supabaseClient.auth.signInWithPassword...');
        
        // Входим через Supabase Auth (используем пароль, который ввел пользователь)
        if (typeof logger !== 'undefined') logger.log('🔑 [LOGIN] Попытка входа с паролем (длина:', password.length, 'символов)');
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (typeof logger !== 'undefined') logger.log('📦 [LOGIN] Ответ от Supabase Auth:', { 
            hasUser: !!authData?.user, 
            hasSession: !!authData?.session,
            error: authError,
            errorMessage: authError?.message,
            userId: authData?.user?.id 
        });
        
        if (authError) {
            if (typeof logger !== 'undefined') logger.error('❌ [LOGIN] Ошибка входа в Supabase:', authError);
            
            // Обработка ошибки "Email not confirmed"
            if (authError.message?.toLowerCase().includes('email not confirmed') || 
                authError.message?.toLowerCase().includes('email_not_confirmed')) {
                return { 
                    success: false, 
                    message: 'Email не подтвержден. Проверьте почту или подтвердите email в настройках Supabase.' 
                };
            }
            
            // Обработка ошибки "Invalid login credentials"
            if (authError.message?.toLowerCase().includes('invalid login credentials') ||
                authError.message?.toLowerCase().includes('invalid_credentials')) {
                return { 
                    success: false, 
                    message: 'Неверный email или пароль. Проверьте правильность введенных данных.' 
                };
            }
            
            return { success: false, message: authError.message || 'Неверный email или пароль' };
        }
        
        if (!authData.user || !authData.session) {
            if (typeof logger !== 'undefined') logger.error('❌ [LOGIN] Пользователь или сессия не найдены');
            return { success: false, message: 'Ошибка входа' };
        }
        
        if (typeof logger !== 'undefined') logger.log('✅ [LOGIN] Вход выполнен! ID пользователя:', authData.user.id);
        
        // Получаем профиль пользователя
        if (typeof logger !== 'undefined') logger.log('🔄 [LOGIN] Загрузка профиля из таблицы profiles...');
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('username, avatar, gender, profile_setup_done')
            .eq('id', authData.user.id)
            .single();
        
        if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = not found
            if (typeof logger !== 'undefined') logger.error('⚠️ [LOGIN] Ошибка загрузки профиля:', profileError);
        } else if (profile) {
            if (typeof logger !== 'undefined') logger.log('✅ [LOGIN] Профиль загружен:', profile);
        } else {
            if (typeof logger !== 'undefined') logger.log('⚠️ [LOGIN] Профиль не найден');
        }
        
        // Сохраняем данные пользователя
        const userData = {
            id: authData.user.id,
            email: authData.user.email,
            username: profile?.username || authData.user.email?.split('@')[0] || 'Пользователь',
            avatar: profile?.avatar || 'Fons/1 b.jpg',
            gender: reminkoNormalizeGender(profile?.gender) || 'male',
            profile_setup_done: profile?.profile_setup_done !== false
        };
        
        // Обновляем кэш
        currentUserCache = userData;
        currentUserCacheTime = Date.now();
        
        if (typeof logger !== 'undefined') logger.log('💾 [LOGIN] Сохранение данных пользователя в sessionStorage:', userData);
        sessionStorage.setItem('currentUser', JSON.stringify(userData));
        localStorage.setItem('isAuth', 'true');
        if (typeof ensureUserDataRecord === 'function') {
            ensureUserDataRecord(userData.id);
        }
        if (typeof updateUserData === 'function') {
            updateUserData(userData.id, {
                username: userData.username,
                avatar: userData.avatar,
                gender: userData.gender
            });
        }

        if (typeof logger !== 'undefined') logger.log('✅ [LOGIN] Вход завершен успешно!');
        return { 
            success: true, 
            message: 'Вход выполнен успешно!',
            user: userData
        };
    } catch (error) {
        if (typeof logger !== 'undefined') logger.error('❌ [LOGIN] Исключение при входе:', error);
        return { success: false, message: error.message || 'Ошибка входа' };
    }
}

// Выход пользователя
async function logoutUser() {
    if (typeof logger !== 'undefined') logger.log('🔴 [LOGOUT] Начало выхода');
    
    // Очищаем кэш
    clearUserCache();
    
    // Выходим из Supabase Auth
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { error } = await supabaseClient.auth.signOut();
            // Не логируем ошибки выхода
        } catch (error) {
            // Игнорируем ошибки
        }
    }
    
    sessionStorage.removeItem('currentUser');
    localStorage.removeItem('isAuth');
    localStorage.removeItem('userId');
    
    if (typeof logger !== 'undefined') logger.log('✅ [LOGOUT] Выход завершен');
    return { success: true, message: 'Выход выполнен' };
}

/** Очистить локальную «сессию» без вызова API (если токен уже недействителен). */
function reminkoClearLocalAuthOnly() {
    clearUserCache();
    try {
        sessionStorage.removeItem('currentUser');
    } catch (_) {
        /* ignore */
    }
    try {
        localStorage.removeItem('isAuth');
        localStorage.removeItem('userId');
    } catch (_) {
        /* ignore */
    }
}

/**
 * Принудительный выход: аккаунт удалили в Dashboard / в таблице, а локальный JWT ещё живёт.
 * @param {string} message — текст уведомления
 */
async function reminkoForceLogoutAccountRemoved(message) {
    if (window.__reminkoForcedLogoutInProgress) return;
    window.__reminkoForcedLogoutInProgress = true;
    try {
        reminkoClearLocalAuthOnly();
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                await supabaseClient.auth.signOut({ scope: 'global' });
            } catch (_) {
                /* ignore */
            }
        }
        if (typeof window.reminkoSyncAuthStorage === 'function') {
            window.reminkoSyncAuthStorage(null);
        }
        const text =
            message ||
            'Сессия сброшена: аккаунт удалён или недоступен. Выполнен выход со всех устройств.';
        if (typeof showWarning === 'function') {
            showWarning(text);
        } else if (typeof showError === 'function') {
            showError(text);
        }
        if (window.navigationManager && typeof window.navigationManager.updateAuthLinks === 'function') {
            await window.navigationManager.updateAuthLinks();
        }
    } finally {
        setTimeout(() => {
            window.__reminkoForcedLogoutInProgress = false;
        }, 1500);
    }
}
window.reminkoForceLogoutAccountRemoved = reminkoForceLogoutAccountRemoved;

let __reminkoAuthValidateInFlight = false;
let __reminkoLastServerValidateAt = 0;

/**
 * Проверка на сервере: пользователь ещё в auth.users и есть строка в profiles.
 * Вызывать после загрузки и при обновлении токена — иначе при удалении из БД локальная сессия «висит».
 * @param {string} reason — 'initial' | 'token' | 'focus' | 'manual'
 */
async function reminkoValidateServerAuthOrSignOut(reason) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    if (__reminkoAuthValidateInFlight) return;

    const { data: sessWrap } = await supabaseClient.auth.getSession();
    if (!sessWrap?.session?.user) return;

    const now = Date.now();
    if (reason !== 'focus' && reason !== 'manual' && now - __reminkoLastServerValidateAt < 20000) {
        return;
    }

    __reminkoAuthValidateInFlight = true;
    try {
        const { data: userData, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !userData?.user) {
            await reminkoForceLogoutAccountRemoved(
                'Аккаунт удалён в системе авторизации или сессия недействительна. Выполнен выход.'
            );
            __reminkoLastServerValidateAt = Date.now();
            return;
        }

        const uid = userData.user.id;
        const { data: profile, error: pErr } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('id', uid)
            .maybeSingle();

        if (pErr) {
            return;
        }

        if (!profile) {
            const createdMs = userData.user.created_at
                ? new Date(userData.user.created_at).getTime()
                : 0;
            if (createdMs && Date.now() - createdMs < 20000) {
                __reminkoLastServerValidateAt = Date.now();
                return;
            }
            await new Promise((r) => setTimeout(r, 1600));
            const { data: profile2 } = await supabaseClient
                .from('profiles')
                .select('id')
                .eq('id', uid)
                .maybeSingle();
            if (!profile2) {
                await reminkoForceLogoutAccountRemoved(
                    'Запись профиля удалена из базы. Выполнен выход из аккаунта.'
                );
                __reminkoLastServerValidateAt = Date.now();
                return;
            }
        }

        __reminkoLastServerValidateAt = Date.now();
    } finally {
        __reminkoAuthValidateInFlight = false;
    }
}
window.reminkoValidateServerAuthOrSignOut = reminkoValidateServerAuthOrSignOut;

// Кэш для текущего пользователя (обновляется при изменениях)
let currentUserCache = null;
let currentUserCacheTime = 0;
const USER_CACHE_DURATION = 30000; // 30 секунд

// Получить текущего пользователя
async function getCurrentUser(forceRefresh = false) {
    // Проверяем кэш (если не принудительное обновление)
    if (!forceRefresh && currentUserCache && (Date.now() - currentUserCacheTime) < USER_CACHE_DURATION) {
        return currentUserCache;
    }

    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data: authData, error: authErr } = await supabaseClient.auth.getUser();
            if (authErr || !authData?.user) {
                reminkoClearLocalAuthOnly();
                currentUserCache = null;
                return null;
            }

            const su = authData.user;

            let profile;
            let profileErr;
            if (typeof reminkoFetchOwnProfile === 'function') {
                const fetched = await reminkoFetchOwnProfile(supabaseClient, su.id);
                profile = fetched.profile;
                profileErr = fetched.error;
            } else {
                const row = await supabaseClient
                    .from('profiles')
                    .select('username, avatar, gender, profile_setup_done')
                    .eq('id', su.id)
                    .maybeSingle();
                profile = row.data;
                profileErr = row.error;
            }

            if (profileErr && !profile) {
                currentUserCache = null;
                reminkoClearLocalAuthOnly();
                return null;
            }

            if (!profile) {
                const isAnon = su.is_anonymous === true;
                if (isAnon) {
                    const meta = su.user_metadata || {};
                    const uname = (meta.username || meta.display_name || meta.full_name || 'Гость').toString().trim() || 'Гость';
                    const userData = {
                        id: su.id,
                        email: su.email || '',
                        username: uname,
                        avatar: 'Fons/1 b.jpg',
                        isAnonymous: true
                    };
                    currentUserCache = userData;
                    currentUserCacheTime = Date.now();
                    if (typeof ensureUserDataRecord === 'function') {
                        ensureUserDataRecord(userData.id);
                    }
                    try {
                        sessionStorage.setItem('currentUser', JSON.stringify(userData));
                        localStorage.setItem('isAuth', 'true');
                        localStorage.setItem('userId', userData.id);
                    } catch (_) {
                        /* ignore */
                    }
                    return userData;
                }
                const createdMs = su.created_at ? new Date(su.created_at).getTime() : 0;
                const isBrandNew = createdMs && Date.now() - createdMs < 20000;
                if (isBrandNew) {
                    const userData = {
                        id: su.id,
                        email: su.email || '',
                        username: su.email?.split('@')[0] || 'Пользователь',
                        avatar: 'Fons/1 b.jpg',
                        isAnonymous: su.is_anonymous === true
                    };
                    currentUserCache = userData;
                    currentUserCacheTime = Date.now();
                    try {
                        sessionStorage.setItem('currentUser', JSON.stringify(userData));
                        localStorage.setItem('isAuth', 'true');
                        localStorage.setItem('userId', userData.id);
                    } catch (_) {
                        /* ignore */
                    }
                    return userData;
                }
                await new Promise((r) => setTimeout(r, 1500));
                if (typeof reminkoFetchOwnProfile === 'function') {
                    const second = await reminkoFetchOwnProfile(supabaseClient, su.id);
                    profile = second.profile;
                } else {
                    const fb = await supabaseClient
                        .from('profiles')
                        .select('username, avatar, gender, profile_setup_done')
                        .eq('id', su.id)
                        .maybeSingle();
                    profile = fb.data;
                }
                if (!profile) {
                    await reminkoForceLogoutAccountRemoved(
                        'Профиль удалён из базы. Выполнен выход из аккаунта.'
                    );
                    currentUserCache = null;
                    return null;
                }
            }

            if (profile?.is_banned === true) {
                const reason = profile.ban_reason ? String(profile.ban_reason) : '';
                await reminkoForceLogoutAccountRemoved(
                    reason
                        ? `Аккаунт заблокирован: ${reason}`
                        : 'Аккаунт заблокирован администратором сайта.'
                );
                currentUserCache = null;
                return null;
            }

            const meta = su.user_metadata || {};
            const anonMetaName =
                su.is_anonymous === true
                    ? String(meta.username || meta.display_name || meta.full_name || '').trim()
                    : '';
            const anonMetaAvatar =
                su.is_anonymous === true
                    ? String(meta.avatar || meta.avatar_url || '').trim()
                    : '';
            const profileUsername = profile?.username ? String(profile.username).trim() : '';
            const profileIsAutoGuest =
                !profileUsername ||
                (typeof reminkoIsAutoGuestUsername === 'function' &&
                    reminkoIsAutoGuestUsername(profileUsername));
            const metaNameOk =
                !!anonMetaName &&
                !(
                    typeof reminkoIsAutoGuestUsername === 'function' &&
                    reminkoIsAutoGuestUsername(anonMetaName)
                );
            // У анонима «Гость» в profiles — битый дефолт: берём имя из metadata
            const resolvedUsername =
                (su.is_anonymous && profileIsAutoGuest && metaNameOk
                    ? anonMetaName
                    : null) ||
                profileUsername ||
                (metaNameOk ? anonMetaName : null) ||
                (su.is_anonymous ? anonMetaName || 'Гость' : su.email?.split('@')[0]) ||
                'Пользователь';
            const profileAvatar = profile?.avatar
                ? String(profile.avatar).trim().replace(/^\/+/, '')
                : '';
            const profileAvatarIsDefault =
                !profileAvatar ||
                profileAvatar === 'Fons/seitFon.jpg' ||
                /^Fons\/1\s+[bg]\.jpg$/i.test(profileAvatar);
            const metaPicture = String(
                meta.avatar || meta.avatar_url || meta.picture || ''
            ).trim();
            const resolvedAvatar = (
                (su.is_anonymous && profileAvatarIsDefault && anonMetaAvatar
                    ? anonMetaAvatar
                    : null) ||
                profileAvatar ||
                anonMetaAvatar ||
                (profileAvatarIsDefault && metaPicture ? metaPicture : '') ||
                'Fons/1 b.jpg'
            ).replace(/^\/+/, '');
            const userData = {
                id: su.id,
                email: su.email || '',
                username: resolvedUsername,
                avatar: resolvedAvatar,
                gender: reminkoNormalizeGender(profile?.gender) || 'male',
                profile_setup_done: profile?.profile_setup_done !== false,
                isAnonymous: su.is_anonymous === true,
                is_banned: false,
                is_site_creator: profile?.is_site_creator === true,
                isSiteCreator: profile?.is_site_creator === true
            };

            currentUserCache = userData;
            currentUserCacheTime = Date.now();
            if (typeof ensureUserDataRecord === 'function') {
                ensureUserDataRecord(userData.id);
            }
            if (typeof updateUserData === 'function') {
                updateUserData(userData.id, {
                    username: userData.username,
                    avatar: userData.avatar,
                    gender: userData.gender
                });
            }
            try {
                sessionStorage.setItem('currentUser', JSON.stringify(userData));
                localStorage.setItem('isAuth', 'true');
                localStorage.setItem('userId', userData.id);
            } catch (_) {
                /* ignore */
            }
            return userData;
        } catch (error) {
            currentUserCache = null;
            return null;
        }
    }

    const userStr = sessionStorage.getItem('currentUser');
    if (userStr) {
        try {
            const userData = JSON.parse(userStr);
            currentUserCache = userData;
            currentUserCacheTime = Date.now();
            if (typeof ensureUserDataRecord === 'function') {
                ensureUserDataRecord(userData.id);
            }
            return userData;
        } catch (e) {
            /* ignore */
        }
    }

    currentUserCache = null;
    return null;
}

// Очистить кэш пользователя (вызывать при выходе или изменении данных)
function clearUserCache() {
    currentUserCache = null;
    currentUserCacheTime = 0;
}

// Экспортируем для использования в других модулях
window.clearUserCache = clearUserCache;

// Синхронная версия getCurrentUser (использует кэш/sessionStorage)
function getCurrentUserSync() {
    // Сначала проверяем кэш
    if (currentUserCache) {
        return currentUserCache;
    }
    
    // Fallback на sessionStorage
    const userStr = sessionStorage.getItem('currentUser');
    if (userStr) {
        try {
            return JSON.parse(userStr);
        } catch (e) {
            return null;
        }
    }
    
    return null;
}

// Синхронная проверка авторизации (использует localStorage/sessionStorage)
function isAuthenticatedSync() {
    if (localStorage.getItem('isAuth') !== 'true') return false;
    const raw = sessionStorage.getItem('currentUser');
    if (!raw) return false;
    try {
        const u = JSON.parse(raw);
        return !!(u && u.id && !u.isAnonymous);
    } catch (_) {
        return false;
    }
}

// Экспортируем синхронные версии
window.getCurrentUserSync = getCurrentUserSync;
window.isAuthenticatedSync = isAuthenticatedSync;

// Проверка авторизации (полноценный аккаунт, не гость)
async function isAuthenticated() {
    if (typeof getCurrentUser === 'function') {
        try {
            const user = await getCurrentUser();
            return !!(user && !user.isAnonymous);
        } catch (_) {
            return false;
        }
    }
    return isAuthenticatedSync();
}

window.isAuthenticated = isAuthenticated;

/**
 * Эвристика пола по имени (RU/EN), если в профиле пол не задан.
 * Возвращает 'male' | 'female' | null (неясно).
 */
function reminkoInferGenderFromName(rawName) {
    const first = String(rawName || '')
        .trim()
        .split(/[\s._\-]+/)[0]
        .toLowerCase()
        .replace(/[^a-zа-яёіїєґ]/gi, '');
    if (!first || first.length < 2) return null;

    const femaleExact = new Set([
        'анна', 'анюта', 'аня', 'мария', 'маша', 'марина', 'даша', 'дарья', 'дария',
        'катя', 'катерина', 'екатерина', 'настя', 'анастасия', 'оля', 'ольга',
        'юля', 'юлия', 'лена', 'елена', 'алина', 'полина', 'вика', 'виктория',
        'наташа', 'наталья', 'наталия', 'света', 'светлана', 'таня', 'татьяна',
        'ира', 'ирина', 'кристина', 'ксения', 'оксана', 'валерия', 'лера',
        'соня', 'софия', 'софья', 'ульяна', 'яна', 'вероника', 'диана', 'мила',
        'милаа', 'елизавета', 'лиза', 'анжелика', 'ангелина', 'варя', 'варвара',
        'аннаmaria', 'anna', 'maria', 'mary', 'kate', 'katie', 'sophia', 'sofia',
        'olga', 'elena', 'julia', 'yulia', 'victoria', 'viktoria', 'daria', 'dasha',
        'polina', 'alina', 'irina', 'marina', 'natalia', 'natalya', 'svetlana',
        'tanya', 'tatiana', 'ksenia', 'oksana', 'valeria', 'veronica', 'diana',
        'elizabeth', 'lisa', 'emily', 'emma', 'olivia', 'ava', 'mia', 'amelia'
    ]);
    const maleExact = new Set([
        'александр', 'саша', 'алексей', 'лёша', 'леша', 'андрей', 'дмитрий', 'дима',
        'иван', 'ваня', 'сергей', 'серёжа', 'сережа', 'максим', 'макс', 'никита',
        'илья', 'михаил', 'миша', 'павел', 'паша', 'роман', 'ромыч', 'артём', 'артем',
        'тимофей', 'тима', 'владимир', 'вова', 'владислав', 'влад', 'евгений', 'женя',
        'кирилл', 'денис', 'егор', 'игорь', 'олег', 'юрий', 'ярослав', 'матвей',
        'степан', 'фёдор', 'федор', 'григорий', 'гриша', 'богдан', 'данил', 'данило',
        'данила', 'кузьма', 'фома', 'лука', 'савва', 'глеб', 'лев', 'марк',
        'alexander', 'alex', 'andrew', 'andrey', 'dmitry', 'dmitri', 'ivan', 'john',
        'sergey', 'sergei', 'maxim', 'max', 'nikita', 'ilya', 'michael', 'mike',
        'paul', 'roman', 'artem', 'vladimir', 'vlad', 'eugene', 'kirill', 'denis',
        'egor', 'igor', 'oleg', 'yuri', 'yaroslav', 'mark', 'leo', 'daniel', 'danil',
        'james', 'robert', 'william', 'david', 'thomas', 'chris', 'jack', 'ryan'
    ]);

    if (femaleExact.has(first)) return 'female';
    if (maleExact.has(first)) return 'male';

    // Мужские имена на -а/-я и частые уменьшительные
    if (
        /^(никита|илья|иля|кузьма|фома|лука|савва|данила|данило|лёша|леша|жора|миша|вова|ваня|паша|дима|коля|толя|витя|ромыч|женя|саша)$/i.test(
            first
        )
    ) {
        return 'male';
    }
    // Типичные женские окончания (кроме мужских исключений выше)
    if (/[ая]$/i.test(first)) return 'female';
    if (/(ina|ella|ette|lyn)$/i.test(first)) return 'female';
    if (/(son|ton|ley|ard|ert|ick|ius)$/i.test(first)) return 'male';
    return null;
}

/** Нормализация значения пола из профиля / формы. */
function reminkoNormalizeGender(raw) {
    const g = String(raw || '').trim().toLowerCase();
    if (g === 'female' || g === 'f' || g === 'ж' || g === 'жен' || g === 'женский') return 'female';
    if (g === 'male' || g === 'm' || g === 'м' || g === 'муж' || g === 'мужской') return 'male';
    return null;
}

/**
 * Пол для Minko / UI: профиль → session → local users → эвристика имени → male.
 */
async function reminkoResolveUserGender(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const userId = o.userId || null;
    const usernameHint = o.username || null;

    let fromProfile = null;
    if (userId && typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data } = await supabaseClient
                .from('profiles')
                .select('gender, username')
                .eq('id', userId)
                .maybeSingle();
            fromProfile = reminkoNormalizeGender(data?.gender);
            if (!usernameHint && data?.username) o.username = data.username;
        } catch (_) {
            /* ignore */
        }
    }

    const sync =
        typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
    const fromSession =
        sync && String(sync.id) === String(userId)
            ? reminkoNormalizeGender(sync.gender)
            : reminkoNormalizeGender(sync?.gender);
    const local =
        userId && typeof getUserData === 'function' ? getUserData(userId) : null;
    const fromLocal = reminkoNormalizeGender(local?.gender);
    const name = usernameHint || o.username || local?.username || sync?.username || '';
    const fromName = reminkoInferGenderFromName(name);

    return fromProfile || fromSession || fromLocal || fromName || 'male';
}

window.reminkoInferGenderFromName = reminkoInferGenderFromName;
window.reminkoNormalizeGender = reminkoNormalizeGender;
window.reminkoResolveUserGender = reminkoResolveUserGender;

// Получить полную информацию о пользователе
function getUserData(userId) {
    if (!userId) return null;
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    // Поддержка строковых UUID и числовых ID
    return users.find(u => u.id === userId || u.id === String(userId) || u.id === parseInt(userId));
}

/** Синхронизация полей профиля с Supabase (UUID-пользователи). */
function reminkoMirrorProfileFieldsToSupabase(userId, data) {
    if (!userId || !data || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    const uid = String(userId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid)) return;

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(data, 'avatar')) patch.avatar = data.avatar;
    if (Object.prototype.hasOwnProperty.call(data, 'username')) patch.username = data.username;
    if (Object.prototype.hasOwnProperty.call(data, 'gender')) patch.gender = data.gender;
    if (Object.keys(patch).length === 0) return;

    supabaseClient
        .from('profiles')
        .update(patch)
        .eq('id', uid)
        .then(({ error }) => {
            if (error) console.warn('[profiles] обновление:', error);
        });
}

// Обновить данные пользователя
function updateUserData(userId, data) {
    if (!userId) return { success: false };
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userIndex = users.findIndex(u => u.id === userId || u.id === String(userId) || u.id === parseInt(userId));
    
    if (userIndex !== -1) {
        users[userIndex] = { ...users[userIndex], ...data };
        localStorage.setItem('users', JSON.stringify(users));
        
        const currentUser = getCurrentUserSync();
        if (currentUser && (currentUser.id === userId || currentUser.id === String(userId))) {
            sessionStorage.setItem('currentUser', JSON.stringify({
                ...currentUser,
                ...data
            }));
        }

        reminkoMirrorProfileFieldsToSupabase(userId, data);
        return { success: true };
    }
    
    // Если пользователь не найден - создаём новую запись
    users.push({ id: userId, ...data });
    localStorage.setItem('users', JSON.stringify(users));

    const currentUser = getCurrentUserSync();
    if (currentUser && (currentUser.id === userId || currentUser.id === String(userId))) {
        sessionStorage.setItem('currentUser', JSON.stringify({
            ...currentUser,
            ...data
        }));
    }

    reminkoMirrorProfileFieldsToSupabase(userId, data);
    return { success: true };
}

/**
 * Для пользователей Supabase запись в localStorage `users` часто отсутствует —
 * настройки сайта и saveSetting опираются на getUserData. Создаём зеркальную запись.
 */
function ensureUserDataRecord(userId) {
    if (!userId) return null;
    const existing = getUserData(userId);
    if (existing) return existing;
    const sync = getCurrentUserSync();
    if (!sync || String(sync.id) !== String(userId)) return null;
    const defaults = {
        email: sync.email || '',
        username:
            sync.username || (sync.email && sync.email.split('@')[0]) || 'Пользователь',
        avatar: sync.avatar || 'Fons/1 b.jpg',
        settings: {
            adsEnabled: true,
            notificationsEnabled: true,
            showRecommendations: true,
            theme: 'dark',
            notificationPrefs: {
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
            }
        }
    };
    updateUserData(userId, defaults);
    return getUserData(userId);
}
window.ensureUserDataRecord = ensureUserDataRecord;

window.addEventListener('pageshow', (event) => {
    if (!event.persisted || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session && session.user && typeof window.reminkoSyncAuthStorage === 'function') {
            window.reminkoSyncAuthStorage(session);
        }
        if (typeof window.reminkoValidateServerAuthOrSignOut === 'function') {
            window.reminkoValidateServerAuthOrSignOut('focus');
        }
    });
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || typeof supabaseClient === 'undefined' || !supabaseClient) {
        return;
    }
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session && session.user && typeof window.reminkoSyncAuthStorage === 'function') {
            window.reminkoSyncAuthStorage(session);
        }
        if (typeof window.reminkoValidateServerAuthOrSignOut === 'function') {
            window.reminkoValidateServerAuthOrSignOut('focus');
        }
    });
});

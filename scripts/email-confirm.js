// Обработка подтверждения email
// Модалки (#emailConfirmModal и др.) создаются динамически в navigation.js — используем делегирование на document.

(function () {
    if (typeof window !== 'undefined' && window.__reminkoEmailConfirmBound) return;
    if (typeof window !== 'undefined') window.__reminkoEmailConfirmBound = true;

    async function handleEmailConfirmSubmit() {
        const emailConfirmError = document.getElementById('emailConfirmError');
        const emailConfirmModal = document.getElementById('emailConfirmModal');
        const emailConfirmCode = document.getElementById('emailConfirmCode');

        console.log('🔄 [EMAIL CONFIRM] Начало подтверждения email...');

        const code = emailConfirmCode?.value?.trim() || '';
        console.log('📝 [EMAIL CONFIRM] Введенный код:', code ? code.substring(0, 2) + '***' : 'пусто');

        if (!code || code.length < 6 || code.length > 8) {
            console.error('❌ [EMAIL CONFIRM] Неверный формат кода:', code.length);
            if (emailConfirmError) {
                emailConfirmError.textContent = 'Введите код из 6–8 цифр';
                emailConfirmError.style.display = 'block';
            }
            return;
        }

        let email = null;
        let userData = null;

        const pendingData = sessionStorage.getItem('pendingEmailConfirmation');
        if (pendingData) {
            try {
                userData = JSON.parse(pendingData);
                email = userData.email;
                console.log('✅ [EMAIL CONFIRM] Email из sessionStorage:', email);
            } catch (parseError) {
                console.warn('⚠️ [EMAIL CONFIRM] Ошибка парсинга данных из sessionStorage:', parseError);
            }
        }

        if (!email) {
            const confirmEmailAddress = document.getElementById('confirmEmailAddress');
            if (confirmEmailAddress && confirmEmailAddress.textContent) {
                email = confirmEmailAddress.textContent.trim();
                console.log('✅ [EMAIL CONFIRM] Email из модального окна:', email);
            }
        }

        if (!email) {
            console.error('❌ [EMAIL CONFIRM] Email не найден ни в sessionStorage, ни в модальном окне');
            if (emailConfirmError) {
                emailConfirmError.textContent = 'Ошибка: не удалось определить email. Пожалуйста, зарегистрируйтесь заново.';
                emailConfirmError.style.display = 'block';
            }
            return;
        }

        if (emailConfirmError) {
            emailConfirmError.textContent = '';
            emailConfirmError.style.display = 'none';
        }

        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            console.error('❌ [EMAIL CONFIRM] Supabase клиент не найден');
            if (emailConfirmError) {
                emailConfirmError.textContent = 'Ошибка подключения к базе данных';
                emailConfirmError.style.display = 'block';
            }
            return;
        }

        try {
            console.log('🔄 [EMAIL CONFIRM] Вызов verifyOtp с параметрами:', { email, codeLength: code.length, type: 'signup' });

            const { data: verifyData, error: verifyError } = await supabaseClient.auth.verifyOtp({
                email: email,
                token: code,
                type: 'signup'
            });

            if (verifyError) {
                console.error('❌ [EMAIL CONFIRM] Ошибка verifyOtp:', verifyError);
                console.error('❌ [EMAIL CONFIRM] Детали ошибки:', {
                    message: verifyError.message,
                    status: verifyError.status,
                    name: verifyError.name
                });

                let errorMessage = 'Неверный код подтверждения';
                if (verifyError.message) {
                    const errorMsg = verifyError.message.toLowerCase();
                    if (errorMsg.includes('invalid') || errorMsg.includes('expired')) {
                        errorMessage = 'Код неверный или истек. Запросите новый код.';
                    } else if (errorMsg.includes('token')) {
                        errorMessage = 'Неверный код подтверждения. Проверьте правильность введенного кода.';
                    } else {
                        errorMessage = verifyError.message;
                    }
                }

                if (emailConfirmError) {
                    emailConfirmError.textContent = errorMessage;
                    emailConfirmError.style.display = 'block';
                }
                return;
            }

            console.log('📦 [EMAIL CONFIRM] Ответ verifyOtp:', {
                hasUser: !!verifyData?.user,
                hasSession: !!verifyData?.session,
                userId: verifyData?.user?.id,
                emailConfirmed: verifyData?.user?.email_confirmed_at ? 'да' : 'нет'
            });

            if (!verifyData.user || !verifyData.session) {
                console.error('❌ [EMAIL CONFIRM] Нет пользователя или сессии в ответе');
                if (emailConfirmError) {
                    emailConfirmError.textContent = 'Ошибка подтверждения email: не получены данные пользователя';
                    emailConfirmError.style.display = 'block';
                }
                return;
            }

            console.log('✅ [EMAIL CONFIRM] Email подтвержден успешно!');
            console.log('👤 [EMAIL CONFIRM] Данные пользователя из Supabase:', {
                id: verifyData.user.id,
                email: verifyData.user.email,
                emailConfirmed: verifyData.user.email_confirmed_at ? 'да' : 'нет'
            });

            let username = verifyData.user.email?.split('@')[0] || 'Пользователь';
            let avatar = 'Fons/1 b.jpg';

            try {
                const { data: profile, error: profileError } = await supabaseClient
                    .from('profiles')
                    .select('username, avatar')
                    .eq('id', verifyData.user.id)
                    .single();

                if (profile && !profileError) {
                    username = profile.username || username;
                    avatar = profile.avatar || avatar;
                    console.log('✅ [EMAIL CONFIRM] Профиль найден в базе:', { username, avatar });
                } else {
                    if (userData) {
                        username = userData.username || username;
                        avatar = userData.avatar || avatar;
                    }

                    const { error: upsertError } = await supabaseClient
                        .from('profiles')
                        .upsert({
                            id: verifyData.user.id,
                            username: username,
                            avatar: avatar,
                            gender: userData?.gender || 'male'
                        }, {
                            onConflict: 'id'
                        });

                    if (upsertError) {
                        console.warn('⚠️ [EMAIL CONFIRM] Ошибка создания/обновления профиля:', upsertError);
                    } else {
                        console.log('✅ [EMAIL CONFIRM] Профиль создан/обновлен в базе');
                    }
                }
            } catch (profileErr) {
                console.warn('⚠️ [EMAIL CONFIRM] Ошибка работы с профилем:', profileErr);
                if (userData) {
                    username = userData.username || username;
                    avatar = userData.avatar || avatar;
                }
            }

            const savedUserData = {
                id: verifyData.user.id,
                email: verifyData.user.email,
                username: username,
                avatar: avatar
            };

            console.log('💾 [EMAIL CONFIRM] Сохранение данных пользователя в sessionStorage:', savedUserData);
            sessionStorage.setItem('currentUser', JSON.stringify(savedUserData));
            localStorage.setItem('isAuth', 'true');
            sessionStorage.removeItem('pendingEmailConfirmation');

            if (typeof clearUserCache === 'function') {
                clearUserCache();
            }

            if (emailConfirmModal) emailConfirmModal.classList.remove('active');

            if (typeof showSuccess === 'function') {
                showSuccess('Email подтвержден! Добро пожаловать!');
            } else {
                console.log('✅ Email подтвержден! Добро пожаловать!');
            }

            console.log('🔄 [EMAIL CONFIRM] Обновление состояния авторизации...');

            if (typeof checkAuth === 'function') {
                await checkAuth();
            }

            if (typeof window.reminkoGiveawayAttributeRegistration === 'function') {
                try {
                    await window.reminkoGiveawayAttributeRegistration();
                } catch (_) {
                    /* ignore */
                }
            }

            if (typeof window.navigationManager !== 'undefined' && window.navigationManager.updateAuthLinks) {
                await window.navigationManager.updateAuthLinks();
            }

            console.log('✅ [EMAIL CONFIRM] Регистрация завершена, перезагрузка страницы...');

            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (error) {
            console.error('❌ [EMAIL CONFIRM] Исключение при подтверждении:', error);
            console.error('❌ [EMAIL CONFIRM] Стек ошибки:', error.stack);
            if (emailConfirmError) {
                const errorMessage = error.message || 'Ошибка подтверждения email';
                emailConfirmError.textContent = errorMessage.includes('token')
                    ? 'Неверный код подтверждения'
                    : errorMessage;
                emailConfirmError.style.display = 'block';
            }
        }
    }

    async function handleResendConfirmCode() {
        console.log('🔄 [EMAIL CONFIRM] Запрос повторной отправки кода...');

        let email = null;

        const pendingData = sessionStorage.getItem('pendingEmailConfirmation');
        if (pendingData) {
            try {
                const data = JSON.parse(pendingData);
                email = data.email;
                console.log('✅ [EMAIL CONFIRM] Email из sessionStorage для повторной отправки:', email);
            } catch (e) {
                console.warn('⚠️ [EMAIL CONFIRM] Ошибка парсинга данных:', e);
            }
        }

        if (!email) {
            const confirmEmailAddress = document.getElementById('confirmEmailAddress');
            if (confirmEmailAddress && confirmEmailAddress.textContent) {
                email = confirmEmailAddress.textContent.trim();
                console.log('✅ [EMAIL CONFIRM] Email из модального окна для повторной отправки:', email);
            }
        }

        if (!email) {
            console.error('❌ [EMAIL CONFIRM] Email не найден для повторной отправки');
            if (typeof showError === 'function') {
                showError('Не удалось определить email для повторной отправки кода');
            }
            return;
        }

        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            if (typeof showError === 'function') {
                showError('Ошибка подключения к базе данных');
            }
            return;
        }

        try {
            console.log('🔄 [EMAIL CONFIRM] Повторная отправка кода...');

            const { error: resendError } = await supabaseClient.auth.resend({
                type: 'signup',
                email: email
            });

            if (resendError) {
                console.error('❌ [EMAIL CONFIRM] Ошибка повторной отправки:', resendError);
                if (typeof showError === 'function') {
                    showError(resendError.message || 'Не удалось отправить код повторно');
                }
                return;
            }

            console.log('✅ [EMAIL CONFIRM] Код отправлен повторно');
            if (typeof showSuccess === 'function') {
                showSuccess('Код подтверждения отправлен повторно. Проверьте email.');
            }
        } catch (error) {
            console.error('❌ [EMAIL CONFIRM] Исключение при повторной отправке:', error);
            if (typeof showError === 'function') {
                showError('Ошибка при отправке кода');
            }
        }
    }

    async function handleCancelRegistrationConfirm() {
        const cancelModal = document.getElementById('cancelRegistrationModal');
        const emailConfirmModal = document.getElementById('emailConfirmModal');

        const pendingData = sessionStorage.getItem('pendingEmailConfirmation');
        if (pendingData) {
            try {
                const { email } = JSON.parse(pendingData);

                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    try {
                        const { data: { user } } = await supabaseClient.auth.getUser();
                        if (user && user.email === email) {
                            try {
                                const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(user.id);
                                if (deleteError) {
                                    throw deleteError;
                                }
                                console.log('✅ [EMAIL CONFIRM] Аккаунт удален из базы данных');
                            } catch (adminError) {
                                try {
                                    await supabaseClient
                                        .from('profiles')
                                        .delete()
                                        .eq('id', user.id);

                                    await supabaseClient.auth.signOut();
                                    console.log('✅ [EMAIL CONFIRM] Профиль удален, выход из сессии выполнен');
                                } catch (restError) {
                                    await supabaseClient.auth.signOut();
                                    console.log('⚠️ [EMAIL CONFIRM] Не удалось удалить аккаунт, просто выходим из сессии');
                                }
                            }
                        }
                    } catch (deleteError) {
                        // Игнорируем ошибки удаления
                    }
                }

                sessionStorage.removeItem('pendingEmailConfirmation');
            } catch (e) {
                // Игнорируем ошибки
            }
        }

        if (cancelModal) {
            cancelModal.style.display = 'none';
            cancelModal.classList.remove('active');
        }
        if (emailConfirmModal) {
            emailConfirmModal.classList.remove('active');
        }
    }

    document.addEventListener('click', (e) => {
        if (e.target.closest('#emailConfirmSubmit')) {
            e.preventDefault();
            void handleEmailConfirmSubmit();
            return;
        }

        if (e.target.closest('#resendConfirmCode')) {
            e.preventDefault();
            void handleResendConfirmCode();
            return;
        }

        if (e.target.closest('#closeEmailConfirmModal')) {
            e.preventDefault();
            const cancelModal = document.getElementById('cancelRegistrationModal');
            if (cancelModal) {
                cancelModal.style.display = 'flex';
                cancelModal.classList.add('active');
            }
            return;
        }

        if (e.target.closest('#cancelRegistrationCancel')) {
            e.preventDefault();
            const cancelModal = document.getElementById('cancelRegistrationModal');
            if (cancelModal) {
                cancelModal.style.display = 'none';
                cancelModal.classList.remove('active');
            }
            return;
        }

        if (e.target.closest('#cancelRegistrationConfirm')) {
            e.preventDefault();
            void handleCancelRegistrationConfirm();
        }
    });

    document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'emailConfirmCode') {
            e.target.value = e.target.value.replace(/\D/g, '');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.keyCode !== 13) return;
        const modal = document.getElementById('emailConfirmModal');
        if (!modal || !modal.classList.contains('active')) return;
        if (e.target && e.target.id === 'emailConfirmCode') {
            e.preventDefault();
            void handleEmailConfirmSubmit();
        }
    });
})();

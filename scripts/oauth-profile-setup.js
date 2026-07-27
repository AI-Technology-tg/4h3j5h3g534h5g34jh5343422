/**
 * Завершение регистрации после OAuth (Google и др.):
 * имя (или оставить из аккаунта), аватар, пол.
 */
(function (global) {
    'use strict';

    const AVATARS = [
        'Fons/1 b.jpg',
        'Fons/2 b.jpg',
        'Fons/3 b.jpg',
        'Fons/4 b.jpg',
        'Fons/5 b.jpg',
        'Fons/1 g.jpg',
        'Fons/2 g.jpg',
        'Fons/3 g.jpg',
        'Fons/4 g.jpg',
        'Fons/5 g.jpg'
    ];

    let _busy = false;

    function assetUrl(path) {
        if (!path) return '';
        if (/^https?:\/\//i.test(path) || String(path).startsWith('data:')) return path;
        if (typeof reminkoResolveAssetUrl === 'function') return reminkoResolveAssetUrl(path);
        return '/' + String(path).replace(/^\.\//, '');
    }

    function ensureModal() {
        let modal = document.getElementById('oauthProfileSetupModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'oauthProfileSetupModal';
        modal.className = 'modal oauth-setup-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'oauthSetupTitle');
        modal.innerHTML = `
            <div class="modal-content auth-modal oauth-setup-modal__card">
                <h2 class="modal-title" id="oauthSetupTitle">Завершите регистрацию</h2>
                <p class="oauth-setup-lead">Вы вошли через внешний аккаунт. Выберите имя, аватар и пол — так Minko будет правильно к вам обращаться.</p>
                <div class="login-form">
                    <div class="form-group">
                        <label for="oauthSetupUsername">Имя на сайте</label>
                        <input type="text" id="oauthSetupUsername" maxlength="40" autocomplete="nickname" placeholder="Как вас называть">
                        <label class="oauth-setup-keep">
                            <input type="checkbox" id="oauthSetupKeepName" checked>
                            Оставить имя из аккаунта Google / провайдера
                        </label>
                    </div>
                    <div class="form-group">
                        <span class="form-label">Пол</span>
                        <div class="gender-selection">
                            <label class="gender-label">
                                <input type="radio" name="oauthSetupGender" value="male" class="gender-radio">
                                Мужской
                            </label>
                            <label class="gender-label">
                                <input type="radio" name="oauthSetupGender" value="female" class="gender-radio">
                                Женский
                            </label>
                        </div>
                    </div>
                    <div class="form-group">
                        <span class="form-label">Аватар</span>
                        <div class="oauth-setup-avatars" id="oauthSetupAvatarGrid"></div>
                        <label class="oauth-setup-keep" id="oauthSetupKeepAvatarWrap" hidden>
                            <input type="checkbox" id="oauthSetupKeepAvatar">
                            Оставить фото из Google
                        </label>
                    </div>
                    <div id="oauthSetupError" class="error-message" style="display:none"></div>
                    <button type="button" class="btn btn-primary btn-block" id="oauthSetupSave">Сохранить и продолжить</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#oauthSetupKeepName')?.addEventListener('change', (e) => {
            const input = modal.querySelector('#oauthSetupUsername');
            if (!input) return;
            if (e.target.checked) {
                input.value = input.dataset.providerName || input.value;
                input.readOnly = true;
            } else {
                input.readOnly = false;
                input.focus();
            }
        });

        modal.querySelector('#oauthSetupSave')?.addEventListener('click', () => {
            void saveSetup();
        });

        return modal;
    }

    function renderAvatars(grid, googlePic, selectedPath) {
        if (!grid) return;
        const items = [];
        if (googlePic) {
            items.push({ path: googlePic, isGoogle: true });
        }
        for (const p of AVATARS) items.push({ path: p, isGoogle: false });

        grid.innerHTML = items
            .map((item, index) => {
                const sel =
                    (selectedPath && item.path === selectedPath) ||
                    (!selectedPath && index === 0)
                        ? ' selected'
                        : '';
                const url =
                    typeof window.reminkoSafeCssUrl === 'function'
                        ? window.reminkoSafeCssUrl(assetUrl(item.path))
                        : '';
                const title = item.isGoogle ? 'Фото Google' : item.path;
                return `<button type="button" class="avatar-option-small oauth-setup-avatar${sel}" data-avatar-path="${reminkoEscapeHtml(
                    item.path
                )}" title="${reminkoEscapeHtml(title)}" style="background-image:url('${url}');background-size:cover;background-position:center"></button>`;
            })
            .join('');

        grid.querySelectorAll('.oauth-setup-avatar').forEach((btn) => {
            btn.addEventListener('click', () => {
                grid.querySelectorAll('.oauth-setup-avatar').forEach((b) => b.classList.remove('selected'));
                btn.classList.add('selected');
                const keep = document.getElementById('oauthSetupKeepAvatar');
                if (keep && googlePic) {
                    keep.checked = btn.getAttribute('data-avatar-path') === googlePic;
                }
            });
        });
    }

    function showError(msg) {
        const el = document.getElementById('oauthSetupError');
        if (!el) return;
        el.textContent = msg || '';
        el.style.display = msg ? 'block' : 'none';
    }

    async function saveSetup() {
        if (_busy) return;
        const modal = ensureModal();
        const usernameInput = modal.querySelector('#oauthSetupUsername');
        const keepName = modal.querySelector('#oauthSetupKeepName')?.checked;
        let username = (usernameInput?.value || '').trim();
        if (keepName && usernameInput?.dataset.providerName) {
            username = String(usernameInput.dataset.providerName).trim();
        }
        const gender =
            modal.querySelector('input[name="oauthSetupGender"]:checked')?.value || '';
        const selectedAvatar =
            modal.querySelector('.oauth-setup-avatar.selected')?.getAttribute('data-avatar-path') ||
            '';

        if (username.length < 2) {
            showError('Укажите имя (минимум 2 символа)');
            return;
        }
        if (typeof reminkoValidatePublicUsername === 'function') {
            const check = reminkoValidatePublicUsername(username);
            if (!check.ok) {
                showError(check.message || 'Недопустимое имя');
                return;
            }
        }
        if (gender !== 'male' && gender !== 'female') {
            showError('Выберите пол');
            return;
        }
        if (!selectedAvatar) {
            showError('Выберите аватар');
            return;
        }

        const user =
            typeof getCurrentUser === 'function' ? await getCurrentUser() : getCurrentUserSync?.();
        if (!user?.id || !supabaseClient) {
            showError('Сессия не найдена. Войдите ещё раз.');
            return;
        }

        _busy = true;
        const btn = modal.querySelector('#oauthSetupSave');
        if (btn) btn.disabled = true;
        showError('');

        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({
                    username: username.slice(0, 40),
                    avatar: selectedAvatar,
                    gender,
                    profile_setup_done: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) throw error;

            if (typeof updateUserData === 'function') {
                updateUserData(user.id, {
                    username: username.slice(0, 40),
                    avatar: selectedAvatar,
                    gender
                });
            }

            try {
                const cur = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
                sessionStorage.setItem(
                    'currentUser',
                    JSON.stringify({
                        ...cur,
                        username: username.slice(0, 40),
                        avatar: selectedAvatar,
                        gender,
                        profile_setup_done: true
                    })
                );
            } catch (_) {
                /* ignore */
            }

            if (typeof clearUserCache === 'function') clearUserCache();
            else if (global.currentUserCache !== undefined) {
                global.currentUserCache = null;
            }

            modal.classList.remove('active');
            if (typeof showSuccess === 'function') {
                showSuccess('Профиль сохранён — добро пожаловать!');
            }
            try {
                document.dispatchEvent(new CustomEvent('reminko:oauth-profile-complete'));
            } catch (_) {
                /* ignore */
            }
            if (typeof updateAuthUI === 'function') {
                try {
                    await updateAuthUI();
                } catch (_) {
                    /* ignore */
                }
            }
        } catch (e) {
            console.warn('[oauth-setup]', e);
            showError(e?.message || 'Не удалось сохранить. Попробуйте ещё раз.');
        } finally {
            _busy = false;
            if (btn) btn.disabled = false;
        }
    }

    /**
     * @param {{ username?: string, avatar?: string, googleAvatar?: string, gender?: string }} prefill
     */
    function reminkoOpenOAuthProfileSetup(prefill) {
        const modal = ensureModal();
        const p = prefill || {};
        const providerName = String(p.username || '').trim().slice(0, 40);
        const googlePic = String(p.googleAvatar || p.avatar || '').trim();
        const inferred =
            (typeof reminkoNormalizeGender === 'function'
                ? reminkoNormalizeGender(p.gender)
                : null) ||
            (typeof reminkoInferGenderFromName === 'function'
                ? reminkoInferGenderFromName(providerName)
                : null);

        const nameInput = modal.querySelector('#oauthSetupUsername');
        const keepName = modal.querySelector('#oauthSetupKeepName');
        if (nameInput) {
            nameInput.dataset.providerName = providerName;
            nameInput.value = providerName;
            nameInput.readOnly = true;
        }
        if (keepName) keepName.checked = true;

        modal.querySelectorAll('input[name="oauthSetupGender"]').forEach((r) => {
            r.checked = inferred ? r.value === inferred : false;
        });

        const keepAvWrap = modal.querySelector('#oauthSetupKeepAvatarWrap');
        const keepAv = modal.querySelector('#oauthSetupKeepAvatar');
        if (keepAvWrap) keepAvWrap.hidden = !googlePic;
        if (keepAv) keepAv.checked = !!googlePic;

        renderAvatars(
            modal.querySelector('#oauthSetupAvatarGrid'),
            googlePic,
            googlePic || AVATARS[0]
        );

        showError('');
        modal.classList.add('active');
    }

    async function reminkoMaybeOpenOAuthProfileSetup(userId) {
        if (!userId || typeof supabaseClient === 'undefined' || !supabaseClient) return false;
        try {
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('username, avatar, gender, profile_setup_done')
                .eq('id', userId)
                .maybeSingle();
            if (!profile || profile.profile_setup_done !== false) return false;

            let googleAvatar = '';
            try {
                const { data: authData } = await supabaseClient.auth.getUser();
                const meta = authData?.user?.user_metadata || {};
                googleAvatar = meta.avatar_url || meta.picture || meta.picture_url || '';
            } catch (_) {
                /* ignore */
            }

            reminkoOpenOAuthProfileSetup({
                username: profile.username,
                avatar: profile.avatar,
                googleAvatar: googleAvatar || profile.avatar,
                gender: profile.gender
            });
            return true;
        } catch (e) {
            console.warn('[oauth-setup] check', e);
            return false;
        }
    }

    global.reminkoOpenOAuthProfileSetup = reminkoOpenOAuthProfileSetup;
    global.reminkoMaybeOpenOAuthProfileSetup = reminkoMaybeOpenOAuthProfileSetup;

    // Если пользователь обновил страницу до сохранения анкеты
    function bootPendingSetup() {
        setTimeout(async () => {
            try {
                if (typeof getCurrentUser !== 'function') return;
                const u = await getCurrentUser();
                if (!u?.id || u.isAnonymous) return;
                if (u.profile_setup_done === false) {
                    await reminkoMaybeOpenOAuthProfileSetup(u.id);
                }
            } catch (_) {
                /* ignore */
            }
        }, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootPendingSetup);
    } else {
        bootPendingSetup();
    }
})(typeof window !== 'undefined' ? window : globalThis);

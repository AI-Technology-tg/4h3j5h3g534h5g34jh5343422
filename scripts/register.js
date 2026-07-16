// Обработка регистрации пользователя

/**
 * На части страниц (например profile.html) есть пустой #registerForm внутри модалки входа,
 * а реальные поля — в #registerModal от navigation. Берём контейнер, где есть #registerEmail.
 */
function getRegistrationFormRoot() {
    const modal = document.getElementById('registerModal');
    if (modal && modal.querySelector('#registerEmail')) {
        return modal;
    }
    const embedded = document.getElementById('registerForm');
    if (embedded && embedded.querySelector('#registerEmail')) {
        return embedded;
    }
    return modal || embedded || null;
}

window.getRegistrationFormRoot = getRegistrationFormRoot;

let _wtRegisterSubmitBusy = false;
/** Таймаут: иначе при «висящем» signUp кнопка остаётся disabled и кажется, что «ничего не происходит» */
const REGISTER_REQUEST_MS = 55000;

function wtSetRegisterSubmitBusy(busy) {
    _wtRegisterSubmitBusy = !!busy;
    document.querySelectorAll('#registerSubmit').forEach((btn) => {
        btn.disabled = _wtRegisterSubmitBusy;
    });
}

/**
 * Валидация: полный validateRegisterForm с index.html или встроенная (остальные страницы без form-validation.js).
 * Поля всегда ищем внутри root — не document, чтобы не перепутать модалки.
 */
function validateRegisterFields(root, errorDiv) {
    if (typeof validateRegisterForm === 'function') {
        return validateRegisterForm(root);
    }

    const email = root.querySelector('#registerEmail')?.value?.trim() || '';
    const password = root.querySelector('#registerPassword')?.value || '';
    const username = root.querySelector('#registerUsername')?.value?.trim() || '';
    const gender =
        root.querySelector('input[name="registerGender"]:checked')?.value || 'male';

    if (!email || !password || !username) {
        if (errorDiv) {
            errorDiv.textContent = 'Заполните все поля';
            errorDiv.style.display = 'block';
        }
        return { valid: false, data: {} };
    }

    const emailOk =
        typeof isValidEmail === 'function'
            ? isValidEmail(email)
            : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
        if (errorDiv) {
            errorDiv.textContent = 'Некорректный формат email';
            errorDiv.style.display = 'block';
        }
        return { valid: false, data: {} };
    }

    const passOk =
        typeof isValidPassword === 'function' ? isValidPassword(password) : password.length >= 6;
    if (!passOk) {
        if (errorDiv) {
            errorDiv.textContent = 'Пароль должен содержать минимум 6 символов';
            errorDiv.style.display = 'block';
        }
        return { valid: false, data: {} };
    }

    if (username.length < 3) {
        if (errorDiv) {
            errorDiv.textContent = 'Имя пользователя должно содержать минимум 3 символа';
            errorDiv.style.display = 'block';
        }
        return { valid: false, data: {} };
    }

    if (typeof reminkoValidatePublicUsername === 'function') {
        const nameCheck = reminkoValidatePublicUsername(username);
        if (!nameCheck.ok) {
            if (errorDiv) {
                errorDiv.textContent = nameCheck.message || 'Недопустимое имя пользователя';
                errorDiv.style.display = 'block';
            }
            return { valid: false, data: {} };
        }
    }

    if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
    }

    return {
        valid: true,
        data: { email, password, username, gender, avatar: null }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const registerModal = document.getElementById('registerModal');
    if (registerModal) {
        loadAvatarOptions();
    } else {
        const checkModal = setInterval(() => {
            const modal = document.getElementById('registerModal');
            if (modal) {
                loadAvatarOptions();
                clearInterval(checkModal);
            }
        }, 100);
        setTimeout(() => clearInterval(checkModal), 5000);
    }

    // capture: true — срабатываем до всплытия; не используем stopPropagation, чтобы не ломать другие обработчики
    document.addEventListener(
        'click',
        (e) => {
            const registerBtn = e.target.closest('#registerSubmit');
            if (!registerBtn || registerBtn.id !== 'registerSubmit') return;
            e.preventDefault();
            if (registerBtn.disabled || _wtRegisterSubmitBusy) {
                if (_wtRegisterSubmitBusy && typeof showWarning === 'function') {
                    showWarning('Подождите завершения регистрации…');
                }
                return;
            }
            void handleRegistration();
        },
        true
    );
});

function loadAvatarOptions() {
    const grid = document.getElementById('avatarSelectionGrid');
    if (!grid) return;

    const availableAvatars = [
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

    grid.innerHTML = availableAvatars
        .map((avatarPath, index) => {
            const abs =
                typeof reminkoResolveAssetUrl === 'function'
                    ? reminkoResolveAssetUrl(avatarPath)
                    : '/' + String(avatarPath).replace(/^\.\//, '');
            return `
        <div class="avatar-option-small ${index === 0 ? 'selected' : ''}" 
             data-avatar-index="${index}"
             style="background-image: url('${abs.replace(/'/g, "\\'")}'); background-size: cover; background-position: center; background-repeat: no-repeat;"
             onclick="selectRegisterAvatar(${index})">
        </div>
    `;
        })
        .join('');

    sessionStorage.setItem('selectedAvatarIndex', '0');
}

function selectRegisterAvatar(avatarIndex) {
    sessionStorage.setItem('selectedAvatarIndex', avatarIndex.toString());
    document.querySelectorAll('.avatar-option-small').forEach((opt) => {
        opt.classList.remove('selected');
    });
    const selected = document.querySelector(`[data-avatar-index="${avatarIndex}"]`);
    if (selected) {
        selected.classList.add('selected');
    }
}

async function handleRegistration() {
    if (_wtRegisterSubmitBusy) {
        if (typeof showWarning === 'function') {
            showWarning('Регистрация уже выполняется, подождите…');
        }
        return;
    }

    if (typeof logger !== 'undefined') logger.log('🔵 [REGISTER UI] Начало обработки регистрации');

    const registerForm = getRegistrationFormRoot();
    const errorDiv = document.getElementById('registerError');
    if (!registerForm || !registerForm.querySelector('#registerEmail')) {
        console.error('[REGISTER] Контейнер регистрации не найден или поля ещё не в DOM');
        const msg =
            'Форма регистрации недоступна. Откройте окно регистрации ещё раз или обновите страницу.';
        if (typeof showError === 'function') showError(msg);
        else if (errorDiv) {
            errorDiv.textContent = msg;
            errorDiv.style.display = 'block';
        }
        return;
    }

    const validation = validateRegisterFields(registerForm, errorDiv);
    if (!validation.valid) {
        const hint = errorDiv?.textContent?.trim();
        if (hint && typeof showWarning === 'function') showWarning(hint);
        return;
    }

    const { email, password, username, gender, avatar } = validation.data;

    const avatarIndex = parseInt(sessionStorage.getItem('selectedAvatarIndex') || '0', 10);
    const availableAvatars = [
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
    const selectedAvatar = avatar || availableAvatars[avatarIndex] || availableAvatars[0];

    if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
    }

    wtSetRegisterSubmitBusy(true);
    let result = null;
    try {
        result = await Promise.race([
            registerUser(email, password, username, selectedAvatar, gender),
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(Object.assign(new Error('__REG_TIMEOUT__'), { name: 'RegisterTimeout' }));
                }, REGISTER_REQUEST_MS);
            })
        ]);
    } catch (err) {
        const msg =
            err && err.message === '__REG_TIMEOUT__'
                ? 'Сервер не ответил вовремя. Кнопка снова активна — проверьте интернет и нажмите «Зарегистрироваться» один раз через минуту.'
                : err?.message || 'Ошибка регистрации';
        if (errorDiv) {
            errorDiv.textContent = msg;
            errorDiv.style.display = 'block';
        }
        if (typeof showError === 'function') showError(msg);
        console.error('[REGISTER]', err);
        return;
    } finally {
        wtSetRegisterSubmitBusy(false);
    }

    if (!result) return;

    if (result.success) {
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }

        if (typeof showSuccess === 'function' && result.message) {
            showSuccess(result.message);
        }

        if (result.needsEmailConfirmation) {
            if (window.navigationManager && typeof window.navigationManager.ensureModalsExist === 'function') {
                window.navigationManager.ensureModalsExist();
            }
            await new Promise((r) => setTimeout(r, 100));

            const registerModal = document.getElementById('registerModal');
            if (registerModal) registerModal.classList.remove('active');

            const emailConfirmModal = document.getElementById('emailConfirmModal');
            if (emailConfirmModal) {
                const emailAddress = document.getElementById('confirmEmailAddress');
                if (emailAddress) emailAddress.textContent = result.email || email;
                emailConfirmModal.classList.add('active');
            }

            try {
                sessionStorage.setItem(
                    'pendingEmailConfirmation',
                    JSON.stringify({
                        email,
                        password,
                        username,
                        avatar: selectedAvatar,
                        gender
                    })
                );
            } catch (storageError) {
                console.error('[REGISTER UI] sessionStorage:', storageError);
            }

            if (!emailConfirmModal && typeof showInfo === 'function') {
                showInfo((result.message || '') + ' Проверьте почту для подтверждения.');
            }
            return;
        }

        const registerModal = document.getElementById('registerModal');
        if (registerModal) registerModal.classList.remove('active');

        if (registerForm && typeof registerForm.reset === 'function') registerForm.reset();
        if (registerForm && typeof hideFieldError === 'function') {
            registerForm.querySelectorAll('input').forEach((input) => hideFieldError(input));
        }

        const registerEmailEl = registerForm.querySelector('#registerEmail');
        const registerPasswordEl = registerForm.querySelector('#registerPassword');
        const registerUsernameEl = registerForm.querySelector('#registerUsername');
        if (registerEmailEl) registerEmailEl.value = '';
        if (registerPasswordEl) registerPasswordEl.value = '';
        if (registerUsernameEl) registerUsernameEl.value = '';

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
        if (window.navigationManager && typeof window.navigationManager.updateAuthLinks === 'function') {
            await window.navigationManager.updateAuthLinks();
        }

        setTimeout(() => {
            window.location.reload();
        }, 400);
        return;
    }

    if (errorDiv) {
        errorDiv.textContent = result.message || 'Ошибка регистрации';
        errorDiv.style.display = 'block';
    }
    if (typeof showError === 'function' && result.message) {
        showError(result.message);
    }
}

window.selectRegisterAvatar = selectRegisterAvatar;
window.handleRegistration = handleRegistration;

// Утилиты для валидации форм

/**
 * Валидация email
 * @param {string} email - Email для проверки
 * @returns {Object} { valid: boolean, message: string }
 */
function validateEmail(email) {
    if (!email || !email.trim()) {
        return { valid: false, message: 'Email обязателен для заполнения' };
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
        return { valid: false, message: 'Некорректный формат email' };
    }
    
    return { valid: true, message: '' };
}

/**
 * Валидация пароля
 * @param {string} password - Пароль для проверки
 * @param {number} minLength - Минимальная длина (по умолчанию 6)
 * @returns {Object} { valid: boolean, message: string }
 */
function validatePassword(password, minLength = 6) {
    if (!password) {
        return { valid: false, message: 'Пароль обязателен для заполнения' };
    }
    
    if (password.length < minLength) {
        return { valid: false, message: `Пароль должен содержать минимум ${minLength} символов` };
    }
    
    return { valid: true, message: '' };
}

/**
 * Валидация имени пользователя
 * @param {string} username - Имя пользователя для проверки
 * @param {number} minLength - Минимальная длина (по умолчанию 3)
 * @param {number} maxLength - Максимальная длина (по умолчанию 30)
 * @returns {Object} { valid: boolean, message: string }
 */
function validateUsername(username, minLength = 3, maxLength = 30) {
    if (!username || !username.trim()) {
        return { valid: false, message: 'Имя пользователя обязательно для заполнения' };
    }
    
    const trimmed = username.trim();
    
    if (trimmed.length < minLength) {
        return { valid: false, message: `Имя пользователя должно содержать минимум ${minLength} символа` };
    }
    
    if (trimmed.length > maxLength) {
        return { valid: false, message: `Имя пользователя не должно превышать ${maxLength} символов` };
    }
    
    // Проверка на недопустимые символы
    const invalidChars = /[<>\"'&]/;
    if (invalidChars.test(trimmed)) {
        return { valid: false, message: 'Имя пользователя содержит недопустимые символы' };
    }

    if (typeof reminkoValidatePublicUsername === 'function') {
        const reserved = reminkoValidatePublicUsername(trimmed);
        if (!reserved.ok) {
            return { valid: false, message: reserved.message || 'Недопустимое имя пользователя' };
        }
    }
    
    return { valid: true, message: '' };
}

/**
 * Валидация кода подтверждения
 * @param {string} code - Код для проверки
 * @param {number} minLength - Минимальная длина (по умолчанию 6)
 * @param {number} maxLength - Максимальная длина (по умолчанию 8)
 * @returns {Object} { valid: boolean, message: string }
 */
function validateConfirmationCode(code, minLength = 6, maxLength = 8) {
    if (!code || !code.trim()) {
        return { valid: false, message: 'Код подтверждения обязателен для заполнения' };
    }
    
    const trimmed = code.trim();
    
    if (trimmed.length < minLength || trimmed.length > maxLength) {
        return { valid: false, message: `Код должен содержать от ${minLength} до ${maxLength} цифр` };
    }
    
    if (!/^\d+$/.test(trimmed)) {
        return { valid: false, message: 'Код должен содержать только цифры' };
    }
    
    return { valid: true, message: '' };
}

/**
 * Показать ошибку валидации для поля
 * @param {HTMLElement} input - Поле ввода
 * @param {string} message - Сообщение об ошибке
 */
function showFieldError(input, message) {
    if (!input) return;
    
    // Убираем предыдущие ошибки
    hideFieldError(input);
    
    // Добавляем класс ошибки
    input.classList.add('error');
    
    // Создаем элемент с ошибкой
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.textContent = message;
    errorElement.style.cssText = 'color: var(--error-color, #ef4444); font-size: 0.85em; margin-top: 0.25rem;';
    
    // Вставляем после поля
    input.parentNode.insertBefore(errorElement, input.nextSibling);
}

/**
 * Скрыть ошибку валидации для поля
 * @param {HTMLElement} input - Поле ввода
 */
function hideFieldError(input) {
    if (!input) return;
    
    input.classList.remove('error');
    
    // Удаляем элемент с ошибкой
    const errorElement = input.parentNode.querySelector('.field-error');
    if (errorElement) {
        errorElement.remove();
    }
}

/**
 * Валидация формы входа
 * @param {HTMLFormElement} form - Форма входа
 * @returns {Object} { valid: boolean, data: Object }
 */
function validateLoginForm(form) {
    const email = form.querySelector('#loginEmail')?.value?.trim() || '';
    const password = form.querySelector('#loginPassword')?.value || '';
    
    let isValid = true;
    
    // Валидация email
    const emailValidation = validateEmail(email);
    const emailInput = form.querySelector('#loginEmail');
    if (emailValidation.valid) {
        hideFieldError(emailInput);
    } else {
        showFieldError(emailInput, emailValidation.message);
        isValid = false;
    }
    
    // Валидация пароля
    const passwordValidation = validatePassword(password);
    const passwordInput = form.querySelector('#loginPassword');
    if (passwordValidation.valid) {
        hideFieldError(passwordInput);
    } else {
        showFieldError(passwordInput, passwordValidation.message);
        isValid = false;
    }
    
    // Валидация кодов создателя удалена - роль определяется из базы данных
    
    return {
        valid: isValid,
        data: {
            email: email,
            password: password
        }
    };
}

/**
 * Валидация формы регистрации
 * @param {HTMLFormElement} form - Форма регистрации
 * @returns {Object} { valid: boolean, data: Object }
 */
function validateRegisterForm(form) {
    if (!form) {
        form =
            typeof window.getRegistrationFormRoot === 'function'
                ? window.getRegistrationFormRoot()
                : null;
    }
    if (!form) form = document.getElementById('registerModal') || document;
    const email = form.querySelector('#registerEmail')?.value?.trim() || '';
    const password = form.querySelector('#registerPassword')?.value || '';
    const username = form.querySelector('#registerUsername')?.value?.trim() || '';
    const gender = form.querySelector('input[name="registerGender"]:checked')?.value || 'male';
    const selectedAvatar = form.querySelector('.avatar-option.selected')?.dataset.avatar || null;
    
    let isValid = true;
    
    // Валидация email
    const emailValidation = validateEmail(email);
    const emailInput = form.querySelector('#registerEmail');
    if (emailValidation.valid) {
        hideFieldError(emailInput);
    } else {
        showFieldError(emailInput, emailValidation.message);
        isValid = false;
    }
    
    // Валидация пароля
    const passwordValidation = validatePassword(password);
    const passwordInput = form.querySelector('#registerPassword');
    if (passwordValidation.valid) {
        hideFieldError(passwordInput);
    } else {
        showFieldError(passwordInput, passwordValidation.message);
        isValid = false;
    }
    
    // Валидация имени пользователя
    const usernameValidation = validateUsername(username);
    const usernameInput = form.querySelector('#registerUsername');
    if (usernameValidation.valid) {
        hideFieldError(usernameInput);
    } else {
        showFieldError(usernameInput, usernameValidation.message);
        isValid = false;
    }
    
    return {
        valid: isValid,
        data: {
            email: email,
            password: password,
            username: username,
            gender: gender,
            avatar: selectedAvatar
        }
    };
}

/**
 * Валидация формы восстановления пароля
 * @param {HTMLFormElement} form - Форма восстановления пароля
 * @returns {Object} { valid: boolean, data: Object }
 */
function validatePasswordResetForm(form) {
    const email = form.querySelector('#passwordResetEmail')?.value?.trim() || '';
    
    const emailValidation = validateEmail(email);
    const emailInput = form.querySelector('#passwordResetEmail');
    
    if (emailValidation.valid) {
        hideFieldError(emailInput);
        return {
            valid: true,
            data: { email: email }
        };
    } else {
        showFieldError(emailInput, emailValidation.message);
        return {
            valid: false,
            data: { email: email }
        };
    }
}

/**
 * Валидация формы подтверждения email
 * @param {HTMLFormElement} form - Форма подтверждения email
 * @returns {Object} { valid: boolean, data: Object }
 */
function validateEmailConfirmForm(form) {
    const code = form.querySelector('#emailConfirmCode')?.value?.trim() || '';
    
    const codeValidation = validateConfirmationCode(code);
    const codeInput = form.querySelector('#emailConfirmCode');
    
    if (codeValidation.valid) {
        hideFieldError(codeInput);
        return {
            valid: true,
            data: { code: code }
        };
    } else {
        showFieldError(codeInput, codeValidation.message);
        return {
            valid: false,
            data: { code: code }
        };
    }
}

// Экспортируем функции
window.validateEmail = validateEmail;
window.validatePassword = validatePassword;
window.validateUsername = validateUsername;
window.validateConfirmationCode = validateConfirmationCode;
window.showFieldError = showFieldError;
window.hideFieldError = hideFieldError;
window.validateLoginForm = validateLoginForm;
window.validateRegisterForm = validateRegisterForm;
window.validatePasswordResetForm = validatePasswordResetForm;
window.validateEmailConfirmForm = validateEmailConfirmForm;

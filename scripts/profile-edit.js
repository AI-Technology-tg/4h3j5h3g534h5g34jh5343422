// Редактирование профиля

let editMode = false;

async function editProfile() {
    if (editMode) return;
    const user = await getCurrentUser();
    if (!user) return;
    editMode = true;

    const userData = getUserData(user.id) || {};
    const currentName = userData.username || user.username || user.email?.split('@')[0] || 'Пользователь';

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.setAttribute('id', 'editProfileNameModal');
    modal.innerHTML = `
        <div class="modal-content auth-modal">
            <span class="close" data-edit-profile-close>&times;</span>
            <h2 class="modal-title">Редактирование имени</h2>
            <div class="login-form">
                <div class="form-group">
                    <label for="editProfileNameInput">Имя пользователя</label>
                    <input type="text" id="editProfileNameInput" maxlength="40" autocomplete="username">
                </div>
                <div id="editProfileNameError" class="error-message" style="display:none;"></div>
                <button type="button" class="btn btn-primary btn-block" id="editProfileNameSave">Сохранить</button>
                <button type="button" class="btn btn-secondary btn-block" data-edit-profile-close style="margin-top:0.5rem">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const inp = modal.querySelector('#editProfileNameInput');
    if (inp) inp.value = currentName;

    const close = () => {
        modal.remove();
        editMode = false;
    };

    modal.querySelectorAll('[data-edit-profile-close]').forEach((el) => {
        el.addEventListener('click', close);
    });

    const errEl = modal.querySelector('#editProfileNameError');

    modal.querySelector('#editProfileNameSave').addEventListener('click', async () => {
        const username = (inp && inp.value ? inp.value : '').trim();
        if (!username || username.length < 3) {
            if (errEl) {
                errEl.textContent = 'Имя пользователя должно содержать минимум 3 символа';
                errEl.style.display = 'block';
            } else if (typeof showError === 'function') {
                showError('Имя пользователя должно содержать минимум 3 символа');
            }
            return;
        }
        const allowStaff =
            typeof window.reminkoIsUserSiteCreator === 'function' && (await window.reminkoIsUserSiteCreator());
        if (typeof reminkoValidatePublicUsername === 'function') {
            const nameCheck = reminkoValidatePublicUsername(username, { allowStaff });
            if (!nameCheck.ok) {
                if (errEl) {
                    errEl.textContent = nameCheck.message || 'Недопустимое имя';
                    errEl.style.display = 'block';
                } else if (typeof showError === 'function') {
                    showError(nameCheck.message || 'Недопустимое имя');
                }
                return;
            }
        }
        if (errEl) errEl.style.display = 'none';

        try {
            const userId = user.id;
            const isUUIDFormat =
                userId &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    userId.toString()
                );

            if (isUUIDFormat && supabaseClient) {
                const { error } = await supabaseClient
                    .from('profiles')
                    .update({ username })
                    .eq('id', userId);
                if (error) throw error;
            } else {
                const users = JSON.parse(localStorage.getItem('users') || '[]');
                const userIndex = users.findIndex((u) => u.id === user.id);
                if (userIndex === -1) throw new Error('Пользователь не найден');
                users[userIndex].username = username;
                localStorage.setItem('users', JSON.stringify(users));
                const updatedUser = {
                    id: user.id,
                    email: users[userIndex].email,
                    username,
                    avatar: users[userIndex].avatar
                };
                sessionStorage.setItem('currentUser', JSON.stringify(updatedUser));
            }

            updateUserData(userId, { username });
            if (typeof showSuccess === 'function') showSuccess('Имя успешно изменено');
            close();
            if (typeof loadProfile === 'function') {
                loadProfile();
            } else {
                window.location.reload();
            }
        } catch (error) {
            console.error('Ошибка обновления имени:', error);
            const msg = 'Ошибка обновления имени: ' + (error?.message || 'Неизвестная ошибка');
            if (errEl) {
                errEl.textContent = msg;
                errEl.style.display = 'block';
            } else if (typeof showError === 'function') {
                showError(msg);
            }
        }
    });
}

async function saveProfileChanges() {
    const user = await getCurrentUser();
    if (!user) return;
    
    const username = document.getElementById('editUsername').value.trim();
    
    if (!username || username.length < 3) {
        if (typeof showError === 'function') {
            showError('Имя пользователя должно содержать минимум 3 символа');
        } else {
            alert('Имя пользователя должно содержать минимум 3 символа');
        }
        return;
    }

    const allowStaff =
        typeof window.reminkoIsUserSiteCreator === 'function' && (await window.reminkoIsUserSiteCreator());
    if (typeof reminkoValidatePublicUsername === 'function') {
        const nameCheck = reminkoValidatePublicUsername(username, { allowStaff });
        if (!nameCheck.ok) {
            if (typeof showError === 'function') {
                showError(nameCheck.message || 'Недопустимое имя');
            } else {
                alert(nameCheck.message || 'Недопустимое имя');
            }
            return;
        }
    }
    
    const userId = user.id;
    const isUUIDFormat = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId.toString());
    
    if (isUUIDFormat && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ username: username })
                .eq('id', userId);
            
            if (error) throw error;
            
            const userData = getUserData(userId);
            if (userData) {
                userData.username = username;
                updateUserData(userId, { username: username });
            }
            
            editMode = false;
            if (typeof showSuccess === 'function') {
                showSuccess('Имя успешно изменено');
            }
            if (typeof loadProfile === 'function') {
                loadProfile();
            } else {
                window.location.reload();
            }
        } catch (error) {
            console.error('Ошибка обновления имени:', error);
            if (typeof showError === 'function') {
                showError('Ошибка обновления имени: ' + error.message);
            } else {
                alert('Ошибка обновления имени');
            }
        }
    } else {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const userIndex = users.findIndex(u => u.id === user.id);
        
        if (userIndex === -1) return;
        
        users[userIndex].username = username;
        localStorage.setItem('users', JSON.stringify(users));
        
        const updatedUser = {
            id: user.id,
            email: users[userIndex].email,
            username: username,
            avatar: users[userIndex].avatar
        };
        sessionStorage.setItem('currentUser', JSON.stringify(updatedUser));
        
        editMode = false;
        if (typeof loadProfile === 'function') {
            loadProfile();
        } else {
            window.location.reload();
        }
    }
}

function cancelProfileEdit() {
    editMode = false;
    if (typeof loadProfile === 'function') {
        loadProfile();
    } else {
        window.location.reload();
    }
}

async function changePassword() {
    const user = await getCurrentUser();
    if (!user) return;
    
    const userId = user.id;
    const isUUIDFormat = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId.toString());
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content auth-modal">
            <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            <h2 class="modal-title">Изменение пароля</h2>
            <div class="login-form" id="passwordChangeForm">
                ${!isUUIDFormat ? `
                <div class="form-group" id="oldPasswordGroup">
                    <label for="oldPassword">Текущий пароль:</label>
                    <input type="password" id="oldPassword" placeholder="Введите текущий пароль" required autocomplete="current-password">
                </div>
                ` : ''}
                <div class="form-group">
                    <label for="newPassword">Новый пароль:</label>
                    <input type="password" id="newPassword" placeholder="Минимум 6 символов" required autocomplete="new-password">
                </div>
                <div class="form-group">
                    <label for="confirmPassword">Подтвердите новый пароль:</label>
                    <input type="password" id="confirmPassword" placeholder="Повторите новый пароль" required autocomplete="new-password">
                </div>
                <div id="passwordError" class="error-message"></div>
                <button class="btn btn-primary btn-block" onclick="savePasswordChange(this)">Изменить пароль</button>
                <button class="btn btn-secondary btn-block" onclick="this.closest('.modal').remove()" style="margin-top: 0.5rem;">Отмена</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function savePasswordChange(button) {
    const user = await getCurrentUser();
    if (!user) return;
    
    const oldPasswordInput = document.getElementById('oldPassword');
    const oldPassword = oldPasswordInput ? oldPasswordInput.value : '';
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('passwordError');
    
    if (errorDiv) errorDiv.style.display = 'none';
    
    if (newPassword.length < 6) {
        if (errorDiv) {
            errorDiv.textContent = 'Новый пароль должен содержать минимум 6 символов';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    if (newPassword !== confirmPassword) {
        if (errorDiv) {
            errorDiv.textContent = 'Пароли не совпадают';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    const userId = user.id;
    const isUUIDFormat = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId.toString());
    
    if (isUUIDFormat && supabaseClient) {
        try {
            const { error } = await supabaseClient.auth.updateUser({
                password: newPassword
            });
            
            if (error) throw error;
            
            if (typeof showSuccess === 'function') {
                showSuccess('Пароль успешно изменён');
            } else {
                alert('Пароль успешно изменён');
            }
            button.closest('.modal').remove();
        } catch (error) {
            console.error('Ошибка изменения пароля:', error);
            if (errorDiv) {
                errorDiv.textContent = 'Ошибка изменения пароля: ' + (error.message || 'Неизвестная ошибка');
                errorDiv.style.display = 'block';
            }
        }
    } else {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const userData = users.find(u => u.id === user.id);
        
        if (!userData) {
            if (errorDiv) {
                errorDiv.textContent = 'Пользователь не найден';
                errorDiv.style.display = 'block';
            }
            return;
        }
        
        if (!oldPassword || userData.password !== oldPassword) {
            if (errorDiv) {
                errorDiv.textContent = 'Неверный текущий пароль';
                errorDiv.style.display = 'block';
            }
            return;
        }
        
        userData.password = newPassword;
        localStorage.setItem('users', JSON.stringify(users));
        
        if (typeof showSuccess === 'function') {
            showSuccess('Пароль успешно изменён');
        } else {
            alert('Пароль успешно изменён');
        }
        button.closest('.modal').remove();
    }
}

window.editProfile = editProfile;
window.saveProfileChanges = saveProfileChanges;
window.cancelProfileEdit = cancelProfileEdit;
window.changePassword = changePassword;
window.savePasswordChange = savePasswordChange;

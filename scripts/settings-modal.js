// Модальное окно настроек сайта

function syncAdultGenresToggle() {
    const t = document.getElementById('settingsAdultGenresToggle');
    if (!t) return;
    t.checked =
        typeof isAdultContentEnabled === 'function' && isAdultContentEnabled();
}

function onAdultGenresSettingChange(checked) {
    if (!checked) {
        if (typeof reminkoClearAdultUnlock === 'function') reminkoClearAdultUnlock();
        if (typeof showSuccess === 'function') {
            showSuccess('Жанры 18+ скрыты');
        }
        return;
    }
    if (typeof isAdultContentEnabled === 'function' && isAdultContentEnabled()) {
        return;
    }
    const t = document.getElementById('settingsAdultGenresToggle');
    if (t) t.checked = false;
    if (typeof openAdultUnlockModal === 'function') {
        openAdultUnlockModal();
    }
}

function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    
    const user = getCurrentUserSync();
    if (!user) return;

    const userData =
        typeof ensureUserDataRecord === 'function'
            ? ensureUserDataRecord(user.id)
            : getUserData(user.id);
    if (!userData) return;
    
    const settings = userData.settings || {
        adsEnabled: true,
        notificationsEnabled: true,
        showRecommendations: true,
        theme: 'dark'
    };
    
    const adsToggle = document.getElementById('settingsAdsToggle');
    const notificationsToggle = document.getElementById('settingsNotificationsToggle');
    const recommendationsToggle = document.getElementById('settingsRecommendationsToggle');
    
    if (adsToggle) adsToggle.checked = settings.adsEnabled !== false;
    if (notificationsToggle) {
        const prefs =
            typeof reminkoGetNotificationPrefs === 'function'
                ? reminkoGetNotificationPrefs()
                : null;
        notificationsToggle.checked =
            prefs != null ? prefs.toastSite !== false : settings.notificationsEnabled !== false;
    }
    if (recommendationsToggle) recommendationsToggle.checked = settings.showRecommendations !== false;

    syncAdultGenresToggle();
    
    modal.classList.add('active');
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function saveSettingLocal(key, value) {
    const user = getCurrentUserSync();
    if (!user) return;

    const userData =
        typeof ensureUserDataRecord === 'function'
            ? ensureUserDataRecord(user.id)
            : getUserData(user.id);
    if (!userData) return;
    
    if (!userData.settings) {
        userData.settings = {};
    }
    
    userData.settings[key] = value;
    updateUserData(user.id, { settings: userData.settings });
}

function toggleAdsSetting(enabled) {
    if (typeof saveSetting === 'function') {
        saveSetting('adsEnabled', enabled, { silent: true });
    } else {
        saveSettingLocal('adsEnabled', enabled);
    }
    if (typeof showSuccess === 'function') {
        showSuccess(enabled ? 'Реклама включена. Спасибо за поддержку проекта!' : 'Реклама отключена');
    }
}

function toggleNotificationsSetting(enabled) {
    if (typeof reminkoGetNotificationPrefs === 'function' && typeof reminkoSaveNotificationPrefs === 'function') {
        const prefs = reminkoGetNotificationPrefs();
        prefs.toastSite = enabled;
        if (!enabled) prefs.sound = false;
        reminkoSaveNotificationPrefs(prefs, { silent: true });
    }
    if (typeof saveSetting === 'function') {
        saveSetting('notificationsEnabled', enabled, { silent: true });
    } else {
        saveSettingLocal('notificationsEnabled', enabled);
    }
    if (typeof showSuccess === 'function') {
        showSuccess(enabled ? 'Уведомления включены' : 'Уведомления отключены');
    }
}

function toggleRecommendationsSetting(enabled) {
    if (typeof saveSetting === 'function') {
        saveSetting('showRecommendations', enabled, { silent: true });
    } else {
        saveSettingLocal('showRecommendations', enabled);
    }
    if (typeof showSuccess === 'function') {
        showSuccess(enabled ? 'Рекомендации включены' : 'Рекомендации отключены');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    
    const closeBtn = modal.querySelector('.close-settings');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettingsModal);
    }

    const logoutBtn = document.getElementById('settingsLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (typeof logoutUser !== 'function') return;
            try {
                await logoutUser();
            } catch (_) {
                /* ignore */
            }
            closeSettingsModal();
            window.location.reload();
        });
    }
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeSettingsModal();
        }
    });
});

window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.toggleAdsSetting = toggleAdsSetting;
window.toggleNotificationsSetting = toggleNotificationsSetting;
window.toggleRecommendationsSetting = toggleRecommendationsSetting;
window.onAdultGenresSettingChange = onAdultGenresSettingChange;
window.syncAdultGenresToggle = syncAdultGenresToggle;

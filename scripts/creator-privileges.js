/**
 * Единая учётная запись создателя сайта (доступ к панели и вечные услуги).
 * Email задаётся здесь и дублируется проверках навигации/админки.
 */
(function (global) {
    const SITE_CREATOR_EMAIL = 'creator@reminko.com';

    function normalizeEmail(email) {
        return email ? String(email).trim().toLowerCase() : '';
    }

    function isSiteCreatorEmail(email) {
        return normalizeEmail(email) === SITE_CREATOR_EMAIL;
    }

    /**
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    async function userIdIsSiteCreator(userId) {
        if (!userId) return false;
        if (
            typeof global.reminkoUserIdIsSiteCreatorSync === 'function' &&
            global.reminkoUserIdIsSiteCreatorSync(userId)
        ) {
            return true;
        }
        if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
        try {
            const { data, error } = await supabaseClient.rpc('is_site_creator_user_id', {
                user_id: userId
            });
            if (!error && data === true) return true;
            if (!error && data === false) {
                // UUID канонический уже проверен выше; false от RPC не отменяет sync-хит
                return false;
            }
            const { data: email, error: e2 } = await supabaseClient.rpc('get_user_email', {
                user_id: userId
            });
            if (e2 || email == null) return false;
            return isSiteCreatorEmail(email);
        } catch {
            return false;
        }
    }

    global.SITE_CREATOR_EMAIL = SITE_CREATOR_EMAIL;
    global.isSiteCreatorEmail = isSiteCreatorEmail;
    global.userIdIsSiteCreator = userIdIsSiteCreator;
})(window);

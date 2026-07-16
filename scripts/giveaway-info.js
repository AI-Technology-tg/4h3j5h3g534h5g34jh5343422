(function () {
    'use strict';

    /** 18 июля 2026 00:00 UTC+2 → +14 суток → 31 июля 2026 23:59:59 UTC+2 */
    var GIVEAWAY_START_ISO = '2026-07-17T22:00:00.000Z';
    var GIVEAWAY_END_ISO = '2026-07-31T21:59:59.000Z';
    var GIVEAWAY_TG_URL = 'https://telegram.me/re_minko';
    var GIVEAWAY_TZ = 'Europe/Kyiv';

    function $(id) {
        return document.getElementById(id);
    }

    function isGiveawayStarted() {
        var start = Date.parse(GIVEAWAY_START_ISO);
        return !Number.isNaN(start) && Date.now() >= start;
    }

    function isGiveawayEnded() {
        var end = Date.parse(GIVEAWAY_END_ISO);
        return !Number.isNaN(end) && Date.now() >= end;
    }

    function isGiveawayActive() {
        return isGiveawayStarted() && !isGiveawayEnded();
    }

    function formatGiveawayDate(iso, fallback) {
        try {
            return new Date(iso).toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: GIVEAWAY_TZ
            });
        } catch (_) {
            return fallback || '—';
        }
    }

    function formatGiveawayStartDate() {
        return formatGiveawayDate(GIVEAWAY_START_ISO, '18 июля 2026, 00:00');
    }

    function formatGiveawayEndDate() {
        return formatGiveawayDate(GIVEAWAY_END_ISO, '31 июля 2026, 23:59');
    }

    function getCountdownTarget() {
        if (isGiveawayEnded()) return { mode: 'ended', iso: null };
        if (!isGiveawayStarted()) return { mode: 'start', iso: GIVEAWAY_START_ISO };
        return { mode: 'end', iso: GIVEAWAY_END_ISO };
    }

    function applyGiveawayPhaseUi() {
        var ended = isGiveawayEnded();
        var started = isGiveawayStarted();
        var active = isGiveawayActive();
        var endedNote = $('giveawayEndedNote');
        var notStartedNote = $('giveawayNotStartedNote');
        var countdown = $('giveawayCountdownInner');
        var joinBtn = $('giveawayJoinBtn');
        var joinBlock = $('giveawayJoinBlock');
        var joinForm = $('giveawayJoinForm');
        var confirmBtn = $('giveawayJoinConfirmBtn');
        var cancelBtn = $('giveawayJoinCancelBtn');
        var kicker = $('giveawayTimerKicker');

        if (endedNote) endedNote.hidden = !ended;
        if (notStartedNote) notStartedNote.hidden = started || ended;
        if (countdown) countdown.hidden = ended;

        if (joinBlock) {
            joinBlock.classList.toggle('is-active-phase', active);
        }

        if (kicker) {
            if (ended) kicker.textContent = 'Конкурс завершён';
            else if (!started) kicker.textContent = 'Обратный отсчёт · до старта';
            else kicker.textContent = 'Обратный отсчёт · до финиша';
        }

        if (joinBtn) {
            joinBtn.disabled = !active;
            joinBtn.hidden = false;
            if (ended) joinBtn.title = 'Конкурс завершён';
            else if (!started) joinBtn.title = 'Участие откроется 18 июля 2026';
            else joinBtn.title = '';
        }

        if (!active) {
            hideJoinForm();
        }

        if (joinForm) {
            joinForm.querySelectorAll('input, button').forEach(function (el) {
                if (el.id === 'giveawayJoinConfirmBtn' || el.id === 'giveawayJoinCancelBtn') {
                    el.disabled = !active;
                } else if (el.type === 'text' || el.type === 'radio') {
                    el.disabled = !active;
                }
            });
        }
        if (confirmBtn) confirmBtn.disabled = !active;
        if (cancelBtn) cancelBtn.disabled = !active;
    }

    function ruUnit(n, one, few, many) {
        if (typeof reminkoRuUnit === 'function') return reminkoRuUnit(n, one, few, many);
        return many;
    }

    function countdownParts(diffMs) {
        if (typeof reminkoCountdownParts === 'function') return reminkoCountdownParts(diffMs);
        if (diffMs <= 0) return null;
        var s = Math.floor(diffMs / 1000);
        var secs = s % 60;
        s = Math.floor(s / 60);
        var mins = s % 60;
        s = Math.floor(s / 60);
        var hours = s % 24;
        var days = Math.floor(s / 24);
        return { days: days, hours: hours, mins: mins, secs: secs };
    }

    function renderGiveawayCountdownHtml(parts) {
        if (!parts) {
            return '<div class="info-giveaway-cd-ended">Конкурс завершён</div>';
        }
        var cells = [
            { val: parts.days, one: 'день', few: 'дня', many: 'дней' },
            { val: parts.hours, one: 'час', few: 'часа', many: 'часов' },
            { val: parts.mins, one: 'мин', few: 'мин', many: 'мин' },
            { val: parts.secs, one: 'сек', few: 'сек', many: 'сек' }
        ];
        return (
            '<div class="info-giveaway-cd-grid">' +
            cells
                .map(function (c) {
                    var pad = c.val >= 100 ? String(c.val) : String(c.val).padStart(2, '0');
                    return (
                        '<div class="info-giveaway-cd-cell">' +
                        '<span class="info-giveaway-cd-num">' +
                        pad +
                        '</span>' +
                        '<span class="info-giveaway-cd-label">' +
                        ruUnit(c.val, c.one, c.few, c.many) +
                        '</span>' +
                        '</div>'
                    );
                })
                .join('') +
            '</div>'
        );
    }

    var _giveawayCountdownTimer = null;
    var _giveawayVisBound = false;

    function tickGiveawayCountdown() {
        var root = $('giveawayCountdownInner');
        if (!root) return;

        var target = getCountdownTarget();
        applyGiveawayPhaseUi();

        if (target.mode === 'ended') {
            root.innerHTML = renderGiveawayCountdownHtml(null);
            if (_giveawayCountdownTimer) {
                clearInterval(_giveawayCountdownTimer);
                _giveawayCountdownTimer = null;
            }
            return;
        }

        var end = Date.parse(target.iso);
        var left = end - Date.now();
        if (Number.isNaN(end) || left <= 0) {
            tickGiveawayCountdown();
            return;
        }

        var parts = countdownParts(left);
        var html = renderGiveawayCountdownHtml(parts);
        if (root.innerHTML !== html) root.innerHTML = html;
        else {
            var nums = root.querySelectorAll('.info-giveaway-cd-num');
            if (nums.length === 4 && parts) {
                var vals = [parts.days, parts.hours, parts.mins, parts.secs];
                nums.forEach(function (el, i) {
                    var v = vals[i];
                    el.textContent = v >= 100 ? String(v) : String(v).padStart(2, '0');
                });
            }
        }
    }

    function initGiveawayCountdown() {
        var root = $('giveawayCountdownInner');
        if (!root) {
            applyGiveawayPhaseUi();
            return;
        }

        var startLabel = $('giveawayStartDate');
        var endLabel = $('giveawayEndDate');
        if (startLabel) startLabel.textContent = formatGiveawayStartDate();
        if (endLabel) endLabel.textContent = formatGiveawayEndDate();

        tickGiveawayCountdown();

        if (!isGiveawayEnded() && !_giveawayCountdownTimer) {
            _giveawayCountdownTimer = setInterval(tickGiveawayCountdown, 1000);
            if (!_giveawayVisBound) {
                _giveawayVisBound = true;
                document.addEventListener('visibilitychange', function () {
                    if (!document.hidden) tickGiveawayCountdown();
                });
            }
        }

        applyGiveawayPhaseUi();
    }

    function showMsg(el, text, ok) {
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-ok', !!ok);
        el.classList.toggle('is-error', !ok && !!text);
    }

    function getSelectedJoinPlatform() {
        var checked = document.querySelector('input[name="giveawayJoinPlatform"]:checked');
        return checked ? checked.value : 'tiktok';
    }

    function applyJoinPlatformFields() {
        var platform = getSelectedJoinPlatform();
        var tiktokWrap = $('giveawayJoinTiktokWrap');
        var instagramWrap = $('giveawayJoinInstagramWrap');
        var fields = $('giveawayJoinFields');
        if (!fields) return;

        fields.setAttribute('data-mode', platform === 'both' ? 'both' : 'single');

        if (tiktokWrap) {
            tiktokWrap.classList.toggle('is-active', platform === 'tiktok' || platform === 'both');
        }
        if (instagramWrap) {
            instagramWrap.classList.toggle('is-active', platform === 'instagram' || platform === 'both');
        }
    }

    function showJoinForm() {
        if (!isGiveawayActive()) return;
        var btn = $('giveawayJoinBtn');
        var form = $('giveawayJoinForm');
        var block = $('giveawayJoinBlock');
        if (btn) btn.hidden = true;
        if (form) form.hidden = false;
        if (block) block.classList.add('is-form-open');
        applyJoinPlatformFields();
        showMsg($('giveawayJoinMsg'), '', true);
    }

    function hideJoinForm() {
        var btn = $('giveawayJoinBtn');
        var form = $('giveawayJoinForm');
        var block = $('giveawayJoinBlock');
        if (btn && isGiveawayActive()) btn.hidden = false;
        if (form) form.hidden = true;
        if (block) block.classList.remove('is-form-open');
    }

    async function isLoggedIn() {
        if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
        try {
            var res = await supabaseClient.auth.getSession();
            return !!(res.data && res.data.session);
        } catch (_) {
            return false;
        }
    }

    async function loadGiveawayPanel() {
        var joinBlock = $('giveawayJoinBlock');
        var statsBlock = $('giveawayStatsBlock');
        var loginHint = $('giveawayLoginHint');
        if (!joinBlock) return;

        var logged = await isLoggedIn();
        if (loginHint) loginHint.hidden = logged;

        if (!logged) {
            joinBlock.hidden = false;
            if (statsBlock) statsBlock.hidden = true;
            hideJoinForm();
            applyGiveawayPhaseUi();
            return;
        }

        if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

        try {
            var res = await supabaseClient.rpc('giveaway_my_status');
            var row = Array.isArray(res.data) ? res.data[0] : res.data;
            if (res.error || !row) {
                joinBlock.hidden = false;
                if (statsBlock) statsBlock.hidden = true;
                return;
            }

            if (row.is_participant) {
                joinBlock.hidden = true;
                if (statsBlock) statsBlock.hidden = false;
                hideJoinForm();
                var url =
                    typeof window.reminkoGiveawayBuildShareUrl === 'function'
                        ? window.reminkoGiveawayBuildShareUrl(row.share_path)
                        : window.location.origin + (row.share_path || '');
                var linkInput = $('giveawayShareUrl');
                if (linkInput) linkInput.value = url;
                var clicksEl = $('giveawayStatClicks');
                var regsEl = $('giveawayStatRegs');
                if (clicksEl) clicksEl.textContent = String(row.unique_clicks != null ? row.unique_clicks : 0);
                if (regsEl) regsEl.textContent = String(row.registrations != null ? row.registrations : 0);
            } else {
                joinBlock.hidden = false;
                if (statsBlock) statsBlock.hidden = true;
                hideJoinForm();
            }
        } catch (_) {
            joinBlock.hidden = false;
            if (statsBlock) statsBlock.hidden = true;
            hideJoinForm();
        }

        applyGiveawayPhaseUi();
    }

    async function onJoinClick() {
        var msg = $('giveawayJoinMsg');
        if (isGiveawayEnded()) {
            showMsg(msg, 'Конкурс уже завершён. Итоги — в Telegram.', false);
            return;
        }
        if (!isGiveawayActive()) {
            showMsg(msg, 'Участие откроется 18 июля 2026. Подробности — в Telegram.', false);
            return;
        }
        if (!(await isLoggedIn())) {
            showMsg(msg, 'Войдите или зарегистрируйтесь на сайте, чтобы участвовать.', false);
            if (typeof openLoginModal === 'function') openLoginModal();
            return;
        }

        showJoinForm();
    }

    async function onJoinConfirm() {
        var btn = $('giveawayJoinConfirmBtn');
        var msg = $('giveawayJoinMsg');
        if (isGiveawayEnded()) {
            showMsg(msg, 'Конкурс уже завершён. Итоги — в Telegram.', false);
            return;
        }
        if (!isGiveawayActive()) {
            showMsg(msg, 'Участие откроется 18 июля 2026.', false);
            hideJoinForm();
            return;
        }
        if (!(await isLoggedIn())) {
            showMsg(msg, 'Войдите или зарегистрируйтесь на сайте.', false);
            if (typeof openLoginModal === 'function') openLoginModal();
            return;
        }

        var platform = getSelectedJoinPlatform();
        var tiktok = ($('giveawayJoinTiktok') && $('giveawayJoinTiktok').value) || '';
        var instagram = ($('giveawayJoinInstagram') && $('giveawayJoinInstagram').value) || '';

        if (btn) btn.disabled = true;
        showMsg(msg, 'Создаём вашу ссылку…', true);

        try {
            var res = await supabaseClient.rpc('giveaway_join', {
                p_platform: platform,
                p_tiktok_handle: platform === 'instagram' ? null : tiktok,
                p_instagram_handle: platform === 'tiktok' ? null : instagram
            });
            if (res.error) throw res.error;
            var row = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!row || !row.ref_code) throw new Error('Не удалось получить ссылку');
            showMsg(msg, 'Вы участвуете! Скопируйте ссылку ниже.', true);
            hideJoinForm();
            await loadGiveawayPanel();
        } catch (e) {
            showMsg(msg, (e && e.message) || 'Ошибка участия. Попробуйте позже.', false);
        } finally {
            if (btn) btn.disabled = false;
            applyGiveawayPhaseUi();
        }
    }

    function onJoinCancel() {
        hideJoinForm();
        showMsg($('giveawayJoinMsg'), '', true);
    }

    function onCopyClick() {
        var input = $('giveawayShareUrl');
        var msg = $('giveawayCopyMsg');
        if (!input || !input.value) return;
        input.select();
        input.setSelectionRange(0, input.value.length);
        var done = function (ok) {
            showMsg(msg, ok ? 'Ссылка скопирована!' : 'Скопируйте ссылку вручную.', ok);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(input.value)
                .then(function () {
                    done(true);
                })
                .catch(function () {
                    done(document.execCommand('copy'));
                });
        } else {
            done(document.execCommand('copy'));
        }
    }

    function activateGiveawayPanelAnimation() {
        var panel = document.querySelector('[data-tab-panel="giveaway"]');
        if (!panel) return;
        panel.classList.remove('is-live');
        void panel.offsetWidth;
        panel.classList.add('is-live');
    }

    function bindGiveawayInfo() {
        if (!document.querySelector('[data-tab-panel="giveaway"]')) return;
        if (window.__reminkoGiveawayInfoBound) return;
        window.__reminkoGiveawayInfoBound = true;

        initGiveawayCountdown();
        activateGiveawayPanelAnimation();

        $('giveawayJoinBtn')?.addEventListener('click', function () {
            void onJoinClick();
        });
        $('giveawayJoinConfirmBtn')?.addEventListener('click', function () {
            void onJoinConfirm();
        });
        $('giveawayJoinCancelBtn')?.addEventListener('click', onJoinCancel);
        $('giveawayCopyBtn')?.addEventListener('click', onCopyClick);
        $('giveawayOpenLoginBtn')?.addEventListener('click', function () {
            if (typeof openLoginModal === 'function') openLoginModal();
        });

        window.addEventListener('reminko:navigation-applied', function () {
            initGiveawayCountdown();
            activateGiveawayPanelAnimation();
            void loadGiveawayPanel();
        });
        document.addEventListener('click', function (e) {
            var tab = e.target.closest('.info-tabs [data-tab="giveaway"]');
            if (tab) {
                setTimeout(function () {
                    initGiveawayCountdown();
                    activateGiveawayPanelAnimation();
                    void loadGiveawayPanel();
                }, 0);
            }
        });

        document.querySelectorAll('input[name="giveawayJoinPlatform"]').forEach(function (el) {
            el.addEventListener('change', applyJoinPlatformFields);
        });
        applyJoinPlatformFields();
        void loadGiveawayPanel();
    }

    window.reminkoGiveawayStartsAt = GIVEAWAY_START_ISO;
    window.reminkoGiveawayEndsAt = GIVEAWAY_END_ISO;
    window.reminkoGiveawayTelegramUrl = GIVEAWAY_TG_URL;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindGiveawayInfo);
    } else {
        bindGiveawayInfo();
    }
})();

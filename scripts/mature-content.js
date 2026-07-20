/**
 * 18+ жанры (Хентай, Эротика): скрытие из выдачи, разблокировка по дате рождения.
 */
(function () {
    const LS_KEY = 'reminko_adult_unlock_v1';
    const ADULT_GENRES_RU = ['Хентай', 'Эротика'];

    function parseUnlock() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function ageFromBirth(isoDate) {
        if (!isoDate || typeof isoDate !== 'string') return 0;
        const d = new Date(isoDate + 'T12:00:00');
        if (Number.isNaN(d.getTime())) return 0;
        const today = new Date();
        let age = today.getFullYear() - d.getFullYear();
        const m = today.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
        return age;
    }

    function refreshAdultFlag() {
        const o = parseUnlock();
        window.__reminkoAdultEnabled =
            !!(o && o.enabled === true && o.birthDate && ageFromBirth(o.birthDate) >= 18);
    }

    refreshAdultFlag();

    function isAdultContentEnabled() {
        return !!window.__reminkoAdultEnabled;
    }

    function jikanItemHasRestrictedGenre(j) {
        if (!j) return false;
        const arr = [...(j.genres || []), ...(j.themes || [])];
        return arr.some((x) => {
            const n = x && x.name ? String(x.name).toLowerCase().trim() : '';
            return (
                n === 'hentai' ||
                n.includes('хентай') ||
                n === 'erotica' ||
                n.includes('эротик')
            );
        });
    }

    function animeHasRestrictedGenre(anime) {
        if (!anime || !anime.genres) return false;
        return anime.genres.some((g) => {
            const n = String(g).toLowerCase().trim();
            return (
                n === 'хентай' ||
                n === 'hentai' ||
                n === 'эротика' ||
                n === 'erotica' ||
                n.includes('эротик')
            );
        });
    }

    function filterJikanItemsRestricted(list) {
        if (!list || !list.length) return list;
        if (isAdultContentEnabled()) return list;
        return list.filter((j) => !jikanItemHasRestrictedGenre(j));
    }

    function filterAdultAnimeList(list) {
        if (!list || !list.length) return list;
        if (isAdultContentEnabled()) return list;
        return list.filter((a) => !animeHasRestrictedGenre(a));
    }

    function saveAdultUnlock(birthDateIso, enabled) {
        try {
            localStorage.setItem(
                LS_KEY,
                JSON.stringify({ enabled: !!enabled, birthDate: birthDateIso || '' })
            );
        } catch {
            /* ignore */
        }
        refreshAdultFlag();
        try {
            window.dispatchEvent(new CustomEvent('reminko-adult-changed'));
        } catch {
            /* ignore */
        }
    }

    function clearAdultUnlock() {
        try {
            localStorage.removeItem(LS_KEY);
        } catch {
            /* ignore */
        }
        refreshAdultFlag();
        try {
            window.dispatchEvent(new CustomEvent('reminko-adult-changed'));
        } catch {
            /* ignore */
        }
    }

    function ensureVerifyModal() {
        let el = document.getElementById('reminkoAdultVerifyModal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'reminkoAdultVerifyModal';
        el.className = 'modal reminko-adult-verify-modal';
        el.innerHTML = `
            <div class="modal-content reminko-adult-verify-content" style="max-width:420px;">
                <span class="close" data-reminko-adult-close>&times;</span>
                <h2 class="modal-title">Контент 18+</h2>
                <p style="font-size:0.95rem;line-height:1.5;color:var(--text-secondary,#aaa);margin-bottom:1rem;">
                    Жанры «Хентай» и «Эротика» предназначены для аудитории от 18 лет. Продолжая, вы подтверждаете,
                    что достигли совершеннолетия в вашей стране и согласны с отображением такого контента на сайте.
                </p>
                <div class="form-group">
                    <label for="reminkoAdultBirthInput">Дата рождения</label>
                    <input type="date" id="reminkoAdultBirthInput" class="filter-search-input" style="width:100%;max-width:100%;" max="">
                </div>
                <p id="reminkoAdultVerifyErr" class="error-message" style="display:none;margin-top:8px;"></p>
                <div style="display:flex;gap:10px;margin-top:1.2rem;flex-wrap:wrap;">
                    <button type="button" class="btn btn-primary" id="reminkoAdultConfirmBtn">Подтвердить и включить</button>
                    <button type="button" class="btn btn-secondary" data-reminko-adult-close>Отмена</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        const maxD = new Date();
        maxD.setFullYear(maxD.getFullYear() - 18);
        const inp = el.querySelector('#reminkoAdultBirthInput');
        if (inp) inp.max = maxD.toISOString().slice(0, 10);

        const close = () => {
            el.classList.remove('active');
        };
        el.querySelectorAll('[data-reminko-adult-close]').forEach((n) =>
            n.addEventListener('click', close)
        );
        el.querySelector('#reminkoAdultConfirmBtn')?.addEventListener('click', () => {
            const err = el.querySelector('#reminkoAdultVerifyErr');
            const birth = inp?.value?.trim();
            if (!birth) {
                if (err) {
                    err.style.display = 'block';
                    err.textContent = 'Укажите дату рождения.';
                }
                return;
            }
            const age = ageFromBirth(birth);
            if (age < 18) {
                if (err) {
                    err.style.display = 'block';
                    err.textContent = 'Доступ разрешён только с 18 полных лет.';
                }
                return;
            }
            saveAdultUnlock(birth, true);
            if (err) err.style.display = 'none';
            close();
            const t = document.getElementById('settingsAdultGenresToggle');
            if (t) t.checked = true;
            if (typeof showSuccess === 'function') {
                showSuccess('Фильтр жанров 18+ включён');
            }
            if (typeof loadGenres === 'function') loadGenres();
            else if (typeof applyFilters === 'function') applyFilters(false);
        });
        return el;
    }

    function openAdultUnlockModal() {
        const el = ensureVerifyModal();
        el.classList.add('active');
        const err = el.querySelector('#reminkoAdultVerifyErr');
        if (err) err.style.display = 'none';
    }

    window.isAdultContentEnabled = isAdultContentEnabled;
    window.refreshAdultContentFlag = refreshAdultFlag;
    window.animeHasRestrictedGenre = animeHasRestrictedGenre;
    window.jikanItemHasRestrictedGenre = jikanItemHasRestrictedGenre;
    window.filterJikanItemsRestricted = filterJikanItemsRestricted;
    window.filterAdultAnimeList = filterAdultAnimeList;
    window.reminkoAdultGenreLabels = ADULT_GENRES_RU;
    window.openAdultUnlockModal = openAdultUnlockModal;
    window.reminkoSaveAdultUnlock = saveAdultUnlock;
    window.reminkoClearAdultUnlock = clearAdultUnlock;
    window.reminkoAgeFromBirth = ageFromBirth;
})();

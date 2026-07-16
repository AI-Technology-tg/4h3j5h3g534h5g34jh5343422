/**
 * Страница «Календарь»: все даты выхода (Shikimori + Kodik), группировка по дням.
 */
(function (global) {
    'use strict';

    let _catalogByMal = new Map();
    let _activeTab = 'all';
    let _allRows = [];

    function malPosterUrl(malId) {
        const mal = parseInt(malId, 10);
        if (!Number.isFinite(mal) || mal <= 0) return '';
        return `https://shikimori.one/system/animes/${mal}/original.jpg`;
    }

    function buildCatalogMap() {
        const map = new Map();
        let list = [];
        if (typeof global.KodikCatalogStore?.getAll === 'function') {
            list = global.KodikCatalogStore.getAll();
        } else if (typeof global.getAllAnime === 'function') {
            list = global.getAllAnime().filter((a) => a.isKodikCatalog);
        }
        for (const a of list) {
            const mal = parseInt(a.mal_id, 10);
            if (Number.isFinite(mal) && mal > 0) map.set(mal, a);
        }
        _catalogByMal = map;
    }

    function isAdultOk() {
        return typeof global.isAdultContentEnabled === 'function' && global.isAdultContentEnabled();
    }

    function shouldShowRow(row) {
        const mal = parseInt(row.mal_id, 10);
        const meta = Number.isFinite(mal) ? _catalogByMal.get(mal) : null;
        if (
            meta &&
            !isAdultOk() &&
            typeof global.animeHasRestrictedGenre === 'function' &&
            global.animeHasRestrictedGenre(meta)
        ) {
            return false;
        }
        if (typeof global.reminkoIsKidsCartoonCalendarRow === 'function') {
            if (global.reminkoIsKidsCartoonCalendarRow(row, meta)) return false;
        }
        const t = Date.parse(row.next_at || row.nextAt);
        return Number.isFinite(t) && t > Date.now();
    }

    function filterRowsByTab(rows, tab) {
        if (tab === 'all') return rows;
        if (typeof global.reminkoSplitCalendarRows !== 'function') return rows;
        const { airing, announced } = global.reminkoSplitCalendarRows(rows, _catalogByMal);
        if (tab === 'airing') return airing;
        if (tab === 'announced') return announced;
        return rows;
    }

    function dayKeyFromIso(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function formatDayHeading(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return 'Без даты';
        const now = new Date();
        const todayKey = dayKeyFromIso(now.toISOString());
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = dayKeyFromIso(tomorrow.toISOString());
        const key = dayKeyFromIso(iso);
        if (key === todayKey) return 'Сегодня';
        if (key === tomorrowKey) return 'Завтра';
        return d.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    }

    function navigateToAnime(row) {
        const mal = parseInt(row.mal_id, 10);
        const catalogAnime = Number.isFinite(mal) ? _catalogByMal.get(mal) : null;
        try {
            global.sessionStorage.setItem('previousUrl', global.location.href);
            if (catalogAnime && catalogAnime.id != null) {
                global.sessionStorage.setItem('viewAnimeId', String(catalogAnime.id));
                global.location.href = `../anime/view.html?id=${encodeURIComponent(String(catalogAnime.id))}`;
                return;
            }
        } catch (_) {
            /* ignore */
        }
        if (Number.isFinite(mal) && mal > 0) {
            global.location.href = `../anime/view.html?mal_id=${encodeURIComponent(String(mal))}`;
        }
    }

    function renderRow(row) {
        const mal = parseInt(row.mal_id, 10);
        const catalogAnime = Number.isFinite(mal) ? _catalogByMal.get(mal) : null;
        const title =
            (catalogAnime && (catalogAnime.title || catalogAnime.titleAlt)) ||
            row.title_ru ||
            '—';
        const iso = row.next_at || row.nextAt;
        const ep = parseInt(row.next_episode, 10) || 1;
        const isAnnounced = ep <= 1 || row.status === 'anons';
        const timeStr = new Date(iso).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const poster =
            (catalogAnime && catalogAnime.posterUrl) ||
            (Number.isFinite(mal) && mal > 0 ? malPosterUrl(mal) : '');
        const inCatalog = !!catalogAnime;

        const item = document.createElement('article');
        item.className = 'calendar-item';
        item.innerHTML = `
            <div class="calendar-item__media">
                <div class="calendar-item__poster">
                    <img src="${poster}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                </div>
                <span class="calendar-item__time">${timeStr}</span>
            </div>
            <div class="calendar-item__body">
                <div class="calendar-item__badges">
                    <span class="calendar-item__badge calendar-item__badge--${isAnnounced ? 'ann' : 'ep'}">${isAnnounced ? 'Анонс' : 'Серия ' + ep}</span>
                    ${inCatalog ? '<span class="calendar-item__badge calendar-item__badge--kodik">Kodik</span>' : ''}
                </div>
                <h3 class="calendar-item__title"></h3>
                <div class="calendar-item__countdown" data-countdown-iso="${String(iso).replace(/"/g, '&quot;')}"></div>
            </div>
        `;
        const titleEl = item.querySelector('.calendar-item__title');
        if (titleEl) {
            titleEl.textContent = title;
            titleEl.title = title;
        }
        item.addEventListener('click', () => navigateToAnime(row));
        const posterImg = item.querySelector('.calendar-item__poster img');
        if (posterImg && Number.isFinite(mal) && mal > 0 && typeof global.attachJikanPosterFallback === 'function') {
            global.attachJikanPosterFallback(posterImg, mal, catalogAnime || row);
        }
        return item;
    }

    function groupRowsByDay(rows) {
        const groups = new Map();
        for (const row of rows) {
            const iso = row.next_at || row.nextAt;
            const key = dayKeyFromIso(iso);
            if (!key) continue;
            if (!groups.has(key)) groups.set(key, { iso, rows: [] });
            groups.get(key).rows.push(row);
        }
        return [...groups.values()].sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso));
    }

    function renderCalendar() {
        const container = document.getElementById('calendarDays');
        const metaEl = document.getElementById('calendarMeta');
        if (!container) return;

        const visible = filterRowsByTab(
            _allRows.filter(shouldShowRow),
            _activeTab
        );

        if (metaEl) {
            metaEl.textContent =
                visible.length > 0
                    ? `${visible.length} ${visible.length === 1 ? 'тайтл' : visible.length < 5 ? 'тайтла' : 'тайтлов'} · обновлено из Shikimori`
                    : 'Нет предстоящих дат в этом разделе';
        }

        container.innerHTML = '';
        if (!visible.length) {
            container.innerHTML =
                '<div class="calendar-empty">Пока нет предстоящих дат. Загляните позже — расписание обновляется из Shikimori.</div>';
            return;
        }

        const dayGroups = groupRowsByDay(visible);
        for (const group of dayGroups) {
            const section = document.createElement('section');
            section.className = 'calendar-day';
            section.innerHTML = `<h2 class="calendar-day__title">${formatDayHeading(group.iso)}</h2>`;
            const list = document.createElement('div');
            list.className = 'calendar-day__list';
            for (const row of group.rows) {
                list.appendChild(renderRow(row));
            }
            section.appendChild(list);
            container.appendChild(section);
        }

        if (typeof global.reminkoStartLiveCountdown === 'function') {
            container.querySelectorAll('[data-countdown-iso]').forEach((el) => {
                const iso = el.getAttribute('data-countdown-iso');
                if (!iso) return;
                global.reminkoStartLiveCountdown(el, iso, {
                    compact: true,
                    unknownText: '—',
                    expiredText: 'скоро'
                });
            });
        }
    }

    function bindTabs() {
        document.querySelectorAll('[data-calendar-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-calendar-tab') || 'all';
                _activeTab = tab;
                document.querySelectorAll('[data-calendar-tab]').forEach((b) => {
                    const active = b.getAttribute('data-calendar-tab') === tab;
                    b.classList.toggle('is-active', active);
                    b.setAttribute('aria-selected', active ? 'true' : 'false');
                });
                renderCalendar();
            });
        });
    }

    async function initCalendarPage() {
        if (!document.getElementById('calendarDays')) return;

        bindTabs();

        if (typeof global.KodikCatalogStore?.load === 'function') {
            try {
                await global.KodikCatalogStore.load();
            } catch (_) {
                /* ignore */
            }
        }
        buildCatalogMap();

        if (typeof global.reminkoLoadAllCalendarData === 'function') {
            await global.reminkoLoadAllCalendarData();
        } else {
            if (typeof global.reminkoLoadCalendarData === 'function') {
                await global.reminkoLoadCalendarData();
            }
            if (typeof global.reminkoLoadShikimoriCalendarData === 'function') {
                await global.reminkoLoadShikimoriCalendarData();
            }
        }

        if (typeof global.reminkoMergedCalendarItems === 'function') {
            _allRows = global.reminkoMergedCalendarItems();
        } else {
            _allRows = [];
        }

        renderCalendar();
    }

    global.initCalendarPage = initCalendarPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => void initCalendarPage());
    } else {
        void initCalendarPage();
    }
})(typeof window !== 'undefined' ? window : globalThis);

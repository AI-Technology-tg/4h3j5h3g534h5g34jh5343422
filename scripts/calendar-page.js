/**
 * Страница «Календарь»: все даты выхода (Shikimori + Kodik), группировка по дням.
 */
(function (global) {
    'use strict';

    let _catalogByMal = new Map();
    let _activeTab = 'all';
    let _allRows = [];

    const POSTER_PLACEHOLDER_SRC =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    function posterMetaForRow(row, catalogAnime) {
        if (catalogAnime) return catalogAnime;
        return {
            mal_id: row.mal_id,
            title: row.title_ru,
            title_ru: row.title_ru,
            posterUrl: row.posterUrl || '',
            _jikan: row._jikan,
            _jikanRaw: row._jikanRaw
        };
    }

    function pickInitialPoster(row, catalogAnime) {
        const mal = parseInt(row.mal_id, 10);
        if (Number.isFinite(mal) && mal > 0 && typeof global.readMalPosterCache === 'function') {
            const cached = global.readMalPosterCache(mal);
            if (cached) return cached;
        }
        const meta = posterMetaForRow(row, catalogAnime);
        if (typeof global.pickKnownPosterUrl === 'function') {
            const known = global.pickKnownPosterUrl(meta);
            if (known) return known;
        }
        const candidates = [row.posterUrl, catalogAnime && catalogAnime.posterUrl];
        for (const url of candidates) {
            if (!url) continue;
            if (
                typeof global.isShikimoriPlaceholderPoster === 'function' &&
                global.isShikimoriPlaceholderPoster(url)
            ) {
                continue;
            }
            if (
                typeof global.isShikimoriDirectMalPoster === 'function' &&
                global.isShikimoriDirectMalPoster(url)
            ) {
                continue;
            }
            return url;
        }
        return POSTER_PLACEHOLDER_SRC;
    }

    function hydrateCalendarPosters(container) {
        if (!container) return;
        container.querySelectorAll('.calendar-item__poster img[data-mal-id]').forEach((img) => {
            const mal = parseInt(img.dataset.malId, 10);
            if (!Number.isFinite(mal) || mal <= 0) return;
            if (typeof global.attachJikanPosterFallback !== 'function') return;
            const rowId = img.dataset.rowMal;
            const row = _allRows.find((r) => String(r.mal_id) === String(rowId));
            const catalogAnime = _catalogByMal.get(mal) || null;
            global.attachJikanPosterFallback(img, mal, posterMetaForRow(row || { mal_id: mal }, catalogAnime));
        });
    }

    async function prefetchVisiblePosters(rows) {
        if (typeof global.prefetchPosterUrlsForMals !== 'function') return;
        const payload = (rows || []).map((row) => {
            const mal = parseInt(row.mal_id, 10);
            const catalogAnime = Number.isFinite(mal) ? _catalogByMal.get(mal) : null;
            return { mal_id: mal, anime: posterMetaForRow(row, catalogAnime) };
        });
        try {
            await global.prefetchPosterUrlsForMals(payload, { concurrency: 4, delayMs: 300 });
        } catch (_) {
            /* ignore */
        }
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
        if (rowHasFutureDate(row)) return true;
        // Анонсы из каталога/Shikimori без даты премьеры — только вкладка «Анонсы»
        return !!(row && row._fromExtraAnnounced && _activeTab === 'announced');
    }

    function filterRowsByTab(rows, tab) {
        if (tab === 'all') {
            // «Все» — только с реальной будущей датой (без TBA-анонсов)
            return rows.filter(rowHasFutureDate);
        }
        if (typeof global.reminkoSplitCalendarRows !== 'function') return rows;
        const dated = rows.filter(rowHasFutureDate);
        const { airing, announced } = global.reminkoSplitCalendarRows(dated, _catalogByMal);
        if (tab === 'airing') return airing;
        if (tab === 'announced') {
            const seen = new Set(
                announced
                    .map((r) => parseInt(r && r.mal_id, 10))
                    .filter((n) => Number.isFinite(n) && n > 0)
            );
            const extras = [];
            for (const row of rows) {
                if (!row || !row._fromExtraAnnounced) continue;
                const mal = parseInt(row.mal_id, 10);
                if (!Number.isFinite(mal) || mal <= 0 || seen.has(mal)) continue;
                seen.add(mal);
                extras.push(row);
            }
            return [...announced, ...extras].sort((a, b) => {
                const at = Date.parse(a.next_at || a.nextAt) || Infinity;
                const bt = Date.parse(b.next_at || b.nextAt) || Infinity;
                if (at !== bt) return at - bt;
                return String(a.title_ru || '').localeCompare(String(b.title_ru || ''), 'ru');
            });
        }
        return rows;
    }

    function dayKeyFromIso(iso) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return 'tba';
        const d = new Date(t);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function formatDayHeading(iso) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return 'Дата уточняется';
        const d = new Date(t);
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

    function rowHasFutureDate(row) {
        const t = Date.parse(row && (row.next_at || row.nextAt));
        return Number.isFinite(t) && t > Date.now();
    }

    function calendarRowFromExtraAnnounced(a) {
        if (!a) return null;
        const mal = parseInt(a.mal_id, 10);
        if (!Number.isFinite(mal) || mal <= 0) return null;
        const meta = _catalogByMal.get(mal);
        if (meta) {
            const cst = String(meta.status || '');
            const last = parseInt(meta._kodik && meta._kodik.lastEpisode, 10);
            const released = Number.isFinite(last) ? Math.max(0, last) : 0;
            if (cst === 'Онгоинг' || cst === 'Завершён' || cst === 'Вышел') return null;
            if (released >= 1) return null;
            if (meta._kodik && meta._kodik.link) return null;
        }
        const titleRu = String(a.title_russian || '').trim();
        const titleEn = String(a.title_english || a.title || '').trim();
        const poster =
            (typeof global.jikanPosterFromAnime === 'function'
                ? global.jikanPosterFromAnime(a)
                : '') ||
            a.images?.jpg?.large_image_url ||
            a.images?.jpg?.image_url ||
            a.posterUrl ||
            '';
        const nextAt = (a.aired && a.aired.from) || a.next_at || '';
        const nextT = Date.parse(nextAt);
        return {
            mal_id: mal,
            next_episode: 1,
            // Без будущей даты — пусто: попадёт в «Дата уточняется» на вкладке Анонсы
            next_at: Number.isFinite(nextT) && nextT > Date.now() ? nextAt : '',
            title_ru: titleRu || titleEn || `MAL #${mal}`,
            title_en: titleEn || titleRu || '',
            kind: a.type === 'Movie' || a.type === 'Фильм' ? 'movie' : 'tv',
            status: 'anons',
            score: a.score || 0,
            posterUrl: poster,
            source: 'shikimori-anons',
            _fromExtraAnnounced: true,
            _jikan: a
        };
    }

    async function mergeCatalogAnnouncedIntoCalendarRows() {
        let list = [];
        try {
            if (typeof global.fetchShikimoriAnnouncedAsJikan === 'function') {
                list = await global.fetchShikimoriAnnouncedAsJikan();
            } else if (typeof global.fetchJikanAnnouncedList === 'function') {
                list = await global.fetchJikanAnnouncedList();
            }
        } catch (e) {
            console.warn('[calendar] extra announced:', e);
            return;
        }
        if (!Array.isArray(list) || !list.length) return;

        try {
            global.__reminkoExtraAnnouncedJikan = list;
        } catch (_) {
            /* ignore */
        }

        const seen = new Set();
        for (const row of _allRows) {
            const mal = parseInt(row && row.mal_id, 10);
            if (Number.isFinite(mal) && mal > 0) seen.add(mal);
        }
        for (const a of list) {
            const row = calendarRowFromExtraAnnounced(a);
            if (!row) continue;
            const mal = parseInt(row.mal_id, 10);
            if (!Number.isFinite(mal) || seen.has(mal)) continue;
            if (
                typeof global.reminkoIsKidsCartoonCalendarRow === 'function' &&
                global.reminkoIsKidsCartoonCalendarRow(row, _catalogByMal.get(mal))
            ) {
                continue;
            }
            seen.add(mal);
            _allRows.push(row);
        }
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
        const iso = row.next_at || row.nextAt || '';
        const ep = parseInt(row.next_episode, 10) || 1;
        const isAnnounced = ep <= 1 || row.status === 'anons' || !!row._fromExtraAnnounced;
        const hasDate = rowHasFutureDate(row);
        const timeStr = hasDate
            ? new Date(iso).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit'
              })
            : 'TBA';
        const poster = reminkoSafeImageUrl(pickInitialPoster(row, catalogAnime), '');
        const inCatalog = !!catalogAnime;

        const item = document.createElement('article');
        item.className = 'calendar-item';
        item.innerHTML = `
            <div class="calendar-item__media">
                <div class="calendar-item__poster">
                    <img src="${reminkoEscapeHtml(poster)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-mal-id="${mal}" data-row-mal="${mal}">
                </div>
                <span class="calendar-item__time">${timeStr}</span>
            </div>
            <div class="calendar-item__body">
                <div class="calendar-item__badges">
                    <span class="calendar-item__badge calendar-item__badge--${isAnnounced ? 'ann' : 'ep'}">${isAnnounced ? 'Анонс' : 'Серия ' + ep}</span>
                    ${inCatalog ? '<span class="calendar-item__badge calendar-item__badge--kodik">Kodik</span>' : ''}
                </div>
                <h3 class="calendar-item__title"></h3>
                <div class="calendar-item__countdown" ${hasDate ? `data-countdown-iso="${reminkoEscapeHtml(iso)}"` : ''}>${hasDate ? '' : 'дата уточняется'}</div>
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
            global.attachJikanPosterFallback(
                posterImg,
                mal,
                posterMetaForRow(row, catalogAnime)
            );
        }
        return item;
    }

    function groupRowsByDay(rows) {
        const groups = new Map();
        for (const row of rows) {
            const iso = row.next_at || row.nextAt || '';
            const key = dayKeyFromIso(iso);
            if (!key) continue;
            if (!groups.has(key)) groups.set(key, { iso: iso || '', rows: [] });
            groups.get(key).rows.push(row);
        }
        return [...groups.values()].sort((a, b) => {
            const at = Date.parse(a.iso);
            const bt = Date.parse(b.iso);
            if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0;
            if (!Number.isFinite(at)) return 1;
            if (!Number.isFinite(bt)) return -1;
            return at - bt;
        });
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

        hydrateCalendarPosters(container);
        void prefetchVisiblePosters(visible).then(() => hydrateCalendarPosters(container));
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

        // Те же анонсы, что в фильтре каталога «Анонс» (Shikimori), которых нет в calendar dump
        await mergeCatalogAnnouncedIntoCalendarRows();

        renderCalendar();
    }

    global.initCalendarPage = initCalendarPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => void initCalendarPage());
    } else {
        void initCalendarPage();
    }
})(typeof window !== 'undefined' ? window : globalThis);

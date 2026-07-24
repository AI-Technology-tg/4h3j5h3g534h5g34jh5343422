/**
 * Живые таймеры выхода серий: один глобальный тик в секунду для всех блоков на странице.
 */
(function (global) {
    'use strict';

    const _slots = new Map();
    let _masterTimer = null;

    function reminkoRuUnit(n, one, few, many) {
        const nAbs = Math.floor(Math.abs(n)) % 100;
        const n1 = nAbs % 10;
        if (nAbs >= 11 && nAbs <= 14) return many;
        if (n1 === 1) return one;
        if (n1 >= 2 && n1 <= 4) return few;
        return many;
    }

    function reminkoBroadcastToNextIso(broadcast) {
        if (!broadcast?.day || !broadcast?.time) return null;
        const tz = 'Asia/Tokyo';
        const dayStr = String(broadcast.day).toLowerCase().replace(/s$/, '');
        const [th, tm] = String(broadcast.time)
            .split(':')
            .map((n) => parseInt(n, 10) || 0);
        const now = Date.now();
        for (let i = 0; i < 10; i++) {
            const probe = new Date(now + i * 86400000);
            const longDay = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' })
                .format(probe)
                .toLowerCase();
            if (longDay !== dayStr) continue;
            const ymd = new Intl.DateTimeFormat('en-CA', {
                timeZone: tz,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(probe);
            const [yy, mm, dd] = ymd.split('-').map(Number);
            const ms = Date.UTC(yy, mm - 1, dd, th - 9, tm, 0);
            if (ms > now) return new Date(ms).toISOString();
        }
        return null;
    }

    function reminkoIsAiringAnimeStatus(status) {
        if (!status) return false;
        const s = String(status).toLowerCase();
        return (
            s === 'currently airing' ||
            s.includes('ongoing') ||
            s.includes('онгоинг') ||
            s.includes('выходит')
        );
    }

    /**
     * Если ISO в прошлом — только честный сдвиг по broadcast Jikan.
     * Без +7 дней «из головы»: при паузе/хиатусе это врало таймером.
     */
    function reminkoRollForwardCountdownIso(iso, data) {
        const raw = iso ? String(iso) : '';
        const now = Date.now();
        const t = Date.parse(raw);
        if (!raw || Number.isNaN(t)) return '';

        if (t > now) return raw;

        if (!reminkoIsAiringAnimeStatus(data?.status)) return '';

        if (data?.broadcast?.day && data?.broadcast?.time) {
            const b = reminkoBroadcastToNextIso(data.broadcast);
            if (b && Date.parse(b) > now) return b;
        }
        return '';
    }

    function reminkoIsAnnouncedAnimeStatus(status) {
        if (!status) return false;
        const s = String(status).toLowerCase();
        return s === 'not yet aired' || s.includes('анонс') || s.includes('upcoming');
    }

    function reminkoIncompleteDateToIso(value) {
        if (value == null || value === '') return '';
        if (typeof value === 'string') {
            const raw = value.trim();
            if (!raw) return '';
            const t = Date.parse(raw);
            if (Number.isFinite(t)) return new Date(t).toISOString();
            return '';
        }
        if (typeof value === 'object') {
            const y = parseInt(value.year, 10);
            const m = parseInt(value.month, 10);
            const d = parseInt(value.day, 10);
            if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
                return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
            }
        }
        return '';
    }

    function reminkoShikimoriCountdownCandidates(shiki) {
        if (!shiki) return [];
        const out = [];
        if (shiki.next_episode_at) out.push(String(shiki.next_episode_at));
        if (shiki.aired_on) {
            const iso = reminkoIncompleteDateToIso(shiki.aired_on);
            if (iso) out.push(iso);
        }
        if (shiki.released_on) {
            const iso = reminkoIncompleteDateToIso(shiki.released_on);
            if (iso) out.push(iso);
        }
        return out;
    }

    function reminkoRollDataFromContext(data, shiki) {
        const base = data && typeof data === 'object' ? { ...data } : {};
        if (shiki?.ongoing || shiki?.status === 'ongoing') {
            base.status = base.status || 'Currently Airing';
        } else if (shiki?.anons || shiki?.status === 'anons') {
            base.status = base.status || 'Not yet aired';
        }
        return base;
    }

    function reminkoResolveCountdownTargetIso(data, shiki, extra) {
        const cal = extra?.calendar || extra?._calendar || data?._calendar;
        const candidates = [];
        const now = Date.now();
        const rollData = reminkoRollDataFromContext(data, shiki);

        if (shiki) {
            for (const iso of reminkoShikimoriCountdownCandidates(shiki)) {
                candidates.push(iso);
            }
        }

        const calMal =
            shiki?.myanimelist_id ||
            shiki?.id ||
            data?.mal_id ||
            extra?.calendar?.mal_id ||
            extra?._calendar?.mal_id;
        if (calMal && typeof reminkoShikimoriCalendarRowForMal === 'function') {
            const shikiCal = reminkoShikimoriCalendarRowForMal(calMal);
            if (shikiCal?.next_at) candidates.push(String(shikiCal.next_at));
        }

        const calendarIso = cal && (cal.next_at || cal.nextAt);
        if (calendarIso) candidates.push(String(calendarIso));

        const st = rollData?.status || data?.status || '';
        if (reminkoIsAnnouncedAnimeStatus(st) || st === 'Not yet aired') {
            if (rollData?.aired?.from) candidates.push(String(rollData.aired.from));
            else if (data?.aired?.from) candidates.push(String(data.aired.from));
        }
        if (reminkoIsAiringAnimeStatus(st) && rollData?.broadcast?.day && rollData?.broadcast?.time) {
            const b = reminkoBroadcastToNextIso(rollData.broadcast);
            if (b) candidates.push(b);
        } else if (reminkoIsAiringAnimeStatus(st) && data?.broadcast?.day && data?.broadcast?.time) {
            const b = reminkoBroadcastToNextIso(data.broadcast);
            if (b) candidates.push(b);
        }

        for (const iso of candidates) {
            const future = reminkoRollForwardCountdownIso(iso, rollData);
            if (future && Date.parse(future) > now) return future;
        }
        return '';
    }

    function reminkoCountdownParts(diffMs) {
        if (diffMs <= 0) return null;
        let s = Math.floor(diffMs / 1000);
        const secs = s % 60;
        s = Math.floor(s / 60);
        const mins = s % 60;
        s = Math.floor(s / 60);
        const hours = s % 24;
        const days = Math.floor(s / 24);
        return { days, hours, mins, secs };
    }

    function reminkoCountdownMarkupHtml(parts) {
        if (!parts) {
            return '<div class="countdown__unknown">Ожидаем обновление расписания…</div>';
        }
        const d = String(parts.days).padStart(2, '0');
        const h = String(parts.hours).padStart(2, '0');
        const m = String(parts.mins).padStart(2, '0');
        const sec = String(parts.secs).padStart(2, '0');
        return `<div class="countdown__line" aria-live="polite">
            <span class="countdown__num" data-cd-part="d">${d}</span> <span class="countdown__unit">${reminkoRuUnit(parts.days, 'день', 'дня', 'дней')}</span>
            <span class="countdown__colon"> : </span>
            <span class="countdown__num" data-cd-part="h">${h}</span> <span class="countdown__unit">${reminkoRuUnit(parts.hours, 'час', 'часа', 'часов')}</span>
            <span class="countdown__colon"> : </span>
            <span class="countdown__num" data-cd-part="m">${m}</span> <span class="countdown__unit">${reminkoRuUnit(parts.mins, 'минута', 'минуты', 'минут')}</span>
            <span class="countdown__colon"> : </span>
            <span class="countdown__num" data-cd-part="s">${sec}</span> <span class="countdown__unit">${reminkoRuUnit(parts.secs, 'секунда', 'секунды', 'секунд')}</span>
        </div>`;
    }

    function reminkoCompactCountdownText(parts) {
        if (!parts) return '';
        const d = String(parts.days);
        const h = String(parts.hours).padStart(2, '0');
        const m = String(parts.mins).padStart(2, '0');
        const s = String(parts.secs).padStart(2, '0');
        if (parts.days > 0) return `${d}д ${h}ч`;
        return `${h}:${m}:${s}`;
    }

    function reminkoUpdateCountdownDom(root, parts, unknownText, compact) {
        if (!root) return;
        if (compact) {
            root.textContent = parts
                ? reminkoCompactCountdownText(parts)
                : unknownText || 'скоро';
            return;
        }
        if (!parts) {
            if (!root.querySelector('[data-cd-part]')) {
                root.innerHTML = `<div class="countdown__unknown">${unknownText || 'Дата следующего эпизода неизвестна.'}</div>`;
            } else {
                root.innerHTML = `<div class="countdown__unknown">${unknownText || 'Время выхода прошло — скоро обновим.'}</div>`;
            }
            return;
        }
        let line = root.querySelector('.countdown__line');
        if (!line) {
            root.innerHTML = reminkoCountdownMarkupHtml(parts);
            return;
        }
        const map = {
            d: String(parts.days).padStart(2, '0'),
            h: String(parts.hours).padStart(2, '0'),
            m: String(parts.mins).padStart(2, '0'),
            s: String(parts.secs).padStart(2, '0')
        };
        line.querySelectorAll('[data-cd-part]').forEach((el) => {
            const k = el.getAttribute('data-cd-part');
            if (k && map[k] != null) el.textContent = map[k];
        });
    }

    function reminkoEnsureMasterTimer() {
        if (_masterTimer != null) return;
        _masterTimer = setInterval(reminkoTickAllCountdowns, 1000);
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) reminkoTickAllCountdowns();
            });
        }
    }

    function reminkoStopMasterTimerIfEmpty() {
        if (_slots.size > 0) return;
        if (_masterTimer != null) {
            clearInterval(_masterTimer);
            _masterTimer = null;
        }
    }

    function reminkoTickAllCountdowns() {
        const now = Date.now();
        for (const [el, slot] of _slots) {
            if (!el.isConnected) {
                _slots.delete(el);
                continue;
            }
            const iso = slot.iso;
            const target = iso ? Date.parse(iso) : NaN;
            if (!iso || Number.isNaN(target)) {
                reminkoUpdateCountdownDom(el, null, slot.unknownText || 'Дата следующего эпизода неизвестна.', slot.compact);
                continue;
            }
            let left = target - now;
            if (left <= 0) {
                const rolled =
                    typeof reminkoRollForwardCountdownIso === 'function'
                        ? reminkoRollForwardCountdownIso(iso, slot.rollData)
                        : '';
                if (rolled && Date.parse(rolled) > now) {
                    slot.iso = rolled;
                    left = Date.parse(rolled) - now;
                } else {
                    reminkoUpdateCountdownDom(
                        el,
                        null,
                        slot.expiredText || 'Ожидаем обновление расписания следующей серии…',
                        slot.compact
                    );
                    if (typeof slot.onExpire === 'function') slot.onExpire(el);
                    continue;
                }
            }
            reminkoUpdateCountdownDom(el, reminkoCountdownParts(left), null, slot.compact);
        }
        reminkoStopMasterTimerIfEmpty();
    }

    /**
     * @param {HTMLElement} containerEl — куда рисовать цифры
     * @param {string} iso — ISO-время цели
     * @param {{ unknownText?: string, expiredText?: string, onExpire?: function }} [opts]
     */
    function reminkoStartLiveCountdown(containerEl, iso, opts) {
        if (!containerEl) return;
        const slot = {
            iso: iso ? String(iso) : '',
            unknownText: opts?.unknownText,
            expiredText: opts?.expiredText,
            onExpire: opts?.onExpire,
            rollData: opts?.rollData || null,
            compact: !!opts?.compact
        };
        _slots.set(containerEl, slot);
        reminkoEnsureMasterTimer();
        reminkoTickAllCountdowns();
    }

    function reminkoStopLiveCountdown(containerEl) {
        if (!containerEl) return;
        _slots.delete(containerEl);
        reminkoStopMasterTimerIfEmpty();
    }

    function reminkoStopAllLiveCountdowns() {
        _slots.clear();
        reminkoStopMasterTimerIfEmpty();
    }

    let _calendarItems = null;
    let _calendarByMal = null;
    let _calendarLoading = null;
    let _shikimoriCalendarItems = null;
    let _shikimoriCalendarByMal = null;
    let _shikimoriCalendarLoading = null;

    function reminkoIsLocalDevOrigin() {
        const host = global.location && global.location.hostname;
        return (
            !host ||
            host === 'localhost' ||
            host === '127.0.0.1' ||
            String(global.location?.protocol).startsWith('file')
        );
    }

    function reminkoCalendarUrl() {
        const cfg = global.APP_CONFIG && global.APP_CONFIG.kodik;
        const rel = (cfg && cfg.calendarPath) || 'data/kodik-calendar.json';
        if (/^https?:\/\//i.test(rel)) return rel;
        const base =
            (global.APP_CONFIG && global.APP_CONFIG.siteOrigin) ||
            (global.location && global.location.origin) ||
            '';
        const path = rel.replace(/^\//, '');
        if (base && !reminkoIsLocalDevOrigin()) {
            return base.replace(/\/$/, '') + '/' + path;
        }
        const depth =
            global.location && global.location.pathname
                ? (global.location.pathname.match(/\//g) || []).length - 1
                : 0;
        const prefix = depth > 0 ? '../'.repeat(depth) : '';
        return prefix + path;
    }

    async function reminkoLoadCalendarData(force) {
        if (_calendarItems && !force) return _calendarItems;
        if (_calendarLoading && !force) return _calendarLoading;
        _calendarLoading = fetch(reminkoCalendarUrl(), { credentials: 'omit', cache: 'default' })
            .then((res) => (res.ok ? res.json() : { items: [] }))
            .then((data) => {
                _calendarItems = (data && data.items) || data || [];
                _calendarByMal = new Map();
                for (const row of _calendarItems) {
                    const mal = parseInt(row.mal_id, 10);
                    if (Number.isFinite(mal) && mal > 0) _calendarByMal.set(mal, row);
                }
                return _calendarItems;
            })
            .catch(() => {
                _calendarItems = [];
                _calendarByMal = new Map();
                return _calendarItems;
            })
            .finally(() => {
                _calendarLoading = null;
            });
        return _calendarLoading;
    }

    function reminkoCalendarRowForMal(malId) {
        const mal = parseInt(malId, 10);
        if (!mal) return null;
        const shikiRow = _shikimoriCalendarByMal ? _shikimoriCalendarByMal.get(mal) : null;
        const kodikRow = _calendarByMal ? _calendarByMal.get(mal) : null;
        return reminkoPickBestCalendarRow(shikiRow, kodikRow);
    }

    function reminkoNormalizeShikimoriCalendarEntry(entry) {
        const a = entry && entry.anime;
        if (!a || !a.id) return null;
        const mal = parseInt(a.myanimelist_id || a.id, 10);
        if (!Number.isFinite(mal) || mal <= 0) return null;

        let iso = '';
        if (entry.next_episode_at) {
            const t = Date.parse(String(entry.next_episode_at));
            if (Number.isFinite(t)) iso = new Date(t).toISOString();
        }
        if (!iso && a.next_episode_at) {
            const t = Date.parse(String(a.next_episode_at));
            if (Number.isFinite(t)) iso = new Date(t).toISOString();
        }
        if (!iso && a.aired_on) {
            iso = reminkoIncompleteDateToIso(a.aired_on);
        }

        const epAired = parseInt(a.episodes_aired, 10);
        const nextEp =
            parseInt(entry.next_episode, 10) ||
            (Number.isFinite(epAired) && epAired >= 0 ? epAired + 1 : 1);

        const shikiStatus = String(a.status || '').toLowerCase();
        if (shikiStatus === 'released' && (!iso || Date.parse(iso) <= Date.now())) return null;

        let posterUrl = '';
        const imgPath = a.image && a.image.original ? String(a.image.original) : '';
        if (imgPath && !imgPath.toLowerCase().includes('missing_')) {
            posterUrl = imgPath.startsWith('http')
                ? imgPath
                : `https://shikimori.one${imgPath.startsWith('/') ? imgPath : `/${imgPath}`}`;
        }

        return {
            mal_id: mal,
            shiki_id: a.id,
            title_ru: a.russian || a.name || '',
            title_en: a.name || '',
            next_at: iso,
            next_episode: nextEp,
            status: a.status || '',
            kind: a.kind || '',
            score: parseFloat(a.score) || 0,
            posterUrl,
            source: 'shikimori'
        };
    }

    async function reminkoLoadShikimoriCalendarData(force) {
        if (_shikimoriCalendarItems && !force) return _shikimoriCalendarItems;
        if (_shikimoriCalendarLoading && !force) return _shikimoriCalendarLoading;

        _shikimoriCalendarLoading = Promise.resolve()
            .then(async () => {
                let raw = [];
                if (
                    global.shikimoriApi &&
                    typeof global.shikimoriApi.fetchShikimoriCalendar === 'function'
                ) {
                    raw = await global.shikimoriApi.fetchShikimoriCalendar(!!force);
                }
                const items = [];
                const byMal = new Map();
                for (const entry of raw || []) {
                    const row = reminkoNormalizeShikimoriCalendarEntry(entry);
                    if (!row || !row.next_at) continue;
                    items.push(row);
                    byMal.set(row.mal_id, row);
                }
                items.sort((a, b) => Date.parse(a.next_at) - Date.parse(b.next_at));
                _shikimoriCalendarItems = items;
                _shikimoriCalendarByMal = byMal;
                return items;
            })
            .catch(() => {
                _shikimoriCalendarItems = [];
                _shikimoriCalendarByMal = new Map();
                return _shikimoriCalendarItems;
            })
            .finally(() => {
                _shikimoriCalendarLoading = null;
            });

        return _shikimoriCalendarLoading;
    }

    async function reminkoLoadAllCalendarData(force) {
        await Promise.all([reminkoLoadCalendarData(force), reminkoLoadShikimoriCalendarData(force)]);
        return reminkoMergedCalendarItems();
    }

    function reminkoShikimoriCalendarRowForMal(malId) {
        const mal = parseInt(malId, 10);
        if (!mal || !_shikimoriCalendarByMal) return null;
        return _shikimoriCalendarByMal.get(mal) || null;
    }

    function reminkoCalendarRowTime(row) {
        if (!row) return NaN;
        return Date.parse(row.next_at || row.nextAt || '');
    }

    function reminkoPickBestCalendarRow(shikiRow, kodikRow) {
        const now = Date.now();
        const shikiT = reminkoCalendarRowTime(shikiRow);
        const kodikT = reminkoCalendarRowTime(kodikRow);
        const shikiOk = Number.isFinite(shikiT) && shikiT > now;
        const kodikOk = Number.isFinite(kodikT) && kodikT > now;

        if (shikiOk && kodikOk) {
            return shikiT <= kodikT + 3600000 ? shikiRow : kodikRow;
        }
        if (shikiOk) return shikiRow;
        if (kodikOk) return kodikRow;
        if (shikiRow) return shikiRow;
        return kodikRow || null;
    }

    function reminkoMergedCalendarItems() {
        const merged = new Map();
        for (const row of _calendarItems || []) {
            const mal = parseInt(row.mal_id, 10);
            if (Number.isFinite(mal) && mal > 0) {
                merged.set(mal, { ...row, source: row.source || 'kodik' });
            }
        }
        for (const row of _shikimoriCalendarItems || []) {
            const mal = parseInt(row.mal_id, 10);
            if (!Number.isFinite(mal) || mal <= 0) continue;
            merged.set(mal, reminkoPickBestCalendarRow(row, merged.get(mal)));
        }
        return [...merged.values()].sort(
            (a, b) => reminkoCalendarRowTime(a) - reminkoCalendarRowTime(b)
        );
    }

    /** Долгие / ежедневные сериалы: last === total не означает «завершён». */
    const REMINKO_LONG_RUNNING_MAL = new Set([
        21, 235, 966, 1960, 2406, 6149, 8687, 53876, 56566, 32353, 50418, 60534, 50250, 18941,
        63356, 62933, 63383, 63150, 63403, 64357, 63641, 62683, 62856, 63042, 63352, 37096, 42295
    ]);

    function reminkoIsLongRunningAnime(anime) {
        const mal = parseInt(anime && anime.mal_id, 10);
        if (Number.isFinite(mal) && mal > 0 && REMINKO_LONG_RUNNING_MAL.has(mal)) return true;
        if (Number.isFinite(mal) && mal > 0 && REMINKO_KIDS_CARTOON_MAL.has(mal)) return true;
        const title = String((anime && (anime.title || anime.titleAlt)) || '').toLowerCase();
        if (!title) return false;
        return /ван-пис|one piece|детектив конан|detective conan|дораэмон|doraemon|покемон|pokemon|син-тян|коротышка марuko|maruko|тикава|shimajirou|шимаджиро/.test(
            title
        );
    }

    function reminkoCalendarRowPromisesNewEpisode(row, lastEpisode) {
        if (!row) return false;
        const t = Date.parse(row.next_at || row.nextAt);
        const nextEp = parseInt(row.next_episode, 10);
        if (!Number.isFinite(t) || t <= Date.now()) return false;
        if (!Number.isFinite(nextEp)) return false;
        if (!Number.isFinite(lastEpisode)) return nextEp >= 1;
        return nextEp > lastEpisode;
    }

    /**
     * Kodik часто ставит «Онгоинг» всем тайтлам с ≥1 серией.
     * Завершён = все серии вышли, нет новой в календаре, давно не обновлялся в Kodik.
     */
    function reminkoIsAnimeCatalogFinished(anime) {
        if (!anime) return false;
        const st = String(anime.status || '');
        if (st === 'Завершён' || st === 'Вышел') return true;
        if (st !== 'Онгоинг') return false;
        if (reminkoIsLongRunningAnime(anime)) return false;

        const last = parseInt(anime._kodik && anime._kodik.lastEpisode, 10);
        const total = parseInt(anime.totalEpisodes, 10);
        if (!Number.isFinite(last) || !Number.isFinite(total) || total <= 0 || last < total) {
            return false;
        }

        const mal = parseInt(anime.mal_id, 10);
        let calRow = null;
        if (Number.isFinite(mal) && mal > 0 && typeof reminkoCalendarRowForMal === 'function') {
            calRow = reminkoCalendarRowForMal(mal);
        }
        if (reminkoCalendarRowPromisesNewEpisode(calRow, last)) return false;

        const updated = Date.parse((anime._kodik && anime._kodik.updatedAt) || '');
        const RECENT_MS = 60 * 86400000;
        if (Number.isFinite(updated) && Date.now() - updated < RECENT_MS) return false;

        return true;
    }

    function reminkoEffectiveAnimeStatus(anime) {
        if (!anime) return '';
        if (reminkoIsAnimeCatalogFinished(anime)) return 'Завершён';
        const st = String(anime.status || '');
        const last = parseInt(anime._kodik && anime._kodik.lastEpisode, 10);
        const released = Number.isFinite(last) ? Math.max(0, last) : 0;
        const hasLink = !!(anime._kodik && anime._kodik.link);

        // Shiki-календарь — приоритетнее ярлыка Kodik «Анонс»
        const mal = parseInt(anime.mal_id, 10);
        if (Number.isFinite(mal) && mal > 0 && typeof reminkoShikimoriCalendarRowForMal === 'function') {
            const row = reminkoShikimoriCalendarRowForMal(mal);
            const cst = String((row && row.status) || '').toLowerCase();
            if (cst === 'ongoing' || cst === 'currently airing') return 'Онгоинг';
            if (cst === 'released' || cst === 'finished') return 'Завершён';
        }

        // Jikan raw на виртуальной карточке
        const js = anime._jikanRaw && String(anime._jikanRaw.status || '');
        if (js === 'Currently Airing') return 'Онгоинг';
        if (js === 'Finished Airing') return 'Завершён';

        // Кривой «Анонс» у уже доступных фильмов / сериалов с сериями/плеером
        if (st === 'Анонс') {
            if (anime.type === 'Фильм' && (hasLink || released >= 1)) return 'Завершён';
            if (released >= 1) {
                const total = parseInt(anime.totalEpisodes, 10) || 0;
                if (total > 0 && released >= total) return 'Завершён';
                return 'Онгоинг';
            }
            // Есть плеер Kodik у «анонса» без серий — не прячем как чистый анонс в фильтре
            if (hasLink && anime.type === 'Сериал') return 'Онгоинг';
        }
        return st;
    }

    function reminkoIsTrueAiringAnime(anime) {
        if (!anime) return false;
        return reminkoEffectiveAnimeStatus(anime) === 'Онгоинг';
    }

    function reminkoIsCalendarRowFinished(row, meta) {
        if (meta && reminkoIsAnimeCatalogFinished(meta)) return true;
        const st = String((row && row.status) || '').toLowerCase();
        if (st === 'released' || st === 'finished') return true;
        return false;
    }

    /** Детские / ежедневные мультсериалы — не показываем в анонсах календаря. */
    const REMINKO_KIDS_CARTOON_MAL = new Set([
        966, 1960, 235, 2406, 6149, 8687, 53876, 56566, 32353, 50418, 60534, 50250, 18941, 63356,
        62933, 63383, 63150, 63403, 64357, 63641, 62683, 62856, 63042, 63352, 37096, 42295
    ]);

    const REMINKO_KIDS_GENRE_NAMES = new Set(['kids', 'детское', 'детский']);

    function reminkoCatalogMetaForCalendarRow(row, metaByMal) {
        const mal = parseInt(row && row.mal_id, 10);
        if (!Number.isFinite(mal) || mal <= 0 || !metaByMal) return null;
        return metaByMal.get(mal) || null;
    }

    function reminkoRowHasKidsGenre(meta) {
        if (!meta || !Array.isArray(meta.genres)) return false;
        return meta.genres.some((g) => {
            const n = String(g || '')
                .trim()
                .toLowerCase();
            return REMINKO_KIDS_GENRE_NAMES.has(n);
        });
    }

    function reminkoRowTitleLooksLikeKidsCartoon(row, meta) {
        const title = String((row && row.title_ru) || (meta && meta.title) || '')
            .trim()
            .toLowerCase();
        if (!title) return false;
        const patterns = [
            /анпанман/,
            /дораэмон/,
            /покемон/,
            /син-тян/,
            /садзаэ/,
            /маруко/,
            /bono\s*bono|боно\s*боно/,
            /ниндзяла/,
            /shimajirou|шимаджиро/,
            /томика\s+и\s+том/,
            /копэн/,
            /кумарба/,
            /асибэ/,
            /карамелька/,
            /табакошка/,
            /планозавр/,
            /тикава/,
            /бейблэйд/,
            /отряд\s+мистики/,
            /qq\s+гома/,
            /детектив\s+конан/,
            /detective\s+conan/
        ];
        return patterns.some((re) => re.test(title));
    }

    function reminkoIsMislabeledOngoingPremiere(row, meta) {
        if (!meta || meta.status !== 'Онгоинг') return false;
        const last =
            meta._kodik && meta._kodik.lastEpisode != null
                ? parseInt(meta._kodik.lastEpisode, 10)
                : NaN;
        if (Number.isFinite(last) && last >= 2) return true;
        const ep = parseInt(row && row.next_episode, 10) || 1;
        return ep <= 1 && Number.isFinite(last) && last >= 1;
    }

    /** Детский мульт / долгий ежедневный сериал — скрываем из календарных анонсов. */
    function reminkoIsKidsCartoonCalendarRow(row, catalogMeta) {
        const mal = parseInt(row && row.mal_id, 10);
        if (Number.isFinite(mal) && mal > 0 && REMINKO_KIDS_CARTOON_MAL.has(mal)) return true;
        if (reminkoRowHasKidsGenre(catalogMeta)) return true;
        if (reminkoRowTitleLooksLikeKidsCartoon(row, catalogMeta)) return true;
        if (reminkoIsMislabeledOngoingPremiere(row, catalogMeta)) return true;
        return false;
    }

    /** Настоящая премьера: 1-я серия, не детский мульт и не уже идущий онгоинг. */
    function reminkoIsTrueCalendarAnnounced(row, catalogMeta) {
        const ep = parseInt(row && row.next_episode, 10) || 1;
        if (ep > 1) return false;
        if (!row || !row.next_at || !Number.isFinite(Date.parse(row.next_at))) return false;
        if (reminkoIsKidsCartoonCalendarRow(row, catalogMeta)) return false;
        if (catalogMeta && catalogMeta.status === 'Онгоинг') {
            const last =
                catalogMeta._kodik && catalogMeta._kodik.lastEpisode != null
                    ? parseInt(catalogMeta._kodik.lastEpisode, 10)
                    : NaN;
            if (Number.isFinite(last) && last >= 1) return false;
        }
        return true;
    }

    /** Онгоинги (след. серия > 1) и анонсы (премьера, ep ≤ 1), без дублей mal_id. */
    function reminkoSplitCalendarRows(items, metaByMal) {
        const now = Date.now();
        const airing = [];
        const announced = [];
        const seenAiringMal = new Set();
        const seenAnnouncedMal = new Set();
        for (const row of items || []) {
            const mal = parseInt(row.mal_id, 10);
            const t = Date.parse(row.next_at);
            if (!Number.isFinite(t) || t <= now) continue;
            const ep = parseInt(row.next_episode, 10) || 1;
            const meta =
                metaByMal && typeof metaByMal.get === 'function'
                    ? reminkoCatalogMetaForCalendarRow(row, metaByMal)
                    : null;
            if (ep <= 1) {
                if (!reminkoIsTrueCalendarAnnounced(row, meta)) continue;
                if (Number.isFinite(mal) && mal > 0) {
                    if (seenAnnouncedMal.has(mal)) continue;
                    seenAnnouncedMal.add(mal);
                }
                announced.push(row);
            } else {
                if (reminkoIsCalendarRowFinished(row, meta)) continue;
                if (Number.isFinite(mal) && mal > 0) {
                    if (seenAiringMal.has(mal)) continue;
                    seenAiringMal.add(mal);
                }
                airing.push(row);
            }
        }
        const byTime = (a, b) => Date.parse(a.next_at) - Date.parse(b.next_at);
        airing.sort(byTime);
        announced.sort(byTime);
        return { airing, announced };
    }

    function reminkoFormatReleaseDateShort(iso) {
        const t = Date.parse(iso);
        if (Number.isNaN(t)) return '';
        return new Date(t).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function reminkoAnimeNeedsEpisodeCountdown(anime) {
        if (!anime || anime.type === 'Фильм') return false;
        if (anime.status === 'Анонс') return true;
        return reminkoIsTrueAiringAnime(anime);
    }

    function reminkoResolveAnimeCountdownIso(anime, shiki) {
        if (!anime) return '';
        const mal = parseInt(anime.mal_id, 10);
        const cal =
            (Number.isFinite(mal) && mal > 0 && typeof reminkoCalendarRowForMal === 'function'
                ? reminkoCalendarRowForMal(mal)
                : null) ||
            anime._calendarRow ||
            anime._calendar;
        const iso = reminkoResolveCountdownTargetIso(anime, shiki || null, {
            calendar: cal,
            _calendar: cal
        });
        return iso && Date.parse(iso) > Date.now() ? iso : '';
    }

    function reminkoApplyCompactCountdown(el, iso) {
        if (!el || !iso) return;
        el.hidden = false;
        el.setAttribute('data-countdown-iso', String(iso));
        reminkoStartLiveCountdown(el, iso, {
            compact: true,
            unknownText: '',
            expiredText: 'ждём расписание'
        });
    }

    global.reminkoIsAnimeCatalogFinished = reminkoIsAnimeCatalogFinished;
    global.reminkoEffectiveAnimeStatus = reminkoEffectiveAnimeStatus;
    global.reminkoIsTrueAiringAnime = reminkoIsTrueAiringAnime;
    global.reminkoAnimeNeedsEpisodeCountdown = reminkoAnimeNeedsEpisodeCountdown;
    global.reminkoResolveAnimeCountdownIso = reminkoResolveAnimeCountdownIso;
    global.reminkoApplyCompactCountdown = reminkoApplyCompactCountdown;
    global.reminkoRuUnit = reminkoRuUnit;
    global.reminkoBroadcastToNextIso = reminkoBroadcastToNextIso;
    global.reminkoIsAiringAnimeStatus = reminkoIsAiringAnimeStatus;
    global.reminkoIsAnnouncedAnimeStatus = reminkoIsAnnouncedAnimeStatus;
    global.reminkoRollDataFromContext = reminkoRollDataFromContext;
    global.reminkoShikimoriCountdownCandidates = reminkoShikimoriCountdownCandidates;
    global.reminkoResolveCountdownTargetIso = reminkoResolveCountdownTargetIso;
    global.reminkoCountdownParts = reminkoCountdownParts;
    global.reminkoStartLiveCountdown = reminkoStartLiveCountdown;
    global.reminkoStopLiveCountdown = reminkoStopLiveCountdown;
    global.reminkoStopAllLiveCountdowns = reminkoStopAllLiveCountdowns;
    global.reminkoLoadCalendarData = reminkoLoadCalendarData;
    global.reminkoLoadShikimoriCalendarData = reminkoLoadShikimoriCalendarData;
    global.reminkoLoadAllCalendarData = reminkoLoadAllCalendarData;
    global.reminkoCalendarRowForMal = reminkoCalendarRowForMal;
    global.reminkoShikimoriCalendarRowForMal = reminkoShikimoriCalendarRowForMal;
    global.reminkoMergedCalendarItems = reminkoMergedCalendarItems;
    global.reminkoSplitCalendarRows = reminkoSplitCalendarRows;
    global.reminkoIsKidsCartoonCalendarRow = reminkoIsKidsCartoonCalendarRow;
    global.reminkoIsTrueCalendarAnnounced = reminkoIsTrueCalendarAnnounced;
    global.reminkoFormatReleaseDateShort = reminkoFormatReleaseDateShort;
})(typeof window !== 'undefined' ? window : globalThis);

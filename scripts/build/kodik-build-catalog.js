#!/usr/bin/env node
/**
 * Сборка компактного каталога аниме из дампов Kodik (папка «kodik base»).
 *
 * Запуск из корня проекта (4h3j5h3g534h5g34jh534):
 *   node scripts/build/kodik-build-catalog.js
 *
 * Вход:  kodik base/anime-serial.json, kodik base/anime.json
 * Выход: data/kodik-anime-catalog.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const announcedFilter = require('../kodik-announced-filter.js');

const ROOT = path.resolve(__dirname, '../..');
const DUMP_DIR = path.join(ROOT, 'kodik base');
const OUT_FILE = path.join(ROOT, 'data', 'kodik-anime-catalog.json');
const OUT_CALENDAR = path.join(ROOT, 'data', 'kodik-calendar.json');
const OUT_ANNOUNCED = path.join(ROOT, 'data', 'kodik-announced.json');
const KODIK_ID_BASE = 20_000_000;
const KODIK_ID_FILM_BASE = 20_500_000;
const KODIK_ID_NO_MAL_BASE = 21_000_000;
const KODIK_ID_NO_MAL_FILM_BASE = 21_500_000;

const PREFERRED_TRANSLATIONS = [
    'anilibria',
    'animy',
    'anidub',
    'shiza',
    'studio band',
    'animevost',
    'сибир',
    'dreamcast',
    'japanese',
    'english',
];

function readJson(name) {
    const p = path.join(DUMP_DIR, name);
    if (!fs.existsSync(p)) {
        console.error('Нет файла:', p);
        process.exit(1);
    }
    console.log('Читаю', name, '…');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function normalizeGenre(g) {
    if (!g || typeof g !== 'string') return '';
    const t = g.trim();
    if (!t) return '';
    return t.charAt(0).toUpperCase() + t.slice(1);
}

function cleanText(value) {
    if (!value || typeof value !== 'string') return '';
    return value
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeDedupeText(value) {
    let out = String(value || '').toLowerCase().trim();
    try {
        out = out.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {
        /* ignore */
    }
    return out
        .replace(/ё/g, 'е')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/\([^)]*\b\d{4}\b[^)]*\)/g, ' ')
        .replace(/[^a-zа-я0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function noMalDedupeKey(item) {
    const title = normalizeDedupeText(item.titleAlt || item.title);
    const ruTitle = normalizeDedupeText(item.title || '');
    const base = title || ruTitle;
    if (!base) return '';
    return [item.type || '', item.year || '', base].join('|');
}

function releasedEpisodeCount(row) {
    const md = row.material_data || {};
    // Не зануляем last_episode только из‑за material status=anons:
    // у Kodik часто «anons» висит на уже вышедших фильмах/сезонах.
    const candidates = [row.last_episode, md.episodes_aired]
        .map((v) => parseInt(v, 10))
        .filter((n) => Number.isFinite(n) && n >= 0);
    return candidates.length ? Math.max(...candidates) : 0;
}

function mapStatus(row, isSerial) {
    const md = row.material_data || {};
    const st = String(md.anime_status || md.all_status || '').toLowerCase();
    const released = releasedEpisodeCount(row);
    const total =
        parseInt(md.episodes_total, 10) ||
        parseInt(row.episodes_count, 10) ||
        0;
    const hasPlayer = !!(row.link || row.player_link);

    // Сначала факты (серии / finished), потом ярлык anons из material_data
    if (st === 'released' || st === 'finished') return 'Завершён';
    if (st === 'ongoing' || st === 'currently airing') return 'Онгоинг';
    if (!isSerial && hasPlayer) return 'Завершён';
    if (total > 0 && released >= total && released > 0) return 'Завершён';
    if (released > 0) return 'Онгоинг';
    if (st === 'anons' || st === 'announcement') return 'Анонс';
    if (row.last_episode != null && parseInt(row.last_episode, 10) === 0) return 'Анонс';
    return 'Анонс';
}

function pickRating(row) {
    const md = row.material_data || {};
    const r =
        parseFloat(md.shikimori_rating) ||
        parseFloat(md.kinopoisk_rating) ||
        parseFloat(md.imdb_rating) ||
        0;
    return Math.round(r * 10) / 10 || 0;
}

function translationScore(row) {
    let s = 0;
    const tr = String(row.translation?.title || row.translate || '').toLowerCase();
    const type = String(row.translation?.type || '').toLowerCase();
    if (type === 'voice') s += 40;
    if (/[а-яё]/i.test(row.title || '')) s += 25;
    for (let i = 0; i < PREFERRED_TRANSLATIONS.length; i++) {
        if (tr.includes(PREFERRED_TRANSLATIONS[i])) s += 80 - i;
    }
    s += (parseInt(row.last_episode, 10) || 0) * 0.1;
    s += (parseInt(row.last_season, 10) || 1) * 0.05;
    return s;
}

function isAdultGenreLabel(name) {
    const n = String(name || '')
        .toLowerCase()
        .trim();
    if (!n) return false;
    return (
        n.includes('hentai') ||
        n.includes('хентай') ||
        n.includes('erotic') ||
        n.includes('эротик') ||
        n.includes('для взрослых') ||
        n === 'rx' ||
        n === 'adult'
    );
}

function pickGenresForCatalog(genresRaw) {
    const all = [...new Set((genresRaw || []).map(normalizeGenre).filter(Boolean))];
    const adult = all.filter(isAdultGenreLabel);
    const rest = all.filter((g) => !isAdultGenreLabel(g));
    // Adult-жанры всегда в выходном списке (не срезать .slice(0,8))
    return [...adult, ...rest].slice(0, Math.max(8, adult.length));
}

function rowToCatalog(row, isSerial) {
    const md = row.material_data || {};
    const mal = row.shikimori_id != null ? parseInt(row.shikimori_id, 10) : null;
    const genresRaw = md.anime_genres || md.genres || md.all_genres || [];
    const genres = pickGenresForCatalog(genresRaw);
    const contentRating = String(md.rating_mpaa || md.mpaa_rating || md.age_rating || '').trim();
    const isAdult =
        genres.some(isAdultGenreLabel) ||
        /rx|hentai/i.test(contentRating) ||
        genresRaw.some((g) => isAdultGenreLabel(g));
    const year = parseInt(row.year, 10) || parseInt(md.year, 10) || null;
    const totalEp = parseInt(md.episodes_total, 10) || parseInt(row.episodes_count, 10) || 1;
    const title =
        (row.title && String(row.title).trim()) ||
        (md.anime_title && String(md.anime_title).trim()) ||
        (md.title && String(md.title).trim()) ||
        '—';
    const titleAlt =
        (row.title_orig && String(row.title_orig).trim()) ||
        (md.title_en && String(md.title_en).trim()) ||
        (row.other_title && String(row.other_title).split('/')[0].trim()) ||
        '';
    const posterSearchTitles = [
        titleAlt,
        md.title_en,
        md.title,
        row.title_orig,
        row.other_title,
        md.anime_title
    ]
        .flatMap((t) => String(t || '').split('/'))
        .map((t) => t.trim())
        .filter((t) => t.length > 1);
    const uniquePosterSearch = [...new Set(posterSearchTitles.map((t) => t.toLowerCase()))].map(
        (lower) => posterSearchTitles.find((t) => t.toLowerCase() === lower)
    );
    const posterUrl = md.anime_poster_url || md.poster_url || '';
    const studio = Array.isArray(md.anime_studios) && md.anime_studios[0] ? md.anime_studios[0] : '';
    const description = cleanText(md.description || '');
    const releasedEp = isSerial ? releasedEpisodeCount(row) : 1;
    const safeTotalEp = isSerial ? Math.max(totalEp, releasedEp || 0, 1) : 1;
    const id =
        mal != null && !Number.isNaN(mal)
            ? (isSerial ? KODIK_ID_BASE : KODIK_ID_FILM_BASE) + mal
            : null;

    return {
        id,
        mal_id: mal,
        title,
        titleAlt,
        _posterSearchTitles: uniquePosterSearch.filter((t) => t && t !== title),
        year,
        genres,
        episodes: isSerial ? (releasedEp > 0 ? `1-${releasedEp}` : '0') : '1',
        totalEpisodes: safeTotalEp,
        status: mapStatus(row, isSerial),
        type: isSerial ? 'Сериал' : 'Фильм',
        rating: pickRating(row),
        contentRating,
        isAdult: !!isAdult,
        description,
        studio,
        duration: md.duration || '',
        posterUrl,
        isKodikCatalog: true,
        _kodik: {
            link: row.link || row.player_link || '',
            kodikId: row.id || '',
            isSerial: !!isSerial,
            lastSeason: parseInt(row.last_season, 10) || 1,
            lastEpisode: releasedEp,
            translation: row.translation?.title || row.translate || '',
            updatedAt: row.updated_at || '',
        },
        _kodikScore: translationScore(row),
        _sourceRow: row,
    };
}

function dedupeRows(rows, isSerial) {
    const byMal = new Map();
    const noMal = [];

    for (const row of rows) {
        const item = rowToCatalog(row, isSerial);
        if (item.mal_id != null && !Number.isNaN(item.mal_id)) {
            const prev = byMal.get(item.mal_id);
            if (!prev || item._kodikScore > prev._kodikScore) {
                byMal.set(item.mal_id, item);
            }
        } else {
            noMal.push(item);
        }
    }

    const out = [...byMal.values()];
    let orphanIdx = 0;
    const orphanBase = isSerial ? KODIK_ID_NO_MAL_BASE : KODIK_ID_NO_MAL_FILM_BASE;
    const noMalByTitle = new Map();
    for (const item of noMal) {
        const key = noMalDedupeKey(item);
        if (!key) {
            const fallbackKey = `__orphan_${orphanIdx}_${item._kodik?.kodikId || item.title || ''}`;
            noMalByTitle.set(fallbackKey, item);
            continue;
        }
        const prev = noMalByTitle.get(key);
        if (!prev || item._kodikScore > prev._kodikScore) {
            noMalByTitle.set(key, item);
        }
    }

    for (const item of noMalByTitle.values()) {
        item.id = orphanBase + orphanIdx++;
        delete item._kodikScore;
        delete item._sourceRow;
        out.push(item);
    }

    for (const item of out) {
        if (item._kodikScore != null) delete item._kodikScore;
        if (item._sourceRow != null) delete item._sourceRow;
    }

    return out;
}

function normalizeCalendarRow(row) {
    if (!row || typeof row !== 'object') return null;
    const mal = parseInt(
        row.mal_id ??
            row.shikimori_id ??
            row.anime_id ??
            row.anime?.id ??
            row.anime?.mal_id ??
            row.anime?.shikimori_id,
        10
    );
    if (!Number.isFinite(mal) || mal <= 0) return null;
    const nextEpisode = parseInt(
        row.next_episode ?? row.nextEpisode ?? row.episode ?? row.episode_number ?? row.number,
        10
    );
    const nextAt =
        row.next_episode_at ||
        row.next_at ||
        row.nextEpisodeAt ||
        row.date ||
        row.release_at ||
        row.releaseAt ||
        null;
    if (!nextAt) return null;

    const anime = row.anime || {};
    let posterUrl = row.posterUrl || '';
    const imgPath = anime.image && anime.image.original ? String(anime.image.original) : '';
    if (!posterUrl && imgPath && !imgPath.toLowerCase().includes('missing_')) {
        posterUrl = imgPath.startsWith('http')
            ? imgPath
            : `https://shikimori.io${imgPath.startsWith('/') ? imgPath : `/${imgPath}`}`;
    }

    const episodesAired = parseInt(row.episodes_aired ?? anime.episodes_aired, 10);
    const episodesTotal = parseInt(row.episodes ?? anime.episodes, 10);

    return {
        mal_id: mal,
        next_episode: Number.isFinite(nextEpisode) ? nextEpisode : null,
        next_at: nextAt,
        title_ru: row.title_ru || row.title || anime.russian || anime.title || anime.name || '',
        title_en: row.title_en || anime.name || '',
        kind: row.kind || anime.kind || '',
        status: row.status || anime.status || '',
        episodes_aired: Number.isFinite(episodesAired) ? episodesAired : null,
        // 0 у Shiki = неизвестно; не путаем с «всего 0»
        episodes: Number.isFinite(episodesTotal) && episodesTotal > 0 ? episodesTotal : null,
        score: parseFloat(row.score ?? anime.score) || 0,
        posterUrl: posterUrl || '',
    };
}

function buildAnnouncedFile(calendarPayload, catalogMalIds, catalogItems) {
    const calPath = path.join(DUMP_DIR, 'calendar.json');
    if (!fs.existsSync(calPath)) {
        console.warn('Нет calendar.json — пропуск kodik-announced.json');
        return;
    }
    const raw = calendarPayload?.raw || JSON.parse(fs.readFileSync(calPath, 'utf8'));
    const arr = Array.isArray(raw) ? raw : [];
    const nowMs = Date.now();
    const items = [];
    const metaByMal = new Map();
    for (const item of catalogItems || []) {
        const mal = parseInt(item.mal_id, 10);
        if (Number.isFinite(mal) && mal > 0) metaByMal.set(mal, item);
    }

    for (const row of arr) {
        const normalized = normalizeCalendarRow(row);
        if (!normalized) continue;
        const meta = metaByMal.get(normalized.mal_id) || null;
        if (!announcedFilter.isKodikAnnouncedRow(normalized, meta, nowMs)) continue;
        const kind = String(row.kind || normalized.kind || '').toLowerCase();
        const isFilm = kind === 'movie' || kind === 'mv' || kind === 'film';
        items.push({
            ...normalized,
            kind: kind || normalized.kind || '',
            type: isFilm ? 'Фильм' : 'Сериал',
            inCatalog: catalogMalIds.has(normalized.mal_id),
        });
    }

    items.sort((a, b) => Date.parse(a.next_at) - Date.parse(b.next_at));

    const payload = {
        meta: {
            builtAt: new Date().toISOString(),
            source: 'kodik base/calendar.json',
            criteria:
                'Kodik calendar: status anons, премьера (ep≤1, aired=0), без детских мультсериалов',
            count: items.length,
            serialCount: items.filter((i) => i.type === 'Сериал').length,
            filmCount: items.filter((i) => i.type === 'Фильм').length,
        },
        items,
    };

    fs.mkdirSync(path.dirname(OUT_ANNOUNCED), { recursive: true });
    fs.writeFileSync(OUT_ANNOUNCED, JSON.stringify(payload), 'utf8');
    console.log(
        `Анонсы Kodik: ${items.length} (сериалы ${payload.meta.serialCount}, фильмы ${payload.meta.filmCount}) → ${OUT_ANNOUNCED}`
    );
}

function buildCalendarFile() {
    const calPath = path.join(DUMP_DIR, 'calendar.json');
    if (!fs.existsSync(calPath)) {
        console.warn('Нет calendar.json — пропуск kodik-calendar.json');
        return { items: [], raw: [] };
    }
    const raw = JSON.parse(fs.readFileSync(calPath, 'utf8'));
    const arr = Array.isArray(raw) ? raw : [];
    const items = [];
    for (const row of arr) {
        const normalized = normalizeCalendarRow(row);
        if (normalized) items.push(normalized);
    }
    fs.mkdirSync(path.dirname(OUT_CALENDAR), { recursive: true });
    fs.writeFileSync(
        OUT_CALENDAR,
        JSON.stringify({ builtAt: new Date().toISOString(), count: items.length, items }),
        'utf8'
    );
    console.log(`Календарь: ${items.length} тайтлов → ${OUT_CALENDAR}`);
    return { items, raw: arr };
}

function main() {
    const serial = readJson('anime-serial.json');
    const movies = readJson('anime.json');
    if (!Array.isArray(serial) || !Array.isArray(movies)) {
        console.error('Ожидались JSON-массивы');
        process.exit(1);
    }

    const catalog = dedupeRows(serial, true).concat(dedupeRows(movies, false));
    catalog.sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.title).localeCompare(String(b.title), 'ru'));

    const meta = {
        builtAt: new Date().toISOString(),
        source: 'kodik base/anime-serial.json + anime.json',
        count: catalog.length,
        idBase: KODIK_ID_BASE,
    };

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify({ meta, items: catalog }), 'utf8');

    const mb = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
    console.log(`Готово: ${catalog.length} тайтлов → ${OUT_FILE} (${mb} MB)`);

    const catalogMalIds = new Set(
        catalog.map((item) => parseInt(item.mal_id, 10)).filter((mal) => Number.isFinite(mal) && mal > 0)
    );
    const calendarPayload = buildCalendarFile();
    buildAnnouncedFile(calendarPayload, catalogMalIds, catalog);
}

main();

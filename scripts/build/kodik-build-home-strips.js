#!/usr/bin/env node
/**
 * Лёгкие ленты главной из полного каталога Kodik.
 *
 * Запуск:
 *   node scripts/build/kodik-build-home-strips.js
 *
 * Вход:  data/kodik-anime-catalog.json, data/kodik-calendar.json
 * Выход: data/kodik-home-strips.json (~десятки KB вместо ~17 MB)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const announcedFilter = require('../kodik-announced-filter.js');

const ROOT = path.resolve(__dirname, '../..');
const CAT_FILE = path.join(ROOT, 'data', 'kodik-anime-catalog.json');
const CAL_FILE = path.join(ROOT, 'data', 'kodik-calendar.json');
const OUT_FILE = path.join(ROOT, 'data', 'kodik-home-strips.json');

const AIRING_LIMIT = 20;
const POPULAR_LIMIT = 36;
const POPULAR_YEAR_FROM = 2022;
const POPULAR_YEAR_TO = 2026;
const POPULAR_MIN_RATING = 7.7;

function readJson(file) {
    if (!fs.existsSync(file)) {
        console.error('Нет файла:', file);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function kodikReleasedEpisodes(anime) {
    if (!anime) return 0;
    if (anime._kodik && anime._kodik.lastEpisode != null) {
        const n = parseInt(anime._kodik.lastEpisode, 10);
        if (Number.isFinite(n)) return Math.max(0, n);
    }
    if (anime.episodes === '0' || anime.episodes === 0) return 0;
    const epStr = anime.episodes != null ? String(anime.episodes).trim() : '';
    if (epStr) {
        const range = epStr.match(/(\d+)\s*-\s*(\d+)/);
        if (range) {
            const hi = parseInt(range[2], 10);
            if (Number.isFinite(hi) && hi > 0) return hi;
            const lo = parseInt(range[1], 10);
            if (Number.isFinite(lo) && lo > 0) return lo;
        }
        const single = parseInt(epStr, 10);
        if (Number.isFinite(single) && single > 0) return single;
    }
    const total = parseInt(anime.totalEpisodes, 10);
    if (anime.status === 'Онгоинг' && Number.isFinite(total) && total > 0) return Math.max(1, total);
    if (anime.status === 'Онгоинг') return 1;
    return 0;
}

function isAnnounced(anime) {
    if (!anime) return false;
    if (anime.isKodikCalendarAnnounced || anime.isCalendarAnnounced) return true;
    return anime.status === 'Анонс' && anime.type === 'Сериал' && kodikReleasedEpisodes(anime) === 0;
}

function isAiring(anime) {
    if (!anime || isAnnounced(anime)) return false;
    if (anime.status !== 'Онгоинг') return false;
    if (anime.type === 'Фильм') return true;
    return kodikReleasedEpisodes(anime) >= 1;
}

function isKids(anime) {
    if (!anime || typeof announcedFilter.isKidsCartoonRow !== 'function') return false;
    return announcedFilter.isKidsCartoonRow(
        { mal_id: anime.mal_id, title_ru: anime.title, title: anime.title },
        anime
    );
}

function isCalendarFilm(row) {
    if (!row) return false;
    if (row.type === 'Фильм') return true;
    const k = String(row.kind || '').toLowerCase();
    return k === 'movie' || k === 'mv' || k === 'film';
}

function popularYear(anime) {
    const y = parseInt(anime && anime.year, 10);
    return Number.isFinite(y) ? y : 0;
}

function isPopular(anime) {
    if (!anime || isAnnounced(anime)) return false;
    const year = popularYear(anime);
    if (year < POPULAR_YEAR_FROM || year > POPULAR_YEAR_TO) return false;
    if ((anime.rating || 0) < POPULAR_MIN_RATING) return false;
    return anime.status === 'Завершён' || anime.status === 'Онгоинг';
}

function slimCard(anime, calByMal) {
    const mal = parseInt(anime.mal_id, 10);
    const cal = Number.isFinite(mal) ? calByMal.get(mal) : null;
    const k = anime._kodik || {};
    const out = {
        id: anime.id,
        mal_id: anime.mal_id,
        title: anime.title || '',
        titleAlt: anime.titleAlt || '',
        year: anime.year || 0,
        genres: Array.isArray(anime.genres) ? anime.genres.slice(0, 3) : [],
        episodes: anime.episodes,
        totalEpisodes: anime.totalEpisodes,
        status: anime.status || '',
        type: anime.type || '',
        rating: Number(anime.rating) || 0,
        posterUrl: anime.posterUrl || '',
        isKodikCatalog: true,
        _kodik: {
            lastEpisode: k.lastEpisode != null ? k.lastEpisode : null,
            updatedAt: k.updatedAt || null,
            link: k.link ? 1 : 0,
        },
        _kodikScore: Number(anime._kodikScore) || Number(k.score) || 0,
    };
    if (cal) {
        out._calendar = {
            mal_id: mal,
            next_at: cal.next_at || cal.nextAt || '',
            next_episode: cal.next_episode || cal.nextEpisode || null,
            posterUrl: cal.posterUrl || '',
            kind: cal.kind || '',
            title_ru: cal.title_ru || '',
            title_en: cal.title_en || '',
        };
        out._calendarRow = out._calendar;
    }
    return out;
}

function pickAiringSerial(items, calByMal, calMalSet) {
    const list = items.filter((a) => a.type === 'Сериал' && isAiring(a) && !isKids(a));
    list.sort((a, b) => {
        const am = parseInt(a.mal_id, 10);
        const bm = parseInt(b.mal_id, 10);
        const ap = Number.isFinite(am) && calMalSet.has(am) ? 2 : 0;
        const bp = Number.isFinite(bm) && calMalSet.has(bm) ? 2 : 0;
        if (bp !== ap) return bp - ap;
        const ac = Number.isFinite(am) ? calByMal.get(am) : null;
        const bc = Number.isFinite(bm) ? calByMal.get(bm) : null;
        const at = ac && (ac.next_at || ac.nextAt) ? Date.parse(ac.next_at || ac.nextAt) || Infinity : Infinity;
        const bt = bc && (bc.next_at || bc.nextAt) ? Date.parse(bc.next_at || bc.nextAt) || Infinity : Infinity;
        if (at !== bt) return at - bt;
        const ar = a.rating || 0;
        const br = b.rating || 0;
        if (br !== ar) return br - ar;
        return 0;
    });
    return list.slice(0, AIRING_LIMIT).map((a) => slimCard(a, calByMal));
}

function filmReleaseDate(anime, calByMal) {
    const mal = parseInt(anime.mal_id, 10);
    const cal = Number.isFinite(mal) ? calByMal.get(mal) : null;
    if (cal && isCalendarFilm(cal)) {
        const t = Date.parse(cal.next_at || cal.nextAt);
        if (Number.isFinite(t)) return new Date(t);
    }
    if (anime._kodik && anime._kodik.updatedAt) {
        const t = Date.parse(anime._kodik.updatedAt);
        if (Number.isFinite(t)) return new Date(t);
    }
    return null;
}

function pickAiringFilms(items, calByMal) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const list = items.filter((a) => {
        if (a.type !== 'Фильм' || isAnnounced(a)) return false;
        const d = filmReleaseDate(a, calByMal);
        if (!d || d.getTime() > Date.now()) return false;
        return d.getFullYear() === y && d.getMonth() === m;
    });
    list.sort((a, b) => {
        const da = filmReleaseDate(a, calByMal);
        const db = filmReleaseDate(b, calByMal);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0) || (b.rating || 0) - (a.rating || 0);
    });
    return list.slice(0, AIRING_LIMIT).map((a) => slimCard(a, calByMal));
}

function pickPopular(items, calByMal, type) {
    const list = items.filter((a) => a.type === type && isPopular(a));
    list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || popularYear(b) - popularYear(a));
    return list.slice(0, POPULAR_LIMIT).map((a) => slimCard(a, calByMal));
}

function main() {
    console.log('Читаю каталог…');
    const cat = readJson(CAT_FILE);
    const items = Array.isArray(cat.items) ? cat.items : [];
    const calRaw = readJson(CAL_FILE);
    const calItems = Array.isArray(calRaw.items) ? calRaw.items : Array.isArray(calRaw) ? calRaw : [];

    const calByMal = new Map();
    const calMalSet = new Set();
    for (const row of calItems) {
        const mal = parseInt(row.mal_id, 10);
        if (!Number.isFinite(mal) || mal <= 0) continue;
        calByMal.set(mal, row);
        calMalSet.add(mal);
    }

    const out = {
        meta: {
            builtAt: new Date().toISOString(),
            source: 'kodik-anime-catalog.json + kodik-calendar.json',
            catalogCount: (cat.meta && cat.meta.count) || items.length,
            airingLimit: AIRING_LIMIT,
            popularLimit: POPULAR_LIMIT,
            popularYearFrom: POPULAR_YEAR_FROM,
            popularYearTo: POPULAR_YEAR_TO,
            popularMinRating: POPULAR_MIN_RATING,
        },
        airing: {
            serial: pickAiringSerial(items, calByMal, calMalSet),
            film: pickAiringFilms(items, calByMal),
        },
        popular: {
            serial: pickPopular(items, calByMal, 'Сериал'),
            film: pickPopular(items, calByMal, 'Фильм'),
        },
    };

    fs.writeFileSync(OUT_FILE, JSON.stringify(out), 'utf8');
    const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
    console.log(
        `OK ${OUT_FILE} (${kb} KB) airing=${out.airing.serial.length}/${out.airing.film.length} popular=${out.popular.serial.length}/${out.popular.film.length}`
    );
}

main();

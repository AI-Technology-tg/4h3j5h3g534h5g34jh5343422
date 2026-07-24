#!/usr/bin/env node
/**
 * Чинит статусы в data/kodik-anime-catalog.json без полного дампа Kodik
 * и пересобирает data/kodik-announced.json из календаря + фильтра.
 *
 *   node scripts/build/sanitize-catalog-statuses.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const announcedFilter = require('../kodik-announced-filter.js');

const ROOT = path.resolve(__dirname, '../..');
const CAT_PATH = path.join(ROOT, 'data', 'kodik-anime-catalog.json');
const CAL_PATH = path.join(ROOT, 'data', 'kodik-calendar.json');
const ANN_PATH = path.join(ROOT, 'data', 'kodik-announced.json');

function releasedOf(item) {
    const last = parseInt(item && item._kodik && item._kodik.lastEpisode, 10);
    if (Number.isFinite(last) && last >= 0) return last;
    const epStr = String((item && item.episodes) || '').trim();
    const range = epStr.match(/(\d+)\s*-\s*(\d+)/);
    if (range) return parseInt(range[2], 10) || 0;
    const n = parseInt(epStr, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function isAdultGenreLabel(name) {
    const n = String(name || '')
        .toLowerCase()
        .trim();
    return (
        n.includes('hentai') ||
        n.includes('хентай') ||
        n.includes('erotic') ||
        n.includes('эротик') ||
        n.includes('для взрослых')
    );
}

function sanitizeItem(item) {
    if (!item || typeof item !== 'object') return item;
    const hasLink = !!(item._kodik && item._kodik.link);
    const released = releasedOf(item);
    const st = String(item.status || '');
    const type = String(item.type || '');
    let next = item;

    // Фильмы с плеером / серией — уже вышли, не «Анонс»
    if (type === 'Фильм' && st === 'Анонс' && (hasLink || released >= 1)) {
        next = { ...next, status: 'Завершён' };
    } else if (type === 'Сериал' && st === 'Анонс' && released >= 1) {
        const total = parseInt(item.totalEpisodes, 10) || 0;
        if (total > 0 && released >= total) next = { ...next, status: 'Завершён' };
        else next = { ...next, status: 'Онгоинг' };
    }

    const genres = Array.isArray(next.genres) ? next.genres : [];
    const rating = String(next.contentRating || '').toLowerCase();
    if (
        !next.isAdult &&
        (genres.some(isAdultGenreLabel) || rating.includes('rx') || rating.includes('hentai'))
    ) {
        next = { ...next, isAdult: true };
    }
    return next;
}

function main() {
    const cat = JSON.parse(fs.readFileSync(CAT_PATH, 'utf8'));
    const items = Array.isArray(cat.items) ? cat.items : [];
    let changed = 0;
    const nextItems = items.map((it) => {
        const fixed = sanitizeItem(it);
        if (fixed.status !== it.status) changed += 1;
        return fixed;
    });
    cat.items = nextItems;
    cat.meta = {
        ...(cat.meta || {}),
        sanitizedAt: new Date().toISOString(),
        statusFixes: changed,
    };
    fs.writeFileSync(CAT_PATH, JSON.stringify(cat), 'utf8');
    console.log(`Каталог: исправлено статусов ${changed} / ${items.length}`);

    const metaByMal = new Map();
    for (const item of nextItems) {
        const mal = parseInt(item.mal_id, 10);
        if (Number.isFinite(mal) && mal > 0) metaByMal.set(mal, item);
    }

    const cal = JSON.parse(fs.readFileSync(CAL_PATH, 'utf8'));
    const calItems = Array.isArray(cal.items) ? cal.items : [];
    const nowMs = Date.now();
    const announced = [];
    for (const row of calItems) {
        if (!announcedFilter.isKodikAnnouncedRow(row, metaByMal.get(parseInt(row.mal_id, 10)) || null, nowMs)) {
            continue;
        }
        const kind = String(row.kind || '').toLowerCase();
        const isFilm = kind === 'movie' || kind === 'mv' || kind === 'film';
        announced.push({
            ...row,
            type: isFilm ? 'Фильм' : 'Сериал',
            inCatalog: metaByMal.has(parseInt(row.mal_id, 10)),
        });
    }
    announced.sort((a, b) => Date.parse(a.next_at) - Date.parse(b.next_at));
    const payload = {
        meta: {
            builtAt: new Date().toISOString(),
            source: 'data/kodik-calendar.json + sanitize',
            criteria:
                'status anons, премьера (ep≤1, aired=0), без детских; каталог Онгоинг/Завершён/плеер — вне списка',
            count: announced.length,
            serialCount: announced.filter((i) => i.type === 'Сериал').length,
            filmCount: announced.filter((i) => i.type === 'Фильм').length,
        },
        items: announced,
    };
    fs.writeFileSync(ANN_PATH, JSON.stringify(payload), 'utf8');
    console.log(
        `Анонсы: ${announced.length} (сериалы ${payload.meta.serialCount}, фильмы ${payload.meta.filmCount})`
    );
    console.log(
        'titles:',
        announced.map((a) => a.title_ru).join(' | ')
    );
}

main();

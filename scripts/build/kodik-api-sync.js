#!/usr/bin/env node
/**
 * Скачивание свежих данных Kodik API в "kodik base".
 * Токен берется из KODIK_API_TOKEN или из config.local.js -> kodik.apiToken.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DUMP_DIR = path.join(ROOT, 'kodik base');
const API_ORIGIN = (process.env.KODIK_API_ORIGIN || 'https://kodik-api.com').replace(/\/$/, '');
const LIMIT = Math.min(100, Math.max(1, parseInt(process.env.KODIK_API_LIMIT || '100', 10) || 100));
const PAGE_DELAY_MS = Math.max(100, parseInt(process.env.KODIK_API_PAGE_DELAY_MS || '350', 10) || 350);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadTokenFromLocalConfig() {
    const p = path.join(ROOT, 'config.local.js');
    if (!fs.existsSync(p)) return '';
    const text = fs.readFileSync(p, 'utf8');
    const patterns = [/apiToken\s*:\s*['"]([^'"]+)['"]/, /KODIK_API_TOKEN\s*=\s*['"]([^'"]+)['"]/];
    for (const re of patterns) {
        const m = text.match(re);
        const value = m && m[1] ? String(m[1]).trim() : '';
        if (value && !/ваш|your|token/i.test(value)) return value;
    }
    return '';
}

function loadToken() {
    return String(process.env.KODIK_API_TOKEN || '').trim() || loadTokenFromLocalConfig();
}

function buildUrl(apiPath, params) {
    const url = new URL(API_ORIGIN + apiPath);
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== '') {
            url.searchParams.set(key, String(value));
        }
    });
    return url;
}

async function fetchJson(url) {
    const res = await fetch(url);
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (_) {
        throw new Error(`Kodik ответ не JSON: ${text.slice(0, 160)}`);
    }
    if (!res.ok) {
        const msg = (json && (json.error || json.message)) || text.slice(0, 160);
        throw new Error(`Kodik HTTP ${res.status}: ${msg}`);
    }
    return json;
}

function extractRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
}

function nextPageUrl(payload) {
    const raw =
        payload?.next_page ||
        payload?.nextPage ||
        payload?.next ||
        payload?.pagination?.next_page ||
        payload?.pagination?.next;
    return raw && typeof raw === 'string' ? raw : '';
}

async function fetchKodikList(type, token) {
    const rows = [];
    let nextUrl = '';
    const seenUrls = new Set();

    while (seenUrls.size <= 1000) {
        const url = nextUrl
            ? new URL(nextUrl, API_ORIGIN)
            : buildUrl('/list', {
                  token,
                  types: type,
                  with_material_data: 'true',
                  limit: LIMIT,
              });

        if (seenUrls.has(url.toString())) break;
        seenUrls.add(url.toString());

        const payload = await fetchJson(url);
        const chunk = extractRows(payload);
        rows.push(...chunk);
        process.stdout.write(`\r${type}: ${rows.length} записей`);

        const fromPayload = nextPageUrl(payload);
        if (fromPayload) {
            nextUrl = fromPayload;
        } else {
            break;
        }
        await sleep(PAGE_DELAY_MS);
    }

    process.stdout.write('\n');
    return rows;
}

function normalizeCalendarRows(payload) {
    const raw = extractRows(payload);
    if (raw.length) return raw;
    if (payload && typeof payload === 'object') {
        const nested = Object.values(payload).find((value) => Array.isArray(value));
        if (nested) return nested;
    }
    return [];
}

async function fetchCalendar(token) {
    for (const apiPath of ['/calendar', '/calendar/anime']) {
        try {
            const payload = await fetchJson(buildUrl(apiPath, { token }));
            const rows = normalizeCalendarRows(payload);
            if (rows.length) return rows;
        } catch (_) {
            /* Some Kodik accounts/endpoints do not expose calendar. */
        }
    }
    return null;
}

/** Fallback: Shikimori calendar (когда Kodik /calendar пустой в CI). */
async function fetchShikimoriCalendarFallback() {
    const res = await fetch('https://shikimori.io/api/calendar', {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'Re-Minko-KodikSync/1.0'
        },
        redirect: 'follow'
    });
    if (!res.ok) throw new Error('Shikimori calendar HTTP ' + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

function writeJsonAtomic(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
    fs.renameSync(tmp, file);
}

async function main() {
    const token = loadToken();
    if (!token) {
        throw new Error('Не найден KODIK_API_TOKEN. Задайте env KODIK_API_TOKEN или kodik.apiToken в config.local.js.');
    }

    console.log('Kodik API sync: загрузка свежих списков...');
    const serial = await fetchKodikList('anime-serial', token);
    const movies = await fetchKodikList('anime', token);

    if (serial.length < 100 || movies.length < 10) {
        throw new Error(`Слишком мало данных Kodik: anime-serial=${serial.length}, anime=${movies.length}. Файлы не заменены.`);
    }

    writeJsonAtomic(path.join(DUMP_DIR, 'anime-serial.json'), serial);
    writeJsonAtomic(path.join(DUMP_DIR, 'anime.json'), movies);

    let calendar = await fetchCalendar(token);
    let calendarSource = 'kodik';
    if (!calendar || !calendar.length) {
        try {
            calendar = await fetchShikimoriCalendarFallback();
            calendarSource = 'shikimori';
            console.log(`calendar: Kodik пуст → Shikimori fallback (${calendar.length})`);
        } catch (e) {
            console.warn('calendar: Shikimori fallback failed:', e && e.message ? e.message : e);
            calendar = null;
        }
    }

    if (calendar && calendar.length) {
        writeJsonAtomic(path.join(DUMP_DIR, 'calendar.json'), calendar);
        console.log(`calendar: ${calendar.length} записей (${calendarSource})`);
    } else if (fs.existsSync(path.join(DUMP_DIR, 'calendar.json'))) {
        console.log('calendar: API не вернул календарь, оставлен текущий kodik base/calendar.json');
    } else {
        console.warn('calendar: нет данных и нет локального файла — анонсы/таймеры не обновятся');
    }

    console.log(`Kodik API sync готов: serial=${serial.length}, movies=${movies.length}`);
}

main().catch((err) => {
    console.error('[kodik-api-sync]', err && err.message ? err.message : err);
    process.exit(1);
});

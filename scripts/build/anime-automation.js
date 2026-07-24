#!/usr/bin/env node
/**
 * Автоматизация anime-данных после сборки Kodik:
 * - уточняет статус "Анонс / Онгоинг / Завершён" по реально вышедшим сериям и календарю;
 * - добавляет календарные поля к карточкам;
 * - заранее считает похожие аниме для страницы просмотра;
 * - опционально дополняет пустые постеры/описания через публичные API.
 *
 * Запуск:
 *   node scripts/build/anime-automation.js
 *   node scripts/build/anime-automation.js --enrich-missing --limit=80
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CATALOG_FILE = path.join(ROOT, 'data', 'kodik-anime-catalog.json');
const CALENDAR_FILE = path.join(ROOT, 'data', 'kodik-calendar.json');
const CACHE_FILE = path.join(ROOT, 'data', 'anime-enrichment-cache.json');
const REPORT_FILE = path.join(ROOT, 'data', 'anime-automation-report.json');

const DEFAULT_SIMILAR_LIMIT = 16;
const API_DELAY_MS = 750;

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        enrichMissing: args.includes('--enrich-missing'),
        limit: 60,
        similarLimit: DEFAULT_SIMILAR_LIMIT,
    };
    for (const a of args) {
        const limit = a.match(/^--limit=(\d+)$/);
        if (limit) opts.limit = Math.max(0, parseInt(limit[1], 10) || 0);
        const similar = a.match(/^--similar-limit=(\d+)$/);
        if (similar) opts.similarLimit = Math.max(4, parseInt(similar[1], 10) || DEFAULT_SIMILAR_LIMIT);
    }
    return opts;
}

function readJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

function toInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function cleanText(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function looksRussian(value) {
    return /[а-яё]/i.test(String(value || ''));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCatalogPayload() {
    const payload = readJson(CATALOG_FILE, null);
    if (!payload) throw new Error(`Нет ${CATALOG_FILE}. Сначала запустите build:kodik.`);
    const items = Array.isArray(payload) ? payload : payload.items;
    if (!Array.isArray(items)) throw new Error('Некорректный формат data/kodik-anime-catalog.json');
    return { payload, items };
}

function buildCalendarMap() {
    const calendar = readJson(CALENDAR_FILE, null);
    const rows = (calendar && calendar.items) || (Array.isArray(calendar) ? calendar : []);
    const map = new Map();
    for (const row of rows || []) {
        const mal = toInt(row && row.mal_id, NaN);
        if (Number.isFinite(mal) && mal > 0) map.set(mal, row);
    }
    return map;
}

function releasedEpisodes(anime) {
    const values = [
        anime && anime._kodik && anime._kodik.lastEpisode,
        anime && anime.episodes,
    ];
    let best = 0;
    for (const value of values) {
        const s = String(value || '');
        const range = s.match(/(\d+)\s*-\s*(\d+)/);
        const n = range ? parseInt(range[2], 10) : parseInt(s, 10);
        if (Number.isFinite(n)) best = Math.max(best, n);
    }
    return Math.max(0, best);
}

function statusBucket(status) {
    if (status === 'Анонс') return 'announced';
    if (status === 'Завершён') return 'released';
    return 'airing';
}

function normalizeStatuses(items, calendarMap) {
    const stats = { announced: 0, airing: 0, released: 0, movedFromAnnounced: 0, withCalendar: 0 };
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    for (const anime of items) {
        if (!anime) continue;
        const before = anime.status || '';
        const mal = toInt(anime.mal_id, NaN);
        const cal = Number.isFinite(mal) ? calendarMap.get(mal) : null;
        const released = releasedEpisodes(anime);
        const total = toInt(anime.totalEpisodes, 0);
        const isSerial = anime.type !== 'Фильм';

        if (cal) {
            const nextAtMs = Date.parse(cal.next_at || '');
            const calendarActive = Number.isFinite(nextAtMs) && nextAtMs > nowMs;
            stats.withCalendar += 1;
            anime._calendar = {
                nextEpisode: toInt(cal.next_episode, null),
                nextAt: cal.next_at || null,
                active: calendarActive,
                state: calendarActive ? 'scheduled' : 'stale',
            };
        } else {
            delete anime._calendar;
        }

        const nextEp = anime._calendar ? toInt(anime._calendar.nextEpisode, 0) : 0;
        const calendarSaysMore =
            !!(anime._calendar && anime._calendar.active) ||
            (nextEp > 0 && nextEp > released);

        if (isSerial) {
            if (released > 0) {
                if (anime.status === 'Анонс') stats.movedFromAnnounced += 1;
                // Активный календарь / next > released важнее ложного «Завершён» от Kodik
                if (calendarSaysMore || anime.status !== 'Завершён') {
                    anime.status = 'Онгоинг';
                }
                anime.episodes = `1-${released}`;
            } else if (cal || before === 'Анонс') {
                anime.status = 'Анонс';
                anime.episodes = '0';
            }

            // Kodik часто ставит episodes_total = числу уже вышедших серий → ложный финал
            if (calendarSaysMore) {
                anime.status = 'Онгоинг';
            } else if (
                anime.status !== 'Анонс' &&
                total > 0 &&
                released >= total &&
                !calendarSaysMore
            ) {
                anime.status = 'Завершён';
            }

            // Итог серий из Shiki/календаря (как у Re:Zero = 19), если Kodik врёт «всего = вышедшим»
            const calTotal = cal ? toInt(cal.episodes, 0) : 0;
            if (calTotal > 0) {
                anime.totalEpisodes = Math.max(calTotal, released || 0);
            } else if (
                calendarSaysMore &&
                total > 0 &&
                released > 0 &&
                total <= released
            ) {
                // финал неизвестен (Shiki episodes=0) — не утверждаем «всего N»
                anime.episodesTotalUnknown = true;
            }
        }

        anime._automation = {
            bucket: statusBucket(anime.status),
            releasedEpisodes: released,
            totalEpisodes: toInt(anime.totalEpisodes, total) || null,
            nextEpisode: anime._calendar && anime._calendar.active ? anime._calendar.nextEpisode : null,
            nextAt: anime._calendar && anime._calendar.active ? anime._calendar.nextAt : null,
            scheduleState: anime._calendar ? anime._calendar.state : 'none',
            updatedAt: nowIso,
        };
        stats[anime._automation.bucket] += 1;
    }

    return stats;
}

function norm(value) {
    let out = String(value || '').toLowerCase().trim();
    try {
        out = out.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {
        /* ignore */
    }
    return out.replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleTokens(anime) {
    return new Set(
        norm(`${anime.title || ''} ${anime.titleAlt || ''}`)
            .split(' ')
            .filter((x) => x.length >= 4)
            .slice(0, 20)
    );
}

function genreKeys(anime) {
    return (anime.genres || []).map(norm).filter(Boolean);
}

function buildSimilarMeta(anime) {
    const genres = genreKeys(anime);
    return {
        anime,
        id: anime && anime.id != null ? String(anime.id) : '',
        mal: anime && anime.mal_id != null ? String(anime.mal_id) : '',
        genres,
        genreSet: new Set(genres),
        tokens: titleTokens(anime),
        type: anime.type || '',
        status: anime.status || '',
        studio: norm(anime.studio || ''),
        year: toInt(anime.year, 0),
        rating: parseFloat(anime.rating) || 0,
    };
}

function similarityScore(aMeta, bMeta) {
    const ag = aMeta.genreSet;
    const bg = bMeta.genres;
    let genreHit = 0;
    for (const g of bg) {
        if (ag.has(g)) genreHit += 1;
    }
    if (genreHit === 0) return 0;

    let score = genreHit * 10;
    const genreUnion = new Set([...aMeta.genres, ...bg]).size || 1;
    score += (genreHit / genreUnion) * 12;

    if (aMeta.type && bMeta.type && aMeta.type === bMeta.type) score += 4;
    if (aMeta.status && bMeta.status && aMeta.status === bMeta.status) score += 2;
    if (aMeta.studio && bMeta.studio && aMeta.studio === bMeta.studio) score += 4;

    if (aMeta.year && bMeta.year) score += Math.max(0, 6 - Math.min(6, Math.abs(aMeta.year - bMeta.year)));

    score += Math.min(4, bMeta.rating / 2.5);

    for (const t of aMeta.tokens) {
        if (bMeta.tokens.has(t)) score += 2;
    }

    return Math.round(score * 10) / 10;
}

function buildGenreIndex(metas) {
    const index = new Map();
    metas.forEach((meta, idx) => {
        for (const g of meta.genres) {
            if (!index.has(g)) index.set(g, new Set());
            index.get(g).add(idx);
        }
    });
    const out = new Map();
    for (const [genre, set] of index.entries()) {
        out.set(
            genre,
            [...set].sort((a, b) => metas[b].rating - metas[a].rating || metas[b].year - metas[a].year)
        );
    }
    return out;
}

function computeSimilar(items, limit) {
    const metas = items.map(buildSimilarMeta);
    const genreIndex = buildGenreIndex(metas);
    let withSimilar = 0;
    const perGenreCandidateLimit = 900;

    for (let i = 0; i < items.length; i += 1) {
        const anime = items[i];
        if (!anime || anime.id == null) continue;
        const meta = metas[i];
        const candidates = new Set();
        for (const g of meta.genres) {
            const ids = genreIndex.get(g);
            if (!ids) continue;
            ids.slice(0, perGenreCandidateLimit).forEach((idx) => candidates.add(idx));
        }

        const scored = [];

        for (const idx of candidates) {
            if (idx === i) continue;
            const otherMeta = metas[idx];
            if (!otherMeta || !otherMeta.id) continue;
            if (otherMeta.id === meta.id) continue;
            if (meta.mal && otherMeta.mal && otherMeta.mal === meta.mal) continue;
            const score = similarityScore(meta, otherMeta);
            if (score > 0) scored.push({ id: otherMeta.anime.id, score });
        }

        scored.sort((x, y) => y.score - x.score || String(x.id).localeCompare(String(y.id)));
        anime.similarIds = scored.slice(0, limit).map((x) => x.id);
        if (anime.similarIds.length) withSimilar += 1;
    }

    return { withSimilar };
}

async function fetchJson(url, options) {
    const res = await fetch(url, options || {});
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
    return text ? JSON.parse(text) : null;
}

async function fetchEnrichment(malId) {
    const out = {};
    try {
        const jikan = await fetchJson(`https://api.jikan.moe/v4/anime/${malId}/full`);
        const data = jikan && jikan.data;
        if (data) {
            out.posterUrl = data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || '';
            out.titleAlt = data.title_english || data.title || '';
        }
    } catch (_) {
        /* public API fallback below */
    }

    await sleep(350);
    try {
        const shiki = await fetchJson(`https://shikimori.one/api/animes/${malId}`, {
            headers: { 'User-Agent': 'Re-Minko automation metadata updater' },
        });
        const ruDesc = cleanText(shiki.description_html || shiki.description || '');
        if (ruDesc && looksRussian(ruDesc)) out.description = ruDesc;
        if (shiki.russian) out.title = shiki.russian;
        if (!out.posterUrl && shiki.image && shiki.image.original) {
            out.posterUrl = `https://shikimori.one${shiki.image.original}`;
        }
    } catch (_) {
        /* ignore */
    }

    if (!out.description || !out.posterUrl) {
        await sleep(350);
        try {
            const anilist = await fetchJson('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query:
                        'query ($malId: Int) { Media(idMal: $malId, type: ANIME) { title { romaji english native } coverImage { extraLarge large } description(asHtml: false) } }',
                    variables: { malId: Number(malId) },
                }),
            });
            const media = anilist && anilist.data && anilist.data.Media;
            if (media) {
                if (!out.posterUrl) out.posterUrl = media.coverImage?.extraLarge || media.coverImage?.large || '';
                const aniDesc = cleanText(media.description || '');
                if (!out.description && looksRussian(aniDesc)) out.description = aniDesc;
                if (!out.titleAlt) out.titleAlt = media.title?.english || media.title?.romaji || media.title?.native || '';
            }
        } catch (_) {
            /* ignore */
        }
    }

    return out;
}

async function fetchRussianDescriptionByMal(malId) {
    const out = {};
    try {
        const shiki = await fetchJson(`https://shikimori.one/api/animes/${malId}`, {
            headers: { 'User-Agent': 'Re-Minko automation metadata updater' },
        });
        const ruDesc = cleanText(shiki.description_html || shiki.description || '');
        if (ruDesc && looksRussian(ruDesc)) out.description = ruDesc;
        if (shiki.russian) out.title = shiki.russian;
        if (shiki.image && shiki.image.original) {
            out.posterUrl = `https://shikimori.one${shiki.image.original}`;
        }
    } catch (_) {
        /* ignore */
    }
    return out;
}

function titleCacheKey(anime) {
    const title = norm(`${anime && anime.title ? anime.title : ''} ${anime && anime.year ? anime.year : ''}`);
    return title.length >= 3 ? title : '';
}

async function fetchEnrichmentByTitle(anime) {
    const q = String((anime && (anime.titleAlt || anime.title)) || '').trim();
    if (!q || q === '—') return {};
    const out = {};
    try {
        const search = await fetchJson(
            `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=5&order_by=members&sort=desc`
        );
        const list = (search && search.data) || [];
        if (!list.length) return out;
        const year = toInt(anime && anime.year, 0);
        const picked =
            list.find((row) => year && toInt(row.year, 0) === year) ||
            list.find((row) => row && row.type && String(row.type).toLowerCase() !== 'music') ||
            list[0];
        if (!picked) return out;
        out.posterUrl = picked.images?.jpg?.large_image_url || picked.images?.jpg?.image_url || '';
        out.titleAlt = picked.title_english || picked.title || '';
        out.mal_id = picked.mal_id || null;
    } catch (_) {
        /* ignore */
    }
    return out;
}

function itemNeedsEnrichment(anime) {
    if (!anime || (!anime.mal_id && !titleCacheKey(anime))) return false;
    return !String(anime.description || '').trim() || !String(anime.posterUrl || '').trim();
}

function enrichmentPriority(anime) {
    const bucket = anime && anime._automation && anime._automation.bucket;
    let score = 0;
    if (bucket === 'announced') score += 1000;
    if (bucket === 'airing') score += 700;
    if (anime && anime._calendar) score += 250;
    if (!String(anime.posterUrl || '').trim()) score += 80;
    if (!String(anime.description || '').trim()) score += 40;
    score += Math.min(40, (parseFloat(anime && anime.rating) || 0) * 4);
    const y = toInt(anime && anime.year, 0);
    if (y >= 2025) score += 30;
    else if (y >= 2023) score += 15;
    return score;
}

async function enrichMissing(items, limit) {
    const cache = readJson(CACHE_FILE, { meta: {}, byMal: {}, byTitle: {} });
    if (!cache.byMal || typeof cache.byMal !== 'object') cache.byMal = {};
    if (!cache.byTitle || typeof cache.byTitle !== 'object') cache.byTitle = {};
    let requested = 0;
    let applied = 0;

    const candidates = items
        .filter(itemNeedsEnrichment)
        .sort((a, b) => enrichmentPriority(b) - enrichmentPriority(a));

    for (const anime of candidates) {
        const mal = anime.mal_id ? String(anime.mal_id) : '';
        const titleKey = titleCacheKey(anime);
        let extra = mal ? cache.byMal[mal] : cache.byTitle[titleKey];
        if (!extra && requested < limit) {
            requested += 1;
            const onlyNeedsRussianDescription =
                mal &&
                String(anime.posterUrl || '').trim() &&
                !String(anime.description || '').trim();
            extra = onlyNeedsRussianDescription
                ? await fetchRussianDescriptionByMal(mal)
                : mal
                  ? await fetchEnrichment(mal)
                  : await fetchEnrichmentByTitle(anime);
            const cached = Object.assign({ fetchedAt: new Date().toISOString() }, extra || {});
            if (mal) cache.byMal[mal] = cached;
            else if (titleKey) cache.byTitle[titleKey] = cached;
            if (requested % 10 === 0) writeJson(CACHE_FILE, cache);
            await sleep(API_DELAY_MS);
        }
        if (!extra) continue;
        if (!anime.posterUrl && extra.posterUrl) {
            anime.posterUrl = extra.posterUrl;
            applied += 1;
        }
        if (!anime.description && extra.description && looksRussian(extra.description)) {
            anime.description = extra.description;
            applied += 1;
        }
        if ((!anime.title || anime.title === '—') && extra.title) anime.title = extra.title;
        if (!anime.titleAlt && extra.titleAlt) anime.titleAlt = extra.titleAlt;
        if (!anime.mal_id && extra.mal_id) anime.mal_id = extra.mal_id;
    }

    cache.meta = {
        updatedAt: new Date().toISOString(),
        count: Object.keys(cache.byMal).length + Object.keys(cache.byTitle).length,
        byMal: Object.keys(cache.byMal).length,
        byTitle: Object.keys(cache.byTitle).length,
    };
    writeJson(CACHE_FILE, cache);
    return {
        requested,
        applied,
        cached: cache.meta.count,
        byMal: cache.meta.byMal,
        byTitle: cache.meta.byTitle,
    };
}

async function main() {
    const opts = parseArgs();
    const { payload, items } = loadCatalogPayload();
    const calendarMap = buildCalendarMap();

    const statusStats = normalizeStatuses(items, calendarMap);
    const similarStats = computeSimilar(items, opts.similarLimit);
    const enrichStats = await enrichMissing(items, opts.enrichMissing ? opts.limit : 0);

    if (payload && payload.meta) {
        payload.meta.automatedAt = new Date().toISOString();
        payload.meta.automation = {
            status: statusStats,
            similar: similarStats,
            enrich: enrichStats,
        };
    }

    writeJson(CATALOG_FILE, payload);
    writeJson(REPORT_FILE, {
        builtAt: new Date().toISOString(),
        count: items.length,
        status: statusStats,
        similar: similarStats,
        enrich: enrichStats,
        files: {
            catalog: 'data/kodik-anime-catalog.json',
            report: 'data/anime-automation-report.json',
            cache: opts.enrichMissing ? 'data/anime-enrichment-cache.json' : null,
        },
    });

    console.log(
        `Anime automation: ${items.length} тайтлов, похожие: ${similarStats.withSimilar}, ` +
            `анонсы: ${statusStats.announced}, выходит: ${statusStats.airing}, завершено: ${statusStats.released}` +
            (enrichStats ? `, enrichment requests: ${enrichStats.requested}` : '')
    );
}

main().catch((err) => {
    console.error('[anime-automation]', err && err.stack ? err.stack : err);
    process.exit(1);
});

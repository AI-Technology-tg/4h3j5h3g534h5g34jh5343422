#!/usr/bin/env node
/**
 * Генерация sitemap.xml для re-minko-anime.com
 * Запуск: node scripts/build/generate-sitemap.js
 *
 * В карту попадают только публичные страницы для поиска.
 * Политика / условия / удаление аккаунта — НЕ включаем (noindex + robots Disallow).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'sitemap.xml');
const SITE = 'https://re-minko-anime.com';
const MAX_URLS = 45000;

function readJson(rel) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.warn('[sitemap] skip', rel, e.message);
        return null;
    }
}

function todayStamp() {
    return new Date().toISOString().slice(0, 10);
}

function urlEntry(loc, priority, changefreq, lastmod) {
    const lm = lastmod || todayStamp();
    return (
        `  <url>\n` +
        `    <loc>${loc}</loc>\n` +
        `    <lastmod>${lm}</lastmod>\n` +
        `    <changefreq>${changefreq || 'weekly'}</changefreq>\n` +
        `    <priority>${priority || '0.6'}</priority>\n` +
        `  </url>`
    );
}

function main() {
    const urls = [];
    const stamp = todayStamp();

    /** Публичные indexable-страницы (без legal / личного кабинета / манги). */
    const staticPages = [
        ['/', '1.0', 'daily'],
        ['/catalog/anime.html', '0.95', 'daily'],
        ['/catalog/calendar.html', '0.9', 'daily'],
        ['/catalog/anime-4k.html', '0.85', 'weekly'],
        ['/minko-ai.html', '0.85', 'weekly'],
        ['/info.html', '0.65', 'monthly']
    ];

    staticPages.forEach(([p, pr, cf]) => {
        urls.push(urlEntry(`${SITE}${p}`, pr, cf, stamp));
    });

    const kodik = readJson('data/kodik-anime-catalog.json');
    const animeItems = (kodik && kodik.items) || (Array.isArray(kodik) ? kodik : []);
    const catalogStamp =
        (kodik && (kodik.generatedAt || kodik.updatedAt || kodik.updated_at) &&
            String(kodik.generatedAt || kodik.updatedAt || kodik.updated_at).slice(0, 10)) ||
        stamp;

    animeItems.slice(0, MAX_URLS - urls.length).forEach((a) => {
        if (!a || a.id == null) return;
        urls.push(
            urlEntry(
                `${SITE}/anime/view.html?id=${encodeURIComponent(String(a.id))}`,
                '0.8',
                'weekly',
                catalogStamp
            )
        );
    });

    const xml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.join('\n') +
        '\n</urlset>\n';

    fs.writeFileSync(OUT, xml, 'utf8');
    console.log(`Sitemap: ${OUT} (${urls.length} URL, lastmod=${stamp})`);
}

main();

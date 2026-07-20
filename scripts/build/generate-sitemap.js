#!/usr/bin/env node
/**
 * Генерация sitemap.xml для re-minko-anime.com
 * Запуск: node scripts/build/generate-sitemap.js
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

function urlEntry(loc, priority, changefreq) {
    return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq || 'weekly'}</changefreq>\n    <priority>${priority || '0.6'}</priority>\n  </url>`;
}

function main() {
    const urls = [];

    /** Публичные indexable-страницы (без noindex в HTML и _headers). */
    const staticPages = [
        ['/', '1.0', 'daily'],
        ['/catalog/anime.html', '0.95', 'daily'],
        ['/catalog/calendar.html', '0.9', 'daily'],
        ['/catalog/anime-4k.html', '0.85', 'weekly'],
        ['/minko-ai.html', '0.85', 'weekly'],
        ['/info.html', '0.7', 'weekly'],
        ['/account-deletion.html', '0.3', 'yearly'],
    ];

    staticPages.forEach(([p, pr, cf]) => {
        urls.push(urlEntry(`${SITE}${p}`, pr, cf));
    });

    const kodik = readJson('data/kodik-anime-catalog.json');
    const animeItems = (kodik && kodik.items) || (Array.isArray(kodik) ? kodik : []);
    animeItems.slice(0, MAX_URLS - urls.length - 5000).forEach((a) => {
        if (!a || a.id == null) return;
        urls.push(urlEntry(`${SITE}/anime/view.html?id=${encodeURIComponent(String(a.id))}`, '0.8', 'weekly'));
    });

    const xml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.join('\n') +
        '\n</urlset>\n';

    fs.writeFileSync(OUT, xml, 'utf8');
    console.log(`Sitemap: ${OUT} (${urls.length} URL)`);
}

main();

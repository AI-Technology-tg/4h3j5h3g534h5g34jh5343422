#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const dl = {
    calendar: JSON.parse(fs.readFileSync('c:/Users/Minko/Downloads/calendar.json', 'utf8')),
    anime: JSON.parse(fs.readFileSync('c:/Users/Minko/Downloads/anime.json', 'utf8')),
    serial: JSON.parse(fs.readFileSync('c:/Users/Minko/Downloads/anime-serial.json', 'utf8')),
};
const siteCat = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/kodik-anime-catalog.json'), 'utf8'));
const siteCal = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/kodik-calendar.json'), 'utf8')).items;
const siteItems = siteCat.items;
const now = Date.now();

function malFromCalRow(r) {
    const a = r.anime || {};
    return parseInt(r.mal_id ?? r.shikimori_id ?? a.id ?? a.mal_id ?? a.shikimori_id, 10);
}
function normCal(rows) {
    return rows
        .map((r) => ({
            mal_id: malFromCalRow(r),
            next_episode: parseInt(r.next_episode ?? r.nextEpisode, 10) || null,
            next_at: r.next_episode_at || r.next_at || null,
            title: r.title_ru || r.anime?.russian || r.anime?.name || r.title || '',
        }))
        .filter((r) => r.mal_id > 0);
}
const dlCalN = normCal(dl.calendar);
const siteCalMap = new Map(siteCal.map((r) => [r.mal_id, r]));
const dlCalMap = new Map(dlCalN.map((r) => [r.mal_id, r]));

const onlyDl = [...dlCalMap.keys()].filter((m) => !siteCalMap.has(m));
const onlySite = [...siteCalMap.keys()].filter((m) => !dlCalMap.has(m));
const both = [...dlCalMap.keys()].filter((m) => siteCalMap.has(m));

const dateMismatch = [];
for (const mal of both) {
    const d = dlCalMap.get(mal);
    const s = siteCalMap.get(mal);
    const dAt = Date.parse(d.next_at || '');
    const sAt = Date.parse(s.next_at || '');
    if (d.next_episode !== s.next_episode || Math.abs(dAt - sAt) > 60000) {
        dateMismatch.push({
            mal,
            title: d.title || s.title_ru,
            dl_ep: d.next_episode,
            site_ep: s.next_episode,
            dl_at: d.next_at,
            site_at: s.next_at,
        });
    }
}

console.log('=== CALENDAR ===');
console.log('Fresh DL:', dlCalN.length, '| Site repo:', siteCal.length);
console.log('Future dates — DL:', dlCalN.filter((r) => Date.parse(r.next_at) > now).length);
console.log('Future dates — site:', siteCal.filter((r) => Date.parse(r.next_at) > now).length);
console.log('Only in fresh DL:', onlyDl.length, '| only on site:', onlySite.length, '| overlap:', both.length);
console.log('Ep/date mismatch in overlap:', dateMismatch.length);
console.log('Sample mismatches:');
dateMismatch.slice(0, 10).forEach((m) => console.log(' ', JSON.stringify(m)));

function malFromRow(r) {
    const md = r.material_data || r;
    return parseInt(md.shikimori_id ?? md.myanimelist_id ?? md.mal_id ?? r.shikimori_id, 10);
}
const dlMal = new Set();
for (const r of [...dl.serial, ...dl.anime]) {
    const m = malFromRow(r);
    if (m > 0) dlMal.add(m);
}
const siteMal = new Set(siteItems.map((i) => i.mal_id).filter(Boolean));
const siteOnly = [...siteMal].filter((m) => !dlMal.has(m));
const dlOnly = [...dlMal].filter((m) => !siteMal.has(m));

console.log('\n=== CATALOG (MAL) ===');
console.log('Raw Kodik rows — serial:', dl.serial.length, 'films:', dl.anime.length);
console.log('Unique MAL in dumps:', dlMal.size, '| in site catalog:', siteMal.size);
console.log('On site but missing in fresh dumps:', siteOnly.length);
console.log('In dumps but not in site catalog:', dlOnly.length);
console.log('Site builtAt:', siteCat.meta?.builtAt);

const siteStatus = {};
for (const i of siteItems) siteStatus[i.status] = (siteStatus[i.status] || 0) + 1;
console.log('Site status:', siteStatus);

const staleOngoing = siteCal.filter((r) => {
    if (Date.parse(r.next_at) > now) return false;
    const item = siteItems.find((i) => i.mal_id === r.mal_id);
    return item && item.status === 'Онгоинг';
});
console.log('\nStale calendar + still Онгоинг on site:', staleOngoing.length);
staleOngoing.slice(0, 5).forEach((r) => {
    const fresh = dlCalMap.get(r.mal_id);
    console.log(' ', r.mal_id, r.title_ru, 'site', r.next_at, 'fresh', fresh?.next_at || '—');
});

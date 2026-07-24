/**
 * Сборка data/kodik-calendar.json из kodik base/calendar.json
 * Запуск: node scripts/build/kodik-build-calendar.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const src = path.join(root, 'kodik base', 'calendar.json');
const out = path.join(root, 'data', 'kodik-calendar.json');

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const arr = Array.isArray(raw) ? raw : raw.items || [];
const items = [];

for (const row of arr) {
    const mal = parseInt(row.anime?.id || row.mal_id, 10);
    if (!Number.isFinite(mal) || mal <= 0) continue;
    const next_at = row.next_episode_at || row.next_at || null;
    if (!next_at) continue;
    const episodesTotal = parseInt(row.episodes ?? row.anime?.episodes, 10);
    const episodesAired = parseInt(row.episodes_aired ?? row.anime?.episodes_aired, 10);
    items.push({
        mal_id: mal,
        title_ru: (row.anime?.russian || row.anime?.name || row.title_ru || '').trim(),
        next_at: String(next_at),
        next_episode: parseInt(row.next_episode, 10) || 1,
        status: row.status || row.anime?.status || '',
        episodes: Number.isFinite(episodesTotal) && episodesTotal > 0 ? episodesTotal : null,
        episodes_aired: Number.isFinite(episodesAired) ? episodesAired : null
    });
}

items.sort((a, b) => Date.parse(a.next_at) - Date.parse(b.next_at));

const payload = {
    meta: {
        builtAt: new Date().toISOString(),
        source: 'kodik base/calendar.json',
        count: items.length
    },
    items
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload));
console.log('[kodik-build-calendar] wrote', items.length, 'rows to', out);

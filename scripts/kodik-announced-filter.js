/**
 * Фильтр анонсов Kodik: только status=anons, без детских мультсериалов.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.ReminkoKodikAnnouncedFilter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const KIDS_MAL = new Set([
        966, 1960, 235, 2406, 6149, 8687, 53876, 56566, 32353, 50418, 60534, 50250, 18941, 63356,
        62933, 63383, 63150, 63403, 64357, 63641, 62683, 62856, 63042, 63352, 37096, 42295, 63011,
        63512, 64502, 63142, 63219, 41458,
    ]);

    const KIDS_GENRE = new Set(['kids', 'детское', 'детский']);

    const KIDS_TITLE_PATTERNS = [
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
        /тиби-годзилла/,
        /chibi\s+godzilla/,
        /кардбот|cardbot/,
        /мэйсаку|meisaku/,
        /всезнайка/,
        /счастливая\s+улыбка/,
        /origami\s+ninja/,
        /детектив\s+конан/,
        /detective\s+conan/,
    ];

    function norm(value) {
        return String(value || '')
            .trim()
            .toLowerCase();
    }

    function catalogMetaHasKidsGenre(meta) {
        if (!meta || !Array.isArray(meta.genres)) return false;
        return meta.genres.some((g) => KIDS_GENRE.has(norm(g)));
    }

    function titleLooksLikeKidsCartoon(row, meta) {
        const title = norm((row && (row.title_ru || row.title)) || (meta && meta.title) || '');
        if (!title) return false;
        return KIDS_TITLE_PATTERNS.some((re) => re.test(title));
    }

    function isKidsCartoonRow(row, catalogMeta) {
        const mal = parseInt(row && row.mal_id, 10);
        if (Number.isFinite(mal) && mal > 0 && KIDS_MAL.has(mal)) return true;
        if (catalogMetaHasKidsGenre(catalogMeta)) return true;
        if (titleLooksLikeKidsCartoon(row, catalogMeta)) return true;
        return false;
    }

    /** Анонс Kodik: явный status anons, премьера, не детский мульт. */
    function isKodikAnnouncedRow(row, catalogMeta, nowMs) {
        if (!row || typeof row !== 'object') return false;
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const at = Date.parse(row.next_at || row.nextAt || row.next_episode_at || '');
        if (!Number.isFinite(at) || at <= now) return false;

        const ep = parseInt(row.next_episode ?? row.nextEpisode, 10) || 1;
        if (ep > 1) return false;

        const aired = parseInt(row.episodes_aired, 10);
        if (Number.isFinite(aired) && aired > 0) return false;

        const st = String(row.status || '').toLowerCase();
        if (st !== 'anons' && st !== 'announcement') return false;

        if (isKidsCartoonRow(row, catalogMeta)) return false;
        return true;
    }

    return {
        isKodikAnnouncedRow,
        isKidsCartoonRow,
        KIDS_MAL,
    };
});

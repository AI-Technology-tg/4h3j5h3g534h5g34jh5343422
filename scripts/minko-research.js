/**
 * Сбор проверенного контекста для Minko AI: Jikan (MAL), каталог Re-Minko.
 */
(function (global) {
    'use strict';

    const ANIME_TOPIC =
        /аниме|манга|тайтл|сери|эпизод|сезон|новост|премьер|выход|студи|жанр|персонаж|сюжет|mal|myanimelist|рекоменд|похож|онгоинг|анонс|пересказ|что\s+произошло|смотреть|каталог|озвуч|студи|рейтинг|спойлер|арк|сэйю|сейю|шикимори|shiki|kodik|на\s+сайте|дай\s+\d/i;

    /** Народные названия → канонические запросы для каталога / Jikan */
    const TITLE_ALIASES = [
        {
            re: /ре\s*[-:]?\s*зеро|резеро|rezeро|re\s*[-:]?\s*zero|rezero|ри\s*зеро/i,
            queries: ['Re:Zero', 'Re Zero', 'Re:Zero kara Hajimeru Isekai Seikatsu', 'Жизнь с нуля']
        },
        {
            re: /атак\w*\s+на\s+титан|атака\s+титанов|shingeki|аот\b|aot\b/i,
            queries: ['Attack on Titan', 'Shingeki no Kyojin', 'Атака титанов']
        },
        {
            re: /ван\s*пис|one\s*piece/i,
            queries: ['One Piece', 'Ван-Пис']
        },
        {
            re: /наруто\b|naruto/i,
            queries: ['Naruto', 'Наруто']
        },
        {
            re: /клинок\s+рассекающ|demon\s*slayer|kimetsu/i,
            queries: ['Demon Slayer', 'Kimetsu no Yaiba', 'Клинок, рассекающий демонов']
        },
        {
            re: /магическ\w+\s+битв|jujutsu|джджутсу|магическая\s+битва/i,
            queries: ['Jujutsu Kaisen', 'Магическая битва']
        },
        {
            re: /тетрад\w+\s+смерт|death\s*note/i,
            queries: ['Death Note', 'Тетрадь смерти']
        },
        {
            re: /охотник\s+х\s+охотник|hunter\s*x\s*hunter|hxh/i,
            queries: ['Hunter x Hunter', 'Охотник × Охотник']
        },
        {
            re: /врата\s+штейна|steins\s*[-:]?\s*gate/i,
            queries: ['Steins;Gate', 'Врата Штейна']
        },
        {
            re: /щит\w*\s+герой|shield\s*hero/i,
            queries: ['The Rising of the Shield Hero', 'Tate no Yuusha', 'Восхождение героя щита']
        }
    ];

    function expandAliasQueries(msg) {
        const text = String(msg || '');
        const out = [];
        for (const row of TITLE_ALIASES) {
            if (row.re.test(text)) out.push(...row.queries);
        }
        return out;
    }

    function extractEpisodeHint(msg) {
        const m = String(msg || '').match(/(?:^|\s)(\d{1,3})\s*(?:-?\s*)?(?:серия|серии|серию|эпизод|эп\.?|episode)/i);
        if (m) return parseInt(m[1], 10);
        const m2 = String(msg || '').match(/(?:в|на)\s+(\d{1,3})\s*(?:-?\s*)?(?:серии|серию|эпизоде)/i);
        if (m2) return parseInt(m2[1], 10);
        return null;
    }

    function extractTitleCandidates(msg) {
        const text = String(msg || '').trim();
        const out = [];
        // Сначала алиасы — «резеро» → Re:Zero
        out.push(...expandAliasQueries(text));

        const reQuote = /[«"']([^»"']{2,90})[»"']/g;
        let m;
        while ((m = reQuote.exec(text)) !== null) {
            out.push(m[1].trim());
        }
        const pro = text.match(
            /(?:про|об|о|тема|теме|тему|типа|вроде|как|похож(?:ее|ие)?\s+на)\s+(?:аниме\s+|тайтл\s+|мангу\s+|манге\s+)?([a-zA-Zа-яА-ЯёЁ0-9\s:\-—!?]{2,80})/i
        );
        if (pro && pro[1]) {
            out.push(
                pro[1]
                    .replace(/\?.*$/, '')
                    .replace(/\s+(сери|эпизод|сезон|на\s+сайте).*$/i, '')
                    .trim()
            );
        }
        const theme = text.match(
            /(?:на\s+тему|по\s+мотивам|в\s+стиле|из\s+франшизы)\s+([a-zA-Zа-яА-ЯёЁ0-9\s:\-—!?]{2,60})/i
        );
        if (theme && theme[1]) {
            out.push(theme[1].replace(/\?.*$/, '').trim());
        }
        const en = text.match(/\b([A-Z][a-zA-Z0-9':\-\s]{2,60})\b/g);
        if (en) en.forEach((e) => out.push(e.trim()));
        const cleaned = text
            .replace(
                /^(расскажи|объясни|опиши|что|как|какая|какой|скажи|подскажи|найди|открой|дай|покажи)\s+/gi,
                ''
            )
            .replace(/^(на\s+сайте|в\s+каталоге)\s+/gi, '')
            .replace(/\b\d+\s*но\b/gi, '')
            .replace(/\?.*$/, '')
            .trim();
        if (cleaned.length >= 4 && cleaned.length <= 90) out.push(cleaned);
        const uniq = [];
        const seen = new Set();
        for (const s of out) {
            const t = s.replace(/\s+/g, ' ').trim();
            const k = t.toLowerCase();
            if (t.length < 2 || seen.has(k)) continue;
            if (/^(что|как|кто|где|когда|почему|сколько|аниме|тайтл|сайт|каталог)$/i.test(t)) continue;
            seen.add(k);
            uniq.push(t);
        }
        return uniq.slice(0, 6);
    }

    function stripHtml(s) {
        return String(s || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeTitle(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[^a-z0-9а-я\s]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function titleTokens(s) {
        return normalizeTitle(s)
            .split(' ')
            .filter((t) => t.length > 1 && !/^(the|a|an|и|в|на|о|об|про|сери|аниме)$/i.test(t));
    }

    function itemMalId(item) {
        if (!item) return null;
        const raw =
            item.mal_id != null
                ? item.mal_id
                : item._jikanRaw && item._jikanRaw.mal_id != null
                  ? item._jikanRaw.mal_id
                  : null;
        const n = raw != null ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0) return n;
        const id = Number(item.id);
        if (Number.isFinite(id) && id >= 10000000) return id - 10000000;
        return null;
    }

    function itemTitleFields(item) {
        const fields = [
            item.title,
            item.titleAlt,
            item.title_english,
            item.title_ru,
            item.titleRu,
            item.name
        ];
        if (item._jikanRaw) {
            fields.push(item._jikanRaw.title, item._jikanRaw.title_english, item._jikanRaw.title_japanese);
            if (Array.isArray(item._jikanRaw.titles)) {
                item._jikanRaw.titles.forEach((t) => fields.push(t && t.title));
            }
        }
        return fields.filter(Boolean).map((x) => String(x));
    }

    function formatJikanAnime(a, episodeHint) {
        if (!a) return '';
        const lines = [];
        const ru = a.title_russian || '';
        const en = a.title_english || a.title || '';
        lines.push(`«${ru || en}»${ru && en && ru !== en ? ` / ${en}` : ''}`);
        lines.push(
            `MAL ${a.mal_id} · ${a.type || '?'} · ${a.status || '?'} · эпизодов: ${a.episodes ?? '?'} · оценка: ${a.score ?? '?'}`
        );
        const year = a.year || (a.aired?.from ? String(a.aired.from).slice(0, 4) : '');
        if (year) lines.push(`Год: ${year}`);
        if (a.studios?.length) lines.push(`Студии: ${a.studios.map((s) => s.name).join(', ')}`);
        if (a.genres?.length) lines.push(`Жанры: ${a.genres.map((g) => g.name).join(', ')}`);
        const syn = stripHtml(a.synopsis);
        if (syn) lines.push(`Описание MAL: ${syn.slice(0, 1400)}`);
        if (episodeHint) lines.push(`Запрошен эпизод: ${episodeHint}`);
        return lines.join('\n');
    }

    function formatEpisodeRow(ep, num) {
        if (!ep) return '';
        const title = ep.title || ep.title_japanese || '';
        const syn = stripHtml(ep.synopsis);
        let line = `Эпизод ${num}: ${title}`;
        if (syn) line += ` — ${syn.slice(0, 600)}`;
        return line;
    }

    async function fetchEpisodeSynopsis(malId, episodeNum) {
        if (!malId || !episodeNum || episodeNum < 1) return '';
        const page = Math.ceil(episodeNum / 100);
        try {
            const res = await fetch(
                `https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}&limit=100`
            );
            if (!res.ok) return '';
            const json = await res.json();
            const list = json && json.data;
            if (!Array.isArray(list)) return '';
            const idx = ((episodeNum - 1) % 100) + 1;
            const ep = list.find((e) => e.mal_id === episodeNum || e.episode === episodeNum) || list[idx - 1];
            return formatEpisodeRow(ep, episodeNum);
        } catch {
            return '';
        }
    }

    function _tokenOverlapScore(qNorm, titleNorm) {
        const qt = titleTokens(qNorm);
        const tt = titleTokens(titleNorm);
        if (!qt.length || !tt.length) return 0;
        const tset = new Set(tt);
        let hit = 0;
        for (const t of qt) {
            if (tset.has(t)) {
                hit += 1;
                continue;
            }
            if ([...tset].some((x) => x.includes(t) || t.includes(x))) hit += 0.65;
        }
        return (hit / qt.length) * 55;
    }

    function _scoreCatalogHit(item, q) {
        const qn = normalizeTitle(q);
        if (!qn || qn.length < 2) return 0;
        let best = 0;
        for (const field of itemTitleFields(item)) {
            const tn = normalizeTitle(field);
            if (!tn) continue;
            if (tn === qn) best = Math.max(best, 100);
            else if (tn.startsWith(qn) || qn.startsWith(tn)) best = Math.max(best, 88);
            else if (tn.includes(qn) || qn.includes(tn)) best = Math.max(best, 72);
            else best = Math.max(best, _tokenOverlapScore(qn, tn));
        }
        return best >= 28 ? best : 0;
    }

    function _hitFromItem(item, score) {
        return {
            score,
            id: item.id,
            mal_id: itemMalId(item),
            title: item.title || item.titleAlt || 'Аниме',
            year: item.year || null,
            poster: item.poster || item.image || '',
            href: `anime/view.html?id=${encodeURIComponent(String(item.id))}`
        };
    }

    function minkoFindCatalogByMalId(animeList, malId) {
        const mid = Number(malId);
        if (!Number.isFinite(mid) || mid <= 0 || !Array.isArray(animeList)) return null;
        for (const item of animeList) {
            if (!item || item.id == null) continue;
            if (itemMalId(item) === mid) return item;
            if (Number(item.id) === 10000000 + mid) return item;
        }
        return null;
    }

    /** Известные франшизы → MAL id (на случай слабого текстового матча). */
    const FRANCHISE_MAL_HINTS = [
        {
            re: /ре\s*[-:]?\s*зеро|резеро|re\s*[-:]?\s*zero|rezero/i,
            malIds: [31240, 39587, 42203, 54857, 61316, 36286, 38414]
        },
        {
            re: /атак\w*\s+на\s+титан|атака\s+титанов|shingeki|аот\b|\baot\b/i,
            malIds: [16498, 25777, 35760, 38524, 40028, 51535]
        },
        {
            re: /клинок\s+рассекающ|demon\s*slayer|kimetsu/i,
            malIds: [38000, 47778, 51019, 55701]
        }
    ];

    /** Поиск аниме в каталоге сайта для кнопок перехода в чате. */
    function minkoFindCatalogAnimeHits(msg, animeList, limit) {
        const max = Math.max(1, Math.min(Number(limit) || 4, 8));
        const titles = extractTitleCandidates(msg);
        const queries = (titles.length ? titles : [String(msg || '')]).map((s) =>
            String(s || '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 80)
        );
        if (!Array.isArray(animeList) || !queries.length) return [];

        const scored = new Map();
        for (const q of queries) {
            if (!q || q.length < 2) continue;
            for (const item of animeList) {
                if (!item || item.id == null) continue;
                const score = _scoreCatalogHit(item, q);
                if (score <= 0) continue;
                const id = String(item.id);
                const prev = scored.get(id);
                if (!prev || score > prev.score) {
                    scored.set(id, _hitFromItem(item, score));
                }
            }
        }

        // Прямой матч по MAL франшизы (резеро → TV-1 и сезоны)
        const msgText = String(msg || '');
        for (const hint of FRANCHISE_MAL_HINTS) {
            if (!hint.re.test(msgText)) continue;
            for (const mid of hint.malIds) {
                const item = minkoFindCatalogByMalId(animeList, mid);
                if (!item) continue;
                const id = String(item.id);
                const prev = scored.get(id);
                if (!prev || prev.score < 105) {
                    scored.set(id, _hitFromItem(item, 105));
                }
            }
        }

        return Array.from(scored.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, max);
    }

    function findCatalogMatches(msg, animeList, mangaList, forcedHits) {
        const parts = [];
        const animeHits =
            Array.isArray(forcedHits) && forcedHits.length
                ? forcedHits
                : minkoFindCatalogAnimeHits(msg, animeList, 4);
        if (animeHits.length) {
            parts.push(
                'Аниме в каталоге Re-Minko (для кнопок смотреть используй ТОЛЬКО числовые id ниже в [[watch:ID|Название]]; НЕ выдумывай slug вроде the-rising-of…):\n' +
                    animeHits
                        .map((h) => {
                            return `- id=${h.id}${h.mal_id ? ` mal=${h.mal_id}` : ''} «${h.title}»${h.year ? ` (${h.year})` : ''} → /${h.href}`;
                        })
                        .join('\n') +
                    '\nЕсли пользователь просит тайтл «на сайте» / «дай аниме» по теме франшизы — рекомендуй ПЕРВЫЙ пункт из этого списка (сам тайтл франшизы), а не «похожее» из головы.'
            );
        } else {
            parts.push(
                'В каталоге Re-Minko по запросу совпадений не найдено. Не выдумывай [[watch:…]]. Можно предложить поискать вручную в /catalog/anime.html или уточнить название.'
            );
        }

        const titles = extractTitleCandidates(msg);
        const q = (titles[0] || msg).toLowerCase().slice(0, 80);
        if (q && q.length >= 3 && Array.isArray(mangaList)) {
            const hits = [];
            for (const item of mangaList) {
                const t = (item.title || '').toLowerCase();
                const alt = (item.titleAlt || '').toLowerCase();
                if (t.includes(q) || q.includes(t) || (alt && (alt.includes(q) || q.includes(alt)))) {
                    hits.push(item);
                }
                if (hits.length >= 3) break;
            }
            if (hits.length) {
                parts.push(
                    'Манга Re-Minko (справочно; раздел может быть ограничен): ' +
                        hits
                            .map((h) => {
                                const g = (h.genres || []).slice(0, 4).join(', ');
                                return `${h.title} (${h.year || '?'}, ${h.status || '?'}, ★${h.rating ?? '—'}${g ? ', ' + g : ''})`;
                            })
                            .join('; ')
                );
            }
        }
        return parts;
    }

    async function minkoBuildResearchContext(userMessage) {
        const msg = String(userMessage || '').trim();
        if (msg.length < 2) return '';
        const wantsResearch =
            ANIME_TOPIC.test(msg) ||
            msg.length >= 8 ||
            /новост|что\s+нового|расскаж|объясн|опиш|пересказ|рекоменд|похож|найди|открой|смотр/i.test(msg);
        if (!wantsResearch) return '';

        const parts = [];
        const episodeHint = extractEpisodeHint(msg);
        let titles = extractTitleCandidates(msg);
        if (!titles.length && ANIME_TOPIC.test(msg)) {
            titles = [msg.replace(/\?.*$/, '').slice(0, 80)];
        }

        const jikanMalIds = [];
        for (const title of titles.slice(0, 2)) {
            try {
                let anime = null;
                if (typeof global.jikanSearchAnime === 'function') {
                    anime = await global.jikanSearchAnime(title);
                }
                if (anime && anime.mal_id && typeof global.jikanFetchAnimeFullByMalId === 'function') {
                    const full = await global.jikanFetchAnimeFullByMalId(anime.mal_id);
                    if (full) anime = full;
                }
                if (anime) {
                    if (anime.mal_id) jikanMalIds.push(Number(anime.mal_id));
                    parts.push('--- Jikan / MyAnimeList ---\n' + formatJikanAnime(anime, episodeHint));
                    if (episodeHint && anime.mal_id) {
                        const epLine = await fetchEpisodeSynopsis(anime.mal_id, episodeHint);
                        if (epLine) parts.push(epLine);
                    }
                }
            } catch (e) {
                console.warn('[Minko research] Jikan:', e);
            }
        }

        if (/новинк|премьер|сезон|онгоинг|что\s+смотрет|анонс|выходит/i.test(msg)) {
            try {
                const [nowRes, upRes] = await Promise.all([
                    fetch('https://api.jikan.moe/v4/seasons/now?limit=10'),
                    fetch('https://api.jikan.moe/v4/seasons/upcoming?limit=8')
                ]);
                if (nowRes.ok) {
                    const now = await nowRes.json();
                    const list = (now.data || [])
                        .slice(0, 10)
                        .map((a) => `${a.title}${a.score ? ` ★${a.score}` : ''}`)
                        .join('; ');
                    if (list) parts.push('Сейчас в сезоне (Jikan): ' + list);
                }
                if (upRes.ok) {
                    const up = await upRes.json();
                    const list = (up.data || [])
                        .slice(0, 8)
                        .map((a) => a.title)
                        .join('; ');
                    if (list) parts.push('Скоро выходит (Jikan): ' + list);
                }
            } catch (_) {
                /* ignore */
            }
        }

        let lastAnimeHits = [];
        try {
            if (typeof global.getAllAnime === 'function' || typeof global.getAllManga === 'function') {
                const animeList = typeof global.getAllAnime === 'function' ? global.getAllAnime() : [];
                const mangaList = typeof global.getAllManga === 'function' ? global.getAllManga() : [];
                const byText = minkoFindCatalogAnimeHits(msg, animeList, 4);
                const byMal = [];
                for (const mid of jikanMalIds) {
                    const item = minkoFindCatalogByMalId(animeList, mid);
                    if (item) byMal.push(_hitFromItem(item, 110));
                }
                const merged = new Map();
                [...byMal, ...byText].forEach((h) => {
                    const id = String(h.id);
                    const prev = merged.get(id);
                    if (!prev || h.score > prev.score) merged.set(id, h);
                });
                lastAnimeHits = Array.from(merged.values())
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 4);
                parts.push(...findCatalogMatches(msg, animeList, mangaList, lastAnimeHits));
            }
        } catch (_) {
            /* ignore */
        }

        try {
            global.__minkoLastCatalogAnimeHits = lastAnimeHits;
        } catch (_) {
            /* ignore */
        }

        return parts.filter(Boolean).join('\n\n').slice(0, 7500);
    }

    global.minkoBuildResearchContext = minkoBuildResearchContext;
    global.minkoFindCatalogAnimeHits = minkoFindCatalogAnimeHits;
    global.minkoFindCatalogByMalId = minkoFindCatalogByMalId;
})(typeof window !== 'undefined' ? window : globalThis);

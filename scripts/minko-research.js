/**
 * Сбор проверенного контекста для Minko AI: Jikan (MAL), каталог Re-Minko.
 */
(function (global) {
    'use strict';

    // Без голого «новост» — иначе любой оффтоп с «новости» гоняет API
    const ANIME_TOPIC =
        /аниме|манга|тайтл|сери[яию]|эпизод|сезон|премьер|студи|жанр|персонаж|сюжет|mal|myanimelist|anilist|рекоменд|похож|онгоинг|анонс|пересказ|что\s+произошло|смотреть|каталог|озвуч|рейтинг|спойлер|арк|сэйю|сейю|шикимори|shiki|kodik|на\s+сайте|дай\s+\d|аниме.?новост/i;

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

    function extractSeasonHint(msg) {
        const t = String(msg || '');
        // Без \b: в JS граница слова ломается на кириллице («4 сезон» не матчилось)
        let m = t.match(/(?:^|[^\d])(\d{1,2})\s*[-.]?\s*(?:сезон|season|тв|tv)(?=\s|$|[.,!?«»"'])/i);
        if (!m) m = t.match(/(?:сезон|season|тв|tv)\s*[-.]?\s*(\d{1,2})(?=\s|$|[.,!?«»"'])/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        return Number.isFinite(n) && n > 0 && n < 40 ? n : null;
    }

    function itemSeasonNumber(item) {
        const blob = itemTitleFields(item).join(' ');
        let m = blob.match(/[\[(]?\s*(?:тв|tv)\s*[-.]?\s*(\d{1,2})\s*[\])]?/i);
        if (!m) m = blob.match(/(\d{1,2})\s*(?:st|nd|rd|th)\s*season/i);
        if (!m) m = blob.match(/\b(?:season|сезон)\s*[-.]?\s*(\d{1,2})\b/i);
        // «Ты и я полные противоположности 2» / «Title 2»
        if (!m) {
            for (const field of itemTitleFields(item)) {
                const tm = String(field || '').trim().match(/\s(\d{1,2})\s*$/);
                if (tm) {
                    const n = parseInt(tm[1], 10);
                    if (Number.isFinite(n) && n >= 2 && n < 40) return n;
                }
            }
        }
        if (!m) return null;
        const n = parseInt(m[1], 10);
        return Number.isFinite(n) ? n : null;
    }

    function _hitFromItem(item, score) {
        return {
            score,
            id: item.id,
            mal_id: itemMalId(item),
            title: item.title || item.titleAlt || 'Аниме',
            year: item.year || null,
            episodes: item.episodes || item.episodes_aired || null,
            totalEpisodes: item.totalEpisodes != null ? item.totalEpisodes : item.episodes_total || null,
            status: item.status || null,
            poster: item.poster || item.image || '',
            href: `anime/view.html?id=${encodeURIComponent(String(item.id))}`,
            season: itemSeasonNumber(item)
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
        const seasonHint = extractSeasonHint(msg);
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
                let score = _scoreCatalogHit(item, q);
                if (score <= 0) continue;
                const sn = itemSeasonNumber(item);
                if (seasonHint && sn === seasonHint) score += 45;
                else if (seasonHint && sn && sn !== seasonHint) score -= 15;
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
                let score = 105;
                const sn = itemSeasonNumber(item);
                if (seasonHint && sn === seasonHint) score = 160;
                else if (seasonHint && sn && sn !== seasonHint) score = 70;
                const id = String(item.id);
                const prev = scored.get(id);
                if (!prev || prev.score < score) {
                    scored.set(id, _hitFromItem(item, score));
                }
            }
        }

        return Array.from(scored.values())
            .sort((a, b) => b.score - a.score || (b.season || 0) - (a.season || 0))
            .slice(0, seasonHint ? Math.min(max, 2) : max);
    }

    function findCatalogMatches(msg, animeList, mangaList, forcedHits) {
        const parts = [];
        const seasonHint = extractSeasonHint(msg);
        const animeHits =
            Array.isArray(forcedHits) && forcedHits.length
                ? forcedHits
                : minkoFindCatalogAnimeHits(msg, animeList, 4);
        if (animeHits.length) {
            const factLines = animeHits.map((h) => {
                const eps =
                    h.episodes != null
                        ? String(h.episodes)
                        : h.totalEpisodes != null
                          ? String(h.totalEpisodes)
                          : '?';
                const st = h.status || '?';
                const sn = h.season != null ? ` · сезон/ТВ-${h.season}` : '';
                const ongoingHint =
                    st === 'Онгоинг'
                        ? ' (тайтл ещё выходит — не говори «завершён»; цифры серий = уже вышедшие на сайте, не финал сезона)'
                        : '';
                const unknownTotal =
                    h.episodesTotalUnknown || (st === 'Онгоинг' && !h.totalEpisodes)
                        ? '; итого серий в сезоне пока неизвестно (не выдумывай финал)'
                        : '';
                return `• «${h.title}»${sn}: в каталоге серии ${eps}, статус «${st}»${ongoingHint}${unknownTotal}${
                    h.totalEpisodes != null && !h.episodesTotalUnknown
                        ? `, totalEpisodes=${h.totalEpisodes}`
                        : ''
                } (id=${h.id}${h.mal_id ? `, mal=${h.mal_id}` : ''})`;
            });
            parts.push(
                '=== ФАКТЫ ИЗ КАТАЛОГА (отвечай по ним сразу, не отмазывайся «нет данных») ===\n' +
                    factLines.join('\n') +
                    (seasonHint
                        ? `\nПользователь спрашивает про сезон ${seasonHint} — бери ПЕРВЫЙ пункт (он приоритетный).`
                        : '')
            );
            parts.push(
                'Аниме в каталоге Re-Minko (кнопки только с этими id в [[watch:ID|Название]]):\n' +
                    animeHits
                        .map((h) => {
                            return `- id=${h.id}${h.mal_id ? ` mal=${h.mal_id}` : ''} «${h.title}» · серии ${
                                h.episodes || h.totalEpisodes || '?'
                            } · ${h.status || '?'}${h.year ? ` (${h.year})` : ''} → /${h.href}`;
                        })
                        .join('\n') +
                    '\nНе рекомендуй другие тайтлы (KonoSuba/Slime и т.п.), если вопрос про конкретную франшизу из списка.'
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

    async function fetchCalendarFactsForMessage(msg, catalogHits) {
        try {
            const r = await fetch('data/kodik-calendar.json?v=cal', { cache: 'no-store' });
            if (!r.ok) return '';
            const j = await r.json();
            const items = Array.isArray(j.items) ? j.items : [];
            if (!items.length) return '';

            const malSet = new Set(
                (catalogHits || [])
                    .map((h) => Number(h && h.mal_id))
                    .filter((n) => Number.isFinite(n) && n > 0)
            );
            const aliases = expandAliasQueries(msg);
            const seasonHint = extractSeasonHint(msg);
            const scored = [];

            for (const it of items) {
                const mal = Number(it.mal_id);
                const blob = `${it.title_ru || ''} ${it.title_en || ''} ${it.title || ''}`;
                let score = 0;
                if (malSet.has(mal)) score += 80;
                for (const a of aliases) {
                    if (normalizeTitle(blob).includes(normalizeTitle(a).slice(0, 12))) score += 40;
                }
                if (/ре\s*зеро|re:?\s*zero|hajimeru isekai/i.test(blob) && /резеро|re:?\s*zero/i.test(msg)) {
                    score += 50;
                }
                if (seasonHint && (/(?:тв|tv|season|сезон)\s*[-.]?\s*4\b/i.test(blob) || /4th/i.test(blob))) {
                    if (seasonHint === 4) score += 30;
                }
                if (score < 40) continue;
                scored.push({ score, it });
            }
            scored.sort((a, b) => b.score - a.score);
            const top = scored.slice(0, 2).map((x) => x.it);
            if (!top.length) return '';

            const lines = top.map((it) => {
                const name = it.title_ru || it.title_en || it.title || 'тайтл';
                const aired = it.episodes_aired != null ? it.episodes_aired : '?';
                const next = it.next_episode != null ? it.next_episode : '?';
                const when = it.next_at ? String(it.next_at) : '?';
                return `«${name}» (mal ${it.mal_id}): вышло серий ${aired}, следующая ${next} (${when}), статус ${it.status || '?'}`;
            });
            return (
                '=== КАЛЕНДАРЬ Re-Minko (актуальный выход серий на сайте) ===\n' +
                lines.join('\n') +
                '\nЕсли спрашивают «сколько серий / какая последняя» — ответь по «вышло серий» и «следующая». Не отсылай только на страницу календаря без цифр.'
            );
        } catch (_) {
            return '';
        }
    }

    /**
     * Каталог + календарь сайта. Веб-поиск — на сервере в minko-chat (без AniList/Jikan в браузере).
     */
    async function minkoBuildResearchContext(userMessage) {
        const msg = String(userMessage || '').trim();
        if (msg.length < 2) return '';

        const isAnimeish =
            ANIME_TOPIC.test(msg) ||
            expandAliasQueries(msg).length > 0 ||
            /re\s*:?\s*zero|naruto|one\s*piece|jujutsu|kimetsu|shingeki/i.test(msg);
        if (!isAnimeish) {
            try {
                global.__minkoLastCatalogAnimeHits = [];
            } catch (_) {
                /* ignore */
            }
            return '';
        }

        const parts = [];
        let lastAnimeHits = [];
        try {
            if (typeof global.getAllAnimeAsync === 'function') {
                await global.getAllAnimeAsync();
            } else if (global.KodikCatalogStore && typeof global.KodikCatalogStore.load === 'function') {
                await global.KodikCatalogStore.load();
            }
        } catch (_) {
            /* ignore */
        }
        try {
            if (typeof global.getAllAnime === 'function' || typeof global.getAllManga === 'function') {
                const animeList = typeof global.getAllAnime === 'function' ? global.getAllAnime() : [];
                const mangaList = typeof global.getAllManga === 'function' ? global.getAllManga() : [];
                lastAnimeHits = minkoFindCatalogAnimeHits(msg, animeList, 4);
                parts.push(...findCatalogMatches(msg, animeList, mangaList, lastAnimeHits));
            }
        } catch (_) {
            /* ignore */
        }

        try {
            const cal = await fetchCalendarFactsForMessage(msg, lastAnimeHits);
            if (cal) parts.unshift(cal);
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

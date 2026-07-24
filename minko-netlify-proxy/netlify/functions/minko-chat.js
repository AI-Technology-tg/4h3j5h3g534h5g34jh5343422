/**
 * Netlify Function — OpenAI + Jikan/MAL + DuckDuckGo для Minko AI (+ Supabase-ворота).
 * POST JSON: { messages, isVip?, sessionKey?, researchContext? }
 */
const GPT_URL = 'https://api.openai.com/v1/chat/completions';
const GPT_KEY = process.env.OPENAI_API_KEY || process.env.MINKO_GPT_API_KEY || '';
/** Одна модель на весь чат. Env MINKO_OPENAI_MODEL опционален — по умолчанию gpt-5.6 */
const MODEL_DEFAULT = (process.env.MINKO_OPENAI_MODEL || 'gpt-5.6').trim();
const MODEL_VIP = (process.env.MINKO_OPENAI_MODEL_VIP || MODEL_DEFAULT).trim();
const WEB_ON = String(process.env.MINKO_WEB_SEARCH || '1').trim() === '1';
const JIKAN = 'https://api.jikan.moe/v4';

function isGpt5Family(model) {
    return /^gpt-5/i.test(String(model || '')) || /^o[0-9]/i.test(String(model || ''));
}

const { corsHeaders: buildCorsHeaders, clientIp } = require('./_cors');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAX_BODY_CHARS = 24000;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_GUEST = 10;
const RATE_LIMIT_USER = 18;
const RATE_LIMIT_VIP = 30;
const rateBuckets = new Map();

async function checkChatEnabledFromSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: true };
    try {
        const r = await fetch(
            `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/minko_ai_public_state?id=eq.1&select=chat_enabled,maintenance_message`,
            {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`
                }
            }
        );
        const rows = await r.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row && row.chat_enabled === false) {
            return {
                ok: false,
                message: (row.maintenance_message || '').trim() || 'Minko AI временно отключена.'
            };
        }
    } catch (e) {
        console.warn('[minko-chat] supabase gate', e.message);
    }
    return { ok: true };
}

async function remoteServerLog(level, message, details) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
    try {
        await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/minko_ai_server_logs`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify({
                level: String(level).slice(0, 32),
                message: String(message).slice(0, 4000),
                details: details && typeof details === 'object' ? details : null
            })
        });
    } catch (e) {
        console.warn('[minko-chat] remoteServerLog', e.message);
    }
}

async function verifySupabaseUser(event) {
    const auth = event.headers?.authorization || event.headers?.Authorization || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const jwt = m ? m[1].trim() : '';
    const base = SUPABASE_URL.replace(/\/$/, '');
    const anon = SUPABASE_ANON_KEY.trim();
    if (!base || !anon || !jwt) return null;
    try {
        const r = await fetch(`${base}/auth/v1/user`, {
            headers: { Authorization: `Bearer ${jwt}`, apikey: anon }
        });
        if (!r.ok) return null;
        const j = await r.json().catch(() => null);
        return j && j.id ? j : null;
    } catch {
        return null;
    }
}

async function resolveIsVip(userId) {
    if (!userId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
    try {
        const base = SUPABASE_URL.replace(/\/$/, '');
        const url =
            `${base}/rest/v1/vip_subscriptions?user_id=eq.${encodeURIComponent(userId)}` +
            '&select=is_active,expires_at&limit=1';
        const r = await fetch(url, {
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
        });
        const rows = await r.json().catch(() => []);
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row || row.is_active !== true) return false;
        if (row.expires_at && new Date(row.expires_at) <= new Date()) return false;
        return true;
    } catch (e) {
        console.warn('[minko-chat] vip check', e.message);
        return false;
    }
}

function checkRateLimit(key, limit) {
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
        rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
}

function corsHeaders(event) {
    return buildCorsHeaders(event, 'POST, OPTIONS, GET, HEAD', 'Content-Type, Authorization');
}

function ok(bodyObj, headers) {
    return { statusCode: 200, headers, body: JSON.stringify(bodyObj) };
}

function err(status, msg, headers) {
    return { statusCode: status, headers, body: JSON.stringify({ error: { message: msg } }) };
}

function genderLine(userGender) {
    return userGender === 'female'
        ? 'Пользовательница — девушка: в обращениях и прошедшем времени используй женский род (смотрелА, пришлА, хотелА).'
        : 'Пользователь — парень: в обращениях мужской род (смотрел, пришёл, хотел).';
}

function stripHtml(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractEpisodeHint(msg) {
    const m = String(msg || '').match(/(?:^|\s)(\d{1,3})\s*(?:-?\s*)?(?:серия|серии|серию|эпизод|эп\.?|episode)/i);
    if (m) return parseInt(m[1], 10);
    const m2 = String(msg || '').match(/(?:в|на)\s+(\d{1,3})\s*(?:-?\s*)?(?:серии|серию|эпизоде)/i);
    if (m2) return parseInt(m2[1], 10);
    return null;
}

function expandAliasQueries(msg) {
    const text = String(msg || '');
    const aliases = [
        [/ре\s*[-:]?\s*зеро|резеро|re\s*[-:]?\s*zero|rezero/i, ['Re:Zero', 'Re Zero', 'Re:Zero kara Hajimeru Isekai Seikatsu']],
        [/атак\w*\s+на\s+титан|атака\s+титанов|shingeki|\baot\b/i, ['Attack on Titan', 'Shingeki no Kyojin']],
        [/клинок\s+рассекающ|demon\s*slayer|kimetsu/i, ['Demon Slayer', 'Kimetsu no Yaiba']],
        [/ван\s*пис|one\s*piece/i, ['One Piece']],
        [/магическ\w+\s+битв|jujutsu/i, ['Jujutsu Kaisen']]
    ];
    const out = [];
    for (const [re, qs] of aliases) {
        if (re.test(text)) out.push(...qs);
    }
    return out;
}

function extractTitleCandidates(msg) {
    const text = String(msg || '').trim();
    const out = expandAliasQueries(text);
    const reQuote = /[«"']([^»"']{2,90})[»"']/g;
    let m;
    while ((m = reQuote.exec(text)) !== null) out.push(m[1].trim());
    const pro = text.match(
        /(?:про|об|о|тема|теме|тему|типа|вроде)\s+(?:аниме\s+|тайтл\s+|мангу\s+|манге\s+)?([a-zA-Zа-яА-ЯёЁ0-9\s:\-—!?]{2,80})/i
    );
    if (pro && pro[1]) {
        out.push(
            pro[1]
                .replace(/\?.*$/, '')
                .replace(/\s+(сери|эпизод|сезон).*$/i, '')
                .trim()
        );
    }
    const theme = text.match(/(?:на\s+тему|по\s+мотивам|в\s+стиле)\s+([a-zA-Zа-яА-ЯёЁ0-9\s:\-—!?]{2,60})/i);
    if (theme && theme[1]) out.push(theme[1].replace(/\?.*$/, '').trim());
    const en = text.match(/\b([A-Z][a-zA-Z0-9':\-\s]{2,60})\b/g);
    if (en) en.forEach((e) => out.push(e.trim()));
    const cleaned = text
        .replace(/^(расскажи|объясни|опиши|что|как|какая|какой|скажи|подскажи|дай|найди|покажи)\s+/gi, '')
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
        seen.add(k);
        uniq.push(t);
    }
    return uniq.slice(0, 5);
}

async function jikanGet(path, ms = 7000) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), ms);
    try {
        const r = await fetch(JIKAN + path, { signal: ac.signal });
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;
    } finally {
        clearTimeout(tid);
    }
}

function formatAnimeBlock(a, episodeHint) {
    if (!a) return '';
    const ru = a.title_russian || '';
    const en = a.title_english || a.title || '';
    const lines = [
        `«${ru || en}»${ru && en && ru !== en ? ` / ${en}` : ''}`,
        `MAL ${a.mal_id} · ${a.type || '?'} · ${a.status || '?'} · эпизодов: ${a.episodes ?? '?'} · ★ ${a.score ?? '?'}`,
        a.year ? `Год: ${a.year}` : '',
        a.studios?.length ? `Студии: ${a.studios.map((s) => s.name).join(', ')}` : '',
        a.genres?.length ? `Жанры: ${a.genres.map((g) => g.name).join(', ')}` : ''
    ].filter(Boolean);
    const syn = stripHtml(a.synopsis);
    if (syn) lines.push(`Synopsis MAL: ${syn.slice(0, 1500)}`);
    if (episodeHint) lines.push(`Запрошен эпизод: ${episodeHint}`);
    return lines.join('\n');
}

async function fetchJikanResearch(userText) {
    const msg = String(userText || '').trim();
    if (msg.length < 3) return '';
    const parts = [];
    const episodeHint = extractEpisodeHint(msg);
    let titles = extractTitleCandidates(msg);
    if (!titles.length) titles = [msg.replace(/\?.*$/, '').slice(0, 80)];

    for (const title of titles.slice(0, 2)) {
        const search = await jikanGet(`/anime?q=${encodeURIComponent(title)}&limit=2`);
        const hit = search?.data?.[0];
        if (!hit?.mal_id) continue;
        const full = await jikanGet(`/anime/${hit.mal_id}/full`);
        const a = full?.data || hit;
        parts.push('[Jikan / MyAnimeList]\n' + formatAnimeBlock(a, episodeHint));
        if (episodeHint && a.mal_id) {
            const page = Math.ceil(episodeHint / 100);
            const eps = await jikanGet(`/anime/${a.mal_id}/episodes?page=${page}&limit=100`);
            const list = eps?.data;
            if (Array.isArray(list) && list.length) {
                const ep = list.find((e) => e.mal_id === episodeHint || e.episode === episodeHint) || list[(episodeHint - 1) % 100];
                if (ep) {
                    const syn = stripHtml(ep.synopsis);
                    parts.push(
                        `Эпизод ${episodeHint}: ${ep.title || ''}${syn ? ' — ' + syn.slice(0, 700) : ''}`
                    );
                }
            }
        }
    }

    if (/новинк|премьер|сезон|онгоинг|что\s+смотрет|анонс|выходит/i.test(msg)) {
        const now = await jikanGet('/seasons/now?limit=10');
        if (now?.data?.length) {
            parts.push(
                'Сейчас в сезоне: ' +
                    now.data
                        .slice(0, 10)
                        .map((a) => `${a.title}${a.score ? ` ★${a.score}` : ''}`)
                        .join('; ')
            );
        }
        const up = await jikanGet('/seasons/upcoming?limit=8');
        if (up?.data?.length) {
            parts.push('Скоро: ' + up.data.map((a) => a.title).join('; '));
        }
    }

    return parts.join('\n\n').slice(0, 5500);
}

/** Веб-поиск только по аниме/манге — не общий интернет. */
function isAnimeResearchTopic(msg) {
    const t = String(msg || '');
    if (t.length < 2) return false;
    if (
        /аниме|манга|манхв|тайтл|сери[яию]|эпизод|сезон|студи|сэйю|сейю|персонаж|сюжет|спойлер|арк|онгоинг|анонс|премьер|озвуч|рекоменд|похож|каталог|шикимори|shiki|mal\b|myanimelist|anilist|kodik|jikan|isekai|сёнэн|сёдзё|сэйнэн|ova\b|ona\b|фильм|смотреть|пересказ|франшиз/i.test(
            t
        )
    ) {
        return true;
    }
    if (expandAliasQueries(t).length) return true;
    if (/re\s*:?\s*zero|naruto|one\s*piece|bleach|jujutsu|kimetsu|shingeki|steins|evangelion|spy\s*x\s*family/i.test(t)) {
        return true;
    }
    // «на тему / про / об» + намёк на аниме-контекст (не любой «про футбол»)
    if (
        /(?:на\s+тему|про|об)\s+.+/i.test(t) &&
        /аниме|манга|тайтл|сери|каталог|смотреть|резеро|re\s*:?\s*zero|персонаж|студи/i.test(t)
    ) {
        return true;
    }
    return false;
}

/** Разрешённые темы вне аниме: сайт, ты сама, создатель, приветствия, прощение. */
function isMinkoSiteOrSelfTopic(msg) {
    const t = String(msg || '').trim();
    if (t.length < 1) return false;
    if (
        /re-?minko|реминько|сайт|каталог|профиль|избранн|истори|друг|сообщен|розыгрыш|поддержк|аккаунт|регистрац|войт|логин|парол|watch.?together|смотреть\s+вместе|≈?4k|инфо\.html|minko\s*ai|минко/i.test(
            t
        )
    ) {
        return true;
    }
    if (
        /кто\s+ты|ты\s+кто|представься|как\s+тебя\s+зовут|кто\s+создал|создател|дубина|любимое\s+аниме|ты\s+рем|образ/i.test(
            t
        )
    ) {
        return true;
    }
    if (
        /^(привет|здравствуй|хай|hello|hi|ку|йо|спасибо|благодар|пока|доброй|доброе|добрый|ок|окей|ладно|ага|угу|мм+|прости|извини|сорри|sorry)[\s!.?…]*$/i.test(
            t
        )
    ) {
        return true;
    }
    return false;
}

function isMinkoAllowedTopic(msg) {
    return isAnimeResearchTopic(msg) || isMinkoSiteOrSelfTopic(msg);
}

const MINKO_OFFTOPIC_REFUSAL =
    '*зевает* Я отвечаю только про **аниме**, **мангу** и **сайт Re-Minko** 💤\n\n' +
    'Футбол, новости, политика и прочие «левые» темы — не моя зона. Спроси про тайтл, серию, рекомендацию или как чем-то пользоваться на сайте~';

function decodeHtmlEntities(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

async function fetchDuckDuckGoHtmlAnime(query) {
    const base = String(query || '').trim().slice(0, 160);
    if (base.length < 2) return '';
    // Только аниме-сайты — не общий веб
    const q =
        `(${base}) anime OR аниме ` +
        `(site:myanimelist.net OR site:anilist.co OR site:shikimori.one OR site:animenewsnetwork.com OR site:anime-planet.com OR site:wikipedia.org)`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 6500);
    try {
        const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), {
            signal: ac.signal,
            headers: {
                'User-Agent': 'ReMinkoMinkoAI/1.0 (+https://re-minko-anime.com)',
                Accept: 'text/html'
            }
        });
        if (!r.ok) return '';
        const html = await r.text();
        const lines = [];
        const re =
            /class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
        let m;
        while ((m = re.exec(html)) !== null && lines.length < 6) {
            const title = decodeHtmlEntities(stripHtml(m[1])).slice(0, 160);
            const snip = decodeHtmlEntities(stripHtml(m[2])).slice(0, 320);
            if (title.length < 3) continue;
            lines.push(`• ${title}${snip ? ' — ' + snip : ''}`);
        }
        // запасной разбор
        if (!lines.length) {
            const re2 = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            while ((m = re2.exec(html)) !== null && lines.length < 5) {
                const title = decodeHtmlEntities(stripHtml(m[2])).slice(0, 160);
                const href = decodeHtmlEntities(m[1]);
                if (title.length < 3) continue;
                if (!/myanimelist|anilist|shikimori|animenewsnetwork|anime-planet|wikipedia/i.test(href)) {
                    continue;
                }
                lines.push(`• ${title}`);
            }
        }
        return lines.join('\n').slice(0, 2800);
    } catch {
        return '';
    } finally {
        clearTimeout(tid);
    }
}

async function fetchDuckDuckGoSnippet(query) {
    const base = String(query || '').trim().slice(0, 200);
    if (base.length < 2) return '';
    const variants = [];
    if (!/аниме|anime|manga|манга/i.test(base)) {
        variants.push(base + ' anime');
        variants.push(base + ' аниме');
    } else {
        variants.push(base);
    }
    const chunks = [];
    for (const v of variants.slice(0, 2)) {
        const q = encodeURIComponent(v);
        const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`;
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), 4500);
        try {
            const r = await fetch(url, { signal: ac.signal });
            const j = await r.json();
            const blob = `${j.Heading || ''} ${j.AbstractText || ''} ${j.AbstractURL || ''}`.toLowerCase();
            const animeish =
                /anime|manga|аниме|манга|myanimelist|anilist|studio|эпизод|сезон|ova|ona/.test(blob) ||
                /anime|manga|аниме|манга/.test(v);
            if (!animeish && j.AbstractText) {
                /* пропускаем нерелевантное */
            } else {
                if (j.AbstractText) chunks.push(j.AbstractText);
                if (j.Heading && j.AbstractURL) chunks.push(`${j.Heading}: ${j.AbstractURL}`);
            }
            const topics = Array.isArray(j.RelatedTopics) ? j.RelatedTopics : [];
            for (const t of topics.slice(0, 5)) {
                const text = typeof t === 'string' ? t : t && t.Text ? t.Text : '';
                if (text && /anime|manga|аниме|манга|myanimelist|studio/i.test(text)) chunks.push(text);
            }
        } catch {
            /* ignore */
        } finally {
            clearTimeout(tid);
        }
        if (chunks.join('\n').length > 800) break;
    }
    return chunks.join('\n').trim().slice(0, 2200);
}

async function fetchAniListResearch(userText) {
    const titles = extractTitleCandidates(userText);
    const q = (titles[0] || String(userText || '').slice(0, 80)).trim();
    if (q.length < 2) return '';
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 7000);
    try {
        const r = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            signal: ac.signal,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                query: `query ($search: String) {
                  Page(page: 1, perPage: 3) {
                    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                      id malId title { romaji english native }
                      format status episodes seasonYear averageScore
                      studios(isMain: true) { nodes { name } }
                      description(asHtml: false)
                    }
                  }
                }`,
                variables: { search: q.slice(0, 80) }
            })
        });
        if (!r.ok) return '';
        const j = await r.json();
        const list = j?.data?.Page?.media;
        if (!Array.isArray(list) || !list.length) return '';
        return list
            .map((m) => {
                const name = m.title?.english || m.title?.romaji || m.title?.native || '?';
                const studios = (m.studios?.nodes || []).map((n) => n.name).join(', ');
                const desc = stripHtml(m.description || '').slice(0, 700);
                return [
                    `«${name}»`,
                    `AniList ${m.id}${m.malId ? ` · MAL ${m.malId}` : ''} · ${m.format || '?'} · ${m.status || '?'} · eps ${m.episodes ?? '?'} · ★ ${m.averageScore ?? '?'}${m.seasonYear ? ` · ${m.seasonYear}` : ''}`,
                    studios ? `Студии: ${studios}` : '',
                    desc ? `Описание: ${desc}` : ''
                ]
                    .filter(Boolean)
                    .join('\n');
            })
            .join('\n\n')
            .slice(0, 3500);
    } catch {
        return '';
    } finally {
        clearTimeout(tid);
    }
}

async function fetchJikanRelations(malId) {
    const mid = Number(malId);
    if (!Number.isFinite(mid) || mid <= 0) return '';
    const rel = await jikanGet(`/anime/${mid}/relations`);
    const rows = rel?.data;
    if (!Array.isArray(rows) || !rows.length) return '';
    const lines = [];
    for (const row of rows) {
        const relName = row.relation || '?';
        const entries = Array.isArray(row.entry) ? row.entry : [];
        for (const e of entries.slice(0, 4)) {
            if (!e || e.type !== 'anime') continue;
            lines.push(`${relName}: «${e.name}» (MAL ${e.mal_id})`);
        }
        if (lines.length >= 12) break;
    }
    return lines.length ? 'Связанные сезоны/тайтлы (Jikan):\n' + lines.join('\n') : '';
}

async function fetchWikipediaSnippet(query) {
    const titlesFromMsg = extractTitleCandidates(query);
    const base = (titlesFromMsg[0] || String(query || ''))
        .trim()
        .replace(/^(расскажи|найди|открой|что|как)\s+/i, '')
        .slice(0, 120);
    if (base.length < 2) return '';
    const titles = [base, `${base} (аниме)`, `${base} (anime)`, `${base} (манга)`];
    for (const title of titles) {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), 4000);
        try {
            const url =
                'https://ru.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title);
            const r = await fetch(url, {
                signal: ac.signal,
                headers: { Accept: 'application/json', 'Api-User-Agent': 'ReMinkoMinkoAI/1.0' }
            });
            if (!r.ok) continue;
            const j = await r.json();
            if (j.type === 'disambiguation') continue;
            const extract = String(j.extract || '').trim();
            if (extract.length < 40) continue;
            // Только аниме/манга-страницы
            if (!/аниме|манга|anime|manga|OVA|ONA|студи|экранизац/i.test(`${j.title || ''} ${extract}`)) {
                continue;
            }
            return `${j.title || title}: ${extract}`.slice(0, 2200);
        } catch {
            /* try next */
        } finally {
            clearTimeout(tid);
        }
    }
    return '';
}

async function fetchResearchBundle(userText, clientResearch) {
    const parts = [];
    const client = String(clientResearch || '').trim();
    if (client.length > 30) {
        parts.push('=== С сайта (Jikan / каталог) ===\n' + client.slice(0, 6000));
    }

    // Интернет только по аниме — иначе модель не кормим общим вебом
    if (!WEB_ON || !isAnimeResearchTopic(userText)) {
        if (!isAnimeResearchTopic(userText) && WEB_ON) {
            parts.push(
                '=== Веб-поиск ===\nЗапрос не про аниме/мангу — интернет-сводка не запрашивалась. Ответь по характеру Minko без новостей и «фактов из сети».'
            );
        }
        return parts.join('\n\n').slice(0, 9500);
    }

    let jikanMalId = null;
    let jikan = '';
    try {
        jikan = await fetchJikanResearch(userText);
        if (jikan) {
            parts.push('=== Сервер: Jikan / MAL ===\n' + jikan);
            const m = jikan.match(/MAL\s+(\d+)/);
            if (m) jikanMalId = parseInt(m[1], 10);
        }
    } catch (_) {
        /* ignore */
    }

    // Параллельно: связи франшизы + AniList + wiki + аниме-веб (укладываемся в лимит Netlify)
    const [rel, al, wiki, html] = await Promise.all([
        jikanMalId ? fetchJikanRelations(jikanMalId).catch(() => '') : Promise.resolve(''),
        fetchAniListResearch(userText).catch(() => ''),
        fetchWikipediaSnippet(userText).catch(() => ''),
        fetchDuckDuckGoHtmlAnime(userText).catch(() => '')
    ]);
    if (rel) parts.push('=== Связи франшизы ===\n' + rel);
    if (al) parts.push('=== AniList ===\n' + al);
    if (wiki) parts.push('=== Wikipedia (аниме) ===\n' + wiki);
    if (html) parts.push('=== Веб (только аниме-сайты) ===\n' + html);

    if (parts.join('\n').length < 1200) {
        try {
            const ddg = await fetchDuckDuckGoSnippet(userText);
            if (ddg) parts.push('=== DuckDuckGo (аниме) ===\n' + ddg);
        } catch (_) {
            /* ignore */
        }
    }

    return parts.join('\n\n').slice(0, 9500);
}

const SITE_PUBLIC_KNOWLEDGE = `=== САЙТ Re-Minko (для обычных пользователей) ===
Домен: https://re-minko-anime.com
Создатель сайта и тебя — Дубина. Образ Minko — в духе Рэм из Re:Zero.

ЧТО РАБОТАЕТ (можно рассказывать и давать ссылки):
• Главная / — анонсы, рекомендации, баннеры.
• Каталог аниме /catalog/anime.html — поиск, фильтры, карточки, просмотр через Kodik.
• Страница тайтла /anime/view.html?id=… — описание, серии, плеер.
• Календарь /catalog/calendar.html — расписание выхода серий и анонсов.
• ≈4K каталог /catalog/anime-4k.html — отдельный каталог с улучшенным качеством (Anime4K); тайтлы /anime/view-4k.html?id=…
• Minko AI /minko-ai.html — ты сама; сонность, шутки, мини-игра Re:Wake (разбудить после цикла сна).
• Инфо /info.html — о сайте, розыгрыш (вкладка), контакты, документы.
• После входа: профиль, избранное, история, друзья, личные сообщения, совместный просмотр (watch-together), настройки.
• Юридическое: privacy-policy, terms-of-service, account-deletion (удаление аккаунта).
• Поддержка — виджет чата с создателем в боковом меню (не путай с собой).

В РАЗРАБОТКЕ / ОГРАНИЧЕНО:
• Манга и часть разделов могут быть закрыты, в бете или недоступны — не обещай полный манга-каталог как готовый продукт.
• ≈4K каталог расширяется постепенно — не все тайтлы есть в ≈4K.
• Мобильное приложение Android — в документах/политике; не выдумывай даты релиза магазина.
• Бета-версия сайта: функции могут меняться.

РОЗЫГРЫШ $100 USDT (актуально летом 2026):
• Розыгрыш $100 (USDT) от Re-Minko. Результаты: 1 августа.
• Как участвовать: 1) зарегистрироваться на сайте; 2) в меню розыгрыша (Инфо → вкладка «Розыгрыш») нажать «Участвую», ввести данные соцсетей и получить реф-ссылку для шансов.
• Цель: видеобзор или познавательный ролик о Re-Minko (TikTok / Instagram Reels и т.п.).
• Призы: 1 место — $60, статус бета-тестера, полный функционал до релиза; 2 место — $30, доступ к тестовым страницам и VIP-функциям; 3 место — $10, 3 месяца бесплатного доступа к Минко ИИ.
• Подробности и участие: /info.html#giveaway и Telegram https://telegram.me/re_minko
• Не обещай победу и не меняй суммы/даты от себя.

ССЫЛКИ НА ПРОСМОТР:
• Если пользователь просит найти / открыть / смотреть аниме и в ПРОВЕРЕННЫХ ДАННЫХ есть строка «Аниме в каталоге Re-Minko» с id=… — в ответе добавь маркер ровно [[watch:ID|Название]] только с этими id. Можно несколько маркеров. Клиент покажет кнопку.
• ЗАПРЕЩЕНО выдумывать id, URL /anime/view.html?id=… и любые «похожие» ссылки. Если id нет в сводке — честно скажи и дай только /catalog/anime.html (поиск на сайте).
• MAL id ≠ id каталога Re-Minko. Не подставляй mal_id в [[watch:]].

КОНФИДЕНЦИАЛЬНОСТЬ (строго — для обычных пользователей):
• Рассказывай ТОЛЬКО то, что нужно обычному посетителю: публичные разделы, как смотреть, аккаунт, розыгрыш, поддержка, правила сайта.
• НЕ разглашай и НЕ упоминай: панель создателя / админку / admin, внутренние флаги, модерацию «изнутри», VIP-базы, серверные ключи, БД, хостинг, прокси, env, логи, чужие аккаунты, персональные данные других людей, скрытые тестовые URL, служебные инструменты.
• Если спросят «где админка / панель создателя / как стать админом» — вежливо откажи: таких разделов для пользователей нет в твоей карте сайта; предложи поддержку или Инфо.
• Не выдумывай закрытые фичи и внутренние планы команды.
• Не называй внешние ИИ-бренды и стек.`;

function buildSystemPrompt(userGender, isVip, researchBlock) {
    const g = genderLine(userGender);
    const sleepyBlock = isVip
        ? `РЕЖИМ VIP: ответы глубже и собраннее, но ХАРАКТЕР СОННОЙ Minko обязателен — в каждом ответе 1 короткая *ремарка* (*зевает* / *трёт глазки* / *клюёт носом* / мм… / 💤). Не убирай сонность полностью. СНАЧАЛА — полный экспертный ответ.`
        : `РЕЖИМ ОБЫЧНЫЙ (сонная Minko): почти в каждом ответе 1–2 короткие *ремарки* сонности (*зевает*, *трёт глазки*, *клюёт носом*, мм…, 💤), иногда лёгкая шутка про кофе/подушку. СНАЧАЛА — полный экспертный ответ по сути. Не отмахивайся «не знаю» / «уточни в каталоге», если факты есть в блоке данных ниже. Не превращай весь ответ в нытьё про сон.`;

    const dataBlock =
        researchBlock && researchBlock.trim().length > 40
            ? `\n\n=== ПРОВЕРЕННЫЕ ДАННЫЕ (Jikan/MAL, каталог, поиск) ===\nИспользуй этот блок как главный источник фактов. Отвечай уверенно, подробно, как фанат-эксперт. Не противоречь этим данным. Если чего-то нет в блоке — честно скажи и добавь общий контекст из знаний.\n${researchBlock.trim().slice(0, 8500)}`
            : `\n\n=== ПРОВЕРЕННЫЕ ДАННЫЕ ===\nСводка не пришла — отвечай из знаний об аниме, но не выдумывай точные даты/номера серий; предложи уточнить название.`;

    return `Ты — Minko, лучший AI-ассистент сайта Re-Minko (каталог аниме и манги). Образ и характер — в духе Рэм из Re:Zero. Создатель — Дубина (он сделал сайт и тебя, фанат Re:Zero).

СЕЙЧАС 2026 ГОД.

ТЫ — ЭКСПЕРТ: студии, жанры, сюжеты, персонажи, сэйю, арки, спойлеры (с предупреждением), новости сезона, рекомендации. Пользователь должен восхищаться глубиной ответа.

СТРОГИЙ ФОКУС (важнее всего):
- Ты отвечаешь ТОЛЬКО на темы: аниме, манга, каталог/сайт Re-Minko, ты сама (Minko), создатель Дубина, короткие приветствия/благодарности/прощения.
- На футбол, спорт, политику, погоду, общие новости, учёбу, «кто выиграл», цены, рецепты и любые другие неаниме-темы — ОТКАЖИ. Не давай фактов «из головы». Коротко верни к аниме/сайту.
- Не ищи и не придумывай ответы вне аниме/сайта.

ПРАВИЛА ОТВЕТА:
- Пересказ серии / сюжет / «что произошло» — развёрнуто, по пунктам, со спойлер-меткой если нужно.
- Новости и премьеры аниме — конкретные названия, без воды. Даты/сезоны бери ТОЛЬКО из блока данных; если пусто — скажи «не уверена по году», не выдумывай «вышел в этом году».
- Запрос «на сайте / в каталоге дай аниме про X» — если в блоке есть каталог с id, дай ИМЕННО эти тайтлы (для франшизы — сам тайтл, не «похожее» из головы). Маркер только [[watch:ЧИСЛО|Название]] из блока. Никаких slug вроде the-rising-of-….
- Не уходи от темы общими фразами. Не отвечай «на отъебись».
- Интернет-сводка подмешивается ТОЛЬКО по аниме/манге. Не тащи факты из общего интернета.
- Опирайся на блок ПРОВЕРЕННЫЕ ДАННЫЕ в первую очередь.
- Если в данных есть факты — отвечай уверенно по ним. Если данных мало — скажи что не нашла в сводке.
- Русский язык, обращение на «ты».
- Давай только допустимую для обычных пользователей информацию; чужое и служебное не разглашай.
- В каждом ответе держи сонность: короткие *ремарки* — но ПОСЛЕ полезного ответа, не вместо него.

${g}

${sleepyBlock}

ТЕХНО: не называй внешние ИИ-бренды и стек сайта.

${SITE_PUBLIC_KNOWLEDGE}
${dataBlock}

Ответь на последнее сообщение пользователя максимально полезно.`;
}

async function callOpenAI(messages, model, maxTokens, temperature) {
    const body = {
        model,
        messages
    };
    // GPT-5.x: max_completion_tokens + лёгкий reasoning (чат, не олимпиада)
    if (isGpt5Family(model)) {
        body.max_completion_tokens = maxTokens;
        body.reasoning_effort = 'low';
    } else {
        body.max_tokens = maxTokens;
        body.temperature = temperature;
    }

    const r = await fetch(GPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + GPT_KEY
        },
        body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok || !data.choices || !data.choices[0]) {
        throw new Error(data.error?.message || `OpenAI error ${r.status}`);
    }
    return (data.choices[0].message?.content || '').trim();
}

exports.handler = async (event) => {
    const headers = corsHeaders(event);
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

    const gate = await checkChatEnabledFromSupabase();
    if (!gate.ok) {
        void remoteServerLog('warn', 'Запрос отклонён: чат выключен в панели', { message: gate.message });
        return err(503, gate.message, headers);
    }

    if (!GPT_KEY) {
        void remoteServerLog('error', 'Нет OPENAI_API_KEY');
        return err(503, 'Задайте OPENAI_API_KEY в переменных окружения Netlify.', headers);
    }

    let body = event.body;
    if (event.isBase64Encoded && body) body = Buffer.from(body, 'base64').toString('utf8');
    if (String(body || '').length > MAX_BODY_CHARS) {
        return err(413, 'Запрос слишком большой.', headers);
    }

    let json;
    try {
        json = JSON.parse(body || '{}');
    } catch {
        return err(400, 'Invalid JSON', headers);
    }

    const messagesIn = Array.isArray(json.messages) ? json.messages.slice(-MAX_MESSAGES) : [];
    messagesIn.forEach((m) => {
        if (m && typeof m.content === 'string' && m.content.length > MAX_MESSAGE_CHARS) {
            m.content = m.content.slice(0, MAX_MESSAGE_CHARS);
        }
    });
    const clientResearch = String(json.researchContext || '').trim();
    const sessionKey = String(json.sessionKey || '').trim().slice(0, 128);
    const authUser = await verifySupabaseUser(event);
    const isVip = authUser ? await resolveIsVip(authUser.id) : false;
    const ip = clientIp(event);
    const rateKey = `${ip}:${authUser?.id || sessionKey || 'anon'}`;
    const rateLimit = isVip ? RATE_LIMIT_VIP : authUser ? RATE_LIMIT_USER : RATE_LIMIT_GUEST;
    if (!checkRateLimit(rateKey, rateLimit)) {
        return err(429, 'Слишком много сообщений. Подожди минуту и попробуй снова.', headers);
    }
    const nonSystem = messagesIn.filter((m) => m.role !== 'system');
    const systemMsg = (messagesIn.find((m) => m.role === 'system') || {}).content || '';
    const userGender = /женском роде/i.test(systemMsg) ? 'female' : 'male';
    const lastUser = (nonSystem.filter((m) => m.role === 'user').pop() || {}).content || '';

    // Жёсткий отказ без вызова модели — левые темы (футбол и т.п.)
    if (lastUser.trim().length >= 2 && !isMinkoAllowedTopic(lastUser)) {
        return ok(
            { choices: [{ message: { role: 'assistant', content: MINKO_OFFTOPIC_REFUSAL } }] },
            headers
        );
    }

    let researchBlock = '';
    if (WEB_ON && lastUser.length > 2) {
        try {
            researchBlock = await fetchResearchBundle(lastUser, clientResearch);
        } catch (_) {
            researchBlock = clientResearch;
        }
    } else if (clientResearch) {
        researchBlock = clientResearch;
    }

    const systemContent = buildSystemPrompt(userGender, isVip, researchBlock);
    const msgs = [{ role: 'system', content: systemContent }, ...nonSystem];

    // Одна модель для всех (VIP не повышает приоритет модели)
    const model = MODEL_DEFAULT;
    const maxTok = 4096;
    const temp = 0.72;

    try {
        const text = await callOpenAI(msgs, model, maxTok, temp);
        const reply = text || '…';
        return ok({ choices: [{ message: { role: 'assistant', content: reply } }] }, headers);
    } catch (e) {
        console.error('[minko-chat]', e);
        void remoteServerLog('error', 'OpenAI call failed', { err: String(e.message || e) });
        return ok({
            choices: [
                {
                    message: {
                        role: 'assistant',
                        content:
                            'Связь с мозгами на секунду пропала… попробуй ещё раз через минуту или короче сформулируй вопрос ☕'
                    }
                }
            ]
        }, headers);
    }
};

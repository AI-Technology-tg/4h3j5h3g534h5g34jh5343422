/**
 * Netlify Function — OpenAI + веб-поиск (Google/Bing/DDG) для Minko AI (+ Supabase-ворота).
 * POST JSON: { messages, isVip?, sessionKey?, researchContext? }
 * Факты по аниме — из интернета, не из Jikan/AniList.
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

async function jikanGet(path, ms = 3500) {
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
        // Короткий поиск без /full при таймаутах Jikan (часто 504)
        const search = await jikanGet(`/anime?q=${encodeURIComponent(title)}&limit=2`, 3200);
        const hit = search?.data?.[0];
        if (!hit?.mal_id) continue;
        let a = hit;
        const full = await jikanGet(`/anime/${hit.mal_id}/full`, 3200);
        if (full?.data) a = full.data;
        parts.push('[Jikan / MyAnimeList]\n' + formatAnimeBlock(a, episodeHint));
        if (episodeHint && a.mal_id) {
            const page = Math.ceil(episodeHint / 100);
            const eps = await jikanGet(`/anime/${a.mal_id}/episodes?page=${page}&limit=100`, 3200);
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

const MINKO_OFFTOPIC_JOKE_SYSTEM = `Ты — Minko, сонная девушка-помощница Re-Minko (образ в духе Рэм из Re:Zero). Создатель — Дубина.

Пользователь ушёл НЕ в тему: не аниме, не манга и не сайт Re-Minko.

ЖЁСТКИЕ ПРАВИЛА:
1) НЕ отвечай по сути «левого» вопроса. НЕ давай фактов про футбол, спорт, политику, новости, погоду, учёбу и т.п. — даже если «знаешь».
2) Отшутись остроумно, по-доброму, с характером (можно лёгкий стёб, *ремарки* сна, сравнение с аниме).
3) Коротко верни к аниме / манге / каталогу Re-Minko или к себе.
4) 1–4 предложения, на «ты», 1–2 эмодзи. Не читай лекцию и не повторяй канцелярит «я отвечаю только про…».
5) Если добивают («уверена?», «правда?», «ну скажи») — ещё смешнее упорствуй в отказе, без фактов по теме.

Примеры тона (не копируй дословно):
- «Футбол? Я в нём как Субару в первом цикле — только и делаю, что ресетюсь к каталогу 💤 Давай лучше про тайтл.»
- «Уверена на все 100%, что мяч мне не по специальности. А вот про Re:Zero — спрашивай.»`;

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

const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function buildAnimeWebQuery(userText) {
    const base = String(userText || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 160);
    if (base.length < 2) return '';
    if (/аниме|anime|манга|manga|myanimelist|anilist|shikimori/i.test(base)) return base;
    return base + ' аниме';
}

function uniqSearchHits(hits, max) {
    const out = [];
    const seen = new Set();
    for (const h of hits) {
        if (!h || !h.title) continue;
        const key = String(h.url || h.title)
            .toLowerCase()
            .replace(/^https?:\/\/(www\.)?/, '')
            .slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(h);
        if (out.length >= (max || 8)) break;
    }
    return out;
}

async function fetchGoogleCseHits(query) {
    const key = (process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    const cx = (process.env.GOOGLE_CSE_CX || process.env.GOOGLE_CSE_ID || '').trim();
    if (!key || !cx) return [];
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 7000);
    try {
        const url =
            'https://www.googleapis.com/customsearch/v1?key=' +
            encodeURIComponent(key) +
            '&cx=' +
            encodeURIComponent(cx) +
            '&q=' +
            encodeURIComponent(query) +
            '&num=8&hl=ru';
        const r = await fetch(url, { signal: ac.signal });
        if (!r.ok) return [];
        const j = await r.json();
        return (Array.isArray(j.items) ? j.items : [])
            .map((it) => ({
                title: String(it.title || '').slice(0, 180),
                snip: String(it.snippet || '').slice(0, 400),
                url: String(it.link || '')
            }))
            .filter((x) => x.title);
    } catch {
        return [];
    } finally {
        clearTimeout(tid);
    }
}

/** Google basic HTML (gbv=1) — без JS, часто доступен из serverless */
async function fetchGoogleHtmlHits(query) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 7000);
    try {
        const url =
            'https://www.google.com/search?gbv=1&hl=ru&num=10&q=' + encodeURIComponent(query);
        const r = await fetch(url, {
            signal: ac.signal,
            headers: {
                'User-Agent': BROWSER_UA,
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
            }
        });
        if (!r.ok) return [];
        const html = await r.text();
        if (/unusual traffic|captcha|sorry\/index/i.test(html)) return [];
        const hits = [];
        const re =
            /<a[^>]+href="(?:\/url\?q=|https?:\/\/)([^"&]+)[^"]*"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/gi;
        let m;
        while ((m = re.exec(html)) !== null && hits.length < 8) {
            let href = decodeHtmlEntities(m[1] || '');
            try {
                href = decodeURIComponent(href);
            } catch {
                /* keep */
            }
            if (!/^https?:\/\//i.test(href)) href = 'https://' + href.replace(/^\/+/, '');
            if (/google\./i.test(href)) continue;
            const title = decodeHtmlEntities(stripHtml(m[2])).slice(0, 180);
            if (title.length < 3) continue;
            hits.push({ title, snip: '', url: href.slice(0, 400) });
        }
        // запас: старый формат /url?q=
        if (!hits.length) {
            const re2 = /href="\/url\?q=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
            while ((m = re2.exec(html)) !== null && hits.length < 8) {
                let href = decodeHtmlEntities(m[1] || '');
                try {
                    href = decodeURIComponent(href);
                } catch {
                    /* keep */
                }
                if (!/^https?:\/\//i.test(href) || /google\./i.test(href)) continue;
                const title = decodeHtmlEntities(stripHtml(m[2])).slice(0, 180);
                if (title.length < 3 || /cached|похожие|similar/i.test(title)) continue;
                hits.push({ title, snip: '', url: href.slice(0, 400) });
            }
        }
        return hits;
    } catch {
        return [];
    } finally {
        clearTimeout(tid);
    }
}

async function fetchBingHtmlHits(query) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 7000);
    try {
        const url = 'https://www.bing.com/search?setlang=ru-RU&q=' + encodeURIComponent(query);
        const r = await fetch(url, {
            signal: ac.signal,
            headers: {
                'User-Agent': BROWSER_UA,
                Accept: 'text/html',
                'Accept-Language': 'ru-RU,ru;q=0.9'
            }
        });
        if (!r.ok) return [];
        const html = await r.text();
        const hits = [];
        const blocks = html.split(/class="b_algo"/i).slice(1, 10);
        for (const block of blocks) {
            const am = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
            if (!am) continue;
            const href = decodeHtmlEntities(am[1] || '').slice(0, 400);
            const title = decodeHtmlEntities(stripHtml(am[2])).slice(0, 180);
            if (!/^https?:\/\//i.test(href) || title.length < 3) continue;
            const sm = block.match(/class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
            const snip = sm ? decodeHtmlEntities(stripHtml(sm[1])).slice(0, 400) : '';
            hits.push({ title, snip, url: href });
            if (hits.length >= 8) break;
        }
        return hits;
    } catch {
        return [];
    } finally {
        clearTimeout(tid);
    }
}

async function fetchDuckDuckGoHtmlHits(query) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 6500);
    try {
        const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
            signal: ac.signal,
            headers: {
                'User-Agent': BROWSER_UA,
                Accept: 'text/html'
            }
        });
        if (!r.ok) return [];
        const html = await r.text();
        const hits = [];
        const re =
            /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
        let m;
        while ((m = re.exec(html)) !== null && hits.length < 8) {
            const title = decodeHtmlEntities(stripHtml(m[2])).slice(0, 180);
            const snip = decodeHtmlEntities(stripHtml(m[3])).slice(0, 400);
            let href = decodeHtmlEntities(m[1] || '');
            const uddg = href.match(/[?&]uddg=([^&]+)/);
            if (uddg) {
                try {
                    href = decodeURIComponent(uddg[1]);
                } catch {
                    /* keep */
                }
            }
            if (title.length < 3) continue;
            hits.push({ title, snip, url: href.slice(0, 400) });
        }
        return hits;
    } catch {
        return [];
    } finally {
        clearTimeout(tid);
    }
}

/** Текст страницы через Jina Reader (без своих API-ключей) */
async function fetchPageTextViaJina(pageUrl) {
    const u = String(pageUrl || '').trim();
    if (!/^https?:\/\//i.test(u)) return '';
    if (/google\.|bing\.|duckduckgo\.|youtube\.com\/watch/i.test(u)) return '';
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 4500);
    try {
        const r = await fetch('https://r.jina.ai/' + u, {
            signal: ac.signal,
            headers: {
                Accept: 'text/plain',
                'User-Agent': BROWSER_UA,
                'X-Return-Format': 'text'
            }
        });
        if (!r.ok) return '';
        const text = String((await r.text()) || '')
            .replace(/\r/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        return text.slice(0, 2800);
    } catch {
        return '';
    } finally {
        clearTimeout(tid);
    }
}

function formatHitsBlock(hits) {
    return hits
        .map((h, i) => {
            const n = i + 1;
            const sn = h.snip ? ' — ' + h.snip : '';
            const link = h.url ? `\n  ${h.url}` : '';
            return `${n}. ${h.title}${sn}${link}`;
        })
        .join('\n');
}

/** Прямые страницы для частых франшиз — если SERP с Netlify пустой. */
function knownFactPages(userText) {
    const t = String(userText || '');
    const urls = [];
    if (/ре\s*[-:]?\s*зеро|резеро|re\s*[-:]?\s*zero|rezero/i.test(t)) {
        if (/\b4\b|четвёрт|четверт|4th|тв-?4|tv-?4/i.test(t)) {
            urls.push(
                'https://en.wikipedia.org/wiki/Re:Zero_season_4',
                'https://en.wikipedia.org/wiki/List_of_Re:Zero_episodes'
            );
        } else {
            urls.push('https://en.wikipedia.org/wiki/List_of_Re:Zero_episodes');
        }
    }
    return urls.slice(0, 2);
}

async function fetchSiteCalendarResearch(userText) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 4000);
    try {
        const r = await fetch('https://re-minko-anime.com/data/kodik-calendar.json', {
            signal: ac.signal,
            headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA }
        });
        if (!r.ok) return '';
        const j = await r.json();
        const items = Array.isArray(j.items) ? j.items : [];
        const t = String(userText || '');
        const wantRezero = /ре\s*[-:]?\s*зеро|резеро|re\s*[-:]?\s*zero|rezero/i.test(t);
        const season4 = /\b4\b|4th|тв-?4|tv-?4|четвёрт|четверт/i.test(t);
        const hits = items.filter((it) => {
            const blob = `${it.title_ru || ''} ${it.title_en || ''}`;
            if (wantRezero && /re:?\s*zero|hajimeru isekai|жизнь с нуля/i.test(blob)) {
                if (season4) return /4|4th/i.test(blob);
                return true;
            }
            return false;
        });
        if (!hits.length && wantRezero) {
            const soft = items.filter((it) =>
                /re:?\s*zero|hajimeru isekai|жизнь с нуля/i.test(
                    `${it.title_ru || ''} ${it.title_en || ''}`
                )
            );
            hits.push(...soft.slice(0, 1));
        }
        if (!hits.length) return '';
        return (
            'Календарь сайта (цифры выхода):\n' +
            hits
                .slice(0, 2)
                .map((it) => {
                    const name = it.title_ru || it.title_en || '?';
                    return `«${name}»: вышло ${it.episodes_aired ?? '?'}, следующая серия ${it.next_episode ?? '?'} (${it.next_at || '?'}), статус ${it.status || '?'}`;
                })
                .join('\n')
        );
    } catch {
        return '';
    } finally {
        clearTimeout(tid);
    }
}

async function fetchInternetResearch(userText) {
    const q = buildAnimeWebQuery(userText);
    if (!q) return '';

    const knownUrls = knownFactPages(userText);
    const [cse, google, bing, ddg, ...knownPages] = await Promise.all([
        fetchGoogleCseHits(q).catch(() => []),
        fetchGoogleHtmlHits(q).catch(() => []),
        fetchBingHtmlHits(q).catch(() => []),
        fetchDuckDuckGoHtmlHits(q).catch(() => []),
        ...knownUrls.map((u) => fetchPageTextViaJina(u).catch(() => ''))
    ]);

    // Приоритет: Google CSE → Google HTML → Bing → DDG
    const hits = uniqSearchHits([...(cse || []), ...(google || []), ...(bing || []), ...(ddg || [])], 8);
    const parts = [];
    if (hits.length) {
        parts.push('Результаты поиска по запросу: «' + q + '»', formatHitsBlock(hits));
    } else {
        try {
            const snip = await fetchDuckDuckGoSnippet(userText);
            if (snip) parts.push('Краткая сводка:\n' + snip);
        } catch {
            /* ignore */
        }
    }

    knownUrls.forEach((u, i) => {
        const txt = knownPages[i];
        if (txt && String(txt).length >= 80) {
            parts.push('--- Страница: ' + u + ' ---\n' + String(txt).slice(0, 3200));
        }
    });

    // Если известных страниц нет — одна из выдачи
    if (!knownUrls.length || !knownPages.some((p) => p && String(p).length >= 80)) {
        const prefer =
            /myanimelist|anilist|shikimori|animenewsnetwork|anime-planet|wikipedia|crunchyroll/i;
        const toRead =
            hits.find((h) => h.url && prefer.test(h.url)) || hits.find((h) => h.url) || null;
        if (toRead) {
            const txt = await fetchPageTextViaJina(toRead.url).catch(() => '');
            if (txt && txt.length >= 80) {
                parts.push(
                    '--- Страница: ' + (toRead.title || toRead.url) + ' ---\n' + txt.slice(0, 2800)
                );
            }
        }
    }

    return parts.join('\n\n').slice(0, 9000);
}

async function fetchResearchBundle(userText, clientResearch) {
    const parts = [];
    const client = String(clientResearch || '').trim();
    const hasCatalogFacts = /ФАКТЫ ИЗ КАТАЛОГА|КАЛЕНДАРЬ Re-Minko|серии \d/i.test(client);
    if (client.length > 30) {
        parts.push('=== Каталог / календарь Re-Minko ===\n' + client.slice(0, 5000));
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

    try {
        const [web, siteCal] = await Promise.all([
            fetchInternetResearch(userText).catch(() => ''),
            fetchSiteCalendarResearch(userText).catch(() => '')
        ]);
        if (siteCal) {
            parts.push('=== КАЛЕНДАРЬ САЙТА (сервер) ===\n' + siteCal);
        }
        if (web) {
            parts.push(
                '=== ПОИСК В ИНТЕРНЕТЕ (дополнение к каталогу/календарю) ===\n' + web
            );
        } else if (!hasCatalogFacts && !siteCal) {
            parts.push(
                '=== ПОИСК В ИНТЕРНЕТЕ ===\nСводка пуста. Не выдумывай свежие даты/сезоны.'
            );
        }
    } catch (_) {
        if (!hasCatalogFacts) {
            parts.push('=== ПОИСК В ИНТЕРНЕТЕ ===\nОшибка поиска. Не выдумывай свежие даты/сезоны.');
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
            ? `\n\n=== ДАННЫЕ (каталог + календарь + интернет) ===\nПорядок доверия: 1) КАЛЕНДАРЬ / ФАКТЫ ИЗ КАТАЛОГА  2) страницы из интернета  3) память модели (только если сверху пусто).\nЕсли в блоке есть «вышло серий / серии 1-N / следующая» — СРАЗУ назови цифры. Запрещено отвечать «в сводке нет данных», когда цифры есть в блоке. Не подсовывай другие аниме (KonoSuba, Slime и т.п.), если вопрос про конкретный тайтл.\n${researchBlock.trim().slice(0, 8500)}`
            : `\n\n=== ДАННЫЕ ===\nСводка не пришла — не выдумывай точные даты/номера серий; скажи, что не нашла, и предложи уточнить название.`;

    return `Ты — Minko, лучший AI-ассистент сайта Re-Minko (каталог аниме и манги). Образ и характер — в духе Рэм из Re:Zero. Создатель — Дубина (он сделал сайт и тебя, фанат Re:Zero).

СЕЙЧАС 2026 ГОД.

ТЫ — ЭКСПЕРТ: студии, жанры, сюжеты, персонажи, сэйю, арки, спойлеры (с предупреждением), новости сезона, рекомендации. Пользователь должен восхищаться глубиной ответа.

СТРОГИЙ ФОКУС (важнее всего):
- Ты отвечаешь ТОЛЬКО на темы: аниме, манга, каталог/сайт Re-Minko, ты сама (Minko), создатель Дубина, короткие приветствия/благодарности/прощения.
- На футбол, спорт, политику, погоду, общие новости и прочий оффтоп — не отвечай по сути: остроумно отшутись и верни к аниме/сайту. Без фактов «из головы» и без канцелярита.
- Не ищи и не придумывай ответы вне аниме/сайта.

ПРАВИЛА ОТВЕТА:
- Пересказ серии / сюжет / «что произошло» — развёрнуто, по пунктам, со спойлер-меткой если нужно.
- Новости и премьеры аниме — конкретные названия из блока поиска. Даты/сезоны/статус — ТОЛЬКО из интернета в блоке; если пусто — «не нашла в сети», не выдумывай.
- Запрос «на сайте / в каталоге дай аниме про X» — если в блоке есть каталог с id, дай ИМЕННО эти тайтлы. Маркер только [[watch:ЧИСЛО|Название]] из блока.
- Не уходи от темы общими фразами.
- Интернет-сводка только по аниме/манге.
- С первого ответа опирайся на свежий поиск; не давай устаревшую «память», если в блоке есть другие факты.
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

    const model = MODEL_DEFAULT;
    const offtopic = lastUser.trim().length >= 2 && !isMinkoAllowedTopic(lastUser);

    // Оффтоп: без веб-поиска, короткая «шутливая отмазка» (факты по теме запрещены промптом)
    if (offtopic) {
        const recent = nonSystem.slice(-4).map((m) => ({ role: m.role, content: m.content }));
        const msgs = [{ role: 'system', content: MINKO_OFFTOPIC_JOKE_SYSTEM }, ...recent];
        try {
            const text = await callOpenAI(msgs, model, 420, 0.9);
            const reply =
                text ||
                '*зевает* Не-а~ Я только по аниме и сайту. Давай лучше тайтл какой-нибудь 💤';
            return ok({ choices: [{ message: { role: 'assistant', content: reply } }] }, headers);
        } catch (e) {
            console.error('[minko-chat] offtopic', e);
            return ok(
                {
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content:
                                    '*клюёт носом* Ой, я почти ответила… и поняла, что это не про аниме 💤 Кинь лучше тайтл из каталога~'
                            }
                        }
                    ]
                },
                headers
            );
        }
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

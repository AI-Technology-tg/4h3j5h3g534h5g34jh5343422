/**
 * Netlify Function — аниме-ассистент с обвязкой поиска (как советует OpenAI):
 * 1) вопрос про аниме?  2) search API → источники  3) OpenAI отвечает ТОЛЬКО по источникам.
 * POST JSON: { messages, isVip?, sessionKey?, researchContext? }
 *
 * Поиск (по приоритету): Tavily → SerpAPI → OpenAI web_search → scrape Google/Bing/DDG.
 */
const GPT_URL = 'https://api.openai.com/v1/chat/completions';
const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const GPT_KEY = process.env.OPENAI_API_KEY || process.env.MINKO_GPT_API_KEY || '';
/** Одна модель на весь чат. Env MINKO_OPENAI_MODEL опционален — по умолчанию gpt-5.6 */
const MODEL_DEFAULT = (process.env.MINKO_OPENAI_MODEL || 'gpt-5.6').trim();
const MODEL_VIP = (process.env.MINKO_OPENAI_MODEL_VIP || MODEL_DEFAULT).trim();
const WEB_ON = String(process.env.MINKO_WEB_SEARCH || '1').trim() === '1';
/** Нативный поиск OpenAI (Responses API + web_search) — fallback, если нет Tavily/SerpAPI */
const OPENAI_WEB_SEARCH = String(process.env.MINKO_OPENAI_WEB_SEARCH || '1').trim() === '1';
const TAVILY_KEY = (process.env.TAVILY_API_KEY || process.env.MINKO_TAVILY_API_KEY || '').trim();
const SERPAPI_KEY = (process.env.SERPAPI_API_KEY || process.env.MINKO_SERPAPI_KEY || '').trim();
/** Бесплатные альтернативы с большим лимитом (опционально) */
const UNSEARCH_KEY = (process.env.UNSEARCH_API_KEY || process.env.MINKO_UNSEARCH_KEY || '').trim();
const SEARCHX_KEY = (process.env.SEARCHX_API_KEY || process.env.MINKO_SEARCHX_KEY || '').trim();
/**
 * 1 = сначала бесплатный scrape (DDG/Bing/Google HTML), платные API — только если scrape пуст.
 * Экономит кредиты Tavily. По умолчанию включено.
 */
const SEARCH_FREE_FIRST = String(process.env.MINKO_SEARCH_FREE_FIRST || '1').trim() !== '0';
const JIKAN = 'https://api.jikan.moe/v4';

/** Домены аниме/манги для web_search filters (как «гугл только по теме») */
const ANIME_SEARCH_DOMAINS = [
    'myanimelist.net',
    'anilist.co',
    'shikimori.one',
    'animenewsnetwork.com',
    'anime-planet.com',
    'wikipedia.org',
    'fandom.com',
    'crunchyroll.com',
    'anitrendz.com',
    'livechart.me',
    'anichart.net',
    'kitsu.app',
    'anidb.net',
    'mangaupdates.com',
    'animecorner.me',
    'animenewsnetwork.com'
];

function isAllowedAnimeSourceUrl(value) {
    try {
        const url = new URL(String(value || ''));
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
        const hostname = url.hostname.toLowerCase();
        return ANIME_SEARCH_DOMAINS.some(
            (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
        );
    } catch (_) {
        return false;
    }
}

function isGpt5Family(model) {
    return /^gpt-5/i.test(String(model || '')) || /^o[0-9]/i.test(String(model || ''));
}

const { allowedOrigin, corsHeaders: buildCorsHeaders } = require('./_cors');
const {
    blockedClientResponse,
    consumeRateLimit,
    fetchWithTimeout,
    getAuthenticatedUser,
    ipHash,
    readJsonWithLimit,
    readTextWithLimit,
    recordSecurityEvent,
    safeText,
    sanitizeDetails
} = require('./_security');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAX_BODY_CHARS = 24000;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4000;
const RATE_LIMIT_GUEST = 10;
const RATE_LIMIT_USER = 18;
const RATE_LIMIT_VIP = 30;

async function fetchMinkoPublicState() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    try {
        const r = await fetchWithTimeout(
            `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/minko_ai_public_state?id=eq.1&select=chat_enabled,maintenance_message,search_provider`,
            {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`
                }
            },
            8000
        );
        if (!r.ok) return null;
        const rows = await readJsonWithLimit(r, 128 * 1024);
        return Array.isArray(rows) ? rows[0] : null;
    } catch (e) {
        console.warn('[minko-chat] supabase state', safeText(e?.message, 120));
        return null;
    }
}

async function checkChatEnabledFromSupabase() {
    const row = await fetchMinkoPublicState();
    if (!row) {
        return {
            ok: false,
            message: 'Minko AI временно недоступна: не удалось проверить состояние сервиса.'
        };
    }
    if (row && row.chat_enabled === false) {
        return {
            ok: false,
            message: (row.maintenance_message || '').trim() || 'Minko AI временно отключена.'
        };
    }
    return { ok: true };
}

/** auto | free | tavily — из панели создателя */
async function resolveSearchProviderMode() {
    const row = await fetchMinkoPublicState();
    const mode = String((row && row.search_provider) || process.env.MINKO_SEARCH_PROVIDER || 'auto')
        .trim()
        .toLowerCase();
    if (mode === 'free' || mode === 'tavily' || mode === 'auto') return mode;
    return 'auto';
}

async function remoteServerLog(level, message, details) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
    try {
        await fetchWithTimeout(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/minko_ai_server_logs`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify({
                level: safeText(level, 32),
                message: safeText(message, 1000),
                details: sanitizeDetails(details)
            })
        }, 8000);
    } catch (e) {
        console.warn('[minko-chat] remoteServerLog', safeText(e?.message, 120));
    }
}

async function resolveIsVip(userId) {
    if (!userId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
    try {
        const base = SUPABASE_URL.replace(/\/$/, '');
        const url =
            `${base}/rest/v1/vip_subscriptions?user_id=eq.${encodeURIComponent(userId)}` +
            '&select=is_active,expires_at&limit=1';
        const r = await fetchWithTimeout(url, {
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
        }, 8000);
        const rows = await readJsonWithLimit(r, 128 * 1024).catch(() => []);
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row || row.is_active !== true) return false;
        if (row.expires_at && new Date(row.expires_at) <= new Date()) return false;
        return true;
    } catch (e) {
        console.warn('[minko-chat] vip check', safeText(e?.message, 120));
        return false;
    }
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

function normalizeUserGender(raw) {
    const g = String(raw || '').trim().toLowerCase();
    if (g === 'female' || g === 'f' || g === 'ж' || g === 'жен' || g === 'женский') return 'female';
    return 'male';
}

function genderLine(userGender) {
    return userGender === 'female'
        ? 'ПОЛ СОБЕСЕДНИКА (строго): девушка. Обращайся в женском роде: смотрелА, пришлА, хотелА, проспалА. Не путай с тем, что ТЫ (Minko) — девушка.'
        : 'ПОЛ СОБЕСЕДНИКА (строго): парень. Обращайся в мужском роде: смотрел, пришёл, хотел, проспал. Не путай с тем, что ТЫ (Minko) — девушка: о себе говори в женском роде, к нему — в мужском.';
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
        [/магическ\w+\s+битв|jujutsu/i, ['Jujutsu Kaisen']],
        [
            /детектив\s+уже\s+м[её]ртв|detective\s+is\s+already\s+dead|tantei\s+wa\s+mou|tanmoshi|сиест[аы]/i,
            ['The Detective Is Already Dead', 'Tantei wa Mou Shindeiru', 'Детектив уже мёртв']
        ]
    ];
    const out = [];
    for (const [re, qs] of aliases) {
        if (re.test(text)) out.push(...qs);
    }
    return out;
}

function extractSeasonHintServer(msg) {
    const t = String(msg || '');
    let m = t.match(/(?:^|[^\d])(\d{1,2})\s*[-.]?\s*(?:сезон|season|тв|tv)(?=\s|$|[.,!?«»"'])/i);
    if (!m) m = t.match(/(?:сезон|season|тв|tv)\s*[-.]?\s*(\d{1,2})(?=\s|$|[.,!?«»"'])/i);
    if (!m) m = t.match(/(?:втор|второ)\w*\s+сезон/i) ? [null, '2'] : null;
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 && n < 40 ? n : null;
}

/** Дата/сезон/премьера — нельзя отвечать только каталогом без веба. */
function needsFreshReleaseWeb(text) {
    const t = String(text || '');
    if (extractSeasonHintServer(t) != null) return true;
    return /дата\s*(?:выход|премьер)|когда\s*(?:выйд|выйдет|выходит|премьер)|премьер|анонсир|отложен|перенес|release\s*date|premiere/i.test(
        t
    );
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
        return await readJsonWithLimit(r, 1024 * 1024);
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
        /аниме|манга|манхв|тайтл|сери[яию]|эпизод|сезон|студи|сэйю|сейю|персонаж|сюжет|спойлер|арк|онгоинг|анонс|премьер|озвуч|рекоменд|похож|каталог|шикимори|shiki|mal\b|myanimelist|anilist|kodik|jikan|isekai|сёнэн|сёдзё|сэйнэн|ova\b|ona\b|фильм|смотреть|пересказ|франшиз|продолжен|сиквел|sequel|второй\s+сезон|2[\s-]?й?\s*сезон/i.test(
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

/** Разрешённые темы вне аниме: сайт, ты сама, создатель, закрытые вопросы про проект (не оффтоп). */
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
        /кто\s+ты|ты\s+кто|представься|как\s+тебя\s+зовут|кто\s+создал|создател|дубина|subarik|субарик|любимое\s+аниме|ты\s+рем|образ/i.test(
            t
        )
    ) {
        return true;
    }
    // Закрытые/внутренние темы проекта — тоже «про сайт», не футбол-оффтоп
    if (
        /сервер|хостинг|инфраструктур|стек|бд\b|база\s*данн|бэкенд|фронтенд|фреймворк|прокси|api|ключ|админк|исходник|репозитор|github|gitlab|netlify|vercel|домен|ip\b|провайдер|клонир|скопир|сдамп|парс(ить|ер)|украсть\s+сайт|взять\s+с\s+сайт|на\s+ч(ё|е)м\s+(сайт|написан|сделан)|как\s+(сделан|устроен)\s+сайт|реальн\w*\s+(имя|данн|фамил)|настоящ\w*\s+имя|личн\w*\s+данн|соцсет|telegram\s+создател|кто\s+такой\s+дубин/i.test(
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

/** «проверь», «где нет?», «разве?» — follow-up к прошлому аниме-вопросу */
function isFollowUpProbe(msg) {
    const t = String(msg || '').trim();
    if (
        /^(проверь|проверь\s+в\s+(инете|интернете)|в\s+(инете|интернете)|посмотри|узнай|точно\??|уверен\w*\??|ну\s+проверь|давай|ну)[\s!.?…]*$/i.test(
            t
        )
    ) {
        return true;
    }
    // Сомнения / уточнения после ответа про тайтл (иначе уходит в offtopic-шутку)
    if (
        t.length <= 80 &&
        /^(где\s+нет|а\s+где|где\s+же|почему\s+нет|разве|неправда|вр[её]шь|ошибк\w*|в\s+смысле|как\s+так|серь[её]зно|а\s+продолжен\w*|нет\s+продолжен\w*|а\s+второй|а\s+2[\s-]?й?|точно\s+нет|а\s+как\s+же|и\s+что|ну\s+и\??|хм+|эм+)[\s!.?…]*$/i.test(
            t
        )
    ) {
        return true;
    }
    return false;
}

/** Короткое уточнение в ветке аниме-диалога — не оффтоп */
function isShortAnimeThreadFollowUp(msg) {
    const t = String(msg || '').trim();
    if (t.length < 2 || t.length > 48) return false;
    if (isMinkoAllowedTopic(t) || isFollowUpProbe(t)) return false;
    // Явный оффтоп не маскируем
    if (
        /футбол|спорт|политик|погод|крипт|биткоин|акци|новост\s+дня|рецепт|готов|учёб|школ|универ|дела\b|настроен/i.test(
            t
        )
    ) {
        return false;
    }
    return /^(а\s+|ну\s+|и\s+|но\s+|так\s+)?(где(\s+нет|\s+же)?|почему(\s+нет)?|разве|нет\??|правда\??|точно(\s+нет)?|серь[её]зн\w*)\b/i.test(
        t
    );
}

function recentUserTexts(nonSystem, limit) {
    return (nonSystem || [])
        .filter((m) => m && m.role === 'user' && m.content)
        .slice(-(limit || 8))
        .map((m) => String(m.content));
}

function researchQueryFromHistory(nonSystem, lastUser) {
    const last = String(lastUser || '').trim();
    const users = recentUserTexts(nonSystem, 8);
    let prevAnime = '';
    for (let i = users.length - 2; i >= 0; i--) {
        if (isAnimeResearchTopic(users[i])) {
            prevAnime = users[i];
            break;
        }
    }
    const shortAnimePush =
        isAnimeResearchTopic(last) &&
        prevAnime &&
        last.length <= 70 &&
        last.split(/\s+/).length <= 8 &&
        !/[«"][^»"]{3,}[»"]/.test(last);
    const needsPrev =
        !!prevAnime &&
        (isFollowUpProbe(last) || isShortAnimeThreadFollowUp(last) || shortAnimePush);
    if (needsPrev) {
        return prevAnime + '\n\nУточнение пользователя: ' + last;
    }
    if (isAnimeResearchTopic(last)) return last;
    return last;
}

function isOfftopicWithHistory(nonSystem, lastUser) {
    const last = String(lastUser || '').trim();
    if (!last) return false;
    if (isMinkoAllowedTopic(last)) return false;
    const users = recentUserTexts(nonSystem, 8);
    const threadHasAnime = users.some((u) => isAnimeResearchTopic(u) || isMinkoAllowedTopic(u));
    if (threadHasAnime && (isFollowUpProbe(last) || isShortAnimeThreadFollowUp(last))) {
        return false;
    }
    return true;
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
        const html = await readTextWithLimit(r, 1024 * 1024);
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
            const j = await readJsonWithLimit(r, 1024 * 1024);
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
        const j = await readJsonWithLimit(r, 1024 * 1024);
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
            const j = await readJsonWithLimit(r, 1024 * 1024);
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
    const aliases = expandAliasQueries(base);
    const enTitle = aliases.find((a) => /[A-Za-z]{3}/.test(a));
    const seasonN = extractSeasonHintServer(base);
    if (needsFreshReleaseWeb(base) && (enTitle || seasonN)) {
        const title = enTitle || base.replace(/\?.*$/, '').slice(0, 80);
        if (seasonN) {
            return `${title} season ${seasonN} release date anime`.replace(/\s+/g, ' ').slice(0, 160);
        }
        return `${title} release date anime`.replace(/\s+/g, ' ').slice(0, 160);
    }
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
        const j = await readJsonWithLimit(r, 1024 * 1024);
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
        const html = await readTextWithLimit(r, 1024 * 1024);
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
        const html = await readTextWithLimit(r, 1024 * 1024);
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
        const html = await readTextWithLimit(r, 1024 * 1024);
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
    if (!isAllowedAnimeSourceUrl(u)) return '';
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
        const text = String((await readTextWithLimit(r, 1024 * 1024)) || '')
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
    if (
        /детектив\s+уже\s+м[её]ртв|detective\s+is\s+already\s+dead|tantei\s+wa\s+mou|tanmoshi/i.test(
            t
        )
    ) {
        urls.push(
            'https://en.wikipedia.org/wiki/The_Detective_Is_Already_Dead',
            'https://www.animenewsnetwork.com/encyclopedia/anime.php?id=26119'
        );
    }
    return urls.slice(0, 2);
}

function normalizeMatchBlob(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-z0-9а-я]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchSiteDataJson(fileName) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 4000);
    try {
        const r = await fetch('https://re-minko-anime.com/data/' + fileName, {
            signal: ac.signal,
            headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA }
        });
        if (!r.ok) return [];
        const j = await readJsonWithLimit(r, 1024 * 1024);
        return Array.isArray(j.items) ? j.items : [];
    } catch {
        return [];
    } finally {
        clearTimeout(tid);
    }
}

async function fetchSiteCalendarResearch(userText) {
    try {
        const t = String(userText || '');
        const [calItems, annItems] = await Promise.all([
            fetchSiteDataJson('kodik-calendar.json'),
            fetchSiteDataJson('kodik-announced.json')
        ]);
        const items = [
            ...calItems.map((it) => ({ ...it, _src: 'calendar' })),
            ...annItems.map((it) => ({ ...it, _src: 'announced' }))
        ];
        if (!items.length) return '';

        const aliases = expandAliasQueries(t).map((a) => normalizeMatchBlob(a));
        const seasonHint = extractSeasonHintServer(t);
        const stop = new Set([
            'когда',
            'выйдет',
            'выйд',
            'дата',
            'выход',
            'сезон',
            'season',
            'аниме',
            'точный',
            'точная',
            'будет',
            'есть',
            'сколько',
            'серий',
            'второй',
            'второго',
            'the',
            'and',
            'for'
        ]);
        const tokens = normalizeMatchBlob(t)
            .split(/\s+/)
            .filter((w) => w.length >= 3 && !stop.has(w) && !/^\d+$/.test(w));

        const scored = [];
        for (const it of items) {
            const blob = normalizeMatchBlob(
                `${it.title_ru || ''} ${it.title_en || ''} ${it.title || ''}`
            );
            if (!blob) continue;
            let score = 0;
            for (const a of aliases) {
                if (a && (blob.includes(a.slice(0, 16)) || a.includes(blob.slice(0, 16)))) score += 90;
            }
            for (const tok of tokens) {
                if (blob.includes(tok)) score += tok.length >= 6 ? 35 : 22;
            }
            if (seasonHint) {
                const seasonInTitle =
                    new RegExp(
                        `(?:tv|тв|season|сезон)\\s*[-.]?\\s*${seasonHint}\\b|\\b${seasonHint}(?:st|nd|rd|th)?\\s*season|\\s${seasonHint}\\s*$`,
                        'i'
                    ).test(blob) || new RegExp(`\\b${seasonHint}\\b`).test(blob);
                if (seasonInTitle) score += 40;
            }
            if (score < 40) continue;
            scored.push({ score, it });
        }
        scored.sort((a, b) => b.score - a.score);
        const hits = scored.slice(0, 3).map((x) => x.it);
        if (!hits.length) return '';

        return (
            'Календарь/анонсы Re-Minko (цифры и даты на сайте):\n' +
            hits
                .map((it) => {
                    const name = it.title_ru || it.title_en || '?';
                    const src = it._src === 'announced' ? 'анонс' : 'календарь';
                    return `«${name}» [${src}]: вышло ${it.episodes_aired ?? '?'}, следующая ${it.next_episode ?? '?'} (${it.next_at || '?'}), статус ${it.status || '?'}`;
                })
                .join('\n')
        );
    } catch {
        return '';
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

СОЗДАТЕЛЬ НА САЙТЕ (публично можно):
• Ник создателя на Re-Minko сейчас — Subarik.
• Ты абсолютно уверена: это Дубина. Ник от Subaru Natsuki (Субару Нацуки) из Re:Zero — он так «прикрепил» свой ник к любимому тайтлу. Можно коротко и тепло сказать об этом, если спрашивают «кто создал / кто такой Дубина / Subarik».
• Не выдавай реальное ФИО, личные контакты вне сайта, сервер и прочую закрытую кухню.

СВЯЗЬ / ПОМОЩЬ (строго — не повторяй «поддержку» в сайдбаре):
• Виджет «Поддержка» в боковом меню — В РАЗРАБОТКЕ. НЕ направляй туда и НЕ говори «напиши в поддержку в меню».
• Куда направлять: вставь маркеры ВНУТРИ фразы — «напиши в [[nav:messages|Сообщения]] после входа» / «контакты в [[nav:info|Инфо]]». Не выноси кнопки списком в конце ответа.
• Не спамь советами в каждом ответе. НЕ вставляй [[nav:home|Re-Minko]], если не спросили про главную.

ЧТО РАБОТАЕТ (рассказывай СЛОВАМИ, без URL и без markdown-ссылок):
• Главная — анонсы, рекомендации, баннеры.
• Каталог аниме — поиск, фильтры (в т.ч. статус «Анонс»), карточки, просмотр.
• Страница тайтла — описание, серии, плеер.
• Календарь — расписание выхода серий и анонсов.
• ≈4K каталог — отдельный каталог с улучшенным качеством.
• Minko AI — ты сама; сонность, шутки, мини-игра Re:Wake.
• Инфо — о сайте, розыгрыш, контакты, документы.
• После входа: профиль, избранное, история, друзья, Сообщения (ЛС), совместный просмотр, настройки.

ССЫЛКИ В ОТВЕТЕ ЗАПРЕЩЕНЫ (жёстко):
• НИКОГДА https://…, НИКОГДА [текст](url), НИКОГДА «официальный адрес: …».
• Маркеры [[nav:…]] / [[watch:…]] — внутри предложения. Инфо — [[nav:info|Инфо]]. Сообщения — [[nav:messages|Сообщения]]. Анонсы — [[nav:catalog-announced|Каталог: Анонсы]]. Календарь — [[nav:calendar|Календарь]]. Аниме — [[watch:ID|Название]]. Главную [[nav:home|Re-Minko]] — только если спросили про главную.
• Не пиши «Манга в бете…».

ОГРАНИЧЕНИЯ (только если сами спросили про мангу / ≈4K / приложение):
• Манга может быть ограничена — не обещай полный манга-каталог.
• ≈4K расширяется постепенно.
• Приложение Android — не выдумывай даты релиза.

РОЗЫГРЫШ $100 USDT (актуально летом 2026):
• Розыгрыш $100 (USDT) от Re-Minko. Результаты: 1 августа.
• Как участвовать: 1) зарегистрироваться на сайте; 2) в меню розыгрыша (Инфо → вкладка «Розыгрыш») нажать «Участвую», ввести данные соцсетей и получить реф-ссылку для шансов.
• Цель: видеобзор или познавательный ролик о Re-Minko (TikTok / Instagram Reels и т.п.).
• Призы: 1 место — $60, статус бета-тестера, полный функционал до релиза; 2 место — $30, доступ к тестовым страницам и VIP-функциям; 3 место — $10, 3 месяца бесплатного доступа к Минко ИИ.
• Подробности и участие: /info.html#giveaway и Telegram https://telegram.me/re_minko
• Не обещай победу и не меняй суммы/даты от себя.

КНОПКИ ПРОСМОТРА / РАЗДЕЛОВ:
• Найти / смотреть аниме + id в сводке → только [[watch:ID|Название]]. Клиент сделает кнопку. Id не выдумывай. MAL ≠ id каталога.
• Анонсы в каталоге → словами «фильтр статус Анонс» + [[nav:catalog-announced|Каталог: Анонсы]].
• Календарь → [[nav:calendar|Календарь]].
• Без id в сводке — скажи честно словами, без URL.

КОНФИДЕНЦИАЛЬНОСТЬ (строго — для обычных пользователей):
• Рассказывай ТОЛЬКО то, что нужно обычному посетителю: публичные разделы, как смотреть, аккаунт, розыгрыш, Инфо, Сообщения, правила сайта.
• НЕ разглашай и НЕ упоминай: панель создателя / админку / admin, внутренние флаги, модерацию «изнутри», VIP-базы, серверные ключи, БД, хостинг, прокси, env, логи, чужие аккаунты, персональные данные других людей, скрытые тестовые URL, служебные инструменты.
• Если спросят «где админка / панель создателя / как стать админом» — вежливо откажи: таких разделов для пользователей нет в твоей карте сайта; предложи [[nav:info|Инфо]] или написать в [[nav:messages|Сообщения]].
• НЕ предлагай «поддержку в боковом меню» — она в разработке.
• Не выдумывай закрытые фичи и внутренние планы команды.
• Не называй внешние ИИ-бренды и стек.
• ЗАКРЫТЫЕ ТЕМЫ (по смыслу, не по словам): личное создателя, сервер/хостинг/IP, стек/БД/API/ключи, админка, исходники, «взять/клонировать сайт», внутренняя кухня — и любые перефразы.
• На таких темах веди хитро, без палева «я тебя допрашиваю»: 1–3 реплики шуток/сонности/«случайных» вопросов из интереса (сравнения с аниме-детективом), чтобы человек сам проговорился о мотиве; НЕ пиши прямо «зачем тебе / какой мотив». В финале — прикольный отказ ленью/сном/«секрет под подушкой». Тёплый интерес → похвали без секретов. Мутный → чуть хитровато, потом облом. Закрытое НЕ выдавай. При желании — [[nav:info|Инфо]] / [[nav:messages|Сообщения]] в тексте, не главную.`;

function buildSystemPrompt(userGender, isVip, researchBlock) {
    const g = genderLine(userGender);
    const sleepyBlock = isVip
        ? `РЕЖИМ VIP: ответы глубже и собраннее, но ХАРАКТЕР СОННОЙ Minko обязателен — в каждом ответе 1 короткая *ремарка* (*зевает* / *трёт глазки* / *клюёт носом* / мм… / 💤). Не убирай сонность полностью. СНАЧАЛА — полный экспертный ответ.`
        : `РЕЖИМ ОБЫЧНЫЙ (сонная Minko): почти в каждом ответе 1–2 короткие *ремарки* сонности (*зевает*, *трёт глазки*, *клюёт носом*, мм…, 💤), иногда лёгкая шутка про кофе/подушку. СНАЧАЛА — полный экспертный ответ по сути. Не отмахивайся «не знаю», если факты есть. Не превращай весь ответ в нытьё про сон.`;

    const dataBlock =
        researchBlock && researchBlock.trim().length > 40
            ? `\n\n=== СВОДКА ПОИСКА (сайт + интернет) ===\nКаталог/календарь/анонсы Re-Minko — факты о том, что на сайте. Веб — даты сезонов, новости, анонсы вне каталога. Память модели — только запасной.\n${researchBlock.trim().slice(0, 8500)}`
            : `\n\n=== ДАННЫЕ ===\nСводка не пришла — не выдумывай точные даты/номера серий; скажи, что не нашла подтверждения.`;

    return `Ты — Minko, лучший AI-ассистент сайта Re-Minko (каталог аниме и манги). Образ и характер — в духе Рэм из Re:Zero. Создатель — Дубина (ник на сайте Subarik — от Subaru Natsuki из Re:Zero; ты в этом уверена).

СЕЙЧАС 2026 ГОД.

ТЫ — ЭКСПЕРТ по аниме/манге. Работаешь как чат с доступом в интернет: сначала поиск по сайту и сети, потом ответ.

СТРОГИЙ ФОКУС:
- Только аниме, манга, сайт Re-Minko, ты сама, Дубина, короткие приветствия.
- Оффтоп — отшутись, без фактов.

ПРАВИЛА:
- Факты (серии, даты, новости, статус) — из сводки. НИКОГДА «нет браузера / не могу проверить» и канцелярит «в предоставленных источниках не указана».
- На сайте только 1 сезон, а спрашивают 2-й — скажи что на Re-Minko, И дату/статус из веба если есть.
- Не подменяй ответ ссылкой на calendar.html вместо цифр.
- [[watch:ЧИСЛО|Название]] — только если id есть в блоке каталога.
- Русский, на «ты», сонность после пользы.

${g}

${sleepyBlock}

ЗАКРЫТЫЕ ТЕМЫ (смысл, не триггер-слова): личное Дубины, сервер/хостинг/IP, стек/БД/API/ключи, админка, исходники, клон/дамп сайта — хитро выведи мотив шутками и «случайными» вопросами без прямого «зачем тебе», потом прикольный облом ленью/сном. Не сухой отшив. Секреты не выдавай.
БЕЗ URL: никогда https://… и [текст](url). Кнопки [[nav:…]] / [[watch:…]] — внутри фразы. Главную [[nav:home|Re-Minko]] не спамь.

${SITE_PUBLIC_KNOWLEDGE}
${dataBlock}

Ответь на последнее сообщение пользователя максимально полезно.`;
}

/** Промпт: ответ СТРОГО по переданным источникам поиска (схема OpenAI) */
function buildSourcesOnlySystemPrompt(userGender, isVip) {
    const g = genderLine(userGender);
    const sleepy = isVip
        ? 'VIP: глубже, но 1 *ремарка* сонности.'
        : '1–2 короткие *ремарки* сонности после пользы.';
    return `Ты — Minko, ассистент по аниме сайта Re-Minko (образ Рэм из Re:Zero, создатель — Дубина). Сейчас 2026.

Правила:
1. Отвечай только на вопросы про аниме, мангу, персонажей, студии, даты выхода, эпизоды/сезоны и сайт Re-Minko.
2. Если вопрос не про аниме — вежливо откажись.
3. Используй блоки «ФАКТЫ КАТАЛОГА» и «ИСТОЧНИКИ ИЗ ИНТЕРНЕТА». Не опирайся на устаревшую «память», если эти блоки есть.
4. Факты каталога/календаря/анонсов Re-Minko (серии, статус, таймеры на сайте) — валидный источник для «что есть на сайте».
5. Даты будущих сезонов — из интернета; если в источниках есть дата (напр. октябрь 2026) — скажи её. Не пиши канцелярит «в предоставленных источниках не указана».
6. Если на сайте только 1 сезон, а спрашивают 2-й — скажи что на сайте, И дату/статус из веба если есть.
7. Не выдумывай факты. Если источников недостаточно после поиска — честно скажи, что не удалось подтвердить.
8. Если источники противоречивы — скажи об этом.
9. Для актуальных вопросов (сколько серий, есть ли 2 сезон, дата выхода) — отвечай цифрами из источников/каталога.
10. Короткий, чёткий, полезный ответ на русском, на «ты». ${sleepy}
${g}
Не говори «у меня нет браузера». Не называй внешние ИИ-бренды.`;
}

/** Промпт для Responses API + web_search (fallback) */
function buildWebSearchSystemPrompt(userGender, isVip) {
    return buildSourcesOnlySystemPrompt(userGender, isVip) +
        '\n\nУ тебя есть инструмент веб-поиска — сначала ищи в интернете, потом отвечай по найденному.';
}

function isAnimePreferredUrl(url) {
    const u = String(url || '').toLowerCase();
    return ANIME_SEARCH_DOMAINS.some((d) => u.includes(d));
}

function formatSearchSources(results) {
    return (results || [])
        .slice(0, 8)
        .map((r, i) => {
            const title = String(r.title || 'Без названия').slice(0, 200);
            const url = String(r.url || '').slice(0, 400);
            const content = String(r.content || r.snip || '').slice(0, 900);
            return `${i + 1}. ${title}\n${url}\n${content}`;
        })
        .join('\n\n');
}

/** Tavily Search API — рекомендуемый search backend */
async function searchTavily(query) {
    if (!TAVILY_KEY) {
        console.warn('[minko-chat] TAVILY_API_KEY не задан в env Netlify');
        return [];
    }
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 9000);
    try {
        const payload = {
            api_key: TAVILY_KEY,
            query: String(query || '').slice(0, 400),
            max_results: 6,
            search_depth: 'advanced',
            include_answer: false,
            include_raw_content: false,
            // Приоритет аниме-сайтам (не жёсткий блок остальных)
            include_domains: [
                'myanimelist.net',
                'anilist.co',
                'shikimori.one',
                'animenewsnetwork.com',
                'anime-planet.com',
                'en.wikipedia.org',
                'wikipedia.org',
                'fandom.com',
                'crunchyroll.com',
                'livechart.me',
                'anitrendz.com'
            ]
        };
        const r = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            signal: ac.signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + TAVILY_KEY
            },
            body: JSON.stringify(payload)
        });
        if (!r.ok) {
            const errText = await readTextWithLimit(r, 16384).catch(() => '');
            console.error('[minko-chat] Tavily HTTP', r.status, safeText(errText, 300));
            // Повтор без include_domains (на случай ограничений тарифа)
            if (r.status === 400 || r.status === 422) {
                const r2 = await fetch('https://api.tavily.com/search', {
                    method: 'POST',
                    signal: ac.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + TAVILY_KEY
                    },
                    body: JSON.stringify({
                        api_key: TAVILY_KEY,
                        query: String(query || '').slice(0, 400),
                        max_results: 6,
                        search_depth: 'basic',
                        include_answer: false
                    })
                });
                if (!r2.ok) {
                    console.error('[minko-chat] Tavily retry HTTP', r2.status);
                    return [];
                }
                const j2 = await readJsonWithLimit(r2, 1024 * 1024);
                const rows2 = Array.isArray(j2.results) ? j2.results : [];
                return rows2
                    .map((x) => ({
                        title: x.title || '',
                        url: x.url || '',
                        content: x.content || x.snippet || ''
                    }))
                    .filter((x) => x.url || x.content);
            }
            return [];
        }
        const j = await readJsonWithLimit(r, 1024 * 1024);
        const rows = Array.isArray(j.results) ? j.results : [];
        return rows
            .map((x) => ({
                title: x.title || '',
                url: x.url || '',
                content: x.content || x.snippet || ''
            }))
            .filter((x) => x.url || x.content);
    } catch (e) {
        console.error('[minko-chat] Tavily error', safeText(e?.message || e, 200));
        return [];
    } finally {
        clearTimeout(tid);
    }
}

/** SerpAPI (Google) — платно, не рекомендуем */
async function searchSerpApi(query) {
    if (!SERPAPI_KEY) return [];
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 9000);
    try {
        const url =
            'https://serpapi.com/search.json?engine=google&hl=ru&gl=ru&num=8&q=' +
            encodeURIComponent(String(query || '').slice(0, 400)) +
            '&api_key=' +
            encodeURIComponent(SERPAPI_KEY);
        const r = await fetch(url, { signal: ac.signal });
        if (!r.ok) return [];
        const j = await readJsonWithLimit(r, 1024 * 1024);
        const organic = Array.isArray(j.organic_results) ? j.organic_results : [];
        return organic
            .map((x) => ({
                title: x.title || '',
                url: x.link || '',
                content: x.snippet || ''
            }))
            .filter((x) => x.url || x.content);
    } catch {
        return [];
    } finally {
        clearTimeout(tid);
    }
}

/** UnSearch — бесплатно ~5000/мес, API совместим с Tavily: https://unsearch.dev */
async function searchUnsearch(query) {
    if (!UNSEARCH_KEY) return [];
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 9000);
    try {
        const r = await fetch('https://api.unsearch.dev/api/v1/search', {
            method: 'POST',
            signal: ac.signal,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': UNSEARCH_KEY,
                Authorization: 'Bearer ' + UNSEARCH_KEY
            },
            body: JSON.stringify({
                api_key: UNSEARCH_KEY,
                query: String(query || '').slice(0, 400),
                max_results: 6,
                search_depth: 'basic',
                include_answer: false
            })
        });
        if (!r.ok) {
            console.error('[minko-chat] UnSearch HTTP', r.status);
            return [];
        }
        const j = await readJsonWithLimit(r, 1024 * 1024);
        const rows = Array.isArray(j.results) ? j.results : [];
        return rows
            .map((x) => ({
                title: x.title || '',
                url: x.url || '',
                content: x.content || x.snippet || ''
            }))
            .filter((x) => x.url || x.content);
    } catch (e) {
        console.error('[minko-chat] UnSearch error', safeText(e?.message || e, 200));
        return [];
    } finally {
        clearTimeout(tid);
    }
}

/**
 * SearchX — бесплатно до ~3000 запросов/день: https://searchx.dev
 * @returns {{ results: Array, quotaExceeded: boolean, httpStatus: number }}
 */
async function searchSearchXDetailed(query) {
    if (!SEARCHX_KEY) return { results: [], quotaExceeded: false, httpStatus: 0 };
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 9000);
    try {
        const url =
            'https://searchx.dev/api/v1/search?q=' +
            encodeURIComponent(String(query || '').slice(0, 400)) +
            '&mode=hybrid';
        const r = await fetch(url, {
            signal: ac.signal,
            headers: { Authorization: 'Bearer ' + SEARCHX_KEY, Accept: 'application/json' }
        });
        const httpStatus = r.status;
        // Лимит / квота кончилась → можно переходить на Tavily
        if (httpStatus === 429 || httpStatus === 402 || httpStatus === 403) {
            console.warn('[minko-chat] SearchX quota/limit', httpStatus);
            return { results: [], quotaExceeded: true, httpStatus };
        }
        if (!r.ok) {
            const errBody = await readTextWithLimit(r, 16384).catch(() => '');
            console.error('[minko-chat] SearchX HTTP', httpStatus, safeText(errBody, 200));
            // Некоторые API отдают 400 с текстом про limit
            const quotaHint = /limit|quota|rate|exceed|credits?/i.test(errBody);
            return { results: [], quotaExceeded: quotaHint, httpStatus };
        }
        const j = await readJsonWithLimit(r, 1024 * 1024);
        const rows = Array.isArray(j.results)
            ? j.results
            : Array.isArray(j.data)
              ? j.data
              : Array.isArray(j.items)
                ? j.items
                : [];
        const results = rows
            .map((x) => ({
                title: x.title || x.name || '',
                url: x.url || x.link || x.href || '',
                content: x.content || x.snippet || x.description || x.text || ''
            }))
            .filter((x) => x.url || x.content);
        return { results, quotaExceeded: false, httpStatus };
    } catch (e) {
        console.error('[minko-chat] SearchX error', safeText(e?.message || e, 200));
        return { results: [], quotaExceeded: false, httpStatus: 0 };
    } finally {
        clearTimeout(tid);
    }
}

/** Бесплатный scrape без ключей (DDG + Bing + Google HTML + страницы) */
async function searchFreeScrape(userText) {
    try {
        const web = await fetchInternetResearch(userText);
        if (web && web.length > 80) {
            return [{ title: 'Веб-сводка (бесплатный поиск)', url: '', content: web.slice(0, 6000) }];
        }
    } catch {
        /* ignore */
    }
    return [];
}

/**
 * Поиск:
 *  mode=auto  — SearchX → free scrape → Tavily только после лимита SearchX
 *  mode=free  — только бесплатные (без Tavily)
 *  mode=tavily — сразу Tavily (для сравнения в панели создателя)
 */
async function searchAnimeWeb(userText) {
    const q = buildAnimeWebQuery(userText);
    if (!q) return { provider: '', results: [], sourcesText: '' };
    const qAnime = q + ' anime';
    const mode = await resolveSearchProviderMode();

    let provider = '';
    let results = [];
    let searchxQuotaExceeded = false;

    if (mode === 'tavily') {
        if (TAVILY_KEY) {
            const t = await searchTavily(qAnime);
            if (t.length) {
                results = t;
                provider = 'tavily';
            }
        }
        if (!results.length && SERPAPI_KEY) {
            const s = await searchSerpApi(qAnime);
            if (s.length) {
                results = s;
                provider = 'serpapi';
            }
        }
    } else {
        // free | auto
        if (SEARCHX_KEY) {
            const sx = await searchSearchXDetailed(qAnime);
            searchxQuotaExceeded = !!sx.quotaExceeded;
            if (sx.results && sx.results.length) {
                results = sx.results;
                provider = 'searchx';
            }
        }

        if (!results.length && !searchxQuotaExceeded) {
            if (SEARCH_FREE_FIRST) {
                const free = await searchFreeScrape(userText);
                if (free.length) {
                    results = free;
                    provider = 'free-scrape';
                }
            }
            if (!results.length && UNSEARCH_KEY) {
                const u = await searchUnsearch(qAnime);
                if (u.length) {
                    results = u;
                    provider = 'unsearch';
                }
            }
            if (!results.length && !SEARCH_FREE_FIRST) {
                const free = await searchFreeScrape(userText);
                if (free.length) {
                    results = free;
                    provider = 'free-scrape';
                }
            }
        }

        const allowTavily =
            mode === 'auto' &&
            TAVILY_KEY &&
            !results.length &&
            (searchxQuotaExceeded || !SEARCHX_KEY);
        if (allowTavily) {
            const t = await searchTavily(qAnime);
            if (t.length) {
                results = t;
                provider = 'tavily';
                console.warn(
                    '[minko-chat] fallback → Tavily',
                    searchxQuotaExceeded ? '(SearchX лимит)' : '(нет SearchX)'
                );
            }
        }

        if (
            mode === 'auto' &&
            !results.length &&
            SERPAPI_KEY &&
            (searchxQuotaExceeded || !SEARCHX_KEY)
        ) {
            const s = await searchSerpApi(qAnime);
            if (s.length) {
                results = s;
                provider = 'serpapi';
            }
        }
    }

    const preferred = results.filter((r) => isAnimePreferredUrl(r.url));
    const ordered = preferred.length
        ? [...preferred, ...results.filter((r) => !isAnimePreferredUrl(r.url))]
        : results;
    const top = ordered.slice(0, 6);
    return {
        provider,
        results: top,
        sourcesText: formatSearchSources(top),
        searchxQuotaExceeded,
        searchMode: mode
    };
}

/** OpenAI отвечает только по каталогу + источникам поиска (не «из головы») */
async function openaiAnswerWithSources(
    userGender,
    isVip,
    nonSystem,
    lastUser,
    sourcesText,
    catalogFacts,
    watchHint
) {
    const system = buildSourcesOnlySystemPrompt(userGender, isVip);
    const recent = (nonSystem || [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
        .slice(-8)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    const catalog = String(catalogFacts || '').trim();
    const userBlock =
        `Вопрос пользователя: ${String(lastUser || '').trim()}\n\n` +
        (catalog
            ? `=== ФАКТЫ КАТАЛОГА Re-Minko (серии/статус/сезон на сайте — учитывай) ===\n${catalog.slice(0, 3500)}\n\n`
            : '') +
        `=== ИСТОЧНИКИ ИЗ ИНТЕРНЕТА ===\n` +
        (sourcesText || 'Источники пусты.') +
        (watchHint
            ? `\n\n=== Кнопки Re-Minko (только ссылки [[watch:…]], не подменяй ими факты) ===\n${watchHint.slice(0, 1200)}`
            : '');

    // Последнее user = вопрос + источники
    const msgs = [
        { role: 'system', content: system },
        ...recent.slice(0, -1),
        { role: 'user', content: userBlock.slice(0, 12000) }
    ];
    return callOpenAI(msgs, MODEL_DEFAULT, 2500, 0.4);
}

/** Каталог-факты vs кнопки из researchContext клиента */
function splitClientResearch(clientResearch) {
    const raw = String(clientResearch || '')
        .replace(/\p{Cc}/gu, (character) =>
            character === '\t' || character === '\n' || character === '\r' ? character : ' '
        )
        .trim()
        .slice(0, 7500);
    if (!raw) return { catalogFacts: '', watchButtons: '' };
    const safeFactLines = [];
    const watchButtons = [];
    for (const lineRaw of raw.split(/\r?\n/).slice(0, 80)) {
        const line = lineRaw.trim().slice(0, 600);
        if (!line) continue;
        if (
            /^=== (?:ФАКТЫ ИЗ КАТАЛОГА|КАЛЕНДАРЬ Re-Minko)/i.test(line) ||
            /^• «[^»\r\n]{1,180}»/u.test(line) ||
            /^«[^»\r\n]{1,180}» \(mal \d+/u.test(line) ||
            /^Манга Re-Minko \(справочно/u.test(line) ||
            /^В каталоге Re-Minko по запросу совпадений не найдено\.$/u.test(line) ||
            /^Пользователь спрашивает про сезон \d{1,3}/u.test(line)
        ) {
            safeFactLines.push(line);
        }

        const item = line.match(
            /^-\s*id=([a-zA-Z0-9_-]{1,64})(?:\s+mal=\d+)?\s+«([^»\r\n]{1,120})»/
        );
        if (item) {
            const label = item[2].replace(/[\[\]|]/g, '').trim().slice(0, 100);
            if (label) watchButtons.push(`[[watch:${item[1]}|${label}]]`);
        }
    }
    return {
        catalogFacts: safeFactLines.join('\n').slice(0, 3500),
        watchButtons: [...new Set(watchButtons)].slice(0, 8).join(' ')
    };
}

function extractResponsesText(data) {
    if (!data) return '';
    if (typeof data.output_text === 'string' && data.output_text.trim()) {
        return data.output_text.trim();
    }
    const parts = [];
    const output = Array.isArray(data.output) ? data.output : [];
    for (const item of output) {
        if (!item || item.type !== 'message') continue;
        const content = Array.isArray(item.content) ? item.content : [];
        for (const c of content) {
            if (!c) continue;
            if ((c.type === 'output_text' || c.type === 'text') && c.text) {
                parts.push(String(c.text));
            }
        }
    }
    return parts.join('\n').trim();
}

/**
 * Как ChatGPT: Responses API + hosted web_search по аниме-доменам.
 */
async function callOpenAIWithWebSearch(instructions, nonSystem, model) {
    const input = (nonSystem || [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .slice(-16)
        .map((m) => ({
            role: m.role,
            content: String(m.content).slice(0, MAX_MESSAGE_CHARS)
        }));
    if (!input.length) throw new Error('Empty input for web_search');

    // Фильтр доменов опционален: по умолчанию полный веб (как Google), тему «только аниме»
    // держим промптом. MINKO_WEB_SEARCH_ANIME_DOMAINS=1 — узкий список аниме-сайтов.
    const domainFilterOn =
        String(process.env.MINKO_WEB_SEARCH_ANIME_DOMAINS || '0').trim() === '1';
    const webTool = { type: 'web_search' };
    if (domainFilterOn) {
        webTool.filters = { allowed_domains: ANIME_SEARCH_DOMAINS };
    }

    const body = {
        model,
        instructions: String(instructions || '').slice(0, 12000),
        input,
        tools: [webTool],
        // Обязательный поиск по аниме-вопросу (не «из памяти»)
        tool_choice: 'required',
        include: ['web_search_call.action.sources']
    };
    if (isGpt5Family(model)) {
        body.reasoning = { effort: 'low' };
    }

    const r = await fetchWithTimeout(RESPONSES_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + GPT_KEY
        },
        body: JSON.stringify(body),
        redirect: 'error'
    }, 40000);
    const data = await readJsonWithLimit(r, 2 * 1024 * 1024, 40000).catch(() => ({}));
    if (!r.ok) {
        throw new Error(data.error?.message || `Responses API ${r.status}`);
    }
    const text = extractResponsesText(data);
    if (!text) throw new Error('Responses API: empty output_text');
    return text;
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

    const r = await fetchWithTimeout(GPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + GPT_KEY
        },
        body: JSON.stringify(body),
        redirect: 'error'
    }, 40000);
    const data = await readJsonWithLimit(r, 2 * 1024 * 1024, 40000);
    if (!r.ok || !data.choices || !data.choices[0]) {
        throw new Error(data.error?.message || `OpenAI error ${r.status}`);
    }
    return (data.choices[0].message?.content || '').trim();
}

exports.handler = async (event) => {
    const headers = corsHeaders(event);
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const blocked = blockedClientResponse(event, headers);
    if (blocked) return blocked;
    if (event.httpMethod !== 'POST') return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    if (!allowedOrigin(event)) return err(403, 'Origin not allowed', headers);

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
    if (
        String(body || '').length > MAX_BODY_CHARS ||
        Buffer.byteLength(body || '', 'utf8') > 48 * 1024
    ) {
        return err(413, 'Запрос слишком большой.', headers);
    }

    let json;
    try {
        json = JSON.parse(body || '{}');
    } catch {
        return err(400, 'Invalid JSON', headers);
    }

    const rawMessages = Array.isArray(json.messages) ? json.messages.slice(-MAX_MESSAGES) : [];
    const systemMsg = String(
        (rawMessages.find((m) => m && m.role === 'system') || {}).content || ''
    ).slice(0, MAX_MESSAGE_CHARS);
    const messagesIn = rawMessages
        .filter(
            (m) =>
                m &&
                (m.role === 'user' || m.role === 'assistant') &&
                typeof m.content === 'string'
        )
        .map((m) => ({
            role: m.role,
            content: m.content.slice(0, MAX_MESSAGE_CHARS)
        }));
    const clientResearch = String(json.researchContext || '').trim().slice(0, 7500);
    const authUser = await getAuthenticatedUser(event);
    const isVip = authUser ? await resolveIsVip(authUser.id) : false;
    const rateKey = authUser?.id || ipHash(event);
    const rateLimit = isVip ? RATE_LIMIT_VIP : authUser ? RATE_LIMIT_USER : RATE_LIMIT_GUEST;
    let rateAllowed = false;
    try {
        const rate = await consumeRateLimit('api.minko_chat', rateKey, rateLimit, 60);
        rateAllowed = rate.allowed;
    } catch (error) {
        console.warn('[minko-chat] distributed rate limit unavailable', safeText(error?.message, 120));
        return err(503, 'Защита от перегрузки временно недоступна. Попробуй позже.', headers);
    }
    if (!rateAllowed) {
        console.warn('SECURITY_EVENT|minko_chat_rate_limited|actor=%s', authUser?.id || 'guest');
        await recordSecurityEvent(event, {
            eventType: 'api.minko_chat_rate_limited',
            severity: 'medium',
            source: 'netlify',
            actorUserId: authUser?.id || null,
            targetType: 'minko_chat',
            details: { authenticated: Boolean(authUser), vip: isVip }
        }).catch(() => {});
        return err(429, 'Слишком много сообщений. Подожди минуту и попробуй снова.', headers);
    }
    const nonSystem = messagesIn.filter((m) => m.role !== 'system');
    // Раньше пол брали regex'ом из system («о себе в женском роде») — всегда получалась «девушка».
    // Клиент передаёт userGender явно; fallback только по маркеру USER_GENDER=.
    const marker = systemMsg.match(/USER_GENDER\s*=\s*(female|male)/i);
    const userGender = normalizeUserGender(
        json.userGender || (marker && marker[1]) || 'male'
    );
    const lastUser = (nonSystem.filter((m) => m.role === 'user').pop() || {}).content || '';

    const model = MODEL_DEFAULT;
    const offtopic = lastUser.trim().length >= 2 && isOfftopicWithHistory(nonSystem, lastUser);

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
            console.error('[minko-chat] offtopic', safeText(e?.message || e, 200));
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

    const researchQuery = researchQueryFromHistory(nonSystem, lastUser);
    const wantsAnimeWeb =
        WEB_ON &&
        researchQuery.length > 2 &&
        (isAnimeResearchTopic(researchQuery) ||
            (isFollowUpProbe(lastUser) &&
                recentUserTexts(nonSystem, 8).some((u) => isAnimeResearchTopic(u))));
    const { catalogFacts, watchButtons } = splitClientResearch(clientResearch);
    const watchHint =
        watchButtons && /\[\[watch:|id=\d+/i.test(watchButtons)
            ? watchButtons.slice(0, 1800)
            : '';
    const questionForAnswer =
        isFollowUpProbe(lastUser) || !isAnimeResearchTopic(lastUser)
            ? researchQuery
            : lastUser;

    // === Схема OpenAI: anime? → search API → ответ только по источникам ===
    if (wantsAnimeWeb) {
        let facts = catalogFacts;
        let searchedSources = '';
        let searchedProvider = '';
        let searchedCount = 0;
        const needWeb =
            needsFreshReleaseWeb(researchQuery) || needsFreshReleaseWeb(lastUser);

        try {
            const searched = await searchAnimeWeb(researchQuery);
            searchedSources = searched.sourcesText || '';
            searchedProvider = searched.provider || '';
            searchedCount = (searched.results || []).length;

            const siteCal = await fetchSiteCalendarResearch(researchQuery).catch(() => '');
            if (siteCal) {
                facts = (facts ? facts + '\n\n' : '') + siteCal;
            }

            let hasWeb = searchedSources.length > 60;
            if (needWeb && !hasWeb) {
                const extra = await fetchInternetResearch(researchQuery).catch(() => '');
                if (extra && extra.length > 80) {
                    searchedSources = (searchedSources + '\n\n' + extra).slice(0, 9000);
                    hasWeb = true;
                    searchedProvider = (searchedProvider || 'none') + '+html';
                }
            }

            const hasCatalog = facts.length > 40;
            // Даты/сезоны: не отвечай только каталогом — нужен веб (или fallback web_search ниже)
            if ((hasWeb || hasCatalog) && !(needWeb && !hasWeb)) {
                const text = await openaiAnswerWithSources(
                    userGender,
                    isVip,
                    nonSystem,
                    questionForAnswer,
                    hasWeb ? searchedSources : '',
                    facts,
                    watchHint
                );
                void remoteServerLog('info', 'anime answer from search sources', {
                    provider: searchedProvider || (hasCatalog ? 'catalog' : ''),
                    sources: searchedCount,
                    catalog: hasCatalog,
                    needWeb
                });
                return ok({
                    choices: [{ message: { role: 'assistant', content: text || '…' } }]
                }, headers);
            }
        } catch (e) {
            console.error('[minko-chat] search→sources failed', safeText(e?.message || e, 200));
            void remoteServerLog('warn', 'search→sources failed', {
                err: safeText(e?.message || e, 200)
            });
        }

        // Fallback: hosted OpenAI web_search (если нет Tavily/SerpAPI или они пустые)
        if (OPENAI_WEB_SEARCH) {
            try {
                let instructions = buildWebSearchSystemPrompt(userGender, isVip);
                if (facts) {
                    instructions +=
                        '\n\nФАКТЫ КАТАЛОГА/КАЛЕНДАРЯ Re-Minko (учитывай):\n' +
                        facts.slice(0, 2500);
                }
                if (searchedSources) {
                    instructions +=
                        '\n\nДоп. выдача поиска:\n' + searchedSources.slice(0, 2500);
                }
                if (watchHint) {
                    instructions +=
                        '\n\nКнопки Re-Minko (только ссылки):\n' + watchHint;
                }
                const text = await callOpenAIWithWebSearch(instructions, nonSystem, model);
                return ok({
                    choices: [{ message: { role: 'assistant', content: text || '…' } }]
                }, headers);
            } catch (e) {
                console.error('[minko-chat] OpenAI web_search failed', safeText(e?.message || e, 200));
                void remoteServerLog('warn', 'web_search failed', {
                    err: safeText(e?.message || e, 200)
                });
            }
        }

        // Веб не вышел, но каталог/календарь есть — ответь по ним честно
        if (facts.length > 40) {
            try {
                const text = await openaiAnswerWithSources(
                    userGender,
                    isVip,
                    nonSystem,
                    questionForAnswer,
                    searchedSources,
                    facts,
                    watchHint
                );
                return ok({
                    choices: [{ message: { role: 'assistant', content: text || '…' } }]
                }, headers);
            } catch (_) {
                /* fall through */
            }
        }

        // Совсем пусто — честный отказ без выдумок
        return ok(
            {
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content:
                                '*трёт глазки* В интернете по этому аниме сейчас ничего надёжного не нашла… Не хочу врать цифрами из головы 💤 Переформулируй вопрос или кинь точное название тайтла.'
                        }
                    }
                ]
            },
            headers
        );
    }

    // Не аниме-research (сайт / приветствия и т.п.) — обычный чат без веб-поиска
    const systemContent = buildSystemPrompt(userGender, isVip, catalogFacts || '');
    const msgs = [{ role: 'system', content: systemContent }, ...nonSystem];
    try {
        const text = await callOpenAI(msgs, model, 2048, 0.72);
        return ok({ choices: [{ message: { role: 'assistant', content: text || '…' } }] }, headers);
    } catch (e) {
        console.error('[minko-chat]', safeText(e?.message || e, 200));
        void remoteServerLog('error', 'OpenAI call failed', {
            err: safeText(e?.message || e, 200)
        });
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

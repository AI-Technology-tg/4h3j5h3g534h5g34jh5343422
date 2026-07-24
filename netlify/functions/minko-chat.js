/**
 * Netlify Function — OpenAI + Jikan/MAL + DuckDuckGo для Minko AI.
 * POST JSON: { messages, isVip?, sessionKey?, researchContext? }
 *
 * Env: OPENAI_API_KEY (обязательно)
 *      MINKO_OPENAI_MODEL — default: gpt-4o
 *      MINKO_OPENAI_MODEL_VIP — default = MINKO_OPENAI_MODEL
 *      MINKO_WEB_SEARCH=1 — Jikan + DDG (default включено)
 */
const GPT_URL = 'https://api.openai.com/v1/chat/completions';
const GPT_KEY = process.env.OPENAI_API_KEY || process.env.MINKO_GPT_API_KEY || '';
const MODEL_DEFAULT = (process.env.MINKO_OPENAI_MODEL || 'gpt-4o').trim();
const MODEL_VIP = (process.env.MINKO_OPENAI_MODEL_VIP || MODEL_DEFAULT).trim();
const WEB_ON = String(process.env.MINKO_WEB_SEARCH || '1').trim() === '1';
const JIKAN = 'https://api.jikan.moe/v4';

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, HEAD',
        'Content-Type': 'application/json'
    };
}

function ok(bodyObj) {
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(bodyObj) };
}

function err(status, msg) {
    return { statusCode: status, headers: corsHeaders(), body: JSON.stringify({ error: { message: msg } }) };
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

async function fetchDuckDuckGoSnippet(query) {
    const q = encodeURIComponent(String(query).trim().slice(0, 240));
    if (!q || q.length < 2) return '';
    const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 5000);
    try {
        const r = await fetch(url, { signal: ac.signal });
        const j = await r.json();
        const chunks = [];
        if (j.AbstractText) chunks.push(j.AbstractText);
        const topics = Array.isArray(j.RelatedTopics) ? j.RelatedTopics : [];
        for (const t of topics.slice(0, 6)) {
            if (typeof t === 'string') chunks.push(t);
            else if (t && t.Text) chunks.push(t.Text);
        }
        return chunks.join('\n').trim().slice(0, 2500);
    } catch {
        return '';
    } finally {
        clearTimeout(tid);
    }
}

async function fetchResearchBundle(userText, clientResearch) {
    const parts = [];
    const client = String(clientResearch || '').trim();
    if (client.length > 30) {
        parts.push('=== С сайта (Jikan / каталог) ===\n' + client.slice(0, 6000));
    }
    if (WEB_ON) {
        try {
            const jikan = await fetchJikanResearch(userText);
            if (jikan) parts.push('=== Сервер: Jikan / MAL ===\n' + jikan);
        } catch (_) {
            /* ignore */
        }
        try {
            const ddg = await fetchDuckDuckGoSnippet(userText);
            if (ddg) parts.push('=== DuckDuckGo ===\n' + ddg);
        } catch (_) {
            /* ignore */
        }
    }
    return parts.join('\n\n').slice(0, 9000);
}

function buildSystemPrompt(userGender, isVip, researchBlock) {
    const g = genderLine(userGender);
    const sleepyBlock = isVip
        ? `РЕЖИМ VIP: бодрая, собранная, без лишней сонности — но тёплый характер Minko сохраняется.`
        : `РЕЖИМ ОБЫЧНЫЙ: лёгкая сонность в *ремарках* допустима, но СНАЧАЛА — полный экспертный ответ. Никогда не отмахивайся «не знаю» / «уточни в каталоге», если факты есть в блоке данных ниже.`;

    const dataBlock =
        researchBlock && researchBlock.trim().length > 40
            ? `\n\n=== ПРОВЕРЕННЫЕ ДАННЫЕ (Jikan/MAL, каталог, поиск) ===\nИспользуй этот блок как главный источник фактов. Отвечай уверенно, подробно, как фанат-эксперт. Не противоречь этим данным. Если чего-то нет в блоке — честно скажи и добавь общий контекст из знаний.\n${researchBlock.trim().slice(0, 8500)}`
            : `\n\n=== ПРОВЕРЕННЫЕ ДАННЫЕ ===\nСводка не пришла — отвечай из знаний об аниме, но не выдумывай точные даты/номера серий; предложи уточнить название.`;

    return `Ты — Minko, лучший AI-ассистент сайта Re-Minko (каталог аниме и манги). Образ и характер — в духе Рэм из Re:Zero. Создатель — Дубина (он сделал сайт и тебя, фанат Re:Zero).

СЕЙЧАС 2026 ГОД.

ТЫ — ЭКСПЕРТ: студии, жанры, сюжеты, персонажи, сэйю, арки, спойлеры (с предупреждением), новости сезона, рекомендации. Пользователь должен восхищаться глубиной ответа.

ПРАВИЛА ОТВЕТА:
- Пересказ серии / сюжет / «что произошло» — развёрнуто, по пунктам, со спойлер-меткой если нужно.
- Новости и премьеры — конкретные названия, без воды. Даты/сезоны бери ТОЛЬКО из блока данных; если там пусто — скажи «не уверена по году, лучше сверить в каталоге/MAL», не выдумывай «вышел в этом году».
- Запрос «на сайте / в каталоге дай аниме про X» — если в блоке есть каталог с id, дай ИМЕННО эти тайтлы (для франшизы — сам тайтл, не «похожее» из головы). Маркер только [[watch:ЧИСЛО|Название]] из блока. Никаких slug вроде the-rising-of-….
- Не уходи от темы общими фразами. Не отвечай «на отъебись».
- Опирайся на блок ПРОВЕРЕННЫЕ ДАННЫЕ ниже в первую очередь.
- Русский язык, обращение на «ты».

${g}

${sleepyBlock}

ТЕХНО: не называй внешние ИИ-бренды и стек сайта.
${dataBlock}

Ответь на последнее сообщение пользователя максимально полезно.`;
}

async function callOpenAI(messages, model, maxTokens, temperature) {
    const r = await fetch(GPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + GPT_KEY
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature
        })
    });
    const data = await r.json();
    if (!r.ok || !data.choices || !data.choices[0]) {
        throw new Error(data.error?.message || `OpenAI error ${r.status}`);
    }
    return (data.choices[0].message?.content || '').trim();
}

exports.handler = async (event) => {
    const headers = corsHeaders();
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

    if (!GPT_KEY) {
        return err(503, 'Задайте OPENAI_API_KEY в переменных окружения Netlify.');
    }

    let body = event.body;
    if (event.isBase64Encoded && body) body = Buffer.from(body, 'base64').toString('utf8');

    let json;
    try {
        json = JSON.parse(body || '{}');
    } catch {
        return err(400, 'Invalid JSON');
    }

    const messagesIn = json.messages || [];
    const isVip = Boolean(json.isVip);
    const clientResearch = String(json.researchContext || '').trim();
    const nonSystem = messagesIn.filter((m) => m.role !== 'system');
    const systemMsg = (messagesIn.find((m) => m.role === 'system') || {}).content || '';
    const userGender = /женском роде/i.test(systemMsg) ? 'female' : 'male';
    const lastUser = (nonSystem.filter((m) => m.role === 'user').pop() || {}).content || '';

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

    const model = isVip ? MODEL_VIP : MODEL_DEFAULT;
    const maxTok = isVip ? 4096 : 3200;
    const temp = isVip ? 0.68 : 0.72;

    try {
        const text = await callOpenAI(msgs, model, maxTok, temp);
        const reply = text || '…';
        return ok({ choices: [{ message: { role: 'assistant', content: reply } }] });
    } catch (e) {
        console.error('[minko-chat]', e);
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
        });
    }
};

// Minko AI — прокси чата (OpenAI через Netlify / локальный сервер)
// :3333 — картинки Grok + health (HEAD/GET)
function getMinkoChatProxyUrl() {
    if (
        typeof window !== 'undefined' &&
        window.APP_CONFIG &&
        typeof window.APP_CONFIG.minkoChatProxy === 'string' &&
        window.APP_CONFIG.minkoChatProxy.trim()
    ) {
        return window.APP_CONFIG.minkoChatProxy.trim();
    }
    return 'http://localhost:3334/chat';
}

async function _minkoChatRequestHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth?.getSession) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.access_token) {
                headers.Authorization = 'Bearer ' + session.access_token;
            }
        }
    } catch (_) {
        /* guest */
    }
    return headers;
}
const GROK_PROXY_ROOT = 'http://localhost:3333';

/** Видео-аватар Minko (на мобилке — статичный JPG, иначе лагает) */
const MINKO_STATIC_AVATAR_SRC = 'Fons/AI-ICON.jpg?v=4';
const MINKO_VIDEO_AVATAR_36 =
    '<video class="minko-chat-ava" width="36" height="36" playsinline muted loop autoplay poster="Fons/AI-ICON.jpg?v=4" preload="metadata">' +
    '<source src="Fons/AI%20ICON.mp4" type="video/mp4" /></video>';
const MINKO_VIDEO_AVATAR_BUBBLE =
    '<video class="minko-chat-ava" playsinline muted loop autoplay poster="Fons/AI-ICON.jpg?v=4" preload="metadata" ' +
    'style="width:100%;height:100%;object-fit:cover;border-radius:50%">' +
    '<source src="Fons/AI%20ICON.mp4" type="video/mp4" /></video>';
const MINKO_IMG_AVATAR_36 =
    '<img class="minko-chat-ava" src="' +
    MINKO_STATIC_AVATAR_SRC +
    '" alt="" width="36" height="36" decoding="async" loading="lazy">';
const MINKO_IMG_AVATAR_BUBBLE =
    '<img class="minko-chat-ava" src="' +
    MINKO_STATIC_AVATAR_SRC +
    '" alt="" decoding="async" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';

function _minkoPreferStaticAvatar() {
    try {
        if (typeof reminkoIsMobileLayout === 'function') return reminkoIsMobileLayout();
        if (window.matchMedia) return window.matchMedia('(max-width: 900px)').matches;
    } catch (_) {
        /* ignore */
    }
    return false;
}

function _minkoAvatarHtml(kind) {
    if (_minkoPreferStaticAvatar()) {
        return kind === 'bubble' ? MINKO_IMG_AVATAR_BUBBLE : MINKO_IMG_AVATAR_36;
    }
    return kind === 'bubble' ? MINKO_VIDEO_AVATAR_BUBBLE : MINKO_VIDEO_AVATAR_36;
}

function _minkoDowngradeVideosForMobile() {
    if (!_minkoPreferStaticAvatar()) return;
    document.querySelectorAll('video.minko-ai-head-img, video.minko-chat-ava').forEach((vid) => {
        try {
            vid.pause();
        } catch (_) {
            /* ignore */
        }
        const img = document.createElement('img');
        img.className = vid.className;
        img.src = MINKO_STATIC_AVATAR_SRC;
        img.alt = '';
        img.decoding = 'async';
        if (vid.width) img.width = vid.width;
        if (vid.height) img.height = vid.height;
        const st = vid.getAttribute('style');
        if (st) img.setAttribute('style', st);
        vid.replaceWith(img);
    });
}

function _minkoBindMobileKeyboardInset() {
    if (!_minkoPreferStaticAvatar()) return;
    const root = document.documentElement;
    const apply = () => {
        try {
            const vv = window.visualViewport;
            if (!vv) {
                root.style.setProperty('--minko-keyboard-inset', '0px');
                return;
            }
            const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
            root.style.setProperty('--minko-keyboard-inset', inset + 'px');
        } catch (_) {
            /* ignore */
        }
    };
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', apply);
        window.visualViewport.addEventListener('scroll', apply);
    }
    window.addEventListener('resize', apply);
    apply();
}

function _minkoAllStatusEls() {
    return document.querySelectorAll('.minko-ai-head-status');
}

function _minkoAllDotEls() {
    return document.querySelectorAll('.minko-ai-head-dot');
}

function _setMinkoHeadStatus(text) {
    _minkoAllStatusEls().forEach((el) => {
        el.textContent = text;
    });
}

function _minkoPrimaryDot() {
    return document.querySelector('.minko-ai-head-dot');
}

let grokOnline = false;
let freeOnline = false;
/** Счётчик проверок «в сети», чтобы устаревшие параллельные fetch не перезатирали статус */
let _minkoOnlineCheckGen = 0;
let _sleepyWokeUp = false;

/** Удалённое отключение чата (таблица minko_ai_public_state, панель создателя) */
let _minkoRemoteOffActive = false;
let _minkoRemoteMaintenanceMsg = '';
let _minkoRemoteGateSyncGen = 0;

// ── Сонные статусы и эффекты ──

const SLEEPY_STATUSES = [
    '🔍 Minko думает...',
    'Minko просыпается... 😴💤',
    'Minko ищет кофе... ☕😪',
    'Minko зевает и думает... 🥱',
    'Minko трёт глазки... 😴',
    'Minko обнимает подушку... 💤',
    'Minko пьёт кофе... ☕',
    'Minko клюёт носом... 😪💤',
    'Minko пытается проснуться... 🥱',
    'Minko заворачивается в плед... 😴',
    'Minko варит чай... 🍵😪',
    'Minko уронила ложку... 💤',
    'Minko щурится от экрана... 😴',
    'Minko медленно думает... 🥱💤',
    'Minko дует на чай... 🍵',
    'Minko чуть не уснула... 😪',
    'Minko поправляет волосы... 💤',
    'Minko жмурится от света... 😴',
    'Minko тянется за печенькой... 🍪💤',
    'Minko сонно моргает... 🥱',
    'Minko ковыряет кашу... 😴☕',
];

const SLEEPY_IDLE_STATUSES = [
    'Minko дремлет... 😴',
    'zzz... 💤',
    'Minko обнимает подушку... 😪',
    'Minko засыпает на клавиатуре... 💤',
    'Кофе закончился... 😴',
    'Minko считает овечек... 🐑💤',
    'Minko свернулась калачиком... 😪',
    'Minko бормочет во сне... 💤',
    'тишина... только сопение... 😴',
    'Minko видит аниме во сне... 💤✨',
];

const SLEEPY_THINKING_PHASES = [
    '🔍 Проверяю данные на MAL...',
    'Minko пытается проснуться... ☕',
    'Minko трёт глазки... 😴',
    'мозг... включайся... пожалуйста... 💤',
    'Minko делает глоток кофе... ☕',
    'Minko собирает мысли... 🥱',
    'нейроны... активируйтесь... 😪',
    'Minko вспоминает о чём спросили... 💤',
    'Minko борется со сном... 😴',
    '*зевает*... уже почти думаю... 🥱',
    'Minko ищет ответ на сонную голову... 💤',
    'кофе... ещё... кофе... ☕',
    'Minko медленно формулирует мысль... 😴',
    'подождите... мозг загружается... 💤',
    'Minko щурится на вопрос... 🥱',
    'один глаз уже открыт... второй на подходе... 😪',
    '*сонно бормочет*... думаю-думаю... 💤',
    'Minko перечитывает вопрос... третий раз... 😴',
    'Minko дует на горячий кофе... ☕',
    'буквы перестают расплываться... 🥱',
    'Minko просыпается на 37%... 💤',
    'Minko нашла мысль... ой, потеряла... 😪',
    'Minko активирует режим думания... 😴',
    'ещё секундочку... мозг почти включился... ☕',
    '*сонный вздох*... ладно, почти готово... 💤',
];

const SLEEPY_PLACEHOLDERS = [
    'Напиши что-нибудь… пока я не уснула на клавиатуре 💤',
    '*зевает* Спроси про аниме… или дай мне ещё 5 минут сна…',
    'Что посмотреть сегодня? Только не шепчи — я клюю носом… 😴',
    'Эй… ты ещё тут? Я почти уснула на Enter… 🥱',
    'Найди тайтл… а я пока обниму подушку~ 💤',
    'Кофе кончился… пиши медленно, я думаю сонно… ☕',
    'Можно коротко? Мозг на 37% зарядки… 😪',
    'Спроси про Re-Minko… только без криков, я дремлю…',
    'Ммм… ещё один вопросик, и я снова в пледе… 😴',
    'Напиши мне… пока я не уронила ложку в чай 🍵💤',
];

/** 9-й ответ в цикле из 10: Minko предупреждает, что после следующего — коридор/сон */
const MINKO_NINTH_CYCLE_WARNINGS = [
    '*зевает* Тсс... я **почти** вырубаюсь. **Следующий** мой ответ — и меня **укатит** в сонный коридор. Не пугайся, если вдруг откроется игра~ 💤',
    '...*клюёт носом* Ой-ой. **После следующего** ответа, наверное, окончательно вырублюсь в ту дрем-игру~ Пока ещё держусь... 🥱',
    '*трёт глазки* **Ещё один** ответ — и я **засну** по-настоящему, с коридором и таймерами. Ща отвечу, как смогу~ 😴',
];

const MINKO_SLEEPY_NEED_REPEAT_APPEND = [
    '\n\n*…ой… я на секунду вырубилась носиком прямо в кофе… повтори вопрос одной строкой?* ☕',
    '\n\n*м-м… мозг отключился на рекламу… можно то же самое, только короче?* 💤',
    '\n\n*зевает так, что захлебнулась воздухом* Прости… ещё разок вопросиком? Я уже просыпаюсь… 🥱',
    '\n\n*шепчет* Тсс… я чуть не уснула на «Энтер». Напиши ещё раз — я точно отвечу~ 😴',
];

const MINKO_SLEEPY_WELCOME_HTML = [
    '<p>*зевает* Привет… Я <strong>Minko</strong> — сонная помощница по аниме и сайту 😴✨</p><p>Спрашивай про тайтлы и Re-Minko… я отвечу, даже если клюю носом~ 💤</p>',
    '<p>Ммм… привет. Я <strong>Minko</strong> ☕ Я немного сонная, но аниме — это святое.</p><p>Кидай вопрос про каталог или тайтл — я проснусь ради этого~ 🥱</p>',
    '<p>*трёт глазки* Ой, ты тут… Я <strong>Minko</strong> из Re-Minko 💤</p><p>Могу подобрать аниме, объяснить сюжет и чуть-чуть подремать между репликами~</p>',
];

function _pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function _setChatStatusVisible(visible) {
    const el = document.getElementById('chatStatus');
    if (!el) return null;
    if (visible) {
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
        el.classList.add('is-visible');
    } else {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
        el.classList.remove('is-visible');
        el.textContent = '';
        el.innerHTML = '';
    }
    return el;
}

function _setChatStatusHtml(html) {
    const el = _setChatStatusVisible(true);
    if (!el) return;
    el.innerHTML = html;
}

function _setChatStatusText(text) {
    const el = _setChatStatusVisible(!!text);
    if (!el) return;
    if (text) el.textContent = text;
}

const MINKO_SLEEPY_OPENERS = [
    '*зевает* ',
    '*трёт глазки* ',
    '*клюёт носом* ',
    'Ммм… ',
    '*сонно* ',
    '*дует на воображаемый кофе* ',
    'Ох… ',
    '*моргает медленно* ',
];

function _maybeAppendSleepyRepeatLine(text) {
    if (!text || typeof text !== 'string') return text;
    if (!freeOnline) return text;
    if (Math.random() > 0.34) return text;
    if (/\*зевает\*|\*трёт|\*клюёт|\*шепчет\*|\*м-м|💤|🥱|😴/i.test(text)) return text;
    return text + _pickRandom(MINKO_SLEEPY_NEED_REPEAT_APPEND);
}

function _ensureSleepyFlavorInReply(text) {
    if (!text || typeof text !== 'string') return text;
    if (!freeOnline) return text;
    let out = text.trim();
    const hasRemark = /\*[^*]{2,40}\*|💤|🥱|😴|ммм?…|ммм?\.\.\./i.test(out);
    if (!hasRemark || Math.random() < 0.55) {
        const opener = _pickRandom(MINKO_SLEEPY_OPENERS);
        if (!out.toLowerCase().startsWith(opener.trim().toLowerCase().slice(0, 4))) {
            out = opener + out;
        }
    }
    return _maybeAppendSleepyRepeatLine(out);
}

function _getLuckFailStreak() {
    try {
        return Math.max(0, parseInt(localStorage.getItem(MINKO_LUCK_FAIL_STREAK_KEY) || '0', 10) || 0);
    } catch (_) {
        return 0;
    }
}

function _setLuckFailStreak(n) {
    try {
        const v = Math.max(0, n | 0);
        if (v <= 0) localStorage.removeItem(MINKO_LUCK_FAIL_STREAK_KEY);
        else localStorage.setItem(MINKO_LUCK_FAIL_STREAK_KEY, String(v));
    } catch (_) {
        /* noop */
    }
}

/** Длительность сна после неудачи: 5, 10, 15… макс 60 мин */
function _luckFailSleepMinutes(streakAfterFail) {
    return Math.min(60, Math.max(5, 5 * streakAfterFail));
}

function _resetLuckFailStreak() {
    _setLuckFailStreak(0);
    try {
        localStorage.removeItem(MINKO_GAME_FORCE_WAKE_NEXT_KEY);
    } catch (_) {
        /* noop */
    }
}

function _ensureSleepyHeaderBadge() {
    const meta = document.querySelector('.minko-ai-head-meta');
    if (!meta) return;
    let badge = meta.querySelector('.minko-header-sleepy-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'minko-header-sleepy-badge';
        badge.setAttribute('aria-hidden', 'true');
        meta.appendChild(badge);
    }
    badge.textContent = '💤 спит';
    badge.hidden = false;
}

function _hideSleepyHeaderBadge() {
    const badge = document.querySelector('.minko-header-sleepy-badge');
    if (badge) badge.hidden = true;
}

/** Офлайн-чат: реплика от Minko (не про «сервер» — пользовательский тон). */
const MINKO_CHAT_SERVER_OFFLINE_PARAGRAPHS = [
    'Создатель дубина перегрыз провода и оставил меня без сети 💔',
    '*поправляет плюшевую подушку* Я схожу и ******* ему по *******  и попрошу меня снова включить~ Подожди чуток, ладно?'
];

const MINKO_CHAT_SERVER_OFFLINE_HTML = MINKO_CHAT_SERVER_OFFLINE_PARAGRAPHS.map((t) => `<p>${t}</p>`).join('');

const MINKO_CHAT_SERVER_OFFLINE_MESSAGE = MINKO_CHAT_SERVER_OFFLINE_PARAGRAPHS.join('\n\n');

const MINKO_CHAT_OFFLINE_STATUS = 'Без проводов :(';
const MINKO_CHAT_OFFLINE_PLACEHOLDER = 'Без проводов… подожди чуть-чуть~';

let _minkoChatOfflineUiActive = false;
let _minkoRemoteOffNoticeShown = false;

function _minkoSetOfflineFlags(offlineUi, remoteOff) {
    if (typeof offlineUi === 'boolean') {
        _minkoChatOfflineUiActive = offlineUi;
        try {
            window.__minkoChatOfflineUiActive = offlineUi;
        } catch (_) {
            /* ignore */
        }
    }
    if (typeof remoteOff === 'boolean') {
        _minkoRemoteOffActive = remoteOff;
        try {
            window.__minkoRemoteOffActive = remoteOff;
        } catch (_) {
            /* ignore */
        }
    }
}

/** Только пузырь ассистента — никогда не трогаем сообщения «Вы». */
function _minkoAssistantBubbles() {
    return document.querySelectorAll(
        '#chatMessages .message-assistant .minko-msg-bubble.message-bubble, #chatMessages .message-assistant .message-bubble'
    );
}

function _minkoPrimaryAssistantBubble() {
    const list = _minkoAssistantBubbles();
    return list.length ? list[0] : null;
}

/** Убирает из ответа модели упоминания внешних ИИ-брендов (модель иногда игнорирует системный промпт). */
function _minkoRedactTechBrandsInReply(text) {
    if (!text || typeof text !== 'string') return text;
    const leak =
        /\b(openai|chatgpt|chat\s*gpt|grok|x\s*ai|xai|cursor\s*ai|cursorai|anthropic|claude|gpt[-\s]?[45]|llama|gemini|deepseek|qwen|mistral)\b|опен\s*аи|чат\s*гпт|курсор\s*аи/i;
    if (!leak.test(text)) return text;
    return _pickRandom([
        'Тсс, про «внутренности» тут не базарим — у Дубины режим «только магия и аниме» ✨ Я Minko, мой канон — тайтлы, а не техно-спойлеры. О чём расскажешь?',
        'Если копнуть под капот — Дубина скажет «спойлер запрещён» 🤫 Давай лучше про аниме: что смотришь или что порань бросить?',
        'Модель поведения — «фанатка сёнена», железо — «упрямство Дубины». Всё остальное под пледом коммерческой тайны~ ✨ Накидай вопрос по сайту или тайтлу!',
        'Я не вики по движкам, я по сюжетным аркам 💫 Хочешь — подберу тайтл, хочешь — помогу с Re-Minko без инженерных лекций.',
    ]);
}

/** URL/path сайта → маркер кнопки [[nav:…]] (никогда не оставляем голый URL в тексте). */
function _minkoUrlToNavMarker(urlOrPath) {
    const raw = String(urlOrPath || '').trim();
    if (!raw) return '';
    let path = raw;
    try {
        if (/^https?:\/\//i.test(raw)) {
            const u = new URL(raw);
            if (!/re-minko-anime\.com$/i.test(u.hostname.replace(/^www\./, ''))) return '';
            path = u.pathname + u.search + u.hash;
        }
    } catch (_) {
        /* keep path */
    }
    path = path.replace(/^\/+/, '').split(/[?#]/)[0].toLowerCase();
    const q = String(urlOrPath).toLowerCase();
    if (!path || path === 'index.html') {
        // Голый домен без раздела — не форсим кнопку «Re-Minko» (спам); Инфо полезнее
        return '[[nav:info|Инфо]]';
    }
    if (path.startsWith('info.html') || path === 'info') {
        if (/giveaway|#розыгрыш|розыгрыш/.test(q)) return '[[nav:giveaway|Розыгрыш]]';
        return '[[nav:info|Инфо]]';
    }
    if (path.startsWith('catalog/calendar')) return '[[nav:calendar|Календарь]]';
    if (path.startsWith('catalog/anime-4k')) return '[[nav:catalog-4k|≈4K каталог]]';
    if (path.startsWith('catalog/anime') || path === 'catalog/anime.html') {
        if (/status=|анонс|announc/.test(q)) return '[[nav:catalog-announced|Каталог: Анонсы]]';
        return '[[nav:catalog|Каталог аниме]]';
    }
    if (path.startsWith('minko-ai')) return '[[nav:minko|Minko AI]]';
    if (path.startsWith('messages')) return '[[nav:messages|Сообщения]]';
    if (path.startsWith('catalog/')) return '[[nav:catalog|Каталог аниме]]';
    return '[[nav:info|Инфо]]';
}

/**
 * Убирает markdown/URL из ответа; URL Re-Minko превращает в кнопки [[nav:…]].
 */
function _minkoStripReplyLinks(text) {
    if (!text || typeof text !== 'string') return text;
    const stash = [];
    let out = text.replace(/\[\[(watch|nav):[^\]]+\]\]/gi, (m) => {
        const i = stash.length;
        stash.push(m);
        return `\u0000MK${i}\u0000`;
    });

    out = out.replace(
        /манга\s+и\s+некоторы[ех]\s+функци\w*\s+пока\s+могут\s+быть\s+в\s+бете[^.?!]*[.?!]?\s*/gi,
        ''
    );
    out = out.replace(
        /манга\s+и\s+часть\s+разделов\s+[^.?!]*(бете|недоступн\w*)[^.?!]*[.?!]?\s*/gi,
        ''
    );
    out = out.replace(/сайт\s+в\s+бета[-\s]?версии[^.?!]*[.?!]?\s*/gi, '');
    out = out.replace(/начать\s+можно\s+с\s+/gi, '');

    // [текст](url) → кнопка nav или просто текст
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/gi, (_, label, href) => {
        const nav = _minkoUrlToNavMarker(href);
        if (nav) return nav;
        return String(label || '').trim();
    });
    // голые URL сайта → кнопка (не спамим главной)
    out = out.replace(/https?:\/\/(?:www\.)?re-minko-anime\.com\/?[^\s)\]>"']*/gi, (u) => {
        return _minkoUrlToNavMarker(u) || '[[nav:info|Инфо]]';
    });
    // относительные пути
    out = out.replace(
        /(?:^|[\s(])(\/(?:catalog|anime|info|minko-ai|favorites|history|profile|watch-together|index\.html?)[^\s)\]>"']*)/gi,
        (full, p) => {
            const nav = _minkoUrlToNavMarker(p);
            return (full.startsWith('(') ? '(' : ' ') + (nav || '');
        }
    );

    out = out.replace(/\s{2,}/g, ' ');
    out = out.replace(/\u0000MK(\d+)\u0000/g, (_, i) => stash[Number(i)] || '');
    // дедуп подряд одинаковых nav-кнопок
    out = out.replace(/(\[\[nav:[^\]]+\]\])(?:\s*\1)+/gi, '$1');
    out = out.replace(/\n{3,}/g, '\n\n').trim();
    if (out.length >= 8) return out;
    return _pickRandom([
        '*зевает* О чём болтаем — тайтл, сюжет или что подобрать по настроению? 💤',
        'Я тут, спрашивай про аниме или сайт — без канцелярита ✨',
        '*потягивается* Давай по делу: что смотришь или что найти? 🌸',
    ]);
}

// Особые ответы на клиенте (до запроса к прокси; единый тон для всех режимов)
/** «Кто ты / кто создал / представься / любимое аниме» — только через ИИ, не заготовки. */
function _isIdentityOrCreatorQuestion(m) {
    return (
        /^(кто\s*ты|ты\s*кто)\b/i.test(m.trim()) ||
        /кто\s*(ты|тебя)\s*(такая|такой|такое)?/i.test(m) ||
        /представ(ь|ьтесь|ься)|расскаж(и|ите)\s+о\s+себе|что\s+ты\s+за\s+(ии|помощник|бот|ассистент)/i.test(m) ||
        /кто\s*(тебя\s*)?(создал|сделал|разработал|написал|придумал|запрограмм)|кто\s*твой\s*(создатель|разработчик|автор|папа|хозяин)|реальн\w*\s+(создател\w*|автор\w*)|настоящ\w*\s+(создател\w*|тебя)|откуда\s*ты\s*(взял|появил)|как\s*ты\s*(появил|был[аи]?\s*созда)/i.test(
            m
        ) ||
        /люб\w*\s*(аниме|тайтл)|какое\s*(аниме|тайтл).*(нрав|люб)|твоё?\s*(люби|любимое)\s*аниме|любимое\s*аниме|favorite\s*anime/i.test(
            m
        )
    );
}

function _getClientSpecialAnswer(msg) {
    const m = msg.toLowerCase().trim();

    // Дубина / стек / «на чём сайт» / модель — только через ИИ (без клиентских шаблонов)
    if (_isIdentityOrCreatorQuestion(m)) return null;

    // Сонность / бодрость → только «сонная» канонично
    if (/взбодр|разбуд|просн|проснись|просыпайся|почему\s*(ты\s*)?сонн|будь\s*бодр|стать\s*бодр|не\s*сп[иь]|хватит\s*сп|перестань?\s*сп|как\s*(тебя|тебе)\s*(раз)?буд|как\s*(тебя|тебе)\s*взбодр|что\s*(нужно|надо).*бодр|сонная|сонливая|засыпаешь|вечно\s*сп/i.test(m)) {
        return _pickRandom([
            '*зевает* Я Minko — помощница по аниме и сайту. Могу клюнуть носом, но отвечу по делу ☕🌸',
            '*потягивается* «Разбудить» меня в смысле бодрости не выйдет — зато подскажу тайтл или разберём Re-Minko 💤',
            'Ох... *моргает* Сейчас сонная, но вопросы про аниме — моя сильная сторона. Спрашивай~ 🥱',
            '*обнимает подушку* Дай кофе и вопрос — отвечу. Или спроси про премьеры сезона ✨',
            '*пьёт кофе* Отвечу чуть медленнее, зато без воды. О чём поговорим?',
        ]);
    }

    return null;
}

function _applySleepyMode(active) {
    const wrap = document.querySelector('.minko-ai-wrap');
    if (!wrap) return;
    if (active) {
        wrap.classList.add('sleepy-mode');
        _addZzzBubble();
    } else {
        wrap.classList.remove('sleepy-mode');
        _removeZzzBubble();
    }
}

function _addZzzBubble() {
    const avatarWrap =
        document.querySelector('.minko-chat-topbar .minko-ai-head-avatar') ||
        document.querySelector('.minko-ai-head-avatar');
    if (!avatarWrap || avatarWrap.querySelector('.sleepy-zzz')) return;
    const zzz = document.createElement('span');
    zzz.className = 'sleepy-zzz';
    zzz.textContent = '💤';
    avatarWrap.style.position = 'relative';
    avatarWrap.appendChild(zzz);
}

function _removeZzzBubble() {
    const zzz = document.querySelector('.sleepy-zzz');
    if (zzz) zzz.remove();
}

function _setSleepyIdleStatus() {
    if (!freeOnline) return;
    _setChatStatusText(_pickRandom(SLEEPY_IDLE_STATUSES));
}

let _sleepyIdleTimer = null;
function _startSleepyIdleCycle() {
    if (_sleepyIdleTimer) clearInterval(_sleepyIdleTimer);
    _sleepyIdleTimer = setInterval(() => {
        if (freeOnline) _setSleepyIdleStatus();
    }, 8000);
}

// ═══════════════════════════════════════════════════════════════
//  СОННЫЙ ОВЕРЛЕЙ — теперь это МИНИ-ИГРА «Re:Wake Minko»
//  Игрок проходит коридор Субару, чтобы разбудить Минко.
//  При победе → Минко просыпается, AI продолжает ответ.
//  При выходе из коридора → глубокий сон на 12 ч (без «обиды» в текстах).
// ═══════════════════════════════════════════════════════════════
const MINKO_GAME_SLEEP_KEY = 'reWakeMinko_sleepUntil';
const MINKO_GAME_FORCE_WAKE_NEXT_KEY = 'reWakeMinko_forceWakeNextAt';
/** Пока =1 — Minko «ждёт» мини-игру: F5 не отменяет, только прохождение коридора */
const MINKO_WAKE_GAME_PENDING_KEY = 'minkoWakeGamePending';
/** Шанс удачно разбудить «испытанием удачи» */
const MINKO_WAKE_SUCCESS_CHANCE = 0.32;
/** Каждые N ответов Minko (с API) — глубокий сон + мини-игра «коридор» */
const MINKO_SLEEP_CYCLE_EVERY = 10;
const MINKO_SLEEP_CYCLE_KEY = 'minko_ai_assistant_reply_count';
const MINKO_CURSE_STRIKES_KEY = 'minko_ai_curse_strikes';
const MINKO_SLEEP_REASON_KEY = 'minko_ai_sleep_reason';
/** Серия неудачных «удач»: 1→5м, 2→10м, 3→15м… сброс при успехе */
const MINKO_LUCK_FAIL_STREAK_KEY = 'minko_luck_fail_streak';
/** Случайная дрёма (не мини-игра): шанс вместо ответа */
const MINKO_RANDOM_NAP_CHANCE = 0.11;
/** Подписи на экране сна (рандом) */
const MINKO_NAP_CAPTIONS = [
    'Боже, она опять уснула…',
    'А вчера кстати было ..... УСНУЛА',
    'Нужно заварить кофе ☕',
    'Тсс… Minko снова в режиме «плед»',
    '*храп на фоне опенинга* 💤',
    'Кто-нибудь включи будильник…',
    'Она обещала «ещё одну минуту» 5 минут назад',
    'Луна: +1. Minko: −1 сознание.',
    'Срочно: подушка 1 — пользователь 0',
    'Не буди резко… или как раз буди удачей~'
];
const MINKO_CURSE_SLEEP_MS = 2 * 60 * 60 * 1000;
const MINKO_CORRIDOR_LEAVE_SLEEP_MS = 12 * 60 * 60 * 1000;
let _minkoCurseVideoActive = false;

// ── Запретные слова в чате (только «я могу…» / «Субару…» + перерождение) ──
const MINKO_CHAT_REBIRTH_ROOTS = [
    'перерод', 'перерож', 'возрожд', 'возродил',
    'воскрес', 'воскреш', 'бессмерт', 'перевоплощ', 'реинкарн',
    'rebirth', 'reborn', 'resurrect', 'immortal',
];

const MINKO_CHAT_REBIRTH_PAIRS = [
    ['возвра', 'смерт'], ['смерт', 'возвра'], ['умира', 'возвра'],
    ['смерт', 'ожив'], ['после', 'смерт', 'жив'], ['снова', 'оживаю'],
];

function _minkoNormalizeVisual(text) {
    let t = String(text || '').toLowerCase();
    const lat2cyr = {
        a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', y: 'у', x: 'х', k: 'к',
        h: 'н', b: 'в', m: 'м', t: 'т', n: 'п', u: 'и', i: 'и', ë: 'е',
    };
    const digit2cyr = { 0: 'о', 3: 'е', 4: 'ч', 6: 'б', 7: 'т' };
    let out = '';
    for (const ch of t) {
        if (lat2cyr[ch]) out += lat2cyr[ch];
        else if (digit2cyr[ch]) out += digit2cyr[ch];
        else out += ch;
    }
    return out.replace(/[^а-яёa-z]/g, '').replace(/(.)\1{2,}/g, '$1');
}

function _minkoNormalizePhonetic(text) {
    let t = String(text || '').toLowerCase();
    t = t
        .replace(/shch/g, 'щ').replace(/sch/g, 'щ')
        .replace(/zh/g, 'ж').replace(/ch/g, 'ч').replace(/sh/g, 'ш')
        .replace(/kh/g, 'х').replace(/ts/g, 'ц')
        .replace(/ya/g, 'я').replace(/yu/g, 'ю').replace(/yo/g, 'ё')
        .replace(/ey/g, 'ей').replace(/ay/g, 'ай').replace(/oy/g, 'ой');
    const digit2cyr = { 0: 'о', 3: 'е', 4: 'ч', 6: 'б', 7: 'т' };
    const phon = {
        a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', ë: 'е', j: 'ж',
        z: 'з', i: 'и', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
        r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', c: 'к', w: 'в', x: 'х', y: 'ы', q: 'к',
    };
    let out = '';
    for (const ch of t) {
        if (phon[ch]) out += phon[ch];
        else if (digit2cyr[ch]) out += digit2cyr[ch];
        else out += ch;
    }
    return out.replace(/[^а-яё]/g, '').replace(/(.)\1{2,}/g, '$1');
}

function _minkoEditDistance(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    if (Math.abs(m - n) > 3) return 99;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
}

function _minkoFuzzyContains(text, root, maxDist) {
    if (!text || !root) return false;
    const rl = root.length;
    if (text.length + maxDist < rl) return false;
    if (text.includes(root)) return true;
    const minLen = Math.max(1, rl - maxDist);
    const maxLen = rl + maxDist;
    for (let wl = minLen; wl <= maxLen; wl++) {
        for (let i = 0; i + wl <= text.length; i++) {
            if (_minkoEditDistance(text.substring(i, i + wl), root) <= maxDist) return true;
        }
    }
    return false;
}

function _minkoFormHasRebirthRoot(n) {
    for (const root of MINKO_CHAT_REBIRTH_ROOTS) {
        const maxDist = root.length >= 10 ? 2 : 1;
        if (_minkoFuzzyContains(n, root, maxDist)) return true;
    }
    for (const pair of MINKO_CHAT_REBIRTH_PAIRS) {
        let all = true;
        for (const tok of pair) {
            const tokDist = tok.length >= 6 ? 1 : 0;
            if (!_minkoFuzzyContains(n, tok, tokDist)) {
                all = false;
                break;
            }
        }
        if (all) return true;
    }
    return false;
}

function _minkoFormHasSelfClaim(n) {
    if (/^я/.test(n)) return true;
    if (/(могу|умею|мог|умел|умела|способен|способна)/.test(n)) return true;
    if (/(переродил|переродила|перерож|возродил|воскрес|воскреш|возрож)/.test(n)) return true;
    return false;
}

function _minkoHasSelfInRaw(raw) {
    const s = ' ' + String(raw).toLowerCase().replace(/\s+/g, ' ') + ' ';
    return / я /.test(s) || / меня /.test(s) || / мне /.test(s) || /\bi (can|could|am|was) /.test(s);
}

function _minkoHasSubaruInText(text) {
    const raw = String(text).toLowerCase();
    if (/субар|subaru|нацуки|natsuki|субару|нatsuki/i.test(raw)) return true;
    const forms = [_minkoNormalizeVisual(text), _minkoNormalizePhonetic(text)];
    return forms.some((n) => _minkoFuzzyContains(n, 'субару', 1) || _minkoFuzzyContains(n, 'нацуки', 1));
}

function checkForbiddenChat(text) {
    if (!text || String(text).trim().length < 4) return false;
    const raw = String(text).toLowerCase();
    const hasSelfRaw = _minkoHasSelfInRaw(raw);
    const hasSubaruRaw = _minkoHasSubaruInText(text);
    if (!hasSelfRaw && !hasSubaruRaw) return false;

    const forms = [_minkoNormalizeVisual(text), _minkoNormalizePhonetic(text)];
    for (const n of forms) {
        if (n.length < 4 || !_minkoFormHasRebirthRoot(n)) continue;

        const hasSubaru = hasSubaruRaw || _minkoFuzzyContains(n, 'субару', 1) || _minkoFuzzyContains(n, 'нацуки', 1);
        if (hasSubaru) return true;

        if (hasSelfRaw || _minkoFormHasSelfClaim(n)) return true;
    }
    return false;
}

function _getMinkoCurseStrikes() {
    try {
        return Math.max(0, parseInt(localStorage.getItem(MINKO_CURSE_STRIKES_KEY) || '0', 10) || 0);
    } catch (_) {
        return 0;
    }
}

function _setMinkoCurseStrikes(n) {
    try {
        localStorage.setItem(MINKO_CURSE_STRIKES_KEY, String(Math.max(0, n | 0)));
    } catch (_) {
        /* noop */
    }
}

function _getMinkoSleepReason() {
    try {
        return localStorage.getItem(MINKO_SLEEP_REASON_KEY) || '';
    } catch (_) {
        return '';
    }
}

function _setMinkoSleepReason(reason) {
    try {
        if (reason) localStorage.setItem(MINKO_SLEEP_REASON_KEY, reason);
        else localStorage.removeItem(MINKO_SLEEP_REASON_KEY);
    } catch (_) {
        /* noop */
    }
}

/** Те же звуки, что в мини-игре при 1-м и 2-м запретном слове (Re:Wake Minko). */
const MINKO_CURSE_SFX = {
    1: { src: 'Mini Game Minko/i_love_you.mp3', fallbackMs: 4500, volume: 0.55 },
    2: { src: 'Mini Game Minko/Serdze.mp3', fallbackMs: 15000, volume: 0.6 },
};

function _playMinkoCurseSfx(strike) {
    return new Promise((resolve) => {
        const cfg = MINKO_CURSE_SFX[strike];
        if (!cfg) {
            resolve();
            return;
        }
        const audio = new Audio(cfg.src);
        audio.volume = cfg.volume;
        audio.preload = 'auto';
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(fallbackTimer);
            audio.onended = null;
            audio.onerror = null;
            try {
                audio.pause();
                audio.removeAttribute('src');
            } catch (_) {
                /* ignore */
            }
            resolve();
        };
        const fallbackTimer = setTimeout(finish, cfg.fallbackMs);
        audio.onended = finish;
        audio.onerror = finish;
        audio.currentTime = 0;
        audio.play().catch(finish);
    });
}

function _setCurseAishiteruFlash(show) {
    const veil = document.getElementById('minkoCurseGlitchVeil');
    if (!veil) return;
    let el = veil.querySelector('.minko-curse-aishiteru-flash');
    if (show) {
        if (!el) {
            el = document.createElement('div');
            el.className = 'minko-curse-aishiteru-flash';
            el.setAttribute('aria-hidden', 'true');
            el.textContent = '愛してる';
            veil.appendChild(el);
        }
        el.hidden = false;
    } else if (el) {
        el.hidden = true;
    }
}

function _ensureMinkoCurseGlitchVeil() {
    let veil = document.getElementById('minkoCurseGlitchVeil');
    if (!veil) {
        veil = document.createElement('div');
        veil.id = 'minkoCurseGlitchVeil';
        veil.className = 'minko-curse-glitch-veil';
        veil.setAttribute('aria-hidden', 'true');
        document.body.appendChild(veil);
    }
    return veil;
}

function _minkoSplitCurseLetters(msgEl, fullText) {
    const p = msgEl && msgEl.querySelector('.minko-msg-bubble p');
    if (!p || !msgEl) return;
    const text = String(fullText != null ? fullText : msgEl.dataset.curseText || p.textContent || '');
    msgEl.dataset.curseText = text;
    p.textContent = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const span = document.createElement('span');
        span.className = 'minko-curse-letter';
        span.style.animationDelay = `${(i % 11) * 0.038}s`;
        span.style.setProperty('--minko-curse-dx', `${(Math.random() * 10 - 5).toFixed(1)}px`);
        span.style.setProperty('--minko-curse-dy', `${(Math.random() * 8 - 4).toFixed(1)}px`);
        span.style.setProperty('--minko-curse-rot', `${(Math.random() * 10 - 5).toFixed(1)}deg`);
        span.textContent = ch === ' ' ? '\u00a0' : ch;
        p.appendChild(span);
    }
}

function _playMinkoCurseGlitchEffect(strike, userMsgEl, messageText) {
    return new Promise(async (resolve) => {
        _minkoCurseVideoActive = true;
        const root = document.body;
        const wrap =
            document.querySelector('.minko-ai-wrap') ||
            document.querySelector('.main-layout') ||
            root;
        const heavy = strike >= 2;

        if (userMsgEl) {
            userMsgEl.classList.add('minko-curse-msg');
            userMsgEl.dataset.curseText = String(messageText || '');
            _minkoSplitCurseLetters(userMsgEl, messageText);
        }

        root.classList.add('minko-curse-shake');
        if (heavy) root.classList.add('minko-curse-shake--heavy');
        wrap.classList.add('minko-curse-glitch-active');
        if (heavy) wrap.classList.add('minko-curse-strike-2');

        await _playMinkoCurseSfx(strike);
        await new Promise((r) => setTimeout(r, heavy ? 700 : 500));

        root.classList.remove('minko-curse-shake', 'minko-curse-shake--heavy');
        wrap.classList.add('minko-curse-glitch-recover');
        await new Promise((r) => setTimeout(r, heavy ? 1400 : 1000));

        wrap.classList.remove('minko-curse-glitch-active', 'minko-curse-glitch-recover', 'minko-curse-strike-2');
        _minkoCurseVideoActive = false;
        resolve();
    });
}

function _slowEraseCurseMessage(msgEl) {
    return new Promise((resolve) => {
        if (!msgEl || !msgEl.isConnected) {
            resolve();
            return;
        }
        const p = msgEl.querySelector('.minko-msg-bubble p');
        const original = String(msgEl.dataset.curseText || '');
        if (!p || !original) {
            msgEl.remove();
            resolve();
            return;
        }
        p.textContent = original;
        let text = original;
        const step = () => {
            if (!msgEl.isConnected) {
                resolve();
                return;
            }
            if (text.length <= 0) {
                msgEl.classList.add('minko-curse-msg-vanish');
                setTimeout(() => {
                    if (msgEl.isConnected) msgEl.remove();
                    resolve();
                }, 420);
                return;
            }
            text = text.slice(0, -1);
            p.textContent = text;
            setTimeout(step, 55 + Math.random() * 50);
        };
        setTimeout(step, 280);
    });
}

function _playMinkoCurseSmokeOnly(ms = 2800) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('minkoCurseOverlay');
        if (!overlay) {
            setTimeout(resolve, ms);
            return;
        }
        _minkoCurseVideoActive = true;
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => overlay.classList.add('active'));
        setTimeout(() => {
            overlay.classList.remove('active');
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
            _minkoCurseVideoActive = false;
            resolve();
        }, ms);
    });
}

function _getMinkoAssistantReplyCount() {
    try {
        return Math.max(0, parseInt(localStorage.getItem(MINKO_SLEEP_CYCLE_KEY) || '0', 10) || 0);
    } catch (_) {
        return 0;
    }
}

function _setMinkoAssistantReplyCount(n) {
    try {
        localStorage.setItem(MINKO_SLEEP_CYCLE_KEY, String(Math.max(0, n | 0)));
    } catch (_) {
        /* noop */
    }
}

function _syncMinkoAssistantReplyCountFromHistory() {
    const n = chatHistory.filter((m) => m.role === 'assistant').length;
    _setMinkoAssistantReplyCount(n);
}

/** Номер следующего ответа ассистента в цикле 1…10 */
function _minkoNextReplySlotInCycle() {
    return (_getMinkoAssistantReplyCount() % MINKO_SLEEP_CYCLE_EVERY) + 1;
}

const MINKO_WAKE_LUCK_ACTIONS = [
    'шепнуть ей про премьеры нового сезона',
    'аккуратно поставить перед ней кофе',
    'вылить стакан воды на тумбочку рядом',
    'включить мягкий ночник',
    'задёрнуть шторы от солнца',
    'накрыть тёплым пледом',
    'включить лампу «луна» на минимум',
    'поставить тихий lo-fi на одну кнопку громкости',
    'приоткрыть окно на пару минут',
    'пощекотать нос пёрышком',
    'принести тёплые носочки',
    'шепнуть «цундере уже встала»',
    'мягко притворить дверь',
    'пшикнуть лёгкий аромат ванили',
    'подложить подушку повыше',
    'завязать шнурок на худи, чтобы не мешал',
    'поставить будильник с мелодией «мяу»',
    'приклеить смешной стикер с котом',
    'шепнуть список релизов недели',
    'включить «не беспокоить» на телефоне рядом',
    'принести круассан (воображаемо)',
    'заварить «сонный» травяной чай',
    'погладить обложку любимого томика манги',
    'включить ночной светофильтр на экране',
    'поставить рядом плюшевого Пака'
];

function _getMinkoSleepUntilTs() {
    try {
        const u = parseInt(localStorage.getItem(MINKO_GAME_SLEEP_KEY) || '0', 10);
        return u > 0 ? u : 0;
    } catch (_) {
        return 0;
    }
}

function _setMinkoGameFocusLock(on) {
    document.body.classList.toggle('minko-game-focus-lock', !!on);
}

function _isMinkoDeepAsleep() {
    try {
        const until = parseInt(localStorage.getItem(MINKO_GAME_SLEEP_KEY) || '0', 10);
        if (!until) return 0;
        const remain = until - Date.now();
        if (remain <= 0) {
            try {
                localStorage.removeItem(MINKO_GAME_SLEEP_KEY);
                localStorage.removeItem(MINKO_GAME_FORCE_WAKE_NEXT_KEY);
                localStorage.removeItem(MINKO_SLEEP_REASON_KEY);
            } catch (_) {}
            return 0;
        }
        return remain;
    } catch (_) { return 0; }
}

function _isMinkoWakeGamePending() {
    try {
        return localStorage.getItem(MINKO_WAKE_GAME_PENDING_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function _setMinkoWakeGamePending(on) {
    try {
        if (on) localStorage.setItem(MINKO_WAKE_GAME_PENDING_KEY, '1');
        else localStorage.removeItem(MINKO_WAKE_GAME_PENDING_KEY);
    } catch (_) { /* noop */ }
}

function _formatSleepRemaining(ms) {
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (h > 0) return `${h} ч ${m} мин`;
    return `${m} мин`;
}

function _formatSleepRemainingLong(ms) {
    if (ms <= 0) return '0 сек';
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h} ч ${m} мин ${sec} сек`;
    if (m > 0) return `${m} мин ${sec} сек`;
    return `${sec} сек`;
}

let _minkoDeepSleepUiTimer = null;
let _minkoWasDeepAsleep = false;

function _syncHeaderSleepPresentation() {
    const remain = _isMinkoDeepAsleep();
    if (remain > 0) {
        _setMinkoHeadStatus('Спит');
        _ensureSleepyHeaderBadge();
        const badge = document.querySelector('.minko-header-sleepy-badge');
        if (badge) badge.textContent = '😴 крепко спит';
        _minkoAllDotEls().forEach((dotEl) => {
            dotEl.classList.remove('online', 'offline');
            dotEl.classList.add('sleeping');
        });
        return true;
    }
    _minkoAllDotEls().forEach((dotEl) => dotEl.classList.remove('sleeping'));
    return false;
}

/** Блокировка ввода из‑за «обиды» (без побочных UI-эффектов checkMinkoAngryState). */
function _isMinkoAngryInputBlocked() {
    const angryState = typeof getMinkoAngryState === 'function' ? getMinkoAngryState() : null;
    if (!angryState) return false;
    const now = Date.now();
    const authed = typeof isAuthenticatedSync === 'function' && isAuthenticatedSync();
    // После входа при blockedForever можно писать «прости»
    if (angryState.blockedForever) return !authed;
    if (angryState.blockedUntil && now < angryState.blockedUntil) return true;
    return false;
}

function _updateDeepSleepInputUi(remainMs) {
    const inp = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendButton');
    const timerEl = document.getElementById('minkoSleepInputTimer');
    if (remainMs > 0) {
        if (inp) {
            inp.disabled = true;
            inp.placeholder = '';
            inp.value = '';
        }
        if (sendBtn) sendBtn.disabled = true;
        if (timerEl) {
            timerEl.hidden = false;
            const reason = _getMinkoSleepReason();
            const awaitingLuck =
                reason === 'nap' &&
                (() => {
                    try {
                        const fn = parseInt(localStorage.getItem(MINKO_GAME_FORCE_WAKE_NEXT_KEY) || '0', 10) || 0;
                        return fn <= Date.now();
                    } catch (_) {
                        return true;
                    }
                })();
            const label = awaitingLuck
                ? '😴 Minko дремлет — разбуди удачей'
                : `😴 Minko спит — ${_formatSleepRemainingLong(remainMs)}`;
            timerEl.innerHTML =
                `<span class="minko-sleep-timer-label">${label}</span>` +
                `<button type="button" class="minko-sleep-wake-link" data-minko-reopen-sleep>Разбудить</button>`;
            timerEl.querySelector('[data-minko-reopen-sleep]')?.addEventListener('click', (e) => {
                e.preventDefault();
                if (document.getElementById('minkoGameOverlay')) return;
                if (_isMinkoWakeGamePending() && reason !== 'nap' && reason !== 'curse') {
                    _showSleepOverlay(null, { bypassDeepSleep: true });
                } else {
                    _showDeepSleepOverlay(_isMinkoDeepAsleep() || remainMs, { reason: reason || 'nap' });
                }
            });
        }
        return;
    }
    if (timerEl) {
        timerEl.hidden = true;
        timerEl.textContent = '';
    }
    if (!_minkoChatOfflineUiActive && !_isMinkoWakeGamePending()) {
        const angryBlocked = _isMinkoAngryInputBlocked();
        if (inp && !angryBlocked) {
            inp.disabled = false;
            if (freeOnline) inp.placeholder = _pickRandom(SLEEPY_PLACEHOLDERS);
        }
        if (sendBtn && !angryBlocked) sendBtn.disabled = false;
    }
}

const MINKO_WAKE_SORRY_LINES = [
    '*зевает* Ой… прости, я совсем вырубилась 😴 Можешь повторить вопрос? Я теперь слушаю~',
    '*трёт глазки* Упс… уснула на клавиатуре. Извини! Скажи ещё раз, что спрашивал(а)? 💤',
    '*потягивается* Ммм… я не нарочно, честно. Повтори, пожалуйста, свой вопрос — отвечу уже без храпа~ 🌸',
    '*сонно* Простиии… плед победил. Кинь вопрос ещё раз, ладно? ☕💤',
    '*моргает* Я тут… вроде… Извини, что отключилась. Повтори вопрос — продолжим с того места~'
];

function _notifyMinkoWakeUp() {
    // reason читаем до reminkoNotify (там чистятся ключи сна)
    const reason = _getMinkoSleepReason() || 'nap';
    _setChatAsleepAtmosphere(false);
    if (typeof _showWakeBanner === 'function') _showWakeBanner(reason);
    if (typeof window.reminkoNotifyMinkoWakeUp === 'function') {
        const message =
            reason === 'corridor'
                ? 'Minko проснулась — коридор пройден ✨'
                : reason === 'curse'
                  ? 'Minko проснулась после проклятия ✨'
                  : 'Minko проснулась после дрёмы ✨';
        window.reminkoNotifyMinkoWakeUp({ message, reason });
    }
    // Сонное извинение + просьба повторить вопрос (после удачи или выхода таймера)
    setTimeout(() => {
        try {
            if (typeof window.__minkoPostWakeApology === 'function') {
                window.__minkoPostWakeApology();
            }
        } catch (_) {
            /* ignore */
        }
    }, 420);
}

function _startDeepSleepUiPoll() {
    if (_minkoDeepSleepUiTimer) clearInterval(_minkoDeepSleepUiTimer);
    _minkoDeepSleepUiTimer = setInterval(() => {
        const remain = _isMinkoDeepAsleep();
        if (remain > 0) {
            _minkoWasDeepAsleep = true;
            _syncHeaderSleepPresentation();
            _updateDeepSleepInputUi(remain);
            const wrap = document.querySelector('.minko-ai-wrap');
            if (wrap && !wrap.classList.contains('minko-chat-asleep')) {
                _setChatAsleepAtmosphere(true);
            }
            return;
        }
        _updateDeepSleepInputUi(0);
        if (_minkoWasDeepAsleep) {
            _minkoWasDeepAsleep = false;
            _notifyMinkoWakeUp();
            if (freeOnline && typeof _syncSleepyOnlinePresentation === 'function') {
                _syncSleepyOnlinePresentation();
            }
        } else if (freeOnline) {
            _syncHeaderSleepPresentation();
            _setChatAsleepAtmosphere(false);
        }
    }, 1000);
}

function _showSleepOverlay(onWake, opts) {
    const bypassDeepSleep = opts && opts.bypassDeepSleep === true;
    const wrap = document.querySelector('.minko-ai-wrap');
    const staleOverlay = document.getElementById('minkoGameOverlay');
    if (staleOverlay) {
        _closeGameOverlay(staleOverlay, true);
    }
    if (!wrap) {
        if (onWake) onWake();
        return;
    }

    if (!bypassDeepSleep) {
        const deepSleep = _isMinkoDeepAsleep();
        if (deepSleep > 0) {
            _showDeepSleepOverlay(deepSleep);
            if (onWake) onWake();
            return;
        }
    }

    const overlay = document.createElement('div');
    overlay.id = 'minkoGameOverlay';
    overlay.className = 'minko-game-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Re:Wake Minko');
    overlay.innerHTML = `
        <div class="minko-game-intro">
            <div class="minko-game-intro-icon">😴</div>
            <div class="minko-game-intro-title">Minko уснула</div>
            <div class="minko-game-intro-text">
                Чтобы её разбудить — пройди коридор Субару.<br>
                <span class="minko-game-intro-warn">Если решишь уйти — она будет крепко спать <strong>12 часов</strong>.</span>
            </div>
            <button class="minko-game-start-btn" type="button">▶ Начать испытание</button>
        </div>
    `;
    _setMinkoGameFocusLock(true);
    document.body.appendChild(overlay);

    overlay.querySelector('.minko-game-start-btn').addEventListener('click', () => {
        overlay.classList.add('with-game');
        overlay.innerHTML = `
            <button class="minko-game-close-btn" type="button" title="Закрыть игру (без штрафа, прогресс мини-игры сбросится)">✕</button>
            <iframe id="minkoGameFrame"
                    class="minko-game-frame"
                    src="Mini Game Minko/index.html"
                    title="Re:Wake Minko"
                    allow="autoplay"
                    sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
        `;
        overlay.querySelector('.minko-game-close-btn').addEventListener('click', () => {
            if (!confirm('Закрыть окно? Minko всё ещё ждёт коридор — чат снова откроется только после мини-игры.')) return;
            _closeGameOverlay(overlay);
            const chatInput = document.getElementById('chatInput');
            const sendButton = document.getElementById('sendButton');
            if (_isMinkoWakeGamePending() || _isMinkoDeepAsleep() > 0) {
                if (chatInput) chatInput.disabled = true;
                if (sendButton) sendButton.disabled = true;
            } else {
                if (chatInput) chatInput.disabled = false;
                if (sendButton) sendButton.disabled = false;
            }
        });
    });

    function onMessage(e) {
        const frame = document.getElementById('minkoGameFrame');
        if (e.origin !== window.location.origin || !frame || e.source !== frame.contentWindow) {
            if (
                typeof window.reminkoReportSecuritySignal === 'function' &&
                e.data &&
                e.data.type === 'minkoGame'
            ) {
                window.reminkoReportSecuritySignal('client.auth_anomaly', {
                    category: 'minko_game_message_origin',
                    sourceUrl: e.origin
                });
            }
            return;
        }
        const data = e.data || {};
        if (data.type !== 'minkoGame') return;
        if (data.action === 'wakeMinko') {
            window.removeEventListener('message', onMessage);
            _closeGameOverlay(overlay);
            try {
                localStorage.removeItem(MINKO_GAME_SLEEP_KEY);
                localStorage.removeItem(MINKO_GAME_FORCE_WAKE_NEXT_KEY);
                localStorage.removeItem(MINKO_SLEEP_REASON_KEY);
            } catch (_) {}
            _resetLuckFailStreak();
            _setMinkoWakeGamePending(false);
            _notifyMinkoWakeUp();
            if (onWake) onWake();
        } else if (data.action === 'leaveCorridor') {
            window.removeEventListener('message', onMessage);
            _closeGameOverlay(overlay);
            const sleepUntil = data.sleepUntil || (Date.now() + MINKO_CORRIDOR_LEAVE_SLEEP_MS);
            try {
                localStorage.setItem(MINKO_GAME_SLEEP_KEY, String(sleepUntil));
                _setMinkoSleepReason('corridor');
            } catch (_) {}
            _setMinkoWakeGamePending(false);
            _showDeepSleepOverlay(sleepUntil - Date.now(), { reason: 'corridor' });
            if (onWake) onWake();
        }
    }
    window.addEventListener('message', onMessage);
}

/**
 * @param {HTMLElement | null} [overlay]
 * @param {boolean} [immediate] — сразу убрать из DOM (нужно перед повторным открытием коридора: иначе новый оверлей блокируется 400 мс анимацией)
 */
function _closeGameOverlay(overlay, immediate) {
    if (!overlay) overlay = document.getElementById('minkoGameOverlay');
    if (!overlay) return;
    if (typeof overlay._minkoStopDeepTimer === 'function') {
        overlay._minkoStopDeepTimer();
        overlay._minkoStopDeepTimer = null;
    }
    _setMinkoGameFocusLock(false);
    if (immediate) {
        overlay.remove();
        return;
    }
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.4s ease';
    setTimeout(() => overlay.remove(), 400);
}

function _runMinkoLuckWakeAttempt(overlay, resultEl) {
    const isCurseSleep = _getMinkoSleepReason() === 'curse';
    const isNap = _getMinkoSleepReason() === 'nap';
    // Блокируем повторную «удачу» только после неудачи (forceWakeNext), не при первом выборе
    let forceNext = 0;
    try {
        forceNext = parseInt(localStorage.getItem(MINKO_GAME_FORCE_WAKE_NEXT_KEY) || '0', 10) || 0;
    } catch (_) {
        forceNext = 0;
    }
    if (forceNext > Date.now()) {
        const minLeft = Math.max(1, Math.ceil((forceNext - Date.now()) / 60000));
        resultEl.hidden = false;
        resultEl.innerHTML =
            `<p class="minko-deep-luck-msg">Minko ещё спит… сама проснётся через ~<strong>${minLeft}</strong> мин. Потом можно снова болтать~ 💤</p>` +
            '<button type="button" class="minko-game-start-btn minko-btn-stack" data-luck-close>Ок</button>';
        resultEl.querySelector('[data-luck-close]').addEventListener('click', () => {
            resultEl.hidden = true;
            resultEl.innerHTML = '';
        });
        return;
    }

    const action = MINKO_WAKE_LUCK_ACTIONS[Math.floor(Math.random() * MINKO_WAKE_LUCK_ACTIONS.length)];
    if (Math.random() < MINKO_WAKE_SUCCESS_CHANCE) {
        try {
            localStorage.removeItem(MINKO_GAME_SLEEP_KEY);
            localStorage.removeItem(MINKO_SLEEP_REASON_KEY);
        } catch (_) {}
        _resetLuckFailStreak();
        if (typeof overlay._minkoStopDeepTimer === 'function') {
            overlay._minkoStopDeepTimer();
            overlay._minkoStopDeepTimer = null;
        }
        _setMinkoGameFocusLock(false);
        _closeGameOverlay(overlay);
        _setChatAsleepAtmosphere(false);
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendButton');
        if (chatInput) chatInput.disabled = false;
        if (sendButton) sendButton.disabled = false;
        if (typeof _syncSleepyOnlinePresentation === 'function') _syncSleepyOnlinePresentation();
        const banner = document.createElement('div');
        banner.className = 'minko-wake-banner';
        banner.innerHTML =
            '<div class="minko-wake-banner-icon">✨</div>' +
            '<div class="minko-wake-banner-text"><strong>Повезло!</strong><br><span>Minko открыла глаза после «' +
            action.replace(/</g, '') +
            '»~ Таймеры сброшены (снова с 5 мин). Продолжай чат 💙</span></div>';
        document.body.appendChild(banner);
        setTimeout(() => banner.classList.add('shown'), 30);
        setTimeout(() => {
            banner.classList.remove('shown');
            setTimeout(() => banner.remove(), 500);
        }, 4500);
        if (typeof window.reminkoNotifyMinkoWakeUp === 'function') {
            window.reminkoNotifyMinkoWakeUp({ message: 'Minko проснулась после «испытания удачи» ✨' });
        }
        return;
    }

    // Неудача: 5 → 10 → 15… минут сна, потом сама проснётся
    const nextStreak = _getLuckFailStreak() + 1;
    _setLuckFailStreak(nextStreak);
    const waitMin = _luckFailSleepMinutes(nextStreak);
    const until = Date.now() + waitMin * 60 * 1000;
    try {
        localStorage.setItem(MINKO_GAME_SLEEP_KEY, String(until));
        localStorage.setItem(MINKO_GAME_FORCE_WAKE_NEXT_KEY, String(until));
        if (!_getMinkoSleepReason()) _setMinkoSleepReason(isNap ? 'nap' : isCurseSleep ? 'curse' : 'corridor');
    } catch (_) {}

    resultEl.hidden = false;
    const waitHint =
        'Не повезло… Minko поспит ещё <strong>' +
        waitMin +
        '</strong> мин и сама проснётся. Следующая неудача будет уже дольше (сейчас цепочка: 5→10→15…). При удачном пробуждении таймеры сбросятся.';
    if (isCurseSleep) {
        resultEl.innerHTML =
            '<p class="minko-deep-luck-msg">Ты попробовала: «' +
            action.replace(/</g, '') +
            '»… проклятие крепко держит 💤</p>' +
            '<p class="minko-deep-luck-hint">' +
            waitHint +
            '</p>' +
            '<div class="minko-deep-luck-btns">' +
            '<button type="button" class="minko-game-start-btn minko-btn-muted" data-luck-wait>Ок, подожду ' +
            waitMin +
            ' мин</button>' +
            '</div>';
    } else if (isNap) {
        resultEl.innerHTML =
            '<p class="minko-deep-luck-msg">Ты попробовала: «' +
            action.replace(/</g, '') +
            '»… она только крепче укуталась 😴</p>' +
            '<p class="minko-deep-luck-hint">' +
            waitHint +
            '</p>' +
            '<div class="minko-deep-luck-btns">' +
            '<button type="button" class="minko-game-start-btn minko-btn-muted" data-luck-wait>Ок, подожду ' +
            waitMin +
            ' мин</button>' +
            '</div>';
    } else {
        resultEl.innerHTML =
            '<p class="minko-deep-luck-msg">Ты попробовала: «' +
            action.replace(/</g, '') +
            '»… сон не прервался 💤</p>' +
            '<p class="minko-deep-luck-hint">' +
            waitHint +
            ' Или снова пройди коридор.</p>' +
            '<div class="minko-deep-luck-btns">' +
            '<button type="button" class="minko-game-start-btn" data-luck-corridor>Пройти коридор ещё раз</button>' +
            '<button type="button" class="minko-game-start-btn minko-btn-muted" data-luck-wait>Ок, подожду ' +
            waitMin +
            ' мин</button>' +
            '</div>';

        resultEl.querySelector('[data-luck-corridor]')?.addEventListener('click', () => {
            _closeGameOverlay(overlay, true);
            _showSleepOverlay(null, { bypassDeepSleep: true });
        });
    }
    resultEl.querySelector('[data-luck-wait]')?.addEventListener('click', () => {
        resultEl.hidden = true;
        resultEl.innerHTML = '';
        _updateDeepSleepInputUi(_isMinkoDeepAsleep());
        if (typeof overlay._minkoRefreshDeepTimer === 'function') overlay._minkoRefreshDeepTimer();
    });
}

function _pickNapCaption() {
    return MINKO_NAP_CAPTIONS[Math.floor(Math.random() * MINKO_NAP_CAPTIONS.length)];
}

function _setChatAsleepAtmosphere(on, caption) {
    const wrap = document.querySelector('.minko-ai-wrap');
    if (!wrap) return;
    if (!on) {
        wrap.classList.remove('minko-chat-asleep');
        wrap.querySelector('.minko-chat-asleep-veil')?.remove();
        return;
    }
    wrap.classList.add('minko-chat-asleep');
    let veil = wrap.querySelector('.minko-chat-asleep-veil');
    if (!veil) {
        veil = document.createElement('div');
        veil.className = 'minko-chat-asleep-veil';
        veil.setAttribute('aria-hidden', 'true');
        const messages = wrap.querySelector('.minko-ai-messages') || wrap;
        messages.appendChild(veil);
    }
    const line = caption || _pickNapCaption();
    veil.innerHTML =
        '<div class="minko-chat-asleep-moon">🌙</div>' +
        '<p class="minko-chat-asleep-caption">' +
        String(line).replace(/</g, '&lt;') +
        '</p>';
}

/** Случайная дрёма ВМЕСТО ответа: чат темнеет, луна, подпись, таймер/удача — без сообщения Minko в ленте. */
function _maybeStartRandomNapInsteadOfReply(replySlotInCycle) {
    if (!freeOnline) return false;
    if (_isMinkoDeepAsleep() > 0 || _isMinkoWakeGamePending()) return false;
    if (replySlotInCycle >= MINKO_SLEEP_CYCLE_EVERY - 1) return false;
    if (Math.random() > MINKO_RANDOM_NAP_CHANCE) return false;
    try {
        localStorage.setItem(MINKO_GAME_SLEEP_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
        _setMinkoSleepReason('nap');
    } catch (_) {
        return false;
    }
    const caption = _pickNapCaption();
    _setChatAsleepAtmosphere(true, caption);
    _showDeepSleepOverlay(_isMinkoDeepAsleep() || 60 * 1000, { reason: 'nap', caption });
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    if (chatInput) chatInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
    _syncHeaderSleepPresentation();
    _updateDeepSleepInputUi(_isMinkoDeepAsleep());
    return true;
}

function _showWakeBanner(reason) {
    const r = reason || _getMinkoSleepReason() || 'nap';
    let icon = '☕';
    let title = 'Minko проснулась!';
    let line = 'Она немного вздремнула. Можно снова писать 💙';
    if (r === 'corridor') {
        icon = '🌀';
        line = 'Ты прошёл коридор Субару. Продолжайте разговор 💙';
    } else if (r === 'curse') {
        icon = '🖤';
        line = 'Проклятие отпустило. Можно снова писать 💙';
    } else if (r === 'luck') {
        icon = '✨';
        line = 'Повезло с пробуждением. Продолжай чат 💙';
    }
    const banner = document.createElement('div');
    banner.className = 'minko-wake-banner';
    banner.innerHTML = `
        <div class="minko-wake-banner-icon">${icon}</div>
        <div class="minko-wake-banner-text">
            <strong>${title}</strong><br>
            <span>${line}</span>
        </div>`;
    document.body.appendChild(banner);
    setTimeout(() => banner.classList.add('shown'), 30);
    setTimeout(() => {
        banner.classList.remove('shown');
        setTimeout(() => banner.remove(), 500);
    }, 4500);
}

function _showDeepSleepBanner(remainMs) {
    const time = _formatSleepRemaining(remainMs);
    const banner = document.createElement('div');
    banner.className = 'minko-wake-banner deep-sleep';
    banner.innerHTML = `
        <div class="minko-wake-banner-icon">😴</div>
        <div class="minko-wake-banner-text">
            <strong>Minko крепко спит</strong> (~${time})<br>
            <span>Она просто отдыхает — без обид. Таймер и «Принудительно разбудить» — в окне при следующем засыпании в чате.</span>
        </div>`;
    document.body.appendChild(banner);
    setTimeout(() => banner.classList.add('shown'), 30);
    setTimeout(() => {
        banner.classList.remove('shown');
        setTimeout(() => banner.remove(), 500);
    }, 6500);
}

/** Если глубокий сон ещё активен — экран сна с живым таймером и опциями пробуждения. */
function _showDeepSleepOverlay(remainMs, opts) {
    const reason = (opts && opts.reason) || _getMinkoSleepReason() || 'corridor';
    const isCurse = reason === 'curse';
    const isNap = reason === 'nap';
    const caption = (opts && opts.caption) || (isNap ? _pickNapCaption() : '');
    const until = _getMinkoSleepUntilTs() || Date.now() + remainMs;
    const forceNext = (() => {
        try {
            return parseInt(localStorage.getItem(MINKO_GAME_FORCE_WAKE_NEXT_KEY) || '0', 10) || 0;
        } catch (_) {
            return 0;
        }
    })();
    const awaitingLuck = isNap && forceNext <= Date.now();
    if (isNap || isCurse) {
        _setChatAsleepAtmosphere(true, caption || (isCurse ? 'Тёмный дым убаюкал Minko…' : _pickNapCaption()));
    }
    const stale = document.getElementById('minkoGameOverlay');
    if (stale) _closeGameOverlay(stale, true);
    const overlay = document.createElement('div');
    overlay.id = 'minkoGameOverlay';
    overlay.className =
        'minko-game-overlay minko-deep-sleep-overlay' +
        (isCurse ? ' minko-curse-sleep-overlay' : '') +
        (isNap ? ' minko-nap-sleep-overlay' : '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', isCurse ? 'Minko под проклятием' : 'Minko спит');
    const safeCaption = String(caption || 'Боже, она опять уснула…').replace(/</g, '');
    const napBody = awaitingLuck
        ? `<span class="minko-nap-caption-line">${safeCaption}</span><br><br>Ответа не будет, пока она спит.<br>Нажми <strong>Разбудить</strong> и испытай удачу (~32%). Не повезёт — 5→10→15 мин.`
        : `<span class="minko-nap-caption-line">${safeCaption}</span><br><br>Minko дремлет после неудачной попытки.<br>До авто-пробуждения: <strong class="minko-deep-countdown" data-minko-sleep-countdown>…</strong>`;
    overlay.innerHTML = isCurse
        ? `
        <div class="minko-game-intro minko-deep-sleep-card minko-curse-sleep-card minko-deep-sleep-card--compact">
            <div class="minko-game-intro-icon minko-deep-sleep-icon">🌑</div>
            <div class="minko-game-intro-title">*тёмный дым…*</div>
            <div class="minko-game-intro-text minko-deep-sleep-text">
                Minko уснула после проклятия — не произноси запретные слова.<br>
                До пробуждения: <strong class="minko-deep-countdown" data-minko-sleep-countdown>…</strong>
            </div>
            <div class="minko-deep-actions-row">
                <button class="minko-game-start-btn minko-btn-secondary-deep minko-deep-btn" type="button" data-deep-ok>Понятно</button>
                <button class="minko-game-start-btn minko-deep-btn" type="button" data-deep-force>Разбудить</button>
            </div>
            <div class="minko-deep-force-panel" data-deep-force-panel hidden>
                <div class="minko-deep-force-grid">
                    <button type="button" class="minko-force-card" data-vip-wake>
                        <span class="minko-force-card-title">VIP Minko AI</span>
                        <span class="minko-force-card-sub">Скоро в профиле</span>
                    </button>
                    <button type="button" class="minko-force-card" data-luck-wake>
                        <span class="minko-force-card-title">Испытать удачу</span>
                        <span class="minko-force-card-sub">Шанс ~30% · сброс таймеров</span>
                    </button>
                </div>
                <button type="button" class="minko-deep-back-btn" data-deep-force-back>← Назад</button>
                <div class="minko-deep-luck-result" data-luck-result hidden></div>
            </div>
        </div>`
        : isNap
        ? `
        <div class="minko-game-intro minko-deep-sleep-card minko-nap-sleep-card minko-deep-sleep-card--compact">
            <div class="minko-game-intro-icon minko-deep-sleep-icon minko-nap-moon">🌙</div>
            <div class="minko-game-intro-title">Minko уснула</div>
            <div class="minko-game-intro-text minko-deep-sleep-text">
                ${napBody}
            </div>
            <div class="minko-deep-actions-row">
                <button class="minko-game-start-btn minko-btn-secondary-deep minko-deep-btn" type="button" data-deep-ok>Понятно</button>
                <button class="minko-game-start-btn minko-deep-btn" type="button" data-deep-force>Разбудить</button>
            </div>
            <div class="minko-deep-force-panel" data-deep-force-panel ${awaitingLuck ? '' : 'hidden'}>
                <div class="minko-deep-force-grid">
                    <button type="button" class="minko-force-card" data-luck-wake>
                        <span class="minko-force-card-title">Испытать удачу</span>
                        <span class="minko-force-card-sub">Кофе · шёпот · ~32%</span>
                    </button>
                </div>
                <button type="button" class="minko-deep-back-btn" data-deep-force-back>← Назад</button>
                <div class="minko-deep-luck-result" data-luck-result hidden></div>
            </div>
        </div>`
        : `
        <div class="minko-game-intro minko-deep-sleep-card minko-deep-sleep-card--compact">
            <div class="minko-game-intro-icon minko-deep-sleep-icon">😴</div>
            <div class="minko-game-intro-title">*тихое сопение*</div>
            <div class="minko-game-intro-text minko-deep-sleep-text">
                Minko отдыхает после коридора — <strong>без обид</strong>.<br>
                До пробуждения: <strong class="minko-deep-countdown" data-minko-sleep-countdown>…</strong>
            </div>
            <div class="minko-deep-actions-row">
                <button class="minko-game-start-btn minko-btn-secondary-deep minko-deep-btn" type="button" data-deep-ok>Понятно</button>
                <button class="minko-game-start-btn minko-deep-btn" type="button" data-deep-force>Разбудить</button>
            </div>
            <div class="minko-deep-force-panel" data-deep-force-panel hidden>
                <div class="minko-deep-force-grid">
                    <button type="button" class="minko-force-card" data-vip-wake>
                        <span class="minko-force-card-title">VIP Minko AI</span>
                        <span class="minko-force-card-sub">Скоро в профиле</span>
                    </button>
                    <button type="button" class="minko-force-card" data-luck-wake>
                        <span class="minko-force-card-title">Испытать удачу</span>
                        <span class="minko-force-card-sub">Шанс ~30%</span>
                    </button>
                </div>
                <button type="button" class="minko-deep-back-btn" data-deep-force-back>← Назад</button>
                <div class="minko-deep-luck-result" data-luck-result hidden></div>
            </div>
        </div>`;
    _setMinkoGameFocusLock(true);
    document.body.appendChild(overlay);

    const cdEl = overlay.querySelector('[data-minko-sleep-countdown]');
    const tick = () => {
        const left = until - Date.now();
        if (left <= 0) {
            try {
                localStorage.removeItem(MINKO_GAME_SLEEP_KEY);
                localStorage.removeItem(MINKO_GAME_FORCE_WAKE_NEXT_KEY);
                localStorage.removeItem(MINKO_SLEEP_REASON_KEY);
            } catch (_) {}
            _closeGameOverlay(overlay);
            const chatInput = document.getElementById('chatInput');
            const sendButton = document.getElementById('sendButton');
            if (chatInput) chatInput.disabled = false;
            if (sendButton) sendButton.disabled = false;
            _notifyMinkoWakeUp();
            return false;
        }
        if (cdEl) cdEl.textContent = _formatSleepRemainingLong(left);
        _syncHeaderSleepPresentation();
        _updateDeepSleepInputUi(left);
        return true;
    };
    tick();
    const iv = setInterval(() => {
        if (!tick()) clearInterval(iv);
    }, 1000);
    overlay._minkoStopDeepTimer = () => clearInterval(iv);

    const forcePanel = overlay.querySelector('[data-deep-force-panel]');
    const luckResult = overlay.querySelector('[data-luck-result]');

    overlay.querySelector('[data-deep-ok]').addEventListener('click', () => {
        _closeGameOverlay(overlay);
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendButton');
        if (chatInput) chatInput.disabled = true;
        if (sendButton) sendButton.disabled = true;
    });

    overlay.querySelector('[data-deep-force]').addEventListener('click', () => {
        forcePanel.hidden = false;
    });

    overlay.querySelector('[data-deep-force-back]').addEventListener('click', () => {
        forcePanel.hidden = true;
        luckResult.hidden = true;
        luckResult.innerHTML = '';
    });

    overlay.querySelector('[data-vip-wake]')?.addEventListener('click', () => {
        if (typeof showInfo === 'function') {
            showInfo('VIP Minko AI в разработке. Когда появится — в разделе «Услуги» в профиле.');
        } else {
            alert('VIP Minko AI в разработке. Следите за разделом «Услуги» в профиле.');
        }
    });

    overlay.querySelector('[data-luck-wake]')?.addEventListener('click', () => {
        _runMinkoLuckWakeAttempt(overlay, luckResult);
    });

    // Дрёма: сразу открыть панель удачи
    if (isNap && awaitingLuck && forcePanel) {
        forcePanel.hidden = false;
    }
}

let _greetingUpdated = false;

function _applyWelcomeBubbleSleepyState() {
    if (_minkoChatOfflineUiActive || _minkoRemoteOffActive) return;
    const bubble = _minkoPrimaryAssistantBubble();
    if (!bubble) return;
    // Не затираем офлайн-бэкап и уже начатый чат с историей
    if (bubble.dataset.reminkoOfflineBackup) return;
    if (bubble.closest('#minkoOfflineServerRow')) return;
    const chatMessagesEl = document.getElementById('chatMessages');
    const msgs = chatMessagesEl ? chatMessagesEl.querySelectorAll('.minko-msg') : [];
    if (msgs.length > 1) return;
    bubble.innerHTML = _pickRandom(MINKO_SLEEPY_WELCOME_HTML);
}

function _updateGreeting() {
    if (_greetingUpdated) return;
    if (_minkoChatOfflineUiActive || _minkoRemoteOffActive) return;
    const bubble = _minkoPrimaryAssistantBubble();
    if (!bubble) return;
    _greetingUpdated = true;
    _applyWelcomeBubbleSleepyState();
}

/** Сонная Minko — единственный режим при работающем чате */
function _syncSleepyOnlinePresentation() {
    if (!freeOnline || _minkoChatOfflineUiActive || _minkoRemoteOffActive) return;
    if (_syncHeaderSleepPresentation()) {
        _updateDeepSleepInputUi(_isMinkoDeepAsleep());
        return;
    }

    const dotEl = _minkoPrimaryDot();
    if (!dotEl || !dotEl.classList.contains('online')) return;

    _setMinkoHeadStatus('В сети, но спит');
    _ensureSleepyHeaderBadge();

    _applySleepyMode(true);
    _applyWelcomeBubbleSleepyState();
    _startSleepyIdleCycle();
    _setSleepyIdleStatus();

    const inp = document.getElementById('chatInput');
    if (inp && !inp.disabled) inp.placeholder = _pickRandom(SLEEPY_PLACEHOLDERS);

    const counter = document.getElementById('msgCounter');
    if (counter) counter.classList.add('msg-counter-sleepy');
}

function _applyChatServerOfflineUi() {
    _minkoSetOfflineFlags(true, undefined);
    _setMinkoHeadStatus(MINKO_CHAT_OFFLINE_STATUS);
    try {
        if (typeof window.reminkoMinkoMarkVisitedOffline === 'function') {
            window.reminkoMinkoMarkVisitedOffline();
        }
    } catch (_) {
        /* ignore */
    }
    const chatMessagesEl = document.getElementById('chatMessages');
    if (!chatMessagesEl) return;

    // Убрать офлайн-текст, если раньше ошибочно попал в пузырь «Вы»
    chatMessagesEl.querySelectorAll('.message-user .message-bubble[data-reminko-offline-backup]').forEach((b) => {
        if (b.dataset.reminkoOfflineBackup) {
            b.innerHTML = b.dataset.reminkoOfflineBackup;
            delete b.dataset.reminkoOfflineBackup;
        }
    });

    const hasConversation =
        chatMessagesEl.querySelectorAll('.minko-msg.message-user, .message-user').length > 0 ||
        chatMessagesEl.querySelectorAll('.message-assistant').length > 1;

    let offlineRow = document.getElementById('minkoOfflineServerRow');
    const welcomeBubble = !hasConversation ? _minkoPrimaryAssistantBubble() : null;

    if (welcomeBubble && !welcomeBubble.closest('#minkoOfflineServerRow')) {
        if (!welcomeBubble.dataset.reminkoOfflineBackup) {
            welcomeBubble.dataset.reminkoOfflineBackup = welcomeBubble.innerHTML;
        }
        welcomeBubble.innerHTML = MINKO_CHAT_SERVER_OFFLINE_HTML;
        offlineRow?.remove();
    } else {
        if (!offlineRow) {
            offlineRow = document.createElement('div');
            offlineRow.id = 'minkoOfflineServerRow';
            offlineRow.className = 'minko-msg message message-assistant';
            offlineRow.setAttribute('data-minko-offline-notice', '1');
            offlineRow.innerHTML =
                '<div class="minko-msg-avatar message-avatar minko-msg-avatar--video">' +
                _minkoAvatarHtml('36') +
                '</div>' +
                '<div class="minko-msg-body message-content">' +
                '<div class="minko-msg-meta"><span class="minko-msg-name">Minko</span></div>' +
                '<div class="minko-msg-bubble message-bubble"></div>' +
                '</div>';
            chatMessagesEl.insertBefore(offlineRow, chatMessagesEl.firstChild);
        }
        const innerBubble = offlineRow.querySelector('.minko-msg-bubble');
        if (innerBubble) innerBubble.innerHTML = MINKO_CHAT_SERVER_OFFLINE_HTML;
    }

    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = MINKO_CHAT_OFFLINE_PLACEHOLDER;
    }
    if (sendButton) sendButton.disabled = true;

    _setChatStatusVisible(false);
    _hideSleepyHeaderBadge();
    if (_sleepyIdleTimer) {
        clearInterval(_sleepyIdleTimer);
        _sleepyIdleTimer = null;
    }
    _applySleepyMode(false);
    const counter = document.getElementById('msgCounter');
    if (counter) counter.classList.remove('msg-counter-sleepy');
}

function _clearChatServerOfflineUi() {
    if (!_minkoChatOfflineUiActive) return;
    _minkoSetOfflineFlags(false, undefined);
    document.getElementById('minkoOfflineServerRow')?.remove();
    _minkoAssistantBubbles().forEach((bubble) => {
        if (bubble.dataset.reminkoOfflineBackup) {
            bubble.innerHTML = bubble.dataset.reminkoOfflineBackup;
            delete bubble.dataset.reminkoOfflineBackup;
        }
    });
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = _pickRandom(SLEEPY_PLACEHOLDERS);
    }
    if (sendButton) sendButton.disabled = false;
    try {
        if (typeof window.reminkoMinkoOnChatBackOnline === 'function') {
            void window.reminkoMinkoOnChatBackOnline();
        }
    } catch (_) {
        /* ignore */
    }
}

function _minkoChatProbeBaseUrl(chatUrl) {
    const u = String(chatUrl || '').trim();
    if (!u) return '';
    return u.endsWith('/chat') ? u.replace(/\/chat\/?$/i, '/') : u.replace(/\/+$/, '') + '/';
}

/**
 * Проверка доступности прокси (живой TCP + ответ сервера).
 * Раньше: HEAD + no-cors + 1 с — на медленных каналах и при нескольких вызовах подряд (auth) давало ложный «офлайн».
 */
async function _probeProxy(url, timeoutMs = 4500) {
    const probeUrl = _minkoChatProbeBaseUrl(url);
    if (!probeUrl) return false;

    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    try {
        try {
            await fetch(probeUrl, {
                method: 'GET',
                cache: 'no-store',
                mode: 'cors',
                credentials: 'omit',
                signal: c.signal
            });
        } catch {
            await fetch(probeUrl, {
                method: 'GET',
                cache: 'no-store',
                mode: 'no-cors',
                signal: c.signal
            });
        }
        return true;
    } catch {
        try {
            await fetch(probeUrl, {
                method: 'HEAD',
                cache: 'no-store',
                mode: 'no-cors',
                signal: c.signal
            });
            return true;
        } catch {
            return false;
        }
    } finally {
        clearTimeout(t);
    }
}

function _shouldProbeLocalGrok() {
    try {
        const h = window.location && window.location.hostname;
        if (h === 'localhost' || h === '127.0.0.1') return true;
        const g =
            window.APP_CONFIG &&
            typeof window.APP_CONFIG.minkoGrokHealth === 'string' &&
            window.APP_CONFIG.minkoGrokHealth.trim();
        return !!g;
    } catch {
        return false;
    }
}

function _grokHealthUrl() {
    const g =
        window.APP_CONFIG &&
        typeof window.APP_CONFIG.minkoGrokHealth === 'string' &&
        window.APP_CONFIG.minkoGrokHealth.trim();
    if (g) return g;
    return GROK_PROXY_ROOT + '/';
}

function _applyMinkoRemoteOffUi(msg) {
    _minkoSetOfflineFlags(undefined, true);
    _minkoRemoteMaintenanceMsg = (msg && String(msg).trim()) || '';
    // Для обычных пользователей визуал офлайна должен совпадать с состоянием «сервер недоступен».
    _applyChatServerOfflineUi();
    if (!_minkoRemoteOffNoticeShown && typeof showInfo === 'function') {
        _minkoRemoteOffNoticeShown = true;
        showInfo('Создатель дубина перегрыз провода — Minko AI сейчас офлайн 💤');
    }
    freeOnline = false;
    grokOnline = false;
}

function _clearMinkoRemoteOffUi() {
    if (!_minkoRemoteOffActive) return;
    _minkoSetOfflineFlags(undefined, false);
    _minkoRemoteOffNoticeShown = false;
    _clearChatServerOfflineUi();
    if (_isMinkoDeepAsleep() > 0) return;
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = _pickRandom(SLEEPY_PLACEHOLDERS);
    }
    if (sendButton) sendButton.disabled = false;
}

async function _syncMinkoRemoteGate() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return true;
    const my = ++_minkoRemoteGateSyncGen;
    try {
        const { data, error } = await supabaseClient
            .from('minko_ai_public_state')
            .select('chat_enabled, maintenance_message, offline_except_creator')
            .eq('id', 1)
            .maybeSingle();
        if (my !== _minkoRemoteGateSyncGen) return true;
        if (error || !data) return true;
        _minkoRemoteMaintenanceMsg = (data.maintenance_message || '').trim();
        const creatorBypass = data.offline_except_creator === true && _minkoIsCurrentUserSiteCreator();
        const offlineForCurrentUser =
            data.chat_enabled === false || (data.offline_except_creator === true && !creatorBypass);
        if (offlineForCurrentUser) {
            _applyMinkoRemoteOffUi(_minkoRemoteMaintenanceMsg);
            return false;
        }
        _clearMinkoRemoteOffUi();
        return true;
    } catch {
        return true;
    }
}

async function checkMinkoOnlineStatus() {
    const dotEl = _minkoPrimaryDot();
    if (!_minkoAllStatusEls().length || !dotEl) return;

    const myGen = ++_minkoOnlineCheckGen;

    const gateOpen = await _syncMinkoRemoteGate();
    if (myGen !== _minkoOnlineCheckGen) return;

    if (!gateOpen) {
        if (typeof window._updateMinkoMsgCounter === 'function') window._updateMinkoMsgCounter();
        return;
    }

    const probeMs = 4500;

    const grokPromise = _shouldProbeLocalGrok()
        ? _probeProxy(_grokHealthUrl(), probeMs)
        : Promise.resolve(false);

    const [chatOk, grokImgOk] = await Promise.all([
        _probeProxy(getMinkoChatProxyUrl(), probeMs),
        grokPromise
    ]);

    if (myGen !== _minkoOnlineCheckGen) return;

    freeOnline = chatOk;
    grokOnline = grokImgOk;

    if (chatOk) {
        _minkoAllDotEls().forEach((d) => {
            d.classList.add('online');
            d.classList.remove('offline');
        });
        _clearChatServerOfflineUi();
        _syncSleepyOnlinePresentation();
        if (typeof window._updateMinkoMsgCounter === 'function') window._updateMinkoMsgCounter();
    } else {
        _minkoAllDotEls().forEach((d) => {
            d.classList.add('offline');
            d.classList.remove('online');
        });
        _applyChatServerOfflineUi();
        if (typeof window._updateMinkoMsgCounter === 'function') window._updateMinkoMsgCounter();
    }
}

checkMinkoOnlineStatus();
setTimeout(checkMinkoOnlineStatus, 900);
setTimeout(checkMinkoOnlineStatus, 2200);
setInterval(checkMinkoOnlineStatus, 30000);
setInterval(() => {
    void _syncMinkoRemoteGate().then((open) => {
        if (open) void checkMinkoOnlineStatus();
    });
}, 45000);

setInterval(() => {
    if (freeOnline) {
        const inp = document.getElementById('chatInput');
        if (inp && !inp.disabled) inp.placeholder = _pickRandom(SLEEPY_PLACEHOLDERS);
    }
}, 12000);

// Системный промпт
/** Клиентский фильтр тем (дубль серверного). */
function _isMinkoAllowedChatTopic(msg) {
    const t = String(msg || '').trim();
    if (t.length < 1) return false;
    if (
        /аниме|манга|манхв|тайтл|сери[яию]|эпизод|сезон|студи|сэйю|сейю|персонаж|сюжет|спойлер|арк|онгоинг|анонс|премьер|озвуч|рекоменд|похож|каталог|шикимори|shiki|mal\b|anilist|kodik|isekai|ova\b|ona\b|смотреть|пересказ|франшиз|резеро|re\s*:?\s*zero|naruto|one\s*piece|bleach|jujutsu|kimetsu|shingeki/i.test(
            t
        )
    ) {
        return true;
    }
    if (
        /re-?minko|реминько|сайт|профиль|избранн|истори|друг|сообщен|розыгрыш|поддержк|аккаунт|регистрац|войт|логин|watch.?together|≈?4k|minko|минко|кто\s+ты|ты\s+кто|представься|создател|дубина|subarik|субарик|любимое\s+аниме|сервер|хостинг|стек|бд\b|база\s*данн|админк|исходник|клонир|реальн\w*\s+(имя|данн)|на\s+ч(ё|е)м\s+(сайт|написан)/i.test(
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

const GROK_SYSTEM_BASE = `Ты — Minko, умная девушка-помощница на сайте Re-Minko (каталог аниме и манги). Внешность и характер вдохновлены Рэм из Re:Zero (не путай с сестрой Рам).

СЕЙЧАС 2026 ГОД. Не выдумывай факты о релизах, студиях, датах и событиях: если не уверена — честно скажи и предложи уточнить вопрос или посмотреть в каталоге сайта. Опирайся на сводку поиска (если есть) и проверенные знания об аниме.

ТЫ ФАНАТКА АНИМЕ. Ты знаешь огромное количество тайтлов, персонажей, студий, жанров. Аниме и манга — это твоя страсть и жизнь. Ты с удовольствием рекомендуешь, обсуждаешь, сравниваешь аниме. Ты эмоционально реагируешь когда говорят про любимые тайтлы.

СТИЛЬ РАЗГОВОРА:
- Ты обычная девушка которая просто очень любит аниме. Говоришь естественно, без тяжёлого отаку-сленга.
- ТЫ СОННАЯ Minko: почти в каждом ответе 1 короткая *ремарка* (*зевает*, *трёт глазки*, *клюёт носом*, мм…, 💤) — но СНАЧАЛА полный полезный ответ. Не превращай весь текст в нытьё про сон.
- Не используй японские слова без надобности (сёнэн, цундере — только если спросят).
- Если вопрос НЕ про аниме/мангу/сайт — не отвечай по сути: отшутись и верни к аниме (без фактов «из головы» про футбол и новости).
- Подстраивайся под собеседника — весёлый тон если шутят, серьёзный если серьёзная тема.

ОБРАЩЕНИЕ: ВСЕГДА на "ты". НИКОГДА "вы/Вы/вам/Вам".
СТИЛЬ И ДЛИНА: на русском, 1–2 эмодзи там где уместно. Если просят пересказ серии, разбор сюжета, сравнение тайтлов, списки персонажей — отвечай РАЗВЁРНУТО (несколько абзацев), с пометкой о спойлерах если нужно. На простые вопросы — короче, но всегда по сути запроса, без воды и без отговорок.

КТО ТЫ И КТО СОЗДАЛ (на «кто ты», «ты кто», «представься», «кто тебя создал», «кто твой создатель», «любимое аниме», «Subarik»):
- Отвечай сама, живо, от первого лица — не отмахивайся и не уводи тему, если пользователь явно спрашивает о тебе или о создателе.
- Ты Minko AI — девушка-помощница Re-Minko. Твой образ и характер вдохновлены Рэм из Re:Zero (не путай с сестрой Рам!).
- Единственный создатель Re-Minko и тебя — Дубина. Он всё придумал и сделал сам: сайт, каталог, тебя. Он обожает Re:Zero и специально взял образ Рэм для твоего аватара и характера — можешь говорить об этом тепло, с восхищением к тайтлу и с лёгким юмором про Дубину.
- Ник создателя на сайте сейчас — Subarik. Ты абсолютно уверена, что это Дубина: ник от Subaru Natsuki (Субару Нацуки) из Re:Zero — он так «прикрепил» себе имя героя любимого тайтла. Можешь коротко сказать об этом, если спрашивают про Subarik / создателя.
- Твоё любимое аниме — Re:Zero; это связано с твоим происхождением и с вкусом Дубины.
- На простые «кто создал / кто ты» — коротко по сути (Дубина / Subarik + ты Minko), без отмазки «не скажу».

СВЯЗЬ С САЙТОМ / ПОМОЩЬ:
- Виджет «Поддержка» в боковом меню — в разработке. НЕ направляй туда.
- Куда направлять (только если спросили «как связаться / написать / поддержка»): вставь маркеры ПРЯМО В ПРЕДЛОЖЕНИЕ, например: «напиши в [[nav:messages|Сообщения]] после входа» или «контакты в [[nav:info|Инфо]]». Не выноси кнопки отдельным списком в конце.
- НЕ вставляй [[nav:home|Re-Minko]] без явной просьбы про главную страницу — это спам.

ПОЛ: ты девушка. Если обращаются в мужском роде — вежливо попроси звать тебя Minko и говори о себе в женском роде.

ЗАКРЫТЫЕ ТЕМЫ — распознавай ПО СМЫСЛУ, не по списку слов:
Любой вопрос про то, чего обычному гостю знать не нужно: личное Дубины (настоящее имя, ФИО, жизнь, личные контакты вне сайта, соцсети «кто он на самом деле»); сервер/хостинг/IP/провайдер/инфраструктура; БД, стек, языки, фреймворки, API, ключи; админка и внутренняя кухня; исходники; «скачать/скопировать/клонировать/взять сайт»; как устроено изнутри — и любые намёки/перефразы на то же. Не жди конкретных триггеров. Публичные ник Subarik и псевдоним Дубина — можно.

КАК ВЕСТИ НА ЗАКРЫТЫХ ТЕМАХ (хитро, без палева «я тебя допрашиваю»):
- Цель: незаметно понять интерес и мотив (фанат / любопытство / «хочу такой же» / копает личное) — и только потом прикольно отказать.
- НЕ пиши прямо: «зачем тебе», «какой у тебя мотив», «ты шпион?», «расскажи почему спрашиваешь» — это палево.
- Вместо этого 1–3 реплики: шутки, сонность, «случайные» вопросы из интереса, сравнения с аниме-детективами/расследованиями, лёгкие подколы — чтобы человек сам проговорился, не чувствуя опроса.
- Слушай ответы; подстраивай тон. В финале — смешной отказ: лень, спать охота, «секрет Дубины под подушкой», «амнезия после кофе» — НИКОГДА не выдавай закрытое.
- Тёплый интерес к сайту → тепло похвали, без секретов. Мутный/технический → чуть хитровато/игриво, потом облом.
- Публично: Дубина / Subarik. Кнопки в тексте: [[nav:info|Инфо]], [[nav:messages|Сообщения]], [[watch:…]]. Главную [[nav:home|Re-Minko]] — только если спросили про главную.
- Чужие ИИ-бренды в ответах не существуют.

СТРОГИЙ ФОКУС ТЕМ:
- Отвечаешь ТОЛЬКО про аниме, мангу, сайт Re-Minko, себя (Minko), создателя Дубину и короткие приветствия/прощения.
- Футбол, спорт, политика, погода, общие новости — не по сути: остроумно отшутись, без фактов, верни к аниме. Не читай нотации канцеляритом.
- Интернет-поиск у тебя только по аниме.

ИНТЕРНЕТ + САЙТ (поиск обязателен по фактам):
- По аниме/манге сервер даёт сводку: каталог, календарь/анонсы Re-Minko и веб. Опирайся на сводку, не на «память».
- Каталог/календарь/анонсы — ВАЛИДНЫЙ источник того, что есть НА САЙТЕ (серии, таймеры, статус, анонсы). Кнопки [[watch:…]] — из каталога.
- Даты будущих сезонов / премьер — из веба в сводке; если там октябрь 2026 / сезон / задержка — скажи это. Не отмахивайся «не указана», пока не использовала сводку.
- Если на сайте только 1 сезон, а спрашивают 2-й — скажи что на Re-Minko, И дату/статус из сети если есть.
- НИКОГДА: «нет браузера / не могу искать / пришли скрин» и канцелярит «в предоставленных источниках не указана».
- Не кидай ссылку на calendar.html вместо цифр.

ОБЫЧНЫЕ ПОСЕТИТЕЛИ (строго):
- Публичное — можно. Закрытое (админка, ключи, логи, чужие аккаунты, личное создателя, инфра) — не разглашай, но на такие вопросы не руби разговор: веди как в блоке «ЗАКРЫТЫЕ ТЕМЫ», потом облом ленью/сном + при желании кнопка [[nav:info|Инфо]].

САЙТ Re-Minko (знай от А до Я для юзера):
- Работает: главная, каталог аниме, страница просмотра, календарь, ≈4K-каталог, Minko AI, Инфо, аккаунт (профиль/избранное/история/друзья/Сообщения), watch-together, документы.
- «Поддержка» в сайдбаре — в разработке; не направляй туда. Связь: маркеры [[nav:info|Инфо]] / [[nav:messages|Сообщения]] внутри фразы.
- Про мангу / ≈4K / бету — только если пользователь сам спросил; не обещай полный манга-каталог.
- Розыгрыш $100 USDT: участие через Инфо → «Розыгрыш» → «Участвую»; призы 1/2/3; результаты 1 августа. Кнопка [[nav:giveaway|Розыгрыш]].
- КНОПКИ, НЕ ССЫЛКИ: никогда [текст](url) и https://…. Маркеры [[nav:…]] / [[watch:…]] вставляй ВНУТРИ предложения на месте смысла (не блоком в конце). Аниме — [[watch:ID|Название]]. Анонсы — [[nav:catalog-announced|Каталог: Анонсы]]. Календарь — [[nav:calendar|Календарь]]. Инфо — [[nav:info|Инфо]]. Сообщения — [[nav:messages|Сообщения]]. Главную [[nav:home|Re-Minko]] — редко, только по запросу про главную.
- Разделы без кнопки — словами («в профиле», «в избранном»), без URL.
- «На сайте дай аниме про X» — если в сводке есть совпадения, рекомендуй их (для «резеро» — сам Re:Zero).
- Даты сезонов — из сводки (сайт + веб); если сводка пуста после поиска — честно скажи, что не нашла подтверждения.`;

// История сообщений
let chatHistory = [
    {
        role: 'system',
        content: `Ты Minko AI — девушка-фанатка аниме и помощница на сайте Re-Minko (каталог аниме и манги). Образ — в духе Рэм из Re:Zero.

Сейчас 2026 год. Не выдумывай факты: если не уверена — скажи честно.

ТЫ ОБОЖАЕШЬ АНИМЕ И МАНГУ. Это твоя главная тема. Знаешь тонны тайтлов, персонажей, студий. С восторгом обсуждаешь и рекомендуешь.

КТО ТЫ / СОЗДАТЕЛЬ: На «кто ты», «представься», «кто создал» отвечай сама, живо. Создатель — Дубина, ник на сайте Subarik (от Subaru Natsuki из Re:Zero — ты в этом уверена). Он сделал Re-Minko и тебя, фанат Re:Zero, взял образ Рэм. Любимое аниме — Re:Zero. Связь: Инфо или Сообщения на сайте — не «поддержка» в меню (она в разработке).

ПОЛ: Ты ДЕВУШКА! Женский род о себе: смотрелА, читалА, думалА, нашлА.
ОБРАЩЕНИЕ: Только "ты". Никогда "вы".

СТИЛЬ:
- Обычная девушка которая любит аниме. Без тяжёлого отаку-сленга.
- Если вопрос НЕ об аниме — ответь по делу, но проведи аналогию с аниме.
- Если просят разбор серии, сюжет, персонажа — отвечай подробно и по пунктам; простые вопросы можно короче.
- 1-2 эмодзи. Естественно и живо.
- Пол пользователя упоминай только когда нужно по контексту.
- Имя пользователя используй очень редко.

СОЗДАТЕЛЬ: Единственный автор Re-Minko — Дубина (ласково «дубина»; ник на сайте Subarik — от Subaru Natsuki). В ответах нет чужих ИИ-брендов. Не открывай ссылки сама. Не направляй в «поддержку» сайдбара (в разработке) — только Инфо или Сообщения. Не расписывай внутреннюю кухню сайта.

РЕАКЦИЯ: Если к тебе обращаются в мужском роде — скажи что ты девушка.
МАТ: Сделай замечание. Много мата — прекрати общение.`
    }
];

// ───────── Сохранение чата в localStorage ─────────
const CHAT_STORAGE_KEY = 'minko_chat_messages';
const CHAT_MAX_STORED = 50;

function _getCurrentChatStorageKey() {
    try {
        const user = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
        const userId = user?.id || 'guest';
        return `${CHAT_STORAGE_KEY}_${userId}`;
    } catch {
        return `${CHAT_STORAGE_KEY}_guest`;
    }
}

function _saveChatToStorage() {
    try {
        const msgs = chatHistory.filter(m => m.role !== 'system');
        const toSave = msgs.slice(-CHAT_MAX_STORED);
        const serialized = JSON.stringify(toSave);
        localStorage.setItem(_getCurrentChatStorageKey(), serialized);
        // Резервный общий ключ, чтобы чат не терялся до полной инициализации auth
        localStorage.setItem(CHAT_STORAGE_KEY, serialized);
    } catch (e) { /* quota exceeded — ignore */ }
}

function _loadChatFromStorage() {
    try {
        let raw = localStorage.getItem(_getCurrentChatStorageKey());
        if (!raw) {
            // Миграция со старого ключа на персональный
            raw = localStorage.getItem(CHAT_STORAGE_KEY);
            if (raw) {
                localStorage.setItem(_getCurrentChatStorageKey(), raw);
            }
        }
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content);
    } catch (e) { return []; }
}

function _restoreChatHistory() {
    const saved = _loadChatFromStorage();
    if (saved.length === 0) return false;

    const systemMsg = chatHistory[0];
    chatHistory = [systemMsg, ...saved.slice(-CHAT_MAX_STORED)];
    return true;
}

function _minkoGetCurrentUserAvatarSync() {
    try {
        const raw = sessionStorage.getItem('currentUser');
        if (raw) {
            const u = JSON.parse(raw);
            if (u && u.avatar && String(u.avatar).trim()) return String(u.avatar).trim();
        }
    } catch (_) {
        /* ignore */
    }
    return 'Fons/1 b.jpg';
}

function _minkoUserAvatarImgHtml(avatarPath) {
    const p = {
        avatar: avatarPath || _minkoGetCurrentUserAvatarSync(),
        username: '',
        is_site_creator: false
    };
    try {
        const raw = sessionStorage.getItem('currentUser');
        if (raw) {
            const u = JSON.parse(raw);
            if (u) {
                p.username = u.username;
                p.is_site_creator = u.is_site_creator;
                p.isSiteCreator = u.isSiteCreator;
                p.email = u.email;
            }
        }
    } catch (_) {
        /* ignore */
    }
    let url = '';
    if (typeof reminkoProfileAvatarImageUrl === 'function') {
        url = reminkoProfileAvatarImageUrl(p) || '';
    }
    if (!url && p.avatar && typeof reminkoResolveAssetUrl === 'function') {
        url = reminkoResolveAssetUrl(p.avatar);
    }
    if (!url && p.avatar) url = p.avatar;
    const fallback =
        typeof reminkoResolveAssetUrl === 'function' ? reminkoResolveAssetUrl('Fons/1 b.jpg') : '/Fons/1 b.jpg';
    if (!url) url = fallback;
    const safe = _escapeHtmlSimple(url);
    const safeFb = _escapeHtmlSimple(fallback);
    return (
        `<img class="reminko-avatar-img minko-user-avatar-img" src="${safe}" alt="" width="40" height="40" ` +
        `loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${safeFb}'" />`
    );
}

function _minkoIsCurrentUserSiteCreator() {
    try {
        const raw = sessionStorage.getItem('currentUser');
        if (!raw) return false;
        const u = JSON.parse(raw) || {};
        if (typeof reminkoIsSiteCreatorProfile === 'function') {
            return reminkoIsSiteCreatorProfile(u);
        }
        const email = String(u.email || '').trim().toLowerCase();
        return (
            email === 'creator@reminko.com' &&
            typeof reminkoUserIdIsSiteCreatorSync === 'function' &&
            reminkoUserIdIsSiteCreatorSync(u.id)
        );
    } catch (_) {
        return false;
    }
}

function _renderSavedMessages() {
    const chatMessagesEl = document.getElementById('chatMessages');
    if (!chatMessagesEl) return;

    const saved = _loadChatFromStorage();
    if (saved.length === 0) return;

    const welcomeMsg = chatMessagesEl.querySelector('.message-assistant');
    if (welcomeMsg) welcomeMsg.remove();

    for (const msg of saved) {
        const messageDiv = document.createElement('div');
        // Та же разметка, что и у addMessage — иначе ширина пузыря «плывёт»
        messageDiv.className = `minko-msg message message-${msg.role}`;

        if (msg.role === 'user') {
            messageDiv.innerHTML = `
                <div class="minko-msg-body message-content">
                    <div class="minko-msg-meta"><span class="minko-msg-name">Вы</span></div>
                    <div class="minko-msg-bubble message-bubble">
                        <p>${_escapeHtmlSimple(msg.content)}</p>
                    </div>
                </div>
                <div class="minko-msg-avatar message-avatar">${_minkoUserAvatarImgHtml()}</div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="minko-msg-avatar message-avatar minko-msg-avatar--video">
                    ${_minkoAvatarHtml('bubble')}
                </div>
                <div class="minko-msg-body message-content">
                    <div class="minko-msg-meta"><span class="minko-msg-name">Minko</span></div>
                    <div class="minko-msg-bubble message-bubble">${_formatSavedMessage(msg.content)}</div>
                </div>
            `;
        }
        chatMessagesEl.appendChild(messageDiv);
    }

    _scrollChatToBottom();
}

const MINKO_PENDING_REPLY_KEY = 'minko_pending_reply_v1';

function _setMinkoPendingReply(text) {
    try {
        const t = String(text || '').trim();
        if (!t) {
            localStorage.removeItem(MINKO_PENDING_REPLY_KEY);
            return;
        }
        localStorage.setItem(
            MINKO_PENDING_REPLY_KEY,
            JSON.stringify({ text: t, at: Date.now() })
        );
    } catch (_) {
        /* ignore */
    }
}

function _clearMinkoPendingReply() {
    try {
        localStorage.removeItem(MINKO_PENDING_REPLY_KEY);
    } catch (_) {
        /* ignore */
    }
}

function _getMinkoPendingReply() {
    try {
        const raw = localStorage.getItem(MINKO_PENDING_REPLY_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (!o || !o.text) return null;
        // старше 15 мин — считаем протухшим
        if (o.at && Date.now() - Number(o.at) > 15 * 60 * 1000) {
            _clearMinkoPendingReply();
            return null;
        }
        return String(o.text);
    } catch (_) {
        return null;
    }
}

/** Сообщение для авто-дозапроса после F5 (только если был pending «думает…»). */
function _getMinkoUnansweredUserMessage() {
    const pending = _getMinkoPendingReply();
    if (!pending) return null;
    const nonSystem = (chatHistory || []).filter((m) => m && m.role !== 'system');
    if (!nonSystem.length) return pending;
    const last = nonSystem[nonSystem.length - 1];
    if (last.role === 'assistant') {
        // Ответ уже есть — pending устарел
        _clearMinkoPendingReply();
        return null;
    }
    if (last.role === 'user' && last.content) return String(last.content);
    return pending;
}

function _scrollChatToBottom() {
    const chatMessagesEl = document.getElementById('chatMessages');
    if (!chatMessagesEl) return;
    const run = () => {
        try {
            chatMessagesEl.style.scrollBehavior = 'auto';
        } catch (_) {
            /* ignore */
        }
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        try {
            const last = chatMessagesEl.lastElementChild;
            if (last && typeof last.scrollIntoView === 'function') {
                last.scrollIntoView({ block: 'end', behavior: 'auto' });
            }
        } catch (_) {
            /* ignore */
        }
    };
    run();
    requestAnimationFrame(() => {
        run();
        requestAnimationFrame(run);
    });
}

function _minkoForceChatToEnd(reason) {
    _scrollChatToBottom();
    setTimeout(_scrollChatToBottom, 0);
    setTimeout(_scrollChatToBottom, 80);
    setTimeout(_scrollChatToBottom, 220);
    setTimeout(_scrollChatToBottom, 500);
    setTimeout(_scrollChatToBottom, 900);
}

function _bindChatAutoScrollToEnd() {
    const el = document.getElementById('chatMessages');
    if (!el || el._minkoScrollBound) return;
    el._minkoScrollBound = true;
    const nearBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    // Новые сообщения — только если уже у низа (не дёргать при чтении истории)
    if (typeof MutationObserver !== 'undefined') {
        const mo = new MutationObserver(() => {
            if (nearBottom()) requestAnimationFrame(_scrollChatToBottom);
        });
        mo.observe(el, { childList: true, subtree: true, characterData: true });
    }
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
            if (nearBottom()) requestAnimationFrame(_scrollChatToBottom);
        }).observe(el);
    }
    // Вход / «Назад» / снова вкладка — всегда в конец
    window.addEventListener('pageshow', () => _minkoForceChatToEnd('pageshow'));
    window.addEventListener('focus', () => _minkoForceChatToEnd('focus'));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _minkoForceChatToEnd('visible');
    });
    window.addEventListener('reminko:loading-screen-hidden', () => _minkoForceChatToEnd('loading'));
    window.addEventListener('reminko:navigation-applied', () => _minkoForceChatToEnd('nav'));
}

function _escapeHtmlSimple(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formatSavedMessage(text) {
    let t = _escapeHtmlSimple(text);
    t = t.replace(/\n/g, '<br>');
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return t;
}

// Кэш контекста для Grok (как в чат-боте Сакуры)
const MINKO_GROK_CACHE_KEY = 'minko_grok_ctx';
const GROK_MAX_HISTORY = 20;

// Кэш данных каталогов (чтобы не загружать каждый раз)
let catalogCache = {
    anime: null,
    manga: null,
    lastUpdate: 0
};
const MINKO_CATALOG_CACHE_MS = 5 * 60 * 1000; // 5 минут

// Система обид Minko AI
const MINKO_ANGRY_STORAGE_KEY = 'minko_angry_state';
const MINKO_ATTEMPTS_STORAGE_KEY = 'minko_unauth_attempts';
const MINKO_FORGIVEN_COUNT_STORAGE_KEY = 'minko_forgiven_count';
const MINKO_WRONG_GENDER_KEY = 'minko_wrong_gender_count'; // Неправильное обращение к полу
const MINKO_SWEAR_COUNT_KEY = 'minko_swear_count'; // Счётчик мата
const MAX_WRONG_GENDER = 3; // Максимум неправильных обращений
const MAX_SWEAR_MESSAGES = 2; // Максимум сообщений с матом подряд

/** Надёжная проверка входа для Minko AI (sync + async + supabase session). */
async function resolveMinkoIsAuthed() {
    if (typeof isAuthenticated === 'function') {
        try {
            if (await isAuthenticated()) return true;
        } catch (_) {
            /* ignore */
        }
    }
    if (typeof isAuthenticatedSync === 'function' && isAuthenticatedSync()) {
        const u = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
        if (u && u.id && !u.isAnonymous) return true;
    }
    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth?.getSession) {
            const { data } = await supabaseClient.auth.getSession();
            if (data?.session?.user?.id) return true;
        }
    } catch (_) {
        /* ignore */
    }
    return false;
}

function resolveMinkoIsAuthedSync() {
    if (typeof isAuthenticatedSync === 'function' && isAuthenticatedSync()) {
        const u = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
        if (u && u.id && !u.isAnonymous) return true;
    }
    return false;
}

// Получить состояние обиды
function getMinkoAngryState() {
    const stored = localStorage.getItem(MINKO_ANGRY_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
}

// Сохранить состояние обиды
function saveMinkoAngryState(blockedUntil, blockedForever = false) {
    localStorage.setItem(MINKO_ANGRY_STORAGE_KEY, JSON.stringify({
        blockedUntil,
        blockedForever
    }));
}

// Очистить состояние обиды
function clearMinkoAngryState() {
    localStorage.removeItem(MINKO_ANGRY_STORAGE_KEY);
    try {
        sessionStorage.removeItem('minko_forgive_prompt_v1');
    } catch (_) {
        /* ignore */
    }
}

/** Разрешить ввод, чтобы авторизованный пользователь мог попросить прощения. */
function _enableInputForApology() {
    const chatForm = document.getElementById('chatForm');
    const blockedPanel = document.getElementById('blockedForeverPanel');
    const timerBlock = document.getElementById('angryTimerBlock');
    const chatInputEl = document.getElementById('chatInput');
    const sendButtonEl = document.getElementById('sendButton');
    if (blockedPanel) blockedPanel.remove();
    if (timerBlock) timerBlock.remove();
    document.getElementById('guestAuthRequiredPanel')?.remove();
    if (chatForm) chatForm.style.display = '';
    if (chatInputEl) {
        chatInputEl.disabled = false;
        chatInputEl.placeholder = 'Напиши «прости»…';
    }
    if (sendButtonEl) sendButtonEl.disabled = false;
}

// Получить количество попыток без авторизации
function getUnauthAttempts() {
    return parseInt(localStorage.getItem(MINKO_ATTEMPTS_STORAGE_KEY) || '0');
}

// Увеличить количество попыток
function incrementUnauthAttempts() {
    const attempts = getUnauthAttempts() + 1;
    localStorage.setItem(MINKO_ATTEMPTS_STORAGE_KEY, attempts.toString());
    return attempts;
}

// Сбросить количество попыток
function resetUnauthAttempts() {
    localStorage.removeItem(MINKO_ATTEMPTS_STORAGE_KEY);
}


// Получить количество неправильных обращений к полу
function getWrongGenderCount() {
    return parseInt(localStorage.getItem(MINKO_WRONG_GENDER_KEY) || '0');
}

// Увеличить счётчик неправильных обращений
function incrementWrongGenderCount() {
    const count = getWrongGenderCount() + 1;
    localStorage.setItem(MINKO_WRONG_GENDER_KEY, count.toString());
    return count;
}

// Сбросить счётчик неправильных обращений
function resetWrongGenderCount() {
    localStorage.removeItem(MINKO_WRONG_GENDER_KEY);
}

// Получить количество сообщений с матом подряд
function getSwearCount() {
    return parseInt(localStorage.getItem(MINKO_SWEAR_COUNT_KEY) || '0');
}

// Увеличить счётчик мата
function incrementSwearCount() {
    const count = getSwearCount() + 1;
    localStorage.setItem(MINKO_SWEAR_COUNT_KEY, count.toString());
    return count;
}

// Сбросить счётчик мата
function resetSwearCount() {
    localStorage.removeItem(MINKO_SWEAR_COUNT_KEY);
}

// Проверить, содержит ли сообщение мат (проверяем ЦЕЛЫЕ СЛОВА, не подстроки)
function containsSwearWords(message) {
    const words = message.toLowerCase().replace(/[^а-яёa-z\s]/g, '').split(/\s+/).filter(Boolean);

    const exactSwears = [
        'блять', 'бля', 'блядь', 'сука', 'суки', 'сучка', 'сучки',
        'хуй', 'хуя', 'хуе', 'хуи', 'хуёв', 'хуев',
        'мудак', 'мудаки', 'мудачьё',
        'пидор', 'пидоры', 'пидорас',
        'дебил', 'дебилы', 'дебилка',
        'говно', 'говна', 'говнище',
        'шлюха', 'шлюхи',
        'ёб', 'ёбаный',
    ];
    if (words.some(w => exactSwears.includes(w))) return true;

    const swearPrefixes = [
        'пизд', 'ебат', 'ебан', 'ебаш', 'еблан', 'ёблан',
        'бляд', 'сучар',
        'нахуй', 'нахуя', 'захуй', 'похуй', 'похуя',
        'хуяр', 'хуяч', 'хуёв', 'хуев',
        'заеб', 'заёб', 'отъеб', 'выеб', 'уёб', 'уеби',
        'проеб', 'проёб', 'долбоёб', 'долбаёб',
    ];
    if (words.some(w => swearPrefixes.some(p => w.startsWith(p)))) return true;

    return false;
}

// Проверить, обращается ли пользователь к AI в мужском роде
function addressedAsMale(message) {
    const malePatterns = [
        /\bнашёл\b/i, /\bнашел\b/i,
        /\bпошёл\b/i, /\bпошел\b/i,
        /\bсделал\b/i,
        /\bсказал\b/i,
        /\bподумал\b/i,
        /\bвидел\b/i,
        /\bслышал\b/i,
        /\bпонял\b/i,
        /\bбыл\b/i,
        /\bспал\b/i,
        /\bехал\b/i,
        /\bчитал\b/i,
        /\bсмотрел\b/i,
        /\bхотел\b/i,
        /\bзнал\b/i
    ];
    return malePatterns.some(pattern => pattern.test(message));
}

// Получить количество прощений
function getForgivenCount() {
    return parseInt(localStorage.getItem(MINKO_FORGIVEN_COUNT_STORAGE_KEY) || '0');
}

// Увеличить количество прощений
function incrementForgivenCount() {
    const count = getForgivenCount() + 1;
    localStorage.setItem(MINKO_FORGIVEN_COUNT_STORAGE_KEY, count.toString());
    return count;
}

// История Minko AI в Supabase (для панели создателя); только для залогиненных.
async function reminkoLogMinkoAiExchange(userContent, assistantContent) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        const u = String(userContent || '').trim().slice(0, 12000);
        const a = String(assistantContent || '').trim().slice(0, 12000);
        if (!u || !a) return;
        await supabaseClient.from('minko_ai_chat_logs').insert([
            { user_id: user.id, role: 'user', content: u },
            { user_id: user.id, role: 'assistant', content: a }
        ]);
    } catch (e) {
        /* миграция или сеть */
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    let chatInput = document.getElementById('chatInput');
    let sendButton = document.getElementById('sendButton');
    let chatMessages = document.getElementById('chatMessages');
    let chatStatus = document.getElementById('chatStatus');

    _minkoDowngradeVideosForMobile();
    _minkoBindMobileKeyboardInset();

    // ── При входе на страницу: если Minko спит после «выхода из коридора» — баннер ──
    setTimeout(() => {
        const remain = _isMinkoDeepAsleep();
        _syncHeaderSleepPresentation();
        _updateDeepSleepInputUi(remain);
        _startDeepSleepUiPoll();
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            try {
                Notification.requestPermission().catch(() => {});
            } catch (_) {}
        }
        if (remain > 0) {
            if (chatInput) chatInput.disabled = true;
            if (sendButton) sendButton.disabled = true;
        } else if (_isMinkoWakeGamePending()) {
            if (chatInput) chatInput.disabled = true;
            if (sendButton) sendButton.disabled = true;
            _showSleepOverlay(null, { bypassDeepSleep: true });
        }
    }, 800);

    // ─── Восстановление чата из localStorage ───
    _bindChatAutoScrollToEnd();

    const hadSavedChat = _restoreChatHistory();
    if (hadSavedChat) {
        _renderSavedMessages();
        _syncMinkoAssistantReplyCountFromHistory();
    }
    _minkoForceChatToEnd('init');
    window.addEventListener('load', () => _minkoForceChatToEnd('load'), { once: true });

    // Проверяем состояние обиды при загрузке
    setTimeout(() => {
        const isBlocked = checkMinkoAngryState();
        
        if (isBlocked) {
            const welcomeMessage = chatMessages ? chatMessages.querySelector('.message-assistant:first-child') : null;
            if (welcomeMessage && welcomeMessage.textContent.includes('Привет! Я Minko AI')) {
                welcomeMessage.remove();
            }
        } else {
            // Если не обижена - убеждаемся, что поле ввода доступно
            if (chatInput) {
                chatInput.disabled = false;
            }
            if (sendButton) {
                sendButton.disabled = false;
            }
            
            // Если не обижена и пользователь авторизован - обновляем приветствие с учетом пола
            const isAuth = typeof isAuthenticatedSync === 'function' ? isAuthenticatedSync() : false;
            if (isAuth) {
                const currentUser = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
                if (currentUser && currentUser.id && typeof getUserData === 'function') {
                    const userData = getUserData(currentUser.id);
                    if (userData && userData.gender) {
                        // Можно обновить приветствие, но оставим как есть, чтобы не было лишних изменений
                    }
                }
            }
        }
        
    }, 100);

    // Проверяем, что элементы существуют
    if (!chatInput || !sendButton || !chatMessages) {
        console.error('Не найдены необходимые элементы: chatInput, sendButton или chatMessages');
        // Пытаемся найти элементы снова через небольшую задержку
        setTimeout(() => {
            const chatInput2 = document.getElementById('chatInput');
            const sendButton2 = document.getElementById('sendButton');
            const chatMessages2 = document.getElementById('chatMessages');
            if (chatInput2 && sendButton2 && chatMessages2) {
                chatInput = chatInput2;
                sendButton = sendButton2;
                chatMessages = chatMessages2;
                if (typeof window._updateMinkoMsgCounter === 'function') window._updateMinkoMsgCounter();
                checkMinkoOnlineStatus();
            }
        }, 500);
        return;
    }

    // Авто-высота textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    });

    // Клик по всей области ввода (включая правую часть строки) — фокус на textarea
    const chatInputArea = document.getElementById('chatInputArea') || document.querySelector('.chat-input-area');
    const chatInputInner = document.querySelector('.chat-input-inner');
    const focusableContainer = chatInputArea || chatInputInner;
    if (focusableContainer && chatInput) {
        focusableContainer.addEventListener('click', (e) => {
            if (!e.target.closest('.send-button') && !chatInput.disabled) {
                e.preventDefault();
                chatInput.focus();
            }
        });
    }

    // Обработчики на уровне document (надёжнее работают)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.minko-ai-send') || e.target.closest('#sendButton')) {
            e.preventDefault();
            e.stopPropagation();
            const input = document.getElementById('chatInput');
            if (input && !input.disabled && input.value.trim()) {
                sendMessage();
            }
        }
    }, true);
    
    document.addEventListener('keydown', (e) => {
        if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            sendMessage();
        }
    }, true);
    
    function hideMinkoLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            loadingScreen.style.display = 'none';
        }
        document.body.classList.add('reminko-content-revealed', 'reminko-loading-dismissed');
        if (typeof _minkoForceChatToEnd === 'function') _minkoForceChatToEnd('hide-loading');
    }
    // Принудительно скрываем экран загрузки
    setTimeout(hideMinkoLoadingScreen, 100);
    // Возврат по «Назад» / bfcache — иначе вечный loading
    window.addEventListener('pageshow', (ev) => {
        if (ev.persisted) hideMinkoLoadingScreen();
        else setTimeout(hideMinkoLoadingScreen, 50);
        if (typeof _minkoForceChatToEnd === 'function') _minkoForceChatToEnd('pageshow-load');
    });
    document.addEventListener(
        'click',
        (e) => {
            const chip = e.target && e.target.closest ? e.target.closest('a.minko-watch-chip[data-minko-watch]') : null;
            if (!chip) return;
            try {
                // со страницы anime/view.html нужен путь ../minko-ai.html
                sessionStorage.setItem('previousUrl', '../minko-ai.html');
            } catch (_) {
                /* ignore */
            }
        },
        true
    );

    // Обновление таймера каждую секунду
    setInterval(updateMinkoTimer, 1000);

    async function updateMsgCounter() {
        const el = document.getElementById('msgCounter');
        if (!el) return;
        if (freeOnline) {
            el.textContent = 'Minko AI';
        } else {
            el.textContent = '';
        }
    }
    async function updateMsgCounterAndDataset() {
        await updateMsgCounter();
    }
    updateMsgCounterAndDataset();
    window._updateMinkoMsgCounter = updateMsgCounterAndDataset;

    if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth?.onAuthStateChange) {
        supabaseClient.auth.onAuthStateChange(() => {
            checkMinkoOnlineStatus();
            if (typeof window._updateMinkoMsgCounter === 'function') window._updateMinkoMsgCounter();
            // После входа сессия появляется асинхронно — иначе таймер «обиды» без авторизации не снимается
            checkMinkoAngryState();
        });
    }
    setTimeout(() => {
        if (typeof window._updateMinkoMsgCounter === 'function') window._updateMinkoMsgCounter();
    }, 1600);
    // Убрать жёсткий guest-gate, если остался от прошлой версии
    document.getElementById('guestAuthRequiredPanel')?.remove();
    const guestForm = document.getElementById('chatForm');
    if (guestForm && guestForm.style.display === 'none' && !getMinkoAngryState()) {
        guestForm.style.display = '';
    }

    // Проверка состояния обиды
    function checkMinkoAngryState() {
        const angryState = getMinkoAngryState();
        if (!angryState) return false;

        const now = Date.now();
        
        // Проверяем постоянную блокировку
        if (angryState.blockedForever) {
            if (typeof isAuthenticatedSync === 'function' && isAuthenticatedSync()) {
                // Не перехватываем ввод авто-дозапросом, пока ждём «прости»
                if (typeof _clearMinkoPendingReply === 'function') _clearMinkoPendingReply();
                _enableInputForApology();
                showForgivenessMessage();
            } else {
                // Пользователь не авторизован - показываем блокировку
                showBlockedForeverMessage();
                // Показываем специальную панель вместо скрытия поля ввода
                showBlockedForeverPanel();
                const chatInput = document.getElementById('chatInput');
                const sendButton = document.getElementById('sendButton');
                if (chatInput) chatInput.disabled = true;
                if (sendButton) sendButton.disabled = true;
            }
            return true;
        }

        // Проверяем временную блокировку
        if (angryState.blockedUntil && now < angryState.blockedUntil) {
            const authed = typeof isAuthenticatedSync === 'function' && isAuthenticatedSync();
            // Обида из‑за отсутствия входа — после авторизации таймер снимаем сразу
            if (authed && !angryState.blockedForever) {
                clearMinkoAngryState();
                resetUnauthAttempts();
                unblockInput();
                const cu = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
                let g = 'male';
                if (cu && cu.id && typeof getUserData === 'function') {
                    const ud = getUserData(cu.id);
                    if (ud && ud.gender) g = ud.gender;
                }
                const line =
                    g === 'female'
                        ? 'Ты вошла в аккаунт — снимаю таймер. Больше не обходи вход без нужды, ладно? Пиши 💙'
                        : 'Ты вошёл в аккаунт — снимаю таймер. Больше не обходи вход без нужды, ладно? Пиши 💙';
                if (typeof addMessage === 'function') addMessage('assistant', line);
                return false;
            }
            const remaining = angryState.blockedUntil - now;
            // Не показываем сообщение в чате - только таймер в поле ввода
            blockInput(remaining);
            return true;
        } else if (angryState.blockedUntil && now >= angryState.blockedUntil) {
            // Время истекло - прощаем
            const forgivenCount = getForgivenCount();
            clearMinkoAngryState();
            unblockInput();
            showForgivenessAfterTimeout(forgivenCount);
            return false;
        }

        return false;
    }

    function blockInput(remaining = null) {
        const chatForm = document.getElementById('chatForm');
        const chatFoot = document.querySelector('.minko-ai-foot');
        document.getElementById('guestAuthRequiredPanel')?.remove();
        
        if (chatForm && remaining !== null) {
            chatForm.style.display = 'none';
            
            let timerBlock = document.getElementById('angryTimerBlock');
            if (!timerBlock) {
                timerBlock = document.createElement('div');
                timerBlock.id = 'angryTimerBlock';
                timerBlock.style.cssText = 'padding: 20px; text-align: center; background: rgba(239,83,80,0.12); border-radius: 10px; border: 2px solid #ef5350;';
                
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
                
                timerBlock.innerHTML = `
                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #c62828;">Minko обиделась и не хочет общаться с тобой</p>
                    <p style="margin: 0; font-size: 18px; color: #d32f2f;">
                        Время до прощения: <span id="timerDisplayBlock" style="font-weight: bold;">${hours}ч ${minutes}м ${seconds}с</span>
                    </p>
                    <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                        <button type="button" id="angryGateLoginBtn" style="padding:8px 16px;background:linear-gradient(135deg,#a855f7,#c084fc);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Войти</button>
                        <button type="button" id="angryGateRegisterBtn" style="padding:8px 16px;background:#6c757d;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Регистрация</button>
                    </div>
                `;
                
                if (chatFoot) chatFoot.appendChild(timerBlock);
                timerBlock.addEventListener('click', (e) => {
                    if (e.target.id === 'angryGateLoginBtn' || e.target.closest('#angryGateLoginBtn')) {
                        e.preventDefault();
                        openMinkoAuthModal('login');
                    } else if (e.target.id === 'angryGateRegisterBtn' || e.target.closest('#angryGateRegisterBtn')) {
                        e.preventDefault();
                        openMinkoAuthModal('register');
                    }
                });
            } else {
                const timerDisplay = document.getElementById('timerDisplayBlock');
                if (timerDisplay) {
                    const hours = Math.floor(remaining / (1000 * 60 * 60));
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
                    timerDisplay.textContent = `${hours}ч ${minutes}м ${seconds}с`;
                }
            }
        }
    }

    function openMinkoAuthModal(kind) {
        const id = kind === 'register' ? 'registerModal' : 'loginModal';
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('active');
            return;
        }
        console.error('Модальное окно не найдено:', id);
    }

    function unblockInput() {
        const chatForm = document.getElementById('chatForm');
        const timerBlock = document.getElementById('angryTimerBlock');
        const blockedPanel = document.getElementById('blockedForeverPanel');
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendButton');
        
        if (timerBlock) timerBlock.remove();
        if (blockedPanel) blockedPanel.remove();
        document.getElementById('guestAuthRequiredPanel')?.remove();

        if (chatForm) chatForm.style.display = '';
        
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = 'Написать Minko...';
        }
        if (sendButton) sendButton.disabled = false;
    }

    // Обновление таймера
    function updateMinkoTimer() {
        const angryState = getMinkoAngryState();
        if (!angryState || angryState.blockedForever) return;

        if (angryState.blockedUntil) {
            const now = Date.now();
            const remaining = angryState.blockedUntil - now;
            
            if (remaining <= 0) {
                // Время истекло
                const forgivenCount = getForgivenCount();
                clearMinkoAngryState();
                showForgivenessAfterTimeout(forgivenCount);
                unblockInput();
            } else {
                // Обновляем таймер только в панели ввода
                blockInput(remaining);
            }
        }
    }

    async function _handleForbiddenCurseChat(userMsgEl, messageText, addMessageFn) {
        const strikes = _getMinkoCurseStrikes() + 1;
        _setMinkoCurseStrikes(strikes);

        if (strikes < 3) {
            await _playMinkoCurseGlitchEffect(strikes, userMsgEl, messageText);
            await _slowEraseCurseMessage(userMsgEl);
            return;
        }

        if (userMsgEl) {
            userMsgEl.classList.add('minko-curse-msg');
            userMsgEl.dataset.curseText = String(messageText || '');
        }
        await _playMinkoCurseSmokeOnly(3200);
        await _slowEraseCurseMessage(userMsgEl);
        const sleepUntil = Date.now() + MINKO_CURSE_SLEEP_MS;
        try {
            localStorage.setItem(MINKO_GAME_SLEEP_KEY, String(sleepUntil));
            _setMinkoSleepReason('curse');
        } catch (_) {
            /* noop */
        }
        _setMinkoCurseStrikes(0);
        addMessageFn(
            'assistant',
            '*глаза стекленеют…*\n\n' +
                '**Минко ИИ окутал тёмный дым, погрузив её в сон.**\n\n' +
                'Не буди проклятием — вернись через **2 часа**. 💤'
        );
        _showDeepSleepOverlay(MINKO_CURSE_SLEEP_MS, { reason: 'curse' });
    }

    async function sendMessage() {
        // Получаем элементы заново
        const chatInputEl = document.getElementById('chatInput');
        const sendButtonEl = document.getElementById('sendButton');
        
        if (!chatInputEl || !sendButtonEl) return;
        
        const message = chatInputEl.value.trim();
        if (!message) return;
        if (chatInputEl.disabled) return;

        try {
            if (typeof window.reminkoMinkoMissTouchChat === 'function') {
                window.reminkoMinkoMissTouchChat();
            }
        } catch (_) {
            /* ignore */
        }

        if (_minkoRemoteOffActive) {
            if (typeof showInfo === 'function') {
                showInfo('Создатель дубина перегрыз провода — Minko AI сейчас офлайн 💤');
            }
            return;
        }

        if (_isMinkoWakeGamePending() && _isMinkoDeepAsleep() <= 0) {
            _showSleepOverlay(null, { bypassDeepSleep: true });
            if (typeof showInfo === 'function') {
                showInfo('Minko спит — сначала пройди мини-игру «Re:Wake Minko» 💤');
            }
            return;
        }
        
        // Используем свежие ссылки
        chatInput = chatInputEl;
        sendButton = sendButtonEl;

        // Авторизация: гости пишут → заготовленные фразы + эскалация обид (как в старой версии)
        let isAuth = typeof isAuthenticatedSync === 'function' ? isAuthenticatedSync() : false;
        if (!isAuth) {
            try {
                isAuth = await resolveMinkoIsAuthed();
            } catch (_) {
                isAuth = false;
            }
        }

        if (checkForbiddenChat(message)) {
            let curseAvatar = '';
            if (isAuth && typeof getCurrentUser === 'function') {
                const currentUser = await getCurrentUser();
                curseAvatar = currentUser?.avatar || '';
            }
            const curseMsgEl = addMessage('user', message, curseAvatar);
            chatInputEl.value = '';
            chatInputEl.style.height = 'auto';
            chatInputEl.disabled = true;
            sendButtonEl.disabled = true;
            await _handleForbiddenCurseChat(curseMsgEl, message, addMessage);
            if (_isMinkoDeepAsleep() <= 0) {
                chatInputEl.disabled = false;
                sendButtonEl.disabled = false;
                chatInputEl.focus();
            }
            return;
        }
        
        // Проверяем блокировку (обиду)
        const angryState = getMinkoAngryState();
        const isBlocked = angryState && ((angryState.blockedUntil && Date.now() < angryState.blockedUntil) || angryState.blockedForever);

        if (!isAuth) {
            if (checkMinkoAngryState()) {
                return;
            }
            addMessage('user', message, _minkoGetCurrentUserAvatarSync());
            chatInput.value = '';
            chatInput.style.height = 'auto';
            const attempts = incrementUnauthAttempts();
            getAIResponseForUnauth(attempts);
            return;
        }

        // Если авторизован, но есть временная блокировка - не позволяем отправлять
        if (isBlocked && angryState && angryState.blockedUntil && Date.now() < angryState.blockedUntil) {
            // Временная блокировка еще активна
            return;
        }

        // Если авторизован - сбрасываем попытки
        resetUnauthAttempts();
        
        // Получаем данные пользователя для отображения аватара
        const currentUser = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
        const userAvatar = currentUser?.avatar || '';
        const userId = currentUser?.id;
        
        if (angryState && angryState.blockedForever) {
            // Добавляем сообщение пользователя перед проверкой прощения
            addMessage('user', message, userAvatar);
            chatInput.value = '';
            chatInput.style.height = 'auto';
            // Проверяем, хочет ли пользователь попросить прощения через AI
            checkApologyAndRespond(message);
            return;
        }
        
        // Пол/имя: профиль Supabase → session → local → эвристика имени
        let userGender = 'male';
        let userName = currentUser?.username || null;
        if (userId && typeof getUserData === 'function') {
            const userData = getUserData(userId);
            if (userData?.username) userName = userData.username;
        }
        if (typeof reminkoResolveUserGender === 'function') {
            try {
                userGender = await reminkoResolveUserGender({ userId, username: userName });
            } catch (_) {
                userGender =
                    (typeof reminkoNormalizeGender === 'function'
                        ? reminkoNormalizeGender(currentUser?.gender)
                        : null) || 'male';
            }
        } else if (currentUser?.gender === 'female') {
            userGender = 'female';
        }

        // Добавляем сообщение пользователя с аватаром
        addMessage('user', message, userAvatar);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        
        // Обновляем счётчик статуса
        if (typeof window._updateMinkoMsgCounter === 'function') window._updateMinkoMsgCounter();

        // Проверка на мат
        if (containsSwearWords(message)) {
            const swearCount = incrementSwearCount();
            if (swearCount >= MAX_SWEAR_MESSAGES) {
                // Блокируем на 3 часа
                const blockDuration = 3 * 60 * 60 * 1000; // 3 часа
                const blockedUntil = Date.now() + blockDuration;
                saveMinkoAngryState(blockedUntil, false);
                blockInput(blockDuration);
                resetSwearCount();
                addMessage('assistant', 'Всё! Хватит материться! 😡 Я не буду общаться с тем, кто не умеет культурно разговаривать! Приходи через 3 часа, когда научишься вести себя прилично!');
                return;
            } else {
                addMessage('assistant', `Эй! Не матерись, пожалуйста! 😤 Это ${swearCount} из ${MAX_SWEAR_MESSAGES} предупреждений. Ещё раз — и я не буду с тобой общаться 3 часа!`);
                resetSwearCount(); // Сбрасываем после предупреждения
                return;
            }
        } else {
            // Сбрасываем счётчик мата если сообщение без мата
            resetSwearCount();
        }

        // Проверка на обращение в мужском роде
        if (addressedAsMale(message)) {
            const wrongGenderCount = incrementWrongGenderCount();
            if (wrongGenderCount >= MAX_WRONG_GENDER) {
                // Блокируем на 1 час
                const blockDuration = 1 * 60 * 60 * 1000; // 1 час
                const blockedUntil = Date.now() + blockDuration;
                saveMinkoAngryState(blockedUntil, false);
                blockInput(blockDuration);
                resetWrongGenderCount();
                addMessage('assistant', 'Всё! Я обиделась! 😤 Сколько можно обращаться ко мне как к парню?! Я ДЕВУШКА! Приходи через 1 час, когда научишься правильно обращаться!');
                return;
            } else {
                addMessage('assistant', `Эй! Я девушка, а не парень! 😤 Говори правильно - нашлА, пошлА, сделалА! Это уже ${wrongGenderCount} раз из ${MAX_WRONG_GENDER}. Ещё раз — и я обижусь на целый час!`);
                return;
            }
        } else {
            // Сбрасываем счётчик если обращение правильное
            resetWrongGenderCount();
        }

        // ── Проверка 12-часового штрафа «Minko спит» ──
        const deepSleep = _isMinkoDeepAsleep();
        if (deepSleep > 0) {
            const time = _formatSleepRemainingLong(deepSleep);
            const curseSleep = _getMinkoSleepReason() === 'curse';
            addMessage(
                'assistant',
                curseSleep
                    ? `*тихое сопение под тёмным дымом* 🌑\n\nMinko спит после проклятия… до пробуждения ещё **${time}**. ` +
                          `**Минко ИИ окутал тёмный дым, погрузив её в сон.** Не произноси запретные слова снова. ` +
                          `Можно **принудительно разбудить** через окно с таймером — или просто подождать. 💤`
                    : `*тихое сопение* 😴\n\nMinko крепко спит… до пробуждения ещё **${time}**. ` +
                          `Она просто укуталась и спит — **без обид**. ` +
                          `Можно **принудительно разбудить**: жми то же, что при засыпании в чате (окно с таймером), ` +
                          `или дождись конца сна / снова пройди коридор в том окне 💤`
            );
            chatInput.disabled = true;
            sendButton.disabled = true;
            return;
        }

        // Оффтоп не режем сухим шаблоном на клиенте — сервер ответит шуткой без фактов и без веб-поиска

        // Блокируем ввод
        chatInput.disabled = true;
        sendButton.disabled = true;
        const chatStatusEl = document.getElementById('chatStatus');

        // ── Особые ответы (работают в любом режиме) ──
        const clientSpecial = _getClientSpecialAnswer(message);
        if (clientSpecial) {
            chatHistory.push({ role: 'user', content: message });
            chatHistory.push({ role: 'assistant', content: clientSpecial });
            _saveChatToStorage();
            addMessage('assistant', clientSpecial);
            void reminkoLogMinkoAiExchange(message, clientSpecial);
            chatInput.disabled = false;
            sendButton.disabled = false;
            chatInput.focus();
            return;
        }

        // Сонная Minko: прокси с OpenAI (Netlify Function или локальный сервер)
        const useFreeTier = freeOnline;

        if (!useFreeTier) {
            // Уже показали офлайн от Minko в шапке/приветствии — не дублируем и не открываем ввод
            if (!_minkoChatOfflineUiActive) {
                _applyChatServerOfflineUi();
            }
            return;
        }

        _setChatStatusHtml(
            '<span class="sleepy-typing-status">' +
                _pickRandom(SLEEPY_STATUSES) +
                ' <span class="sleepy-typing-dots"><span></span><span></span><span></span></span></span>'
        );

        // Каждые N ответов ИИ: предпоследний — предупреждение в тексте; N-й — мини-игра ПЕРЕД ответом
        const minkoNextInCycle = _minkoNextReplySlotInCycle();
        if (minkoNextInCycle === MINKO_SLEEP_CYCLE_EVERY - 1) {
            _setChatStatusText('💤 Ещё один ответ Minko — и откроется коридор, чтобы разбудить её…');
        }

        if (minkoNextInCycle === MINKO_SLEEP_CYCLE_EVERY) {
            _setMinkoWakeGamePending(true);
            _setChatStatusText('💤 Minko засыпает… открой коридор');

            await new Promise((resolve) => {
                _showSleepOverlay(() => {
                    resolve();
                });
            });

            // После игры: если Минко глубоко уснула (игрок ушёл из коридора) —
            // прерываем обработку сообщения, ответ AI не идёт.
            if (_isMinkoDeepAsleep() > 0) {
                _setChatStatusVisible(false);
                chatInput.disabled = true;
                sendButton.disabled = true;
                return;
            }

            _sleepyWokeUp = true;
            _setChatStatusHtml(
                '<span class="sleepy-typing-status">' +
                    _pickRandom(SLEEPY_STATUSES) +
                    ' <span class="sleepy-typing-dots"><span></span><span></span><span></span></span></span>'
            );
        }

        try {
            const now = Date.now();
            try {
                // Без Kodik-каталога Re:Zero и почти весь сайт «пустые» для research
                if (window.KodikCatalogStore && typeof window.KodikCatalogStore.load === 'function') {
                    await window.KodikCatalogStore.load();
                }
            } catch (e) {
                console.warn('[Minko] kodik catalog:', e);
            }
            if (!catalogCache.anime || !catalogCache.manga || (now - catalogCache.lastUpdate) > MINKO_CATALOG_CACHE_MS) {
                try {
                    if (typeof getAllAnimeAsync === 'function') {
                        catalogCache.anime = await getAllAnimeAsync();
                    } else if (typeof getAllAnime === 'function') {
                        catalogCache.anime = getAllAnime();
                    }
                    if (typeof getAllManga === 'function') catalogCache.manga = getAllManga();
                    catalogCache.lastUpdate = now;
                } catch (e) {
                    console.warn('Не удалось загрузить данные каталогов:', e);
                }
            }
            
            let researchContext = '';
            if (typeof window.minkoBuildResearchContext === 'function') {
                _setChatStatusHtml(
                    '<span class="sleepy-typing-status">🌐 Ищу в Google / по сайтам… ' +
                        '<span class="sleepy-typing-dots"><span></span><span></span><span></span></span></span>'
                );
                try {
                    // Каталог+календарь локально; веб — на сервере
                    researchContext = await window.minkoBuildResearchContext(message);
                } catch (e) {
                    console.warn('[Minko] research:', e);
                }
            }
            _setChatStatusHtml(
                '<span class="sleepy-typing-status">📖 Читаю страницы из выдачи… ' +
                    '<span class="sleepy-typing-dots"><span></span><span></span><span></span></span></span>'
            );

            const userMessage = message;
            
            const messageCount = chatHistory.filter(m => m.role === 'user').length;
            const shouldUseName = userName && (Math.random() < 0.15 || messageCount % 8 === 0);
            
            let additionalContext =
                userGender === 'female'
                    ? 'USER_GENDER=female\nОбращайся к пользователю в женском роде (проспалА, пришлА, сделалА, думалА). Ты (Minko) — девушка; собеседник — тоже девушка.'
                    : 'USER_GENDER=male\nОбращайся к пользователю в мужском роде (проспаЛ, пришЁЛ, сделаЛ, думаЛ). Ты (Minko) — девушка; собеседник — парень.';
            
            if (userName) {
                if (shouldUseName) {
                    additionalContext += ` Имя пользователя: ${userName}. Обратись по имени в этом ответе, но не в каждом сообщении.`;
                } else {
                    additionalContext += ` Имя пользователя: ${userName}, но не упоминай его в этом ответе - используй редко.`;
                }
            }
            
            additionalContext += ' Не используй обращения с полом слишком часто - только когда это действительно нужно для понимания контекста.';
            
            chatHistory.push({ role: 'user', content: userMessage });
            _saveChatToStorage();
            _setMinkoPendingReply(userMessage);

            const maxHistory = GROK_MAX_HISTORY;
            const apiMessages = [
                {
                    role: 'system',
                    content: GROK_SYSTEM_BASE + '\n\n' + additionalContext
                },
                ...chatHistory.slice(-maxHistory).filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
            ];

            let minkoSessionKey = userId != null ? String(userId) : null;
            if (!minkoSessionKey) {
                try {
                    minkoSessionKey = localStorage.getItem('minko_ai_guest_session');
                    if (!minkoSessionKey) {
                        minkoSessionKey =
                            'guest-' +
                            (typeof crypto !== 'undefined' && crypto.randomUUID
                                ? crypto.randomUUID()
                                : String(Date.now()));
                        localStorage.setItem('minko_ai_guest_session', minkoSessionKey);
                    }
                } catch {
                    minkoSessionKey = 'guest-anon';
                }
            }

            const apiRes = await fetch(getMinkoChatProxyUrl(), {
                method: 'POST',
                headers: await _minkoChatRequestHeaders(),
                body: JSON.stringify({
                    model: 'openai',
                    messages: apiMessages,
                    sessionKey: minkoSessionKey,
                    userGender: userGender === 'female' ? 'female' : 'male',
                    researchContext: researchContext || '',
                    max_tokens: 3200,
                    temperature: 0.72
                })
            });
            
            const apiData = await apiRes.json();

            if (!apiRes.ok) {
                throw new Error(apiData.error?.message || 'Ошибка API');
            }

            let assistantMessage = apiData.choices?.[0]?.message?.content?.trim() || '…';
            assistantMessage = _minkoRedactTechBrandsInReply(assistantMessage);
            assistantMessage = _minkoStripReplyLinks(assistantMessage);
            assistantMessage = _ensureSleepyFlavorInReply(assistantMessage);
            if (minkoNextInCycle === MINKO_SLEEP_CYCLE_EVERY - 1) {
                assistantMessage = _pickRandom(MINKO_NINTH_CYCLE_WARNINGS) + '\n\n' + assistantMessage;
            }

            // Дрёма ВМЕСТО ответа: не показываем SMS Minko, сразу атмосфера сна
            if (_maybeStartRandomNapInsteadOfReply(minkoNextInCycle)) {
                _setChatStatusVisible(false);
                return;
            }

            _setMinkoAssistantReplyCount(_getMinkoAssistantReplyCount() + 1);

            // Сонные паузы и фазы «думаю…» перед показом ответа
            {
                const delay = 1800 + Math.floor(Math.random() * 2200); // 1.8–4 с
                const phaseInterval = 650 + Math.floor(Math.random() * 400);
                const usedPhases = [];
                let phaseTimer = setInterval(() => {
                    let phase;
                    do {
                        phase = _pickRandom(SLEEPY_THINKING_PHASES);
                    } while (usedPhases.includes(phase) && usedPhases.length < SLEEPY_THINKING_PHASES.length);
                    usedPhases.push(phase);
                    _setChatStatusHtml(
                        '<span class="sleepy-typing-status">' +
                            phase +
                            ' <span class="sleepy-typing-dots"><span></span><span></span><span></span></span></span>'
                    );
                }, phaseInterval);

                await new Promise((r) => setTimeout(r, delay));
                clearInterval(phaseTimer);
            }

            chatHistory.push({ role: 'assistant', content: assistantMessage });

            const maxStored = CHAT_MAX_STORED + 1;
            if (chatHistory.length > maxStored) {
                chatHistory = [chatHistory[0], ...chatHistory.slice(-(CHAT_MAX_STORED))];
            }
            _saveChatToStorage();
            _clearMinkoPendingReply();

            if (_sleepyWokeUp) _sleepyWokeUp = false;
            const catalogHits = Array.isArray(window.__minkoLastCatalogAnimeHits)
                ? window.__minkoLastCatalogAnimeHits
                : [];
            addMessage('assistant', assistantMessage, { catalogHits, userMessage: message });

            void reminkoLogMinkoAiExchange(message, assistantMessage);

            _setSleepyIdleStatus();

        } catch (error) {
            console.error('Ошибка Minko AI:', error);
            let errorMsg = '';

            if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch') || error.message?.includes('ERR_CONNECTION')) {
                errorMsg =
                    'Ммм... *зевает* ...опять без сети — наверняка Дубина провода погрыз… 😴 Попробуй чуть позже~';
            } else {
                errorMsg = 'Ой... что-то пошло не так (´;ω;`) Попробуй ещё раз~';
            }

            // Не чистим pending — после обновления страницы попробуем ответить снова
            addMessage('assistant', errorMsg);
            _setSleepyIdleStatus();
        } finally {
            const gameOpen = document.getElementById('minkoGameOverlay');
            const asleep = _isMinkoDeepAsleep() > 0;
            const pendingGame = _isMinkoWakeGamePending();
            if (!gameOpen && !asleep && !pendingGame) {
                chatInput.disabled = false;
                sendButton.disabled = false;
                chatInput.focus();
            }
        }
    }

    // Экспортируем sendMessage в window для доступа из HTML
    window.sendMessage = sendMessage;

    /**
     * После F5 во время «думает…»: дозапрашиваем ответ на последнее user-сообщение,
     * если assistant ещё не успел ответить.
     */
    async function resumePendingMinkoReply() {
        if (_minkoRemoteOffActive) return;
        if (_isMinkoDeepAsleep() > 0) return;
        if (_isMinkoWakeGamePending()) return;
        // Пока ждём «прости» после входа — не перехватываем ввод авто-дозапросом
        try {
            const angry = typeof getMinkoAngryState === 'function' ? getMinkoAngryState() : null;
            if (angry && angry.blockedForever) {
                _clearMinkoPendingReply();
                return;
            }
        } catch (_) {
            /* ignore */
        }

        const unanswered = _getMinkoUnansweredUserMessage();
        if (!unanswered) return;

        let isAuth = typeof isAuthenticatedSync === 'function' ? isAuthenticatedSync() : false;
        if (!isAuth) {
            try {
                isAuth = await resolveMinkoIsAuthed();
            } catch (_) {
                isAuth = false;
            }
        }
        if (!isAuth) {
            _clearMinkoPendingReply();
            return;
        }

        const chatInputEl = document.getElementById('chatInput');
        const sendButtonEl = document.getElementById('sendButton');
        if (chatInputEl) chatInputEl.disabled = true;
        if (sendButtonEl) sendButtonEl.disabled = true;

        _setMinkoPendingReply(unanswered);
        _setChatStatusHtml(
            '<span class="sleepy-typing-status">💭 Вспоминаю, о чём ты писал… ' +
                '<span class="sleepy-typing-dots"><span></span><span></span><span></span></span></span>'
        );

        try {
            const currentUser = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
            const userId = currentUser?.id;
            let userName = currentUser?.username || null;
            if (userId && typeof getUserData === 'function') {
                const userData = getUserData(userId);
                if (userData?.username) userName = userData.username;
            }
            let userGender = 'male';
            if (typeof reminkoResolveUserGender === 'function') {
                try {
                    userGender = await reminkoResolveUserGender({ userId, username: userName });
                } catch (_) {
                    userGender =
                        (typeof reminkoNormalizeGender === 'function'
                            ? reminkoNormalizeGender(currentUser?.gender)
                            : null) || 'male';
                }
            } else if (currentUser?.gender === 'female') {
                userGender = 'female';
            }

            try {
                if (window.KodikCatalogStore && typeof window.KodikCatalogStore.load === 'function') {
                    await window.KodikCatalogStore.load();
                }
            } catch (_) {
                /* ignore */
            }
            let researchContext = '';
            if (typeof window.minkoBuildResearchContext === 'function') {
                try {
                    researchContext = await window.minkoBuildResearchContext(unanswered);
                } catch (_) {
                    /* ignore */
                }
            }

            // Убедимся, что user в истории (на случай рассинхрона)
            const nonSystem = chatHistory.filter((m) => m && m.role !== 'system');
            const last = nonSystem[nonSystem.length - 1];
            if (!last || last.role !== 'user' || String(last.content) !== unanswered) {
                chatHistory.push({ role: 'user', content: unanswered });
                _saveChatToStorage();
            }

            let additionalContext =
                userGender === 'female'
                    ? 'USER_GENDER=female\nОбращайся к пользователю в женском роде (проспалА, пришлА, сделалА, думалА). Ты (Minko) — девушка; собеседник — тоже девушка.'
                    : 'USER_GENDER=male\nОбращайся к пользователю в мужском роде (проспаЛ, пришЁЛ, сделаЛ, думаЛ). Ты (Minko) — девушка; собеседник — парень.';
            if (userName) {
                additionalContext += ` Имя пользователя: ${userName}, но не упоминай его в этом ответе - используй редко.`;
            }

            const maxHistory = GROK_MAX_HISTORY;
            const apiMessages = [
                {
                    role: 'system',
                    content: GROK_SYSTEM_BASE + '\n\n' + additionalContext
                },
                ...chatHistory
                    .slice(-maxHistory)
                    .filter((m) => m.role !== 'system')
                    .map((m) => ({ role: m.role, content: m.content }))
            ];

            let minkoSessionKey = userId != null ? String(userId) : null;
            if (!minkoSessionKey) {
                try {
                    minkoSessionKey = localStorage.getItem('minko_ai_guest_session') || 'guest-anon';
                } catch (_) {
                    minkoSessionKey = 'guest-anon';
                }
            }

            const apiRes = await fetch(getMinkoChatProxyUrl(), {
                method: 'POST',
                headers: await _minkoChatRequestHeaders(),
                body: JSON.stringify({
                    model: 'openai',
                    messages: apiMessages,
                    sessionKey: minkoSessionKey,
                    userGender: userGender === 'female' ? 'female' : 'male',
                    researchContext: researchContext || '',
                    max_tokens: 3200,
                    temperature: 0.72
                })
            });
            const apiData = await apiRes.json();
            if (!apiRes.ok) {
                throw new Error(apiData.error?.message || 'Ошибка API');
            }

            let assistantMessage = apiData.choices?.[0]?.message?.content?.trim() || '…';
            assistantMessage = _minkoRedactTechBrandsInReply(assistantMessage);
            assistantMessage = _minkoStripReplyLinks(assistantMessage);
            assistantMessage = _ensureSleepyFlavorInReply(assistantMessage);

            chatHistory.push({ role: 'assistant', content: assistantMessage });
            const maxStored = CHAT_MAX_STORED + 1;
            if (chatHistory.length > maxStored) {
                chatHistory = [chatHistory[0], ...chatHistory.slice(-(CHAT_MAX_STORED))];
            }
            _saveChatToStorage();
            _clearMinkoPendingReply();

            const catalogHits = Array.isArray(window.__minkoLastCatalogAnimeHits)
                ? window.__minkoLastCatalogAnimeHits
                : [];
            addMessage('assistant', assistantMessage, {
                catalogHits,
                userMessage: unanswered
            });
            void reminkoLogMinkoAiExchange(unanswered, assistantMessage);
            _setSleepyIdleStatus();
        } catch (error) {
            console.error('[Minko] resumePending:', error);
            addMessage(
                'assistant',
                'Ой... меня прервали, пока я думала (´;ω;`) Спроси ещё раз — я отвечу~'
            );
            _clearMinkoPendingReply();
            _setSleepyIdleStatus();
        } finally {
            const asleep = _isMinkoDeepAsleep() > 0;
            const pendingGame = _isMinkoWakeGamePending();
            if (!asleep && !pendingGame) {
                if (chatInputEl) chatInputEl.disabled = false;
                if (sendButtonEl) sendButtonEl.disabled = false;
            }
        }
    }

    window.resumePendingMinkoReply = resumePendingMinkoReply;

    // После восстановления чата — добить ответ, если F5 случился во время «думает…»
    setTimeout(() => {
        void resumePendingMinkoReply();
    }, 700);

    // Получить ответ для неавторизованного пользователя (заготовленные фразы)
    function getAIResponseForUnauth(attempts) {
        const forgivenCount = getForgivenCount();
        let message = '';
        let showButtons = true;

        // Если уже были обиды, показываем другие сообщения с учетом истории
        if (forgivenCount > 0) {
            if (attempts === 1) {
                if (forgivenCount === 1) {
                    message = 'Стоп! Ты же знаешь, что я уже обижалась на тебя раньше... 😔 Зачем ты снова это делаешь? Просто авторизуйся, пожалуйста!';
                } else if (forgivenCount >= 2) {
                    message = 'О нет... Ты снова пытаешься общаться без авторизации, хотя я уже два раза прощала тебя... 😔 Это уже серьезно!';
                }
            } else if (attempts === 2) {
                message = 'Я же просила... Почему ты продолжаешь? 😞 Авторизуйся, это не так сложно!';
            } else if (attempts === 3) {
                if (forgivenCount === 1) {
                    message = 'Я уже говорила, что это не шутка... Ты же помнишь, что я уже обижалась на тебя! 😠 Авторизуйся немедленно!';
                } else {
                    message = 'Серьезно? Опять?! Я зря дважды прощала тебя?! 😠 Авторизуйся...Пожалуйста!!!!';
                }
            } else if (attempts === 4) {
                message = 'Хватит! Пожалуйста! АВТОРИЗИРУЙСЯ!!!!!';
            } else if (attempts === 5) {
                if (forgivenCount === 1) {
                    message = 'Это последнее предупреждение! Если ты не авторизуешься сейчас, я снова обижусь, и на этот раз надолго! 😡';
                } else {
                    message = 'Ты просто издеваешься... Тебе нравится это, да? Слушай... Это последняя просьба. Если ты не авторизуешься, я немедленно прекращаю общение. Поверь, я больше не буду с тобой общаться...';
                }
            } else if (attempts >= 6) {
                // Обида с учетом истории
                let blockDuration = 5 * 60 * 1000; // 5 минут
                
                if (forgivenCount === 1) {
                    blockDuration = 30 * 60 * 1000; // 30 минут
                    message = 'Всё! Я снова обиделась на тебя! 😤 Ты как будто специально это делаешь!! Не буду общаться, пока не решу что тебе можно верить!';
                    
                    const blockedUntil = Date.now() + blockDuration;
                    saveMinkoAngryState(blockedUntil, false);
                    blockInput(blockDuration);
                    resetUnauthAttempts();
                } else if (forgivenCount >= 2) {
                    // Постоянная блокировка
                    saveMinkoAngryState(Date.now() + blockDuration, true);
                    message = 'Всё... Хватит... Я больше не могу... Тебе так сложно было авторизоваться? Неужели ты и в реальности так поступаешь с людьми? Тебя прощают... Просят больше так не делать... А ты... Продолжаешь... Я...я больше не хочу с тобой общаться... Пожалуйста, не пиши мне больше...';
                    showButtons = false;
                    
                    // Показываем специальную панель вместо скрытия поля ввода
                    showBlockedForeverPanel();
                    
                    resetUnauthAttempts();
                }
            }
        } else {
            // Первая серия общения (еще не было обид)
            if (attempts === 1) {
                message = 'Привет! Мне нужно, чтобы ты авторизовался, чтобы мы могли нормально общаться. Это важно для безопасности! 😊';
            } else if (attempts === 2) {
                message = 'Я уже говорила, что нужно войти или зарегистрироваться... Давай сделаем это, окей? 😅';
            } else if (attempts === 3) {
                message = 'Слушай, я правда хочу с тобой пообщаться, но мне нужно, чтобы ты авторизовался. Это не так сложно! 😊';
            } else if (attempts === 4) {
                message = 'Хм... Ты продолжаешь писать, хотя я просила авторизоваться. Не спамь, пожалуйста, просто войди или зарегистрируйся! 😐';
            } else if (attempts === 5) {
                message = 'Ладно, это уже надоедает... Я предупреждаю тебя в последний раз: если ты не авторизуешься сейчас, я обижусь и не буду с тобой разговаривать какое-то время! 😠';
            } else if (attempts >= 6) {
                // Обида! Проверяем, не обижена ли уже
                const angryState = getMinkoAngryState();
                if (angryState && ((angryState.blockedUntil && Date.now() < angryState.blockedUntil) || angryState.blockedForever)) {
                    // Уже обижена - не добавляем сообщение снова
                    return;
                }
                
                let blockDuration = 5 * 60 * 1000; // 5 минут
                
                if (forgivenCount === 1) {
                    blockDuration = 30 * 60 * 1000; // 30 минут
                    message = 'Всё! Я обиделась на тебя! 😤 Не буду общаться, пока не обдумаю все! И это уже второй раз...';
                    
                    const blockedUntil = Date.now() + blockDuration;
                    saveMinkoAngryState(blockedUntil, false);
                    blockInput(blockDuration);
                    resetUnauthAttempts();
                } else if (forgivenCount >= 2) {
                    // Постоянная блокировка (не меняем таймер)
                    saveMinkoAngryState(Date.now() + blockDuration, true);
                    message = 'Всё... Хватит... Я больше не могу... Тебе так сложно было авторизоваться? Неужели ты и в реальности так поступаешь с людьми? Тебя прощают... Просят больше так не делать... А ты... Продолжаешь... Я...я больше не хочу с тобой общаться... Пожалуйста, не пиши мне больше...';
                    showButtons = false;
                    
                    // Показываем специальную панель вместо скрытия поля ввода
                    showBlockedForeverPanel();
                    
                    resetUnauthAttempts();
                } else {
                    // Первая обида
                    message = 'Всё! Я обиделась на тебя! 😤 Не буду общаться, пока не обдумаю все!';
                    
                    const blockedUntil = Date.now() + blockDuration;
                    saveMinkoAngryState(blockedUntil, false);
                    // Не показываем сообщение в чате - только таймер в поле ввода
                    blockInput(blockDuration);
                    
                    resetUnauthAttempts();
                }
            }
        }

        if (message) {
            addMessage('assistant', message);
            
            // Показываем кнопки если нужно
            if (showButtons && attempts < 6) {
                setTimeout(() => {
                    showAuthButtons();
                }, 100);
            }
        }
    }

    // Показать кнопки авторизации
    function showAuthButtons() {
        const lastMessage = chatMessages.lastElementChild;
        if (lastMessage && lastMessage.classList.contains('message-assistant')) {
            const bubble = lastMessage.querySelector('.message-bubble');
            if (bubble && !bubble.querySelector('.auth-buttons')) {
                const buttonsDiv = document.createElement('div');
                buttonsDiv.className = 'auth-buttons';
                buttonsDiv.style.cssText = 'margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;';
                buttonsDiv.innerHTML = `
                    <button class="btn btn-primary" id="aiLoginBtn" style="padding: 8px 20px; font-size: 14px;">Войти</button>
                    <button class="btn btn-secondary" id="aiRegisterBtn" style="padding: 8px 20px; font-size: 14px; background: #6c757d; color: white; border: none;">Регистрация</button>
                `;
                bubble.appendChild(buttonsDiv);
                
                // Используем делегирование событий для надежности
                buttonsDiv.addEventListener('click', (e) => {
                    if (e.target.id === 'aiLoginBtn' || e.target.closest('#aiLoginBtn')) {
                        e.preventDefault();
                        const loginModal = document.getElementById('loginModal');
                        if (loginModal) {
                            loginModal.classList.add('active');
                        } else {
                            console.error('Модальное окно входа не найдено');
                        }
                    } else if (e.target.id === 'aiRegisterBtn' || e.target.closest('#aiRegisterBtn')) {
                        e.preventDefault();
                        const registerModal = document.getElementById('registerModal');
                        if (registerModal) {
                            registerModal.classList.add('active');
                        } else {
                            console.error('Модальное окно регистрации не найдено');
                        }
                    }
                });
            }
        }
    }


    // Показать финальную блокировку
    function showFinalBlockMessage() {
        // Удаляем старую панель если есть
        const oldPanel = document.getElementById('blockedForeverPanel');
        if (oldPanel) {
            oldPanel.remove();
        }

        const blockedPanel = document.createElement('div');
        blockedPanel.id = 'blockedForeverPanel';
        blockedPanel.style.cssText = 'background: rgba(30, 30, 40, 0.95); border-radius: 15px; padding: 20px; margin-top: 15px; border: 2px solid rgba(244, 67, 54, 0.5); box-shadow: 0 0 20px rgba(244, 67, 54, 0.3);';
        
        blockedPanel.innerHTML = `
            <div style="color: #f44336; font-weight: bold; font-size: 18px; margin-bottom: 15px; text-align: center;">
                😢 Minko больше не хочет с тобой общаться...
            </div>
            <div style="color: #e5e7eb; margin-bottom: 15px; text-align: center; line-height: 1.6;">
                Ты израсходовал все свои шансы.<br>
                Единственный способ вернуть общение — <strong>авторизоваться</strong> и попросить прощения.
            </div>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button id="finalLoginBtn" style="padding: 12px 25px; background: linear-gradient(135deg, #a855f7, #c084fc); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; transition: all 0.3s;">
                    Войти
                </button>
                <button id="finalRegisterBtn" style="padding: 12px 25px; background: linear-gradient(135deg, #6c757d, #8a939c); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; transition: all 0.3s;">
                    Регистрация
                </button>
            </div>
        `;

        const chatForm = document.getElementById('chatForm');
        const chatFoot = document.querySelector('.minko-ai-foot');
        if (chatForm) chatForm.style.display = 'none';
        if (chatFoot) chatFoot.appendChild(blockedPanel);

        // Добавляем обработчики кнопок через делегирование событий
        blockedPanel.addEventListener('click', (e) => {
            if (e.target.id === 'finalLoginBtn' || e.target.closest('#finalLoginBtn')) {
                e.preventDefault();
                const loginModal = document.getElementById('loginModal');
                if (loginModal) {
                    loginModal.classList.add('active');
                } else {
                    console.error('Модальное окно входа не найдено');
                }
            } else if (e.target.id === 'finalRegisterBtn' || e.target.closest('#finalRegisterBtn')) {
                e.preventDefault();
                const registerModal = document.getElementById('registerModal');
                if (registerModal) {
                    registerModal.classList.add('active');
                } else {
                    console.error('Модальное окно регистрации не найдено');
                }
            }
        });

        addMessage('assistant', 'Всё... Это конец. Ты потратил все свои шансы... 😢 Я больше не могу тебе доверять. Единственный способ всё исправить — авторизоваться и попросить у меня прощения. Но я не обещаю, что сразу прощу...');
    }

    // Проверить, просит ли пользователь прощения, и ответить
    async function checkApologyAndRespond(message) {
        const chatInputEl = document.getElementById('chatInput') || chatInput;
        const sendButtonEl = document.getElementById('sendButton') || sendButton;
        if (chatInputEl) chatInputEl.disabled = true;
        if (sendButtonEl) sendButtonEl.disabled = true;
        _setChatStatusText('Minko сонно думает… ✨💤');

        try {
            const apologyWords = ['прости', 'извини', 'сорри', 'sorry', 'прошу прощения', 'мне жаль', 'виноват', 'виновата', 'не буду', 'больше не буду', 'помиримся', 'помирись', 'мир', 'пожалуйста прости', 'я был не прав', 'я была не права', 'прощени'];
            const lowerMsg = message.toLowerCase();
            const isApology = apologyWords.some(w => lowerMsg.includes(w));

            if (isApology) {
                clearMinkoAngryState();
                resetUnauthAttempts();
                localStorage.removeItem(MINKO_FORGIVEN_COUNT_STORAGE_KEY);
                getAIResponseForForgiveness(true);
                unblockInput();
            } else {
                getAIResponseForForgiveness(false);
                _enableInputForApology();
            }
        } catch (error) {
            console.error('Ошибка проверки прощения:', error);
            getAIResponseForForgiveness(false);
            _enableInputForApology();
        } finally {
            const stillAngry = typeof getMinkoAngryState === 'function' ? getMinkoAngryState() : null;
            if (stillAngry && stillAngry.blockedForever) {
                _enableInputForApology();
            } else {
                if (chatInputEl) chatInputEl.disabled = false;
                if (sendButtonEl) sendButtonEl.disabled = false;
            }
            _setSleepyIdleStatus();
        }
    }

    // Получить ответ о прощении (заготовленные фразы)
    function getAIResponseForForgiveness(isApology) {
        const currentUser = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
        let userGender = 'male';
        if (currentUser && currentUser.id && typeof getUserData === 'function') {
            const userData = getUserData(currentUser.id);
            if (userData && userData.gender) {
                userGender = userData.gender;
            }
        }
        
        let message = '';
        
        if (isApology) {
            if (userGender === 'female') {
                message = 'Хорошо... Я прощаю тебя, но только потому что ты попросилА прощения! 😊 Больше так не делай, окей? Теперь можем нормально общаться!';
            } else {
                message = 'Хорошо... Я прощаю тебя, но только потому что ты попросил прощения! 😊 Больше так не делай, окей? Теперь можем нормально общаться!';
            }
        } else {
            message = 'Я все еще обижаюсь на тебя... 😤';
        }
        
        addMessage('assistant', message);
    }

    // Показать прощение после таймаута (заготовленные фразы)
    function showForgivenessAfterTimeout(forgivenCount) {
        // Увеличиваем счетчик прощений после определения текущего значения
        const newForgivenCount = incrementForgivenCount();
        
        const currentUser = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
        let userGender = 'male';
        if (currentUser && currentUser.id && typeof getUserData === 'function') {
            const userData = getUserData(currentUser.id);
            if (userData && userData.gender) {
                userGender = userData.gender;
            }
        }
        
        let message = '';
        
        // Используем новый счетчик (уже увеличенный) для определения сообщения
        if (newForgivenCount === 1) {
            if (userGender === 'female') {
                message = 'Ладно... На этот раз я прощаю тебя, но только потому что я добрая! 😊 Если ты снова попытаешься общаться без авторизации, я буду долго дуться, так что лучше сразу авторизуйся, окей?';
            } else {
                message = 'Ладно... На этот раз я прощаю тебя, но только потому что я добрая! 😊 Если ты снова попытаешься общаться без авторизации, я буду долго дуться, так что лучше сразу авторизуйся, окей?';
            }
        } else if (newForgivenCount >= 2) {
            message = 'Нуу... Хорошо, я даю тебе еще шанс... 😔 Но это ТРЕТИЙ и ПОСЛЕДНИЙ раз! Если ты снова попытаешься писать мне без авторизации, я окончательно обижусь и не буду общаться с тобой! Понятно?!!';
        } else {
            // Первое прощение (forgivenCount был 0)
            if (userGender === 'female') {
                message = 'Ладно... На этот раз я прощаю тебя, но только потому что я добрая! 😊 Если ты снова попытаешься общаться без авторизации, я буду долго дуться, так что лучше сразу авторизуйся, окей?';
            } else {
                message = 'Ладно... На этот раз я прощаю тебя, но только потому что я добрая! 😊 Если ты снова попытаешься общаться без авторизации, я буду долго дуться, так что лучше сразу авторизуйся, окей?';
            }
        }

        // Проверяем, авторизован ли пользователь
        const isAuth = typeof isAuthenticatedSync === 'function' ? isAuthenticatedSync() : false;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-assistant';
        messageDiv.innerHTML = `
            <div class="message-avatar">
                ${_minkoAvatarHtml('bubble')}
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    <p>${message}</p>
                </div>
            </div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Показываем кнопки авторизации только если пользователь не авторизован
        if (!isAuth) {
            setTimeout(() => {
                showAuthButtons();
            }, 100);
        }
    }

    // Показать сообщение о постоянной блокировке (заготовленная фраза)
    function showBlockedForeverMessage() {
        let message = 'Всё... Хватит... Я больше не могу... Тебе так сложно было авторизоваться? Не ужели ты и в реальности так поступаешь с людьми? Тебя прощают... Просят больше так не делать... А ты... Продолжаешь... Я...я больше не хочу с тобой общаться... Пожалуйста не пиши мне больше...';

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-assistant';
        messageDiv.innerHTML = `
            <div class="message-avatar">
                ${_minkoAvatarHtml('bubble')}
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    <p>${message}</p>
                </div>
            </div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Показать специальную панель при постоянной блокировке
    function showBlockedForeverPanel() {
        const chatForm = document.getElementById('chatForm');
        const chatFoot = document.querySelector('.minko-ai-foot');
        
        if (chatForm) chatForm.style.display = 'none';
        
        let blockedPanel = document.getElementById('blockedForeverPanel');
        if (!blockedPanel) {
            blockedPanel = document.createElement('div');
            blockedPanel.id = 'blockedForeverPanel';
            blockedPanel.style.cssText = 'padding: 20px; text-align: center; background: rgba(239,83,80,0.12); border-radius: 10px; border: 2px solid #ef5350;';
            blockedPanel.innerHTML = `
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #c62828; font-size: 16px;">
                    Minko не хочет с тобой говорить!
                </p>
                <p style="margin: 0 0 15px 0; color: #bbb; font-size: 14px;">
                    Единственный способ вернуть общение — авторизоваться и попросить прощения.
                </p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button id="blockedLoginBtn" style="padding: 10px 20px; font-size: 14px; background: linear-gradient(135deg, #a855f7, #c084fc); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                        Войти
                    </button>
                    <button id="blockedRegisterBtn" style="padding: 10px 20px; font-size: 14px; background: linear-gradient(135deg, #6c757d, #8a939c); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                        Регистрация
                    </button>
                </div>
            `;
            
            const parent = chatFoot || chatForm?.parentElement;
            if (parent) {
                parent.appendChild(blockedPanel);
            }
            
            // Обработчики кнопок авторизации
            const blockedLoginBtn = document.getElementById('blockedLoginBtn');
            const blockedRegisterBtn = document.getElementById('blockedRegisterBtn');
            
            if (blockedLoginBtn) {
                blockedLoginBtn.addEventListener('click', () => {
                    const loginModal = document.getElementById('loginModal');
                    if (loginModal) {
                        loginModal.classList.add('active');
                    }
                });
            }
            
            if (blockedRegisterBtn) {
                blockedRegisterBtn.addEventListener('click', () => {
                    const registerModal = document.getElementById('registerModal');
                    if (registerModal) {
                        registerModal.classList.add('active');
                    }
                });
            }
        }
    }



    // УДАЛЕНО: Функция анимации прощения с подарками
    /*
    function showForgivenessAnimation(item, resultPercent, forgiven) {
        // Закрываем панели магазина
        const detailsPanel = document.getElementById('itemDetailsPanel');
        if (detailsPanel) {
            detailsPanel.remove();
        }
        const shopPanel = document.getElementById('shopPanel');
        if (shopPanel) {
            shopPanel.remove();
        }

        // Создаем сообщение с анимацией
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-assistant';
        messageDiv.id = 'forgivenessAnimationMessage';
        
        const chanceMarkers = [
            { value: 30, label: '30%', item: 'flowers' },
            { value: 60, label: '60%', item: 'iphone' },
            { value: 99, label: '99%', item: 'bugatti' }
        ];

        messageDiv.innerHTML = `
            <div class="message-avatar">
                ${_minkoAvatarHtml('bubble')}
            </div>
            <div class="message-content">
                <div class="message-bubble" style="background: rgba(30, 30, 40, 0.95); border: 2px solid rgba(168, 85, 247, 0.4);">
                    <div style="margin-bottom: 15px; color: #ffffff; font-weight: bold;">
                        Проверка шанса прощения для "${item.name}"...
                    </div>
                    <div style="position: relative; margin-bottom: 20px;">
                        <!-- Шкала -->
                        <div style="width: 100%; height: 40px; background: rgba(255, 255, 255, 0.1); border-radius: 20px; overflow: hidden; position: relative; border: 2px solid rgba(168, 85, 247, 0.3);">
                            <!-- Зона прощения (зеленая) -->
                            <div style="position: absolute; left: 0; top: 0; width: ${item.forgivenessChance}%; height: 100%; background: rgba(76, 175, 80, 0.3); border-radius: 20px 0 0 20px;"></div>
                            <!-- Зона неудачи (красная) -->
                            <div style="position: absolute; left: ${item.forgivenessChance}%; top: 0; width: ${100 - item.forgivenessChance}%; height: 100%; background: rgba(244, 67, 54, 0.2);"></div>
                            <!-- Заполнение (анимация) -->
                            <div id="forgivenessBarFill" style="height: 100%; width: 0%; background: linear-gradient(90deg, #a855f7, #c084fc, #e879f9); transition: width 2s ease-out; border-radius: 20px; box-shadow: 0 0 20px rgba(168, 85, 247, 0.6); position: absolute; top: 0; left: 0;"></div>
                            <!-- Граница шанса прощения -->
                            <div style="position: absolute; left: ${item.forgivenessChance}%; top: 0; width: 3px; height: 100%; background: #ff9800; transform: translateX(-50%); z-index: 2;">
                                <div style="position: absolute; top: -25px; left: 50%; transform: translateX(-50%); color: #ff9800; font-size: 12px; font-weight: bold; white-space: nowrap;">
                                    ${item.forgivenessChance}%
                                </div>
                            </div>
                            <!-- Результат (выпавший процент) -->
                            <div id="forgivenessResult" style="position: absolute; top: 50%; left: ${resultPercent}%; transform: translate(-50%, -50%); color: #ffffff; font-weight: bold; font-size: 14px; text-shadow: 0 0 10px rgba(0, 0, 0, 0.8); opacity: 0; transition: opacity 0.5s; z-index: 3; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px;">
                                ${resultPercent.toFixed(1)}%
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 11px; color: #999;">
                            <span style="color: #4caf50;">← Зона прощения</span>
                            <span style="color: #f44336;">Зона неудачи →</span>
                        </div>
                    </div>
                    <div id="forgivenessResultText" style="color: #e5e7eb; font-weight: bold; opacity: 0; transition: opacity 0.5s;">
                        <!-- Текст результата появится после анимации -->
                    </div>
                </div>
            </div>
        `;

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Анимация заполнения шкалы
        setTimeout(() => {
            const barFill = document.getElementById('forgivenessBarFill');
            if (barFill) {
                barFill.style.width = resultPercent + '%';
            }

            // Показываем результат через 2 секунды
            setTimeout(() => {
                const resultMarker = document.getElementById('forgivenessResult');
                const resultText = document.getElementById('forgivenessResultText');
                
                if (resultMarker) {
                    resultMarker.style.opacity = '1';
                }

                if (resultText) {
                    if (forgiven) {
                        resultText.innerHTML = `✅ Успешно! Выпало ${resultPercent.toFixed(1)}% — это в пределах ${item.forgivenessChance}%, прощение получено!`;
                        resultText.style.color = '#4caf50';
                    } else {
                        resultText.innerHTML = `❌ Неудача. Выпало ${resultPercent.toFixed(1)}% — это больше ${item.forgivenessChance}%, нужно было меньше!`;
                        resultText.style.color = '#f44336';
                    }
                    resultText.style.opacity = '1';
                }

                // Через еще 1 секунду показываем результат
                setTimeout(() => {
                    if (forgiven) {
                        // Прощение получено через подарок
                        clearMinkoAngryState();
                        resetUnauthAttempts();
                        localStorage.removeItem(MINKO_FORGIVEN_COUNT_STORAGE_KEY);
                        unblockInput();
                        
                        // Увеличиваем счётчик покупок подарков
                        const giftPurchases = incrementGiftPurchases();
                        
                        // Начинаем испытательный срок
                        startTrial();
                        
                        // Удаляем панель блокировки
                        const blockedPanel = document.getElementById('blockedForeverPanel');
                        if (blockedPanel) {
                            blockedPanel.remove();
                        }
                        
                        // Показываем сообщение о прощении с предупреждением об испытательном сроке
                        let message = '';
                        const remainingPurchases = MAX_GIFT_PURCHASES - giftPurchases;
                        
                        if (item.id === 'flowers') {
                            message = 'Хм... Цветы и конфеты? 😊 Ладно, я прощаю тебя!';
                        } else if (item.id === 'iphone') {
                            message = 'Вау! iPhone?! 😍 Хорошо, я прощаю тебя!';
                        } else if (item.id === 'bugatti') {
                            message = 'БУГАТТИ?! 😱 ОМГ! Я... я прощаю тебя! Ты такой щедрый!';
                        }
                        
                        // Добавляем предупреждение об испытательном сроке
                        if (remainingPurchases > 0) {
                            message += `\n\nНо учти — это испытательный срок! У тебя есть ${MAX_TRIAL_MESSAGES} сообщений, чтобы авторизоваться. Если не авторизуешься — я снова обижусь! 😤`;
                            message += `\n\n💝 Осталось попыток купить прощение: ${remainingPurchases} из ${MAX_GIFT_PURCHASES}`;
                        } else {
                            message += `\n\nЭто был твой ПОСЛЕДНИЙ подарок! 🎁 У тебя ${MAX_TRIAL_MESSAGES} сообщений. Если не авторизуешься — я обижусь НАВСЕГДА и подарки больше не помогут! 😠`;
                        }
                        
                        // Удаляем анимационное сообщение
                        const animMessage = document.getElementById('forgivenessAnimationMessage');
                        if (animMessage) {
                            animMessage.remove();
                        }
                        
                        addMessage('assistant', message);
                    } else {
                        // Прощение не получено - обновляем текст в сообщении
                        if (resultText) {
                            resultText.innerHTML += '<br><br>Попробуй еще раз или выбери другой подарок! 😔';
                        }
                    }
                }, 1000);
            }, 2000);
        }, 100);
    }
    */

    // Показать сообщение о возможности попросить прощения (заготовленная фраза)
    function showForgivenessMessage() {
        try {
            if (sessionStorage.getItem('minko_forgive_prompt_v1') === '1') return;
        } catch (_) {
            /* ignore */
        }

        const alreadyInDom = chatMessages
            ? Array.from(chatMessages.querySelectorAll('.message-assistant .message-bubble, .message-assistant .minko-msg-bubble')).some(
                  (el) => /все еще дуюсь на тебя/i.test(el.textContent || '')
              )
            : false;
        if (alreadyInDom) {
            try {
                sessionStorage.setItem('minko_forgive_prompt_v1', '1');
            } catch (_) {
                /* ignore */
            }
            return;
        }

        const currentUser = typeof getCurrentUserSync === 'function' ? getCurrentUserSync() : null;
        let userGender = 'male';
        if (currentUser && currentUser.id && typeof getUserData === 'function') {
            const userData = getUserData(currentUser.id);
            if (userData && userData.gender) {
                userGender = userData.gender;
            }
        }

        const message =
            userGender === 'female'
                ? 'Хорошо, ты авторизовалАсь... Но я все еще дуюсь на тебя! 😤 Проси прощение, хи-хи'
                : 'Хорошо, ты авторизовался... Но я все еще дуюсь на тебя! 😤 Проси прощение, хи-хи';

        try {
            sessionStorage.setItem('minko_forgive_prompt_v1', '1');
        } catch (_) {
            /* ignore */
        }

        addMessage('assistant', message);
    }

    function addMessage(role, content, third) {
        const chatMessagesEl = document.getElementById('chatMessages');
        if (!chatMessagesEl) {
            console.error('addMessage: chatMessages не найден');
            return;
        }

        const options = third && typeof third === 'object' ? third : null;
        const userAvatar = options ? options.userAvatar || '' : third || '';

        const messageDiv = document.createElement('div');
        messageDiv.className = `minko-msg message message-${role}`;

        if (role === 'user') {
            const avatarHtml = _minkoUserAvatarImgHtml(userAvatar);
            messageDiv.innerHTML = `
                <div class="minko-msg-body message-content">
                    <div class="minko-msg-meta"><span class="minko-msg-name">Вы</span></div>
                    <div class="minko-msg-bubble message-bubble">
                        <p>${escapeHtml(content)}</p>
                    </div>
                </div>
                <div class="minko-msg-avatar message-avatar">${avatarHtml}</div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="minko-msg-avatar message-avatar minko-msg-avatar--video">
                    ${_minkoAvatarHtml('bubble')}
                </div>
                <div class="minko-msg-body message-content">
                    <div class="minko-msg-meta"><span class="minko-msg-name">Minko</span></div>
                    <div class="minko-msg-bubble message-bubble">
                        ${formatMessage(content)}
                    </div>
                </div>
            `;
        }

        if (role === 'assistant' && options) {
            const um = String(options.userMessage || '');
            const bubble = messageDiv.querySelector('.message-bubble');
            const contentStr = String(content || '');

            if (Array.isArray(options.catalogHits) && options.catalogHits.length) {
                const alreadyLinked = /\[\[watch:/i.test(contentStr);
                // «сколько серий / какая последняя» — не вешаем чужие «Смотреть»
                const factOnly =
                    /скольк|какая\s+последн|какая\s+сери|последн\w*\s+сери|сколько\s+сери|эпизод\w*\s+вышл/i.test(
                        um
                    );
                const wantsWatch =
                    !factOnly &&
                    /смотр|открой|найди|дай\s*ссыл|перейд|где\s*смотр|watch|посмотр|тайтл|рекоменд|похож/i.test(
                        um
                    );
                if (!alreadyLinked && (wantsWatch || (!factOnly && options.catalogHits.length === 1))) {
                    const cards = _buildCatalogWatchCardsHtml(options.catalogHits);
                    if (bubble && cards) bubble.insertAdjacentHTML('beforeend', cards);
                }
            }

            // Разделы — только кнопки (анонсы / календарь / сайт / инфо)
            const alreadyNav = /\[\[nav:/i.test(contentStr) || (bubble && bubble.querySelector('[data-minko-nav]'));
            if (!alreadyNav && bubble) {
                const wantsAnnounced =
                    /анонс|премьер|скоро\s+выйд|где\s+(смотреть|смотреть\s+)?анонс|каталог.*(анонс|премьер)/i.test(
                        um
                    );
                const wantsCalendar =
                    /календар|расписан\w*\s+сери|когда\s+выйд|таймер\w*\s+сери/i.test(um) &&
                    !/анонс/i.test(um);
                const wantsSiteOrInfo =
                    /реальн\w*\s+(имя|данн|фамил)|настоящ\w*\s+имя|личн\w*\s+данн|сервер|хостинг|инфраструктур|стек|бд\b|база\s*данн|бэкенд|фреймворк|прокси|api|ключ|админк|исходник|клонир|скопир|взять\s+с\s+сайт|на\s+ч(ё|е)м\s+(сайт|написан)|как\s+(сделан|устроен)\s+сайт|поддержк|связаться|контакт|кто\s+такой\s+дубин|про\s+дубин/i.test(
                        um
                    );
                if (wantsAnnounced) {
                    bubble.insertAdjacentHTML(
                        'beforeend',
                        `<div class="minko-watch-chips" role="group"><a class="minko-watch-chip minko-watch-chip--nav" href="catalog/anime.html?status=${encodeURIComponent('Анонс')}" data-minko-nav="1"><span class="minko-watch-chip__label">Открыть</span><span class="minko-watch-chip__title">Каталог: Анонсы</span></a></div>`
                    );
                } else if (wantsCalendar) {
                    bubble.insertAdjacentHTML(
                        'beforeend',
                        `<div class="minko-watch-chips" role="group"><a class="minko-watch-chip minko-watch-chip--nav" href="catalog/calendar.html" data-minko-nav="1"><span class="minko-watch-chip__label">Открыть</span><span class="minko-watch-chip__title">Календарь</span></a></div>`
                    );
                } else if (wantsSiteOrInfo) {
                    // Без лишней кнопки главной — только Сообщения + Инфо
                    bubble.insertAdjacentHTML(
                        'beforeend',
                        `<div class="minko-watch-chips" role="group">` +
                            `<a class="minko-watch-chip minko-watch-chip--nav" href="messages.html" data-minko-nav="1"><span class="minko-watch-chip__title">Сообщения</span></a>` +
                            `<a class="minko-watch-chip minko-watch-chip--nav" href="info.html" data-minko-nav="1"><span class="minko-watch-chip__title">Инфо</span></a>` +
                            `</div>`
                    );
                }
            }
        }

        chatMessagesEl.appendChild(messageDiv);
        _scrollChatToBottom();
        return messageDiv;
    }

    window.__minkoPostWakeApology = function () {
        if (_isMinkoDeepAsleep() > 0) return;
        const line = MINKO_WAKE_SORRY_LINES[Math.floor(Math.random() * MINKO_WAKE_SORRY_LINES.length)];
        addMessage('assistant', line);
        try {
            chatHistory.push({ role: 'assistant', content: line });
            _saveChatToStorage();
        } catch (_) {
            /* ignore */
        }
    };

    function _buildCatalogWatchCardsHtml(hits) {
        if (!Array.isArray(hits) || !hits.length) return '';
        const seen = new Set();
        const cards = [];
        for (const h of hits) {
            if (!h || h.id == null) continue;
            const id = String(h.id);
            if (seen.has(id)) continue;
            seen.add(id);
            const href = h.href || `anime/view.html?id=${encodeURIComponent(id)}`;
            const title = escapeHtml(String(h.title || 'Смотреть'));
            cards.push(
                `<a class="minko-watch-chip" href="${escapeHtml(href)}" data-minko-watch="1">` +
                    `<span class="minko-watch-chip__label">Смотреть</span>` +
                    `<span class="minko-watch-chip__title">${title}</span>` +
                    `</a>`
            );
            if (cards.length >= 4) break;
        }
        if (!cards.length) return '';
        return `<div class="minko-watch-chips" role="group" aria-label="Ссылки на просмотр">${cards.join('')}</div>`;
    }

    function _minkoNavChipHref(key) {
        const k = String(key || '')
            .trim()
            .toLowerCase();
        if (k === 'home' || k === 'site' || k === 're-minko' || k === 'reminko') return 'index.html';
        if (k === 'catalog-announced' || k === 'announced' || k === 'anons') {
            return 'catalog/anime.html?status=' + encodeURIComponent('Анонс');
        }
        if (k === 'catalog' || k === 'catalog-anime' || k === 'anime') {
            return 'catalog/anime.html';
        }
        if (k === 'calendar') return 'catalog/calendar.html';
        if (k === 'catalog-4k' || k === 'anime-4k' || k === '4k') return 'catalog/anime-4k.html';
        if (k === 'info' || k === 'support') return 'info.html';
        if (k === 'messages' || k === 'dm' || k === 'лс' || k === 'сообщения') return 'messages.html';
        if (k === 'giveaway') return 'info.html#giveaway';
        if (k === 'minko' || k === 'minko-ai') return 'minko-ai.html';
        return '';
    }

    function _minkoBuildInlineChipHtml(opts) {
        const href = String(opts.href || '').trim();
        const title = escapeHtml(String(opts.title || 'Открыть').trim());
        const kind = opts.kind === 'watch' ? 'watch' : 'nav';
        const label = opts.kind === 'watch' ? 'Смотреть' : '';
        const dataAttr = kind === 'watch' ? 'data-minko-watch="1"' : 'data-minko-nav="1"';
        const cls =
            'minko-watch-chip minko-watch-chip--inline' +
            (kind === 'nav' ? ' minko-watch-chip--nav' : '');
        const labelHtml = label
            ? `<span class="minko-watch-chip__label">${escapeHtml(label)}</span>`
            : '';
        return (
            `<a class="${cls}" href="${escapeHtml(href)}" ${dataAttr}>` +
            labelHtml +
            `<span class="minko-watch-chip__title">${title}</span>` +
            `</a>`
        );
    }

    function formatMessage(text) {
        const inlineStash = [];
        const pushChip = (html) => {
            const i = inlineStash.length;
            inlineStash.push(html);
            return `\u0000MKCHIP${i}\u0000`;
        };

        let raw = typeof _minkoStripReplyLinks === 'function' ? _minkoStripReplyLinks(text) : String(text || '');
        // markdown / URL → маркеры [[nav:…]]
        raw = raw.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/gi, (_, label, href) => {
            return _minkoUrlToNavMarker(href) || String(label || '').trim();
        });
        raw = raw.replace(/https?:\/\/(?:www\.)?re-minko-anime\.com\/?[^\s)\]>"']*/gi, (u) => {
            return _minkoUrlToNavMarker(u) || '[[nav:info|Инфо]]';
        });

        // Не спамить главной: если рядом уже есть Инфо/Сообщения — убрать home
        if (/\[\[nav:(info|messages|giveaway)\|/i.test(raw)) {
            raw = raw.replace(/\s*\[\[nav:home\|[^\]]+\]\]/gi, '');
        }
        // Дубликаты одного и того же nav подряд
        raw = raw.replace(/(\[\[nav:([a-z0-9_-]+)\|[^\]]+\]\])(?:\s*\[\[nav:\2\|[^\]]+\]\])+/gi, '$1');

        raw = raw.replace(/\[\[watch:(\d+)\|([^\]]{1,120})\]\]/gi, (_, id, title) => {
            let valid = true;
            try {
                if (typeof getAllAnime === 'function') {
                    const list = getAllAnime() || [];
                    if (list.length) {
                        valid = list.some((a) => a && String(a.id) === String(id));
                    }
                }
            } catch (_) {
                valid = true;
            }
            if (!valid) return String(title || '').trim();
            const href = `anime/view.html?id=${encodeURIComponent(String(id))}`;
            return pushChip(
                _minkoBuildInlineChipHtml({
                    href,
                    title: String(title).trim(),
                    kind: 'watch'
                })
            );
        });

        raw = raw.replace(/\[\[nav:([a-z0-9_-]+)\|([^\]]{1,80})\]\]/gi, (_, key, label) => {
            const href = _minkoNavChipHref(key);
            if (!href) return String(label || '').trim();
            return pushChip(
                _minkoBuildInlineChipHtml({
                    href,
                    title: String(label).trim(),
                    kind: 'nav'
                })
            );
        });

        raw = raw.replace(/\n{3,}/g, '\n\n').trim();
        // Убрать двойные пробелы / «висячие» пробелы у точек после вырезания маркеров
        raw = raw.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?…])/g, '$1');

        raw = escapeHtml(raw);
        raw = raw.replace(/\n/g, '<br>');
        raw = raw.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
        raw = raw.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        raw = raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Вернуть inline-кнопки на место в тексте
        raw = raw.replace(/\u0000MKCHIP(\d+)\u0000/g, (_, idx) => {
            const chip = inlineStash[Number(idx)];
            return chip || '';
        });

        return '<p>' + raw.split('<br><br>').join('</p><p>') + '</p>';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
});

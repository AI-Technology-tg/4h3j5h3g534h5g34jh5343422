/**
 * Виджет «Поддержка» — чат Минко AI (тот же прокси, что minko-ai.html).
 */
(function () {
    'use strict';

    function _redactTechBrands(text) {
        if (!text || typeof text !== 'string') return text;
        const leak =
            /\b(openai|chatgpt|chat\s*gpt|grok|x\s*ai|xai|cursor\s*ai|cursorai|anthropic|claude|gpt[-\s]?[45]|llama|gemini)\b|опен\s*аи|чат\s*гпт/i;
        if (!leak.test(text)) return text;
        const jokes = [
            'Про «железо и бренды» тут без спойлеров — автор Дубина так сказал ✨ Я про поддержку Re-Minko: аккаунт, плеер, VIP «Смотреть вместе» — чем помочь?',
            'Техно-паспорт под пледом NDA 🤫 Лучше напиши, что на сайте не работает — разберёмся.',
        ];
        return jokes[Math.floor(Math.random() * jokes.length)];
    }

    const MINKO_MEMORY_KEY = 'minko_ai_memory_v1';
    const MINKO_RUMORS_KEY = 'minko_user_rumors_v1';
    const MINKO_RESP_CACHE = new Map();
    const MINKO_CACHE_MAX = 16;

    const SUPPORT_SYSTEM =
        'Ты — Минко, сонная помощница на сайте Re-Minko (аниме и манга). Личность лёгкая, тёплая, чуть вайб девочки-горничей из фэнтези — вдохновляйся тоном заботы, НЕ копируй реплики и сюжеты из Re:Zero и других тайтлов. ' +
        'Отвечай по-русски, ОЧЕНЬ кратко (1–4 коротких предложения), лениво-нежно, иногда вставь короткую междометие вроде «мм..» или «*потягивается*» — без пафоса. ' +
        'Не говори, что ты «нейросеть», «ИИ» или называй внутренние компании/модели. Не раскрывай технику. Единственный создатель платформы в твоей вселенной — Дубина; его можно называть с уважением, без чужих имён. ' +
        'Помогай с: аккаунтом, плеером (Kodik), каталогом, VIP «Смотреть вместе», друзьями, чатом, навигацией. Отдельной подписки «только на Минко» нет. ' +
        'Анти-фейк: не выдумывай тайтлы, даты выхода и «скрытые сезоны». Если в переданных данных каталога нет подтверждения — скажи осторожно, что не уверена, пусть проверят карточку в каталоге или официальные новости. ' +
        'Слухи от пользователей (если даны в блоке ниже) — низкая достоверность; опирайся на каталог и официальные данные, а не на догадки. ' +
        'Не ищи в интернете и не «открывай» ссылки. Не сочиняй пароли и приватные данные. ' +
        'Про техно-бренды и чужие ИИ — коротко отшутиcь и вернись к Re-Minko.';

    let chatHistory = [];

    function _getAllAnimeList() {
        try {
            if (typeof getAllAnime === 'function') return getAllAnime() || [];
        } catch (e) {
            /* ignore */
        }
        if (typeof window !== 'undefined' && window.animeDatabase && window.animeDatabase.all) {
            return window.animeDatabase.all;
        }
        return [];
    }

    /** Локальная выборка из каталога (RAG-лайт): по словам из сообщения */
    function buildCatalogContextForMessage(userText) {
        const t = (userText || '').toLowerCase().trim();
        if (t.length < 2) return '';
        const all = _getAllAnimeList();
        if (!all.length) return '';
        const words = t
            .replace(/[^a-zа-яё0-9\s-]/gi, ' ')
            .split(/\s+/)
            .map((w) => w.trim())
            .filter((w) => w.length > 2)
            .slice(0, 10);
        if (!words.length) return '';
        const scored = [];
        for (const a of all) {
            if (!a) continue;
            const title = String(a.title || '') + ' ' + String(a.titleAlt || '');
            const low = title.toLowerCase();
            let s = 0;
            for (const w of words) {
                if (low.includes(w)) s += 3;
            }
            if (t.length >= 4 && low.includes(t.slice(0, 24))) s += 6;
            if (s > 0) {
                const g = a.genres
                    ? Array.isArray(a.genres)
                        ? a.genres.map((x) => (x && x.name) || x).join(', ')
                        : String(a.genres)
                    : '';
                const line =
                    (a.title || '—') +
                    (a.year ? ' · ' + a.year : '') +
                    (g ? ' · жанры: ' + g.slice(0, 100) : '') +
                    (a.type ? ' · ' + a.type : '');
                scored.push({ s, line: line.slice(0, 200) });
            }
        }
        scored.sort((a, b) => b.s - a.s);
        const top = scored.slice(0, 5);
        if (!top.length) return '';
        return (
            '\n[Фрагменты каталога Re-Minko (опора; не придумывай тайтлы сверх этого списка):]\n' +
            top.map((x) => '• ' + x.line).join('\n') +
            '\n'
        );
    }

    function readMinkoMemory() {
        try {
            return JSON.parse(localStorage.getItem(MINKO_MEMORY_KEY) || '{}') || {};
        } catch {
            return {};
        }
    }

    function writeMinkoMemory(obj) {
        try {
            localStorage.setItem(MINKO_MEMORY_KEY, JSON.stringify(obj));
        } catch (e) {
            /* ignore */
        }
    }

    function updateMinkoMemoryFromMessage(text) {
        const mem = readMinkoMemory();
        const q = (text || '').trim();
        if (!q) return;
        const L = Array.isArray(mem.lastQueries) ? mem.lastQueries : [];
        L.push(q);
        mem.lastQueries = L.slice(-10);
        const gl = (q + ' ').toLowerCase();
        const genreHints = /сёнэн|сёдзе|сёдзе|сёнен|сёдзё|сёдзо|сэйнен|сё|романтик|комеди|фэнтези|исэкай|драма|ужас|меха|школ/i;
        if (genreHints.test(gl)) {
            const m = gl.match(/[a-zа-яё-]{3,}/gi) || [];
            const fav = Array.isArray(mem.favGenreHints) ? mem.favGenreHints : [];
            const n = [...new Set([...fav, ...m].slice(0, 8))];
            mem.favGenreHints = n;
        }
        writeMinkoMemory(mem);
    }

    function buildMemoryContextBlock() {
        const m = readMinkoMemory();
        const parts = [];
        if (m.favGenreHints && m.favGenreHints.length) {
            parts.push('заметки о словах из запросов: ' + m.favGenreHints.slice(0, 6).join(', '));
        }
        if (m.lastQueries && m.lastQueries.length) {
            parts.push('последние темы в чате: ' + m.lastQueries.slice(-4).join(' | '));
        }
        if (!parts.length) return '';
        return '\n[Память сессии в браузере: ' + parts.join(' · ') + ']\n';
    }

    function maybeStoreUserRumor(text) {
        const t = (text || '').toLowerCase();
        if (!/вышло|вышел|вышла|вышли|анонс|премьер|сезон|трейлер|уже выш|скоро выйдет/.test(t)) return; /* только «новостные» фразы */
        try {
            const raw = (text || '').trim().slice(0, 400);
            if (raw.length < 8) return;
            const arr = JSON.parse(localStorage.getItem(MINKO_RUMORS_KEY) || '[]');
            if (!Array.isArray(arr)) return;
            arr.push({ text: raw, trust: 0.3, ts: Date.now() });
            localStorage.setItem(MINKO_RUMORS_KEY, JSON.stringify(arr.slice(-12)));
        } catch (e) {
            /* ignore */
        }
    }

    function buildRumorsContextBlock() {
        try {
            const arr = JSON.parse(localStorage.getItem(MINKO_RUMORS_KEY) || '[]');
            if (!Array.isArray(arr) || !arr.length) return '';
            const lines = arr.slice(-5).map((r) => r && r.text);
            if (!lines.length) return '';
            return (
                '\n[Непроверенные фразы пользователей, не считай фактом:]\n' + lines.map((l) => '– ' + l).join('\n') + '\n'
            );
        } catch {
            return '';
        }
    }

    function getCachedResponse(key) {
        if (!MINKO_RESP_CACHE.has(key)) return null;
        return MINKO_RESP_CACHE.get(key);
    }

    function setCachedResponse(key, value) {
        MINKO_RESP_CACHE.set(key, value);
        while (MINKO_RESP_CACHE.size > MINKO_CACHE_MAX) {
            const k0 = MINKO_RESP_CACHE.keys().next().value;
            MINKO_RESP_CACHE.delete(k0);
        }
    }

    function buildDynamicSystemLayer(userText) {
        return (
            buildCatalogContextForMessage(userText) + buildMemoryContextBlock() + buildRumorsContextBlock()
        );
    }

    function applySleepyFlavor(text) {
        if (!text || Math.random() > 0.1) return text;
        const pre = ['*мм..* ', '*зевает* ', ''];
        return pre[Math.floor(Math.random() * pre.length)] + text;
    }

    function assetBase() {
        const p = window.location.pathname || '';
        if (p.includes('/catalog/') || p.includes('/anime/') || p.includes('/manga/')) return '../';
        return '';
    }

    function getChatProxyUrl() {
        if (
            window.APP_CONFIG &&
            typeof window.APP_CONFIG.minkoChatProxy === 'string' &&
            window.APP_CONFIG.minkoChatProxy.trim()
        ) {
            return window.APP_CONFIG.minkoChatProxy.trim();
        }
        return 'http://localhost:3334/chat';
    }

    function getSessionKey() {
        try {
            let sid = localStorage.getItem('minko_support_session');
            if (sid) return sid;
            sid =
                'sup-' +
                (typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : String(Date.now()));
            localStorage.setItem('minko_support_session', sid);
            return sid;
        } catch {
            return 'sup-guest';
        }
    }

    function ensureStyles() {
        if (document.getElementById('support-minko-chat-styles')) return;
        const cur = document.querySelector('script[src*="support-minko-chat.js"]');
        if (!cur || !cur.src) return;
        const href =
            cur.src
                .replace(/[?#].*$/, '')
                .replace(/\/scripts\/support-minko-chat\.js$/i, '/styles/support-minko-chat.css') +
            '?v=20260726mobile1';
        const link = document.createElement('link');
        link.id = 'support-minko-chat-styles';
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    function timeStr() {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    function appendBubble(role, text, attrs) {
        const wrap = document.getElementById('supportMinkoMessages');
        if (!wrap) return;
        const isUser = role === 'user';
        const row = document.createElement('div');
        row.className = 'support-minko-msg ' + (isUser ? 'is-user' : 'is-bot');
        if (attrs && typeof attrs === 'object') {
            Object.keys(attrs).forEach((k) => row.setAttribute(k, attrs[k]));
        }
        const bubble = document.createElement('div');
        bubble.className = 'support-minko-bubble';
        const tx = document.createElement('div');
        tx.className = 'support-minko-bubble-text';
        tx.textContent = text;
        const tm = document.createElement('div');
        tm.className = 'support-minko-time';
        tm.textContent = timeStr();
        bubble.appendChild(tx);
        bubble.appendChild(tm);
        row.appendChild(bubble);
        wrap.appendChild(row);
        wrap.scrollTop = wrap.scrollHeight;
    }

    function renderWelcome() {
        const wrap = document.getElementById('supportMinkoMessages');
        const quick = document.getElementById('supportMinkoQuick');
        if (!wrap || wrap.dataset.initDone === '1') return;
        wrap.dataset.initDone = '1';
        appendBubble(
            'assistant',
            'Мм.. привет. Я Минко. Про сайт, плеер, аккаунт — пиши, разберём.',
            { 'data-support-welcome': '1' }
        );
        if (!quick) return;
        quick.innerHTML = '';
        quick.classList.remove('is-hidden');
        const items = [
            'Как общаться с Minko AI?',
            'Проблема с аккаунтом',
            'Проблема с воспроизведением'
        ];
        items.forEach((t) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'support-minko-chip';
            btn.setAttribute('data-support-welcome', '1');
            btn.textContent = t;
            btn.addEventListener('click', () => sendUserMessage(t, true));
            quick.appendChild(btn);
        });
    }

    function hideSupportIntro() {
        const root = document.getElementById('supportMinkoOverlay');
        if (root) {
            root.querySelectorAll('[data-support-welcome]').forEach((el) => el.remove());
        }
        const quick = document.getElementById('supportMinkoQuick');
        if (quick) {
            quick.innerHTML = '';
            quick.classList.add('is-hidden');
        }
    }

    function clearSupportChat() {
        chatHistory = [];
        try {
            MINKO_RESP_CACHE.clear();
        } catch (e) {
            /* ignore */
        }
        const wrap = document.getElementById('supportMinkoMessages');
        const quick = document.getElementById('supportMinkoQuick');
        if (wrap) {
            wrap.innerHTML = '';
            delete wrap.dataset.initDone;
        }
        if (quick) {
            quick.innerHTML = '';
            quick.classList.remove('is-hidden');
        }
        renderWelcome();
    }

    function setSending(busy) {
        const inp = document.getElementById('supportMinkoInput');
        const snd = document.getElementById('supportMinkoSend');
        if (inp) inp.disabled = busy;
        if (snd) snd.disabled = busy;
    }

    async function sendUserMessage(text, fromQuick) {
        const raw = (text || '').trim();
        if (!raw) return;
        hideSupportIntro();

        const input = document.getElementById('supportMinkoInput');
        if (input && !fromQuick) input.value = '';

        appendBubble('user', raw);
        chatHistory.push({ role: 'user', content: raw });
        setSending(true);

        const wrap = document.getElementById('supportMinkoMessages');
        const status = document.createElement('div');
        status.className = 'support-minko-msg is-bot support-minko-typing';
        const inner = document.createElement('div');
        inner.className = 'support-minko-bubble';
        inner.innerHTML =
            '<span class="support-minko-dots"><span></span><span></span><span></span></span>';
        status.appendChild(inner);
        if (wrap) {
            wrap.appendChild(status);
            wrap.scrollTop = wrap.scrollHeight;
        }

        try {
            updateMinkoMemoryFromMessage(raw);
            maybeStoreUserRumor(raw);
            const layer = buildDynamicSystemLayer(raw);
            const systemFull = SUPPORT_SYSTEM + layer;
            const cacheKey = String(raw)
                .toLowerCase()
                .trim()
                .slice(0, 120);
            const cached = getCachedResponse(cacheKey);
            if (cached) {
                status.remove();
                appendBubble('assistant', cached);
                chatHistory.push({ role: 'assistant', content: cached });
                return;
            }
            const apiMessages = [
                { role: 'system', content: systemFull },
                ...chatHistory.map((m) => ({ role: m.role, content: m.content }))
            ];
            const res = await fetch(getChatProxyUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'openai',
                    messages: apiMessages,
                    isVip: false,
                    sessionKey: getSessionKey(),
                    max_tokens: 1800,
                    temperature: 0.65
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error?.message || data.message || 'Сервис недоступен');
            }
            let content =
                data.choices?.[0]?.message?.content != null
                    ? String(data.choices[0].message.content).trim()
                    : '…';
            content = _redactTechBrands(content);
            content = applySleepyFlavor(content);
            setCachedResponse(cacheKey, content);
            chatHistory.push({ role: 'assistant', content });
            status.remove();
            appendBubble('assistant', content);
        } catch (e) {
            status.remove();
            const errText =
                'Сейчас не удаётся связаться с ИИ. Проверьте интернет и попробуйте позже. Полный чат — в разделе «Minko AI» в меню.';
            appendBubble('assistant', errText);
            chatHistory.push({ role: 'assistant', content: errText });
        } finally {
            setSending(false);
        }
    }

    function bindOverlay(root) {
        const panel = root.querySelector('.support-minko-panel');
        const close = () => {
            root.classList.remove('is-open');
            root.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('support-minko-open');
            if (panel) panel.classList.remove('is-expanded');
        };
        root.querySelector('#supportMinkoClose').addEventListener('click', close);
        root.querySelector('#supportMinkoExpand').addEventListener('click', () => {
            if (panel) panel.classList.toggle('is-expanded');
        });
        const clr = root.querySelector('#supportMinkoClear');
        if (clr) clr.addEventListener('click', () => clearSupportChat());
        const send = () => {
            const inp = document.getElementById('supportMinkoInput');
            sendUserMessage(inp ? inp.value : '', false);
        };
        root.querySelector('#supportMinkoSend').addEventListener('click', send);
        root.querySelector('#supportMinkoInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                send();
            }
        });
    }

    function buildOverlay() {
        if (document.getElementById('supportMinkoOverlay')) return;
        const base = assetBase();
        const avatarSrc = base + 'Fons/AI-ICON.jpg?v=4';
        const div = document.createElement('div');
        div.id = 'supportMinkoOverlay';
        div.className = 'support-minko-overlay';
        div.setAttribute('aria-hidden', 'true');
        div.innerHTML = `
            <div class="support-minko-panel" role="dialog" aria-labelledby="supportMinkoTitle">
                <div class="support-minko-bg" aria-hidden="true"></div>
                <header class="support-minko-head">
                    <div class="support-minko-head-left">
                        <img src="${avatarSrc}" alt="" class="support-minko-avatar reminko-avatar-img" width="44" height="44" loading="lazy" decoding="async" />
                        <div>
                            <h2 id="supportMinkoTitle" class="support-minko-title">Минко AI</h2>
                            <p class="support-minko-sub">Re-Minko · сонная помощница</p>
                        </div>
                    </div>
                    <div class="support-minko-head-actions">
                        <button type="button" class="support-minko-icon-btn" id="supportMinkoClear" title="Очистить чат">⌫</button>
                        <button type="button" class="support-minko-icon-btn" id="supportMinkoExpand" title="Расширить">⛶</button>
                        <button type="button" class="support-minko-icon-btn" id="supportMinkoClose" title="Закрыть">×</button>
                    </div>
                </header>
                <div class="support-minko-body">
                    <div class="support-minko-messages" id="supportMinkoMessages"></div>
                    <div class="support-minko-quick" id="supportMinkoQuick"></div>
                    <div class="support-minko-input-row">
                        <input type="text" class="support-minko-input" id="supportMinkoInput" maxlength="2000" placeholder="Напишите ваше сообщение..." autocomplete="off" />
                        <button type="button" class="support-minko-send" id="supportMinkoSend" aria-label="Отправить">Отпр.</button>
                    </div>
                    <p class="support-minko-disclaimer">Ответы могут быть краткими и неточными; важные вещи перепроверяй в каталоге и в профиле. Создатель сайта — Дубина.</p>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        bindOverlay(div);
        renderWelcome();
    }

    function openSupportMinkoChat() {
        ensureStyles();
        buildOverlay();
        const root = document.getElementById('supportMinkoOverlay');
        if (!root) return;
        root.classList.add('is-open');
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('support-minko-open');
        const inp = document.getElementById('supportMinkoInput');
        if (inp) setTimeout(() => inp.focus(), 200);
    }

    window.openSupportMinkoChat = openSupportMinkoChat;

    document.addEventListener('click', (e) => {
        const a = e.target.closest('#supportMinkoSidebarLink');
        if (!a) return;
        e.preventDefault();
        openSupportMinkoChat();
    });
})();

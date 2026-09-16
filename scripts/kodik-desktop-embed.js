/**
 * Встраивание того же Kodik, что на anime/view: KodikCatalogResolve + iframe.
 * Для программы: /anime/kodik-embed.html?id=&episode=&link=&serial=&mal_id=&title=
 */
(function () {
    const PLAYER_HOSTS = [
        'kodikplayer.com',
        'kodikonline.com',
        'aniqit.com',
        'kodik.info',
        'kodik.org',
        'kodik.biz',
        'kodik.cc',
        'kodik-add.com'
    ];
    const FROM_DOMAINS = ['kodik.org', 'kodik.biz', 'kodik.cc', 'aniqit.com'];

    function hostAllowed(host) {
        const h = String(host || '').toLowerCase();
        return PLAYER_HOSTS.some((d) => h === d || h.endsWith('.' + d));
    }

    function toHttps(link) {
        if (!link || typeof link !== 'string') return '';
        const t = link.trim();
        if (t.startsWith('//')) return 'https:' + t;
        if (/^https?:\/\//i.test(t)) return t;
        return 'https://' + t.replace(/^\/+/, '');
    }

    function rewriteDomains(href) {
        try {
            const u = new URL(href);
            if (FROM_DOMAINS.some((d) => u.hostname === d || u.hostname.endsWith('.' + d))) {
                u.hostname = 'kodikplayer.com';
                u.protocol = 'https:';
            }
            return u.toString();
        } catch (_) {
            return href;
        }
    }

    function allowedPlayerHref(raw) {
        const href = rewriteDomains(toHttps(raw));
        try {
            const u = new URL(href);
            if (u.protocol !== 'https:') return '';
            return hostAllowed(u.hostname) ? u.toString() : '';
        } catch (_) {
            return '';
        }
    }

    function setStatus(text, visible) {
        const box = document.getElementById('status');
        const tx = document.getElementById('statusText');
        if (tx && text) tx.textContent = text;
        if (box) box.hidden = visible === false;
    }

    function mount(url) {
        const iframe = document.getElementById('kodikFrame');
        if (!iframe || !url) return;
        iframe.setAttribute('referrerpolicy', 'origin');
        iframe.src = url;
        setStatus('', false);
    }

    function readParams() {
        const q = new URLSearchParams(window.location.search);
        const episode = Math.max(1, parseInt(q.get('episode'), 10) || 1);
        const start = q.get('t');
        return {
            id: (q.get('id') || '').trim(),
            malId: (q.get('mal_id') || '').trim(),
            title: (q.get('title') || '').trim(),
            titleAlt: (q.get('title_alt') || '').trim(),
            year: (q.get('year') || '').trim(),
            serial: q.get('serial') !== '0',
            episode,
            startSeconds: start != null && start !== '' ? start : null,
            link: allowedPlayerHref(q.get('link') || '')
        };
    }

    async function resolveFromCatalog(params) {
        const store = window.KodikCatalogStore;
        const K = window.KodikCatalogResolve;
        if (!store || !K) throw new Error('Kodik не загружен');
        await store.load();
        let anime = params.id ? store.getById(params.id) : null;
        if (!anime && params.malId) {
            const mal = parseInt(params.malId, 10);
            anime = store.getAll().find((item) => Number(item.mal_id) === mal) || null;
        }
        if (!anime) {
            anime = {
                id: params.id || params.malId || params.title || 'desktop',
                title: params.title || params.titleAlt || 'anime',
                titleAlt: params.titleAlt || params.title,
                mal_id: params.malId ? parseInt(params.malId, 10) : undefined,
                type: params.serial ? 'Сериал' : 'Фильм',
                year: params.year,
                totalEpisodes: params.serial ? 2 : 1
            };
        }
        const base = await Promise.race([
            K.resolveEmbedBase(anime),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Kodik: превышено время ожидания')), 22000)
            )
        ]);
        return K.buildIframeUrl(rewriteDomains(base.href), base.isSerial, params.episode, params.startSeconds);
    }

    async function boot() {
        const params = readParams();
        const K = window.KodikCatalogResolve;
        if (!K || typeof K.buildIframeUrl !== 'function') {
            setStatus('Плеер Kodik не загрузился. Обновите программу или страницу.');
            return;
        }

        try {
            if (params.link) {
                mount(K.buildIframeUrl(params.link, params.serial, params.episode, params.startSeconds));
                return;
            }
            setStatus('Ищем релиз в каталоге Kodik…');
            const url = await resolveFromCatalog(params);
            const safe = allowedPlayerHref(url);
            if (!safe) throw new Error('По API ничего не найдено');
            mount(safe);
        } catch (error) {
            setStatus(
                error && String(error.message || '').includes('время ожидания')
                    ? 'Kodik не ответил вовремя. Попробуйте ещё раз.'
                    : 'Плеер Kodik временно недоступен для этого релиза.'
            );
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();

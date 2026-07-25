/**
 * Загрузка компактного каталога из data/kodik-anime-catalog.json (сборка: scripts/build/kodik-build-catalog.js).
 */
(function (global) {
    'use strict';

    let _items = [];
    let _byId = new Map();
    let _loaded = false;
    let _loading = null;
    let _meta = null;

    function catalogUrl() {
        const cfg = global.APP_CONFIG && global.APP_CONFIG.kodik;
        const rel = (cfg && cfg.catalogPath) || 'data/kodik-anime-catalog.json';
        if (/^https?:\/\//i.test(rel)) return rel;
        const base =
            (global.APP_CONFIG && global.APP_CONFIG.siteOrigin) ||
            (global.location && global.location.origin) ||
            '';
        const path = rel.replace(/^\//, '');
        if (base && !base.includes('localhost') && !String(global.location?.protocol).startsWith('file')) {
            return base.replace(/\/$/, '') + '/' + path;
        }
        const depth =
            global.location && global.location.pathname
                ? (global.location.pathname.match(/\//g) || []).length - 1
                : 0;
        const prefix = depth > 0 ? '../'.repeat(depth) : '';
        return prefix + path;
    }

    function sanitizeCatalogStatus(item) {
        if (!item || typeof item !== 'object') return item;
        const hasLink = !!(item._kodik && item._kodik.link);
        const last = parseInt(item._kodik && item._kodik.lastEpisode, 10);
        const released = Number.isFinite(last) ? Math.max(0, last) : 0;
        const st = String(item.status || '');
        if (st !== 'Анонс') return item;
        if (item.type === 'Фильм' && (hasLink || released >= 1)) {
            return { ...item, status: 'Завершён' };
        }
        if (item.type === 'Сериал' && released >= 1) {
            const total = parseInt(item.totalEpisodes, 10) || 0;
            if (total > 0 && released >= total) return { ...item, status: 'Завершён' };
            return { ...item, status: 'Онгоинг' };
        }
        return item;
    }

    function indexItems(list) {
        const raw = Array.isArray(list) ? list : [];
        _items = raw.map(sanitizeCatalogStatus);
        _byId = new Map();
        for (const a of _items) {
            if (a && a.id != null) _byId.set(parseInt(a.id, 10), a);
        }
    }

    function loadKodikCatalog(force) {
        if (_loaded && !force) return Promise.resolve(_items);
        if (_loading && !force) return _loading;

        _loading = fetch(catalogUrl(), { credentials: 'omit', cache: 'default' })
            .then((res) => {
                if (!res.ok) throw new Error('Kodik catalog HTTP ' + res.status);
                return res.json();
            })
            .then((data) => {
                _meta = data && data.meta ? data.meta : null;
                indexItems((data && data.items) || data || []);
                _loaded = true;
                try {
                    global.dispatchEvent(
                        new CustomEvent('reminko-kodik-catalog-loaded', { detail: { count: _items.length } })
                    );
                } catch (_) {
                    /* ignore */
                }
                return _items;
            })
            .catch((err) => {
                console.warn('[KodikCatalog]', err);
                indexItems([]);
                _loaded = true;
                return _items;
            })
            .finally(() => {
                _loading = null;
            });

        return _loading;
    }

    function getKodikCatalogAnime() {
        return _items.slice();
    }

    function getKodikAnimeById(id) {
        const n = parseInt(id, 10);
        if (Number.isNaN(n)) return undefined;
        return _byId.get(n);
    }

    function isKodikCatalogLoaded() {
        return _loaded;
    }

    function getKodikCatalogMeta() {
        return _meta;
    }

    /**
     * Лёгкие карточки главной (strips) — в индекс без полного JSON.
     * Полный load() позже перезапишет список целиком.
     */
    function mergeLightItems(list) {
        if (_loaded || !Array.isArray(list) || !list.length) return;
        for (const a of list) {
            if (!a || a.id == null) continue;
            const id = parseInt(a.id, 10);
            if (!Number.isFinite(id) || _byId.has(id)) continue;
            _byId.set(id, a);
            _items.push(a);
        }
    }

    function setLightMeta(meta) {
        if (_loaded || !meta || typeof meta !== 'object') return;
        if (!_meta) _meta = { ...meta };
        else if (meta.catalogCount != null && _meta.count == null) {
            _meta = { ..._meta, count: meta.catalogCount };
        }
    }

    global.KodikCatalogStore = {
        load: loadKodikCatalog,
        getAll: getKodikCatalogAnime,
        getById: getKodikAnimeById,
        isLoaded: isKodikCatalogLoaded,
        getMeta: getKodikCatalogMeta,
        mergeLight: mergeLightItems,
        setLightMeta,
    };
})(typeof window !== 'undefined' ? window : globalThis);

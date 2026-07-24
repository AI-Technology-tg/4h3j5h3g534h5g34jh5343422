// Переписанная UI-панель Создателя (без вкладки "Контент" и без заглушек).
let currentUsersPage = 1;
const usersPerPage = 25;
let __usersDebounce = null;
let __chatDebounce = null;
let __usersViewMode = 'cards';
let __visitorRealtimeTimer = null;
let __chatAutomodRulesCache = [];

function showErrorSafe(message) {
    if (typeof showError === 'function') {
        showError(message);
    } else {
        console.error('[Creator UI] ERROR:', message);
        alert('Ошибка: ' + message);
    }
}

function adminPanelEscapeHtml(text) {
    if (text == null) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

function openCreatorActionModal({ title, submitLabel = 'Сохранить', danger = false, fields = [] }) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        const bodyHtml = fields
            .map((f) => {
                const id = `creatorActionField_${f.id}`;
                if (f.type === 'textarea') {
                    return `<div class="setting-item"><label>${adminPanelEscapeHtml(f.label)}</label><textarea class="setting-textarea" id="${id}" placeholder="${adminPanelEscapeHtml(f.placeholder || '')}">${adminPanelEscapeHtml(f.value || '')}</textarea></div>`;
                }
                return `<div class="setting-item"><label>${adminPanelEscapeHtml(f.label)}</label><input class="setting-input" id="${id}" type="${adminPanelEscapeHtml(f.type || 'text')}" value="${adminPanelEscapeHtml(f.value || '')}" placeholder="${adminPanelEscapeHtml(f.placeholder || '')}"></div>`;
            })
            .join('');
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">${adminPanelEscapeHtml(title || 'Действие')}</h2>
                    <button class="modal-close" type="button">×</button>
                </div>
                <div class="modal-body">${bodyHtml}</div>
                <div class="modal-footer">
                    <button class="admin-btn ${danger ? 'admin-btn-danger' : ''}" type="button" data-action="submit">${adminPanelEscapeHtml(submitLabel)}</button>
                    <button class="admin-btn admin-btn-secondary" type="button" data-action="cancel">Отмена</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const close = (result) => {
            modal.remove();
            resolve(result);
        };
        modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => close(null));
        modal.querySelector('.modal-close')?.addEventListener('click', () => close(null));
        modal.querySelector('[data-action="submit"]')?.addEventListener('click', () => {
            const data = {};
            fields.forEach((f) => {
                const el = modal.querySelector(`#creatorActionField_${f.id}`);
                data[f.id] = el ? String(el.value || '') : '';
            });
            close(data);
        });
    });
}

function applyUsersViewMode(mode) {
    __usersViewMode = mode === 'table' ? 'table' : 'cards';
    const cards = document.getElementById('usersCardsGrid');
    const tableWrap = document.getElementById('usersTableWrap');
    const cardsBtn = document.getElementById('usersViewCardsBtn');
    const tableBtn = document.getElementById('usersViewTableBtn');
    if (cards) cards.style.display = __usersViewMode === 'cards' ? '' : 'none';
    if (tableWrap) tableWrap.style.display = __usersViewMode === 'table' ? '' : 'none';
    cardsBtn?.classList.toggle('active', __usersViewMode === 'cards');
    tableBtn?.classList.toggle('active', __usersViewMode === 'table');
}

function stopVisitorRealtime() {
    if (__visitorRealtimeTimer) {
        clearInterval(__visitorRealtimeTimer);
        __visitorRealtimeTimer = null;
    }
}

function refreshVisitorRealtimeState() {
    stopVisitorRealtime();
    const isDashboardTab = window.creatorAdminPanel?.currentTab === 'dashboard';
    const enabled = !!document.getElementById('visitorAnalyticsRealtimeToggle')?.checked;
    if (isDashboardTab && enabled) {
        __visitorRealtimeTimer = setInterval(() => void loadVisitorAnalyticsPanel(), 15000);
    }
}

function hideAdminPageLoading() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (typeof hideLoading === 'function') hideLoading();
}

function initTabs() {
    document.querySelectorAll('.admin-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    document.querySelectorAll('.admin-tab-content').forEach((c) => {
        c.classList.toggle('active', c.id === `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    });

    window.creatorAdminPanel.currentTab = tabName;
    if (tabName !== 'dashboard') stopVisitorRealtime();

    if (tabName === 'dashboard') {
        void loadDashboard();
    } else if (tabName === 'users') {
        void loadUsersAdvanced(1);
    } else if (tabName === 'team') {
        void loadTeamPanel();
    } else if (tabName === 'moderation') {
        void loadChatAutomodPanel();
        void loadChatMessagesMod();
    } else if (tabName === 'notifications') {
        void loadNotificationsManagement();
    } else if (tabName === 'minkoServer') {
        void loadMinkoAiServerPanel();
    } else if (tabName === 'giveaway') {
        void loadGiveawayAdminPanel();
    } else if (tabName === 'anime4k') {
        void loadAnime4kAdminPanel();
    } else if (tabName === 'settings') {
        void loadCreatorSettingsTab();
    }
}

function initGiveawaySection() {
    if (window.__reminkoGiveawayAdminBound) return;
    window.__reminkoGiveawayAdminBound = true;
    document.getElementById('giveawayAdminRefreshBtn')?.addEventListener('click', () => void loadGiveawayAdminPanel());
}

function initAnime4kSection() {
    if (window.__reminkoAnime4kAdminBound) return;
    window.__reminkoAnime4kAdminBound = true;
    document.getElementById('anime4kAdminRefreshBtn')?.addEventListener('click', () => void loadAnime4kAdminPanel());
    document.getElementById('anime4kAdminFetchJikanBtn')?.addEventListener('click', () => void anime4kAdminFetchAndUpsert());
    document.getElementById('anime4kAdminFetchFallbackBtn')?.addEventListener('click', () =>
        void anime4kAdminFetchAndUpsert({ skipJikan: true })
    );
    document.getElementById('anime4kAdminUploadBtn')?.addEventListener('click', () => void anime4kAdminUploadVideo());
    document.getElementById('anime4kAdminFileInput')?.addEventListener('change', () => anime4kAdminOnFileSelected());
    document.getElementById('anime4kAdminSaveEditorBtn')?.addEventListener('click', () => void anime4kAdminSaveEditor());
    document.getElementById('anime4kAdminDeleteEditorBtn')?.addEventListener('click', () => void anime4kAdminDeleteSelected());
    document.getElementById('anime4kAdminRefreshMetaBtn')?.addEventListener('click', () => void anime4kAdminRefreshMetaForSelected());
    document.getElementById('anime4kAdminTitleSearchBtn')?.addEventListener('click', () => void anime4kAdminSearchByTitle());
    document.getElementById('anime4kAdminTitleSearch')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void anime4kAdminSearchByTitle();
        }
    });
    document.getElementById('anime4kAdminSearchResults')?.addEventListener('click', (e) => {
        const useBtn = e.target.closest('[data-anime4k-use-mal]');
        if (useBtn) {
            anime4kAdminUseSearchMal(useBtn.getAttribute('data-anime4k-use-mal'));
            return;
        }
        const addBtn = e.target.closest('[data-anime4k-add-mal]');
        if (addBtn) {
            anime4kAdminUseSearchMal(addBtn.getAttribute('data-anime4k-add-mal'));
            void anime4kAdminFetchAndUpsert();
        }
    });
    document.getElementById('anime4kEditorPosterUrl')?.addEventListener('input', () => {
        anime4kEditorUpdatePosterPreview(document.getElementById('anime4kEditorPosterUrl')?.value || '');
    });
    anime4kAdminUpdateMaxUploadLabel();
}

let __anime4kRowsCache = [];
let __anime4kSelectedMal = null;
const ANIME4K_SITE_ID_BASE = 22000000;

function anime4kAdminSiteIdFromMal(mal) {
    const n = Number(mal);
    if (!Number.isFinite(n) || n <= 0) return null;
    return ANIME4K_SITE_ID_BASE + n;
}

function anime4kAdminMergeSearchHit(map, hit) {
    const mal = Number(hit?.mal);
    if (!Number.isFinite(mal) || mal <= 0) return;
    const prev = map.get(mal) || { mal };
    map.set(mal, {
        mal,
        titleRu: hit.titleRu || prev.titleRu || null,
        titleEn: hit.titleEn || prev.titleEn || null,
        titleMain: hit.titleMain || prev.titleMain || hit.titleEn || hit.titleRu || `MAL ${mal}`,
        year: hit.year || prev.year || null,
        type: hit.type || prev.type || null,
        poster: hit.poster || prev.poster || null
    });
}

function anime4kAdminNormalizeJikanSearchHits(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map((item) => {
            const mal = Number(item?.mal_id);
            if (!Number.isFinite(mal) || mal <= 0) return null;
            return {
                mal,
                titleRu: null,
                titleEn: item.title_english || item.title || null,
                titleMain: item.title || item.title_english || item.title_japanese || `MAL ${mal}`,
                year: item.year || null,
                type: item.type || null,
                poster:
                    item.images?.jpg?.small_image_url ||
                    item.images?.jpg?.image_url ||
                    item.images?.jpg?.large_image_url ||
                    null
            };
        })
        .filter(Boolean);
}

function anime4kAdminNormalizeShikiSearchHits(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map((item) => {
            // В списке /animes?search= Shikimori часто не отдаёт myanimelist_id — только id
            const mal = Number(item?.myanimelist_id ?? item?.id);
            if (!Number.isFinite(mal) || mal <= 0) return null;
            const titleRu = String(item.russian || '').trim() || null;
            const titleEn = String(item.english || item.name || '').trim() || null;
            return {
                mal,
                titleRu,
                titleEn,
                titleMain: titleRu || item.name || titleEn || `MAL ${mal}`,
                year: item.aired_on ? String(item.aired_on).slice(0, 4) : null,
                type: item.kind || null,
                poster: item.image?.preview || item.image?.original || null
            };
        })
        .filter(Boolean);
}

function anime4kAdminMergeCatalogSiteSearchHits(map, rows, query) {
    const ql = String(query || '')
        .toLowerCase()
        .trim();
    if (!ql) return;
    for (const row of rows || []) {
        const mal = Number(row?.mal_id);
        if (!Number.isFinite(mal) || mal <= 0) continue;
        let j = row.jikan;
        if (typeof j === 'string') {
            try {
                j = JSON.parse(j);
            } catch {
                j = null;
            }
        }
        const titles = [row.title_ru, j?.title, j?.title_english, j?.title_japanese, j?.title_synonyms?.[0]]
            .map((t) => String(t || '').trim())
            .filter(Boolean);
        if (!titles.some((t) => t.toLowerCase().includes(ql))) continue;
        anime4kAdminMergeSearchHit(map, {
            mal,
            titleRu: row.title_ru || null,
            titleEn: j?.title_english || j?.title || null,
            titleMain: row.title_ru || j?.title || j?.title_english || `MAL ${mal}`,
            year: j?.year || null,
            type: j?.type || null,
            poster: j?.images?.jpg?.small_image_url || j?.images?.jpg?.image_url || null
        });
    }
}

async function anime4kAdminFetchJikanSearchList(query, limit) {
    const lim = Math.min(25, Math.max(1, parseInt(limit, 10) || 15));
    const q = String(query || '').trim();
    if (!q) return [];

    const searchFn = typeof window.jikanSearchAnimeMany === 'function' ? window.jikanSearchAnimeMany : null;
    if (searchFn) {
        try {
            const list = await searchFn(q, lim);
            if (Array.isArray(list) && list.length) return list;
        } catch (_) {
            /* fallback ниже */
        }
    }

    if (typeof reminkoJikanFetch !== 'function') return [];

    const urls = [
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=${lim}`,
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=${lim}&sfw`
    ];
    for (const url of urls) {
        try {
            const json = await reminkoJikanFetch(url);
            const data = json?.data;
            if (Array.isArray(data) && data.length) return data;
        } catch (_) {
            /* next */
        }
    }
    return [];
}

function anime4kAdminUseSearchMal(mal) {
    const mid = parseInt(mal, 10);
    if (!mid || Number.isNaN(mid)) return;
    const malInput = document.getElementById('anime4kAdminMalInput');
    if (malInput) malInput.value = String(mid);
    const siteId = anime4kAdminSiteIdFromMal(mid);
    anime4kAdminSetStatus(`Подставлено: MAL ${mid} · site id ${siteId}`);
    malInput?.focus();
}

function anime4kAdminRenderSearchResults(rows) {
    const resultsEl = document.getElementById('anime4kAdminSearchResults');
    if (!resultsEl) return;
    if (!rows.length) {
        resultsEl.hidden = false;
        resultsEl.innerHTML = '<p class="anime4k-admin__search-empty">Ничего не найдено — попробуйте другое название или латиницу.</p>';
        return;
    }
    resultsEl.hidden = false;
    resultsEl.innerHTML = `<ul class="anime4k-admin__search-list">${rows
        .map((row) => {
            const mal = Number(row.mal);
            const siteId = anime4kAdminSiteIdFromMal(mal);
            const title = adminPanelEscapeHtml(row.titleMain || `MAL ${mal}`);
            const subParts = [];
            if (row.titleRu && row.titleRu !== row.titleMain) subParts.push(row.titleRu);
            if (row.titleEn && row.titleEn !== row.titleMain && row.titleEn !== row.titleRu) {
                subParts.push(row.titleEn);
            }
            const sub = subParts.length ? adminPanelEscapeHtml(subParts.join(' · ')) : '';
            const metaBits = [];
            if (row.year) metaBits.push(String(row.year));
            if (row.type) metaBits.push(String(row.type));
            metaBits.push(`MAL ${mal}`);
            metaBits.push(`id ${siteId}`);
            const meta = adminPanelEscapeHtml(metaBits.join(' · '));
            const poster = row.poster
                ? `<img class="anime4k-admin__search-poster" src="${adminPanelEscapeHtml(row.poster)}" alt="" loading="lazy">`
                : `<div class="anime4k-admin__search-poster anime4k-admin__search-poster--ph">?</div>`;
            return `<li class="anime4k-admin__search-item">
                ${poster}
                <div class="anime4k-admin__search-body">
                    <strong class="anime4k-admin__search-title">${title}</strong>
                    ${sub ? `<span class="anime4k-admin__search-sub">${sub}</span>` : ''}
                    <span class="anime4k-admin__search-meta">${meta}</span>
                </div>
                <div class="anime4k-admin__search-actions">
                    <button type="button" class="admin-btn admin-btn-small" data-anime4k-use-mal="${mal}" title="Подставить MAL id">MAL</button>
                    <button type="button" class="admin-btn admin-btn-small" data-anime4k-add-mal="${mal}" title="Подставить и добавить через Jikan">+ Jikan</button>
                </div>
            </li>`;
        })
        .join('')}</ul>`;
}

async function anime4kAdminSearchByTitle() {
    const input = document.getElementById('anime4kAdminTitleSearch');
    const q = String(input?.value || '').trim();
    if (!q) {
        anime4kAdminSetStatus('Введите название аниме', true);
        return;
    }
    anime4kAdminSetStatus('Поиск…');
    const resultsEl = document.getElementById('anime4kAdminSearchResults');
    if (resultsEl) {
        resultsEl.hidden = false;
        resultsEl.innerHTML = '<p class="anime4k-admin__search-empty">Поиск в Jikan и Shikimori…</p>';
    }

    const merged = new Map();
    const tasks = [];
    let jikanFailed = false;
    let shikiFailed = false;

    if (window.creatorAdminPanel?.listCatalogSiteAnime) {
        tasks.push(
            (async () => {
                try {
                    const res = await window.creatorAdminPanel.listCatalogSiteAnime();
                    if (res?.success) anime4kAdminMergeCatalogSiteSearchHits(merged, res.rows, q);
                } catch (_) {
                    /* локальный каталог необязателен */
                }
            })()
        );
    }

    tasks.push(
        (async () => {
            try {
                const list = await anime4kAdminFetchJikanSearchList(q, 15);
                anime4kAdminNormalizeJikanSearchHits(list).forEach((hit) => anime4kAdminMergeSearchHit(merged, hit));
                if (!list.length) jikanFailed = true;
            } catch (_) {
                jikanFailed = true;
            }
        })()
    );

    if (window.shikimoriApi?.searchAnimesByQuery) {
        tasks.push(
            (async () => {
                try {
                    const list = await window.shikimoriApi.searchAnimesByQuery(q, 15);
                    if (!Array.isArray(list) || !list.length) {
                        shikiFailed = true;
                        return;
                    }
                    anime4kAdminNormalizeShikiSearchHits(list).forEach((hit) => anime4kAdminMergeSearchHit(merged, hit));
                } catch (_) {
                    shikiFailed = true;
                }
            })()
        );
    } else {
        shikiFailed = true;
    }

    await Promise.all(tasks);

    const rows = Array.from(merged.values())
        .sort((a, b) => {
            const qa = String(q).toLowerCase();
            const am = String(a.titleMain || '').toLowerCase();
            const bm = String(b.titleMain || '').toLowerCase();
            const ar = String(a.titleRu || '').toLowerCase();
            const br = String(b.titleRu || '').toLowerCase();
            const score = (title, ru) =>
                (title === qa ? 4 : 0) +
                (ru === qa ? 4 : 0) +
                (title.startsWith(qa) ? 2 : 0) +
                (ru.startsWith(qa) ? 2 : 0) +
                (title.includes(qa) ? 1 : 0) +
                (ru.includes(qa) ? 1 : 0);
            return score(bm, br) - score(am, ar) || (Number(b.year) || 0) - (Number(a.year) || 0);
        })
        .slice(0, 20);

    anime4kAdminRenderSearchResults(rows);
    if (rows.length) {
        anime4kAdminSetStatus(`Найдено: ${rows.length}`);
        return;
    }
    const hints = [];
    if (jikanFailed) hints.push('Jikan временно недоступен');
    if (shikiFailed) hints.push('Shikimori не ответил');
    const hint = hints.length ? ` (${hints.join('; ')})` : '';
    anime4kAdminSetStatus(`Ничего не найдено${hint}`, true);
}

function anime4kAdminSetStatus(text, isError) {
    const statusEl = document.getElementById('anime4kAdminStatus');
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.style.color = isError ? '#f87171' : '';
}

function anime4kExtractJikanPoster(j) {
    if (!j || typeof j !== 'object') return '';
    return j.images?.jpg?.large_image_url || j.images?.jpg?.image_url || '';
}

function anime4kRowJikan(row) {
    const j = row?.jikan;
    if (!j) return {};
    if (typeof j === 'string') {
        try {
            return JSON.parse(j);
        } catch {
            return {};
        }
    }
    if (j.data && typeof j.data === 'object') return j.data;
    return j;
}

function anime4kRowDisplayTitle(row) {
    const j = anime4kRowJikan(row);
    const custom = row?.title_ru && String(row.title_ru).trim();
    if (custom) return custom;
    return j.title || j.title_english || `MAL ${row?.mal_id}`;
}

function anime4kRowPosterUrl(row) {
    const custom = row?.poster_url && String(row.poster_url).trim();
    if (custom) return custom;
    return anime4kExtractJikanPoster(anime4kRowJikan(row));
}

function anime4kRowMetaSourceLabel(row) {
    const j = anime4kRowJikan(row);
    const src = j._reminkoMetaSource || j._metaSource;
    if (src === 'shikimori') return 'Shikimori';
    if (src === 'kodik-catalog') return 'Kodik';
    if (src === 'manual') return 'Вручную';
    return 'Jikan';
}

function anime4kEditorUpdatePosterPreview(url) {
    const img = document.getElementById('anime4kEditorPosterPreview');
    const ph = document.getElementById('anime4kEditorPosterPh');
    const trimmed = String(url || '').trim();
    if (!img || !ph) return;
    if (trimmed) {
        img.src = trimmed;
        img.hidden = false;
        ph.hidden = true;
        img.onerror = () => {
            img.hidden = true;
            ph.hidden = false;
        };
    } else {
        img.hidden = true;
        img.removeAttribute('src');
        ph.hidden = false;
    }
}

function anime4kAdminClearEditor() {
    __anime4kSelectedMal = null;
    document.getElementById('anime4kAdminEditorForm')?.setAttribute('hidden', '');
    document.getElementById('anime4kAdminEditorEmpty')?.removeAttribute('hidden');
    document.querySelectorAll('.anime4k-admin__list-item').forEach((el) => el.classList.remove('is-active'));
}

function anime4kAdminFillEditor(row) {
    if (!row) {
        anime4kAdminClearEditor();
        return;
    }
    __anime4kSelectedMal = Number(row.mal_id);
    const j = anime4kRowJikan(row);
    const mal = Number(row.mal_id);
    const siteId = anime4kAdminSiteIdFromMal(mal);
    const titleRu = row.title_ru && String(row.title_ru).trim() ? String(row.title_ru).trim() : '';
    const descRu =
        row.description_ru && String(row.description_ru).trim()
            ? String(row.description_ru).trim()
            : String(j.synopsis || '').replace(/\s+/g, ' ').trim();
    const poster = anime4kRowPosterUrl(row);
    const titleEn = j.title_english || j.title || '';

    document.getElementById('anime4kAdminEditorEmpty')?.setAttribute('hidden', '');
    document.getElementById('anime4kAdminEditorForm')?.removeAttribute('hidden');

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    setText('anime4kEditorMal', String(mal));
    setText('anime4kEditorSiteId', String(siteId));
    setText('anime4kEditorMetaSource', anime4kRowMetaSourceLabel(row));
    setText('anime4kEditorTitleEn', titleEn ? `EN: ${titleEn}` : 'EN: —');
    setVal('anime4kEditorTitleRu', titleRu);
    setVal('anime4kEditorDescRu', descRu);
    setVal('anime4kEditorPosterUrl', poster);
    setVal('anime4kEditorVideoUrl', row.video_url || '');
    const pub = document.getElementById('anime4kEditorPublished');
    if (pub) pub.checked = row.published !== false;

    anime4kEditorUpdatePosterPreview(poster);

    const viewLink = document.getElementById('anime4kEditorViewLink');
    const catalogLink = document.getElementById('anime4kEditorCatalogLink');
    if (viewLink) viewLink.href = `anime/view-4k.html?id=${siteId}`;
    if (catalogLink) catalogLink.href = 'catalog/anime-4k.html';

    document.querySelectorAll('.anime4k-admin__list-item').forEach((el) => {
        el.classList.toggle('is-active', Number(el.getAttribute('data-mal')) === mal);
    });

    const hint = document.getElementById('anime4kAdminFileHint');
    if (hint) {
        hint.textContent = `H.264 + AAC. Выбрана карточка MAL ${mal} (site id ${siteId}).`;
    }
}

function anime4kAdminSelectRow(mal) {
    const mid = Number(mal);
    const row = __anime4kRowsCache.find((r) => Number(r.mal_id) === mid);
    if (row) anime4kAdminFillEditor(row);
}

function anime4kAdminReadEditorFields() {
    return {
        title_ru: document.getElementById('anime4kEditorTitleRu')?.value || '',
        description_ru: document.getElementById('anime4kEditorDescRu')?.value || '',
        poster_url: document.getElementById('anime4kEditorPosterUrl')?.value || '',
        video_url: document.getElementById('anime4kEditorVideoUrl')?.value || '',
        published: !!document.getElementById('anime4kEditorPublished')?.checked
    };
}

async function anime4kAdminSaveEditor() {
    if (!__anime4kSelectedMal || !window.creatorAdminPanel) return;
    anime4kAdminSetStatus('Сохранение…');
    const fields = anime4kAdminReadEditorFields();
    const res = await window.creatorAdminPanel.updateCatalog4kAnimeMeta(__anime4kSelectedMal, fields);
    if (res.success) {
        anime4kAdminSetStatus(res.message || 'Сохранено');
        if (typeof showSuccess === 'function') showSuccess(res.message || 'Карточка сохранена');
        if (typeof window.Anime4kCatalogStore?.refresh === 'function') {
            await window.Anime4kCatalogStore.refresh();
        }
        await loadAnime4kAdminPanel(__anime4kSelectedMal);
    } else {
        anime4kAdminSetStatus(res.message || 'Ошибка', true);
        showErrorSafe(res.message || 'Ошибка сохранения');
    }
}

async function anime4kAdminDeleteSelected() {
    if (!__anime4kSelectedMal || !window.creatorAdminPanel) return;
    const mal = __anime4kSelectedMal;
    const title = document.getElementById('anime4kEditorTitleRu')?.value || `MAL ${mal}`;
    if (!confirm(`Удалить «${title}» (MAL ${mal}) из ≈4K каталога?\n\nЗапись в БД будет удалена; файл в Storage не трогается.`)) {
        return;
    }
    anime4kAdminSetStatus('Удаление…');
    const del = await window.creatorAdminPanel.deleteCatalog4kAnime(mal);
    if (del.success) {
        anime4kAdminSetStatus(del.message || 'Удалено');
        __anime4kSelectedMal = null;
        await loadAnime4kAdminPanel();
    } else {
        anime4kAdminSetStatus(del.message || 'Ошибка', true);
    }
}

async function anime4kAdminRefreshMetaForSelected() {
    if (!__anime4kSelectedMal) {
        anime4kAdminSetStatus('Сначала выберите тайтл', true);
        return;
    }
    const mal = __anime4kSelectedMal;
    anime4kAdminSetStatus('Jikan / Shikimori…');
    try {
        if (typeof window.KodikCatalogStore?.load === 'function') {
            await Promise.race([
                window.KodikCatalogStore.load(),
                new Promise((r) => setTimeout(r, 5000))
            ]).catch(() => null);
        }
        const resolved = await anime4kResolveMalMeta(mal, { skipJikan: false });
        if (!resolved?.jikan) throw new Error('Не удалось получить метаданные');

        const row = __anime4kRowsCache.find((r) => Number(r.mal_id) === mal);
        const poster = resolved.poster_url || anime4kExtractJikanPoster(resolved.jikan);
        const upsOptions = {};
        if (!(row?.title_ru && String(row.title_ru).trim())) {
            upsOptions.title_ru = resolved.title_ru;
        }
        if (!(row?.description_ru && String(row.description_ru).trim())) {
            upsOptions.description_ru = resolved.description_ru;
        }
        if (!(row?.poster_url && String(row.poster_url).trim()) && poster) {
            upsOptions.poster_url = poster;
        }
        const ups = await window.creatorAdminPanel.upsertCatalog4kAnime(resolved.jikan, upsOptions);
        if (!ups.success) throw new Error(ups.message || 'Ошибка обновления jikan');

        anime4kAdminSetStatus('Jikan / Shikimori обновлены. Пустые поля подставлены — проверьте и сохраните при необходимости.');
        await loadAnime4kAdminPanel(mal);
    } catch (e) {
        anime4kAdminSetStatus(e.message || 'Ошибка', true);
    }
}
function anime4kBuildJikanStub(mal, meta) {
    const m = meta || {};
    const titleEn = m.title_en || m.title || `Anime MAL ${mal}`;
    const titleRu = m.title_ru || titleEn;
    const poster = m.poster || '';
    return {
        mal_id: mal,
        title: titleRu,
        title_english: titleEn,
        title_japanese: m.title_jp || '',
        images: poster
            ? { jpg: { image_url: poster, large_image_url: poster, small_image_url: poster } }
            : {},
        synopsis: m.description || '',
        type: m.type || 'Unknown',
        episodes: m.episodes || null,
        year: m.year || null,
        status: m.status || 'Unknown',
        _reminkoMetaSource: m.source || 'manual'
    };
}

async function anime4kResolveMalMeta(mal, opts) {
    const skipJikan = !!(opts && opts.skipJikan);
    const withTimeout = (p, ms) =>
        Promise.race([
            p,
            new Promise((resolve) => setTimeout(() => resolve(null), ms))
        ]).catch(() => null);

    if (!skipJikan) {
        if (typeof reminkoJikanFetch === 'function') {
            try {
                const json = await withTimeout(
                    reminkoJikanFetch(`https://api.jikan.moe/v4/anime/${mal}`),
                    14000
                );
                if (json?.data?.mal_id) {
                    const j = json.data;
                    const synopsis = String(j.synopsis || '').replace(/\s+/g, ' ').trim();
                    return {
                        jikan: j,
                        source: 'jikan',
                        title_ru: j.title || j.title_english || null,
                        description_ru: synopsis || null,
                        poster_url: anime4kExtractJikanPoster(j) || null
                    };
                }
            } catch (_) {
                /* fallback */
            }
        }
        if (typeof jikanFetchAnimeFullByMalId === 'function') {
            const full = await withTimeout(jikanFetchAnimeFullByMalId(mal), 14000);
            if (full?.mal_id) {
                const synopsis = String(full.synopsis || '').replace(/\s+/g, ' ').trim();
                return {
                    jikan: full,
                    source: 'jikan',
                    title_ru: full.title || full.title_english || null,
                    description_ru: synopsis || null,
                    poster_url: anime4kExtractJikanPoster(full) || null
                };
            }
        }
    }

    if (window.shikimoriApi?.fetchShikimoriByMalId) {
        const sh = await withTimeout(window.shikimoriApi.fetchShikimoriByMalId(mal, ''), 12000);
        if (sh) {
            let description = '';
            if (window.shikimoriApi.stripHtml) {
                description = window.shikimoriApi
                    .stripHtml(sh.description_html || sh.description || '')
                    .replace(/\s+/g, ' ')
                    .trim();
            }
            const poster =
                (sh.image && (sh.image.original || sh.image.preview)) ||
                `https://shikimori.one/system/animes/${mal}/original.jpg`;
            const jikan = anime4kBuildJikanStub(mal, {
                title_ru: sh.russian || sh.name,
                title_en: sh.name,
                title_jp: sh.japanese || '',
                description,
                poster,
                episodes: sh.episodes || null,
                type: sh.kind || 'Unknown',
                status: sh.status || 'Unknown',
                source: 'shikimori'
            });
            return {
                jikan,
                source: 'shikimori',
                title_ru: sh.russian || sh.name || null,
                description_ru: description || null,
                poster_url: poster || null
            };
        }
    }

    const kodikId = 20000000 + mal;
    const kodikAnime =
        typeof getAnimeById === 'function'
            ? getAnimeById(kodikId)
            : window.KodikCatalogStore?.getById?.(kodikId);
    if (kodikAnime) {
        const jikan = anime4kBuildJikanStub(mal, {
            title_ru: kodikAnime.title,
            title_en: kodikAnime.titleAlt || kodikAnime.title,
            description: kodikAnime.description || '',
            poster: kodikAnime.posterUrl || kodikAnime.poster || '',
            type: kodikAnime.type === 'Фильм' ? 'Movie' : 'TV',
            source: 'kodik-catalog'
        });
        return {
            jikan,
            source: 'kodik-catalog',
            title_ru: kodikAnime.title || null,
            description_ru: kodikAnime.description || null,
            poster_url: kodikAnime.posterUrl || kodikAnime.poster || null
        };
    }

    const jikan = anime4kBuildJikanStub(mal, { source: 'manual' });
    return { jikan, source: 'manual', title_ru: null, description_ru: null };
}

function anime4kAdminMaxUploadBytes() {
    if (typeof reminkoGetAnime4kMaxUploadBytes === 'function') return reminkoGetAnime4kMaxUploadBytes();
    const n = Number(typeof APP_CONFIG !== 'undefined' && APP_CONFIG.anime4k?.maxUploadBytes);
    return Number.isFinite(n) && n > 0 ? n : 52_428_800;
}

function anime4kAdminFormatBytes(bytes) {
    if (typeof reminkoFormatUploadBytes === 'function') return reminkoFormatUploadBytes(bytes);
    const n = Number(bytes) || 0;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.round(n / 1024)} KB`;
}

function anime4kAdminUpdateMaxUploadLabel() {
    const el = document.getElementById('anime4kAdminMaxUploadLabel');
    if (el) el.textContent = anime4kAdminFormatBytes(anime4kAdminMaxUploadBytes());
}

function anime4kAdminOnFileSelected() {
    const fileInput = document.getElementById('anime4kAdminFileInput');
    const file = fileInput?.files && fileInput.files[0];
    if (!file) return;
    const maxB = anime4kAdminMaxUploadBytes();
    if (file.size > maxB) {
        anime4kAdminSetStatus(
            `Файл ${anime4kAdminFormatBytes(file.size)} — больше лимита ${anime4kAdminFormatBytes(maxB)}.`,
            true
        );
    } else {
        anime4kAdminSetStatus(`Выбран: ${file.name} (${anime4kAdminFormatBytes(file.size)})`);
    }
}

function anime4kFormatUploadEta(sec) {
    if (sec == null || !Number.isFinite(sec) || sec < 0) return '—';
    const s = Math.round(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m >= 60) {
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return `${h} ч ${rm} мин`;
    }
    return m > 0 ? `${m} мин ${r} сек` : `${r} сек`;
}

function anime4kSetUploadProgress(payload) {
    const wrap = document.getElementById('anime4kAdminUploadProgress');
    const bar = document.getElementById('anime4kAdminUploadProgressBar');
    const text = document.getElementById('anime4kAdminUploadProgressText');
    const track = wrap?.querySelector('.anime4k-admin-upload-progress__track');
    if (!wrap) return;
    wrap.hidden = false;
    const pct = Math.max(0, Math.min(100, Number(payload?.percent) || 0));
    if (bar) bar.style.width = `${pct}%`;
    if (track) track.setAttribute('aria-valuenow', String(pct));
    let line = payload?.label || `${pct}%`;
    if (payload?.phase === 'storage' && payload.etaSec != null) {
        line += ` · осталось ~${anime4kFormatUploadEta(payload.etaSec)}`;
    }
    if (text) text.textContent = line;
}

function anime4kHideUploadProgress(delayMs) {
    const wrap = document.getElementById('anime4kAdminUploadProgress');
    if (!wrap) return;
    const hide = () => {
        wrap.hidden = true;
        const bar = document.getElementById('anime4kAdminUploadProgressBar');
        if (bar) bar.style.width = '0%';
    };
    if (delayMs > 0) setTimeout(hide, delayMs);
    else hide();
}

async function loadAnime4kAdminPanel(selectMal) {
    const listEl = document.getElementById('anime4kAdminList');
    const countEl = document.getElementById('anime4kAdminCount');
    if (!listEl || !window.creatorAdminPanel) return;

    const keepMal = selectMal != null ? Number(selectMal) : __anime4kSelectedMal;
    anime4kAdminSetStatus('Загрузка…');
    listEl.innerHTML = '<p class="anime4k-admin__empty">Загрузка…</p>';

    const res = await window.creatorAdminPanel.listCatalog4kAnime();
    if (!res.success) {
        listEl.innerHTML = `<p class="anime4k-admin__empty anime4k-admin__empty--error">${adminPanelEscapeHtml(res.message || 'Ошибка')}</p>`;
        anime4kAdminSetStatus('');
        return;
    }

    __anime4kRowsCache = res.rows || [];
    if (countEl) countEl.textContent = String(__anime4kRowsCache.length);
    anime4kAdminSetStatus(`${__anime4kRowsCache.length} тайтл(ов)`);

    if (!__anime4kRowsCache.length) {
        listEl.innerHTML = '<p class="anime4k-admin__empty">Пусто — добавьте MAL id слева.</p>';
        anime4kAdminClearEditor();
        return;
    }

    listEl.innerHTML = __anime4kRowsCache
        .map((row) => {
            const mal = Number(row.mal_id);
            const siteId = anime4kAdminSiteIdFromMal(mal);
            const title = anime4kRowDisplayTitle(row);
            const poster = anime4kRowPosterUrl(row);
            const hasVideo = !!(row.video_url && String(row.video_url).trim());
            const published = row.published !== false;
            const posterHtml = poster
                ? `<img class="anime4k-admin__list-item-poster" src="${adminPanelEscapeHtml(poster)}" alt="" loading="lazy">`
                : `<div class="anime4k-admin__list-item-poster anime4k-admin__list-item-poster--ph">4K</div>`;
            return `<button type="button" class="anime4k-admin__list-item" data-mal="${mal}">
                ${posterHtml}
                <span class="anime4k-admin__list-item-body">
                    <strong class="anime4k-admin__list-item-title">${adminPanelEscapeHtml(title)}</strong>
                    <span class="anime4k-admin__list-item-meta">MAL ${mal} · id ${siteId}</span>
                    <span class="anime4k-admin__list-item-tags">
                        <span class="anime4k-admin__tag ${hasVideo ? 'anime4k-admin__tag--ok' : 'anime4k-admin__tag--warn'}">${hasVideo ? 'видео' : 'нет видео'}</span>
                        <span class="anime4k-admin__tag ${published ? 'anime4k-admin__tag--ok' : ''}">${published ? 'опубл.' : 'скрыт'}</span>
                    </span>
                </span>
            </button>`;
        })
        .join('');

    listEl.querySelectorAll('.anime4k-admin__list-item').forEach((btn) => {
        btn.addEventListener('click', () => anime4kAdminSelectRow(btn.getAttribute('data-mal')));
    });

    const targetMal =
        keepMal && __anime4kRowsCache.some((r) => Number(r.mal_id) === keepMal)
            ? keepMal
            : Number(__anime4kRowsCache[0].mal_id);
    anime4kAdminSelectRow(targetMal);
}

async function anime4kAdminUploadVideo() {
    const fileInput = document.getElementById('anime4kAdminFileInput');
    const uploadBtn = document.getElementById('anime4kAdminUploadBtn');
    const file = fileInput?.files && fileInput.files[0];
    const mal = __anime4kSelectedMal || parseInt(document.getElementById('anime4kAdminMalInput')?.value, 10);
    if (!file) {
        anime4kAdminSetStatus('Выберите MP4 файл', true);
        return;
    }
    if (!mal || Number.isNaN(mal)) {
        anime4kAdminSetStatus('Выберите карточку слева или укажите MAL id', true);
        return;
    }
    const maxB = anime4kAdminMaxUploadBytes();
    if (file.size > maxB) {
        const msg =
            typeof reminkoExplainAnime4kSizeError === 'function'
                ? reminkoExplainAnime4kSizeError('maximum allowed size', file.size)
                : `Файл слишком большой (${anime4kAdminFormatBytes(file.size)}). Лимит: ${anime4kAdminFormatBytes(maxB)}.`;
        anime4kAdminSetStatus(msg, true);
        anime4kSetUploadProgress({ phase: 'error', percent: 0, label: msg });
        anime4kHideUploadProgress(12000);
        return;
    }
    anime4kAdminSetStatus('Загрузка…');
    if (uploadBtn) uploadBtn.disabled = true;
    if (fileInput) fileInput.disabled = true;
    anime4kSetUploadProgress({
        phase: 'prepare',
        percent: 0,
        label: `Подготовка… ${(file.size / (1024 * 1024)).toFixed(0)} MB`
    });
    let res;
    try {
        res = await window.creatorAdminPanel.uploadCatalog4kVideo(mal, file, {
            onProgress: (payload) => {
                anime4kSetUploadProgress(payload);
                if (payload?.percent != null) anime4kAdminSetStatus(`${payload.percent}%`);
            }
        });
    } finally {
        if (uploadBtn) uploadBtn.disabled = false;
        if (fileInput) fileInput.disabled = false;
    }
    anime4kAdminSetStatus(res.message || (res.success ? 'OK' : 'Ошибка'), !res.success);
    if (res.success) {
        anime4kSetUploadProgress({ phase: 'done', percent: 100, label: res.message || 'Готово!' });
        if (fileInput) fileInput.value = '';
        const videoInput = document.getElementById('anime4kEditorVideoUrl');
        if (videoInput && res.video_url) videoInput.value = res.video_url;
        void loadAnime4kAdminPanel(mal);
        anime4kHideUploadProgress(4000);
    } else {
        anime4kSetUploadProgress({
            phase: 'error',
            percent: 0,
            label: res.message || 'Ошибка загрузки'
        });
        anime4kHideUploadProgress(8000);
    }
}

async function anime4kAdminFetchAndUpsert(opts) {
    const input = document.getElementById('anime4kAdminMalInput');
    const mal = parseInt(input?.value, 10);
    if (!mal || Number.isNaN(mal)) {
        anime4kAdminSetStatus('Укажите MAL id', true);
        return;
    }
    anime4kAdminSetStatus(opts?.skipJikan ? 'Shikimori / каталог…' : 'Jikan…');
    try {
        if (typeof window.KodikCatalogStore?.load === 'function') {
            await Promise.race([
                window.KodikCatalogStore.load(),
                new Promise((r) => setTimeout(r, 5000))
            ]).catch(() => null);
        }
        const resolved = await anime4kResolveMalMeta(mal, opts);
        if (!resolved?.jikan) {
            throw new Error('Не удалось собрать данные по MAL id');
        }
        const poster = resolved.poster_url || anime4kExtractJikanPoster(resolved.jikan);
        const ups = await window.creatorAdminPanel.upsertCatalog4kAnime(resolved.jikan, {
            title_ru: resolved.title_ru,
            description_ru: resolved.description_ru,
            poster_url: poster || undefined
        });
        const srcNote =
            resolved.source === 'jikan'
                ? ' · Jikan'
                : resolved.source === 'shikimori'
                  ? ' · Shikimori'
                  : resolved.source === 'kodik-catalog'
                    ? ' · Kodik'
                    : ' · минимальная карточка';
        anime4kAdminSetStatus((ups.message || (ups.success ? 'Добавлено' : 'Ошибка')) + srcNote, !ups.success);
        if (ups.success) {
            if (input) input.value = '';
            await loadAnime4kAdminPanel(mal);
        }
    } catch (e) {
        anime4kAdminSetStatus(
            (e.message || 'Ошибка') + '. Если Jikan отдаёт 504 — «+ без Jikan» или повторите позже.',
            true
        );
    }
}

async function loadGiveawayAdminPanel() {
    const tbody = document.getElementById('giveawayAdminTableBody');
    const summary = document.getElementById('giveawayAdminSummary');
    const statusEl = document.getElementById('giveawayAdminStatus');
    if (!tbody || !window.creatorAdminPanel) return;

    const platformLabel = (p) => {
        if (p === 'tiktok') return 'TikTok';
        if (p === 'instagram') return 'Instagram';
        if (p === 'both') return 'TikTok + Instagram';
        return '—';
    };
    const handleCell = (h) => (h ? `@${adminPanelEscapeHtml(h)}` : '—');

    if (statusEl) statusEl.textContent = 'Загрузка…';
    tbody.innerHTML = '<tr><td colspan="10">Загрузка…</td></tr>';

    const { rows, error } = await window.creatorAdminPanel.getGiveawayCreatorStats();

    if (error) {
        if (statusEl) statusEl.textContent = '';
        tbody.innerHTML = `<tr><td colspan="10" style="color:#f87171;">${adminPanelEscapeHtml(error)}</td></tr>`;
        if (summary) summary.innerHTML = '';
    } else {
        const list = rows || [];
        const totalClicks = list.reduce((s, r) => s + (Number(r.unique_clicks) || 0), 0);
        const totalRegs = list.reduce((s, r) => s + (Number(r.registrations) || 0), 0);

        if (summary) {
            summary.innerHTML = `
            <div class="admin-giveaway-stat">
                <span class="admin-giveaway-stat-label">Участников</span>
                <strong class="admin-giveaway-stat-value">${list.length}</strong>
            </div>
            <div class="admin-giveaway-stat">
                <span class="admin-giveaway-stat-label">Всего переходов</span>
                <strong class="admin-giveaway-stat-value">${totalClicks}</strong>
            </div>
            <div class="admin-giveaway-stat">
                <span class="admin-giveaway-stat-label">Всего регистраций</span>
                <strong class="admin-giveaway-stat-value">${totalRegs}</strong>
            </div>
        `;
        }

        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="10">Пока никто не нажал «Участвовать».</td></tr>';
        } else {
            const origin = window.location.origin.replace(/\/$/, '');
            tbody.innerHTML = list
                .map((r) => {
                    const joined = r.joined_at
                        ? new Date(r.joined_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
                        : '—';
                    const lastClick = r.last_click_at
                        ? new Date(r.last_click_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
                        : '—';
                    const shareUrl = `${origin}/r/${adminPanelEscapeHtml(r.ref_code || '')}`;
                    return `<tr>
                <td>${adminPanelEscapeHtml(r.username || '—')}</td>
                <td>${adminPanelEscapeHtml(r.email || '—')}</td>
                <td>${adminPanelEscapeHtml(platformLabel(r.platform))}</td>
                <td>${handleCell(r.tiktok_handle)}</td>
                <td>${handleCell(r.instagram_handle)}</td>
                <td><code>${adminPanelEscapeHtml(r.ref_code || '')}</code><br><a href="${shareUrl}" target="_blank" rel="noopener noreferrer">${adminPanelEscapeHtml(shareUrl)}</a></td>
                <td>${adminPanelEscapeHtml(joined)}</td>
                <td>${Number(r.unique_clicks) || 0}</td>
                <td>${Number(r.registrations) || 0}</td>
                <td>${adminPanelEscapeHtml(lastClick)}</td>
            </tr>`;
                })
                .join('');
        }

        if (statusEl) {
            statusEl.textContent = `Обновлено · ${list.length} участник(ов)`;
        }
    }
}

function bindDashboardControls() {
    if (window.__reminkoCreatorDashboardBound) return;
    window.__reminkoCreatorDashboardBound = true;

    const period = document.getElementById('visitorAnalyticsPeriod');
    period?.addEventListener('change', () => void loadVisitorAnalyticsPanel());
    document.getElementById('visitorOnlineWindow')?.addEventListener('change', () => void loadVisitorAnalyticsPanel());
    document.getElementById('visitorAnalyticsRefreshBtn')?.addEventListener('click', () => void loadVisitorAnalyticsPanel());
    document.getElementById('visitorAnalyticsRealtimeToggle')?.addEventListener('change', refreshVisitorRealtimeState);
    document.getElementById('openMinkoAiLogsModalBtn')?.addEventListener('click', () => void openMinkoAiLogsModal());
    document.getElementById('creatorAuditRefreshBtn')?.addEventListener('click', () => void loadCreatorAuditLogsPanel());
    document.getElementById('creatorAuditActionFilter')?.addEventListener('change', () => void loadCreatorAuditLogsPanel());
}

async function loadDashboard() {
    const stats = await window.creatorAdminPanel.getAdvancedStats();
    const statsContainer = document.getElementById('adminStats');
    const quickStats = document.getElementById('quickStats');
    const recentEl = document.getElementById('recentActivity');

    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-card">
                <h3>👥 Пользователи</h3>
                <div class="stat-value">${stats?.users || 0}</div>
                <div class="stat-change positive">+${stats?.newUsersToday || 0} сегодня</div>
            </div>
            <div class="stat-card">
                <h3>💬 Сообщения в чате</h3>
                <div class="stat-value">${stats?.chatMessages || 0}</div>
                <div class="stat-change positive">+${stats?.chatMessagesToday || 0} сегодня</div>
            </div>
            <div class="stat-card">
                <h3>💎 VIP подписки</h3>
                <div class="stat-value">${stats?.vipSubscriptions || 0}</div>
                <div class="stat-change">активные</div>
            </div>
            <div class="stat-card">
                <h3>🚫 Забанены</h3>
                <div class="stat-value">${stats?.bannedUsers || 0}</div>
                <div class="stat-change">пользователей</div>
            </div>
            <div class="stat-card">
                <h3>📊 Активные за 7 дней</h3>
                <div class="stat-value">${stats?.activeUsers || 0}</div>
                <div class="stat-change">уникальные</div>
            </div>
        `;
    }

    if (quickStats) {
        quickStats.innerHTML = `
            <div class="quick-stat-item">
                <div class="quick-stat-label">Новых пользователей за неделю</div>
                <div class="quick-stat-value">${stats?.newUsersWeek || 0}</div>
            </div>
            <div class="quick-stat-item">
                <div class="quick-stat-label">Сообщений в час (среднее)</div>
                <div class="quick-stat-value">${Math.floor((stats?.chatMessagesToday || 0) / 24)}</div>
            </div>
            <div class="quick-stat-item">
                <div class="quick-stat-label">Всего сообщений</div>
                <div class="quick-stat-value">${stats?.chatMessages || 0}</div>
            </div>
        `;
    }

    if (recentEl && window.creatorAdminPanel) {
        const rows = await window.creatorAdminPanel.getRecentDashboardActivity(12);
        if (!rows.length) {
            recentEl.innerHTML =
                '<p class="activity-empty">Пока нет недавних событий. Здесь появятся регистрации, входы и сообщения чата.</p>';
        } else {
            recentEl.innerHTML = rows
                .map((r) => {
                    const dt = r.at
                        ? new Date(r.at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
                        : '—';
                    return `<div class="activity-item activity-item--${r.type}">
                        <div class="activity-item-head">
                            <span class="activity-item-title">${r.title}</span>
                            <time class="activity-item-time" datetime="${r.at || ''}">${dt}</time>
                        </div>
                        ${r.body ? `<div class="activity-item-body">${r.body}</div>` : ''}
                    </div>`;
                })
                .join('');
        }
    }

    await loadVisitorAnalyticsPanel();
    await loadCreatorAuditLogsPanel();
    refreshVisitorRealtimeState();
}

async function loadCreatorAuditLogsPanel() {
    const box = document.getElementById('creatorAuditList');
    if (!box || !window.creatorAdminPanel) return;
    box.innerHTML = '<p class="activity-empty">Загрузка лога аудита…</p>';
    const actionFilter = document.getElementById('creatorAuditActionFilter')?.value || '';
    const { rows, error } = await window.creatorAdminPanel.getCreatorAuditLogs(120, actionFilter);
    if (error) {
        box.innerHTML = `<p class="activity-empty" style="color:#f87171;">${adminPanelEscapeHtml(error)}</p>`;
        return;
    }
    if (!rows.length) {
        box.innerHTML = '<p class="activity-empty">Записей пока нет.</p>';
        return;
    }
    box.innerHTML = rows
        .map((row) => {
            const at = row.created_at
                ? new Date(row.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' })
                : '—';
            const actor = row.actor_name || (row.actor_user_id ? row.actor_user_id.slice(0, 8) + '…' : '—');
            const target = row.target_name || (row.target_user_id ? row.target_user_id.slice(0, 8) + '…' : '—');
            let details = '';
            try {
                details = row.details ? JSON.stringify(row.details) : '';
            } catch (_) {
                details = '';
            }
            return `<div class="activity-item">
                <div class="activity-item-head">
                    <span class="activity-item-title">${adminPanelEscapeHtml(row.action || 'unknown')}</span>
                    <time class="activity-item-time">${adminPanelEscapeHtml(at)}</time>
                </div>
                <div class="activity-item-body">
                    <strong>Кто:</strong> ${adminPanelEscapeHtml(actor)} ·
                    <strong>Цель:</strong> ${adminPanelEscapeHtml(target)}${row.reason ? ` · <strong>Причина:</strong> ${adminPanelEscapeHtml(row.reason)}` : ''}
                </div>
                ${details ? `<div class="activity-item-body" style="margin-top:0.35rem;font-family:ui-monospace,monospace;">${adminPanelEscapeHtml(details.slice(0, 280))}${details.length > 280 ? '…' : ''}</div>` : ''}
            </div>`;
        })
        .join('');
}

async function loadVisitorAnalyticsPanel() {
    const el = document.getElementById('visitorAnalyticsContent');
    if (!el || !window.creatorAdminPanel) return;
    const days = parseInt(document.getElementById('visitorAnalyticsPeriod')?.value, 10) || 7;
    const onlineMins = parseInt(document.getElementById('visitorOnlineWindow')?.value, 10) || 5;
    const liveEnabled = !!document.getElementById('visitorAnalyticsRealtimeToggle')?.checked;

    el.innerHTML = '<p class="admin-inline-hint">Загрузка…</p>';
    const [{ bundle, recent, error }, onlineRes] = await Promise.all([
        window.creatorAdminPanel.getSiteVisitAnalytics(days),
        window.creatorAdminPanel.getSiteOnlineUsers(onlineMins)
    ]);

    if (error) {
        el.innerHTML = `<p class="admin-inline-hint" style="color:#f87171;">${adminPanelEscapeHtml(error)}</p>`;
        return;
    }

    const s = bundle?.summary || {};
    const live = bundle?.live || null;
    const byDay = Array.isArray(bundle?.by_day) ? bundle.by_day : [];
    const topPathsFromRpc = Array.isArray(bundle?.top_paths) ? bundle.top_paths : [];
    const onlineRows = onlineRes.rows || [];
    const onlineErr = onlineRes.error;

    const pageviewRows = (recent || []).filter((r) => r.event_kind === 'pageview');

    const topPaths =
        topPathsFromRpc.length > 0
            ? topPathsFromRpc
            : (() => {
                  const m = new Map();
                  pageviewRows.forEach((r) => {
                      const p = String(r.path || '/').trim() || '/';
                      m.set(p, (m.get(p) || 0) + 1);
                  });
                  return [...m.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 10)
                      .map(([path, cnt]) => ({ path, cnt }));
              })();

    const fmtTime = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const fmtPath = (p) => {
        const s = String(p || '/');
        return s.length > 42 ? s.slice(0, 39) + '…' : s;
    };

    let html = `<p class="va-compact__updated">Обновлено ${new Date().toLocaleTimeString('ru-RU')}${liveEnabled ? ' · live' : ''}</p>`;

    html += '<div class="va-compact__stats">';
    html += `<div class="va-compact__stat"><span>Онлайн</span><strong>${onlineRows.length}</strong></div>`;
    html += `<div class="va-compact__stat"><span>За период</span><strong>${Number(s.unique_visitors || 0)}</strong></div>`;
    html += `<div class="va-compact__stat"><span>Просмотры</span><strong>${Number(s.pageviews || 0)}</strong></div>`;
    html += `<div class="va-compact__stat"><span>Аккаунты</span><strong>${Number(s.unique_logged_accounts || 0)}</strong></div>`;
    if (live && Number(live.unique_visitors || 0) > 0) {
        html += `<div class="va-compact__stat va-compact__stat--live"><span>15 мин</span><strong>${Number(live.unique_visitors || 0)}</strong></div>`;
    }
    html += '</div>';

    html += '<div class="va-compact__grid">';
    html += `<section class="va-compact__panel va-compact__panel--online">
        <div class="va-compact__panel-head">
            <h3>Сейчас в сети</h3>
            <span class="va-compact__pill">${onlineRows.length} · ${onlineMins} мин</span>
        </div>`;
    if (onlineErr) {
        html += `<p class="va-compact__empty va-compact__empty--err">${adminPanelEscapeHtml(onlineErr)}</p>`;
    } else if (!onlineRows.length) {
        html += '<p class="va-compact__empty">Никого нет в выбранном окне.</p>';
    } else {
        html += '<ul class="va-online-list">';
        onlineRows.slice(0, 80).forEach((row) => {
            const uid = row.user_id && String(row.user_id).trim();
            const isUser = !!uid;
            const name = isUser
                ? adminPanelEscapeHtml(row.username || row.email || 'Без имени')
                : adminPanelEscapeHtml(String(row.visitor_id || '').slice(0, 12) + '…');
            const sub = isUser
                ? adminPanelEscapeHtml(String(row.email || row.user_id).slice(0, 36))
                : `<span class="vac-mono">guest ${adminPanelEscapeHtml(String(row.visitor_id || '').slice(0, 18))}…</span>`;
            const path = fmtPath(row.last_path);
            const time = fmtTime(row.last_seen);
            html += `<li class="va-online-item ${isUser ? 'va-online-item--user' : ''}">
                <span class="va-online-dot" aria-hidden="true"></span>
                <div class="va-online-main">
                    <div class="va-online-row1">
                        ${
                            isUser
                                ? `<button type="button" class="va-online-name va-online-name--link" data-va-user="${adminPanelEscapeHtml(uid)}" title="Открыть профиль">${name}</button>`
                                : `<span class="va-online-name">${name}</span>`
                        }
                        <time class="va-online-time">${adminPanelEscapeHtml(time)}</time>
                    </div>
                    <div class="va-online-row2">${sub}</div>
                    <div class="va-online-row3 vac-mono" title="${adminPanelEscapeHtml(String(row.last_path || ''))}">${adminPanelEscapeHtml(path)}</div>
                </div>
            </li>`;
        });
        html += '</ul>';
        if (onlineRows.length > 80) {
            html += `<p class="va-compact__more">+ ещё ${onlineRows.length - 80}</p>`;
        }
    }
    html += '</section>';

    html += `<section class="va-compact__panel">
        <div class="va-compact__panel-head"><h3>Популярные страницы</h3></div>`;
    if (!topPaths.length) {
        html += '<p class="va-compact__empty">Нет данных.</p>';
    } else {
        html += '<ul class="va-paths-list">';
        topPaths.slice(0, 8).forEach((row) => {
            html += `<li><span class="vac-mono" title="${adminPanelEscapeHtml(String(row.path || ''))}">${adminPanelEscapeHtml(fmtPath(row.path))}</span><strong>${Number(row.cnt || 0)}</strong></li>`;
        });
        html += '</ul>';
    }
    html += '</section>';
    html += '</div>';

    if (byDay.length) {
        html += `<details class="va-compact__details"><summary>По дням (UTC)</summary><div class="va-compact__byday">`;
        byDay.forEach((row) => {
            html += `<span>${adminPanelEscapeHtml(String(row.day ?? '—'))}: <strong>${Number(row.cnt ?? 0)}</strong></span>`;
        });
        html += '</div></details>';
    }

    html += `<details class="va-compact__details"><summary>Последние просмотры (${Math.min(pageviewRows.length, 25)})</summary>`;
    html += '<div class="va-compact__table-wrap"><table class="va-compact__table"><thead><tr><th>Время</th><th>Кто</th><th>Страница</th></tr></thead><tbody>';
    if (!pageviewRows.length) {
        html += '<tr><td colspan="3">Пусто</td></tr>';
    } else {
        pageviewRows.slice(0, 25).forEach((r) => {
            const who = r.user_id
                ? `<button type="button" class="va-online-name va-online-name--link" data-va-user="${adminPanelEscapeHtml(String(r.user_id))}">${adminPanelEscapeHtml(String(r.user_id).slice(0, 8))}…</button>`
                : `<span class="vac-mono">${adminPanelEscapeHtml(String(r.visitor_id || '').slice(0, 10))}…</span>`;
            html += `<tr>
                <td>${adminPanelEscapeHtml(fmtTime(r.created_at))}</td>
                <td>${who}</td>
                <td class="vac-mono" title="${adminPanelEscapeHtml(String(r.path || ''))}">${adminPanelEscapeHtml(fmtPath(r.path))}</td>
            </tr>`;
        });
    }
    html += '</tbody></table></div></details>';

    el.innerHTML = html;

    el.querySelectorAll('[data-va-user]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const uid = btn.getAttribute('data-va-user');
            if (uid && typeof showUserActions === 'function') void showUserActions(uid);
        });
    });
}

function initUsersSection() {
    if (window.__reminkoUsersUiBound) return;
    window.__reminkoUsersUiBound = true;

    const search = document.getElementById('usersSearchInput');
    const banFilter = document.getElementById('usersBanFilter');
    const cardsBtn = document.getElementById('usersViewCardsBtn');
    const tableBtn = document.getElementById('usersViewTableBtn');
    const triggerReload = () => {
        clearTimeout(__usersDebounce);
        __usersDebounce = setTimeout(() => void loadUsersAdvanced(1), 260);
    };
    search?.addEventListener('input', triggerReload);
    banFilter?.addEventListener('change', triggerReload);
    cardsBtn?.addEventListener('click', () => applyUsersViewMode('cards'));
    tableBtn?.addEventListener('click', () => applyUsersViewMode('table'));
    applyUsersViewMode('cards');
}

async function loadUsersAdvanced(page = 1) {
    currentUsersPage = page;
    const search = document.getElementById('usersSearchInput')?.value || '';
    const banFilter = document.getElementById('usersBanFilter')?.value || '';
    const cards = document.getElementById('usersCardsGrid');
    const tableBody = document.getElementById('usersTableBody');
    if (!cards || !tableBody || !window.creatorAdminPanel) return;

    const filters = {
        search,
        banned: banFilter ? banFilter === 'true' : undefined,
    };

    const result = await window.creatorAdminPanel.getUsersAdvanced(page, usersPerPage, filters);
    if (!result.users.length) {
        cards.innerHTML = '<div class="users-card-empty">Пользователи не найдены</div>';
        tableBody.innerHTML =
            '<tr><td colspan="7" style="text-align:center;padding:2rem;">Пользователи не найдены</td></tr>';
        updateUsersPagination(0, page);
        return;
    }

    cards.innerHTML = result.users
        .map((u) => {
            const statusChip = u.is_banned
                ? '<span class="users-card-chip users-card-chip--bad">Забанен</span>'
                : '<span class="users-card-chip users-card-chip--ok">Активен</span>';
            const vipText = u.vip
                ? `<span style="color:#ffd700;">VIP до ${
                      u.vip.expires_at ? new Date(u.vip.expires_at).toLocaleDateString('ru-RU') : '—'
                  }</span>`
                : 'Нет';
            const usernameCell = `${adminPanelEscapeHtml(u.username || 'Без имени')}${
                u.is_site_creator_account
                    ? ' <span style="color:#e9d5ff;font-size:0.78rem;font-weight:700;">[Создатель]</span>'
                    : ''
            }`;
            return `<article class="users-card">
                <div class="users-card-head">
                    <div>
                        <h4 class="users-card-name">${usernameCell}</h4>
                        <p class="users-card-email">${adminPanelEscapeHtml(u.email || 'Не указан')}</p>
                    </div>
                    ${statusChip}
                </div>
                <div class="users-card-meta">
                    <div><strong>ID:</strong> <span style="font-family:ui-monospace,monospace;">${adminPanelEscapeHtml(
                        String(u.id || '').slice(0, 8)
                    )}…</span></div>
                    <div><strong>VIP:</strong> ${vipText}</div>
                    <div><strong>Чат:</strong> ${Number(u.activity?.chat_messages || 0)}</div>
                    <div><strong>Вход:</strong> ${Number(u.activity?.logins || 0)}</div>
                </div>
                <div class="users-card-actions">
                    ${
                        u.is_banned
                            ? `<button class="users-card-btn" onclick="toggleBan('${u.id}', false)">✅ Разбан</button>`
                            : `<button class="users-card-btn users-card-btn--danger" onclick="toggleBan('${u.id}', true)">🚫 Бан</button>`
                    }
                    <button class="users-card-btn" onclick="muteUserChatAction('${u.id}')">🔇 Мут</button>
                    <button class="users-card-btn" onclick="showEditSubscriptions('${u.id}')">💎 VIP</button>
                    <button class="users-card-btn" onclick="showAiSubscriptionEditor('${u.id}')">🤖 AI</button>
                    <button class="users-card-btn" onclick="showUserActions('${u.id}')">⚙️ Меню</button>
                    <button class="users-card-btn users-card-btn--danger" onclick="confirmFullDeleteUser('${u.id}')">⛔ Удалить</button>
                </div>
            </article>`;
        })
        .join('');
    tableBody.innerHTML = result.users
        .map((u) => {
            const status = u.is_banned
                ? '<span style="color:#ef4444;">Забанен</span>'
                : '<span style="color:#10b981;">Активен</span>';
            const vip = u.vip
                ? `<span style="color:#ffd700;">VIP до ${
                      u.vip.expires_at ? new Date(u.vip.expires_at).toLocaleDateString('ru-RU') : '—'
                  }</span>`
                : 'Нет';
            return `<tr>
                <td style="font-family:monospace;font-size:0.85rem;">${adminPanelEscapeHtml(String(u.id || '').slice(0, 8))}...</td>
                <td>${adminPanelEscapeHtml(u.email || 'Не указан')}</td>
                <td>${adminPanelEscapeHtml(u.username || 'Без имени')}</td>
                <td>${vip}</td>
                <td>${status}</td>
                <td><small>💬 ${u.activity?.chat_messages || 0}</small></td>
                <td><button class="admin-btn" onclick="showUserActions('${u.id}')" style="padding:0.5rem;font-size:0.85rem;">⚙️</button></td>
            </tr>`;
        })
        .join('');
    updateUsersPagination(result.total, page);
}

function updateUsersPagination(total, currentPage) {
    const pagination = document.getElementById('usersPagination');
    if (!pagination) return;
    const totalPages = Math.ceil(total / usersPerPage);
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    if (currentPage > 1) {
        html += `<button class="pagination-btn" onclick="loadUsersAdvanced(${currentPage - 1})">← Назад</button>`;
    }
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="loadUsersAdvanced(${i})">${i}</button>`;
    }
    if (currentPage < totalPages) {
        html += `<button class="pagination-btn" onclick="loadUsersAdvanced(${currentPage + 1})">Вперёд →</button>`;
    }
    pagination.innerHTML = html;
}

async function showUserActions(userId) {
    const { data: user } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (!user) return;

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Действия с пользователем</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <p><strong>Имя:</strong> ${adminPanelEscapeHtml(user.username || 'Без имени')}</p>
                <p><strong>ID:</strong> <code>${adminPanelEscapeHtml(userId)}</code></p>
                <p><strong>Статус:</strong> ${user.is_banned ? 'Забанен' : 'Активен'}</p>
                <div style="margin-top:1.25rem;display:flex;flex-direction:column;gap:0.55rem;">
                    ${
                        user.is_banned
                            ? `<button class="admin-btn" onclick="toggleBan('${userId}', false)">✅ Разбанить</button>`
                            : `<button class="admin-btn admin-btn-danger" onclick="toggleBan('${userId}', true)">🚫 Забанить</button>`
                    }
                    <button class="admin-btn" onclick="showEditUserUsername('${userId}')">✏️ Изменить имя</button>
                    <button class="admin-btn" onclick="showEditSubscriptions('${userId}')">💎 VIP «Смотреть вместе»</button>
                    <button class="admin-btn" onclick="showAiSubscriptionEditor('${userId}')">🤖 Тариф Minko AI</button>
                    <button class="admin-btn" onclick="showUserActivity('${userId}')">📊 Активность</button>
                    <button class="admin-btn" onclick="sendNotificationToUser('${userId}')">🔔 Уведомление</button>
                    <button class="admin-btn" onclick="muteUserChatAction('${userId}')">🔇 Мут в чате</button>
                    <button class="admin-btn admin-btn-danger" onclick="confirmFullDeleteUser('${userId}')">⛔ Полностью удалить аккаунт</button>
                </div>
            </div>
            <div class="modal-footer">
                <button class="admin-btn admin-btn-secondary" onclick="this.closest('.modal').remove()">Закрыть</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function confirmFullDeleteUser(userId) {
    const modalData = await openCreatorActionModal({
        title: 'Полное удаление аккаунта',
        submitLabel: 'Удалить навсегда',
        danger: true,
        fields: [
            { id: 'phrase', label: 'Введите УДАЛИТЬ для подтверждения', placeholder: 'УДАЛИТЬ' },
            { id: 'reason', label: 'Причина удаления (аудит)', placeholder: 'Причина...', type: 'textarea' },
        ],
    });
    if (!modalData) return;
    if (String(modalData.phrase || '').trim() !== 'УДАЛИТЬ') {
        showErrorSafe('Подтверждение неверное: нужно ввести УДАЛИТЬ');
        return;
    }
    const result = await window.creatorAdminPanel.deleteUserAccountFully(userId, String(modalData.reason || '').trim());
    if (result.success) {
        if (typeof showSuccess === 'function') showSuccess('Аккаунт удалён полностью');
        document.querySelector('.modal.active')?.remove();
        await loadUsersAdvanced(currentUsersPage);
        await loadCreatorAuditLogsPanel();
    } else {
        showErrorSafe(result.message || 'Ошибка полного удаления аккаунта');
    }
}

async function toggleBan(userId, ban) {
    let reason = '';
    if (ban) {
        const modalData = await openCreatorActionModal({
            title: 'Бан пользователя',
            submitLabel: 'Подтвердить бан',
            danger: true,
            fields: [{ id: 'reason', label: 'Причина бана', placeholder: 'Опишите причину', type: 'textarea' }],
        });
        if (!modalData) return;
        reason = String(modalData.reason || '').trim();
        if (!reason) {
            showErrorSafe('Укажите причину бана');
            return;
        }
    }
    const result = await window.creatorAdminPanel.toggleUserBan(userId, ban, reason || '');
    if (result.success) {
        if (typeof showSuccess === 'function') showSuccess(result.message);
        document.querySelector('.modal.active')?.remove();
        void loadUsersAdvanced(currentUsersPage);
    } else {
        showErrorSafe(result.message || 'Ошибка');
    }
}

async function muteUserChatAction(userId) {
    const modalData = await openCreatorActionModal({
        title: 'Мут пользователя в чате',
        submitLabel: 'Выдать мут',
        fields: [
            { id: 'hours', label: 'Количество часов', placeholder: '24', value: '24', type: 'number' },
            { id: 'reason', label: 'Причина мута', placeholder: 'Нарушение правил', value: 'Нарушение правил', type: 'textarea' },
        ],
    });
    if (!modalData) return;
    const hours = parseInt(String(modalData.hours || '0'), 10);
    const reason = String(modalData.reason || '').trim();
    if (!Number.isFinite(hours) || hours <= 0) {
        showErrorSafe('Количество часов должно быть больше 0');
        return;
    }
    if (!reason) {
        showErrorSafe('Укажите причину мута');
        return;
    }
    const result = await window.creatorAdminPanel.muteUserChat(userId, hours, reason);
    if (result.success) {
        if (typeof showSuccess === 'function') showSuccess(result.message);
        document.querySelector('.modal.active')?.remove();
    } else {
        showErrorSafe(result.message || 'Ошибка');
    }
}

function initModerationSection() {
    if (window.__reminkoModerationBound) return;
    window.__reminkoModerationBound = true;
    const debounced = () => {
        clearTimeout(__chatDebounce);
        __chatDebounce = setTimeout(() => void loadChatMessagesMod(), 260);
    };
    document.getElementById('chatSearchInput')?.addEventListener('input', debounced);
    document.getElementById('chatDateFrom')?.addEventListener('change', debounced);
    document.getElementById('chatDateTo')?.addEventListener('change', debounced);
    document.getElementById('chatAutomodRefreshBtn')?.addEventListener('click', () => void loadChatAutomodPanel());
    document.getElementById('chatAutomodSaveBtn')?.addEventListener('click', () => void saveChatAutomodPanel());
    document.getElementById('chatAutomodRuleSearchInput')?.addEventListener('input', () => applyChatAutomodRulesFilter());
    document.getElementById('chatAutomodResetUserBtn')?.addEventListener('click', () => void resetChatAutomodUserStateAction());
}

async function loadChatAutomodPanel() {
    const listEl = document.getElementById('chatAutomodRulesList');
    const enabledToggle = document.getElementById('chatAutomodEnabledToggle');
    const statusEl = document.getElementById('chatAutomodSaveStatus');
    if (!listEl || !enabledToggle || !window.creatorAdminPanel) return;

    listEl.innerHTML = '<p class="activity-empty">Загрузка правил автомодерации…</p>';
    if (statusEl) statusEl.textContent = '';

    const cfg = await window.creatorAdminPanel.getChatAutomodConfig();
    if (!cfg.ok) {
        listEl.innerHTML = `<p class="activity-empty" style="color:#f87171;">${adminPanelEscapeHtml(cfg.message || 'Ошибка загрузки')}</p>`;
        return;
    }

    __chatAutomodRulesCache = Array.isArray(cfg.rules) ? cfg.rules : [];
    enabledToggle.checked = !!cfg.enabled;

    if (!__chatAutomodRulesCache.length) {
        listEl.innerHTML = '<p class="activity-empty">Правила не найдены.</p>';
        return;
    }

    listEl.innerHTML = __chatAutomodRulesCache
        .map((r) => {
            return `<div class="automod-rule-row" data-rule-id="${Number(r.id)}">
                <div>
                    <div class="automod-rule-key">${adminPanelEscapeHtml(String(r.rule_key || 'rule'))}</div>
                    <div class="automod-rule-note">${adminPanelEscapeHtml(String(r.note || r.pattern || ''))}</div>
                </div>
                <label class="visitor-analytics-period-label" style="font-size:0.78rem;gap:0.35rem;">
                    <input type="checkbox" class="automod-rule-active" ${r.is_active ? 'checked' : ''}>
                    active
                </label>
                <label class="visitor-analytics-period-label" style="font-size:0.78rem;gap:0.35rem;">
                    strike
                    <input class="automod-rule-input automod-rule-strike" type="number" min="1" value="${Number(r.strike_weight || 1)}">
                </label>
                <label class="visitor-analytics-period-label" style="font-size:0.78rem;gap:0.35rem;">
                    mute(мин)
                    <input class="automod-rule-input automod-rule-mute" type="number" min="1" value="${Number(r.mute_minutes || 15)}">
                </label>
            </div>`;
        })
        .join('');
    applyChatAutomodRulesFilter();
    await loadChatAutomodEventsPanel();
}

async function saveChatAutomodPanel() {
    const listEl = document.getElementById('chatAutomodRulesList');
    const enabledToggle = document.getElementById('chatAutomodEnabledToggle');
    const statusEl = document.getElementById('chatAutomodSaveStatus');
    if (!listEl || !enabledToggle || !window.creatorAdminPanel) return;

    const rows = Array.from(listEl.querySelectorAll('.automod-rule-row'));
    const rules = rows.map((row) => ({
        id: Number(row.getAttribute('data-rule-id') || 0),
        is_active: !!row.querySelector('.automod-rule-active')?.checked,
        strike_weight: Number(row.querySelector('.automod-rule-strike')?.value || 1),
        mute_minutes: Number(row.querySelector('.automod-rule-mute')?.value || 15),
    }));

    if (statusEl) statusEl.textContent = 'Сохранение…';
    const res = await window.creatorAdminPanel.saveChatAutomodConfig({
        enabled: !!enabledToggle.checked,
        rules,
    });
    if (res.success) {
        if (typeof showSuccess === 'function') showSuccess(res.message || 'Сохранено');
        if (statusEl) statusEl.textContent = 'Сохранено';
        await loadChatAutomodPanel();
    } else {
        showErrorSafe(res.message || 'Ошибка сохранения автомодерации');
        if (statusEl) statusEl.textContent = 'Ошибка сохранения';
    }
}

function applyChatAutomodRulesFilter() {
    const q = String(document.getElementById('chatAutomodRuleSearchInput')?.value || '')
        .trim()
        .toLowerCase();
    const rows = Array.from(document.querySelectorAll('#chatAutomodRulesList .automod-rule-row'));
    rows.forEach((row) => {
        if (!q) {
            row.style.display = '';
            return;
        }
        const text = String(row.textContent || '').toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

async function resetChatAutomodUserStateAction() {
    const input = document.getElementById('chatAutomodResetUserId');
    const userId = String(input?.value || '').trim();
    if (!userId) {
        showErrorSafe('Введите UUID пользователя для сброса');
        return;
    }
    const modalData = await openCreatorActionModal({
        title: 'Сброс автомодерации пользователя',
        submitLabel: 'Сбросить',
        danger: true,
        fields: [
            { id: 'reason', label: 'Причина сброса (аудит)', placeholder: 'Необязательно', type: 'textarea' },
        ],
    });
    if (!modalData) return;
    const res = await window.creatorAdminPanel.resetChatAutomodUserState(userId, String(modalData.reason || '').trim());
    if (res.success) {
        if (typeof showSuccess === 'function') showSuccess(res.message || 'Сброшено');
        await loadChatAutomodPanel();
    } else {
        showErrorSafe(res.message || 'Ошибка сброса');
    }
}

async function loadChatAutomodEventsPanel() {
    const box = document.getElementById('chatAutomodEventsList');
    if (!box || !window.creatorAdminPanel) return;
    box.innerHTML = '<p class="activity-empty">Загрузка событий автомодерации…</p>';
    const r = await window.creatorAdminPanel.getChatAutomodRecentEvents(40);
    if (!r.ok) {
        box.innerHTML = `<p class="activity-empty" style="color:#f87171;">${adminPanelEscapeHtml(r.message || 'Ошибка загрузки')}</p>`;
        return;
    }
    if (!r.rows.length) {
        box.innerHTML = '<p class="activity-empty">Срабатываний пока нет.</p>';
        return;
    }
    box.innerHTML = r.rows
        .map((row) => {
            const dt = row.created_at
                ? new Date(row.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' })
                : '—';
            const who = row.username ? `${adminPanelEscapeHtml(row.username)} (${adminPanelEscapeHtml(String(row.user_id || '').slice(0, 8))}…)` : adminPanelEscapeHtml(String(row.user_id || '—'));
            const rule = row.rule_key ? ` · rule: ${adminPanelEscapeHtml(row.rule_key)}` : '';
            const preview = row.message_preview ? `<div class="activity-item-body" style="margin-top:0.25rem;">${adminPanelEscapeHtml(String(row.message_preview))}</div>` : '';
            return `<div class="activity-item">
                <div class="activity-item-head">
                    <span class="activity-item-title">${adminPanelEscapeHtml(String(row.action || 'event'))}${rule}</span>
                    <time class="activity-item-time">${dt}</time>
                </div>
                <div class="activity-item-body">Пользователь: ${who}</div>
                ${preview}
            </div>`;
        })
        .join('');
}

async function loadChatMessagesMod() {
    const container = document.getElementById('chatMessagesMod');
    if (!container || !window.creatorAdminPanel) return;
    container.innerHTML = '<div style="text-align:center;padding:2rem;">Загрузка…</div>';

    const search = document.getElementById('chatSearchInput')?.value || '';
    const dateFrom = document.getElementById('chatDateFrom')?.value || '';
    const dateTo = document.getElementById('chatDateTo')?.value || '';

    const messages = await window.creatorAdminPanel.getChatMessages({
        search,
        fromDate: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        toDate: dateTo ? new Date(dateTo).toISOString() : undefined,
        limit: 100,
    });

    if (!messages.length) {
        container.innerHTML =
            '<div style="text-align:center;padding:2rem;color:var(--text-secondary);">Сообщения не найдены</div>';
        return;
    }

    container.innerHTML = messages
        .map((msg) => {
            return `<div class="message-item">
                <div class="message-item-header">
                    <div>
                        <div class="message-item-user">${adminPanelEscapeHtml(msg.user?.username || 'Неизвестный')}</div>
                        <div class="message-item-time">${new Date(msg.created_at).toLocaleString('ru-RU')}</div>
                    </div>
                </div>
                <div style="color:var(--text-color);margin:0.5rem 0;">${adminPanelEscapeHtml(msg.message || '')}</div>
                <div class="message-item-actions">
                    <button class="admin-btn admin-btn-danger" style="padding:0.5rem;font-size:0.85rem;" onclick="deleteChatMessage('${msg.id}')">🗑️ Удалить</button>
                    <button class="admin-btn" style="padding:0.5rem;font-size:0.85rem;" onclick="muteUserChatAction('${msg.user_id}')">🔇 Мут</button>
                </div>
            </div>`;
        })
        .join('');
}

async function deleteChatMessage(messageId) {
    const result = await window.creatorAdminPanel.deleteChatMessage(messageId, '');
    if (result.success) {
        if (typeof showSuccess === 'function') showSuccess(result.message);
        void loadChatMessagesMod();
    } else {
        showErrorSafe(result.message || 'Ошибка удаления');
    }
}

function initNotificationsSection() {
    // Здесь пока достаточно загрузить блок-подсказку и модалки отправки.
}

function showSendNotificationModal(type) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">🔔 Отправить уведомление</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                ${
                    type === 'single'
                        ? `<div class="setting-item"><label>ID пользователя:</label><input type="text" class="setting-input" id="notifUserId" placeholder="UUID пользователя"></div>`
                        : type === 'bulk'
                          ? `<div class="setting-item"><label>ID пользователей (через запятую):</label><textarea class="setting-textarea" id="notifUserIds" placeholder="uuid1, uuid2"></textarea></div>`
                          : ''
                }
                <div class="setting-item">
                    <label>Тип уведомления:</label>
                    <select class="setting-select" id="notifType">
                        <option value="system">Система</option>
                        <option value="admin_message">Сообщение от админа</option>
                        <option value="new_episode">Новая серия</option>
                        <option value="chat_reply">Ответ в чате</option>
                    </select>
                </div>
                <div class="setting-item"><label>Заголовок:</label><input type="text" class="setting-input" id="notifTitle"></div>
                <div class="setting-item"><label>Сообщение:</label><textarea class="setting-textarea" id="notifMessage"></textarea></div>
                <div class="setting-item"><label>Ссылка (необязательно):</label><input type="text" class="setting-input" id="notifLink" placeholder="/page.html"></div>
            </div>
            <div class="modal-footer">
                <button class="admin-btn" onclick="sendNotification('${type}')">Отправить</button>
                <button class="admin-btn admin-btn-secondary" onclick="this.closest('.modal').remove()">Отмена</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function sendNotification(type) {
    const title = document.getElementById('notifTitle')?.value || '';
    const message = document.getElementById('notifMessage')?.value || '';
    const notifType = document.getElementById('notifType')?.value || 'system';
    const link = document.getElementById('notifLink')?.value || null;
    if (!title.trim() || !message.trim()) {
        showErrorSafe('Заполните заголовок и сообщение');
        return;
    }

    let result = null;
    if (type === 'single') {
        const userId = document.getElementById('notifUserId')?.value || '';
        if (!userId.trim()) return showErrorSafe('Введите ID пользователя');
        result = await window.creatorAdminPanel.sendNotificationToUser(userId.trim(), title, message, notifType, link);
    } else if (type === 'bulk') {
        const userIdsText = document.getElementById('notifUserIds')?.value || '';
        const userIds = userIdsText.split(',').map((id) => id.trim()).filter(Boolean);
        if (!userIds.length) return showErrorSafe('Введите ID пользователей');
        result = await window.creatorAdminPanel.sendBulkNotifications(userIds, title, message, notifType, link);
    } else if (type === 'all') {
        const { data: profiles } = await supabaseClient.from('profiles').select('id');
        const userIds = (profiles || []).map((p) => p.id);
        result = await window.creatorAdminPanel.sendBulkNotifications(userIds, title, message, notifType, link);
    }

    if (result && result.success) {
        if (typeof showSuccess === 'function') showSuccess(result.message);
        document.querySelector('.modal.active')?.remove();
    } else {
        showErrorSafe(result?.message || 'Ошибка отправки');
    }
}

async function loadNotificationsManagement() {
    const container = document.getElementById('notificationsManagement');
    if (!container) return;
    container.innerHTML =
        '<p style="text-align:center;color:var(--text-secondary);">Выберите тип отправки уведомлений кнопками выше.</p>';
}

function initMinkoAiServerPanel() {
    if (window.__reminkoMinkoSrvBound) return;
    window.__reminkoMinkoSrvBound = true;
    document.getElementById('minkoSrvSaveBtn')?.addEventListener('click', () => void saveMinkoAiServerPanel());
}

function initTestsSection() {
    if (window.__reminkoTestsSectionBound) return;
    window.__reminkoTestsSectionBound = true;

    const switchMobileDemoPanel = (name) => {
        const panelName = name || 'home';
        document.querySelectorAll('[data-mobile-demo-panel]').forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.mobileDemoPanel === panelName);
        });
        document.querySelectorAll('[data-mobile-demo-tab]').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mobileDemoTab === panelName);
        });
    };

    document.querySelectorAll('.admin-tests-subtab').forEach((btn) => {
        btn.addEventListener('click', () => {
            const name = btn.dataset.testTab || 'mobile';
            document.querySelectorAll('.admin-tests-subtab').forEach((item) => {
                const active = item.dataset.testTab === name;
                item.classList.toggle('active', active);
                item.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            document.querySelectorAll('.admin-tests-panel').forEach((panel) => {
                const active = panel.dataset.testPanel === name;
                panel.classList.toggle('active', active);
                panel.hidden = !active;
            });
        });
    });

    document.querySelectorAll('[data-mobile-demo-tab]').forEach((btn) => {
        btn.addEventListener('click', () => switchMobileDemoPanel(btn.dataset.mobileDemoTab));
    });
    document.querySelectorAll('[data-mobile-demo-open]').forEach((btn) => {
        btn.addEventListener('click', () => switchMobileDemoPanel(btn.dataset.mobileDemoOpen));
    });

    const search = document.getElementById('mobileDemoSearchInput');
    const results = document.getElementById('mobileDemoSearchResults');
    search?.addEventListener('input', () => {
        const q = String(search.value || '').toLowerCase().trim();
        results?.querySelectorAll('[data-title]').forEach((row) => {
            const title = String(row.dataset.title || row.textContent || '').toLowerCase();
            row.hidden = !!q && !title.includes(q);
        });
    });
}

async function loadMinkoAiServerPanel() {
    const statusEl = document.getElementById('minkoSrvSaveStatus');
    const en = document.getElementById('minkoSrvEnabled');
    const offExceptCreator = document.getElementById('minkoSrvOfflineExceptCreator');
    const msg = document.getElementById('minkoSrvMessage');
    if (!window.creatorAdminPanel) return;
    if (statusEl) statusEl.textContent = 'Загрузка…';

    const bundle = await window.creatorAdminPanel.getMinkoAiServerBundle();
    if (!bundle.ok) {
        if (statusEl) statusEl.textContent = bundle.message || 'Ошибка';
        return;
    }
    if (en) en.checked = !!bundle.public.chat_enabled;
    if (offExceptCreator) offExceptCreator.checked = !!bundle.public.offline_except_creator;
    if (msg) msg.value = bundle.public.maintenance_message || '';
    if (statusEl) statusEl.textContent = '';
}

async function saveMinkoAiServerPanel() {
    const statusEl = document.getElementById('minkoSrvSaveStatus');
    const en = document.getElementById('minkoSrvEnabled');
    const offExceptCreator = document.getElementById('minkoSrvOfflineExceptCreator');
    const msg = document.getElementById('minkoSrvMessage');
    if (!window.creatorAdminPanel) return;
    const r = await window.creatorAdminPanel.saveMinkoAiServerSettings(
        !!en?.checked,
        msg?.value || '',
        !!offExceptCreator?.checked
    );
    if (statusEl) statusEl.textContent = r.success ? '✓ ' + r.message : '✗ ' + (r.message || 'Ошибка');
    if (r.success && typeof showSuccess === 'function') showSuccess(r.message);
    if (!r.success && typeof showError === 'function') showError(r.message);
    if (r.success) await loadCreatorAuditLogsPanel();
}

const MAINT_ROUTE_OPTIONS = [
    ['home', 'Главная'],
    ['register', 'Регистрация (кнопка в шапке)'],
    ['messages', 'Личные сообщения'],
    ['friends', 'Друзья'],
    ['watch_together', 'Смотреть вместе'],
    ['profile', 'Профиль'],
    ['favorites', 'Избранное (аниме)'],
    ['info', 'Страница «Инфо»'],
    ['history', 'История просмотра'],
    ['favorites-manga', 'Избранное (манга)'],
    ['manga_catalog', 'Каталог манги'],
    ['calendar', 'Календарь аниме'],
    ['anime_4k', 'Каталог ≈4K'],
    ['minko_ai', 'Minko AI'],
    ['admin', 'Панель создателя'],
    ['support', 'Чат поддержки'],
    ['reader', 'Читалка манги'],
    ['privacy', 'Политика конфиденциальности'],
    ['terms', 'Условия использования'],
];

function initMaintenanceSettingsSection() {
    const box = document.getElementById('maintExtraRoutes');
    const btn = document.getElementById('maintSaveBtn');
    if (!box || box.dataset.wired === '1') return;
    box.dataset.wired = '1';

    MAINT_ROUTE_OPTIONS.forEach(([key, label]) => {
        const id = `maintRoute_${key.replace(/[^a-z0-9_-]/gi, '_')}`;
        const wrap = document.createElement('label');
        wrap.className = 'setting-item';
        wrap.style.cssText = 'display:flex;align-items:center;gap:0.5rem;cursor:pointer;margin:0;';
        wrap.innerHTML = `<input type="checkbox" id="${id}" data-maint-route="${adminPanelEscapeHtml(key)}" /> <span>${adminPanelEscapeHtml(label)}</span>`;
        box.appendChild(wrap);
    });
    btn?.addEventListener('click', () => void saveMaintenanceSettings());
}

async function loadMaintenanceSettings() {
    initMaintenanceSettingsSection();
    const statusEl = document.getElementById('maintSaveStatus');
    const enabledEl = document.getElementById('maintEnabled');
    if (!supabaseClient || !enabledEl) return;
    const { data, error } = await supabaseClient
        .from('site_maintenance_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
    if (error) {
        if (statusEl) {
            statusEl.textContent =
                'Не удалось загрузить конфиг. Убедитесь, что в Supabase есть site_maintenance_config.';
        }
        return;
    }
    enabledEl.checked = !!(data && data.maintenance_enabled);
    const extras = new Set((data && data.extra_allowed_routes) || []);
    document.querySelectorAll('[data-maint-route]').forEach((cb) => {
        cb.checked = extras.has(cb.getAttribute('data-maint-route'));
    });
    if (statusEl) statusEl.textContent = '';
}

async function saveMaintenanceSettings() {
    const statusEl = document.getElementById('maintSaveStatus');
    if (!supabaseClient) return showErrorSafe('Нет подключения к Supabase');
    const enabled = !!document.getElementById('maintEnabled')?.checked;
    const routes = [];
    document.querySelectorAll('[data-maint-route]:checked').forEach((cb) => {
        const k = cb.getAttribute('data-maint-route');
        if (k) routes.push(k);
    });
    const { error } = await supabaseClient
        .from('site_maintenance_config')
        .update({ maintenance_enabled: enabled, extra_allowed_routes: routes })
        .eq('id', 1);
    if (error) return showErrorSafe(error.message || 'Не сохранено');
    if (window.creatorAdminPanel && typeof window.creatorAdminPanel.appendCreatorAuditLog === 'function') {
        await window.creatorAdminPanel.appendCreatorAuditLog('maintenance_settings_save', {
            targetType: 'site',
            details: { maintenance_enabled: enabled, routes_count: routes.length },
        });
    }
    if (statusEl) statusEl.textContent = 'Сохранено.';
    if (typeof showSuccess === 'function') showSuccess('Режим обновлён');
    await loadCreatorAuditLogsPanel();
}

function initCreatorSettingsSection() {
    if (window.__reminkoCreatorSettingsBound) return;
    window.__reminkoCreatorSettingsBound = true;

    document.getElementById('settingsDeployMarkBtn')?.addEventListener('click', () => void touchSettingsDeployMark());
    document.getElementById('settingsMinkoSaveBtn')?.addEventListener('click', () => void saveSettingsMinkoQuick());
    document.getElementById('settingsGoMinkoTabBtn')?.addEventListener('click', () => switchTab('minkoServer'));
    document.getElementById('settingsNetlifyHookSaveBtn')?.addEventListener('click', () => void saveSettingsNetlifyHook());
    document.getElementById('settingsNetlifyDeployBtn')?.addEventListener('click', () => void triggerSettingsNetlifyDeploy());
    document.getElementById('settingsChatAutomodSaveBtn')?.addEventListener('click', () => void saveSettingsChatAutomodShortcut());
    document.getElementById('settingsGoModerationBtn')?.addEventListener('click', () => switchTab('moderation'));
    document.getElementById('settingsGoNotificationsBtn')?.addEventListener('click', () => switchTab('notifications'));
}

async function loadCreatorSettingsTab() {
    initMaintenanceSettingsSection();
    initCreatorSettingsSection();
    await loadMaintenanceSettings();
    await loadSettingsDeployMark();
    await loadSettingsMinkoQuick();
    await loadSettingsNetlifyHook();
    await loadSettingsChatAutomodShortcut();
    renderSettingsSiteInfo();
}

function renderSettingsSiteInfo() {
    const originEl = document.getElementById('settingsSiteOrigin');
    const creatorEl = document.getElementById('settingsCreatorUserId');
    if (originEl) {
        originEl.textContent =
            (window.APP_CONFIG && window.APP_CONFIG.siteOrigin) ||
            window.location.origin ||
            '—';
    }
    if (creatorEl) {
        const id =
            (window.APP_CONFIG && window.APP_CONFIG.siteCreatorUserId) ||
            window.__reminkoSiteCreatorUserId ||
            '—';
        creatorEl.textContent = id || '— (задайте siteCreatorUserId в config)';
    }
}

async function loadSettingsDeployMark() {
    const statusEl = document.getElementById('settingsDeployMarkStatus');
    if (!statusEl || !window.creatorAdminPanel) return;
    statusEl.textContent = 'Загрузка…';
    const r = await window.creatorAdminPanel.getDeployStatusMark();
    if (r.error) {
        statusEl.textContent = r.error;
        return;
    }
    if (r.at) {
        statusEl.textContent = 'Последняя отметка выката: ' + new Date(r.at).toLocaleString('ru-RU');
    } else {
        statusEl.textContent = 'Отметок выката пока не было.';
    }
}

async function touchSettingsDeployMark() {
    const statusEl = document.getElementById('settingsDeployMarkStatus');
    if (!window.creatorAdminPanel) return;
    if (statusEl) statusEl.textContent = 'Сохранение…';
    const r = await window.creatorAdminPanel.touchDeployStatusMark();
    if (!r.success) {
        if (statusEl) statusEl.textContent = r.message || 'Ошибка';
        showErrorSafe(r.message || 'Не удалось отметить выкат');
        return;
    }
    if (typeof showSuccess === 'function') showSuccess('Выкат отмечен');
    await loadSettingsDeployMark();
    await loadCreatorAuditLogsPanel();
}

async function loadSettingsMinkoQuick() {
    const statusEl = document.getElementById('settingsMinkoSaveStatus');
    const en = document.getElementById('settingsMinkoEnabled');
    const offExceptCreator = document.getElementById('settingsMinkoOfflineExceptCreator');
    const msg = document.getElementById('settingsMinkoMessage');
    if (!window.creatorAdminPanel) return;
    if (statusEl) statusEl.textContent = '';

    const bundle = await window.creatorAdminPanel.getMinkoAiServerBundle();
    if (!bundle.ok) {
        if (statusEl) statusEl.textContent = bundle.message || 'Ошибка загрузки';
        return;
    }
    if (en) en.checked = !!bundle.public.chat_enabled;
    if (offExceptCreator) offExceptCreator.checked = !!bundle.public.offline_except_creator;
    if (msg) msg.value = bundle.public.maintenance_message || '';

    const tabEn = document.getElementById('minkoSrvEnabled');
    const tabOff = document.getElementById('minkoSrvOfflineExceptCreator');
    const tabMsg = document.getElementById('minkoSrvMessage');
    if (tabEn) tabEn.checked = !!bundle.public.chat_enabled;
    if (tabOff) tabOff.checked = !!bundle.public.offline_except_creator;
    if (tabMsg) tabMsg.value = bundle.public.maintenance_message || '';
}

async function saveSettingsMinkoQuick() {
    const statusEl = document.getElementById('settingsMinkoSaveStatus');
    const en = document.getElementById('settingsMinkoEnabled');
    const offExceptCreator = document.getElementById('settingsMinkoOfflineExceptCreator');
    const msg = document.getElementById('settingsMinkoMessage');
    if (!window.creatorAdminPanel) return;

    const r = await window.creatorAdminPanel.saveMinkoAiServerSettings(
        !!en?.checked,
        msg?.value || '',
        !!offExceptCreator?.checked
    );
    if (statusEl) statusEl.textContent = r.success ? '✓ ' + r.message : '✗ ' + (r.message || 'Ошибка');
    if (r.success && typeof showSuccess === 'function') showSuccess(r.message);
    if (!r.success) showErrorSafe(r.message || 'Ошибка');
    if (r.success) {
        await loadSettingsMinkoQuick();
        await loadCreatorAuditLogsPanel();
    }
}

async function loadSettingsNetlifyHook() {
    const input = document.getElementById('settingsNetlifyHookInput');
    const statusEl = document.getElementById('settingsNetlifyStatus');
    if (!window.creatorAdminPanel) return;
    if (statusEl) statusEl.textContent = '';

    const bundle = await window.creatorAdminPanel.getMinkoAiServerBundle();
    if (!bundle.ok) {
        if (statusEl) statusEl.textContent = bundle.message || 'Ошибка загрузки hook';
        return;
    }
    if (input) input.value = bundle.secrets?.netlify_build_hook_url || '';
}

async function saveSettingsNetlifyHook() {
    const input = document.getElementById('settingsNetlifyHookInput');
    const statusEl = document.getElementById('settingsNetlifyStatus');
    if (!window.creatorAdminPanel) return;
    if (statusEl) statusEl.textContent = 'Сохранение…';

    const r = await window.creatorAdminPanel.saveMinkoNetlifyBuildHook(input?.value || '');
    if (statusEl) statusEl.textContent = r.success ? '✓ ' + r.message : '✗ ' + (r.message || 'Ошибка');
    if (r.success && typeof showSuccess === 'function') showSuccess(r.message);
    if (!r.success) showErrorSafe(r.message || 'Ошибка');
}

async function triggerSettingsNetlifyDeploy() {
    const statusEl = document.getElementById('settingsNetlifyStatus');
    if (!window.creatorAdminPanel) return;
    if (statusEl) statusEl.textContent = 'Отправка запроса на деплой…';

    const r = await window.creatorAdminPanel.triggerMinkoNetlifyDeploy();
    if (statusEl) statusEl.textContent = r.success ? '✓ ' + r.message : '✗ ' + (r.message || 'Ошибка');
    if (r.success && typeof showSuccess === 'function') showSuccess(r.message);
    if (!r.success) showErrorSafe(r.message || 'Ошибка');
}

async function loadSettingsChatAutomodShortcut() {
    const toggle = document.getElementById('settingsChatAutomodEnabled');
    const statusEl = document.getElementById('settingsChatAutomodStatus');
    if (!toggle || !window.creatorAdminPanel) return;
    if (statusEl) statusEl.textContent = '';

    const cfg = await window.creatorAdminPanel.getChatAutomodConfig();
    if (!cfg.ok) {
        if (statusEl) statusEl.textContent = cfg.message || 'Ошибка загрузки';
        return;
    }
    toggle.checked = !!cfg.enabled;
}

async function saveSettingsChatAutomodShortcut() {
    const toggle = document.getElementById('settingsChatAutomodEnabled');
    const statusEl = document.getElementById('settingsChatAutomodStatus');
    if (!toggle || !window.creatorAdminPanel) return;
    if (statusEl) statusEl.textContent = 'Сохранение…';

    const cfg = await window.creatorAdminPanel.getChatAutomodConfig();
    if (!cfg.ok) {
        if (statusEl) statusEl.textContent = cfg.message || 'Ошибка';
        showErrorSafe(cfg.message || 'Ошибка');
        return;
    }

    const rules = (cfg.rules || []).map((r) => ({
        id: r.id,
        is_active: !!r.is_active,
        strike_weight: r.strike_weight,
        mute_minutes: r.mute_minutes,
    }));

    const res = await window.creatorAdminPanel.saveChatAutomodConfig({
        enabled: !!toggle.checked,
        rules,
    });
    if (statusEl) statusEl.textContent = res.success ? '✓ ' + res.message : '✗ ' + (res.message || 'Ошибка');
    if (res.success && typeof showSuccess === 'function') showSuccess(res.message);
    if (!res.success) showErrorSafe(res.message || 'Ошибка');
    if (res.success) {
        const modToggle = document.getElementById('chatAutomodEnabledToggle');
        if (modToggle) modToggle.checked = !!toggle.checked;
        await loadCreatorAuditLogsPanel();
    }
}

async function showUserActivity(userId) {
    const activity = await window.creatorAdminPanel.getUserActivity(userId, 7);
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">📊 Активность пользователя</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                ${
                    activity
                        ? `<p><strong>За последние 7 дней:</strong></p>
                           <ul><li>Сообщений в общем чате: ${activity.chat_messages}</li></ul>`
                        : '<p>Ошибка загрузки статистики</p>'
                }
            </div>
            <div class="modal-footer">
                <button class="admin-btn" onclick="this.closest('.modal').remove()">Закрыть</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function showEditSubscriptions(userId) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:520px;">
            <div class="modal-header">
                <h2 class="modal-title">VIP «Смотреть вместе»</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <p style="font-size:0.86rem;color:var(--text-secondary);line-height:1.5;margin:0 0 1.25rem;">
                    Здесь выдаётся только VIP для совместного просмотра.
                </p>
                <label style="font-size:0.88rem;">Срок после выдачи (дней):</label>
                <input type="number" class="setting-input" id="editVIPDays" placeholder="30" min="1" value="30" style="margin-top:0.35rem;">
                <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;">
                    <button type="button" class="admin-btn" onclick="grantVIPForUser('${userId}')" style="flex:1;min-width:130px;">Выдать VIP</button>
                    <button type="button" class="admin-btn admin-btn-danger" onclick="revokeVIPForUser('${userId}')" style="flex:1;min-width:130px;">Снять VIP</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function showAiSubscriptionEditor(userId) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:520px;">
            <div class="modal-header">
                <h2 class="modal-title">Тариф Minko AI</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="setting-item">
                    <label>Тариф:</label>
                    <select class="setting-select" id="editAiType">
                        <option value="free">Free</option>
                        <option value="sleepy">Sleepy</option>
                        <option value="premium">Premium</option>
                    </select>
                </div>
                <div class="setting-item">
                    <label>Срок в днях (для платных):</label>
                    <input type="number" class="setting-input" id="editAiDays" min="1" value="30" />
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="admin-btn" onclick="saveAiSubscriptionForUser('${userId}')">Сохранить</button>
                <button type="button" class="admin-btn admin-btn-secondary" onclick="this.closest('.modal').remove()">Отмена</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function saveAiSubscriptionForUser(userId) {
    const type = document.getElementById('editAiType')?.value || 'free';
    const daysRaw = document.getElementById('editAiDays')?.value || '';
    const days = daysRaw ? parseInt(daysRaw, 10) : null;
    const result = await window.creatorAdminPanel.manageAISubscription(userId, type, type === 'free' ? null : days);
    if (result.success) {
        if (typeof showSuccess === 'function') showSuccess(result.message);
        document.querySelector('.modal.active')?.remove();
    } else {
        showErrorSafe(result.message || 'Ошибка сохранения тарифа AI');
    }
}

async function grantVIPForUser(userId) {
    const days = parseInt(document.getElementById('editVIPDays')?.value || '30', 10);
    if (!days || days < 1) return showErrorSafe('Укажите число дней (от 1)');
    const result = await window.creatorAdminPanel.manageVIPSubscription(userId, 'grant', days);
    if (result.success) {
        if (typeof showSuccess === 'function') showSuccess(result.message);
        document.querySelector('.modal.active')?.remove();
        void loadUsersAdvanced(currentUsersPage);
    } else {
        showErrorSafe(result.message || 'Ошибка');
    }
}

async function revokeVIPForUser(userId) {
    const result = await window.creatorAdminPanel.manageVIPSubscription(userId, 'revoke');
    if (result.success) {
        if (typeof showSuccess === 'function') showSuccess(result.message);
        document.querySelector('.modal.active')?.remove();
        void loadUsersAdvanced(currentUsersPage);
    } else {
        showErrorSafe(result.message || 'Ошибка');
    }
}

async function sendNotificationToUser(userId) {
    showSendNotificationModal('single');
    setTimeout(() => {
        const input = document.getElementById('notifUserId');
        if (input) input.value = userId;
    }, 80);
}

function _minkoLogsFormatTime(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '';
    }
}

function _minkoLogsInitial(name) {
    const s = String(name || '?').trim();
    return (s[0] || '?').toUpperCase();
}

async function openMinkoAiLogsModal() {
    document.getElementById('minkoAiLogsModal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal active minko-logs-modal';
    modal.id = 'minkoAiLogsModal';
    modal.innerHTML = `
        <div class="modal-content minko-logs-shell">
            <div class="modal-header minko-logs-header">
                <div>
                    <h2 class="modal-title">Чаты с Minko AI</h2>
                    <p class="minko-logs-sub">Диалоги пользователей · удобный просмотр</p>
                </div>
                <button type="button" class="modal-close" id="minkoAiLogsClose" aria-label="Закрыть">×</button>
            </div>
            <div class="modal-body minko-logs-body">
                <aside class="minko-logs-sidebar">
                    <input type="search" class="minko-logs-search" id="minkoAiLogsSearch" placeholder="Поиск по нику…" autocomplete="off">
                    <div id="minkoAiLogsUserList" class="minko-logs-user-list">
                        <p class="admin-inline-hint">Загрузка…</p>
                    </div>
                </aside>
                <section class="minko-logs-chat" id="minkoAiLogsTranscript">
                    <div class="minko-logs-empty">
                        <div class="minko-logs-empty-ico">🌸</div>
                        <p>Выберите пользователя слева</p>
                    </div>
                </section>
            </div>
        </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('#minkoAiLogsClose')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    const { users, error } = await window.creatorAdminPanel.listMinkoAiChatUsers();
    const listEl = modal.querySelector('#minkoAiLogsUserList');
    const transEl = modal.querySelector('#minkoAiLogsTranscript');
    const searchEl = modal.querySelector('#minkoAiLogsSearch');
    if (error) {
        listEl.innerHTML = `<p class="admin-inline-hint" style="color:#f87171;">${adminPanelEscapeHtml(error)}</p>`;
        return;
    }
    if (!users.length) {
        listEl.innerHTML = '<p class="admin-inline-hint">Пока нет логов для отображения.</p>';
        return;
    }

    let activeUserId = '';
    const renderUserList = (filter = '') => {
        const q = String(filter || '').trim().toLowerCase();
        const filtered = !q
            ? users
            : users.filter(
                  (u) =>
                      String(u.username || '').toLowerCase().includes(q) ||
                      String(u.user_id || '').toLowerCase().includes(q)
              );
        if (!filtered.length) {
            listEl.innerHTML = '<p class="admin-inline-hint">Никого не найдено</p>';
            return;
        }
        listEl.innerHTML = filtered
            .map((u) => {
                const active = u.user_id === activeUserId ? ' is-active' : '';
                return `<button type="button" class="minko-logs-user${active}" data-minko-log-user="${adminPanelEscapeHtml(
                    u.user_id
                )}">
                    <span class="minko-logs-user-avatar">${adminPanelEscapeHtml(_minkoLogsInitial(u.username))}</span>
                    <span class="minko-logs-user-meta">
                        <span class="minko-logs-user-name">${adminPanelEscapeHtml(u.username)}</span>
                        <span class="minko-logs-user-time">${adminPanelEscapeHtml(_minkoLogsFormatTime(u.last_at))}</span>
                    </span>
                </button>`;
            })
            .join('');

        listEl.querySelectorAll('[data-minko-log-user]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const uid = btn.getAttribute('data-minko-log-user');
                activeUserId = uid;
                renderUserList(searchEl?.value || '');
                const user = users.find((x) => x.user_id === uid);
                transEl.innerHTML = `
                    <header class="minko-logs-chat-head">
                        <span class="minko-logs-chat-title">${adminPanelEscapeHtml(user?.username || 'Пользователь')}</span>
                        <span class="minko-logs-chat-id">${adminPanelEscapeHtml((uid || '').slice(0, 13))}…</span>
                    </header>
                    <div class="minko-logs-thread"><p class="admin-inline-hint">Загрузка…</p></div>`;
                const thread = transEl.querySelector('.minko-logs-thread');
                const { rows, error: e2 } = await window.creatorAdminPanel.getMinkoAiChatLogsForUser(uid);
                if (e2) {
                    thread.innerHTML = `<p style="color:#f87171">${adminPanelEscapeHtml(e2)}</p>`;
                    return;
                }
                if (!rows.length) {
                    thread.innerHTML = '<p class="admin-inline-hint">Пусто</p>';
                    return;
                }
                thread.innerHTML = rows
                    .map((row) => {
                        const isUser = row.role === 'user';
                        const who = isUser ? 'Пользователь' : 'Minko';
                        const t = _minkoLogsFormatTime(row.created_at);
                        return `<article class="minko-logs-msg ${isUser ? 'is-user' : 'is-minko'}">
                            <div class="minko-logs-msg-meta">
                                <span class="minko-logs-msg-who">${who}</span>
                                <time>${adminPanelEscapeHtml(t)}</time>
                            </div>
                            <div class="minko-logs-bubble">${adminPanelEscapeHtml(row.content || '')}</div>
                        </article>`;
                    })
                    .join('');
                thread.scrollTop = thread.scrollHeight;
            });
        });
    };

    renderUserList();
    searchEl?.addEventListener('input', () => renderUserList(searchEl.value));
}

const TEAM_ROLE_LABELS = {
    moderator: 'Модератор',
    admin: 'Админ',
    sponsor: 'Спонсор',
    promoter: 'Пиарщик',
    support: 'Поддержка'
};

function initTeamSection() {
    if (window.__reminkoTeamAdminBound) return;
    window.__reminkoTeamAdminBound = true;
    document.getElementById('teamAssignBtn')?.addEventListener('click', () => void assignTeamRoleFromForm());
    document.getElementById('teamRefreshBtn')?.addEventListener('click', () => void loadTeamPanel());
}

async function loadTeamPanel() {
    const list = document.getElementById('teamMembersList');
    const status = document.getElementById('teamPanelStatus');
    if (!list || !supabaseClient) return;
    list.innerHTML = '<div class="users-card-empty">Загрузка…</div>';
    try {
        const { data: rows, error } = await supabaseClient
            .from('site_team_roles')
            .select('user_id, role, note, created_at, updated_at')
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!rows || !rows.length) {
            list.innerHTML = '<div class="users-card-empty">Команда пока пуста — выдайте первую роль выше.</div>';
            if (status) status.textContent = '';
            return;
        }
        const ids = rows.map((r) => r.user_id);
        const profiles =
            typeof reminkoFetchProfilesIn === 'function'
                ? await reminkoFetchProfilesIn(supabaseClient, ids)
                : [];
        const profileMap = {};
        for (const p of profiles || []) profileMap[p.id] = p;

        list.innerHTML = rows
            .map((row) => {
                const p = profileMap[row.user_id] || {};
                const roleLabel = TEAM_ROLE_LABELS[row.role] || row.role;
                const uid = adminPanelEscapeHtml(String(row.user_id));
                return `<div class="users-card">
                    <div class="users-card-head">
                        <h4 class="users-card-name">${adminPanelEscapeHtml(p.username || 'Без имени')}</h4>
                        <span class="admin-badge">${adminPanelEscapeHtml(roleLabel)}</span>
                    </div>
                    <p class="users-card-meta"><code>${uid}</code></p>
                    ${row.note ? `<p class="users-card-meta">${adminPanelEscapeHtml(row.note)}</p>` : ''}
                    <div class="users-card-actions">
                        <button type="button" class="admin-btn admin-btn-danger admin-btn-small" data-team-remove="${uid}">Снять роль</button>
                    </div>
                </div>`;
            })
            .join('');

        list.querySelectorAll('[data-team-remove]').forEach((btn) => {
            btn.addEventListener('click', () => void removeTeamRole(btn.getAttribute('data-team-remove')));
        });
        if (status) status.textContent = `В команде: ${rows.length}`;
    } catch (e) {
        list.innerHTML = `<div class="users-card-empty">Ошибка: ${adminPanelEscapeHtml(e.message || 'загрузка')}</div>`;
    }
}

async function assignTeamRoleFromForm() {
    const userId = String(document.getElementById('teamAssignUserId')?.value || '').trim();
    const role = String(document.getElementById('teamAssignRole')?.value || '').trim();
    const note = String(document.getElementById('teamAssignNote')?.value || '').trim();
    const status = document.getElementById('teamPanelStatus');
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        showErrorSafe('Укажите корректный UUID пользователя');
        return;
    }
    if (!TEAM_ROLE_LABELS[role]) {
        showErrorSafe('Выберите роль');
        return;
    }
    try {
        const actorId = window.creatorAdminPanel?.currentUser?.id || null;
        const { error } = await supabaseClient.from('site_team_roles').upsert(
            {
                user_id: userId,
                role,
                note: note || null,
                assigned_by: actorId,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'user_id' }
        );
        if (error) throw error;
        if (role === 'admin' || role === 'moderator') {
            await supabaseClient.from('admins').upsert(
                { user_id: userId, role: role === 'moderator' ? 'moderator' : 'admin' },
                { onConflict: 'user_id' }
            );
        }
        if (typeof showSuccess === 'function') showSuccess('Роль сохранена');
        if (status) status.textContent = 'Роль обновлена';
        void loadTeamPanel();
    } catch (e) {
        showErrorSafe(e.message || 'Не удалось выдать роль');
    }
}

async function removeTeamRole(userId) {
    if (!userId || !supabaseClient) return;
    if (!window.confirm('Снять роль с этого участника команды?')) return;
    try {
        const { error } = await supabaseClient.from('site_team_roles').delete().eq('user_id', userId);
        if (error) throw error;
        await supabaseClient.from('admins').delete().eq('user_id', userId);
        if (typeof showSuccess === 'function') showSuccess('Роль снята');
        void loadTeamPanel();
    } catch (e) {
        showErrorSafe(e.message || 'Не удалось снять роль');
    }
}

async function showEditUserUsername(userId) {
    const modalData = await openCreatorActionModal({
        title: 'Изменить имя пользователя',
        submitLabel: 'Сохранить',
        fields: [
            {
                id: 'username',
                label: 'Новое имя (3–40 символов)',
                placeholder: 'Например, Subarik или Модератор_Аня'
            }
        ]
    });
    if (!modalData) return;
    const username = String(modalData.username || '').trim();
    if (username.length < 3) {
        showErrorSafe('Имя должно быть не короче 3 символов');
        return;
    }
    if (typeof reminkoValidatePublicUsername === 'function') {
        const check = reminkoValidatePublicUsername(username, { allowStaff: true });
        if (!check.ok) {
            showErrorSafe(check.message || 'Недопустимое имя');
            return;
        }
    }
    try {
        const { error } = await supabaseClient.from('profiles').update({ username }).eq('id', userId);
        if (error) throw error;
        if (typeof showSuccess === 'function') showSuccess('Имя обновлено');
        document.querySelector('.modal.active')?.remove();
        void loadUsersAdvanced(currentUsersPage);
    } catch (e) {
        showErrorSafe(e.message || 'Ошибка сохранения имени');
    }
}
window.showEditUserUsername = showEditUserUsername;

document.addEventListener('DOMContentLoaded', async () => {
    if (!supabaseClient) {
        showErrorSafe('Supabase не инициализирован');
        hideAdminPageLoading();
        return;
    }

    const {
        data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
        hideAdminPageLoading();
        window.location.href = 'index.html';
        return;
    }

    const isCreator = await window.creatorAdminPanel.checkCreatorStatus(user.id);
    if (!isCreator) {
        showErrorSafe('Доступ запрещен. Только для Создателя.');
        hideAdminPageLoading();
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1800);
        return;
    }

    window.creatorAdminPanel.currentUser = user;
    initTabs();
    bindDashboardControls();
    initUsersSection();
    initTeamSection();
    initModerationSection();
    initNotificationsSection();
    initMaintenanceSettingsSection();
    initCreatorSettingsSection();
    initMinkoAiServerPanel();
    initGiveawaySection();
    initAnime4kSection();
    initTestsSection();

    await loadDashboard();
    hideAdminPageLoading();
});

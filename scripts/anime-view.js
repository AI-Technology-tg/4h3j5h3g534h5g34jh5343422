// Страница просмотра аниме

/** Куда вести «Назад»: история браузера → previousUrl → каталог (не профиль по умолчанию). */
function resolveAnimeBackHref() {
    try {
        const stored = sessionStorage.getItem('previousUrl');
        if (stored && String(stored).trim()) {
            const s = String(stored).trim();
            // Не уводим «назад» на саму страницу аниме
            const url = new URL(s, window.location.href);
            if (
                url.origin === window.location.origin &&
                !/anime\/view(?:-4k)?\.html/i.test(url.pathname)
            ) {
                return `${url.pathname}${url.search}${url.hash}`;
            }
        }
    } catch (_) {
        /* ignore */
    }
    return '../catalog/anime.html';
}

function bindAnimeBackButtons(root) {
    const scope = root || document;
    scope.querySelectorAll('a.back-button').forEach((btn) => {
        if (btn.dataset.backBound === '1') return;
        btn.dataset.backBound = '1';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                const ref = document.referrer ? new URL(document.referrer) : null;
                if (ref && ref.origin === location.origin && window.history.length > 1) {
                    // Не прыгаем «назад» на ту же anime/view
                    if (!/anime\/view(?:-4k)?\.html/i.test(ref.pathname)) {
                        history.back();
                        return;
                    }
                }
            } catch (_) {
                /* ignore */
            }
            location.href = resolveAnimeBackHref();
        });
    });
}

function applyAnimeViewSeo(anime, extra) {
    if (typeof reminkoUpdatePageSeo !== 'function' || !anime) return;
    const title = extra?.title || anime.title || 'Аниме';
    const id = extra?.id != null ? extra.id : anime.id;
    const desc =
        extra?.description ||
        anime.description ||
        `Смотреть «${title}» онлайн на Re-Minko — каталог аниме, плеер Kodik и «Смотреть вместе».`;
    const poster = extra?.poster || anime.posterUrl || anime.poster || null;
    reminkoUpdatePageSeo({
        title: `${title} — смотреть онлайн | Re-Minko`,
        description: String(desc).replace(/\s+/g, ' ').trim().slice(0, 300),
        path: `/anime/view.html?id=${encodeURIComponent(String(id))}`,
        image: poster || undefined,
        ogType: 'video.tv_show',
        jsonLd: {
            '@context': 'https://schema.org',
            '@type': anime.type === 'Фильм' ? 'Movie' : 'TVSeries',
            name: title,
            url: `https://re-minko-anime.com/anime/view.html?id=${id}`,
            ...(poster ? { image: poster } : {}),
            ...(anime.year ? { datePublished: String(anime.year) } : {})
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const loadingTimeout = setTimeout(() => {
        if (typeof hideLoading === 'function') hideLoading();
    }, 12000);

    const raceMs = (promise, ms) =>
        Promise.race([
            promise,
            new Promise((resolve) => setTimeout(() => resolve(null), ms))
        ]).catch(() => null);

    if (typeof window.KodikCatalogStore?.load === 'function') {
        await raceMs(window.KodikCatalogStore.load(), 6000);
    }
    if (typeof reminkoLoadCalendarData === 'function') {
        await raceMs(reminkoLoadCalendarData(), 4000);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const malId = urlParams.get('mal_id');
    const idFromUrl = urlParams.get('id');

    // ID из URL (?id=) — приоритет (поиск в шапке, прямые ссылки). Иначе sessionStorage.
    let animeId = null;
    if (idFromUrl != null && idFromUrl !== '' && String(idFromUrl).trim() !== '') {
        const parsed = parseInt(idFromUrl, 10);
        if (!Number.isNaN(parsed)) {
            animeId = String(parsed);
            sessionStorage.setItem('viewAnimeId', animeId);
        }
    }
    // ?mal_id= без ?id= — явная ссылка (календарь и т.п.), не подставлять старый viewAnimeId
    if (!animeId && !malId) {
        animeId = sessionStorage.getItem('viewAnimeId');
    }

    if (animeId && typeof window.Anime4kCatalogStore?.isAnime4kId === 'function') {
        const idNum4k = parseInt(animeId, 10);
        if (window.Anime4kCatalogStore.isAnime4kId(idNum4k)) {
            window.location.replace(`../anime/view-4k.html?id=${encodeURIComponent(String(idNum4k))}`);
            return;
        }
    }

    // Виртуальная карточка (id = 10_000_000 + mal_id): анонсы и Jikan с главной
    if (animeId) {
        const idNum = parseInt(animeId, 10);
        if (!Number.isNaN(idNum) && idNum >= 10000000 && idNum < 20000000) {
            const malFromVirtual =
                malId != null && String(malId).trim() !== ''
                    ? parseInt(malId, 10)
                    : idNum - 10000000;
            // Если в каталоге уже есть плеер/серии — уходим с «фейкового анонса» на реальный id
            if (Number.isFinite(malFromVirtual) && malFromVirtual > 0) {
                const catalogHit =
                    typeof getAllAnime === 'function'
                        ? (getAllAnime() || []).find(
                              (a) => a && parseInt(a.mal_id, 10) === malFromVirtual
                          )
                        : null;
                if (catalogHit && catalogHit.id != null) {
                    const last = parseInt(catalogHit._kodik && catalogHit._kodik.lastEpisode, 10);
                    const hasLink = !!(catalogHit._kodik && catalogHit._kodik.link);
                    const st = String(catalogHit.status || '');
                    if (
                        (Number.isFinite(last) && last >= 1) ||
                        hasLink ||
                        st === 'Онгоинг' ||
                        st === 'Завершён' ||
                        st === 'Вышел'
                    ) {
                        try {
                            sessionStorage.removeItem('jikanAnimeData');
                            sessionStorage.setItem('viewAnimeId', String(catalogHit.id));
                        } catch (_) {
                            /* ignore */
                        }
                        window.location.replace(
                            `../anime/view.html?id=${encodeURIComponent(String(catalogHit.id))}`
                        );
                        return;
                    }
                }
            }
            const resolved = await resolveVirtualJikanView(animeId, malId);
            if (resolved && resolved.jikan) {
                clearTimeout(loadingTimeout);
                await renderJikanAnimeDetail(resolved.jikan, resolved.mergedCard);
                if (typeof hideLoading === 'function') hideLoading();
                if (window.__jikanVirtualPlayerAnime) {
                    initCatalogAnimeInlineKodik(window.__jikanVirtualPlayerAnime);
                }
                return;
            }
        }
    }

    // Попытка загрузить Jikan аниме (из главной — Новинки/Скоро выходит/В эфире)
    if (!animeId && malId) {
        try {
            const malNorm =
                typeof reminkoNormalizeMalId === 'function' ? reminkoNormalizeMalId(malId) : parseInt(malId, 10);
            let jikanData = null;
            if (Number.isFinite(malNorm) && malNorm > 0) {
                jikanData = await fetchJikanAnimeByMalId(malNorm);
                if (!jikanData) {
                    const calRow =
                        typeof reminkoShikimoriCalendarRowForMal === 'function'
                            ? reminkoShikimoriCalendarRowForMal(malNorm)
                            : null;
                    jikanData = buildMinimalJikanStubFromMal(malNorm, calRow);
                }
            }
            if (jikanData) {
                clearTimeout(loadingTimeout);
                await renderJikanAnimeDetail(jikanData);
                if (typeof hideLoading === 'function') hideLoading();
                if (window.__jikanVirtualPlayerAnime) {
                    initCatalogAnimeInlineKodik(window.__jikanVirtualPlayerAnime);
                }
                return;
            }
        } catch (e) {
            console.warn('[view] Jikan fetch error:', e);
        }
    }

    if (!animeId) {
        clearTimeout(loadingTimeout);
        document.getElementById('animeContent').innerHTML = `
            <div class="page-placeholder">
                <h1>Аниме не найдено</h1>
                <p>Не удалось загрузить информацию об аниме.</p>
                <a href="../index.html" class="btn btn-primary">Вернуться на главную</a>
            </div>
        `;
        setTimeout(() => {
            if (typeof hideLoading === 'function') hideLoading();
        }, 100);
        return;
    }
    
    const idNumFallback = parseInt(animeId, 10);
    if (!Number.isNaN(idNumFallback) && idNumFallback >= 10000000 && idNumFallback < 20000000) {
        const resolved = await resolveVirtualJikanView(animeId, malId);
        if (resolved && resolved.jikan) {
            clearTimeout(loadingTimeout);
            await renderJikanAnimeDetail(resolved.jikan, resolved.mergedCard);
            if (typeof hideLoading === 'function') hideLoading();
            if (window.__jikanVirtualPlayerAnime) {
                initCatalogAnimeInlineKodik(window.__jikanVirtualPlayerAnime);
            }
            return;
        }
    }

    const anime = getAnimeById(animeId);
    if (!anime) {
        clearTimeout(loadingTimeout);
        const devDetail =
            typeof reminkoIsSiteCreatorView === 'function' && reminkoIsSiteCreatorView()
                ? `<p class="reminko-dev-only-host">${typeof reminkoWrapDevOnlyHtml === 'function' ? reminkoWrapDevOnlyHtml(`Аниме с ID ${escapeHtmlText(animeId)} не существует в базе Kodik.`, 'Только для создателя') : `Аниме с ID ${escapeHtmlText(animeId)} не существует в базе.`}</p>`
                : '<p>Такого аниме пока нет в каталоге. Попробуйте поиск или вернитесь на главную.</p>';
        document.getElementById('animeContent').innerHTML = `
            <div class="page-placeholder">
                <h1>Аниме не найдено</h1>
                ${devDetail}
                <a href="../index.html" class="btn btn-primary">Вернуться на главную</a>
            </div>
        `;
        setTimeout(() => {
            if (typeof hideLoading === 'function') hideLoading();
        }, 100);
        return;
    }

    if (isAnnouncedCatalogAnime(anime)) {
        const mal =
            anime.mal_id != null
                ? parseInt(anime.mal_id, 10)
                : parseInt(animeId, 10) >= 20000000
                  ? parseInt(animeId, 10) - 20000000
                  : parseInt(animeId, 10) >= 10000000
                    ? parseInt(animeId, 10) - 10000000
                    : NaN;
        // Есть плеер Kodik — сразу обычная страница, не режим «только анонс»
        if (anime._kodik && anime._kodik.link) {
            try {
                sessionStorage.removeItem('jikanAnimeData');
            } catch (_) {
                /* ignore */
            }
        } else if (Number.isFinite(mal) && mal > 0) {
            const jikanData = await fetchJikanAnimeByMalId(mal, { ignoreStaleAnnounced: true });
            const jStatus = jikanData && String(jikanData.status || '');
            // Jikan/Shiki говорят, что уже выходит или вышло — показываем каталог + плеер
            if (jikanData && jStatus && jStatus !== 'Not yet aired') {
                try {
                    sessionStorage.removeItem('jikanAnimeData');
                } catch (_) {
                    /* ignore */
                }
                anime.status =
                    jStatus === 'Currently Airing'
                        ? 'Онгоинг'
                        : jStatus === 'Finished Airing'
                          ? 'Завершён'
                          : anime.status;
            } else if (jikanData && jStatus === 'Not yet aired') {
                clearTimeout(loadingTimeout);
                await renderJikanAnimeDetail(jikanData);
                if (typeof hideLoading === 'function') hideLoading();
                if (window.__jikanVirtualPlayerAnime) {
                    initCatalogAnimeInlineKodik(window.__jikanVirtualPlayerAnime);
                }
                return;
            }
        }
    }
    
    try {
        await renderAnimeDetail(anime);

        clearTimeout(loadingTimeout);
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
        /* Плеер Kodik: только после снятия оверлея. Пока .main-layout скрыт (reminko-content-revealed), часть
         * браузеров не грузит iframe — получался чёрный экран до F5. */
        initCatalogAnimeInlineKodik(anime);
    } catch (error) {
        console.error('Ошибка рендеринга аниме:', error);
        const container = document.getElementById('animeContent');
        if (container) {
            container.innerHTML = `
                <div class="page-placeholder">
                    <h1>Ошибка загрузки</h1>
                    <p>Не удалось отобразить страницу аниме. Попробуйте обновить страницу.</p>
                    <a href="../index.html" class="btn btn-primary">Вернуться на главную</a>
                </div>
            `;
        }
        clearTimeout(loadingTimeout);
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
    }
});

function escapeHtmlText(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function reminkoReadSessionJikanData(mal, opts) {
    try {
        const stored = sessionStorage.getItem('jikanAnimeData');
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        if (!parsed || String(parsed.mal_id) !== String(mal)) return null;
        // F5 НЕ чистит sessionStorage: заглушка Not yet aired с главной/анонса
        // переживает обновление и прячет плеер, пока не зайдёшь в другой сезон.
        if (opts && opts.ignoreStaleAnnounced && parsed.status === 'Not yet aired') {
            return null;
        }
        return parsed;
    } catch (_) {
        /* ignore */
    }
    return null;
}

async function resolveVirtualJikanView(animeId, malIdParam) {
    const idNum = parseInt(animeId, 10);
    if (Number.isNaN(idNum) || idNum < 10000000 || idNum >= 20000000) return null;
    const malFromId = idNum - 10000000;
    let mal =
        malIdParam != null && String(malIdParam).trim() !== ''
            ? parseInt(malIdParam, 10)
            : malFromId;
    if (!Number.isFinite(mal) || mal <= 0) mal = malFromId;
    if (!Number.isFinite(mal) || mal <= 0) return null;

    let virtualAnime = typeof getAnimeById === 'function' ? getAnimeById(animeId) : null;
    if (virtualAnime && virtualAnime.isJikanVirtual && virtualAnime._jikanRaw) {
        return { jikan: virtualAnime._jikanRaw, mergedCard: virtualAnime };
    }

    const sessionJikan = reminkoReadSessionJikanData(mal, { ignoreStaleAnnounced: true });
    if (sessionJikan) {
        if (typeof registerJikanHomeList === 'function') registerJikanHomeList([sessionJikan]);
        virtualAnime = getAnimeById(animeId);
        return {
            jikan: sessionJikan,
            mergedCard: virtualAnime && virtualAnime.isJikanVirtual ? virtualAnime : null
        };
    }

    const jikanData = await fetchJikanAnimeByMalId(mal, { ignoreStaleAnnounced: true });
    if (jikanData) {
        if (typeof registerJikanHomeList === 'function') registerJikanHomeList([jikanData]);
        virtualAnime = getAnimeById(animeId);
        return {
            jikan: jikanData,
            mergedCard: virtualAnime && virtualAnime.isJikanVirtual ? virtualAnime : null
        };
    }

    if (typeof getJikanAnnouncedCachedSync === 'function') {
        const fromAnnounced = getJikanAnnouncedCachedSync().find(
            (a) => a && parseInt(a.mal_id, 10) === mal
        );
        if (fromAnnounced) {
            if (typeof registerJikanHomeList === 'function') registerJikanHomeList([fromAnnounced]);
            virtualAnime = getAnimeById(animeId);
            return {
                jikan: fromAnnounced,
                mergedCard: virtualAnime && virtualAnime.isJikanVirtual ? virtualAnime : null
            };
        }
    }

    const calRow =
        typeof reminkoShikimoriCalendarRowForMal === 'function'
            ? reminkoShikimoriCalendarRowForMal(mal)
            : null;
    const stub = buildMinimalJikanStubFromMal(mal, calRow);
    if (stub) {
        if (typeof registerJikanHomeList === 'function') registerJikanHomeList([stub]);
        virtualAnime = getAnimeById(animeId);
        return {
            jikan: stub,
            mergedCard: virtualAnime && virtualAnime.isJikanVirtual ? virtualAnime : null
        };
    }

    return null;
}

function buildMinimalJikanStubFromMal(mal, calRow) {
    const malNum = parseInt(mal, 10);
    if (!Number.isFinite(malNum) || malNum <= 0) return null;
    let catalogTitle = '';
    if (typeof window.KodikCatalogStore?.getAll === 'function') {
        const hit = window.KodikCatalogStore.getAll().find(
            (a) => a && parseInt(a.mal_id, 10) === malNum
        );
        if (hit?.title && String(hit.title).trim()) catalogTitle = String(hit.title).trim();
    }
    const title =
        (calRow && calRow.title_ru && String(calRow.title_ru).trim()) ||
        catalogTitle ||
        `Аниме #${malNum}`;
    const poster =
        (calRow && calRow.posterUrl && String(calRow.posterUrl).trim()) ||
        (typeof readMalPosterCache === 'function' ? readMalPosterCache(malNum) : '') ||
        '';
    const stub = {
        mal_id: malNum,
        title,
        title_english: title,
        status: 'Not yet aired',
        type: 'TV',
        synopsis: 'Описание появится позже.'
    };
    if (poster) {
        stub.images = { jpg: { image_url: poster, large_image_url: poster } };
    }
    return stub;
}

function resolveJikanDetailPosterUrl(data, shiki) {
    if (!data) return '';
    const fromJikan =
        typeof jikanPosterFromAnime === 'function' ? jikanPosterFromAnime(data) : '';
    if (fromJikan) return fromJikan;
    const cached =
        typeof readMalPosterCache === 'function' ? readMalPosterCache(data.mal_id) : '';
    if (cached) return cached;
    if (shiki?.image?.original && typeof shikimoriPosterUrlFromPath === 'function') {
        const shikiPoster = shikimoriPosterUrlFromPath(shiki.image.original);
        if (shikiPoster) return shikiPoster;
    }
    if (typeof pickKnownPosterUrl === 'function') {
        const known = pickKnownPosterUrl(data);
        if (known) return known;
    }
    return data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || '';
}

function hydrateJikanDetailPoster(data) {
    if (!data?.mal_id || typeof fetchPosterUrlForMal !== 'function') return;
    const el = document.querySelector('.anime-detail-poster');
    if (!el) return;
    const bg = el.style.backgroundImage || '';
    if (bg && !/linear-gradient/i.test(bg)) return;
    void fetchPosterUrlForMal(data.mal_id, data).then((url) => {
        const safeUrl = reminkoSafeImageUrl(url, '');
        if (!safeUrl || !el.isConnected) return;
        el.style.backgroundImage = `url('${reminkoSafeCssUrl(safeUrl)}')`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
    });
}

/** Jikan: embed_url, youtube_id или внешняя ссылка на ролик */
function resolveJikanTrailerRaw(data) {
    const t = data && data.trailer;
    if (!t) return '';
    if (t.embed_url && String(t.embed_url).trim()) return String(t.embed_url).trim();
    if (t.embed && String(t.embed).trim()) return String(t.embed).trim();
    if (t.youtube_id && String(t.youtube_id).trim()) {
        return 'https://www.youtube.com/watch?v=' + String(t.youtube_id).trim();
    }
    if (t.url && String(t.url).trim()) return String(t.url).trim();
    return '';
}

/** База названия для поиска других сезонов в каталоге */
function normalizeFranchiseBaseKey(name) {
    if (!name) return '';
    let s = String(name).toLowerCase().trim();
    s = s.split(/[:：(\u2013\u2014–—]/)[0].trim();
    s = s.replace(/\s*\(\s*\d{4}\s*\)\s*$/g, '');
    s = s.replace(/\s+\d+$/g, '');
    s = s.replace(/\s*сезон.*$/gi, ' ');
    s = s.replace(/\s*season.*$/gi, ' ');
    s = s.replace(/[."""''«»]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

function franchiseBuildRootBases(titleRu, titleEn, titleJp) {
    const bases = new Set();
    for (const raw of [titleRu, titleEn, titleJp]) {
        const base = normalizeFranchiseBaseKey(raw);
        if (base && base.length >= 4) bases.add(base);
        const wp = franchiseTitleWordPrefix(raw);
        if (wp && wp.length >= 10 && !franchiseBaseLooksTooGeneric(wp)) bases.add(wp);
    }
    return bases;
}

function franchiseBaseLooksTooGeneric(base) {
    const words = String(base || '')
        .split(/\s+/)
        .filter(Boolean);
    if (words.length < 2) return true;
    const generic = new Set([
        'клинок',
        'магия',
        'магическая',
        'битва',
        'история',
        'легенда',
        'герой',
        'герои',
        'королева',
        'король',
        'девочка',
        'мальчик',
        'демон',
        'демоны',
        'blade',
        'queen',
        'story',
        'legend',
        'hero',
        'heroes',
        'magic',
    ]);
    return words.length <= 2 && words.some((w) => generic.has(w));
}

function franchiseTitleWordPrefix(title) {
    const k = normalizeFranchiseBaseKey(title);
    if (!k) return '';
    return k
        .split(/\s+/)
        .filter((w) => w.length >= 2)
        .slice(0, 2)
        .join(' ');
}

function franchiseTitleBelongsToRoot(title, rootBase) {
    const k = normalizeFranchiseBaseKey(title);
    if (!k || k.length < 4 || !rootBase || rootBase.length < 4) return false;
    if (k === rootBase) return true;
    const shorter = k.length <= rootBase.length ? k : rootBase;
    const longer = k.length > rootBase.length ? k : rootBase;
    if (!franchiseBaseLooksTooGeneric(shorter) && shorter.length >= 10 && longer.startsWith(shorter)) return true;
    const wCand = franchiseTitleWordPrefix(title);
    const wRoot = rootBase
        .split(/\s+/)
        .filter((w) => w.length >= 2)
        .slice(0, 2)
        .join(' ');
    if (
        wCand.length >= 10 &&
        wRoot.length >= 10 &&
        wCand === wRoot &&
        !franchiseBaseLooksTooGeneric(wRoot)
    ) {
        return true;
    }
    return false;
}

function franchiseTitleBelongsToFranchise(title, rootBases) {
    if (!title || !rootBases || !rootBases.size) return false;
    for (const base of rootBases) {
        if (franchiseTitleBelongsToRoot(title, base)) return true;
    }
    return false;
}

function filterFranchiseSeasonItems(items, titleRu, titleEn, titleJp, rootMalId) {
    const rootBases = franchiseBuildRootBases(titleRu, titleEn, titleJp);
    const rootMal = parseInt(rootMalId, 10);
    return (items || []).filter((a) => {
        if (!a) return false;
        const mal = parseInt(a.mal_id, 10);
        if (Number.isFinite(rootMal) && rootMal > 0 && mal === rootMal) return true;
        return (
            franchiseTitleBelongsToFranchise(a.title, rootBases) ||
            franchiseTitleBelongsToFranchise(a.titleAlt || '', rootBases) ||
            franchiseTitleBelongsToFranchise(a.title_english || '', rootBases)
        );
    });
}

const FRANCHISE_JIKAN_RELATIONS = new Set([
    'sequel',
    'prequel',
    'parent story',
    'full story',
    'side story',
    'alternative version',
    'summary',
    'spin-off',
    'other',
]);

const FRANCHISE_MANUAL_MAL_GROUPS = [
    {
        key: 'rezero',
        title: 'Re:Zero',
        malIds: [
            31240, // TV-1
            39587, // TV-2 part 1
            42203, // TV-2 part 2
            54857, // TV-3
            61316, // TV-4
            36286, // Memory Snow
            38414, // Frozen Bond
            33142, // Break Time
            42364, // Break Time 2
            60012, // Break Time 3
            63830, // Break Time 4
            38389, // collaboration short
        ],
    },
];

const FRANCHISE_MANUAL_MAL_LOOKUP = (() => {
    const map = new Map();
    for (const group of FRANCHISE_MANUAL_MAL_GROUPS) {
        for (const mal of group.malIds || []) {
            map.set(parseInt(mal, 10), group);
        }
    }
    return map;
})();

function manualFranchiseGroupForMal(malId) {
    const mal = parseInt(malId, 10);
    if (!Number.isFinite(mal) || mal <= 0) return null;
    return FRANCHISE_MANUAL_MAL_LOOKUP.get(mal) || null;
}

const FRANCHISE_RELATIONS_CACHE_PREFIX = 'reminko_franchise_rel_v6_';
const FRANCHISE_RELATIONS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const FRANCHISE_BFS_MAX_NODES = 64;
const FRANCHISE_BFS_MAX_FETCHES = 48;

function readFranchiseRelationsCache(malId) {
    try {
        const raw = sessionStorage.getItem(FRANCHISE_RELATIONS_CACHE_PREFIX + malId);
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (Date.now() - (o.ts || 0) > FRANCHISE_RELATIONS_CACHE_TTL) {
            sessionStorage.removeItem(FRANCHISE_RELATIONS_CACHE_PREFIX + malId);
            return null;
        }
        if (Array.isArray(o)) {
            return o.length ? { entries: o, edges: [] } : null;
        }
        if (o?.entries?.length >= 2) {
            return { entries: o.entries, edges: Array.isArray(o.edges) ? o.edges : [] };
        }
        if (o?.entries?.length) {
            sessionStorage.removeItem(FRANCHISE_RELATIONS_CACHE_PREFIX + malId);
        }
        return null;
    } catch (_) {
        return null;
    }
}

function writeFranchiseRelationsCache(malId, entries, edges) {
    try {
        sessionStorage.setItem(
            FRANCHISE_RELATIONS_CACHE_PREFIX + malId,
            JSON.stringify({ ts: Date.now(), entries, edges: edges || [] })
        );
    } catch (_) {
        /* ignore */
    }
}

async function jikanFetchAnimeRelations(malId) {
    const mal =
        typeof reminkoNormalizeMalId === 'function'
            ? reminkoNormalizeMalId(malId)
            : parseInt(malId, 10);
    if (!Number.isFinite(mal) || mal <= 0) return [];

    if (typeof reminkoJikanIsCircuitOpen === 'function' && reminkoJikanIsCircuitOpen()) {
        return [];
    }

    const fetchJson = async (url) => {
        if (typeof reminkoJikanFetch === 'function') return reminkoJikanFetch(url);
        const res = await fetch(url);
        return res.ok ? res.json() : null;
    };

    try {
        const json = await fetchJson(`https://api.jikan.moe/v4/anime/${mal}/relations`);
        if (Array.isArray(json?.data) && json.data.length) return json.data;
    } catch (_) {
        /* ignore */
    }

    try {
        const full = await fetchJson(`https://api.jikan.moe/v4/anime/${mal}/full`);
        const rel = full?.data?.relations;
        if (Array.isArray(rel) && rel.length) return rel;
    } catch (_) {
        /* ignore */
    }

    return [];
}

function pushFranchiseChronologyEdge(edges, fromMal, toMal) {
    const from = parseInt(fromMal, 10);
    const to = parseInt(toMal, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0 || from === to) return;
    const key = `${from}->${to}`;
    if (!edges._seen) edges._seen = new Set();
    if (edges._seen.has(key)) return;
    edges._seen.add(key);
    edges.push({ from, to });
}

function collectFranchiseFromRelationGroups(groups, sourceMal, byMal, edges) {
    const src = parseInt(sourceMal, 10);
    for (const group of groups || []) {
        const rel = String(group.relation || '').toLowerCase();
        if (!FRANCHISE_JIKAN_RELATIONS.has(rel)) continue;
        for (const entry of group.entry || []) {
            if (entry.type !== 'anime' || entry.mal_id == null) continue;
            const mid = parseInt(entry.mal_id, 10);
            if (!Number.isFinite(mid) || mid <= 0) continue;
            if (!byMal.has(mid)) byMal.set(mid, entry);
            if (!Number.isFinite(src) || src <= 0) continue;
            if (rel === 'sequel') {
                pushFranchiseChronologyEdge(edges, src, mid);
            } else if (rel === 'prequel' || rel === 'parent story' || rel === 'full story') {
                pushFranchiseChronologyEdge(edges, mid, src);
            }
        }
    }
}

async function fetchFranchiseRelationGraph(malId) {
    const root =
        typeof reminkoNormalizeMalId === 'function'
            ? reminkoNormalizeMalId(malId)
            : parseInt(malId, 10);
    if (!Number.isFinite(root) || root <= 0) return { entries: [], edges: [] };

    const cached = readFranchiseRelationsCache(root);
    if (cached) {
        const filtered = (cached.entries || []).filter((entry) => {
            const mid = parseInt(entry.mal_id, 10);
            return Number.isFinite(mid) && mid > 0;
        });
        if (filtered.length >= 2) {
            const malSet = new Set(filtered.map((e) => parseInt(e.mal_id, 10)));
            const edges = (cached.edges || []).filter((edge) => {
                const from = parseInt(edge?.from, 10);
                const to = parseInt(edge?.to, 10);
                return malSet.has(from) && malSet.has(to);
            });
            return { entries: filtered, edges };
        }
        return { entries: [], edges: [] };
    }

    if (typeof reminkoJikanIsCircuitOpen === 'function' && reminkoJikanIsCircuitOpen()) {
        return { entries: [{ mal_id: root, name: '', type: 'anime' }], edges: [] };
    }

    const byMal = new Map([[root, { mal_id: root, name: '', type: 'anime' }]]);
    const edges = [];
    const fetched = new Set();
    const queue = [root];
    let fetches = 0;

    while (queue.length && fetches < FRANCHISE_BFS_MAX_FETCHES && byMal.size < FRANCHISE_BFS_MAX_NODES) {
        const mal = queue.shift();
        if (fetched.has(mal)) continue;
        fetched.add(mal);
        fetches += 1;
        try {
            const groups = await jikanFetchAnimeRelations(mal);
            const before = byMal.size;
            collectFranchiseFromRelationGroups(groups, mal, byMal, edges);
            for (const [mid] of byMal) {
                if (!fetched.has(mid)) queue.push(mid);
            }
            if (byMal.size > before && queue.length && fetches < FRANCHISE_BFS_MAX_FETCHES) {
                const delay =
                    typeof reminkoJikanIsCircuitOpen === 'function' && reminkoJikanIsCircuitOpen()
                        ? 0
                        : 900;
                if (delay > 0) await new Promise((r) => setTimeout(r, delay));
            }
        } catch (_) {
            /* ignore */
        }
    }

    delete edges._seen;
    const entries = [...byMal.values()];
    if (entries.length >= 2) writeFranchiseRelationsCache(root, entries, edges);
    return { entries, edges };
}

function extractFranchiseSeasonOrdinal(anime) {
    const blob = [anime?.title, anime?.titleAlt, anime?.title_english]
        .filter(Boolean)
        .join(' | ')
        .toLowerCase();
    if (!blob) return 0;
    const patterns = [
        /(?:season|сезон|курс|cour)\s*(\d+)/i,
        /(?:part|часть)\s*(\d+)/i,
        /(\d+)(?:st|nd|rd|th)\s+season/i,
        /(?:final|финал)/i,
    ];
    for (const re of patterns) {
        const m = blob.match(re);
        if (!m) continue;
        if (re.source.includes('final') || re.source.includes('финал')) return 90;
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > 0) return n;
    }
    const tail = blob.match(/\s(\d+)\s*$/);
    if (tail) return parseInt(tail[1], 10) || 0;
    return 0;
}

function franchiseFallbackChronologyCompare(a, b) {
    const da = franchiseReleaseSortValue(a);
    const db = franchiseReleaseSortValue(b);
    if (da !== db) return da - db;
    const sa = extractFranchiseSeasonOrdinal(a);
    const sb = extractFranchiseSeasonOrdinal(b);
    if (sa !== sb) return sa - sb;
    return (parseInt(a?.mal_id, 10) || 0) - (parseInt(b?.mal_id, 10) || 0);
}

function franchiseReleaseSortValue(anime) {
    const raw = anime?._jikanRaw || anime?.jikanRaw || null;
    const candidates = [
        raw?.aired?.from,
        raw?.aired?.prop?.from?.year
            ? `${raw.aired.prop.from.year}-${String(raw.aired.prop.from.month || 1).padStart(2, '0')}-${String(raw.aired.prop.from.day || 1).padStart(2, '0')}`
            : '',
        anime?.airedFrom,
        anime?.aired_at,
        anime?.start_date,
        anime?.release_date,
    ];
    for (const value of candidates) {
        if (!value) continue;
        const t = Date.parse(String(value));
        if (Number.isFinite(t)) return t;
    }
    const year = parseInt(anime?.year, 10);
    if (Number.isFinite(year) && year > 0) return Date.UTC(year, 0, 1);
    return Number.MAX_SAFE_INTEGER;
}

function sortFranchiseSeasonsChronologically(items, edges) {
    const list = Array.isArray(items) ? items.slice() : [];
    if (list.length < 2) return list;

    const byMal = new Map();
    const malSet = new Set();
    for (const a of list) {
        const mal = parseInt(a?.mal_id, 10);
        if (!Number.isFinite(mal) || mal <= 0) continue;
        byMal.set(mal, a);
        malSet.add(mal);
    }
    if (malSet.size < 2) {
        list.sort(franchiseFallbackChronologyCompare);
        return list;
    }

    const next = new Map();
    const indegree = new Map();
    for (const mal of malSet) indegree.set(mal, 0);

    for (const edge of edges || []) {
        const from = parseInt(edge?.from, 10);
        const to = parseInt(edge?.to, 10);
        if (!malSet.has(from) || !malSet.has(to) || from === to) continue;
        if (!next.has(from)) next.set(from, new Set());
        if (next.get(from).has(to)) continue;
        next.get(from).add(to);
        indegree.set(to, (indegree.get(to) || 0) + 1);
    }

    const queue = [...malSet].filter((m) => (indegree.get(m) || 0) === 0);
    queue.sort((a, b) => franchiseFallbackChronologyCompare(byMal.get(a), byMal.get(b)));

    const ordered = [];
    const visited = new Set();

    while (queue.length) {
        queue.sort((a, b) => franchiseFallbackChronologyCompare(byMal.get(a), byMal.get(b)));
        const mal = queue.shift();
        if (visited.has(mal)) continue;
        visited.add(mal);
        if (byMal.has(mal)) ordered.push(byMal.get(mal));

        const successors = [...(next.get(mal) || [])].sort((a, b) =>
            franchiseFallbackChronologyCompare(byMal.get(a), byMal.get(b))
        );
        for (const to of successors) {
            indegree.set(to, (indegree.get(to) || 0) - 1);
            if (indegree.get(to) === 0) queue.push(to);
        }
    }

    const rest = list.filter((a) => {
        const mal = parseInt(a?.mal_id, 10);
        return !Number.isFinite(mal) || mal <= 0 || !visited.has(mal);
    });
    rest.sort(franchiseFallbackChronologyCompare);
    return [...ordered, ...rest].sort(franchiseFallbackChronologyCompare);
}

function getCatalogAnimeList() {
    if (typeof window.KodikCatalogStore?.getAll === 'function') {
        const kodik = window.KodikCatalogStore.getAll();
        if (kodik?.length) return kodik;
    }
    if (typeof getAllAnime === 'function') {
        const all = getAllAnime();
        if (all?.length) return all;
    }
    if (typeof animeDatabase !== 'undefined' && animeDatabase.all) {
        return animeDatabase.all;
    }
    return [];
}

function findCatalogAnimeByMalIds(malIds) {
    const wanted = new Set(
        (malIds || [])
            .map((m) => parseInt(m, 10))
            .filter((n) => Number.isFinite(n) && n > 0)
    );
    if (!wanted.size) return [];
    const out = [];
    for (const a of getCatalogAnimeList()) {
        if (!a || a.isJikanVirtual) continue;
        const mal = parseInt(a.mal_id, 10);
        if (Number.isFinite(mal) && mal > 0 && wanted.has(mal)) out.push(a);
    }
    return out;
}

function findFranchiseSeasonsInCatalog(titleRu, titleEn, titleJp) {
    const rootBases = franchiseBuildRootBases(titleRu, titleEn, titleJp);
    const out = [];
    for (const a of getCatalogAnimeList()) {
        if (!a || a.isJikanVirtual) continue;
        if (
            franchiseTitleBelongsToFranchise(a.title, rootBases) ||
            franchiseTitleBelongsToFranchise(a.titleAlt || '', rootBases)
        ) {
            out.push(a);
        }
    }
    return { items: sortFranchiseSeasonsChronologically(out, []), rootBases };
}

function mergeFranchiseCatalogItems(byMalKey, catalogItems) {
    for (const a of catalogItems || []) {
        if (!a) continue;
        const m = parseInt(a.mal_id, 10);
        const key = Number.isFinite(m) && m > 0 ? `mal:${m}` : `id:${a.id}`;
        if (!byMalKey.has(key)) byMalKey.set(key, a);
    }
}

function catalogAnimeForMalId(mal, relationEntry) {
    const m = parseInt(mal, 10);
    if (!Number.isFinite(m) || m <= 0) return null;
    if (typeof window.KodikCatalogStore?.getById === 'function') {
        for (const kodikId of [20_000_000 + m, 20_500_000 + m]) {
            const byStore = window.KodikCatalogStore.getById(kodikId);
            if (byStore) return byStore;
        }
    }
    const kodikHits = getCatalogAnimeList().filter(
        (a) => a && !a.isJikanVirtual && a.mal_id != null && parseInt(a.mal_id, 10) === m
    );
    if (kodikHits.length) {
        const serial = kodikHits.find((a) => a.type !== 'Фильм');
        return serial || kodikHits[0];
    }
    if (typeof getAnimeById === 'function') {
        for (const id of [20000000 + m, 20500000 + m, 10000000 + m]) {
            const a = getAnimeById(id);
            if (a) return a;
        }
    }
    const name = relationEntry && relationEntry.name ? String(relationEntry.name).trim() : '';
    const relationType = String(relationEntry?.type || '').toLowerCase();
    return {
        id: 10000000 + m,
        mal_id: m,
        title: name || `Аниме MAL ${m}`,
        titleAlt: name,
        type: relationType === 'movie' ? 'Фильм' : 'Сериал',
        year: null,
        isJikanVirtual: true
    };
}

function franchiseStripEligibleItem(anime) {
    if (!anime) return false;
    return true;
}

async function buildFranchiseSeasonsFromJikanRelations(malId) {
    const { entries, edges } = await fetchFranchiseRelationGraph(malId);
    const manualGroup = manualFranchiseGroupForMal(malId);
    const entryByMal = new Map();
    for (const entry of entries) {
        const mal = parseInt(entry && entry.mal_id, 10);
        if (Number.isFinite(mal) && mal > 0) entryByMal.set(mal, entry);
    }
    if (manualGroup) {
        for (const manualMal of manualGroup.malIds || []) {
            const mal = parseInt(manualMal, 10);
            if (!Number.isFinite(mal) || mal <= 0 || entryByMal.has(mal)) continue;
            entryByMal.set(mal, {
                mal_id: mal,
                name: manualGroup.title || `MAL ${mal}`,
                type: 'anime',
                relation: 'manual-franchise',
            });
            edges.push({ from: parseInt(malId, 10), to: mal, relation: 'manual-franchise' });
        }
    }
    const mergedEntries = [...entryByMal.values()];
    const malIds = mergedEntries.map((e) => e.mal_id).filter((m) => m != null);
    const byMal = new Map();

    for (const hit of findCatalogAnimeByMalIds(malIds)) {
        const mal = parseInt(hit.mal_id, 10);
        if (Number.isFinite(mal)) byMal.set(mal, hit);
    }

    for (const entry of mergedEntries) {
        const mal = parseInt(entry.mal_id, 10);
        if (!Number.isFinite(mal) || mal <= 0) continue;
        if (byMal.has(mal)) continue;
        const card = catalogAnimeForMalId(mal, entry);
        if (card) byMal.set(mal, card);
    }

    const relationMalSet = new Set();
    for (const entry of mergedEntries) {
        const m = parseInt(entry.mal_id, 10);
        if (Number.isFinite(m) && m > 0) relationMalSet.add(m);
    }

    const items = [...byMal.values()].filter(franchiseStripEligibleItem);
    return {
        items: sortFranchiseSeasonsChronologically(items, edges),
        edges,
        relationMalSet,
        entries: mergedEntries,
    };
}

function findSimilarCatalogAnimeForJikan(jikanData, virtualAnime, limit) {
    const all =
        typeof getAllAnime === 'function'
            ? getAllAnime()
            : typeof animeDatabase !== 'undefined' && animeDatabase.all
              ? animeDatabase.all
              : [];
    const g0 = (jikanData.genres || [])
        .map((g) => (typeof mapJikanGenreName === 'function' ? mapJikanGenreName(g.name) : g.name))
        .filter(Boolean);
    const ex = new Set();
    if (virtualAnime && virtualAnime.id) ex.add(String(virtualAnime.id));
    if (jikanData.mal_id) ex.add(String(10000000 + (jikanData.mal_id | 0)));
    const titleWords = String(virtualAnime?.title || '')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
    const altWords = String(jikanData.title_english || jikanData.title || '')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
    const words = [...new Set([...titleWords, ...altWords])].slice(0, 20);
    const scored = [];
    for (const a of all) {
        if (!a || a.isJikanVirtual) continue;
        if (ex.has(String(a.id))) continue;
        const g1 = a.genres || [];
        const inter = g0.filter((g) => g1.includes(g));
        if (inter.length === 0) continue;
        let s = inter.length * 3;
        const t = (a.title || '').toLowerCase();
        for (const w of words) {
            if (t.includes(w)) s += 0.6;
        }
        scored.push({ a, s });
    }
    scored.sort((x, y) => y.s - x.s);
    return scored.slice(0, limit).map((x) => x.a);
}

function getPosterForSimilarCard(a) {
    if (!a) return '';
    if (a.posterUrl) return a.posterUrl;
    if (a.poster) return a.poster;
    if (a.image) return a.image;
    if (a.cover) return a.cover;
    return '';
}

function renderFranchiseSeasonCard(a, currentId, currentMal) {
    const href = `view.html?id=${encodeURIComponent(String(a.id))}`;
    const bg = getPosterForSimilarCard(a);
    const safeBg = bg ? reminkoSafeCssUrl(bg) : '';
    const st = safeBg ? `style="background-image:url('${safeBg}')"` : '';
    const mal = parseInt(a.mal_id, 10);
    const curMal = parseInt(currentMal, 10);
    const isCur =
        (currentId != null && String(a.id) === String(currentId)) ||
        (Number.isFinite(mal) && mal > 0 && Number.isFinite(curMal) && curMal > 0 && mal === curMal);
    const typeLine = a.type ? escapeHtmlText(a.type) : '';
    const yearAndType = [a.year != null ? String(a.year) : '', typeLine].filter(Boolean).join(' · ');
    const yearLine = yearAndType ? `<span class="anime-franchise-card__year">${yearAndType}</span>` : '';
    const hoverLayer = isCur
        ? ''
        : '<div class="anime-franchise-card__hover" aria-hidden="true"><span class="anime-franchise-card__go-btn" role="button" tabindex="-1">Перейти</span></div>';
    return `<a class="anime-franchise-card${isCur ? ' anime-franchise-card--current' : ''}" href="${href}" draggable="false" title="${escapeHtmlText(a.title)}"${isCur ? ' aria-current="page"' : ''}>
        <div class="anime-franchise-card__poster" ${st} aria-hidden="true">${hoverLayer}</div>
        <div class="anime-franchise-card__meta">
            <span class="anime-franchise-card__title">${escapeHtmlText(a.title)}</span>
            ${yearLine}
        </div>
    </a>`;
}

function renderFranchiseSeasonsIntoStrip(strip, items, currentId, currentMal) {
    if (!strip) return;
    const list = Array.isArray(items) ? items : [];
    if (list.length < 2) {
        strip.classList.add('anime-franchise-strip--empty');
        strip.innerHTML = '';
        return;
    }
    const scrollable = list.length > 5;
    strip.classList.remove('anime-franchise-strip--empty');
    strip.innerHTML = `<div class="anime-franchise-strip__inner">
        <span class="anime-franchise-strip__label">Франшиза</span>
        <div class="anime-franchise-strip__grid anime-franchise-strip__scroll${scrollable ? ' anime-franchise-strip__scroll--many' : ''}">${list.map((a) => renderFranchiseSeasonCard(a, currentId, currentMal)).join('')}</div>
    </div>`;
    const scroller = strip.querySelector('.anime-franchise-strip__scroll');
    if (scroller && typeof reminkoEnhanceHorizontalDragScroll === 'function') {
        reminkoEnhanceHorizontalDragScroll(scroller, {
            linkSelector: 'a.anime-franchise-card',
            goBtnSelector: '.anime-franchise-card__go-btn',
        });
    }
    strip.querySelectorAll('.anime-franchise-card__hover').forEach((layer) => {
        layer.addEventListener(
            'pointerdown',
            (e) => {
                e.stopPropagation();
            },
            true
        );
    });
    strip.querySelectorAll('.anime-franchise-card__go-btn').forEach((btn) => {
        btn.addEventListener(
            'pointerdown',
            (e) => {
                e.stopPropagation();
            },
            true
        );
        btn.addEventListener(
            'click',
            (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (scroller) delete scroller.dataset.suppressDragClick;
                const card = btn.closest('a.anime-franchise-card');
                const href = card && card.getAttribute('href');
                if (href) window.location.href = href;
            },
            true
        );
    });
}

async function hydrateFranchiseSeasonsStrip(currentId, titleRu, titleEn, titleJp, malId) {
    const strip = document.getElementById('animeFranchiseStrip');
    if (!strip) return;
    strip.classList.remove('anime-franchise-strip--empty');
    strip.innerHTML =
        '<div class="anime-franchise-strip__inner"><span class="anime-franchise-strip__label">Франшиза</span><span class="anime-franchise-strip__loading">Загрузка…</span></div>';
    if (typeof window.KodikCatalogStore?.load === 'function') {
        try {
            await window.KodikCatalogStore.load();
        } catch (_) {
            /* ignore */
        }
    }
    let items = [];
    let edges = [];
    const mal =
        malId != null
            ? typeof reminkoNormalizeMalId === 'function'
                ? reminkoNormalizeMalId(malId)
                : parseInt(malId, 10)
            : NaN;
    let relationMalSet = new Set();

    if (Number.isFinite(mal) && mal > 0) {
        const built = await buildFranchiseSeasonsFromJikanRelations(mal);
        items = built.items || [];
        edges = built.edges || [];
        relationMalSet = built.relationMalSet || new Set();

        if (relationMalSet.size) {
            const byMalKey = new Map();
            for (const a of items) {
                const m = parseInt(a.mal_id, 10);
                if (Number.isFinite(m) && m > 0) byMalKey.set(m, a);
            }
            for (const hit of findCatalogAnimeByMalIds([...relationMalSet])) {
                const m = parseInt(hit.mal_id, 10);
                if (Number.isFinite(m) && m > 0) byMalKey.set(m, hit);
            }
            items = [...byMalKey.values()];
        }
    }

    if (items.length < 2) {
        const { items: catalogItems } = findFranchiseSeasonsInCatalog(titleRu, titleEn, titleJp);
        const filtered = filterFranchiseSeasonItems(catalogItems, titleRu, titleEn, titleJp, mal);
        if (filtered.length > items.length) {
            items = filtered;
            edges = [];
        }
    }

    if (items.length < 2 && Number.isFinite(mal) && mal > 0) {
        const currentMeta = catalogAnimeForMalId(mal, { name: titleRu || titleEn });
        if (currentMeta && franchiseStripEligibleItem(currentMeta)) {
            const hasCurrent = items.some((a) => parseInt(a.mal_id, 10) === mal);
            if (!hasCurrent) items = [currentMeta, ...items];
        }
    }

    items = sortFranchiseSeasonsChronologically(
        items.filter(franchiseStripEligibleItem),
        edges
    );
    const currentMal =
        Number.isFinite(mal) && mal > 0
            ? mal
            : (() => {
                  const cur = items.find((a) => String(a.id) === String(currentId));
                  return cur?.mal_id != null ? parseInt(cur.mal_id, 10) : NaN;
              })();
    renderFranchiseSeasonsIntoStrip(strip, items, currentId, currentMal);
}

function hydrateJikanFranchiseAndSimilar(jikanData, virtualAnime, mergedCard) {
    const similarGrid = document.getElementById('animeSimilarGrid');
    const titleRu = virtualAnime?.title || '';
    const en = jikanData?.title_english || jikanData?.title || '';
    const jp = jikanData?.title_japanese || '';
    const mergedId = mergedCard && mergedCard.id != null ? parseInt(mergedCard.id, 10) : null;
    const currentId = mergedId != null ? mergedId : virtualAnime?.id;

    void hydrateFranchiseSeasonsStrip(currentId, titleRu, en, jp, jikanData?.mal_id);

    if (similarGrid) {
        const sim = findSimilarCatalogAnimeForJikan(jikanData, virtualAnime, 16);
        if (sim.length === 0) {
            similarGrid.innerHTML =
                '<p class="anime-similar-hint" style="margin:0">Пока нет совпадений в каталоге — попробуйте поиск.</p>';
        } else {
            similarGrid.innerHTML = sim
                .map((a) => {
                    const href = `view.html?id=${encodeURIComponent(String(a.id))}`;
                    const bg = getPosterForSimilarCard(a);
                    const safeBg = bg ? reminkoSafeCssUrl(bg) : '';
                    const st = safeBg
                        ? `style="background-image:url('${safeBg}')"`
                        : '';
                    return `<a class="anime-similar-card" href="${href}" title="${escapeHtmlText(a.title)}">
                        <div class="anime-similar-card__poster" ${st}></div>
                        <div class="anime-similar-card__title">${escapeHtmlText(a.title)}</div>
                    </a>`;
                })
                .join('');
        }
    }
}

function findSimilarCatalogAnimeForCatalog(anime, limit = 16) {
    if (!anime || typeof getAllAnime !== 'function') return [];
    const src = getAllAnime() || [];
    const currentId = String(anime.id || '');
    if (Array.isArray(anime.similarIds) && anime.similarIds.length) {
        const byId = new Map(src.filter(Boolean).map((row) => [String(row.id), row]));
        const prepared = anime.similarIds
            .map((id) => byId.get(String(id)))
            .filter((row) => row && String(row.id || '') !== currentId)
            .slice(0, limit);
        if (prepared.length) return prepared;
    }
    const baseGenres = new Set((anime.genres || []).map((g) => String(g || '').trim().toLowerCase()).filter(Boolean));
    const baseTitle = String(anime.titleAlt || anime.title || '').trim().toLowerCase();

    return src
        .filter((row) => row && String(row.id || '') !== currentId)
        .map((row) => {
            let score = 0;
            const rowGenres = (row.genres || []).map((g) => String(g || '').trim().toLowerCase());
            for (const g of rowGenres) {
                if (baseGenres.has(g)) score += 3;
            }
            const rowTitle = String(row.titleAlt || row.title || '').trim().toLowerCase();
            if (baseTitle && rowTitle) {
                if (rowTitle.includes(baseTitle) || baseTitle.includes(rowTitle)) score += 4;
                else if (rowTitle.split(' ')[0] && baseTitle.includes(rowTitle.split(' ')[0])) score += 2;
            }
            score += Math.max(0, (parseFloat(row.rating) || 0) * 0.1);
            return { row, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => item.row);
}

function hydrateCatalogSimilarSection(anime) {
    const similarGrid = document.getElementById('animeSimilarGrid');
    if (!similarGrid || !anime) return;
    const similar = findSimilarCatalogAnimeForCatalog(anime, 16);
    if (!similar.length) {
        similarGrid.innerHTML =
            '<p class="anime-similar-hint" style="margin:0">Пока нет совпадений в каталоге — попробуйте поиск.</p>';
        return;
    }
    similarGrid.innerHTML = similar
        .map((a) => {
            const href = `view.html?id=${encodeURIComponent(String(a.id))}`;
            const bg = getPosterForSimilarCard(a);
            const safeBg = bg ? reminkoSafeCssUrl(bg) : '';
            const st = safeBg ? `style="background-image:url('${safeBg}')"` : '';
            return `<a class="anime-similar-card" href="${href}" title="${escapeHtmlText(a.title)}">
                <div class="anime-similar-card__poster" ${st}></div>
                <div class="anime-similar-card__title">${escapeHtmlText(a.title)}</div>
            </a>`;
        })
        .join('');
}

async function renderJikanAnimeDetail(data, mergedCard = null) {
    if (typeof window !== 'undefined') {
        window.__animeTrailerEmbedSrc = '';
    }
    const container = document.getElementById('animeContent');
    if (!container) return;

    if (
        typeof jikanItemHasRestrictedGenre === 'function' &&
        jikanItemHasRestrictedGenre(data) &&
        typeof isAdultContentEnabled === 'function' &&
        !isAdultContentEnabled()
    ) {
        container.innerHTML = `
            <div class="page-placeholder">
                <h1>Контент 18+</h1>
                <p>Это аниме относится к жанрам 18+ (Хентай, Эротика, Этти, Яой или Юри). Включите их отображение в настройках профиля и подтвердите возраст (18+).</p>
                <a href="../profile.html" class="btn btn-primary">Открыть настройки</a>
                <a href="../index.html" class="btn btn-secondary" style="margin-left:0.5rem;">На главную</a>
            </div>`;
        return;
    }

    if (typeof registerJikanHomeList === 'function') {
        registerJikanHomeList([data]);
    }

    const hasMergedTitle =
        mergedCard &&
        mergedCard.title &&
        String(mergedCard.title).trim() &&
        String(mergedCard.title).trim() !== '—';
    const hasMergedDesc =
        mergedCard &&
        mergedCard.description &&
        String(mergedCard.description).trim();

    let titleRu = hasMergedTitle
        ? String(mergedCard.title).trim()
        : data.title_english || data.title || '—';
    const looksRussian = (s) => /[а-яёА-ЯЁ]/.test(String(s || ''));
    const jikanSynopsis = (data.synopsis || '')
        .replace('[Written by MAL Rewrite]', '')
        .replace(/<[^>]+>/g, ' ')
        .trim();

    let synopsis = '';
    let shiki = null;
    if (window.shikimoriApi?.readCachedByMalId) {
        shiki = window.shikimoriApi.readCachedByMalId(data.mal_id);
    }
    if (typeof patchJikanVirtualShiki === 'function') {
        patchJikanVirtualShiki(data.mal_id, shiki);
    }
    if (shiki?.russian) {
        const cur = String(titleRu || '').trim();
        if (!hasMergedTitle || cur === '—' || !looksRussian(cur)) titleRu = shiki.russian;
    }

    let ruDescFromShiki = '';
    if (shiki && window.shikimoriApi?.stripHtml) {
        ruDescFromShiki = window.shikimoriApi
            .stripHtml(shiki.description_html || shiki.description || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    if (hasMergedDesc) {
        const merged = String(mergedCard.description).trim();
        if (looksRussian(merged)) {
            synopsis = merged;
        }
    }
    if (ruDescFromShiki) {
        if (!synopsis || !looksRussian(synopsis) || ruDescFromShiki.length > synopsis.length) {
            synopsis = ruDescFromShiki;
        }
    }
    if (!synopsis && hasMergedDesc) {
        synopsis = String(mergedCard.description).trim();
    }
    if (!synopsis) {
        synopsis = jikanSynopsis || 'Описание появится позже.';
    }

    const posterUrl = reminkoSafeImageUrl(resolveJikanDetailPosterUrl(data, shiki), '');
    const posterCssUrl = posterUrl ? reminkoSafeCssUrl(posterUrl) : '';
    const titleEn = data.title_english || data.title || '';
    const titleJp = data.title_japanese || '';
    let epLine = '';
    if (window.shikimoriApi?.formatAiredTotal) {
        epLine = window.shikimoriApi.formatAiredTotal(data, shiki) || '';
    }
    if (!epLine) {
        const tot = data.episodes;
        epLine = tot != null && tot > 0 ? `? / ${tot} эп.` : '? / ? эп.';
    }
    const duration = data.duration || '';
    const status =
        data.status === 'Currently Airing'
            ? 'Сейчас выходит'
            : data.status === 'Not yet aired'
              ? 'Анонсировано'
              : data.status === 'Finished Airing'
                ? 'Завершено'
                : data.status || '';
    const type = data.type || '';
    const season = data.season ? data.season.charAt(0).toUpperCase() + data.season.slice(1) : '';
    const year = data.year || data.aired?.prop?.from?.year || '';
    const studios = (data.studios || []).map((s) => s.name).join(', ') || '—';
    const genres = (data.genres || [])
        .concat(data.themes || [])
        .map((g) =>
            typeof mapJikanGenreName === 'function' ? mapJikanGenreName(g.name) : g.name
        )
        .filter(Boolean);
    const source = data.source || '';
    const trailerRaw = resolveJikanTrailerRaw(data);
    if (typeof window !== 'undefined') {
        const trEmb = buildTrailerEmbedUrl(trailerRaw);
        window.__animeTrailerEmbedSrc = trEmb || '';
    }
    const isAnnounced = data.status === 'Not yet aired';
    const previousUrl = resolveAnimeBackHref();
    const jikanScore =
        data.score != null && !Number.isNaN(Number(data.score))
            ? Number(data.score).toFixed(1)
            : '—';

    const rawEp = parseInt(data.episodes, 10);
    let totalEpisodes = 1;
    if (Number.isFinite(rawEp) && rawEp > 0) {
        totalEpisodes = rawEp;
    } else if (data.status === 'Currently Airing') {
        totalEpisodes = 24;
    } else if (data.type !== 'Movie' && data.status !== 'Not yet aired') {
        totalEpisodes = 12;
    } else if (data.type !== 'Movie') {
        totalEpisodes = 1;
    }
    const virtualAnime = {
        id: 10000000 + data.mal_id,
        mal_id: data.mal_id,
        isJikanVirtual: true,
        title: titleRu,
        titleAlt: titleEn || data.title,
        type: data.type === 'Movie' ? 'Фильм' : 'Сериал',
        totalEpisodes,
        _jikanRaw: data
    };
    const countdownIso =
        typeof reminkoResolveCountdownTargetIso === 'function'
            ? reminkoResolveCountdownTargetIso(data, shiki, {
                  calendar: reminkoCalendarForAnime(virtualAnime, data.mal_id)
              })
            : '';

    document.title = `${titleRu} — Re-Minko`;
    applyAnimeViewSeo(virtualAnime, { title: titleRu, id: virtualAnime.id, poster: posterUrl, description: data.synopsis });

    container.innerHTML = `
        <a href="${escapeHtmlText(previousUrl)}" class="back-button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Назад
        </a>
        <div class="anime-detail anime-detail-shell">
        <div class="anime-detail-main">
            <div class="anime-detail-poster" style="${posterCssUrl ? `background-image:url('${posterCssUrl}');background-size:cover;background-position:center;` : 'background:linear-gradient(135deg,#6c5ce7,#a29bfe);'}">
                ${status ? `<div class="anime-status anime-status--poster-pill" title="">${escapeHtmlText(status)}</div>` : ''}
            </div>
            <div class="anime-detail-info">
                <h1 class="anime-detail-title">${escapeHtmlText(titleRu)}</h1>
                ${titleEn && titleEn !== titleRu ? `<div class="anime-detail-alt-title" style="opacity:0.85">${escapeHtmlText(titleEn)}</div>` : ''}
                ${titleJp ? `<div class="anime-detail-alt-title">${escapeHtmlText(titleJp)}</div>` : ''}
                <div class="anime-detail-meta">
                    ${type ? `<span class="meta-item">📺 ${escapeHtmlText(type)}</span>` : ''}
                    ${epLine ? `<span class="meta-item">🎬 ${escapeHtmlText(epLine)}</span>` : ''}
                    ${duration ? `<span class="meta-item">⏱ ${escapeHtmlText(duration)}</span>` : ''}
                    ${year ? `<span class="meta-item">📅 ${escapeHtmlText(season ? `${season} ${year}` : year)}</span>` : ''}
                    ${source ? `<span class="meta-item">📖 ${escapeHtmlText(source)}</span>` : ''}
                </div>
                <div class="anime-detail-statrow" role="list" aria-label="Кратко о тайтле">
                    <div class="anime-stat-pill" role="listitem"><span class="anime-stat-pill__k">Оценка</span><span class="anime-stat-pill__v">★ ${jikanScore}</span></div>
                    <div class="anime-stat-pill" role="listitem"><span class="anime-stat-pill__k">Эпизоды</span><span class="anime-stat-pill__v">${escapeHtmlText(epLine || '—')}</span></div>
                </div>
                <div class="anime-detail-studio">${escapeHtmlText(studios)}</div>
                ${genres.length > 0 ? `<div class="anime-detail-genres">${genres.map((g) => `<span class="genre-tag">${escapeHtmlText(g)}</span>`).join('')}</div>` : ''}
                <p class="anime-detail-description">${escapeHtmlText(synopsis)}</p>
                ${isAnnounced ? '' : animeNextEpisodeCountdownBarHtml()}
                <div class="anime-franchise-strip anime-franchise-strip--empty" id="animeFranchiseStrip" aria-label="Сезоны"></div>
            </div>
        </div>
        ${generateInlineKodikSection(virtualAnime, { trailerUrl: trailerRaw, countdownIso, announcedOnly: isAnnounced })}
        </div>
        <div class="anime-detail-section anime-similar-section" id="animeSimilarSection">
            <h2 class="section-title">Похожие аниме на это</h2>
            <p class="anime-similar-hint">По жанрам и схожести с названием в каталоге Re-Minko</p>
            <div class="anime-similar-scroll" id="animeSimilarGrid"></div>
        </div>
        <div style="text-align:center;margin:2rem 0;">
            <a href="../catalog/anime.html?search=${encodeURIComponent(titleRu)}" class="btn btn-primary" style="padding:0.8rem 2rem;border-radius:30px;background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;text-decoration:none;font-weight:600;">Найти в каталоге Re-Minko</a>
        </div>
    `;

    window.__jikanVirtualPlayerAnime = virtualAnime;
    bindAnimeBackButtons(container);
    wireAnimePlayerTabs();
    refreshAnimeViewCountdown(virtualAnime, data, shiki);
    void hydrateAnimeViewCountdownSchedule(virtualAnime);
    hydrateJikanDetailPoster(data);
    queueMicrotask(() => {
        if (typeof window.reminkoApplySidebarMaintenanceLocks === 'function') {
            window.reminkoApplySidebarMaintenanceLocks();
        }
        if (typeof hydrateJikanFranchiseAndSimilar === 'function') {
            hydrateJikanFranchiseAndSimilar(data, virtualAnime, mergedCard);
        }
    });

    if (window.shikimoriApi?.enqueueFetchShikimoriByMalId) {
        window.shikimoriApi
            .enqueueFetchShikimoriByMalId(data.mal_id, data.title_english || data.title || '')
            .then((shLate) => {
                if (!shLate) return;
                if (typeof patchJikanVirtualShiki === 'function') {
                    patchJikanVirtualShiki(data.mal_id, shLate);
                }
                if (shLate.russian) {
                    const h1 = document.querySelector('.anime-detail-title');
                    const curTitle = h1 && h1.textContent ? h1.textContent.trim() : '';
                    const shouldPatchTitle =
                        !looksRussian(curTitle) || curTitle === '—';
                    if (h1 && shouldPatchTitle) {
                        h1.textContent = shLate.russian;
                        document.title = `${shLate.russian} — Re-Minko`;
                        applyAnimeViewSeo(virtualAnime, {
                            title: shLate.russian,
                            id: virtualAnime.id,
                            description: shLate.description
                        });
                    }
                    if (window.__jikanVirtualPlayerAnime && shouldPatchTitle) {
                        window.__jikanVirtualPlayerAnime.title = shLate.russian;
                    }
                }
                if (window.shikimoriApi?.stripHtml) {
                    const lateDesc = window.shikimoriApi
                        .stripHtml(shLate.description_html || shLate.description || '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    if (lateDesc) {
                        const de = document.querySelector('.anime-detail-description');
                        if (de) {
                            const cur = (de.textContent || '').trim();
                            if (
                                looksRussian(lateDesc) &&
                                (!looksRussian(cur) || lateDesc.length > cur.length)
                            ) {
                                de.textContent = lateDesc;
                            } else if (!looksRussian(cur) && lateDesc.length > cur.length) {
                                de.textContent = lateDesc;
                            }
                        }
                    }
                }
                refreshAnimeViewCountdown(window.__jikanVirtualPlayerAnime, data, shLate);
                const posterEl = document.querySelector('.anime-detail-poster');
                if (posterEl && shLate?.image?.original) {
                    const bg = posterEl.style.backgroundImage || '';
                    if (!bg || /linear-gradient/i.test(bg)) {
                        const latePoster =
                            typeof shikimoriPosterUrlFromPath === 'function'
                                ? shikimoriPosterUrlFromPath(shLate.image.original)
                                : '';
                        const safeLatePoster = reminkoSafeImageUrl(latePoster, '');
                        if (safeLatePoster) {
                            posterEl.style.backgroundImage = `url('${reminkoSafeCssUrl(safeLatePoster)}')`;
                            posterEl.style.backgroundSize = 'cover';
                            posterEl.style.backgroundPosition = 'center';
                        }
                    }
                }
            });
    }
}

async function renderAnimeDetail(anime) {
    if (typeof window !== 'undefined') {
        window.__animeTrailerEmbedSrc = '';
    }
    const gradient = generateGradient(anime.id);
    const container = document.getElementById('animeContent');
    if (!container) return;
    
    const previousUrl = resolveAnimeBackHref();
    
    const animeIdInt = parseInt(anime.id);
    
    // Загружаем постер и дополнительные данные (не блокируем рендеринг)
    let posterUrl = null;
    let description = anime.description || null;
    let jikanGenres = anime.genres || [];
    let jikanYear = anime.year || null;
    let jikanEpisodes = anime.totalEpisodes || null;
    let jikanStudios = anime.studio ? [anime.studio] : [];

    const searchTitle = anime.titleAlt || anime.title;
    const looksRussianText = (s) => /[а-яёА-ЯЁ]/.test(String(s || ''));
    
    const initialPoster = reminkoSafeImageUrl(
        anime.posterUrl ||
        (anime.poster && String(anime.poster).trim()) ||
        null,
        ''
    );
    const initialPosterCss = initialPoster ? reminkoSafeCssUrl(initialPoster) : '';
    const posterStyle = initialPoster
        ? `background-image: url('${initialPosterCss}'); background-size: cover; background-position: center;`
        : `background: ${gradient};`;
    
    // Загружаем данные параллельно в фоне и обновляем страницу после загрузки
    // НЕ блокируем рендеринг - показываем страницу сразу с базовыми данными
    (async () => {
        try {
            // Приоритет 1: Быстрый API для постера
            if (typeof getPosterFast === 'function') {
                try {
                    const url = await Promise.race([
                        getPosterFast(searchTitle, 'anime'),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                    ]);
                    const safeUrl = reminkoSafeImageUrl(url, '');
                    if (safeUrl && !safeUrl.startsWith('data:image')) {
                        const posterElement = container.querySelector('.anime-detail-poster');
                        if (posterElement) {
                            posterElement.style.backgroundImage = `url('${reminkoSafeCssUrl(safeUrl)}')`;
                            posterElement.style.backgroundSize = 'cover';
                            posterElement.style.backgroundPosition = 'center';
                        }
                    }
                } catch (e) {
                    // Игнорируем ошибки загрузки постера
                }
            }
            
            // Приоритет 2: Jikan API для дополнительных данных
            if (typeof window !== 'undefined' && window.jikanGetAnimeDetails) {
                try {
                    const jikanData = await Promise.race([
                        window.jikanGetAnimeDetails(searchTitle),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);
                    
                    if (jikanData) {
                        // Обновляем постер, если он еще не загружен
                        if (jikanData.poster) {
                            const posterElement = container.querySelector('.anime-detail-poster');
                            const safePoster = reminkoSafeImageUrl(jikanData.poster, '');
                            if (posterElement && !posterElement.style.backgroundImage) {
                                posterElement.style.backgroundImage = safePoster
                                    ? `url('${reminkoSafeCssUrl(safePoster)}')`
                                    : '';
                                posterElement.style.backgroundSize = 'cover';
                                posterElement.style.backgroundPosition = 'center';
                            }
                        }
                        
                        // Обновляем описание
                        if (jikanData.description) {
                            const descElement = container.querySelector('.anime-detail-description');
                            if (descElement && descElement.textContent.trim() === 'Описание отсутствует.') {
                                descElement.textContent = jikanData.description;
                            }
                        }
                        
                        // Обновляем жанры
                        if (jikanData.genres && jikanData.genres.length > 0) {
                            const genresElement = container.querySelector('.anime-detail-genres');
                            if (genresElement) {
                                genresElement.innerHTML = jikanData.genres.map(genre =>
                                    `<a class="genre-tag" href="../catalog/anime.html?genre=${encodeURIComponent(String(genre))}">${escapeHtmlText(genre)}</a>`
                                ).join('');
                            }
                        }
                        
                        // Обновляем год
                        if (jikanData.year) {
                            const yearElements = container.querySelectorAll('.anime-detail-year');
                            yearElements.forEach(el => {
                                if (el.textContent === anime.year || !el.textContent) {
                                    el.textContent = jikanData.year;
                                }
                            });
                        }
                        
                        // Обновляем студии
                        if (jikanData.studios && jikanData.studios.length > 0) {
                            const studioElements = container.querySelectorAll('.anime-detail-studio');
                            studioElements.forEach(el => {
                                if (el.textContent.includes('Студия:')) {
                                    el.textContent = `Студия: ${jikanData.studios.join(', ')}`;
                                }
                            });
                        }
                        
                        // Обновляем количество серий
                        if (jikanData.episodes) {
                            const episodesElements = container.querySelectorAll('.anime-detail-studio');
                            episodesElements.forEach(el => {
                                if (el.textContent.includes('Всего серий:')) {
                                    el.textContent = `Всего серий: ${jikanData.episodes}`;
                                }
                            });
                        }
                    }
                } catch (e) {
                    // Игнорируем ошибки загрузки данных из Jikan
                }
            }
        } catch (e) {
            // Игнорируем все ошибки загрузки дополнительных данных
        }
    })();
    
    const ratingVal =
        anime.rating != null && String(anime.rating).trim() !== ''
            ? Number(anime.rating).toFixed(1)
            : '—';
    const isAnnounced = isAnnouncedCatalogAnime(anime);

    applyAnimeViewSeo(anime, { description });

    container.innerHTML = `
        <a href="${escapeHtmlText(previousUrl)}" class="back-button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Назад
        </a>
        
        <div class="anime-detail anime-detail-shell">
            <div class="anime-detail-header">
                <div class="anime-detail-poster" style="${escapeHtmlText(posterStyle)}"></div>
                <div class="anime-detail-info">
                    <h1 class="anime-detail-title">${escapeHtmlText(anime.title)}</h1>
                    <div class="anime-detail-meta">
                        <div class="anime-detail-year">${escapeHtmlText(jikanYear || anime.year)}</div>
                        <div class="anime-detail-status">${escapeHtmlText(anime.status)}</div>
                        <div class="anime-detail-type">${escapeHtmlText(anime.type)}</div>
                    </div>
                    <div class="anime-detail-statrow" role="list" aria-label="Кратко о тайтле">
                        <div class="anime-stat-pill" role="listitem"><span class="anime-stat-pill__k">Оценка</span><span class="anime-stat-pill__v">★ ${ratingVal}</span></div>
                        <div class="anime-stat-pill" role="listitem"><span class="anime-stat-pill__k">Серий</span><span class="anime-stat-pill__v">${
                            anime.episodesTotalUnknown
                                ? `${String(anime.episodes || jikanEpisodes || '—').replace(/^1-/, '')} / ?`
                                : jikanEpisodes || anime.totalEpisodes || '—'
                        }</span></div>
                        <div class="anime-stat-pill" role="listitem"><span class="anime-stat-pill__k">Год</span><span class="anime-stat-pill__v">${jikanYear || anime.year || '—'}</span></div>
                    </div>
                    ${jikanStudios.length > 0 ? `<div class="anime-detail-studio">Студия: ${escapeHtmlText(jikanStudios.join(', '))}</div>` : (anime.studio ? `<div class="anime-detail-studio">Студия: ${escapeHtmlText(anime.studio)}</div>` : '')}
                    ${anime.duration ? `<div class="anime-detail-studio">Длительность: ${escapeHtmlText(anime.duration)}</div>` : ''}
                    
                    <div class="anime-detail-description">
                        ${description ? escapeHtmlText(description) : 'Описание отсутствует.'}
                    </div>
                    
                    <div class="anime-detail-genres">
                        ${(jikanGenres.length > 0 ? jikanGenres : anime.genres).map(genre => `
                            <a class="genre-tag" href="../catalog/anime.html?genre=${encodeURIComponent(String(genre))}">${escapeHtmlText(genre)}</a>
                        `).join('')}
                    </div>

                    <div class="anime-detail-actions">
                        <button type="button" class="btn btn-secondary favorite-btn" id="favoriteBtn" onclick="handleFavoriteClick(${animeIdInt})">
                            ${typeof isInFavorites === 'function' && isInFavorites(animeIdInt) ? '❤️ В избранном' : '🤍 В избранное'}
                        </button>
                    </div>
                    
                    ${isAnnounced ? '' : animeNextEpisodeCountdownBarHtml()}
                    <div class="anime-franchise-strip anime-franchise-strip--empty" id="animeFranchiseStrip" aria-label="Сезоны"></div>
                </div>
            </div>
            
            ${generateInlineKodikSection(anime, { ...catalogAnimeTrailerOpts(anime), announcedOnly: isAnnounced })}
        </div>
        <div class="anime-detail-section anime-similar-section" id="animeSimilarSection">
            <h2 class="section-title">Похожие аниме на это</h2>
            <p class="anime-similar-hint">По жанрам и схожести с названием в каталоге Re-Minko</p>
            <div class="anime-similar-scroll" id="animeSimilarGrid"></div>
        </div>
    `;
    bindAnimeBackButtons(container);
    wireAnimePlayerTabs();
    refreshAnimeViewCountdown(anime, anime._jikanRaw || null, null);
    void hydrateAnimeViewCountdownSchedule(anime);
    updateFavoriteButton(animeIdInt);
    queueMicrotask(() => {
        if (typeof window.reminkoApplySidebarMaintenanceLocks === 'function') {
            window.reminkoApplySidebarMaintenanceLocks();
        }
        updateFavoriteButton(animeIdInt);
        void hydrateFranchiseSeasonsStrip(
            animeIdInt,
            anime.title,
            anime.titleAlt || searchTitle,
            (anime._jikanRaw && anime._jikanRaw.title_japanese) || '',
            anime.mal_id
        );
        hydrateCatalogSimilarSection(anime);
    });
    if (anime.mal_id && window.shikimoriApi?.enqueueFetchShikimoriByMalId) {
        window.shikimoriApi
            .enqueueFetchShikimoriByMalId(
                anime.mal_id,
                searchTitle
            )
            .then((sh) => {
                if (!sh) return;
                if (window.shikimoriApi?.stripHtml) {
                    const ru = window.shikimoriApi
                        .stripHtml(sh.description_html || sh.description || '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    if (ru) {
                        const de = container.querySelector('.anime-detail-description');
                        if (de) {
                            const cur = (de.textContent || '').trim();
                            if (looksRussianText(ru) && (!looksRussianText(cur) || ru.length > cur.length)) {
                                de.textContent = ru;
                            }
                        }
                    }
                }
                refreshAnimeViewCountdown(anime, anime._jikanRaw || null, sh);
            })
            .catch(() => {});
    }
}

function getCatalogEpisodeCursor(anime) {
    if (!anime) return 1;
    const available = getCatalogAvailableEpisodes(anime);
    if (anime.type !== 'Сериал' || available <= 1) return 1;

    try {
        const rawEp = new URLSearchParams(window.location.search).get('episode');
        if (rawEp != null && String(rawEp).trim() !== '') {
            const n = parseInt(rawEp, 10);
            if (Number.isFinite(n) && n >= 1) {
                return Math.min(n, available);
            }
        }
    } catch (_) {
        /* ignore */
    }

    // Продолжить с последней серии из истории просмотра
    if (typeof getLastWatchedEpisode === 'function') {
        const last = parseInt(getLastWatchedEpisode(anime.id), 10);
        if (Number.isFinite(last) && last >= 1) {
            return Math.min(last, available);
        }
    }

    return 1;
}

function getCatalogAvailableEpisodes(anime) {
    if (!anime || anime.type !== 'Сериал') return 1;
    const candidates = [];
    if (anime._kodik && anime._kodik.lastEpisode != null) {
        candidates.push(parseInt(anime._kodik.lastEpisode, 10));
    }
    const epStr = anime.episodes != null ? String(anime.episodes).trim() : '';
    const range = epStr.match(/(\d+)\s*-\s*(\d+)/);
    if (range) candidates.push(parseInt(range[2], 10));
    else if (epStr) candidates.push(parseInt(epStr, 10));
    const best = Math.max(...candidates.filter((n) => Number.isFinite(n) && n > 0), 0);
    if (best > 0) return best;
    return Math.max(1, parseInt(anime.totalEpisodes, 10) || 1);
}

// Встроенный плеер Kodik: общая логика в kodik-catalog-resolve.js (тот же API, что в комнате)
let currentPlayerAnime = null;
let currentEpisode = 1;
function reminkoCalendarForAnime(anime, malId) {
    const mal = malId != null ? malId : anime?.mal_id;
    if (typeof reminkoCalendarRowForMal === 'function') {
        const row = reminkoCalendarRowForMal(mal);
        if (row) return row;
    }
    if (anime?._calendar) return anime._calendar;
    return null;
}

function animeShowOngoingCountdownBar(anime, jikanData, shiki, announcedOnly) {
    if (announcedOnly || !anime) return false;
    if (shiki && (shiki.ongoing || shiki.status === 'ongoing')) return anime.type !== 'Фильм';
    const st = String(jikanData?.status || anime.status || '');
    if (st === 'Онгоинг') return anime.type !== 'Фильм';
    if (typeof reminkoIsAiringAnimeStatus === 'function' && reminkoIsAiringAnimeStatus(st)) {
        return anime.type !== 'Фильм';
    }
    return false;
}

async function hydrateAnimeViewCountdownSchedule(anime) {
    if (!anime) return;
    const needsCountdown =
        anime.status === 'Онгоинг' ||
        anime.status === 'Анонс' ||
        (typeof isAnnouncedCatalogAnime === 'function' && isAnnouncedCatalogAnime(anime));
    if (!needsCountdown) return;

    if (typeof reminkoLoadAllCalendarData === 'function') {
        try {
            await reminkoLoadAllCalendarData();
        } catch (_) {
            /* ignore */
        }
    } else if (typeof reminkoLoadCalendarData === 'function') {
        try {
            await reminkoLoadCalendarData();
        } catch (_) {
            /* ignore */
        }
    }

    if (typeof reminkoLoadShikimoriCalendarData === 'function') {
        try {
            await reminkoLoadShikimoriCalendarData();
        } catch (_) {
            /* ignore */
        }
    }

    let jikanData = anime._jikanRaw || null;
    if (
        anime.mal_id &&
        (!jikanData?.broadcast?.day || jikanData?.status == null) &&
        typeof fetchJikanAnimeByMalId === 'function'
    ) {
        const fetched = await fetchJikanAnimeByMalId(anime.mal_id);
        if (fetched) {
            anime._jikanRaw = fetched;
            jikanData = fetched;
        }
    }

    let shiki = null;
    if (anime.mal_id && window.shikimoriApi?.enqueueFetchShikimoriByMalId) {
        try {
            shiki = await window.shikimoriApi.enqueueFetchShikimoriByMalId(
                Number(anime.mal_id),
                anime.titleAlt || anime.title || ''
            );
        } catch (_) {
            shiki = null;
        }
    }
    if (!shiki && anime.mal_id && window.shikimoriApi?.readCachedByMalId) {
        shiki = window.shikimoriApi.readCachedByMalId(Number(anime.mal_id));
    }
    refreshAnimeViewCountdown(anime, jikanData, shiki);
}

function animeNextEpisodeCountdownBarHtml() {
    return `
                    <div id="animeNextEpCountdownBar" class="anime-next-ep-countdown-bar" hidden>
                        <div class="anime-next-ep-countdown-bar__inner">
                            <span class="countdown__text">До выхода следующей серии:</span>
                            <div class="countdown__wrp fx-col fx-center" id="animeNextEpCountdownInner"></div>
                        </div>
                    </div>`;
}

function syncAnimeViewCountdownIso(iso) {
    const section = document.getElementById('animeInlinePlayerSection');
    if (!section || !iso) return;
    section.dataset.countdownIso = String(iso)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}

function startAnimeViewCountdowns(iso, opts) {
    const announcedOnly = !!(opts && opts.announcedOnly);
    const countdownOpts = {
        unknownText: 'Дата следующего эпизода неизвестна.',
        expiredText: 'Ожидаем обновление расписания следующей серии…',
        rollData: opts?.rollData || null
    };

    const inner = document.getElementById('animeCountdownInner');
    const block = document.getElementById('animeWatchUnavailable');
    if (inner && announcedOnly) {
        if (typeof reminkoStartLiveCountdown === 'function') {
            reminkoStartLiveCountdown(inner, iso, countdownOpts);
        }
    } else if (inner && block && !block.hidden) {
        if (typeof reminkoStartLiveCountdown === 'function') {
            reminkoStartLiveCountdown(inner, iso, countdownOpts);
        }
    } else if (inner && typeof reminkoStopLiveCountdown === 'function') {
        reminkoStopLiveCountdown(inner);
    }

    const bar = document.getElementById('animeNextEpCountdownBar');
    const barInner = document.getElementById('animeNextEpCountdownInner');
    if (!announcedOnly && bar && barInner) {
        if (iso || opts?.showBarWhenUnknown) {
            bar.hidden = false;
            if (typeof reminkoStartLiveCountdown === 'function') {
                reminkoStartLiveCountdown(barInner, iso || '', countdownOpts);
            }
        } else {
            bar.hidden = true;
            if (typeof reminkoStopLiveCountdown === 'function') {
                reminkoStopLiveCountdown(barInner);
            }
        }
    }
}

function refreshAnimeViewCountdown(anime, jikanData, shiki) {
    const cal = reminkoCalendarForAnime(anime, jikanData?.mal_id);
    const iso =
        typeof reminkoResolveCountdownTargetIso === 'function'
            ? reminkoResolveCountdownTargetIso(jikanData || anime?._jikanRaw || anime, shiki, {
                  calendar: cal,
                  _calendar: cal
              })
            : '';
    syncAnimeViewCountdownIso(iso);
    const announced =
        (jikanData && jikanData.status === 'Not yet aired') ||
        (shiki && (shiki.anons || shiki.status === 'anons')) ||
        (anime && typeof isAnnouncedCatalogAnime === 'function' && isAnnouncedCatalogAnime(anime));
    const rollData = reminkoRollDataFromContext
        ? reminkoRollDataFromContext(jikanData || anime?._jikanRaw || anime, shiki)
        : jikanData || anime?._jikanRaw || anime || null;
    startAnimeViewCountdowns(iso, {
        announcedOnly: announced,
        rollData,
        showBarWhenUnknown: animeShowOngoingCountdownBar(anime, jikanData || anime?._jikanRaw, shiki, announced)
    });
    return iso;
}

function buildTrailerEmbedUrl(raw) {
    if (!raw) return '';
    let urlStr = String(raw).trim();
    if (urlStr.startsWith('//') && typeof window !== 'undefined' && window.location) {
        urlStr = (window.location.protocol || 'https:') + urlStr;
    }
    if (/youtu\.be\//i.test(urlStr)) {
        try {
            const u = new URL(urlStr, window.location.href);
            const id = (u.pathname || '')
                .replace(/^\//, '')
                .split('/')
                .filter(Boolean)[0];
            if (id && id.length >= 6) {
                urlStr = `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
            }
        } catch {
            /* ignore */
        }
    }
    try {
        if (
            /youtube\.com\/watch/i.test(urlStr) ||
            (/youtu\.be\//i.test(urlStr) && !/youtube\.com\/embed/i.test(urlStr))
        ) {
            const u = new URL(urlStr, window.location.href);
            const v = u.searchParams.get('v') || u.pathname.replace(/^\//, '').split('/').filter(Boolean)[0];
            if (v) {
                urlStr = `https://www.youtube.com/embed/${encodeURIComponent(v)}`;
            }
        }
        const u = new URL(urlStr, window.location.href);
        u.searchParams.set('autoplay', '0');
        u.searchParams.set('mute', '0');
        u.searchParams.set('rel', '0');
        u.searchParams.set('modestbranding', '1');
        return u.toString();
    } catch {
        const sep = urlStr.includes('?') ? '&' : '?';
        return `${urlStr}${sep}autoplay=0&mute=0&rel=0`;
    }
}

function catalogAnimeTrailerOpts(anime) {
    const j = anime && anime._jikanRaw;
    const raw = j ? resolveJikanTrailerRaw(j) : '';
    if (typeof window !== 'undefined') {
        window.__animeTrailerEmbedSrc = raw ? buildTrailerEmbedUrl(raw) : '';
    }
    const cal = reminkoCalendarForAnime(anime, anime?.mal_id);
    const countdownIso =
        typeof reminkoResolveCountdownTargetIso === 'function'
            ? reminkoResolveCountdownTargetIso(j || anime, null, { calendar: cal, _calendar: cal })
            : '';
    return { trailerUrl: raw || '', countdownIso };
}

function readTrailerSrcFromPlayerSection(section) {
    if (typeof window !== 'undefined' && window.__animeTrailerEmbedSrc) {
        return window.__animeTrailerEmbedSrc;
    }
    if (!section) return '';
    const enc = section.getAttribute('data-trailer-src');
    if (enc == null || enc === '') return '';
    try {
        return decodeURIComponent(enc);
    } catch {
        return enc;
    }
}

function stopAnimeReleaseCountdown() {
    const inner = document.getElementById('animeCountdownInner');
    const barInner = document.getElementById('animeNextEpCountdownInner');
    if (inner && typeof reminkoStopLiveCountdown === 'function') reminkoStopLiveCountdown(inner);
    if (barInner && typeof reminkoStopLiveCountdown === 'function') reminkoStopLiveCountdown(barInner);
}

function hideAnimeWatchUnavailable() {
    const block = document.getElementById('animeWatchUnavailable');
    const kodikWrap = document.getElementById('animeKodikFrameWrap');
    const allohaWrap = document.getElementById('animeAllohaFrameWrap');
    if (block) block.hidden = true;
    const tab = getActivePlayerTab();
    if (kodikWrap) kodikWrap.hidden = tab !== 'kodik';
    if (allohaWrap) allohaWrap.hidden = tab !== 'alloha';
    const inner = document.getElementById('animeCountdownInner');
    if (inner && typeof reminkoStopLiveCountdown === 'function') reminkoStopLiveCountdown(inner);
}

function showAnimeWatchUnavailable(iso) {
    const block = document.getElementById('animeWatchUnavailable');
    const kodikWrap = document.getElementById('animeKodikFrameWrap');
    const allohaWrap = document.getElementById('animeAllohaFrameWrap');
    const kodikIframe = document.getElementById('animeKodikIframe');
    const allohaIframe = document.getElementById('animeAllohaIframe');
    if (kodikIframe) kodikIframe.src = 'about:blank';
    if (allohaIframe) allohaIframe.src = 'about:blank';
    if (kodikWrap) kodikWrap.hidden = true;
    if (allohaWrap) allohaWrap.hidden = true;
    if (!block) return;
    block.hidden = false;
    syncAnimeViewCountdownIso(iso);
    const announced = document.getElementById('animeInlinePlayerSection')?.dataset?.announced === '1';
    startAnimeViewCountdowns(iso, { announcedOnly: announced });
}

function getActivePlayerTab() {
    const active = document.querySelector('#animeInlinePlayerSection .anime-source-tab--active');
    const tab = active?.getAttribute('data-tab');
    if (tab === 'alloha' || tab === 'trailer' || tab === 'watch') return tab === 'watch' ? 'kodik' : tab;
    return tab || 'kodik';
}

function applyActiveWatchProvider(anime, episode) {
    const tab = getActivePlayerTab();
    if (tab === 'alloha') void applyAllohaIframeSrc(anime, episode);
    else if (tab === 'kodik' || tab === 'watch') void applyKodikIframeSrc(anime, episode);
}

window.switchAnimePlayerTab = function (name) {
    const kodik = document.getElementById('animeTabPanelKodik');
    const alloha = document.getElementById('animeTabPanelAlloha');
    const trail = document.getElementById('animeTabPanelTrailer');
    const section = document.getElementById('animeInlinePlayerSection');
    section?.querySelectorAll?.('.anime-source-tab').forEach((b) => {
        const on = b.getAttribute('data-tab') === name;
        b.classList.toggle('anime-source-tab--active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (kodik) kodik.hidden = name !== 'kodik' && name !== 'watch';
    if (alloha) alloha.hidden = name !== 'alloha';
    if (trail) trail.hidden = name !== 'trailer';

    const unavail = document.getElementById('animeWatchUnavailable');
    if (unavail && name !== 'trailer') {
        unavail.hidden = true;
    }

    if (name === 'kodik' || name === 'watch') {
        const wrap = document.getElementById('animeKodikFrameWrap');
        if (wrap) wrap.hidden = false;
        if (currentPlayerAnime) void applyKodikIframeSrc(currentPlayerAnime, currentEpisode);
    } else if (name === 'alloha') {
        const wrap = document.getElementById('animeAllohaFrameWrap');
        if (wrap) wrap.hidden = false;
        if (currentPlayerAnime) void applyAllohaIframeSrc(currentPlayerAnime, currentEpisode);
    } else if (name === 'trailer') {
        const iframe = document.getElementById('animeTrailerIframe');
        let srcFinal =
            (typeof window !== 'undefined' && window.__animeTrailerEmbedSrc) ||
            readTrailerSrcFromPlayerSection(section);
        if (srcFinal && !/^https?:\/\//i.test(String(srcFinal))) {
            srcFinal = 'https://' + String(srcFinal).replace(/^\/\//, '');
        }
        if (iframe && srcFinal) {
            const embed = buildTrailerEmbedUrl(srcFinal);
            iframe.src = embed || srcFinal;
            iframe.dataset.loaded = '1';
        } else if (iframe) {
            iframe.src = 'about:blank';
        }
    }
};

function wireAnimePlayerTabs() {
    const section = document.getElementById('animeInlinePlayerSection');
    if (!section) return;
    section.querySelectorAll('.anime-source-tab').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = btn.getAttribute('data-tab');
            if (name) window.switchAnimePlayerTab(name);
        });
    });
}

function isJikanAnnouncedAnime(anime) {
    const raw = anime?._jikanRaw;
    return !!(anime?.isJikanVirtual && raw && raw.status === 'Not yet aired');
}

function isAnnouncedCatalogAnime(anime) {
    if (!anime) return false;
    // Уже выходит / вышло / есть серии или ссылка Kodik — не режим «только анонс» (без плеера)
    if (typeof reminkoEffectiveAnimeStatus === 'function') {
        const eff = reminkoEffectiveAnimeStatus(anime);
        if (eff === 'Онгоинг' || eff === 'Завершён' || eff === 'Вышел') return false;
    }
    const st = String(anime.status || '');
    if (st === 'Онгоинг' || st === 'Завершён' || st === 'Вышел') return false;
    if (anime._kodik && anime._kodik.link) return false;
    const last = parseInt(anime._kodik && anime._kodik.lastEpisode, 10);
    if (Number.isFinite(last) && last >= 1) return false;
    const epStr = String(anime.episodes != null ? anime.episodes : '').trim();
    const range = epStr.match(/(\d+)\s*-\s*(\d+)/);
    const hi = range ? parseInt(range[2], 10) : parseInt(epStr, 10);
    if (Number.isFinite(hi) && hi >= 1) return false;

    const mal = parseInt(anime.mal_id, 10);
    if (Number.isFinite(mal) && mal > 0 && typeof reminkoShikimoriCalendarRowForMal === 'function') {
        const row = reminkoShikimoriCalendarRowForMal(mal);
        const cst = String((row && row.status) || '').toLowerCase();
        if (cst === 'ongoing' || cst === 'released' || cst === 'finished') return false;
    }

    if (anime.isCalendarAnnounced) return true;
    if (anime.status === 'Анонс') return true;
    return isJikanAnnouncedAnime(anime);
}

async function fetchJikanAnimeByMalId(malId, opts) {
    const mal =
        typeof reminkoNormalizeMalId === 'function'
            ? reminkoNormalizeMalId(malId)
            : parseInt(malId, 10);
    if (!Number.isFinite(mal) || mal <= 0) return null;
    const cached = reminkoReadSessionJikanData(mal, opts);
    if (cached) return cached;

    const withTimeout = (p, ms) =>
        Promise.race([
            p,
            new Promise((resolve) => setTimeout(() => resolve(null), ms))
        ]).catch(() => null);

    if (typeof jikanFetchAnimeFullByMalId === 'function') {
        const full = await withTimeout(jikanFetchAnimeFullByMalId(mal), 14000);
        if (full) return full;
    }
    try {
        const url = `https://api.jikan.moe/v4/anime/${mal}`;
        const json =
            typeof reminkoJikanFetch === 'function'
                ? await withTimeout(reminkoJikanFetch(url), 14000)
                : await withTimeout(
                      reminkoFetchWithTimeout(url).then((r) => (r.ok ? r.json() : null)),
                      14000
                  );
        if (json && json.data) return json.data;
    } catch (_) {
        /* fallback ниже */
    }

    if (typeof getJikanAnnouncedCachedSync === 'function') {
        const fromAnnounced = getJikanAnnouncedCachedSync().find(
            (a) => a && parseInt(a.mal_id, 10) === mal
        );
        if (fromAnnounced) return fromAnnounced;
    }

    return null;
}

function generateInlineKodikSection(anime, opts = {}) {
    const trailerUrl = opts.trailerUrl || '';
    const countdownIso = opts.countdownIso || '';
    const announcedOnly = !!opts.announcedOnly || isJikanAnnouncedAnime(anime);
    const builtTrailer = trailerUrl ? buildTrailerEmbedUrl(trailerUrl) : '';
    const hasTrailer = !!(builtTrailer && /^https?:\/\//i.test(builtTrailer));
    const trailerData = hasTrailer ? encodeURIComponent(builtTrailer) : '';
    const safeIso = String(countdownIso || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');

    if (announcedOnly) {
        const tabBarAnn = hasTrailer
            ? `<div class="anime-player-source-tabs" role="tablist" aria-label="Источник видео">
            <button type="button" class="anime-source-tab anime-source-tab--active" data-tab="watch" role="tab" aria-selected="true" tabindex="0">Анонс</button>
            <button type="button" class="anime-source-tab" data-tab="trailer" role="tab" aria-selected="false" tabindex="0">Трейлер</button>
        </div>`
            : '';
        const trailerPanelAnn = hasTrailer
            ? `<div id="animeTabPanelTrailer" class="anime-tab-panel anime-tab-panel--trailer" data-panel="trailer" hidden>
            <div class="anime-trailer-wrap anime-trailer-wrap--tabbed">
                <iframe id="animeTrailerIframe" class="anime-trailer-iframe" title="Трейлер"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    loading="lazy" src="about:blank" referrerpolicy="strict-origin-when-cross-origin"></iframe>
            </div>
        </div>`
            : '';
        return `
        <div class="anime-detail-section anime-inline-kodik anime-inline-kodik--announced" id="animeInlinePlayerSection" data-countdown-iso="${safeIso}" data-trailer-src="${trailerData}" data-announced="1">
            ${tabBarAnn}
            <div id="animeTabPanelWatch" class="anime-tab-panel anime-tab-panel--watch" data-panel="info">
                <div id="animeWatchUnavailable" class="anime-watch-unavailable">
                    <p class="anime-watch-unavailable-msg">Аниме ещё не вышло — полноценный плеер недоступен.${hasTrailer ? ' Можно посмотреть трейлер во вкладке выше.' : ''}</p>
                    <div class="anime-release-countdown">
                        <div class="countdown__text">До выхода:</div>
                        <div class="countdown__wrp fx-col fx-center" id="animeCountdownInner"></div>
                    </div>
                </div>
            </div>
            ${trailerPanelAnn}
        </div>`;
    }

    // Kodik + Alloha + опционально «Трейлер»
    const providerTabs = `<button type="button" class="anime-source-tab anime-source-tab--active" data-tab="kodik" role="tab" aria-selected="true" tabindex="0">Kodik</button>
            <button type="button" class="anime-source-tab" data-tab="alloha" role="tab" aria-selected="false" tabindex="0">Alloha</button>`;
    const tabBar = hasTrailer
        ? `<div class="anime-player-source-tabs" role="tablist" aria-label="Источник видео">
            ${providerTabs}
            <button type="button" class="anime-source-tab" data-tab="trailer" role="tab" aria-selected="false" tabindex="0">Трейлер</button>
        </div>`
        : `<div class="anime-player-source-tabs" role="tablist" aria-label="Источник видео">
            ${providerTabs}
        </div>`;

    const trailerPanel = hasTrailer
        ? `<div id="animeTabPanelTrailer" class="anime-tab-panel anime-tab-panel--trailer" data-panel="trailer" hidden>
            <div class="anime-trailer-wrap anime-trailer-wrap--tabbed">
                <iframe id="animeTrailerIframe" class="anime-trailer-iframe" title="Трейлер"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    loading="lazy" src="about:blank" referrerpolicy="strict-origin-when-cross-origin"></iframe>
            </div>
        </div>`
        : '';

    return `
        <div class="anime-detail-section anime-inline-kodik" id="animeInlinePlayerSection" data-countdown-iso="${safeIso}" data-trailer-src="${trailerData}">
            ${tabBar}
            <div id="animeTabPanelKodik" class="anime-tab-panel anime-tab-panel--watch" data-panel="kodik">
                <div id="animeWatchUnavailable" class="anime-watch-unavailable" hidden>
                    <p class="anime-watch-unavailable-msg">Аниме ещё не вышло или пока недоступно в выбранном плеере.</p>
                    <div class="anime-release-countdown">
                        <div class="countdown__text">До выхода след. серии осталось:</div>
                        <div class="countdown__wrp fx-col fx-center" id="animeCountdownInner"></div>
                    </div>
                </div>
                <div id="kodikPlayerHint" class="anime-kodik-hint" hidden></div>
                <div class="anime-kodik-frame-wrap" id="animeKodikFrameWrap">
                    <div id="animeKodikPlaceholder" class="anime-kodik-placeholder" hidden>
                        <p class="anime-kodik-placeholder__title">Плеер Kodik</p>
                        <p class="anime-kodik-placeholder__text" id="animeKodikPlaceholderText">Загрузка…</p>
                    </div>
                    <iframe id="animeKodikIframe" class="anime-kodik-iframe" title="Плеер Kodik"
                        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                        referrerpolicy="origin"></iframe>
                </div>
                <p class="anime-player-adblock-note">
                    Чтобы реже сталкиваться с рекламой во встроенном плеере, включите или установите блокировщик рекламы
                    (расширение для браузера или отдельную программу).
                </p>
            </div>
            <div id="animeTabPanelAlloha" class="anime-tab-panel anime-tab-panel--alloha" data-panel="alloha" hidden>
                <div id="allohaPlayerHint" class="anime-kodik-hint" hidden></div>
                <div class="anime-kodik-frame-wrap" id="animeAllohaFrameWrap">
                    <div id="animeAllohaPlaceholder" class="anime-kodik-placeholder" hidden>
                        <p class="anime-kodik-placeholder__title">Плеер Alloha</p>
                        <p class="anime-kodik-placeholder__text" id="animeAllohaPlaceholderText">Загрузка…</p>
                    </div>
                    <iframe id="animeAllohaIframe" class="anime-kodik-iframe" title="Плеер Alloha"
                        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                        referrerpolicy="origin"></iframe>
                </div>
                <p class="anime-player-adblock-note">
                    Плеер Alloha TV (Yani). Для работы на сайте нужен <code>ALLOHA_API_TOKEN</code> в Netlify.
                </p>
            </div>
            ${trailerPanel}
        </div>
    `;
}

function fillInlineEpisodeSelect(total, current) {
    const sel = document.getElementById('animeKodikEpisodeSelect');
    if (!sel) return;
    let html = '';
    for (let i = 1; i <= total; i++) {
        html += `<option value="${i}"${i === current ? ' selected' : ''}>Серия ${i}</option>`;
    }
    sel.innerHTML = html;
}

function updateInlineEpisodeNavButtons() {
    if (!currentPlayerAnime || currentPlayerAnime.type !== 'Сериал') return;
    const total = currentPlayerAnime.totalEpisodes || 1;
    const prevBtn = document.getElementById('animeKodikPrevBtn');
    const nextBtn = document.getElementById('animeKodikNextBtn');
    if (prevBtn) prevBtn.disabled = currentEpisode <= 1;
    if (nextBtn) nextBtn.disabled = currentEpisode >= total;
}

function highlightEpisodeCardsInList() {
    document.querySelectorAll('#episodeList .episode-card[data-episode]').forEach((el) => {
        const n = parseInt(el.dataset.episode, 10);
        el.classList.toggle('active', n === currentEpisode);
    });
}

function scrollToInlinePlayer() {
    const sec = document.getElementById('animeInlinePlayerSection');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function animeHasKodikCatalogLink(anime) {
    return !!(anime && ((anime._kodik && anime._kodik.link) || anime._kodikLink));
}

function kodikPlayerConfigHintHtml() {
    if (window.KodikApi && KodikApi.usesProxy && KodikApi.usesProxy()) {
        return (
            'Плеер Kodik на сайте работает через прокси Netlify. ' +
            'В панели Netlify → Environment variables должен быть <code>KODIK_API_TOKEN</code> (токен из кабинета Kodik). ' +
            'В файлы проекта токен не кладите.'
        );
    }
    return (
        'Локально: в <code>config.local.js</code> (до <code>config.js</code>) укажите ' +
        '<code>window.APP_CONFIG.kodik.apiToken</code> — токен из кабинета Kodik.'
    );
}

function updateKodikPlayerHint() {
    const el = document.getElementById('kodikPlayerHint');
    if (!el) return;
    if (window.KodikApi && KodikApi.hasToken && KodikApi.hasToken()) {
        el.hidden = true;
        return;
    }
    el.className = 'anime-kodik-hint anime-kodik-hint--warn';
    if (typeof reminkoDevOnlySetElement === 'function') {
        reminkoDevOnlySetElement(el, kodikPlayerConfigHintHtml(), 'Скрыто от пользователей');
    } else {
        el.hidden = true;
    }
}

function clearInlineKodikHint() {
    const hint = document.getElementById('kodikPlayerHint');
    if (!hint) return;
    hint.hidden = true;
    hint.textContent = '';
    hint.innerHTML = '';
    hint.className = 'anime-kodik-hint';
}

/** Краткая подсказка на время resolve URL (как в «Смотреть вместе» — плеер сразу в iframe). */
function showKodikHintBrief() {
    const hint = document.getElementById('kodikPlayerHint');
    if (!hint) return;
    hint.hidden = false;
    hint.className = 'anime-kodik-hint anime-kodik-hint--loading';
    hint.innerHTML =
        '<strong class="anime-kodik-hint__title">Загрузка плеера…</strong>' +
        '<p class="anime-kodik-hint__note">Подбираем ссылку Kodik и встраиваем плеер ниже — как в комнате «Смотреть вместе».</p>';
}

/**
 * Встраивание плеера: resolve API, затем src у iframe.
 * История: локальный каталог (<10M) и Kodik (≥20M); Jikan-virtual (10M–20M) не пишем.
 */
function animeEligibleForWatchHistory(anime) {
    if (!anime || anime.isJikanVirtual) return false;
    const id = parseInt(anime.id, 10);
    if (Number.isNaN(id)) return false;
    if (id >= 10000000 && id < 20000000) return false;
    return true;
}

let _watchHistoryTimer = null;
let _watchHistoryTimerKey = '';
let _watchHistoryPending = null;

/** ~20 с просмотра достаточно; при уходе со страницы — flush сразу. */
const WATCH_HISTORY_DELAY_MS = 20000;

function scheduleWatchHistoryAfterMinute(animeId, episode) {
    if (typeof addToWatchHistory !== 'function') return;
    const key = `${animeId}:${episode}`;
    if (_watchHistoryTimerKey === key && _watchHistoryTimer) return;
    clearTimeout(_watchHistoryTimer);
    _watchHistoryTimerKey = key;
    _watchHistoryPending = { animeId, episode };
    _watchHistoryTimer = setTimeout(() => {
        const pend = _watchHistoryPending;
        _watchHistoryTimer = null;
        _watchHistoryTimerKey = '';
        _watchHistoryPending = null;
        if (
            pend &&
            currentPlayerAnime &&
            String(currentPlayerAnime.id) === String(pend.animeId) &&
            currentEpisode === pend.episode
        ) {
            addToWatchHistory(pend.animeId, pend.episode);
        }
    }, WATCH_HISTORY_DELAY_MS);
}

function flushWatchHistoryTimer() {
    if (!_watchHistoryPending || typeof addToWatchHistory !== 'function') {
        clearWatchHistoryTimer();
        return;
    }
    const pend = _watchHistoryPending;
    clearWatchHistoryTimer();
    if (
        currentPlayerAnime &&
        String(currentPlayerAnime.id) === String(pend.animeId) &&
        Number(currentEpisode) === Number(pend.episode)
    ) {
        addToWatchHistory(pend.animeId, pend.episode);
    }
}

function clearWatchHistoryTimer() {
    clearTimeout(_watchHistoryTimer);
    _watchHistoryTimer = null;
    _watchHistoryTimerKey = '';
    _watchHistoryPending = null;
}

if (typeof window !== 'undefined' && !window.__reminkoWatchHistoryFlushBound) {
    window.__reminkoWatchHistoryFlushBound = true;
    const flush = () => {
        try {
            flushWatchHistoryTimer();
        } catch (_) {
            /* ignore */
        }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
    });
}

async function applyKodikIframeSrc(anime, episode) {
    const ep = Math.max(1, parseInt(episode, 10) || 1);
    const section = document.getElementById('animeInlinePlayerSection');
    const iso = section?.dataset?.countdownIso || '';

    const canUseKodikApi = window.KodikApi && KodikApi.hasToken && KodikApi.hasToken();
    const hasCatalogLink = animeHasKodikCatalogLink(anime);
    if (!canUseKodikApi && !hasCatalogLink) {
        const hintEl = document.getElementById('kodikPlayerHint');
        if (hintEl) {
            hintEl.hidden = true;
            hintEl.innerHTML = '';
        }
        const ph = document.getElementById('animeKodikPlaceholder');
        const phTx = document.getElementById('animeKodikPlaceholderText');
        if (ph) {
            ph.hidden = false;
        }
        if (phTx) {
            phTx.textContent = 'Плеер временно недоступен. Попробуйте обновить страницу позже.';
        }
        updateKodikPlayerHint();
        const ifBad = document.getElementById('animeKodikIframe');
        if (ifBad) ifBad.removeAttribute('src');
        return;
    }

    const phHide = document.getElementById('animeKodikPlaceholder');
    const phTx = document.getElementById('animeKodikPlaceholderText');
    if (phHide) phHide.hidden = false;
    if (phTx) phTx.textContent = 'Загрузка плеера Kodik…';

    const K = window.KodikCatalogResolve;
    if (!K || typeof K.resolveEmbedBase !== 'function' || typeof K.buildIframeUrl !== 'function') {
        clearInlineKodikHint();
        console.warn('[Kodik] KodikCatalogResolve не готов');
        showAnimeWatchUnavailable(iso);
        return;
    }

    const iframe = document.getElementById('animeKodikIframe');
    if (!iframe || !anime) return;

    hideAnimeWatchUnavailable();
    showKodikHintBrief();

    const mountUrl = (url) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!currentPlayerAnime || String(currentPlayerAnime.id) !== String(anime.id)) return;
                if (currentEpisode !== ep) return;
                const ifr = document.getElementById('animeKodikIframe');
                if (!ifr) return;
                const pl = document.getElementById('animeKodikPlaceholder');
                if (pl) pl.hidden = true;
                ifr.src = url;
                ifr.setAttribute('referrerpolicy', 'origin');
                clearInlineKodikHint();
                if (anime && animeEligibleForWatchHistory(anime)) {
                    scheduleWatchHistoryAfterMinute(anime.id, ep);
                }
            });
        });
    };

    try {
        const base = await Promise.race([
            K.resolveEmbedBase(anime),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Kodik: превышено время ожидания')), 22000)
            )
        ]);
        if (!currentPlayerAnime || String(currentPlayerAnime.id) !== String(anime.id)) return;
        if (currentEpisode !== ep) return;
        const playerUrl = K.buildIframeUrl(base.href, base.isSerial, ep);
        mountUrl(playerUrl);
    } catch (e) {
        console.warn('[Kodik]', e);
        if (!currentPlayerAnime || String(currentPlayerAnime.id) !== String(anime.id)) return;
        if (currentEpisode !== ep) return;
        clearInlineKodikHint();
        const ph = document.getElementById('animeKodikPlaceholder');
        const phTx = document.getElementById('animeKodikPlaceholderText');
        if (ph) ph.hidden = false;
        if (phTx) {
            phTx.textContent =
                e && String(e.message || '').includes('время ожидания')
                    ? 'Kodik не ответил вовремя. Попробуйте вкладку Alloha или обновите страницу.'
                    : 'Плеер Kodik временно недоступен. Попробуйте вкладку Alloha.';
        }
        iframe.src = 'about:blank';
        if (!window.AllohaApi?.hasToken?.()) showAnimeWatchUnavailable(iso);
    }
}

async function applyAllohaIframeSrc(anime, episode) {
    const ep = Math.max(1, parseInt(episode, 10) || 1);
    const section = document.getElementById('animeInlinePlayerSection');
    const iso = section?.dataset?.countdownIso || '';
    const iframe = document.getElementById('animeAllohaIframe');
    const ph = document.getElementById('animeAllohaPlaceholder');
    const phTx = document.getElementById('animeAllohaPlaceholderText');
    const hintEl = document.getElementById('allohaPlayerHint');

    if (!window.AllohaApi || typeof AllohaApi.hasToken !== 'function' || !AllohaApi.hasToken()) {
        if (hintEl) {
            hintEl.className = 'anime-kodik-hint anime-kodik-hint--warn';
            if (typeof reminkoDevOnlySetElement === 'function') {
                reminkoDevOnlySetElement(
                    hintEl,
                    'Плеер Alloha недоступен: задайте <code>ALLOHA_API_TOKEN</code> в Netlify ' +
                        '(или <code>alloha.apiToken</code> в config.local.js для локальной разработки).',
                    'Скрыто от пользователей'
                );
            } else {
                hintEl.hidden = false;
                hintEl.textContent = 'Плеер временно недоступен. Попробуйте позже.';
            }
        }
        if (ph) {
            ph.hidden = false;
            if (phTx) phTx.textContent = 'Плеер временно недоступен. Попробуйте позже.';
        }
        if (iframe) iframe.removeAttribute('src');
        return;
    }

    if (hintEl) {
        hintEl.hidden = true;
        hintEl.innerHTML = '';
    }
    if (ph) {
        ph.hidden = false;
    }
    if (phTx) {
        phTx.textContent = 'Загрузка плеера Alloha…';
    }
    if (iframe) iframe.removeAttribute('src');

    hideAnimeWatchUnavailable();

    try {
        const url = await AllohaApi.resolveEmbedUrl(anime, ep);
        if (!currentPlayerAnime || String(currentPlayerAnime.id) !== String(anime.id)) return;
        if (currentEpisode !== ep) return;
        if (!url) {
            if (phTx) {
                phTx.textContent = 'Alloha: аниме не найдено в каталоге или нет озвучки для этой серии.';
            }
            if (ph) ph.hidden = false;
            if (iframe) iframe.src = 'about:blank';
            return;
        }
        if (ph) ph.hidden = true;
        if (iframe) {
            iframe.src = url;
            iframe.setAttribute('referrerpolicy', 'origin');
        }
        if (anime && animeEligibleForWatchHistory(anime)) {
            scheduleWatchHistoryAfterMinute(anime.id, ep);
        }
    } catch (e) {
        console.warn('[Alloha]', e);
        if (!currentPlayerAnime || String(currentPlayerAnime.id) !== String(anime.id)) return;
        if (currentEpisode !== ep) return;
        if (phTx) {
            phTx.textContent = 'Не удалось загрузить плеер Alloha. Попробуйте позже или выберите Kodik.';
        }
        if (ph) ph.hidden = false;
        if (iframe) iframe.src = 'about:blank';
    }
}

function pushWatchActivity(anime) {
    if (typeof DirectMessagesService === 'undefined') return;
    if (!anime || !animeEligibleForWatchHistory(anime)) return;
    DirectMessagesService.updateActivity({
        type: 'watching',
        title: anime.title || anime.titleAlt || 'Аниме',
        animeId: anime.id
    }).catch(() => {});
}

function initAnnouncedJikanPlayer(anime) {
    if (!anime) return;
    currentPlayerAnime = anime;
    clearWatchHistoryTimer();
    const section = document.getElementById('animeInlinePlayerSection');
    const iso = section?.dataset?.countdownIso || '';
    const iframe = document.getElementById('animeKodikIframe');
    if (iframe) iframe.src = 'about:blank';
    const wrap = document.getElementById('animeKodikFrameWrap');
    if (wrap) wrap.hidden = true;
    showAnimeWatchUnavailable(iso);
    const trail = document.getElementById('animeTrailerIframe');
    const trailSrc = section?.dataset?.trailerSrc;
    let loadedTrailer = false;
    if (trail && trailSrc) {
        try {
            const dec = decodeURIComponent(trailSrc);
            if (/^https?:\/\//i.test(dec)) {
                trail.src = dec;
                trail.dataset.loaded = '1';
                loadedTrailer = true;
            }
        } catch (_) {
            /* ignore */
        }
    }
    wireAnimePlayerTabs();
    if (!loadedTrailer) {
        const infoPanel = document.getElementById('animeTabPanelWatch');
        const trailPanel = document.getElementById('animeTabPanelTrailer');
        if (infoPanel) infoPanel.hidden = false;
        if (trailPanel) trailPanel.hidden = true;
    }
}

function initCatalogAnimeInlineKodik(anime) {
    if (!anime) return;
    if (isAnnouncedCatalogAnime(anime)) {
        initAnnouncedJikanPlayer(anime);
        return;
    }
    hideAnimeWatchUnavailable();
    const section = document.getElementById('animeInlinePlayerSection');
    const iso = section?.dataset?.countdownIso || '';
    startAnimeViewCountdowns(iso, { announcedOnly: false });
    const trail = document.getElementById('animeTrailerIframe');
    if (trail) {
        delete trail.dataset.loaded;
        trail.src = 'about:blank';
    }
    const secTabs = document.getElementById('animeInlinePlayerSection');
    secTabs?.querySelectorAll?.('.anime-source-tab').forEach((b) => {
        const tabName = b.getAttribute('data-tab');
        const on = tabName === 'kodik' || tabName === 'watch';
        b.classList.toggle('anime-source-tab--active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const kodikPanel = document.getElementById('animeTabPanelKodik');
    const allohaPanel = document.getElementById('animeTabPanelAlloha');
    const trailPanel = document.getElementById('animeTabPanelTrailer');
    if (kodikPanel) kodikPanel.hidden = false;
    if (allohaPanel) allohaPanel.hidden = true;
    if (trailPanel) trailPanel.hidden = true;

    currentPlayerAnime = anime;
    currentEpisode = getCatalogEpisodeCursor(anime);
    const availableEpisodes = getCatalogAvailableEpisodes(anime);
    if (anime.type === 'Сериал' && availableEpisodes > 1) {
        fillInlineEpisodeSelect(availableEpisodes, currentEpisode);
        updateInlineEpisodeNavButtons();
    }
    void tryApplyKodikWhenReady(anime, currentEpisode);
    highlightEpisodeCardsInList();
}

/** config.js + kodik-api.js грузятся с страницей; KodikCatalogResolve — в том же порядке, краткое ожидание на случай гонок */
function tryApplyKodikWhenReady(anime, ep, attempt) {
    const n = attempt | 0;
    if (window.KodikApi && typeof KodikApi.hasToken === 'function' && KodikApi.hasToken() &&
        window.KodikCatalogResolve && typeof KodikCatalogResolve.resolveEmbedBase === 'function') {
        void applyActiveWatchProvider(anime, ep);
        return;
    }
    if (n < 100) {
        setTimeout(() => tryApplyKodikWhenReady(anime, ep, n + 1), 50);
    } else {
        void applyActiveWatchProvider(anime, ep);
    }
}

function playAnime(animeId) {
    const anime = getAnimeById(animeId);
    if (!anime) return;

    if (typeof hideLoading === 'function') {
        hideLoading();
    }

    currentPlayerAnime = anime;
    currentEpisode = getCatalogEpisodeCursor(anime);
    const availableEpisodes = getCatalogAvailableEpisodes(anime);
    if (anime.type === 'Сериал' && availableEpisodes > 1) {
        fillInlineEpisodeSelect(availableEpisodes, currentEpisode);
        updateInlineEpisodeNavButtons();
    }
    if (animeEligibleForWatchHistory(anime)) {
        scheduleWatchHistoryAfterMinute(animeId, currentEpisode);
    }
    void applyActiveWatchProvider(anime, currentEpisode);
    highlightEpisodeCardsInList();
    const sel = document.getElementById('animeKodikEpisodeSelect');
    if (sel) sel.value = String(currentEpisode);
    pushWatchActivity(anime);
    scrollToInlinePlayer();
}

function playEpisode(animeId, episodeNumber) {
    const anime = getAnimeById(animeId);
    if (!anime) return;

    if (typeof hideLoading === 'function') {
        hideLoading();
    }

    const total = getCatalogAvailableEpisodes(anime);
    let ep = parseInt(episodeNumber, 10);
    if (Number.isNaN(ep) || ep < 1) ep = 1;
    if (ep > total) ep = total;

    if (
        typeof addToWatchHistory === 'function' &&
        animeEligibleForWatchHistory(anime)
    ) {
        addToWatchHistory(animeId, ep);
    }

    currentPlayerAnime = anime;
    currentEpisode = ep;
    if (anime.type === 'Сериал' && total > 1) {
        fillInlineEpisodeSelect(total, currentEpisode);
        updateInlineEpisodeNavButtons();
    }
    void applyActiveWatchProvider(anime, currentEpisode);
    highlightEpisodeCardsInList();
    const sel = document.getElementById('animeKodikEpisodeSelect');
    if (sel) sel.value = String(currentEpisode);
    pushWatchActivity(anime);
    scrollToInlinePlayer();
}

function openPlayer(anime, episode = 1) {
    if (!anime) return;
    playEpisode(anime.id, episode);
}

function prevEpisode() {
    if (currentEpisode > 1) {
        goToEpisode(currentEpisode - 1);
    }
}

function nextEpisode() {
    const total = currentPlayerAnime ? getCatalogAvailableEpisodes(currentPlayerAnime) : 1;
    if (currentPlayerAnime && currentEpisode < total) {
        goToEpisode(currentEpisode + 1);
    }
}

function goToEpisode(ep) {
    const episode = parseInt(ep, 10);
    if (!currentPlayerAnime || Number.isNaN(ep)) return;
    const total = getCatalogAvailableEpisodes(currentPlayerAnime);
    if (episode < 1 || episode > total) return;

    currentEpisode = episode;

    if (
        typeof addToWatchHistory === 'function' &&
        animeEligibleForWatchHistory(currentPlayerAnime)
    ) {
        addToWatchHistory(currentPlayerAnime.id, episode);
    }

    void applyActiveWatchProvider(currentPlayerAnime, episode);
    highlightEpisodeCardsInList();
    const sel = document.getElementById('animeKodikEpisodeSelect');
    if (sel) sel.value = String(episode);
    updateInlineEpisodeNavButtons();
    pushWatchActivity(currentPlayerAnime);
}

function toggleFullscreenPlayer() {
    const tab = getActivePlayerTab();
    const wrap =
        tab === 'alloha'
            ? document.getElementById('animeAllohaFrameWrap')
            : document.getElementById('animeKodikFrameWrap') || document.querySelector('.anime-kodik-frame-wrap');
    if (!wrap) return;
    if (!document.fullscreenElement) {
        wrap.requestFullscreen?.().catch(() => {});
    } else {
        document.exitFullscreen?.();
    }
}

function closePlayer() {
    if (typeof DirectMessagesService !== 'undefined') {
        DirectMessagesService.clearActivity().catch(() => {});
    }
}

function setFavoriteButtonState(animeId, inFavorites) {
    animeId = parseInt(animeId, 10);
    const favoriteBtn = document.getElementById('favoriteBtn');
    if (!favoriteBtn || Number.isNaN(animeId)) return;
    const on = !!inFavorites;
    favoriteBtn.classList.toggle('is-favorite', on);
    favoriteBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    favoriteBtn.textContent = on ? '❤️ В избранном' : '🤍 В избранное';
    favoriteBtn.onclick = (e) => {
        if (e) e.preventDefault();
        if (on) handleRemoveFromFavorites(animeId);
        else handleAddToFavorites(animeId);
    };
}

function handleAddToFavorites(animeId) {
    animeId = parseInt(animeId, 10);

    const favBtn = document.getElementById('favoriteBtn');
    if (favBtn && (favBtn.disabled || favBtn.classList.contains('reminko-maint-locked'))) {
        if (typeof showWarning === 'function') showWarning('Раздел в разработке');
        return;
    }

    const isAuth =
        typeof isAuthenticatedSync === 'function'
            ? isAuthenticatedSync()
            : localStorage.getItem('isAuth') === 'true';
    if (!isAuth) {
        showWarning('Для добавления в избранное необходимо войти в аккаунт');
        const loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.classList.add('active');
        return;
    }

    if (typeof window.addToFavorites === 'undefined') {
        showError('Ошибка: функция добавления в избранное не найдена');
        return;
    }

    Promise.resolve(window.addToFavorites(animeId)).then((result) => {
        if (!result) return;
        if (result.success) {
            setFavoriteButtonState(animeId, true);
            if (result.message && typeof showSuccess === 'function') showSuccess(result.message);
            void updateFavoriteButton(animeId);
        } else if (result.message && typeof showError === 'function') {
            showError(result.message);
        }
    });
}

function handleRemoveFromFavorites(animeId) {
    animeId = parseInt(animeId, 10);

    const favBtn = document.getElementById('favoriteBtn');
    if (favBtn && (favBtn.disabled || favBtn.classList.contains('reminko-maint-locked'))) {
        if (typeof showWarning === 'function') showWarning('Раздел в разработке');
        return;
    }

    if (typeof window.removeFromFavorites === 'undefined') {
        showError('Ошибка: функция удаления из избранного не найдена');
        return;
    }

    Promise.resolve(window.removeFromFavorites(animeId)).then((result) => {
        if (!result) return;
        if (result.success) {
            setFavoriteButtonState(animeId, false);
            if (result.message && typeof showSuccess === 'function') showSuccess(result.message);
            void updateFavoriteButton(animeId);
        } else if (result.message && typeof showError === 'function') {
            showError(result.message);
        }
    });
}

async function updateFavoriteButton(animeId) {
    animeId = parseInt(animeId, 10);
    if (Number.isNaN(animeId)) return;

    try {
        if (typeof loadFavorites === 'function') await loadFavorites();
    } catch (_) {
        /* ignore */
    }

    const on = typeof isInFavorites === 'function' ? isInFavorites(animeId) : false;
    setFavoriteButtonState(animeId, on);

    queueMicrotask(() => {
        if (typeof window.reminkoApplySidebarMaintenanceLocks === 'function') {
            window.reminkoApplySidebarMaintenanceLocks();
        }
    });
}

function handleFavoriteClick(animeId) {
    animeId = parseInt(animeId, 10);

    const favBtn = document.getElementById('favoriteBtn');
    if (favBtn && (favBtn.disabled || favBtn.classList.contains('reminko-maint-locked'))) {
        if (typeof showWarning === 'function') showWarning('Раздел в разработке');
        return;
    }

    if (typeof isInFavorites === 'function' && isInFavorites(animeId)) {
        handleRemoveFromFavorites(animeId);
    } else {
        handleAddToFavorites(animeId);
    }
}

function reminkoBindFavoriteButtonAutoRefresh() {
    if (window.__reminkoFavBtnBound) return;
    window.__reminkoFavBtnBound = true;
    window.addEventListener('reminko:favorites-loaded', () => {
        const btn = document.getElementById('favoriteBtn');
        if (!btn) return;
        const id =
            parseInt(new URLSearchParams(window.location.search).get('id') || '', 10) ||
            parseInt(sessionStorage.getItem('viewAnimeId') || '', 10);
        if (!Number.isNaN(id) && id > 0) void updateFavoriteButton(id);
    });
}
reminkoBindFavoriteButtonAutoRefresh();

// Глобальные экспорты для плеера (необходимы для onclick в HTML)
window.playAnime = playAnime;
window.playEpisode = playEpisode;
window.openPlayer = openPlayer;
window.closePlayer = closePlayer;
window.prevEpisode = prevEpisode;
window.nextEpisode = nextEpisode;
window.goToEpisode = goToEpisode;
window.toggleFullscreenPlayer = toggleFullscreenPlayer;
window.handleFavoriteClick = handleFavoriteClick;

// Восстановление после «Назад» (bfcache): иначе iframe остаётся на промежуточной ошибке Kodik.
window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    const iframe = document.getElementById('animeKodikIframe');
    if (!iframe) return;
    let anime = currentPlayerAnime;
    if (!anime && typeof getAnimeById === 'function') {
        const rawId = sessionStorage.getItem('viewAnimeId');
        if (rawId) anime = getAnimeById(rawId);
    }
    if (!anime) return;
    const ep =
        typeof currentEpisode === 'number' && currentEpisode >= 1
            ? currentEpisode
            : getCatalogEpisodeCursor(anime);
    currentPlayerAnime = anime;
    currentEpisode = ep;
    iframe.src = 'about:blank';
    requestAnimationFrame(() => {
        void applyActiveWatchProvider(anime, ep);
    });
});

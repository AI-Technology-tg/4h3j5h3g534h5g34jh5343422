// Страница просмотра ≈4K каталога (без Kodik, франшиз, похожих)

function escape4kHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function applyAnime4kViewSeo(anime) {
    if (typeof reminkoUpdatePageSeo !== 'function' || !anime) return;
    reminkoUpdatePageSeo({
        title: `${anime.title} — ≈4K каталог | Re-Minko`,
        description: String(anime.description || anime.title).replace(/\s+/g, ' ').trim().slice(0, 300),
        path: `/anime/view-4k.html?id=${encodeURIComponent(String(anime.id))}`,
        image: anime.posterUrl || undefined,
        ogType: 'video.movie',
        jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Movie',
            name: anime.title,
            url: `https://re-minko-anime.com/anime/view-4k.html?id=${anime.id}`,
            ...(anime.posterUrl ? { image: anime.posterUrl } : {}),
            ...(anime.year ? { datePublished: String(anime.year) } : {})
        }
    });
}

async function renderAnime4kDetail(anime) {
    const container = document.getElementById('animeContent');
    if (!container || !anime) return;

    const j = anime._jikanRaw || {};
    let previousUrl = '../catalog/anime-4k.html';
    try {
        const stored = new URL(sessionStorage.getItem('previousUrl') || '', window.location.href);
        if (stored.origin === window.location.origin && !/anime\/view(?:-4k)?\.html/i.test(stored.pathname)) {
            previousUrl = `${stored.pathname}${stored.search}${stored.hash}`;
        }
    } catch (_) {
        /* use catalog fallback */
    }
    const posterUrl = reminkoSafeImageUrl(anime.posterUrl, '');
    const posterCssUrl = posterUrl ? reminkoSafeCssUrl(posterUrl) : '';
    const titleRu = anime.title || '—';
    const titleEn = anime.titleAlt || j.title_english || j.title || '';
    const titleJp = j.title_japanese || '';
    const type = anime.type || (j.type === 'Movie' ? 'Фильм' : 'Сериал');
    const duration = j.duration || '';
    const year = anime.year || j.year || '';
    const studios = anime.studio || (j.studios || []).map((s) => s.name).join(', ') || '—';
    const genres = anime.genres || [];
    const hasCustomDescription = !!(
        anime._4kRow?.description_ru != null && String(anime._4kRow.description_ru).trim()
    );
    const synopsis = hasCustomDescription
        ? String(anime._4kRow.description_ru).trim()
        : anime.description || j.synopsis || 'Описание появится позже.';
    const score = anime.rating != null && !Number.isNaN(Number(anime.rating)) ? Number(anime.rating).toFixed(1) : '—';
    const epLine = j.type === 'Movie' ? '1 / 1 (фильм)' : `${anime.episodes || '?'} эп.`;

    document.title = `${titleRu} — ≈4K | Re-Minko`;
    applyAnime4kViewSeo(anime);

    container.innerHTML = `
        <a href="${escape4kHtml(previousUrl)}" class="back-button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Назад
        </a>
        <div class="anime-detail anime-detail-shell anime-detail-shell--4k">
            <div class="anime4k-view-badge">≈4K каталог</div>
            <div class="anime-detail-main">
                <div class="anime-detail-poster" style="${posterCssUrl ? `background-image:url('${posterCssUrl}');background-size:cover;background-position:center;` : 'background:linear-gradient(135deg,#6c5ce7,#a29bfe);'}">
                    ${anime.status ? `<div class="anime-status anime-status--poster-pill">${escape4kHtml(anime.status)}</div>` : ''}
                </div>
                <div class="anime-detail-info">
                    <h1 class="anime-detail-title">${escape4kHtml(titleRu)}</h1>
                    ${titleEn && titleEn !== titleRu ? `<div class="anime-detail-alt-title" style="opacity:0.85">${escape4kHtml(titleEn)}</div>` : ''}
                    ${titleJp ? `<div class="anime-detail-alt-title">${escape4kHtml(titleJp)}</div>` : ''}
                    <div class="anime-detail-meta">
                        <span class="meta-item">📺 ${escape4kHtml(type)}</span>
                        <span class="meta-item">🎬 ${escape4kHtml(epLine)}</span>
                        ${duration ? `<span class="meta-item">⏱ ${escape4kHtml(duration)}</span>` : ''}
                        ${year ? `<span class="meta-item">📅 ${year}</span>` : ''}
                    </div>
                    <div class="anime-detail-statrow">
                        <div class="anime-stat-pill"><span class="anime-stat-pill__k">Оценка</span><span class="anime-stat-pill__v">★ ${score}</span></div>
                        <div class="anime-stat-pill"><span class="anime-stat-pill__k">Качество</span><span class="anime-stat-pill__v">≈4K Ultra</span></div>
                    </div>
                    <div class="anime-detail-studio">${escape4kHtml(studios)}</div>
                    ${genres.length ? `<div class="anime-detail-genres">${genres.map((g) => `<span class="genre-tag">${escape4kHtml(g)}</span>`).join('')}</div>` : ''}
                    <p class="anime-detail-description">${escape4kHtml(synopsis)}</p>
                </div>
            </div>
            <div class="anime-detail-section anime-inline-4k" id="anime4kPlayerSection">
                <h2 class="section-title anime-inline-4k__title">Смотреть</h2>
                <div class="anime-inline-4k__notice" role="note">
                    <p class="anime-inline-4k__notice-lead">
                        В плеере можно включить <strong>Anime4K</strong> — улучшение картинки в реальном времени поверх исходного видео.
                    </p>
                    <p class="anime-inline-4k__notice-warn">
                        <strong>Важно:</strong> после включения сайт, плеер и само устройство могут заметно потерять производительность — возможны лаги и подтормаживания.
                        Если уверены в мощности своего ПК или телефона — приятного просмотра. Сомневаетесь — смотрите без Anime4K, исходное качество уже высокое.
                    </p>
                </div>
                <div id="anime4kPlayerMount"></div>
            </div>
        </div>
    `;

    const mount = document.getElementById('anime4kPlayerMount');
    if (mount && typeof mountAnime4kPlayer === 'function') {
        mountAnime4kPlayer(mount, {
            title: titleRu,
            videoUrl: anime.videoUrl || ''
        });
    }

    if (typeof window.reminkoApplySidebarMaintenanceLocks === 'function') {
        window.reminkoApplySidebarMaintenanceLocks();
    }

    // Shikimori: дополнить русское название и описание
    if (anime.mal_id && window.shikimoriApi?.enqueueFetchShikimoriByMalId) {
        window.shikimoriApi
            .enqueueFetchShikimoriByMalId(anime.mal_id, titleEn || j.title || '')
            .then((sh) => {
                if (!sh) return;
                const looksRu = (s) => /[а-яёА-ЯЁ]/.test(String(s || ''));
                if (sh.russian) {
                    const h1 = document.querySelector('.anime-detail-title');
                    if (h1 && (!looksRu(h1.textContent) || h1.textContent === '—')) {
                        h1.textContent = sh.russian;
                        document.title = `${sh.russian} — ≈4K | Re-Minko`;
                    }
                }
                if (window.shikimoriApi?.stripHtml && sh.description_html && !hasCustomDescription) {
                    const lateDesc = window.shikimoriApi.stripHtml(sh.description_html).replace(/\s+/g, ' ').trim();
                    const de = document.querySelector('.anime-detail-description');
                    if (de && lateDesc && looksRu(lateDesc)) de.textContent = lateDesc;
                }
            })
            .catch(() => {});
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const loadingTimeout = setTimeout(() => {
        if (typeof hideLoading === 'function') hideLoading();
    }, 15000);

    try {
        if (typeof window.Anime4kCatalogStore?.load === 'function') {
            await window.Anime4kCatalogStore.load(true);
        }

        const urlParams = new URLSearchParams(window.location.search);
        let animeId = urlParams.get('id') || sessionStorage.getItem('viewAnime4kId');
        const idNum = parseInt(animeId, 10);

        // Старые неверные id → сборник 1-й фильм (62352 / site 22062352)
        if (idNum === 22059062 || idNum === 22057555) {
            window.location.replace(`${window.location.pathname}?id=22062352`);
            return;
        }

        if (Number.isNaN(idNum) || !window.Anime4kCatalogStore?.isAnime4kId(idNum)) {
            clearTimeout(loadingTimeout);
            document.getElementById('animeContent').innerHTML = `
                <div class="page-placeholder">
                    <h1>Тайтл не найден</h1>
                    <p>Это страница ≈4K каталога. Выберите аниме в <a href="../catalog/anime-4k.html">каталоге ≈4K</a>.</p>
                    <a href="../catalog/anime-4k.html" class="btn btn-primary">≈4K каталог</a>
                </div>`;
            if (typeof hideLoading === 'function') hideLoading();
            return;
        }

        sessionStorage.setItem('viewAnime4kId', String(idNum));
        let anime = typeof getAnime4kById === 'function' ? getAnime4kById(idNum) : null;

        if (!anime && typeof reminkoJikanFetch === 'function') {
            const mal = window.Anime4kCatalogStore.idToMal(idNum);
            try {
                const json = await reminkoJikanFetch(`https://api.jikan.moe/v4/anime/${mal}`);
                if (json?.data) {
                    anime = typeof rowToAnime4kCard === 'function'
                        ? rowToAnime4kCard({ mal_id: mal, jikan: json.data, title_ru: null, description_ru: null, video_url: null })
                        : null;
                }
            } catch (_) {}
        }

        if (!anime) {
            clearTimeout(loadingTimeout);
            document.getElementById('animeContent').innerHTML = `
                <div class="page-placeholder">
                    <h1>Аниме не найдено</h1>
                    <p>Тайтл отсутствует в ≈4K каталоге или ещё не опубликован.</p>
                    <a href="../catalog/anime-4k.html" class="btn btn-primary">В ≈4K каталог</a>
                </div>`;
            if (typeof hideLoading === 'function') hideLoading();
            return;
        }

        await renderAnime4kDetail(anime);
    } catch (e) {
        console.error('[view-4k]', e);
    } finally {
        clearTimeout(loadingTimeout);
        if (typeof hideLoading === 'function') hideLoading();
    }
});

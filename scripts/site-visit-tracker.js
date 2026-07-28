/**
 * Анонимная аналитика посещений для панели создателя (site_visit_events).
 * Дублирует путь с query; основной трекер — в supabase-config.js.
 */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;
    const pathname = window.location.pathname || '';
    if (pathname.includes('admin.html')) return;

    const VISITOR_KEY = 'reminko_visitor_id_v1';
    const DEDUP_MS = 8000;
    let lastSent = 0;
    let scheduled = false;

    function visitorId() {
        try {
            let id = localStorage.getItem(VISITOR_KEY);
            if (!id) {
                id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                localStorage.setItem(VISITOR_KEY, id);
            }
            return id;
        } catch (_) {
            return 'v_anon';
        }
    }

    function currentPath() {
        let path = String(window.location.pathname || '/') + String(window.location.search || '');
        try {
            const low = String(window.location.pathname || '').toLowerCase();
            const sp = new URLSearchParams(window.location.search || '');
            if (!sp.get('id')) {
                if (low.includes('/anime/view') || low.includes('view-4k')) {
                    const id = sessionStorage.getItem('viewAnimeId');
                    if (id) {
                        path =
                            String(window.location.pathname || '/anime/view.html') +
                            '?id=' +
                            encodeURIComponent(id);
                    }
                } else if (low.includes('/manga/view') || low.includes('/manga/reader')) {
                    const id =
                        sessionStorage.getItem('viewMangaId') ||
                        sessionStorage.getItem('mangaId');
                    if (id) {
                        path =
                            String(window.location.pathname || '/manga/view.html') +
                            '?id=' +
                            encodeURIComponent(id);
                    }
                }
            }
        } catch (_) {
            /* ignore */
        }
        return path.slice(0, 2048);
    }

    async function trackPageView() {
        if (window.__reminkoSiteVisitPageviewSent) return;
        const now = Date.now();
        if (now - lastSent < DEDUP_MS) return;
        lastSent = now;
        window.__reminkoSiteVisitPageviewSent = true;

        let accessToken = '';
        try {
            if (window.supabaseClient) {
                const { data } = await window.supabaseClient.auth.getSession();
                accessToken = data?.session?.access_token || '';
            }
        } catch (_) {}

        const row = {
            visitor_id: visitorId(),
            path: currentPath() || '/',
            page_title: document.title || '',
            referrer: document.referrer ? String(document.referrer).slice(0, 512) : null,
            event_kind: 'pageview'
        };

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
            await fetch('/.netlify/functions/site-visit-ingest', {
                method: 'POST',
                headers,
                body: JSON.stringify(row),
                keepalive: true,
                credentials: 'omit'
            });
        } catch (_) {
            /* аналитика не должна мешать странице */
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;

        const run = () => {
            void trackPageView();
        };

        if (typeof window.ReminkoBoot?.on === 'function') {
            window.ReminkoBoot.on('Idle', run);
            return;
        }

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(run, { timeout: 4000 });
        } else {
            setTimeout(run, 2000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', schedule);
    } else {
        schedule();
    }
})();

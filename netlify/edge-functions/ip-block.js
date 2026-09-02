/**
 * Edge IP deny: полный отрез статики + функций для IP из SECURITY_BLOCKED_IPS.
 * Формат env: "1.2.3.4,5.6.7.8" (через запятую/пробел/точку с запятой).
 * Пока список пуст — ничего не режет. Не добавляй сюда свой IP.
 *
 * SITE_CLOSED: любой путь, кроме заглушки, уходит на закрытую страницу.
 * Чтобы открыть сайт — поставь false (и в build-public.js / desktop-only-guard.js).
 */
const SITE_CLOSED = true;

const CLOSED_ALLOW = new Set([
  '/',
  '/index.html',
  '/404.html',
  '/site-closed.html',
  '/robots.txt',
  '/favicon.ico',
  '/scripts/desktop-only-guard.js',
  '/googled5f0682df83b4e0e.html',
  '/yandex_7826d5f9bd1db2e7.html'
]);

export default async (request, context) => {
  const raw = Deno.env.get('SECURITY_BLOCKED_IPS') || '';
  const blocked = new Set(
    raw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const ip = String(context.ip || '').trim();
  if (blocked.size && ip && blocked.has(ip)) {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }

  if (!SITE_CLOSED) return context.next();

  const url = new URL(request.url);
  if (CLOSED_ALLOW.has(url.pathname)) {
    const res = await context.next();
    const headers = new Headers(res.headers);
    headers.set('cache-control', 'no-store, no-cache, must-revalidate');
    if (url.pathname === '/' || url.pathname.endsWith('.html')) {
      headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
    }
    return new Response(res.body, { status: res.status, headers });
  }

  return Response.redirect(`${url.origin}/`, 302);
};

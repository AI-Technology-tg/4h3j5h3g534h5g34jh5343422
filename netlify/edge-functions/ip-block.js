/**
 * Edge IP deny: полный отрез статики + функций для IP из SECURITY_BLOCKED_IPS.
 * Формат env: "1.2.3.4,5.6.7.8" (через запятую/пробел/точку с запятой).
 * Пока список пуст — ничего не режет. Не добавляй сюда свой IP.
 */
export default async (request, context) => {
  const raw = Deno.env.get('SECURITY_BLOCKED_IPS') || '';
  const blocked = new Set(
    raw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  if (!blocked.size) return context.next();

  const ip = String(context.ip || '').trim();
  if (!ip || !blocked.has(ip)) return context.next();

  return new Response('Forbidden', {
    status: 403,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
};

/**
 * Генерация аватара через xAI (Grok) Images API + лимит 3 шт. / 24 ч на пользователя (Supabase).
 *
 * Env:
 *   XAI_API_KEY или GROK_API_KEY или MINKO_XAI_API_KEY
 *   XAI_IMAGE_MODEL (опц., по умолчанию grok-imagine-image — при ошибке укажите актуальную модель из кабинета xAI)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY — для валидации JWT пользователя
 *
 * POST JSON: { prompt: string }
 * Header: Authorization: Bearer <supabase_access_token>
 *
 * GET — квота: { limit, used, remaining, resetsAt }
 */
const XAI_URL = 'https://api.x.ai/v1/images/generations';
const LIMIT = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const { corsHeaders: buildCorsHeaders } = require('./_cors');
const {
    consumeRateLimit,
    fetchWithTimeout,
    getAuthenticatedUser,
    readJsonWithLimit,
    recordSecurityEvent,
    safeText,
    supabaseRequest
} = require('./_security');

const NSFW_RE =
    /(nude|naked|nsfw|porn|porno|sexual|xxx|erotic|fetish|hentai|loli|shota|rape|nudes?|nipple|genital|penis|vagina|boobs?|tits\b|\bnsfw\b)/i;
const NSFW_RU =
    /(порно|секс|эротик|голый|голая|голые|нюд|интим|фетиш|хентай|извращ|генитал|мастурб|камасутр|18\s*\+)/i;

function corsHeaders(event) {
    return buildCorsHeaders(event, 'GET, POST, OPTIONS', 'Content-Type, Authorization');
}

function ok(body, event) {
    return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify(body) };
}

function err(status, msg, event, extra) {
    return {
        statusCode: status,
        headers: corsHeaders(event),
        body: JSON.stringify({ error: { message: msg }, ...(extra || {}) })
    };
}

function getXaiKey() {
    return (
        process.env.XAI_API_KEY ||
        process.env.GROK_API_KEY ||
        process.env.MINKO_XAI_API_KEY ||
        ''
    ).trim();
}

function getImageModel() {
    return (process.env.XAI_IMAGE_MODEL || 'grok-imagine-image').trim();
}

async function avatarQuota(userId) {
    const rows = await supabaseRequest('/rest/v1/rpc/avatar_ai_generation_quota', {
        method: 'POST',
        body: JSON.stringify({
            p_user_id: userId,
            p_limit: LIMIT,
            p_window_hours: Math.round(WINDOW_MS / 3600000)
        })
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
        limit: LIMIT,
        used: Number(row?.used || 0),
        remaining: Number(row?.remaining || 0),
        resetsAt: row?.resets_at || null
    };
}

async function reserveGeneration(userId) {
    const rows = await supabaseRequest('/rest/v1/rpc/reserve_avatar_ai_generation', {
        method: 'POST',
        body: JSON.stringify({
            p_user_id: userId,
            p_limit: LIMIT,
            p_window_hours: Math.round(WINDOW_MS / 3600000)
        })
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
        allowed: row?.allowed === true,
        reservationId: row?.reservation_id || null,
        used: Number(row?.used || 0),
        remaining: Number(row?.remaining || 0),
        resetsAt: row?.resets_at || null
    };
}

async function finishGeneration(reservationId, success) {
    if (!reservationId) return;
    await supabaseRequest('/rest/v1/rpc/finish_avatar_ai_generation', {
        method: 'POST',
        body: JSON.stringify({
            p_reservation_id: reservationId,
            p_success: success === true
        })
    });
}

function buildPrompt(userLine) {
    const line = String(userLine || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400);
    return (
        'Square anime-style user avatar, bust-up portrait, clean illustration, bright anime art style, ' +
        'professional character design, soft shading, appealing colors. ' +
        'Strictly SFW: fully dressed, non-sexual, no nudity, no fetish, no minors in suggestive context. ' +
        'Single character focus, simple background. User description (interpret in anime style only): ' +
        line
    );
}

exports.handler = async (event) => {
    const headers = corsHeaders(event);
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const apiKey = getXaiKey();
    const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const user = await getAuthenticatedUser(event);
    if (!user || !user.id) {
        return err(401, 'Нужна авторизация: войдите в аккаунт и обновите страницу.', event);
    }

    if (!svc) {
        return err(503, 'На сервере не настроен SUPABASE_SERVICE_ROLE_KEY.', event);
    }

    if (event.httpMethod === 'GET') {
        try {
            return ok(await avatarQuota(user.id), event);
        } catch (_) {
            return err(503, 'Не удалось проверить квоту генераций.', event);
        }
    }

    if (event.httpMethod !== 'POST') {
        return err(404, 'Not found', event);
    }

    if (!apiKey) {
        return err(503, 'На сервере не задан XAI_API_KEY (или GROK_API_KEY).', event);
    }

    let body = event.body;
    if (event.isBase64Encoded && body) body = Buffer.from(body, 'base64').toString('utf8');
    if (Buffer.byteLength(body || '', 'utf8') > 8192) {
        return err(413, 'Запрос слишком большой.', event);
    }
    let json;
    try {
        json = JSON.parse(body || '{}');
    } catch {
        return err(400, 'Некорректный JSON', event);
    }

    const rawPrompt = (json.prompt != null ? String(json.prompt) : '').trim();
    if (rawPrompt.length < 4) {
        return err(400, 'Опиши образ чуть подробнее (от 4 символов).', event);
    }
    if (NSFW_RE.test(rawPrompt) || NSFW_RU.test(rawPrompt)) {
        await recordSecurityEvent(event, {
            eventType: 'api.avatar_prompt_blocked',
            severity: 'medium',
            source: 'netlify',
            actorUserId: user.id,
            targetType: 'avatar_generation',
            details: { reason: 'unsafe_prompt_pattern' }
        }).catch(() => {});
        return err(
            400,
            'Такой запрос недопустим. Только безопасный аниме-стиль, без сексуального и откровенного контента.',
            event
        );
    }

    const rate = await consumeRateLimit('api.avatar_generation', user.id, 10, 300).catch(() => ({
        allowed: false
    }));
    if (!rate.allowed) {
        return err(429, 'Слишком много запросов. Попробуйте через несколько минут.', event);
    }

    let reservation;
    try {
        reservation = await reserveGeneration(user.id);
    } catch (error) {
        console.error('[minko-avatar-grok] reserve failed', safeText(error?.message, 160));
        return err(503, 'Не удалось проверить квоту генераций.', event);
    }
    if (!reservation.allowed) {
        return err(
            429,
            `Лимит ${LIMIT} генераций на 24 часа исчерпан. Следующая попытка после сброса окна.`,
            event,
            { resetsAt: reservation.resetsAt, remaining: 0, limit: LIMIT }
        );
    }

    const prompt = buildPrompt(rawPrompt);

    let xaiRes;
    try {
        xaiRes = await fetchWithTimeout(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                model: getImageModel(),
                prompt,
                n: 1,
                response_format: 'b64_json'
            }),
            redirect: 'error'
        }, 30000);
    } catch (e) {
        await finishGeneration(reservation.reservationId, false).catch(() => {});
        console.error('[minko-avatar-grok] xai fetch', safeText(e?.message, 160));
        return err(502, 'Не удалось связаться с сервисом генерации изображений.', event);
    }

    let xaiData;
    try {
        xaiData = (await readJsonWithLimit(xaiRes, 5 * 1024 * 1024, 30000)) || {};
    } catch (error) {
        await finishGeneration(reservation.reservationId, false).catch(() => {});
        console.error('[minko-avatar-grok] invalid xai response', safeText(error?.message, 120));
        return err(502, 'Некорректный ответ сервиса генерации.', event);
    }
    if (!xaiRes.ok) {
        await finishGeneration(reservation.reservationId, false).catch(() => {});
        console.error(
            '[minko-avatar-grok] xai error',
            xaiRes.status,
            safeText(xaiData?.error?.code || xaiData?.code || '', 80)
        );
        return err(
            502,
            `Ошибка генерации (${xaiRes.status}). Попробуйте позже.`,
            event
        );
    }

    const item = xaiData.data && xaiData.data[0];
    let url = item && item.url;
    if (!url && item && item.b64_json) {
        if (item.b64_json.length > 4.5 * 1024 * 1024) {
            await finishGeneration(reservation.reservationId, false).catch(() => {});
            return err(502, 'Сгенерированное изображение слишком большое.', event);
        }
        url = 'data:image/png;base64,' + item.b64_json;
    }
    if (url && !/^https:\/\//i.test(url) && !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(url)) {
        url = '';
    }
    if (!url) {
        await finishGeneration(reservation.reservationId, false).catch(() => {});
        console.error('[minko-avatar-grok] unexpected empty response');
        return err(502, 'Пустой ответ картинки. Уточните модель в кабинете xAI.', event);
    }

    await finishGeneration(reservation.reservationId, true);
    const q2 = await avatarQuota(user.id);

    return ok({
        url,
        remaining: q2.remaining,
        limit: LIMIT,
        resetsAt: q2.resetsAt
    }, event);
};

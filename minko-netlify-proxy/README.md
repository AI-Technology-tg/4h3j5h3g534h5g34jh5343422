# Minko AI — прокси для Netlify

Отдельный мини-сайт: после деплоя на Netlify у вас будет **HTTPS** и маршрут **`POST /chat`**, как у локального прокси на порту **3334** (формат ответа тот же — `choices[0].message.content`).

**Быстрый старт:** откройте **`ДЕПЛОЙ-НЕТЛИФАЙ.md`** или запустите **`открыть-netlify-и-папку.bat`**. Ключи для функции лежат в **`.env`** (не коммитьте).

## Деплой

1. Зарегистрируйтесь на [Netlify](https://www.netlify.com/), «Add new site» → **Import an existing project** (Git) или перетащите папку **`minko-netlify-proxy`** (Deploy manually).
2. **Base directory** (если репозиторий целиком Re-Minko): укажите `4h3j5h3g534h5g34jh534/minko-netlify-proxy` или только `minko-netlify-proxy`, если сайт привязан к этой папке.
3. Build: для этой папки **команда сборки не обязательна**; Netlify подхватит `netlify.toml` (`publish = "public"`, `functions`).

## Переменные окружения (Site settings → Environment variables)

| Переменная | Нужна для |
|------------|-----------|
| **MINKO_FREE_API_KEY** | «Сонная Minko», бесплатный поток (как в локальном `.env`) |
| **KODIK_API_TOKEN** | Прокси Kodik (`/.netlify/functions/kodik-proxy`) — поиск плеера |
| **ALLOHA_API_TOKEN** | Прокси Alloha TV (`/.netlify/functions/alloha-proxy`) — второй плеер на странице аниме |
| **OPENAI_API_KEY** | Основной чат + **веб-поиск** (Responses API `web_search`, как ChatGPT) |
| **MINKO_OPENAI_WEB_SEARCH** | `1` (по умолчанию) — искать в интернете по аниме-вопросам; `0` — выключить |
| **MINKO_WEB_SEARCH_ANIME_DOMAINS** | `1` — только аниме-сайты; `0` (по умолчанию) — весь веб, тема «аниме» в промпте |
| **MINKO_OPENAI_MODEL** | Модель (по умолчанию `gpt-5.6`) |
| **XAI_API_KEY** | Grok, если Free API вернул мусор или ошибку |
| **SUPABASE_URL** | URL проекта Supabase (для «выключателя» чата и логов) |
| **SUPABASE_ANON_KEY** | anon key — функция читает `minko_ai_public_state` |
| **SUPABASE_SERVICE_ROLE_KEY** | **только на Netlify**, не в фронт — вставка строк в `minko_ai_server_logs` при ошибках |

Достаточно **хотя бы одного** из трёх ключей LLM; для полного поведения как локально — все три. Без Supabase функция чата работает как раньше, но **панель создателя не сможет удалённо отключать чат и собирать логи** — выполните `supabase/minko_ai_server.sql` и задайте три переменные Supabase.

## Связка с сайтом Re-Minko

В **`config.local.js`** (на хостинге основного сайта):

```js
window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.minkoChatProxy = 'https://ВАШ-ПОДДОМЕН.netlify.app/chat';
```

Страница **Minko AI** должна подключать `config.local.js` **перед** `scripts/config.js` (как в актуальной `minko-ai.html`).

Проверка «в сети» в чате делает **GET /** у вашего Netlify-домена — отдаётся `public/index.html` со статусом **200**.

## Ограничения по сравнению с локальным `minko-free-proxy.js`

- Нет **архива** диалогов в файл.
- Нет **POST /avatar** (квоты DALL·E) — при необходимости добавьте вторую функцию позже.
- Окно **«30 секунд после Free → Grok»** между разными пользователями/запросами **не хранится** (serverless): сначала вызывается Free API, при плохом ответе — Grok.
- Лимит времени функции на бесплатном Netlify — **10 с**; тяжёлые цепочки API могут не успеть (см. план Pro или укоротите промпты).

## Локальная проверка

```bash
cd minko-netlify-proxy
npm install
npx netlify dev
```

Временно подставьте `.env` в корне **minko-netlify-proxy** (Netlify CLI подхватывает его в `netlify dev`) или задайте переменные в Netlify UI.

См. **`.env.example`**.

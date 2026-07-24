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
| **OPENAI_API_KEY** | Ответ модели (факты — только из поиска, не «из памяти») |
| **SEARCHX_API_KEY** | **Основной бесплатный** поиск: [searchx.dev](https://searchx.dev) — до ~**3000/день** |
| **TAVILY_API_KEY** | Запасной: включается **только когда у SearchX кончился лимит** (429/402/403) |
| **UNSEARCH_API_KEY** | Опционально: [unsearch.dev](https://unsearch.dev) — ~5000/мес (если регистрация заработает) |
| **SERPAPI_API_KEY** | Платный Google — не нужен |
| **MINKO_SEARCH_FREE_FIRST** | `1` — доп. бесплатный scrape, пока SearchX в лимите |
| **MINKO_OPENAI_WEB_SEARCH** | `1` — запасной OpenAI `web_search` |
| **MINKO_WEB_SEARCH** | `1` — веб-поиск по аниме |
| **MINKO_OPENAI_MODEL** | Модель (по умолчанию `gpt-5.6`) |

### Логика чата (обязательная обвязка)

```
вопрос → аниме? → search (Tavily/SerpAPI) → источники → OpenAI отвечает ТОЛЬКО по источникам
              └─ не аниме → отказ / шутка
```

Без **TAVILY_API_KEY** (или SerpAPI) остаётся scrape/OpenAI web_search — хуже и нестабильнее. Для «как ChatGPT» добавьте Tavily в Netlify → Environment variables.
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

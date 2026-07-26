# PERFORMANCE STAGE 1 — Boot scheduling

**Branch:** `performance/boot-stage-1`  
**Date:** 2026-07-26  
**Constraint:** без смены UI / бизнес-логики / API / schema; `home.js` и `navigation.js` не трогались.

---

## Что изменил

### 1. BootManager (`ReminkoBoot`)
Новый файл `scripts/boot-manager.js` — только очередь стадий:

| Stage | Когда |
|---|---|
| Critical | сразу при загрузке скрипта |
| FirstPaint | после `reminko:navigation-applied` / DOMContentLoaded + double rAF |
| Interactive | после FirstPaint + `reminko:loading-screen-hidden` (fallback 2.5s) + rAF |
| Idle | `requestIdleCallback` после Interactive (timeout 3.5s) |

Подключён в `index.html` сразу после `logger.js`.

### 2. Единый Boot Promise для `getCurrentUser()`
Файл: `scripts/auth.js`

- Добавлен `currentUserInflight`
- Параллельные `getCurrentUser()` без `forceRefresh` ждут один Promise
- Логика профиля/кэша вынесена в `getCurrentUserUncached` без изменения поведения ответа
- `clearUserCache()` также сбрасывает inflight

### 3. NotificationService → Interactive
Файл: `scripts/notifications.js`

- `notificationService.init()` (load + realtime + DM inbox) перенесён на `ReminkoBoot.on('Interactive')`
- UI колокольчика в `navigation.js` **не менялся**
- Без BootManager — fallback на DOMContentLoaded (как раньше)

### 4. Friends polling → Idle
Файл: `scripts/friends.js`

- `startOnlineStatusTracking` при boot — на Idle
- `userLoggedIn` / `userLoggedOut` без задержки (UX входа)

### 5. Site tracker → Idle
Файл: `scripts/site-visit-tracker.js`

- `trackPageView` один раз на Idle
- Убран второй триггер `reminko:navigation-applied` (раньше дублировал с `load`, резался dedup 8s)

### 6. Support Chat → Idle
Файл: `scripts/apply-navigation.js`

- inject `support-minko-chat.js` через `ReminkoBoot.on('Idle')` (fallback — прежний rIC)

### 7. Live2D → после idle
Файл: `scripts/live2d-widget-init.js`

- Условия (window load + скрытие лоадера) те же
- `startLive2d()` вызывается через Idle / `requestIdleCallback`
- Модель/конфиг/поведение не менялись

### Не изменялось
- `home.js`, `navigation.js`
- Hero / Kodik Home render path
- Supabase schema / API
- Внешний вид

---

## Файлы

| Файл | Действие |
|---|---|
| `scripts/boot-manager.js` | **новый** |
| `scripts/auth.js` | single-flight `getCurrentUser` |
| `scripts/notifications.js` | init → Interactive |
| `scripts/friends.js` | polling boot → Idle |
| `scripts/site-visit-tracker.js` | track → Idle |
| `scripts/apply-navigation.js` | support chat → Idle |
| `scripts/live2d-widget-init.js` | start → Idle/rIC |
| `index.html` | script BootManager + cache-busters |
| `PERFORMANCE_STAGE1.md` | этот отчёт |

---

## Функции

| Функция | Изменение |
|---|---|
| `ReminkoBoot.on/start` | новые |
| `getCurrentUser` | sharing Promise |
| `getCurrentUserUncached` | новая обёртка тела |
| `clearUserCache` | +reset inflight |
| `NotificationService.init` | момент вызова |
| `FriendsService.startOnlineStatusTracking` | момент boot-вызова |
| `trackPageView` | момент вызова |
| `injectSupportMinkoChatScript` / `doInject` | момент inject |
| `startLive2d` / `startLive2dWhenIdle` | момент старта |

---

## Проверка (статическая + синтаксис)

Выполнено локально:

- `node --check` всех изменённых JS — OK
- `home.js` / `navigation.js` — diff отсутствует
- Fallback-пути без `ReminkoBoot` сохранены

Ручной smoke в браузере (нужен прогон на ветке):

| Сценарий | Ожидание |
|---|---|
| Авторизация / регистрация / OAuth | без изменений логики |
| Уведомления + realtime | init чуть позже first paint, логика та же |
| Друзья / last_online polling | старт на Idle; после login — сразу |
| Сообщения | DM inbox в `init()` на Interactive |
| История / избранное | не трогались |
| Hero / Kodik Home | `home.js`/`kodik-home.js` не трогались |
| Live2D | позже (idle), поведение то же |
| Console | не должно быть новых ошибок BootManager |

---

## Риски (остаточные, принятые)

1. **Бейдж уведомлений** может появиться на 0.5–2.5s позже first paint (Interactive). Данные/realtime те же.  
2. **Site visit** больше не шлётся отдельно на `reminko:navigation-applied` — один idle pageview (dedup и так схлопывал дубли).  
3. **BootManager пока только в `index.html`**. Другие страницы используют fallback (старое время init) — риск расхождения timing между страницами, не поломки.  
4. **Live2D** стартует позже idle — кратковременное отсутствие виджета после лоадера (ожидаемо).  
5. **forceRefresh=true** у `getCurrentUser` по-прежнему не шарит inflight (как и задумано).

Ни один из рисков не выглядит как изменение бизнес-логики; изменения не откатывались.

---

## Что осталось (следующие этапы)

- Подключить `boot-manager.js` на остальные HTML (catalog/profile/…) для единого timing  
- Stage 2: дедуп Hero hydrate / favorites–history повторных fetch (без правок архитектуры)  
- Stage 3: reflow карусели / batch DOM (осторожно, может затронуть `home.js`)  
- Не грузить полный `kodik-anime-catalog.json` по accidental path  
- Отложить `ensureModalsExist` heavy HTML (потребует касания `navigation.js` — вне Stage 1)

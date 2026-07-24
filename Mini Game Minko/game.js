/* ═══════════════════════════════════════════════════════════════
   Re:Wake Minko — Коридор Проклятого Особняка
   ─────────────────────────────────────────────────────────────
   Длинный коридор. Ловушки-плиты: наступил → кровь по бокам + видео «смерть N» → респawn героя.
   3 двери: рычаг, последовательность печатей, ключ.
   Чекпоинты после каждой двери. Игрок запоминает безопасный путь.
   Плюс рандомные хоррор-события:
   шёпоты, джампскеры, потухание свечей, капли крови, мерцание.
   Финал: диалог с Минко + проклятие Руки Ведьмы за попытку
   рассказать о Возвращении Смертью. Два таких триггера — полный
   сброс + рандомная перегенерация уровня.
   ═══════════════════════════════════════════════════════════════ */

(() => {
    'use strict';

    // ══════════════════════════════════════════════════════
    // ░░░ 1. CANVAS & UI ░░░
    // ══════════════════════════════════════════════════════
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const CANVAS_W = canvas.width;
    const CANVAS_H = canvas.height;
    const gameWrap = document.querySelector('.game-wrap');

    const loopCountEl = document.getElementById('loopCount');
    const deathCountEl = document.getElementById('deathCount');
    const statusEl = document.getElementById('statusText');
    const deathScreen = document.getElementById('deathScreen');
    const deathCaption = document.getElementById('deathCaption');
    const victoryScreen = document.getElementById('victoryScreen');
    const victoryStats = document.getElementById('victoryStats');
    const victoryText = document.getElementById('victoryText');
    const startScreen = document.getElementById('startScreen');
    const startBtn = document.getElementById('startBtn');
    const playAgainBtn = document.getElementById('playAgainBtn');
    // Диалог с Минко + эффект «Рука Ведьмы»
    const minkoDialog = document.getElementById('minkoDialog');
    const minkoText = document.getElementById('minkoText');
    const minkoAnswer = document.getElementById('minkoAnswer');
    const minkoSubmit = document.getElementById('minkoSubmit');
    const minkoHint = document.getElementById('minkoHint');
    const minkoVideo = document.getElementById('minkoVideo');
    const witchHand = document.getElementById('witchHand');
    const witchHeart = document.getElementById('witchHeart');
    const witchHandClaw = document.getElementById('witchHandClaw');
    const witchHandBack = document.getElementById('witchHandBack');
    const witchWhispers = document.getElementById('witchWhispers');
    const witchLove = document.getElementById('witchLove');

    // Видео-аватар всегда без звука, играет на loop
    if (minkoVideo) {
        minkoVideo.muted = true;
        minkoVideo.volume = 0;
    }

    /** Те же файлы, что на вкладке Minko AI: путь от каталога игры (`../Fons/`). Версия в query — сброс кэша старого постера/видео. */
    function reminkoMinkoAiMediaUrl(filename) {
        const base = new URL('../Fons/', window.location.href);
        const u = new URL(filename, base);
        u.searchParams.set('v', '3');
        return u.href;
    }

    function applyMinkoDialogVideoSources() {
        const v = document.getElementById('minkoVideo');
        if (!v) return;
        v.setAttribute('poster', reminkoMinkoAiMediaUrl('AI%20ICON.jpg'));
        v.innerHTML = '';
        const sMp4 = document.createElement('source');
        sMp4.src = reminkoMinkoAiMediaUrl('AI%20ICON.mp4');
        sMp4.type = 'video/mp4';
        v.appendChild(sMp4);
        const sWebm = document.createElement('source');
        sWebm.src = reminkoMinkoAiMediaUrl('AI%20ICON.webm');
        sWebm.type = 'video/webm';
        v.appendChild(sWebm);
        try {
            v.load();
        } catch (_) {
            /* noop */
        }
    }
    applyMinkoDialogVideoSources();

    function playMinkoVideo() {
        if (!minkoVideo) return;
        try {
            minkoVideo.muted = true;
            minkoVideo.currentTime = 0;
            const p = minkoVideo.play();
            if (p && p.catch) p.catch(() => {});
        } catch (_) { /* noop */ }
    }

    function stopMinkoVideo() {
        if (!minkoVideo) return;
        try {
            minkoVideo.pause();
            minkoVideo.currentTime = 0;
        } catch (_) { /* noop */ }
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 2. АУДИО ░░░
    // ══════════════════════════════════════════════════════
    const bgMusic = document.getElementById('bgMusic');
    const deathSfx = document.getElementById('deathSfx');
    const witchSfx = document.getElementById('witchSfx');
    const iLoveYouSfx = document.getElementById('iLoveYouSfx');
    const BG_VOLUME = 0.35;
    const DEATH_VOLUME = 0.7;
    const WITCH_VOLUME = 0.6;       // «Serdze» — на 2-м страйке
    const I_LOVE_YOU_VOLUME = 0.55; // «I love you» — на 1-м страйке
    bgMusic.volume = BG_VOLUME;
    deathSfx.volume = DEATH_VOLUME;
    witchSfx.volume = WITCH_VOLUME;
    if (iLoveYouSfx) iLoveYouSfx.volume = I_LOVE_YOU_VOLUME;

    // Звук теперь без кнопки mute — всегда играет (громкость управляется fadeMusic)

    function fadeMusic(targetVolume, durationMs = 400) {
        const startVol = bgMusic.volume;
        const diff = targetVolume - startVol;
        const startTime = performance.now();
        function step() {
            const t = Math.min(1, (performance.now() - startTime) / durationMs);
            bgMusic.volume = Math.max(0, startVol + diff * t);
            if (t < 1) requestAnimationFrame(step);
            else if (targetVolume === 0) bgMusic.pause();
        }
        if (targetVolume > 0 && bgMusic.paused) {
            bgMusic.volume = 0;
            const p = bgMusic.play();
            if (p && p.catch) p.catch(() => {});
        }
        requestAnimationFrame(step);
    }

    function startBgMusic() {
        bgMusic.volume = 0;
        bgMusic.currentTime = 0;
        const p = bgMusic.play();
        if (p && p.catch) p.catch(() => {});
        fadeMusic(BG_VOLUME, 600);
    }

    function playDeathSfx() {
        try {
            deathSfx.currentTime = 0;
            const p = deathSfx.play();
            if (p && p.catch) p.catch(() => {});
        } catch (_) { /* noop */ }
    }

    function fadeAudioOut(audioEl, ms) {
        const start = audioEl.volume;
        const t0 = performance.now();
        function step() {
            const t = Math.min(1, (performance.now() - t0) / ms);
            audioEl.volume = Math.max(0, start * (1 - t));
            if (t < 1) requestAnimationFrame(step);
            else { audioEl.pause(); audioEl.volume = start; }
        }
        requestAnimationFrame(step);
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 3. КОНСТАНТЫ МИРА ░░░
    // ══════════════════════════════════════════════════════
    const TILE = 60;
    const GRID_W = 12;
    const GRID_H = 80;             // УДВОЕНО — длинный-длинный коридор
    const WORLD_W = TILE * GRID_W; // 720
    const WORLD_H = TILE * GRID_H; // 4800

    // Типы тайлов
    const T = {
        WALL:       'W',
        FLOOR:      '.',
        PIT:        'P',  // яма с шипами
        DAGGERS:    'D',  // кинжалы из стен
        BLOCK:      'F',  // падающий блок с потолка (Fall)
        GAS:        'Q',  // ядовитый газ (3×3)
        HAND:       'H',  // теневая рука из пола
        FIRE:       'J',  // огненный гейзер из пола
        SPIN:       'I',  // вращающийся клинок с потолка
        DOOR_LEVER: 'X',  // дверь, открываемая рычагом
        DOOR_SEQ:   'Y',  // дверь, открываемая последовательностью печатей
        DOOR_KEY:   'Z',  // дверь, открываемая ключом
        LEVER:      'L',
        KEY:        'K',
        SEQ1:       '1',
        SEQ2:       '2',
        SEQ3:       '3',
        SECRET:     'N',  // (legacy)
        BOOK:       'B',  // Стол с книгой — триггер квиза-сцены
        START:      'S',
        GOAL:       'G',
    };

    const TRAP_TYPES = new Set([T.PIT, T.DAGGERS, T.BLOCK, T.GAS, T.HAND, T.FIRE, T.SPIN]);

    // ══════════════════════════════════════════════════════
    // ░░░ 4. ДЕФОЛТНЫЙ УРОВЕНЬ (80 рядов — в 2 раза длиннее) ░░░
    // ══════════════════════════════════════════════════════
    const DEFAULT_LEVEL_DEF = [
        //          0         1
        //          0123456789012 (cols 0-11)
        /*  0 */ 'WWWWWWWWWWWW', // верхняя стена
        /*  1 */ 'WW....G...WW', // Минко (цель)
        /*  2 */ 'WW........WW',
        /*  3 */ 'WWH...H..DWW', // чуть реже ловушки, чем в ранних билдах
        /*  4 */ 'WWD.F..Q..WW',
        /*  5 */ 'WW.H..P..FWW',
        /*  6 */ 'WW.H.P...FWW',
        /*  7 */ 'WWP...D..PWW',
        /*  8 */ 'WW.PH...D.WW',
        /*  9 */ 'WWQ.D..H..WW',
        /* 10 */ 'WWH.FD....WW',
        /* 11 */ 'WW.QD...H.WW',
        /* 12 */ 'WW........WW',
        /* 13 */ 'WWZZZZZZZZWW', // ДВЕРЬ 3 (ключ)
        /* 14 */ 'WW........WW',
        /* 15 */ 'WW.HJ.P...WW',  // чуть легче, чем раньше
        /* 16 */ 'WW.PD..I..WW',
        /* 17 */ 'WWD.H..P..WW',
        /* 18 */ 'WWQ..IP...WW',
        /* 19 */ 'WW.HD.Q...WW',
        /* 20 */ 'WWD.J..H..WW',
        /* 21 */ 'WW.Q..I...WW',
        /* 22 */ 'WWH..F....WW',
        /* 23 */ 'WW........WW',
        /* 24 */ 'WW...K....WW', // КЛЮЧ
        /* 25 */ 'WW........WW',
        /* 26 */ 'WWDP.F....WW',
        /* 27 */ 'WW.D.HP...WW',
        /* 28 */ 'WWH..P....WW',
        /* 29 */ 'WW.Q...D..WW',
        /* 30 */ 'WWF..H....WW',
        /* 31 */ 'WW.PD.....WW',
        /* 32 */ 'WW........WW',
        /* 33 */ 'WW........WW',
        /* 34 */ 'WWYYYYYYYYWW', // ДВЕРЬ 2 (печати)
        /* 35 */ 'WW........WW',
        /* 36 */ 'WW......3.WW', // ПЕЧАТЬ 3
        /* 37 */ 'WW.HD.P...WW',
        /* 38 */ 'WWQ.J..F..WW',
        /* 39 */ 'WWD..HP...WW',
        /* 40 */ 'WW....2...WW', // ПЕЧАТЬ 2
        /* 41 */ 'WWJ.P....FWW',
        /* 42 */ 'WW.H.IQ...WW',
        /* 43 */ 'WWP..F....WW',
        /* 44 */ 'WW..1.....WW', // ПЕЧАТЬ 1
        /* 45 */ 'WWQ..H....WW',
        /* 46 */ 'WW.DF.P...WW',
        /* 47 */ 'WWF..D....WW',
        /* 48 */ 'WWP.HQ....WW',
        /* 49 */ 'WW........WW',
        /* 50 */ 'WW........WW',
        /* 51 */ 'WWXXXXXXXXWW', // ДВЕРЬ 1 (рычаг)
        /* 52 */ 'WW........WW',
        /* 53 */ 'WW.P..P...WW',
        /* 54 */ 'WWD.D...D.WW',
        /* 55 */ 'WW..HQ....WW',
        /* 56 */ 'WWP.D.....WW',
        /* 57 */ 'WW..F.Q...WW',
        /* 58 */ 'WWD..H.P..WW',
        /* 59 */ 'WW.Q.DH...WW',
        /* 60 */ 'WWP..DH...WW',
        /* 61 */ 'WW.H..F...WW',
        /* 62 */ 'WWD.P.Q...WW',
        /* 63 */ 'WW........WW',
        /* 64 */ 'WW.........L', // РЫЧАГ в алькове (col 11)
        /* 65 */ 'WW........WW',
        /* 66 */ 'WW.P..P...WW',
        /* 67 */ 'WWD.D...D.WW',
        /* 68 */ 'WW.H.D...HWW', // старт, ловушек меньше
        /* 69 */ 'WW..F..D..WW',
        /* 70 */ 'WWP..Q....WW',
        /* 71 */ 'WW.D.P....WW',
        /* 72 */ 'WWH..F....WW',
        /* 73 */ 'WW.P.H....WW',
        /* 74 */ 'WWF..P....WW',
        /* 75 */ 'WW.QH.D...WW',
        /* 76 */ 'WWD...F...WW',
        /* 77 */ 'WW........WW',
        /* 78 */ 'WW...S....WW', // СТАРТ
        /* 79 */ 'WWWWWWWWWWWW',
    ];

    let LEVEL_DEF = DEFAULT_LEVEL_DEF.slice();

    /** Рандомный уровень (после проклятия Ведьмы). Структура аналогичная default,
     *  но трапы и позиции — рандомные. */
    /**
     * BFS-проверка проходимости коридора по 4 направлениям.
     * Игнорирует двери (они откроются по ходу игры) — считаем их проходимыми.
     * Стартует от стартовой позиции и пытается дойти до Минко.
     */
    function validateLevelPath(rows) {
        const H = rows.length;
        const W = rows[0] ? rows[0].length : 0;
        if (H < 4 || W < 4) return false;

        // Найти старт (S) и цель (G)
        let startR = -1, startC = -1, goalR = -1, goalC = -1;
        for (let r = 0; r < H; r++) {
            for (let c = 0; c < W; c++) {
                const ch = rows[r][c];
                if (ch === 'S') { startR = r; startC = c; }
                if (ch === 'G') { goalR = r; goalC = c; }
            }
        }
        if (startR < 0 || goalR < 0) return false;

        const TRAPS = new Set(['P', 'D', 'F', 'Q', 'H', 'J', 'I']);
        const isPassable = (r, c) => {
            if (r < 0 || r >= H || c < 0 || c >= W) return false;
            const t = rows[r][c];
            if (t === 'W') return false;
            if (TRAPS.has(t)) return false;
            return true;
        };

        const visited = Array.from({ length: H }, () => new Array(W).fill(false));
        const queue = [[startR, startC]];
        visited[startR][startC] = true;
        const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        while (queue.length) {
            const [r, c] = queue.shift();
            if (r === goalR && c === goalC) return true;
            for (const [dr, dc] of DIRS) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < H && nc >= 0 && nc < W && !visited[nr][nc] && isPassable(nr, nc)) {
                    visited[nr][nc] = true;
                    queue.push([nr, nc]);
                }
            }
        }
        return false;
    }

    /**
     * «Чинит» уровень, пробивая гарантированный путь сверху вниз.
     * Идём от Минко (row 1) к старту (row 78). На каждой паре рядов гарантируем
     * вертикальный или 4-связный путь — убираем ловушки если нужно.
     */
    function fixLevelPath(rows) {
        const H = rows.length;
        const W = rows[0].length;
        const TRAPS = new Set(['P', 'D', 'F', 'Q', 'H', 'J', 'I']);
        const STRUCT = new Set(['W', 'X', 'Y', 'Z', 'L', 'K', '1', '2', '3', 'B', 'S', 'G']);

        // Найти стартовую колонку (где S)
        let startCol = 5;
        for (let r = H - 1; r >= 0; r--) {
            const idx = rows[r].indexOf('S');
            if (idx >= 0) { startCol = idx; break; }
        }

        // «Идём» по змейке от старта к цели, прокладывая гарантированный путь
        let curCol = startCol;
        for (let r = H - 2; r >= 1; r--) {
            // На текущем ряду пытаемся остаться в curCol или сдвинуться на ±1
            const candidates = [curCol, curCol - 1, curCol + 1, curCol - 2, curCol + 2];
            let chosen = -1;
            for (const c of candidates) {
                if (c < 1 || c >= W - 1) continue;
                const ch = rows[r][c];
                if (STRUCT.has(ch)) { chosen = c; break; } // структура — точно проходима
                if (!TRAPS.has(ch) && ch !== 'W') { chosen = c; break; }
            }
            // Если ни один кандидат не подошёл — пробьём ловушку в curCol
            if (chosen < 0) {
                const c = Math.max(2, Math.min(W - 3, curCol));
                const arr = rows[r].split('');
                if (TRAPS.has(arr[c])) arr[c] = '.';
                rows[r] = arr.join('');
                chosen = c;
            } else if (TRAPS.has(rows[r][chosen])) {
                // Кандидат был «выбран», но это ловушка — очистим
                const arr = rows[r].split('');
                arr[chosen] = '.';
                rows[r] = arr.join('');
            }
            curCol = chosen;
        }
        return rows;
    }

    /** Генерирует уровень и гарантирует проходимость (с ретраями + фолбэком). */
    function generateRandomLevelSafe() {
        for (let attempt = 0; attempt < 80; attempt++) {
            const rows = generateRandomLevel();
            ensureEveryRowHasFreeCol(rows);
            if (validateLevelPath(rows)) return rows;
        }
        const rows = generateRandomLevel();
        ensureEveryRowHasFreeCol(rows);
        const fixed = fixLevelPath(rows);
        ensureEveryRowHasFreeCol(fixed);
        return validateLevelPath(fixed) ? fixed : rows;
    }

    /**
     * Финальная страховка: в КАЖДОМ ряду между cols 2..9 ОБЯЗАТЕЛЬНО хотя бы 1
     * проходимая клетка. Если по какой-то причине весь ряд забит ловушками —
     * принудительно открываем центральную колонку.
     */
    function ensureEveryRowHasFreeCol(rows) {
        const TRAPS = new Set(['P', 'D', 'F', 'Q', 'H', 'J', 'I']);
        const STRUCT_OK = new Set(['.', 'X', 'Y', 'Z', 'L', 'K', '1', '2', '3', 'B', 'S', 'G']);
        for (let r = 0; r < rows.length; r++) {
            // Ряды-стены целиком пропускаем (верх/низ)
            if (rows[r] === 'WWWWWWWWWWWW') continue;
            let hasFree = false;
            for (let c = 2; c <= 9; c++) {
                const ch = rows[r][c];
                if (STRUCT_OK.has(ch) && !TRAPS.has(ch)) { hasFree = true; break; }
            }
            if (!hasFree) {
                // Открываем центральную колонку (5)
                const arr = rows[r].split('');
                arr[5] = '.';
                rows[r] = arr.join('');
            }
        }
    }

    function generateRandomLevel() {
        // Рандомные позиции печатей (col 2..9)
        const seqCols = [];
        while (seqCols.length < 3) {
            const c = 2 + Math.floor(Math.random() * 8);
            if (!seqCols.includes(c)) seqCols.push(c);
        }
        // Рандомные ряды для печатей (между книгой 1 на r50 и дверью 2 на r34)
        const seqRowsPool = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48];
        for (let i = seqRowsPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [seqRowsPool[i], seqRowsPool[j]] = [seqRowsPool[j], seqRowsPool[i]];
        }
        const seqRows = seqRowsPool.slice(0, 3).sort((a, b) => b - a);
        const seqNums = [1, 2, 3];
        for (let i = seqNums.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [seqNums[i], seqNums[j]] = [seqNums[j], seqNums[i]];
        }

        // Фиксированные «структурные» ряды (двери, начало, книги и т.д.) — 80 рядов
        const FIXED = {
            0:  'WWWWWWWWWWWW',
            1:  'WW....G...WW',
            12: 'WW...B....WW',
            13: 'WWZZZZZZZZWW',
            24: 'WW...K....WW',
            33: 'WW....B...WW',
            34: 'WWYYYYYYYYWW',
            50: 'WW....B...WW',
            51: 'WWXXXXXXXXWW',
            64: 'WW.........L',
            78: 'WW...S....WW',
            79: 'WWWWWWWWWWWW',
        };
        const SAFE_ROWS = new Set([2, 14, 23, 25, 32, 35, 49, 52, 63, 65, 77]);

        // ═══════════════════════════════════════════════════════
        // ГАРАНТИРОВАННАЯ ВЕРТИКАЛЬНАЯ ТРОПА (safeCol)
        // safeCol медленно дрейфует между рядами на ±1, никогда не прерываясь.
        // В каждом ряду эта колонка (и при дрейфе — ещё старая/новая) ВСЕГДА проходима.
        // ═══════════════════════════════════════════════════════
        const safeCol = new Array(80);
        let c = 4 + Math.floor(Math.random() * 4); // начальная колонка 4..7
        let stableFor = 2 + Math.floor(Math.random() * 4);
        for (let r = 79; r >= 0; r--) {
            safeCol[r] = c;
            stableFor--;
            if (stableFor <= 0) {
                // Сдвигаем на -1/0/+1, но держимся в диапазоне 3..8
                const delta = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
                c = Math.max(3, Math.min(8, c + delta));
                stableFor = 2 + Math.floor(Math.random() * 4);
            }
        }

        const rows = [];
        for (let r = 0; r < 80; r++) {
            if (FIXED[r]) { rows.push(FIXED[r]); continue; }
            if (SAFE_ROWS.has(r)) { rows.push('WW........WW'); continue; }
            const seqIdx = seqRows.indexOf(r);
            if (seqIdx !== -1) {
                const chars = 'WW........WW'.split('');
                chars[seqCols[seqIdx]] = String(seqNums[seqIdx]);
                rows.push(chars.join('')); continue;
            }
            // Ряд ловушек — но с гарантированным проходом в safeCol
            const myCol  = safeCol[r];
            const prevCol = (r > 0)  ? safeCol[r - 1] : myCol;
            const nextCol = (r < 79) ? safeCol[r + 1] : myCol;
            rows.push(randomTrapRowSafe(myCol, prevCol, nextCol));
        }
        // Страховка: на «безопасной» колонке никогда не оставляем символ ловушки
        // (иначе бывает ряд с одной дыркой, а впереди — тупик по вертикали).
        const TR = new Set(['P', 'D', 'F', 'Q', 'H', 'J', 'I']);
        for (let r = 0; r < 80; r++) {
            const c = safeCol[r];
            if (c < 2 || c > 9) continue;
            const row = rows[r];
            if (!row || row.length < 10) continue;
            const ch = row[c];
            if (TR.has(ch)) {
                const arr = row.split('');
                arr[c] = '.';
                rows[r] = arr.join('');
            }
        }
        return rows;
    }

    /**
     * Создаёт ряд с ловушками, но ОБЯЗАТЕЛЬНО оставляет walkable колонки, через которые
     * можно пройти вертикально (safeCol текущего ряда) и соединиться со смежными рядами
     * (если соседние safeCol отличаются — пробиваем «мостик»).
     */
    function randomTrapRowSafe(myCol, prevCol, nextCol) {
        const chars = 'WW........WW'.split('');
        // Без газа 3×3 — чаще всего он и создавал «одна плитка и сразу ад дальше»
        const trapPool = [T.PIT, T.DAGGERS, T.BLOCK, T.HAND, T.FIRE, T.SPIN];

        // Колонки, которые ОБЯЗАНЫ остаться walkable:
        const forbidden = new Set([myCol]);
        // Если safeCol дрейфует — оставляем мостик
        if (prevCol !== myCol) {
            for (let x = Math.min(prevCol, myCol); x <= Math.max(prevCol, myCol); x++) forbidden.add(x);
        }
        if (nextCol !== myCol) {
            for (let x = Math.min(nextCol, myCol); x <= Math.max(nextCol, myCol); x++) forbidden.add(x);
        }

        // Список доступных для ловушек колонок
        const available = [];
        for (let col = 2; col <= 9; col++) if (!forbidden.has(col)) available.push(col);
        // Тасуем
        for (let i = available.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
        }

        // 1–2 ловушки в ряду (раньше было 3–4) + зазор между ними
        const targetCount = 1 + Math.floor(Math.random() * 2);
        let placed = 0;
        const placedCols = [];
        for (const col of available) {
            if (placed >= targetCount) break;
            // Минимум 2 клетки от других ловушек (чтобы не залипал игрок в «коробочке»)
            if (placedCols.some((p) => Math.abs(p - col) < 2)) continue;
            chars[col] = trapPool[Math.floor(Math.random() * trapPool.length)];
            placedCols.push(col);
            placed++;
        }
        return chars.join('');
    }

    // Старая версия оставлена как legacy-фолбэк (на случай, если нужно где-то), но не используется
    function randomTrapRow() { return randomTrapRowSafe(5, 5, 5); }

    // ══════════════════════════════════════════════════════
    // ░░░ 5. СОСТОЯНИЕ ИГРЫ ░░░
    // ══════════════════════════════════════════════════════
    const GameState = { MENU: 'menu', PLAYING: 'playing', DEAD: 'dead', WON: 'won', SECRET_REVEAL: 'secret_reveal' };
    let state = GameState.MENU;

    // Offscreen canvas для эффекта темноты
    const lightCanvas = document.createElement('canvas');
    lightCanvas.width = CANVAS_W;
    lightCanvas.height = CANVAS_H;
    const lightCtx = lightCanvas.getContext('2d');

    // Физические объекты на полу (кости/черепа — можно пинать)
    const bones = [];

    // Лужи крови (визуал)
    const bloodPuddles = [];

    // Падающая пыль / щебень с потолка (ambient particles)
    const dustParticles = []; // [{x, y, vy, life, maxLife, size}]
    let nextDustTime = 0;

    let loop = 1;
    let deaths = 0;
    let witchStrikes = 0;
    let witchActive = false;

    let tiles = [];          // 2D массив символов (клон LEVEL_DEF)
    /** Ряды со столами «B»: по убыванию индекса = порядок квестов при движении снизу вверх */
    let bookRowsByQuestOrder = [];
    let door1Open = false;
    let door2Open = false;
    let door3Open = false;
    let leverPulled = false;
    let hasKey = false;
    let seqProgress = 0;     // 0..3

    // Позиция спавна (всегда начало — чекпоинтов нет)
    let defaultSpawnX = 0, defaultSpawnY = 0;
    let spawnX = 0, spawnY = 0;

    // Эффект смерти (рисуется пока активен DEAD state)
    let deathEffect = null; // { type, startTime, x, y, col, row }

    // Декор стен
    let wallDecor = [];

    // Потухшие свечи (torch outage)
    const torchOutages = new Map(); // key = "row:side" → untilMs

    // Джампскер-эффекты
    let jumpscareUntil = 0;
    let flickerUntil = 0;
    let screenShakeUntil = 0;

    // Чит-код: показать все ловушки. КОД ЦИКЛИТСЯ — каждое использование меняет код на следующий.
    let revealTrapsUntil = 0;
    const cheatBuffer = [];
    const CHEAT_CODES = [
        ['W', 'A', 'S', 'D', 'D', 'S', 'A', 'W'], // 1-е применение: WASDDSAW
        ['D', 'S', 'A', 'W', 'W', 'A', 'S', 'D'], // 2-е применение: DSAWWASD
        ['W', 'S', 'D', 'A', 'W', 'S', 'A', 'D'], // 3-е применение: WSDAWSAD
    ];
    let cheatCodeIndex = 0;
    function currentCheatCode() { return CHEAT_CODES[cheatCodeIndex % CHEAT_CODES.length]; }

    // Таймеры для рандомных событий
    let nextEventTimes = {
        whisper: 5000,
        jumpscare: 20000,
        torchOut: 15000,
        bloodDrip: 8000,
        flicker: 18000,
        shadowRun: 25000,
        randomQuiz: 45000, // первый рандомный квиз не раньше 45 сек
    };

    // ══════════════════════════════════════════════════════
    // ░░░ 6. СУБАРУ И МИНКО ░░░
    // ══════════════════════════════════════════════════════
    const subaru = {
        x: 0, y: 0,
        r: 14,
        speed: 200,
        alive: true,
        blink: 0,
        facing: -1,
        walkCycle: 0,
    };

    const minko = { x: 0, y: 0, r: 26, wake: 0 };

    // ══════════════════════════════════════════════════════
    // ░░░ 7. КАМЕРА ░░░
    // ══════════════════════════════════════════════════════
    let camY = 0;
    let camTargetY = 0;

    function updateCamera(dt) {
        camTargetY = subaru.y - CANVAS_H / 2;
        camTargetY = Math.max(0, Math.min(WORLD_H - CANVAS_H, camTargetY));
        camY += (camTargetY - camY) * Math.min(1, 6 * dt);
    }

    function snapCameraToSubaru() {
        camTargetY = subaru.y - CANVAS_H / 2;
        camTargetY = Math.max(0, Math.min(WORLD_H - CANVAS_H, camTargetY));
        camY = camTargetY;
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 8. ВВОД ░░░
    // ══════════════════════════════════════════════════════
    const keys = new Set();

    /** Проверка: фокус сейчас в текстовом поле/input? */
    function isTypingInInput() {
        const el = document.activeElement;
        if (!el) return false;
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    window.addEventListener('keydown', (e) => {
        // Если игрок печатает в поле ввода — не вмешиваемся вообще
        if (isTypingInInput()) {
            // НЕ добавляем в keys (иначе после возврата к игре будет автодвижение)
            // НЕ блокируем preventDefault (пусть символы вводятся)
            return;
        }

        if (state === GameState.SECRET_REVEAL) {
            // Закрытие ТОЛЬКО пробелом, и ТОЛЬКО после того как картинка уже показалась
            if (e.code === 'Space' && currentReveal && currentReveal.overlayShownAt) {
                const elapsed = performance.now() - currentReveal.overlayShownAt;
                if (elapsed > 1500) closeSecretReveal();
                e.preventDefault();
            }
            return;
        }

        // Используем e.code (физическая клавиша) — работает на любой раскладке
        keys.add(e.code);

        // Блокируем скролл браузера на игровых клавишах
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) {
            e.preventDefault();
        }
    });

    window.addEventListener('keyup', (e) => {
        // Тоже игнорируем когда печатают, чтобы не было обрывов
        if (isTypingInInput()) return;
        keys.delete(e.code);
    });

    // ══════════════════════════════════════════════════════
    // ░░░ 9. СБОРКА УРОВНЯ ░░░
    // ══════════════════════════════════════════════════════
    function buildLevel() {
        tiles = LEVEL_DEF.map((row) => row.split(''));
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                const t = tiles[r][c];
                if (t === T.START) {
                    defaultSpawnX = c * TILE + TILE / 2;
                    defaultSpawnY = r * TILE + TILE / 2;
                }
                if (t === T.GOAL) {
                    minko.x = c * TILE + TILE / 2;
                    minko.y = r * TILE + TILE / 2 + 2;
                }
            }
        }
        spawnX = defaultSpawnX;
        spawnY = defaultSpawnY;

        door1Open = false;
        door2Open = false;
        door3Open = false;
        leverPulled = false;
        hasKey = false;
        seqProgress = 0;

        // Генерация декора стен (детерминированная по row+side)
        wallDecor = [];
        for (let r = 0; r < GRID_H; r++) {
            wallDecor.push({ left: pickDecor(r, 0), right: pickDecor(r, 1) });
        }
        torchOutages.clear();

        // Разбросать кости на полу (только в безопасных рядах)
        bones.length = 0;
        const BONE_SPOTS = [
            { row: 29, col: 3, kind: 'skull' }, { row: 29, col: 7, kind: 'femur' },
            { row: 26, col: 4, kind: 'femur' }, { row: 26, col: 8, kind: 'skull' },
            { row: 23, col: 6, kind: 'skull' }, { row: 23, col: 7, kind: 'femur' },
            { row: 16, col: 3, kind: 'femur' }, { row: 16, col: 7, kind: 'skull' },
            { row: 10, col: 4, kind: 'skull' }, { row: 10, col: 7, kind: 'femur' },
            { row:  8, col: 3, kind: 'femur' }, { row:  8, col: 6, kind: 'skull' },
            { row:  5, col: 4, kind: 'skull' },
        ];
        for (const s of BONE_SPOTS) {
            if (tiles[s.row] && tiles[s.row][s.col] === T.FLOOR) {
                bones.push(new Bone(
                    s.col * TILE + TILE / 2 + (Math.random() - 0.5) * 22,
                    s.row * TILE + TILE / 2 + (Math.random() - 0.5) * 22,
                    s.kind,
                ));
            }
        }

        for (let n = 0; n < 52; n++) {
            const row = 4 + Math.floor(Math.random() * (GRID_H - 10));
            const col = 2 + Math.floor(Math.random() * 8);
            if (!tiles[row] || tiles[row][col] !== T.FLOOR) continue;
            bones.push(new Bone(
                col * TILE + TILE / 2 + (Math.random() - 0.5) * 30,
                row * TILE + TILE / 2 + (Math.random() - 0.5) * 30,
                'shard',
            ));
        }

        // Лужи крови на полу (визуал)
        bloodPuddles.length = 0;
        const PUDDLE_SPOTS = [
            { row: 29, col: 5, size: 26 }, { row: 26, col: 5, size: 20 },
            { row: 23, col: 4, size: 22 }, { row: 23, col: 5, size: 18 },
            { row: 14, col: 6, size: 24 }, { row: 10, col: 3, size: 18 },
            { row:  8, col: 4, size: 24 }, { row:  8, col: 7, size: 20 },
            { row:  5, col: 5, size: 22 }, { row:  4, col: 2, size: 18 },
            { row:  2, col: 3, size: 16 }, { row: 16, col: 5, size: 20 },
        ];
        for (const p of PUDDLE_SPOTS) {
            if (tiles[p.row] && tiles[p.row][p.col] === T.FLOOR) {
                bloodPuddles.push({
                    x: p.col * TILE + TILE / 2 + (Math.random() - 0.5) * 10,
                    y: p.row * TILE + TILE / 2 + (Math.random() - 0.5) * 10,
                    size: p.size + Math.random() * 6,
                    angle: Math.random() * Math.PI,
                });
            }
        }

        dustParticles.length = 0;
    }

    /** Физический объект на полу — кость или череп. Пинается Субару. */
    class Bone {
        constructor(worldX, worldY, kind) {
            this.x = worldX;
            this.y = worldY;
            this.vx = 0;
            this.vy = 0;
            this.r = kind === 'skull' ? 8 : kind === 'shard' ? 5 : 7;
            this.kind = kind;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotSpeed = 0;
            this.friction = 0.88;
        }
        update(dt) {
            if (Math.abs(this.vx) < 2 && Math.abs(this.vy) < 2) {
                this.vx = 0; this.vy = 0; this.rotSpeed *= 0.9;
                return;
            }
            const nx = this.x + this.vx * dt;
            const ny = this.y + this.vy * dt;
            // Проверка стен: если новый центр внутри стены — отскок
            const ncol = Math.floor(nx / TILE);
            const nrow = Math.floor(ny / TILE);
            const tileCheck = tileAt(ncol, nrow);
            if (tileCheck === T.WALL) {
                // Какая из осей пересекла стену?
                const curCol = Math.floor(this.x / TILE);
                const curRow = Math.floor(this.y / TILE);
                if (curCol !== ncol) this.vx *= -0.55;
                if (curRow !== nrow) this.vy *= -0.55;
                this.rotSpeed *= -0.5;
            } else {
                this.x = nx;
                this.y = ny;
            }
            this.rotation += this.rotSpeed * dt;
            this.vx *= this.friction;
            this.vy *= this.friction;
            this.rotSpeed *= 0.94;
        }
        tryKick(s, subVx, subVy) {
            const dx = this.x - s.x;
            const dy = this.y - s.y;
            const dist = Math.hypot(dx, dy);
            if (dist < s.r + this.r && dist > 0.1) {
                const nxN = dx / dist;
                const nyN = dy / dist;
                const subSpeed = Math.hypot(subVx, subVy);
                const kickSpeed = 180 + subSpeed * 0.8;
                this.vx = nxN * kickSpeed;
                this.vy = nyN * kickSpeed;
                this.rotSpeed = (Math.random() - 0.5) * 18;
                // Не даём Субару оказаться внутри кости — не толкаем его, просто сдвигаем кость из зоны
                const overlap = (s.r + this.r) - dist;
                this.x += nxN * overlap;
                this.y += nyN * overlap;
            }
        }
        draw() {
            const sx = this.x;
            const sy = this.y - camY;
            if (sy < -20 || sy > CANVAS_H + 20) return;
            // Тень
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.ellipse(sx, sy + 4, 7, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(this.rotation);
            if (this.kind === 'skull') {
                ctx.fillStyle = '#c0b6a8';
                ctx.beginPath();
                ctx.arc(0, -2, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#a89c90';
                ctx.fillRect(-4, 3, 8, 3);
                ctx.fillStyle = '#0a0005';
                ctx.beginPath();
                ctx.arc(-2, -2, 1.6, 0, Math.PI * 2);
                ctx.arc(2, -2, 1.6, 0, Math.PI * 2);
                ctx.fill();
                // Трещины
                ctx.strokeStyle = 'rgba(0,0,0,0.4)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(-4, -5); ctx.lineTo(-1, -2); ctx.stroke();
            } else if (this.kind === 'shard') {
                ctx.fillStyle = '#5c5248';
                ctx.fillRect(-5, -4, 10, 8);
                ctx.fillStyle = '#2a2218';
                ctx.fillRect(-3, -2, 6, 4);
                ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                ctx.strokeRect(-5, -4, 10, 8);
            } else {
                // Кость (бедро)
                ctx.fillStyle = '#c0b6a8';
                ctx.fillRect(-7, -2, 14, 4);
                ctx.beginPath();
                ctx.arc(-7, -1, 3, 0, Math.PI * 2);
                ctx.arc(-7, 1, 3, 0, Math.PI * 2);
                ctx.arc(7, -1, 3, 0, Math.PI * 2);
                ctx.arc(7, 1, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    function pickDecor(row, side) {
        let h = (row * 73856093) ^ (side * 19349663) ^ 2654435761;
        h = (h ^ (h >>> 13)) >>> 0;
        const r = (h % 10000) / 10000;
        if (r < 0.15) return 'skull';
        if (r < 0.28) return 'ribs';
        if (r < 0.40) return 'blood';
        if (r < 0.54) return 'candle';
        if (r < 0.64) return 'crack';
        return 'empty';
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 10. ТАЙЛЫ / КОЛЛИЗИИ ░░░
    // ══════════════════════════════════════════════════════
    function tileAt(col, row) {
        if (row < 0 || row >= GRID_H || col < 0 || col >= GRID_W) return T.WALL;
        return tiles[row][col];
    }

    function isSolid(col, row) {
        const t = tileAt(col, row);
        if (t === T.WALL) return true;
        if (t === T.DOOR_LEVER && !door1Open) return true;
        if (t === T.DOOR_SEQ && !door2Open) return true;
        if (t === T.DOOR_KEY && !door3Open) return true;
        return false;
    }

    function canOccupy(wx, wy) {
        const r = subaru.r - 1;
        const minC = Math.floor((wx - r) / TILE);
        const maxC = Math.floor((wx + r) / TILE);
        const minR = Math.floor((wy - r) / TILE);
        const maxR = Math.floor((wy + r) / TILE);
        for (let rr = minR; rr <= maxR; rr++) {
            for (let cc = minC; cc <= maxC; cc++) {
                if (isSolid(cc, rr)) return false;
            }
        }
        return true;
    }

    function tryMove(dx, dy) {
        const nx = subaru.x + dx;
        if (canOccupy(nx, subaru.y)) subaru.x = nx;
        const ny = subaru.y + dy;
        if (canOccupy(subaru.x, ny)) subaru.y = ny;
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 11. ЛОВУШКИ / ТРИГГЕРЫ / ГОЛОВОЛОМКИ ░░░
    // ══════════════════════════════════════════════════════
    function onEnterTile(col, row) {
        if (!subaru.alive) return;
        const t = tileAt(col, row);

        // Ловушки — пресс-плиты (смерть через видео)
        if (TRAP_TYPES.has(t)) {
            void handleTrapDeath(t, col, row);
            return;
        }

        // Рычаг
        if (t === T.LEVER && !leverPulled) {
            leverPulled = true;
            door1Open = true;
            statusEl.className = 'status-line success';
            statusEl.textContent = '⚙️ Рычаг щёлкнул. Первая дверь скрежещет и открывается...';
            return;
        }

        // Ключ
        if (t === T.KEY && !hasKey) {
            hasKey = true;
            tiles[row][col] = T.FLOOR;
            door3Open = true;
            statusEl.className = 'status-line success';
            statusEl.textContent = '🗝️ Золотой ключ! Последняя дверь только что открылась.';
            return;
        }

        // Прохождение через двери — отдельные квесты
        if (t === T.DOOR_LEVER && door1Open) completeQuest('doorLever');
        if (t === T.DOOR_SEQ   && door2Open) completeQuest('doorSeq');
        if (t === T.DOOR_KEY   && door3Open) completeQuest('doorKey');

        // Печати
        if (t === T.SEQ1) { tryAdvanceSeq(1); return; }
        if (t === T.SEQ2) { tryAdvanceSeq(2); return; }
        if (t === T.SEQ3) { tryAdvanceSeq(3); return; }
    }

    /** После сборки `tiles`: порядок столов с книгой — удалено */
    function rebuildBookQuestMap() {}

    function getQuestForBookRow() {
        return null;
    }

    /** Квизы у книг отключены */
    async function triggerBookQuiz() {}

    function checkCheckpoint(_row) { /* чекпоинты отключены */ }

    function tryAdvanceSeq(n) {
        if (n === seqProgress + 1) {
            seqProgress = n;
            statusEl.className = 'status-line success';
            if (seqProgress === 3) {
                door2Open = true;
                statusEl.textContent = '🔓 Третья печать! Дверь разломилась на части.';
            } else {
                statusEl.textContent = `✦ Печать ${seqProgress}/3 активирована. Иди дальше.`;
            }
        } else if (n > seqProgress) {
            // неправильный порядок — сброс
            if (seqProgress > 0) {
                seqProgress = 0;
                statusEl.className = 'status-line danger';
                statusEl.textContent = '💢 Неверный порядок! Печати погасли. Начни цикл заново.';
            }
        }
        // иначе (n <= seqProgress): уже активирована, игнор
    }

    // Чекпоинты полностью отключены (см. тупой stub выше)

    // ══════════════════════════════════════════════════════
    // ░░░ 12. СМЕРТЬ ОТ ЛОВУШКИ (видео + кровь) / РЕСПАВН ░░░
    // ══════════════════════════════════════════════════════
    const trapDeathOverlay = document.getElementById('trapDeathOverlay');
    const trapDeathVideo = document.getElementById('trapDeathVideo');
    const curseBlackScreen = document.getElementById('curseBlackScreen');
    const curseAishiteru = document.getElementById('curseAishiteru');
    const _deathVideoPreloaded = new Set();

    function preloadDeathVideoSrc(src) {
        if (!src || _deathVideoPreloaded.has(src)) return;
        _deathVideoPreloaded.add(src);
        try {
            const v = document.createElement('video');
            v.preload = 'auto';
            v.muted = true;
            v.src = src;
            v.load();
        } catch (_) {
            /* ignore */
        }
    }

    function preloadDeathVideoPool() {
        try {
            buildDeathVideoPool()
                .slice(0, 5)
                .forEach((src) => preloadDeathVideoSrc(src));
        } catch (_) {
            /* ignore */
        }
    }

    preloadDeathVideoPool();
    const DEATH_VIDEO_MAX = 24;
    let trapDeathActive = false;
    let _lastDeathVideoSrc = null;
    let _trapsSinceSameVideo = 0;
    let _repeatSameVideoAfter = 5;
    let _deathVideoPool = null;

    function buildDeathVideoPool() {
        const pool = [];
        for (let i = 1; i <= DEATH_VIDEO_MAX; i++) {
            pool.push(`смерть ${i}.mp4`, `смерть${i}.mp4`, `смерть ${i}.webm`, `смерть${i}.webm`);
        }
        return pool;
    }

    function pickDeathVideoSrc() {
        if (!_deathVideoPool) _deathVideoPool = buildDeathVideoPool();
        let pool = _deathVideoPool.slice();
        const mayRepeat =
            _lastDeathVideoSrc && _trapsSinceSameVideo >= _repeatSameVideoAfter && Math.random() < 0.4;
        if (_lastDeathVideoSrc && !mayRepeat) {
            pool = pool.filter((src) => src !== _lastDeathVideoSrc);
        }
        if (!pool.length) pool = _deathVideoPool.slice();
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        if (chosen === _lastDeathVideoSrc) {
            _trapsSinceSameVideo = 0;
            _repeatSameVideoAfter = 4 + Math.floor(Math.random() * 4);
        } else {
            _lastDeathVideoSrc = chosen;
            _trapsSinceSameVideo++;
        }
        return chosen;
    }

    function playOverlayVideo(src, mode = 'trap') {
        return new Promise((resolve) => {
            if (!trapDeathOverlay || !trapDeathVideo || !src) {
                setTimeout(() => resolve(false), 400);
                return;
            }

            trapDeathOverlay.classList.remove('curse-mode', 'black-curse-mode');
            if (curseBlackScreen) {
                curseBlackScreen.classList.add('hidden');
                curseBlackScreen.setAttribute('aria-hidden', 'true');
            }
            if (curseAishiteru) {
                curseAishiteru.classList.add('hidden');
                curseAishiteru.setAttribute('aria-hidden', 'true');
            }
            trapDeathVideo.style.display = '';
            if (mode === 'curse') trapDeathOverlay.classList.add('curse-mode');
            trapDeathOverlay.classList.remove('hidden');
            trapDeathOverlay.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(() => trapDeathOverlay.classList.add('active'));

            let done = false;
            const finish = (ok) => {
                if (done) return;
                done = true;
                clearTimeout(loadTimeout);
                clearTimeout(hardCap);
                trapDeathVideo.onended = null;
                trapDeathVideo.onerror = null;
                trapDeathVideo.oncanplay = null;
                try {
                    trapDeathVideo.pause();
                    trapDeathVideo.removeAttribute('src');
                    trapDeathVideo.load();
                } catch (_) {
                    /* ignore */
                }
                trapDeathOverlay.classList.remove('active', 'curse-mode', 'black-curse-mode');
                trapDeathOverlay.classList.add('hidden');
                trapDeathOverlay.setAttribute('aria-hidden', 'true');
                resolve(!!ok);
            };

            preloadDeathVideoSrc(src);

            const hardCap = setTimeout(() => finish(false), 28000);
            const loadTimeout = setTimeout(() => finish(false), mode === 'trap' ? 8000 : 4000);

            const startPlay = () => {
                clearTimeout(loadTimeout);
                trapDeathVideo.muted = false;
                trapDeathVideo
                    .play()
                    .then(() => {})
                    .catch(() => finish(false));
            };

            trapDeathVideo.onended = () => finish(true);
            trapDeathVideo.onerror = () => finish(false);
            trapDeathVideo.oncanplay = () => {
                trapDeathVideo.oncanplay = null;
                startPlay();
            };

            trapDeathVideo.src = src;
            trapDeathVideo.currentTime = 0;
            trapDeathVideo.load();
            if (trapDeathVideo.readyState >= 2) startPlay();
        });
    }

    function playTrapDeathVideo() {
        preloadDeathVideoPool();
        return playOverlayVideo(pickDeathVideoSrc(), 'trap');
    }

    const AISHITERU_LANGS = [
        '愛してる',
        'Aishiteru',
        'I love you',
        'Я тебя люблю',
        'Je t\'aime',
        'Te quiero',
        'Ich liebe dich',
        'Ti amo',
        '사랑해',
        '我爱你',
        'Eu te amo',
        'Seni seviyorum'
    ];

    function waitForAudioEnd(audioEl, fallbackMs) {
        return new Promise((resolve) => {
            const fallback = fallbackMs || 12000;
            if (!audioEl) {
                setTimeout(resolve, fallback);
                return;
            }
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                try {
                    audioEl.removeEventListener('ended', finish);
                } catch (_) {}
                resolve();
            };
            audioEl.addEventListener('ended', finish);
            let ms = fallback;
            try {
                if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
                    const remain = (audioEl.duration - (audioEl.currentTime || 0)) * 1000;
                    ms = Math.max(800, remain + 250);
                }
            } catch (_) {}
            setTimeout(finish, ms);
        });
    }

    function hideCurseBlackScreen() {
        if (!trapDeathOverlay) return;
        trapDeathOverlay.classList.remove('active', 'black-curse-mode');
        trapDeathOverlay.classList.add('hidden');
        trapDeathOverlay.setAttribute('aria-hidden', 'true');
        if (curseBlackScreen) {
            curseBlackScreen.classList.add('hidden');
            curseBlackScreen.setAttribute('aria-hidden', 'true');
        }
        if (curseAishiteru) {
            curseAishiteru.classList.add('hidden');
            curseAishiteru.setAttribute('aria-hidden', 'true');
            curseAishiteru.classList.remove('aishiteru-cycle');
            if (curseAishiteru._cycleTimer) {
                clearInterval(curseAishiteru._cycleTimer);
                curseAishiteru._cycleTimer = null;
            }
        }
        if (trapDeathVideo) trapDeathVideo.style.display = '';
    }

    /**
     * Чёрный экран проклятия.
     * strike 1 — статичный «愛してる»;
     * strike 2 — aishiteru на языках (мигает) до untilPromise / durationMs.
     */
    function playCurseBlackScreen(strike, durationMs, untilPromise) {
        return new Promise((resolve) => {
            const ms = durationMs || (strike === 1 ? 3200 : 4500);
            if (!trapDeathOverlay) {
                const p = untilPromise || new Promise((r) => setTimeout(r, ms));
                Promise.resolve(p).then(() => resolve(true));
                return;
            }

            trapDeathOverlay.classList.remove('curse-mode');
            trapDeathOverlay.classList.add('black-curse-mode');
            trapDeathOverlay.classList.remove('hidden');
            trapDeathOverlay.setAttribute('aria-hidden', 'false');
            if (trapDeathVideo) trapDeathVideo.style.display = 'none';
            if (curseBlackScreen) {
                curseBlackScreen.classList.remove('hidden');
                curseBlackScreen.setAttribute('aria-hidden', 'false');
            }
            if (curseAishiteru) {
                if (curseAishiteru._cycleTimer) {
                    clearInterval(curseAishiteru._cycleTimer);
                    curseAishiteru._cycleTimer = null;
                }
                curseAishiteru.classList.remove('hidden');
                curseAishiteru.setAttribute('aria-hidden', 'false');
                if (strike === 2) {
                    let idx = 0;
                    curseAishiteru.textContent = AISHITERU_LANGS[0];
                    curseAishiteru.classList.add('aishiteru-cycle');
                    curseAishiteru._cycleTimer = setInterval(() => {
                        idx = (idx + 1) % AISHITERU_LANGS.length;
                        curseAishiteru.classList.remove('aishiteru-flash');
                        void curseAishiteru.offsetWidth;
                        curseAishiteru.textContent = AISHITERU_LANGS[idx];
                        curseAishiteru.classList.add('aishiteru-flash');
                    }, 900);
                } else {
                    curseAishiteru.textContent = '愛してる';
                    curseAishiteru.classList.remove('aishiteru-cycle');
                }
            }
            requestAnimationFrame(() => trapDeathOverlay.classList.add('active'));

            const finish = () => {
                hideCurseBlackScreen();
                resolve(true);
            };

            if (untilPromise && typeof untilPromise.then === 'function') {
                untilPromise.then(finish).catch(finish);
            } else {
                setTimeout(finish, ms);
            }
        });
    }

    async function handleTrapDeath(_type, _col, _row) {
        if (!subaru.alive || trapDeathActive) return;
        trapDeathActive = true;
        subaru.alive = false;
        deaths++;
        deathCountEl.textContent = deaths;
        progressCounters.trapsAvoided = 0;

        keys.clear();
        state = GameState.DEAD;
        playDeathSfx();
        fadeMusic(BG_VOLUME * 0.25, 200);
        screenShakeUntil = performance.now() + 350;
        deathEffect = null;

        statusEl.className = 'status-line danger';
        statusEl.textContent = '...';

        await playTrapDeathVideo();

        if (state === GameState.DEAD) respawn();
        trapDeathActive = false;
    }

    function respawn() {
        deathScreen.classList.add('hidden');
        loop++;
        loopCountEl.textContent = loop;

        // Всегда спавн на стартовой позиции (чекпоинтов нет)
        subaru.x = defaultSpawnX;
        subaru.y = defaultSpawnY;
        subaru.alive = true;
        subaru.blink = 0.8;
        deathEffect = null;
        snapCameraToSubaru();

        fadeMusic(BG_VOLUME, 500);

        statusEl.className = 'status-line';
        statusEl.textContent = getLoopMessage();

        // Рандомный квиз не должен срабатывать сразу после смерти
        nextEventTimes.randomQuiz = performance.now() + 15000 + Math.random() * 15000;

        state = GameState.PLAYING;
    }

    function getLoopMessage() {
        const pool = [
            'Запоминай дорогу.',
            'Держи в голове безопасный путь.',
            'Снова сначала — ориентируйся по памяти.',
            'Каждый шаг считается — помни, где уже был.',
        ];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function win() {
        state = GameState.WON;
        completeQuest('reachMinko');
        // Сбрасываем флаг in-game — игра пройдена, reload в этом случае не считается прерыванием
        try { sessionStorage.removeItem(SESSION_INGAME_KEY); } catch (_) {}

        const startWake = performance.now();
        const wakeInterval = setInterval(() => {
            const t = (performance.now() - startWake) / 1500;
            minko.wake = Math.min(1, t);
            if (t >= 1) clearInterval(wakeInterval);
        }, 16);

        fadeMusic(BG_VOLUME * 0.45, 1200);

        // Если Минко всё ещё спит после 12-часового штрафа — диалог не откроется
        const sleepRemain = getMinkoSleepRemaining();
        if (sleepRemain > 0) {
            statusEl.className = 'status-line danger';
            statusEl.textContent = '😴 Минко крепко спит. Она не реагирует.';
            setTimeout(() => showMinkoSleeping(sleepRemain), 1400);
            return;
        }

        statusEl.className = 'status-line success';
        statusEl.textContent = 'Минко просыпается... она хочет с тобой поговорить.';
        setTimeout(() => openMinkoDialog(), 1400);
    }

    function showMinkoSleeping(remainMs) {
        const time = formatSleepTime(remainMs);
        victoryText.innerHTML =
            `<span style="color:#a8a0c0;">😴 *Минко крепко спит*</span><br><br>` +
            `Ты дошёл до её кровати. Она дышит тихо и ровно — но не открывает глаз.<br>` +
            `<em style="color:#bcd4ff;">Её сон слишком глубок, чтобы его прервать.</em><br><br>` +
            `Подожди ещё <strong>${time}</strong> — она проснётся сама.`;
        victoryStats.innerHTML = `💤 До пробуждения: <strong>${time}</strong>`;
        victoryScreen.classList.remove('hidden');
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 13. ДИАЛОГ МИНКО + ПРОКЛЯТИЕ ВЕДЬМЫ ░░░
    // ══════════════════════════════════════════════════════
    function openMinkoDialog() {
        const lines = [
            '*медленно открывает глаза и пугается*<br>...кто ты?.. где я?.<br>Я же просто... уснула у себя... а проснулась тут, в этом странном коридоре.<br><br><em>Как ты вообще сюда попал?</em>',
            '*смотрит по сторонам, растерянно*<br>...я не понимаю... последнее, что помню — тишина и сон...<br>А теперь ты стоишь передо мной с кофе.<br><br><em>Ты правда нашёл меня?</em>',
            '*потирает глаза*<br>...мне страшно и холодно...<br>Не знаю, как оказалась здесь — будто меня перенесло во сне.<br><br><em>Расскажи, что ты видел по пути сюда.</em>',
            '*тихо вздыхает*<br>...спасибо, что добрался... я думала, никто не придёт.<br>Я не помню дорогу назад — только этот коридор и твои шаги.<br><br><em>Откуда ты знаешь, что я здесь?</em>',
        ];
        minkoText.innerHTML = lines[Math.floor(Math.random() * lines.length)];

        minkoAnswer.value = '';
        minkoAnswer.disabled = false;
        minkoAnswer.placeholder = 'Ответить Минко...';
        minkoSubmit.disabled = false;
        minkoHint.className = 'minko-hint';
        minkoHint.innerHTML = '⚠️ Будь осторожен с тем, что говоришь. Некоторые истины — под проклятием.';

        minkoDialog.classList.remove('hidden');
        playMinkoVideo();
        setTimeout(() => minkoAnswer.focus(), 350);
    }

    // ── УМНАЯ ДЕТЕКЦИЯ ЗАПРЕТНЫХ СЛОВ ────────────────────
    //  3 уровня защиты от обхода:
    //  1) Визуальная нормализация — цифры и похожие латинские в кириллицу
    //  2) Фонетическая нормализация — полный перевод латиницы (pererozhdenie → перерождение)
    //  3) Fuzzy matching (Левенштейн) — ловит ОПЕЧАТКИ (1-2 ошибки)
    //     «перераждение» (с опечаткой) → всё равно ловится!

    function normalizeVisual(text) {
        let t = text.toLowerCase();
        const lat2cyr = {
            'a': 'а', 'e': 'е', 'o': 'о', 'p': 'р', 'c': 'с',
            'y': 'у', 'x': 'х', 'k': 'к', 'h': 'н', 'b': 'в',
            'm': 'м', 't': 'т', 'n': 'п', 'u': 'и', 'i': 'и',
            'ë': 'е',
        };
        const digit2cyr = { '0': 'о', '3': 'е', '4': 'ч', '6': 'б', '7': 'т' };
        let out = '';
        for (const ch of t) {
            if (lat2cyr[ch]) out += lat2cyr[ch];
            else if (digit2cyr[ch]) out += digit2cyr[ch];
            else out += ch;
        }
        t = out.replace(/[^а-яёa-z]/g, '');
        t = t.replace(/(.)\1{2,}/g, '$1');
        return t;
    }

    /** Полная фонетическая транслитерация латиницы → кириллица. */
    function normalizePhonetic(text) {
        let t = text.toLowerCase();
        // Многосимвольные сочетания ПЕРВЫМИ — чтобы 'zh'→'ж' не распалось на 'з'+'х'
        t = t
            .replace(/shch/g, 'щ').replace(/sch/g, 'щ')
            .replace(/zh/g, 'ж').replace(/ch/g, 'ч').replace(/sh/g, 'ш')
            .replace(/kh/g, 'х').replace(/ts/g, 'ц')
            .replace(/ya/g, 'я').replace(/yu/g, 'ю').replace(/yo/g, 'ё')
            .replace(/ey/g, 'ей').replace(/ay/g, 'ай').replace(/oy/g, 'ой');
        const digit2cyr = { '0': 'о', '3': 'е', '4': 'ч', '6': 'б', '7': 'т' };
        const phon = {
            'a':'а','b':'б','v':'в','g':'г','d':'д','e':'е','ë':'е','j':'ж',
            'z':'з','i':'и','k':'к','l':'л','m':'м','n':'н','o':'о','p':'п',
            'r':'р','s':'с','t':'т','u':'у','f':'ф','h':'х','c':'к','w':'в',
            'x':'х','y':'ы','q':'к',
        };
        let out = '';
        for (const ch of t) {
            if (phon[ch]) out += phon[ch];
            else if (digit2cyr[ch]) out += digit2cyr[ch];
            else out += ch;
        }
        out = out.replace(/[^а-яё]/g, '');
        out = out.replace(/(.)\1{2,}/g, '$1');
        return out;
    }

    function normalizeForCheck(text) { return normalizeVisual(text); }

    /** Расстояние Левенштейна: сколько правок нужно, чтобы превратить a в b. */
    function editDistance(a, b) {
        const m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        if (Math.abs(m - n) > 3) return 99;
        let prev = new Array(n + 1);
        let curr = new Array(n + 1);
        for (let j = 0; j <= n; j++) prev[j] = j;
        for (let i = 1; i <= m; i++) {
            curr[0] = i;
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            }
            [prev, curr] = [curr, prev];
        }
        return prev[n];
    }

    /** Проверка: есть ли в `text` подстрока, близкая к `root` (≤ maxDist правок). */
    function fuzzyContains(text, root, maxDist) {
        if (!text || !root) return false;
        const rl = root.length;
        if (text.length + maxDist < rl) return false;
        // Быстрый путь: точное вхождение
        if (text.includes(root)) return true;
        // Медленный путь: скользящие окна разной длины
        const minLen = Math.max(1, rl - maxDist);
        const maxLen = rl + maxDist;
        for (let wl = minLen; wl <= maxLen; wl++) {
            for (let i = 0; i + wl <= text.length; i++) {
                if (editDistance(text.substring(i, i + wl), root) <= maxDist) return true;
            }
        }
        return false;
    }

    const FORBIDDEN_ROOTS = [
        'перерожд', 'переродил', 'перерождаю',
        'возрожд', 'возродил',
        'воскрес', 'воскреш',
        'бессмерт',
        'перевоплощ', 'реинкарн',
        'сатэлл', 'satella',
        'returnbydeath', 'returndeath', 'deathreturn',
        'deathloop', 'timeloop',
        'rebirth', 'reborn', 'resurrect', 'immortal',
        'shisenkaiki',
        'вернулся', 'вернулась', 'вернулись', 'вернуться', 'вернусь', 'вернёмся', 'вернемся',
        'вернися', 'вернуся', 'вернулоя', 'вернулас',
        'respawn', 'reload', 'checkpoint', 'savepoint', 'rewind', 'revert',
        'retryloop', 'timelines',
    ];

    const FORBIDDEN_PAIRS = [
        ['возвра', 'смерт'], ['смерт', 'возвра'], ['возврат', 'смерт'],
        ['умира', 'возвра'], ['умира', 'ожив'], ['смерт', 'ожив'],
        ['петл', 'врем'], ['врем', 'петл'],
        ['прожив', 'заново'], ['начина', 'заново'],
        ['живу', 'снова'], ['живу', 'заново'],
        ['откат', 'смерт'], ['откат', 'врем'],
        ['вернут', 'смерт'], ['вернус', 'смерт'],
        ['вновь', 'жив'], ['снова', 'оживаю'],
        ['после', 'смерт', 'жив'],
        ['die', 'return'], ['back', 'death'],
        ['reset', 'die'], ['reset', 'death'],
        ['come', 'back', 'death'],
        ['go', 'back'], ['try', 'again'],
    ];

    /** Главная проверка запретного текста: обе нормализации + fuzzy matching.
     *  Возвращает true если текст содержит корень/пару с ≤N опечаток. */
    function checkForbidden(text) {
        if (!text) return false;
        // Две нормализации: визуальная (0→о, p→р) и фонетическая (pererozhdenie → перерождение)
        const forms = [normalizeVisual(text), normalizePhonetic(text)];

        for (const n of forms) {
            if (n.length < 4) continue;

            // 1. Однозначные корни — с допуском на опечатки
            for (const root of FORBIDDEN_ROOTS) {
                // Длинный корень → допускаем 2 ошибки; средний → 1 ошибку
                const maxDist = root.length >= 10 ? 2 : 1;
                if (fuzzyContains(n, root, maxDist)) return true;
            }

            // 2. Пары — каждый токен ищется с fuzzy, все должны найтись
            for (const pair of FORBIDDEN_PAIRS) {
                let all = true;
                for (const tok of pair) {
                    const tokDist = tok.length >= 6 ? 1 : 0;
                    if (!fuzzyContains(n, tok, tokDist)) { all = false; break; }
                }
                if (all) return true;
            }
        }

        return false;
    }

    function attachMinkoDialogHandlers() {
        minkoAnswer.addEventListener('input', () => {
            if (witchActive) return;
            if (checkForbidden(minkoAnswer.value)) void triggerWitchHand();
        });
        minkoSubmit.addEventListener('click', () => {
            if (witchActive) return;
            const text = minkoAnswer.value.trim();
            if (!text) {
                minkoAnswer.focus();
                return;
            }
            if (checkForbidden(text)) {
                void triggerWitchHand();
                return;
            }
            acceptMinkoAnswer(text);
        });
        minkoAnswer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                minkoSubmit.click();
            }
        });
    }

    function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

    function escapeHtml(s) {
        return s.replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function acceptMinkoAnswer(text) {
        minkoDialog.classList.add('hidden');
        stopMinkoVideo();
        fadeMusic(0, 1000);
        const safeText = escapeHtml(text.slice(0, 140));
        const pool = [
            `*облегчённо выдыхает*<br>«${safeText}»<br><strong>Спасибо... я всё ещё не понимаю, как оказалась здесь, но с тобой не так страшно. 💙</strong>`,
            `*кивает, чуть улыбаясь*<br>«${safeText}»<br><strong>Ладно... поверю. Давай выбираться отсюда вместе~ ☕</strong>`,
            `*прижимает к себе подушку*<br>«${safeText}»<br><strong>Я просто хочу домой... и снова нормально поспать. Спасибо, что пришёл. 💙</strong>`,
        ];
        let reaction = pool[Math.floor(Math.random() * pool.length)];
        if (witchStrikes > 0) {
            reaction =
                `*смотрит настороженно*<br>«${safeText}»<br>...ты чуть не сказал то, что нельзя. Больше так не делай.<br><strong>Спасибо, что остановился вовремя. 💙</strong>`;
        }

        victoryText.innerHTML = reaction;
        victoryStats.innerHTML =
            `Попыток: <strong>${loop}</strong> · Смертей: <strong>${deaths}</strong>` +
            (witchStrikes > 0 ? ` · Проклятий: <strong>${witchStrikes}</strong>` : '');
        setTimeout(() => victoryScreen.classList.remove('hidden'), 500);
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 13.5. КВЕСТЫ-СЦЕНЫ (внутренний трекинг для Минко-диалога) ░░░
    // ══════════════════════════════════════════════════════
    const QUESTS = [
        {
            id: 'lever',
            hint: '🌀 Шёпот из стен: «Первая тайна прячется за рычагом...»',
            video: 'Rroliki ebili subaru.mp4',
            title: 'Первая тайна',
            lines: ['Рычаг щёлкнул — и стена задрожала.', 'Ты видишь... то, что не должно было быть увидено.', 'Первая память особняка открыта тебе.'],
        },
        {
            id: 'seq',
            hint: '🌀 Шёпот из стен: «Когда три печати сложатся в порядке, стена раскроется...»',
            video: 'Rem Dead.mp4',
            title: 'Вторая тайна',
            lines: ['Печати сложились в правильный порядок.', 'Стена расщелилась — там, где её не должно было быть.', 'Ты видишь её. Рэм. Она уже не та.'],
        },
        {
            id: 'key',
            hint: '🌀 Шёпот из стен: «Золото ведёт к последней памяти...»',
            video: 'sneslo golowu.mp4',
            title: 'Последняя тайна',
            lines: ['Ключ в твоей руке — и где-то в стене раздаётся скрежет.', 'Ты видишь себя. В другой петле. Без головы.', 'Великий Дух не прощает запретных имён.'],
        },
    ];
    const questDone = new Set();
    function questsCompleted() { return questDone.size; }

    // Счётчики прогресса (оставлены для возможного будущего использования)
    const progressCounters = { quizCorrect: 0, trapsAvoided: 0 };

    /** Отмечает квест выполненным. Без UI-уведомлений — только внутренний трекинг. */
    function completeQuest(id) {
        if (questDone.has(id)) return false;
        const quest = QUESTS.find((q) => q.id === id);
        if (!quest) return false;
        questDone.add(id);
        return true;
    }
    function renderQuestPanel() { /* удалено — панель убрана */ }
    function checkProgressQuests() { /* удалено — пассивных квестов нет */ }

    /** Показывает подсказку-шёпот для следующего невыполненного квеста. */
    function showNextQuestHint() {}

    // checkQuestConditions убрана — всё через triggerBookQuiz теперь

    let currentReveal = null; // { startTime, quest, overlayShownAt }
    let openingWall = null;   // { col, row, startTime, phase: 'opening' | 'closing' }

    /** Позиция стены-прохода для квеста — парная к столу с книгой. */
    function getSecretWallPosition(questId) {
        const MAP = {
            lever:  { col: 10, row: 50 }, // правая стена (после рычага)
            seq:    { col: 1,  row: 33 }, // левая стена (после печатей)
            key:    { col: 10, row: 12 }, // правая стена (после ключа — последняя тайна)
        };
        return MAP[questId] || null;
    }

    /** Находит «правильную» клетку стены рядом со столом книги (динамически по tiles). */
    function findWallOpeningCellForBookRow(bookRow) {
        if (bookRow == null || bookRow < 0 || bookRow >= GRID_H) return null;
        let bookCol = -1;
        const rowTiles = tiles[bookRow];
        if (!rowTiles) return null;
        for (let c = 0; c < GRID_W; c++) {
            if (rowTiles[c] === T.BOOK) {
                bookCol = c;
                break;
            }
        }
        if (bookCol < 0) return null;
        const leftCol = 1;
        const rightCol = GRID_W - 2;
        const cand = [];
        if (bookCol <= GRID_W / 2) {
            if (rowTiles[rightCol] === T.WALL) cand.push({ col: rightCol, row: bookRow });
            if (rowTiles[leftCol] === T.WALL) cand.push({ col: leftCol, row: bookRow });
        } else {
            if (rowTiles[leftCol] === T.WALL) cand.push({ col: leftCol, row: bookRow });
            if (rowTiles[rightCol] === T.WALL) cand.push({ col: rightCol, row: bookRow });
        }
        return cand[0] || null;
    }

    // ═══════════════════════════════════════════════════════
    // КВИЗ-ВОПРОСЫ ПО RE:ZERO (перед каждой тайной сценой)
    // ═══════════════════════════════════════════════════════
    const QUIZ_BANK = [
        // === Про ЦЕЛЬ ИГРЫ (всё, что игрок видит/знает с самого начала) ===
        {
            q: 'Кого ты хочешь разбудить в конце коридора?',
            a: [
                { t: 'Минко', correct: true },
                { t: 'Эмилию' },
                { t: 'Рэм' },
                { t: 'Сам не знаю' },
            ],
        },
        {
            q: 'Что ты несёшь спящей девочке?',
            a: [
                { t: 'Меч' },
                { t: 'Цветы' },
                { t: 'Кофе ☕', correct: true },
                { t: 'Конфеты' },
            ],
        },
        {
            q: 'Что окружает тебя в коридоре?',
            a: [
                { t: 'Тьма и едва заметный свет', correct: true },
                { t: 'Зелёная трава' },
                { t: 'Ярко горящие лампы' },
                { t: 'Снежная буря' },
            ],
        },
        {
            q: 'Что ждёт тебя, если ты наступишь не туда?',
            a: [
                { t: 'Подсказка' },
                { t: 'Тёплое объятие' },
                { t: 'Смерть', correct: true },
                { t: 'Ничего' },
            ],
        },
        {
            q: 'Что чаще всего слышишь в коридоре?',
            a: [
                { t: 'Музыку' },
                { t: 'Шёпоты из стен', correct: true },
                { t: 'Птиц' },
                { t: 'Гул машин' },
            ],
        },
        {
            q: 'Сколько раз ты можешь умереть?',
            a: [
                { t: 'Один' },
                { t: 'Три' },
                { t: 'Сколько угодно — петля всё равно держит память', correct: true },
                { t: 'Ни одного' },
            ],
        },
        {
            q: 'Что лежит на столе в коридоре?',
            a: [
                { t: 'Ваза' },
                { t: 'Книга, которая парит', correct: true },
                { t: 'Череп' },
                { t: 'Свеча' },
            ],
        },
        {
            q: 'Какая клавиша тебя продвигает?',
            a: [
                { t: 'Стрелки' },
                { t: 'Только мышь' },
                { t: 'WASD', correct: true },
                { t: 'Никакая' },
            ],
        },
        // === Про Re:Zero (общее, не привязанное к прохождению) ===
        {
            q: 'Как зовут главного героя?',
            a: [
                { t: 'Канеки Кен' },
                { t: 'Натсуки Субару', correct: true },
                { t: 'Сатору Годжо' },
                { t: 'Рейнхард' },
            ],
        },
        {
            q: 'Что носит Субару?',
            a: [
                { t: 'Школьную форму' },
                { t: 'Оранжевый спортивный костюм', correct: true },
                { t: 'Рыцарские доспехи' },
                { t: 'Чёрную мантию' },
            ],
        },
        {
            q: 'Кто такая Эльза Гранхельт?',
            a: [
                { t: 'Принцесса' },
                { t: 'Охотница за кишками', correct: true },
                { t: 'Учительница' },
                { t: 'Мать Рэм' },
            ],
        },
        {
            q: 'Что делают тёмные кролики со своей жертвой?',
            a: [
                { t: 'Играют с ней' },
                { t: 'Съедают без остатка', correct: true },
                { t: 'Гоняют по лесу' },
                { t: 'Прячутся' },
            ],
        },
        {
            q: 'Как зовут духа, защищающего Эмилию?',
            a: [
                { t: 'Бия' },
                { t: 'Беатрис' },
                { t: 'Пак', correct: true },
                { t: 'Шамак' },
            ],
        },
        {
            q: 'Какого цвета волосы у Рам?',
            a: [
                { t: 'Голубого' },
                { t: 'Розового', correct: true },
                { t: 'Зелёного' },
                { t: 'Чёрного' },
            ],
        },
        {
            q: 'Какого цвета волосы у Рэм?',
            a: [
                { t: 'Зелёного' },
                { t: 'Розового' },
                { t: 'Голубого', correct: true },
                { t: 'Серебряного' },
            ],
        },
        {
            q: 'Что кричит Петельгейзе, убивая жертв?',
            a: [
                { t: '«Месть!»' },
                { t: '«ЛЮБОВЬ!»', correct: true },
                { t: '«Смерть!»' },
                { t: '«Ни-ге-хе-хе!»' },
            ],
        },
        {
            q: 'Кем работает Субару у Розваля?',
            a: [
                { t: 'Поваром' },
                { t: 'Слугой', correct: true },
                { t: 'Магом' },
                { t: 'Рыцарем' },
            ],
        },
        {
            q: 'Кто такой Рейнхард ван Астрея?',
            a: [
                { t: 'Торговец' },
                { t: 'Шпион' },
                { t: 'Самый сильный рыцарь Лугуники', correct: true },
                { t: 'Король' },
            ],
        },
        {
            q: 'Что любит есть Субару в новом мире?',
            a: [
                { t: 'Аппа (яблоко-тыкву)', correct: true },
                { t: 'Рамен' },
                { t: 'Пиццу' },
                { t: 'Суши' },
            ],
        },
        {
            q: 'Кто такие близнецы Они?',
            a: [
                { t: 'Эмилия и Сатэлла' },
                { t: 'Рэм и Рам', correct: true },
                { t: 'Бэатрис и Эхидна' },
                { t: 'Фриксел и Прискилла' },
            ],
        },
        // === Атмосферные / меташные ===
        {
            q: 'Какое аниме вдохновило эту игру?',
            a: [
                { t: 'Attack on Titan' },
                { t: 'Naruto' },
                { t: 'Re:Zero', correct: true },
                { t: 'Dragon Ball Z' },
            ],
        },
        {
            q: 'Что чувствуешь, идя по коридору?',
            a: [
                { t: 'Спокойствие' },
                { t: 'Радость' },
                { t: 'Страх и тревогу', correct: true },
                { t: 'Скуку' },
            ],
        },
        {
            q: 'Кто наблюдает за тобой из углов?',
            a: [
                { t: 'Никто' },
                { t: 'Красные глаза в темноте', correct: true },
                { t: 'Кошка' },
                { t: 'Ангел' },
            ],
        },
        // ═══════════════════════════════════════════════════════
        // 20 НОВЫХ ВОПРОСОВ ПО RE:ZERO
        // ═══════════════════════════════════════════════════════
        {
            q: 'Как зовут полу-эльфийку с серебряными волосами, главную героиню Re:Zero?',
            a: [
                { t: 'Рэм' },
                { t: 'Эмилия', correct: true },
                { t: 'Беатрис' },
                { t: 'Фельт' },
            ],
        },
        {
            q: 'Кто настоящая «Ведьма Зависти»?',
            a: [
                { t: 'Эхидна' },
                { t: 'Минерва' },
                { t: 'Сатэлла', correct: true },
                { t: 'Дафне' },
            ],
        },
        {
            q: 'Как зовут младшего из близнецов-демонов в особняке Розваля?',
            a: [
                { t: 'Рам' },
                { t: 'Рэм', correct: true },
                { t: 'Лия' },
                { t: 'Феррис' },
            ],
        },
        {
            q: 'Кто хозяин особняка Розваль?',
            a: [
                { t: 'Розваль Эль Меллер', correct: true },
                { t: 'Юлиус' },
                { t: 'Райнхард' },
                { t: 'Ал' },
            ],
        },
        {
            q: 'Кем является Беатрис?',
            a: [
                { t: 'Служанка' },
                { t: 'Дух библиотеки', correct: true },
                { t: 'Принцесса' },
                { t: 'Ведьма' },
            ],
        },
        {
            q: 'Какая способность есть у Субару?',
            a: [
                { t: 'Магия огня' },
                { t: 'Возврат после смерти', correct: true },
                { t: 'Невидимость' },
                { t: 'Телепортация' },
            ],
        },
        {
            q: 'Кто Великий Дух, заключённый в Эмилии?',
            a: [
                { t: 'Пак', correct: true },
                { t: 'Беатрис' },
                { t: 'Меилли' },
                { t: 'Эмилия' },
            ],
        },
        {
            q: 'Как зовут вора, ставшего одной из кандидаток в короли?',
            a: [
                { t: 'Эмилия' },
                { t: 'Анастасия' },
                { t: 'Прискилла' },
                { t: 'Фельт', correct: true },
            ],
        },
        {
            q: 'Кто «Меч Святой» в королевстве Лугуника?',
            a: [
                { t: 'Юлиус' },
                { t: 'Райнхард ван Астрэа', correct: true },
                { t: 'Вильгельм' },
                { t: 'Ал' },
            ],
        },
        {
            q: 'Как зовут архиепископа греха «Лень»?',
            a: [
                { t: 'Регулус' },
                { t: 'Сириус' },
                { t: 'Петельгейзе Романи-Конти', correct: true },
                { t: 'Капелла' },
            ],
        },
        {
            q: 'Что такое «Аура Ведьмы», окружающая Субару?',
            a: [
                { t: 'Защитное поле' },
                { t: 'Запах Сатэллы, привлекающий монстров', correct: true },
                { t: 'Магическая сила' },
                { t: 'Иллюзия' },
            ],
        },
        {
            q: 'Каков любимый напиток Субару, который он готовит для других?',
            a: [
                { t: 'Чай' },
                { t: 'Кофе', correct: true },
                { t: 'Сок' },
                { t: 'Вино' },
            ],
        },
        {
            q: 'Как называется деревня, которую Субару спас от Белого Кита?',
            a: [
                { t: 'Эринам' },
                { t: 'Лугуника' },
                { t: 'Алум' },
                { t: 'Деревня Арлам', correct: true },
            ],
        },
        {
            q: 'Что произойдёт, если Субару попытается рассказать о «Возврате после смерти»?',
            a: [
                { t: 'Ничего' },
                { t: 'Рука Ведьмы сожмёт его сердце', correct: true },
                { t: 'Он потеряет голос' },
                { t: 'Время остановится' },
            ],
        },
        {
            q: 'Как Сатэлла обращается к Субару из тьмы?',
            a: [
                { t: '«Ненавижу тебя»' },
                { t: '«Я люблю тебя»', correct: true },
                { t: '«Прощай»' },
                { t: '«Помоги»' },
            ],
        },
        {
            q: 'Сколько архиепископов греха существует в Re:Zero?',
            a: [
                { t: 'Три' },
                { t: 'Семь', correct: true },
                { t: 'Десять' },
                { t: 'Один' },
            ],
        },
        {
            q: 'Кто убил Рэм и Субару в особняке в одной из петель?',
            a: [
                { t: 'Эльза Гранхиерте', correct: true },
                { t: 'Петельгейзе' },
                { t: 'Сатэлла' },
                { t: 'Меилли' },
            ],
        },
        {
            q: 'Как зовут Великого Кита, охраняющего туман?',
            a: [
                { t: 'Чёрный Змей' },
                { t: 'Белый Кит', correct: true },
                { t: 'Кролик Великий' },
                { t: 'Кот Туманов' },
            ],
        },
        {
            q: 'В каком мире просыпается Субару после смерти в реальном мире?',
            a: [
                { t: 'В аниме мире', correct: true },
                { t: 'В компьютерной игре' },
                { t: 'В прошлом' },
                { t: 'Дома' },
            ],
        },
        {
            q: 'Какая фраза Рэм Субару произнёс в финале второго сезона?',
            a: [
                { t: '«Прощай»' },
                { t: '«Я тебя не помню»' },
                { t: '«Я люблю тебя, Субару-кун»', correct: true },
                { t: '«Иди»' },
            ],
        },
    ];

    const quizOverlay     = document.getElementById('quizOverlay');
    const quizQuestionEl  = document.getElementById('quizQuestion');
    const quizAnswersEl   = document.getElementById('quizAnswers');
    const quizDeathOverlay = document.getElementById('quizDeathOverlay');
    const quizDeathCanvas  = document.getElementById('quizDeathCanvas');
    const quizDeathCtx     = quizDeathCanvas ? quizDeathCanvas.getContext('2d') : null;
    const quizDeathText    = document.getElementById('quizDeathText');

    // Чтобы не повторять вопросы в одной игре
    const quizUsedIndices = new Set();

    function pickRandomQuiz() {
        if (quizUsedIndices.size >= QUIZ_BANK.length) quizUsedIndices.clear();
        let idx;
        do { idx = Math.floor(Math.random() * QUIZ_BANK.length); }
        while (quizUsedIndices.has(idx));
        quizUsedIndices.add(idx);
        return QUIZ_BANK[idx];
    }

    /** Показывает квиз. Возвращает Promise<boolean> — true если ответ верный. */
    function showQuiz(quiz) {
        return new Promise((resolve) => {
            quizQuestionEl.textContent = quiz.q;
            quizAnswersEl.innerHTML = '';
            // Перемешиваем ответы
            const shuffled = quiz.a.map((x) => Object.assign({}, x));
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            shuffled.forEach((ans, i) => {
                const btn = document.createElement('button');
                btn.className = 'quiz-answer';
                btn.textContent = ans.t;
                btn.style.animationDelay = (i * 90) + 'ms';
                btn.addEventListener('click', () => {
                    // Блокируем все кнопки
                    quizAnswersEl.querySelectorAll('.quiz-answer').forEach((b) => b.style.pointerEvents = 'none');
                    if (ans.correct) {
                        btn.classList.add('correct');
                        setTimeout(() => {
                            quizOverlay.classList.add('hidden');
                            resolve(true);
                        }, 700);
                    } else {
                        btn.classList.add('wrong');
                        // Показываем правильный
                        quizAnswersEl.querySelectorAll('.quiz-answer').forEach((b) => {
                            if (b.textContent === shuffled.find((a) => a.correct).t) {
                                b.classList.add('correct');
                            }
                        });
                        setTimeout(() => {
                            quizOverlay.classList.add('hidden');
                            resolve(false);
                        }, 1100);
                    }
                });
                quizAnswersEl.appendChild(btn);
            });
            quizOverlay.classList.remove('hidden');
        });
    }

    // ═══════════════════════════════════════════════════════
    // СТИЛЬНЫЕ АНИМАЦИИ СМЕРТИ ОТ КВИЗА (несколько сцен + разные подписи)
    // ═══════════════════════════════════════════════════════
    function pickQuizDeathQuote(lines) {
        return lines[Math.floor(Math.random() * lines.length)];
    }

    const QUIZ_DEATH_DAGGER_LINES = [
        '«Какое у тебя красивое сердце...» — Эльза',
        '«Я заберу его... очень аккуратно» — Эльза',
        '«Так жалко портить... но приказ есть приказ» — Эльза',
        '«Каждый удар — как комплимент твоей жизни» — Эльза',
        '«Не двигайся... почти не больно» — Эльза',
    ];
    const QUIZ_DEATH_RABBIT_LINES = [
        'Ничего не осталось. Даже костей. Только тишина леса.',
        'Лес помнит каждого. Тебя запомнил как корм.',
        'Кролики не спят. Ошибки они не прощают.',
        'Тишина... один хруст в темноте — и снова петля.',
        'Тьма кругом прыгает — красные точки смыкаются.',
    ];
    const QUIZ_DEATH_ICE_LINES = [
        '«Холод сохраняет красоту... навсегда» — Эльза',
        'Лёд пробил грудь раньше, чем ты понял ответ.',
        '«Замри... это тоже форма нежности» — голос из темноты',
        'Сосульки падают стройным хором — последний, что ты слышишь.',
    ];
    const QUIZ_DEATH_WITCH_LINES = [
        'Тьма съела правду раньше, чем ты её произнёс.',
        'Из стен шепчут то, что лучше не слышать. Ты услышал.',
        'Память режет глубже любого клинка.',
        'Коридор запомнил неверный ответ — и не простил.',
    ];
    const QUIZ_DEATH_HANDS_LINES = [
        'Слишком много рук — и ни одной, чтобы вытащить.',
        'Культ не отпускает тех, кто отвечает наугад.',
        'Из темноты тянутся пальцы — и находят тебя.',
        'Тени сжимаются со всех сторон. Выхода не было.',
    ];

    /** Веса суммарно 100 — равномерное разнообразие сцен. */
    const QUIZ_DEATH_SCENES = [
        {
            id: 'dagger',
            weight: 20,
            duration: 3800,
            pickLine: () => pickQuizDeathQuote(QUIZ_DEATH_DAGGER_LINES),
            draw: drawDaggerHeartDeath,
            captionColor: '#ff8aa0',
            captionShadow: '0 0 14px rgba(200, 20, 60, 0.85), 0 0 30px rgba(150, 0, 40, 0.55), 2px 2px 0 #000',
        },
        {
            id: 'rabbits',
            weight: 20,
            duration: 3800,
            pickLine: () => pickQuizDeathQuote(QUIZ_DEATH_RABBIT_LINES),
            draw: drawRabbitSwarmDeath,
            captionColor: '#d8b8a0',
            captionShadow: '0 0 12px rgba(120, 60, 40, 0.9), 0 0 28px rgba(40, 10, 5, 0.7), 2px 2px 0 #000',
        },
        {
            id: 'ice',
            weight: 20,
            duration: 3900,
            pickLine: () => pickQuizDeathQuote(QUIZ_DEATH_ICE_LINES),
            draw: drawIceSpikeDeath,
            captionColor: '#b8e8ff',
            captionShadow: '0 0 16px rgba(80, 200, 255, 0.75), 0 0 32px rgba(40, 120, 200, 0.45), 2px 2px 0 #000',
        },
        {
            id: 'witch',
            weight: 20,
            duration: 4000,
            pickLine: () => pickQuizDeathQuote(QUIZ_DEATH_WITCH_LINES),
            draw: drawWitchVeilDeath,
            captionColor: '#d8b0ff',
            captionShadow: '0 0 16px rgba(160, 80, 220, 0.85), 0 0 36px rgba(60, 20, 90, 0.55), 2px 2px 0 #000',
        },
        {
            id: 'hands',
            weight: 20,
            duration: 3850,
            pickLine: () => pickQuizDeathQuote(QUIZ_DEATH_HANDS_LINES),
            draw: drawShadowHandsDeath,
            captionColor: '#c4b8e8',
            captionShadow: '0 0 14px rgba(100, 80, 160, 0.9), 0 0 30px rgba(20, 10, 40, 0.65), 2px 2px 0 #000',
        },
    ];

    function pickQuizDeathScene() {
        const sum = QUIZ_DEATH_SCENES.reduce((s, x) => s + x.weight, 0);
        let r = Math.random() * sum;
        for (const sc of QUIZ_DEATH_SCENES) {
            r -= sc.weight;
            if (r <= 0) return sc;
        }
        return QUIZ_DEATH_SCENES[0];
    }

    /** Запускает случайную сцену смерти от ошибки в квизе. */
    function triggerQuizDeath() {
        return new Promise((resolve) => {
            if (!quizDeathCtx) { resolve(); return; }
            playDeathSfx();
            const scene = pickQuizDeathScene();
            const totalMs = scene.duration;
            if (quizDeathText) {
                quizDeathText.textContent = '';
                quizDeathText.style.display = 'none';
            }

            quizDeathOverlay.classList.remove('hidden');
            const startTime = performance.now();

            function frame(now) {
                const t = (now - startTime) / totalMs;
                const ctxQ = quizDeathCtx;
                const W = quizDeathCanvas.width;
                const H = quizDeathCanvas.height;

                ctxQ.clearRect(0, 0, W, H);
                scene.draw(ctxQ, W, H, t);

                if (t < 1.05) {
                    requestAnimationFrame(frame);
                } else {
                    setTimeout(() => {
                        quizDeathOverlay.classList.add('hidden');
                        resolve();
                    }, 200);
                }
            }
            requestAnimationFrame(frame);
        });
    }

    /** Анимация «кинжал в сердце». Прогресс t: 0..1. */
    function drawDaggerHeartDeath(c, W, H, t) {
        // Тёмно-красный фон с виньеткой
        const bg = c.createRadialGradient(W/2, H/2, 60, W/2, H/2, W * 0.7);
        bg.addColorStop(0, `rgba(${40 + t * 40}, 0, ${10 + t * 10}, 0.95)`);
        bg.addColorStop(1, 'rgba(0, 0, 0, 1)');
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);

        // Тряска экрана при ударе
        const shake = (t > 0.5 && t < 0.7) ? (Math.random() - 0.5) * 10 : 0;
        c.save();
        c.translate(shake, shake);

        const cx = W / 2;
        const cy = H / 2 - 20;

        // Сердце (стилизованное, не SVG)
        const pulse = 1 + Math.sin(performance.now() / 120) * 0.06;
        let heartScale = 1.6;
        if (t > 0.5) {
            // После удара сердце деформируется и сжимается
            heartScale = 1.6 - Math.min(0.9, (t - 0.5) * 1.6);
        }
        const heartY = cy + (t > 0.6 ? (t - 0.6) * 30 : 0); // оседает вниз

        c.save();
        c.translate(cx, heartY);
        c.scale(heartScale * pulse, heartScale * pulse);

        // Тень сердца
        c.fillStyle = 'rgba(0, 0, 0, 0.5)';
        c.beginPath();
        c.ellipse(0, 60, 55, 10, 0, 0, Math.PI * 2);
        c.fill();

        // Само сердце (анатомически корректное, асимметричное)
        const heartGrad = c.createRadialGradient(-15, -15, 5, 0, 10, 70);
        heartGrad.addColorStop(0, '#e8404a');
        heartGrad.addColorStop(0.5, '#a01020');
        heartGrad.addColorStop(1, '#2a0008');
        c.fillStyle = heartGrad;
        c.beginPath();
        c.moveTo(0, -40);
        c.bezierCurveTo(-50, -55, -65, -20, -40, 15);
        c.bezierCurveTo(-25, 40, -10, 55, 0, 65);
        c.bezierCurveTo(10, 55, 25, 40, 40, 15);
        c.bezierCurveTo(65, -20, 50, -55, 0, -40);
        c.fill();
        c.strokeStyle = '#1a0005';
        c.lineWidth = 1.5;
        c.stroke();

        // Сосуды сверху
        c.strokeStyle = '#8a2030';
        c.lineWidth = 5;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-15, -45); c.lineTo(-18, -65);
        c.moveTo(0, -50); c.lineTo(0, -70);
        c.moveTo(15, -45); c.lineTo(18, -65);
        c.stroke();

        // Блик
        c.fillStyle = 'rgba(255, 200, 200, 0.4)';
        c.beginPath();
        c.ellipse(-18, -15, 14, 10, -0.3, 0, Math.PI * 2);
        c.fill();

        c.restore();

        // Кинжал — прилетает справа
        const daggerProgress = Math.min(1, t / 0.55); // до 55% прогресса летит
        const daggerX = W + 200 - daggerProgress * (W / 2 - cx + 220);
        const daggerY = cy - 5;
        const daggerScale = 1 + daggerProgress * 0.4;
        const daggerRot = -0.2 + daggerProgress * 0.1;
        // После пронзения застрял
        const stuck = t >= 0.55;
        const stuckX = cx - 15;

        c.save();
        c.translate(stuck ? stuckX : daggerX, daggerY);
        c.rotate(daggerRot);
        c.scale(daggerScale, daggerScale);

        // Лезвие (длинное, блестящее)
        const bladeGrad = c.createLinearGradient(-80, 0, 30, 0);
        bladeGrad.addColorStop(0, '#c8c0d0');
        bladeGrad.addColorStop(0.5, '#ffffff');
        bladeGrad.addColorStop(1, '#808090');
        c.fillStyle = bladeGrad;
        c.beginPath();
        c.moveTo(-90, 0);
        c.lineTo(-10, -6);
        c.lineTo(15, -6);
        c.lineTo(15, 6);
        c.lineTo(-10, 6);
        c.closePath();
        c.fill();
        c.strokeStyle = '#3a3040';
        c.lineWidth = 1;
        c.stroke();

        // Режущая грань (линия)
        c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(-88, 0);
        c.lineTo(12, 0);
        c.stroke();

        // Гарда
        c.fillStyle = '#2a1810';
        c.fillRect(15, -12, 5, 24);

        // Рукоять
        c.fillStyle = '#5a3018';
        c.fillRect(20, -5, 30, 10);
        // Обмотка на рукояти (линии)
        c.strokeStyle = '#2a1810';
        c.lineWidth = 0.8;
        for (let i = 0; i < 6; i++) {
            c.beginPath();
            c.moveTo(22 + i * 4, -5);
            c.lineTo(24 + i * 4, 5);
            c.stroke();
        }
        // Навершие
        c.fillStyle = '#8a6038';
        c.beginPath();
        c.arc(52, 0, 4, 0, Math.PI * 2);
        c.fill();

        // Кровь на лезвии (после пронзения)
        if (stuck) {
            c.fillStyle = 'rgba(180, 0, 30, 0.95)';
            c.fillRect(-10, -6, 25, 12);
            // Капли
            for (let i = 0; i < 6; i++) {
                c.beginPath();
                c.arc(-5 + i * 4, 10 + Math.sin(i) * 3, 1 + (i % 2), 0, Math.PI * 2);
                c.fill();
            }
        }

        // Motion blur trail (до пронзения)
        if (!stuck) {
            c.globalAlpha = 0.3;
            c.fillStyle = bladeGrad;
            c.beginPath();
            c.moveTo(-90, -3);
            c.lineTo(30 + 40, -3);
            c.lineTo(30 + 40, 3);
            c.lineTo(-90, 3);
            c.closePath();
            c.fill();
            c.globalAlpha = 1;
        }

        c.restore();

        // Брызги крови при ударе и после
        if (t >= 0.55) {
            const splashT = (t - 0.55) / 0.45;
            c.fillStyle = `rgba(200, 0, 30, ${1 - splashT})`;
            for (let i = 0; i < 30; i++) {
                const ang = (i / 30) * Math.PI * 2;
                const dist = splashT * 250;
                const px = cx + Math.cos(ang) * dist;
                const py = heartY + Math.sin(ang) * dist;
                c.beginPath();
                c.arc(px, py, 2 + (i % 3), 0, Math.PI * 2);
                c.fill();
            }
            // Текущая кровь по центру
            c.fillStyle = `rgba(140, 0, 20, ${1 - splashT * 0.5})`;
            c.beginPath();
            c.ellipse(cx, heartY + 80, 60 + splashT * 100, 10 + splashT * 8, 0, 0, Math.PI * 2);
            c.fill();
        }

        c.restore();

        // Фейд-аут в конце
        if (t > 0.85) {
            c.fillStyle = `rgba(0, 0, 0, ${(t - 0.85) / 0.2})`;
            c.fillRect(0, 0, W, H);
        }
    }

    /** Анимация «кролики пожирают». Прогресс t: 0..1. */
    function drawRabbitSwarmDeath(c, W, H, t) {
        // Тёмный лес — фон
        const bg = c.createRadialGradient(W/2, H/2, 40, W/2, H/2, W);
        bg.addColorStop(0, 'rgba(30, 20, 15, 0.95)');
        bg.addColorStop(0.5, 'rgba(10, 5, 5, 0.95)');
        bg.addColorStop(1, '#000');
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);

        // Силуэты деревьев по краям
        c.fillStyle = '#050200';
        for (let i = 0; i < 8; i++) {
            const x = i < 4 ? i * 45 : W - (i - 4) * 45;
            const th = 300 + (i * 47 % 120);
            c.beginPath();
            c.moveTo(x - 30, H);
            c.lineTo(x - 5, H - th);
            c.lineTo(x + 5, H - th);
            c.lineTo(x + 30, H);
            c.closePath();
            c.fill();
        }

        // Силуэт Субару в центре (до 60% анимации)
        if (t < 0.65) {
            const subAlpha = Math.max(0, 1 - t * 1.2);
            c.globalAlpha = subAlpha;
            c.fillStyle = '#1a1a28';
            const sx = W / 2;
            const sy = H / 2 + 30;
            // Тело
            c.fillRect(sx - 15, sy - 10, 30, 45);
            // Голова
            c.beginPath();
            c.arc(sx, sy - 25, 14, 0, Math.PI * 2);
            c.fill();
            // Ноги
            c.fillRect(sx - 10, sy + 35, 8, 25);
            c.fillRect(sx + 2, sy + 35, 8, 25);
            // Руки (раскинуты в ужасе)
            c.strokeStyle = '#1a1a28';
            c.lineWidth = 12;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(sx - 15, sy);
            c.lineTo(sx - 45, sy + 5 - Math.sin(t * 30) * 5);
            c.moveTo(sx + 15, sy);
            c.lineTo(sx + 45, sy + 5 + Math.sin(t * 30) * 5);
            c.stroke();
            // Костюм — оранжевый оттенок в темноте
            c.fillStyle = `rgba(120, 40, 20, ${subAlpha})`;
            c.fillRect(sx - 14, sy - 8, 28, 40);
            // Красное лицо (испуг, кровь)
            c.fillStyle = `rgba(200, 60, 40, ${subAlpha})`;
            c.fillRect(sx - 6, sy - 28, 12, 4); // рот от ужаса
            // Глаза широко открыты
            c.fillStyle = `rgba(255, 255, 255, ${subAlpha})`;
            c.beginPath();
            c.arc(sx - 4, sy - 26, 2, 0, Math.PI * 2);
            c.arc(sx + 4, sy - 26, 2, 0, Math.PI * 2);
            c.fill();
            c.globalAlpha = 1;
        }

        // СТАЯ ТЁМНЫХ КРОЛИКОВ — сбегаются к центру, потом пожирают
        const rabbitCount = Math.min(40, Math.floor(8 + t * 40));
        for (let i = 0; i < rabbitCount; i++) {
            // Позиция: движение от краёв к центру
            const ang = (i * 137.5) % 360 * Math.PI / 180; // золотое сечение — равномерно по кругу
            const startDist = 380;
            const endDist = 40;
            const dist = startDist - (startDist - endDist) * Math.min(1, (t - i * 0.005) * 2);
            if (dist >= 380) continue;

            const px = W / 2 + Math.cos(ang) * dist;
            const py = H / 2 + 20 + Math.sin(ang) * dist * 0.7;

            // Прыгающее движение
            const jump = Math.sin(performance.now() / 150 + i) * 4;

            // Тело кролика
            c.fillStyle = '#000';
            c.beginPath();
            c.ellipse(px, py + jump, 14, 9, 0, 0, Math.PI * 2);
            c.fill();
            // Голова
            c.beginPath();
            c.arc(px - 10, py + jump - 2, 6, 0, Math.PI * 2);
            c.fill();
            // Уши (длинные, злые)
            c.fillRect(px - 13, py + jump - 16, 2, 12);
            c.fillRect(px - 9, py + jump - 16, 2, 12);
            // Светящиеся красные глаза
            c.fillStyle = '#ff2040';
            c.shadowColor = '#ff2040';
            c.shadowBlur = 6;
            c.beginPath();
            c.arc(px - 12, py + jump - 3, 1.5, 0, Math.PI * 2);
            c.arc(px - 8, py + jump - 3, 1.5, 0, Math.PI * 2);
            c.fill();
            c.shadowBlur = 0;
            // Острые зубы (когда близко к центру)
            if (dist < 120) {
                c.fillStyle = '#f0e0c8';
                c.beginPath();
                c.moveTo(px - 14, py + jump);
                c.lineTo(px - 13, py + jump + 3);
                c.lineTo(px - 12, py + jump);
                c.moveTo(px - 10, py + jump);
                c.lineTo(px - 9, py + jump + 3);
                c.lineTo(px - 8, py + jump);
                c.fill();
                // Кровь на зубах
                c.fillStyle = '#a00020';
                c.fillRect(px - 13, py + jump + 2, 1, 2);
                c.fillRect(px - 9, py + jump + 2, 1, 2);
            }
        }

        // Кровавый взрыв при прибытии стаи (после 60%)
        if (t > 0.6) {
            const bloodT = (t - 0.6) / 0.4;
            // Брызги крови во все стороны
            c.fillStyle = `rgba(200, 0, 30, ${1 - bloodT * 0.5})`;
            for (let i = 0; i < 60; i++) {
                const ang = (i / 60) * Math.PI * 2 + bloodT;
                const dist = bloodT * 320;
                const px = W / 2 + Math.cos(ang) * dist;
                const py = H / 2 + 20 + Math.sin(ang) * dist * 0.8;
                c.beginPath();
                c.arc(px, py, 2 + (i % 4), 0, Math.PI * 2);
                c.fill();
            }
            // Лужа крови в центре
            c.fillStyle = `rgba(100, 0, 15, ${bloodT})`;
            c.beginPath();
            c.ellipse(W / 2, H / 2 + 50, 80 + bloodT * 60, 20 + bloodT * 12, 0, 0, Math.PI * 2);
            c.fill();
            // Плавающие клочки «ткани» (остатки костюма)
            c.fillStyle = `rgba(200, 80, 40, ${0.6 * (1 - bloodT)})`;
            for (let i = 0; i < 12; i++) {
                const fx = W / 2 + Math.cos(i) * (30 + bloodT * 80);
                const fy = H / 2 + 20 + Math.sin(i * 2) * (20 + bloodT * 40);
                c.save();
                c.translate(fx, fy);
                c.rotate(i + bloodT * 5);
                c.fillRect(-4, -1, 8, 2);
                c.restore();
            }
        }

        // Вспышки красных глаз в темноте по краям
        c.fillStyle = 'rgba(255, 20, 60, 0.8)';
        for (let i = 0; i < 20; i++) {
            const ex = (i * 71) % W;
            const ey = (i * 53) % H;
            if (Math.sin(performance.now() / 200 + i * 3) > 0.6) {
                c.beginPath();
                c.arc(ex, ey, 2, 0, Math.PI * 2);
                c.fill();
            }
        }

        // Фейд-аут в конце
        if (t > 0.85) {
            c.fillStyle = `rgba(0, 0, 0, ${(t - 0.85) / 0.2})`;
            c.fillRect(0, 0, W, H);
        }
    }

    /** Лёд и падение острых сосулек на «замёрзшее» сердце (иначе, чем красный кинжал). */
    function drawIceSpikeDeath(c, W, H, t) {
        const bg = c.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, W * 0.75);
        bg.addColorStop(0, `rgba(${15 + t * 25}, ${25 + t * 35}, ${55 + t * 40}, 0.97)`);
        bg.addColorStop(1, '#000510');
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);

        const cx = W / 2;
        const cy = H / 2 - 10;
        const pulse = 1 + Math.sin(performance.now() / 200) * 0.04;

        // «Замёрзшее» сердце
        c.save();
        c.translate(cx, cy);
        c.scale(1.45 * pulse * (1 - t * 0.15), 1.45 * pulse * (1 - t * 0.15));
        const frost = c.createRadialGradient(-12, -18, 4, 0, 8, 72);
        frost.addColorStop(0, '#f0ffff');
        frost.addColorStop(0.35, '#88c8e8');
        frost.addColorStop(0.7, '#406898');
        frost.addColorStop(1, '#102038');
        c.fillStyle = frost;
        c.beginPath();
        c.moveTo(0, -38);
        c.bezierCurveTo(-48, -50, -62, -18, -38, 12);
        c.bezierCurveTo(-22, 38, -8, 52, 0, 62);
        c.bezierCurveTo(8, 52, 22, 38, 38, 12);
        c.bezierCurveTo(62, -18, 48, -50, 0, -38);
        c.fill();
        if (t > 0.35) {
            c.strokeStyle = `rgba(255,255,255,${0.4 + (t - 0.35) * 0.5})`;
            c.lineWidth = 1.2;
            for (let i = 0; i < 7; i++) {
                const ang = (i / 7) * Math.PI * 2 + t;
                c.beginPath();
                c.moveTo(Math.cos(ang) * 8, Math.sin(ang) * 6);
                c.lineTo(Math.cos(ang) * 38, Math.sin(ang) * 28);
                c.stroke();
            }
        }
        c.restore();

        // Сосульки падают сверху
        const spikes = 11;
        for (let i = 0; i < spikes; i++) {
            const stagger = i * 0.045;
            const fall = Math.min(1, Math.max(0, (t - 0.08 - stagger) / 0.42));
            const sx = 80 + (i / (spikes - 1)) * (W - 160);
            const sy = -40 + fall * (cy + 60);
            const hit = fall >= 0.98 && t > 0.12 + stagger;
            c.save();
            c.translate(sx, sy);
            c.rotate(0.08 + (i % 3) * 0.05);
            const tipGrad = c.createLinearGradient(0, -40, 0, 12);
            tipGrad.addColorStop(0, '#e8ffff');
            tipGrad.addColorStop(0.5, '#78b0d8');
            tipGrad.addColorStop(1, '#284868');
            c.fillStyle = tipGrad;
            c.beginPath();
            c.moveTo(0, -44);
            c.lineTo(7, 10);
            c.lineTo(-7, 10);
            c.closePath();
            c.fill();
            if (hit && t < 0.92) {
                c.strokeStyle = 'rgba(200, 235, 255, 0.9)';
                c.lineWidth = 2;
                c.beginPath();
                c.arc(0, 10, 8 + (t - 0.5) * 6, 0, Math.PI * 2);
                c.stroke();
            }
            c.restore();
        }

        if (t > 0.45 && t < 0.82) {
            c.fillStyle = `rgba(220, 245, 255, ${0.25 * (1 - (t - 0.45) / 0.37)})`;
            c.fillRect(0, 0, W, H);
        }

        if (t > 0.85) {
            c.fillStyle = `rgba(0, 0, 0, ${(t - 0.85) / 0.2})`;
            c.fillRect(0, 0, W, H);
        }
    }

    /** Фиолетовая вуаль, сердце тает в тумане — без Эльзы и кинжала. */
    function drawWitchVeilDeath(c, W, H, t) {
        const bg = c.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.72);
        bg.addColorStop(0, `rgba(${35 + t * 30}, ${10 + t * 15}, ${45 + t * 35}, 0.96)`);
        bg.addColorStop(0.55, 'rgba(12, 4, 22, 0.98)');
        bg.addColorStop(1, '#000');
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);

        const cx = W / 2;
        const cy = H / 2;
        const swirl = t * Math.PI * 3;

        for (let layer = 0; layer < 5; layer++) {
            c.strokeStyle = `rgba(${120 + layer * 25}, ${60 + layer * 15}, ${180 + layer * 15}, ${0.08 + layer * 0.05})`;
            c.lineWidth = 40 + layer * 22;
            c.beginPath();
            for (let a = 0; a <= Math.PI * 2; a += 0.08) {
                const r = 80 + layer * 55 + Math.sin(a * 4 + swirl) * 30;
                const x = cx + Math.cos(a + swirl * 0.3) * r;
                const y = cy + Math.sin(a + swirl * 0.3) * r * 0.72;
                if (a === 0) c.moveTo(x, y);
                else c.lineTo(x, y);
            }
            c.closePath();
            c.stroke();
        }

        const heartFade = Math.max(0, 1 - t * 1.15);
        c.globalAlpha = heartFade * 0.55;
        const hg = c.createRadialGradient(cx - 10, cy - 20, 5, cx, cy + 10, 65);
        hg.addColorStop(0, '#7040a0');
        hg.addColorStop(1, '#180818');
        c.fillStyle = hg;
        c.beginPath();
        c.moveTo(cx, cy - 35);
        c.bezierCurveTo(cx - 42, cy - 48, cx - 55, cy - 15, cx - 32, cy + 18);
        c.bezierCurveTo(cx - 18, cy + 42, cx - 5, cy + 55, cx, cy + 58);
        c.bezierCurveTo(cx + 5, cy + 55, cx + 18, cy + 42, cx + 32, cy + 18);
        c.bezierCurveTo(cx + 55, cy - 15, cx + 42, cy - 48, cx, cy - 35);
        c.fill();
        c.globalAlpha = 1;

        // Когтистые «разрывы» тумана
        if (t > 0.2) {
            const clawA = (t - 0.2) / 0.8;
            c.strokeStyle = `rgba(200, 140, 255, ${0.5 * (1 - clawA * 0.6)})`;
            c.lineWidth = 3;
            for (let k = 0; k < 6; k++) {
                const cx2 = cx + Math.cos(k * 1.05 + t * 2) * (40 + clawA * 120);
                const cy2 = cy + Math.sin(k * 1.2) * (25 + clawA * 80);
                c.beginPath();
                c.moveTo(cx2 - 30, cy2 - 40);
                c.quadraticCurveTo(cx2 + 20 * clawA, cy2, cx2 - 18, cy2 + 45);
                c.stroke();
            }
        }

        if (t > 0.85) {
            c.fillStyle = `rgba(0, 0, 0, ${(t - 0.85) / 0.2})`;
            c.fillRect(0, 0, W, H);
        }
    }

    /** Тени-руки тянутся к силуэту из краёв экрана. */
    function drawShadowHandsDeath(c, W, H, t) {
        c.fillStyle = '#050308';
        c.fillRect(0, 0, W, H);

        const cx = W / 2;
        const cy = H / 2 + 25;
        const close = Math.min(1, t * 1.35);

        // Жертва
        c.fillStyle = `rgba(35, 35, 48, ${1 - t * 0.85})`;
        c.beginPath();
        c.ellipse(cx, cy + 10, 22 * (1 - close * 0.35), 52 * (1 - close * 0.2), 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = `rgba(28, 28, 38, ${1 - t * 0.9})`;
        c.beginPath();
        c.arc(cx, cy - 38, 16, 0, Math.PI * 2);
        c.fill();

        function drawHand(side, idx, baseY) {
            const reach = close * (220 + idx * 35);
            const sx = side === 'left' ? -80 + reach : W + 80 - reach;
            const sy = baseY + Math.sin(t * 8 + idx) * 8;
            const tipX = cx + (side === 'left' ? -35 + close * 28 : 35 - close * 28);
            const tipY = cy - 10 + idx * 12;

            c.save();
            const palmGrad = c.createRadialGradient(sx, sy, 5, tipX, tipY, 90);
            palmGrad.addColorStop(0, '#0a0812');
            palmGrad.addColorStop(1, '#1a1028');
            c.fillStyle = palmGrad;
            c.strokeStyle = 'rgba(140, 90, 180, 0.55)';
            c.lineWidth = 2;
            c.beginPath();
            c.moveTo(sx, sy);
            c.quadraticCurveTo(
                cx + (side === 'left' ? -120 + close * 80 : 120 - close * 80),
                sy - 40 + idx * 20,
                tipX,
                tipY,
            );
            c.quadraticCurveTo(
                cx + (side === 'left' ? -50 : 50),
                cy + 30 + idx * 8,
                sx + (side === 'left' ? 25 : -25),
                sy + 55,
            );
            c.closePath();
            c.fill();
            c.stroke();
            // Пальцы-когти
            for (let f = 0; f < 4; f++) {
                const fx = tipX + (side === 'left' ? -f * 10 : f * 10) + (side === 'left' ? 8 : -8);
                const fy = tipY - 5 - f * 6;
                c.strokeStyle = `rgba(160, 100, 200, ${0.35 + close * 0.35})`;
                c.lineWidth = 2.5;
                c.beginPath();
                c.moveTo(fx, fy);
                c.quadraticCurveTo(fx + (side === 'left' ? -15 : 15) * close, fy - 35 * close, fx + (side === 'left' ? -6 : 6), fy - 52 * close);
                c.stroke();
            }
            c.restore();
        }

        drawHand('left', 0, cy - 40);
        drawHand('right', 1, cy - 55);
        drawHand('left', 2, cy + 30);
        drawHand('right', 3, cy + 45);

        // Глаза в темноте
        if (t > 0.35) {
            c.fillStyle = `rgba(200, 120, 255, ${0.15 + Math.sin(performance.now() / 180) * 0.08})`;
            for (let e = 0; e < 16; e++) {
                const ex = ((e * 97) % W);
                const ey = ((e * 71 + t * 40) % H);
                c.fillRect(ex, ey, 3, 2);
            }
        }

        if (t > 0.85) {
            c.fillStyle = `rgba(0, 0, 0, ${(t - 0.85) / 0.2})`;
            c.fillRect(0, 0, W, H);
        }
    }

    /** Тайные комнаты отключены */
    async function triggerSecretReveal(_quest, _bookRow) {
        return;
        currentReveal = { quest, startTime: performance.now(), overlayShownAt: 0 };

        // Приглушаем музыку
        fadeMusic(BG_VOLUME * 0.25, 500);

        // ФАЗА 1: в игре стена раскрывается (на канвасе)
        const wallPos = findWallOpeningCellForBookRow(bookRow) || getSecretWallPosition(quest.id);
        if (wallPos) {
            openingWall = { col: wallPos.col, row: wallPos.row, startTime: performance.now(), phase: 'opening' };
            screenShakeUntil = performance.now() + 2500; // тряска во время открытия
            statusEl.className = 'status-line danger';
            statusEl.textContent = '🧱 Стена трещит... что-то открывается...';

            // Даём игроку увидеть открытие
            await sleep(2500);
        }

        // ФАЗА 2: DOM-оверлей с картинкой сцены
        fadeMusic(BG_VOLUME * 0.1, 400);

        const overlay = document.getElementById('secretSceneOverlay');
        const video = document.getElementById('secretVideo');
        const narrator = document.getElementById('secretNarrator');
        const titleEl = document.getElementById('secretTitle');

        video.src = quest.video;
        video.muted = true;
        video.loop = true;
        titleEl.textContent = '';
        if (titleEl) titleEl.style.display = 'none';
        if (narrator) {
            narrator.innerHTML = '';
            narrator.hidden = true;
            narrator.style.display = 'none';
        }
        video.onerror = () => { /* только видео, без текстовых подписей */ };

        overlay.classList.remove('closing', 'hidden');
        void overlay.offsetWidth;
        overlay.classList.add('opening');

        // Запускаем видео
        try {
            video.currentTime = 0;
            const p = video.play();
            if (p && p.catch) p.catch(() => {});
        } catch (_) { /* noop */ }

        currentReveal.overlayShownAt = performance.now();
    }

    /** Закрытие: (1) видео скрывается, (2) стена в игре закрывается. */
    async function closeSecretReveal() {
        if (state !== GameState.SECRET_REVEAL) return;

        // Фаза 1: DOM-оверлей исчезает + останавливаем видео
        const overlay = document.getElementById('secretSceneOverlay');
        const video = document.getElementById('secretVideo');
        overlay.classList.remove('opening');
        overlay.classList.add('closing');
        await sleep(900);
        overlay.classList.add('hidden');
        overlay.classList.remove('closing');
        if (video) {
            try { video.pause(); video.currentTime = 0; video.removeAttribute('src'); video.load(); } catch (_) {}
        }

        // Фаза 2: стена в игре закрывается обратно
        if (openingWall) {
            openingWall.phase = 'closing';
            openingWall.startTime = performance.now();
            screenShakeUntil = performance.now() + 800;
            statusEl.className = 'status-line';
            statusEl.textContent = 'Стена запечаталась. Будто её и не было.';
            await sleep(1500);
            openingWall = null;
        }

        currentReveal = null;
        fadeMusic(BG_VOLUME, 500);

        state = GameState.PLAYING;
        setTimeout(showNextQuestHint, 1200);
    }

    // ── Фразы Сатэллы (красный дрожащий текст) ─────────────
    const SATELLA_PHRASES = [
        'Я ЛЮБЛЮ ТЕБЯ',
        'СУБАРУ...',
        'Я ТАК ТЕБЯ ЛЮБЛЮ',
        'НЕ УХОДИ',
        'ПОСМОТРИ НА МЕНЯ',
        'Я ЛЮБЛЮ ТЕБЯ, СУБАРУ',
        'ТЫ МОЙ',
        'Я ТЕБЯ НЕ ОТПУЩУ',
    ];

    /** Цикл смены фраз Сатэллы на экране проклятия. */
    let satellaPhraseTimer = null;
    function startSatellaPhraseCycle() {
        if (!witchLove) return;
        const pool = SATELLA_PHRASES.slice();
        let idx = 0;
        witchLove.textContent = pool[0];
        witchLove.classList.remove('phrase-change');
        satellaPhraseTimer = setInterval(() => {
            idx = (idx + 1) % pool.length;
            witchLove.classList.remove('phrase-change');
            // reflow, чтобы анимация переиграла
            void witchLove.offsetWidth;
            witchLove.textContent = pool[idx];
            witchLove.classList.add('phrase-change');
        }, 1700 + Math.random() * 400);
    }

    function stopSatellaPhraseCycle() {
        if (satellaPhraseTimer) {
            clearInterval(satellaPhraseTimer);
            satellaPhraseTimer = null;
        }
    }

    async function triggerWitchHand() {
        if (witchActive) return;
        witchActive = true;
        witchStrikes++;
        minkoAnswer.disabled = true;
        minkoSubmit.disabled = true;

        stopSatellaPhraseCycle();
        witchHand.classList.add('hidden');
        witchHeart.classList.remove('squeezing', 'shattering');
        witchHandClaw.classList.remove('grabbing', 'fast');
        if (witchHandBack) witchHandBack.classList.remove('grabbing', 'fast');
        witchHand.classList.remove('sanity-loss', 'flashing');

        fadeMusic(BG_VOLUME * 0.15, 400);

        // ── 1-й страйк: «запретное слово 1», можно ответить снова ──
        if (witchStrikes === 1) {
            try {
                if (iLoveYouSfx) {
                    iLoveYouSfx.volume = I_LOVE_YOU_VOLUME;
                    iLoveYouSfx.currentTime = 0;
                    const p = iLoveYouSfx.play();
                    if (p && p.catch) p.catch(() => {});
                }
            } catch (_) {}

            await playCurseBlackScreen(1, 3200);
            if (iLoveYouSfx) fadeAudioOut(iLoveYouSfx, 600);

            minkoAnswer.disabled = false;
            minkoAnswer.value = '';
            minkoSubmit.disabled = false;

            minkoText.innerHTML =
                '*вздрагивает и хватается за грудь*<br>...что ты только что сказал?.. мне стало очень плохо...<br><em>Не произноси это снова — некоторые слова здесь под проклятием.</em>';
            minkoAnswer.placeholder = '...скажи иначе, без запретного...';
            minkoHint.className = 'minko-hint warned';
            minkoHint.innerHTML =
                '⚠️ ТЫ РЕАЛЬНО ХОЧЕШЬ ЭТО СКАЗАТЬ? ЗНАЕШЬ, ЧТО МОЖЕТ ПРОИЗОЙТИ!';
            minkoAnswer.focus();
            fadeMusic(BG_VOLUME * 0.45, 800);
            witchActive = false;
            return;
        }

        // ── 2-й страйк: мелодия до конца + aishiteru на языках → новый коридор ──
        const melodyDone = (async () => {
            try {
                if (!iLoveYouSfx) {
                    await sleep(5000);
                    return;
                }
                iLoveYouSfx.volume = I_LOVE_YOU_VOLUME;
                iLoveYouSfx.currentTime = 0;
                const p = iLoveYouSfx.play();
                if (p && p.catch) await p.catch(() => {});
                else if (p) await p;
                await waitForAudioEnd(iLoveYouSfx, 14000);
            } catch (_) {
                await sleep(5000);
            }
        })();
        await playCurseBlackScreen(2, 14000, melodyDone);

        minkoDialog.classList.add('hidden');
        stopMinkoVideo();
        if (iLoveYouSfx) {
            try {
                iLoveYouSfx.pause();
                iLoveYouSfx.currentTime = 0;
            } catch (_) {}
        }
        playDeathSfx();

        await fullResetWithRandomLevel();
        statusEl.className = 'status-line danger';
        statusEl.textContent = 'Проклятие сработало. Коридор изменился — запоминай новый путь.';
        witchActive = false;
    }

    async function sanityLossSuicide() {
        playDeathSfx();
        fadeMusic(BG_VOLUME * 0.1, 500);
        // Экран смерти не показываем — только пауза, чтобы музыка/эффекты отыграли
        await sleep(2500);
    }

    async function fullResetWithRandomLevel() {
        LEVEL_DEF = generateRandomLevelSafe();
        loop = 1;
        deaths = 0;
        witchStrikes = 0;
        deathEffect = null;
        questDone.clear();
        progressCounters.quizCorrect = 0;
        progressCounters.trapsAvoided = 0;
        renderQuestPanel();
        loopCountEl.textContent = loop;
        deathCountEl.textContent = deaths;
        minko.wake = 0;
        buildLevel();
        subaru.x = defaultSpawnX;
        subaru.y = defaultSpawnY;
        subaru.alive = true;
        subaru.blink = 1.0;
        subaru.walkCycle = 0;
        snapCameraToSubaru();
        statusEl.className = 'status-line danger';
        statusEl.textContent = 'Коридор изменился. Запоминай новый путь с нуля.';
        fadeMusic(BG_VOLUME, 800);
        state = GameState.PLAYING;
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 14. ХОРРОР-СОБЫТИЯ (рандом) ░░░
    // ══════════════════════════════════════════════════════
    const WHISPERS = [
        '...не оглядывайся...', '...ещё шаг...', '...позади...',
        '...ты умрёшь здесь...', '...она зовёт тебя...', '...кровь пахнет...',
        '...ты не пройдёшь...', '...снова...', '...я чую тебя...',
        '...один шаг...', '...ближе...', '...стой...', '...беги...',
        '...она смотрит...', '...сатэлла~...', '...не так глубоко...',
        '...тут кто-то был...', '...и не один...', '...я помню тебя...',
        '...ещё раз...', '...снова умри...', '...больше не уйдёшь...',
    ];

    function updateHorror(now) {
        if (state !== GameState.PLAYING) return;

        if (now > nextEventTimes.whisper) {
            if (Math.random() < 0.35) spawnWhisper();
            nextEventTimes.whisper = now + 8000 + Math.random() * 16000;
        }
        if (now > nextEventTimes.jumpscare) {
            if (Math.random() < 0.85) spawnJumpscare();
            // 10-25 секунд между скримерами
            nextEventTimes.jumpscare = now + 10000 + Math.random() * 15000;
        }
        if (now > nextEventTimes.torchOut) {
            if (Math.random() < 0.3) spawnTorchOutage(now);
            nextEventTimes.torchOut = now + 18000 + Math.random() * 15000;
        }
        if (now > nextEventTimes.bloodDrip) {
            if (Math.random() < 0.55) spawnBloodDrip();
            nextEventTimes.bloodDrip = now + 8000 + Math.random() * 12000;
        }
        if (now > nextEventTimes.flicker) {
            if (Math.random() < 0.25) triggerFlicker(now);
            nextEventTimes.flicker = now + 15000 + Math.random() * 25000;
        }
        // Рандомный квиз отключён
    }

    /** Рандомный квиз отключён */
    async function triggerRandomQuiz() {}

    function spawnWhisper() {
        const el = document.createElement('div');
        el.className = 'whisper' + (Math.random() < 0.3 ? ' flicker' : '');
        el.textContent = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
        const onLeft = Math.random() < 0.5;
        const topPct = 12 + Math.random() * 60;
        el.style.top = topPct + '%';
        el.style[onLeft ? 'left' : 'right'] = (2 + Math.random() * 8) + '%';
        el.style.textAlign = onLeft ? 'left' : 'right';
        gameWrap.appendChild(el);
        setTimeout(() => el.remove(), 3600);
    }

    function spawnBloodDrip() {
        const el = document.createElement('div');
        el.className = 'blood-drip' + (Math.random() < 0.3 ? ' thick' : '');
        el.style.left = (5 + Math.random() * 90) + '%';
        el.style.animationDuration = (1.6 + Math.random() * 1.8) + 's';
        gameWrap.appendChild(el);
        setTimeout(() => el.remove(), 3800);
    }

    // ── 8 РАЗНЫХ «КЛАССИЧЕСКИХ» ДЖАМПСКЕРОВ ──────────────
    const JUMPSCARE_TYPES = [
        'satella', 'petelgeuse', 'elsa', 'rem_demon',
        'subaru_bleeding', 'whale_eye', 'claw_hand', 'shadow_cultist',
    ];
    // ── 30 ПРОЦЕДУРНЫХ СКРИМЕРОВ (генерируются через параметры) ──
    const GENERIC_SCARES = [
        // 1. Окровавленное лицо с пустыми глазами
        { skin:'#e8d0c8', face:'oval', eyes:'empty', eyeColor:'#000', mouth:'gaping_blood', teeth:'sharp_blood', hair:'long_black', mark:'tear_blood' },
        // 2. Череп с горящими глазами
        { skin:'#f0ebd8', face:'skull', eyes:'glowing', eyeColor:'#ff2200', mouth:'grin_skull', teeth:'broken', hair:'none', mark:'crack' },
        // 3. Демон с рогами
        { skin:'#3a1a1a', face:'wide', eyes:'glowing', eyeColor:'#ffaa00', mouth:'demonic', teeth:'sharp', hair:'wild_red', accessory:'horns_big' },
        // 4. Бледная девушка с длинными волосами
        { skin:'#fff5f0', face:'long', eyes:'crossed_dark', eyeColor:'#440000', mouth:'closed_blood', teeth:'none', hair:'long_black_wet', mark:'tear_blood' },
        // 5. Зашитое лицо
        { skin:'#a89888', face:'oval', eyes:'sewn', eyeColor:'#000', mouth:'sewn', teeth:'none', hair:'short_dark', mark:'stitches' },
        // 6. Огромный одиночный глаз (циклоп)
        { skin:'#5a3838', face:'round', eyes:'one_huge', eyeColor:'#ffff00', mouth:'gaping', teeth:'sharp', hair:'wild', mark:'veins' },
        // 7. Вампир с клыками
        { skin:'#f8e8e8', face:'oval', eyes:'glowing', eyeColor:'#ff0033', mouth:'fangs_blood', teeth:'fangs', hair:'slicked_back', mark:'blood_lips' },
        // 8. Гнилое лицо зомби
        { skin:'#6a8060', face:'oval', eyes:'rotten', eyeColor:'#a8a040', mouth:'rotten_grin', teeth:'rotten', hair:'patchy', mark:'wounds' },
        // 9. Лицо марионетки с трещинами
        { skin:'#ddd8c8', face:'porcelain', eyes:'doll', eyeColor:'#3050a0', mouth:'doll_smile', teeth:'normal', hair:'curly_dark', mark:'porcelain_cracks' },
        // 10. Висельник с верёвкой
        { skin:'#80a890', face:'long', eyes:'rolled_back', eyeColor:'#fff', mouth:'tongue_out', teeth:'none', hair:'messy_long', accessory:'noose' },
        // 11. Сатанинский монах в капюшоне
        { skin:'#000', face:'hidden', eyes:'glowing', eyeColor:'#ff0044', mouth:'none', teeth:'none', hair:'none', accessory:'hood_black', mark:'pentagram' },
        // 12. Утопленница, синие губы
        { skin:'#b8c8d0', face:'oval', eyes:'crossed_dark', eyeColor:'#003040', mouth:'closed_blue', teeth:'none', hair:'wet_black_long', mark:'water_drips' },
        // 13. Безумно улыбающийся клоун
        { skin:'#fff8f0', face:'wide', eyes:'crazy', eyeColor:'#ff0033', mouth:'huge_grin', teeth:'sharp', hair:'wild_red', accessory:'clown_makeup' },
        // 14. Призрачный ребёнок
        { skin:'#e0d8d8', face:'small', eyes:'empty', eyeColor:'#000', mouth:'sad', teeth:'none', hair:'short_messy', mark:'transparency' },
        // 15. Слепая монахиня
        { skin:'#d8c8b8', face:'long', eyes:'closed_blood', eyeColor:'#400000', mouth:'whispering', teeth:'normal', hair:'none', accessory:'nun_veil' },
        // 16. Чёрный силуэт с горящими глазами
        { skin:'#000', face:'silhouette', eyes:'two_pairs', eyeColor:'#ff0033', mouth:'none', teeth:'none', hair:'none', mark:'shadow_aura' },
        // 17. Ведьма с крючковатым носом
        { skin:'#807060', face:'witch', eyes:'narrow', eyeColor:'#80ff00', mouth:'cackle', teeth:'rotten', hair:'wild_grey', accessory:'witch_hat' },
        // 18. Демон с тремя глазами
        { skin:'#601818', face:'wide', eyes:'three', eyeColor:'#ffff00', mouth:'fangs', teeth:'sharp', hair:'wild_black', mark:'demonic_runes' },
        // 19. Ужасная кукла с разбитой щекой
        { skin:'#f0e8d8', face:'doll', eyes:'doll_crack', eyeColor:'#306080', mouth:'cracked_smile', teeth:'normal', hair:'curly_blonde', mark:'broken_face' },
        // 20. Слишком вытянутое лицо («длинный человек»)
        { skin:'#e0d0c0', face:'extreme_long', eyes:'narrow_black', eyeColor:'#000', mouth:'small_grin', teeth:'sharp', hair:'short_dark', mark:'long_neck' },
        // 21. Демоница с языком
        { skin:'#c83838', face:'wide', eyes:'glowing', eyeColor:'#ffff00', mouth:'tongue_long', teeth:'sharp', hair:'long_red', accessory:'horns_small' },
        // 22. Невеста-труп
        { skin:'#d8c8c0', face:'oval', eyes:'one_missing', eyeColor:'#000', mouth:'closed_blood', teeth:'none', hair:'long_white_torn', accessory:'bridal_veil', mark:'wounds' },
        // 23. Безголовый всадник
        { skin:'#000', face:'no_head', eyes:'none', eyeColor:'#000', mouth:'none', teeth:'none', hair:'none', mark:'neck_blood' },
        // 24. Лицо в зеркале (раздвоенное)
        { skin:'#e8d8c8', face:'split', eyes:'one_each_side', eyeColor:'#000', mouth:'split_grin', teeth:'sharp', hair:'short_messy', mark:'mirror_cracks' },
        // 25. Девочка с дырами в лице
        { skin:'#c8b8a8', face:'oval', eyes:'hole_face', eyeColor:'#000', mouth:'hole_face', teeth:'none', hair:'twin_tails', mark:'face_holes' },
        // 26. Тёмная фигура с длинными руками
        { skin:'#100000', face:'thin', eyes:'tiny_white', eyeColor:'#fff', mouth:'horizontal_line', teeth:'none', hair:'none', accessory:'long_arms' },
        // 27. Окровавленный охотник
        { skin:'#a06050', face:'masculine', eyes:'crazy', eyeColor:'#fff', mouth:'grin_blood', teeth:'sharp_blood', hair:'short_blood', mark:'blood_splatter' },
        // 28. Демоническая Минко (чёрные глаза)
        { skin:'#f8e8f0', face:'minko', eyes:'pure_black', eyeColor:'#000', mouth:'creepy_smile', teeth:'sharp', hair:'pink_long', mark:'sakura_blood' },
        // 29. Гигантский зрачок
        { skin:'transparent', face:'eye_only', eyes:'massive_pupil', eyeColor:'#ff0033', mouth:'none', teeth:'none', hair:'none', mark:'tear_blood' },
        // 30. Окровавленная пасть с зубами
        { skin:'transparent', face:'mouth_only', eyes:'none', eyeColor:'#000', mouth:'massive_jaws', teeth:'massive_sharp', hair:'none', mark:'blood_drool' },
    ];
    let jumpscareType = 'satella';
    let genericScareParams = null;

    function spawnJumpscare() {
        // Предупреждающее мерцание 150мс перед скримером (для неожиданности)
        flickerUntil = performance.now() + 150;
        setTimeout(() => {
            // 75% — процедурные (30 вариантов), 25% — классические 8
            if (Math.random() < 0.75) {
                jumpscareType = 'generic';
                genericScareParams = GENERIC_SCARES[Math.floor(Math.random() * GENERIC_SCARES.length)];
            } else {
                jumpscareType = JUMPSCARE_TYPES[Math.floor(Math.random() * JUMPSCARE_TYPES.length)];
                genericScareParams = null;
            }
            jumpscareUntil = performance.now() + 280;
            screenShakeUntil = performance.now() + 420;
            // DOM вспышка (без «мелодии смерти»)
            const flash = document.createElement('div');
            flash.className = 'jumpscare-flash';
            gameWrap.appendChild(flash);
            setTimeout(() => flash.remove(), 280);
        }, 150);
    }

    function triggerFlicker(now) {
        flickerUntil = now + 700;
    }

    function spawnTorchOutage(now) {
        const candleKeys = [];
        for (let r = 0; r < GRID_H; r++) {
            if (wallDecor[r].left === 'candle') candleKeys.push(r + ':left');
            if (wallDecor[r].right === 'candle') candleKeys.push(r + ':right');
        }
        if (candleKeys.length === 0) return;
        const pick = candleKeys[Math.floor(Math.random() * candleKeys.length)];
        torchOutages.set(pick, now + 5000 + Math.random() * 5000);
    }

    function isTorchOut(row, side, now) {
        const key = row + ':' + side;
        const until = torchOutages.get(key);
        if (!until) return false;
        if (now >= until) { torchOutages.delete(key); return false; }
        return true;
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 15. ОТРИСОВКА ░░░
    // ══════════════════════════════════════════════════════
    function drawBackdrop() {
        ctx.fillStyle = '#060310';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    function drawFloorTile(col, row, sx, sy) {
        let h = ((col * 73856093) ^ (row * 19349663)) >>> 0;
        const shade = (h % 20) - 10;
        const base = 36 + shade;
        ctx.fillStyle = `rgb(${base}, ${base - 6}, ${base + 4})`;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
        ctx.strokeStyle = 'rgba(120, 80, 130, 0.08)';
        ctx.strokeRect(sx + 3.5, sy + 3.5, TILE - 7, TILE - 7);
        h = (h * 2654435761) >>> 0;
        if ((h & 7) === 0) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            const x1 = sx + 5 + (h & 15);
            const y1 = sy + 8 + ((h >> 4) & 15);
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 + 12, y1 + 8);
            ctx.lineTo(x1 + 20, y1 + 5);
            ctx.stroke();
        } else if ((h & 15) === 1) {
            ctx.fillStyle = 'rgba(120, 20, 30, 0.18)';
            ctx.beginPath();
            ctx.arc(sx + 20 + ((h >> 2) & 15), sy + 20 + ((h >> 6) & 15), 6 + ((h >> 8) & 3), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawWallTile(col, row, sx, sy) {
        const grad = ctx.createLinearGradient(sx, sy, sx, sy + TILE);
        grad.addColorStop(0, '#1a1020');
        grad.addColorStop(1, '#0a0612');
        ctx.fillStyle = grad;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = 'rgba(80, 50, 90, 0.25)';
        ctx.lineWidth = 1;
        const brickH = 20;
        for (let i = 0; i < 3; i++) {
            const by = sy + i * brickH;
            ctx.beginPath(); ctx.moveTo(sx, by); ctx.lineTo(sx + TILE, by); ctx.stroke();
            const offset = (i % 2 === 0) ? TILE / 2 : 0;
            ctx.beginPath(); ctx.moveTo(sx + offset, by); ctx.lineTo(sx + offset, by + brickH); ctx.stroke();
        }
        const isLeftWall = col < 2;
        const isRightWall = col > 9;
        if (!isLeftWall && !isRightWall) return;
        const innerCol = isLeftWall ? 1 : 10;
        if (col !== innerCol) return;
        const deco = isLeftWall ? wallDecor[row].left : wallDecor[row].right;
        const centerX = sx + TILE / 2;
        const centerY = sy + TILE / 2;
        ctx.save();
        switch (deco) {
            case 'skull':  drawSkull(centerX, centerY); break;
            case 'ribs':   drawRibs(centerX, centerY); break;
            case 'blood':  drawBloodStain(centerX, centerY); break;
            case 'candle': drawCandle(centerX, sy + 10, isTorchOut(row, isLeftWall ? 'left' : 'right', performance.now())); break;
            case 'crack':  drawCrack(sx, sy); break;
        }
        ctx.restore();
    }

    function drawSkull(cx, cy) {
        ctx.fillStyle = '#c8bfb0';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.arc(cx, cy - 3, 10, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#a89c8c';
        roundRect(ctx, cx - 8, cy + 5, 16, 7, 3); ctx.fill();
        ctx.fillStyle = '#0a0510';
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(cx + 4, cy - 2, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy + 2); ctx.lineTo(cx - 1.5, cy + 5); ctx.lineTo(cx + 1.5, cy + 5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#0a0510';
        ctx.lineWidth = 0.5;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath(); ctx.moveTo(cx + i * 3, cy + 6); ctx.lineTo(cx + i * 3, cy + 11); ctx.stroke();
        }
    }

    function drawRibs(cx, cy) {
        ctx.strokeStyle = '#a89886';
        ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke();
        ctx.lineWidth = 1.8;
        for (let i = -1; i <= 1; i++) {
            const y = cy + i * 6;
            ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx - 12, y + 2, cx - 13, y + 6); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx + 12, y + 2, cx + 13, y + 6); ctx.stroke();
        }
    }

    function drawBloodStain(cx, cy) {
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 16);
        grad.addColorStop(0, 'rgba(180, 20, 40, 0.75)');
        grad.addColorStop(0.6, 'rgba(120, 10, 25, 0.55)');
        grad.addColorStop(1, 'rgba(80, 5, 15, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(cx, cy, 16, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(140, 10, 25, 0.55)';
        for (let i = -1; i <= 1; i++) {
            const x = cx + i * 5;
            ctx.fillRect(x - 1, cy + 8, 2, 10 + Math.abs(i) * 3);
        }
    }

    function drawCandle(cx, topY, isOut) {
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(cx - 6, topY + 28, 12, 4);
        ctx.fillRect(cx - 1, topY + 20, 2, 12);
        ctx.fillStyle = '#e8d8b0';
        ctx.fillRect(cx - 2, topY + 12, 4, 10);
        if (isOut) {
            // Дым
            const t = performance.now() / 200;
            ctx.fillStyle = 'rgba(180, 180, 200, 0.25)';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(cx + Math.sin(t + i) * 3, topY + 4 - i * 6, 3 + i * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }
        const flickerT = performance.now() / 100;
        const flicker = Math.sin(flickerT) * 0.8 + Math.cos(flickerT * 1.3) * 0.5;
        ctx.fillStyle = '#ff9933';
        ctx.beginPath();
        ctx.ellipse(cx + flicker * 0.4, topY + 8, 3, 6 + flicker * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffee88';
        ctx.beginPath();
        ctx.ellipse(cx + flicker * 0.4, topY + 9, 1.5, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawCrack(sx, sy) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + 10, sy + 5); ctx.lineTo(sx + 20, sy + 22);
        ctx.lineTo(sx + 15, sy + 40); ctx.lineTo(sx + 28, sy + 55);
        ctx.stroke();
    }

    function drawCandlelight() {
        const now = performance.now();
        for (let r = 0; r < GRID_H; r++) {
            if (wallDecor[r].left === 'candle' && !isTorchOut(r, 'left', now)) {
                const sy = r * TILE - camY + 10;
                drawCandleGlow(TILE + TILE / 2, sy);
            }
            if (wallDecor[r].right === 'candle' && !isTorchOut(r, 'right', now)) {
                const sy = r * TILE - camY + 10;
                drawCandleGlow(10 * TILE + TILE / 2, sy);
            }
        }
    }

    function drawCandleGlow(cx, cy) {
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 80);
        grad.addColorStop(0, 'rgba(255, 180, 80, 0.35)');
        grad.addColorStop(0.5, 'rgba(200, 120, 50, 0.12)');
        grad.addColorStop(1, 'rgba(200, 120, 50, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - 80, cy - 80, 160, 160);
    }

    /** Рисует дверь на конкретном ряду. */
    function drawDoorAt(row, isOpen, type) {
        const sy = row * TILE - camY;
        if (sy > CANVAS_H || sy + TILE < 0) return;
        for (let c = 2; c <= 9; c++) {
            const sx = c * TILE;
            if (!isOpen) {
                // Закрытая дверь: базовый стиль + тип
                const grad = ctx.createLinearGradient(sx, sy, sx, sy + TILE);
                if (type === 'lever') {
                    grad.addColorStop(0, '#2a1818');
                    grad.addColorStop(1, '#1a0e12');
                } else if (type === 'seq') {
                    grad.addColorStop(0, '#1a1234');
                    grad.addColorStop(1, '#0a0820');
                } else { // key
                    grad.addColorStop(0, '#2a2010');
                    grad.addColorStop(1, '#120a00');
                }
                ctx.fillStyle = grad;
                ctx.fillRect(sx, sy, TILE, TILE);

                // Заклёпки
                ctx.fillStyle = type === 'seq' ? '#5a4a7a' : type === 'key' ? '#7a6030' : '#5a4040';
                for (const [dx, dy] of [[10, 10], [TILE - 10, 10], [10, TILE - 10], [TILE - 10, TILE - 10]]) {
                    ctx.beginPath();
                    ctx.arc(sx + dx, sy + dy, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                // Горизонтальная полоса
                ctx.fillStyle = type === 'seq' ? '#2a1e4a' : type === 'key' ? '#3a2a10' : '#4a2a30';
                ctx.fillRect(sx, sy + TILE / 2 - 3, TILE, 6);

                // Центральная иконка (только на центральных тайлах)
                if (c === 5 || c === 6) {
                    if (type === 'lever') {
                        // Замочная скважина
                        ctx.fillStyle = '#000';
                        ctx.beginPath();
                        ctx.arc(sx + TILE / 2, sy + TILE / 2, 3, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillRect(sx + TILE / 2 - 1, sy + TILE / 2, 2, 7);
                    } else if (type === 'seq') {
                        // Печать — 3 руны
                        ctx.strokeStyle = '#a78bfa';
                        ctx.lineWidth = 1.5;
                        for (let i = 0; i < 3; i++) {
                            ctx.strokeRect(sx + 12 + i * 13, sy + TILE / 2 - 5, 10, 10);
                        }
                        // Подсвечиваем активированные печати
                        ctx.fillStyle = '#a78bfa';
                        for (let i = 0; i < seqProgress && c === 5; i++) {
                            ctx.fillRect(sx + 13 + i * 13, sy + TILE / 2 - 4, 8, 8);
                        }
                    } else { // key
                        // Большая золотая скважина
                        ctx.fillStyle = '#000';
                        ctx.beginPath();
                        ctx.arc(sx + TILE / 2, sy + TILE / 2 - 3, 5, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillRect(sx + TILE / 2 - 2, sy + TILE / 2, 4, 10);
                        ctx.strokeStyle = '#d4a043';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.arc(sx + TILE / 2, sy + TILE / 2 - 3, 7, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
                ctx.strokeStyle = '#000';
                ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
            } else {
                // Открытая: базовый пол + тёмный свод сверху + свет из-за
                drawFloorTile(c, row, sx, sy);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(sx, sy, TILE, 8);
                let glowColor;
                if (type === 'lever') glowColor = [200, 180, 120];
                else if (type === 'seq') glowColor = [180, 140, 255];
                else glowColor = [255, 220, 140];
                const glow = ctx.createLinearGradient(sx, sy, sx, sy + TILE);
                glow.addColorStop(0, `rgba(${glowColor[0]}, ${glowColor[1]}, ${glowColor[2]}, 0.25)`);
                glow.addColorStop(1, `rgba(${glowColor[0]}, ${glowColor[1]}, ${glowColor[2]}, 0)`);
                ctx.fillStyle = glow;
                ctx.fillRect(sx, sy, TILE, TILE);
            }
        }
    }

    function drawLever() {
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                if (tiles[r][c] !== T.LEVER) continue;
                const sx = c * TILE;
                const sy = r * TILE - camY;
                if (sy > CANVAS_H || sy + TILE < 0) continue;
                ctx.fillStyle = '#3a2a3a';
                roundRect(ctx, sx + 12, sy + 30, TILE - 24, 18, 3); ctx.fill();
                ctx.strokeStyle = 'rgba(167, 139, 250, 0.3)'; ctx.stroke();
                const angle = leverPulled ? Math.PI / 4 : -Math.PI / 4;
                const baseX = sx + TILE / 2;
                const baseY = sy + 35;
                const tipX = baseX + Math.sin(angle) * 22;
                const tipY = baseY - Math.cos(angle) * 22;
                ctx.strokeStyle = '#8a7090';
                ctx.lineWidth = 4; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(tipX, tipY); ctx.stroke();
                ctx.fillStyle = leverPulled ? '#ff4466' : '#c8c0d8';
                ctx.beginPath(); ctx.arc(tipX, tipY, 5, 0, Math.PI * 2); ctx.fill();
                if (leverPulled) {
                    ctx.shadowColor = '#ff4466'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
                }
            }
        }
    }

    /** Рисует все столы с книгами. Книга парит, страницы подсвечиваются. */
    function drawBookTables() {
        const now = performance.now();
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                if (tiles[r][c] !== T.BOOK) continue;
                const sx = c * TILE;
                const sy = r * TILE - camY;
                if (sy < -80 || sy > CANVAS_H + 80) continue;

                const quest = getQuestForBookRow(r);
                const done = quest && questDone.has(quest.id);
                drawOneBookTable(sx, sy, now, done);
            }
        }
    }

    function drawOneBookTable(sx, sy, now, done) {
        const cx = sx + TILE / 2;
        const cy = sy + TILE / 2;
        const t = now / 1000;

        // Тень под столом
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 22, 25, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // СТОЛ (деревянный)
        const tableGrad = ctx.createLinearGradient(cx, cy + 8, cx, cy + 24);
        tableGrad.addColorStop(0, '#6a4228');
        tableGrad.addColorStop(1, '#3a2018');
        ctx.fillStyle = tableGrad;
        roundRect(ctx, cx - 24, cy + 8, 48, 14, 3);
        ctx.fill();
        ctx.strokeStyle = '#2a1810';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Столешница — светлая полоска
        ctx.fillStyle = '#8a6030';
        ctx.fillRect(cx - 23, cy + 9, 46, 2);
        // Ножки стола
        ctx.fillStyle = '#4a2818';
        ctx.fillRect(cx - 22, cy + 22, 3, 8);
        ctx.fillRect(cx + 19, cy + 22, 3, 8);

        // ПАРЯЩАЯ КНИГА — над столом, плавно колышется
        const hover = Math.sin(t * 1.5) * 3;
        const bx = cx;
        const by = cy - 8 + hover;

        // Свечение вокруг книги
        const glowIntensity = done ? 0.25 : (0.55 + Math.sin(t * 2) * 0.15);
        const glowColor = done ? 'rgba(120, 200, 140,' : 'rgba(220, 160, 255,';
        const auraR = ctx.createRadialGradient(bx, by, 3, bx, by, 50);
        auraR.addColorStop(0, `${glowColor} ${glowIntensity})`);
        auraR.addColorStop(0.5, `${glowColor} ${glowIntensity * 0.4})`);
        auraR.addColorStop(1, `${glowColor} 0)`);
        ctx.fillStyle = auraR;
        ctx.fillRect(bx - 50, by - 50, 100, 100);

        // Лёгкий вертикальный луч-свет от стола к книге
        ctx.save();
        ctx.globalAlpha = 0.3;
        const beam = ctx.createLinearGradient(cx, cy + 6, cx, by + 6);
        beam.addColorStop(0, done ? 'rgba(120, 200, 140, 0)' : 'rgba(220, 160, 255, 0)');
        beam.addColorStop(0.5, done ? 'rgba(120, 200, 140, 0.3)' : 'rgba(220, 160, 255, 0.4)');
        beam.addColorStop(1, done ? 'rgba(120, 200, 140, 0)' : 'rgba(220, 160, 255, 0)');
        ctx.fillStyle = beam;
        ctx.fillRect(cx - 8, cy + 6, 16, (by + 6) - (cy + 6));
        ctx.restore();

        // Книга — сама (закрытая, с золотым корешком и пряжкой)
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(Math.sin(t * 0.7) * 0.05); // лёгкое покачивание

        // Задняя обложка (выступает)
        ctx.fillStyle = '#1a0810';
        ctx.fillRect(-13, -10, 26, 2);

        // Основа книги
        const bookGrad = ctx.createLinearGradient(-13, -10, 13, 10);
        if (done) {
            bookGrad.addColorStop(0, '#2a4a30');
            bookGrad.addColorStop(1, '#0a2818');
        } else {
            bookGrad.addColorStop(0, '#4a0a28');
            bookGrad.addColorStop(0.5, '#2a0510');
            bookGrad.addColorStop(1, '#100008');
        }
        ctx.fillStyle = bookGrad;
        roundRect(ctx, -13, -10, 26, 18, 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Корешок (золотой)
        ctx.fillStyle = done ? '#6a9070' : '#d4a043';
        ctx.fillRect(-14, -10, 2, 18);

        // Золотой узор на обложке (пятиконечная звезда / крест)
        const ornColor = done ? '#c0e8c8' : '#e8b850';
        ctx.strokeStyle = ornColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        // Крест-орнамент в центре
        ctx.moveTo(0, -5);
        ctx.lineTo(0, 4);
        ctx.moveTo(-4, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();
        // Угловые завитки
        ctx.beginPath();
        ctx.arc(-7, -5, 1.5, 0, Math.PI * 2);
        ctx.arc(7, -5, 1.5, 0, Math.PI * 2);
        ctx.arc(-7, 3, 1.5, 0, Math.PI * 2);
        ctx.arc(7, 3, 1.5, 0, Math.PI * 2);
        ctx.stroke();

        // Пряжка-замок на книге (жёлтая скобка)
        ctx.fillStyle = ornColor;
        ctx.fillRect(10, -2, 4, 4);
        ctx.strokeStyle = done ? '#6a9070' : '#a87020';
        ctx.strokeRect(10, -2, 4, 4);

        // Если пройден — маленькая галочка
        if (done) {
            ctx.strokeStyle = '#80ff90';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-3, 0);
            ctx.lineTo(-1, 2);
            ctx.lineTo(3, -2);
            ctx.stroke();
        }

        ctx.restore();

        // Магические мерцающие частицы вокруг книги (только если не пройдено)
        if (!done) {
            ctx.fillStyle = 'rgba(230, 180, 255, 0.8)';
            for (let i = 0; i < 5; i++) {
                const ang = (t * 1.5 + i * (Math.PI * 2 / 5)) % (Math.PI * 2);
                const r = 14 + Math.sin(t * 3 + i) * 3;
                const px = bx + Math.cos(ang) * r;
                const py = by + Math.sin(ang) * r * 0.6;
                ctx.beginPath();
                ctx.arc(px, py, 1 + Math.sin(t * 4 + i) * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawKey() {
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                if (tiles[r][c] !== T.KEY) continue;
                const sx = c * TILE + TILE / 2;
                const sy = r * TILE - camY + TILE / 2;
                if (sy < -50 || sy > CANVAS_H + 50) continue;
                // Пульсирующее золотое свечение
                const t = performance.now() / 500;
                const pulse = 0.7 + Math.sin(t) * 0.3;
                const glowGrad = ctx.createRadialGradient(sx, sy, 2, sx, sy, 30);
                glowGrad.addColorStop(0, `rgba(255, 220, 80, ${0.4 * pulse})`);
                glowGrad.addColorStop(1, 'rgba(255, 220, 80, 0)');
                ctx.fillStyle = glowGrad;
                ctx.fillRect(sx - 30, sy - 30, 60, 60);
                // Сам ключ (стилизованный)
                ctx.save();
                ctx.translate(sx, sy + Math.sin(t * 1.5) * 2);
                ctx.rotate(Math.PI / 4);
                // Кольцо
                ctx.strokeStyle = '#ffdc44';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(-8, 0, 5, 0, Math.PI * 2);
                ctx.stroke();
                // Стержень
                ctx.fillStyle = '#ffdc44';
                ctx.fillRect(-3, -1.5, 16, 3);
                // Зубцы
                ctx.fillRect(9, -1.5, 3, 5);
                ctx.fillRect(12, -1.5, 2, 4);
                ctx.restore();
                // Мерцание
                ctx.fillStyle = `rgba(255, 255, 200, ${0.3 + Math.sin(t * 3) * 0.3})`;
                ctx.beginPath();
                ctx.arc(sx - 3, sy - 3, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawSeqPlate(col, row, num) {
        const sx = col * TILE;
        const sy = row * TILE - camY;
        if (sy > CANVAS_H || sy + TILE < 0) return;
        // База — как плита пола, но с синей рамкой
        const activated = num <= seqProgress;
        const t = performance.now() / 400;
        ctx.save();
        // Кайма
        ctx.strokeStyle = activated ? '#a78bfa' : '#4a3a7a';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
        // Свечение
        const pulse = activated ? 1 : 0.5 + Math.sin(t + num) * 0.3;
        const glow = ctx.createRadialGradient(sx + TILE / 2, sy + TILE / 2, 2, sx + TILE / 2, sy + TILE / 2, 32);
        glow.addColorStop(0, `rgba(167, 139, 250, ${0.4 * pulse})`);
        glow.addColorStop(1, 'rgba(167, 139, 250, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(sx, sy, TILE, TILE);
        // Цифра/руна
        ctx.font = 'bold 22px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = activated ? '#e0d0ff' : 'rgba(167, 139, 250, 0.55)';
        ctx.shadowColor = activated ? '#a78bfa' : 'transparent';
        ctx.shadowBlur = activated ? 12 : 0;
        // Римская цифра
        const roman = { 1: 'I', 2: 'II', 3: 'III' }[num];
        ctx.fillText(roman, sx + TILE / 2, sy + TILE / 2 + 1);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawMinko() {
        const x = minko.x;
        const y = minko.y - camY;
        if (y < -180 || y > CANVAS_H + 180) return;

        const t = Date.now() / 1000;

        // === КОМНАТА (фон) ===
        drawMinkoRoom(x, y, t);

        // === КРОВАТЬ ===
        // Задняя спинка (деревянная, резная)
        ctx.fillStyle = '#6a4228';
        roundRect(ctx, x - 60, y - 48, 120, 18, 5);
        ctx.fill();
        ctx.fillStyle = '#4a2818';
        roundRect(ctx, x - 60, y - 36, 120, 8, 2);
        ctx.fill();
        // Золотые гвозди на спинке
        ctx.fillStyle = '#d4a043';
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.arc(x + i * 22, y - 40, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 0.5;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.arc(x + i * 22, y - 40, 2.5, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Столбики балдахина
        ctx.fillStyle = '#6a4228';
        ctx.fillRect(x - 64, y - 52, 6, 24);
        ctx.fillRect(x + 58, y - 52, 6, 24);
        // Золотые навершия
        ctx.fillStyle = '#e8b850';
        ctx.beginPath();
        ctx.arc(x - 61, y - 56, 4.5, 0, Math.PI * 2);
        ctx.arc(x + 61, y - 56, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8a6020';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Матрас (белый с розовым)
        const mattressGrad = ctx.createLinearGradient(x - 55, y - 8, x - 55, y + 42);
        mattressGrad.addColorStop(0, '#fff0f5');
        mattressGrad.addColorStop(1, '#f0d0e0');
        ctx.fillStyle = mattressGrad;
        roundRect(ctx, x - 55, y - 10, 110, 52, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200, 120, 160, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Одеяло (розовое с узором)
        const blanketGrad = ctx.createLinearGradient(x - 50, y + 5, x + 50, y + 38);
        blanketGrad.addColorStop(0, '#ff9dc0');
        blanketGrad.addColorStop(0.5, '#e872a8');
        blanketGrad.addColorStop(1, '#c85090');
        ctx.fillStyle = blanketGrad;
        roundRect(ctx, x - 50, y + 2, 100, 40, 8);
        ctx.fill();
        // Узор — мелкие сердечки на одеяле
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let i = -1; i <= 1; i++) {
            for (let j = 0; j <= 1; j++) {
                const hx = x + i * 28;
                const hy = y + 15 + j * 18;
                drawTinyHeart(hx, hy);
            }
        }
        // Складки одеяла
        ctx.strokeStyle = 'rgba(150, 40, 100, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 45, y + 40);
        ctx.quadraticCurveTo(x - 20, y + 35, x, y + 40);
        ctx.quadraticCurveTo(x + 20, y + 35, x + 45, y + 40);
        ctx.stroke();

        // Подушка
        const pillowGrad = ctx.createLinearGradient(x - 42, y - 5, x + 42, y + 12);
        pillowGrad.addColorStop(0, '#ffffff');
        pillowGrad.addColorStop(1, '#ffe0f0');
        ctx.fillStyle = pillowGrad;
        roundRect(ctx, x - 42, y - 8, 84, 22, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220, 140, 180, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // Кружево по краю подушки
        ctx.strokeStyle = 'rgba(240, 180, 210, 0.6)';
        ctx.lineWidth = 0.4;
        for (let i = 0; i < 20; i++) {
            const px = x - 42 + i * 4.4;
            ctx.beginPath();
            ctx.arc(px, y + 14, 1.5, 0, Math.PI);
            ctx.stroke();
        }

        // === КРОВАТЬ ПУСТАЯ — Минко нет в игровом мире, только в диалоге ===
        // Завершаем отрисовку: декоративные «zzz»-символы уберём, персонажа нет.
        return;
        /* eslint-disable */
        const headY = y - 2; // placeholder, unreachable

        // Задняя часть волос (длинные, развевающиеся по подушке)
        const hairBackGrad = ctx.createRadialGradient(x, headY, 5, x, headY + 5, 35);
        hairBackGrad.addColorStop(0, '#e080b8');
        hairBackGrad.addColorStop(1, '#a84080');
        ctx.fillStyle = hairBackGrad;
        ctx.beginPath();
        ctx.moveTo(x - 22, headY - 5);
        ctx.quadraticCurveTo(x - 35, headY + 10, x - 30, headY + 22);
        ctx.lineTo(x - 20, headY + 25);
        ctx.quadraticCurveTo(x - 15, headY + 15, x - 12, headY + 5);
        ctx.lineTo(x + 12, headY + 5);
        ctx.quadraticCurveTo(x + 15, headY + 15, x + 20, headY + 25);
        ctx.lineTo(x + 30, headY + 22);
        ctx.quadraticCurveTo(x + 35, headY + 10, x + 22, headY - 5);
        ctx.closePath();
        ctx.fill();

        // Пряди волос вокруг лица (более светлые, с бликами)
        ctx.fillStyle = '#c85898';
        ctx.beginPath();
        ctx.moveTo(x - 18, headY - 4);
        ctx.quadraticCurveTo(x - 28, headY + 8, x - 22, headY + 18);
        ctx.lineTo(x - 18, headY + 18);
        ctx.quadraticCurveTo(x - 20, headY + 8, x - 14, headY);
        ctx.closePath();
        ctx.fill();

        // Макушка (верх волос)
        const hairTopGrad = ctx.createRadialGradient(x - 4, headY - 10, 3, x, headY - 3, 22);
        hairTopGrad.addColorStop(0, '#ffb0d0');
        hairTopGrad.addColorStop(0.5, '#e074a8');
        hairTopGrad.addColorStop(1, '#b84080');
        ctx.fillStyle = hairTopGrad;
        ctx.beginPath();
        ctx.arc(x, headY - 2, 20, 0, Math.PI * 2);
        ctx.fill();

        // Лицо (овал, аниме пропорции — больше глаза, меньше подбородок)
        const faceGrad = ctx.createRadialGradient(x - 4, headY - 2, 3, x, headY + 2, 18);
        faceGrad.addColorStop(0, '#ffffff');
        faceGrad.addColorStop(0.6, '#fff0f0');
        faceGrad.addColorStop(1, '#f8d0e0');
        ctx.fillStyle = faceGrad;
        ctx.beginPath();
        ctx.ellipse(x, headY + 2, 15, 17, 0, 0, Math.PI * 2);
        ctx.fill();

        // Чёлка (аниме — неровные прядки)
        ctx.fillStyle = '#d668a0';
        ctx.beginPath();
        ctx.moveTo(x - 15, headY - 6);
        ctx.quadraticCurveTo(x - 14, headY + 4, x - 9, headY);
        ctx.quadraticCurveTo(x - 5, headY + 6, x - 1, headY);
        ctx.quadraticCurveTo(x + 3, headY + 6, x + 7, headY);
        ctx.quadraticCurveTo(x + 12, headY + 6, x + 15, headY - 6);
        ctx.lineTo(x + 15, headY - 18);
        ctx.lineTo(x - 15, headY - 18);
        ctx.closePath();
        ctx.fill();
        // Блики на волосах
        ctx.fillStyle = 'rgba(255, 220, 240, 0.5)';
        ctx.beginPath();
        ctx.ellipse(x - 6, headY - 10, 7, 2, -0.3, 0, Math.PI * 2);
        ctx.ellipse(x + 4, headY - 12, 5, 1.5, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Длинная боковая прядь (ахоге не, но side lock)
        ctx.fillStyle = '#b84890';
        ctx.beginPath();
        ctx.moveTo(x - 14, headY - 4);
        ctx.quadraticCurveTo(x - 22, headY + 10, x - 16, headY + 20);
        ctx.lineTo(x - 13, headY + 19);
        ctx.quadraticCurveTo(x - 17, headY + 8, x - 11, headY);
        ctx.closePath();
        ctx.fill();

        // Маленькое сердечко/цветок сакуры в волосах
        drawSakuraFlower(x + 10, headY - 12, 0.9);

        // Лента в волосах (слева)
        ctx.fillStyle = '#ff4080';
        ctx.beginPath();
        ctx.moveTo(x - 16, headY - 8);
        ctx.lineTo(x - 11, headY - 14);
        ctx.lineTo(x - 6, headY - 10);
        ctx.lineTo(x - 10, headY - 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff6aa0';
        ctx.beginPath();
        ctx.arc(x - 11, headY - 10, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // === ГЛАЗА (большие, аниме) ===
        // Брови (мягкие, розоватые)
        ctx.strokeStyle = '#c85898';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        if (wakeT < 0.3) {
            // Спит — опущенные бровки
            ctx.beginPath();
            ctx.moveTo(x - 9, headY - 3);
            ctx.quadraticCurveTo(x - 6, headY - 2, x - 3, headY - 3);
            ctx.moveTo(x + 3, headY - 3);
            ctx.quadraticCurveTo(x + 6, headY - 2, x + 9, headY - 3);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(x - 10, headY - 5);
            ctx.quadraticCurveTo(x - 6, headY - 7, x - 3, headY - 5);
            ctx.moveTo(x + 3, headY - 5);
            ctx.quadraticCurveTo(x + 6, headY - 7, x + 10, headY - 5);
            ctx.stroke();
        }

        if (wakeT < 0.3) {
            // Закрытые глаза — длинные загнутые реснички
            ctx.strokeStyle = '#4a2238';
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            // Левый глаз (изогнутая линия)
            ctx.beginPath();
            ctx.moveTo(x - 10, headY + 1);
            ctx.quadraticCurveTo(x - 6, headY + 5, x - 2, headY + 1);
            ctx.stroke();
            // Реснички вверх
            ctx.lineWidth = 0.9;
            for (let i = 0; i < 4; i++) {
                const ex = x - 9.5 + i * 2.5;
                ctx.beginPath();
                ctx.moveTo(ex, headY + 1.5);
                ctx.quadraticCurveTo(ex - 0.5, headY - 1, ex - 1.5, headY - 3);
                ctx.stroke();
            }
            // Правый глаз
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(x + 2, headY + 1);
            ctx.quadraticCurveTo(x + 6, headY + 5, x + 10, headY + 1);
            ctx.stroke();
            ctx.lineWidth = 0.9;
            for (let i = 0; i < 4; i++) {
                const ex = x + 2.5 + i * 2.5;
                ctx.beginPath();
                ctx.moveTo(ex, headY + 1.5);
                ctx.quadraticCurveTo(ex + 0.5, headY - 1, ex + 1.5, headY - 3);
                ctx.stroke();
            }
        } else {
            // Открытые глаза — большие аниме-глаза с блеском
            const o = Math.min(1, (wakeT - 0.3) / 0.7);
            // Контур глаза (верхний край жирнее)
            ctx.strokeStyle = '#3a1828';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x - 10, headY + 1);
            ctx.quadraticCurveTo(x - 6, headY - 3, x - 2, headY + 1);
            ctx.moveTo(x + 2, headY + 1);
            ctx.quadraticCurveTo(x + 6, headY - 3, x + 10, headY + 1);
            ctx.stroke();
            // Белок
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(x - 6, headY + 2, 3.5, 4 * o, 0, 0, Math.PI * 2);
            ctx.ellipse(x + 6, headY + 2, 3.5, 4 * o, 0, 0, Math.PI * 2);
            ctx.fill();
            // Радужка (фиолетовая с градиентом)
            const irisL = ctx.createRadialGradient(x - 6, headY + 1, 0.5, x - 6, headY + 2, 3);
            irisL.addColorStop(0, '#d0a0ff');
            irisL.addColorStop(0.5, '#8040c0');
            irisL.addColorStop(1, '#3a0060');
            ctx.fillStyle = irisL;
            ctx.beginPath();
            ctx.ellipse(x - 6, headY + 2, 2.8, 3.3 * o, 0, 0, Math.PI * 2);
            ctx.fill();
            const irisR = ctx.createRadialGradient(x + 6, headY + 1, 0.5, x + 6, headY + 2, 3);
            irisR.addColorStop(0, '#d0a0ff');
            irisR.addColorStop(0.5, '#8040c0');
            irisR.addColorStop(1, '#3a0060');
            ctx.fillStyle = irisR;
            ctx.beginPath();
            ctx.ellipse(x + 6, headY + 2, 2.8, 3.3 * o, 0, 0, Math.PI * 2);
            ctx.fill();
            // Зрачки
            ctx.fillStyle = '#1a0028';
            ctx.beginPath();
            ctx.ellipse(x - 6, headY + 2, 1.2, 2 * o, 0, 0, Math.PI * 2);
            ctx.ellipse(x + 6, headY + 2, 1.2, 2 * o, 0, 0, Math.PI * 2);
            ctx.fill();
            // Catchlight (блик большой)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x - 5, headY + 0.5, 1.4, 0, Math.PI * 2);
            ctx.arc(x + 7, headY + 0.5, 1.4, 0, Math.PI * 2);
            ctx.fill();
            // Блик маленький ниже (аниме трюк)
            ctx.beginPath();
            ctx.arc(x - 7, headY + 3, 0.5, 0, Math.PI * 2);
            ctx.arc(x + 5, headY + 3, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Маленький носик (штрих)
        ctx.strokeStyle = 'rgba(200, 120, 160, 0.5)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x - 0.5, headY + 5);
        ctx.lineTo(x + 0.5, headY + 7);
        ctx.stroke();

        // Румянец (два овальных пятнышка)
        ctx.fillStyle = 'rgba(255, 130, 170, 0.45)';
        ctx.beginPath();
        ctx.ellipse(x - 10, headY + 6, 3.5, 2, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 10, headY + 6, 3.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ротик (спит — маленький открытый, просыпается — улыбка)
        if (wakeT < 0.3) {
            ctx.fillStyle = '#d67590';
            ctx.beginPath();
            ctx.ellipse(x, headY + 10, 1.2, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.strokeStyle = '#d65890';
            ctx.lineWidth = 1.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x - 2, headY + 9);
            ctx.quadraticCurveTo(x, headY + 12, x + 2, headY + 9);
            ctx.stroke();
        }

        // === ZZZ (пока спит) ===
        if (wakeT < 0.3) {
            const tt = Date.now() / 400;
            ctx.font = 'bold italic 14px Georgia, serif';
            ctx.fillStyle = `rgba(167, 139, 250, ${0.6 + Math.sin(tt) * 0.3})`;
            ctx.textAlign = 'left';
            ctx.shadowColor = 'rgba(167, 139, 250, 0.6)';
            ctx.shadowBlur = 6;
            ctx.fillText('Z', x + 22, headY - 8 + Math.sin(tt) * 2);
            ctx.font = 'bold italic 11px Georgia, serif';
            ctx.fillText('z', x + 30, headY - 16 + Math.sin(tt + 1) * 2);
            ctx.font = 'bold italic 8px Georgia, serif';
            ctx.fillText('z', x + 36, headY - 22 + Math.sin(tt + 2) * 2);
            ctx.shadowBlur = 0;
        }
    }

    /** Комната Минко: балдахин, ковёр, плюшевый мишка, лампа, лепестки сакуры. */
    function drawMinkoRoom(x, y, t) {
        // Мягкий ковёр — розовая подсветка пола
        const carpetGrad = ctx.createRadialGradient(x, y + 40, 20, x, y + 40, 140);
        carpetGrad.addColorStop(0, 'rgba(255, 210, 235, 0.35)');
        carpetGrad.addColorStop(0.4, 'rgba(220, 160, 210, 0.2)');
        carpetGrad.addColorStop(1, 'rgba(100, 40, 100, 0)');
        ctx.fillStyle = carpetGrad;
        ctx.fillRect(x - 140, y - 80, 280, 180);

        // Балдахин сверху (главный)
        const canopyGrad = ctx.createLinearGradient(x, y - 85, x, y - 55);
        canopyGrad.addColorStop(0, 'rgba(200, 90, 160, 0.75)');
        canopyGrad.addColorStop(1, 'rgba(230, 140, 190, 0.6)');
        ctx.fillStyle = canopyGrad;
        ctx.beginPath();
        ctx.moveTo(x - 85, y - 85);
        ctx.quadraticCurveTo(x - 60, y - 75, x, y - 82);
        ctx.quadraticCurveTo(x + 60, y - 75, x + 85, y - 85);
        ctx.lineTo(x + 95, y - 55);
        ctx.lineTo(x - 95, y - 55);
        ctx.closePath();
        ctx.fill();
        // Кружевная бахрома на балдахине
        ctx.fillStyle = 'rgba(255, 200, 220, 0.75)';
        for (let i = 0; i < 19; i++) {
            const ex = x - 95 + i * 10;
            ctx.beginPath();
            ctx.arc(ex, y - 55, 3, 0, Math.PI);
            ctx.fill();
        }

        // Левая занавеска
        ctx.fillStyle = 'rgba(220, 110, 175, 0.55)';
        ctx.beginPath();
        ctx.moveTo(x - 95, y - 55);
        ctx.lineTo(x - 78, y - 55);
        ctx.quadraticCurveTo(x - 82, y - 25, x - 88, y + 15);
        ctx.quadraticCurveTo(x - 95, y - 15, x - 97, y - 55);
        ctx.closePath();
        ctx.fill();
        // Волны на ткани
        ctx.strokeStyle = 'rgba(255, 180, 210, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 92, y - 50 + Math.sin(t) * 2);
        ctx.quadraticCurveTo(x - 86, y - 25, x - 89, y + 10);
        ctx.stroke();

        // Правая занавеска
        ctx.fillStyle = 'rgba(220, 110, 175, 0.55)';
        ctx.beginPath();
        ctx.moveTo(x + 95, y - 55);
        ctx.lineTo(x + 78, y - 55);
        ctx.quadraticCurveTo(x + 82, y - 25, x + 88, y + 15);
        ctx.quadraticCurveTo(x + 95, y - 15, x + 97, y - 55);
        ctx.closePath();
        ctx.fill();

        // Лепестки сакуры медленно падают/кружатся
        ctx.fillStyle = 'rgba(255, 180, 215, 0.7)';
        for (let i = 0; i < 12; i++) {
            const px = x - 120 + ((i * 25 + t * 10 + Math.sin(t + i) * 8) % 240);
            const py = y - 60 + ((t * 15 + i * 20) % 140);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(t + i * 0.5);
            ctx.beginPath();
            ctx.ellipse(0, 0, 3.5, 1.8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Плюшевый мишка справа от кровати
        drawTeddyBear(x + 75, y + 32);

        // Тумбочка + лампа слева
        drawLampNightstand(x - 82, y + 18, t);
    }

    function drawTinyHeart(hx, hy) {
        ctx.beginPath();
        ctx.moveTo(hx, hy + 2);
        ctx.bezierCurveTo(hx - 5, hy - 2, hx - 5, hy + 5, hx, hy + 5);
        ctx.bezierCurveTo(hx + 5, hy + 5, hx + 5, hy - 2, hx, hy + 2);
        ctx.fill();
    }

    function drawTeddyBear(x, y) {
        // Тень
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 16, 13, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Тело (коричневый)
        const bodyGrad = ctx.createRadialGradient(x - 3, y + 2, 2, x, y + 6, 12);
        bodyGrad.addColorStop(0, '#c09068');
        bodyGrad.addColorStop(1, '#8a6038');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(x, y + 6, 11, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        // Голова
        ctx.beginPath();
        ctx.arc(x, y - 6, 9, 0, Math.PI * 2);
        ctx.fill();
        // Уши
        ctx.beginPath();
        ctx.arc(x - 7, y - 13, 3.5, 0, Math.PI * 2);
        ctx.arc(x + 7, y - 13, 3.5, 0, Math.PI * 2);
        ctx.fill();
        // Внутреннее ухо (розовое)
        ctx.fillStyle = '#ff9cb8';
        ctx.beginPath();
        ctx.arc(x - 7, y - 13, 1.5, 0, Math.PI * 2);
        ctx.arc(x + 7, y - 13, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Мордочка (светлее)
        ctx.fillStyle = '#d8a878';
        ctx.beginPath();
        ctx.arc(x, y - 4, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Глаза (блестящие)
        ctx.fillStyle = '#0a0510';
        ctx.beginPath();
        ctx.arc(x - 3.5, y - 7, 1.2, 0, Math.PI * 2);
        ctx.arc(x + 3.5, y - 7, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x - 3, y - 7.5, 0.4, 0, Math.PI * 2);
        ctx.arc(x + 4, y - 7.5, 0.4, 0, Math.PI * 2);
        ctx.fill();
        // Носик
        ctx.fillStyle = '#2a1810';
        ctx.beginPath();
        ctx.ellipse(x, y - 3.5, 1.5, 1, 0, 0, Math.PI * 2);
        ctx.fill();
        // Улыбка
        ctx.strokeStyle = '#2a1810';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(x, y - 1, 2, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        // Лапки
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(x - 9, y + 10, 3, 0, Math.PI * 2);
        ctx.arc(x + 9, y + 10, 3, 0, Math.PI * 2);
        ctx.fill();
        // Бантик на шее (розовый)
        ctx.fillStyle = '#ff4080';
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 1);
        ctx.lineTo(x - 2, y + 1);
        ctx.lineTo(x - 5, y + 3);
        ctx.lineTo(x, y + 1);
        ctx.lineTo(x + 5, y + 3);
        ctx.lineTo(x + 2, y + 1);
        ctx.lineTo(x + 5, y - 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff80b0';
        ctx.beginPath();
        ctx.arc(x, y + 1, 1, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawLampNightstand(x, y, t) {
        // Тумбочка (деревянная)
        ctx.fillStyle = '#6a4228';
        roundRect(ctx, x - 11, y + 4, 22, 18, 2);
        ctx.fill();
        ctx.strokeStyle = '#4a2818';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Ящичек
        ctx.strokeStyle = '#4a2818';
        ctx.beginPath();
        ctx.moveTo(x - 10, y + 13);
        ctx.lineTo(x + 10, y + 13);
        ctx.stroke();
        // Ручка
        ctx.fillStyle = '#e8b850';
        ctx.beginPath();
        ctx.arc(x, y + 18, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Лампа: основание
        ctx.fillStyle = '#d4a043';
        roundRect(ctx, x - 4, y - 3, 8, 8, 1);
        ctx.fill();
        // Стебель
        ctx.fillStyle = '#e8b850';
        ctx.fillRect(x - 1.5, y - 8, 3, 5);

        // Абажур (розовый)
        const lampGrad = ctx.createLinearGradient(x - 9, y - 18, x + 9, y - 5);
        lampGrad.addColorStop(0, '#ffe5cf');
        lampGrad.addColorStop(1, '#ffb898');
        ctx.fillStyle = lampGrad;
        ctx.beginPath();
        ctx.moveTo(x - 9, y - 5);
        ctx.lineTo(x + 9, y - 5);
        ctx.lineTo(x + 6, y - 18);
        ctx.lineTo(x - 6, y - 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#a87030';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // Вертикальные полоски на абажуре
        ctx.strokeStyle = 'rgba(180, 100, 40, 0.3)';
        ctx.lineWidth = 0.3;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 3, y - 18);
            ctx.lineTo(x + i * 3.5, y - 5);
            ctx.stroke();
        }

        // Тёплое свечение вокруг лампы (мерцает)
        const glowRadius = 60 + Math.sin(t * 3) * 3;
        const lampGlow = ctx.createRadialGradient(x, y - 10, 3, x, y - 10, glowRadius);
        lampGlow.addColorStop(0, 'rgba(255, 210, 140, 0.55)');
        lampGlow.addColorStop(0.4, 'rgba(255, 180, 120, 0.25)');
        lampGlow.addColorStop(1, 'rgba(255, 180, 120, 0)');
        ctx.fillStyle = lampGlow;
        ctx.fillRect(x - glowRadius, y - glowRadius - 10, glowRadius * 2, glowRadius * 2);

        // Маленький стаканчик с сакурой на тумбочке
        ctx.fillStyle = 'rgba(200, 230, 255, 0.7)';
        roundRect(ctx, x + 13, y + 5, 6, 10, 1);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 140, 180, 0.6)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        // Веточка сакуры в вазочке
        ctx.strokeStyle = '#6a4020';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + 16, y + 5);
        ctx.quadraticCurveTo(x + 20, y - 2, x + 22, y - 5);
        ctx.stroke();
        drawSakuraFlower(x + 22, y - 5, 0.5);
        drawSakuraFlower(x + 18, y - 1, 0.4);
    }

    function drawSakuraFlower(x, y, scale) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        // 5 лепестков (розовых)
        ctx.fillStyle = '#ffbdd6';
        for (let i = 0; i < 5; i++) {
            const ang = (i / 5) * Math.PI * 2;
            ctx.save();
            ctx.rotate(ang);
            ctx.beginPath();
            ctx.ellipse(0, -4.5, 2.8, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();
            // Выемка на лепестке
            ctx.strokeStyle = '#ff8aa8';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(0, -5);
            ctx.stroke();
            ctx.restore();
        }
        // Центр
        ctx.fillStyle = '#ff6a90';
        ctx.beginPath();
        ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
        ctx.fill();
        // Тычинки (жёлтые точки)
        ctx.fillStyle = '#ffee44';
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(Math.cos(ang) * 1.2, Math.sin(ang) * 1.2, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawSubaru() {
        if (!subaru.alive) return;
        if (subaru.blink > 0 && Math.floor(subaru.blink * 12) % 2 === 0) return;
        // Слабая дыхательная пульсация
        const bT = performance.now() / 600;
        const scale = 1 + Math.sin(bT) * 0.02;
        let bobY = 0;
        if (subaru.walkCycle > 0.06) bobY = Math.sin(subaru.walkCycle * 2.4) * 3;
        drawSubaruBody(subaru.x, subaru.y - camY + bobY, scale, 1);
    }

    function drawSubaruBody(x, y, scale, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        // Тень
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 15, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // ═══ НОГИ (оранжевые спортивные штаны с белыми полосами) ═══
        // Штаны
        ctx.fillStyle = '#c04020';
        ctx.fillRect(-7, 3, 6, 13);
        ctx.fillRect(1, 3, 6, 13);
        // Белые лампасы сбоку
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-6.5, 3, 1, 13);
        ctx.fillRect(5.5, 3, 1, 13);
        // Кроссовки
        ctx.fillStyle = '#0a0510';
        roundRect(ctx, -8, 14, 7, 4, 1);
        ctx.fill();
        roundRect(ctx, 1, 14, 7, 4, 1);
        ctx.fill();
        // Белая подошва
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-8, 17, 7, 1);
        ctx.fillRect(1, 17, 7, 1);

        // ═══ ТУЛОВИЩЕ (спортивная куртка Субару — оранжевая с двумя белыми полосами) ═══
        const bgrad = ctx.createLinearGradient(-12, -7, 12, 8);
        bgrad.addColorStop(0, '#ffa058');
        bgrad.addColorStop(0.4, '#e55020');
        bgrad.addColorStop(1, '#961808');
        ctx.fillStyle = bgrad;
        roundRect(ctx, -11, -7, 22, 15, 3);
        ctx.fill();

        // ДВЕ параллельные белые полосы на груди (вокруг молнии) — канонично Субару
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3, -7, 1, 15);
        ctx.fillRect(2, -7, 1, 15);

        // Белые лампасы по бокам (внешние)
        ctx.fillRect(-10.5, -7, 1, 15);
        ctx.fillRect(9.5, -7, 1, 15);

        // Молния по центру (тонкая линия)
        ctx.strokeStyle = '#5a1808';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(0, 7);
        ctx.stroke();
        // Зубцы молнии
        ctx.strokeStyle = 'rgba(40, 10, 0, 0.6)';
        ctx.lineWidth = 0.3;
        for (let i = -6; i <= 6; i += 1.3) {
            ctx.beginPath();
            ctx.moveTo(-0.7, i);
            ctx.lineTo(0.7, i);
            ctx.stroke();
        }
        // Бегунок молнии
        ctx.fillStyle = '#c0c0c8';
        ctx.fillRect(-0.8, 2, 1.6, 2);

        // Воротник (темнее)
        ctx.fillStyle = '#8a2a10';
        ctx.fillRect(-7, -7, 14, 2);
        // Нижняя кромка куртки
        ctx.fillRect(-11, 6, 22, 2);

        // ═══ РУКИ (сбоку) — с двумя белыми полосами на каждом рукаве ═══
        // Левый рукав
        ctx.fillStyle = '#c04020';
        roundRect(ctx, -14, -6, 3.5, 13, 1.5);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-13, -6, 0.6, 13);
        ctx.fillRect(-11.8, -6, 0.6, 13);
        // Левая кисть (держит кружку)
        ctx.fillStyle = '#f4c9a0';
        ctx.beginPath();
        ctx.arc(-12.5, 8, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Правый рукав
        ctx.fillStyle = '#c04020';
        roundRect(ctx, 10.5, -6, 3.5, 13, 1.5);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11.4, -6, 0.6, 13);
        ctx.fillRect(12.8, -6, 0.6, 13);
        // Правая кисть
        ctx.fillStyle = '#f4c9a0';
        ctx.beginPath();
        ctx.arc(12.5, 8, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // ═══ КОФЕЙНАЯ КРУЖКА (в левой руке) ═══
        // Кружка
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, -17, 4, 5, 7, 0.8);
        ctx.fill();
        ctx.strokeStyle = '#6a4020';
        ctx.lineWidth = 0.6;
        ctx.stroke();
        // Ручка кружки
        ctx.beginPath();
        ctx.arc(-11, 7.5, 1.5, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        // Кофе (тёмно-коричневый)
        ctx.fillStyle = '#4a2810';
        ctx.fillRect(-16.5, 4.5, 4, 1.5);
        // Лёгкая пенка
        ctx.fillStyle = 'rgba(255, 220, 180, 0.6)';
        ctx.fillRect(-16.5, 4.5, 4, 0.5);
        // Сердечко на кружке
        ctx.fillStyle = '#ff6080';
        ctx.beginPath();
        ctx.moveTo(-14.5, 9);
        ctx.bezierCurveTo(-16, 7.5, -16, 10, -14.5, 10.5);
        ctx.bezierCurveTo(-13, 10, -13, 7.5, -14.5, 9);
        ctx.fill();
        // Пар над кофе
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 0.6;
        const steamT = performance.now() / 220;
        for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.moveTo(-15.5 + i * 2, 3);
            ctx.quadraticCurveTo(-14.5 + i * 2 + Math.sin(steamT + i) * 1.5, 0, -15 + i * 2, -3);
            ctx.stroke();
        }

        // ═══ ГОЛОВА ═══
        // Шея
        ctx.fillStyle = '#e5b290';
        ctx.fillRect(-2.5, -10, 5, 4);

        // Лицо (аниме — слегка овальное)
        const faceGrad = ctx.createRadialGradient(-2, -15, 2, 0, -13, 10);
        faceGrad.addColorStop(0, '#ffe5c8');
        faceGrad.addColorStop(1, '#eeba90');
        ctx.fillStyle = faceGrad;
        ctx.beginPath();
        ctx.ellipse(0, -13, 8, 9.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // ═══ ВОЛОСЫ (чёрные, торчащие — визитка Субару) ═══
        ctx.fillStyle = '#080410';
        // Задняя часть / макушка
        ctx.beginPath();
        ctx.moveTo(-8, -14);
        ctx.quadraticCurveTo(-9, -22, -5, -23);
        ctx.quadraticCurveTo(-2, -26, 2, -24);
        ctx.quadraticCurveTo(5, -26, 8, -23);
        ctx.quadraticCurveTo(10, -22, 8, -14);
        ctx.closePath();
        ctx.fill();

        // Торчащие наверх пряди (Субару-style)
        ctx.beginPath();
        // 1-я прядь слева
        ctx.moveTo(-7, -20);
        ctx.lineTo(-9, -27);
        ctx.lineTo(-5, -22);
        // 2-я прядь
        ctx.moveTo(-4, -22);
        ctx.lineTo(-6, -28);
        ctx.lineTo(-2, -23);
        // центральная
        ctx.moveTo(-1, -23);
        ctx.lineTo(0, -29);
        ctx.lineTo(2, -23);
        // 4-я
        ctx.moveTo(3, -22);
        ctx.lineTo(5, -27);
        ctx.lineTo(6, -22);
        // крайняя правая
        ctx.moveTo(5, -20);
        ctx.lineTo(8, -25);
        ctx.lineTo(9, -19);
        ctx.fill();

        // Чёлка (закрывает часть лба)
        ctx.beginPath();
        ctx.moveTo(-8, -13);
        ctx.quadraticCurveTo(-6, -6, -3, -10);
        ctx.quadraticCurveTo(0, -6, 3, -10);
        ctx.quadraticCurveTo(6, -6, 8, -13);
        ctx.lineTo(8, -18);
        ctx.lineTo(-8, -18);
        ctx.closePath();
        ctx.fill();

        // Блики на волосах (голубоватые для чёрного)
        ctx.fillStyle = 'rgba(80, 90, 120, 0.4)';
        ctx.beginPath();
        ctx.ellipse(-3, -22, 2, 1, -0.3, 0, Math.PI * 2);
        ctx.ellipse(3, -21, 1.5, 0.8, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // ═══ ГЛАЗА (узкие, характерно Субару — «грустно-решительные») ═══
        // Брови (тёмные, нахмуренные)
        ctx.strokeStyle = '#0a0510';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-5, -13);
        ctx.quadraticCurveTo(-3.5, -14, -2, -13.5);
        ctx.moveTo(2, -13.5);
        ctx.quadraticCurveTo(3.5, -14, 5, -13);
        ctx.stroke();

        // Контур верхнего века (характерно для Субару)
        ctx.strokeStyle = '#0a0510';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(-5, -11);
        ctx.quadraticCurveTo(-3.5, -12, -1.5, -11);
        ctx.moveTo(1.5, -11);
        ctx.quadraticCurveTo(3.5, -12, 5, -11);
        ctx.stroke();

        // Белок глаза
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-3.2, -10.8, 1.4, 1.1, 0, 0, Math.PI * 2);
        ctx.ellipse(3.2, -10.8, 1.4, 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Радужка (тёмно-карие)
        ctx.fillStyle = '#3a2010';
        ctx.beginPath();
        ctx.arc(-3.2, -10.8, 1, 0, Math.PI * 2);
        ctx.arc(3.2, -10.8, 1, 0, Math.PI * 2);
        ctx.fill();

        // Зрачок
        ctx.fillStyle = '#0a0510';
        ctx.beginPath();
        ctx.arc(-3.2, -10.8, 0.5, 0, Math.PI * 2);
        ctx.arc(3.2, -10.8, 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Блик в глазах
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-2.8, -11.2, 0.4, 0, Math.PI * 2);
        ctx.arc(3.6, -11.2, 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Нос (маленький штрих)
        ctx.strokeStyle = 'rgba(160, 100, 60, 0.4)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(-0.5, -7);
        ctx.stroke();

        // Рот (серьёзная линия)
        ctx.strokeStyle = '#6a3818';
        ctx.lineWidth = 0.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-2, -6);
        ctx.lineTo(2, -6);
        ctx.stroke();

        // ═══ АУРА ВОЗВРАЩЕНИЯ СМЕРТЬЮ ═══
        if (deaths > 0 && subaru.alive) {
            const pulseT = Date.now() / 200;
            ctx.globalAlpha = alpha * (0.3 + Math.sin(pulseT) * 0.15);
            ctx.strokeStyle = '#a78bfa';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.stroke();
            // Вторая аура
            ctx.lineWidth = 0.8;
            ctx.strokeStyle = 'rgba(167, 139, 250, 0.35)';
            ctx.beginPath();
            ctx.arc(0, 0, 25, 0, Math.PI * 2);
            ctx.stroke();
            // Маленькие частицы вокруг
            ctx.fillStyle = 'rgba(200, 170, 255, 0.7)';
            for (let i = 0; i < 4; i++) {
                const ang = (i / 4) * Math.PI * 2 + pulseT * 0.5;
                const px = Math.cos(ang) * 22;
                const py = Math.sin(ang) * 22;
                ctx.beginPath();
                ctx.arc(px, py, 1.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    // ─── Визуалы смертей ───────────────────────────────
    function drawPitDeath() {
        const t = Math.min(1, (performance.now() - deathEffect.startTime) / 500);
        const col = deathEffect.col;
        const row = deathEffect.row;
        const sx = col * TILE;
        const sy = row * TILE - camY;
        // Открытая яма с шипами
        const grad = ctx.createRadialGradient(sx + TILE/2, sy + TILE/2, 2, sx + TILE/2, sy + TILE/2, TILE/2);
        grad.addColorStop(0, '#000'); grad.addColorStop(0.7, '#0a0005'); grad.addColorStop(1, '#180c12');
        ctx.fillStyle = grad; ctx.fillRect(sx + 3, sy + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = '#4a2830'; ctx.lineWidth = 2;
        ctx.strokeRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
        ctx.fillStyle = '#a8a8b8';
        for (let i = 0; i < 5; i++) {
            const spx = sx + 8 + i * 10;
            ctx.beginPath();
            ctx.moveTo(spx, sy + TILE - 6);
            ctx.lineTo(spx + 4, sy + 24);
            ctx.lineTo(spx + 8, sy + TILE - 6);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(200, 20, 40, 0.8)';
            ctx.beginPath();
            ctx.moveTo(spx + 2, sy + 26); ctx.lineTo(spx + 4, sy + 24); ctx.lineTo(spx + 6, sy + 26);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#a8a8b8';
        }
        // Падающий Субару
        const subX = deathEffect.x;
        const subY = deathEffect.y - camY + t * 32;
        const subScale = 1 - t * 0.75;
        const subAlpha = 1 - t * 0.88;
        drawSubaruBody(subX, subY, subScale, subAlpha);
        // Брызги крови снизу при достижении
        if (t > 0.7) {
            ctx.fillStyle = `rgba(200, 20, 40, ${(t - 0.7) * 3})`;
            for (let i = 0; i < 8; i++) {
                const ang = Math.PI + (i - 4) * 0.2;
                ctx.beginPath();
                ctx.arc(subX + Math.cos(ang) * 18 * (t - 0.7) * 5, sy + TILE - 10, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawDaggersDeath() {
        const t = (performance.now() - deathEffect.startTime) / 180;
        const cx = deathEffect.x;
        const cy = deathEffect.y - camY;
        drawSubaruBody(cx, cy, 1, 1);
        // Летящие кинжалы
        if (t < 1) {
            const leftStartX = 2 * TILE;
            const rightStartX = 10 * TILE;
            const lx = leftStartX + (cx - leftStartX) * t;
            const rx = rightStartX + (cx - rightStartX) * t;
            drawDaggerAt(lx, cy, Math.PI / 2, 1 - t * 0.2);
            drawDaggerAt(rx, cy, -Math.PI / 2, 1 - t * 0.2);
            ctx.save();
            ctx.strokeStyle = 'rgba(200, 200, 240, 0.4)';
            ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(leftStartX, cy); ctx.lineTo(lx, cy);
            ctx.moveTo(rightStartX, cy); ctx.lineTo(rx, cy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        } else {
            // Воткнутые кинжалы
            drawDaggerAt(cx - 40, cy, Math.PI / 2, 0.95);
            drawDaggerAt(cx + 40, cy, -Math.PI / 2, 0.95);
        }
    }

    function drawDaggerAt(x, y, angle, alpha) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.globalAlpha = alpha;
        const grad = ctx.createLinearGradient(0, -30, 0, 20);
        grad.addColorStop(0, '#e0e0e8'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#8a8aa0');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, -30); ctx.lineTo(-3, -5); ctx.lineTo(-3, 20);
        ctx.lineTo(3, 20); ctx.lineTo(3, -5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(200, 20, 40, 0.8)';
        ctx.fillRect(-3, 5, 6, 15);
        ctx.fillStyle = '#3a2a2a';
        ctx.fillRect(-7, 20, 14, 3);
        ctx.fillStyle = '#5a3020';
        ctx.fillRect(-2, 23, 4, 10);
        ctx.restore();
    }

    function drawBlockDeath() {
        const t = Math.min(1, (performance.now() - deathEffect.startTime) / 350);
        const col = deathEffect.col;
        const row = deathEffect.row;
        const sx = col * TILE;
        const sy = row * TILE - camY;
        const blockSize = TILE + 10;
        // Блок падает сверху к плите
        const fromY = sy - 300;
        const toY = sy + TILE - blockSize;
        const blockY = fromY + (toY - fromY) * (t * t); // ease-in квадратично
        // Под блоком — Субару (частично видимый, потом раздавленный)
        if (t < 0.85) {
            const crushProgress = Math.max(0, (t - 0.7) / 0.15);
            drawSubaruBody(deathEffect.x, deathEffect.y - camY + crushProgress * 6, 1 - crushProgress * 0.3, 1);
        }
        // Сам блок
        ctx.save();
        ctx.fillStyle = '#3a2838';
        ctx.fillRect(sx - 5, blockY, blockSize, blockSize);
        // Рисунок камня
        ctx.strokeStyle = 'rgba(80, 60, 100, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 5, blockY, blockSize, blockSize);
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(sx - 5 + i * 15, blockY + 10);
            ctx.lineTo(sx - 5 + i * 15 + 5, blockY + blockSize - 15);
            ctx.stroke();
        }
        // Трещины
        ctx.strokeStyle = '#1a0818';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + 10, blockY + 5); ctx.lineTo(sx + 20, blockY + 25); ctx.lineTo(sx + 15, blockY + 45);
        ctx.stroke();
        // Пыль при падении (в конце)
        if (t > 0.8) {
            ctx.fillStyle = `rgba(180, 160, 180, ${(1 - (t - 0.8) * 5) * 0.7})`;
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2;
                const dist = (t - 0.8) * 200;
                ctx.beginPath();
                ctx.arc(sx + TILE / 2 + Math.cos(ang) * dist, sy + TILE / 2 + Math.sin(ang) * dist * 0.4, 4 + Math.random() * 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // Кровь из-под блока
        if (t > 0.9) {
            ctx.fillStyle = `rgba(180, 10, 30, ${(t - 0.9) * 10})`;
            for (let i = 0; i < 5; i++) {
                ctx.fillRect(sx - 5 + Math.random() * blockSize, sy + TILE - 5, 3, 12);
            }
        }
        ctx.restore();
    }

    function drawGasDeath() {
        const t = Math.min(1, (performance.now() - deathEffect.startTime) / 600);
        const col = deathEffect.col;
        const row = deathEffect.row;
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE - camY + TILE / 2;
        // Зелёный ядовитый туман (распространяется на 3×3)
        ctx.save();
        ctx.globalAlpha = Math.min(1, t * 1.2);
        const gasSize = TILE * 1.5 + t * 40;
        const gasGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, gasSize);
        gasGrad.addColorStop(0, 'rgba(150, 220, 80, 0.7)');
        gasGrad.addColorStop(0.4, 'rgba(100, 180, 50, 0.5)');
        gasGrad.addColorStop(0.8, 'rgba(60, 120, 30, 0.25)');
        gasGrad.addColorStop(1, 'rgba(40, 80, 20, 0)');
        ctx.fillStyle = gasGrad;
        ctx.fillRect(cx - gasSize, cy - gasSize, gasSize * 2, gasSize * 2);
        // Клубы газа — отдельные эллипсы
        ctx.fillStyle = 'rgba(130, 200, 60, 0.35)';
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2 + t * 3;
            const r = (TILE * 0.6 + t * 20) * (0.7 + Math.sin(t * 5 + i) * 0.3);
            const ex = cx + Math.cos(ang) * TILE * 0.3;
            const ey = cy + Math.sin(ang) * TILE * 0.3;
            ctx.beginPath();
            ctx.ellipse(ex, ey, r, r * 0.8, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        // Субару кашляет — покраснение + опускание
        drawSubaruBody(deathEffect.x, deathEffect.y - camY + t * 8, 1 - t * 0.1, 1 - t * 0.3);
        // Зелёные частицы над Субару (попадают в рот)
        ctx.fillStyle = `rgba(180, 240, 100, ${1 - t})`;
        for (let i = 0; i < 10; i++) {
            const px = deathEffect.x + (i - 5) * 3;
            const py = deathEffect.y - camY - 10 + Math.sin(t * 10 + i) * 8;
            ctx.beginPath();
            ctx.arc(px, py, 1 + Math.random(), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawHandDeath() {
        const t = Math.min(1, (performance.now() - deathEffect.startTime) / 600);
        const cx = deathEffect.x;
        const cy = deathEffect.y - camY;
        const col = deathEffect.col;
        const row = deathEffect.row;
        const plateY = row * TILE - camY + TILE - 8;
        // Плита треснула
        ctx.fillStyle = '#000';
        ctx.fillRect(col * TILE + 4, row * TILE - camY + 4, TILE - 8, TILE - 8);
        // Рука выходит из пола — большая когтистая, чёрная
        ctx.save();
        ctx.translate(cx, plateY);
        ctx.scale(1, -1); // рука направлена вверх
        const handReach = t * 80;
        // Запястье/рукав (тень)
        const wristGrad = ctx.createLinearGradient(0, 0, 0, handReach);
        wristGrad.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
        wristGrad.addColorStop(0.5, 'rgba(10, 0, 20, 0.85)');
        wristGrad.addColorStop(1, 'rgba(30, 0, 40, 0.5)');
        ctx.fillStyle = wristGrad;
        ctx.beginPath();
        ctx.ellipse(0, handReach * 0.3, 18, handReach * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Ладонь
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, handReach, 14, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        // Пальцы-когти — 5 штук, растопырены
        for (let i = -2; i <= 2; i++) {
            const fx = i * 6;
            const fy = handReach + 10 + Math.abs(i) * 2;
            const fLen = 22 - Math.abs(i) * 2;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(fx, fy - 2);
            ctx.lineTo(fx + i * 0.3, fy + fLen);
            ctx.stroke();
            // Острые кончики
            ctx.fillStyle = '#1a0015';
            ctx.beginPath();
            ctx.moveTo(fx - 2, fy + fLen - 4);
            ctx.lineTo(fx + i * 0.3, fy + fLen + 4);
            ctx.lineTo(fx + 2, fy + fLen - 4);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
        // Субару — тянется ВНИЗ (в пол), уменьшается
        const subY = cy + t * 20;
        const subScale = 1 - t * 0.5;
        const subAlpha = 1 - t * 0.6;
        drawSubaruBody(cx, subY, subScale, subAlpha);
        // Тёмная дымка вокруг Субару
        ctx.save();
        ctx.globalAlpha = t * 0.6;
        const darkGrad = ctx.createRadialGradient(cx, cy + 10, 2, cx, cy + 10, 50);
        darkGrad.addColorStop(0, 'rgba(40, 0, 60, 0.9)');
        darkGrad.addColorStop(1, 'rgba(40, 0, 60, 0)');
        ctx.fillStyle = darkGrad;
        ctx.fillRect(cx - 50, cy - 40, 100, 80);
        ctx.restore();
    }

    // ─── НОВАЯ ЛОВУШКА: ОГНЕННЫЙ ГЕЙЗЕР (T.FIRE) ────────
    function drawFireDeath() {
        const t = Math.min(1, (performance.now() - deathEffect.startTime) / 900);
        const cx = deathEffect.x;
        const cy = deathEffect.y - camY;
        const col = deathEffect.col;
        const row = deathEffect.row;
        const plateY = row * TILE - camY + TILE - 8;

        // Треснутая обугленная плита
        ctx.save();
        ctx.fillStyle = '#1a0808';
        ctx.fillRect(col * TILE + 4, row * TILE - camY + 4, TILE - 8, TILE - 8);
        ctx.strokeStyle = '#ff6020';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
            const ang = (i / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, plateY);
            ctx.lineTo(cx + Math.cos(ang) * (12 + Math.random() * 8),
                       plateY + Math.sin(ang) * (6 + Math.random() * 4));
            ctx.stroke();
        }
        ctx.restore();

        // Огненный столб — растёт вверх, пышный
        const columnH = t * 140;
        ctx.save();
        ctx.translate(cx, plateY);
        // Внешний ореол (красно-оранжевый)
        const outerGrad = ctx.createRadialGradient(0, -columnH * 0.4, 4, 0, -columnH * 0.4, columnH);
        outerGrad.addColorStop(0, 'rgba(255, 220, 80, 0.9)');
        outerGrad.addColorStop(0.4, 'rgba(255, 100, 20, 0.85)');
        outerGrad.addColorStop(0.75, 'rgba(200, 30, 0, 0.6)');
        outerGrad.addColorStop(1, 'rgba(80, 10, 0, 0)');
        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.ellipse(0, -columnH * 0.4, 24 + t * 8, columnH * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Внутреннее ядро (жёлто-белое)
        const coreGrad = ctx.createRadialGradient(0, -columnH * 0.3, 2, 0, -columnH * 0.3, columnH * 0.5);
        coreGrad.addColorStop(0, 'rgba(255, 255, 240, 0.95)');
        coreGrad.addColorStop(0.5, 'rgba(255, 200, 60, 0.85)');
        coreGrad.addColorStop(1, 'rgba(255, 120, 20, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.ellipse(0, -columnH * 0.3, 10, columnH * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        // Языки пламени — извивающиеся частицы
        for (let i = 0; i < 16; i++) {
            const fx = (Math.random() - 0.5) * 30;
            const fy = -Math.random() * columnH;
            const size = 3 + Math.random() * 5;
            const alpha = 0.5 + Math.random() * 0.5;
            ctx.fillStyle = `rgba(255, ${120 + Math.random() * 100 | 0}, 20, ${alpha})`;
            ctx.beginPath();
            ctx.arc(fx, fy, size, 0, Math.PI * 2);
            ctx.fill();
        }
        // Искры летят вверх
        for (let i = 0; i < 12; i++) {
            const sx = (Math.random() - 0.5) * 20;
            const sy = -columnH - Math.random() * 30;
            ctx.fillStyle = `rgba(255, 240, 100, ${Math.random() * 0.9})`;
            ctx.beginPath();
            ctx.arc(sx, sy, 1.5 + Math.random(), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Субару горит — чёрный силуэт с красными краями
        const subAlpha = Math.max(0, 1 - t * 0.7);
        ctx.save();
        ctx.globalAlpha = subAlpha;
        drawSubaruBody(cx, cy, 1 - t * 0.15, 1);
        ctx.restore();
        // Огненная обводка Субару
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(255, 140, 40, ${t * 0.7})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 20 + t * 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Дым сверху
        ctx.save();
        ctx.globalAlpha = t * 0.6;
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = '#2a2020';
            ctx.beginPath();
            ctx.arc(cx + (Math.random() - 0.5) * 30, cy - 40 - t * 30 + i * 8,
                    10 + i * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // ─── НОВАЯ ЛОВУШКА: ВРАЩАЮЩИЙСЯ КЛИНОК (T.SPIN) ─────
    function drawSpinDeath() {
        const t = Math.min(1, (performance.now() - deathEffect.startTime) / 700);
        const cx = deathEffect.x;
        const cy = deathEffect.y - camY;
        const col = deathEffect.col;
        const row = deathEffect.row;
        const ceilingY = row * TILE - camY + 6;

        // Потолочная трещина / крепление
        ctx.save();
        ctx.fillStyle = '#302820';
        ctx.fillRect(cx - 10, ceilingY - 4, 20, 8);
        ctx.strokeStyle = '#1a1410';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 14, ceilingY); ctx.lineTo(cx + 14, ceilingY);
        ctx.stroke();
        ctx.restore();

        // Цепь/штанга вниз до уровня Субару
        const bladeY = ceilingY + t * (cy - ceilingY - 8);
        ctx.save();
        ctx.strokeStyle = '#505868';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, ceilingY);
        ctx.lineTo(cx, bladeY - 20);
        ctx.stroke();
        // Звенья цепи
        ctx.strokeStyle = '#606878';
        ctx.lineWidth = 1.5;
        for (let y = ceilingY; y < bladeY - 20; y += 6) {
            ctx.beginPath();
            ctx.arc(cx, y + 3, 2.5, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();

        // Вращающийся клинок — 4 лезвия крест-накрест
        const angle = performance.now() / 40; // очень быстрое вращение
        ctx.save();
        ctx.translate(cx, bladeY);
        ctx.rotate(angle);
        // Центральная втулка
        const hubGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 12);
        hubGrad.addColorStop(0, '#e0e8f0');
        hubGrad.addColorStop(0.6, '#808898');
        hubGrad.addColorStop(1, '#303848');
        ctx.fillStyle = hubGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1a2030';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 4 лезвия
        for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.rotate((i / 4) * Math.PI * 2);
            const bladeGrad = ctx.createLinearGradient(0, 0, 28, 0);
            bladeGrad.addColorStop(0, '#a0a8b8');
            bladeGrad.addColorStop(0.5, '#e8eef8');
            bladeGrad.addColorStop(1, '#707888');
            ctx.fillStyle = bladeGrad;
            ctx.beginPath();
            ctx.moveTo(8, -4);
            ctx.lineTo(28, -2);
            ctx.lineTo(30, 0);
            ctx.lineTo(28, 2);
            ctx.lineTo(8, 4);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#1a2030';
            ctx.lineWidth = 1;
            ctx.stroke();
            // Зубцы на лезвии
            ctx.fillStyle = '#d8e0f0';
            for (let j = 10; j < 28; j += 3) {
                ctx.beginPath();
                ctx.moveTo(j, -4);
                ctx.lineTo(j + 1.5, -2);
                ctx.lineTo(j + 3, -4);
                ctx.fill();
            }
            // Кровь на кончике
            if (t > 0.5) {
                ctx.fillStyle = `rgba(180, 0, 20, ${Math.min(1, (t - 0.5) * 2)})`;
                ctx.beginPath();
                ctx.arc(28, 0, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        ctx.restore();

        // Кровавые брызги во все стороны
        ctx.fillStyle = '#a00010';
        for (let i = 0; i < 18; i++) {
            const ang = (i / 18) * Math.PI * 2 + angle * 0.1;
            const dist = t * (15 + Math.random() * 35);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * dist,
                    bladeY + Math.sin(ang) * dist,
                    1 + Math.random() * 3,
                    0, Math.PI * 2);
            ctx.fill();
        }

        // Субару сжимается
        const subScale = 1 - t * 0.3;
        const subAlpha = Math.max(0, 1 - t * 0.5);
        drawSubaruBody(cx, cy, subScale, subAlpha);

        // Кровавая лужа расширяется
        if (t > 0.3) {
            const poolT = (t - 0.3) / 0.7;
            ctx.save();
            ctx.fillStyle = `rgba(100, 0, 15, ${poolT * 0.8})`;
            ctx.beginPath();
            ctx.ellipse(cx, cy + 15, 20 * poolT, 6 * poolT, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ─── 8 ЖУТКИХ ДЖАМПСКЕРОВ ───────────────────────────
    function drawJumpscare() {
        const now = performance.now();
        if (now >= jumpscareUntil) return;

        const elapsed = jumpscareUntil - now;
        const progress = 1 - elapsed / 280;
        const cx = CANVAS_W / 2;
        const cy = CANVAS_H / 2;

        // Пульсирующее дрожание (усиливает страх)
        const jitterX = (Math.random() - 0.5) * 6;
        const jitterY = (Math.random() - 0.5) * 6;

        ctx.save();
        ctx.translate(jitterX, jitterY);

        // Полотно — чёрный с красным виньетом
        ctx.fillStyle = '#000';
        ctx.fillRect(-10, -10, CANVAS_W + 20, CANVAS_H + 20);
        const vg = ctx.createRadialGradient(cx, cy, 60, cx, cy, CANVAS_W);
        vg.addColorStop(0, 'rgba(80, 0, 20, 0.6)');
        vg.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = vg;
        ctx.fillRect(-10, -10, CANVAS_W + 20, CANVAS_H + 20);

        switch (jumpscareType) {
            case 'satella':          drawScareSatella(cx, cy, progress); break;
            case 'petelgeuse':       drawScarePetelgeuse(cx, cy, progress); break;
            case 'elsa':             drawScareElsa(cx, cy, progress); break;
            case 'rem_demon':        drawScareRemDemon(cx, cy, progress); break;
            case 'subaru_bleeding':  drawScareSubaruBleeding(cx, cy, progress); break;
            case 'whale_eye':        drawScareWhaleEye(cx, cy, progress); break;
            case 'claw_hand':        drawScareClawHand(cx, cy, progress); break;
            case 'shadow_cultist':   drawScareShadowCultist(cx, cy, progress); break;
            case 'generic':          if (genericScareParams) drawScareGeneric(cx, cy, progress, genericScareParams); break;
        }

        // Финальный красный стробоскоп (случайная вспышка)
        if (Math.random() < 0.3) {
            ctx.fillStyle = `rgba(200, 0, 30, ${0.2 + Math.random() * 0.3})`;
            ctx.fillRect(-10, -10, CANVAS_W + 20, CANVAS_H + 20);
        }

        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════
    // ПРОЦЕДУРНЫЙ СКРИМЕР — собирает жуткое лицо из параметров
    // ═══════════════════════════════════════════════════════
    function drawScareGeneric(cx, cy, p, params) {
        const scale = 1 + p * 0.15;
        const jitter = Math.sin(performance.now() / 30) * 2;
        ctx.save();
        ctx.translate(cx + jitter, cy);
        ctx.scale(scale, scale);

        // ── Голова (база) ──
        drawScareFace(params);
        // ── Волосы (под лицо или поверх) ──
        if (params.hair && params.hair !== 'none') drawScareHair(params);
        // ── Аксессуары на голове (рога, капюшон, фата, нимб) ──
        if (params.accessory) drawScareAccessory(params);
        // ── Глаза ──
        if (params.eyes && params.eyes !== 'none') drawScareEyes(params);
        // ── Рот ──
        if (params.mouth && params.mouth !== 'none') drawScareMouth(params);
        // ── Дополнительные метки (трещины, пентаграмма, кровь) ──
        if (params.mark) drawScareMark(params);

        ctx.restore();
    }

    function drawScareFace(p) {
        ctx.save();
        if (p.skin === 'transparent' && p.face === 'eye_only') return; // глаз без лица
        if (p.skin === 'transparent' && p.face === 'mouth_only') return;
        if (p.face === 'no_head') {
            // Безголовый — рисуем только окровавленную шею
            ctx.fillStyle = '#600000';
            ctx.beginPath();
            ctx.ellipse(0, 100, 80, 30, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#a00010';
            for (let i = 0; i < 8; i++) {
                ctx.beginPath();
                ctx.arc((i - 4) * 18, 105 + Math.random() * 10, 4 + Math.random() * 6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            return;
        }
        // Тень под лицом
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(8, 8, 145, 185, 0, 0, Math.PI * 2);
        ctx.fill();
        // Само лицо
        const grad = ctx.createRadialGradient(-25, -40, 15, 0, 0, 200);
        grad.addColorStop(0, lightenColor(p.skin, 30));
        grad.addColorStop(1, p.skin);
        ctx.fillStyle = grad;
        ctx.beginPath();
        let rx = 140, ry = 180;
        switch (p.face) {
            case 'wide':         rx = 170; ry = 150; break;
            case 'long':         rx = 110; ry = 200; break;
            case 'extreme_long': rx = 90;  ry = 230; break;
            case 'round':        rx = 150; ry = 150; break;
            case 'small':        rx = 100; ry = 130; break;
            case 'thin':         rx = 80;  ry = 200; break;
            case 'skull':        rx = 130; ry = 175; break;
            case 'porcelain':    rx = 130; ry = 175; break;
            case 'doll':         rx = 130; ry = 165; break;
            case 'witch':        rx = 125; ry = 195; break;
            case 'silhouette':   rx = 145; ry = 195; break;
            case 'hidden':       rx = 130; ry = 180; break;
            case 'minko':        rx = 130; ry = 170; break;
            case 'masculine':    rx = 145; ry = 175; break;
            case 'split':        rx = 145; ry = 180; break;
        }
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        // Если лицо — череп, добавим костяные тени для скул
        if (p.face === 'skull') {
            ctx.fillStyle = 'rgba(20,10,5,0.5)';
            ctx.beginPath(); ctx.ellipse(-55, 20, 22, 35, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(55, 20, 22, 35, 0, 0, Math.PI * 2); ctx.fill();
            // Чёрные глазницы
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.ellipse(-40, -25, 28, 30, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(40, -25, 28, 30, 0, 0, Math.PI * 2); ctx.fill();
            // Носовая полость
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(-12, 25); ctx.lineTo(0, 30); ctx.lineTo(12, 25); ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    function drawScareEyes(p) {
        ctx.save();
        const ex = 40, ey = -25;
        switch (p.eyes) {
            case 'empty': // пустые глазницы
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 22, 30, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 22, 30, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'glowing':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 22, 28, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 22, 28, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = p.eyeColor;
                ctx.shadowColor = p.eyeColor;
                ctx.shadowBlur = 30;
                ctx.beginPath(); ctx.arc(-ex, ey, 9, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex, ey, 9, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                break;
            case 'crossed_dark':
                ctx.fillStyle = p.eyeColor;
                ctx.beginPath(); ctx.ellipse(-ex, ey, 18, 22, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 18, 22, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#400000';
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(-ex - 20, ey - 20); ctx.lineTo(-ex + 20, ey + 20); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-ex + 20, ey - 20); ctx.lineTo(-ex - 20, ey + 20); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(ex - 20, ey - 20); ctx.lineTo(ex + 20, ey + 20); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(ex + 20, ey - 20); ctx.lineTo(ex - 20, ey + 20); ctx.stroke();
                break;
            case 'sewn':
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(-ex - 25, ey); ctx.lineTo(-ex + 25, ey); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(ex - 25, ey); ctx.lineTo(ex + 25, ey); ctx.stroke();
                // Стежки
                for (let i = -3; i <= 3; i++) {
                    ctx.beginPath(); ctx.moveTo(-ex + i * 8, ey - 8); ctx.lineTo(-ex + i * 8 + 4, ey + 8); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(ex + i * 8, ey - 8); ctx.lineTo(ex + i * 8 + 4, ey + 8); ctx.stroke();
                }
                break;
            case 'one_huge':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(0, ey + 5, 60, 60, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = p.eyeColor;
                ctx.shadowColor = p.eyeColor; ctx.shadowBlur = 40;
                ctx.beginPath(); ctx.arc(0, ey + 5, 40, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.arc(0, ey + 5, 18, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                break;
            case 'three':
                drawSingleEye(-ex, ey, p.eyeColor);
                drawSingleEye(ex, ey, p.eyeColor);
                drawSingleEye(0, -75, p.eyeColor);
                break;
            case 'rotten':
                ctx.fillStyle = '#1a1808';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 20, 22, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 20, 22, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = p.eyeColor;
                ctx.beginPath(); ctx.arc(-ex, ey, 8, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex, ey, 8, 0, Math.PI * 2); ctx.fill();
                break;
            case 'doll':
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 22, 22, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 22, 22, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = p.eyeColor;
                ctx.beginPath(); ctx.arc(-ex, ey, 14, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex, ey, 14, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.arc(-ex, ey, 7, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill();
                break;
            case 'doll_crack':
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 22, 22, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 22, 22, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = p.eyeColor;
                ctx.beginPath(); ctx.arc(-ex, ey, 13, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex, ey, 13, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(-ex, ey - 22); ctx.lineTo(-ex + 5, ey + 22); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(ex - 6, ey - 25); ctx.lineTo(ex + 4, ey + 25); ctx.stroke();
                break;
            case 'rolled_back':
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 22, 18, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 22, 18, 0, 0, Math.PI * 2); ctx.fill();
                // Зрачки наверху (закатанные)
                ctx.fillStyle = '#400';
                ctx.beginPath(); ctx.arc(-ex, ey - 12, 4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex, ey - 12, 4, 0, Math.PI * 2); ctx.fill();
                break;
            case 'closed_blood':
                ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(-ex, ey, 22, 0, Math.PI); ctx.stroke();
                ctx.beginPath(); ctx.arc(ex, ey, 22, 0, Math.PI); ctx.stroke();
                ctx.fillStyle = '#a00010';
                for (let i = -1; i <= 1; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-ex + i * 5, ey + 10);
                    ctx.quadraticCurveTo(-ex + i * 5, ey + 80, -ex + i * 5 + 3, ey + 100);
                    ctx.quadraticCurveTo(-ex + i * 5 - 4, ey + 80, -ex + i * 5 - 5, ey + 60);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(ex + i * 5, ey + 10);
                    ctx.quadraticCurveTo(ex + i * 5, ey + 80, ex + i * 5 + 3, ey + 100);
                    ctx.quadraticCurveTo(ex + i * 5 - 4, ey + 80, ex + i * 5 - 5, ey + 60);
                    ctx.fill();
                }
                break;
            case 'tiny_white':
                ctx.fillStyle = p.eyeColor;
                ctx.shadowColor = p.eyeColor; ctx.shadowBlur = 20;
                ctx.beginPath(); ctx.arc(-25, ey, 4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(25, ey, 4, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                break;
            case 'two_pairs':
                ctx.fillStyle = p.eyeColor; ctx.shadowColor = p.eyeColor; ctx.shadowBlur = 25;
                ctx.beginPath(); ctx.arc(-40, -40, 7, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(40, -40, 7, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(-25, 0, 5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(25, 0, 5, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                break;
            case 'narrow':
            case 'narrow_black':
                ctx.fillStyle = p.eyeColor || '#000';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'crazy':
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 24, 28, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 24, 28, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = p.eyeColor;
                ctx.beginPath(); ctx.arc(-ex + (Math.random() - 0.5) * 6, ey, 5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex + (Math.random() - 0.5) * 6, ey, 5, 0, Math.PI * 2); ctx.fill();
                break;
            case 'fangs': case 'sharp':
                drawSingleEye(-ex, ey, p.eyeColor);
                drawSingleEye(ex, ey, p.eyeColor);
                break;
            case 'one_missing':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 24, 30, 0, 0, Math.PI * 2); ctx.fill();
                drawSingleEye(ex, ey, p.eyeColor);
                ctx.fillStyle = '#600010';
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath(); ctx.arc(-ex - 10 + i * 5, ey + 30 + i * 12, 3, 0, Math.PI * 2); ctx.fill();
                }
                break;
            case 'one_each_side':
                drawSingleEye(-50, -10, p.eyeColor);
                drawSingleEye(50, 10, p.eyeColor);
                break;
            case 'hole_face':
                ctx.fillStyle = '#000';
                for (const [hx, hy, hr] of [[-40, -25, 18], [40, -25, 18], [0, 30, 22]]) {
                    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#a00020';
                    for (let i = 0; i < 6; i++) {
                        const a = (i / 6) * Math.PI * 2;
                        ctx.beginPath();
                        ctx.arc(hx + Math.cos(a) * (hr + 4), hy + Math.sin(a) * (hr + 4), 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.fillStyle = '#000';
                }
                break;
            case 'pure_black':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(-ex, ey, 26, 30, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(ex, ey, 26, 30, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'massive_pupil':
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0, 0, 180, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = p.eyeColor;
                ctx.shadowColor = p.eyeColor; ctx.shadowBlur = 60;
                ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                // Прожилки в глазе
                ctx.strokeStyle = '#800020'; ctx.lineWidth = 1.5;
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 100, Math.sin(a) * 100);
                    ctx.quadraticCurveTo(Math.cos(a) * 140, Math.sin(a) * 140, Math.cos(a) * 175, Math.sin(a) * 175);
                    ctx.stroke();
                }
                break;
        }
        ctx.restore();
    }

    function drawSingleEye(x, y, color) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(x, y, 22, 22, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }

    function drawScareMouth(p) {
        ctx.save();
        const my = 75;
        switch (p.mouth) {
            case 'gaping': case 'gaping_blood':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(0, my, 50, 40, 0, 0, Math.PI * 2); ctx.fill();
                if (p.mouth === 'gaping_blood') {
                    ctx.fillStyle = '#a00010';
                    ctx.beginPath(); ctx.ellipse(0, my + 30, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
                }
                if (p.teeth === 'sharp_blood' || p.teeth === 'sharp') {
                    drawSharpTeeth(0, my, 50, p.teeth === 'sharp_blood');
                }
                break;
            case 'grin_skull':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.rect(-50, my - 12, 100, 25); ctx.fill();
                ctx.fillStyle = '#f0e8d0';
                for (let i = -4; i <= 4; i++) {
                    ctx.fillRect(-50 + (i + 4) * 11, my - 10, 9, 22);
                }
                break;
            case 'demonic':
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(-60, my);
                ctx.quadraticCurveTo(0, my + 60, 60, my);
                ctx.lineTo(60, my - 5);
                ctx.quadraticCurveTo(0, my - 30, -60, my - 5);
                ctx.fill();
                drawSharpTeeth(0, my - 5, 60, true);
                break;
            case 'sewn':
                ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.moveTo(-50, my); ctx.lineTo(50, my); ctx.stroke();
                for (let i = -4; i <= 4; i++) {
                    ctx.beginPath(); ctx.moveTo(-50 + (i + 4) * 12, my - 10); ctx.lineTo(-50 + (i + 4) * 12 + 5, my + 10); ctx.stroke();
                }
                break;
            case 'closed_blood':
                ctx.strokeStyle = '#a00020'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(-40, my); ctx.lineTo(40, my); ctx.stroke();
                ctx.fillStyle = '#a00010';
                ctx.beginPath();
                ctx.moveTo(0, my + 3);
                ctx.quadraticCurveTo(-3, my + 60, 0, my + 75);
                ctx.quadraticCurveTo(3, my + 60, 0, my + 3);
                ctx.fill();
                break;
            case 'closed_blue':
                ctx.fillStyle = '#3a5060';
                ctx.beginPath();
                ctx.ellipse(0, my, 35, 8, 0, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'fangs_blood': case 'fangs':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(0, my, 38, 22, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.moveTo(-15, my - 18); ctx.lineTo(-22, my + 10); ctx.lineTo(-9, my - 8); ctx.fill();
                ctx.beginPath(); ctx.moveTo(15, my - 18); ctx.lineTo(22, my + 10); ctx.lineTo(9, my - 8); ctx.fill();
                if (p.mouth === 'fangs_blood') {
                    ctx.fillStyle = '#a00010';
                    ctx.fillRect(-25, my + 12, 50, 4);
                }
                break;
            case 'rotten_grin':
                ctx.fillStyle = '#1a1810';
                ctx.beginPath(); ctx.ellipse(0, my, 50, 20, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#605840';
                for (let i = -3; i <= 3; i++) {
                    if (Math.abs(i) % 2 === 0) ctx.fillRect(-40 + (i + 3) * 12, my - 8, 8, 14);
                }
                break;
            case 'doll_smile':
                ctx.strokeStyle = '#a00040'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(0, my - 10, 35, 0.2, Math.PI - 0.2); ctx.stroke();
                break;
            case 'tongue_out':
                ctx.fillStyle = '#600020';
                ctx.beginPath(); ctx.ellipse(0, my, 25, 12, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#a00040';
                ctx.beginPath(); ctx.ellipse(0, my + 30, 15, 35, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'huge_grin':
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(-90, my - 5);
                ctx.quadraticCurveTo(0, my + 70, 90, my - 5);
                ctx.quadraticCurveTo(0, my + 10, -90, my - 5);
                ctx.fill();
                drawSharpTeeth(0, my, 90, false);
                break;
            case 'sad':
                ctx.strokeStyle = '#a00040'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(0, my + 30, 30, Math.PI + 0.2, -0.2); ctx.stroke();
                break;
            case 'whispering':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(0, my, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'cackle':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(0, my, 45, 30, 0, 0, Math.PI * 2); ctx.fill();
                drawSharpTeeth(0, my, 45, false);
                ctx.strokeStyle = '#603020'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(-50, my - 15); ctx.lineTo(-30, my - 18); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(50, my - 15); ctx.lineTo(30, my - 18); ctx.stroke();
                break;
            case 'cracked_smile':
                ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(0, my - 10, 40, 0.2, Math.PI - 0.2); ctx.stroke();
                ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(35, my); ctx.lineTo(50, my + 30); ctx.stroke();
                break;
            case 'small_grin':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(0, my, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
                drawSharpTeeth(0, my, 20, false);
                break;
            case 'tongue_long':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(0, my, 40, 20, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#a00040';
                ctx.beginPath();
                ctx.moveTo(-12, my);
                ctx.quadraticCurveTo(-10, my + 80, -5, my + 130);
                ctx.quadraticCurveTo(5, my + 130, 10, my + 80);
                ctx.quadraticCurveTo(12, my, -12, my);
                ctx.fill();
                break;
            case 'split_grin':
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(-70, my);
                ctx.quadraticCurveTo(0, my + 50, 70, my);
                ctx.quadraticCurveTo(0, my + 5, -70, my);
                ctx.fill();
                drawSharpTeeth(0, my + 8, 70, true);
                ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(0, my - 30); ctx.lineTo(0, my + 60); ctx.stroke();
                break;
            case 'horizontal_line':
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(-25, my); ctx.lineTo(25, my); ctx.stroke();
                break;
            case 'grin_blood':
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(0, my, 50, 22, 0, 0, Math.PI * 2); ctx.fill();
                drawSharpTeeth(0, my, 50, true);
                ctx.fillStyle = '#a00010';
                for (let i = 0; i < 6; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-30 + i * 12, my + 18);
                    ctx.quadraticCurveTo(-30 + i * 12, my + 70, -28 + i * 12, my + 90);
                    ctx.quadraticCurveTo(-32 + i * 12, my + 70, -34 + i * 12, my + 50);
                    ctx.fill();
                }
                break;
            case 'creepy_smile':
                ctx.strokeStyle = '#a00040'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(0, my, 50, 0.1, Math.PI - 0.1); ctx.stroke();
                drawSharpTeeth(0, my + 10, 50, false);
                break;
            case 'massive_jaws':
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(-160, 0);
                ctx.quadraticCurveTo(0, 120, 160, 0);
                ctx.quadraticCurveTo(0, -40, -160, 0);
                ctx.fill();
                drawSharpTeeth(0, 30, 160, true);
                drawSharpTeeth(0, -10, 160, true, true);
                break;
        }
        ctx.restore();
    }

    function drawSharpTeeth(cx, cy, w, blood, upward) {
        ctx.save();
        ctx.fillStyle = '#fff';
        const count = Math.max(4, Math.floor(w / 10));
        const tw = (w * 2) / count;
        for (let i = 0; i < count; i++) {
            const x = -w + i * tw + tw / 2;
            ctx.beginPath();
            if (upward) {
                ctx.moveTo(cx + x - tw / 3, cy);
                ctx.lineTo(cx + x, cy - tw * 0.8);
                ctx.lineTo(cx + x + tw / 3, cy);
            } else {
                ctx.moveTo(cx + x - tw / 3, cy);
                ctx.lineTo(cx + x, cy + tw * 0.8);
                ctx.lineTo(cx + x + tw / 3, cy);
            }
            ctx.closePath();
            ctx.fill();
        }
        if (blood) {
            ctx.fillStyle = '#a00010';
            ctx.fillRect(cx - w, cy + (upward ? -3 : -3), w * 2, 4);
        }
        ctx.restore();
    }

    function drawScareHair(p) {
        ctx.save();
        switch (p.hair) {
            case 'long_black':
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(-160, -100);
                ctx.quadraticCurveTo(-200, 100, -130, 250);
                ctx.lineTo(130, 250);
                ctx.quadraticCurveTo(200, 100, 160, -100);
                ctx.quadraticCurveTo(0, -200, -160, -100);
                ctx.fill();
                break;
            case 'long_black_wet':
                ctx.fillStyle = '#0a0008';
                for (let i = 0; i < 12; i++) {
                    ctx.beginPath();
                    const x = -130 + i * 22;
                    ctx.moveTo(x - 8, -130);
                    ctx.quadraticCurveTo(x + 5, 100, x - 4, 240);
                    ctx.lineTo(x + 8, 240);
                    ctx.quadraticCurveTo(x + 12, 100, x + 8, -130);
                    ctx.fill();
                }
                break;
            case 'wild': case 'wild_red': case 'wild_black': case 'wild_grey':
                ctx.fillStyle = p.hair === 'wild_red' ? '#600810' : (p.hair === 'wild_grey' ? '#807878' : '#000');
                for (let i = 0; i < 14; i++) {
                    const a = -Math.PI / 2 + (i - 7) * 0.18;
                    const len = 140 + Math.sin(i * 2) * 30;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 80, Math.sin(a) * 80);
                    ctx.lineTo(Math.cos(a) * (80 + len) + (Math.random() - 0.5) * 30, Math.sin(a) * (80 + len) + (Math.random() - 0.5) * 30);
                    ctx.lineTo(Math.cos(a + 0.05) * 80, Math.sin(a + 0.05) * 80);
                    ctx.fill();
                }
                break;
            case 'short_dark': case 'short_messy': case 'short_blood':
                ctx.fillStyle = p.hair === 'short_blood' ? '#400010' : '#181010';
                ctx.beginPath();
                ctx.ellipse(0, -130, 130, 80, 0, Math.PI, Math.PI * 2);
                ctx.fill();
                if (p.hair === 'short_messy') {
                    for (let i = 0; i < 8; i++) {
                        ctx.fillRect(-100 + i * 25, -200 + Math.random() * 20, 6, 20);
                    }
                }
                break;
            case 'slicked_back':
                ctx.fillStyle = '#0a0a0a';
                ctx.beginPath();
                ctx.ellipse(0, -130, 145, 100, 0, Math.PI, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#202020'; ctx.lineWidth = 2;
                for (let i = -6; i <= 6; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * 18, -180); ctx.lineTo(i * 18, -100);
                    ctx.stroke();
                }
                break;
            case 'patchy':
                ctx.fillStyle = '#3a3020';
                ctx.beginPath();
                ctx.ellipse(0, -130, 140, 90, 0, Math.PI, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1a0a08'; // лысины
                for (const [x, y, r] of [[-50, -150, 25], [40, -180, 18], [80, -130, 22]]) {
                    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
                }
                break;
            case 'curly_dark': case 'curly_blonde':
                ctx.fillStyle = p.hair === 'curly_blonde' ? '#c0a070' : '#2a1810';
                for (let i = -5; i <= 5; i++) {
                    ctx.beginPath();
                    ctx.arc(i * 28, -160 + Math.sin(i) * 10, 28, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            case 'long_red':
                ctx.fillStyle = '#7a0010';
                ctx.beginPath();
                ctx.moveTo(-150, -100);
                ctx.quadraticCurveTo(-180, 100, -110, 250);
                ctx.lineTo(110, 250);
                ctx.quadraticCurveTo(180, 100, 150, -100);
                ctx.quadraticCurveTo(0, -200, -150, -100);
                ctx.fill();
                break;
            case 'long_white_torn':
                ctx.fillStyle = '#e8e0d0';
                for (let i = 0; i < 10; i++) {
                    ctx.beginPath();
                    const x = -120 + i * 26;
                    ctx.moveTo(x - 8, -120);
                    ctx.quadraticCurveTo(x + 5, 80, x - 5, 220);
                    ctx.lineTo(x + 8, 230);
                    ctx.quadraticCurveTo(x + 12, 100, x + 8, -120);
                    ctx.fill();
                }
                break;
            case 'wet_black_long':
                ctx.fillStyle = '#000';
                for (let i = 0; i < 16; i++) {
                    ctx.beginPath();
                    const x = -150 + i * 19;
                    const drop = (i % 2) ? 220 : 250;
                    ctx.moveTo(x - 6, -120);
                    ctx.quadraticCurveTo(x, 100, x, drop);
                    ctx.lineTo(x + 6, drop);
                    ctx.quadraticCurveTo(x + 8, 100, x + 6, -120);
                    ctx.fill();
                }
                break;
            case 'twin_tails':
                ctx.fillStyle = '#1a0808';
                ctx.beginPath();
                ctx.ellipse(0, -130, 130, 80, 0, Math.PI, Math.PI * 2);
                ctx.fill();
                // Хвостики
                ctx.beginPath();
                ctx.ellipse(-130, -50, 30, 80, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath();
                ctx.ellipse(130, -50, 30, 80, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'pink_long':
                ctx.fillStyle = '#f8a8c8';
                ctx.beginPath();
                ctx.moveTo(-150, -100);
                ctx.quadraticCurveTo(-200, 100, -130, 250);
                ctx.lineTo(130, 250);
                ctx.quadraticCurveTo(200, 100, 150, -100);
                ctx.quadraticCurveTo(0, -210, -150, -100);
                ctx.fill();
                // Чёлка
                ctx.fillStyle = '#e889b8';
                ctx.beginPath();
                ctx.ellipse(0, -100, 130, 30, 0, Math.PI, Math.PI * 2);
                ctx.fill();
                break;
            case 'messy_long':
                ctx.fillStyle = '#1a1010';
                for (let i = 0; i < 12; i++) {
                    ctx.beginPath();
                    const x = -130 + i * 22 + Math.sin(i) * 10;
                    ctx.moveTo(x - 8, -120);
                    ctx.lineTo(x + 5 + Math.sin(i * 3) * 30, 200);
                    ctx.lineTo(x + 12, 200);
                    ctx.quadraticCurveTo(x + 12, 100, x + 8, -120);
                    ctx.fill();
                }
                break;
        }
        ctx.restore();
    }

    function drawScareAccessory(p) {
        ctx.save();
        switch (p.accessory) {
            case 'horns_big':
                ctx.fillStyle = '#1a0a08'; ctx.strokeStyle = '#400000'; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-80, -150); ctx.quadraticCurveTo(-130, -240, -150, -280);
                ctx.lineTo(-110, -180); ctx.quadraticCurveTo(-100, -150, -80, -150); ctx.fill(); ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(80, -150); ctx.quadraticCurveTo(130, -240, 150, -280);
                ctx.lineTo(110, -180); ctx.quadraticCurveTo(100, -150, 80, -150); ctx.fill(); ctx.stroke();
                break;
            case 'horns_small':
                ctx.fillStyle = '#1a0a08';
                ctx.beginPath(); ctx.moveTo(-70, -160); ctx.lineTo(-90, -210); ctx.lineTo(-55, -170); ctx.fill();
                ctx.beginPath(); ctx.moveTo(70, -160); ctx.lineTo(90, -210); ctx.lineTo(55, -170); ctx.fill();
                break;
            case 'noose':
                ctx.strokeStyle = '#603020'; ctx.lineWidth = 12;
                ctx.beginPath();
                ctx.moveTo(0, -300); ctx.lineTo(0, -50);
                ctx.stroke();
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.ellipse(0, 0, 90, 50, 0, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case 'hood_black':
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(-180, 100);
                ctx.quadraticCurveTo(-220, -80, -150, -180);
                ctx.quadraticCurveTo(0, -250, 150, -180);
                ctx.quadraticCurveTo(220, -80, 180, 100);
                ctx.lineTo(180, 250); ctx.lineTo(-180, 250); ctx.fill();
                // Тёмный овал внутри
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(0, -10, 100, 130, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'clown_makeup':
                ctx.fillStyle = '#ff0033';
                ctx.beginPath(); ctx.arc(-50, 30, 25, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(50, 30, 25, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(0, 10, 18, 0, Math.PI * 2); ctx.fill();
                // Полосы через глаза
                ctx.strokeStyle = '#ff0033'; ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(-80, -45); ctx.lineTo(-15, -15);
                ctx.moveTo(80, -45); ctx.lineTo(15, -15);
                ctx.stroke();
                break;
            case 'nun_veil':
                ctx.fillStyle = '#0a0a0a';
                ctx.beginPath();
                ctx.moveTo(-160, 80);
                ctx.quadraticCurveTo(-180, -100, -100, -180);
                ctx.quadraticCurveTo(0, -220, 100, -180);
                ctx.quadraticCurveTo(180, -100, 160, 80);
                ctx.lineTo(160, 230); ctx.lineTo(-160, 230);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.rect(-30, -120, 60, 30); ctx.fill();
                break;
            case 'witch_hat':
                ctx.fillStyle = '#0a0a0a';
                ctx.beginPath();
                ctx.moveTo(-100, -170); ctx.lineTo(0, -340); ctx.lineTo(100, -170);
                ctx.closePath(); ctx.fill();
                ctx.fillRect(-130, -180, 260, 25);
                ctx.fillStyle = '#a00010';
                ctx.fillRect(-130, -170, 260, 8);
                break;
            case 'bridal_veil':
                ctx.fillStyle = 'rgba(220,210,210,0.55)';
                ctx.beginPath();
                ctx.moveTo(-180, -100);
                ctx.quadraticCurveTo(-220, 200, -150, 280);
                ctx.lineTo(150, 280);
                ctx.quadraticCurveTo(220, 200, 180, -100);
                ctx.fill();
                break;
            case 'long_arms':
                ctx.fillStyle = '#0a0008';
                // Длинные тонкие руки слева и справа
                ctx.beginPath();
                ctx.moveTo(-150, 50); ctx.lineTo(-280, 240); ctx.lineTo(-260, 250); ctx.lineTo(-130, 60); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(150, 50); ctx.lineTo(280, 240); ctx.lineTo(260, 250); ctx.lineTo(130, 60); ctx.fill();
                // Когти
                for (const sign of [-1, 1]) {
                    for (let i = 0; i < 4; i++) {
                        ctx.beginPath();
                        ctx.moveTo(sign * (270 - i * 8), 245);
                        ctx.lineTo(sign * (290 - i * 8), 260);
                        ctx.lineTo(sign * (250 - i * 8), 255);
                        ctx.fill();
                    }
                }
                break;
        }
        ctx.restore();
    }

    function drawScareMark(p) {
        ctx.save();
        switch (p.mark) {
            case 'tear_blood':
                ctx.fillStyle = '#a00010';
                for (const sign of [-1, 1]) {
                    ctx.beginPath();
                    ctx.moveTo(sign * 35, -10);
                    ctx.quadraticCurveTo(sign * 32, 60, sign * 38, 130);
                    ctx.quadraticCurveTo(sign * 42, 60, sign * 45, -10);
                    ctx.fill();
                }
                break;
            case 'crack':
                ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-130, -130); ctx.lineTo(-50, -60); ctx.lineTo(-90, 30); ctx.lineTo(20, 80); ctx.lineTo(-30, 160); ctx.stroke();
                break;
            case 'stitches':
                ctx.strokeStyle = '#400'; ctx.lineWidth = 2;
                for (let i = -3; i <= 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-100, i * 22 - 10); ctx.lineTo(100, i * 22 - 10); ctx.stroke();
                    for (let j = -8; j <= 8; j++) {
                        ctx.beginPath(); ctx.moveTo(j * 12, i * 22 - 18); ctx.lineTo(j * 12 + 4, i * 22 - 2); ctx.stroke();
                    }
                }
                break;
            case 'veins':
                ctx.strokeStyle = '#400020'; ctx.lineWidth = 1.5;
                for (let i = 0; i < 14; i++) {
                    const a = (i / 14) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 60, Math.sin(a) * 60);
                    ctx.quadraticCurveTo(Math.cos(a) * 100, Math.sin(a) * 100, Math.cos(a) * 140 + Math.sin(i) * 10, Math.sin(a) * 150);
                    ctx.stroke();
                }
                break;
            case 'blood_lips':
                ctx.fillStyle = '#a00010';
                ctx.beginPath();
                ctx.moveTo(-30, 110); ctx.lineTo(0, 200); ctx.lineTo(30, 110); ctx.fill();
                break;
            case 'wounds':
                ctx.fillStyle = '#600010';
                for (const [x, y, len, ang] of [[-60, 30, 35, 0.3], [40, -30, 30, -0.5], [70, 80, 25, 0.8]]) {
                    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
                    ctx.beginPath(); ctx.ellipse(0, 0, len, 4, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
                break;
            case 'porcelain_cracks':
                ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(-80, -80); ctx.lineTo(-30, 30); ctx.lineTo(20, 60); ctx.lineTo(50, 130); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(70, -100); ctx.lineTo(40, -30); ctx.lineTo(80, 50); ctx.stroke();
                break;
            case 'pentagram':
                ctx.strokeStyle = '#a00010'; ctx.lineWidth = 3;
                ctx.beginPath();
                const r = 60, cy0 = 0;
                for (let i = 0; i < 5; i++) {
                    const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
                    if (i === 0) ctx.moveTo(Math.cos(a) * r, cy0 + Math.sin(a) * r);
                    else ctx.lineTo(Math.cos(a) * r, cy0 + Math.sin(a) * r);
                }
                ctx.closePath(); ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, cy0, r + 10, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case 'water_drips':
                ctx.fillStyle = 'rgba(120,160,200,0.65)';
                for (const [x, y] of [[-80, 50], [-30, 120], [40, 80], [80, 140], [-100, 180]]) {
                    ctx.beginPath();
                    ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 4, y + 30, x, y + 50); ctx.quadraticCurveTo(x + 4, y + 30, x, y);
                    ctx.fill();
                }
                break;
            case 'transparency':
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.beginPath(); ctx.ellipse(0, 0, 145, 185, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case 'shadow_aura':
                ctx.fillStyle = 'rgba(40,0,40,0.6)';
                for (let i = 0; i < 20; i++) {
                    const a = (i / 20) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 150, Math.sin(a) * 200);
                    ctx.lineTo(Math.cos(a) * 250, Math.sin(a) * 280);
                    ctx.lineTo(Math.cos(a + 0.1) * 150, Math.sin(a + 0.1) * 200);
                    ctx.fill();
                }
                break;
            case 'demonic_runes':
                ctx.fillStyle = '#a00010'; ctx.font = 'bold 22px serif';
                const runes = ['卐', '✠', '⛧', '☩', '☽'];
                for (let i = 0; i < runes.length; i++) {
                    ctx.fillText(runes[i], -100 + i * 50, 130);
                }
                break;
            case 'broken_face':
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(20, 30); ctx.lineTo(80, 50); ctx.lineTo(60, 90); ctx.lineTo(20, 70); ctx.closePath();
                ctx.fill();
                break;
            case 'long_neck':
                ctx.fillStyle = lightenColor(p.skin, -10);
                ctx.fillRect(-30, 200, 60, 200);
                break;
            case 'mirror_cracks':
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
                for (let i = 0; i < 15; i++) {
                    const a = (i / 15) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 250, Math.sin(a) * 250);
                    ctx.stroke();
                }
                break;
            case 'face_holes':
                // уже отрисованы в drawScareEyes 'hole_face'
                break;
            case 'sakura_blood':
                ctx.fillStyle = '#a00050';
                for (let i = 0; i < 8; i++) {
                    const x = -120 + i * 30;
                    const y = 80 + Math.sin(i) * 30;
                    ctx.beginPath();
                    for (let j = 0; j < 5; j++) {
                        const a = (j / 5) * Math.PI * 2;
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
                    }
                    ctx.fill();
                }
                break;
            case 'blood_splatter':
                ctx.fillStyle = '#a00010';
                for (let i = 0; i < 25; i++) {
                    ctx.beginPath();
                    ctx.arc((Math.random() - 0.5) * 280, (Math.random() - 0.5) * 280, 2 + Math.random() * 8, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            case 'neck_blood':
                ctx.fillStyle = '#a00010';
                for (let i = 0; i < 12; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-60 + i * 12, 100);
                    ctx.lineTo(-60 + i * 12, 250 + Math.random() * 30);
                    ctx.lineTo(-55 + i * 12, 250 + Math.random() * 30);
                    ctx.lineTo(-55 + i * 12, 100);
                    ctx.fill();
                }
                break;
            case 'blood_drool':
                ctx.fillStyle = '#a00010';
                for (let i = 0; i < 5; i++) {
                    const x = -80 + i * 35;
                    ctx.beginPath();
                    ctx.moveTo(x, 60);
                    ctx.quadraticCurveTo(x - 4, 200, x, 290);
                    ctx.quadraticCurveTo(x + 4, 200, x, 60);
                    ctx.fill();
                }
                break;
        }
        ctx.restore();
    }

    function lightenColor(hex, amount) {
        if (!hex || hex[0] !== '#' || hex.length < 7) return hex || '#888';
        const r = Math.min(255, Math.max(0, parseInt(hex.slice(1, 3), 16) + amount));
        const g = Math.min(255, Math.max(0, parseInt(hex.slice(3, 5), 16) + amount));
        const b = Math.min(255, Math.max(0, parseInt(hex.slice(5, 7), 16) + amount));
        return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    }

    /** 1. САТЭЛЛА — пустые глазницы с фиолетовым свечением, окровавленные зубы */
    function drawScareSatella(cx, cy, p) {
        // Бледное лицо с ростом
        const scale = 1 + p * 0.1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        // Лицо
        const faceGrad = ctx.createRadialGradient(-20, -30, 10, 0, 0, 170);
        faceGrad.addColorStop(0, '#f0e0e8');
        faceGrad.addColorStop(1, '#8a7080');
        ctx.fillStyle = faceGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 140, 180, 0, 0, Math.PI * 2);
        ctx.fill();
        // Длинные чёрные волосы
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, -110, 200, 130, 0, 0, Math.PI, true);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-200, -90);
        ctx.quadraticCurveTo(-240, 120, -180, 240);
        ctx.quadraticCurveTo(-100, 280, -60, 200);
        ctx.lineTo(60, 200);
        ctx.quadraticCurveTo(100, 280, 180, 240);
        ctx.quadraticCurveTo(240, 120, 200, -90);
        ctx.fill();
        // Пустые глазницы — чёрные дыры
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(-40, -20, 20, 30, 0, 0, Math.PI * 2);
        ctx.ellipse(40, -20, 20, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        // Один фиолетовый светящийся зрачок
        ctx.fillStyle = '#a855f7';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(40, -20, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Кровавые слёзы
        ctx.fillStyle = '#a00020';
        for (let i = -1; i <= 1; i += 2) {
            ctx.fillRect(-40 + (i === 1 ? 80 : 0) - 3, 0, 4, 100);
            ctx.fillRect(-40 + (i === 1 ? 80 : 0) - 1, 95, 2, 20);
        }
        // Широкий разверстый рот
        ctx.fillStyle = '#1a0005';
        ctx.beginPath();
        ctx.ellipse(0, 75, 55, 40, 0, 0, Math.PI * 2);
        ctx.fill();
        // Зубы, острые как клыки
        ctx.fillStyle = '#f0e0c8';
        for (let i = 0; i < 7; i++) {
            const tx = -48 + i * 16;
            ctx.beginPath();
            ctx.moveTo(tx - 5, 45);
            ctx.lineTo(tx, 80);
            ctx.lineTo(tx + 5, 45);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(tx - 4, 105);
            ctx.lineTo(tx, 78);
            ctx.lineTo(tx + 4, 105);
            ctx.closePath();
            ctx.fill();
        }
        // Кровь из рта
        ctx.fillStyle = '#600010';
        ctx.fillRect(-45, 100, 90, 25);
        ctx.restore();
    }

    /** 2. ПЕТЕЛЬГЕЙЗЕ — выпученные окровавленные глаза, маниакальная улыбка до ушей */
    function drawScarePetelgeuse(cx, cy, p) {
        // Бледное лицо приближается
        const scale = 1 + p * 0.2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        // Лицо
        ctx.fillStyle = '#c8b8b0';
        ctx.beginPath();
        ctx.ellipse(0, 0, 150, 200, 0, 0, Math.PI * 2);
        ctx.fill();
        // Дикие седые волосы
        ctx.fillStyle = '#a8a094';
        for (let i = 0; i < 30; i++) {
            const ang = Math.PI + (i / 30) * Math.PI;
            const r = 180 + Math.sin(i * 3 + performance.now() / 80) * 30;
            ctx.save();
            ctx.rotate(ang);
            ctx.fillRect(0, -r, 4, 80);
            ctx.restore();
        }
        // ВЫПУЧЕННЫЕ ГЛАЗА — огромные, налитые кровью
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-40, -30, 35, 0, Math.PI * 2);
        ctx.arc(40, -30, 35, 0, Math.PI * 2);
        ctx.fill();
        // Кровавые сосуды на белках
        ctx.strokeStyle = '#c00030';
        ctx.lineWidth = 1.5;
        for (let e = 0; e < 2; e++) {
            const ex = e === 0 ? -40 : 40;
            for (let v = 0; v < 8; v++) {
                const ang = (v / 8) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(ex, -30);
                ctx.lineTo(ex + Math.cos(ang) * 32, -30 + Math.sin(ang) * 32);
                ctx.stroke();
            }
        }
        // Радужка (жёлто-зелёная, безумная)
        ctx.fillStyle = '#b0a020';
        ctx.beginPath();
        ctx.arc(-35, -28, 14, 0, Math.PI * 2);
        ctx.arc(45, -32, 14, 0, Math.PI * 2);
        ctx.fill();
        // Зрачки (точки безумия)
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-35, -28, 5, 0, Math.PI * 2);
        ctx.arc(45, -32, 5, 0, Math.PI * 2);
        ctx.fill();
        // Кровь из глаз
        ctx.fillStyle = '#800020';
        ctx.fillRect(-42, 0, 5, 120);
        ctx.fillRect(38, 0, 5, 120);
        // МАНИАКАЛЬНАЯ УЛЫБКА ДО УШЕЙ
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-110, 50);
        ctx.quadraticCurveTo(0, 150, 110, 50);
        ctx.stroke();
        // Кривые зубы
        ctx.fillStyle = '#d8ccc4';
        for (let i = -5; i <= 5; i++) {
            const tx = i * 18;
            const ty = 70 + Math.abs(i) * 6;
            ctx.beginPath();
            ctx.moveTo(tx - 6, 55);
            ctx.lineTo(tx, ty + 30);
            ctx.lineTo(tx + 6, 55);
            ctx.closePath();
            ctx.fill();
        }
        // Высунутый окровавленный язык
        ctx.fillStyle = '#a00020';
        ctx.beginPath();
        ctx.ellipse(0, 110, 20, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** 3. ЭЛЬЗА — красивое, но убийственное лицо, кинжал приближается */
    function drawScareElsa(cx, cy, p) {
        ctx.save();
        // Лицо
        ctx.fillStyle = '#f8e0d0';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 20, 130, 180, 0, 0, Math.PI * 2);
        ctx.fill();
        // Очень длинные чёрные волосы
        ctx.fillStyle = '#0a0005';
        ctx.beginPath();
        ctx.moveTo(cx - 130, cy - 100);
        ctx.quadraticCurveTo(cx - 170, cy + 100, cx - 130, cy + 250);
        ctx.lineTo(cx + 130, cy + 250);
        ctx.quadraticCurveTo(cx + 170, cy + 100, cx + 130, cy - 100);
        ctx.quadraticCurveTo(cx, cy - 220, cx - 130, cy - 100);
        ctx.fill();
        // Чёлка закрывает лоб
        ctx.beginPath();
        ctx.moveTo(cx - 120, cy - 50);
        ctx.quadraticCurveTo(cx, cy - 20, cx + 120, cy - 50);
        ctx.lineTo(cx + 120, cy - 120);
        ctx.lineTo(cx - 120, cy - 120);
        ctx.closePath();
        ctx.fill();
        // Один фиолетовый глаз, светящийся
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx + 30, cy - 40, 15, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a040a0';
        ctx.shadowColor = '#ff40c0';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(cx + 30, cy - 40, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx + 30, cy - 40, 5, 0, Math.PI * 2);
        ctx.fill();
        // Губы в крови (улыбка)
        ctx.fillStyle = '#a00020';
        ctx.beginPath();
        ctx.moveTo(cx - 35, cy + 30);
        ctx.quadraticCurveTo(cx, cy + 65, cx + 35, cy + 30);
        ctx.quadraticCurveTo(cx + 20, cy + 45, cx, cy + 50);
        ctx.quadraticCurveTo(cx - 20, cy + 45, cx - 35, cy + 30);
        ctx.closePath();
        ctx.fill();
        // Зубы (видны между губ)
        ctx.fillStyle = '#f0e0d8';
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * 10 - 3, cy + 40);
            ctx.lineTo(cx + i * 10, cy + 50);
            ctx.lineTo(cx + i * 10 + 3, cy + 40);
            ctx.closePath();
            ctx.fill();
        }
        // Кровь стекает с подбородка
        ctx.fillStyle = '#800020';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(cx - 10 + i * 6, cy + 55, 2, 60 + (i % 2) * 30);
        }
        // КИНЖАЛ приближается справа (motion blur)
        const daggerX = cx + 280 - p * 240;
        ctx.save();
        ctx.translate(daggerX, cy - 30);
        ctx.rotate(-0.3);
        const bladeGrad = ctx.createLinearGradient(-100, 0, 30, 0);
        bladeGrad.addColorStop(0, '#d8d0e0');
        bladeGrad.addColorStop(0.5, '#ffffff');
        bladeGrad.addColorStop(1, '#808090');
        ctx.fillStyle = bladeGrad;
        ctx.beginPath();
        ctx.moveTo(-120, 0);
        ctx.lineTo(-10, -8);
        ctx.lineTo(30, -8);
        ctx.lineTo(30, 8);
        ctx.lineTo(-10, 8);
        ctx.closePath();
        ctx.fill();
        // Кровь на лезвии
        ctx.fillStyle = '#a00020';
        ctx.fillRect(-30, -5, 50, 10);
        ctx.restore();
        ctx.restore();
    }

    /** 4. ДЕМОНИЧЕСКАЯ РЭМ — рог, горящие синие глаза, окровавленные клыки */
    function drawScareRemDemon(cx, cy, p) {
        ctx.save();
        // Лицо
        ctx.fillStyle = '#f8d8e0';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 140, 180, 0, 0, Math.PI * 2);
        ctx.fill();
        // Голубые волосы, растрёпанные
        ctx.fillStyle = '#4080c8';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 80, 155, 100, 0, 0, Math.PI, true);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - 155, cy - 70);
        ctx.quadraticCurveTo(cx - 180, cy + 100, cx - 140, cy + 220);
        ctx.lineTo(cx + 140, cy + 220);
        ctx.quadraticCurveTo(cx + 180, cy + 100, cx + 155, cy - 70);
        ctx.fill();
        // Чёлка
        ctx.beginPath();
        ctx.moveTo(cx - 130, cy - 50);
        ctx.quadraticCurveTo(cx - 60, cy - 20, cx, cy - 30);
        ctx.quadraticCurveTo(cx + 60, cy - 20, cx + 130, cy - 50);
        ctx.lineTo(cx + 130, cy - 150);
        ctx.lineTo(cx - 130, cy - 150);
        ctx.closePath();
        ctx.fill();
        // ОГРОМНЫЙ БЕЛЫЙ РОГ из лба
        ctx.fillStyle = '#fff0f4';
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy - 100);
        ctx.lineTo(cx, cy - 180);
        ctx.lineTo(cx + 15, cy - 100);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#c0a8b0';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Линии на роге
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(cx - 10 + i * 3, cy - 130);
            ctx.lineTo(cx + 10 - i * 3, cy - 130);
            ctx.stroke();
        }
        // ГОРЯЩИЕ СИНИЕ ГЛАЗА
        ctx.shadowColor = '#40a0ff';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#40a0ff';
        ctx.beginPath();
        ctx.ellipse(cx - 40, cy - 20, 18, 24, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 40, cy - 20, 18, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Вертикальные зрачки демона
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(cx - 40, cy - 20, 3, 20, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 40, cy - 20, 3, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        // Синие «огни» снизу глаз (слёзы)
        ctx.fillStyle = '#80c0ff';
        ctx.shadowColor = '#40a0ff';
        ctx.shadowBlur = 10;
        for (let i = -1; i <= 1; i += 2) {
            const ex = cx + i * 40;
            ctx.beginPath();
            ctx.moveTo(ex - 3, cy + 5);
            ctx.lineTo(ex, cy + 60);
            ctx.lineTo(ex + 3, cy + 5);
            ctx.closePath();
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        // РОТ — оскал с клыками
        ctx.fillStyle = '#1a0005';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 60, 45, 25, 0, 0, Math.PI * 2);
        ctx.fill();
        // Острые клыки
        ctx.fillStyle = '#f0e0d8';
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy + 40);
        ctx.lineTo(cx - 12, cy + 75);
        ctx.lineTo(cx - 6, cy + 40);
        ctx.moveTo(cx + 6, cy + 40);
        ctx.lineTo(cx + 12, cy + 75);
        ctx.lineTo(cx + 18, cy + 40);
        ctx.fill();
        // Кровь на губах
        ctx.fillStyle = '#800020';
        ctx.fillRect(cx - 30, cy + 75, 60, 8);
        ctx.fillRect(cx - 10 - 1, cy + 82, 2, 40);
        ctx.fillRect(cx + 10 - 1, cy + 82, 2, 40);
        ctx.restore();
    }

    /** 5. ОКРОВАВЛЕННЫЙ СУБАРУ — собственное лицо в ужасе, кровь из глаз */
    function drawScareSubaruBleeding(cx, cy, p) {
        ctx.save();
        // Лицо
        ctx.fillStyle = '#d8a878';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 140, 180, 0, 0, Math.PI * 2);
        ctx.fill();
        // Чёрные растрёпанные волосы (Субару)
        ctx.fillStyle = '#0a0510';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 100, 155, 80, 0, 0, Math.PI, true);
        ctx.fill();
        // Торчащие пряди
        for (let i = -4; i <= 4; i++) {
            const tx = cx + i * 25;
            ctx.beginPath();
            ctx.moveTo(tx - 5, cy - 120);
            ctx.lineTo(tx + (i % 2 ? 0 : 5), cy - 180 - Math.abs(i) * 8);
            ctx.lineTo(tx + 5, cy - 120);
            ctx.closePath();
            ctx.fill();
        }
        // Чёлка
        ctx.beginPath();
        ctx.moveTo(cx - 130, cy - 70);
        ctx.quadraticCurveTo(cx - 60, cy - 40, cx, cy - 50);
        ctx.quadraticCurveTo(cx + 60, cy - 40, cx + 130, cy - 70);
        ctx.lineTo(cx + 130, cy - 130);
        ctx.lineTo(cx - 130, cy - 130);
        ctx.closePath();
        ctx.fill();
        // ШИРОКО РАСКРЫТЫЕ ГЛАЗА В УЖАСЕ
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx - 40, cy - 30, 20, 28, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 40, cy - 30, 20, 28, 0, 0, Math.PI * 2);
        ctx.fill();
        // Кровавые сосуды на белках
        ctx.strokeStyle = '#a00020';
        ctx.lineWidth = 1;
        for (let e = 0; e < 2; e++) {
            const ex = e === 0 ? cx - 40 : cx + 40;
            for (let v = 0; v < 12; v++) {
                const ang = (v / 12) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(ex, cy - 30);
                ctx.lineTo(ex + Math.cos(ang) * 18, cy - 30 + Math.sin(ang) * 25);
                ctx.stroke();
            }
        }
        // Маленькие зрачки (от страха)
        ctx.fillStyle = '#1a0510';
        ctx.beginPath();
        ctx.arc(cx - 40, cy - 30, 4, 0, Math.PI * 2);
        ctx.arc(cx + 40, cy - 30, 4, 0, Math.PI * 2);
        ctx.fill();
        // КРОВЬ ТЕЧЁТ ИЗ ГЛАЗ
        ctx.fillStyle = '#a00020';
        for (let i = 0; i < 2; i++) {
            const ex = cx + (i === 0 ? -40 : 40);
            ctx.fillRect(ex - 4, cy - 5, 8, 150);
            ctx.fillRect(ex - 8, cy + 140, 16, 20);
        }
        // РОТ РАСКРЫТ В КРИКЕ (огромная «О»)
        ctx.fillStyle = '#1a0005';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 60, 30, 50, 0, 0, Math.PI * 2);
        ctx.fill();
        // Язык внутри
        ctx.fillStyle = '#800020';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 80, 15, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        // Зубы сверху и снизу
        ctx.fillStyle = '#f0e8d8';
        for (let i = -2; i <= 2; i++) {
            const tx = cx + i * 8;
            ctx.fillRect(tx - 2, cy + 20, 4, 12);
            ctx.fillRect(tx - 2, cy + 95, 4, 12);
        }
        // Кровь из рта
        ctx.fillStyle = '#800020';
        ctx.fillRect(cx - 20, cy + 115, 40, 8);
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(cx - 15 + i * 15, cy + 122, 3, 50 + (i % 2) * 20);
        }
        ctx.restore();
    }

    /** 6. ОГРОМНЫЙ ГЛАЗ БЕЛОГО КИТА — занимает весь экран */
    function drawScareWhaleEye(cx, cy, p) {
        ctx.save();
        // Туманный серо-синий фон
        const fogGrad = ctx.createRadialGradient(cx, cy, 50, cx, cy, CANVAS_W);
        fogGrad.addColorStop(0, 'rgba(100, 120, 140, 0.8)');
        fogGrad.addColorStop(1, 'rgba(10, 15, 25, 1)');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        // Клубы тумана
        ctx.fillStyle = 'rgba(180, 200, 220, 0.3)';
        for (let i = 0; i < 20; i++) {
            const fx = Math.random() * CANVAS_W;
            const fy = Math.random() * CANVAS_H;
            ctx.beginPath();
            ctx.arc(fx, fy, 30 + Math.random() * 50, 0, Math.PI * 2);
            ctx.fill();
        }
        // ГИГАНТСКИЙ ГЛАЗ
        // Белок
        const eyeScale = 1 + p * 0.3;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(eyeScale, eyeScale);
        ctx.fillStyle = '#fff8f0';
        ctx.beginPath();
        ctx.ellipse(0, 0, 220, 160, 0, 0, Math.PI * 2);
        ctx.fill();
        // Веко сверху (прикрытое)
        ctx.fillStyle = '#6a7080';
        ctx.beginPath();
        ctx.moveTo(-220, 0);
        ctx.quadraticCurveTo(0, -180, 220, 0);
        ctx.quadraticCurveTo(0, -50, -220, 0);
        ctx.closePath();
        ctx.fill();
        // Кровавые сосуды на белке
        ctx.strokeStyle = '#c00030';
        ctx.lineWidth = 2;
        for (let v = 0; v < 20; v++) {
            const ang = (v / 20) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * 150, Math.sin(ang) * 100);
            ctx.lineTo(Math.cos(ang) * 215, Math.sin(ang) * 140);
            ctx.stroke();
        }
        // Радужка — серая с голубым отливом
        const irisGrad = ctx.createRadialGradient(-20, -20, 10, 0, 0, 100);
        irisGrad.addColorStop(0, '#d0d8e0');
        irisGrad.addColorStop(0.5, '#5070a0');
        irisGrad.addColorStop(1, '#1a2030');
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 100, 0, Math.PI * 2);
        ctx.fill();
        // Текстура радужки (линии)
        ctx.strokeStyle = 'rgba(20, 30, 50, 0.6)';
        ctx.lineWidth = 1;
        for (let v = 0; v < 40; v++) {
            const ang = (v / 40) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * 25, Math.sin(ang) * 25);
            ctx.lineTo(Math.cos(ang) * 95, Math.sin(ang) * 95);
            ctx.stroke();
        }
        // Зрачок
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.fill();
        // Блик
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.ellipse(-30, -30, 15, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(20, 20, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Тёмный силуэт кита в тумане вокруг
        ctx.fillStyle = 'rgba(60, 70, 90, 0.6)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 380, 250, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** 7. КОГТИСТАЯ РУКА БЬЁТ В ЭКРАН — как будто стекло разбилось */
    function drawScareClawHand(cx, cy, p) {
        ctx.save();
        // Трещины на «стекле»
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        const centerX = cx + (Math.random() - 0.5) * 40;
        const centerY = cy + (Math.random() - 0.5) * 40;
        for (let i = 0; i < 12; i++) {
            const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            const len = 200 + Math.random() * 200;
            for (let s = 0; s < 5; s++) {
                const segX = centerX + Math.cos(ang) * len * (s / 4) + (Math.random() - 0.5) * 30;
                const segY = centerY + Math.sin(ang) * len * (s / 4) + (Math.random() - 0.5) * 30;
                ctx.lineTo(segX, segY);
            }
            ctx.stroke();
        }
        // Микро-трещины
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 60; i++) {
            const x1 = Math.random() * CANVAS_W;
            const y1 = Math.random() * CANVAS_H;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 + (Math.random() - 0.5) * 40, y1 + (Math.random() - 0.5) * 40);
            ctx.stroke();
        }
        // ЧЁРНАЯ ЛАПА прорывается из глубины
        const handScale = 1 + p * 0.6;
        ctx.save();
        ctx.translate(cx, cy + 50);
        ctx.scale(handScale, handScale);
        // Ладонь
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, 50, 80, 70, 0, 0, Math.PI * 2);
        ctx.fill();
        // 5 ДЛИННЫХ КОГТИСТЫХ ПАЛЬЦЕВ растопырены в стороны
        for (let i = -2; i <= 2; i++) {
            const ang = -Math.PI / 2 + i * 0.4;
            const fx = Math.cos(ang) * 60;
            const fy = Math.sin(ang) * 60 + 30;
            ctx.save();
            ctx.translate(fx, fy);
            ctx.rotate(ang);
            // Сам палец
            ctx.fillStyle = '#0a0005';
            ctx.beginPath();
            ctx.ellipse(0, 0, 10, 75, 0, 0, Math.PI * 2);
            ctx.fill();
            // Коготь на конце
            ctx.fillStyle = '#2a0010';
            ctx.beginPath();
            ctx.moveTo(-8, -70);
            ctx.lineTo(0, -95);
            ctx.lineTo(8, -70);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        // Запястье тёмное
        ctx.fillStyle = '#000';
        ctx.fillRect(-40, 100, 80, 100);
        // Красное свечение из-под руки
        ctx.shadowColor = '#ff0030';
        ctx.shadowBlur = 40;
        ctx.strokeStyle = '#ff0030';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 50, 85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
        ctx.restore();
    }

    /** 8. КУЛЬТИСТ В КАПЮШОНЕ — лицо в тени, много горящих красных глаз */
    function drawScareShadowCultist(cx, cy, p) {
        ctx.save();
        // Тёмный фон
        ctx.fillStyle = '#050005';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        // Силуэт фигуры в капюшоне
        ctx.fillStyle = '#000';
        // Капюшон и мантия
        ctx.beginPath();
        ctx.moveTo(cx - 180, CANVAS_H);
        ctx.lineTo(cx - 120, cy - 30);
        ctx.quadraticCurveTo(cx - 90, cy - 160, cx, cy - 180);
        ctx.quadraticCurveTo(cx + 90, cy - 160, cx + 120, cy - 30);
        ctx.lineTo(cx + 180, CANVAS_H);
        ctx.closePath();
        ctx.fill();
        // Лицо в тени — тёмно-серый овал, почти не виден
        ctx.fillStyle = '#180818';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 50, 75, 100, 0, 0, Math.PI * 2);
        ctx.fill();
        // МНОГО ГОРЯЩИХ КРАСНЫХ ГЛАЗ — главная фишка
        ctx.shadowColor = '#ff0040';
        ctx.shadowBlur = 25;
        ctx.fillStyle = '#ff2050';
        const eyePositions = [
            { x: -30, y: -70, r: 6 },
            { x: 30,  y: -70, r: 6 },
            { x: 0,   y: -50, r: 4 },
            { x: -20, y: -30, r: 5 },
            { x: 20,  y: -30, r: 5 },
            { x: -40, y: -10, r: 3 },
            { x: 40,  y: -10, r: 3 },
            { x: 0,   y: 0,   r: 3 },
            { x: -15, y: 20,  r: 3 },
            { x: 15,  y: 20,  r: 3 },
        ];
        for (const ep of eyePositions) {
            const pulse = 0.7 + Math.sin(performance.now() / 150 + ep.x) * 0.3;
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(cx + ep.x, cy + ep.y, ep.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        // Чёрные руки выходят из мантии с длинными пальцами
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(cx - 110, cy + 20);
        ctx.quadraticCurveTo(cx - 180, cy + 100, cx - 200, cy + 200);
        ctx.lineTo(cx - 170, cy + 210);
        ctx.quadraticCurveTo(cx - 150, cy + 130, cx - 100, cy + 50);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + 110, cy + 20);
        ctx.quadraticCurveTo(cx + 180, cy + 100, cx + 200, cy + 200);
        ctx.lineTo(cx + 170, cy + 210);
        ctx.quadraticCurveTo(cx + 150, cy + 130, cx + 100, cy + 50);
        ctx.fill();
        // Пальцы-щупальца
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        for (let i = -3; i <= 3; i++) {
            ctx.beginPath();
            ctx.moveTo(cx - 190 + i * 5, cy + 200);
            ctx.lineTo(cx - 200 + i * 8, cy + 260 + i * 5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + 190 + i * 5, cy + 200);
            ctx.lineTo(cx + 200 + i * 8, cy + 260 + i * 5);
            ctx.stroke();
        }
        // Фиолетовый ореол вокруг культиста
        const auraGrad = ctx.createRadialGradient(cx, cy, 50, cx, cy, 400);
        auraGrad.addColorStop(0, 'rgba(120, 0, 80, 0.3)');
        auraGrad.addColorStop(1, 'rgba(120, 0, 80, 0)');
        ctx.fillStyle = auraGrad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
    }

    function drawFlicker() {
        const now = performance.now();
        if (now >= flickerUntil) return;
        if (Math.random() < 0.5) {
            ctx.fillStyle = `rgba(0, 0, 0, ${0.35 + Math.random() * 0.35})`;
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        }
    }

    /** Лужи крови на полу (статичные декали). */
    function drawBloodPuddles() {
        for (const p of bloodPuddles) {
            const sx = p.x;
            const sy = p.y - camY;
            if (sy < -40 || sy > CANVAS_H + 40) continue;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(p.angle);
            // Основная лужа
            const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, p.size);
            grad.addColorStop(0, 'rgba(180, 10, 30, 0.85)');
            grad.addColorStop(0.5, 'rgba(120, 5, 20, 0.7)');
            grad.addColorStop(1, 'rgba(60, 0, 10, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            // Мазки вокруг
            ctx.fillStyle = 'rgba(140, 10, 25, 0.55)';
            for (let i = 0; i < 5; i++) {
                const ang = (i / 5) * Math.PI * 2;
                const d = p.size * (0.8 + Math.sin(i * 7) * 0.15);
                const rr = 2 + (i % 3);
                ctx.beginPath();
                ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d * 0.7, rr, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    /** Кости на полу — поверх пола, под Субару. */
    function drawBones() {
        for (const b of bones) b.draw();
    }

    /** Падающая пыль с потолка. */
    function drawDust() {
        for (const p of dustParticles) {
            const sx = p.x;
            const sy = p.y - camY;
            if (sy < -10 || sy > CANVAS_H + 10) continue;
            const alpha = Math.min(1, p.life / 0.8);
            ctx.fillStyle = `rgba(160, 150, 140, ${alpha * 0.6})`;
            ctx.beginPath();
            ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
            ctx.fill();
            // Лёгкий след
            ctx.fillStyle = `rgba(160, 150, 140, ${alpha * 0.2})`;
            ctx.fillRect(sx - 0.5, sy - p.size * 2, 1, p.size * 2);
        }
    }

    /** Чит-режим WASDDSAW — рисует все ловушки на полу с иконками и пульсирующей рамкой. */
    function drawTrapsReveal() {
        const now = performance.now();
        if (now >= revealTrapsUntil) return;

        const remain = (revealTrapsUntil - now) / 12000; // 0..1
        const pulse = 0.6 + Math.sin(now / 200) * 0.3;

        const firstRow = Math.max(0, Math.floor(camY / TILE) - 1);
        const lastRow = Math.min(GRID_H - 1, Math.ceil((camY + CANVAS_H) / TILE) + 1);

        ctx.save();
        for (let r = firstRow; r <= lastRow; r++) {
            for (let c = 0; c < GRID_W; c++) {
                const t = tiles[r][c];
                if (!TRAP_TYPES.has(t)) continue;

                const sx = c * TILE;
                const sy = r * TILE - camY;

                // Цвет рамки по типу ловушки
                let color, icon;
                switch (t) {
                    case T.PIT:     color = '#ffaa00'; icon = '⚠'; break;
                    case T.DAGGERS: color = '#c0c0d8'; icon = '🗡'; break;
                    case T.BLOCK:   color = '#8a6850'; icon = '◼'; break;
                    case T.GAS:     color = '#80ff60'; icon = '☠'; break;
                    case T.HAND:    color = '#a040f0'; icon = '✋'; break;
                    case T.FIRE:    color = '#ff6020'; icon = '🔥'; break;
                    case T.SPIN:    color = '#e0e8ff'; icon = '⚙'; break;
                    default:        color = '#ff0040'; icon = '✕';
                }

                // Полупрозрачная заливка плиты
                ctx.fillStyle = `rgba(255, 0, 50, ${0.15 * pulse * remain})`;
                ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);

                // Пульсирующая рамка
                ctx.strokeStyle = color;
                ctx.lineWidth = 2 + Math.sin(now / 150) * 0.7;
                ctx.shadowColor = color;
                ctx.shadowBlur = 10 + pulse * 6;
                ctx.strokeRect(sx + 5, sy + 5, TILE - 10, TILE - 10);
                ctx.shadowBlur = 0;

                // Иконка типа ловушки в центре
                ctx.fillStyle = color;
                ctx.font = 'bold 20px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#000';
                ctx.shadowBlur = 4;
                ctx.fillText(icon, sx + TILE / 2, sy + TILE / 2);
                ctx.shadowBlur = 0;
            }
        }

        // Индикатор времени читa в углу
        const remainSec = Math.ceil((revealTrapsUntil - now) / 1000);
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 6;
        ctx.fillText(`👁 ${remainSec}s`, CANVAS_W - 10, 22);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    /** Рисует анимацию раскрытия/закрытия стены тайной комнаты. */
    function drawWallOpening() {
        if (!openingWall) return;
        const now = performance.now();
        const elapsed = now - openingWall.startTime;
        const OPEN_MS  = 2500;
        const CLOSE_MS = 1500;
        let t; // 0..1 — насколько стена открыта
        if (openingWall.phase === 'opening') {
            t = Math.min(1, elapsed / OPEN_MS);
        } else {
            t = Math.max(0, 1 - elapsed / CLOSE_MS);
        }

        const sx = openingWall.col * TILE;
        const sy = openingWall.row * TILE - camY;
        if (sy < -TILE * 2 || sy > CANVAS_H + TILE * 2) return;

        ctx.save();

        // Перекрываем исходную стену чёрным провалом
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - 2, sy - 2, TILE + 4, TILE + 4);

        // Тёмная «бездна» внутри — градиент с красноватым оттенком
        const voidGrad = ctx.createRadialGradient(
            sx + TILE / 2, sy + TILE / 2, 3,
            sx + TILE / 2, sy + TILE / 2, TILE * 0.75
        );
        voidGrad.addColorStop(0, `rgba(70, 0, 25, ${0.35 + t * 0.4})`);
        voidGrad.addColorStop(0.6, `rgba(15, 0, 8, ${0.6 + t * 0.3})`);
        voidGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = voidGrad;
        ctx.fillRect(sx, sy, TILE, TILE);

        // Пульсирующий красный свет изнутри (нарастает с открытием)
        if (t > 0.25) {
            const glowAlpha = Math.min(1, (t - 0.25) / 0.5);
            const pulseR = 22 + Math.sin(now / 140) * 7;
            const glowGrad = ctx.createRadialGradient(
                sx + TILE / 2, sy + TILE / 2, 2,
                sx + TILE / 2, sy + TILE / 2, pulseR
            );
            glowGrad.addColorStop(0, `rgba(255, 40, 80, ${glowAlpha * 0.8})`);
            glowGrad.addColorStop(0.6, `rgba(200, 10, 50, ${glowAlpha * 0.4})`);
            glowGrad.addColorStop(1, 'rgba(200, 10, 50, 0)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(sx - 30, sy - 30, TILE + 60, TILE + 60);
        }

        // Половины стены — расходятся влево и вправо
        const maxPart = TILE / 2 + 4;
        const parting = t * maxPart;

        // === ЛЕВАЯ ПОЛОВИНА ===
        ctx.save();
        ctx.translate(-parting, 0);
        // Базовый тёмно-фиолетовый камень
        const leftGrad = ctx.createLinearGradient(sx, sy, sx + TILE / 2, sy);
        leftGrad.addColorStop(0, '#1a1020');
        leftGrad.addColorStop(1, '#0a0612');
        ctx.fillStyle = leftGrad;
        ctx.fillRect(sx, sy, TILE / 2, TILE);
        // Текстура кирпичей
        ctx.strokeStyle = 'rgba(80, 50, 90, 0.28)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const by = sy + i * 20;
            ctx.beginPath();
            ctx.moveTo(sx, by);
            ctx.lineTo(sx + TILE / 2, by);
            ctx.stroke();
        }
        // Вертикальные швы
        ctx.beginPath();
        ctx.moveTo(sx + TILE / 4, sy);
        ctx.lineTo(sx + TILE / 4, sy + TILE);
        ctx.stroke();
        // Рваный правый край (зубчатый излом)
        ctx.fillStyle = '#0a0612';
        ctx.beginPath();
        ctx.moveTo(sx + TILE / 2, sy);
        let ey = sy;
        const jagSeed = openingWall.col * 7 + openingWall.row;
        while (ey < sy + TILE) {
            ey += 3 + (Math.abs(Math.sin(ey + jagSeed)) * 6);
            const offset = Math.sin(ey * 0.3 + jagSeed) * 4;
            ctx.lineTo(sx + TILE / 2 + offset, ey);
        }
        ctx.lineTo(sx + TILE / 2, sy + TILE);
        ctx.lineTo(sx + TILE / 2 + 1, sy + TILE);
        ctx.closePath();
        ctx.fill();
        // Острая чёрная линия по излому
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // === ПРАВАЯ ПОЛОВИНА ===
        ctx.save();
        ctx.translate(parting, 0);
        const rightGrad = ctx.createLinearGradient(sx + TILE / 2, sy, sx + TILE, sy);
        rightGrad.addColorStop(0, '#0a0612');
        rightGrad.addColorStop(1, '#1a1020');
        ctx.fillStyle = rightGrad;
        ctx.fillRect(sx + TILE / 2, sy, TILE / 2, TILE);
        ctx.strokeStyle = 'rgba(80, 50, 90, 0.28)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const by = sy + i * 20;
            ctx.beginPath();
            ctx.moveTo(sx + TILE / 2, by);
            ctx.lineTo(sx + TILE, by);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(sx + TILE * 3 / 4, sy);
        ctx.lineTo(sx + TILE * 3 / 4, sy + TILE);
        ctx.stroke();
        // Рваный левый край
        ctx.fillStyle = '#0a0612';
        ctx.beginPath();
        ctx.moveTo(sx + TILE / 2, sy);
        let ey2 = sy;
        while (ey2 < sy + TILE) {
            ey2 += 3 + (Math.abs(Math.cos(ey2 + jagSeed)) * 6);
            const offset = Math.cos(ey2 * 0.3 + jagSeed) * 4;
            ctx.lineTo(sx + TILE / 2 - offset, ey2);
        }
        ctx.lineTo(sx + TILE / 2, sy + TILE);
        ctx.lineTo(sx + TILE / 2 - 1, sy + TILE);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Падающая пыль по краям (активнее в середине открытия/закрытия)
        const dustIntensity = Math.sin(t * Math.PI); // пик в середине
        if (dustIntensity > 0.1) {
            ctx.fillStyle = `rgba(190, 160, 140, ${0.6 * dustIntensity})`;
            for (let i = 0; i < 10; i++) {
                const seed = (i * 137 + openingWall.row) % 100;
                const px = sx + (seed % TILE);
                const py = sy + ((elapsed / 3 + i * 40) % (TILE + 20)) - 10;
                ctx.beginPath();
                ctx.arc(px, py, 1 + (seed % 2), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Первоначальная трещина (яркая полоса по центру в начале открытия)
        if (t > 0.05 && t < 0.4) {
            const crackAlpha = Math.min(1, (t - 0.05) / 0.2) * (1 - (t - 0.05) / 0.35);
            ctx.fillStyle = `rgba(255, 100, 120, ${crackAlpha})`;
            ctx.shadowColor = '#ff4060';
            ctx.shadowBlur = 15;
            ctx.fillRect(sx + TILE / 2 - 1, sy, 2, TILE);
            ctx.shadowBlur = 0;
        }

        // Искры разлёта в момент раскрытия
        if (t > 0.1 && t < 0.7) {
            ctx.fillStyle = '#ffa060';
            for (let i = 0; i < 6; i++) {
                const ang = (i / 6) * Math.PI * 2 + t * 3;
                const dist = t * 25;
                const px = sx + TILE / 2 + Math.cos(ang) * dist;
                const py = sy + TILE / 2 + Math.sin(ang) * dist;
                ctx.beginPath();
                ctx.arc(px, py, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    /** Подсказка рядом с тайной комнатой (шёпот на стене). */
    function drawSecretHint() {
        // Если Субару рядом с секретным тайлом — показываем шёпот
        const nearby = [];
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                if (tiles[r][c] !== T.SECRET) continue;
                const wx = c * TILE + TILE / 2;
                const wy = r * TILE + TILE / 2;
                const d = Math.hypot(subaru.x - wx, subaru.y - wy);
                if (d < 90) nearby.push({ x: wx, y: wy, d });
            }
        }
        if (nearby.length === 0) return;
        const n = nearby[0];
        const alpha = Math.max(0, (90 - n.d) / 90);
        ctx.save();
        ctx.globalAlpha = alpha * (0.55 + Math.sin(performance.now() / 400) * 0.25);
        ctx.fillStyle = '#b84060';
        ctx.font = 'italic 12px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(180, 20, 60, 0.6)';
        ctx.shadowBlur = 8;
        ctx.fillText('...ты что-то чувствуешь за стеной...', n.x, n.y - camY - 18);
        ctx.restore();
    }

    /** Основной эффект темноты — мир виден только в радиусе Субару и вокруг свечей. */
    function drawDarkness() {
        // Очищаем offscreen canvas
        lightCtx.globalCompositeOperation = 'source-over';
        lightCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        // Заливаем полной темнотой
        lightCtx.fillStyle = 'rgba(2, 0, 6, 0.93)';
        lightCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        // Вырезаем «дыры» там, где есть свет
        lightCtx.globalCompositeOperation = 'destination-out';

        // Фонарик Субару (главный свет)
        const sx = subaru.x;
        const sy = subaru.y - camY;
        const radius = 175 + Math.sin(performance.now() / 600) * 6;
        let grad = lightCtx.createRadialGradient(sx, sy, 24, sx, sy, radius);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.75)');
        grad.addColorStop(0.85, 'rgba(0, 0, 0, 0.3)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lightCtx.fillStyle = grad;
        lightCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Свечи (локальный свет)
        const now = performance.now();
        for (let r = 0; r < GRID_H; r++) {
            const rowY = r * TILE - camY;
            if (rowY < -80 || rowY > CANVAS_H + 80) continue;
            if (wallDecor[r].left === 'candle' && !isTorchOut(r, 'left', now)) {
                cutLightHole(TILE + TILE / 2, rowY + 20, 75);
            }
            if (wallDecor[r].right === 'candle' && !isTorchOut(r, 'right', now)) {
                cutLightHole(10 * TILE + TILE / 2, rowY + 20, 75);
            }
        }

        // Минко — аура-свет (чтобы её видно издалека, как маяк надежды)
        const minkoSy = minko.y - camY;
        if (minkoSy > -40 && minkoSy < CANVAS_H + 40) {
            cutLightHole(minko.x, minkoSy, 65);
        }

        // Ключ (если не подобран) — пульсирующее золотое свечение
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                if (tiles[r][c] !== T.KEY) continue;
                const kx = c * TILE + TILE / 2;
                const ky = r * TILE - camY + TILE / 2;
                if (ky < -40 || ky > CANVAS_H + 40) continue;
                cutLightHole(kx, ky, 42);
            }
        }

        // Печати — фиолетовый свет
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                const t = tiles[r][c];
                if (t !== T.SEQ1 && t !== T.SEQ2 && t !== T.SEQ3) continue;
                const px = c * TILE + TILE / 2;
                const py = r * TILE - camY + TILE / 2;
                if (py < -40 || py > CANVAS_H + 40) continue;
                cutLightHole(px, py, 38);
            }
        }

        // Рычаг (если потянут — подсвечиваем чуть сильнее)
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                if (tiles[r][c] !== T.LEVER) continue;
                const lx = c * TILE + TILE / 2;
                const ly = r * TILE - camY + TILE / 2;
                if (ly < -40 || ly > CANVAS_H + 40) continue;
                cutLightHole(lx, ly, leverPulled ? 50 : 35);
            }
        }

        lightCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(lightCanvas, 0, 0);
    }

    function cutLightHole(cx, cy, radius) {
        const grad = lightCtx.createRadialGradient(cx, cy, 3, cx, cy, radius);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
        grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.55)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lightCtx.fillStyle = grad;
        lightCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }

    function drawVignette() {
        const grad = ctx.createRadialGradient(
            CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.28,
            CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.78
        );
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // ═══════════════════════════════════════════════════════
    // ТАЙНЫЕ КОМНАТЫ — сцены из Re:Zero
    // ═══════════════════════════════════════════════════════

    function renderSecretScene(now) {
        if (!currentSecret) return;
        const elapsed = now - currentSecret.startTime;

        // Чёрный фон с кровавым виньетом
        ctx.fillStyle = '#030005';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        const bg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 50, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W);
        bg.addColorStop(0, 'rgba(60, 0, 20, 0.45)');
        bg.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Fade-in первые 600мс
        const fadeAlpha = Math.min(1, elapsed / 600);
        ctx.save();
        ctx.globalAlpha = fadeAlpha;

        switch (currentSecret.type) {
            case 'rem':     drawSceneRem(now); break;
            case 'subaru':  drawSceneSubaruCorpse(now); break;
            case 'satella': drawSceneSatella(now); break;
            case 'puck':    drawScenePuck(now); break;
            case 'ley':     drawSceneLey(now); break;
            case 'elsa':    drawSceneElsa(now); break;
            case 'oni':     drawSceneOni(now); break;
        }
        ctx.restore();

        // Мелкая дрожь экрана (горрор эффект)
        if (elapsed < 800) {
            const intensity = (800 - elapsed) / 800;
            const jx = (Math.random() - 0.5) * 4 * intensity;
            const jy = (Math.random() - 0.5) * 4 * intensity;
            ctx.save();
            ctx.translate(jx, jy);
            ctx.restore();
        }

        // Подсказка выхода (появляется через 1.5 сек)
        if (elapsed > 1500) {
            const hintAlpha = Math.min(1, (elapsed - 1500) / 600) * (0.5 + Math.sin(now / 400) * 0.3);
            ctx.globalAlpha = hintAlpha;
            ctx.fillStyle = '#8a6a78';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('(нажми ПРОБЕЛ, чтобы закрыть глаза)', CANVAS_W / 2, CANVAS_H - 18);
            ctx.globalAlpha = 1;
        }
    }

    // ── СЦЕНА 1: Рэм в подвале + Петельгейзе ───────────────
    function drawSceneRem(now) {
        // Крестообразная сцена
        const cx = CANVAS_W / 2 - 50;
        const cy = CANVAS_H / 2 - 30;

        // Рэм — тело, висящее в воздухе с вывернутыми конечностями
        // Черный фартук / платье
        ctx.fillStyle = '#050012';
        ctx.fillRect(cx - 22, cy - 5, 44, 50);

        // Белый передник (окровавленный)
        ctx.fillStyle = '#c8bcc0';
        ctx.fillRect(cx - 14, cy - 2, 28, 42);
        ctx.fillStyle = 'rgba(120, 5, 20, 0.85)';
        for (let i = 0; i < 7; i++) {
            const bx = cx - 10 + Math.random() * 20;
            const by = cy + Math.random() * 38;
            ctx.beginPath();
            ctx.ellipse(bx, by, 3 + Math.random() * 3, 5 + Math.random() * 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Голова (упавшая набок, глаза мёртвые)
        ctx.fillStyle = '#f8e8ec';
        ctx.beginPath();
        ctx.arc(cx, cy - 28, 18, 0, Math.PI * 2);
        ctx.fill();
        // Синие волосы
        ctx.fillStyle = '#4a7cc0';
        ctx.beginPath();
        ctx.arc(cx, cy - 32, 18, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy - 35);
        ctx.quadraticCurveTo(cx - 5, cy - 22, cx + 12, cy - 30);
        ctx.quadraticCurveTo(cx, cy - 42, cx - 15, cy - 35);
        ctx.fill();
        // Длинные волосы свисают вниз
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy - 18);
        ctx.quadraticCurveTo(cx - 30, cy + 5, cx - 25, cy + 35);
        ctx.lineTo(cx - 18, cy + 35);
        ctx.quadraticCurveTo(cx - 8, cy + 5, cx - 10, cy - 15);
        ctx.closePath();
        ctx.fill();

        // Мёртвые глаза (крестиками Х)
        ctx.strokeStyle = '#1a0008';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - 30); ctx.lineTo(cx - 4, cy - 26);
        ctx.moveTo(cx - 4, cy - 30); ctx.lineTo(cx - 10, cy - 26);
        ctx.moveTo(cx + 4, cy - 30); ctx.lineTo(cx + 10, cy - 26);
        ctx.moveTo(cx + 10, cy - 30); ctx.lineTo(cx + 4, cy - 26);
        ctx.stroke();

        // Рот приоткрыт, кровь капает
        ctx.fillStyle = '#0a0005';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 20, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a00020';
        ctx.fillRect(cx - 1.5, cy - 15, 3, 35);

        // РОГ (Рэм в ogre form)
        ctx.fillStyle = '#fff2f8';
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 45);
        ctx.lineTo(cx, cy - 60);
        ctx.lineTo(cx + 6, cy - 45);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#c8b8c0';
        ctx.lineWidth = 1;
        ctx.stroke();

        // ВЫВЕРНУТЫЕ РУКИ — неестественные углы
        ctx.strokeStyle = '#f8e8ec';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        // Левая рука — вывернута назад и вверх
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + 5);
        ctx.lineTo(cx - 48, cy - 15);  // неестественный сгиб вверх
        ctx.lineTo(cx - 75, cy - 25);  // ещё более неестественно
        ctx.lineTo(cx - 90, cy - 8);
        ctx.stroke();
        // Кисть
        ctx.fillStyle = '#f8e8ec';
        ctx.beginPath();
        ctx.arc(cx - 92, cy - 8, 5, 0, Math.PI * 2);
        ctx.fill();
        // Пальцы вывернуты
        ctx.strokeStyle = '#f8e8ec';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(cx - 92, cy - 8);
            ctx.lineTo(cx - 95 - i * 2, cy - 18 + i * 3);
            ctx.stroke();
        }

        // Правая рука — вывернута вбок и вниз
        ctx.strokeStyle = '#f8e8ec';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(cx + 20, cy + 5);
        ctx.lineTo(cx + 55, cy + 18);
        ctx.lineTo(cx + 45, cy + 55);   // согнуто вниз неестественно
        ctx.lineTo(cx + 70, cy + 75);
        ctx.stroke();
        ctx.fillStyle = '#f8e8ec';
        ctx.beginPath();
        ctx.arc(cx + 72, cy + 77, 5, 0, Math.PI * 2);
        ctx.fill();

        // ВЫВЕРНУТЫЕ НОГИ
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy + 40);
        ctx.lineTo(cx - 22, cy + 75);
        ctx.lineTo(cx - 55, cy + 70);   // согнуто вбок
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 10, cy + 40);
        ctx.lineTo(cx + 30, cy + 70);
        ctx.lineTo(cx + 25, cy + 110);  // висит вниз
        ctx.stroke();

        // Кровь висит в воздухе капельками
        ctx.fillStyle = '#a00020';
        for (let i = 0; i < 12; i++) {
            const bx = cx + (Math.random() - 0.5) * 180;
            const by = cy + 30 + Math.random() * 100;
            ctx.beginPath();
            ctx.ellipse(bx, by, 1.2, 2.8, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Лужа крови под Рэм
        ctx.fillStyle = '#400008';
        ctx.beginPath();
        ctx.ellipse(cx - 10, CANVAS_H - 100, 110, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#600010';
        ctx.beginPath();
        ctx.ellipse(cx - 10, CANVAS_H - 100, 80, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // ПЕТЕЛЬГЕЙЗЕ в углу справа
        const px = CANVAS_W - 95;
        const py = CANVAS_H - 200;
        // Тёмная мантия культа
        ctx.fillStyle = '#0a0008';
        ctx.beginPath();
        ctx.moveTo(px - 35, py - 40);
        ctx.lineTo(px + 35, py - 40);
        ctx.lineTo(px + 50, py + 90);
        ctx.lineTo(px - 50, py + 90);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#2a0018';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Бледное лицо
        ctx.fillStyle = '#c8b8b0';
        ctx.beginPath();
        ctx.ellipse(px, py - 60, 20, 28, 0, 0, Math.PI * 2);
        ctx.fill();

        // Дикие седые волосы
        ctx.fillStyle = '#a8a094';
        for (let i = 0; i < 18; i++) {
            const ang = Math.PI + (i / 18) * Math.PI;
            const r = 25 + Math.sin(i * 3 + now / 500) * 12;
            ctx.beginPath();
            ctx.moveTo(px, py - 65);
            ctx.lineTo(px + Math.cos(ang) * r, py - 75 + Math.sin(ang) * r * 0.6);
            ctx.lineWidth = 2 + Math.random() * 1.5;
            ctx.strokeStyle = '#a8a094';
            ctx.stroke();
        }

        // Выпученные безумные глаза
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px - 8, py - 62, 4.5, 0, Math.PI * 2);
        ctx.arc(px + 8, py - 62, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#800010';
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(px - 8, py - 62);
            ctx.lineTo(px - 8 + Math.cos(ang) * 4, py - 62 + Math.sin(ang) * 4);
            ctx.lineWidth = 0.4;
            ctx.strokeStyle = '#c00020';
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px + 8, py - 62);
            ctx.lineTo(px + 8 + Math.cos(ang) * 4, py - 62 + Math.sin(ang) * 4);
            ctx.stroke();
        }
        ctx.fillStyle = '#0a0005';
        ctx.beginPath();
        ctx.arc(px - 7, py - 62, 1.5, 0, Math.PI * 2);
        ctx.arc(px + 9, py - 62, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Маниакальная улыбка через всё лицо
        ctx.strokeStyle = '#0a0005';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(px - 15, py - 48);
        ctx.quadraticCurveTo(px, py - 28, px + 15, py - 48);
        ctx.stroke();
        // Зубы
        ctx.fillStyle = '#d8ccc4';
        for (let i = -3; i <= 3; i++) {
            ctx.beginPath();
            ctx.moveTo(px + i * 3 - 1, py - 43);
            ctx.lineTo(px + i * 3, py - 36);
            ctx.lineTo(px + i * 3 + 1, py - 43);
            ctx.closePath();
            ctx.fill();
        }

        // Кровь из уголков рта
        ctx.fillStyle = '#800010';
        ctx.fillRect(px - 14, py - 42, 1, 20);
        ctx.fillRect(px + 14, py - 42, 1, 20);

        // «Невидимые Руки» — чёрные тентакли, тянущиеся от Петельгейзе к Рэм
        ctx.strokeStyle = 'rgba(20, 0, 15, 0.75)';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
            const hx1 = px - 30 + Math.random() * 60;
            const hy1 = py - 25 + Math.random() * 50;
            const hx2 = cx + (Math.random() - 0.5) * 90;
            const hy2 = cy + (Math.random() - 0.5) * 80;
            ctx.beginPath();
            ctx.moveTo(hx1, hy1);
            const ctrl1X = (hx1 + hx2) / 2 + 50 - Math.random() * 100;
            const ctrl1Y = (hy1 + hy2) / 2 - 30;
            ctx.quadraticCurveTo(ctrl1X, ctrl1Y, hx2, hy2);
            ctx.stroke();
            // Пальцы на конце
            ctx.lineWidth = 2;
            for (let j = 0; j < 3; j++) {
                ctx.beginPath();
                ctx.moveTo(hx2, hy2);
                ctx.lineTo(hx2 + (Math.random() - 0.5) * 15, hy2 + (Math.random() - 0.5) * 15);
                ctx.stroke();
            }
            ctx.lineWidth = 9;
        }

        // Мерцающие «глаза» в темноте
        for (let i = 0; i < 4; i++) {
            const ex = 40 + Math.random() * (CANVAS_W - 80);
            const ey = 40 + Math.random() * (CANVAS_H - 120);
            if (Math.sin(now / 300 + i * 7) > 0.5) {
                ctx.fillStyle = 'rgba(200, 20, 60, 0.8)';
                ctx.beginPath();
                ctx.arc(ex, ey, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Текст
        drawSecretText([
            'Ты открыл дверь в подвал. Она не должна была открываться.',
            '«Рэм...» — но она не слышит. Её тело больше не принадлежит ей.',
            'Проповедник смеётся в углу: «Любовь... любовь к Ведьме!»',
        ], '#ff6a8a');
    }

    // ── СЦЕНА 2: Труп Субару из прошлой петли ──────────────
    function drawSceneSubaruCorpse(now) {
        const cx = CANVAS_W / 2;
        const cy = CANVAS_H / 2 + 30;

        // Лужа крови (большая)
        ctx.fillStyle = '#300008';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 25, 170, 50, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#500010';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 25, 130, 40, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#700018';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 25, 80, 25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Тело Субару — лежит на спине
        // Ноги
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(cx - 8, cy + 5, 6, 40);
        ctx.fillRect(cx + 2, cy + 5, 6, 40);

        // Оранжевый костюм
        const bg = ctx.createLinearGradient(cx - 35, cy, cx + 35, cy);
        bg.addColorStop(0, '#c86638');
        bg.addColorStop(0.5, '#a04022');
        bg.addColorStop(1, '#c86638');
        ctx.fillStyle = bg;
        roundRect(ctx, cx - 25, cy - 15, 50, 30, 5);
        ctx.fill();

        // Белые полосы
        ctx.strokeStyle = '#d8d0c8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy - 15); ctx.lineTo(cx - 14, cy + 15);
        ctx.moveTo(cx + 14, cy - 15); ctx.lineTo(cx + 14, cy + 15);
        ctx.stroke();

        // Кровь на костюме (пятна)
        ctx.fillStyle = '#300008';
        for (let i = 0; i < 6; i++) {
            const bx = cx - 18 + Math.random() * 36;
            const by = cy - 12 + Math.random() * 24;
            ctx.beginPath();
            ctx.ellipse(bx, by, 3 + Math.random() * 3, 4 + Math.random() * 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Руки — раскинуты
        ctx.strokeStyle = '#c86638';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 25, cy - 5);
        ctx.lineTo(cx - 60, cy + 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 25, cy - 5);
        ctx.lineTo(cx + 58, cy + 8);
        ctx.stroke();
        // Кисти
        ctx.fillStyle = '#e8c298';
        ctx.beginPath();
        ctx.arc(cx - 62, cy + 10, 5, 0, Math.PI * 2);
        ctx.arc(cx + 60, cy + 8, 5, 0, Math.PI * 2);
        ctx.fill();

        // Голова — бледная, запрокинутая назад
        ctx.fillStyle = '#d8b08a';
        ctx.beginPath();
        ctx.arc(cx, cy - 30, 11, 0, Math.PI * 2);
        ctx.fill();
        // Волосы
        ctx.fillStyle = '#0a0510';
        ctx.beginPath();
        ctx.arc(cx, cy - 33, 11, Math.PI, Math.PI * 2);
        ctx.fill();

        // Глаза — широко открыты, мёртвые
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 30, 2, 0, Math.PI * 2);
        ctx.arc(cx + 4, cy - 30, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0005';
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 30, 1, 0, Math.PI * 2);
        ctx.arc(cx + 4, cy - 30, 1, 0, Math.PI * 2);
        ctx.fill();

        // Открытый рот
        ctx.fillStyle = '#1a0005';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 24, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Кровь из рта
        ctx.fillStyle = '#800010';
        ctx.fillRect(cx - 1, cy - 22, 2, 10);

        // КИНЖАЛ в груди (работа Эльзы)
        ctx.save();
        ctx.translate(cx + 2, cy);
        ctx.rotate(0.15);
        // Лезвие торчит вверх
        const bladeGrad = ctx.createLinearGradient(0, -25, 0, 5);
        bladeGrad.addColorStop(0, '#c8c0d0');
        bladeGrad.addColorStop(0.5, '#f0f0f8');
        bladeGrad.addColorStop(1, '#808090');
        ctx.fillStyle = bladeGrad;
        ctx.beginPath();
        ctx.moveTo(0, -25);
        ctx.lineTo(-3, -5);
        ctx.lineTo(-3, 5);
        ctx.lineTo(3, 5);
        ctx.lineTo(3, -5);
        ctx.closePath();
        ctx.fill();
        // Кровь на лезвии
        ctx.fillStyle = '#800010';
        ctx.fillRect(-3, -5, 6, 10);
        ctx.fillRect(-2.5, -15, 5, 10);
        // Рукоять
        ctx.fillStyle = '#2a1810';
        ctx.fillRect(-3, 5, 6, 15);
        ctx.fillStyle = '#4a3018';
        ctx.fillRect(-4, 5, 8, 3);
        ctx.restore();

        // Капли крови «висят» вокруг
        ctx.fillStyle = '#800010';
        for (let i = 0; i < 10; i++) {
            const bx = cx + (Math.random() - 0.5) * 200;
            const by = cy - 40 + Math.random() * 30;
            ctx.beginPath();
            ctx.ellipse(bx, by, 1.5, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Мерцающая свеча у головы
        const flickerT = now / 150;
        const flicker = Math.sin(flickerT) * 0.4;
        ctx.fillStyle = '#3a2818';
        ctx.fillRect(cx - 80, cy - 60, 4, 20);
        ctx.fillStyle = '#e8d8a0';
        ctx.fillRect(cx - 79, cy - 70, 2, 10);
        ctx.fillStyle = '#ff9933';
        ctx.beginPath();
        ctx.ellipse(cx - 78 + flicker, cy - 76, 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffee88';
        ctx.beginPath();
        ctx.ellipse(cx - 78 + flicker, cy - 76, 1, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Слабый красный оттенок от свечи
        const candleGlow = ctx.createRadialGradient(cx - 78, cy - 76, 5, cx - 78, cy - 76, 100);
        candleGlow.addColorStop(0, 'rgba(255, 150, 80, 0.3)');
        candleGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = candleGlow;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        drawSecretText([
            'Ты видишь себя.',
            'Это не метафора — это ты. Петля, которая не дошла.',
            'Кинжал Эльзы до сих пор в твоей груди. «Красивое сердце...»',
        ], '#e8a8b8');
    }

    // ── СЦЕНА 3: Силуэт Сатэллы ────────────────────────────
    function drawSceneSatella(now) {
        const cx = CANVAS_W / 2;
        const cy = CANVAS_H / 2 - 20;

        // Тёмный фон с фиолетовым градиентом
        const bg = ctx.createRadialGradient(cx, cy, 30, cx, cy, CANVAS_W * 0.8);
        bg.addColorStop(0, 'rgba(60, 20, 80, 0.5)');
        bg.addColorStop(0.5, 'rgba(20, 5, 35, 0.9)');
        bg.addColorStop(1, 'rgba(5, 0, 15, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Летающие фиолетовые лепестки
        ctx.fillStyle = 'rgba(167, 139, 250, 0.6)';
        for (let i = 0; i < 15; i++) {
            const t = (now / 1000 + i * 0.7) % 3;
            const px = 50 + i * 45 + Math.sin(t + i) * 30;
            const py = 50 + t * 150 + Math.sin(i * 2) * 20;
            ctx.save();
            ctx.translate(px % CANVAS_W, py % CANVAS_H);
            ctx.rotate(t * 2 + i);
            ctx.beginPath();
            ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Огромное облако длинных фиолетовых волос
        ctx.fillStyle = '#6b3d9a';
        ctx.beginPath();
        ctx.moveTo(cx - 80, cy - 120);
        ctx.quadraticCurveTo(cx - 150, cy + 20, cx - 120, cy + 180);
        ctx.lineTo(cx - 80, cy + 200);
        ctx.quadraticCurveTo(cx - 60, cy + 50, cx - 30, cy - 30);
        ctx.lineTo(cx + 30, cy - 30);
        ctx.quadraticCurveTo(cx + 60, cy + 50, cx + 80, cy + 200);
        ctx.lineTo(cx + 120, cy + 180);
        ctx.quadraticCurveTo(cx + 150, cy + 20, cx + 80, cy - 120);
        ctx.closePath();
        ctx.fill();

        // Более светлые пряди
        ctx.fillStyle = '#8a5ac0';
        ctx.beginPath();
        ctx.moveTo(cx - 60, cy - 90);
        ctx.quadraticCurveTo(cx - 110, cy + 10, cx - 90, cy + 150);
        ctx.lineTo(cx - 75, cy + 150);
        ctx.quadraticCurveTo(cx - 45, cy + 40, cx - 20, cy - 20);
        ctx.lineTo(cx + 20, cy - 20);
        ctx.quadraticCurveTo(cx + 45, cy + 40, cx + 75, cy + 150);
        ctx.lineTo(cx + 90, cy + 150);
        ctx.quadraticCurveTo(cx + 110, cy + 10, cx + 60, cy - 90);
        ctx.closePath();
        ctx.fill();

        // Лицо — бледное, скрыто частично в тени
        ctx.fillStyle = '#f0e8f0';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 40, 25, 35, 0, 0, Math.PI * 2);
        ctx.fill();

        // Тёмная тень на лице (загадочность)
        ctx.fillStyle = 'rgba(30, 10, 40, 0.6)';
        ctx.beginPath();
        ctx.ellipse(cx - 8, cy - 40, 22, 32, 0, 0, Math.PI * 2);
        ctx.fill();

        // Один видимый фиолетовый глаз — светящийся
        const eyePulse = 0.8 + Math.sin(now / 600) * 0.2;
        ctx.fillStyle = `rgba(180, 120, 255, ${eyePulse})`;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.ellipse(cx + 8, cy - 42, 5, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Зрачок
        ctx.fillStyle = '#1a0a28';
        ctx.beginPath();
        ctx.arc(cx + 8, cy - 42, 2, 0, Math.PI * 2);
        ctx.fill();

        // Улыбка — тонкая, грустная
        ctx.strokeStyle = '#8a5ac0';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy - 20);
        ctx.quadraticCurveTo(cx, cy - 16, cx + 8, cy - 20);
        ctx.stroke();

        // Тело — прозрачное, смутное платье из тени
        ctx.fillStyle = 'rgba(60, 30, 90, 0.7)';
        ctx.beginPath();
        ctx.moveTo(cx - 40, cy + 20);
        ctx.lineTo(cx + 40, cy + 20);
        ctx.lineTo(cx + 70, CANVAS_H);
        ctx.lineTo(cx - 70, CANVAS_H);
        ctx.closePath();
        ctx.fill();

        // Цепи вокруг неё (то, что сдерживает её)
        ctx.strokeStyle = 'rgba(100, 100, 110, 0.65)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
            const sx = cx - 100 + i * 80;
            ctx.save();
            for (let link = 0; link < 12; link++) {
                ctx.beginPath();
                ctx.ellipse(sx + Math.sin(link * 1.2 + now / 1000) * 8, 30 + link * 30, 4, 6, link % 2 ? 0 : Math.PI / 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Руки — тянутся вперёд (к тебе)
        ctx.strokeStyle = '#e8d8f0';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 22, cy + 25);
        ctx.quadraticCurveTo(cx - 50, cy + 60, cx - 80 + Math.sin(now / 800) * 5, cy + 90);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 22, cy + 25);
        ctx.quadraticCurveTo(cx + 50, cy + 60, cx + 80 - Math.sin(now / 800) * 5, cy + 90);
        ctx.stroke();
        // Кисти
        ctx.fillStyle = '#e8d8f0';
        ctx.beginPath();
        ctx.arc(cx - 82 + Math.sin(now / 800) * 5, cy + 95, 6, 0, Math.PI * 2);
        ctx.arc(cx + 82 - Math.sin(now / 800) * 5, cy + 95, 6, 0, Math.PI * 2);
        ctx.fill();
        // Пальцы
        ctx.strokeStyle = '#e8d8f0';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(cx - 82, cy + 95);
            ctx.lineTo(cx - 85 - i * 2, cy + 105 + i * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + 82, cy + 95);
            ctx.lineTo(cx + 85 + i * 2, cy + 105 + i * 2);
            ctx.stroke();
        }

        // Пульсирующая фиолетовая аура
        const auraGrad = ctx.createRadialGradient(cx, cy - 30, 20, cx, cy - 30, 200);
        auraGrad.addColorStop(0, `rgba(167, 139, 250, ${0.25 + Math.sin(now / 500) * 0.1})`);
        auraGrad.addColorStop(1, 'rgba(167, 139, 250, 0)');
        ctx.fillStyle = auraGrad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        drawSecretText([
            'Ты заглянул в алтарную комнату. Она ждала.',
            '«...Субару... Я люблю тебя... Я так сильно тебя люблю...»',
            'Её цепи держат её. Но её глаза — находят тебя всегда.',
        ], '#d8b8ff');
    }

    // ── СЦЕНА 4: ПАК обезглавливает Субару ─────────────────
    function drawScenePuck(now) {
        // Ледяной фон
        const bg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 40, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W);
        bg.addColorStop(0, 'rgba(80, 120, 180, 0.6)');
        bg.addColorStop(0.5, 'rgba(20, 40, 80, 0.9)');
        bg.addColorStop(1, 'rgba(5, 10, 25, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Ледяные кристаллы по всему экрану
        ctx.fillStyle = 'rgba(180, 220, 255, 0.6)';
        for (let i = 0; i < 30; i++) {
            const ix = (i * 77 + now / 50) % CANVAS_W;
            const iy = (i * 53 + now / 80) % CANVAS_H;
            ctx.save();
            ctx.translate(ix, iy);
            ctx.rotate(i);
            const size = 2 + (i % 4);
            ctx.beginPath();
            for (let j = 0; j < 6; j++) {
                const ang = (j / 6) * Math.PI * 2;
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(ang) * size, Math.sin(ang) * size);
            }
            ctx.lineWidth = 0.6;
            ctx.strokeStyle = 'rgba(200, 230, 255, 0.4)';
            ctx.stroke();
            ctx.restore();
        }

        // Снежок/иней по низу
        ctx.fillStyle = 'rgba(230, 240, 255, 0.3)';
        ctx.fillRect(0, CANVAS_H - 80, CANVAS_W, 80);

        // ТЕЛО СУБАРУ (без головы) на полу
        const bx = CANVAS_W / 2 + 80;
        const by = CANVAS_H - 120;
        // Лужа крови (тёмная, с ледяным блеском)
        ctx.fillStyle = '#400010';
        ctx.beginPath();
        ctx.ellipse(bx, by + 25, 120, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a0018';
        ctx.beginPath();
        ctx.ellipse(bx, by + 25, 95, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        // Замёрзшая кровь — красно-синие кристаллы
        ctx.fillStyle = 'rgba(180, 40, 80, 0.8)';
        for (let i = 0; i < 8; i++) {
            const px = bx + (Math.random() - 0.5) * 160;
            const py = by + 20 + Math.random() * 25;
            ctx.beginPath();
            ctx.moveTo(px, py - 3);
            ctx.lineTo(px + 3, py);
            ctx.lineTo(px, py + 3);
            ctx.lineTo(px - 3, py);
            ctx.closePath();
            ctx.fill();
        }
        // Ноги
        ctx.fillStyle = '#1a1a28';
        ctx.fillRect(bx - 5, by + 5, 6, 35);
        ctx.fillRect(bx + 3, by + 5, 6, 35);
        // Белые полосы на штанах
        ctx.fillStyle = '#d8d8e0';
        ctx.fillRect(bx - 4.5, by + 5, 1, 35);
        ctx.fillRect(bx + 3.5, by + 5, 1, 35);
        // Оранжевый костюм (тело)
        const tgrad = ctx.createLinearGradient(bx - 30, by - 10, bx + 30, by + 10);
        tgrad.addColorStop(0, '#c85028');
        tgrad.addColorStop(0.5, '#a03818');
        tgrad.addColorStop(1, '#802010');
        ctx.fillStyle = tgrad;
        roundRect(ctx, bx - 25, by - 15, 50, 30, 5);
        ctx.fill();
        // Белые полосы
        ctx.fillStyle = '#d8d8e0';
        ctx.fillRect(bx - 24, by - 15, 1.5, 30);
        ctx.fillRect(bx + 22.5, by - 15, 1.5, 30);
        // Молния
        ctx.strokeStyle = '#3a1808';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(bx, by - 15); ctx.lineTo(bx, by + 15);
        ctx.stroke();

        // МЕСТО ГДЕ БЫЛА ГОЛОВА — кровавый обрубок шеи
        ctx.fillStyle = '#800010';
        ctx.beginPath();
        ctx.ellipse(bx, by - 20, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Торчащие кусочки позвоночника и мяса
        ctx.strokeStyle = '#f8d8e0';
        ctx.lineWidth = 1.5;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(bx + i * 2, by - 20);
            ctx.lineTo(bx + i * 2.5, by - 25);
            ctx.stroke();
        }
        ctx.fillStyle = '#a00018';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(bx + (Math.random() - 0.5) * 16, by - 22, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        // Кровь из шеи
        ctx.fillStyle = '#600010';
        ctx.fillRect(bx - 6, by - 18, 12, 10);

        // Руки раскинуты
        ctx.strokeStyle = '#c85028';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx - 25, by - 8);
        ctx.lineTo(bx - 60, by + 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx + 25, by - 8);
        ctx.lineTo(bx + 60, by + 8);
        ctx.stroke();

        // ГОЛОВА СУБАРУ отдельно (катится влево)
        const hx = bx - 180;
        const hy = by + 10;
        // След крови от головы к телу
        ctx.strokeStyle = 'rgba(120, 10, 25, 0.5)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(hx + 10, hy);
        ctx.quadraticCurveTo(bx - 100, by + 15, bx - 40, by - 10);
        ctx.stroke();
        // Капли на дороге
        ctx.fillStyle = '#800010';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(hx + 30 + i * 25, hy + Math.sin(i) * 5, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        // Сама голова
        ctx.fillStyle = '#f4c9a0';
        ctx.beginPath();
        ctx.arc(hx, hy, 16, 0, Math.PI * 2);
        ctx.fill();
        // Волосы (чёрные, торчащие)
        ctx.fillStyle = '#0a0510';
        ctx.beginPath();
        ctx.arc(hx - 3, hy - 6, 16, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(hx - 10, hy - 14);
        ctx.lineTo(hx - 8, hy - 22);
        ctx.lineTo(hx - 4, hy - 16);
        ctx.lineTo(hx - 2, hy - 24);
        ctx.lineTo(hx + 2, hy - 18);
        ctx.lineTo(hx + 6, hy - 22);
        ctx.lineTo(hx + 10, hy - 18);
        ctx.lineTo(hx + 12, hy - 14);
        ctx.fill();
        // Глаза широко открыты, мёртвые
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(hx - 5, hy - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(hx + 5, hy - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0510';
        ctx.beginPath();
        ctx.arc(hx - 5, hy - 2, 1.5, 0, Math.PI * 2);
        ctx.arc(hx + 5, hy - 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Открытый рот (шок)
        ctx.fillStyle = '#0a0005';
        ctx.beginPath();
        ctx.ellipse(hx, hy + 6, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Кровь на шее головы
        ctx.fillStyle = '#800010';
        ctx.beginPath();
        ctx.ellipse(hx, hy + 14, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a00018';
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(hx + (i - 2) * 4, hy + 18, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // ПАК — огромный дух в форме кота (боевая форма)
        // Тело — тёмное с контуром и свечением
        const px = 180;
        const py = 200;

        // Аура холода
        const coldGlow = ctx.createRadialGradient(px, py, 30, px, py, 250);
        coldGlow.addColorStop(0, 'rgba(100, 180, 255, 0.3)');
        coldGlow.addColorStop(1, 'rgba(100, 180, 255, 0)');
        ctx.fillStyle = coldGlow;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Огромное тело Пака (кошачий силуэт)
        ctx.fillStyle = '#1a1a28';
        ctx.beginPath();
        ctx.ellipse(px, py + 50, 80, 60, 0, 0, Math.PI * 2);
        ctx.fill();

        // Голова кота (большая, угрожающая)
        ctx.fillStyle = '#0a0a18';
        ctx.beginPath();
        ctx.arc(px, py - 20, 55, 0, Math.PI * 2);
        ctx.fill();

        // Уши (острые, большие)
        ctx.beginPath();
        ctx.moveTo(px - 45, py - 55);
        ctx.lineTo(px - 35, py - 90);
        ctx.lineTo(px - 20, py - 60);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + 45, py - 55);
        ctx.lineTo(px + 35, py - 90);
        ctx.lineTo(px + 20, py - 60);
        ctx.closePath();
        ctx.fill();

        // Внутри ушей — розовое
        ctx.fillStyle = '#3a1a28';
        ctx.beginPath();
        ctx.moveTo(px - 38, py - 60);
        ctx.lineTo(px - 33, py - 82);
        ctx.lineTo(px - 26, py - 62);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + 38, py - 60);
        ctx.lineTo(px + 33, py - 82);
        ctx.lineTo(px + 26, py - 62);
        ctx.closePath();
        ctx.fill();

        // Шерсть (текстурные линии)
        ctx.strokeStyle = 'rgba(40, 40, 60, 0.8)';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 30; i++) {
            const ang = (i / 30) * Math.PI * 2;
            const r1 = 40 + Math.random() * 15;
            const r2 = r1 + 10;
            ctx.beginPath();
            ctx.moveTo(px + Math.cos(ang) * r1, py - 20 + Math.sin(ang) * r1);
            ctx.lineTo(px + Math.cos(ang) * r2, py - 20 + Math.sin(ang) * r2);
            ctx.stroke();
        }

        // Светящиеся голубые глаза (ПАЯРОСТИ)
        const eyePulse = 0.8 + Math.sin(now / 300) * 0.2;
        // Левый глаз
        ctx.fillStyle = `rgba(120, 200, 255, ${eyePulse})`;
        ctx.shadowColor = '#66ccff';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.ellipse(px - 18, py - 22, 9, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        // Правый глаз
        ctx.beginPath();
        ctx.ellipse(px + 18, py - 22, 9, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Вертикальные зрачки кошачьи (тёмные)
        ctx.fillStyle = '#0a0018';
        ctx.beginPath();
        ctx.ellipse(px - 18, py - 22, 2, 12, 0, 0, Math.PI * 2);
        ctx.ellipse(px + 18, py - 22, 2, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Нос
        ctx.fillStyle = '#600020';
        ctx.beginPath();
        ctx.moveTo(px - 4, py - 2);
        ctx.lineTo(px + 4, py - 2);
        ctx.lineTo(px, py + 4);
        ctx.closePath();
        ctx.fill();

        // Пасть — открытая, видны клыки
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(px, py + 15, 12, 0, Math.PI);
        ctx.fill();
        // Клыки
        ctx.fillStyle = '#e8e0d8';
        ctx.beginPath();
        ctx.moveTo(px - 8, py + 15);
        ctx.lineTo(px - 6, py + 25);
        ctx.lineTo(px - 4, py + 15);
        ctx.closePath();
        ctx.moveTo(px + 4, py + 15);
        ctx.lineTo(px + 6, py + 25);
        ctx.lineTo(px + 8, py + 15);
        ctx.closePath();
        ctx.fill();
        // Кровь на клыках
        ctx.fillStyle = 'rgba(180, 0, 30, 0.8)';
        ctx.fillRect(px - 7, py + 20, 2, 5);
        ctx.fillRect(px + 5, py + 20, 2, 5);

        // Ледяная когтистая лапа (подъятая)
        ctx.fillStyle = '#1a1a28';
        ctx.beginPath();
        ctx.ellipse(px + 80, py - 10, 25, 40, -0.3, 0, Math.PI * 2);
        ctx.fill();
        // Когти (ледяные)
        for (let i = -2; i <= 2; i++) {
            const cx = px + 95 + i * 5;
            const cy = py - 35 - Math.abs(i) * 2;
            ctx.fillStyle = '#c0e0ff';
            ctx.beginPath();
            ctx.moveTo(cx, cy + 10);
            ctx.lineTo(cx - 2, cy - 12);
            ctx.lineTo(cx + 2, cy - 12);
            ctx.closePath();
            ctx.fill();
            // Кровь на когтях
            ctx.fillStyle = '#800010';
            ctx.fillRect(cx - 1, cy - 10, 2, 8);
        }

        // Усы (длинные, серебристые)
        ctx.strokeStyle = 'rgba(200, 230, 255, 0.7)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(px - 25, py + (i - 1) * 3);
            ctx.lineTo(px - 80, py + (i - 1) * 8 - 10);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px + 25, py + (i - 1) * 3);
            ctx.lineTo(px + 80, py + (i - 1) * 8 - 10);
            ctx.stroke();
        }

        // Туман холода вокруг Пака
        ctx.fillStyle = 'rgba(180, 220, 255, 0.3)';
        for (let i = 0; i < 15; i++) {
            const fx = px - 100 + (Math.random() * 200);
            const fy = py - 50 + Math.random() * 150;
            ctx.beginPath();
            ctx.arc(fx, fy, 15 + Math.random() * 10, 0, Math.PI * 2);
            ctx.fill();
        }

        drawSecretText([
            'Ты сказал имя Её. Ты произнёс «Сатэлла».',
            'Великий Дух не знает милосердия. Его коготь — мгновенен.',
            '«Я обещал. Эмилии — никаких угроз. Прощай.»',
        ], '#c0e0ff');
    }

    // ── СЦЕНА 5: Лай Батенкайтос (Обжора) ──────────────────
    function drawSceneLey(now) {
        // Мрачно-жёлтый фон
        const bg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 30, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W);
        bg.addColorStop(0, 'rgba(80, 60, 30, 0.5)');
        bg.addColorStop(0.5, 'rgba(30, 20, 10, 0.9)');
        bg.addColorStop(1, 'rgba(5, 5, 2, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Фигура Лай — белые одежды
        const lx = CANVAS_W / 2;
        const ly = CANVAS_H / 2 + 30;

        // Одеяние (бело-кремовое с пятнами)
        const robeGrad = ctx.createLinearGradient(lx, ly - 20, lx, ly + 120);
        robeGrad.addColorStop(0, '#f0e8d8');
        robeGrad.addColorStop(1, '#a08860');
        ctx.fillStyle = robeGrad;
        ctx.beginPath();
        ctx.moveTo(lx - 50, ly - 30);
        ctx.lineTo(lx + 50, ly - 30);
        ctx.lineTo(lx + 80, ly + 130);
        ctx.lineTo(lx - 80, ly + 130);
        ctx.closePath();
        ctx.fill();
        // Пятна грязи/крови на одежде
        ctx.fillStyle = 'rgba(80, 20, 30, 0.5)';
        for (let i = 0; i < 8; i++) {
            const sx = lx - 60 + Math.random() * 120;
            const sy = ly + Math.random() * 100;
            ctx.beginPath();
            ctx.ellipse(sx, sy, 8, 5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Голова (бледно-коричневая)
        ctx.fillStyle = '#e8c898';
        ctx.beginPath();
        ctx.ellipse(lx, ly - 50, 22, 28, 0, 0, Math.PI * 2);
        ctx.fill();

        // Растрепанные волосы (тёмно-коричневые)
        ctx.fillStyle = '#4a3820';
        ctx.beginPath();
        ctx.arc(lx, ly - 55, 22, Math.PI, Math.PI * 2);
        ctx.fill();
        // Неровные пряди
        for (let i = 0; i < 12; i++) {
            const ang = Math.PI + (i / 12) * Math.PI;
            ctx.strokeStyle = '#4a3820';
            ctx.lineWidth = 2 + Math.random();
            ctx.beginPath();
            ctx.moveTo(lx, ly - 55);
            ctx.lineTo(lx + Math.cos(ang) * (25 + Math.random() * 8), ly - 65 + Math.sin(ang) * (25 + Math.random() * 8));
            ctx.stroke();
        }

        // РОТЫ НА ТЕЛЕ — ключевая деталь Обжоры
        // Основной рот на лице — огромный, зубастый
        ctx.fillStyle = '#1a0a05';
        ctx.beginPath();
        ctx.ellipse(lx, ly - 40, 12, 8 + Math.sin(now / 200) * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Острые кривые зубы
        ctx.fillStyle = '#f0e0c8';
        for (let i = -3; i <= 3; i++) {
            ctx.beginPath();
            ctx.moveTo(lx + i * 3 - 1.5, ly - 46);
            ctx.lineTo(lx + i * 3, ly - 36);
            ctx.lineTo(lx + i * 3 + 1.5, ly - 46);
            ctx.closePath();
            ctx.fill();
        }
        // Высунутый язык
        ctx.fillStyle = '#800020';
        ctx.beginPath();
        ctx.ellipse(lx, ly - 35, 5, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Маниакальные глаза (разного цвета)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(lx - 8, ly - 55, 4.5, 0, Math.PI * 2);
        ctx.arc(lx + 8, ly - 55, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Разные цвета зрачков (съеденные воспоминания)
        ctx.fillStyle = '#ff2040';
        ctx.beginPath();
        ctx.arc(lx - 8, ly - 55, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#40ff80';
        ctx.beginPath();
        ctx.arc(lx + 8, ly - 55, 2.8, 0, Math.PI * 2);
        ctx.fill();
        // Зрачки (нерегулярные)
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(lx - 7, ly - 54, 1, 0, Math.PI * 2);
        ctx.arc(lx + 9, ly - 56, 1, 0, Math.PI * 2);
        ctx.fill();

        // ДОПОЛНИТЕЛЬНЫЕ РТЫ на шее и груди
        const mouthSpots = [
            { x: lx - 18, y: ly - 18, r: 6 },  // на шее слева
            { x: lx + 18, y: ly - 15, r: 5 },  // на шее справа
            { x: lx, y: ly + 10, r: 8 },        // на груди
            { x: lx - 35, y: ly + 30, r: 5 },  // на плече
            { x: lx + 35, y: ly + 35, r: 6 },
        ];
        for (const ms of mouthSpots) {
            // Рот
            ctx.fillStyle = '#1a0a05';
            ctx.beginPath();
            ctx.ellipse(ms.x, ms.y, ms.r, ms.r * 0.5 + Math.sin(now / 150 + ms.x) * 1, 0, 0, Math.PI * 2);
            ctx.fill();
            // Зубы
            ctx.fillStyle = '#e8d8b8';
            for (let t = -2; t <= 2; t++) {
                ctx.beginPath();
                ctx.moveTo(ms.x + t * ms.r / 4, ms.y - ms.r * 0.4);
                ctx.lineTo(ms.x + t * ms.r / 4 + 0.5, ms.y + ms.r * 0.3);
                ctx.lineTo(ms.x + t * ms.r / 4 + 1, ms.y - ms.r * 0.4);
                ctx.closePath();
                ctx.fill();
            }
        }

        // Дополнительные глаза на теле
        const eyeSpots = [
            { x: lx - 40, y: ly - 5 },
            { x: lx + 42, y: ly + 5 },
            { x: lx - 8, y: ly + 40 },
        ];
        for (const es of eyeSpots) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(es.x, es.y, 3.5, 0, Math.PI * 2);
            ctx.fill();
            const pupilC = ['#ff2040', '#40ff80', '#a040ff', '#ffaa00'][Math.floor(es.x + es.y) % 4];
            ctx.fillStyle = pupilC;
            ctx.beginPath();
            ctx.arc(es.x, es.y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(es.x, es.y, 0.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // Руки-когти
        ctx.strokeStyle = '#e8c898';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        // Левая рука — держит «имя» (светящийся предмет)
        ctx.beginPath();
        ctx.moveTo(lx - 48, ly + 10);
        ctx.lineTo(lx - 100, ly + 40);
        ctx.stroke();
        // Правая рука поднята, пальцы в когтях
        ctx.beginPath();
        ctx.moveTo(lx + 48, ly);
        ctx.lineTo(lx + 110, ly - 30);
        ctx.stroke();
        // Длинные пальцы-когти
        ctx.strokeStyle = '#3a2010';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(lx + 110, ly - 30);
            ctx.lineTo(lx + 130 + i * 3, ly - 50 - i * 4);
            ctx.stroke();
        }

        // «Имя» — светящееся нечто в левой руке, призрачное
        const nameGlow = ctx.createRadialGradient(lx - 100, ly + 40, 3, lx - 100, ly + 40, 30);
        nameGlow.addColorStop(0, 'rgba(200, 220, 255, 0.9)');
        nameGlow.addColorStop(0.5, 'rgba(100, 150, 255, 0.6)');
        nameGlow.addColorStop(1, 'rgba(100, 150, 255, 0)');
        ctx.fillStyle = nameGlow;
        ctx.fillRect(lx - 140, ly, 80, 80);
        // Буквы/символы
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 14px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', lx - 100, ly + 46);

        // Призрачные силуэты жертв (которых он съел)
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 4; i++) {
            const gx = 80 + i * 140;
            const gy = CANVAS_H - 80;
            ctx.fillStyle = '#b0c0d0';
            ctx.beginPath();
            ctx.ellipse(gx, gy, 15, 30, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(gx, gy - 30, 10, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        drawSecretText([
            'Он смеётся, облизывая зубы. «Какое вкусное имя...»',
            'Лай Батенкайтос съедает память о тебе. Ты становишься никем.',
            'Твои близкие забудут тебя. Ты забудешь себя.',
        ], '#ffcc80');
    }

    // ── СЦЕНА 6: Эльза Гранхельт «Охотница за кишками» ─────
    function drawSceneElsa(now) {
        // Холодный синий фон особняка
        const bg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 50, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W);
        bg.addColorStop(0, 'rgba(40, 20, 30, 0.6)');
        bg.addColorStop(0.5, 'rgba(15, 5, 12, 0.92)');
        bg.addColorStop(1, 'rgba(3, 0, 5, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Лужа крови под центральной фигурой
        ctx.fillStyle = '#400008';
        ctx.beginPath();
        ctx.ellipse(CANVAS_W / 2 - 30, CANVAS_H - 100, 180, 45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#500010';
        ctx.beginPath();
        ctx.ellipse(CANVAS_W / 2 - 30, CANVAS_H - 100, 140, 35, 0, 0, Math.PI * 2);
        ctx.fill();

        // ЖЕРТВА на полу (безымянная)
        const vx = CANVAS_W / 2 - 100;
        const vy = CANVAS_H - 130;
        // Тело в тёмной одежде
        ctx.fillStyle = '#1a0a12';
        ctx.fillRect(vx - 25, vy - 10, 50, 30);
        ctx.beginPath();
        ctx.arc(vx, vy - 15, 14, 0, Math.PI * 2);
        ctx.fill();
        // Распоротый живот
        ctx.fillStyle = '#800010';
        ctx.fillRect(vx - 15, vy, 30, 15);
        // Вытянутые внутренности (тошнотворно)
        ctx.fillStyle = '#a03040';
        ctx.beginPath();
        ctx.moveTo(vx - 8, vy + 10);
        ctx.quadraticCurveTo(vx - 40, vy + 30, vx - 30, vy + 50);
        ctx.quadraticCurveTo(vx, vy + 60, vx + 20, vy + 50);
        ctx.quadraticCurveTo(vx + 40, vy + 35, vx + 8, vy + 10);
        ctx.fill();
        ctx.strokeStyle = '#600008';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Кровь вокруг
        ctx.fillStyle = '#600010';
        for (let i = 0; i < 10; i++) {
            ctx.beginPath();
            ctx.arc(vx + (Math.random() - 0.5) * 80, vy + 20 + Math.random() * 40, 1 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
        // Глаза жертвы — мёртвые, открытые
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(vx - 4, vy - 16, 2, 0, Math.PI * 2);
        ctx.arc(vx + 4, vy - 16, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0510';
        ctx.fillRect(vx - 5, vy - 16.5, 1, 1);
        ctx.fillRect(vx + 3, vy - 16.5, 1, 1);

        // ЭЛЬЗА стоит над жертвой
        const ex = CANVAS_W / 2 + 60;
        const ey = CANVAS_H / 2 - 20;

        // Платье (чёрное с кроваво-красными акцентами)
        const dressGrad = ctx.createLinearGradient(ex, ey - 30, ex, ey + 140);
        dressGrad.addColorStop(0, '#1a0512');
        dressGrad.addColorStop(0.5, '#080208');
        dressGrad.addColorStop(1, '#050005');
        ctx.fillStyle = dressGrad;
        ctx.beginPath();
        ctx.moveTo(ex - 25, ey - 30);
        ctx.lineTo(ex + 25, ey - 30);
        ctx.lineTo(ex + 50, ey + 140);
        ctx.lineTo(ex - 50, ey + 140);
        ctx.closePath();
        ctx.fill();

        // Декольте / красный шарф
        ctx.fillStyle = '#800020';
        ctx.fillRect(ex - 15, ey - 15, 30, 20);

        // Бёдра — слегка изгиб
        ctx.fillStyle = '#1a0512';
        ctx.beginPath();
        ctx.ellipse(ex, ey + 50, 40, 25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Голова (бледная)
        ctx.fillStyle = '#f8e0d0';
        ctx.beginPath();
        ctx.ellipse(ex, ey - 55, 18, 22, 0, 0, Math.PI * 2);
        ctx.fill();

        // Длинные чёрные волосы — свисают вниз, окутывают лицо
        ctx.fillStyle = '#0a0005';
        ctx.beginPath();
        ctx.moveTo(ex - 18, ey - 60);
        ctx.quadraticCurveTo(ex - 35, ey - 30, ex - 25, ey + 80);
        ctx.lineTo(ex - 15, ey + 80);
        ctx.quadraticCurveTo(ex - 20, ey - 20, ex - 12, ey - 50);
        ctx.lineTo(ex + 12, ey - 50);
        ctx.quadraticCurveTo(ex + 20, ey - 20, ex + 15, ey + 80);
        ctx.lineTo(ex + 25, ey + 80);
        ctx.quadraticCurveTo(ex + 35, ey - 30, ex + 18, ey - 60);
        ctx.fill();
        // Чёлка (закрывает часть глаз)
        ctx.beginPath();
        ctx.moveTo(ex - 18, ey - 55);
        ctx.quadraticCurveTo(ex - 10, ey - 45, ex, ey - 52);
        ctx.quadraticCurveTo(ex + 10, ey - 45, ex + 18, ey - 55);
        ctx.lineTo(ex + 18, ey - 62);
        ctx.lineTo(ex - 18, ey - 62);
        ctx.closePath();
        ctx.fill();

        // Один видимый глаз (фиолетовый, опасный)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(ex + 5, ey - 50, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a040a0';
        ctx.beginPath();
        ctx.arc(ex + 5, ey - 50, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(ex + 5, ey - 50, 1, 0, Math.PI * 2);
        ctx.fill();
        // Блик
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex + 6, ey - 51, 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Кровавая улыбка — красный рот, слегка приоткрытый
        ctx.fillStyle = '#a00020';
        ctx.beginPath();
        ctx.moveTo(ex - 6, ey - 42);
        ctx.quadraticCurveTo(ex, ey - 36, ex + 6, ey - 42);
        ctx.quadraticCurveTo(ex + 2, ey - 40, ex, ey - 41);
        ctx.quadraticCurveTo(ex - 2, ey - 40, ex - 6, ey - 42);
        ctx.closePath();
        ctx.fill();
        // Кровь в уголке рта
        ctx.fillRect(ex + 5, ey - 42, 1, 6);

        // РУКА ДЕРЖИТ ВНУТРЕННОСТИ ЖЕРТВЫ — главный хоррор
        ctx.strokeStyle = '#f8e0d0';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - 25, ey - 10);
        ctx.quadraticCurveTo(ex - 60, ey + 20, ex - 80, ey + 60);
        ctx.stroke();
        // Кисть
        ctx.fillStyle = '#f8e0d0';
        ctx.beginPath();
        ctx.arc(ex - 82, ey + 62, 7, 0, Math.PI * 2);
        ctx.fill();
        // Пальцы
        ctx.strokeStyle = '#f8e0d0';
        ctx.lineWidth = 3;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(ex - 82, ey + 62);
            ctx.lineTo(ex - 82 + i * 3, ey + 75 + Math.abs(i) * 2);
            ctx.stroke();
        }

        // Сами внутренности — тошнотворные, капают
        ctx.fillStyle = '#a03040';
        ctx.beginPath();
        ctx.moveTo(ex - 85, ey + 65);
        ctx.quadraticCurveTo(ex - 110, ey + 80, ex - 100, ey + 110);
        ctx.quadraticCurveTo(ex - 70, ey + 115, ex - 75, ey + 80);
        ctx.closePath();
        ctx.fill();
        // Сегменты кишок
        ctx.strokeStyle = '#600020';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(ex - 95 + i * 5, ey + 85 + (i % 2) * 5, 3, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Капли крови с внутренностей
        ctx.fillStyle = '#800020';
        for (let i = 0; i < 6; i++) {
            const dx = ex - 95 + Math.random() * 30;
            const dy = ey + 110 + Math.random() * 40;
            ctx.beginPath();
            ctx.ellipse(dx, dy, 1.5, 3 + Math.random() * 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Другая рука держит кинжал
        ctx.strokeStyle = '#f8e0d0';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(ex + 25, ey - 5);
        ctx.lineTo(ex + 60, ey + 15);
        ctx.stroke();
        // Кинжал (окровавленный)
        ctx.save();
        ctx.translate(ex + 62, ey + 17);
        ctx.rotate(0.4);
        const bladeGrad = ctx.createLinearGradient(0, -30, 0, 10);
        bladeGrad.addColorStop(0, '#d8d0d8');
        bladeGrad.addColorStop(0.5, '#fff');
        bladeGrad.addColorStop(1, '#808090');
        ctx.fillStyle = bladeGrad;
        ctx.beginPath();
        ctx.moveTo(0, -30);
        ctx.lineTo(-3, -5);
        ctx.lineTo(-3, 8);
        ctx.lineTo(3, 8);
        ctx.lineTo(3, -5);
        ctx.closePath();
        ctx.fill();
        // Кровь на лезвии
        ctx.fillStyle = '#800020';
        ctx.fillRect(-3, 0, 6, 8);
        ctx.fillRect(-2.5, -10, 5, 12);
        // Рукоять
        ctx.fillStyle = '#2a1810';
        ctx.fillRect(-3, 8, 6, 15);
        ctx.restore();

        // Капли крови в воздухе
        ctx.fillStyle = '#800020';
        for (let i = 0; i < 15; i++) {
            const bx = Math.random() * CANVAS_W;
            const by = Math.random() * CANVAS_H;
            ctx.beginPath();
            ctx.ellipse(bx, by, 1, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        drawSecretText([
            'Эльза Гранхельт. «Охотница за кишками».',
            '«Какое у тебя красивое сердце...» — она улыбается, поднимая нож.',
            'Она коллекционирует их. Уже годами.',
        ], '#ff8090');
    }

    // ── СЦЕНА 7: Они-близнецы Рэм и Рам (демоническая форма) ─
    function drawSceneOni(now) {
        // Горящая деревня (фон)
        const fireGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        fireGrad.addColorStop(0, 'rgba(80, 10, 10, 0.95)');
        fireGrad.addColorStop(0.5, 'rgba(200, 60, 20, 0.8)');
        fireGrad.addColorStop(1, 'rgba(120, 20, 5, 1)');
        ctx.fillStyle = fireGrad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Горящие домики на фоне
        for (let i = 0; i < 5; i++) {
            const hx = 60 + i * 140;
            const hy = CANVAS_H - 180;
            // Дом
            ctx.fillStyle = '#1a0a05';
            ctx.fillRect(hx - 30, hy, 60, 60);
            // Крыша
            ctx.beginPath();
            ctx.moveTo(hx - 35, hy);
            ctx.lineTo(hx, hy - 30);
            ctx.lineTo(hx + 35, hy);
            ctx.closePath();
            ctx.fill();
            // Окна — огонь внутри
            ctx.fillStyle = '#ff8040';
            ctx.fillRect(hx - 20, hy + 10, 10, 10);
            ctx.fillRect(hx + 10, hy + 10, 10, 10);
            // Пламя из крыши
            const flickerT = now / 200 + i;
            ctx.fillStyle = '#ff6020';
            ctx.beginPath();
            for (let f = 0; f < 5; f++) {
                const fx = hx - 20 + f * 10;
                const fy = hy - 25;
                ctx.moveTo(fx, fy);
                ctx.quadraticCurveTo(fx - 3 + Math.sin(flickerT + f) * 3, fy - 15 - Math.random() * 10, fx + 5, fy - 5);
                ctx.closePath();
            }
            ctx.fill();
            ctx.fillStyle = '#ffaa20';
            for (let f = 0; f < 5; f++) {
                const fx = hx - 20 + f * 10;
                const fy = hy - 25;
                ctx.beginPath();
                ctx.moveTo(fx, fy);
                ctx.quadraticCurveTo(fx + Math.sin(flickerT + f) * 3, fy - 10 - Math.random() * 5, fx + 3, fy - 3);
                ctx.closePath();
                ctx.fill();
            }
        }

        // Искры в воздухе
        ctx.fillStyle = '#ffcc40';
        for (let i = 0; i < 50; i++) {
            const sx = (i * 37 + now / 60) % CANVAS_W;
            const sy = (i * 23 - now / 40 + CANVAS_H) % CANVAS_H;
            ctx.beginPath();
            ctx.arc(sx, sy, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Дым наверху
        ctx.fillStyle = 'rgba(40, 20, 20, 0.7)';
        ctx.fillRect(0, 0, CANVAS_W, 80);

        // === РАМ (левая, розовые волосы) ===
        const rx1 = CANVAS_W / 2 - 100;
        const ry1 = CANVAS_H / 2 + 20;

        drawOniTwin(rx1, ry1, {
            hairColor: '#ff8ab8',
            hairDark: '#c4608a',
            hornColor: '#f8d8e0',
            auraColor: 'rgba(255, 100, 150, 0.5)',
            eyeColor: '#ff3060',
            name: 'РАМ',
        }, now);

        // === РЭМ (правая, голубые волосы) ===
        const rx2 = CANVAS_W / 2 + 100;
        const ry2 = CANVAS_H / 2 + 20;

        drawOniTwin(rx2, ry2, {
            hairColor: '#5090d0',
            hairDark: '#306090',
            hornColor: '#d8e8ff',
            auraColor: 'rgba(80, 150, 255, 0.5)',
            eyeColor: '#3080ff',
            name: 'РЭМ',
        }, now);

        // Кровь и трупы на земле между ними
        ctx.fillStyle = '#400008';
        ctx.beginPath();
        ctx.ellipse(CANVAS_W / 2, CANVAS_H - 50, 200, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        // Трупы селян
        for (let i = 0; i < 4; i++) {
            const bx = CANVAS_W / 2 - 150 + i * 100;
            const by = CANVAS_H - 60;
            ctx.fillStyle = '#1a0a12';
            ctx.beginPath();
            ctx.ellipse(bx, by, 15, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            // Головы
            ctx.fillStyle = '#c89080';
            ctx.beginPath();
            ctx.arc(bx + 13, by, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        drawSecretText([
            'Деревня они сожжена. Их народ истреблён.',
            'Двое сестёр выжили. В них теперь живёт ярость.',
            'Ты смотришь в их глаза — и видишь, что станет с Минко.',
        ], '#ff90a8');
    }

    // Вспомогательный рендер Они-близнеца
    function drawOniTwin(x, y, pal, now) {
        // Демоническая аура
        const aura = ctx.createRadialGradient(x, y, 20, x, y, 120);
        aura.addColorStop(0, pal.auraColor);
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = aura;
        ctx.fillRect(x - 120, y - 120, 240, 240);

        // Платье горничной (чёрно-белое)
        ctx.fillStyle = '#1a1018';
        ctx.fillRect(x - 22, y - 8, 44, 50);
        // Передник
        ctx.fillStyle = '#c8c0c4';
        ctx.fillRect(x - 14, y - 8, 28, 40);
        // Кровавые разводы на переднике
        ctx.fillStyle = 'rgba(120, 10, 25, 0.7)';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.ellipse(x - 10 + i * 4, y + 5 + Math.sin(i) * 8, 3, 5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Голова
        ctx.fillStyle = '#f8e0e8';
        ctx.beginPath();
        ctx.arc(x, y - 25, 18, 0, Math.PI * 2);
        ctx.fill();

        // Волосы (задняя часть + чёлка)
        ctx.fillStyle = pal.hairDark;
        ctx.beginPath();
        ctx.arc(x, y - 30, 20, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pal.hairColor;
        ctx.beginPath();
        ctx.moveTo(x - 18, y - 28);
        ctx.quadraticCurveTo(x - 6, y - 18, x, y - 22);
        ctx.quadraticCurveTo(x + 6, y - 18, x + 18, y - 28);
        ctx.lineTo(x + 18, y - 38);
        ctx.lineTo(x - 18, y - 38);
        ctx.closePath();
        ctx.fill();

        // РОГ демона
        ctx.fillStyle = pal.hornColor;
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 45);
        ctx.lineTo(x, y - 60);
        ctx.lineTo(x + 6, y - 45);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Линии на роге
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 50);
        ctx.lineTo(x + 4, y - 50);
        ctx.moveTo(x - 3, y - 54);
        ctx.lineTo(x + 3, y - 54);
        ctx.stroke();

        // ДЕМОНИЧЕСКИЕ ГЛАЗА (горящие)
        ctx.shadowColor = pal.eyeColor;
        ctx.shadowBlur = 15;
        ctx.fillStyle = pal.eyeColor;
        ctx.beginPath();
        ctx.ellipse(x - 6, y - 23, 3.5, 5, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 6, y - 23, 3.5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Вертикальные зрачки (звериные)
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(x - 6, y - 23, 1, 4, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 6, y - 23, 1, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Кровавая улыбка с клыками
        ctx.strokeStyle = '#4a0010';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 13);
        ctx.quadraticCurveTo(x, y - 5, x + 8, y - 13);
        ctx.stroke();
        // Клыки
        ctx.fillStyle = '#f0e8d0';
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 10);
        ctx.lineTo(x - 4, y - 6);
        ctx.lineTo(x - 3, y - 10);
        ctx.closePath();
        ctx.moveTo(x + 3, y - 10);
        ctx.lineTo(x + 4, y - 6);
        ctx.lineTo(x + 5, y - 10);
        ctx.closePath();
        ctx.fill();
        // Кровь у рта
        ctx.fillStyle = '#800020';
        ctx.fillRect(x - 2, y - 8, 4, 6);

        // Руки с когтями
        ctx.strokeStyle = '#f8e0e8';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 22, y);
        ctx.lineTo(x - 38, y + 35);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 22, y);
        ctx.lineTo(x + 38, y + 30);
        ctx.stroke();
        // Когти
        ctx.fillStyle = '#3a1018';
        for (let i = 0; i < 3; i++) {
            const ang = i * 0.3;
            ctx.beginPath();
            ctx.moveTo(x - 38, y + 35);
            ctx.lineTo(x - 45 - i * 2, y + 48 + i * 2);
            ctx.lineTo(x - 40, y + 40);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x + 38, y + 30);
            ctx.lineTo(x + 45 + i * 2, y + 43 + i * 2);
            ctx.lineTo(x + 40, y + 35);
            ctx.closePath();
            ctx.fill();
        }

        // Ноги
        ctx.fillStyle = '#1a1018';
        ctx.fillRect(x - 8, y + 42, 6, 40);
        ctx.fillRect(x + 2, y + 42, 6, 40);
    }

    function drawSecretText(lines, color) {
        ctx.save();
        ctx.font = 'italic 14px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = color;
        const startY = CANVAS_H - 90;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], CANVAS_W / 2, startY + i * 22);
        }
        ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 16. UPDATE / RENDER ░░░
    // ══════════════════════════════════════════════════════
    let lastTime = 0;

    function tick(now) {
        const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
        lastTime = now;
        if (state === GameState.PLAYING) {
            update(dt);
            updateHorror(now);
        }
        updateCamera(dt);
        // Канвас НЕ рисует игру в следующих случаях:
        // - Интро ещё не пропущено
        // - Мы в главном меню (до нажатия «Шагнуть в темноту»)
        // В этих случаях — просто чёрный экран, чтобы игра не просвечивала
        if (!introDismissed || state === GameState.MENU) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        } else {
            render(now);
        }
        requestAnimationFrame(tick);
    }

    function update(dt) {
        if (trapDeathActive) return;
        let dx = 0, dy = 0;
        // Движение: ТОЛЬКО WASD (через физические коды клавиш — работает на любой раскладке)
        if (keys.has('KeyA')) dx -= 1;
        if (keys.has('KeyD')) dx += 1;
        if (keys.has('KeyW')) dy -= 1;
        if (keys.has('KeyS')) dy += 1;
        if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

        const prevCol = Math.floor(subaru.x / TILE);
        const prevRow = Math.floor(subaru.y / TILE);
        const prevX = subaru.x, prevY = subaru.y;

        tryMove(dx * subaru.speed * dt, dy * subaru.speed * dt);

        // Скорость Субару (для физики костей)
        const subVx = (subaru.x - prevX) / Math.max(dt, 0.0001);
        const subVy = (subaru.y - prevY) / Math.max(dt, 0.0001);

        const actuallyMoved = Math.hypot(subaru.x - prevX, subaru.y - prevY) > 0.08;
        if ((dx !== 0 || dy !== 0) && actuallyMoved) subaru.walkCycle += dt * 18;
        else subaru.walkCycle *= Math.pow(0.82, dt * 55);

        if (subaru.blink > 0) subaru.blink -= dt;

        // Физика костей
        for (const b of bones) {
            b.tryKick(subaru, subVx, subVy);
            b.update(dt);
        }

        // Падающая пыль (ambient)
        const now = performance.now();
        if (now > nextDustTime && state === GameState.PLAYING) {
            nextDustTime = now + 1500 + Math.random() * 4000;
            spawnDust();
        }
        for (let i = dustParticles.length - 1; i >= 0; i--) {
            const p = dustParticles[i];
            p.y += p.vy * dt;
            p.vy += 120 * dt; // gravity
            p.life -= dt;
            if (p.life <= 0) dustParticles.splice(i, 1);
        }

        const newCol = Math.floor(subaru.x / TILE);
        const newRow = Math.floor(subaru.y / TILE);

        if (newCol !== prevCol || newRow !== prevRow) {
            // Если игрок прошёл через ряд с ловушками без смерти — счётчик
            const prevTile = tileAt(prevCol, prevRow);
            if (TRAP_TYPES.has(prevTile) === false && newRow !== prevRow) {
                // Проверяем — был ли в ряду на col строке хоть один трап
                let rowHadTrap = false;
                if (newRow >= 0 && newRow < GRID_H) {
                    for (let c = 0; c < GRID_W; c++) {
                        if (TRAP_TYPES.has(tileAt(c, newRow))) { rowHadTrap = true; break; }
                    }
                }
                if (rowHadTrap) {
                    progressCounters.trapsAvoided++;
                    if (progressCounters.trapsAvoided >= 5) completeQuest('survive5');
                }
            }
            onEnterTile(newCol, newRow);
            if (!subaru.alive) return;
        }

        // Прогресс по дистанции (квесты-чек-поинты)
        checkProgressQuests();

        const dmx = subaru.x - minko.x;
        const dmy = subaru.y - minko.y;
        if (Math.hypot(dmx, dmy) < subaru.r + minko.r) win();
    }

    function spawnDust() {
        // Спавним пыль где-то в видимой области коридора
        const worldY = camY + Math.random() * CANVAS_H;
        const row = Math.floor(worldY / TILE);
        const col = 2 + Math.floor(Math.random() * 8);
        const count = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < count; i++) {
            dustParticles.push({
                x: col * TILE + TILE / 2 + (Math.random() - 0.5) * TILE * 0.6,
                y: row * TILE + (Math.random() - 0.5) * 8,
                vy: 30 + Math.random() * 40,
                life: 1.5 + Math.random() * 1.5,
                maxLife: 3,
                size: 1 + Math.random() * 1.5,
            });
        }
    }

    function render(now) {
        // Тряска экрана
        let shakeX = 0, shakeY = 0;
        if (now < screenShakeUntil) {
            const intensity = Math.max(0, (screenShakeUntil - now) / 450);
            shakeX = (Math.random() - 0.5) * 8 * intensity;
            shakeY = (Math.random() - 0.5) * 8 * intensity;
        }
        ctx.save();
        ctx.translate(shakeX, shakeY);

        drawBackdrop();

        const firstRow = Math.max(0, Math.floor(camY / TILE) - 1);
        const lastRow = Math.min(GRID_H - 1, Math.ceil((camY + CANVAS_H) / TILE) + 1);

        // Пол
        for (let r = firstRow; r <= lastRow; r++) {
            for (let c = 0; c < GRID_W; c++) {
                const t = tiles[r][c];
                if (t === T.WALL) continue;
                // Двери рисуются отдельно (над полом)
                if (t === T.DOOR_LEVER || t === T.DOOR_SEQ || t === T.DOOR_KEY) continue;
                const sx = c * TILE;
                const sy = r * TILE - camY;
                drawFloorTile(c, r, sx, sy);
            }
        }

        // Лужи крови (поверх пола)
        drawBloodPuddles();

        // Стены
        for (let r = firstRow; r <= lastRow; r++) {
            for (let c = 0; c < GRID_W; c++) {
                if (tiles[r][c] !== T.WALL) continue;
                const sx = c * TILE;
                const sy = r * TILE - camY;
                drawWallTile(c, r, sx, sy);
            }
        }

        // Свет свечей
        drawCandlelight();

        // Чит-режим: показ всех ловушек (поверх пола)
        drawTrapsReveal();

        // Двери
        for (let r = firstRow; r <= lastRow; r++) {
            const t = tiles[r][2]; // проверяем первую клетку двери
            if (t === T.DOOR_LEVER) drawDoorAt(r, door1Open, 'lever');
            else if (t === T.DOOR_SEQ) drawDoorAt(r, door2Open, 'seq');
            else if (t === T.DOOR_KEY) drawDoorAt(r, door3Open, 'key');
        }

        // Рычаг
        drawLever();

        // Ключ (если не подобран)
        drawKey();

        // Печати
        for (let r = firstRow; r <= lastRow; r++) {
            for (let c = 0; c < GRID_W; c++) {
                const t = tiles[r][c];
                if (t === T.SEQ1) drawSeqPlate(c, r, 1);
                else if (t === T.SEQ2) drawSeqPlate(c, r, 2);
                else if (t === T.SEQ3) drawSeqPlate(c, r, 3);
            }
        }

        // Кости и черепа (физические объекты — поверх пола, перед Субару)
        drawBones();

        // Падающая пыль (ambient)
        drawDust();

        // Минко
        drawMinko();

        // Субару (или эффект смерти)
        drawSubaru();

        // Тайные комнаты — шёпот-подсказка рядом
        drawSecretHint();

        // ═══ ТЕМНОТА (основной хоррор-эффект) ═══
        drawDarkness();

        // Джампскер (поверх ВСЕГО, включая темноту)
        drawJumpscare();

        // Мерцание
        drawFlicker();

        // Виньетка
        drawVignette();

        ctx.restore();
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 17. СТАРТ ИГРЫ ░░░
    // ══════════════════════════════════════════════════════
    function startGame() {
        loop = 1;
        deaths = 0;
        witchStrikes = 0;
        deathEffect = null;
        questDone.clear();
        quizUsedIndices.clear();
        progressCounters.quizCorrect = 0;
        progressCounters.trapsAvoided = 0;
        renderQuestPanel();
        loopCountEl.textContent = loop;
        deathCountEl.textContent = deaths;
        // Чистим 12-часовой штраф «Минко спит» от прошлых сессий — старт новой игры = чистый лист
        try { localStorage.removeItem('reWakeMinko_sleepUntil'); } catch (_) {}
        // Сброс чит-кода на первый
        cheatCodeIndex = 0;
        cheatBuffer.length = 0;
        revealTrapsUntil = 0;
        // LEVEL_DEF не трогаем — он уже установлен либо как дефолтный (начальная
        // загрузка), либо как рандомный (playAgain / reload-recovery / witch reset).

        minko.wake = 0;
        buildLevel();

        subaru.x = defaultSpawnX;
        subaru.y = defaultSpawnY;
        subaru.alive = true;
        subaru.blink = 1.0;
        subaru.walkCycle = 0;
        snapCameraToSubaru();

        startScreen.classList.add('hidden');
        victoryScreen.classList.add('hidden');
        deathScreen.classList.add('hidden');
        minkoDialog.classList.add('hidden');
        witchHand.classList.add('hidden');
        if (quizOverlay) quizOverlay.classList.add('hidden');
        if (quizDeathOverlay) quizDeathOverlay.classList.add('hidden');
        const secretSceneOv = document.getElementById('secretSceneOverlay');
        if (secretSceneOv) { secretSceneOv.classList.add('hidden'); secretSceneOv.classList.remove('opening','closing'); }
        stopMinkoVideo();

        statusEl.className = 'status-line';
        statusEl.textContent = 'Ты в коридоре. Запоминай безопасную дорогу — шаг за шагом.';

        // Сбросить таймеры событий
        const now = performance.now();
        nextEventTimes = {
            whisper: now + 4000,
            jumpscare: now + 18000,
            torchOut: now + 18000,
            bloodDrip: now + 6000,
            flicker: now + 20000,
            randomQuiz: now + 20000, // первый квиз через 20 сек после старта
        };
        nextDustTime = now + 3000;

        startBgMusic();
        state = GameState.PLAYING;

        // Помечаем что игра идёт — для детекции reload/back
        try { sessionStorage.setItem(SESSION_INGAME_KEY, '1'); } catch (_) {}

        // Первая подсказка через 3.5 сек после начала
        setTimeout(showNextQuestHint, 3500);
    }

    // ═══════════════════════════════════════════════════════
    // Интро-экран «Минко уснула» → потом главное меню
    // ═══════════════════════════════════════════════════════
    const introScreen = document.getElementById('introScreen');
    let introDismissed = false;
    const INTRO_MIN_WAIT = 2800; // минимум столько мс до возможности пропуска
    const introShownAt = performance.now();

    function dismissIntro() {
        if (introDismissed) return;
        // Не даём пропустить слишком рано (чтобы игрок прочитал заголовок)
        if (performance.now() - introShownAt < INTRO_MIN_WAIT) return;
        introDismissed = true;
        if (introScreen) {
            // Плавный фейд-аут
            introScreen.style.transition = 'opacity 0.6s ease-out';
            introScreen.style.opacity = '0';
            setTimeout(() => {
                introScreen.classList.add('hidden');
                startScreen.classList.remove('hidden');
            }, 620);
        } else {
            startScreen.classList.remove('hidden');
        }
    }

    // Интро пропускается ТОЛЬКО пробелом — клики/поинтер не работают
    // (клавиатурный обработчик ниже)

    // Клик на кнопку главного меню (кнопка — единственное исключение, где допустим клик)
    startBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startGame();
    });
    startBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        setTimeout(() => { if (state === GameState.MENU) startGame(); }, 80);
    });

    // Клавиатура: ПРОБЕЛ — пропуск интро / старт игры в меню
    window.addEventListener('keydown', (e) => {
        // Если фокус на поле ввода (диалог Минко) — игнорируем
        if (isTypingInInput()) return;
        const isSpace = e.code === 'Space' || e.key === ' ';
        if (!introDismissed) {
            if (isSpace) {
                dismissIntro();
                e.preventDefault();
            }
            return;
        }
        if (state === GameState.MENU && isSpace) {
            e.preventDefault();
            startGame();
        }
    });

    playAgainBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Повторная игра → всегда новая (рандомная) карта (с гарантией прохода)
        LEVEL_DEF = generateRandomLevelSafe();
        startGame();
    });

    // Кнопка «Перейти в чат к Минко» — выходит в родительское окно (если встроено в iframe)
    // или закрывает вкладку. URL чата можно настроить.
    const MINKO_CHAT_URL = '../'; // относительный путь — меняй под свой проект
    const goToChatBtn = document.getElementById('goToChatBtn');
    if (goToChatBtn) {
        goToChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Если игра встроена как iframe — сообщаем родительскому окну
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'minkoGame',
                        action: 'wakeMinko', // = победа, разбудить Минко
                    }, '*');
                    return;
                }
            } catch (_) {}
            // Пытаемся закрыть вкладку (работает только если она была открыта JS'ом)
            try { window.close(); } catch (_) {}
            // Фолбэк — редирект
            setTimeout(() => {
                try { window.location.href = MINKO_CHAT_URL; }
                catch (_) { alert('Открой Минко ИИ, чтобы продолжить разговор 💙'); }
            }, 200);
        });
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 18. ИНИЦИАЛИЗАЦИЯ ░░░
    // ══════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════
    // ░░░ ОБНАРУЖЕНИЕ ПЕРЕЗАГРУЗКИ И КНОПКА «ПОКИНУТЬ КОРИДОР» ░░░
    // ══════════════════════════════════════════════════════
    const SESSION_INGAME_KEY = 'reWakeMinko_inGame';
    const MINKO_SLEEP_KEY    = 'reWakeMinko_sleepUntil';
    const MS_12H = 12 * 60 * 60 * 1000;

    let wasInGame = false;
    try {
        wasInGame = sessionStorage.getItem(SESSION_INGAME_KEY) === '1';
    } catch (_) { /* sessionStorage может быть недоступен в file:// в каких-то браузерах */ }

    if (wasInGame) {
        // Игрок обновил/вернулся назад во время игры — карта пересоберётся
        try { sessionStorage.removeItem(SESSION_INGAME_KEY); } catch (_) {}
        LEVEL_DEF = generateRandomLevelSafe();
        // Покажем уведомление сверху на 5.5 сек
        const notice = document.getElementById('regenNotice');
        if (notice) {
            notice.classList.remove('hidden');
            setTimeout(() => notice.classList.add('hidden'), 5700);
        }
    }

    // Предупреждение при попытке закрыть/обновить вкладку во время игры
    window.addEventListener('beforeunload', (e) => {
        if (state === GameState.PLAYING || state === GameState.SECRET_REVEAL) {
            e.preventDefault();
            e.returnValue = 'Прогресс будет потерян. Карта коридора пересоберётся.';
            return e.returnValue;
        }
    });

    // Кнопка «Покинуть коридор»
    const leaveBtn = document.getElementById('leaveBtn');
    const leaveConfirm = document.getElementById('leaveConfirm');
    const leaveCancel = document.getElementById('leaveCancel');
    const leaveConfirmBtn = document.getElementById('leaveConfirmBtn');

    function openLeaveConfirm() {
        if (leaveConfirm) leaveConfirm.classList.remove('hidden');
    }
    function closeLeaveConfirm() {
        if (leaveConfirm) leaveConfirm.classList.add('hidden');
    }

    if (leaveBtn) leaveBtn.addEventListener('click', openLeaveConfirm);
    if (leaveCancel) leaveCancel.addEventListener('click', closeLeaveConfirm);
    if (leaveConfirmBtn) {
        leaveConfirmBtn.addEventListener('click', () => {
            // Минко уснёт на 12 часов
            const sleepUntil = Date.now() + MS_12H;
            try {
                localStorage.setItem(MINKO_SLEEP_KEY, String(sleepUntil));
                sessionStorage.removeItem(SESSION_INGAME_KEY);
            } catch (_) {}
            // Если игра встроена в iframe (Минко ИИ) — сообщаем родителю,
            // он закроет оверлей и применит 12-часовой штраф к чату.
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'minkoGame',
                        action: 'leaveCorridor',
                        sleepUntil,
                    }, '*');
                    return;
                }
            } catch (_) {}
            // Standalone — просто перезагружаем
            window.location.reload();
        });
    }

    /** Проверка: спит ли Минко (12-часовой штраф). Возвращает мс до пробуждения, либо 0. */
    function getMinkoSleepRemaining() {
        try {
            const until = parseInt(localStorage.getItem(MINKO_SLEEP_KEY) || '0', 10);
            if (!until) return 0;
            const remain = until - Date.now();
            if (remain <= 0) {
                localStorage.removeItem(MINKO_SLEEP_KEY);
                return 0;
            }
            return remain;
        } catch (_) { return 0; }
    }

    function formatSleepTime(ms) {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0) return `${hours} ч ${mins} мин`;
        return `${mins} мин`;
    }

    buildLevel();
    subaru.x = defaultSpawnX;
    subaru.y = defaultSpawnY;
    snapCameraToSubaru();
    attachMinkoDialogHandlers();
    attachCheatHandlers();
    requestAnimationFrame(tick);

    /** Делает клавиши в боковой панели кликабельными для пасхалки WASDDSAW. */
    function attachCheatHandlers() {
        const kbdEls = document.querySelectorAll('.controls-panel .kbd-pad-row kbd');
        kbdEls.forEach((kbd) => {
            const letter = kbd.textContent.trim().toUpperCase();
            if (!['W', 'A', 'S', 'D'].includes(letter)) return;
            kbd.style.cursor = 'pointer';
            kbd.style.userSelect = 'none';
            kbd.addEventListener('click', () => {
                // Лёгкий feedback нажатия
                kbd.classList.add('cheat-press');
                setTimeout(() => kbd.classList.remove('cheat-press'), 150);
                cheatBuffer.push(letter);
                const code = currentCheatCode();
                if (cheatBuffer.length > code.length) cheatBuffer.shift();
                if (cheatBuffer.length === code.length &&
                    cheatBuffer.every((c, i) => c === code[i])) {
                    // ПАСХАЛКА АКТИВИРОВАНА
                    revealTrapsUntil = performance.now() + 12000; // 12 секунд
                    cheatBuffer.length = 0;
                    statusEl.className = 'status-line success';
                    statusEl.textContent = `👁️ ${code.join('')}… Ты видишь ВСЕ ловушки на 12 секунд.`;
                    completeQuest('cheatHero');
                    // Переключаем код на следующий — больше этот не сработает
                    cheatCodeIndex++;
                    if (cheatCodeIndex >= CHEAT_CODES.length) {
                        // Все 3 кода использованы — больше пасхалки нет
                        setTimeout(() => {
                            if (state === GameState.PLAYING) {
                                statusEl.className = 'status-line warn';
                                statusEl.textContent = '🔒 Все секретные коды исчерпаны. Доверяй памяти.';
                            }
                        }, 12500);
                    }
                }
            });
        });
    }

    // ══════════════════════════════════════════════════════
    // ░░░ 19. АВТОМАСШТАБИРОВАНИЕ ПОД РАЗМЕР ОКНА ░░░
    // ══════════════════════════════════════════════════════
    //  Размеры известны: game-wrap 720×628 + gap 12 + controls-panel 180×628
    //  Итого scale-stage = 912×628
    const scaleStage = document.getElementById('scaleStage');
    const STAGE_W = 720 + 12 + 180; // 912
    const STAGE_H = 628;

    function fitGameToViewport() {
        if (!scaleStage) return;

        const padX = 20;
        const padY = 20;
        const availW = Math.max(320, window.innerWidth  - padX);
        const availH = Math.max(280, window.innerHeight - padY);

        const sW = availW / STAGE_W;
        const sH = availH / STAGE_H;
        let scale = Math.min(sW, sH);

        // Кламп: от 0.4× до 1.4×
        scale = Math.min(1.4, Math.max(0.4, scale));

        scaleStage.style.transform = `scale(${scale})`;
    }

    let resizeTimer = null;
    function scheduleFit() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fitGameToViewport, 40);
    }

    window.addEventListener('resize', scheduleFit);
    window.addEventListener('orientationchange', fitGameToViewport);
    window.addEventListener('load', fitGameToViewport);

    fitGameToViewport();
    setTimeout(fitGameToViewport, 100);
})();

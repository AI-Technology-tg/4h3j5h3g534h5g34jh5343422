/**
 * ReminkoBoot — только очередь стадий загрузки.
 * Не содержит бизнес-логики: модули регистрируют колбэки, стадии запускаются по событиям paint/loader/idle.
 *
 * Stages: Critical → FirstPaint → Interactive → Idle
 */
(function (global) {
    'use strict';

    if (global.ReminkoBoot) return;

    var STAGES = ['Critical', 'FirstPaint', 'Interactive', 'Idle'];
    var queues = {
        Critical: [],
        FirstPaint: [],
        Interactive: [],
        Idle: []
    };
    var done = {
        Critical: false,
        FirstPaint: false,
        Interactive: false,
        Idle: false
    };
    var started = false;
    var firstPaintArmed = false;
    var interactiveArmed = false;

    function runQueue(stage) {
        if (done[stage]) return;
        done[stage] = true;
        var list = queues[stage].slice();
        queues[stage].length = 0;
        for (var i = 0; i < list.length; i++) {
            try {
                list[i]();
            } catch (e) {
                console.warn('[ReminkoBoot]', stage, e);
            }
        }
    }

    function on(stage, fn) {
        if (typeof fn !== 'function') return;
        if (STAGES.indexOf(stage) === -1) stage = 'Idle';
        if (done[stage]) {
            try {
                fn();
            } catch (e) {
                console.warn('[ReminkoBoot]', stage, e);
            }
            return;
        }
        queues[stage].push(fn);
    }

    function afterPaint(cb) {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function () {
                requestAnimationFrame(cb);
            });
        } else {
            setTimeout(cb, 0);
        }
    }

    function scheduleIdle(cb, timeoutMs) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(
                function () {
                    cb();
                },
                { timeout: timeoutMs || 3500 }
            );
        } else {
            setTimeout(cb, Math.min(timeoutMs || 3500, 1200));
        }
    }

    function armInteractive() {
        if (interactiveArmed) return;
        interactiveArmed = true;
        afterPaint(function () {
            runQueue('Interactive');
            scheduleIdle(function () {
                runQueue('Idle');
            }, 3500);
        });
    }

    function armFirstPaint() {
        if (firstPaintArmed) return;
        firstPaintArmed = true;
        afterPaint(function () {
            runQueue('FirstPaint');

            if (
                document.body &&
                (document.body.classList.contains('reminko-content-revealed') ||
                    document.body.classList.contains('reminko-loading-dismissed'))
            ) {
                armInteractive();
                return;
            }

            var onHidden = function () {
                window.removeEventListener('reminko:loading-screen-hidden', onHidden);
                armInteractive();
            };
            window.addEventListener('reminko:loading-screen-hidden', onHidden);
            // Страховка: не блокировать Interactive навсегда
            setTimeout(armInteractive, 2500);
        });
    }

    function start() {
        if (started) return;
        started = true;

        runQueue('Critical');

        window.addEventListener('reminko:navigation-applied', armFirstPaint, { once: true });

        if (document.readyState === 'loading') {
            document.addEventListener(
                'DOMContentLoaded',
                function () {
                    // Дать apply-navigation шанс на том же тике; иначе FirstPaint всё равно подстрахуется
                    setTimeout(armFirstPaint, 0);
                },
                { once: true }
            );
        } else {
            setTimeout(armFirstPaint, 0);
        }

        // Абсолютный fallback
        setTimeout(armFirstPaint, 4000);
    }

    global.ReminkoBoot = {
        on: on,
        start: start,
        stages: STAGES,
        isDone: function (stage) {
            return !!done[stage];
        }
    };

    start();
})(typeof window !== 'undefined' ? window : globalThis);

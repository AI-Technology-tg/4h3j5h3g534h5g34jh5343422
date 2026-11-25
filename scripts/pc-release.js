(function () {
    'use strict';

    var OPEN_AT = Date.parse('2026-12-12T00:00:00+01:00');
    var FILE = 'https://api.re-minko-anime.com/data/installers/Re-Minko-Installer.exe';

    function ru(n, one, few, many) {
        var abs = Math.abs(n) % 100;
        var last = abs % 10;
        if (abs >= 11 && abs <= 14) return many;
        if (last === 1) return one;
        if (last >= 2 && last <= 4) return few;
        return many;
    }

    function setText(name, value) {
        var node = document.querySelector('[data-pc="' + name + '"]');
        if (node) node.textContent = String(value);
    }

    function setLabel(name, text) {
        var node = document.querySelector('[data-pc-label="' + name + '"]');
        if (node) node.textContent = text;
    }

    function openDownload(btn, note, timer) {
        btn.href = FILE;
        btn.removeAttribute('aria-disabled');
        btn.classList.remove('is-disabled');
        btn.tabIndex = 0;
        btn.textContent = 'Скачать';
        if (note) note.textContent = 'Файл установщика для Windows.';
        if (timer) timer.hidden = true;
    }

    function tick() {
        var btn = document.getElementById('pcDownloadBtn');
        var note = document.getElementById('pcDownloadNote');
        var timer = document.getElementById('pcReleaseTimer');
        if (!btn) return;

        var left = OPEN_AT - Date.now();
        if (left <= 0) {
            openDownload(btn, note, timer);
            return;
        }

        var total = Math.floor(left / 1000);
        var days = Math.floor(total / 86400);
        var hours = Math.floor((total % 86400) / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        var seconds = total % 60;

        setText('days', days);
        setText('hours', hours);
        setText('minutes', minutes);
        setText('seconds', seconds);
        setLabel('days', ru(days, 'день', 'дня', 'дней'));
        setLabel('hours', ru(hours, 'час', 'часа', 'часов'));
        setLabel('minutes', ru(minutes, 'минута', 'минуты', 'минут'));
        setLabel('seconds', ru(seconds, 'секунда', 'секунды', 'секунд'));
    }

    function start() {
        var btn = document.getElementById('pcDownloadBtn');
        if (!btn) return;
        btn.addEventListener('click', function (event) {
            if (btn.getAttribute('aria-disabled') === 'true') event.preventDefault();
        });
        tick();
        window.setInterval(tick, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

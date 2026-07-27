'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadUtilsHelpers() {
    const full = fs.readFileSync(
        path.join(__dirname, '..', '..', 'scripts', 'utils.js'),
        'utf8'
    );
    const endMarker = 'window.reminkoSafeCssUrl = reminkoSafeCssUrl;';
    const end = full.indexOf(endMarker);
    if (end < 0) {
        throw new Error('Could not locate reminkoSafeCssUrl export in utils.js');
    }
    const code = `${full.slice(0, end + endMarker.length)}\n`;

    const window = {
        location: { origin: 'http://127.0.0.1', href: 'http://127.0.0.1/' }
    };
    window.window = window;

    const context = vm.createContext({
        window,
        console,
        URL,
        encodeURIComponent,
        decodeURIComponent
    });
    vm.runInContext(code, context);

    return {
        reminkoEscapeHtml: window.reminkoEscapeHtml,
        reminkoSafeImageUrl: window.reminkoSafeImageUrl,
        reminkoSafeCssUrl: window.reminkoSafeCssUrl,
        reminkoResolveAssetUrl: window.reminkoResolveAssetUrl
    };
}

module.exports = { loadUtilsHelpers };

/**
 * Убирает html.reminko-mobile-preview из @media (max-width: 900px) —
 * мобильные стили применяются ко всем узким экранам.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FILES = [
    'styles/main.css',
    'styles/catalog.css',
    'styles/live2d-widget.css'
];

function transformBlock(block) {
    let s = block;
    s = s.replace(/html\.reminko-mobile-preview body/g, 'body');
    s = s.replace(/html\.reminko-mobile-preview:/g, 'html:');
    s = s.replace(/html\.reminko-mobile-preview,/g, 'html,');
    s = s.replace(/html\.reminko-mobile-preview \{/g, 'html {');
    s = s.replace(/html\.reminko-mobile-preview /g, '');
    s = s.replace(/html\.reminko-mobile-preview/g, 'html');
    return s;
}

function transformFile(relPath) {
    const filePath = path.join(ROOT, relPath);
    const css = fs.readFileSync(filePath, 'utf8');
    const re = /@media\s*\(\s*max-width:\s*900px\s*\)\s*\{/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(css)) !== null) {
        out += css.slice(last, m.index);
        const start = m.index + m[0].length;
        let depth = 1;
        let i = start;
        while (i < css.length && depth > 0) {
            if (css[i] === '{') depth++;
            else if (css[i] === '}') depth--;
            i++;
        }
        const header = css.slice(m.index, start);
        const body = css.slice(start, i - 1);
        const footer = css.slice(i - 1, i);
        out += header + transformBlock(body) + footer;
        last = i;
    }
    out += css.slice(last);
    const before = (css.match(/reminko-mobile-preview/g) || []).length;
    const after = (out.match(/reminko-mobile-preview/g) || []).length;
    fs.writeFileSync(filePath, out);
    console.log(`${relPath}: ${before} -> ${after} preview refs`);
}

FILES.forEach(transformFile);

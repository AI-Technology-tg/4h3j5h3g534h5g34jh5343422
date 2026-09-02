#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUTPUT = path.join(ROOT, 'public-build');
/** Сайт закрыт: в public-build только заглушка. Чтобы открыть — поставь false. */
const SITE_CLOSED = true;
const PUBLIC_DATA_FILES = [
    'kodik-anime-catalog.json',
    'kodik-announced.json',
    'kodik-calendar.json',
    'kodik-home-strips.json',
    'remanga-manga-catalog.json'
];
const ROOT_PUBLIC_FILES = [
    '_headers',
    'ads.txt',
    'assetlinks.json',
    '.well-known/assetlinks.json',
    'config.local.stub.js',
    'favicon.ico',
    'googled5f0682df83b4e0e.html',
    'kodik.txt',
    'llms.txt',
    'robots.txt',
    'sitemap.xml',
    'yandex_7826d5f9bd1db2e7.html'
];
const MEDIA_EXTENSIONS = new Set([
    '.css',
    '.gif',
    '.html',
    '.ico',
    '.jpeg',
    '.jpg',
    '.js',
    '.mp3',
    '.mp4',
    '.png',
    '.svg',
    '.webm',
    '.webmanifest',
    '.webp'
]);

function ensureInside(base, candidate) {
    const relative = path.relative(base, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Path escapes build root: ${candidate}`);
    }
}

function copyFile(relativePath) {
    const source = path.join(ROOT, relativePath);
    const target = path.join(OUTPUT, relativePath);
    ensureInside(ROOT, source);
    ensureInside(OUTPUT, target);
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Public source must be a regular file: ${relativePath}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function copyTree(relativeDirectory, allowFile) {
    const sourceRoot = path.join(ROOT, relativeDirectory);
    const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const source = path.join(directory, entry.name);
            const relative = path.relative(ROOT, source);
            if (entry.isSymbolicLink()) {
                throw new Error(`Symlinks are not allowed in public assets: ${relative}`);
            }
            if (entry.isDirectory()) {
                visit(source);
            } else if (entry.isFile() && allowFile(source, relative)) {
                copyFile(relative);
            }
        }
    };
    visit(sourceRoot);
}

function walkFiles(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(absolute));
        else if (entry.isFile()) files.push(absolute);
    }
    return files;
}

function publicRelative(absolute) {
    return path.relative(OUTPUT, absolute).split(path.sep).join('/');
}

function resolvePublicReference(ownerFile, rawReference) {
    const raw = String(rawReference || '').trim();
    if (
        !raw ||
        raw.startsWith('#') ||
        raw.startsWith('//') ||
        /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
        raw.includes('${')
    ) {
        return null;
    }

    const clean = raw.split(/[?#]/, 1)[0];
    if (!clean || clean.startsWith('/.netlify/') || clean === '/chat' || clean.startsWith('/r/')) {
        return null;
    }

    let decoded;
    try {
        decoded = decodeURIComponent(clean);
    } catch (_) {
        decoded = clean;
    }
    const relativeOwner = publicRelative(ownerFile);
    let target = decoded.startsWith('/')
        ? path.join(OUTPUT, decoded.replace(/^\/+/, ''))
        : path.resolve(path.dirname(ownerFile), decoded);
    ensureInside(OUTPUT, target);
    if (decoded.endsWith('/')) target = path.join(target, 'index.html');
    if (publicRelative(target) === 'config.local.js') {
        target = path.join(OUTPUT, 'config.local.stub.js');
    }
    return { owner: relativeOwner, reference: raw, target };
}

function verifyReferences(files) {
    const missing = [];
    for (const file of files) {
        const extension = path.extname(file).toLowerCase();
        if (extension !== '.html' && extension !== '.css') continue;
        const source = fs.readFileSync(file, 'utf8');
        const references = [];
        if (extension === '.html') {
            const attributePattern = /\b(?:href|poster|src)\s*=\s*["']([^"']+)["']/gi;
            for (const match of source.matchAll(attributePattern)) references.push(match[1]);
        } else {
            const cssPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
            for (const match of source.matchAll(cssPattern)) references.push(match[1]);
        }

        for (const reference of references) {
            const resolved = resolvePublicReference(file, reference);
            if (resolved && !fs.existsSync(resolved.target)) {
                missing.push(
                    `${resolved.owner}: ${resolved.reference} -> ${publicRelative(resolved.target)}`
                );
            }
        }
    }
    if (missing.length) {
        throw new Error(`Missing public assets:\n${missing.slice(0, 30).join('\n')}`);
    }
}

function verifyIsolation(files) {
    const forbiddenPrefixes = [
        '.cursor/',
        '.git/',
        '.github/',
        'email-templates/',
        'local/',
        'minko-netlify-proxy/',
        'netlify/',
        'node_modules/',
        'sql/',
        'supabase/',
        'tests/'
    ];
    const forbiddenExtensions = new Set([
        '.bat',
        '.lock',
        '.md',
        '.ps1',
        '.sql',
        '.toml',
        '.yaml',
        '.yml'
    ]);
    const violations = files
        .map(publicRelative)
        .filter(
            (relative) =>
                forbiddenPrefixes.some((prefix) => relative.startsWith(prefix)) ||
                forbiddenExtensions.has(path.extname(relative).toLowerCase()) ||
                relative === 'package.json'
        );
    if (violations.length) {
        throw new Error(`Private files entered public build:\n${violations.join('\n')}`);
    }
}

function writeClosedBuild() {
    fs.rmSync(OUTPUT, { recursive: true, force: true });
    fs.mkdirSync(OUTPUT, { recursive: true });

    const html = fs.readFileSync(path.join(ROOT, 'site-closed.html'), 'utf8');
    fs.writeFileSync(path.join(OUTPUT, 'index.html'), html);
    fs.writeFileSync(path.join(OUTPUT, '404.html'), html);
    fs.writeFileSync(path.join(OUTPUT, 'site-closed.html'), html);

    fs.mkdirSync(path.join(OUTPUT, 'scripts'), { recursive: true });
    copyFile('scripts/desktop-only-guard.js');

    fs.writeFileSync(path.join(OUTPUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
    fs.writeFileSync(
        path.join(OUTPUT, '_headers'),
        [
            '/*',
            '  Cache-Control: no-store, no-cache, must-revalidate',
            '  X-Robots-Tag: noindex, nofollow, noarchive',
            '  X-Content-Type-Options: nosniff',
            '  X-Frame-Options: SAMEORIGIN',
            '  Referrer-Policy: strict-origin-when-cross-origin',
            '',
            '/scripts/desktop-only-guard.js',
            '  Cache-Control: public, max-age=0, must-revalidate',
            ''
        ].join('\n')
    );

    for (const relative of ['favicon.ico', 'googled5f0682df83b4e0e.html', 'yandex_7826d5f9bd1db2e7.html']) {
        if (fs.existsSync(path.join(ROOT, relative))) copyFile(relative);
    }

    const files = walkFiles(OUTPUT);
    verifyIsolation(files);
    console.log(`[public-build] SITE CLOSED: ${files.length} files written to ${path.relative(ROOT, OUTPUT)}`);
}

function main() {
    if (SITE_CLOSED) {
        writeClosedBuild();
        return;
    }

    fs.rmSync(OUTPUT, { recursive: true, force: true });
    fs.mkdirSync(OUTPUT, { recursive: true });

    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.html')) copyFile(entry.name);
    }
    ROOT_PUBLIC_FILES.forEach(copyFile);
    PUBLIC_DATA_FILES.forEach((name) => copyFile(path.join('data', name)));

    copyTree('anime', (source) => path.extname(source).toLowerCase() === '.html');
    copyTree('catalog', (source) => path.extname(source).toLowerCase() === '.html');
    copyTree('manga', (source) => path.extname(source).toLowerCase() === '.html');
    copyTree('styles', (source) => path.extname(source).toLowerCase() === '.css');
    copyTree('sound', (source) => path.extname(source).toLowerCase() === '.mp3');
    copyTree('Fons', (source) => MEDIA_EXTENSIONS.has(path.extname(source).toLowerCase()));
    copyTree('Mini Game Minko', (source) =>
        MEDIA_EXTENSIONS.has(path.extname(source).toLowerCase())
    );
    copyTree('scripts', (source, relative) => {
        const normalized = relative.split(path.sep).join('/');
        return (
            path.extname(source).toLowerCase() === '.js' &&
            !normalized.startsWith('scripts/build/') &&
            !normalized.startsWith('scripts/automation/')
        );
    });

    const files = walkFiles(OUTPUT);
    verifyIsolation(files);
    verifyReferences(files);
    console.log(`[public-build] ${files.length} files written to ${path.relative(ROOT, OUTPUT)}`);
}

main();

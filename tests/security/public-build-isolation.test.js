'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUTPUT = path.join(ROOT, 'public-build');

const FORBIDDEN_PREFIXES = [
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

const FORBIDDEN_EXTENSIONS = new Set([
    '.bat',
    '.lock',
    '.md',
    '.ps1',
    '.sql',
    '.toml',
    '.yaml',
    '.yml'
]);

function walk(dir, base = dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(absolute, base, out);
        else out.push(path.relative(base, absolute).split(path.sep).join('/'));
    }
    return out;
}

describe('public-build isolation', () => {
    before(() => {
        const result = spawnSync(process.execPath, ['scripts/build/build-public.js'], {
            cwd: ROOT,
            encoding: 'utf8'
        });
        assert.equal(result.status, 0, result.stderr || result.stdout);
    });

    it('does not publish private prefixes or extensions', () => {
        assert.ok(fs.existsSync(OUTPUT), 'public-build missing');
        const files = walk(OUTPUT);
        const closed = fs.existsSync(path.join(OUTPUT, 'site-closed.html')) &&
            !fs.existsSync(path.join(OUTPUT, 'catalog/anime.html'));
        if (closed) {
            assert.ok(files.length >= 3, `expected closed public-build, got ${files.length}`);
        } else {
            assert.ok(files.length > 50, `expected populated public-build, got ${files.length}`);
        }

        const violations = files.filter(
            (relative) =>
                FORBIDDEN_PREFIXES.some((prefix) => relative.startsWith(prefix)) ||
                FORBIDDEN_EXTENSIONS.has(path.extname(relative).toLowerCase()) ||
                relative === 'package.json' ||
                relative === 'SECURITY_HARDENING_CHECKPOINT.md' ||
                relative.endsWith('database.sql')
        );
        assert.deepEqual(violations, []);
    });

    it('publishes key public routes and assets', () => {
        const closed = fs.existsSync(path.join(OUTPUT, 'site-closed.html')) &&
            !fs.existsSync(path.join(OUTPUT, 'catalog/anime.html'));
        const expected = closed
            ? ['index.html', 'site-closed.html', '404.html', '_headers', 'scripts/desktop-only-guard.js']
            : ['index.html', 'catalog/anime.html', '_headers', 'scripts/utils.js', 'styles/main.css'];
        for (const relative of expected) {
            assert.ok(
                fs.existsSync(path.join(OUTPUT, relative)),
                `missing public file: ${relative}`
            );
        }
        if (closed) {
            const html = fs.readFileSync(path.join(OUTPUT, 'index.html'), 'utf8');
            assert.match(html, /Глобальное обновление/);
            assert.ok(!fs.existsSync(path.join(OUTPUT, 'styles/main.css')));
            assert.ok(!fs.existsSync(path.join(OUTPUT, 'scripts/home.js')));
        }
    });
});

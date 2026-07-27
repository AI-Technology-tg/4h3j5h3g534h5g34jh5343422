# Security hardening checkpoint — 2026-07-27

## Git state

- WIP branch: `wip/security-hardening-20260727`
- Base commit: `5dbd3e2`
- WIP snapshot commit: `544604a`
- Production incident fix at the base is already deployed.
- Everything after the base is unfinished WIP: it has not been applied to Supabase, tested, reviewed, merged into `main`, or deployed.

## Exact stopping point

Stage 8 complete on WIP: security regression tests + negative Supabase permission probes + CSS URL escape fix.

Previous stages 1–7 remain as documented below; pending SQL still **not** applied.

## Implemented locally so far

- Drafted `sql/pending/20260727_security_observability_and_access_hardening.sql`.
  - `security_events` and `security_rate_limits`.
  - Database audit triggers and creator-only summaries.
  - Safer profile directory and protected profile fields.
  - Hardening for DMs, group DMs, friends, notifications, chat, Watch Together, analytics, giveaway and avatar quota.
- Added Netlify security helpers/endpoints:
  - `_security.js`
  - `security-ingest.js`
  - `security-csp-report.js`
  - `security-events-read.js`
  - `site-visit-ingest.js`
- Added browser security telemetry in `scripts/security-monitor.js`.
- Redirected site analytics from direct browser DB inserts to the server endpoint.
- Started hardening:
  - profile reads and XSS sinks;
  - navigation search XSS;
  - Watch Together creation/join through server-validated RPC;
  - `postMessage` origin/source validation;
  - Minko chat distributed rate limiting and research-context filtering;
  - atomic AI-avatar reservations;
  - Kodik, Alloha, Shikimori, ReManga and giveaway proxies.

## Critical warnings

1. Do **not** merge this branch into `main` yet.
2. The pending SQL is large and has not been syntax-tested or applied.
3. The new serverless functions call RPCs that do not exist until the migration is applied.
4. Applying the migration before deploying compatible frontend/serverless code can temporarily break profiles, analytics and Watch Together.
5. `security_events` and `security_rate_limits` must be added to the `_allowed` list in `database.sql` before final synchronization.
6. `SECURITY_LOG_SALT` still needs to be configured in Netlify.
7. `node --check` passed for all changed JavaScript files and `git diff --check` passed. ESLint, Playwright, negative DB tests, SQL validation and final Security Review have not been run.

## Next work, strictly in small stages

1. Inspect this branch and run syntax/lint checks first; fix errors without expanding scope.
2. Review and split/clean the pending SQL if useful; verify every table/column/function against live Supabase.
3. Finish confirmed frontend XSS fixes, especially catalog, manga, home friend badge, avatar/image URLs and remaining unsafe `innerHTML`.
4. Finish serverless hardening and review every Netlify function for auth, rate limits, input size, output size, SSRF and secret-safe logs.
5. Change Netlify publishing from repository root to a clean public build directory so SQL, tests and backend sources are not public.
6. Add enforceable baseline CSP plus CSP Report-Only telemetry without breaking current inline code/providers.
7. Review npm dependency changes and remaining audit findings; do not use a breaking forced upgrade blindly.
8. ~~Add security regression tests and negative Supabase permission tests.~~ **Done** (`npm run test:security`, `npm run test:security:playwright`).
9. Run the dedicated Security Review on the final diff and fix findings.
10. Coordinate deployment:
    - prepare compatible frontend/serverless;
    - apply the pending migration through Supabase MCP;
    - immediately deploy compatible code;
    - verify production;
    - merge to `main`;
    - integrate migration into `database.sql`;
    - remove the pending SQL according to the database workflow.

## User requirement

Continue in explicit stages. After each stage, report:

- what was checked;
- what changed;
- what was verified;
- what remains;

and wait for the user's “продолжай” before beginning the next stage.


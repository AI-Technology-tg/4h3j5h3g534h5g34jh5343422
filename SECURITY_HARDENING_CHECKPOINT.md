# Security hardening checkpoint — 2026-07-27

## Git / production state

- Branch: `wip/security-hardening-20260727` (merged into `origin/main`)
- Latest production push: includes security hardening + catalog merge
- Supabase migrations applied:
  - `security_observability_and_access_hardening`
  - `security_trigger_function_grants`
  - `profile_directory_security_invoker`
- Pending SQL for this task: removed after sync into `database.sql`

## Verified in production

- Public routes serve 200; private paths (`/database.sql`, `/package.json`, pending SQL) return 404
- CSP enforce + Report-Only headers are live
- `security-csp-report` accepts valid reports (`204`) and writes to `security_events`
- Anon cannot read `security_events` / privileged tables; DM anon select is denied

## Remaining ops note

- Netlify CLI was not authenticated in this environment, so `SECURITY_LOG_SALT` was not set via CLI.
  Functions fall back to `GIVEAWAY_IP_SALT` / service role when present; set a dedicated `SECURITY_LOG_SALT` in Netlify env when convenient.
- Supabase Advisor still reports expected WARN for intentional authenticated SECURITY DEFINER RPCs (`wt_*`, `security_event_summary`, etc.) and the project-wide anonymous sign-in setting.

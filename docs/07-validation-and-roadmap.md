# Validation and Roadmap

English | [简体中文](07-validation-and-roadmap.zh-CN.md)

Baseline: prod1.0, October 13, 2026. Record actual execution results in the [release notes](../releases/prod1.0.md), never planned checks as passes.

## Validation Layers

| Layer | Entry Point | Focus |
| --- | --- | --- |
| Repository consistency | `npm --prefix web run repo:check` | Documentation links, versions, active assets, high-risk private paths, and client boundaries |
| Types and unit/contract tests | `npm --prefix web run check` | Rules, permissions, concurrency, deduplication, SQLite/PostgreSQL, narration, and recovery |
| Production build | `npm --prefix web run build` | Full Node runtime and static asset packaging |
| Local HTTP | `npm --prefix web run smoke` | Independent sessions, last-seat races, and recovery across a real service restart |
| Browser regression | `npm --prefix web run test:ui` | Chromium/WebKit flows, private panels, audio, and responsive layouts |
| Temporary review | `node --test scripts/ui-review/review.test.mjs` | Fixtures and API isolation; use the review configuration for browsers |
| Partial live checks | `web/scripts/deployment-api-smoke.mjs`, cloud configuration | Actual TLS, cookies, permissions, assets, and short workflows |
| Real-time complete game | Explicitly enabled production configuration | Independent sessions, nights, first-night election, Hunter, recap, and rematch |

Local PostgreSQL contracts use the real PGlite SQL engine and pg driver, not a Supabase production load test. Cloud QA may remove only the specific Cloud QA rooms listed in that run's report; never delete whole tables.

Some local complete-game tests use isolated SQLite with shortened action windows. They are not normal-timing cloud games. Artificial WebKit lifecycle tests use the supported keepalive fallback. Known WebKit cancellation diagnostics are recorded separately only during explicit document replacement and only for this test room's local same-origin reads. Errors during play or at other addresses still fail the test. CORS and server Origin checks stay enabled. See [Playwright #43120](https://github.com/microsoft/playwright/issues/43120).

## Security Gate

Scan Git history and release candidates for credentials, audit locked dependencies, and check private-table RLS/permissions, client bundles, and deployment packages. Record residual risks and unverified scope in the security report. No warnings is not proof of absolute security.

## Priorities

1. Real iOS Safari and Android Chrome: speakers, foreground/background transitions, calls, Bluetooth, low battery, and Wake Lock.
2. Real gatherings: first-time organizer understanding, host workload, single-screen actions, and role composition.
3. Independent online agent playtests, clearly distinguished from scripted multi-session simulations.
4. Decide whether a native host is needed from feedback; do not promise continuous browser background hosting in advance.

Do not add login/CAPTCHA, remote matchmaking, or Sheriff records without reconfirming product scope.

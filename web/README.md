# Web Application

English | [简体中文](README.zh-CN.md)

prod1.0, package 1.0.0. See the [repository README](../README.md) for setup and product details, [rules](../docs/02-rules-and-decisions.md) for gameplay, and [deployment guide](../docs/19-cloud-deployment.md) for environments and production release.

Repository documentation is bilingual with English as the default. The app UI, game flow, and narration remain Chinese.

## Run From This Directory

Use Node.js 24.14.1 or a newer 24.x release:

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

The default local backend is SQLite; no cloud account or voice model is needed. Data lives in ignored `.data/rooms.sqlite`. Non-localhost access requires an exact `WEREWOLF_ORIGIN`.

```sh
npm run repo:check
npm run check
npm run build
npm run smoke
npx playwright install chromium webkit
npm run test:ui
```

Smoke tests and default browser configurations launch isolated local services. Do not supply production PostgreSQL settings. Local tests are not real-phone or cloud acceptance.

## Modules

- `src/game/`: the single rules, phases, random dealing, and command core.
- `src/server/`: sessions, permissions, deduplication, public/private/host views, SQLite/PG storage, and private usage summaries.
- `src/narration/`: V7 scripts, asset fingerprints, and the public Web Audio player.
- `src/ui/`: responsive pages, private panels, foreground synchronization, and recovery.
- `tests/`: rules, contracts, permissions, audio, and browser checks.

Online deployments must use private PostgreSQL configuration, never client database credentials or SQLite fallback. Health: `/api/health`; business API: `/api/v2`. Pushing a candidate does not promote the production domain.

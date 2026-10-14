# Temporary Local UI Review

English | [简体中文](README.zh-CN.md)

This tool assembles representative states of the real current components for interface annotation. It is not a new game entry point or another ruleset. It listens only locally, defaults to `http://127.0.0.1:3010/`, and reuses the local app on port 3000.

## Usage

```sh
node scripts/ui-review/start.mjs
node scripts/ui-review/start.mjs --stop
```

If the app is not running, first start `npm run dev -- --hostname 127.0.0.1 --port 3000` in `web/`. Review does not stop or replace that app. If its default port is busy, review searches upward from 3010; use the actual URL printed at startup. `UI_REVIEW_UPSTREAM` can select another local app address, but external URLs and embedded credentials are rejected.

Previous/next arrows or the dropdown switch scenes; phone/desktop buttons switch canvas size; reset restores the current fixture. S01 through S14 identify scenes. URL parameters `scene` and `mode` locate an annotation, for example `/?scene=S07&mode=phone`. Use the existing annotation workflow; this tool adds no comment account or storage system.

| Scenes | Examples |
| --- | --- |
| S01-S03 | Creation, joining, and lobby readiness |
| S04 | Witch identity card with a large portrait |
| S05-S09 | Guard, wolf discussion waiting, Witch potions, Seer records, and Hunter shooting |
| S10-S12 | Host voting draft, public daytime roster, and pause/recovery |
| S13-S14 | Victory and recap |

## Isolation Boundaries

- UI and assets come from the real local app, without copying product components. The separate review service answers every game API call with fixed fixtures, never forwarding API requests to the app. Unknown rooms and other paths are rejected.
- Roles, seats, game IDs, recaps, and some interactions are examples. Only the review canvas freezes timers for annotation; it does not implement full progression or resolution.
- Never mint or rewrite `ww_session`. Strip Cookie and Authorization when forwarding pages/assets and strip upstream Set-Cookie, preventing localhost cross-port cookie sharing from affecting real sessions.
- Text mode is the silent default. Manual sound tests load only local public audio; game calls remain mocked.
- The original app and port 3000 are unchanged. There are no database connections, real room writes, cloud configuration, or production deployment. The tool stays outside the product directory and adds no Next.js routes.
- Logs, stop credentials, and process records stay in ignored `.local-generation/ui-review/`. The stop command shuts down only this review service.

## Validation

```sh
node --test scripts/ui-review/review.test.mjs
cd web
npx tsc --noEmit
npm run lint
npx playwright test --config playwright.review.config.ts
```

prod1.0 includes eight local service tests for fixtures, cookie isolation, non-forwarded APIs, reset, unknown rooms, external-origin rejection, highest-count wolf examples, and required targets. Review offers neither skipped wolf kills nor skipped Seer inspections. Tie fixtures use a stable choice for inspection; core tests cover actual randomness. Browser tests can inspect all 14 interfaces at phone/desktop sizes. Screenshots remain local; prior review results are not new acceptance.

The review canvas hides the local Next.js development badge so it cannot obscure seats or readiness. Product development settings, production UI, and room data are unchanged.

Initial screenshots caught a new heading briefly appearing over the previous scene. Readiness and scene-key checks were added, then creation-form property readiness was corrected and all cases rerun without weaker assertions. This validates the temporary review tool, not a complete game, real-phone audio, or a production release.

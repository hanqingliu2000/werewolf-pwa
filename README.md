# Werewolf Auto Host | Free Web-Based Moderator

English | [简体中文](README.zh-CN.md)

**Everyone gets a role. Nobody has to sit out as the moderator.**

A free, Chinese-language Werewolf assistant for in-person gatherings of 8-12 friends. Open it in a phone browser: no app download, account, or registration. The room host can play too.

The app handles role assignment, secret night actions, Chinese voice narration, resolution, and recaps. Discussion, elections, voting, and last words stay around your table. This is an in-person game assistant, not an online matchmaking or voice-chat platform.

**[Play Now](https://werewolf-web-v2.vercel.app/)** | [Listen to the Host](https://werewolf-web-v2.vercel.app/audio/host-zh-v7/index.html)

**Documentation is available in English and Simplified Chinese. The interface, game flow, and voice narration remain in Chinese.** English documentation does not add an English gameplay mode.

Built for friend groups, campus clubs, and small tabletop gatherings. The developer has hosted real 9- and 10-player games with friends, with no obvious player-side usability issues reported. First-time hosting by an independent organizer still needs validation. Share real-world feedback through [Issues](https://github.com/hanqingliu2000/werewolf-pwa/issues).

**First formal release: prod1.0** | Package `1.0.0` | Rules `werewolf-web-v1` | Audio `host-zh-v7`

[Live App](https://werewolf-web-v2.vercel.app/) | [Voice Samples](https://werewolf-web-v2.vercel.app/audio/host-zh-v7/index.html) | [GitHub Release](https://github.com/hanqingliu2000/werewolf-pwa/releases/tag/prod1.0) | [Release Notes](releases/prod1.0.md) | [Documentation](docs/README.md) | [Security](SECURITY.md)

## Contents

- [Features](#features)
- [Start a Game](#start-a-game)
- [Rules at a Glance](#rules-at-a-glance)
- [Local Development](#local-development)
- [Checks and Tests](#checks-and-tests)
- [Architecture](#architecture)
- [Deployment and Configuration](#deployment-and-configuration)
- [Data and Security](#data-and-security)
- [Artwork and Audio](#artwork-and-audio)
- [Limitations and FAQ](#limitations-and-faq)
- [Maintenance and Contributions](#maintenance-and-contributions)
- [Licensing and Sources](#licensing-and-sources)

## Features

- Mobile-first responsive website, also usable on desktop. No installation or account required.
- Create, share, join, ready up, rename, and change seats. Hosts can remove other players only before a game starts.
- Random assignment across six roles. Identities stay concealed by default; viewing is optional, with no identity-confirmation step.
- Text hosting or calm Chinese voice narration. Sound checks are optional; default 1.5x and optional 2x audio preserve pitch.
- Eligible action panels open automatically in the foreground, with compact targets and private completion feedback.
- Wolf voting uses the highest vote count, with persisted random tie-breaking, teammate visibility, and previous kill targets.
- First-night Sheriff election before night results. The app moderates the procedure without recording the Sheriff or vote weight.
- Server-authoritative state, concurrency handling, request deduplication, original-browser refresh recovery, and automatic system-interruption recovery.
- Participant-only post-game recaps and another game with the same seats.

## Start a Game

1. The host enters a nickname, player count, role composition, and victory mode, then shares the room link, QR code, or room code.
2. Everyone joins in their own browser and manually readies up. The host deals roles once the room is full and all players are ready.
3. Players may privately view their roles; individual identity confirmation is not required. The host chooses text or voice hosting, with no mandatory sound check.
4. After the dealing announcement, the host starts the first night. Follow the narration and private action panel; confirmed actions show only the results that player may know.
5. After the first night, keep eyes closed for candidacy by raised hands, then open eyes for Sheriff speeches and an offline vote. The host advances the election; night results follow only after it finishes.
6. Discuss and vote in person. The host enters, confirms, and publishes the elimination. The system handles any Hunter reaction and victory check.
7. View the recap or ready up for another game with the same seats. Organize last words in person.

The host is also a player. Organizational controls do not reveal other players' roles, and an eliminated host can continue moderating. Public narration plays only on the host's device; keep that page visible and the screen awake.

## Rules at a Glance

See the [complete rules](docs/02-rules-and-decisions.md) for exact definitions.

| Role | Rule |
| --- | --- |
| Werewolf | Every living wolf selects and confirms a living target. Self-targeting and targeting teammates are allowed; skipping the kill is not. Once all have voted, the highest count wins; tied leaders are randomly selected and persisted. Changing a vote does not revoke other wolves' confirmations. |
| Seer | Must inspect another living player's alignment; repeat inspections are allowed. No skip option. |
| Witch | One antidote and one poison, at most one potion per night; using neither is allowed. Self-save is first-night only. The antidote only saves the wolf target, which is revealed only while antidote remains. |
| Guard | May self-protect or skip, but cannot protect the same person on consecutive nights. A wolf target both guarded and saved still dies. Protection does not block poison. |
| Hunter | May shoot or decline after a wolf kill or daytime vote. Any poison cause in the death batch prohibits shooting, even alongside a wolf kill. Identity is revealed on elimination. |
| Villager | Participates in in-person discussion and voting, with no night action. Elimination does not automatically reveal identity. |

The default wolf victory mode is **category elimination** (`edge`): eliminate all Villagers or all special-role players. Optional **parity** mode wins when living wolves equal or outnumber living good players. Victory is checked after the full death batch and any eligible Hunter reaction. No wolves remaining means a good-team win; everyone eliminated means a draw.

Wolves have 30 seconds; Guard, Witch, Seer, and Hunter have 10 seconds. Faster narration does not shorten action time. Incomplete actions wait silently after timeout: no automatic choice, pass, or pause announcement. Configured dead roles retain their complete narration and window to avoid leaking information through timing.

## Local Development

### Requirements

- Git.
- Node.js `>=24.14.1 <25`; see `web/.node-version`.
- npm, using the committed `web/package-lock.json`.

Ordinary web development needs no Supabase account, Python, voice model, or paid service. Audio and artwork are included.

### Quick Start

```sh
git clone https://github.com/hanqingliu2000/werewolf-pwa.git
cd werewolf-pwa/web
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Local SQLite defaults to `web/.data/rooms.sqlite`, which is not committed. Choose another port if needed.

No environment file is required by default. For explicit settings, see [.env.example](web/.env.example) and keep private values in ignored `web/.env.local`. Non-localhost access requires an exact `WEREWOLF_ORIGIN`.

### Local Production Mode

From `web/`:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

SQLite is for local single-machine use, not public Vercel deployment.

## Checks and Tests

Run from `web/`:

```sh
npm run repo:check
npm run check
npm run build
npm run smoke
npx playwright install chromium webkit
npm run test:ui
```

| Command | Coverage |
| --- | --- |
| repo:check | Documentation links, versions, active asset fingerprints, forbidden files, and client runtime dependencies |
| typecheck / lint | TypeScript and code checks |
| test / test:coverage | Rules, services, storage, permissions, player, and coverage |
| check | Types, lint, tests, and coverage thresholds |
| smoke | Isolated SQLite, last-seat concurrency, separate sessions, and recovery across a real server restart |
| test:ui | Local Chromium/WebKit UI and audio regression; build first |
| playwright.cloud.config.ts | Explicitly targeted partial acceptance on a trusted deployment |
| playwright.production.config.ts | Explicitly enabled, real-time complete browser game; never targets production by default |

Do not run local tests with production database settings. Browser reports, databases, sessions, and screenshots stay in ignored directories. Scripted multi-session acceptance is not real-phone, in-person, or independent-agent acceptance. The [release notes](releases/prod1.0.md) record the first release's results and limits; they are not a claim that later changes reran those checks.

For temporary UI review, run `node scripts/ui-review/start.mjs` at the repository root. It uses the local app and 14 isolated examples, not real rooms. See the [review tool](scripts/ui-review/README.md).

## Architecture

Stack: Next.js 16.4, React 19.3, TypeScript 6, Zod, XState, Node SQLite, pg, Vitest, and Playwright. Package and lockfiles are the source of exact versions.

Request flow: browser -> `/api/v2` -> session, permission, and context checks -> the single TypeScript rules core -> transactional state and receipts -> permission-specific views.

```text
.
|-- README.md                 Project entry point
|-- SECURITY.md               Security policy and secret checks
|-- releases/                 Formal release notes
|-- docs/                     Product, rules, flow, API, and deployment
|-- design-system/            Visual guidelines
|-- scripts/                  Repository checks, offline audio, local UI review
|-- supabase/migrations/      Private storage and cleanup migrations
`-- web/
    |-- src/game/             Single rules and phase core
    |-- src/server/           Sessions, permissions, SQLite/PG, and HTTP
    |-- src/narration/        Script and public audio player
    |-- src/ui/               Responsive UI and recovery
    |-- src/app/              Next.js pages and API
    |-- public/               Current audio, artwork, and fonts
    `-- tests/                Unit, contract, and browser tests
```

Do not duplicate authoritative game resolution in SQL, review fixtures, or the browser. Small legacy request/archive compatibility remains; old gameplay is not restored. See [architecture principles](docs/06-web-and-development.md).

## Deployment and Configuration

Production uses Vercel and Supabase PostgreSQL. Vercel root: `web/`; Node 24; Node runtime; `iad1`. Database region: `us-east-1`. Preview and Production have separate private schemas and accounts.

| Variable | Purpose |
| --- | --- |
| WEREWOLF_STORAGE | sqlite locally; postgres is mandatory online |
| WEREWOLF_DB_PATH | Local database file |
| WEREWOLF_SCHEMA | werewolf_preview or werewolf_prod |
| WEREWOLF_DATABASE_URL | Matching application account's transaction pooler URL, port 6543 |
| WEREWOLF_DATABASE_CA | Official TLS root certificate PEM |
| WEREWOLF_ORIGIN | Trusted exact origin without trailing slash |
| WEREWOLF_MAINTENANCE | 1 closes game entry and reports maintenance health |
| WEREWOLF_ENROLLMENT_CLOSED | 1 closes only new-room creation; existing rooms remain joinable and playable |

Database secrets are server-only, never `NEXT_PUBLIC_`. Missing cloud configuration must fail, not fall back to SQLite. Each function instance has at most one connection and verifies the server's TLS certificate.

Pushes create candidates, not automatic production-domain promotions. Accept a candidate, promote it manually, then verify the public URL. A Production candidate uses the prod schema even before promotion; it is not a database sandbox. Roll back to maintenance or a compatible deployment without deleting the database. See [deployment operations](docs/19-cloud-deployment.md).

Free backends may pause for inactivity. Check `/api/health` and the console before a gathering. The maintainer has a lightweight read/write check every five days, but it cannot guarantee prevention of free-project pausing and adds no paid resources. Reconfirm cost and quotas before creating resources; historical free-plan checks are not permanent guarantees.

### Usage Protection

Global new-room reservations are capped at 6 per hour, 20 per 24 hours, and 100 per 30 days. Windows begin with the first attempt. Atomic database counters survive instances and restarts. Failed attempts may consume reservations; retrying an already successful request does not. Exhaustion only delays new rooms; joining, readying, hosting, and recovering existing rooms remain outside this budget. Use `WEREWOLF_ENROLLMENT_CLOSED=1` to temporarily stop new rooms.

Request, session, and action limits and 24-hour cleanup also apply. The service currently uses Vercel Hobby / Supabase Free, without paid upgrades or extra usage purchases; quota exhaustion may restrict or pause service. See [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Supabase cost control](https://supabase.com/docs/guides/platform/cost-control). App budgets are not platform billing hard limits and do not cover static-asset traffic or distributed attacks. Revisit provider spending limits and usage before any paid migration.

## Data and Security

- Random original-browser session cookie, with no registration. HTTPS uses Secure, HttpOnly, and SameSite=Strict.
- Sessions can perform only legal actions in their own room; host controls do not reveal others' secrets.
- Private responses use no-store; writes validate Origin, JSON, size, and context.
- Parameterized SQL, fixed schema allowlists, least privilege, RLS, input validation, and rate limits.
- State and receipts commit together with CAS retries. Duplicate requests do not reuse potions or reroll ties.
- Room details expire 24 hours after actual business changes; ordinary polling/heartbeats do not extend them. Archives expire 24 hours after game end.
- Separate summaries retain room-code labels, creation/start/end times, counts, and completion status for 12 months (365 days). No player nicknames, roles, actions, or sessions; no browser access. Detail cleanup remains 24 hours, and biweekly reports exclude test records.
- Logs exclude cookies, identities, targets, passwords, and full snapshots.
- Credentials, private configuration, sessions, databases, caches, backups, and QA reports are not committed or attached to releases.

See the historical [prod1.0 security report](docs/security-prod1.0.md) for scope and uncovered risks. Necessary safeguards are not comprehensive DDoS protection or an absolute security guarantee.

## Artwork and Audio

V7 contains 48 original-speed and 96 pitch-preserving speed variants. The app loads public static files: no runtime model and no live upload of game content. Eight WebP files cover the entry scene, shared cardback, and six roles; fonts load locally.

Manifests record text, provenance, and SHA-256. Published audio is immutable; changes require a new version, audition, fingerprints, and playback acceptance. See [asset policy](docs/05-narration-and-assets.md), [audio tools](scripts/README.md), and [artwork provenance](web/public/art/README.md).

Old banks, auditions, and references are removed from the current tree and recoverable via `archive/pre-prod1.0-2026-10-13`; see [cleanup records](docs/08-archive-and-retention.md).

## Limitations and FAQ

**Why keep the host's page visible?**
Browsers may suspend audio and timers in the background, on lock, during calls, or in power-saving mode. Wake Lock and automatic recovery help but do not guarantee continuous background hosting.

**Do I need to recover manually after returning?**
System interruptions trigger synchronization and recovery attempts. Some browsers still require a normal interaction to unlock playback. Use the Chinese "恢复声音" control (restore audio) or text hosting as fallback. Manual pauses always require an explicit resume.

**Will a refresh lose my role?**
An unexpired room and the original browser session can recover. Clearing cookies, switching private sessions, or changing devices cannot recover that identity. Host takeover is not supported.

**Why can I only see my own results?**
Other players' roles, targets, and death causes remain private during play, except the Hunter's public identity on elimination. Full records are available only to that game's participants after it ends.

**Does it work offline or provide remote matchmaking?**
No. prod1.0 is for online-assisted, in-person friend groups, not offline multiplayer, native apps, matchmaking, or chat.

Additional real-device iOS/Android speaker and lifecycle checks and in-person acceptance remain important; presets are not claimed to be proven balanced.

## Maintenance and Contributions

Report device, browser, version, phase, reproduction steps, and sanitized screenshots. Do not include real identities, cookies, or credentials. Follow the [security policy](SECURITY.md) for sensitive reports.

Update rules, requirements, and tests alongside behavioral changes. Keep published audio immutable. Follow [AGENTS.md](AGENTS.md); verified work is committed and pushed, with separate production acceptance. Current docs are bilingual: English at the original path and Simplified Chinese in `.zh-CN.md` companions. Update both together, keep game-facing content in Chinese, and preserve language-local links. Historical stage logs stay in Git history.

## Licensing and Sources

There is no project-level LICENSE yet; a public repository is not automatically an open-source license grant. Fonts use the bundled [OFL](web/public/fonts/OFL.txt). Apache-2.0 in the voice manifest identifies model provenance, not a license for the whole project. Asset directories document sources and generation; historical references are not distributed.

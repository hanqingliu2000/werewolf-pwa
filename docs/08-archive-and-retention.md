# Cleanup and Retention

English | [简体中文](08-archive-and-retention.zh-CN.md)

Record date: October 13, 2026, prod1.0. The retention section also reflects subsequent usage-summary maintenance.

## Recoverable Checkpoints

- Implementation before the rewrite: `archive/pre-rewrite-2026-10-06`.
- Full repository before release cleanup: `archive/pre-prod1.0-2026-10-13`, targeting commit `6a9754b`.

These tags preserve history; they are neither formal releases nor endorsements of current rules. Git history was not rewritten, private backups were not deleted, and the former website was not restored.

## Removed from the Current Tree

- Old audio, branding sketches, and reference copy in `materials/`.
- V1 through V6 and calm-pilot banks under `web/public/audio/`; only V7 is active.
- Early voice experiment script `generate-calm-pilot.py`.
- 23 obsolete stage plans/acceptance logs that no longer belong in maintained development guidance.
- Asset comparison tests requiring deleted banks, outdated audition hints, and invalid review actions.

Immutable V7 originals, speed variants, and fingerprints were not rewritten. Any future dependency on old resources requires an explicit plan, not silent reuse of deleted paths.

## Retained

The single TypeScript core, current UI/player, cloud and local adapters, current migrations, version/permission/recovery tests, current artwork/fonts, offline audio tools, isolated UI review, and deployment QA tooling.

## Data Retention

Room details and archived games keep their existing 24-hour access and cleanup limits. Private `room_usage` and `game_usage` summaries live independently for 365 days, without foreign keys to details, and survive detail deletion. Room summaries use the later of last business activity and first statistical observation; game summaries use ending time, starting time, or first observation. Hourly and request-triggered cleanup remove expired summaries rather than accumulating them indefinitely.

Retain only room code as name, timestamps, counts, capacity, completion/abort/expiry status, and test markers. No player nicknames, roles, actions, cookies, or session hashes; no cross-room tracking of unique individuals. Deleted historical details cannot be recovered. Unknown historical starting times remain null.

No-op identity acknowledgment, legacy timeout-pause conversion, and old-audio rejection remain for stored-state compatibility; see [architecture](06-web-and-development.md). They add no user steps.

## Never Commit

Databases, real sessions or full snapshots, authentication bypass values, application passwords, private keys, environment configuration, cloud/audition reports, model caches, and private backups belong only in restricted ignored local directories. Ignore rules do not replace history scanning.

## Historical Acceptance Boundaries

V6 application `293283f` completed a protected-candidate, normal-timing game with 12 sessions and three nights, including the first-night election, Hunter, victory, recap, and rematch. V7 application `9f4b915` passed 301 tests, a partial eight-session candidate regression, and verification of all 144 live audio resources; the complete game was not repeated.

Those are earlier-version records, not automatic acceptance of the prod1.0 cleanup and not real-phone or independent-agent validation.

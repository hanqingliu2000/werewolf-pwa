# Architecture and Development

English | [简体中文](06-web-and-development.zh-CN.md)

Baseline: prod1.0, October 13, 2026.

## One Rules Core

Browsers access RoomService through `/api/v2`. The server binds sessions to membership, validates permissions and context, invokes the `src/game/` rules core, and saves state and request receipts in one transaction.

`src/narration/` handles public scripts and playback. `src/ui/` consumes public, personal, and host views, never full authoritative snapshots or database credentials. SQL handles persistence, rate limits, and cleanup, not a second implementation of game resolution.

## Storage

Local development uses Node's built-in SQLite; cloud hosting uses an asynchronous PostgreSQL adapter. RoomStore conditionally updates state and commits receipts in the same transaction, rereading and retrying conflicts at most four times. Receipt keys are scoped by session, room, and request ID.

Production accesses its private schema through the Supabase transaction pooler, with TLS server verification, at most one connection per instance, and a least-privileged account. Do not deploy SQLite on Vercel. Missing configuration must fail explicitly.

## Versions and Compatibility

- Product package: `1.0.0`; release tag: `prod1.0`.
- Rule configuration identifier: `werewolf-web-v1`.
- Audio: `host-zh-v7`.
- Persisted room format: `schemaVersion: 1`.
- API: `/api/v2`.

These versions describe separate boundaries. Small compatibility paths remain: identity acknowledgment is a no-op, optional trialConfirmed does not gate enabling narration, legacy timeout pauses become silent waiting, and callbacks from old audio are rejected. These are not selectable legacy rules. They protect existing rooms and refresh recovery.

Do not remove these contracts as cleanup or move authority back to the browser. Breaking changes require a separate migration and rollback plan.

## Development Conventions

Pin dependencies and commit the lockfile. Behavior changes must update rules, requirements, and tests together. Maintained documents describe the current baseline; stage logs live in Git history.

Public documentation is bilingual: existing `.md` paths are English by default, with adjacent `.zh-CN.md` equivalents and language links. Keep both versions aligned. This policy does not translate source implementation, gameplay UI, rules identifiers, or Chinese narration into English.

Automatically commit and push completed, verified work, following the root AGENTS file. Pushes trigger candidate deployments but do not replace the production domain automatically. Promote manually after acceptance. Rollback must not delete data or restore the former site.

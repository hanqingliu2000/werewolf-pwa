# Room Service Contract

English | [简体中文](13-room-service-contract.zh-CN.md)

Baseline: prod1.0, October 13, 2026. The sole HTTP implementation is `web/src/server/http.ts`, with input contracts in `input.ts`.

## Routes

| Method | Path under /api/v2 | Purpose |
| --- | --- | --- |
| POST | `session` | Establish an original-browser session without user registration |
| POST | `rooms` | Create a room |
| GET | `rooms/[id]/invitation` | Join information: configuration, lobby identity, and occupied seats, without roles |
| POST | `rooms/[id]/join` | Join or recognize an existing member |
| GET | `rooms/[id]` | Public view and own seat |
| GET | `rooms/[id]/private` | Own private view |
| GET | `rooms/[id]/host` | Host organizational view |
| POST | `rooms/[id]/commands` | Action in the current context |
| POST | `rooms/[id]/heartbeat` | Host foreground/audio readiness heartbeat |
| GET | `rooms/[id]/recaps` | Ended games accessible to this session |
| GET | `rooms/[id]/recaps/[gameId]` | Recap for a specific game |

Invitation reads do not require room membership, but still require a valid browser session. Room codes contain eight uppercase hexadecimal characters; they are not authentication or authorization.

## Requests

Creation includes `requestId`, `name`, and `config`; joining includes `requestId`, `epochId`, and `name`.

Command envelopes include a UUID `requestId`, `epochId`, `windowId`, and `operation`. Operations do not accept `actorId`; the server maps the cookie to room membership. Unknown fields and unsupported operations are rejected.

`wolf_confirm` carries `consensusId`; new clients also send their own `targetId` to prevent confirming a stale draft. Another wolf's changed vote does not invalidate one's own confirmation. Daytime confirmation/publication use `draftId`; narration uses `cueId` and the current audio version.

Writes accept only JSON with a trusted same-origin Origin, with a 16 KiB body limit. Session creation returns an HttpOnly, SameSite=Strict cookie, with Secure on HTTPS.

## Concurrency and Deduplication

Request receipts and room CAS writes commit in one transaction. The same request ID with the same input returns the original result; the same ID with different input is rejected. Retry an unknown network outcome with the original request, not a new request for the same intent.

CAS conflicts reread and retry at most four times. Public revision changes only with public information, never exposing private-action counts or internal storage versions. Random tie outcomes are persisted with state.

## Information and Errors

Public, personal, host, and recap responses are separate. All session/private responses disable caching and use `Vary: Cookie` to prevent sharing. Logs contain no cookies, passwords, or snapshots.

Typical HTTP statuses: 400 input, 401 session, 403 permission/origin, 404 room/route, 409 stale context or rule conflict, 413 oversized body, 415 unsupported type, 429 rate limit, and 503 unavailable. Responses contain error codes, not SQL or stack traces.

Legacy `acknowledge` is a compatibility no-op, not a required identity confirmation. `trialConfirmed` is optional compatibility input, not a prerequisite for voice hosting. Older audio versions cannot advance new cues.

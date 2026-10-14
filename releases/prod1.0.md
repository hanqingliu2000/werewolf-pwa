# prod1.0: First Production Release

English | [简体中文](prod1.0.zh-CN.md)

Historical release date: October 13, 2026. Application package 1.0.0; rule identifier werewolf-web-v1; audio host-zh-v7. Results below describe that release, not a fresh acceptance of later changes.

Live website: [Werewolf Auto Host](https://werewolf-web-v2.vercel.app/). [GitHub Release](https://github.com/hanqingliu2000/werewolf-pwa/releases/tag/prod1.0).

## Product

A Chinese-language web moderator for in-person Werewolf gatherings of 8 to 12 players. Everyone uses their own browser, and the host can play too. No installation, registration, or CAPTCHA.

## Launch Features

- Create, share, join, ready up, change seats/nicknames, and remove players as host in the lobby.
- Six randomly assigned roles, private identity viewing, and automatic action windows, without mandatory identity acknowledgment.
- Edge/parity victory modes, highest-count wolf targets, random ties, wolf teammates, and target history.
- First-night Sheriff election before result announcement, with narration only and no Sheriff/ballot records.
- Text hosting or calm Chinese narration, optional sound testing, volume, and pitch-preserving 1.5x/2x playback.
- Guard, Seer, Witch, and Hunter: 10 seconds; wolves: 30 seconds. Unfinished actions wait silently after deadlines.
- Fixed rules including death from simultaneous protection/antidote, first-night-only Witch self-save, and poison overriding Hunter shooting eligibility.
- Original-browser recovery, automatic system-interruption recovery, foreground wake assistance, and explicit resume after manual pause.
- Participant-only recaps and rematches with retained seats.

## Repository Cleanup

Removed historical reference material, V1-V6 banks and early auditions, and 23 obsolete stage logs. Kept immutable V7 files only: 48 original-speed clips and 96 pitch-preserving variants.

Aligned product, rules, interaction, retention, API, and deployment documentation. Corrected review fixtures that diverged from current gameplay. Retained necessary old-request/stored-state compatibility without replacing the rules core, migrating, or deleting real rooms.

Added a complete README, security policy, repository consistency checks, and application-root deployment exclusions. Set the application package to 1.0.0. Checkpoint `archive/pre-prod1.0-2026-10-13` preserves recoverable earlier material without rewriting Git history.

## Security and Acceptance

These are the actual pre-release records; see the detailed [historical security report](../docs/security-prod1.0.md). No paid resources, login module, or intrusive verification were added.

| Check | Result |
| --- | --- |
| Repository | 297 candidate files; links, versions, and client dependency checks passed |
| Types, lint, unit/contracts | 21 files and 301 tests passed; 97.46% statement and 94.91% branch coverage |
| Production build and local HTTP | Passed, including last-seat concurrency, independent sessions, and real service-restart recovery |
| UI review tool | Eight local isolation/rule-fixture tests passed |
| Browsers | 90 local Chromium/WebKit cases checked in batches, including 8/12-player text/voice games, recaps, and rematches |
| Assets | All 144 V7 files unchanged from before cleanup; eight artwork fingerprints verified |
| Credentials and dependencies | History, candidate, and client scans found no secrets; zero known dependency vulnerabilities |
| Cloud permissions | Private-table RLS, least privilege, environment isolation, and security advisor passed |
| Live candidate | Three-session API checks, 144 audio fingerprints, and partial eight-session browser regression passed; browser case lasted 1.2 minutes |
| Public URL | Post-promotion health, independent sessions, joining, persistence, receipts, cookies, origins, and audio rechecked |
| Cleanup | Three QA rooms removed by exact ID; read-only verification found zero remaining |

Browser verification combined complete attempts with corrected targeted reruns, not a single all-green 90-case run. Initial failures, WebKit navigation diagnostics, and the asynchronous PostgreSQL-test error are documented in the security report. Some local games shortened action windows; they were not normal-timing cloud games. Real-phone and independent-agent validation remained incomplete.

## Release Record

- Application commit at release: `f7fa4ed3f1ffadb07e10b36ea5a2d495c147715f`.
- Accepted and promoted deployment: `dpl_BdJEbpcAUmTnZ3Ny43KSuvoFLMyf`.
- Candidate: `https://werewolf-web-v2-obk3vo9tu-barrylius-projects-d58e2788.vercel.app`; the production URL pointed to this deployment at the release date, not necessarily today.
- Automatic production-domain assignment remained disabled; subsequent pushes did not automatically publish.
- The `prod1.0` tag includes cleanup and final acceptance documentation. Later differences from the application commit above were documentation-only, not changes to accepted runtime code or assets.

The live browser check covered readiness/recovery, lobby removal, playback, automatic action opening, actual 10/30-second windows, silent deadline waiting, delayed completion feedback, and persisted tied wolf selection, then deliberately aborted the test game. It was not a complete live voice game. Removed banks and private environment/Git paths were inaccessible on candidate and production URLs. Migrations and real rooms were unchanged.

## Known Limitations

- Network required; no guaranteed background/locked-screen hosting. Wake Lock and automatic recovery cannot bypass browser limits.
- Recovery requires the original session; no cross-device recovery, host takeover, or extra narration device.
- Real iOS/Android speakers, calls, Bluetooth, low battery, and gathering experience still required field acceptance.
- Role compositions were not claimed to be balance-tested. Independent online agent play differs from scripted multi-session simulation and remained incomplete.
- Rooms and recaps expire after 24 hours; the free backend can pause when idle.
- No repository-wide open-source LICENSE. Font/model licenses do not license the entire repository.

## Upgrade and Rollback

Refresh the original page for the current version and re-enable sound if unavailable. Old audio callbacks cannot advance new phases. Preserve database structure and least privilege. On failure, return to a compatible deployment or maintenance build without deleting the database or restoring the former site.

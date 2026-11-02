# prod1.0.1: Seven Players and Consistent Narration Pace

English | [简体中文](prod1.0.1.zh-CN.md)

Release date: November 1, 2026 (America/New_York). Package `1.0.1`, rules `werewolf-web-v1`, audio `host-zh-v8`. Candidate acceptance and production promotion are in progress; final results will be recorded below.

## Changes

- Lower room capacity from 8 to 7; the upper limit stays 12. The seven-player preset is 2 Werewolves, 1 Seer, 1 Witch, and 3 Villagers. New-room default remains 8; existing 8-12-player presets and action rules are unchanged. Balance is not claimed to be field-validated.
- Correct the base pace of the five Guard/Werewolf/Seer/Witch/Hunter action prompts, then derive pitch-preserving 1.5x/2x audio. Keep Qwen3-TTS, Uncle_Fu, all wording, Sheriff pronunciation guidance, and 43 other original clips unchanged. No action time is shortened.
- Upgrade local summary storage atomically and widen cloud summary constraints to 7-12 without resetting rooms, receipts, budgets, or statistics. Detail retention stays 24 hours and summary retention 365 days.
- Retain the clearer lobby ready button, bounded new-room usage, private usage summaries, and English-first bilingual documentation added since prod1.0.
- Do not adopt VoxCPM2. Its audition tools and ignored disk cache remain optional local experiments; inference tasks and audition servers have stopped. The website plays static Qwen MP3s and never loads a TTS model.

## Migration and Compatibility

`20261102025117_seven_player_rooms.sql` is applied to `werewolf_preview` and `werewolf_prod`. The filename matches the actual cloud migration history. Only the two capacity constraints per environment changed; RLS and grants remain intact. The post-migration security advisor returned no findings.

Refresh the original browser tab to get the new audio bank. No accounts, login screens, extra confirmation steps, or paid services were added. Do not roll back to a build rejecting seven-player rooms while any remain active; use a compatible fix or close new-room enrollment. Never delete the database as rollback.

## Verification

- Earlier seven-player acceptance completed seven- and ten-session local voice games, plus a visible-browser seven-player game followed by a rematch expanded to ten. Those games used V7; they are not full-game V8 or production acceptance. See [validation details](../docs/07-validation-and-roadmap.md).
- Current types, lint, and 322 unit/contract tests passed, covering SQLite/PostgreSQL compatibility, seven-player persistence, permissions, and narration assets. A restricted-environment attempt could not open the local database test listener; the authorized local rerun passed.
- Production build, isolated local HTTP/restart recovery, eight UI-review isolation tests, and three Chromium voice regressions passed. Browser checks covered complete bank decoding/fingerprints, optional sound checks, and the full action clock after real audio completion.
- Candidate acceptance, public-site verification, and QA cleanup: pending.
- No new complete production game, real-phone speaker acceptance, or independent-agent playtest is claimed.

## Deployment Record

Application commit, deployment ID, public acceptance, and exact test-room cleanup will be added after the candidate passes and is promoted. No model weights, audition audio, credentials, sessions, or private reports are included in this release.

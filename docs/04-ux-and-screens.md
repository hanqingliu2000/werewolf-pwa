# Screens and Interaction

English | [简体中文](04-ux-and-screens.zh-CN.md)

Baseline: prod1.0, October 13, 2026. See the [design system](../design-system/werewolf-web/MASTER.md) for visual specifications.

| Path | Screen |
| --- | --- |
| `/`, `/new` | Actual room creation form, not a marketing landing page |
| `/join` | Room code, nickname, joining, and original-browser recovery |
| `/r/[room]` | Lobby, shared public roster, personal private tasks, and host controls |
| `/r/[room]/recap/[game]` | Roles and nightly recap, visible to that game's participants |
| `/audio/host-zh-v7/index.html` | Current public narration samples at original speed, 1.5x, and 2x |

## Interaction Constraints

- Nicknames start empty when creating or joining; no registration or user verification is required.
- The manual ready button sits above the lobby seats and is prominent in the first viewport for unready players. Keep ready/cancel controls without tutorials or extra popups.
- Phone rosters use compact seats; the roster overlay and accessible names provide full nicknames.
- Identity views use large 3:4 portraits. Action screens prioritize fitting targets, status, timer, and confirmation in one viewport.
- Eligible foreground actions open automatically once. Closing the window prevents repeated focus stealing, and backgrounding conceals private information.
- Preselect after the eyes-open clip; submit only after the prompt finishes. Each action exposes only legal targets.
- Completion feedback directly shows the target and permitted effect, including inspected alignment, potion use, or the wolf team's final target, for about three seconds.
- Wolves can see teammates and past targets. Changing a vote does not revoke other wolves' confirmations.
- The host can manage players only in the lobby. Destructive actions require confirmation, and the host cannot remove themselves.
- Daytime entry, confirmation, and publication are separate, without automating in-person ballots. First-night election buttons advance in-person stages.
- Volume uses a slider, hosting mode uses a segmented control, and playback speed changes apply to the next clip.
- Keyboard focus, touch targets, safe areas, short screens, and reduced-motion preferences must remain usable.

## Review Tool

Run `node scripts/ui-review/start.mjs` from the repository root. It defaults to local port 3010 and expects the app on port 3000. S01 through S14 provide fixed examples with previous/next navigation for annotation.

Mock API data never enters the real database and is not a second rules engine. Verify real rules through core/service tests; frozen review scenes cannot demonstrate a complete game.

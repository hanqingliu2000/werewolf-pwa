# Product Requirements

English | [简体中文](01-product-requirements.zh-CN.md)

Baseline: prod1.0, October 13, 2026. See the [game rules](02-rules-and-decisions.md) for exact mechanics.

## Implemented Requirements

| Module | Requirement |
| --- | --- |
| Rooms | Create, share a code/link/QR code, join, change seats, rename, and ready up |
| Configuration | Presets for 8 to 12 players and constrained customization; role composition and victory mode are fixed before dealing |
| Lobby management | The host can change configuration and remove other players before the game, but cannot remove themselves |
| Dealing | Random, concealed roles; viewing a role is optional, with no individual identity acknowledgment |
| Night | Legal targets, early preselection, confirmation, private results, and fixed action windows |
| Wolves | Each wolf confirms their own vote; the highest count wins, ties are random; teammates and target history are visible privately |
| Hosting | Text or voice, optional sound test, volume control, and pitch-preserving 1.5x/2x playback |
| First-night election | Eyes-closed nominations, eyes-open speeches and offline voting; announce night results only after the election |
| Day | Offline discussion and voting; the host enters, confirms, and publishes the elimination |
| Hunter | After the elimination announcement, only the eligible Hunter may shoot or pass; nobody acts on their behalf |
| Ending | Check victory after the full resolution and eligible reactions; participant-only recap and rematch with retained seats |
| Recovery | Original-browser session, refresh recovery, foreground synchronization, automatic system recovery, and explicit resume after manual pause |
| Privacy | Separate public, personal, host-organizational, and recap information boundaries |

## Acceptance Criteria

1. Sessions and service instances share authoritative room state; duplicate requests do not repeat resource consumption.
2. Ordinary players cannot issue organizational commands, and the host cannot read other players' roles or secret targets.
3. Eliminated special roles and a Witch without potions retain their narration and action windows, preventing timing-based disclosure.
4. Normal and late submissions both show personal completion feedback for about three seconds; public views contain no private results.
5. Wolves have 30 seconds; other acting roles have 10. Incomplete actions wait silently after the deadline, without automatic choices or pause narration.
6. Before the first-night election ends, public lists and private teammate status do not disclose internally resolved deaths.

## Excluded

Individual online daytime ballots, Sheriff vote weight, badge succession, automated last words, host takeover, cross-device recovery, guaranteed locked-screen/background playback, offline multiplayer, native packages, and independent online agent playtests are not delivered prod1.0 capabilities.

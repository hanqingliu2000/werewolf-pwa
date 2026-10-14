# Game Rules

English | [简体中文](02-rules-and-decisions.zh-CN.md)

Baseline: prod1.0, October 13, 2026. The configuration identifier remains `werewolf-web-v1`; product and audio versions are not rule identifiers.

This project chooses one explicit variant, not a universally applicable ruleset. Rule changes must update the core, UI copy, tests, and this document together. Never silently change the rules of an ongoing game.

## Players and Configuration

8 to 12 players. Each special role has at most one player. There must be at least one wolf and no more than the player count divided by three, rounded down. At least one Villager and one special role are required. Role totals must match the actual player count, and everybody must be ready before starting.

| Players | Werewolves | Seer | Witch | Guard | Hunter | Villagers |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | 2 | 1 | 1 | 0 | 0 | 4 |
| 9 | 3 | 1 | 1 | 0 | 1 | 3 |
| 10 | 3 | 1 | 1 | 0 | 1 | 4 |
| 11 | 3 | 1 | 1 | 1 | 1 | 4 |
| 12 | 4 | 1 | 1 | 1 | 1 | 4 |

These are candidate presets, not proven-balanced compositions.

## Victory

After resolving the entire batch of deaths and any eligible Hunter reaction, check in this order:

1. Everyone is eliminated: draw.
2. No wolves remain and at least one good player survives: good team wins.
3. Wolves remain and the selected victory condition is met: wolves win.

The default `edge` mode requires all Villagers or all special roles to be eliminated. Optional `parity` mode requires living wolves to equal or outnumber living good players. These modes are independent, not cumulative; parity alone does not end an `edge` game.

Special roles are Seer, Witch, Guard, and Hunter. Using up potions does not change the Witch's category.

## Roles

| Role | Current Rules |
| --- | --- |
| Werewolf | Each living wolf must select a living target and confirm one vote. Self-targeting and targeting teammates are allowed; skipping the kill is not. After all wolves vote, the highest count wins, without unanimity or an absolute majority. Randomly select among tied leaders and persist the outcome so retries cannot reroll it. Changing a target revokes only that wolf's confirmation, not anyone else's. |
| Seer | Each night, inspect another living player; repeat inspections are allowed. Learn alignment, not the specific role. Skipping the inspection is not allowed. |
| Witch | One antidote and one poison, at most one potion per night; passing is allowed. The antidote only saves the current wolf target, and self-saving is allowed only on the first night of the game. The wolf target is visible while the antidote remains; after it is used, future targets are hidden. Poison may target any living player, including the Witch. A Witch targeted by wolves and not saved can still poison; resolve everything at the end of the night. |
| Guard | May protect themselves or nobody, but not the same player on consecutive nights. A night without protection breaks the consecutive-target restriction. |
| Hunter | When killed by wolves or eliminated by the daytime vote, may shoot another living player or pass. Any poison cause in the same death batch prevents shooting, even with a simultaneous wolf attack. Reveal the Hunter's identity on elimination, including poisoning or passing. The reaction becomes available only after the announcement; no later extra shot is allowed. |
| Villager | Participates in offline discussion and voting; no secret night action. |

## Protection, Antidote, and Poison

A wolf target survives the wolf attack when protected by the Guard alone or saved by the antidote alone. Receiving both protection and antidote still results in death, attributed to the wolf attack. Receiving neither also results in death. Neither protection nor antidote blocks poison.

For example, if the Guard protects A, the Witch saves A, and wolves target A, A dies. A Hunter attacked and poisoned in the same night cannot shoot, regardless of protection or antidote.

## Timing and Disclosure

- Night order: Guard, Werewolves, Witch, Seer. Roles absent from the configuration have no phase.
- Configured but eliminated roles, and a Witch with no potions, still receive the complete eyes-open/action/eyes-closed sequence and the same window length.
- Wolves have 30 seconds; Guard, Witch, Seer, and Hunter have 10. Early-completed night actions still wait for the fixed window to end. Incomplete actions wait silently after the deadline and proceed when completed.
- Preselection opens after the actual end of the eyes-open clip. The full countdown and submission permission begin after the action prompt finishes. Faster narration does not shorten action time.
- After the first night resolves, conduct eyes-closed nominations, eyes-open Sheriff speeches, and offline voting. Announce night results only after the host finishes the election. The system records neither the Sheriff nor vote weight. Later nights do not repeat the election.
- Daytime voting is offline. The host enters an elimination target or no elimination, confirms the draft, and publishes it. The draft is editable before publication; published results cannot be undone.
- Ordinary eliminations reveal neither role nor cause of death. The Hunter is the only role-reveal exception. Last words are organized in person.
- Full roles, nightly actions, and resolutions appear in the recap only for that game's participants.

## Implementation

Configuration: [config.ts](../web/src/game/config.ts); resolution and timing: [rules.ts](../web/src/game/rules.ts); commands: [engine.ts](../web/src/game/engine.ts). Rules exist only in the TypeScript core, not in SQL or the review tool.

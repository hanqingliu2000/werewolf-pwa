# Gameplay and Privacy

English | [简体中文](03-gameplay-and-privacy.zh-CN.md)

Baseline: prod1.0, October 13, 2026.

## A Complete Game

1. The host creates a room with a player count, role composition, and victory mode, then shares its link/code. Players join, choose seats, and ready up.
2. Once the room is full and everyone is ready, deal roles randomly. Roles are concealed by default and viewing is optional; no identity acknowledgment is required. After the dealing announcement, the host starts the first night.
3. Night proceeds through Guard, Werewolves, Witch, and Seer. After the eyes-open clip, eligible foreground players automatically see the preselection window. The full action countdown starts after the prompt ends.
4. After internal resolution of the first night, run the Sheriff election: eyes-closed nominations, eyes-open speeches, and offline voting. The host advances the in-person stages; candidates and the Sheriff are not recorded.
5. Once the election ends, announce night eliminations, reveal any eliminated Hunter and complete their eligible reaction, then check victory. Later nights use the regular announcement directly.
6. Discuss and vote offline. The host enters, confirms, and publishes the elimination, followed by any Hunter reaction and victory check, then the next night.
7. Participants can view the recap after the game. The host may keep the seats and ready up again. Aborted games do not receive fabricated winners.

## Four Views

| View | Visible Information |
| --- | --- |
| Public | Phase, public timer, nicknames/seats, announced eliminations, revealed Hunter, and victory |
| Personal | Own role, legal actions, accepted results, own inspections/potions, and wolves' teammates and target history |
| Host organizational | Configuration, readiness, pause, first-night election stages, daytime draft, and public advancement; no other player's role or secret target |
| Recap | Full roles and nightly records after the game, limited to participating sessions |

Internally resolved deaths do not directly change public lists, the player's own status, or wolf teammate alive indicators. Those views derive from announced events; the first-night election must not disclose the night's results.

## Private Interface

Backgrounding, closing the private view, or changing phase conceals secrets. The action window opens automatically once per logical turn and does not steal focus again after the player closes it. Accepted actions show the target and only the effects that player may know, for about three seconds after normal or late submissions. They do not claim unannounced final deaths.

Public audio contains only public narration. Inspections, the Witch's wolf target, wolf teammates, and secret choices are never announced through sound or vibration.

## Pause and Recovery

An incomplete action after the deadline waits silently; it is not paused. If the host's foreground/audio availability fails, the system freezes safely. Returning to the foreground with current audio ready and a healthy heartbeat automatically resumes the remaining time. Ordinary page interaction can help unlock browser playback. Automatic attempts are bounded; restoring sound or switching to text hosting remains a fallback.

Manual pauses require an explicit host resume. Manual resume preserves the existing grace period by adding one role window, up to 30 seconds for wolves or 10 for others. System recovery only resumes the frozen remainder and adds no extra time. Accepted actions remain intact. A valid unacknowledged cue may replay; an acknowledged announcement does not advance twice. There is no host takeover or cross-device recovery.

## Retention

Rooms expire 24 hours after the last business operation that actually changes state. Polling and ordinary heartbeats do not extend expiry. When restarting, archived games remain available for 24 hours from their original ending time; later joiners cannot view earlier recaps. Access checks enforce expiry immediately. Background cleanup reclaims storage and does not replace access control.

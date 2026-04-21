import { describe, expect, it } from 'vitest';
import {
  advanceToDayInput,
  createRoom,
  dayVote,
  getRoomState,
  hunterShot,
  joinRoom,
  resolveNight,
  startRoom,
  submitNightAction,
} from '../lib/store';

describe('phase-4 detailed state transitions', () => {
  it('requires DAY_ANNOUNCE -> DAY_INPUT before day vote', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'Host' });
    joinRoom(room.id, { name: 'P2' });
    joinRoom(room.id, { name: 'P3' });
    joinRoom(room.id, { name: 'P4' });
    joinRoom(room.id, { name: 'P5' });
    startRoom(room.id, hostPlayer.id);

    const state = getRoomState(room.id, { revealRoles: true });
    const guard = state.players.find((p) => p.role === 'guard')!;
    const wolf = state.players.find((p) => p.role === 'werewolf')!;
    const seer = state.players.find((p) => p.role === 'seer')!;
    const witch = state.players.find((p) => p.role === 'witch')!;

    submitNightAction(room.id, { actorPlayerId: guard.id, targetPlayerId: guard.id, actionType: 'guard' });
    submitNightAction(room.id, { actorPlayerId: wolf.id, targetPlayerId: seer.id, actionType: 'kill', confirm: true });
    submitNightAction(room.id, { actorPlayerId: seer.id, targetPlayerId: wolf.id, actionType: 'see' });
    submitNightAction(room.id, { actorPlayerId: witch.id, targetPlayerId: wolf.id, actionType: 'poison' });

    resolveNight(room.id, hostPlayer.id);
    expect(() => dayVote(room.id, { hostPlayerId: hostPlayer.id, eliminatedPlayerId: null })).toThrow('PHASE_MISMATCH');

    const advanced = advanceToDayInput(room.id, hostPlayer.id);
    expect(advanced.currentPhase).toBe('DAY_INPUT');
  });

  it('supports hunter reaction phase when enabled', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'Host2' });
    joinRoom(room.id, { name: 'P2' });
    joinRoom(room.id, { name: 'P3' });
    joinRoom(room.id, { name: 'P4' });
    joinRoom(room.id, { name: 'P5' });
    startRoom(room.id, hostPlayer.id);

    const st = getRoomState(room.id, { revealRoles: true });
    st.room.ruleConfig.hunterCanShootWhenPoisoned = true;

    const guard = st.players.find((p) => p.role === 'guard')!;
    const wolf = st.players.find((p) => p.role === 'werewolf')!;
    const seer = st.players.find((p) => p.role === 'seer')!;
    const witch = st.players.find((p) => p.role === 'witch')!;
    const hunter = st.players.find((p) => p.role === 'hunter')!;

    submitNightAction(room.id, { actorPlayerId: guard.id, targetPlayerId: guard.id, actionType: 'guard' });
    submitNightAction(room.id, { actorPlayerId: wolf.id, targetPlayerId: hunter.id, actionType: 'kill', confirm: true });
    submitNightAction(room.id, { actorPlayerId: seer.id, targetPlayerId: wolf.id, actionType: 'see' });
    submitNightAction(room.id, { actorPlayerId: witch.id, targetPlayerId: seer.id, actionType: 'poison' });

    const resolved = resolveNight(room.id, hostPlayer.id);
    expect(resolved.room.currentPhase).toBe('DEATH_REACTION_HUNTER');

    const target = st.players.find((p) => p.role === 'werewolf')!;
    const roomAfter = hunterShot(room.id, { hunterPlayerId: hunter.id, targetPlayerId: target.id });
    expect(roomAfter.currentPhase).toBe('DAY_ANNOUNCE');
  });
});

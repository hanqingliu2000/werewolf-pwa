import { describe, expect, it } from 'vitest';
import { createRoom, joinRoom, resolveNight, startRoom, submitNightAction, getRoomState } from '../lib/store';

function byRole(state: ReturnType<typeof getRoomState>, role: string) {
  return state.players.find((p) => p.role === role)!;
}

describe('night flow phase-2', () => {
  it('accepts ordered actions and resolves deaths', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'Host' });
    joinRoom(room.id, { name: 'P2' });
    joinRoom(room.id, { name: 'P3' });
    joinRoom(room.id, { name: 'P4' });
    joinRoom(room.id, { name: 'P5' });

    startRoom(room.id, hostPlayer.id);
    let state = getRoomState(room.id, { revealRoles: true });

    const guard = byRole(state, 'guard');
    const wolf = byRole(state, 'werewolf');
    const seer = byRole(state, 'seer');
    const witch = byRole(state, 'witch');
    const hunter = byRole(state, 'hunter');

    submitNightAction(room.id, { actorPlayerId: guard.id, targetPlayerId: seer.id, actionType: 'guard' });
    submitNightAction(room.id, { actorPlayerId: wolf.id, targetPlayerId: hunter.id, actionType: 'kill', confirm: true });
    submitNightAction(room.id, { actorPlayerId: seer.id, targetPlayerId: wolf.id, actionType: 'see' });
    submitNightAction(room.id, { actorPlayerId: witch.id, targetPlayerId: hunter.id, actionType: 'save' });

    const resolved = resolveNight(room.id, hostPlayer.id);
    expect(resolved.deaths.length).toBe(0);
    expect(resolved.room.currentPhase).toBe('DAY_ANNOUNCE');
  });

  it('rejects wrong phase action', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'Host2' });
    joinRoom(room.id, { name: 'P2' });
    startRoom(room.id, hostPlayer.id);

    const state = getRoomState(room.id, { revealRoles: true });
    const wolf = state.players.find((p) => p.role === 'werewolf')!;
    const target = state.players[0]!;

    expect(() =>
      submitNightAction(room.id, {
        actorPlayerId: wolf.id,
        targetPlayerId: target.id,
        actionType: 'kill',
      }),
    ).toThrow('PHASE_MISMATCH');
  });

  it('skips missing roles and can resolve with small player count', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'Host3' });
    joinRoom(room.id, { name: 'P2' });
    joinRoom(room.id, { name: 'P3' });
    startRoom(room.id, hostPlayer.id);

    const state = getRoomState(room.id, { revealRoles: true });
    const guard = byRole(state, 'guard');
    const wolf = byRole(state, 'werewolf');
    const seer = byRole(state, 'seer');

    submitNightAction(room.id, { actorPlayerId: guard.id, targetPlayerId: wolf.id, actionType: 'guard' });
    submitNightAction(room.id, { actorPlayerId: wolf.id, targetPlayerId: seer.id, actionType: 'kill', confirm: true });
    const afterSeer = submitNightAction(room.id, { actorPlayerId: seer.id, targetPlayerId: wolf.id, actionType: 'see' });

    expect(afterSeer.room.currentPhase).toBe('NIGHT_RESOLVE');
  });
});

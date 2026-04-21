import { describe, expect, it } from 'vitest';
import { assertHostSession, assertPlayerSession, createRoom, getPlayerView, getRoomState, joinRoom, startRoom, submitNightAction } from '../lib/store';

describe('player privacy view', () => {
  it('returns only self role while state can hide roles', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'Host' });
    const j = joinRoom(room.id, { name: 'P2' });
    startRoom(room.id, hostPlayer.id);

    const masked = getRoomState(room.id);
    expect(masked.players.every((p) => p.role === null)).toBe(true);

    const me = getPlayerView(room.id, j.player.id);
    expect(me.me.role).toBeTruthy();
  });

  it('requires the matching player token for protected operations', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'HostToken' });
    const j = joinRoom(room.id, { name: 'P2' });

    expect(hostPlayer.sessionToken).toBeTruthy();
    expect(j.player.sessionToken).toBeTruthy();
    expect(assertHostSession(room.id, hostPlayer.id, hostPlayer.sessionToken).id).toBe(hostPlayer.id);
    expect(assertPlayerSession(room.id, j.player.id, j.player.sessionToken).id).toBe(j.player.id);
    expect(() => assertHostSession(room.id, hostPlayer.id, j.player.sessionToken)).toThrow('INVALID_SESSION');
    expect(() => assertPlayerSession(room.id, j.player.id, null)).toThrow('UNAUTHORIZED');
  });

  it('does not expose night actions or wolf consensus in public room state', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'HostMask' });
    joinRoom(room.id, { name: 'P2' });
    joinRoom(room.id, { name: 'P3' });
    joinRoom(room.id, { name: 'P4' });
    joinRoom(room.id, { name: 'P5' });
    startRoom(room.id, hostPlayer.id);

    const revealed = getRoomState(room.id, { revealRoles: true });
    const guard = revealed.players.find((p) => p.role === 'guard')!;
    const wolf = revealed.players.find((p) => p.role === 'werewolf')!;
    const target = revealed.players.find((p) => p.id !== wolf.id && p.alive)!;
    submitNightAction(room.id, { actorPlayerId: guard.id, targetPlayerId: guard.id, actionType: 'guard' });
    submitNightAction(room.id, { actorPlayerId: wolf.id, targetPlayerId: target.id, actionType: 'kill' });

    const publicState = getRoomState(room.id);
    expect(publicState.players.every((p) => p.role === null)).toBe(true);
    expect(publicState.nightActions).toEqual([]);
    expect(publicState.wolfConsensus).toBeNull();

    const wolfView = getPlayerView(room.id, wolf.id);
    expect(wolfView.wolfConsensus?.selectedCount).toBe(1);
  });
});

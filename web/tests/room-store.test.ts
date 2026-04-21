import { describe, expect, it } from 'vitest';
import { createRoom, getRoomState, joinRoom, startRoom } from '../lib/store';

describe('room store phase-1 flow', () => {
  it('creates room, joins player, starts game by host', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'Barry', roomName: '测试房' });
    expect(room.currentPhase).toBe('LOBBY');

    const joinResult = joinRoom(room.id, { name: 'Tongwei' });
    expect(joinResult.player.name).toBe('Tongwei');

    const started = startRoom(room.id, hostPlayer.id);
    expect(started.currentPhase).toBe('NIGHT_GUARD');

    const state = getRoomState(room.id);
    expect(state.players.length).toBe(2);
  });

  it('treats player names as case-insensitive when joining', () => {
    const { room } = createRoom({ hostName: 'Barry', roomName: '测试房' });
    joinRoom(room.id, { name: 'Tongwei' });
    expect(() => joinRoom(room.id, { name: 'tOnGwEi' })).toThrow('PLAYER_NAME_TAKEN');
  });
});

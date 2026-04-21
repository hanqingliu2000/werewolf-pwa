import { describe, expect, it } from 'vitest';
import { advanceToDayInput, createRoom, dayVote, getRoomState, joinRoom, startRoom } from '../lib/store';

describe('day vote + win check phase-3', () => {
  it('enters END when wolves are eliminated', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'Host' });
    joinRoom(room.id, { name: 'P2' });
    joinRoom(room.id, { name: 'P3' });
    joinRoom(room.id, { name: 'P4' });
    joinRoom(room.id, { name: 'P5' });

    startRoom(room.id, hostPlayer.id);

    const state = getRoomState(room.id, { revealRoles: true });
    state.room.status = 'day';
    state.room.currentPhase = 'DAY_ANNOUNCE';

    const wolf = state.players.find((p) => p.role === 'werewolf')!;
    advanceToDayInput(room.id, hostPlayer.id);
    const result = dayVote(room.id, {
      hostPlayerId: hostPlayer.id,
      eliminatedPlayerId: wolf.id,
    });

    expect(result.winner).toBe('good');
    expect(result.room.currentPhase).toBe('END');
    expect(result.room.status).toBe('end');
  });

  it('goes to next night when no winner', () => {
    const { room, hostPlayer } = createRoom({ hostName: 'Host2' });
    joinRoom(room.id, { name: 'P2' });
    joinRoom(room.id, { name: 'P3' });
    joinRoom(room.id, { name: 'P4' });

    startRoom(room.id, hostPlayer.id);

    const state = getRoomState(room.id, { revealRoles: true });
    state.room.status = 'day';
    state.room.currentPhase = 'DAY_ANNOUNCE';

    const seer = state.players.find((p) => p.role === 'seer')!;
    advanceToDayInput(room.id, hostPlayer.id);
    const result = dayVote(room.id, {
      hostPlayerId: hostPlayer.id,
      eliminatedPlayerId: seer.id,
    });

    expect(result.winner).toBeNull();
    expect(result.room.currentPhase).toBe('NIGHT_GUARD');
    expect(result.room.status).toBe('night');
    expect(result.room.currentNightNo).toBe(2);
  });
});

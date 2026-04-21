import { describe, expect, it } from 'vitest';
import { appErrorStatus, mapPlayer, mapRoom } from '../lib/api-mappers';

describe('api-mappers', () => {
  it('maps room row', () => {
    const room = mapRoom({
      id: 'ABC123',
      host_id: 'h1',
      name: 'r',
      status: 'lobby',
      current_phase: 'LOBBY',
      current_night_no: 0,
      phase_version: 1,
      rule_config: { winMode: 'A' },
      created_at: 't1',
      updated_at: 't2',
    });
    expect(room.hostId).toBe('h1');
    expect(room.currentPhase).toBe('LOBBY');
  });

  it('masks role by default', () => {
    const p = mapPlayer({ id: 'p1', room_id: 'r1', name: 'n', role: 'seer', alive: true, eliminated_at: null });
    expect(p.role).toBeNull();
    expect(p.sessionToken).toBeUndefined();
    const p2 = mapPlayer(
      { id: 'p1', room_id: 'r1', name: 'n', role: 'seer', alive: true, eliminated_at: null, session_token: 'secret' },
      { revealRole: true, revealSessionToken: true },
    );
    expect(p2.role).toBe('seer');
    expect(p2.sessionToken).toBe('secret');
  });

  it('maps error status', () => {
    expect(appErrorStatus('ROOM_NOT_FOUND')).toBe(404);
    expect(appErrorStatus('FORBIDDEN')).toBe(403);
    expect(appErrorStatus('UNAUTHORIZED')).toBe(401);
    expect(appErrorStatus('X')).toBe(400);
  });
});

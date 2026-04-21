import { describe, expect, it } from 'vitest';
import { buildRoleQueue, checkWin, roleActions } from '../lib/game-rules';

describe('shared game rules', () => {
  it('builds deterministic role queues with villagers filling the tail', () => {
    expect(buildRoleQueue(7, { werewolf: 2, seer: 1 })).toEqual([
      'werewolf',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
  });

  it('uses default core roles when no custom plan is provided', () => {
    expect(buildRoleQueue(6)).toEqual(['guard', 'werewolf', 'seer', 'witch', 'hunter', 'villager']);
  });

  it('keeps action permissions centralized', () => {
    expect(roleActions.werewolf).toEqual(['kill']);
    expect(roleActions.witch).toEqual(['save', 'poison', 'pass']);
    expect(roleActions.villager).toBeUndefined();
  });

  it('checks win mode A and B consistently', () => {
    expect(checkWin({ winMode: 'A' }, [
      { role: 'werewolf', alive: false },
      { role: 'villager', alive: true },
    ])).toEqual({ ended: true, winner: 'good' });

    expect(checkWin({ winMode: 'A' }, [
      { role: 'werewolf', alive: true },
      { role: 'villager', alive: true },
    ])).toEqual({ ended: true, winner: 'wolf' });

    expect(checkWin({ winMode: 'B' }, [
      { role: 'werewolf', alive: true },
      { role: 'seer', alive: false },
      { role: 'villager', alive: true },
    ])).toEqual({ ended: true, winner: 'wolf' });
  });
});

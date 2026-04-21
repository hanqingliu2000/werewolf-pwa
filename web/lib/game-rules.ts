import type { ActionType, Role, Room, RuleConfig } from './types';

export const defaultRoleOrder: Role[] = ['guard', 'werewolf', 'seer', 'witch', 'hunter'];

export const phaseExpectedAction: Partial<Record<Room['currentPhase'], ActionType>> = {
  NIGHT_GUARD: 'guard',
  NIGHT_WEREWOLF: 'kill',
  NIGHT_SEER: 'see',
  NIGHT_WITCH: 'save',
};

export const roleActions: Partial<Record<Role, ActionType[]>> = {
  guard: ['guard'],
  werewolf: ['kill'],
  seer: ['see'],
  witch: ['save', 'poison', 'pass'],
};

export function buildRoleQueue(playerCount: number, plan?: Partial<Record<Role, number>> | Record<string, number>) {
  const roles: Role[] = [];
  if (plan) {
    for (const [role, count] of Object.entries(plan)) {
      for (let i = 0; i < Math.max(0, Number(count) || 0); i++) roles.push(role as Role);
    }
  }
  if (roles.length === 0) roles.push(...defaultRoleOrder);
  while (roles.length < playerCount) roles.push('villager');
  return roles.slice(0, playerCount);
}

export function assignRoleNames<T extends { role: Role | null }>(
  players: T[],
  plan?: Partial<Record<Role, number>> | Record<string, number>,
) {
  const roles = buildRoleQueue(players.length, plan);
  players.forEach((player, index) => {
    player.role = roles[index] ?? 'villager';
  });
  return roles;
}

function isWolf(role: string | null) {
  return role === 'werewolf';
}

function isGod(role: string | null) {
  return role === 'seer' || role === 'witch' || role === 'guard' || role === 'hunter';
}

export function checkWin(ruleConfig: Pick<RuleConfig, 'winMode'> | null | undefined, players: Array<{ role: string | null; alive: boolean }>) {
  const alive = players.filter((p) => p.alive);
  const wolves = alive.filter((p) => isWolf(p.role)).length;
  const good = alive.length - wolves;

  if (wolves === 0) return { ended: true as const, winner: 'good' as const };

  if (ruleConfig?.winMode === 'B') {
    const aliveGods = alive.filter((p) => isGod(p.role)).length;
    const aliveVillagers = alive.filter((p) => p.role === 'villager').length;
    if (aliveGods === 0 || aliveVillagers === 0) return { ended: true as const, winner: 'wolf' as const };
  } else if (wolves >= good) {
    return { ended: true as const, winner: 'wolf' as const };
  }

  return { ended: false as const };
}

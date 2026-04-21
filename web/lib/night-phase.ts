export type NightPhase = 'NIGHT_GUARD' | 'NIGHT_WEREWOLF' | 'NIGHT_SEER' | 'NIGHT_WITCH' | 'NIGHT_RESOLVE';

const phaseOrder: NightPhase[] = ['NIGHT_GUARD', 'NIGHT_WEREWOLF', 'NIGHT_SEER', 'NIGHT_WITCH', 'NIGHT_RESOLVE'];

const phaseRole: Partial<Record<NightPhase, string>> = {
  NIGHT_GUARD: 'guard',
  NIGHT_WEREWOLF: 'werewolf',
  NIGHT_SEER: 'seer',
  NIGHT_WITCH: 'witch',
};

const nextPhase: Partial<Record<NightPhase, NightPhase>> = {
  NIGHT_GUARD: 'NIGHT_WEREWOLF',
  NIGHT_WEREWOLF: 'NIGHT_SEER',
  NIGHT_SEER: 'NIGHT_WITCH',
  NIGHT_WITCH: 'NIGHT_RESOLVE',
};

function hasAliveRole(players: Array<{ role: string | null; alive: boolean }>, role: string) {
  return players.some((p) => p.alive && p.role === role);
}

export function firstActiveNightPhase(players: Array<{ role: string | null; alive: boolean }>): NightPhase {
  for (const phase of phaseOrder) {
    const role = phaseRole[phase];
    if (!role) return phase;
    if (hasAliveRole(players, role)) return phase;
  }
  return 'NIGHT_RESOLVE';
}

export function nextActiveNightPhase(currentPhase: NightPhase, players: Array<{ role: string | null; alive: boolean }>): NightPhase {
  let next = (nextPhase[currentPhase] ?? currentPhase) as NightPhase;
  while (next !== 'NIGHT_RESOLVE') {
    const role = phaseRole[next];
    if (!role || hasAliveRole(players, role)) break;
    next = (nextPhase[next] ?? 'NIGHT_RESOLVE') as NightPhase;
  }
  return next;
}

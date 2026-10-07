import { randomInt } from "node:crypto";
import { requireRule } from "./errors";
import { ROLES, type Player, type RuleConfig, type Seat } from "./types";

export type RandomIndex = (upperExclusive: number) => number;

export function dealRoles(seats: readonly Seat[], config: RuleConfig, random: RandomIndex = randomInt): Player[] {
  const queue = ROLES.flatMap((role) => Array.from({ length: config.roles[role] }, () => role));
  requireRule(queue.length === seats.length, "PLAYER_COUNT_MISMATCH");
  for (let i = queue.length - 1; i > 0; i--) {
    const j = random(i + 1);
    requireRule(Number.isInteger(j) && j >= 0 && j <= i, "RANDOM_INDEX_INVALID");
    [queue[i], queue[j]] = [queue[j]!, queue[i]!];
  }
  return [...seats].sort((a, b) => a.seat - b.seat).map((seat, i) => ({ ...seat, role: queue[i]!, alive: true }));
}

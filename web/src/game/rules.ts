import { requireRule } from "./errors";
import type { Death, DeathCause, Game, Night, NightRole, Player, Winner } from "./types";

const order: NightRole[] = ["guard", "werewolf", "witch", "seer"];
export const actionDuration = (role: NightRole | "hunter") => role === "werewolf" || role === "guard" ? 30_000 : 10_000;

export function nightRoles(game: Game): NightRole[] {
  return order.filter((role) => game.config.roles[role] > 0);
}

export function player(game: Game, id: string): Player {
  const found = game.players.find((p) => p.id === id);
  requireRule(found, "PLAYER_NOT_FOUND");
  return found;
}

export function livingTarget(game: Game, id: string | null): Player {
  requireRule(id !== null, "TARGET_REQUIRED");
  const target = player(game, id);
  requireRule(target.alive, "TARGET_NOT_ALIVE");
  return target;
}

export function actorIds(game: Game): string[] {
  if (game.nightRole === "witch" && !game.witchPotions.save && !game.witchPotions.poison) return [];
  return game.players.filter((p) => p.alive && p.role === game.nightRole).map((p) => p.id);
}

export function windowComplete(game: Game): boolean {
  const night = game.currentNight!;
  const actors = actorIds(game);
  if (!actors.length) return true;
  return game.nightRole === "werewolf" ? night.killLocked : actors.every((id) => night.completedActorIds.includes(id));
}

export function resolveDeaths(game: Game, night: Night): Death[] {
  const guard = night.actions.find((a) => a.kind === "guard")?.targetId ?? null;
  const save = night.actions.find((a) => a.kind === "save")?.targetId ?? null;
  const poison = night.actions.find((a) => a.kind === "poison")?.targetId ?? null;
  const causes = new Map<string, DeathCause[]>();
  if (night.killTargetId !== null && night.killTargetId !== guard && night.killTargetId !== save) causes.set(night.killTargetId, ["wolf"]);
  if (poison !== null) causes.set(poison, [...(causes.get(poison) ?? []), "poison"]);
  return game.players.filter((p) => p.alive && causes.has(p.id)).sort((a, b) => a.seat - b.seat)
    .map((p) => ({ playerId: p.id, causes: causes.get(p.id)! }));
}

export function hunterEligible(game: Game, deaths: readonly Death[]): string | null {
  const hunter = deaths.find((d) => player(game, d.playerId).role === "hunter");
  if (!hunter || hunter.causes.includes("poison")) return null;
  return hunter.causes.some((c) => c === "wolf" || c === "vote") ? hunter.playerId : null;
}

export function evaluateWin(game: Game): Winner | null {
  requireRule(game.players.every((p) => p.role !== null), "ROLES_NOT_DEALT");
  const alive = game.players.filter((p) => p.alive);
  if (!alive.length) return "draw";
  const wolves = alive.filter((p) => p.role === "werewolf").length;
  if (!wolves) return "good";
  if (game.config.winMode === "parity") return wolves >= alive.length - wolves ? "wolf" : null;
  const villagers = alive.filter((p) => p.role === "villager").length;
  const gods = alive.length - wolves - villagers;
  return villagers === 0 || gods === 0 ? "wolf" : null;
}

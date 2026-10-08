import { createGame, executeCommand, actorForRole } from "../src/game/engine";
import { RULES_VERSION } from "../src/game/config";
import type { Command } from "../src/game/commands";
import type { Game, NightRole, Role, RuleConfig } from "../src/game/types";

export const config: RuleConfig = { version: RULES_VERSION, winMode: "edge",
  roles: { werewolf: 2, seer: 1, witch: 1, guard: 1, hunter: 1, villager: 2 } };
export const seats = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, name: `Player ${i + 1}` }));
export const fixedRandom = { randomIndex: (n: number) => n - 1, newGameId: () => "next-game" };

export function command(game: Game, input: Command, at = game.updatedAt): Game {
  return executeCommand(game, input, at, fixedRandom);
}

export function roleId(game: Game, role: Role): string {
  const id = actorForRole(game, role);
  if (!id) throw new Error(`No living ${role}`);
  return id;
}

export function revealed(winMode: RuleConfig["winMode"] = "edge"): Game {
  let game = createGame({ ...config, winMode }, seats, "p1", "test-game");
  game = command(game, { type: "deal", actorId: "p1" });
  return game;
}

export function started(winMode: RuleConfig["winMode"] = "edge"): Game {
  return command(revealed(winMode), { type: "begin_night", actorId: "p1" });
}

export function open(game: Game): Game { return command(game, { type: "open_window", actorId: game.hostId }); }
export function close(game: Game): Game {
  return command(game, { type: "close_window", actorId: game.hostId }, game.window!.deadline);
}
export function finish(game: Game): Game { return command(close(game), { type: "finish_role", actorId: game.hostId }); }

export function wolves(game: Game, targetId: string | null): Game {
  const actors = game.players.filter((p) => p.alive && p.role === "werewolf");
  for (const p of actors) game = command(game, { type: "wolf_propose", actorId: p.id, targetId });
  for (const p of actors) game = command(game, { type: "wolf_confirm", actorId: p.id });
  return game;
}

export interface NightChoices {
  guard?: string | null;
  kill?: string | null;
  witch?: { choice: "save" | "poison" | "pass"; targetId: string | null };
  see?: string | null;
}

export function nightToDawn(source: Game, choices: NightChoices = {}): Game {
  let game = source;
  while (game.phase === "night_open") {
    game = open(game);
    const role = game.nightRole as NightRole;
    const actor = actorForRole(game, role);
    if (actor) {
      if (role === "guard") game = command(game, { type: "guard", actorId: actor, targetId: choices.guard ?? null });
      if (role === "werewolf") game = wolves(game, choices.kill ?? null);
      if (role === "witch") game = command(game, { type: "witch", actorId: actor, ...(choices.witch ?? { choice: "pass", targetId: null }) });
      if (role === "seer") game = command(game, { type: "seer", actorId: actor, targetId: choices.see ?? null });
    }
    game = finish(game);
  }
  return game;
}

export function toRole(source: Game, wanted: NightRole, choices: NightChoices = {}): Game {
  let game = source;
  while (game.phase === "night_open" && game.nightRole !== wanted) {
    game = open(game);
    const role = game.nightRole!;
    const actor = actorForRole(game, role);
    if (actor) {
      if (role === "guard") game = command(game, { type: "guard", actorId: actor, targetId: choices.guard ?? null });
      if (role === "werewolf") game = wolves(game, choices.kill ?? null);
      if (role === "witch") game = command(game, { type: "witch", actorId: actor, ...(choices.witch ?? { choice: "pass", targetId: null }) });
    }
    game = finish(game);
  }
  if (game.nightRole !== wanted) throw new Error(`Did not reach ${wanted}`);
  return open(game);
}

export function day(source: Game, choices: NightChoices = {}): Game {
  return command(nightToDawn(source, choices), { type: "publish_dawn", actorId: source.hostId });
}

export function vote(source: Game, targetId: string | null): Game {
  let game = command(source, { type: "day_draft", actorId: source.hostId, targetId });
  game = command(game, { type: "day_confirm", actorId: source.hostId });
  return command(game, { type: "day_publish", actorId: source.hostId });
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

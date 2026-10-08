import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseCommand } from "./commands";
import { validateConfig } from "./config";
import { requireRule, RuleError } from "./errors";
import { movePhase, type PhaseEvent } from "./lifecycle";
import { dealRoles, type RandomIndex } from "./random";
import { actionDuration, actorIds, evaluateWin, hunterEligible, livingTarget, nightRoles, player, resolveDeaths, windowComplete } from "./rules";
import type { Game, Night, NightRole, Role, SeerReport } from "./types";

const seatsSchema = z.array(z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/).refine((id) => !["constructor", "prototype"].includes(id)),
  seat: z.number().int().min(1).max(12),
  name: z.string().trim().transform((name) => name.normalize("NFC")).pipe(z.string().min(1).max(48)),
})).min(8).max(12);
export interface RandomSources { randomIndex?: RandomIndex; newGameId?: () => string }

export function createGame(configInput: unknown, seatsInput: unknown, hostId: string, id: string = randomUUID(), now = 0): Game {
  const parsed = seatsSchema.safeParse(seatsInput);
  requireRule(parsed.success, "SEATS_INVALID");
  const seats = parsed.data.sort((a, b) => a.seat - b.seat);
  requireRule(new Set(seats.map((p) => p.id)).size === seats.length, "PLAYER_ID_DUPLICATE");
  requireRule(new Set(seats.map((p) => p.seat)).size === seats.length, "SEAT_DUPLICATE");
  requireRule(seats.every((p, i) => p.seat === i + 1), "SEAT_SEQUENCE_INVALID");
  requireRule(new Set(seats.map((p) => p.name.toLocaleLowerCase("en-US"))).size === seats.length, "PLAYER_NAME_DUPLICATE");
  requireRule(seats.some((p) => p.id === hostId), "HOST_NOT_FOUND");
  requireRule(typeof id === "string" && id.length > 0, "GAME_ID_INVALID");
  requireRule(Number.isSafeInteger(now) && now >= 0, "CLOCK_INVALID");
  return {
    id, hostId, config: validateConfig(configInput, seats.length), phase: "lobby",
    players: seats.map((seat) => ({ ...seat, role: null, alive: true })), roleAcknowledgements: [],
    nightNo: 0, nightRole: null, window: null, paused: false, currentNight: null, nights: [],
    lastGuardTargetId: null, witchPotions: { save: true, poison: true }, seerReports: {},
    pendingDeaths: [], pendingHunter: null, dayDraft: null, publicEvents: [], winner: null, aborted: false, updatedAt: now,
  };
}

function move(game: Game, event: PhaseEvent) { game.phase = movePhase(game.phase, event); }
function host(game: Game, actorId: string) { requireRule(actorId === game.hostId, "FORBIDDEN"); }
function phase(game: Game, expected: Game["phase"]) { requireRule(game.phase === expected, "PHASE_MISMATCH"); }

function beginNight(game: Game) {
  game.wolfDiscussionPaused = false;
  move(game, "BEGIN_NIGHT");
  game.nightNo++;
  game.nightRole = nightRoles(game)[0]!;
  game.currentNight = {
    number: game.nightNo, actions: [], completedActorIds: [], wolfProposals: {}, wolfConfirmations: [],
    killLocked: false, killTargetId: null, witchKnowledge: null, deaths: [],
  };
  game.window = null;
  game.dayDraft = null;
}

function activeRole(game: Game, actorId: string, role: NightRole, now: number): Night {
  phase(game, "night_action");
  requireRule(game.nightRole === role, "PHASE_MISMATCH");
  requireRule(game.window && (game.wolfDiscussionPaused || now < game.window.deadline), "WINDOW_ELAPSED");
  const actor = player(game, actorId);
  requireRule(actor.alive, "ACTOR_ELIMINATED");
  requireRule(actor.role === role, "FORBIDDEN");
  return game.currentNight!;
}

function unusedAction(night: Night, actorId: string) { requireRule(!night.completedActorIds.includes(actorId), "ACTION_LOCKED"); }

function finishGame(game: Game) {
  move(game, "FINISH");
  game.window = null;
  game.nightRole = null;
  game.publicEvents.push({ type: "game_end", winner: game.winner, aborted: false });
}

function afterDeaths(game: Game, origin: "night" | "day") {
  game.window = null;
  game.winner = evaluateWin(game);
  if (game.winner !== null) finishGame(game);
  else if (origin === "night") move(game, "DAY");
  else beginNight(game);
}

function pause(game: Game, now: number) {
  game.wolfDiscussionPaused = false;
  game.paused = true;
  if (game.window) game.window.remainingMs ??= Math.max(0, game.window.deadline - now);
}

// The service supplies authenticated actorId and server time; neither is trusted from an HTTP body.
export function executeCommand(source: Game, input: unknown, now: number, random: RandomSources = {}): Game {
  const command = parseCommand(input);
  requireRule(Number.isSafeInteger(now) && now >= source.updatedAt, "CLOCK_INVALID");
  player(source, command.actorId);
  requireRule(!source.paused || ["resume", "abort", "open_hunter_window"].includes(command.type)
    || (source.wolfDiscussionPaused && ["wolf_propose", "wolf_confirm", "pause"].includes(command.type)), "GAME_PAUSED");
  const game = structuredClone(source);
  const actorId = command.actorId;
  switch (command.type) {
    case "deal":
      host(game, actorId);
      move(game, "DEAL");
      game.players = dealRoles(game.players, game.config, random.randomIndex);
      game.publicEvents.push({ type: "roles_dealt" });
      break;
    case "acknowledge":
      phase(game, "reveal");
      if (!game.roleAcknowledgements.includes(actorId)) game.roleAcknowledgements.push(actorId);
      break;
    case "begin_night":
      host(game, actorId);
      phase(game, "reveal");
      requireRule(game.roleAcknowledgements.length === game.players.length, "PLAYERS_NOT_READY");
      beginNight(game);
      break;
    case "open_window":
      host(game, actorId);
      move(game, "OPEN");
      game.window = { openedAt: now, deadline: now + actionDuration(game.nightRole!), remainingMs: null };
      if (game.nightRole === "witch" && game.witchPotions.save) {
        const witch = game.players.find((p) => p.role === "witch" && p.alive);
        if (witch) game.currentNight!.witchKnowledge = { actorId: witch.id, targetId: game.currentNight!.killTargetId };
      }
      break;
    case "close_window":
      host(game, actorId);
      phase(game, "night_action");
      requireRule(now >= game.window!.deadline, "WINDOW_STILL_OPEN");
      if (!windowComplete(game)) { pause(game, now); game.wolfDiscussionPaused = game.nightRole === "werewolf"; }
      else { move(game, "CLOSE"); game.window = null; }
      break;
    case "finish_role": {
      host(game, actorId);
      phase(game, "night_close");
      const roles = nightRoles(game);
      const next = roles[roles.indexOf(game.nightRole!) + 1];
      if (next) { move(game, "NEXT_ROLE"); game.nightRole = next; }
      else {
        move(game, "RESOLVE");
        const night = game.currentNight!;
        night.deaths = resolveDeaths(game, night);
        for (const death of night.deaths) player(game, death.playerId).alive = false;
        game.pendingDeaths = structuredClone(night.deaths);
        game.nights.push(structuredClone(night));
        game.nightRole = null;
      }
      break;
    }
    case "publish_dawn": {
      host(game, actorId);
      phase(game, "dawn");
      const deaths = game.pendingDeaths;
      game.publicEvents.push({ type: "deaths", nightNo: game.nightNo, playerIds: deaths.map((d) => d.playerId),
        revealedHunters: deaths.filter((d) => player(game, d.playerId).role === "hunter").map((d) => d.playerId) });
      const hunter = hunterEligible(game, deaths);
      game.pendingDeaths = [];
      if (hunter) { move(game, "HUNTER"); game.pendingHunter = { playerId: hunter, origin: "night" }; game.window = { openedAt: now, deadline: now + 10_000, remainingMs: null }; }
      else afterDeaths(game, "night");
      break;
    }
    case "guard": {
      const night = activeRole(game, actorId, "guard", now);
      unusedAction(night, actorId);
      if (command.targetId !== null) {
        livingTarget(game, command.targetId);
        requireRule(command.targetId !== game.lastGuardTargetId, "GUARD_REPEAT_FORBIDDEN");
      }
      night.actions.push({ actorId, kind: "guard", targetId: command.targetId });
      night.completedActorIds.push(actorId);
      game.lastGuardTargetId = command.targetId;
      break;
    }
    case "wolf_propose": {
      const night = activeRole(game, actorId, "werewolf", now);
      requireRule(!night.killLocked, "ACTION_LOCKED");
      if (command.targetId !== null) livingTarget(game, command.targetId);
      if (!Object.hasOwn(night.wolfProposals, actorId) || night.wolfProposals[actorId] !== command.targetId) {
        night.wolfProposals[actorId] = command.targetId;
        night.wolfConfirmations = [];
      }
      break;
    }
    case "wolf_confirm": {
      const night = activeRole(game, actorId, "werewolf", now);
      requireRule(!night.killLocked, "ACTION_LOCKED");
      const actors = actorIds(game);
      requireRule(actors.every((id) => Object.hasOwn(night.wolfProposals, id)), "WOLF_CONSENSUS_REQUIRED");
      const targets = actors.map((id) => night.wolfProposals[id]);
      requireRule(new Set(targets).size === 1, "WOLF_CONSENSUS_REQUIRED");
      if (!night.wolfConfirmations.includes(actorId)) night.wolfConfirmations.push(actorId);
      if (actors.every((id) => night.wolfConfirmations.includes(id))) {
        night.wolfConfirmations = [...actors];
        night.wolfProposals = Object.fromEntries(actors.map((id) => [id, night.wolfProposals[id]!]));
        night.killLocked = true;
        night.killTargetId = targets[0]!;
        if (game.wolfDiscussionPaused) {
          game.wolfDiscussionPaused = false; game.paused = false;
          move(game, "CLOSE"); game.window = null;
        }
      }
      break;
    }
    case "seer": {
      const night = activeRole(game, actorId, "seer", now);
      unusedAction(night, actorId);
      if (command.targetId !== null) {
        requireRule(command.targetId !== actorId, "SELF_TARGET_FORBIDDEN");
        const target = livingTarget(game, command.targetId);
        if (!Object.hasOwn(game.seerReports, actorId)) game.seerReports[actorId] = [];
        game.seerReports[actorId]!.push({ nightNo: game.nightNo, targetId: target.id, alignment: target.role === "werewolf" ? "wolf" : "good" });
      }
      night.actions.push({ actorId, kind: "see", targetId: command.targetId });
      night.completedActorIds.push(actorId);
      break;
    }
    case "witch": {
      const night = activeRole(game, actorId, "witch", now);
      unusedAction(night, actorId);
      if (command.choice === "pass") requireRule(command.targetId === null, "PASS_TARGET_FORBIDDEN");
      else livingTarget(game, command.targetId);
      if (command.choice === "save") {
        requireRule(game.witchPotions.save, "WITCH_SAVE_EXHAUSTED");
        requireRule(night.killTargetId !== null && command.targetId === night.killTargetId, "SAVE_TARGET_INVALID");
        requireRule(command.targetId !== actorId || game.nightNo === 1, "WITCH_SELF_SAVE_FORBIDDEN");
        game.witchPotions.save = false;
      }
      if (command.choice === "poison") {
        requireRule(game.witchPotions.poison, "WITCH_POISON_EXHAUSTED");
        game.witchPotions.poison = false;
      }
      night.actions.push({ actorId, kind: command.choice, targetId: command.targetId });
      night.completedActorIds.push(actorId);
      break;
    }
    case "open_hunter_window":
      host(game, actorId); phase(game, "hunter");
      requireRule(!game.window, "ACTION_LOCKED");
      game.window = { openedAt: now, deadline: now + 10_000, remainingMs: game.paused ? 10_000 : null };
      break;
    case "close_hunter_window":
      host(game, actorId); phase(game, "hunter");
      requireRule(game.window && now >= game.window.deadline, "WINDOW_STILL_OPEN");
      pause(game, now);
      break;
    case "hunter": {
      phase(game, "hunter");
      requireRule(game.pendingHunter?.playerId === actorId, "FORBIDDEN");
      requireRule(game.window && now < game.window.deadline, "WINDOW_ELAPSED");
      const origin = game.pendingHunter.origin;
      if (command.targetId !== null) {
        requireRule(command.targetId !== actorId, "SELF_TARGET_FORBIDDEN");
        livingTarget(game, command.targetId).alive = false;
        if (origin === "night") {
          const death = { playerId: command.targetId, causes: ["shot" as const] };
          game.currentNight!.deaths.push(death);
          game.nights.at(-1)!.deaths.push(structuredClone(death));
        }
      }
      game.publicEvents.push({ type: "hunter_reaction", nightNo: game.nightNo, origin, playerId: actorId, targetId: command.targetId });
      game.pendingHunter = null;
      afterDeaths(game, origin);
      break;
    }
    case "day_draft":
      host(game, actorId);
      phase(game, "day");
      if (command.targetId !== null) livingTarget(game, command.targetId);
      game.dayDraft = { targetId: command.targetId, confirmed: false };
      break;
    case "day_confirm":
      host(game, actorId);
      phase(game, "day");
      requireRule(game.dayDraft, "VOTE_DRAFT_REQUIRED");
      game.dayDraft.confirmed = true;
      break;
    case "day_publish": {
      host(game, actorId);
      phase(game, "day");
      requireRule(game.dayDraft?.confirmed, "VOTE_NOT_CONFIRMED");
      const targetId = game.dayDraft.targetId;
      if (targetId !== null) livingTarget(game, targetId).alive = false;
      const isHunter = targetId !== null && player(game, targetId).role === "hunter";
      game.publicEvents.push({ type: "day_vote", nightNo: game.nightNo, playerId: targetId, revealedHunterId: isHunter ? targetId : null });
      game.dayDraft = null;
      if (isHunter) { move(game, "HUNTER"); game.pendingHunter = { playerId: targetId, origin: "day" }; game.window = { openedAt: now, deadline: now + 10_000, remainingMs: null }; }
      else afterDeaths(game, "day");
      break;
    }
    case "pause":
      host(game, actorId);
      requireRule(game.phase !== "lobby" && game.phase !== "end", "PHASE_MISMATCH");
      pause(game, now);
      break;
    case "resume":
      host(game, actorId);
      requireRule(game.paused, "GAME_NOT_PAUSED");
      game.paused = false;
      game.wolfDiscussionPaused = false;
      if (game.window) { game.window.deadline = now + game.window.remainingMs! + Math.min(30_000, actionDuration(game.phase === "hunter" ? "hunter" : game.nightRole!)); game.window.remainingMs = null; }
      break;
    case "abort":
      host(game, actorId);
      move(game, "ABORT");
      game.aborted = true;
      game.winner = null;
      game.paused = false;
      game.window = null;
      game.wolfDiscussionPaused = false;
      game.pendingHunter = null;
      game.nightRole = null;
      game.publicEvents.push({ type: "game_end", winner: null, aborted: true });
      break;
    case "restart": {
      host(game, actorId);
      move(game, "RESTART");
      const id = (random.newGameId ?? randomUUID)();
      requireRule(id !== source.id, "GAME_ID_REUSED");
      return createGame(game.config, game.players.map(({ id, name, seat }) => ({ id, name, seat })), game.hostId, id, now);
    }
    default: { const exhaustive: never = command; throw new RuleError(String(exhaustive)); }
  }
  game.updatedAt = now;
  return game;
}

export function seerReports(game: Game, actorId: string): SeerReport[] {
  requireRule(player(game, actorId).role === "seer", "FORBIDDEN");
  return structuredClone(Object.hasOwn(game.seerReports, actorId) ? game.seerReports[actorId]! : []);
}

export function witchKnowledge(game: Game, actorId: string) {
  const actor = player(game, actorId);
  requireRule(actor.role === "witch", "FORBIDDEN");
  requireRule(actor.alive, "ACTOR_ELIMINATED");
  const known = game.currentNight?.witchKnowledge;
  return {
    saveRemaining: game.witchPotions.save, poisonRemaining: game.witchPotions.poison,
    canSeeWolfTarget: known?.actorId === actorId,
    ...(known?.actorId === actorId ? { wolfTargetId: known.targetId } : {}),
  };
}

export function recap(game: Game, actorId: string) {
  player(game, actorId);
  phase(game, "end");
  return structuredClone({ gameId: game.id, config: game.config, participants: game.players, nights: game.nights,
    publicEvents: game.publicEvents, winner: game.winner, aborted: game.aborted });
}

export function actorForRole(game: Game, role: Role): string | null {
  return game.players.find((p) => p.alive && p.role === role)?.id ?? null;
}

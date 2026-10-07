import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createGame, executeCommand, recap } from "../src/game/engine";
import { evaluateWin, resolveDeaths } from "../src/game/rules";
import { config, seats, command, day, deepFreeze, nightToDawn, revealed, started, vote } from "./helpers";

describe("simultaneous night deaths", () => {
  it.each([
    [null, "pass", false], ["p8", "pass", true],
    [null, "save", true], ["p8", "save", true],
    [null, "poison", false], ["p8", "poison", false],
  ] as const)("guard %s with %s has survival=%s", (guard, choice, survives) => {
    const game = nightToDawn(started(), { guard, kill: "p8", witch: { choice, targetId: choice === "pass" ? null : "p8" } });
    expect(game.players.find((p) => p.id === "p8")!.alive).toBe(survives);
    expect(game.publicEvents).toEqual([{ type: "roles_dealt" }]);
    expect(game.winner).toBeNull();
  });
  it("allows a dying witch to poison and settles both deaths together", () => {
    const game = nightToDawn(started(), { kill: "p4", witch: { choice: "poison", targetId: "p1" } });
    expect(game.pendingDeaths).toEqual([
      { playerId: "p1", causes: ["poison"] }, { playerId: "p4", causes: ["wolf"] },
    ]);
    expect(game.witchPotions.poison).toBe(false);
  });
  it("does not use the previous night's guard for this night", () => {
    const first = day(started(), { guard: "p8" });
    const second = nightToDawn(vote(first, null), { guard: null, kill: "p8" });
    expect(second.players.find((p) => p.id === "p8")!.alive).toBe(false);
  });
  it("deduplicates poison and wolf casualties", () => {
    const game = nightToDawn(started(), { kill: "p8", witch: { choice: "poison", targetId: "p8" } });
    expect(game.pendingDeaths).toEqual([{ playerId: "p8", causes: ["wolf", "poison"] }]);
  });
  it("does not depend on the arrival order of confirmed non-wolf actions", () => {
    const game = started();
    const completed = nightToDawn(game, { guard: "p4", kill: "p8", witch: { choice: "poison", targetId: "p5" }, see: "p1" });
    const night = completed.nights[0]!;
    const initial = structuredClone(game);
    fc.assert(fc.property(fc.shuffledSubarray(night.actions, { minLength: night.actions.length, maxLength: night.actions.length }), (actions) => {
      expect(resolveDeaths(initial, { ...night, actions })).toEqual(night.deaths);
    }), { numRuns: 100, seed: 61008 });
  });
});

describe("hunter disclosure and reaction", () => {
  it("publishes a wolf-killed hunter only with the dawn announcement", () => {
    const dawn = nightToDawn(started(), { kill: "p6" });
    expect(dawn.phase).toBe("dawn");
    expect(dawn.publicEvents).toEqual([{ type: "roles_dealt" }]);
    const game = command(dawn, { type: "publish_dawn", actorId: "p1" });
    expect(game.phase).toBe("hunter");
    expect(game.publicEvents.at(-1)).toMatchObject({ revealedHunters: ["p6"] });
    expect(command(game, { type: "hunter", actorId: "p6", targetId: null }).phase).toBe("day");
    expect(() => command(game, { type: "hunter", actorId: "p1", targetId: null })).toThrow("FORBIDDEN");
    expect(() => command(game, { type: "hunter", actorId: "p6", targetId: "p6" })).toThrow("SELF_TARGET_FORBIDDEN");
    const deadTarget = structuredClone(game); deadTarget.players[7]!.alive = false;
    expect(() => command(deadTarget, { type: "hunter", actorId: "p6", targetId: "p8" })).toThrow("TARGET_NOT_ALIVE");
    const done = command(game, { type: "hunter", actorId: "p6", targetId: "p1" });
    expect(done.players[0]!.alive).toBe(false);
    expect(() => command(done, { type: "hunter", actorId: "p6", targetId: null })).toThrow("PHASE_MISMATCH");
  });
  it.each([null, "p6"])("poison suppresses the hunter gun even with kill=%s", (kill) => {
    const game = day(started(), { kill, witch: { choice: "poison", targetId: "p6" } });
    expect(game.phase).toBe("day");
    expect(game.pendingHunter).toBeNull();
    expect(game.publicEvents.at(-1)).toMatchObject({ revealedHunters: ["p6"] });
    expect(JSON.stringify(game.publicEvents)).not.toContain("poison");
    expect(() => command(game, { type: "hunter", actorId: "p6", targetId: "p1" })).toThrow("PHASE_MISMATCH");
  });
  it("guard does not prevent a poisoned hunter from dying or grant a gun", () => {
    const game = day(started(), { guard: "p6", kill: "p6", witch: { choice: "poison", targetId: "p6" } });
    expect(game.nights[0]!.deaths).toEqual([{ playerId: "p6", causes: ["poison"] }]);
    expect(game.pendingHunter).toBeNull();
  });
  it("waits for the last god's hunter reaction before edge victory", () => {
    const initial = started();
    for (const p of initial.players) if (["p2", "p3", "p4", "p5"].includes(p.id)) p.alive = false;
    const game = day(initial, { kill: "p6" });
    expect(game.phase).toBe("hunter");
    expect(game.winner).toBeNull();
    expect(command(game, { type: "hunter", actorId: "p6", targetId: "p1" }).winner).toBe("good");
    expect(command(game, { type: "hunter", actorId: "p6", targetId: null }).winner).toBe("wolf");
  });
  it("allows a voted-out hunter to shoot or pass before starting the next night", () => {
    const game = vote(day(started()), "p6");
    expect(game.phase).toBe("hunter");
    expect(game.publicEvents.at(-1)).toMatchObject({ revealedHunterId: "p6" });
    expect(command(game, { type: "hunter", actorId: "p6", targetId: null }).nightNo).toBe(2);
    const shot = command(game, { type: "hunter", actorId: "p6", targetId: "p1" });
    expect(shot.phase).toBe("night_open");
    expect(shot.players[0]!.alive).toBe(false);
  });
});

describe("victory and reset", () => {
  it("distinguishes parity from edge victory", () => {
    const game = revealed();
    for (const p of game.players) p.alive = ["p1", "p2", "p3", "p7"].includes(p.id);
    expect(evaluateWin(game)).toBeNull();
    game.config.winMode = "parity";
    expect(evaluateWin(game)).toBe("wolf");
  });
  it.each(["villager", "gods"])("edge wins after eliminating all %s", (kind) => {
    const game = revealed();
    for (const p of game.players) if (kind === "villager" ? p.role === "villager" : p.role !== "villager" && p.role !== "werewolf") p.alive = false;
    expect(evaluateWin(game)).toBe("wolf");
  });
  it("checks total extinction before the zero-wolf good victory", () => {
    const game = revealed();
    for (const p of game.players) p.alive = false;
    expect(evaluateWin(game)).toBe("draw");
    game.players[7]!.alive = true;
    expect(evaluateWin(game)).toBe("good");
    expect(() => evaluateWin(createGame(config, seats, "p1"))).toThrow("ROLES_NOT_DEALT");
  });
  it("settles the last wolf and witch together as a draw", () => {
    const initial = started();
    for (const p of initial.players) p.alive = ["p1", "p4"].includes(p.id);
    const game = day(initial, { kill: "p4", witch: { choice: "poison", targetId: "p1" } });
    expect(game.winner).toBe("draw");
    expect(game.phase).toBe("end");
  });
  it("does not require a daytime vote to finish after a night victory", () => {
    const initial = started();
    initial.players[1]!.alive = false;
    const game = day(initial, { witch: { choice: "poison", targetId: "p1" } });
    expect(game.winner).toBe("good");
    expect(game.phase).toBe("end");
    expect(game.publicEvents.at(-1)).toMatchObject({ type: "game_end", winner: "good" });
  });
  it("records an aborted game without inventing a winner", () => {
    const game = command(started(), { type: "abort", actorId: "p1" });
    expect(game.phase).toBe("end");
    expect(game.winner).toBeNull();
    expect(game.aborted).toBe(true);
    const report = recap(game, "p8"); report.participants.pop();
    expect(recap(game, "p8").participants).toHaveLength(8);
    expect(() => recap(game, "outsider")).toThrow("PLAYER_NOT_FOUND");
    expect(() => recap(started(), "p1")).toThrow("PHASE_MISMATCH");
    const restarted = command(deepFreeze(game), { type: "restart", actorId: "p1" });
    expect(restarted.id).toBe("next-game");
    expect(restarted.phase).toBe("lobby");
    expect(restarted.players.every((p) => p.alive && p.role === null)).toBe(true);
    expect(restarted.witchPotions).toEqual({ save: true, poison: true });
    expect(restarted.seerReports).toEqual({});
    expect(restarted.nights).toEqual([]);
    expect(restarted.publicEvents).toEqual([]);
    expect(restarted.lastGuardTargetId).toBeNull();
    expect(() => executeCommand(game, { type: "restart", actorId: "p1" }, game.updatedAt, { newGameId: () => game.id })).toThrow("GAME_ID_REUSED");
    expect(command(restarted, { type: "deal", actorId: "p1" }).players.every((p) => p.role !== null)).toBe(true);
  });
});

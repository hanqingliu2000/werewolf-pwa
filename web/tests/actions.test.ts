import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { actorForRole, seerReports, witchKnowledge } from "../src/game/engine";
import { command, day, deepFreeze, finish, open, roleId, started, toRole, vote, wolves } from "./helpers";

describe("role actions and confirmation", () => {
  it("requires acknowledgements before opening the first night", () => {
    const game = started();
    expect(() => command(game, { type: "begin_night", actorId: "p1" })).toThrow("PHASE_MISMATCH");
    expect(() => command(game, { type: "acknowledge", actorId: "p1" })).toThrow("PHASE_MISMATCH");
  });
  it("allows self-guard and rejects repeat confirmation without mutation", () => {
    const initial = deepFreeze(open(started()));
    const guard = roleId(initial, "guard");
    const game = command(initial, { type: "guard", actorId: guard, targetId: guard });
    expect(initial.currentNight!.actions).toHaveLength(0);
    expect(game.lastGuardTargetId).toBe(guard);
    const before = structuredClone(game);
    expect(() => command(game, { type: "guard", actorId: guard, targetId: null })).toThrow("ACTION_LOCKED");
    expect(game).toEqual(before);
  });
  it("rejects consecutive guard, but permits guard / pass / guard", () => {
    let game = started();
    const guard = roleId(game, "guard");
    game = vote(day(game, { guard }), null);
    expect(() => command(open(game), { type: "guard", actorId: guard, targetId: guard })).toThrow("GUARD_REPEAT_FORBIDDEN");
    game = vote(day(game, { guard: null }), null);
    expect(command(open(game), { type: "guard", actorId: guard, targetId: guard }).lastGuardTargetId).toBe(guard);
  });
  it("allows repeated empty guards", () => {
    const game = vote(day(started()), null);
    expect(command(open(game), { type: "guard", actorId: roleId(game, "guard"), targetId: null }).lastGuardTargetId).toBeNull();
  });
  it("enforces actor, target and phase boundaries", () => {
    const game = open(started());
    const guard = roleId(game, "guard");
    expect(() => command(game, { type: "guard", actorId: "absent", targetId: null })).toThrow("PLAYER_NOT_FOUND");
    expect(() => command(game, { type: "guard", actorId: "p1", targetId: null })).toThrow("FORBIDDEN");
    expect(() => command(game, { type: "guard", actorId: guard, targetId: "missing" })).toThrow("PLAYER_NOT_FOUND");
    const dead = structuredClone(game); dead.players[7]!.alive = false;
    expect(() => command(dead, { type: "guard", actorId: guard, targetId: "p8" })).toThrow("TARGET_NOT_ALIVE");
    dead.players.find((p) => p.id === guard)!.alive = false;
    expect(() => command(dead, { type: "guard", actorId: guard, targetId: null })).toThrow("ACTOR_ELIMINATED");
    expect(actorForRole(dead, "guard")).toBeNull();
    expect(() => command(game, { type: "seer", actorId: roleId(game, "seer"), targetId: null })).toThrow("PHASE_MISMATCH");
  });
});

describe("wolf consensus", () => {
  it("requires proposals and agreement before confirmation", () => {
    let game = toRole(started(), "werewolf");
    expect(() => command(game, { type: "wolf_confirm", actorId: "p1" })).toThrow("WOLF_CONSENSUS_REQUIRED");
    game = command(game, { type: "wolf_propose", actorId: "p1", targetId: "p1" });
    game = command(game, { type: "wolf_propose", actorId: "p2", targetId: "p2" });
    expect(() => command(game, { type: "wolf_confirm", actorId: "p1" })).toThrow("WOLF_CONSENSUS_REQUIRED");
    game = command(game, { type: "wolf_propose", actorId: "p2", targetId: "p1" });
    game = command(game, { type: "wolf_confirm", actorId: "p1" });
    expect(game.currentNight!.killLocked).toBe(false);
    expect(command(game, { type: "wolf_confirm", actorId: "p1" }).currentNight!.wolfConfirmations).toEqual(["p1"]);
    game = command(game, { type: "wolf_confirm", actorId: "p2" });
    expect(game.currentNight!.killTargetId).toBe("p1");
    expect(() => command(game, { type: "wolf_propose", actorId: "p1", targetId: null })).toThrow("ACTION_LOCKED");
    expect(() => command(game, { type: "wolf_confirm", actorId: "p1" })).toThrow("ACTION_LOCKED");
  });
  it("invalidates prior confirmations after a proposal change", () => {
    let game = toRole(started(), "werewolf");
    for (const actorId of ["p1", "p2"]) game = command(game, { type: "wolf_propose", actorId, targetId: "p8" });
    game = command(game, { type: "wolf_confirm", actorId: "p1" });
    expect(command(game, { type: "wolf_propose", actorId: "p1", targetId: "p8" }).currentNight!.wolfConfirmations).toEqual(["p1"]);
    game = command(game, { type: "wolf_propose", actorId: "p2", targetId: null });
    expect(game.currentNight!.wolfConfirmations).toEqual([]);
  });
  it("distinguishes a jointly confirmed empty kill from no proposal", () => {
    const game = wolves(toRole(started(), "werewolf"), null);
    expect(game.currentNight!.killLocked).toBe(true);
    expect(game.currentNight!.killTargetId).toBeNull();
  });
  it("locks the same target regardless of proposal and confirmation order", () => {
    fc.assert(fc.property(fc.boolean(), fc.boolean(), fc.constantFrom("p1", "p2", "p8", null), (reverseProposal, reverseConfirmation, targetId) => {
      let game = toRole(started(), "werewolf");
      for (const actorId of reverseProposal ? ["p2", "p1"] : ["p1", "p2"]) game = command(game, { type: "wolf_propose", actorId, targetId });
      for (const actorId of reverseConfirmation ? ["p2", "p1"] : ["p1", "p2"]) game = command(game, { type: "wolf_confirm", actorId });
      expect(game.currentNight!.killLocked).toBe(true);
      expect(game.currentNight!.killTargetId).toBe(targetId);
      expect(game.currentNight).toEqual(wolves(toRole(started(), "werewolf"), targetId).currentNight);
    }), { numRuns: 100, seed: 61007 });
  });
});

describe("witch and seer", () => {
  it("supports first-night self-save and locks against double medicine", () => {
    let game = toRole(started(), "witch", { kill: "p4" });
    expect(witchKnowledge(game, "p4")).toMatchObject({ canSeeWolfTarget: true, wolfTargetId: "p4" });
    game = command(game, { type: "witch", actorId: "p4", choice: "save", targetId: "p4" });
    expect(game.witchPotions).toEqual({ save: false, poison: true });
    expect(() => command(game, { type: "witch", actorId: "p4", choice: "poison", targetId: "p1" })).toThrow("ACTION_LOCKED");
    expect(witchKnowledge(game, "p4").wolfTargetId).toBe("p4");
  });
  it("rejects self-save on night two without spending medicine", () => {
    const game = toRole(vote(day(started()), null), "witch", { kill: "p4" });
    expect(() => command(game, { type: "witch", actorId: "p4", choice: "save", targetId: "p4" })).toThrow("WITCH_SELF_SAVE_FORBIDDEN");
    expect(game.witchPotions.save).toBe(true);
  });
  it("stops showing new wolf targets after the antidote is spent", () => {
    const night = day(started(), { kill: "p8", witch: { choice: "save", targetId: "p8" } });
    const game = toRole(vote(night, null), "witch", { kill: "p7" });
    expect(witchKnowledge(game, "p4")).toEqual({ saveRemaining: false, poisonRemaining: true, canSeeWolfTarget: false });
    expect(() => command(game, { type: "witch", actorId: "p4", choice: "save", targetId: "p7" })).toThrow("WITCH_SAVE_EXHAUSTED");
  });
  it("reveals no target before the witch window opens", () => {
    const game = finish(wolves(toRole(started(), "werewolf"), "p8"));
    expect(game.nightRole).toBe("witch");
    expect(witchKnowledge(game, "p4").canSeeWolfTarget).toBe(false);
  });
  it("rejects wrong, missing or empty-kill save targets", () => {
    const game = toRole(started(), "witch", { kill: "p8" });
    expect(() => command(game, { type: "witch", actorId: "p4", choice: "save", targetId: "p7" })).toThrow("SAVE_TARGET_INVALID");
    expect(() => command(game, { type: "witch", actorId: "p4", choice: "save", targetId: null })).toThrow("TARGET_REQUIRED");
    const empty = toRole(started(), "witch");
    expect(witchKnowledge(empty, "p4").wolfTargetId).toBeNull();
    expect(() => command(empty, { type: "witch", actorId: "p4", choice: "save", targetId: "p8" })).toThrow("SAVE_TARGET_INVALID");
  });
  it("permits self-poison, rejects a target on pass and exhausted poison", () => {
    const game = toRole(started(), "witch");
    expect(command(game, { type: "witch", actorId: "p4", choice: "poison", targetId: "p4" }).witchPotions.poison).toBe(false);
    expect(() => command(game, { type: "witch", actorId: "p4", choice: "pass", targetId: "p8" })).toThrow("PASS_TARGET_FORBIDDEN");
    const next = toRole(vote(day(started(), { witch: { choice: "poison", targetId: "p8" } }), null), "witch");
    expect(() => command(next, { type: "witch", actorId: "p4", choice: "poison", targetId: "p7" })).toThrow("WITCH_POISON_EXHAUSTED");
  });
  it("does not expose witch information to another role or dead witch", () => {
    const game = toRole(started(), "witch");
    expect(() => witchKnowledge(game, "p1")).toThrow("FORBIDDEN");
    game.players.find((p) => p.id === "p4")!.alive = false;
    expect(() => witchKnowledge(game, "p4")).toThrow("ACTOR_ELIMINATED");
  });
  it("seer receives alignment only, may repeat and may pass", () => {
    let game = toRole(started(), "seer");
    expect(() => command(game, { type: "seer", actorId: "p3", targetId: "p3" })).toThrow("SELF_TARGET_FORBIDDEN");
    game = command(game, { type: "seer", actorId: "p3", targetId: "p4" });
    expect(seerReports(game, "p3")).toEqual([{ nightNo: 1, targetId: "p4", alignment: "good" }]);
    const copy = seerReports(game, "p3"); copy.pop();
    expect(seerReports(game, "p3")).toHaveLength(1);
    expect(() => seerReports(game, "p1")).toThrow("FORBIDDEN");
    game = command(finish(game), { type: "publish_dawn", actorId: "p1" });
    game = toRole(vote(game, null), "seer");
    game = command(game, { type: "seer", actorId: "p3", targetId: "p4" });
    expect(seerReports(game, "p3")).toHaveLength(2);
    expect(command(toRole(started(), "seer"), { type: "seer", actorId: "p3", targetId: null }).seerReports).toEqual({});
    const wolf = command(toRole(started(), "seer"), { type: "seer", actorId: "p3", targetId: "p1" });
    expect(seerReports(wolf, "p3")[0]!.alignment).toBe("wolf");
  });
});

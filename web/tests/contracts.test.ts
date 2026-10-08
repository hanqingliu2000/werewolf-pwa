import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseCommand } from "../src/game/commands";
import { createGame, executeCommand, seerReports } from "../src/game/engine";
import { RULES_VERSION } from "../src/game/config";
import { RuleError } from "../src/game/errors";
import { config, seats, command, day, deepFreeze, fixedRandom, nightToDawn, open, started, toRole, vote } from "./helpers";

describe("runtime command boundaries", () => {
  it.each([
    {}, null, [], { type: "unknown", actorId: "p1" },
    { type: "guard", actorId: "p5" }, { type: "guard", actorId: "p5", targetId: "" },
    { type: "witch", actorId: "p4", choice: "both", targetId: "p8" },
    { type: "pause", actorId: "p1", role: "hunter" },
    { type: "pause", actorId: "" },
  ])("rejects malformed or extra fields %#", (input) => {
    expect(() => parseCommand(input)).toThrow("COMMAND_INVALID");
    const game = deepFreeze(started());
    const before = JSON.stringify(game);
    expect(() => executeCommand(game, input, game.updatedAt)).toThrow(RuleError);
    expect(JSON.stringify(game)).toBe(before);
  });
  it("handles own-record keys without reading Object.prototype", () => {
    const profiles = seats.map((p, i) => ({ ...p, id: i === 2 ? "toString" : p.id }));
    let game = createGame(config, profiles, "p1", "prototype-test");
    game = command(game, { type: "deal", actorId: "p1" });
    game = command(game, { type: "begin_night", actorId: "p1" });
    expect(seerReports(game, "toString")).toEqual([]);
    game = toRole(game, "seer");
    game = command(game, { type: "seer", actorId: "toString", targetId: "p1" });
    expect(seerReports(game, "toString")).toEqual([{ nightNo: 1, targetId: "p1", alignment: "wolf" }]);
  });
  it("never mutates a source snapshot for legal or illegal guard commands", () => {
    fc.assert(fc.property(fc.constantFrom(null, "p1", "p5", "p8", "missing"), (targetId) => {
      const source = deepFreeze(open(started()));
      const before = JSON.stringify(source);
      try { executeCommand(source, { type: "guard", actorId: "p5", targetId }, source.updatedAt, fixedRandom); }
      catch (error) { expect(error).toBeInstanceOf(RuleError); }
      expect(JSON.stringify(source)).toBe(before);
    }), { numRuns: 100, seed: 61009 });
  });
  it("retains resource-empty witch windows without demanding an unavailable action", () => {
    let game = vote(day(started(), { kill: "p8", witch: { choice: "save", targetId: "p8" } }), null);
    game = vote(day(game, { witch: { choice: "poison", targetId: "p8" } }), null);
    game = toRole(game, "witch");
    expect(game.witchPotions).toEqual({ save: false, poison: false });
    expect(game.window!.deadline - game.window!.openedAt).toBe(10_000);
    game = command(game, { type: "close_window", actorId: game.hostId }, game.window!.deadline);
    expect(game.paused).toBe(false);
    expect(game.phase).toBe("night_close");
  });
  it("keeps the original rules version and setup after reset", () => {
    const source = command(started(), { type: "abort", actorId: "p1" });
    const reset = command(source, { type: "restart", actorId: "p1" });
    expect(reset.config).toEqual(source.config);
    expect(reset.config.version).toBe(RULES_VERSION);
    expect(createGame(config, seats, "p1").id).toMatch(/^[0-9a-f-]{36}$/);
    expect(executeCommand(source, { type: "restart", actorId: "p1" }, source.updatedAt).id).not.toBe(source.id);
  });
  it("keeps hunter gun results in the correct night or day log", () => {
    let night = day(started(), { kill: "p6" });
    night = command(night, { type: "hunter", actorId: "p6", targetId: "p1" });
    expect(night.nights[0]!.deaths).toContainEqual({ playerId: "p1", causes: ["shot"] });
    expect(night.publicEvents.at(-1)).toMatchObject({ type: "hunter_reaction", origin: "night", nightNo: 1 });
    let daytime = vote(day(started()), "p6");
    daytime = command(daytime, { type: "hunter", actorId: "p6", targetId: "p1" });
    expect(daytime.nights[0]!.deaths).toEqual([]);
    expect(daytime.publicEvents.at(-1)).toMatchObject({ type: "hunter_reaction", origin: "day", nightNo: 1 });
  });
  it("rejects acknowledgements from outsiders and wrong hunter phases", () => {
    expect(() => command(started(), { type: "hunter", actorId: "p6", targetId: null })).toThrow("PHASE_MISMATCH");
    expect(() => command(started(), { type: "acknowledge", actorId: "outsider" })).toThrow("PLAYER_NOT_FOUND");
  });
  it("does not publicly expose non-hunter roles or internal causes", () => {
    const game = nightToDawn(started(), { kill: "p3", witch: { choice: "poison", targetId: "p5" } });
    const publicGame = command(game, { type: "publish_dawn", actorId: "p1" });
    expect(publicGame.publicEvents.at(-1)).toEqual({ type: "deaths", nightNo: 1, playerIds: ["p3", "p5"], revealedHunters: [] });
    expect(JSON.stringify(publicGame.publicEvents)).not.toMatch(/seer|guard|poison|causes/);
  });
});

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { preset, validateConfig } from "../src/game/config";
import { createGame } from "../src/game/engine";
import { dealRoles } from "../src/game/random";
import { movePhase } from "../src/game/lifecycle";
import { ROLES } from "../src/game/types";
import { config, seats } from "./helpers";

describe("configuration and dealing", () => {
  it.each([8, 9, 10, 11, 12])("validates the %i-player candidate", (n) => {
    const rules = preset(n);
    expect(validateConfig(rules, n)).toEqual(rules);
    expect(Object.values(rules.roles).reduce((a, b) => a + b, 0)).toBe(n);
    expect(rules.winMode).toBe("edge");
    expect(preset(n, "parity").winMode).toBe("parity");
  });
  it.each([7, 13, 8.5, NaN])("rejects unsupported preset %s", (n) => expect(() => preset(n)).toThrow("CONFIG_INVALID"));
  it.each([
    { ...config, version: "old" }, { ...config, winMode: "unknown" }, { ...config, extra: true },
    { ...config, roles: { ...config.roles, guard: 2 } },
    { ...config, roles: { ...config.roles, werewolf: 0 } },
    { ...config, roles: { ...config.roles, werewolf: 4, villager: 0 } },
    { ...config, roles: { ...config.roles, werewolf: 4 } },
    { ...config, roles: { ...config.roles, villager: -1 } },
    { ...config, roles: { ...config.roles, villager: 7 } },
    { ...config, roles: { ...config.roles, villager: 2.5 } },
    { ...config, roles: { ...config.roles, seer: 0, witch: 0, guard: 0, hunter: 0, villager: 6 } },
  ])("rejects invalid rule composition %#", (input) => expect(() => validateConfig(input)).toThrow("CONFIG_INVALID"));
  it("rejects a player-count mismatch", () => expect(() => validateConfig(config, 9)).toThrow("PLAYER_COUNT_MISMATCH"));
  it("preserves roles and seats under randomized shuffling", () => {
    fc.assert(fc.property(fc.integer({ min: 8, max: 12 }), fc.array(fc.nat(), { minLength: 12, maxLength: 12 }), (n, draws) => {
      const participants = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, seat: i + 1, name: `P${i}` }));
      const before = structuredClone(participants);
      let index = 0;
      const rules = preset(n);
      const dealt = dealRoles(participants, rules, (max) => draws[index++]! % max);
      expect(participants).toEqual(before);
      for (const role of ROLES) expect(dealt.filter((p) => p.role === role)).toHaveLength(rules.roles[role]);
      expect(dealt.map((p) => p.id)).toEqual(participants.map((p) => p.id));
    }), { numRuns: 200, seed: 61006 });
  });
  it("uses the supplied random source instead of fixed alphabetical assignment", () => {
    const a = dealRoles(seats, config, (max) => max - 1);
    const b = dealRoles([...seats].reverse(), config, () => 0);
    expect(a.map((p) => p.role)).not.toEqual(b.map((p) => p.role));
    expect(a.map((p) => p.seat)).toEqual(b.map((p) => p.seat));
    expect(dealRoles(seats, config)).toHaveLength(8);
  });
  it.each([-1, 100, 0.5, NaN])("rejects invalid random index %s", (index) => expect(() => dealRoles(seats, config, () => index)).toThrow("RANDOM_INDEX_INVALID"));
  it("does not pad or truncate a role queue", () => expect(() => dealRoles(seats.slice(1), config)).toThrow("PLAYER_COUNT_MISMATCH"));
  it("enforces the state chart", () => expect(() => movePhase("lobby", "DAY")).toThrow("PHASE_MISMATCH"));
});

describe("initial game validation", () => {
  it.each([
    seats.slice(1), seats.map((p, i) => ({ ...p, id: i === 0 ? "constructor" : p.id })),
    seats.map((p, i) => ({ ...p, name: i === 0 ? " " : p.name })),
    seats.map((p, i) => ({ ...p, seat: i === 0 ? 0 : p.seat })),
  ])("rejects invalid participants %#", (input) => expect(() => createGame(config, input, "p1")).toThrow("SEATS_INVALID"));
  it("rejects duplicate ids", () => expect(() => createGame(config, seats.map((p, i) => ({ ...p, id: i === 1 ? "p1" : p.id })), "p1")).toThrow("PLAYER_ID_DUPLICATE"));
  it("rejects duplicate seats", () => expect(() => createGame(config, seats.map((p, i) => ({ ...p, seat: i === 1 ? 1 : p.seat })), "p1")).toThrow("SEAT_DUPLICATE"));
  it("rejects missing seat numbers", () => expect(() => createGame(config, seats.map((p, i) => ({ ...p, seat: i === 7 ? 9 : p.seat })), "p1")).toThrow("SEAT_SEQUENCE_INVALID"));
  it("rejects duplicate normalized names", () => expect(() => createGame(config, seats.map((p, i) => ({ ...p, name: i === 1 ? " player 1 " : p.name })), "p1")).toThrow("PLAYER_NAME_DUPLICATE"));
  it("normalizes equivalent Unicode spellings before checking names", () => {
    const input = seats.map((p, i) => ({ ...p, name: i === 0 ? "\u00e9" : i === 1 ? "e\u0301" : p.name }));
    expect(() => createGame(config, input, "p1")).toThrow("PLAYER_NAME_DUPLICATE");
  });
  it("requires the host to be seated", () => expect(() => createGame(config, seats, "outsider")).toThrow("HOST_NOT_FOUND"));
  it("requires an id and valid time", () => {
    expect(() => createGame(config, seats, "p1", "")).toThrow("GAME_ID_INVALID");
    expect(() => createGame(config, seats, "p1", "id", -1)).toThrow("CLOCK_INVALID");
  });
});

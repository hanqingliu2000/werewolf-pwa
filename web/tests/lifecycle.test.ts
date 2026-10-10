import { describe, expect, it } from "vitest";
import { createGame, recap } from "../src/game/engine";
import { preset } from "../src/game/config";
import { GET } from "../src/app/api/health/route";
import { config, seats, command, day, finish, open, started, toRole, vote } from "./helpers";

describe("public windows and timing", () => {
  it("uses 30-second guard and 15-second wolf windows", () => {
    const guard = open(started());
    expect(guard.window!.deadline - guard.window!.openedAt).toBe(30_000);
    const wolf = toRole(started(), "werewolf");
    expect(wolf.window!.deadline - wolf.window!.openedAt).toBe(30_000);
  });
  it("does not close a public window early even after submission", () => {
    const game = command(open(started()), { type: "guard", actorId: "p5", targetId: null });
    expect(() => command(game, { type: "close_window", actorId: "p1" })).toThrow("WINDOW_STILL_OPEN");
  });
  it("pauses on timeout without replacing the missing action", () => {
    let game = open(started());
    game = command(game, { type: "close_window", actorId: "p1" }, game.window!.deadline);
    expect(game.paused).toBe(true);
    expect(game.phase).toBe("night_action");
    expect(game.currentNight!.actions).toEqual([]);
    expect(() => command(game, { type: "guard", actorId: "p5", targetId: null })).toThrow("GAME_PAUSED");
    game = command(game, { type: "resume", actorId: "p1" }, game.updatedAt + 10_000);
    expect(game.window!.deadline - game.updatedAt).toBe(30_000);
    game = command(game, { type: "guard", actorId: "p5", targetId: null });
    expect(finish(game).nightRole).toBe("werewolf");
  });
  it("preserves remaining time on manual pause and adds the extension", () => {
    let game = open(started());
    game = command(game, { type: "pause", actorId: "p1" }, 10_000);
    expect(game.window!.remainingMs).toBe(20_000);
    game = command(game, { type: "resume", actorId: "p1" }, 100_000);
    expect(game.window!.deadline).toBe(150_000);
  });
  it("allows pause before opening without starting the action clock", () => {
    let game = command(started(), { type: "pause", actorId: "p1" });
    expect(game.window).toBeNull();
    game = command(game, { type: "resume", actorId: "p1" }, 1000);
    expect(open(game).window!.deadline).toBe(31_000);
  });
  it("rejects commands at the deadline and clocks going backwards", () => {
    const game = open(started());
    expect(() => command(game, { type: "guard", actorId: "p5", targetId: null }, game.window!.deadline)).toThrow("WINDOW_ELAPSED");
    expect(() => command(game, { type: "pause", actorId: "p1" }, -1)).toThrow("CLOCK_INVALID");
    expect(() => command(game, { type: "pause", actorId: "p1" }, NaN)).toThrow("CLOCK_INVALID");
  });
  it("calls dead configured roles for the same length without requiring their action", () => {
    const initial = started();
    initial.players.find((p) => p.role === "guard")!.alive = false;
    const game = open(initial);
    expect(game.nightRole).toBe("guard");
    expect(game.window!.deadline).toBe(30_000);
    expect(finish(game).nightRole).toBe("werewolf");
  });
  it("does not call unconfigured roles", () => {
    let game = createGame(preset(8), seats, "p1");
    game = command(game, { type: "deal", actorId: "p1" });
    game = command(game, { type: "begin_night", actorId: "p1" });
    expect(game.nightRole).toBe("werewolf");
    expect(game.config.roles.guard).toBe(0);
  });
});

describe("daytime and host controls", () => {
  it("lets only the host begin the first night without identity acknowledgements", () => {
    const game = command(createGame(config, seats, "p1"), { type: "deal", actorId: "p1" });
    expect(game).not.toHaveProperty("roleAcknowledgements");
    expect(() => command(game, { type: "begin_night", actorId: "p2" })).toThrow("FORBIDDEN");
    const night = command(game, { type: "begin_night", actorId: "p1" });
    expect(night).toMatchObject({ phase: "night_open", nightNo: 1, window: null });
    expect(night.players).toEqual(game.players);
  });
  it("treats legacy identity acknowledgements as no-ops, including old unconfirmed snapshots", () => {
    const game = command(createGame(config, seats, "p1"), { type: "deal", actorId: "p1" });
    const acknowledged = command(game, { type: "acknowledge", actorId: "p1" });
    expect(acknowledged).toEqual(game);
    expect(command(acknowledged, { type: "acknowledge", actorId: "p1" })).toEqual(game);
    const legacy = Object.assign(structuredClone(game), { roleAcknowledgements: [] });
    expect(command(legacy, { type: "begin_night", actorId: "p1" }).phase).toBe("night_open");
  });
  it("publishes only a confirmed draft and permits edits until publication", () => {
    let game = day(started());
    expect(() => command(game, { type: "day_confirm", actorId: "p1" })).toThrow("VOTE_DRAFT_REQUIRED");
    expect(() => command(game, { type: "day_publish", actorId: "p1" })).toThrow("VOTE_NOT_CONFIRMED");
    game = command(game, { type: "day_draft", actorId: "p1", targetId: "p6" });
    game = command(game, { type: "day_confirm", actorId: "p1" });
    expect(game.players.find((p) => p.id === "p6")!.alive).toBe(true);
    expect(JSON.stringify(game.publicEvents)).not.toContain("p6");
    game = command(game, { type: "day_draft", actorId: "p1", targetId: "p8" });
    expect(game.dayDraft!.confirmed).toBe(false);
    expect(() => command(game, { type: "day_publish", actorId: "p1" })).toThrow("VOTE_NOT_CONFIRMED");
    game = command(game, { type: "day_confirm", actorId: "p1" });
    game = command(game, { type: "day_publish", actorId: "p1" });
    expect(game.publicEvents.at(-1)).toMatchObject({ type: "day_vote", playerId: "p8", revealedHunterId: null });
    expect(game.phase).toBe("night_open");
    expect(() => command(game, { type: "day_draft", actorId: "p1", targetId: "p7" })).toThrow("PHASE_MISMATCH");
  });
  it("revalidates the selected target at publication", () => {
    let game = day(started());
    game = command(game, { type: "day_draft", actorId: "p1", targetId: "p8" });
    game = command(game, { type: "day_confirm", actorId: "p1" });
    game.players[7]!.alive = false;
    expect(() => command(game, { type: "day_publish", actorId: "p1" })).toThrow("TARGET_NOT_ALIVE");
  });
  it("supports confirmed no-elimination votes", () => expect(vote(day(started()), null).nightNo).toBe(2));
  it("finishes a day victory before another night", () => {
    const game = day(started()); game.players[1]!.alive = false;
    expect(vote(game, "p1").winner).toBe("good");
  });
  it("retains host authority after the host is eliminated", () => {
    let game = vote(day(started()), "p1");
    expect(game.players[0]!.alive).toBe(false);
    game = command(game, { type: "pause", actorId: "p1" });
    game = command(game, { type: "abort", actorId: "p1" });
    expect(game.aborted).toBe(true);
    expect(command(game, { type: "restart", actorId: "p1" }).players[0]!.alive).toBe(true);
  });
  it.each(["deal", "open_window", "pause", "abort"] as const)("rejects non-host %s", (type) => {
    expect(() => command(type === "deal" ? createGame(config, seats, "p1") : started(), { type, actorId: "p8" })).toThrow("FORBIDDEN");
  });
  it("rejects extra or unsupported command fields", () => {
    const game = started();
    expect(() => command(game, { type: "resume", actorId: "p1" })).toThrow("GAME_NOT_PAUSED");
    expect(() => command(createGame(config, seats, "p1"), { type: "pause", actorId: "p1" })).toThrow("PHASE_MISMATCH");
  });
  it("runs a full game including a dead host and hunter win, then resets", () => {
    let game = day(started(), { guard: "p5", kill: "p8", witch: { choice: "save", targetId: "p8" }, see: "p1" });
    game = vote(game, "p1");
    game = day(game, { kill: "p6", see: "p2" });
    expect(game.phase).toBe("hunter");
    game = command(game, { type: "hunter", actorId: "p6", targetId: "p2" });
    expect(game.winner).toBe("good");
    const report = recap(game, "p7");
    expect(report.nights).toHaveLength(2);
    expect(report.publicEvents.at(-1)).toMatchObject({ type: "game_end", winner: "good" });
    const restarted = command(game, { type: "restart", actorId: "p1" });
    expect(restarted.players.map((p) => p.seat)).toEqual(seats.map((p) => p.seat));
    expect(restarted.witchPotions).toEqual({ save: true, poison: true });
  });
  it("completes a 12-player game with four-wolf agreement and all six roles", () => {
    const profiles = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, name: `P${i + 1}` }));
    let game = createGame(preset(12), profiles, "p1", "twelve-player-game");
    game = command(game, { type: "deal", actorId: "p1" });
    game = command(game, { type: "begin_night", actorId: "p1" });
    game = day(game, { guard: "p7", kill: "p12", witch: { choice: "save", targetId: "p12" }, see: "p1" });
    expect(game.nights[0]!.wolfConfirmations).toHaveLength(4);
    game = vote(game, "p1");
    game = day(game, { kill: "p8", witch: { choice: "poison", targetId: "p2" }, see: "p3" });
    expect(game.nights[1]!.wolfConfirmations).toHaveLength(3);
    expect(game.phase).toBe("hunter");
    game = command(game, { type: "hunter", actorId: "p8", targetId: "p3" });
    game = vote(game, "p4");
    expect(game.winner).toBe("good");
    expect(recap(game, "p12").participants).toHaveLength(12);
  });
});

it("returns a secret-free uncached application health response", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok", rulesVersion: "werewolf-web-v1" });
});

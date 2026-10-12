import { afterEach, expect, it } from "vitest";
import { command, finish, open, started, toRole, vote, nightToDawn } from "./helpers";
import { fixture } from "./server-helpers";
import { narrationPlan, NARRATION_VERSION } from "../src/narration/plan";
import { actionDuration } from "../src/game/rules";
import { publicView } from "../src/server/views";
import { RoomService } from "../src/server/service";

const fixtures: Awaited<Awaited<ReturnType<typeof fixture>>>[] = [];
afterEach(() => { while (fixtures.length) fixtures.pop()!.close(); });
const setup = async () => { const f = await fixture(); fixtures.push(f); return f; };
const cue = async (f: Awaited<Awaited<ReturnType<typeof fixture>>>) => await f.act({ type: "cue_ack", cueId: f.state().flowId, version: NARRATION_VERSION });
const announce = async (f: Awaited<Awaited<ReturnType<typeof fixture>>>) => await f.act({ type: "announcement_done", cueId: f.state().narration!.pending!.id, version: NARRATION_VERSION });

it.each(["guard", "seer", "witch"] as const)("%s waits silently and accepts a late action without resume", (role) => {
  let game = toRole(started(), role);
  game = command(game, { type: "close_window", actorId: game.hostId }, game.window!.deadline);
  expect(game.paused).toBe(false);
  expect(game.window!.waiting).toBe(true);
  expect(game.window!.remainingMs).toBeNull();
  const actorId = game.players.find((p) => p.role === role)!.id;
  const late = game.updatedAt + 120_000;
  game = role === "witch" ? command(game, { type: "witch", actorId, choice: "pass", targetId: null }, late)
    : command(game, { type: role, actorId, targetId: role === "seer" ? "p1" : null }, late);
  expect(game.phase).toBe("night_close");
  expect(game.paused).toBe(false);
  expect(game.window).toBeNull();
});

it("silently restores a timeout wait across service instances and retains real safety pauses", async () => {
  const f = await setup(); await f.begin(); await f.act({ type: "cue_ack" });
  f.time.now = f.state().game!.window!.deadline;
  f.patch((room) => { room.heartbeatAt = f.time.now; room.narration = { mode: "voice", pending: null, version: NARRATION_VERSION }; });
  const flowId = f.state().flowId;
  await f.service.view(f.id, f.tokens[4]!);
  expect(f.state().flowId).toBe(flowId);
  expect(narrationPlan(publicView(f.state()))).toBeNull();
  const restored = new RoomService(f.store, () => f.time.now);
  expect(await restored.view(f.id, f.tokens[4]!)).toMatchObject({ paused: false, pauseReason: null, window: { waiting: true } });
  expect((await restored.view(f.id, f.tokens[4]!, "private")).action).toBe("guard");
  await f.act({ type: "pause" });
  expect(f.state().game!.paused).toBe(true);
  await expect(f.act({ type: "guard", targetId: null }, 4)).rejects.toThrow("GAME_PAUSED");
});

it("upgrades a legacy timeout pause but never upgrades a manual pause", async () => {
  const f = await setup(); await f.begin(); await f.act({ type: "cue_ack" });
  f.time.now = f.state().game!.window!.deadline;
  f.patch((room) => { room.heartbeatAt = f.time.now; room.game!.paused = true; room.game!.window!.remainingMs = 0; room.pauseReason = "window_incomplete"; });
  expect(await f.service.view(f.id, f.tokens[4]!)).toMatchObject({ paused: false, window: { waiting: true } });
  await f.act({ type: "guard", targetId: null }, 4);
  expect(f.state().game!.phase).toBe("night_close");
  await f.act({ type: "pause" });
  expect((await f.service.view(f.id, f.tokens[4]!)).paused).toBe(true);
});

it.each(["guard", "witch", "seer"] as const)("fully calls a %s killed in the previous night with the same action duration", async (role) => {
  const f = await setup(); await f.begin();
  const dead = f.state().game!.players.find((p) => p.role === role)!;
  f.patch((room) => {
    room.game = vote(command(nightToDawn(room.game!, { kill: dead.id }), { type: "publish_dawn", actorId: room.hostId }), null);
    room.heartbeatAt = room.game.updatedAt;
  });
  f.time.now = f.state().game!.updatedAt;
  await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
  await f.act({ type: "pause" });
  await f.act({ type: "narration_mode", mode: "voice", trialConfirmed: true, version: NARRATION_VERSION });
  await f.act({ type: "resume" });
  while (f.state().game!.nightRole !== role) {
    await cue(f);
    const game = f.state().game!;
    for (const actor of game.players.filter((p) => p.alive && p.role === game.nightRole)) {
      const index = f.state().members.findIndex((p) => p.id === actor.id);
      if (game.nightRole === "guard") await f.act({ type: "guard", targetId: null }, index);
      if (game.nightRole === "werewolf") await f.act({ type: "wolf_propose", targetId: game.players.find(p => p.alive && p.role === "werewolf")!.id }, index);
      if (game.nightRole === "witch") await f.act({ type: "witch", choice: "pass", targetId: null }, index);
    }
    if (game.nightRole === "werewolf") for (const actor of game.players.filter((p) => p.alive && p.role === "werewolf")) {
      await f.act({ type: "wolf_confirm", consensusId: f.state().consensusId }, f.state().members.findIndex((p) => p.id === actor.id));
    }
    f.time.now = f.state().game!.window!.deadline;
    f.patch((room) => { room.heartbeatAt = f.time.now; });
    await f.service.view(f.id, f.tokens[0]!); await cue(f);
  }
  const opening = narrationPlan(await f.service.view(f.id, f.tokens[0]!))!;
  expect(opening.clips).toEqual(role === "guard" ? ["night_start", "guard_open", "guard_action"] : [`${role}_open`, `${role}_action`]);
  expect(f.state().game!.window).toBeNull();
  await cue(f);
  const window = f.state().game!.window!;
  expect(window.deadline - window.openedAt).toBe(actionDuration(role));
  const index = f.state().members.findIndex((p) => p.id === dead.id);
  expect((await f.service.view(f.id, f.tokens[index]!, "private")).action).toBeNull();
  f.time.now = window.deadline - 1; f.patch((room) => { room.heartbeatAt = f.time.now; });
  expect((await f.service.view(f.id, f.tokens[0]!)).phase).toBe("night_action");
  f.time.now++;
  const closed = await f.service.view(f.id, f.tokens[0]!);
  expect(closed.phase).toBe("night_close"); expect(closed.paused).toBe(false);
  expect(narrationPlan(closed)?.clips).toEqual([`${role}_close`]);
});

it.each(["witch", "seer"] as const)("uses 10 seconds for living %s and a 10-second recovery extension", (role) => {
  let game = toRole(started(), role);
  expect(game.window!.deadline - game.window!.openedAt).toBe(10_000);
  game = command(game, { type: "pause", actorId: game.hostId }, game.updatedAt + 2000);
  game = command(game, { type: "resume", actorId: game.hostId }, game.updatedAt + 5000);
  expect(game.window!.deadline - game.updatedAt).toBe(18_000);
});

it("starts a hunter's 10-second clock only after its real public announcement receipt", async () => {
  const f = await setup(); await f.begin(); await f.act({ type: "pause" });
  await f.act({ type: "narration_mode", mode: "voice", trialConfirmed: true, version: NARRATION_VERSION }); await f.act({ type: "resume" });
  const hunter = f.state().game!.players.find((p) => p.role === "hunter")!;
  f.patch((room) => { room.game = nightToDawn(room.game!, { kill: hunter.id }); room.heartbeatAt = room.game.updatedAt; });
  f.time.now = f.state().game!.updatedAt; await cue(f);
  expect(f.state().game!.window).toBeNull();
  f.time.now += 25_000; f.patch((room) => { room.heartbeatAt = f.time.now; });
  expect((await f.service.view(f.id, f.tokens[0]!)).paused).toBe(false);
  await announce(f);
  expect(f.state().game!.window).toEqual({ openedAt: f.time.now, deadline: f.time.now + 10_000, remainingMs: null });
  f.time.now += 10_000; f.patch((room) => { room.heartbeatAt = f.time.now; });
  expect((await f.service.view(f.id, f.tokens[0]!)).paused).toBe(false);
  expect(f.state().game!.window!.waiting).toBe(true);
  expect(f.state().game!.pendingHunter?.playerId).toBe(hunter.id);
  expect(f.state().game!.publicEvents.some((e) => e.type === "hunter_reaction")).toBe(false);
  await f.act({ type: "hunter", targetId: null }, f.state().members.findIndex((p) => p.id === hunter.id));
  expect(f.state().game!.window).toBeNull();
});

it("automatically waits at 30 seconds and counts different confirmed votes", () => {
  let game = toRole(started(), "werewolf");
  expect(game.window!.deadline - game.window!.openedAt).toBe(30_000);
  game = command(game, { type: "close_window", actorId: "p1" }, game.window!.deadline);
  const remaining = game.window!.remainingMs;
  game = command(game, { type: "wolf_propose", actorId: "p1", targetId: "p8" }, game.updatedAt + 60_000);
  game = command(game, { type: "wolf_propose", actorId: "p2", targetId: "p7" });
  game = command(game, { type: "wolf_confirm", actorId: "p1" });
  expect(game.paused).toBe(false); expect(game.window!.remainingMs).toBe(remaining);
  expect(game.window!.waiting).toBe(true);
  game = command(game, { type: "wolf_confirm", actorId: "p2" });
  expect(game.paused).toBe(false); expect(game.phase).toBe("night_close"); expect(game.window).toBeNull();
});

it("preserves partial confirmations at the deadline without accepting non-wolf or dead-wolf decisions", () => {
  let game = toRole(started(), "werewolf");
  game = command(game, { type: "wolf_propose", actorId: "p1", targetId: "p8" });
  game = command(game, { type: "wolf_propose", actorId: "p2", targetId: "p8" });
  game = command(game, { type: "wolf_confirm", actorId: "p1" });
  game = command(game, { type: "close_window", actorId: "p1" }, game.window!.deadline);
  expect(game.currentNight!.wolfConfirmations).toEqual(["p1"]);
  expect(() => command(game, { type: "wolf_confirm", actorId: "p3" })).toThrow("FORBIDDEN");
  const dead = structuredClone(game); dead.players[1]!.alive = false;
  expect(() => command(dead, { type: "wolf_confirm", actorId: "p2" })).toThrow("ACTOR_ELIMINATED");
  game = command(game, { type: "wolf_confirm", actorId: "p2" }, game.updatedAt + 120_000);
  expect(game.phase).toBe("night_close"); expect(game.currentNight!.killTargetId).toBe("p8");
});

it("keeps an early completed vote in the fixed 30-second window", () => {
  let game = toRole(started(), "werewolf");
  for (const actorId of ["p1", "p2"]) game = command(game, { type: "wolf_propose", actorId, targetId: "p8" });
  for (const actorId of ["p1", "p2"]) game = command(game, { type: "wolf_confirm", actorId });
  expect(game.phase).toBe("night_action");
  expect(() => command(game, { type: "close_window", actorId: "p1" }, game.window!.deadline - 1)).toThrow("WINDOW_STILL_OPEN");
  game = command(game, { type: "close_window", actorId: "p1" }, game.window!.deadline);
  expect(game.phase).toBe("night_close"); expect(game.paused).toBe(false);
});

it("an unavailable host overrides a wolf discussion pause and forbids continuing secretly", async () => {
  const f = await setup(); await f.begin();
  f.patch((room) => { room.game = command(finish(command(open(room.game!), { type: "guard", actorId: room.members[4]!.id, targetId: null })), { type: "open_window", actorId: room.hostId }); room.heartbeatAt = room.game.updatedAt; });
  f.time.now = f.state().game!.updatedAt;
  f.time.now = f.state().game!.window!.deadline;
  f.patch((room) => { room.heartbeatAt = f.time.now; }); await f.service.view(f.id, f.tokens[0]!);
  expect((await f.service.view(f.id, f.tokens[0]!, "private")).wolves?.discussionPaused).toBe(false);
  expect(f.state().game!.window!.waiting).toBe(true);
  const proposals = structuredClone(f.state().game!.currentNight!.wolfProposals);
  await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: false, audioReady: true });
  expect(f.state().pauseReason).toBe("host_unavailable");
  expect(f.state().game!.wolfDiscussionPaused).toBe(false);
  await expect(f.act({ type: "wolf_propose", targetId: null }, 1)).rejects.toThrow("GAME_PAUSED");
  expect(f.state().game!.currentNight!.wolfProposals).toEqual(proposals);
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mintSession, RETENTION_MS, RoomService } from "../src/server/service";
import { fixture } from "./server-helpers";
import { config, command, nightToDawn } from "./helpers";

const fixtures: Awaited<Awaited<ReturnType<typeof fixture>>>[] = [];
async function setup(count = 8) { const f = await fixture(count); fixtures.push(f); return f; }
afterEach(() => { vi.restoreAllMocks(); while (fixtures.length) fixtures.pop()!.close(); });

describe("lobby and idempotent coordinator", () => {
  it("validates names, capacity, readiness and seat ownership", async () => {
    const f = await setup(1);
    await expect(f.act({ type: "start" })).rejects.toThrow("PLAYERS_NOT_READY");
    await expect(f.service.join(f.id, mintSession(), { requestId: randomUUID(), epochId: f.state().lobbyId, name: "player 1" })).rejects.toThrow("PLAYER_NAME_DUPLICATE");
    await expect(f.act({ type: "rename", name: "\u200eFake" })).rejects.toThrow("INPUT_INVALID");
    await f.act({ type: "ready", ready: true }); await f.act({ type: "seat", seat: 8 });
    expect(f.state().members[0]!).toMatchObject({ seat: 8, ready: false });
    await expect(f.act({ type: "seat", seat: 9 })).rejects.toThrow("SEAT_INVALID");
    await f.act({ type: "rename", name: "New name" });
    await f.act({ type: "configure", config });
    expect(f.state().members.every((p) => !p.ready)).toBe(true);
    await expect(f.act({ type: "leave" })).rejects.toThrow("HOST_CANNOT_LEAVE");
    await expect(f.act({ type: "kick", playerId: f.state().hostId })).rejects.toThrow("HOST_CANNOT_LEAVE");
    await expect(f.act({ type: "kick", playerId: randomUUID() })).rejects.toThrow("PLAYER_NOT_FOUND");
    await f.act({ type: "seat", seat: 1 });
    const token = mintSession(); await f.service.join(f.id, token, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Player 2" });
    await expect(f.service.mutate(f.id, token, f.envelope({ type: "seat", seat: 1 }))).rejects.toThrow("SEAT_TAKEN");
    await expect(f.service.mutate(f.id, token, f.envelope({ type: "rename", name: "New name" }))).rejects.toThrow("PLAYER_NAME_DUPLICATE");
    const leave = f.envelope({ type: "leave" });
    const accepted = await f.service.mutate(f.id, token, leave);
    expect(await f.service.mutate(f.id, token, leave)).toEqual(accepted);
    await expect(f.service.view(f.id, token)).rejects.toThrow("INVALID_SESSION");
  });

  it("two requests for the last seat cannot both succeed", async () => {
    const f = await setup(7);
    const a = mintSession(), b = mintSession();
    await f.service.join(f.id, a, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Last" });
    await expect(f.service.join(f.id, b, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Extra" })).rejects.toThrow("ROOM_FULL");
    expect(f.state().members).toHaveLength(8);
    await f.act({ type: "ready", ready: true });
    await expect(f.act({ type: "start" })).rejects.toThrow("PLAYERS_NOT_READY");
  });

  it("keeps identity viewing read-only and restores an unconfirmed deal without a start gate", async () => {
    const f = await setup(); await f.start();
    const before = f.store.load(f.id);
    expect((await f.service.view(f.id, f.tokens[0]!, "host")).canBeginNight).toBe(true);
    expect(await f.service.view(f.id, f.tokens[1]!, "private")).toMatchObject({ role: "werewolf", acknowledged: true });
    expect(f.store.load(f.id)).toEqual(before);
    expect(f.state().game).not.toHaveProperty("roleAcknowledgements");
    const restored = new RoomService(f.store, () => f.time.now);
    await restored.mutate(f.id, f.tokens[0]!, f.envelope({ type: "begin_night" }));
    expect(f.state().game).toMatchObject({ phase: "night_open", nightNo: 1, window: null });
  });

  it("accepts and deduplicates legacy identity requests without tracking them", async () => {
    const f = await setup(); await f.start(); const game = f.state().game;
    const envelope = f.envelope({ type: "acknowledge" });
    const receipt = await f.service.mutate(f.id, f.tokens[1]!, envelope);
    expect(f.state().game).toEqual(game);
    const before = f.store.load(f.id);
    expect(await f.service.mutate(f.id, f.tokens[1]!, envelope)).toEqual(receipt);
    expect(f.store.load(f.id)).toEqual(before);
    await f.act({ type: "begin_night" });
    await expect(f.act({ type: "acknowledge" }, 1)).rejects.toThrow("PHASE_MISMATCH");
  });

  it("bounds CAS retries, and reloads a conflict without discarding facts", async () => {
    const f = await setup(1);
    const cas = f.store.compareAndSwap.bind(f.store);
    const spy = vi.spyOn(f.store, "compareAndSwap").mockReturnValueOnce(false).mockImplementation(cas);
    await f.act({ type: "ready", ready: true });
    expect(spy).toHaveBeenCalledTimes(2); expect(f.state().members[0]!.ready).toBe(true);
    spy.mockReturnValue(false);
    await expect(f.act({ type: "ready", ready: false })).rejects.toThrow("WRITE_CONFLICT");
    expect(f.state().members[0]!.ready).toBe(true);
  });

  it("deduplicates accepted actions but rejects reused ids with different payloads", async () => {
    const f = await setup(); await f.begin(); await f.act({ type: "cue_ack" });
    const request = f.envelope({ type: "guard", targetId: null });
    const receipt = await f.service.mutate(f.id, f.tokens[4]!, request);
    const before = f.store.load(f.id);
    expect(await f.service.mutate(f.id, f.tokens[4]!, request)).toEqual(receipt);
    expect(f.store.load(f.id)).toEqual(before);
    await expect(f.service.mutate(f.id, f.tokens[4]!, { ...request, operation: { type: "guard", targetId: f.state().hostId } })).rejects.toThrow("REQUEST_ID_REUSED");
    await expect(f.act({ type: "guard", targetId: null }, 4)).rejects.toThrow("ACTION_LOCKED");
  });

  it("rejects old game and old cue requests and never accepts injected clock or RNG", async () => {
    const f = await setup();
    const old = f.envelope({ type: "ready", ready: true }); await f.start();
    await expect(f.service.mutate(f.id, f.tokens[1]!, old)).rejects.toThrow("STALE_GAME");
    const window = f.envelope({ type: "begin_night" });
    await f.act({ type: "begin_night" });
    await expect(f.service.mutate(f.id, f.tokens[0]!, window)).rejects.toThrow("STALE_WINDOW");
    await expect(f.service.mutate(f.id, f.tokens[0]!, { ...f.envelope({ type: "cue_ack" }), now: 0 })).rejects.toThrow("INPUT_INVALID");
    await expect(f.service.mutate(f.id, f.tokens[0]!, { ...f.envelope({ type: "cue_ack" }), randomIndex: 0 })).rejects.toThrow("INPUT_INVALID");
    await expect(f.service.join(f.id, mintSession(), { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Extra" })).rejects.toThrow("ROOM_ALREADY_STARTED");
    expect(await f.service.join(f.id, f.tokens[0]!, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Ignored rename" })).toHaveProperty("accepted", true);
    await expect(f.act({ type: "configure", config })).rejects.toThrow("PHASE_MISMATCH");
  });
});

describe("server clock and recovery", () => {
  it("opens after a host cue and closes only at the fixed deadline", async () => {
    const f = await setup(); await f.begin();
    expect(f.state().game!.window).toBeNull();
    await f.act({ type: "cue_ack" });
    await f.act({ type: "guard", targetId: null }, 4);
    expect(f.state().game!.phase).toBe("night_action");
    await f.advance();
    // A long simulated gap first pauses for missing heartbeat, never silently resumes.
    expect(f.state().game!.paused).toBe(true);
    await f.act({ type: "resume" });
    f.time.now += 29_999; await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    await f.act({ type: "resume" });
    // Keep heartbeat fresh across the actual deadline.
    const deadline = f.state().game!.window!.deadline;
    f.patch((room) => { room.heartbeatAt = deadline - 1; }); f.time.now = deadline - 1;
    expect((await f.service.view(f.id, f.tokens[0]!)).phase).toBe("night_action");
    f.time.now = deadline;
    expect((await f.service.view(f.id, f.tokens[0]!)).phase).toBe("night_close");
    expect(f.state().game!.window).toBeNull();
  });

  it("missing action pauses without auto-pass and resume adds 30s", async () => {
    const f = await setup(); await f.begin(); await f.act({ type: "cue_ack" });
    const deadline = f.state().game!.window!.deadline;
    f.patch((room) => { room.heartbeatAt = deadline - 1; }); f.time.now = deadline;
    await f.service.view(f.id, f.tokens[6]!);
    expect(f.state().pauseReason).toBe("window_incomplete");
    expect(f.state().game!.currentNight!.actions).toEqual([]);
    await f.act({ type: "resume" });
    expect(f.state().game!.window!.deadline).toBe(deadline + 30_000);
    await f.act({ type: "guard", targetId: null }, 4);
  });

  it("freezes remaining time after host disappearance and requires explicit resume", async () => {
    const f = await setup(); await f.begin(); await f.act({ type: "cue_ack" });
    f.time.now += 10_000;
    const expiry = f.state().expiresAt;
    await f.service.view(f.id, f.tokens[7]!);
    expect(f.state().game!.window!.remainingMs).toBe(20_000);
    expect(f.state().pauseReason).toBe("host_unavailable");
    expect(f.state().expiresAt).toBe(expiry);
    await expect(f.act({ type: "resume" })).rejects.toThrow("HOST_NOT_READY");
    const old = f.envelope({ type: "guard", targetId: null });
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    expect(f.state().game!.paused).toBe(true);
    await f.act({ type: "resume" });
    expect(f.state().game!.window!.deadline).toBe(f.time.now + 50_000);
    await expect(f.service.mutate(f.id, f.tokens[4]!, old)).rejects.toThrow("STALE_WINDOW");
  });

  it("background/audio failure pauses, ordinary players cannot heartbeat or take over", async () => {
    const f = await setup(); await f.begin();
    await expect(f.service.heartbeat(f.id, f.tokens[1]!, { foreground: true, audioReady: true })).rejects.toThrow("FORBIDDEN");
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: false, audioReady: true });
    expect(f.state().game!.paused).toBe(true);
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: false });
    await expect(f.act({ type: "resume" })).rejects.toThrow("HOST_NOT_READY");
    await expect(f.act({ type: "resume" }, 1)).rejects.toThrow("FORBIDDEN");
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true }); await f.act({ type: "resume" });
    await expect(f.act({ type: "resume" })).rejects.toThrow("GAME_NOT_PAUSED");
    await f.act({ type: "abort" }); f.time.now += 11_000;
    expect((await f.service.view(f.id, f.tokens[0]!)).phase).toBe("end");
  });

  it("rejects stale private consensus and stale vote confirmation", async () => {
    const f = await setup(); await f.begin();
    f.patch((room) => { room.game = command(room.game!, { type: "open_window", actorId: room.hostId });
      room.game = command(room.game, { type: "guard", actorId: room.members[4]!.id, targetId: null });
      room.game = command(room.game, { type: "close_window", actorId: room.hostId }, room.game.window!.deadline);
      room.game = command(room.game, { type: "finish_role", actorId: room.hostId }); });
    f.time.now = f.state().game!.updatedAt;
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true }); await f.act({ type: "resume" }); await f.act({ type: "cue_ack" });
    await f.act({ type: "wolf_propose", targetId: null }); await f.act({ type: "wolf_propose", targetId: null }, 1);
    const stale = f.envelope({ type: "wolf_confirm", consensusId: f.state().consensusId });
    await f.act({ type: "wolf_propose", targetId: f.state().hostId }, 1);
    await expect(f.service.mutate(f.id, f.tokens[0]!, stale)).rejects.toThrow("STALE_CONSENSUS");
    await f.act({ type: "wolf_propose", targetId: null }, 1);
    const consensusId = f.state().consensusId;
    await f.act({ type: "wolf_confirm", consensusId }); await f.act({ type: "wolf_confirm", consensusId }, 1);
    expect(f.state().game!.currentNight!.killLocked).toBe(true);
    expect((await f.service.view(f.id, f.tokens[0]!, "private")).action).toBeNull();
    f.patch((room) => { room.game = nightToDawn({ ...room.game!, phase: "night_open", nightRole: "witch", window: null });
      room.game = command(room.game, { type: "publish_dawn", actorId: room.hostId }); room.heartbeatAt = room.game.updatedAt; });
    f.time.now = f.state().game!.updatedAt;
    await f.act({ type: "day_draft", targetId: null });
    const draftId = f.state().draftId!;
    await f.act({ type: "day_draft", targetId: f.state().members[7]!.id });
    await expect(f.act({ type: "day_confirm", draftId })).rejects.toThrow("STALE_DRAFT");
    await expect(f.act({ type: "day_publish", draftId })).rejects.toThrow("STALE_DRAFT");
    expect((await f.service.view(f.id, f.tokens[0]!, "host")).dayDraft).toMatchObject({ confirmed: false });
  });

  it("prunes expired archives even while a room stays alive", async () => {
    const f = await setup(); await f.start(); await f.act({ type: "abort" }); const gameId = f.state().game!.id; await f.act({ type: "restart" });
    f.patch((room) => { room.expiresAt += RETENTION_MS; room.archives[0]!.expiresAt = f.time.now; });
    await expect(f.service.readRecap(f.id, f.tokens[0]!, gameId)).rejects.toThrow("FORBIDDEN");
    await f.service.view(f.id, f.tokens[0]!);
    expect(f.state().archives).toHaveLength(0);
  });

  it("keeps an unpublished confirmed draft through pause and resume", async () => {
    const f = await setup(); await f.begin();
    f.patch((room) => { room.game = nightToDawn(room.game!);
      room.game = command(room.game, { type: "publish_dawn", actorId: room.hostId }); room.heartbeatAt = room.game.updatedAt; });
    f.time.now = f.state().game!.updatedAt;
    await f.act({ type: "day_draft", targetId: null }); const draftId = f.state().draftId!;
    await f.act({ type: "day_confirm", draftId }); await f.act({ type: "pause" }); await f.act({ type: "resume" });
    expect(f.state().draftId).toBe(draftId);
    await f.act({ type: "day_publish", draftId });
    expect(f.state().game!.phase).toBe("night_open");
  });

  it("rejects a delayed join from an earlier lobby epoch", async () => {
    const f = await setup(); const epochId = f.state().lobbyId;
    await f.start(); await f.act({ type: "abort" }); await f.act({ type: "restart" });
    await expect(f.service.join(f.id, mintSession(), { requestId: randomUUID(), epochId, name: "Late join" })).rejects.toThrow("STALE_GAME");
    expect(await f.service.invitation(f.id)).toMatchObject({ phase: "lobby", epochId: f.state().lobbyId });
  });
});

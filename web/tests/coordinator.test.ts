import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mintSession, RETENTION_MS } from "../src/server/service";
import { fixture } from "./server-helpers";
import { config, command, nightToDawn } from "./helpers";

const fixtures: ReturnType<typeof fixture>[] = [];
function setup(count = 8) { const f = fixture(count); fixtures.push(f); return f; }
afterEach(() => { vi.restoreAllMocks(); while (fixtures.length) fixtures.pop()!.close(); });

describe("lobby and idempotent coordinator", () => {
  it("validates names, capacity, readiness and seat ownership", () => {
    const f = setup(1);
    expect(() => f.act({ type: "start" })).toThrow("PLAYERS_NOT_READY");
    expect(() => f.service.join(f.id, mintSession(), { requestId: randomUUID(), epochId: f.state().lobbyId, name: "player 1" })).toThrow("PLAYER_NAME_DUPLICATE");
    expect(() => f.act({ type: "rename", name: "\u200eFake" })).toThrow("INPUT_INVALID");
    f.act({ type: "ready", ready: true }); f.act({ type: "seat", seat: 8 });
    expect(f.state().members[0]!).toMatchObject({ seat: 8, ready: false });
    expect(() => f.act({ type: "seat", seat: 9 })).toThrow("SEAT_INVALID");
    f.act({ type: "rename", name: "New name" });
    f.act({ type: "configure", config });
    expect(f.state().members.every((p) => !p.ready)).toBe(true);
    expect(() => f.act({ type: "leave" })).toThrow("HOST_CANNOT_LEAVE");
    expect(() => f.act({ type: "kick", playerId: f.state().hostId })).toThrow("HOST_CANNOT_LEAVE");
    expect(() => f.act({ type: "kick", playerId: randomUUID() })).toThrow("PLAYER_NOT_FOUND");
    f.act({ type: "seat", seat: 1 });
    const token = mintSession(); f.service.join(f.id, token, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Player 2" });
    expect(() => f.service.mutate(f.id, token, f.envelope({ type: "seat", seat: 1 }))).toThrow("SEAT_TAKEN");
    expect(() => f.service.mutate(f.id, token, f.envelope({ type: "rename", name: "New name" }))).toThrow("PLAYER_NAME_DUPLICATE");
    const leave = f.envelope({ type: "leave" });
    const accepted = f.service.mutate(f.id, token, leave);
    expect(f.service.mutate(f.id, token, leave)).toEqual(accepted);
    expect(() => f.service.view(f.id, token)).toThrow("INVALID_SESSION");
  });

  it("two requests for the last seat cannot both succeed", () => {
    const f = setup(7);
    const a = mintSession(), b = mintSession();
    f.service.join(f.id, a, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Last" });
    expect(() => f.service.join(f.id, b, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Extra" })).toThrow("ROOM_FULL");
    expect(f.state().members).toHaveLength(8);
    f.act({ type: "ready", ready: true });
    expect(() => f.act({ type: "start" })).toThrow("PLAYERS_NOT_READY");
  });

  it("bounds CAS retries, and reloads a conflict without discarding facts", () => {
    const f = setup(1);
    const cas = f.store.compareAndSwap.bind(f.store);
    const spy = vi.spyOn(f.store, "compareAndSwap").mockReturnValueOnce(false).mockImplementation(cas);
    f.act({ type: "ready", ready: true });
    expect(spy).toHaveBeenCalledTimes(2); expect(f.state().members[0]!.ready).toBe(true);
    spy.mockReturnValue(false);
    expect(() => f.act({ type: "ready", ready: false })).toThrow("WRITE_CONFLICT");
    expect(f.state().members[0]!.ready).toBe(true);
  });

  it("deduplicates accepted actions but rejects reused ids with different payloads", () => {
    const f = setup(); f.begin(); f.act({ type: "cue_ack" });
    const request = f.envelope({ type: "guard", targetId: null });
    const receipt = f.service.mutate(f.id, f.tokens[4]!, request);
    const before = f.store.load(f.id);
    expect(f.service.mutate(f.id, f.tokens[4]!, request)).toEqual(receipt);
    expect(f.store.load(f.id)).toEqual(before);
    expect(() => f.service.mutate(f.id, f.tokens[4]!, { ...request, operation: { type: "guard", targetId: f.state().hostId } })).toThrow("REQUEST_ID_REUSED");
    expect(() => f.act({ type: "guard", targetId: null }, 4)).toThrow("ACTION_LOCKED");
  });

  it("rejects old game and old cue requests and never accepts injected clock or RNG", () => {
    const f = setup();
    const old = f.envelope({ type: "ready", ready: true }); f.start();
    expect(() => f.service.mutate(f.id, f.tokens[1]!, old)).toThrow("STALE_GAME");
    const window = f.envelope({ type: "begin_night" });
    for (let i = 0; i < 8; i++) f.act({ type: "acknowledge" }, i);
    f.act({ type: "begin_night" });
    expect(() => f.service.mutate(f.id, f.tokens[0]!, window)).toThrow("STALE_WINDOW");
    expect(() => f.service.mutate(f.id, f.tokens[0]!, { ...f.envelope({ type: "cue_ack" }), now: 0 })).toThrow("INPUT_INVALID");
    expect(() => f.service.mutate(f.id, f.tokens[0]!, { ...f.envelope({ type: "cue_ack" }), randomIndex: 0 })).toThrow("INPUT_INVALID");
    expect(() => f.service.join(f.id, mintSession(), { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Extra" })).toThrow("ROOM_ALREADY_STARTED");
    expect(f.service.join(f.id, f.tokens[0]!, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Ignored rename" })).toHaveProperty("accepted", true);
    expect(() => f.act({ type: "configure", config })).toThrow("PHASE_MISMATCH");
  });
});

describe("server clock and recovery", () => {
  it("opens after a host cue and closes only at the fixed deadline", () => {
    const f = setup(); f.begin();
    expect(f.state().game!.window).toBeNull();
    f.act({ type: "cue_ack" });
    f.act({ type: "guard", targetId: null }, 4);
    expect(f.state().game!.phase).toBe("night_action");
    f.advance();
    // A long simulated gap first pauses for missing heartbeat, never silently resumes.
    expect(f.state().game!.paused).toBe(true);
    f.act({ type: "resume" });
    f.time.now += 29_999; f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    f.act({ type: "resume" });
    // Keep heartbeat fresh across the actual deadline.
    const deadline = f.state().game!.window!.deadline;
    f.patch((room) => { room.heartbeatAt = deadline - 1; }); f.time.now = deadline - 1;
    expect(f.service.view(f.id, f.tokens[0]!).phase).toBe("night_action");
    f.time.now = deadline;
    expect(f.service.view(f.id, f.tokens[0]!).phase).toBe("night_close");
    expect(f.state().game!.window).toBeNull();
  });

  it("missing action pauses without auto-pass and resume adds 30s", () => {
    const f = setup(); f.begin(); f.act({ type: "cue_ack" });
    const deadline = f.state().game!.window!.deadline;
    f.patch((room) => { room.heartbeatAt = deadline - 1; }); f.time.now = deadline;
    f.service.view(f.id, f.tokens[6]!);
    expect(f.state().pauseReason).toBe("window_incomplete");
    expect(f.state().game!.currentNight!.actions).toEqual([]);
    f.act({ type: "resume" });
    expect(f.state().game!.window!.deadline).toBe(deadline + 30_000);
    f.act({ type: "guard", targetId: null }, 4);
  });

  it("freezes remaining time after host disappearance and requires explicit resume", () => {
    const f = setup(); f.begin(); f.act({ type: "cue_ack" });
    f.time.now += 10_000;
    const expiry = f.state().expiresAt;
    f.service.view(f.id, f.tokens[7]!);
    expect(f.state().game!.window!.remainingMs).toBe(20_000);
    expect(f.state().pauseReason).toBe("host_unavailable");
    expect(f.state().expiresAt).toBe(expiry);
    expect(() => f.act({ type: "resume" })).toThrow("HOST_NOT_READY");
    const old = f.envelope({ type: "guard", targetId: null });
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    expect(f.state().game!.paused).toBe(true);
    f.act({ type: "resume" });
    expect(f.state().game!.window!.deadline).toBe(f.time.now + 50_000);
    expect(() => f.service.mutate(f.id, f.tokens[4]!, old)).toThrow("STALE_WINDOW");
  });

  it("background/audio failure pauses, ordinary players cannot heartbeat or take over", () => {
    const f = setup(); f.begin();
    expect(() => f.service.heartbeat(f.id, f.tokens[1]!, { foreground: true, audioReady: true })).toThrow("FORBIDDEN");
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: false, audioReady: true });
    expect(f.state().game!.paused).toBe(true);
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: false });
    expect(() => f.act({ type: "resume" })).toThrow("HOST_NOT_READY");
    expect(() => f.act({ type: "resume" }, 1)).toThrow("FORBIDDEN");
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true }); f.act({ type: "resume" });
    expect(() => f.act({ type: "resume" })).toThrow("GAME_NOT_PAUSED");
    f.act({ type: "abort" }); f.time.now += 11_000;
    expect(f.service.view(f.id, f.tokens[0]!).phase).toBe("end");
  });

  it("rejects stale private consensus and stale vote confirmation", () => {
    const f = setup(); f.begin();
    f.patch((room) => { room.game = command(room.game!, { type: "open_window", actorId: room.hostId });
      room.game = command(room.game, { type: "guard", actorId: room.members[4]!.id, targetId: null });
      room.game = command(room.game, { type: "close_window", actorId: room.hostId }, room.game.window!.deadline);
      room.game = command(room.game, { type: "finish_role", actorId: room.hostId }); });
    f.time.now = f.state().game!.updatedAt;
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true }); f.act({ type: "resume" }); f.act({ type: "cue_ack" });
    f.act({ type: "wolf_propose", targetId: null }); f.act({ type: "wolf_propose", targetId: null }, 1);
    const stale = f.envelope({ type: "wolf_confirm", consensusId: f.state().consensusId });
    f.act({ type: "wolf_propose", targetId: f.state().hostId }, 1);
    expect(() => f.service.mutate(f.id, f.tokens[0]!, stale)).toThrow("STALE_CONSENSUS");
    f.act({ type: "wolf_propose", targetId: null }, 1);
    const consensusId = f.state().consensusId;
    f.act({ type: "wolf_confirm", consensusId }); f.act({ type: "wolf_confirm", consensusId }, 1);
    expect(f.state().game!.currentNight!.killLocked).toBe(true);
    expect(f.service.view(f.id, f.tokens[0]!, "private").action).toBeNull();
    f.patch((room) => { room.game = nightToDawn({ ...room.game!, phase: "night_open", nightRole: "witch", window: null });
      room.game = command(room.game, { type: "publish_dawn", actorId: room.hostId }); room.heartbeatAt = room.game.updatedAt; });
    f.time.now = f.state().game!.updatedAt;
    f.act({ type: "day_draft", targetId: null });
    const draftId = f.state().draftId!;
    f.act({ type: "day_draft", targetId: f.state().members[7]!.id });
    expect(() => f.act({ type: "day_confirm", draftId })).toThrow("STALE_DRAFT");
    expect(() => f.act({ type: "day_publish", draftId })).toThrow("STALE_DRAFT");
    expect(f.service.view(f.id, f.tokens[0]!, "host").dayDraft).toMatchObject({ confirmed: false });
  });

  it("prunes expired archives even while a room stays alive", () => {
    const f = setup(); f.start(); f.act({ type: "abort" }); const gameId = f.state().game!.id; f.act({ type: "restart" });
    f.patch((room) => { room.expiresAt += RETENTION_MS; room.archives[0]!.expiresAt = f.time.now; });
    expect(() => f.service.readRecap(f.id, f.tokens[0]!, gameId)).toThrow("FORBIDDEN");
    f.service.view(f.id, f.tokens[0]!);
    expect(f.state().archives).toHaveLength(0);
  });

  it("keeps an unpublished confirmed draft through pause and resume", () => {
    const f = setup(); f.begin();
    f.patch((room) => { room.game = nightToDawn(room.game!);
      room.game = command(room.game, { type: "publish_dawn", actorId: room.hostId }); room.heartbeatAt = room.game.updatedAt; });
    f.time.now = f.state().game!.updatedAt;
    f.act({ type: "day_draft", targetId: null }); const draftId = f.state().draftId!;
    f.act({ type: "day_confirm", draftId }); f.act({ type: "pause" }); f.act({ type: "resume" });
    expect(f.state().draftId).toBe(draftId);
    f.act({ type: "day_publish", draftId });
    expect(f.state().game!.phase).toBe("night_open");
  });

  it("rejects a delayed join from an earlier lobby epoch", () => {
    const f = setup(); const epochId = f.state().lobbyId;
    f.start(); f.act({ type: "abort" }); f.act({ type: "restart" });
    expect(() => f.service.join(f.id, mintSession(), { requestId: randomUUID(), epochId, name: "Late join" })).toThrow("STALE_GAME");
    expect(f.service.invitation(f.id)).toMatchObject({ phase: "lobby", epochId: f.state().lobbyId });
  });
});

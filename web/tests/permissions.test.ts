import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mintSession } from "../src/server/service";
import { privateView, publicView } from "../src/server/views";
import { fixture } from "./server-helpers";
import { command, nightToDawn, config } from "./helpers";
import type { Mutation } from "../src/server/input";

const fixtures: ReturnType<typeof fixture>[] = [];
function setup(count = 8) { const f = fixture(count); fixtures.push(f); return f; }
afterEach(() => { while (fixtures.length) fixtures.pop()!.close(); });

describe("identity and role projections", () => {
  it("does not treat an id, room code or host seat as credentials", () => {
    const f = setup();
    expect(() => f.service.view(f.id, mintSession())).toThrow("INVALID_SESSION");
    expect(() => f.service.view(f.id, f.tokens[1]!, "host")).toThrow("FORBIDDEN");
    const other = f.service.create(mintSession(), { requestId: randomUUID(), name: "Other", config });
    expect(() => f.service.view(other.roomId, f.tokens[0]!)).toThrow("INVALID_SESSION");
    const forged = { ...f.envelope({ type: "ready", ready: true }), actorId: f.state().hostId };
    expect(() => f.service.mutate(f.id, f.tokens[1]!, forged)).toThrow("INPUT_INVALID");
    const inner = { ...f.envelope({ type: "ready", ready: true }), operation: { type: "ready", ready: true, actorId: f.state().hostId } };
    expect(() => f.service.mutate(f.id, f.tokens[1]!, inner)).toThrow("INPUT_INVALID");
  });

  it.each(["configure", "kick", "start", "begin_night", "cue_ack", "pause", "resume", "abort", "restart", "day_draft", "day_confirm", "day_publish"])("denies non-host %s", (type) => {
    const f = setup();
    const operation = type === "configure" ? { type, config } : type === "kick" ? { type, playerId: f.state().hostId }
      : type === "day_draft" ? { type, targetId: null } : ["day_confirm", "day_publish"].includes(type) ? { type, draftId: randomUUID() } : { type };
    expect(() => f.act(operation as Mutation["operation"], 1)).toThrow("FORBIDDEN");
  });

  it("returns no roles, potion data, private counts, internal revisions or session hashes publicly", () => {
    const f = setup(); f.start();
    const view = f.service.view(f.id, f.tokens[0]!);
    const serialized = JSON.stringify(view);
    for (const field of ["sessionHash", "wolfProposals", "witchPotions", "pendingDeaths", "seerReports", "updatedAt", "expiresAt", "roleAcknowledgements"]) expect(serialized).not.toContain(field);
    expect(view.players!.every((p) => "revealedRole" in p && p.revealedRole === null)).toBe(true);
    expect(f.service.view(f.id, f.tokens[0]!, "host")).not.toHaveProperty("role");
    expect(f.service.view(f.id, f.tokens[2]!, "private")).toMatchObject({ role: "seer", reports: [] });
    expect(f.service.view(f.id, f.tokens[6]!, "private")).not.toHaveProperty("reports");
    expect(f.service.view(f.id, f.tokens[3]!, "private")).toHaveProperty("witch.canSeeWolfTarget", false);
  });

  it("does not change the public view or host cue when a secret action is submitted", () => {
    const f = setup(); f.begin(); f.act({ type: "cue_ack" });
    const before = f.service.view(f.id, f.tokens[0]!);
    const hostBefore = f.service.view(f.id, f.tokens[0]!, "host");
    f.act({ type: "guard", targetId: f.state().hostId }, 4);
    expect(f.service.view(f.id, f.tokens[0]!)).toEqual(before);
    expect(f.service.view(f.id, f.tokens[0]!, "host")).toEqual(hostBefore);
    expect(f.service.view(f.id, f.tokens[4]!, "private")).toMatchObject({ completed: true, action: null });
  });

  it("conceals internal deaths including the hunter and witch until dawn publication", () => {
    const f = setup(); f.begin();
    f.patch((room) => { room.game = nightToDawn(room.game!, { kill: room.members[5]!.id,
      witch: { choice: "poison", targetId: room.members[3]!.id } }); });
    f.time.now = f.state().game!.updatedAt;
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    f.act({ type: "resume" });
    const room = f.state();
    expect(publicView(room).players.every((p) => "alive" in p && p.alive)).toBe(true);
    expect(privateView(room, room.members[3]!)).toHaveProperty("witch");
    expect(privateView(room, room.members[3]!)).toHaveProperty("alive", true);
    expect(privateView(room, room.members[5]!)).toHaveProperty("hunterReaction", false);
    f.act({ type: "cue_ack" });
    const after = f.service.view(f.id, f.tokens[0]!);
    expect(after.players![5]).toMatchObject({ alive: false, revealedRole: "hunter" });
    expect(after.players![3]).toMatchObject({ alive: false, revealedRole: null });
    expect(f.service.view(f.id, f.tokens[5]!, "private")).toHaveProperty("hunterReaction", true);
    expect(f.service.view(f.id, f.tokens[3]!, "private")).not.toHaveProperty("witch");
  });

  it("shows wolf collaboration only to living wolves in their window", () => {
    const f = setup(); f.begin();
    f.patch((room) => { room.game = command(room.game!, { type: "open_window", actorId: room.hostId });
      room.game = command(room.game, { type: "guard", actorId: room.members[4]!.id, targetId: null });
      room.game = command(room.game, { type: "close_window", actorId: room.hostId }, room.game.window!.deadline);
      room.game = command(room.game, { type: "finish_role", actorId: room.hostId }); });
    f.time.now = f.state().game!.updatedAt;
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    f.act({ type: "resume" });
    f.act({ type: "cue_ack" });
    f.act({ type: "wolf_propose", targetId: f.state().members[7]!.id });
    expect(f.service.view(f.id, f.tokens[1]!, "private")).toHaveProperty("wolves.proposals");
    expect(f.service.view(f.id, f.tokens[2]!, "private")).not.toHaveProperty("wolves");
    f.patch((room) => { const id = room.members[1]!.id; room.game!.players[1]!.alive = false;
      room.game!.publicEvents.push({ type: "deaths", nightNo: 0, playerIds: [id], revealedHunters: [] }); });
    const dead = f.service.view(f.id, f.tokens[1]!, "private");
    expect(dead).not.toHaveProperty("wolves"); expect(dead).not.toHaveProperty("teammates");
    expect(() => f.act({ type: "wolf_confirm", consensusId: f.state().consensusId }, 1)).toThrow("ACTOR_ELIMINATED");
  });

  it("does not publish vote drafts and keeps organization rights after host death", () => {
    const f = setup(); f.begin();
    f.patch((room) => { room.game = nightToDawn(room.game!, { kill: room.hostId });
      room.game = command(room.game, { type: "publish_dawn", actorId: room.hostId }); });
    f.time.now = f.state().game!.updatedAt;
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    f.act({ type: "resume" });
    const before = f.service.view(f.id, f.tokens[1]!);
    f.act({ type: "day_draft", targetId: f.state().members[7]!.id }); f.act({ type: "day_confirm", draftId: f.state().draftId! });
    expect(f.service.view(f.id, f.tokens[1]!)).toEqual(before);
    expect(f.service.view(f.id, f.tokens[0]!, "host")).toHaveProperty("dayDraft.confirmed", true);
    f.act({ type: "day_publish", draftId: f.state().draftId! });
    expect(f.state().game!.phase).toBe("night_open");
    f.act({ type: "pause" }); expect(f.state().game!.paused).toBe(true);
  });

  it("recaps require participation in that game, not just room membership", () => {
    const f = setup(); f.start();
    const gameId = f.state().game!.id;
    expect(() => f.service.readRecap(f.id, f.tokens[0]!, gameId)).toThrow("PHASE_MISMATCH");
    f.act({ type: "abort" });
    expect(f.service.readRecap(f.id, f.tokens[7]!, gameId)).toHaveProperty("aborted", true);
    f.act({ type: "restart" });
    const removed = f.state().members[7]!.id;
    f.act({ type: "kick", playerId: removed });
    const fresh = mintSession();
    f.service.join(f.id, fresh, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "New player" });
    expect(() => f.service.readRecap(f.id, fresh, gameId)).toThrow("FORBIDDEN");
    expect(f.service.readRecap(f.id, f.tokens[7]!, gameId)).toHaveProperty("gameId", gameId);
    expect(f.service.listRecaps(f.id, f.tokens[7]!)).toEqual({ games: [{ gameId, winner: null, aborted: true }] });
    expect(f.service.listRecaps(f.id, fresh)).toEqual({ games: [] });
    expect(() => f.service.listRecaps(f.id, mintSession())).toThrow("FORBIDDEN");
    expect(() => f.service.readRecap(f.id, f.tokens[0]!, randomUUID())).toThrow("FORBIDDEN");
    expect(f.state().game).toBeNull();
    expect(f.state().members.every((p) => !p.ready)).toBe(true);
  });
});

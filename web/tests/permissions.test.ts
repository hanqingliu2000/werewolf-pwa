import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mintSession } from "../src/server/service";
import { privateView, publicView } from "../src/server/views";
import { fixture } from "./server-helpers";
import { command, nightToDawn, config } from "./helpers";
import type { Mutation } from "../src/server/input";

const fixtures: Awaited<Awaited<ReturnType<typeof fixture>>>[] = [];
async function setup(count = 8) { const f = await fixture(count); fixtures.push(f); return f; }
afterEach(() => { while (fixtures.length) fixtures.pop()!.close(); });

describe("identity and role projections", () => {
  it("does not treat an id, room code or host seat as credentials", async () => {
    const f = await setup();
    await expect(f.service.view(f.id, mintSession())).rejects.toThrow("INVALID_SESSION");
    await expect(f.service.view(f.id, f.tokens[1]!, "host")).rejects.toThrow("FORBIDDEN");
    const other = await f.service.create(mintSession(), { requestId: randomUUID(), name: "Other", config });
    await expect(f.service.view(other.roomId, f.tokens[0]!)).rejects.toThrow("INVALID_SESSION");
    const forged = { ...f.envelope({ type: "ready", ready: true }), actorId: f.state().hostId };
    await expect(f.service.mutate(f.id, f.tokens[1]!, forged)).rejects.toThrow("INPUT_INVALID");
    const inner = { ...f.envelope({ type: "ready", ready: true }), operation: { type: "ready", ready: true, actorId: f.state().hostId } };
    await expect(f.service.mutate(f.id, f.tokens[1]!, inner)).rejects.toThrow("INPUT_INVALID");
  });

  it.each(["configure", "kick", "start", "begin_night", "cue_ack", "pause", "resume", "abort", "restart", "day_draft", "day_confirm", "day_publish"])("denies non-host %s", async (type) => {
    const f = await setup();
    const operation = type === "configure" ? { type, config } : type === "kick" ? { type, playerId: f.state().hostId }
      : type === "day_draft" ? { type, targetId: null } : ["day_confirm", "day_publish"].includes(type) ? { type, draftId: randomUUID() } : { type };
    await expect(f.act(operation as Mutation["operation"], 1)).rejects.toThrow("FORBIDDEN");
  });

  it("returns no roles, potion data, private counts, internal revisions or session hashes publicly", async () => {
    const f = await setup(); await f.start();
    const view = await f.service.view(f.id, f.tokens[0]!);
    const serialized = JSON.stringify(view);
    for (const field of ["sessionHash", "wolfProposals", "witchPotions", "pendingDeaths", "seerReports", "updatedAt", "expiresAt", "roleAcknowledgements"]) expect(serialized).not.toContain(field);
    expect(view.players!.every((p) => "revealedRole" in p && p.revealedRole === null)).toBe(true);
    expect(await f.service.view(f.id, f.tokens[0]!, "host")).not.toHaveProperty("role");
    expect(await f.service.view(f.id, f.tokens[2]!, "private")).toMatchObject({ role: "seer", reports: [] });
    expect(await f.service.view(f.id, f.tokens[6]!, "private")).not.toHaveProperty("reports");
    expect(await f.service.view(f.id, f.tokens[3]!, "private")).toHaveProperty("witch.canSeeWolfTarget", false);
  });

  it("does not change the public view or host cue when a secret action is submitted", async () => {
    const f = await setup(); await f.begin(); await f.act({ type: "cue_ack" });
    const before = await f.service.view(f.id, f.tokens[0]!);
    const hostBefore = await f.service.view(f.id, f.tokens[0]!, "host");
    await f.act({ type: "guard", targetId: f.state().hostId }, 4);
    expect(await f.service.view(f.id, f.tokens[0]!)).toEqual(before);
    expect(await f.service.view(f.id, f.tokens[0]!, "host")).toEqual(hostBefore);
    expect(await f.service.view(f.id, f.tokens[4]!, "private")).toMatchObject({ completed: true, action: null });
  });

  it("conceals internal deaths including the hunter and witch until dawn publication", async () => {
    const f = await setup(); await f.begin();
    f.patch((room) => { room.game = nightToDawn(room.game!, { kill: room.members[5]!.id,
      witch: { choice: "poison", targetId: room.members[3]!.id } }); });
    f.time.now = f.state().game!.updatedAt;
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    await f.act({ type: "resume" });
    const room = f.state();
    expect(publicView(room).players.every((p) => "alive" in p && p.alive)).toBe(true);
    expect(privateView(room, room.members[3]!)).toHaveProperty("witch");
    expect(privateView(room, room.members[3]!)).toHaveProperty("alive", true);
    expect(privateView(room, room.members[5]!)).toHaveProperty("hunterReaction", false);
    await f.act({ type: "cue_ack" });
    const after = await f.service.view(f.id, f.tokens[0]!);
    expect(after.players![5]).toMatchObject({ alive: false, revealedRole: "hunter" });
    expect(after.players![3]).toMatchObject({ alive: false, revealedRole: null });
    expect(await f.service.view(f.id, f.tokens[5]!, "private")).toHaveProperty("hunterReaction", true);
    expect(await f.service.view(f.id, f.tokens[3]!, "private")).not.toHaveProperty("witch");
  });

  it("shows wolf collaboration only to living wolves in their window", async () => {
    const f = await setup(); await f.begin();
    f.patch((room) => { room.game = command(room.game!, { type: "open_window", actorId: room.hostId });
      room.game = command(room.game, { type: "guard", actorId: room.members[4]!.id, targetId: null });
      room.game = command(room.game, { type: "close_window", actorId: room.hostId }, room.game.window!.deadline);
      room.game = command(room.game, { type: "finish_role", actorId: room.hostId }); });
    f.time.now = f.state().game!.updatedAt;
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    await f.act({ type: "resume" });
    await f.act({ type: "cue_ack" });
    await f.act({ type: "wolf_propose", targetId: f.state().members[7]!.id });
    expect(await f.service.view(f.id, f.tokens[1]!, "private")).toHaveProperty("wolves.proposals");
    expect(await f.service.view(f.id, f.tokens[2]!, "private")).not.toHaveProperty("wolves");
    f.patch((room) => { const id = room.members[1]!.id; room.game!.players[1]!.alive = false;
      room.game!.publicEvents.push({ type: "deaths", nightNo: 0, playerIds: [id], revealedHunters: [] }); });
    const dead = await f.service.view(f.id, f.tokens[1]!, "private");
    expect(dead).not.toHaveProperty("wolves"); expect(dead).not.toHaveProperty("teammates");
    await expect(f.act({ type: "wolf_confirm", consensusId: f.state().consensusId }, 1)).rejects.toThrow("ACTOR_ELIMINATED");
  });

  it("does not publish vote drafts and keeps organization rights after host death", async () => {
    const f = await setup(); await f.begin();
    f.patch((room) => { room.game = nightToDawn(room.game!, { kill: room.hostId });
      room.game = command(room.game, { type: "publish_dawn", actorId: room.hostId }); });
    f.time.now = f.state().game!.updatedAt;
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    await f.act({ type: "resume" });
    const before = await f.service.view(f.id, f.tokens[1]!);
    await f.act({ type: "day_draft", targetId: f.state().members[7]!.id }); await f.act({ type: "day_confirm", draftId: f.state().draftId! });
    expect(await f.service.view(f.id, f.tokens[1]!)).toEqual(before);
    expect(await f.service.view(f.id, f.tokens[0]!, "host")).toHaveProperty("dayDraft.confirmed", true);
    await f.act({ type: "day_publish", draftId: f.state().draftId! });
    expect(f.state().game!.phase).toBe("night_open");
    await f.act({ type: "pause" }); expect(f.state().game!.paused).toBe(true);
  });

  it("recaps require participation in that game, not just room membership", async () => {
    const f = await setup(); await f.start();
    const gameId = f.state().game!.id;
    await expect(f.service.readRecap(f.id, f.tokens[0]!, gameId)).rejects.toThrow("PHASE_MISMATCH");
    await f.act({ type: "abort" });
    expect(await f.service.readRecap(f.id, f.tokens[7]!, gameId)).toHaveProperty("aborted", true);
    await f.act({ type: "restart" });
    const removed = f.state().members[7]!.id;
    await f.act({ type: "kick", playerId: removed });
    const fresh = mintSession();
    await f.service.join(f.id, fresh, { requestId: randomUUID(), epochId: f.state().lobbyId, name: "New player" });
    await expect(f.service.readRecap(f.id, fresh, gameId)).rejects.toThrow("FORBIDDEN");
    expect(await f.service.readRecap(f.id, f.tokens[7]!, gameId)).toHaveProperty("gameId", gameId);
    expect(await f.service.listRecaps(f.id, f.tokens[7]!)).toEqual({ games: [{ gameId, winner: null, aborted: true }] });
    expect(await f.service.listRecaps(f.id, fresh)).toEqual({ games: [] });
    await expect(f.service.listRecaps(f.id, mintSession())).rejects.toThrow("FORBIDDEN");
    await expect(f.service.readRecap(f.id, f.tokens[0]!, randomUUID())).rejects.toThrow("FORBIDDEN");
    expect(f.state().game).toBeNull();
    expect(f.state().members.every((p) => !p.ready)).toBe(true);
  });
});

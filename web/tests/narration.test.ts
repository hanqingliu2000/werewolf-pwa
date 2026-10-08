import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { captions, narrationPlan, NARRATION_VERSION, type NarrationView } from "../src/narration/plan";
import { publicView } from "../src/server/views";
import { fixture } from "./server-helpers";
import { config, nightToDawn } from "./helpers";
import type { PublicEvent } from "../src/game/types";

const fixtures: Awaited<Awaited<ReturnType<typeof fixture>>>[] = [];
async function setup() { const f = await fixture(); fixtures.push(f); return f; }
afterEach(() => { while (fixtures.length) fixtures.pop()!.close(); });
const enable = async (f: Awaited<Awaited<ReturnType<typeof fixture>>>) => await f.act({ type: "narration_mode", mode: "voice", version: NARRATION_VERSION, trialConfirmed: true });
const announce = async (f: Awaited<Awaited<ReturnType<typeof fixture>>>) => await f.act({ type: "announcement_done", cueId: f.state().narration!.pending!.id, version: NARRATION_VERSION });
const cue = async (f: Awaited<Awaited<ReturnType<typeof fixture>>>) => await f.act({ type: "cue_ack", cueId: f.state().flowId, version: NARRATION_VERSION });
async function begin(f: Awaited<Awaited<ReturnType<typeof fixture>>>) {
  await enable(f); await f.start(); await announce(f);
  await f.act({ type: "begin_night" });
}

describe("public narration contract", () => {
  it("requires a host trial, changes mode only while safe, and supports old snapshots", async () => {
    const f = await setup();
    f.patch((room) => { delete room.narration; });
    expect(publicView(f.state()).narration.mode).toBe("text");
    await expect(f.act({ type: "narration_mode", mode: "voice", version: NARRATION_VERSION, trialConfirmed: false })).rejects.toThrow("AUDIO_TRIAL_REQUIRED");
    await expect(f.act({ type: "narration_mode", mode: "voice", version: NARRATION_VERSION, trialConfirmed: true }, 1)).rejects.toThrow("FORBIDDEN");
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: false, narrationVersion: NARRATION_VERSION });
    await expect(enable(f)).rejects.toThrow("AUDIO_TRIAL_REQUIRED");
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
    await begin(f);
    await expect(f.act({ type: "narration_mode", mode: "text", version: NARRATION_VERSION, trialConfirmed: false })).rejects.toThrow("PAUSE_BEFORE_MODE_CHANGE");
    await f.act({ type: "pause" }); await f.act({ type: "narration_mode", mode: "text", version: NARRATION_VERSION, trialConfirmed: false });
    expect(publicView(f.state()).narration.mode).toBe("text");
  });

  it("gates public announcements and opens the clock only after a matching completed cue", async () => {
    const f = await setup(); await enable(f); await f.start();
    const pending = f.state().narration!.pending!;
    expect((await f.service.view(f.id, f.tokens[0]!, "host")).canBeginNight).toBe(false);
    await expect(f.act({ type: "begin_night" })).rejects.toThrow("ANNOUNCEMENT_PENDING");
    await expect(f.act({ type: "announcement_done", cueId: randomUUID() })).rejects.toThrow("STALE_CUE");
    const envelope = f.envelope({ type: "announcement_done", cueId: pending.id, version: NARRATION_VERSION });
    const receipt = await f.service.mutate(f.id, f.tokens[0]!, envelope);
    expect(await f.service.mutate(f.id, f.tokens[0]!, envelope)).toEqual(receipt);
    expect((await f.service.view(f.id, f.tokens[0]!, "host")).canBeginNight).toBe(true);
    await f.act({ type: "begin_night" });
    expect(f.state().game!.window).toBeNull();
    await expect(f.act({ type: "cue_ack", version: NARRATION_VERSION })).rejects.toThrow("STALE_CUE");
    await expect(f.act({ type: "cue_ack", cueId: randomUUID(), version: NARRATION_VERSION })).rejects.toThrow("STALE_CUE");
    const before = f.envelope({ type: "cue_ack", cueId: f.state().flowId, version: NARRATION_VERSION });
    f.time.now += 7000; await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
    await f.service.mutate(f.id, f.tokens[0]!, before);
    expect(f.state().game!.window).toMatchObject({ openedAt: f.time.now, deadline: f.time.now + 30_000 });
    const game = f.state().game;
    await f.service.mutate(f.id, f.tokens[0]!, before);
    expect(f.state().game).toEqual(game);
    await expect(f.act({ type: "announcement_done", cueId: pending.id })).rejects.toThrow("STALE_CUE");
  });

  it("announces hunters only after publication and holds the gun until the announcement ends", async () => {
    const f = await setup(); await begin(f);
    const hunter = f.state().game!.players.find((p) => p.role === "hunter")!;
    const index = f.state().members.findIndex((p) => p.id === hunter.id);
    f.patch((room) => { room.game = nightToDawn(room.game!, { kill: hunter.id }); room.heartbeatAt = room.game.updatedAt; });
    f.time.now = f.state().game!.updatedAt;
    const before = await f.service.view(f.id, f.tokens[0]!);
    expect(narrationPlan(before)?.clips).toEqual(["dawn"]);
    expect(before.players.every((p) => "alive" in p && p.alive)).toBe(true);
    await cue(f);
    const plan = narrationPlan(await f.service.view(f.id, f.tokens[0]!))!;
    expect(plan.clips).toEqual(["death_list", `seat_${hunter.seat}`, "hunter_identity", "hunter_open"]);
    expect((await f.service.view(f.id, f.tokens[index]!, "private")).hunterReaction).toBe(false);
    await expect(f.act({ type: "hunter", targetId: null }, index)).rejects.toThrow("ANNOUNCEMENT_PENDING");
    await announce(f);
    expect((await f.service.view(f.id, f.tokens[index]!, "private")).hunterReaction).toBe(true);
    await f.act({ type: "hunter", targetId: null }, index);
    expect(narrationPlan(publicView(f.state()))?.clips).toEqual(["hunter_pass", "day"]);
  });

  it("preserves pending words across pause and explicit text fallback, rejects stale callbacks", async () => {
    const f = await setup(); await begin(f);
    f.patch((room) => { room.game = nightToDawn(room.game!); room.heartbeatAt = room.game.updatedAt; });
    f.time.now = f.state().game!.updatedAt; await cue(f);
    const pending = f.state().narration!.pending!; const stale = f.envelope({ type: "announcement_done", cueId: pending.id, version: NARRATION_VERSION });
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: false, narrationVersion: NARRATION_VERSION });
    expect(f.state().game!.paused).toBe(true); expect(f.state().narration!.pending).toEqual(pending);
    expect(narrationPlan(publicView(f.state()))).toBeNull();
    await expect(f.service.mutate(f.id, f.tokens[0]!, stale)).rejects.toThrow("STALE_WINDOW");
    await expect(announce(f)).rejects.toThrow("HOST_NOT_READY");
    await f.act({ type: "narration_mode", mode: "text", version: NARRATION_VERSION, trialConfirmed: false });
    await announce(f); expect(f.state().game!.phase).toBe("day");
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION }); await f.act({ type: "resume" });
    await f.act({ type: "day_draft", targetId: null }); await f.act({ type: "day_confirm", draftId: f.state().draftId! });
    await f.act({ type: "day_publish", draftId: f.state().draftId! });
    expect(f.state().game!.nightNo).toBe(2); expect(f.state().narration!.pending).toBeNull();
  });

  it("replaces obsolete announcements on abort and clears every old cue on restart", async () => {
    const f = await setup(); await enable(f); await f.start(); const old = f.state().narration!.pending!.id;
    await f.act({ type: "abort" });
    expect(narrationPlan(publicView(f.state()))?.clips).toEqual(["abort"]);
    await expect(f.act({ type: "restart" })).rejects.toThrow("ANNOUNCEMENT_PENDING");
    await announce(f); const previousEpoch = publicView(f.state()).epochId; await f.act({ type: "restart" });
    const next = publicView(f.state()); expect(next.epochId).not.toBe(previousEpoch);
    expect(narrationPlan(next)?.clips).toEqual(["new_lobby"]);
    await expect(f.act({ type: "announcement_done", cueId: old })).rejects.toThrow("STALE_CUE");
    await expect(f.act({ type: "start" })).rejects.toThrow("ANNOUNCEMENT_PENDING");
    await announce(f); expect(narrationPlan(publicView(f.state()))).toBeNull();
  });

  it("pauses old or versionless voice heartbeats without dropping accepted actions", async () => {
    const f = await setup(); await begin(f); await cue(f); await f.act({ type: "guard", targetId: null }, 4);
    const actions = structuredClone(f.state().game!.currentNight!.actions);
    f.time.now += 4000;
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    expect(f.state().game!.paused).toBe(true); expect(f.state().game!.window!.remainingMs).toBe(26_000);
    expect(f.state().game!.currentNight!.actions).toEqual(actions);
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: "old-bank" });
    await expect(f.act({ type: "resume" })).rejects.toThrow("HOST_NOT_READY");
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
    expect(f.state().game!.paused).toBe(true); await f.act({ type: "resume" });
    expect(f.state().game!.window!.deadline).toBe(f.time.now + 56_000);
  });

  it.each(["host-zh-v2", "before-upgrade"])("requires a new trial after upgrading from %s and rejects old callbacks", async (version) => {
    const f = await setup(); await begin(f); await cue(f); await f.act({ type: "guard", targetId: null }, 4);
    f.patch((room) => { room.narration!.version = version; });
    const phase = await f.service.view(f.id, f.tokens[0]!);
    expect(phase.paused).toBe(true);
    const preserved = structuredClone(f.state().game!);
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
    await expect(f.act({ type: "resume" })).rejects.toThrow("STALE_AUDIO");
    await enable(f); expect(f.state().game).toEqual(preserved); await f.act({ type: "resume" });
    await f.act({ type: "abort" });
    const cueId = f.state().narration!.pending!.id;
    await expect(f.act({ type: "announcement_done", cueId, version })).rejects.toThrow("STALE_AUDIO");
    await expect(f.act({ type: "announcement_done", cueId })).rejects.toThrow("STALE_AUDIO");
    await announce(f); await f.act({ type: "restart" }); await announce(f);
  });

  it("rejects a voice clock acknowledgement without the current bank version", async () => {
    const f = await setup(); await begin(f);
    const cueId = f.state().flowId;
    await expect(f.act({ type: "cue_ack", cueId })).rejects.toThrow("STALE_AUDIO");
    await expect(f.act({ type: "cue_ack", cueId, version: "old-bank" })).rejects.toThrow("STALE_AUDIO");
    expect(f.state().game!.window).toBeNull(); await cue(f);
  });

  it("preserves the old manual text protocol without a voice bank handshake", async () => {
    const f = await setup(); await f.begin();
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    expect(f.state().game!.paused).toBe(false); await f.act({ type: "cue_ack" });
    expect(f.state().game!.phase).toBe("night_action");
  });
});

describe("public-only script composition", () => {
  const base: NarrationView = { epochId: "game", windowId: "window", phase: "day", nightNo: 1, nightRole: null, paused: false,
    config, players: [{ id: "one", seat: 1 }, { id: "twelve", seat: 12 }], events: [], narration: { mode: "voice", version: NARRATION_VERSION, pending: null } };
  function events(events: PublicEvent[], phase: NarrationView["phase"] = "day") {
    return narrationPlan({ ...base, phase, events, narration: { ...base.narration, pending: { id: "event", from: 0, to: events.length } } })!;
  }
  it("covers plain deaths, poison-ineligible hunter identity, votes, shots and endings without causes or nicknames", () => {
    expect(events([{ type: "deaths", nightNo: 1, playerIds: [], revealedHunters: [] }]).clips).toEqual(["no_death", "day"]);
    const poisoned = events([{ type: "deaths", nightNo: 1, playerIds: ["one", "twelve"], revealedHunters: ["twelve"] }]);
    expect(poisoned.clips).toEqual(["death_list", "seat_1", "seat_12", "hunter_identity", "day"]);
    expect(captions(poisoned.clips)).not.toMatch(/毒|刀口|狼人阵营|查验结果/);
    expect(events([{ type: "day_vote", nightNo: 1, playerId: "one", revealedHunterId: "one" }], "hunter").clips).toEqual(["vote_list", "seat_1", "hunter_identity", "hunter_open"]);
    expect(events([{ type: "day_vote", nightNo: 1, playerId: null, revealedHunterId: null }], "night_open").clips).toEqual(["vote_none"]);
    expect(events([{ type: "hunter_reaction", nightNo: 1, origin: "day", playerId: "one", targetId: "twelve" }]).clips).toEqual(["hunter_shot", "seat_12", "day"]);
    for (const winner of ["good", "wolf", "draw"] as const) expect(events([{ type: "game_end", winner, aborted: false }], "end").clips).toEqual([winner === "draw" ? "draw" : `${winner}_win`]);
    expect(events([{ type: "roles_dealt" }], "reveal").clips).toEqual(["roles_dealt"]);
    expect(() => events([{ type: "deaths", nightNo: 1, playerIds: ["missing"], revealedHunters: [] }])).toThrow("PUBLIC_SEAT_MISSING");
  });
  it("calls configured roles uniformly and never repeats old public event history", () => {
    for (const role of ["guard", "werewolf", "witch", "seer"] as const) {
      expect(narrationPlan({ ...base, phase: "night_open", nightRole: role })?.clips).toEqual(role === "guard" ? ["night_start", "guard_open"] : [`${role}_open`]);
      expect(narrationPlan({ ...base, phase: "night_close", nightRole: role })?.clips).toEqual([`${role}_close`]);
    }
    const noGuard = { ...config, roles: { ...config.roles, guard: 0, villager: 3 } };
    expect(narrationPlan({ ...base, config: noGuard, phase: "night_open", nightRole: "werewolf" })?.clips).toEqual(["night_start", "werewolf_open"]);
    expect(narrationPlan({ ...base, phase: "night_action", nightRole: "guard", events: [{ type: "roles_dealt" }] })).toBeNull();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { captions, narrationPlan, NARRATION_VERSION, type NarrationView } from "../src/narration/plan";
import { publicView } from "../src/server/views";
import { fixture } from "./server-helpers";
import { config, nightToDawn } from "./helpers";
import type { PublicEvent } from "../src/game/types";

const fixtures: ReturnType<typeof fixture>[] = [];
function setup() { const f = fixture(); fixtures.push(f); return f; }
afterEach(() => { while (fixtures.length) fixtures.pop()!.close(); });
const enable = (f: ReturnType<typeof fixture>) => f.act({ type: "narration_mode", mode: "voice", version: NARRATION_VERSION, trialConfirmed: true });
const announce = (f: ReturnType<typeof fixture>) => f.act({ type: "announcement_done", cueId: f.state().narration!.pending!.id, version: NARRATION_VERSION });
const cue = (f: ReturnType<typeof fixture>) => f.act({ type: "cue_ack", cueId: f.state().flowId, version: NARRATION_VERSION });
function begin(f: ReturnType<typeof fixture>) {
  enable(f); f.start(); announce(f);
  for (let i = 0; i < 8; i++) f.act({ type: "acknowledge" }, i);
  f.act({ type: "begin_night" });
}

describe("public narration contract", () => {
  it("requires a host trial, changes mode only while safe, and supports old snapshots", () => {
    const f = setup();
    f.patch((room) => { delete room.narration; });
    expect(publicView(f.state()).narration.mode).toBe("text");
    expect(() => f.act({ type: "narration_mode", mode: "voice", version: NARRATION_VERSION, trialConfirmed: false })).toThrow("AUDIO_TRIAL_REQUIRED");
    expect(() => f.act({ type: "narration_mode", mode: "voice", version: NARRATION_VERSION, trialConfirmed: true }, 1)).toThrow("FORBIDDEN");
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: false, narrationVersion: NARRATION_VERSION });
    expect(() => enable(f)).toThrow("AUDIO_TRIAL_REQUIRED");
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
    begin(f);
    expect(() => f.act({ type: "narration_mode", mode: "text", version: NARRATION_VERSION, trialConfirmed: false })).toThrow("PAUSE_BEFORE_MODE_CHANGE");
    f.act({ type: "pause" }); f.act({ type: "narration_mode", mode: "text", version: NARRATION_VERSION, trialConfirmed: false });
    expect(publicView(f.state()).narration.mode).toBe("text");
  });

  it("gates public announcements and opens the clock only after a matching completed cue", () => {
    const f = setup(); enable(f); f.start();
    const pending = f.state().narration!.pending!;
    for (let i = 0; i < 8; i++) f.act({ type: "acknowledge" }, i);
    expect(() => f.act({ type: "begin_night" })).toThrow("ANNOUNCEMENT_PENDING");
    expect(() => f.act({ type: "announcement_done", cueId: randomUUID() })).toThrow("STALE_CUE");
    const envelope = f.envelope({ type: "announcement_done", cueId: pending.id, version: NARRATION_VERSION });
    const receipt = f.service.mutate(f.id, f.tokens[0]!, envelope);
    expect(f.service.mutate(f.id, f.tokens[0]!, envelope)).toEqual(receipt);
    f.act({ type: "begin_night" });
    expect(f.state().game!.window).toBeNull();
    expect(() => f.act({ type: "cue_ack", version: NARRATION_VERSION })).toThrow("STALE_CUE");
    expect(() => f.act({ type: "cue_ack", cueId: randomUUID(), version: NARRATION_VERSION })).toThrow("STALE_CUE");
    const before = f.envelope({ type: "cue_ack", cueId: f.state().flowId, version: NARRATION_VERSION });
    f.time.now += 7000; f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
    f.service.mutate(f.id, f.tokens[0]!, before);
    expect(f.state().game!.window).toMatchObject({ openedAt: f.time.now, deadline: f.time.now + 30_000 });
    const game = f.state().game;
    f.service.mutate(f.id, f.tokens[0]!, before);
    expect(f.state().game).toEqual(game);
    expect(() => f.act({ type: "announcement_done", cueId: pending.id })).toThrow("STALE_CUE");
  });

  it("announces hunters only after publication and holds the gun until the announcement ends", () => {
    const f = setup(); begin(f);
    const hunter = f.state().game!.players.find((p) => p.role === "hunter")!;
    const index = f.state().members.findIndex((p) => p.id === hunter.id);
    f.patch((room) => { room.game = nightToDawn(room.game!, { kill: hunter.id }); room.heartbeatAt = room.game.updatedAt; });
    f.time.now = f.state().game!.updatedAt;
    const before = f.service.view(f.id, f.tokens[0]!);
    expect(narrationPlan(before)?.clips).toEqual(["dawn"]);
    expect(before.players.every((p) => "alive" in p && p.alive)).toBe(true);
    cue(f);
    const plan = narrationPlan(f.service.view(f.id, f.tokens[0]!))!;
    expect(plan.clips).toEqual(["death_list", `seat_${hunter.seat}`, "hunter_identity", "hunter_open"]);
    expect(f.service.view(f.id, f.tokens[index]!, "private").hunterReaction).toBe(false);
    expect(() => f.act({ type: "hunter", targetId: null }, index)).toThrow("ANNOUNCEMENT_PENDING");
    announce(f);
    expect(f.service.view(f.id, f.tokens[index]!, "private").hunterReaction).toBe(true);
    f.act({ type: "hunter", targetId: null }, index);
    expect(narrationPlan(publicView(f.state()))?.clips).toEqual(["hunter_pass", "day"]);
  });

  it("preserves pending words across pause and explicit text fallback, rejects stale callbacks", () => {
    const f = setup(); begin(f);
    f.patch((room) => { room.game = nightToDawn(room.game!); room.heartbeatAt = room.game.updatedAt; });
    f.time.now = f.state().game!.updatedAt; cue(f);
    const pending = f.state().narration!.pending!; const stale = f.envelope({ type: "announcement_done", cueId: pending.id, version: NARRATION_VERSION });
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: false, narrationVersion: NARRATION_VERSION });
    expect(f.state().game!.paused).toBe(true); expect(f.state().narration!.pending).toEqual(pending);
    expect(narrationPlan(publicView(f.state()))).toBeNull();
    expect(() => f.service.mutate(f.id, f.tokens[0]!, stale)).toThrow("STALE_WINDOW");
    expect(() => announce(f)).toThrow("HOST_NOT_READY");
    f.act({ type: "narration_mode", mode: "text", version: NARRATION_VERSION, trialConfirmed: false });
    announce(f); expect(f.state().game!.phase).toBe("day");
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION }); f.act({ type: "resume" });
    f.act({ type: "day_draft", targetId: null }); f.act({ type: "day_confirm", draftId: f.state().draftId! });
    f.act({ type: "day_publish", draftId: f.state().draftId! });
    expect(f.state().game!.nightNo).toBe(2); expect(f.state().narration!.pending).toBeNull();
  });

  it("replaces obsolete announcements on abort and clears every old cue on restart", () => {
    const f = setup(); enable(f); f.start(); const old = f.state().narration!.pending!.id;
    f.act({ type: "abort" });
    expect(narrationPlan(publicView(f.state()))?.clips).toEqual(["abort"]);
    expect(() => f.act({ type: "restart" })).toThrow("ANNOUNCEMENT_PENDING");
    announce(f); const previousEpoch = publicView(f.state()).epochId; f.act({ type: "restart" });
    const next = publicView(f.state()); expect(next.epochId).not.toBe(previousEpoch);
    expect(narrationPlan(next)?.clips).toEqual(["new_lobby"]);
    expect(() => f.act({ type: "announcement_done", cueId: old })).toThrow("STALE_CUE");
    expect(() => f.act({ type: "start" })).toThrow("ANNOUNCEMENT_PENDING");
    announce(f); expect(narrationPlan(publicView(f.state()))).toBeNull();
  });

  it("pauses old or versionless voice heartbeats without dropping accepted actions", () => {
    const f = setup(); begin(f); cue(f); f.act({ type: "guard", targetId: null }, 4);
    const actions = structuredClone(f.state().game!.currentNight!.actions);
    f.time.now += 4000;
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    expect(f.state().game!.paused).toBe(true); expect(f.state().game!.window!.remainingMs).toBe(26_000);
    expect(f.state().game!.currentNight!.actions).toEqual(actions);
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: "old-bank" });
    expect(() => f.act({ type: "resume" })).toThrow("HOST_NOT_READY");
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
    expect(f.state().game!.paused).toBe(true); f.act({ type: "resume" });
    expect(f.state().game!.window!.deadline).toBe(f.time.now + 56_000);
  });

  it("requires a new trial after a bank upgrade and rejects old completed callbacks", () => {
    const f = setup(); begin(f); cue(f); f.act({ type: "guard", targetId: null }, 4);
    f.patch((room) => { room.narration!.version = "before-upgrade"; });
    const phase = f.service.view(f.id, f.tokens[0]!);
    expect(phase.paused).toBe(true);
    const preserved = structuredClone(f.state().game!);
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
    expect(() => f.act({ type: "resume" })).toThrow("STALE_AUDIO");
    enable(f); expect(f.state().game).toEqual(preserved); f.act({ type: "resume" });
    f.act({ type: "abort" });
    const cueId = f.state().narration!.pending!.id;
    expect(() => f.act({ type: "announcement_done", cueId, version: "before-upgrade" })).toThrow("STALE_AUDIO");
    expect(() => f.act({ type: "announcement_done", cueId })).toThrow("STALE_AUDIO");
    announce(f); f.act({ type: "restart" }); announce(f);
  });

  it("rejects a voice clock acknowledgement without the current bank version", () => {
    const f = setup(); begin(f);
    const cueId = f.state().flowId;
    expect(() => f.act({ type: "cue_ack", cueId })).toThrow("STALE_AUDIO");
    expect(() => f.act({ type: "cue_ack", cueId, version: "old-bank" })).toThrow("STALE_AUDIO");
    expect(f.state().game!.window).toBeNull(); cue(f);
  });

  it("preserves the old manual text protocol without a voice bank handshake", () => {
    const f = setup(); f.begin();
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    expect(f.state().game!.paused).toBe(false); f.act({ type: "cue_ack" });
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

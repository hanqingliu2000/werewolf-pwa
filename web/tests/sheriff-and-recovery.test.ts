import { describe, expect, it } from "vitest";
import { command, nightToDawn, started } from "./helpers";
import { fixture } from "./server-helpers";
import { publicView, privateView } from "../src/server/views";
import { narrationPlan, NARRATION_VERSION } from "../src/narration/plan";

describe("first-night election and system recovery", () => {
  it("settles privately, blocks early publication and enforces both election stages", () => {
    let game = nightToDawn(started(), { kill: "p6" }, false);
    expect(game.sheriffElection).toBe("hands_prompt");
    expect(game.publicEvents.filter(e => e.type === "deaths")).toEqual([]);
    expect(() => command(game, { type: "publish_dawn", actorId: game.hostId })).toThrow("ELECTION_PENDING");
    expect(() => command(game, { type: "sheriff_speech", actorId: "p2" })).toThrow("FORBIDDEN");
    expect(() => command(game, { type: "sheriff_complete", actorId: game.hostId })).toThrow("PHASE_MISMATCH");
    for (const type of ["election_prompt_done", "sheriff_speech", "election_prompt_done", "sheriff_complete"] as const) game = command(game, { type, actorId: game.hostId });
    game = command(game, { type: "publish_dawn", actorId: game.hostId });
    expect(game.phase).toBe("hunter"); expect(game.pendingHunter?.playerId).toBe("p6");
  });
  it("persists election gates, hides deaths from every view and never uses a timed election", async () => {
    const f = await fixture();
    try {
      await f.begin();
      const wolf = f.state().game!.players.find(p => p.role === "werewolf")!;
      f.patch(room => { room.game = nightToDawn(room.game!, { kill: wolf.id }, false); room.heartbeatAt = room.game.updatedAt; });
      f.time.now = f.state().game!.updatedAt;
      expect(narrationPlan(publicView(f.state()))?.clips).toEqual(["sheriff_hands"]);
      expect(publicView(f.state()).players.every(p => "alive" in p && p.alive)).toBe(true);
      expect(privateView(f.state(), f.state().members[0]!).teammates?.every(p => p.alive)).toBe(true);
      await expect(f.act({ type: "sheriff_speech" }, 1)).rejects.toThrow("FORBIDDEN");
      const first = f.envelope({ type: "cue_ack" }); await f.service.mutate(f.id, f.tokens[0]!, first);
      await f.service.mutate(f.id, f.tokens[0]!, first);
      expect(f.state().game!.sheriffElection).toBe("hands"); expect(narrationPlan(publicView(f.state()))).toBeNull();
      await expect(f.act({ type: "cue_ack" })).rejects.toThrow("ELECTION_PENDING");
      await expect(f.act({ type: "day_draft", targetId: null })).rejects.toThrow("PHASE_MISMATCH");
      expect(f.state().game!.window).toBeNull();
      await f.act({ type: "sheriff_speech" }); expect(narrationPlan(publicView(f.state()))?.clips).toEqual(["sheriff_speech"]);
      await f.act({ type: "cue_ack" }); await f.act({ type: "sheriff_complete" });
      expect(narrationPlan(publicView(f.state()))?.clips).toEqual(["first_result"]);
      await f.act({ type: "cue_ack" });
      expect(publicView(f.state()).events.some(e => e.type === "deaths")).toBe(true);
      expect(privateView(f.state(), f.state().members[0]!).teammates?.find(p => p.id === wolf.id)?.alive).toBe(false);
      expect(privateView(f.state(), f.state().members[2]!)).not.toHaveProperty("teammates");
      expect(publicView(f.state())).not.toHaveProperty("teammates");
    } finally { f.close(); }
  });
  it("automatically restores exactly the frozen action remainder, not a new window", async () => {
    const f = await fixture();
    try {
      await f.begin(); await f.act({ type: "cue_ack" });
      f.time.now += 4000;
      await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: false, audioReady: false });
      expect(f.state().game!.window!.remainingMs).toBe(6000);
      f.time.now += 60_000;
      await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
      expect(f.state().game!.paused).toBe(false); expect(f.state().pauseReason).toBeNull();
      expect(f.state().game!.window!.deadline).toBe(f.time.now + 6000);
      await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
      expect(f.state().game!.window!.deadline).toBe(f.time.now + 6000);
    } finally { f.close(); }
  });
  it("never auto-resumes a manual pause even after healthy heartbeats", async () => {
    const f = await fixture();
    try {
      await f.begin(); await f.act({ type: "pause" });
      await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: false, audioReady: false });
      await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
      expect(f.state().game!.paused).toBe(true); expect(f.state().pauseReason).toBe("manual");
      await f.act({ type: "resume" }); expect(f.state().game!.paused).toBe(false);
    } finally { f.close(); }
  });
});

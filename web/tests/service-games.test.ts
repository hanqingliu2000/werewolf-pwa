import { describe, expect, it } from "vitest";
import { preset } from "../src/game/config";
import { fixture } from "./server-helpers";
import { config } from "./helpers";
import { narrationPlan, NARRATION_VERSION } from "../src/narration/plan";
import { publicView } from "../src/server/views";

describe("complete persisted games", () => {
  it.each([8, 12])("keeps voice announcements ordered through an entire %i-player game and restart", async (count) => {
    const f = await fixture(count, count === 8 ? config : preset(12));
    const done = async () => {
      const plan = narrationPlan(publicView(f.state()))!;
      expect(plan.clips.length).toBeGreaterThan(0);
      await f.act({ type: plan.completion, cueId: plan.cueId, version: NARRATION_VERSION });
    };
    try {
      await f.act({ type: "narration_mode", mode: "voice", version: NARRATION_VERSION, trialConfirmed: true });
      await f.start(); await done();
      for (let i = 0; i < count; i++) await f.act({ type: "acknowledge" }, i);
      await f.act({ type: "begin_night" });
      while (f.state().game!.phase !== "end") {
        while (f.state().game!.phase === "night_open") {
          expect(f.state().game!.window).toBeNull(); await done();
          const game = f.state().game!;
          for (const p of game.players.filter((p) => p.alive && p.role === game.nightRole)) {
            const index = f.state().members.findIndex((m) => m.id === p.id);
            if (p.role === "guard" || p.role === "seer") await f.act({ type: p.role, targetId: null }, index);
            if (p.role === "witch") await f.act({ type: "witch", choice: "pass", targetId: null }, index);
            if (p.role === "werewolf") await f.act({ type: "wolf_propose", targetId: null }, index);
          }
          if (game.nightRole === "werewolf") {
            const consensusId = f.state().consensusId;
            for (const p of game.players.filter((p) => p.alive && p.role === "werewolf")) await f.act({ type: "wolf_confirm", consensusId }, f.state().members.findIndex((m) => m.id === p.id));
          }
          const deadline = game.window!.deadline;
          while (f.time.now < deadline) {
            f.time.now = Math.min(deadline, f.time.now + 3000);
            await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
          }
          expect(f.state().game!.phase).toBe("night_close"); await done();
        }
        expect(f.state().game!.phase).toBe("dawn"); await done();
        expect(f.state().narration!.pending).not.toBeNull(); await done();
        const wolf = f.state().game!.players.find((p) => p.alive && p.role === "werewolf")!;
        await f.act({ type: "day_draft", targetId: wolf.id }); await f.act({ type: "day_confirm", draftId: f.state().draftId! });
        await f.act({ type: "day_publish", draftId: f.state().draftId! });
        expect(f.state().narration!.pending).not.toBeNull(); await done();
      }
      expect(f.state().game!.winner).toBe("good");
      await f.act({ type: "restart" }); expect(narrationPlan(publicView(f.state()))?.clips).toEqual(["new_lobby"]); await done();
      expect(f.state().narration!.pending).toBeNull(); expect(f.state().game).toBeNull();
    } finally { f.close(); }
  });
  it.each([8, 12])("plays %i participants through victory and a fresh next game", async (count) => {
    const f = await fixture(count, count === 8 ? config : preset(12));
    try {
      await f.begin();
      const firstGameId = f.state().game!.id;
      while (f.state().game!.phase !== "end") {
        while (f.state().game!.phase === "night_open") {
          await f.act({ type: "cue_ack" });
          const game = f.state().game!;
          const actors = game.players.filter((p) => p.alive && p.role === game.nightRole);
          for (const p of actors) {
            const index = f.state().members.findIndex((m) => m.id === p.id);
            if (game.nightRole === "werewolf") await f.act({ type: "wolf_propose", targetId: null }, index);
            if (game.nightRole === "guard") await f.act({ type: "guard", targetId: null }, index);
            if (game.nightRole === "witch") await f.act({ type: "witch", choice: "pass", targetId: null }, index);
            if (game.nightRole === "seer") await f.act({ type: "seer", targetId: null }, index);
          }
          if (game.nightRole === "werewolf") {
            const consensusId = f.state().consensusId;
            for (const p of actors) await f.act({ type: "wolf_confirm", consensusId }, f.state().members.findIndex((m) => m.id === p.id));
          }
          const deadline = f.state().game!.window!.deadline;
          while (f.time.now < deadline) {
            f.time.now = Math.min(deadline, f.time.now + 3000);
            await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
          }
          expect(f.state().game!.phase).toBe("night_close");
          await f.act({ type: "cue_ack" });
        }
        expect(f.state().game!.phase).toBe("dawn"); await f.act({ type: "cue_ack" });
        const wolf = f.state().game!.players.find((p) => p.alive && p.role === "werewolf")!;
        await f.act({ type: "day_draft", targetId: wolf.id });
        const draftId = f.state().draftId!;
        await f.act({ type: "day_confirm", draftId }); await f.act({ type: "day_publish", draftId });
      }
      expect(f.state().game!.winner).toBe("good");
      expect((await f.service.readRecap(f.id, f.tokens[count - 1]!, firstGameId)).participants).toHaveLength(count);
      await f.act({ type: "restart" });
      await f.start();
      expect(f.state().game!.id).not.toBe(firstGameId);
      expect(f.state().game!).toMatchObject({ phase: "reveal", nightNo: 0, nights: [], seerReports: {},
        lastGuardTargetId: null, witchPotions: { save: true, poison: true }, roleAcknowledgements: [] });
    } finally { f.close(); }
  });
});

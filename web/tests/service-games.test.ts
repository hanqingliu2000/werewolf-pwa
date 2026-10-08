import { describe, expect, it } from "vitest";
import { preset } from "../src/game/config";
import { fixture } from "./server-helpers";
import { config } from "./helpers";
import { narrationPlan, NARRATION_VERSION } from "../src/narration/plan";
import { publicView } from "../src/server/views";

describe("complete persisted games", () => {
  it.each([8, 12])("keeps voice announcements ordered through an entire %i-player game and restart", (count) => {
    const f = fixture(count, count === 8 ? config : preset(12));
    const done = () => {
      const plan = narrationPlan(publicView(f.state()))!;
      expect(plan.clips.length).toBeGreaterThan(0);
      f.act({ type: plan.completion, cueId: plan.cueId, version: NARRATION_VERSION });
    };
    try {
      f.act({ type: "narration_mode", mode: "voice", version: NARRATION_VERSION, trialConfirmed: true });
      f.start(); done();
      for (let i = 0; i < count; i++) f.act({ type: "acknowledge" }, i);
      f.act({ type: "begin_night" });
      while (f.state().game!.phase !== "end") {
        while (f.state().game!.phase === "night_open") {
          expect(f.state().game!.window).toBeNull(); done();
          const game = f.state().game!;
          for (const p of game.players.filter((p) => p.alive && p.role === game.nightRole)) {
            const index = f.state().members.findIndex((m) => m.id === p.id);
            if (p.role === "guard" || p.role === "seer") f.act({ type: p.role, targetId: null }, index);
            if (p.role === "witch") f.act({ type: "witch", choice: "pass", targetId: null }, index);
            if (p.role === "werewolf") f.act({ type: "wolf_propose", targetId: null }, index);
          }
          if (game.nightRole === "werewolf") {
            const consensusId = f.state().consensusId;
            for (const p of game.players.filter((p) => p.alive && p.role === "werewolf")) f.act({ type: "wolf_confirm", consensusId }, f.state().members.findIndex((m) => m.id === p.id));
          }
          const deadline = game.window!.deadline;
          while (f.time.now < deadline) {
            f.time.now = Math.min(deadline, f.time.now + 3000);
            f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true, narrationVersion: NARRATION_VERSION });
          }
          expect(f.state().game!.phase).toBe("night_close"); done();
        }
        expect(f.state().game!.phase).toBe("dawn"); done();
        expect(f.state().narration!.pending).not.toBeNull(); done();
        const wolf = f.state().game!.players.find((p) => p.alive && p.role === "werewolf")!;
        f.act({ type: "day_draft", targetId: wolf.id }); f.act({ type: "day_confirm", draftId: f.state().draftId! });
        f.act({ type: "day_publish", draftId: f.state().draftId! });
        expect(f.state().narration!.pending).not.toBeNull(); done();
      }
      expect(f.state().game!.winner).toBe("good");
      f.act({ type: "restart" }); expect(narrationPlan(publicView(f.state()))?.clips).toEqual(["new_lobby"]); done();
      expect(f.state().narration!.pending).toBeNull(); expect(f.state().game).toBeNull();
    } finally { f.close(); }
  });
  it.each([8, 12])("plays %i participants through victory and a fresh next game", (count) => {
    const f = fixture(count, count === 8 ? config : preset(12));
    try {
      f.begin();
      const firstGameId = f.state().game!.id;
      while (f.state().game!.phase !== "end") {
        while (f.state().game!.phase === "night_open") {
          f.act({ type: "cue_ack" });
          const game = f.state().game!;
          const actors = game.players.filter((p) => p.alive && p.role === game.nightRole);
          for (const p of actors) {
            const index = f.state().members.findIndex((m) => m.id === p.id);
            if (game.nightRole === "werewolf") f.act({ type: "wolf_propose", targetId: null }, index);
            if (game.nightRole === "guard") f.act({ type: "guard", targetId: null }, index);
            if (game.nightRole === "witch") f.act({ type: "witch", choice: "pass", targetId: null }, index);
            if (game.nightRole === "seer") f.act({ type: "seer", targetId: null }, index);
          }
          if (game.nightRole === "werewolf") {
            const consensusId = f.state().consensusId;
            for (const p of actors) f.act({ type: "wolf_confirm", consensusId }, f.state().members.findIndex((m) => m.id === p.id));
          }
          const deadline = f.state().game!.window!.deadline;
          while (f.time.now < deadline) {
            f.time.now = Math.min(deadline, f.time.now + 3000);
            f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
          }
          expect(f.state().game!.phase).toBe("night_close");
          f.act({ type: "cue_ack" });
        }
        expect(f.state().game!.phase).toBe("dawn"); f.act({ type: "cue_ack" });
        const wolf = f.state().game!.players.find((p) => p.alive && p.role === "werewolf")!;
        f.act({ type: "day_draft", targetId: wolf.id });
        const draftId = f.state().draftId!;
        f.act({ type: "day_confirm", draftId }); f.act({ type: "day_publish", draftId });
      }
      expect(f.state().game!.winner).toBe("good");
      expect(f.service.readRecap(f.id, f.tokens[count - 1]!, firstGameId).participants).toHaveLength(count);
      f.act({ type: "restart" });
      f.start();
      expect(f.state().game!.id).not.toBe(firstGameId);
      expect(f.state().game!).toMatchObject({ phase: "reveal", nightNo: 0, nights: [], seerReports: {},
        lastGuardTargetId: null, witchPotions: { save: true, poison: true }, roleAcknowledgements: [] });
    } finally { f.close(); }
  });
});

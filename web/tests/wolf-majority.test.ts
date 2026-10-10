import { describe, expect, it, vi } from "vitest";
import { createGame, executeCommand } from "../src/game/engine";
import { preset } from "../src/game/config";
import { command, toRole } from "./helpers";
import { fixture } from "./server-helpers";
import { RoomService } from "../src/server/service";

function wolfWindow(count = 4) {
  const config = preset(12); config.roles.werewolf = count; config.roles.villager = 8 - count;
  const seats = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, name: `Player ${i + 1}` }));
  let game = createGame(config, seats, "p1");
  game = command(command(game, { type: "deal", actorId: "p1" }), { type: "begin_night", actorId: "p1" });
  return toRole(game, "werewolf");
}
function votes(targets: (string | null)[], index = 0) {
  let game = wolfWindow(targets.length); const rng = vi.fn(() => index);
  for (let i = 0; i < targets.length; i++) game = command(game, { type: "wolf_propose", actorId: `p${i + 1}`, targetId: targets[i]! });
  for (let i = 0; i < targets.length; i++) game = executeCommand(game, { type: "wolf_confirm", actorId: `p${i + 1}` }, game.updatedAt, { randomIndex: rng });
  return { game, rng };
}
describe("wolf majority and random ties", () => {
  it("uses the highest count even when it is not an absolute majority", () => {
    const { game, rng } = votes(["p9", "p9", "p10", "p11"]);
    expect(game.currentNight!.killTargetId).toBe("p9"); expect(rng).not.toHaveBeenCalled();
  });
  it.each([0, 1])("randomly selects only a tied highest target, index %i", index => {
    const { game, rng } = votes(["p9", "p9", "p10", "p10"], index);
    expect(game.currentNight!.killTargetId).toBe(index === 0 ? "p9" : "p10"); expect(rng).toHaveBeenCalledWith(2);
  });
  it("handles fully split votes and ties with an empty kill", () => {
    expect(votes(["p9", "p10", "p11", "p12"], 2).game.currentNight!.killTargetId).toBe("p11");
    expect(votes(["p9", "p9", null, null], 1).game.currentNight!.killTargetId).toBeNull();
  });
  it("permits an individual confirmation but does not lock before all living wolves confirm", () => {
    let game = wolfWindow(); game = command(game, { type: "wolf_propose", actorId: "p1", targetId: "p9" });
    game = command(game, { type: "wolf_confirm", actorId: "p1" });
    expect(game.currentNight!.killLocked).toBe(false);
    game = command(game, { type: "wolf_propose", actorId: "p2", targetId: "p10" });
    expect(game.currentNight!.wolfConfirmations).toEqual(["p1"]);
    game = command(game, { type: "wolf_propose", actorId: "p1", targetId: null });
    expect(game.currentNight!.wolfConfirmations).toEqual([]);
  });
  it.each([-1, 2, 0.5])("rejects an invalid tie RNG index %s", index => {
    expect(() => votes(["p9", "p9", "p10", "p10"], index)).toThrow("RANDOM_INDEX_INVALID");
  });
  it("ignores dead wolves when counting required ballots", () => {
    let game = wolfWindow(); game.players[3]!.alive = false;
    for (const actorId of ["p1", "p2", "p3"]) game = command(game, { type: "wolf_propose", actorId, targetId: "p9" });
    expect(() => command(game, { type: "wolf_confirm", actorId: "p4" })).toThrow("ACTOR_ELIMINATED");
    for (const actorId of ["p1", "p2", "p3"]) game = command(game, { type: "wolf_confirm", actorId });
    expect(game.currentNight!.killLocked).toBe(true);
  });
  it("restores a committed random decision and does not draw again for duplicate requests", async () => {
    const f = await fixture();
    try {
      await f.begin(); f.patch(room => { room.game = toRole(room.game!, "werewolf"); room.heartbeatAt = room.game.updatedAt; });
      f.time.now = f.state().game!.updatedAt;
      await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
      await f.act({ type: "wolf_propose", targetId: f.state().members[6]!.id });
      await f.act({ type: "wolf_propose", targetId: f.state().members[7]!.id }, 1);
      await f.act({ type: "wolf_confirm", consensusId: f.state().consensusId });
      const envelope = f.envelope({ type: "wolf_confirm", consensusId: f.state().consensusId });
      const receipt = await f.service.mutate(f.id, f.tokens[1]!, envelope);
      const restored = new RoomService(f.store, () => f.time.now, { randomIndex: () => { throw new Error("Must not draw twice"); } });
      expect(await restored.mutate(f.id, f.tokens[1]!, envelope)).toEqual(receipt);
      expect((await restored.view(f.id, f.tokens[1]!, "private")).actionResult?.targetId).toBe(f.state().members[7]!.id);
    } finally { f.close(); }
  });
});

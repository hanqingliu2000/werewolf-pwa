import { afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { fixture } from "./server-helpers";
import { command, nightToDawn, toRole } from "./helpers";
import { NARRATION_VERSION } from "../src/narration/plan";

const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
afterEach(() => { while (fixtures.length) fixtures.pop()!.close(); });
async function setup() { const f = await fixture(); fixtures.push(f); await f.begin(); return f; }

it.each(["guard", "werewolf", "witch", "seer"] as const)("opens only the %s actor's preview after the public opener without starting its clock", async role => {
  const f = await setup();
  f.patch(room => {
    room.game = toRole(room.game!, role); room.game.phase = "night_open"; room.game.window = null;
    room.game.currentNight!.witchKnowledge = null;
    room.heartbeatAt = room.game.updatedAt;
    room.narration = { mode: "voice", version: NARRATION_VERSION, pending: null };
  });
  f.time.now = f.state().game!.updatedAt;
  const actor = f.state().game!.players.find(p => p.role === role)!;
  const index = f.state().members.findIndex(p => p.id === actor.id);
  expect(await f.service.view(f.id, f.tokens[index]!, "private")).not.toHaveProperty("previewAction");
  const cueId = f.state().flowId;
  const envelope = f.envelope({ type: "action_prompt", cueId, version: NARRATION_VERSION });
  await expect(f.service.mutate(f.id, f.tokens[7]!, envelope)).rejects.toThrow("FORBIDDEN");
  await expect(f.act({ type: "action_prompt", cueId: randomUUID(), version: NARRATION_VERSION })).rejects.toThrow("STALE_CUE");
  const accepted = await f.service.mutate(f.id, f.tokens[0]!, envelope);
  expect(await f.service.mutate(f.id, f.tokens[0]!, envelope)).toEqual(accepted);
  expect(f.state().flowId).toBe(cueId); expect(f.state().game!.window).toBeNull();
  expect(await f.service.view(f.id, f.tokens[index]!, "private")).toMatchObject({ action: null, previewAction: role });
  expect(await f.service.view(f.id, f.tokens[7]!, "private")).not.toHaveProperty("previewAction");
  const action = role === "werewolf" ? { type: "wolf_propose" as const, targetId: f.state().members[7]!.id }
    : role === "witch" ? { type: "witch" as const, choice: "pass" as const, targetId: null }
      : { type: role, targetId: f.state().members[7]!.id };
  await expect(f.act(action, index)).rejects.toThrow("PHASE_MISMATCH");
  if (role === "witch") expect(await f.service.view(f.id, f.tokens[index]!, "private")).toMatchObject({ witch: { canSeeWolfTarget: true } });
  f.time.now += 500; f.patch(room => { room.heartbeatAt = f.time.now; });
  await f.act({ type: "cue_ack", cueId, version: NARRATION_VERSION });
  expect(f.state().game!.window!.deadline - f.state().game!.window!.openedAt).toBe(role === "werewolf" ? 30_000 : 10_000);
  expect(await f.service.view(f.id, f.tokens[index]!, "private")).not.toHaveProperty("previewAction");
});

it("never gives dead or exhausted gods a preview and clears eligibility on a safety pause", async () => {
  const f = await setup();
  f.patch(room => {
    room.game = toRole(room.game!, "witch"); room.game.phase = "night_open"; room.game.window = null;
    room.game.witchPotions = { save: false, poison: false }; room.heartbeatAt = room.game.updatedAt;
    room.narration = { mode: "voice", version: NARRATION_VERSION, pending: null };
  });
  f.time.now = f.state().game!.updatedAt;
  await f.act({ type: "action_prompt", cueId: f.state().flowId, version: NARRATION_VERSION });
  expect(await f.service.view(f.id, f.tokens[3]!, "private")).not.toHaveProperty("previewAction");
  f.patch(room => { room.game!.witchPotions.save = true; room.game!.players[3]!.alive = false; });
  expect(await f.service.view(f.id, f.tokens[3]!, "private")).not.toHaveProperty("previewAction");
  f.patch(room => { room.game!.players[3]!.alive = true; });
  expect(await f.service.view(f.id, f.tokens[3]!, "private")).toHaveProperty("previewAction", "witch");
  await f.act({ type: "pause" });
  expect(await f.service.view(f.id, f.tokens[3]!, "private")).not.toHaveProperty("previewAction");
});

it("previews a hunter after its public prompt but keeps the gun and full clock gated by the completed announcement", async () => {
  const f = await setup();
  f.patch(room => {
    room.game = command(nightToDawn(room.game!, { kill: room.members[5]!.id }), { type: "publish_dawn", actorId: room.hostId });
    room.game.window = null; room.heartbeatAt = room.game.updatedAt;
    room.narration = { mode: "voice", version: NARRATION_VERSION, pending: { id: randomUUID(), from: 1, to: room.game.publicEvents.length } };
  });
  f.time.now = f.state().game!.updatedAt; const cueId = f.state().narration!.pending!.id;
  await f.act({ type: "action_prompt", cueId, version: NARRATION_VERSION });
  expect(await f.service.view(f.id, f.tokens[5]!, "private")).toMatchObject({ previewAction: "hunter", hunterReaction: false });
  await expect(f.act({ type: "hunter", targetId: null }, 5)).rejects.toThrow("ANNOUNCEMENT_PENDING");
  expect(f.state().game!.window).toBeNull();
  await f.act({ type: "announcement_done", cueId, version: NARRATION_VERSION });
  expect(f.state().game!.window!.deadline - f.state().game!.window!.openedAt).toBe(10_000);
});

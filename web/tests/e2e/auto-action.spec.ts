import { expect, test } from "@playwright/test";
import { preset } from "../../src/game/config";
import script from "../../src/narration/script.json" with { type: "json" };
import type { PrivateRoom, PublicRoom } from "../../src/ui/contracts";

test("foreground actions open once, conceal on hide and respect private eligibility", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  let reads = 0;
  const state: PublicRoom = {
    roomId: "ABCDEF12", epochId: "game", windowId: "opening", revision: 1,
    config: preset(8), phase: "night_open", nightNo: 1, nightRole: "seer", paused: false,
    pauseReason: null, narration: { mode: "text", pending: null, version: script.version }, window: null, events: [], winner: null, aborted: false,
    players: [1, 2].map((seat) => ({ id: `p${seat}`, seat, name: `玩家${seat}`, alive: true, revealedRole: null })),
    self: { playerId: "p1", seat: 1, isHost: false }, serverTime: Date.now(),
  };
  const personal: PrivateRoom = {
    playerId: "p1", role: "seer", alive: true, acknowledged: true, action: null,
    completed: false, acceptedAction: null, hunterReaction: false, epochId: "game", windowId: "opening", reports: [],
  };
  await page.route("**/api/v2/session", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/v2/rooms/ABCDEF12", (route) => { reads++; return route.fulfill({ json: { ...state, serverTime: Date.now() } }); });
  await page.route("**/api/v2/rooms/ABCDEF12/private", (route) => route.fulfill({ json: { ...personal, windowId: state.windowId } }));
  const panel = page.getByRole("dialog", { name: "本人私密视角" });
  async function polls() { const before = reads; await expect.poll(() => reads).toBeGreaterThanOrEqual(before + 2); }
  async function visibility(value: "hidden" | "visible") {
    await page.evaluate((value) => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value }); document.dispatchEvent(new Event("visibilitychange")); }, value);
  }
  function turn(nightNo: number, action: PrivateRoom["action"]) {
    state.nightNo = nightNo; state.phase = "night_action"; state.windowId = `turn-${nightNo}`;
    state.window = { openedAt: Date.now(), deadline: Date.now() + 10_000, remainingMs: null };
    personal.action = action;
  }
  await page.goto("/r/ABCDEF12"); await polls(); await expect(panel).not.toBeVisible();
  turn(1, "seer"); await expect(panel).toBeVisible(); await expect(panel.getByText("选择查验", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("foreground-seer.png") });
  await page.keyboard.press("Escape"); await polls(); await expect(panel).not.toBeVisible();
  state.windowId = "resumed-same-turn"; await polls(); await expect(panel).not.toBeVisible();
  await page.getByRole("button", { name: "查看当前任务" }).click(); await expect(panel).toBeVisible();
  await visibility("hidden"); await expect(panel).not.toBeVisible();
  await visibility("visible"); await polls(); await expect(panel).not.toBeVisible();
  await visibility("hidden"); turn(2, "seer"); await polls(); await expect(panel).not.toBeVisible();
  await visibility("visible"); await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  turn(3, null); personal.alive = false; await polls(); await expect(panel).not.toBeVisible();
  turn(4, null); personal.alive = true; personal.role = "witch"; state.nightRole = "witch";
  personal.witch = { saveRemaining: false, poisonRemaining: false, canSeeWolfTarget: false };
  await polls(); await expect(panel).not.toBeVisible();
  turn(5, "guard"); personal.role = "guard"; state.nightRole = "guard";
  await expect(panel).toBeVisible(); await expect(panel.getByText("选择守护", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  turn(6, "witch"); personal.role = "witch"; state.nightRole = "witch";
  personal.witch = { saveRemaining: true, poisonRemaining: true, canSeeWolfTarget: true, wolfTargetId: "p2" };
  await expect(panel).toBeVisible(); await expect(panel.getByText("今夜的药", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  turn(7, "werewolf"); personal.role = "werewolf"; state.nightRole = "werewolf"; state.paused = true;
  personal.teammates = [{ id: "p1", seat: 1, name: "玩家1" }];
  personal.wolves = { proposals: {}, discussionPaused: true, confirmations: [], locked: false, consensusId: "consensus" };
  await expect(panel).toBeVisible(); await expect(panel.getByText("等待全体共同确认", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "本夜空刀", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape"); personal.wolves = undefined; personal.action = null; state.paused = false;
  state.phase = "hunter"; state.nightRole = null; state.windowId = "hunter-announcement";
  personal.role = "hunter"; personal.alive = false;
  state.narration.pending = { id: "announcement", from: 0, to: 1 };
  await polls(); await expect(panel).not.toBeVisible();
  state.narration.pending = null; state.windowId = "hunter-action"; personal.hunterReaction = true;
  await expect(panel).toBeVisible(); await expect(panel.getByText("最后一枪", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

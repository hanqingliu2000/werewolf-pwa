import { expect, test, type Page, type Route } from "@playwright/test";
import { preset } from "../../src/game/config";
import script from "../../src/narration/script.json" with { type: "json" };
import type { HostRoom, PrivateRoom, PublicRoom } from "../../src/ui/contracts";
import type { Mutation } from "../../src/server/input";

const NARRATION_VERSION = script.version;

async function mockRoom(page: Page) {
  const state: PublicRoom = {
    roomId: "ABCDEF12", epochId: "review-game", windowId: "review-window", revision: 1, config: preset(12),
    phase: "night_action", nightNo: 1, nightRole: "witch", paused: false, pauseReason: null,
    narration: { mode: "text", pending: null, version: NARRATION_VERSION },
    window: { openedAt: Date.now(), deadline: Date.now() + 10_000, remainingMs: null },
    players: Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, name: `玩家${i + 1}`, alive: true, revealedRole: null })),
    self: { playerId: "p1", seat: 1, isHost: false }, events: [], winner: null, aborted: false, serverTime: Date.now(),
  };
  const personal: PrivateRoom = {
    playerId: "p1", role: "witch", alive: true, acknowledged: true, action: "witch", completed: false,
    acceptedAction: null, hunterReaction: false, epochId: state.epochId, windowId: state.windowId,
    witch: { saveRemaining: true, poisonRemaining: true, canSeeWolfTarget: true, wolfTargetId: "p8" },
  };
  const host: HostRoom = { playerId: "p1", epochId: state.epochId, windowId: state.windowId, narrationMode: "text",
    canStart: false, canBeginNight: false, cueId: null, dayDraft: null, draftId: null };
  const commands: Mutation[] = []; const errors: string[] = [];
  const api = { state, personal, host, commands, errors,
    command: async (route: Route, input: Mutation) => {
      if (input.operation.type === "narration_mode") {
        state.narration.mode = input.operation.mode; host.narrationMode = input.operation.mode;
      }
      await route.fulfill({ json: { requestId: input.requestId, accepted: true, roomId: state.roomId, epochId: state.epochId, flowId: state.windowId } });
    } };
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/v2/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session")) return route.fulfill({ json: {} });
    if (path.endsWith("/private")) return route.fulfill({ json: { ...personal, windowId: state.windowId } });
    if (path.endsWith("/host")) return route.fulfill({ json: { ...host, windowId: state.windowId } });
    if (path.endsWith("/heartbeat")) return route.fulfill({ json: { ok: true, paused: state.paused } });
    if (path.endsWith("/commands")) { const input = route.request().postDataJSON() as Mutation; commands.push(input); return api.command(route, input); }
    return route.fulfill({ json: { ...state, serverTime: Date.now() } });
  });
  return api;
}

async function inViewport(locator: ReturnType<Page["locator"]>) {
  expect(await locator.evaluate((element) => {
    const r = element.getBoundingClientRect(); const clip = element.closest(".private-scroll")?.getBoundingClientRect();
    return r.top >= (clip?.top ?? 0) && r.bottom <= (clip?.bottom ?? innerHeight) && r.left >= 0 && r.right <= innerWidth;
  })).toBe(true);
}

test("12-seat actions keep the timer and confirmation visible across sizes and long text", async ({ page }, info) => {
  const api = await mockRoom(page);
  await page.goto("/r/ABCDEF12");
  const panel = page.getByRole("dialog", { name: "本人私密视角" });
  await expect(panel).toBeVisible(); await panel.getByRole("button", { name: "使用毒药", exact: true }).click();
  const confirm = panel.getByRole("button", { name: "确认行动", exact: true }); const clock = panel.getByRole("timer");
  for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 900 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await inViewport(confirm); await inViewport(clock);
    await panel.locator(".private-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await inViewport(confirm); await inViewport(clock);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`witch-${viewport.width}.png`) });
  }
  await page.setViewportSize({ width: 360, height: 780 });
  await panel.getByRole("button", { name: "12号 玩家12", exact: true }).click();
  await expect(confirm).toBeEnabled(); await inViewport(confirm);
  await expect(panel.locator(".selection-summary")).toHaveText("毒药：12 号");
  api.state.players[11]!.name = "这是用于检查完整换行的四十八字以内昵称";
  await expect(panel.getByRole("button", { name: /12号 这是用于检查/ })).toBeVisible();
  await page.addStyleTag({ content: ".private-modal button,.private-modal .seat-name,.private-modal .selection-summary {font-size:24px!important;line-height:1.6!important}" });
  await inViewport(confirm); await inViewport(clock);
  const target = panel.getByRole("button", { name: /12号 这是用于检查/ });
  await panel.getByRole("button", { name: "关闭面板", exact: true }).focus();
  await target.focus(); await inViewport(target);
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: info.outputPath("witch-long-text.png") });
  expect(api.errors).toEqual([]);
});

test("seer, guard, hunter and wolf waiting keep usable pinned actions", async ({ page }) => {
  const api = await mockRoom(page); api.personal.role = "seer"; api.personal.action = "seer"; api.state.nightRole = "seer";
  await page.goto("/r/ABCDEF12"); const panel = page.getByRole("dialog", { name: "本人私密视角" });
  await expect(panel).toBeVisible(); await panel.getByRole("button", { name: "本夜不查验", exact: true }).click();
  await expect(panel.getByRole("button", { name: "确认行动", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape"); api.state.nightNo = 2; api.state.windowId = "guard-window"; api.state.nightRole = "guard";
  api.personal.role = "guard"; api.personal.action = "guard"; api.personal.previousGuardTargetId = "p2";
  await expect(panel).toBeVisible(); await expect(panel.getByRole("button", { name: "2号 玩家2", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "本夜不守", exact: true }).click(); await inViewport(panel.getByRole("button", { name: "确认行动", exact: true }));
  await page.keyboard.press("Escape"); api.state.phase = "hunter"; api.state.nightRole = null; api.state.windowId = "hunter-window";
  api.personal.role = "hunter"; api.personal.action = null; api.personal.hunterReaction = true; api.personal.alive = false;
  await expect(panel).toBeVisible(); await panel.getByRole("button", { name: "放弃开枪", exact: true }).click();
  await expect(panel.getByRole("button", { name: "确认行动", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape"); api.state.nightNo = 3; api.state.phase = "night_action"; api.state.nightRole = "werewolf";
  api.state.windowId = "wolf-waiting"; api.state.paused = true; api.personal.role = "werewolf"; api.personal.alive = true; api.personal.hunterReaction = false;
  api.personal.teammates = [{ id: "p1", seat: 1, name: "玩家1" }];
  api.personal.wolves = { proposals: { p1: "p2" }, confirmations: [], locked: false, consensusId: "consensus", discussionPaused: true };
  await expect(panel).toBeVisible(); await expect(panel.getByText("协商等待", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "共同确认", exact: true })).toBeEnabled();
  await inViewport(panel.getByRole("button", { name: "共同确认", exact: true })); expect(api.errors).toEqual([]);
});

for (const { completion, unknown } of [{ completion: "cue_ack", unknown: false }, { completion: "announcement_done", unknown: false }, { completion: "cue_ack", unknown: true }] as const) test(`real audio ${completion} retries ${unknown ? "unknown results" : "conflicts"} without replay and drops stale retries`, async ({ page }) => {
  const api = await mockRoom(page); api.state.self.isHost = true; api.state.phase = "end"; api.state.winner = "good";
  api.state.window = null; api.state.nightRole = null; api.personal.action = null;
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const observed = window as unknown as { audioStarts: number }; observed.audioStarts = 0;
    window.AudioContext = class extends Native {
      createBufferSource() { const source = super.createBufferSource(); const start = source.start.bind(source);
        source.start = (...args: Parameters<AudioBufferSourceNode["start"]>) => { observed.audioStarts++; start(...args); }; return source; }
    };
  });
  const original = api.command;
  api.command = async (route, input) => {
    if (input.operation.type !== completion) return original(route, input);
    const requests = api.commands.filter((c) => c.operation.type === completion);
    if (requests.length === 1) return unknown ? route.abort("failed") : route.fulfill({ status: 409, json: { error: { code: "WRITE_CONFLICT" } } });
    if (completion === "announcement_done") api.state.narration.pending = null;
    else { api.state.phase = "night_action"; api.state.window = { openedAt: Date.now(), deadline: Date.now() + 10_000, remainingMs: null }; }
    api.state.windowId = "accepted-window"; return original(route, input);
  };
  await page.goto("/r/ABCDEF12"); await page.getByRole("button", { name: "主持控制", exact: true }).click();
  const controls = page.getByRole("dialog", { name: "主持控制" });
  await controls.getByRole("button", { name: "语音", exact: true }).click();
  await expect(controls.getByRole("button", { name: "已听清，启用语音" })).toBeVisible({ timeout: 30_000 });
  await controls.getByRole("button", { name: "已听清，启用语音" }).click();
  await expect(controls.locator(".host-mode strong")).toHaveText("语音主持");
  api.state.phase = completion === "cue_ack" ? "night_open" : "reveal"; api.state.windowId = "audio-window";
  if (completion === "cue_ack") api.state.nightRole = "seer";
  else { api.state.events = [{ type: "roles_dealt" }]; api.state.narration.pending = { id: "announcement", from: 0, to: 1 }; }
  const retry = controls.getByRole("button", { name: "重试播报确认", exact: true });
  const receiptRetry = unknown ? controls.getByRole("button", { name: "重试原请求", exact: true }) : retry;
  await expect(receiptRetry).toBeVisible({ timeout: 30_000 });
  const starts = await page.evaluate(() => (window as unknown as { audioStarts: number }).audioStarts);
  if (completion === "cue_ack" && !unknown) { await page.keyboard.press("Escape"); await page.getByRole("button", { name: "重试播报确认", exact: true }).click(); }
  else await receiptRetry.click();
  await expect(receiptRetry).not.toBeVisible();
  await expect.poll(() => api.commands.filter((c) => c.operation.type === completion).length).toBe(2);
  const receipts = api.commands.filter((c) => c.operation.type === completion); expect(receipts[1]).toEqual(receipts[0]);
  expect(await page.evaluate(() => (window as unknown as { audioStarts: number }).audioStarts)).toBe(starts);
  if (completion === "cue_ack" && !unknown) await page.getByRole("button", { name: "主持控制", exact: true }).click();
  api.command = async (route, input) => input.operation.type === completion
    ? route.fulfill({ status: 409, json: { error: { code: "WRITE_CONFLICT" } } }) : original(route, input);
  api.state.window = null; api.state.windowId = "second-audio-window";
  if (completion === "cue_ack") api.state.phase = "night_close";
  else api.state.narration.pending = { id: "second-announcement", from: 0, to: 1 };
  await expect(retry).toBeVisible({ timeout: 30_000 });
  api.state.phase = "end"; api.state.nightRole = null; api.state.narration.pending = null; api.state.windowId = "next-game-window";
  await expect(retry).not.toBeVisible(); expect(api.errors).toEqual([]);
  expect(api.commands.filter((c) => c.operation.type === completion)).toHaveLength(3);
});

test("changed vote targets require resaving and confirmation, including null and another tab's draft", async ({ page }) => {
  const api = await mockRoom(page); api.state.self.isHost = true; api.state.phase = "day"; api.state.window = null;
  api.state.nightRole = null; api.personal.action = null; api.host.dayDraft = { targetId: "p3", confirmed: true }; api.host.draftId = "draft-1";
  const original = api.command;
  api.command = async (route, input) => {
    if (input.operation.type === "day_draft") { api.host.dayDraft = { targetId: input.operation.targetId, confirmed: false }; api.host.draftId = crypto.randomUUID(); }
    if (input.operation.type === "day_confirm") api.host.dayDraft!.confirmed = true;
    return original(route, input);
  };
  await page.goto("/r/ABCDEF12"); await page.getByRole("button", { name: "主持控制", exact: true }).click();
  const controls = page.getByRole("dialog", { name: "主持控制" }); const publish = controls.getByRole("button", { name: "发布结果", exact: true });
  await expect(publish).toBeEnabled(); await publish.click();
  await expect(controls.getByRole("button", { name: "确认发布", exact: true })).toBeVisible();
  await controls.getByRole("button", { name: "7号 玩家7", exact: true }).click();
  await expect(publish).toBeDisabled(); await expect(controls.getByRole("button", { name: "确认发布", exact: true })).not.toBeVisible();
  await controls.getByRole("button", { name: "保存草案", exact: true }).click();
  await expect(controls.getByRole("button", { name: "确认待发布", exact: true })).toBeEnabled();
  await expect(controls.getByRole("button", { name: "7号 玩家7", exact: true })).toHaveAttribute("aria-pressed", "true");
  await controls.getByRole("button", { name: "确认待发布", exact: true }).click(); await expect(publish).toBeEnabled();
  await publish.click(); api.host.dayDraft = { targetId: "p4", confirmed: true }; api.host.draftId = "another-tab-draft";
  await expect(controls.getByText("4 号出局", { exact: true })).toBeVisible();
  await expect(controls.getByRole("button", { name: "确认发布", exact: true })).not.toBeVisible(); await expect(publish).toBeEnabled();
  await controls.getByRole("button", { name: "本轮无人出局", exact: true }).click(); await expect(publish).toBeDisabled();
  await controls.getByRole("button", { name: "保存草案", exact: true }).click();
  await controls.getByRole("button", { name: "确认待发布", exact: true }).click(); await expect(publish).toBeEnabled();
  await controls.getByRole("button", { name: "5号 玩家5", exact: true }).click(); await expect(publish).toBeDisabled();
  expect(api.commands.some((c) => c.operation.type === "day_publish")).toBe(false); expect(api.errors).toEqual([]);
});

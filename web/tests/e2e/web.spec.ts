import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import type { Role } from "../../src/game/types";
import type { PrivateRoom, PublicRoom } from "../../src/ui/contracts";

type Actor = { page: Page; context: BrowserContext; seat: number; id: string; role: Role | null };
async function status(actor: Actor, room: string) {
  const response = await actor.context.request.get(`/api/v2/rooms/${room}`); expect(response.ok()).toBe(true);
  return await response.json() as PublicRoom;
}
async function personal(actor: Actor, room: string) {
  const response = await actor.context.request.get(`/api/v2/rooms/${room}/private`); expect(response.ok()).toBe(true);
  return await response.json() as PrivateRoom;
}
async function close(page: Page) { await page.keyboard.press("Escape"); await expect(page.locator("dialog[open]")).toHaveCount(0); }
async function host(page: Page) { await page.getByRole("button", { name: "主持控制", exact: true }).click(); const panel = page.getByRole("dialog", { name: "主持控制" }); await expect(panel).toBeVisible(); return panel; }
async function reveal(page: Page) {
  const panel = page.getByRole("dialog", { name: "本人私密视角" });
  if (!await panel.isVisible()) {
    try { await page.getByRole("button", { name: /查看身份|查看当前任务/ }).click({ timeout: 1500 }); }
    catch (error) { if (!await panel.isVisible()) throw error; }
  }
  await expect(panel).toBeVisible(); return panel;
}
async function roomSetup(browser: Browser, baseURL: string, count: number) {
  const actors: Actor[] = [];
  const consoleErrors: string[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } }); const page = await context.newPage();
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      actors.push({ page, context, seat: i + 1, id: "", role: null });
    }
    const first = actors[0]!; await first.page.goto("/"); await first.page.getByLabel("你的昵称").fill("组织者");
    if (count === 8) {
      await first.page.getByText("自定义配比", { exact: true }).click();
      await first.page.getByLabel("守卫数量").fill("1"); await first.page.getByLabel("猎人数量").fill("1"); await first.page.getByLabel("平民数量").fill("2");
    } else await first.page.getByRole("button", { name: "12 人", exact: true }).click();
    await first.page.getByRole("button", { name: "创建房间", exact: true }).last().click();
    await first.page.waitForURL(/\/r\/[A-F0-9]{8}$/); const room = first.page.url().split("/").at(-1)!;
    for (const actor of actors.slice(1)) {
      await actor.page.goto(`/join?room=${room}`); await actor.page.getByLabel("你的昵称").fill(actor.seat === count ? "很长的玩家名字".repeat(6) : `玩家${actor.seat}`);
      await actor.page.getByRole("button", { name: "加入房间", exact: true }).last().click(); await actor.page.waitForURL(new RegExp(`/r/${room}$`));
    }
    for (const actor of actors) {
      actor.id = (await status(actor, room)).self.playerId;
      await actor.page.getByRole("button", { name: "准备好了" }).click(); await expect(actor.page.getByRole("button", { name: "取消准备" })).toBeVisible();
    }
    return { actors, room, consoleErrors };
  } catch (error) { for (const actor of actors) await actor.context.close(); throw error; }
}
// Compressed windows also advance isolated rate buckets; production limits and browser clocks remain unchanged.
function finishWindow(room: string) {
  const db = new DatabaseSync(resolve("test-results/browser.sqlite"), { timeout: 5000 });
  try {
    db.exec("BEGIN IMMEDIATE");
    const window = db.prepare("SELECT json_extract(state,?) - json_extract(state,?) AS duration FROM rooms WHERE id = ?").get("$.game.window.deadline", "$.game.window.openedAt", room);
    db.prepare(`UPDATE rooms SET state = json_set(state, '$.game.window.deadline', ?, '$.heartbeatAt', ?), version = version + 1 WHERE id = ?`).run(Date.now() - 1, Date.now(), room);
    db.prepare("UPDATE limits SET reset_at = reset_at - ?").run(Number(window?.duration ?? 30_000));
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
}
async function screenshot(page: Page, info: TestInfo, label: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.locator("img:visible").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.locator("img:visible").evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: info.outputPath(`${label}.png`), fullPage: true });
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  expect(sizes.width).toBeLessThanOrEqual(sizes.viewport);
  const buttons = await page.locator("button:visible").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height, text: element.textContent };
  }));
  expect(buttons.filter((b) => b.width < 43 || b.height < 43)).toEqual([]);
}

test("entry, accessibility, real artwork and mobile layouts", async ({ page, request }, info) => {
  await page.goto("/"); await expect(page.getByRole("heading", { name: "狼人杀", exact: true })).toBeVisible();
  for (const width of [360, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); await screenshot(page, info, `entry-${width}`); }
  for (const asset of ["forest", "cardback", "werewolf", "seer", "witch", "guard", "hunter", "villager"]) {
    const response = await request.get(`/art/${asset}.webp`); expect(response.ok()).toBe(true); expect((await response.body()).byteLength).toBeGreaterThan(10_000);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "查看游戏规则" }).focus(); await page.keyboard.press("Enter");
  const modal = page.getByRole("dialog", { name: "公开规则" }); await expect(modal).toBeVisible();
  await page.keyboard.press("Escape"); await expect(modal).not.toBeVisible();
  await expect(page.getByRole("button", { name: "查看游戏规则" })).toBeFocused();
  await page.getByRole("button", { name: "加入房间", exact: true }).first().click();
  await page.getByLabel("房间号").fill("FFFFFFFF"); await expect(page.locator(".error[role=alert]")).toContainText("房间");
});

for (const count of [8, 12]) test(`${count} players can begin without viewing or confirming identity`, async ({ browser, baseURL }, info) => {
  const { actors, room, consoleErrors } = await roomSetup(browser, baseURL!, count);
  const organizer = actors[0]!; const identityRequests: string[] = [];
  for (const actor of actors) actor.page.on("request", (request) => {
    if (request.url().endsWith("/commands") && request.postDataJSON()?.operation?.type === "acknowledge") identityRequests.push(request.url());
  });
  try {
    let control = await host(organizer.page);
    await control.getByRole("button", { name: "开始发牌" }).click(); await close(organizer.page);
    await expect.poll(async () => (await status(organizer, room)).phase).toBe("reveal");
    for (const actor of actors) {
      await expect(actor.page.getByRole("button", { name: "查看身份", exact: true })).toBeVisible();
      await expect(actor.page.locator(".identity")).toHaveCount(0);
      await expect(actor.page.getByText("身份确认", { exact: true })).toHaveCount(0);
    }
    control = await host(organizer.page);
    await expect(control.getByRole("button", { name: "开始首夜" })).toBeEnabled(); await close(organizer.page);
    // Refresh keeps the existing safety pause; resume is independent of identity viewing.
    await organizer.page.reload();
    await expect.poll(async () => (await status(organizer, room)).paused).toBe(true);
    control = await host(organizer.page);
    await expect(control.getByRole("button", { name: "恢复对局" })).toBeEnabled();
    await control.getByRole("button", { name: "恢复对局" }).click();
    await expect.poll(async () => (await status(organizer, room)).paused).toBe(false);
    await expect(control.getByRole("button", { name: "开始首夜" })).toBeEnabled();
    await control.getByRole("button", { name: "开始首夜" }).click(); await close(organizer.page);
    await expect.poll(async () => (await status(organizer, room)).phase).toBe("night_open");
    expect((await status(organizer, room)).window).toBeNull();
    const actor = actors[1]!;
    const panel = await reveal(actor.page);
    await expect(panel.locator(".identity h3")).toBeVisible();
    await expect(panel.getByRole("button", { name: "确认身份", exact: true })).toHaveCount(0);
    await expect(panel.getByText("身份已确认", { exact: true })).toHaveCount(0);
    await screenshot(actor.page, info, `identity-without-confirmation-${count}`); await close(actor.page);
    await expect(actor.page.locator(".identity")).toHaveCount(0);
    expect(identityRequests).toEqual([]); expect(consoleErrors).toEqual([]);
    control = await host(organizer.page); await control.getByRole("button", { name: "中止本局", exact: true }).click();
    await control.getByRole("button", { name: "确认中止", exact: true }).click();
    await expect.poll(async () => (await status(organizer, room)).phase).toBe("end");
  } finally { for (const actor of actors) await actor.context.close(); }
});

for (const voice of [false, true]) for (const count of [8, 12]) test(`${count} isolated players complete a real ${voice ? "voice" : "text"} UI game and a new lobby`, async ({ browser, baseURL }, info) => {
  test.setTimeout(900_000);
  const { actors, room, consoleErrors } = await roomSetup(browser, baseURL!, count); const organizer = actors[0]!;
  try {
    for (const width of [360, 390, 768, 1440]) { await organizer.page.setViewportSize({ width, height: 900 }); await screenshot(organizer.page, info, `lobby-${count}-${width}`); }
    await organizer.page.setViewportSize({ width: 390, height: 844 });
    const inviteButton = organizer.page.getByRole("button", { name: "邀请朋友" }); await inviteButton.click();
    await expect(organizer.page.getByRole("img", { name: /二维码/ })).toBeVisible(); await close(organizer.page);
    const maintenance = await host(organizer.page);
    if (voice) {
      await maintenance.getByRole("button", { name: "语音", exact: true }).click();
      await expect(maintenance.getByRole("button", { name: "已听清，启用语音" })).toBeVisible({ timeout: 30_000 });
      await maintenance.getByRole("button", { name: "已听清，启用语音" }).click();
      await expect.poll(async () => (await status(organizer, room)).narration.mode).toBe("voice");
    }
    await expect(maintenance.getByRole("button", { name: "开始发牌" })).toBeEnabled(); await maintenance.getByRole("button", { name: "开始发牌" }).click(); await close(organizer.page);
    for (const actor of actors) {
      const panel = await reveal(actor.page); await expect(panel.getByRole("button", { name: "确认身份" })).toHaveCount(0);
      const identity = await personal(actor, room); actor.role = identity.role;
      await expect(panel.locator(".identity img")).toHaveJSProperty("naturalWidth", 720);
      await expect(panel.getByText("身份已确认", { exact: true })).toHaveCount(0); await close(actor.page);
      await expect(actor.page.locator(".identity")).toHaveCount(0);
    }
    const firstGame = (await status(organizer, room)).epochId;
    if (voice) await expect.poll(async () => (await status(organizer, room)).narration.pending, { timeout: 45_000 }).toBeNull();
    const returning = actors[1]!; await returning.page.goto(`/join?room=${room}`);
    await returning.page.waitForURL(new RegExp(`/r/${room}$`)); expect((await status(returning, room)).self.playerId).toBe(returning.id);
    await expect(returning.page.locator(".identity")).toHaveCount(0);
    let control = await host(organizer.page); await control.getByRole("button", { name: "暂停对局" }).click();
    await expect(control.getByRole("button", { name: "恢复对局" })).toBeVisible(); await control.getByRole("button", { name: "恢复对局" }).click();
    await expect(control.getByRole("button", { name: "开始首夜" })).toBeEnabled(); await control.getByRole("button", { name: "开始首夜" }).click(); await close(organizer.page);
    let round = 1;
    while ((await status(organizer, room)).phase !== "end") {
      let publicState = await status(organizer, room);
      const hunter = actors.find((a) => a.role === "hunter")!;
      const nightTarget = round === 1 ? count === 8 ? hunter : voice ? actors.find((a) => a.role === "seer")! : organizer : null;
      while (publicState.phase === "night_open") {
        if (!voice) { control = await host(organizer.page); await control.getByRole("button", { name: "当前指令完成" }).click(); await close(organizer.page); }
        await expect.poll(async () => (await status(organizer, room)).phase, { timeout: 45_000 }).toBe("night_action");
        const role = (await status(organizer, room)).nightRole;
        const active = actors.filter((a) => a.role === role && publicState.players.some((p) => p.id === a.id && "alive" in p && p.alive));
        if (voice && count === 12 && round === 1 && role === "werewolf") {
          await expect.poll(async () => (await status(organizer, room)).paused, { timeout: 20_000 }).toBe(true);
          const panel = await reveal(active[0]!.page);
          await expect(panel.getByText("等待全体共同确认", { exact: true })).toBeVisible();
          await expect(panel.getByRole("button", { name: "暂停协商计时" })).toHaveCount(0);
          await expect(panel.getByRole("button", { name: "本夜空刀" })).toBeEnabled();
          await screenshot(active[0]!.page, info, "wolves-automatic-wait"); await close(active[0]!.page);
        }
        if (voice && role === "seer" && active.length === 0) {
          const window = (await status(organizer, room)).window!;
          expect(window.deadline - window.openedAt).toBe(10_000);
          await screenshot(organizer.page, info, `dead-seer-night-${round}`);
        }
        for (const actor of active) {
          const panel = await reveal(actor.page);
          if (round === 1 && (role === "guard" || role === "seer") && actor.id !== organizer.id) {
            const draft = actors.find((a) => a.id !== actor.id)!;
            await panel.getByRole("button", { name: new RegExp(`^${draft.seat}号 `) }).click();
            await actor.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
            await expect(actor.page.locator(".identity")).toHaveCount(0);
            await actor.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
            await reveal(actor.page); await expect(panel.locator(".selection-summary")).toHaveText("尚未选择");
            await screenshot(actor.page, info, `private-${role}-${count}`);
          }
          if (role === "werewolf") {
            if (nightTarget) await panel.getByRole("button", { name: new RegExp(`^${nightTarget.seat}号 `) }).click();
            else await panel.getByRole("button", { name: "本夜空刀" }).click();
          } else if (role === "witch") {
            if (count === 8 && round === 1) {
              let intercepted = false;
              await actor.page.route("**/commands", async (route) => {
                if (!intercepted && route.request().postDataJSON()?.operation?.type === "witch") {
                  intercepted = true; const accepted = await route.fetch(); expect(accepted.ok()).toBe(true); await route.abort("failed");
                } else await route.continue();
              });
            }
            await panel.getByRole("button", { name: "不用药" }).click(); await panel.getByRole("button", { name: "确认行动" }).click();
            if (count === 8 && round === 1) {
              await expect(panel.getByRole("button", { name: "重试原请求" })).toBeVisible();
              await panel.getByRole("button", { name: "重试原请求" }).click(); await actor.page.unroute("**/commands");
            }
          } else if (role === "guard") {
            await panel.getByRole("button", { name: "本夜不守" }).click(); await panel.getByRole("button", { name: "确认行动" }).click();
          } else if (role === "seer") {
            const target = actors.find((a) => a.role === "werewolf" && publicState.players.some((p) => p.id === a.id && "alive" in p && p.alive))!;
            await panel.getByRole("button", { name: new RegExp(`^${target.seat}号 `) }).click(); await panel.getByRole("button", { name: "确认行动" }).click();
            await expect(panel.getByText("狼人阵营", { exact: true }).last()).toBeVisible();
          }
          if (role !== "werewolf") await expect(panel.getByRole("heading", { name: "行动已确认" })).toBeVisible();
          await close(actor.page);
        }
        if (role === "werewolf") for (const actor of active) {
          const panel = await reveal(actor.page); await expect(panel.getByRole("button", { name: "共同确认" })).toBeEnabled(); await panel.getByRole("button", { name: "共同确认" }).click();
          if ((await status(organizer, room)).phase === "night_action") await expect.poll(async () => (await personal(actor, room)).wolves?.confirmations.includes(actor.id)).toBe(true);
          await close(actor.page);
        }
        if (role === "werewolf" && active[0] && (await status(organizer, room)).phase === "night_action") await expect.poll(async () => (await personal(active[0]!, room)).wolves?.locked).toBe(true);
        if (round === 1 && role === "guard" && active[0]) {
          const player = active.find((a) => a.id !== organizer.id);
          if (player) { await player.page.reload(); await expect(player.page.locator(".private-modal[open]")).toHaveCount(0); const panel = await reveal(player.page); await expect(panel.getByRole("heading", { name: "行动已确认" })).toBeVisible(); await close(player.page); }
        }
        if ((await status(organizer, room)).phase === "night_action") {
          if (!(voice && role === "seer" && active.length === 0)) finishWindow(room);
          await expect.poll(async () => (await status(organizer, room)).phase).toBe("night_close");
        }
        if (!voice) { control = await host(organizer.page); await control.getByRole("button", { name: "当前指令完成" }).click(); await close(organizer.page); }
        else await expect.poll(async () => (await status(organizer, room)).phase, { timeout: 30_000 }).not.toBe("night_close");
        publicState = await status(organizer, room);
      }
      expect(publicState.phase).toBe("dawn");
      if (round === 1) {
        expect(publicState.players.every((p) => "alive" in p && p.alive)).toBe(true);
        const panel = await reveal(hunter.page); await expect(panel.getByRole("heading", { name: "最后一枪" })).toHaveCount(0); await close(hunter.page);
      }
      if (!voice) { control = await host(organizer.page); await control.getByRole("button", { name: "发布出局公告" }).click(); await close(organizer.page); }
      else {
        await expect.poll(async () => (await status(organizer, room)).phase, { timeout: 30_000 }).not.toBe("dawn");
        await expect.poll(async () => (await status(organizer, room)).narration.pending, { timeout: 60_000 }).toBeNull();
      }
      publicState = await status(organizer, room);
      if (publicState.phase === "hunter") {
        const panel = await reveal(hunter.page); await expect(panel.getByRole("heading", { name: "最后一枪" })).toBeVisible();
        if (count === 8) { const wolf = actors.find((a) => a.role === "werewolf")!; await panel.getByRole("button", { name: new RegExp(`^${wolf.seat}号 `) }).click(); }
        else await panel.getByRole("button", { name: "放弃开枪" }).click();
        await panel.getByRole("button", { name: "确认行动" }).click();
        await expect.poll(async () => (await status(organizer, room)).phase).toBe("day");
        if (await panel.isVisible()) await close(hunter.page);
      }
      if (voice) await expect.poll(async () => (await status(organizer, room)).narration.pending, { timeout: 60_000 }).toBeNull();
      publicState = await status(organizer, room); expect(publicState.phase).toBe("day");
      const wolf = voice && count === 12 && round === 1 ? hunter : actors.find((a) => a.role === "werewolf" && publicState.players.some((p) => p.id === a.id && "alive" in p && p.alive))!;
      control = await host(organizer.page); await control.getByRole("button", { name: new RegExp(`^${wolf.seat}号 `) }).click();
      await control.getByRole("button", { name: "保存草案" }).click(); await expect(control.getByText(`${wolf.seat} 号出局`, { exact: true })).toBeVisible();
      await control.getByRole("button", { name: "确认待发布" }).click(); await expect(control.getByText("已核对，等待发布")).toBeVisible();
      await control.getByRole("button", { name: "发布结果", exact: true }).click(); await control.getByRole("button", { name: "确认发布", exact: true }).click(); await close(organizer.page);
      await expect.poll(async () => (await status(organizer, room)).phase).not.toBe("day"); round++;
      if (voice) await expect.poll(async () => (await status(organizer, room)).narration.pending, { timeout: 60_000 }).toBeNull();
      if (voice && (await status(organizer, room)).phase === "hunter") {
        const panel = await reveal(hunter.page);
        await expect(panel.getByRole("heading", { name: "最后一枪" })).toBeVisible();
        await panel.getByRole("button", { name: "放弃开枪" }).click();
        await panel.getByRole("button", { name: "确认行动" }).click();
        if (await panel.isVisible()) await close(hunter.page);
        await expect.poll(async () => (await status(organizer, room)).narration.pending, { timeout: 60_000 }).toBeNull();
      }
    }
    await expect(organizer.page.getByRole("heading", { name: "好人阵营获胜", exact: true })).toBeVisible();
    await organizer.page.getByRole("link", { name: "查看本局复盘" }).click(); await expect(organizer.page.getByRole("heading", { name: "揭开身份" })).toBeVisible();
    await screenshot(organizer.page, info, `recap-${count}`);
    await organizer.page.getByRole("link", { name: "返回这一桌" }).click();
    if (voice) {
      control = await host(organizer.page);
      await control.getByRole("button", { name: "重新试音" }).click();
      await expect(control.getByRole("button", { name: "已听清，启用语音" })).toBeVisible({ timeout: 30_000 });
      await control.getByRole("button", { name: "已听清，启用语音" }).click();
      await close(organizer.page);
    }
    await organizer.page.getByRole("button", { name: "下一局" }).click();
    await expect(organizer.page.getByRole("heading", { name: "入席，等夜来" })).toBeVisible();
    expect((await status(organizer, room)).epochId).not.toBe(firstGame);
    if (voice) {
      await expect.poll(async () => (await status(organizer, room)).narration.pending, { timeout: 30_000 }).toBeNull();
      expect((await status(organizer, room)).narration.mode).toBe("voice");
    }
    expect(consoleErrors).toEqual([]);
  } finally { for (const actor of actors) await actor.context.close(); }
});

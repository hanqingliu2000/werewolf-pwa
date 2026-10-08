import { expect, test, type Page } from "@playwright/test";
import { preset } from "../../src/game/config";
import { ROLES } from "../../src/game/types";
import { roleNames, roleRules } from "../../src/ui/content";
import type { PrivateRoom, PublicRoom } from "../../src/ui/contracts";
import script from "../../src/narration/script.json" with { type: "json" };

async function identityRoom(page: Page) {
  const state: PublicRoom = {
    roomId: "ABCDEF12", epochId: "identity-game", windowId: "identity-window", revision: 1, config: preset(12),
    phase: "reveal", nightNo: 0, nightRole: null, paused: false, pauseReason: null, window: null,
    narration: { mode: "text", pending: null, version: script.version },
    players: Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, name: `玩家${i + 1}`, alive: true, revealedRole: null })),
    self: { playerId: "p1", seat: 1, isHost: false }, events: [], winner: null, aborted: false, serverTime: Date.now(),
  };
  const personal: PrivateRoom = {
    playerId: "p1", role: "witch", alive: true, acknowledged: true, action: null, completed: false,
    acceptedAction: null, hunterReaction: false, epochId: state.epochId, windowId: state.windowId,
  };
  const commands: unknown[] = []; const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v2/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session")) return route.fulfill({ json: {} });
    if (path.endsWith("/commands")) { commands.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); }
    if (path.endsWith("/private")) return route.fulfill({ json: { ...personal, windowId: state.windowId } });
    return route.fulfill({ json: { ...state, serverTime: Date.now() } });
  });
  return { state, personal, commands, errors };
}

const viewports = [{ width: 320, height: 568 }, { width: 360, height: 560 }, { width: 360, height: 640 },
  { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 900 },
  { width: 640, height: 320 }, { width: 740, height: 360 }, { width: 844, height: 390 }];

test("six identity portraits are prominent, uncropped and privately dismissible across viewports", async ({ page }, info) => {
  const api = await identityRoom(page);
  const panel = page.getByRole("dialog", { name: "本人私密视角" });
  for (const phase of ["reveal", "night_open"] as const) for (const role of ROLES) {
    api.state.phase = phase; api.state.nightNo = phase === "reveal" ? 0 : 1;
    api.state.nightRole = phase === "reveal" ? null : "guard";
    api.state.windowId = `${phase}-${role}`; api.personal.role = role;
    await page.goto("/r/ABCDEF12");
    await expect(page.locator(".identity-card")).toHaveCount(0);
    await page.getByRole("button", { name: /查看身份|查看当前任务/ }).click();
    await expect(panel.locator(".identity-card h3")).toHaveText(roleNames[role]);
    await expect(panel.locator(".identity-card p")).toHaveText(roleRules[role]);
    await expect(panel.getByRole("button", { name: "确认身份", exact: true })).toHaveCount(0);
    await panel.locator(".identity-card img").evaluate((element) => (element as HTMLImageElement).decode());
    await page.evaluate(() => document.fonts.ready);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const layout = await panel.evaluate((element) => {
        const scroll = element.querySelector(".private-scroll")!; scroll.scrollTop = 0;
        const picture = element.querySelector(".identity-card img") as HTMLImageElement;
        const copy = element.querySelector(".identity-card>div")!;
        const art = picture.getBoundingClientRect(), text = copy.getBoundingClientRect(), clip = scroll.getBoundingClientRect();
        const controls = [...element.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
        return { width: art.width, ratio: art.width / art.height, naturalWidth: picture.naturalWidth, fit: getComputedStyle(picture).objectFit,
          fullPortrait: art.top >= clip.top - 1 && art.bottom <= clip.bottom + 1 && art.left >= 0 && art.right <= innerWidth,
          overlap: art.left < text.right && art.right > text.left && art.top < text.bottom && art.bottom > text.top,
          controls: controls.every((r) => r.width >= 44 && r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth),
          horizontalScroll: scroll.scrollWidth > scroll.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(layout, `${phase}/${role}/${viewport.width}x${viewport.height}`).toMatchObject({ naturalWidth: 720, fit: "contain", fullPortrait: true, overlap: false, controls: true, horizontalScroll: false });
      expect(layout.ratio).toBeCloseTo(0.75, 2);
      if (viewport.width <= 480 && viewport.height >= 700) expect(layout.width).toBeGreaterThanOrEqual(200);
      else if (viewport.width <= 480) expect(layout.width).toBeGreaterThanOrEqual(120);
      else if (viewport.height >= 700) expect(layout.width).toBe(300);
      if (phase === "reveal" && ["witch", "seer"].includes(role)) await panel.screenshot({ path: info.outputPath(`${role}-${viewport.width}x${viewport.height}.png`) });
    }
    await panel.getByRole("button", { name: "收起私密信息", exact: true }).click();
    await expect(panel).not.toBeVisible(); await expect(page.locator(".identity-card")).toHaveCount(0);
  }
  expect(api.commands).toEqual([]); expect(api.errors).toEqual([]);
});

test("long private records never push hide controls away and backgrounding conceals the enlarged card", async ({ page }) => {
  const api = await identityRoom(page); api.personal.role = "seer";
  api.state.phase = "night_open"; api.state.nightNo = 13; api.state.nightRole = "guard";
  api.personal.reports = Array.from({ length: 12 }, (_, i) => ({ nightNo: i + 1, targetId: "p2", alignment: "good" }));
  await page.setViewportSize({ width: 360, height: 560 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/r/ABCDEF12"); await page.getByRole("button", { name: "查看当前任务", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "本人私密视角" }); const hide = panel.getByRole("button", { name: "收起私密信息", exact: true });
  await expect(panel.locator(".private-records>div")).toHaveCount(12);
  const before = await hide.boundingBox(); expect(before!.y + before!.height).toBeLessThanOrEqual(560);
  await panel.locator(".private-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await hide.boundingBox()).toEqual(before);
  await hide.focus(); await page.keyboard.press("Enter"); await expect(panel).not.toBeVisible();
  await page.getByRole("button", { name: "查看当前任务", exact: true }).click();
  await expect(panel).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(panel).not.toBeVisible(); await expect(page.locator(".identity-card")).toHaveCount(0);
  expect(api.commands).toEqual([]); expect(api.errors).toEqual([]);
});

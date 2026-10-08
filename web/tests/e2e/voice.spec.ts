import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { PublicRoom } from "../../src/ui/contracts";
import script from "../../src/narration/script.json" with { type: "json" };
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? 3117}`;

async function view(context: BrowserContext, room: string): Promise<PublicRoom> {
  const response = await context.request.get(`/api/v2/rooms/${room}`); expect(response.ok()).toBe(true); return response.json();
}
async function act(context: BrowserContext, room: string, operation: unknown) {
  const current = await view(context, room);
  const response = await context.request.post(`/api/v2/rooms/${room}/commands`, { headers: { origin }, data: { requestId: crypto.randomUUID(), epochId: current.epochId, windowId: current.windowId, operation } });
  expect(response.ok()).toBe(true);
}
async function create(page: Page) {
  await page.goto("/"); await page.getByLabel("你的昵称").fill("试音房主");
  await page.getByText("自定义配比", { exact: true }).click();
  await page.getByLabel("守卫数量").fill("1"); await page.getByLabel("猎人数量").fill("1"); await page.getByLabel("平民数量").fill("2");
  await page.getByRole("button", { name: "创建房间", exact: true }).last().click(); await page.waitForURL(/\/r\/[A-F0-9]{8}$/);
  return page.url().split("/").at(-1)!;
}
async function controls(page: Page) {
  await page.getByRole("button", { name: "主持控制", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "主持控制" }); await expect(panel).toBeVisible(); return panel;
}
async function close(page: Page) { await page.keyboard.press("Escape"); await expect(page.locator("dialog[open]")).toHaveCount(0); }

test("complete narration bank decodes with matching text, hashes and duration", async ({ page }) => {
  await page.goto("/");
  const clips = await page.evaluate(async (version) => {
    const root = `/audio/${version}`;
    const manifest = await (await fetch(`${root}/manifest.json`)).json(); const audio = new AudioContext();
    try {
      return await Promise.all(Object.entries(manifest.clips).map(async ([id, raw]) => {
        const entry = raw as { text: string; sha256: string; bytes: number; durationSeconds: number };
        const response = await fetch(`${root}/${id}.mp3`); const bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
        const bytesMatch = entry.bytes === bytes.byteLength;
        const decoded = await audio.decodeAudioData(bytes);
        return { id, text: entry.text, hashMatches: entry.sha256 === hash, bytesMatch,
          duration: decoded.duration, expected: entry.durationSeconds };
      }));
    } finally { await audio.close(); }
  }, script.version);
  expect(clips).toHaveLength(40);
  for (const clip of clips) {
    expect(clip.text, clip.id).toBe(script.clips[clip.id as keyof typeof script.clips]);
    expect(clip.hashMatches, clip.id).toBe(true); expect(clip.bytesMatch, clip.id).toBe(true);
    expect(Math.abs(clip.duration - clip.expected), `${clip.id} duration ${clip.duration} vs ${clip.expected}`).toBeLessThan(0.3);
  }
});

test("real MP3 trial, ended clock, interruption, reload and explicit text fallback", async ({ page, context, browser, baseURL }, info) => {
  const otherContexts: BrowserContext[] = []; const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Observe the real browser audio context; no production test hooks or synthetic ended events.
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const state = window as unknown as { observedAudio: AudioContext; blockResume: boolean };
    state.blockResume = true;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) { super(options); state.observedAudio = this; }
      resume() {
        if (state.blockResume) { state.blockResume = false; return Promise.reject(new DOMException("Blocked", "NotAllowedError")); }
        return super.resume();
      }
    };
  });
  const room = await create(page);
  try {
    let panel = await controls(page);
    await panel.getByRole("button", { name: "语音", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("浏览器未允许播放");
    expect((await view(context, room)).narration.mode).toBe("text");
    await panel.getByRole("button", { name: "重新试音" }).click();
    await expect(panel.getByRole("button", { name: "已听清，启用语音" })).toBeVisible({ timeout: 30_000 });
    await panel.getByLabel("播报音量").fill("60");
    await panel.getByRole("button", { name: "已听清，启用语音" }).click();
    await expect.poll(async () => (await view(context, room)).narration.mode).toBe("voice");
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const targets = await panel.locator("button:visible").evaluateAll((buttons) => buttons.map((b) => ({ width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })));
      expect(targets.filter((b) => b.width < 43 || b.height < 43)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`voice-controls-${width}.png`), fullPage: true });
    }
    await close(page); await page.setViewportSize({ width: 390, height: 844 });
    for (let i = 2; i <= 8; i++) {
      const other = await browser.newContext({ baseURL }); otherContexts.push(other);
      await other.request.post("/api/v2/session", { headers: { origin }, data: {} });
      const current = await view(context, room);
      const response = await other.request.post(`/api/v2/rooms/${room}/join`, { headers: { origin }, data: { requestId: crypto.randomUUID(), epochId: current.epochId, name: `试音玩家${i}` } }); expect(response.ok()).toBe(true);
      await act(other, room, { type: "ready", ready: true });
    }
    await act(context, room, { type: "ready", ready: true });
    panel = await controls(page); await expect(panel.getByRole("button", { name: "开始发牌" })).toBeEnabled();
    await panel.getByRole("button", { name: "开始发牌" }).click(); await close(page);
    await expect.poll(async () => (await view(context, room)).narration.pending, { timeout: 20_000 }).toBeNull();
    panel = await controls(page); await expect(panel.getByRole("button", { name: "开始首夜" })).toBeEnabled();
    await panel.getByRole("button", { name: "开始首夜" }).click(); await close(page);
    await expect.poll(async () => (await view(context, room)).phase).toBe("night_open");
    await page.waitForTimeout(2000); expect((await view(context, room)).window).toBeNull();
    const privatePanel = page.getByRole("dialog", { name: "本人私密视角" });
    if (!await privatePanel.isVisible()) {
      try { await page.getByRole("button", { name: "查看当前任务" }).click({ timeout: 1500 }); }
      catch (error) { if (!await privatePanel.isVisible()) throw error; }
    }
    await expect(privatePanel).toBeVisible(); await close(page);
    await expect.poll(async () => (await view(context, room)).phase, { timeout: 40_000 }).toBe("night_action");
    const opened = (await view(context, room)).window!; expect(opened.deadline - opened.openedAt).toBe(30_000);
    const allContexts = [context, ...otherContexts];
    for (const member of allContexts) {
      const response = await member.request.get(`/api/v2/rooms/${room}/private`); const own = await response.json();
      if (own.role === "guard") await act(member, room, { type: "guard", targetId: null });
    }
    await page.evaluate(async () => (window as unknown as { observedAudio: AudioContext }).observedAudio.suspend());
    await expect.poll(async () => (await view(context, room)).paused).toBe(true);
    const frozen = (await view(context, room)).window!.remainingMs!;
    await page.reload();
    await expect(page.locator(".private-modal[open]")).toHaveCount(0);
    await expect.poll(async () => (await view(context, room)).paused).toBe(true);
    panel = await controls(page); await expect(panel.getByRole("button", { name: "恢复对局" })).toBeDisabled();
    await panel.getByRole("button", { name: "重新试音" }).click(); // Injected first resume rejection after reload.
    await expect(panel.getByRole("alert")).toContainText("浏览器未允许播放");
    await panel.getByRole("button", { name: "重新试音" }).click();
    await expect(panel.getByRole("button", { name: "已听清，启用语音" })).toBeVisible({ timeout: 30_000 });
    await panel.getByRole("button", { name: "已听清，启用语音" }).click();
    await expect(panel.getByRole("button", { name: "恢复对局" })).toBeEnabled();
    await panel.getByRole("button", { name: "恢复对局" }).click();
    await expect.poll(async () => (await view(context, room)).paused).toBe(false);
    const resumed = await view(context, room); expect(resumed.window!.deadline - resumed.serverTime).toBeGreaterThan(frozen + 28_000);
    await close(page);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await expect.poll(async () => (await view(context, room)).paused).toBe(true);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    expect((await view(context, room)).paused).toBe(true);
    panel = await controls(page); await panel.getByRole("button", { name: "文字", exact: true }).click();
    await expect.poll(async () => (await view(context, room)).narration.mode).toBe("text");
    await expect(panel.getByRole("button", { name: "恢复对局" })).toBeEnabled(); await panel.getByRole("button", { name: "恢复对局" }).click();
    await expect.poll(async () => (await view(context, room)).paused).toBe(false);
    await panel.getByRole("button", { name: "中止本局", exact: true }).click(); await panel.getByRole("button", { name: "确认中止", exact: true }).click();
    await expect.poll(async () => (await view(context, room)).phase).toBe("end");
    expect(errors).toEqual([]);
  } finally { for (const other of otherContexts) await other.close(); }
});

test("missing and corrupt bank cannot enable voice or silently advance", async ({ page, context }) => {
  const room = await create(page); const panel = await controls(page);
  await page.route(`**/audio/${script.version}/guard_open.mp3`, (route) => route.fulfill({ status: 404, body: "missing" }));
  await panel.getByRole("button", { name: "语音", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("声音资源未能完整加载");
  expect((await view(context, room)).narration.mode).toBe("text");
  await page.unroute(`**/audio/${script.version}/guard_open.mp3`);
  await page.route(`**/audio/${script.version}/guard_open.mp3`, (route) => route.fulfill({ status: 200, contentType: "audio/mpeg", body: "corrupted audio" }));
  await panel.getByRole("button", { name: "重新试音" }).click();
  await expect(panel.getByRole("alert")).toContainText("声音资源未能完整加载");
  expect((await view(context, room)).phase).toBe("lobby");
  expect((await view(context, room)).narration.mode).toBe("text");
});

test("a saved command waits for a fresh read instead of reusing an older poll", async ({ page, context }) => {
  const room = await create(page);
  await expect(page.getByRole("button", { name: "准备好了", exact: true })).toBeVisible();
  let firstStarted!: () => void, secondStarted!: () => void, releaseFirst!: () => void, releaseSecond!: () => void;
  const first = new Promise<void>((resolve) => { firstStarted = resolve; });
  const second = new Promise<void>((resolve) => { secondStarted = resolve; });
  const oldRead = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const newRead = new Promise<void>((resolve) => { releaseSecond = resolve; });
  let reads = 0;
  await page.route(`**/api/v2/rooms/${room}`, async (route) => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
    const index = ++reads; const response = await route.fetch();
    if (index === 1) { firstStarted(); await oldRead; }
    if (index === 2) { secondStarted(); await newRead; }
    await route.fulfill({ response });
  });
  try {
    await first;
    await page.getByRole("button", { name: "准备好了", exact: true }).click();
    await expect.poll(async () => (await view(context, room)).players[0]).toMatchObject({ ready: true });
    releaseFirst(); await second;
    await expect(page.getByRole("button", { name: "正在保存", exact: true })).toBeDisabled();
    releaseSecond(); await expect(page.getByRole("button", { name: "取消准备", exact: true })).toBeEnabled();
  } finally { releaseFirst(); releaseSecond(); }
});

test("leaving a page aborts its pending foreground heartbeat", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const nativeFetch = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).endsWith("/heartbeat") && init?.signal && JSON.parse(String(init.body)).foreground) {
        init.signal.addEventListener("abort", () => sessionStorage.setItem("heartbeatCancelled", "yes"), { once: true });
      }
      return nativeFetch(input, init);
    };
  });
  const room = await create(page);
  let started!: () => void, release!: () => void;
  const first = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(`**/api/v2/rooms/${room}/heartbeat`, async (route) => {
    if (!held && route.request().resourceType() === "fetch" && route.request().postDataJSON()?.foreground) {
      held = true; const response = await route.fetch(); started(); await gate;
      try { await route.fulfill({ response }); } catch { /* The old page explicitly cancelled this request. */ }
    } else await route.continue();
  });
  try {
    await first;
    // Trigger the lifecycle handler deterministically before the old document is discarded.
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    expect(await page.evaluate(() => sessionStorage.getItem("heartbeatCancelled"))).toBe("yes");
    await page.reload(); release();
    await expect(page.getByRole("heading", { name: "入席，等夜来" })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("heartbeatCancelled"))).toBe("yes");
    expect(errors).toEqual([]);
  } finally { release(); }
});

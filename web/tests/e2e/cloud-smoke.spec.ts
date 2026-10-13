import { expect, test, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { preset } from "../../src/game/config";
import script from "../../src/narration/script.json" with { type: "json" };
import type { PublicRoom, PrivateRoom, Operation } from "../../src/ui/contracts";

test("cloud smoke: optional trial, silent timeout waits and split wolf votes", async ({ browser, baseURL }, info) => {
  test.setTimeout(240_000);
  const contexts: BrowserContext[] = []; const errors: string[] = []; let room = "";
  const headers = info.project.use.extraHTTPHeaders ?? {};
  async function read<T>(context: BrowserContext, path: string): Promise<T> {
    const response = await context.request.get(`/api/v2/${path}`); expect(response.ok(), `GET ${path}`).toBe(true); return response.json();
  }
  async function post(context: BrowserContext, path: string, data: unknown) {
    const response = await context.request.post(`/api/v2/${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok(), `POST ${path}: HTTP ${response.status()}`).toBe(true); return response.json();
  }
  const view = (context = contexts[0]!) => read<PublicRoom>(context, `rooms/${room}`);
  async function act(index: number, operation: Operation) {
    const context = contexts[index]!; const current = await view(context);
    return post(context, `rooms/${room}/commands`, { requestId: crypto.randomUUID(), epochId: current.epochId, windowId: current.windowId, operation });
  }
  try {
    for (let i = 0; i < 8; i++) {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, extraHTTPHeaders: headers }); contexts.push(context);
      await post(context, "session", {});
    }
    const config = preset(8); config.roles.guard = 1; config.roles.hunter = 1; config.roles.villager = 2;
    const created = await post(contexts[0]!, "rooms", { requestId: crypto.randomUUID(), name: "Cloud QA 1", config }); room = created.roomId;
    writeFileSync(info.outputPath("created-room-ids.json"), JSON.stringify({ rooms: [room], origin: baseURL }), { mode: 0o600 });
    for (let i = 1; i < 8; i++) await post(contexts[i]!, `rooms/${room}/join`, { requestId: crypto.randomUUID(), epochId: created.epochId, name: `Cloud QA ${i + 1}` });
    const pages = [];
    await contexts[0]!.addInitScript(() => {
      const Native = window.AudioContext;
      const observed = window as unknown as { audioStarts: number; audioRates: number[] }; observed.audioStarts = 0; observed.audioRates = [];
      window.AudioContext = class extends Native {
        createBufferSource() { const source = super.createBufferSource(); const start = source.start.bind(source);
          source.start = (...args: Parameters<AudioBufferSourceNode["start"]>) => { observed.audioStarts++; observed.audioRates.push(source.playbackRate.value); start(...args); }; return source; }
      };
    });
    for (const context of contexts) { const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message)); pages.push(page); await page.goto(`/r/${room}`); }
    const host = pages[0]!;
    await host.getByRole("button", { name: "管理玩家", exact: true }).click();
    const roster = host.getByRole("dialog", { name: "完整名单", exact: true });
    host.once("dialog", dialog => dialog.accept());
    await roster.getByRole("button", { name: "移出8号", exact: true }).click();
    await expect.poll(async () => (await view()).players.length).toBe(7);
    expect((await contexts[7]!.request.get(`/api/v2/rooms/${room}`)).status()).toBe(401);
    await host.keyboard.press("Escape");
    await post(contexts[7]!, `rooms/${room}/join`, { requestId: crypto.randomUUID(), epochId: created.epochId, name: "Cloud QA 8" });
    await pages[7]!.reload(); await expect.poll(async () => (await view()).players.length).toBe(8);
    await expect(host.getByRole("button", { name: "准备好了", exact: true })).toBeVisible();
    await act(1, { type: "ready", ready: true }); await pages[1]!.reload();
    await expect(pages[1]!.getByRole("button", { name: "取消准备", exact: true })).toBeVisible();
    const forbidden = await contexts[1]!.request.get(`/api/v2/rooms/${room}/host`); expect(forbidden.status()).toBe(403);
    const invalidOrigin = await contexts[1]!.request.post(`/api/v2/rooms/${room}/commands`, { headers: { origin: "https://evil.example" }, data: {} }); expect(invalidOrigin.status()).toBe(403);
    const publicResponse = await contexts[0]!.request.get(`/api/v2/rooms/${room}`);
    expect(publicResponse.headers()["cache-control"]).toContain("no-store"); expect(publicResponse.headers()["vary"]).toBe("Cookie");
    const cookies = await contexts[0]!.cookies(); const session = cookies.find(c => c.name === "ww_session")!;
    expect(session.httpOnly).toBe(true); expect(session.secure).toBe(true); expect(session.sameSite).toBe("Strict");
    const manifestResponse = await contexts[0]!.request.get(`/audio/${script.version}/manifest.json`); expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json(); expect(Object.keys(manifest.clips)).toHaveLength(Object.keys(script.clips).length);
    await host.getByRole("button", { name: "主持控制", exact: true }).click();
    const panel = host.getByRole("dialog", { name: "主持控制" }); await panel.getByRole("button", { name: "语音", exact: true }).click();
    await expect(panel.locator(".voice-controls .section-heading [role=status]")).toHaveText("声音就绪", { timeout: 60_000 });
    await panel.getByRole("button", { name: "试音（可选）", exact: true }).click();
    await expect(panel.locator(".voice-controls .section-heading [role=status]")).toHaveText("声音就绪");
    expect(await host.evaluate(() => (window as unknown as { audioRates: number[] }).audioRates)).toEqual([1.5]);
    await panel.getByRole("button", { name: "二倍速", exact: true }).click();
    await expect(panel.getByRole("button", { name: "二倍速", exact: true })).toHaveAttribute("aria-pressed", "true");

    await expect.poll(async () => (await view()).narration.mode).toBe("voice"); await host.keyboard.press("Escape");
    for (let i = 0; i < 8; i++) if (i !== 1) await act(i, { type: "ready", ready: true });
    await act(0, { type: "start" });
    await expect.poll(async () => (await view()).phase).toBe("reveal");
    for (const page of pages) {
      await expect(page.getByRole("button", { name: "查看身份", exact: true })).toBeVisible();
      await expect(page.locator(".identity")).toHaveCount(0);
      await expect(page.getByText("身份确认", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "确认身份", exact: true })).toHaveCount(0);
    }
    await expect.poll(async () => (await view()).narration.pending).toBeNull();
    await host.getByRole("button", { name: "主持控制", exact: true }).click();
    await expect(panel.getByRole("button", { name: "开始首夜", exact: true })).toBeEnabled();
    await panel.getByRole("button", { name: "开始首夜", exact: true }).click();
    await host.keyboard.press("Escape");
    await expect.poll(async () => (await view()).phase, { timeout: 60_000 }).toBe("night_action");
    const current = await view(); expect(current.nightRole).toBe("guard"); expect(current.window!.deadline - current.window!.openedAt).toBe(10_000);
    expect(current.players.every(p => "revealedRole" in p && p.revealedRole === null)).toBe(true);
    let guard = -1;
    for (let i = 0; i < 8; i++) if ((await read<PrivateRoom>(contexts[i]!, `rooms/${room}/private`)).action === "guard") guard = i;
    expect(guard).toBeGreaterThanOrEqual(0);
    const privatePanel = pages[guard]!.getByRole("dialog", { name: "本人私密视角" });
    await expect(privatePanel).toBeVisible(); await expect(privatePanel.getByText("选择守护", { exact: true })).toBeVisible();
    await pages[guard]!.screenshot({ path: info.outputPath("private-first-action.png") });
    const guardStarts = await host.evaluate(() => (window as unknown as { audioStarts: number }).audioStarts);
    await expect.poll(async () => (await view()).window?.waiting, { timeout: 45_000 }).toBe(true);
    expect((await view()).paused).toBe(false); expect((await view()).pauseReason).toBeNull();
    expect((await view()).windowId).toBe(current.windowId);
    expect(await host.evaluate(() => (window as unknown as { audioStarts: number }).audioStarts)).toBe(guardStarts);
    await expect(privatePanel.getByText("等待操作", { exact: true })).toBeVisible();
    await privatePanel.getByRole("button", { name: "本夜不守", exact: true }).click();
    await privatePanel.getByRole("button", { name: "确认行动", exact: true }).click();
    await expect.poll(async () => (await read<PrivateRoom>(contexts[guard]!, `rooms/${room}/private`)).completed).toBe(true);
    await expect(privatePanel.locator(".waiting-note")).toContainText("本夜不守");
    await pages[guard]!.waitForTimeout(1000); await expect(privatePanel).toBeVisible();
    await expect(privatePanel).not.toBeVisible();
    await pages[guard]!.getByRole("button", { name: "查看当前任务", exact: true }).click();
    await expect(privatePanel.locator(".waiting-note")).toContainText("本夜不守");
    await expect.poll(async () => { const current = await view(); return `${current.phase}:${current.nightRole}`; }, { timeout: 60_000 }).toBe("night_action:werewolf");
    const wolfWindow = await view(); expect(wolfWindow.window!.deadline - wolfWindow.window!.openedAt).toBe(30_000);
    const rates = await host.evaluate(() => (window as unknown as { audioRates: number[] }).audioRates);
    expect(rates.every(rate => rate === 1)).toBe(true); expect(rates.length).toBeGreaterThan(3);
    const wolfActors: number[] = [];
    for (let i = 0; i < 8; i++) if ((await read<PrivateRoom>(contexts[i]!, `rooms/${room}/private`)).role === "werewolf") wolfActors.push(i);
    expect(wolfActors).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      const wolfPanel = pages[wolfActors[i]!]!.getByRole("dialog", { name: "本人私密视角" });
      await expect(wolfPanel).toBeVisible();
      await wolfPanel.getByRole("button", { name: "历次刀口目标", exact: true }).click();
      await expect(wolfPanel.locator(".private-detail:popover-open")).toContainText("暂无历史刀口");
      await wolfPanel.getByRole("button", { name: "关闭详情", exact: true }).click();
      await wolfPanel.getByRole("button", { name: new RegExp(`^${i + 7}号 `) }).click();
    }
    const first = pages[wolfActors[0]!]!.getByRole("dialog", { name: "本人私密视角" });
    const otherSeat = wolfWindow.players[wolfActors[1]!]!.seat;
    const otherRow = first.locator(".wolf-proposals>div").filter({ has: pages[wolfActors[0]!]!.locator("strong").filter({ hasText: new RegExp(`^${otherSeat} 号$`) }) });
    await expect(otherRow.locator("span").first()).toHaveText("8 号");
    await first.getByRole("button", { name: "确认投票", exact: true }).click();
    await expect.poll(async () => (await read<PrivateRoom>(contexts[wolfActors[0]!]!, `rooms/${room}/private`)).wolves?.confirmations.length).toBe(1);
    const wolfStarts = await host.evaluate(() => (window as unknown as { audioStarts: number }).audioStarts);
    await expect.poll(async () => (await view()).window?.waiting, { timeout: 45_000 }).toBe(true);
    expect((await view()).paused).toBe(false); expect((await view()).pauseReason).toBeNull();
    expect((await view()).windowId).toBe(wolfWindow.windowId);
    expect(await host.evaluate(() => (window as unknown as { audioStarts: number }).audioStarts)).toBe(wolfStarts);
    const second = pages[wolfActors[1]!]!.getByRole("dialog", { name: "本人私密视角" });
    await second.getByRole("button", { name: "确认投票", exact: true }).click();
    await expect.poll(async () => (await read<PrivateRoom>(contexts[wolfActors[0]!]!, `rooms/${room}/private`)).actionResult?.kind).toBe("kill");
    const decisions = await read<PrivateRoom>(contexts[wolfActors[0]!]!, `rooms/${room}/private`);
    expect(decisions.actionResult?.kind).toBe("kill");
    expect([wolfWindow.players[6]!.id, wolfWindow.players[7]!.id]).toContain(decisions.actionResult?.targetId);
    await expect(first.locator(".waiting-note")).toContainText("狼队共同目标");
    await pages[wolfActors[0]!]!.waitForTimeout(1000); await expect(first).toBeVisible();
    await expect(first).not.toBeVisible();
    await pages[wolfActors[0]!]!.getByRole("button", { name: "查看当前任务", exact: true }).click();
    await expect(first.locator(".waiting-note")).toContainText("狼队共同目标");
    await act(0, { type: "abort" }); await expect.poll(async () => (await view()).phase).toBe("end");
    expect((await view()).aborted).toBe(true); expect(errors).toEqual([]);
    console.log(`Cloud smoke passed: 8 isolated sessions, direct voice without trial, ${Object.keys(script.clips).length * 2} pitch-safe clips, silent guard/wolf timeout waits, late private receipts before concealment, preserved partial votes and a persisted tied decision; aborted before a complete game.`);
  } finally {
    if (room) writeFileSync(info.outputPath("created-room-ids.json"), JSON.stringify({ rooms: [room], origin: baseURL }), { mode: 0o600 });
    for (const context of contexts) await context.close();
  }
});

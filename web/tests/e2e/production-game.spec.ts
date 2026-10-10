import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import script from "../../src/narration/script.json" with { type: "json" };
import type { PublicRoom, PrivateRoom, Recap } from "../../src/ui/contracts";
import type { Role } from "../../src/game/types";

const production = "https://werewolf-web-v2.vercel.app";
const names: Record<string, Role> = { 狼人: "werewolf", 预言家: "seer", 女巫: "witch", 守卫: "guard", 猎人: "hunter", 平民: "villager" };
type Actor = { page: Page; context: BrowserContext; seat: number; id: string; role: Role | null };
type Sound = { hash: string; startedAt: number; endedAt?: number; durationMs: number };

test("production: 12 independent players complete a real-time voice game, recap and next lobby", async ({ browser, baseURL }, info) => {
  test.skip(baseURL !== production || process.env.RUN_PRODUCTION_ACCEPTANCE !== "1", "Never run a production game implicitly");
  const actors: Actor[] = []; const errors: { seat: number; message: string }[] = [];
  const report = { origin: production, rooms: [] as string[], passed: false, completeGame: false, normalTiming: true,
    players: 12, voiceVersion: script.version, startedAt: Date.now(), endedAt: 0, gameId: "", winner: null as string | null,
    windows: [] as { night: number; role: string; durationMs: number; opening: number }[],
    transitions: [] as { phase: string; role: string | null; night: number; at: number }[],
    recoveries: 0, wolfAutomaticWait: false, hostEliminated: false, recapChecked: false, nextLobbyChecked: false,
    playedClips: {} as Record<string, number>, interruptedClips: {} as Record<string, number>, decodedClips: 0 };
  const reportPath = info.outputPath("production-report.json");
  const save = () => writeFileSync(reportPath, JSON.stringify(report), { mode: 0o600 });
  let room = "";
  async function view(actor = actors[0]!) {
    const response = await actor.context.request.get(`/api/v2/rooms/${room}`);
    expect(response.ok(), "Public room read").toBe(true);
    expect(response.headers()["cache-control"]).toContain("no-store");
    return await response.json() as PublicRoom;
  }
  async function personal(actor: Actor) {
    const response = await actor.context.request.get(`/api/v2/rooms/${room}/private`);
    expect(response.ok(), "Own private room read").toBe(true); return await response.json() as PrivateRoom;
  }
  async function close(page: Page) { await page.keyboard.press("Escape"); await expect(page.locator("dialog[open]")).toHaveCount(0); }
  async function controls() {
    const page = actors[0]!.page; const panel = page.getByRole("dialog", { name: "主持控制" });
    if (!await panel.isVisible()) await page.getByRole("button", { name: "主持控制", exact: true }).click();
    await expect(panel).toBeVisible(); return panel;
  }
  async function privatePanel(actor: Actor) {
    const panel = actor.page.getByRole("dialog", { name: "本人私密视角" });
    await expect(async () => {
      if (!await panel.isVisible()) await actor.page.getByRole("button", { name: /查看身份|查看当前任务/ }).click({ timeout: 2000 });
      await expect(panel).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 8000, intervals: [200, 500, 1000] });
    return panel;
  }
  const alive = (actor: Actor, current: PublicRoom) => current.players.some((p) => p.id === actor.id && "alive" in p && p.alive);
  async function frame(actor: Actor, label: string) {
    const panel = actor.page.getByRole("dialog", { name: "本人私密视角" });
    const fits = await panel.evaluate((element) => {
      const content = element.querySelector(".action-content")!;
      const buttons = [...element.querySelectorAll(".single-screen button")].filter((b) => b.getBoundingClientRect().width > 0);
      return content.scrollHeight <= content.clientHeight + 1 && buttons.every((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width >= 44 && r.height >= 44; });
    });
    expect(fits, `${label} fits on screen`).toBe(true); await actor.page.screenshot({ path: info.outputPath(`${label}.png`) });
  }
  async function trial() {
    const panel = await controls();
    const enable = panel.getByRole("button", { name: "语音", exact: true });
    if (await enable.isEnabled()) await enable.click();
    else if (await panel.getByRole("button", { name: "恢复声音", exact: true }).isVisible()) await panel.getByRole("button", { name: "恢复声音", exact: true }).click();
    else await panel.getByRole("button", { name: "试音（可选）", exact: true }).click();
    await expect(panel.locator(".voice-controls .section-heading [role=status]")).toHaveText("声音就绪", { timeout: 60_000 });

    await expect(panel.locator(".voice-controls .section-heading [role=status]")).toHaveText("声音就绪", { timeout: 30_000 });
    await expect.poll(async () => (await view()).narration.mode).toBe("voice"); await close(actors[0]!.page);
  }
  async function recover() {
    report.recoveries++; expect(report.recoveries, "Bound safety recoveries").toBeLessThanOrEqual(3);
    const panel = await controls();
    if (await panel.getByText(/声音已中断|声音资源未能完整加载|浏览器未允许播放/).count()) { await trial(); }
    const next = await controls(); await expect(next.getByRole("button", { name: "恢复对局", exact: true })).toBeEnabled();
    await next.getByRole("button", { name: "恢复对局", exact: true }).click(); await close(actors[0]!.page); save();
  }
  const handled = new Set<string>();
  try {
    for (let i = 0; i < 12; i++) {
      const context = await browser.newContext({ baseURL: production, viewport: { width: 390, height: 844 } });
      const page = await context.newPage(); page.on("pageerror", (error) => errors.push({ seat: i + 1, message: error.message }));
      actors.push({ context, page, seat: i + 1, id: "", role: null });
    }
    const host = actors[0]!;
    await host.page.addInitScript(() => {
      const Native = window.AudioContext; const hashes = new WeakMap<AudioBuffer, string>();
      const observed = window as unknown as { productionSounds: Sound[]; productionDecoded: number };
      observed.productionSounds = []; observed.productionDecoded = 0;
      window.AudioContext = class extends Native {
        decodeAudioData(data: ArrayBuffer, success?: DecodeSuccessCallback | null, failure?: DecodeErrorCallback | null) {
          const copy = data.slice(0);
          return Promise.all([super.decodeAudioData(data), crypto.subtle.digest("SHA-256", copy)]).then(([buffer, digest]) => {
            hashes.set(buffer, Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")); observed.productionDecoded++;
            success?.(buffer); return buffer;
          }).catch((error) => { failure?.(error); throw error; });
        }
        createBufferSource() {
          const source = super.createBufferSource(); const start = source.start.bind(source);
          source.start = (...args: Parameters<AudioBufferSourceNode["start"]>) => {
            const sound = { hash: hashes.get(source.buffer!) ?? "", startedAt: Date.now(), durationMs: (source.buffer?.duration ?? 0) * 1000 } as Sound;
            observed.productionSounds.push(sound); source.addEventListener("ended", () => { sound.endedAt = Date.now(); }); start(...args);
          }; return source;
        }
      };
    });
    await host.page.goto("/"); await host.page.getByLabel("你的昵称").fill("Cloud QA live host");
    await host.page.getByRole("button", { name: "12 人", exact: true }).click();
    await host.page.getByRole("button", { name: "创建房间", exact: true }).last().click();
    await host.page.waitForURL(/\/r\/[A-F0-9]{8}$/); room = host.page.url().split("/").at(-1)!; report.rooms.push(room); save();
    for (const actor of actors.slice(1)) {
      await actor.page.goto(`/join?room=${room}`); await actor.page.getByLabel("你的昵称").fill(`Cloud QA live ${actor.seat}`);
      await actor.page.getByRole("button", { name: "加入房间", exact: true }).last().click(); await actor.page.waitForURL(new RegExp(`/r/${room}$`));
    }
    for (const actor of actors) {
      actor.id = (await view(actor)).self.playerId;
      await actor.page.getByRole("button", { name: "准备好了", exact: true }).click(); await expect(actor.page.getByRole("button", { name: "取消准备", exact: true })).toBeVisible();
      const cookie = (await actor.context.cookies()).find((c) => c.name === "ww_session"); expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: "Strict" });
    }
    await actors[1]!.page.reload(); await expect(actors[1]!.page.getByRole("button", { name: "取消准备", exact: true })).toBeVisible();
    expect((await actors[1]!.context.request.get(`/api/v2/rooms/${room}/host`)).status()).toBe(403);
    const bad = await actors[1]!.context.request.post(`/api/v2/rooms/${room}/commands`, { headers: { origin: "https://evil.example" }, data: {} }); expect(bad.status()).toBe(403);
    await trial(); const settings = await controls();
    await expect(settings.getByRole("button", { name: "开始发牌", exact: true })).toBeEnabled(); await settings.getByRole("button", { name: "开始发牌", exact: true }).click(); await close(host.page);
    for (const actor of actors) {
      const panel = await privatePanel(actor); actor.role = names[(await panel.locator(".identity h3").innerText()).trim()] ?? null; expect(actor.role).not.toBeNull();
      await expect(panel.getByRole("button", { name: "确认身份", exact: true })).toHaveCount(0); await close(actor.page);
      await expect(actor.page.locator(".identity")).toHaveCount(0);
    }
    report.gameId = (await view()).epochId;
    await expect.poll(async () => (await view()).narration.pending, { timeout: 60_000 }).toBeNull();
    const start = await controls(); await expect(start.getByRole("button", { name: "开始首夜", exact: true })).toBeEnabled();
    await start.getByRole("button", { name: "开始首夜", exact: true }).click(); await close(host.page);
    await expect.poll(async () => (await view()).phase, { timeout: 30_000 }).not.toBe("reveal");
    let previous = ""; let hunterReacted = false; let actionReloaded = false;
    while (true) {
      const current = await view(); const key = `${current.epochId}:${current.phase}:${current.nightNo}:${current.nightRole}:${current.narration.pending?.id ?? ""}`;
      if (key !== previous) { report.transitions.push({ phase: current.phase, role: current.nightRole, night: current.nightNo, at: Date.now() }); previous = key; console.log(`Live acceptance: night ${current.nightNo}, ${current.phase}${current.nightRole ? ` ${current.nightRole}` : ""}`); save(); }
      if (current.phase === "end") {
        await expect.poll(async () => (await view()).narration.pending, { timeout: 60_000 }).toBeNull();
        expect(current.aborted).toBe(false); expect(current.winner).toBe("good"); report.winner = current.winner; report.completeGame = true; break;
      }
      if (current.paused) {
        const wolf = actors.find((a) => a.role === "werewolf" && alive(a, current));
        const discussion = current.phase === "night_action" && current.nightRole === "werewolf" && wolf && (await personal(wolf)).wolves?.discussionPaused;
        if (!discussion) { await recover(); continue; }
        report.wolfAutomaticWait = true;
      }
      if (current.narration.pending || current.phase === "night_open" || current.phase === "night_close" || current.phase === "dawn") { await host.page.waitForTimeout(700); continue; }
      if (current.phase === "night_action") {
        const turn = `${current.nightNo}:${current.nightRole}`;
        if (handled.has(turn)) { await host.page.waitForTimeout(700); continue; }
        const duration = current.window!.deadline - current.window!.openedAt;
        expect(duration).toBe(["guard", "werewolf"].includes(current.nightRole!) ? 30_000 : 10_000);
        if (current.nightNo === 1 && current.nightRole === "werewolf" && !current.paused) { await host.page.waitForTimeout(700); continue; }
        report.windows.push({ night: current.nightNo, role: current.nightRole!, durationMs: duration, opening: current.window!.openedAt }); save();
        const active = actors.filter((a) => a.role === current.nightRole && alive(a, current));
        if (current.paused && current.nightRole === "werewolf") for (const actor of active) await expect(actor.page.locator(".stage-status")).toHaveText("暂停");
        for (const actor of active) {
          const panel = await privatePanel(actor);
          if (current.nightRole !== "witch") await frame(actor, `${turn.replace(":", "-")}-seat-${actor.seat}`);
          if (current.nightRole === "werewolf") {
            if (current.nightNo === 1) await panel.getByRole("button", { name: new RegExp(`^${host.seat}号 `) }).click();
            else await panel.getByRole("button", { name: "本夜空刀", exact: true }).click();
          } else {
            if (current.nightRole === "guard") await panel.getByRole("button", { name: "本夜不守", exact: true }).click();
            if (current.nightRole === "witch") {
              if (current.nightNo === 1) { const target = actors.find((a) => a.role === "werewolf" && a.id !== host.id && alive(a, current))!; await panel.getByRole("button", { name: "使用毒药", exact: true }).click(); await frame(actor, `${turn.replace(":", "-")}-seat-${actor.seat}`); await panel.getByRole("button", { name: new RegExp(`^${target.seat}号 `) }).click(); }
              else await panel.getByRole("button", { name: "不用药", exact: true }).click();
            }
            if (current.nightRole === "seer") { const target = actors.find((a) => a.role === "werewolf" && alive(a, current))!; await panel.getByRole("button", { name: new RegExp(`^${target.seat}号 `) }).click(); }
            await panel.getByRole("button", { name: "确认行动", exact: true }).click(); await expect(panel.getByRole("heading", { name: "行动已确认", exact: true })).toBeVisible(); await close(actor.page);
            if (actor.id !== host.id && !actionReloaded) { await actor.page.reload(); await expect(actor.page.locator(".private-modal[open]")).toHaveCount(0); const restored = await privatePanel(actor); await expect(restored.getByRole("heading", { name: "行动已确认", exact: true })).toBeVisible(); await close(actor.page); actionReloaded = true; }
          }
        }
        if (current.nightRole === "werewolf") for (const actor of active) {
          const panel = await privatePanel(actor); await expect(panel.getByRole("button", { name: "确认投票", exact: true })).toBeEnabled();
          await panel.getByRole("button", { name: "确认投票", exact: true }).click();
          await expect.poll(async () => {
            const accepted = await view();
            return accepted.phase !== "night_action" || accepted.nightRole !== "werewolf" || !!(await personal(actor)).wolves?.confirmations.includes(actor.id);
          }).toBe(true);
          await close(actor.page);
        }
        handled.add(turn); continue;
      }
      if (current.phase === "hunter") {
        const hunter = actors.find((a) => a.role === "hunter")!; const panel = await privatePanel(hunter);
        expect(current.window!.deadline - current.window!.openedAt).toBe(10_000); await frame(hunter, `hunter-night-${current.nightNo}`);
        const target = actors.find((a) => a.role === "werewolf" && alive(a, current));
        if (target) await panel.getByRole("button", { name: new RegExp(`^${target.seat}号 `) }).click(); else await panel.getByRole("button", { name: "放弃开枪", exact: true }).click();
        await panel.getByRole("button", { name: "确认行动", exact: true }).click(); hunterReacted = true; if (await panel.isVisible()) await close(hunter.page);
        await expect.poll(async () => (await view()).phase).not.toBe("hunter"); continue;
      }
      if (current.phase === "day") {
        report.hostEliminated ||= !alive(host, current);
        const target = !hunterReacted ? actors.find((a) => a.role === "hunter" && alive(a, current)) : undefined;
        const voted = target ?? actors.find((a) => a.role === "werewolf" && alive(a, current))!;
        expect(voted).toBeTruthy(); const panel = await controls();
        await panel.getByRole("button", { name: new RegExp(`^${voted.seat}号 `) }).click(); await panel.getByRole("button", { name: "保存草案", exact: true }).click();
        await expect(panel.getByText(`${voted.seat} 号出局`, { exact: true })).toBeVisible(); await panel.getByRole("button", { name: "确认待发布", exact: true }).click();
        await panel.getByRole("button", { name: "发布结果", exact: true }).click(); await panel.getByRole("button", { name: "确认发布", exact: true }).click(); await close(host.page);
        await expect.poll(async () => (await view()).phase).not.toBe("day"); continue;
      }
      throw new Error(`Unexpected public phase: ${current.phase}`);
    }
    expect(report.wolfAutomaticWait).toBe(true); expect(report.hostEliminated).toBe(true);
    await expect(host.page.getByRole("heading", { name: "好人阵营获胜", exact: true })).toBeVisible();
    const manifest = await (await host.context.request.get(`/audio/${script.version}/manifest.json`)).json();
    const sounds = await host.page.evaluate(() => (window as unknown as { productionSounds: Sound[] }).productionSounds);
    report.decodedClips = await host.page.evaluate(() => (window as unknown as { productionDecoded: number }).productionDecoded); expect(report.decodedClips).toBe(40);
    for (const sound of sounds) {
      const id = Object.keys(manifest.clips).find((key) => manifest.clips[key].sha256 === sound.hash); expect(id).toBeTruthy();
      expect(sound.endedAt, `Audio ${id} ended`).toBeDefined();
      const fullyPlayed = sound.endedAt! - sound.startedAt >= sound.durationMs - 350;
      const counts = fullyPlayed ? report.playedClips : report.interruptedClips; counts[id!] = (counts[id!] ?? 0) + 1;
      if (!fullyPlayed && id !== "pause" && id !== "resume") expect(report.recoveries, `Unexpected interrupted clip ${id}`).toBeGreaterThan(0);
    }
    for (const role of ["guard", "werewolf", "witch", "seer"]) {
      expect(report.playedClips[`${role}_open`]).toBeGreaterThanOrEqual((await view()).nightNo); expect(report.playedClips[`${role}_close`]).toBeGreaterThanOrEqual((await view()).nightNo);
    }
    const recapResponse = await host.context.request.get(`/api/v2/rooms/${room}/recaps/${report.gameId}`); expect(recapResponse.ok()).toBe(true);
    const recap = await recapResponse.json() as Recap; expect(recap.winner).toBe("good"); expect(recap.aborted).toBe(false); expect(recap.participants).toHaveLength(12);
    await host.page.getByRole("link", { name: "查看本局复盘", exact: true }).click(); await expect(host.page.getByRole("heading", { name: "揭开身份", exact: true })).toBeVisible();
    await host.page.screenshot({ path: info.outputPath("completed-recap.png"), fullPage: true }); report.recapChecked = true;
    await host.page.getByRole("link", { name: "返回这一桌", exact: true }).click(); await trial();
    await host.page.getByRole("button", { name: "下一局", exact: true }).click(); await expect(host.page.getByRole("heading", { name: "入席，等夜来", exact: true })).toBeVisible();
    await expect.poll(async () => (await view()).narration.pending, { timeout: 60_000 }).toBeNull();
    const next = await view(); expect(next.epochId).not.toBe(report.gameId); expect(next.players).toHaveLength(12); expect(next.players.every((p) => "ready" in p && !p.ready)).toBe(true);
    await actors[1]!.page.reload(); await expect(actors[1]!.page.getByRole("button", { name: "准备好了", exact: true })).toBeVisible();
    report.nextLobbyChecked = true; expect(errors).toEqual([]); report.passed = true; report.endedAt = Date.now(); save();
    console.log(`Production full voice acceptance passed: 12 sessions, ${recap.nights.length} real-time nights, recap and next lobby; ${report.recoveries} safety recoveries.`);
  } finally { save(); for (const actor of actors) await actor.context.close(); }
});

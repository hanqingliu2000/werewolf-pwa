import { request } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import process from "node:process";
import console from "node:console";
import { isDeepStrictEqual } from "node:util";
import script from "../src/narration/script.json" with { type: "json" };

const [baseURL, reportPath, authPath] = process.argv.slice(2);
if (!baseURL || !reportPath || !/^https:\/\/werewolf-web-v2(?:-[a-z0-9]+-barrylius-projects-d58e2788)?\.vercel\.app$/.test(baseURL)) throw new Error("Use only an approved web-v2 deployment");
const headers = authPath ? { "x-vercel-protection-bypass": JSON.parse(readFileSync(authPath, "utf8")).secret } : {};
const actors = []; const report = { origin: baseURL, rooms: [], passed: false, completeGame: false };
const check = (condition, label) => { if (!condition) throw new Error(`Deployment smoke failed: ${label}`); };
async function post(actor, path, data) {
  const response = await actor.post(`/api/v2/${path}`, { headers: { origin: baseURL }, data }); check(response.ok(), `POST ${path} HTTP ${response.status()}`); return response.json();
}
try {
  for (let i = 0; i < 3; i++) actors.push(await request.newContext({ baseURL, extraHTTPHeaders: headers }));
  const [host, guest, stranger] = actors;
  const health = await host.get("/api/health"); check(health.status() === 200 && (await health.json()).status === "ok", "database readiness");
  const home = await host.get("/"); check(home.status() === 200 && !(await home.text()).includes("暂未开放入席"), "open homepage");
  const bank = await host.get(`/audio/${script.version}/manifest.json`); check(bank.ok(), "bank manifest"); const manifest = await bank.json();
  check(Object.keys(manifest.clips).length === 40, "40 clips");
  for (const [id, entry] of Object.entries(manifest.clips)) {
    const clip = await host.get(`/audio/${script.version}/${id}.mp3`); check(clip.ok(), `clip ${id}`); const bytes = await clip.body();
    check(bytes.length === entry.bytes && createHash("sha256").update(bytes).digest("hex") === entry.sha256 && entry.text === script.clips[id], `clip fingerprint ${id}`);
  }
  for (const actor of actors) await post(actor, "session", {});
  const cookie = (await host.storageState()).cookies.find(c => c.name === "ww_session"); check(cookie?.secure && cookie.httpOnly && cookie.sameSite === "Strict", "secure session cookie");
  const config = { version: "werewolf-web-v1", winMode: "edge", roles: { werewolf: 2, seer: 1, witch: 1, guard: 1, hunter: 1, villager: 2 } };
  const created = await post(host, "rooms", { requestId: randomUUID(), name: "Cloud QA production", config }); report.rooms.push(created.roomId);
  await post(guest, `rooms/${created.roomId}/join`, { requestId: randomUUID(), epochId: created.epochId, name: "Cloud QA guest" });
  const response = await host.get(`/api/v2/rooms/${created.roomId}`); check(response.ok(), "room persistence"); const view = await response.json();
  check(view.players.length === 2 && response.headers()["cache-control"].includes("no-store") && response.headers().vary === "Cookie", "membership and cache privacy");
  check((await guest.get(`/api/v2/rooms/${created.roomId}/host`)).status() === 403, "non-host denied");
  check((await stranger.get(`/api/v2/rooms/${created.roomId}`)).status() === 401, "foreign session denied");
  const bad = await host.post(`/api/v2/rooms/${created.roomId}/commands`, { headers: { origin: "https://evil.example" }, data: {} }); check(bad.status() === 403, "origin denied");
  const input = { requestId: randomUUID(), epochId: view.epochId, windowId: view.windowId, operation: { type: "ready", ready: true } };
  const accepted = await post(guest, `rooms/${created.roomId}/commands`, input); const repeated = await post(guest, `rooms/${created.roomId}/commands`, input);
  check(isDeepStrictEqual(accepted, repeated), "durable request receipt");
  report.passed = true; report.clipsVerified = 40; report.secureCookies = true; report.isolatedSessions = 3;
  console.log(JSON.stringify({ passed: true, clipsVerified: 40, isolatedSessions: 3, completeGame: false }));
} finally {
  writeFileSync(reportPath, JSON.stringify(report), { mode: 0o600 });
  for (const actor of actors) await actor.dispose();
}

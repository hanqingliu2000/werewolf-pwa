import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { log, error } from "node:console";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = fileURLToPath(new URL("..", import.meta.url));
const listener = createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const temporary = mkdtempSync(join(tmpdir(), "werewolf-http-"));
let output = "";
const base = `http://127.0.0.1:${port}`;
function launch() {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: directory, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", WEREWOLF_DB_PATH: join(temporary, "rooms.sqlite"), WEREWOLF_ORIGIN: base },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => { output = (output + data).slice(-4000); });
  child.stderr.on("data", (data) => { output = (output + data).slice(-4000); });
  return child;
}
async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) {
    const exit = once(child, "exit"); child.kill("SIGTERM");
    await Promise.race([exit, delay(5000, undefined, { ref: false }).then(async () => { child.kill("SIGKILL"); await exit; })]);
  }
}
async function ready(child) {
  let response;
  for (let i = 0; i < 100; i++) {
    assert.equal(child.exitCode, null, "Server exited before readiness");
    try { response = await globalThis.fetch(`${base}/api/health`); }
    catch { await delay(100); continue; }
    if (response.ok) break;
    await delay(100);
  }
  assert.ok(response?.ok, "Server did not become ready");
}
let server = launch();
async function api(path, cookie, input) {
  return globalThis.fetch(`${base}/api/v2/${path}`, {
    method: input === undefined ? "GET" : "POST",
    headers: { cookie: cookie ?? "", ...(input === undefined ? {} : { origin: base, "content-type": "application/json" }) },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}
try {
  await ready(server);
  const homepage = await globalThis.fetch(base);
  assert.equal(homepage.status, 200);
  assert.match(homepage.headers.get("content-type"), /text\/html/);
  assert.match(await homepage.text(), /狼人杀/);
  for (const endpoint of ["/api/health"]) {
    const result = await globalThis.fetch(base + endpoint);
    assert.equal(result.status, 200);
    assert.match(result.headers.get("cache-control"), /no-store/);
    assert.equal(result.headers.get("x-powered-by"), null);
    assert.deepEqual(await result.json(), { status: "ok", rulesVersion: "werewolf-web-v1" });
  }
  assert.equal((await globalThis.fetch(`${base}/api/health`, { method: "POST" })).status, 405);
  assert.equal((await globalThis.fetch(`${base}/api/rooms`)).status, 404);
  assert.equal((await api("rooms/FFFFFFFF")).status, 401);
  const cookies = [];
  for (let i = 0; i < 9; i++) {
    const session = await api("session", undefined, {});
    assert.equal(session.status, 200);
    const cookie = session.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=strict/i);
    cookies.push(cookie.split(";")[0]);
  }
  const config = { version: "werewolf-web-v1", winMode: "edge",
    roles: { werewolf: 2, seer: 1, witch: 1, guard: 1, hunter: 1, villager: 2 } };
  const createBody = { requestId: randomUUID(), name: "Host", config };
  const created = await api("rooms", cookies[0], createBody);
  assert.equal(created.status, 201);
  const receipt = await created.json();
  const roomPath = `rooms/${receipt.roomId}`;
  assert.deepEqual(await (await api("rooms", cookies[0], createBody)).json(), receipt);
  for (let i = 1; i < 7; i++) assert.equal((await api(roomPath + "/join", cookies[i], {
    requestId: randomUUID(), epochId: receipt.epochId, name: `Player ${i + 1}`,
  })).status, 200);
  const finalSeats = await Promise.all([7, 8].map((i) => api(roomPath + "/join", cookies[i], {
    requestId: randomUUID(), epochId: receipt.epochId, name: `Player ${i + 1}`,
  })));
  assert.deepEqual(finalSeats.map((r) => r.status).sort(), [200, 409]);
  const last = finalSeats[0].status === 200 ? 7 : 8;
  const participants = [...cookies.slice(0, 7), cookies[last]];
  let view = await (await api(roomPath, cookies[0])).json();
  assert.equal(view.players.length, 8);
  for (const cookie of participants) assert.equal((await api(roomPath + "/commands", cookie, {
    requestId: randomUUID(), epochId: view.epochId, windowId: view.windowId, operation: { type: "ready", ready: true },
  })).status, 200);
  const startBody = { requestId: randomUUID(), epochId: view.epochId, windowId: view.windowId, operation: { type: "start" } };
  assert.equal((await api(roomPath + "/commands", cookies[0], startBody)).status, 200);
  view = await (await api(roomPath, cookies[0])).json();
  assert.equal(view.phase, "reveal"); assert.ok(view.players.every((p) => p.revealedRole === null));
  assert.equal((await api(roomPath + "/host", cookies[1])).status, 403);
  const personal = await (await api(roomPath + "/private", cookies[0])).json();
  assert.ok(personal.role); assert.ok(!personal.teammates?.some((p) => p.role));
  await stop(server); server = launch(); await ready(server);
  const restored = await (await api(roomPath, cookies[0])).json();
  assert.equal(restored.epochId, view.epochId); assert.equal(restored.phase, "reveal");
  assert.equal((await (await api(roomPath + "/private", cookies[0])).json()).role, personal.role);
  assert.equal((await api(roomPath + "/commands", cookies[0], startBody)).status, 200);
  log(JSON.stringify({ passed: true, healthStatus: 200, unsupportedMethod: 405, legacyGameApi: 404,
    persistentSessions: true, concurrentLastSeat: true, rolesHiddenFromHost: true, serverRestartRecovery: true, duplicateStart: true }));
} catch (cause) {
  error(JSON.stringify({ failed: true, message: cause.message, serverOutput: output }));
  process.exitCode = 1;
} finally {
  await stop(server);
  rmSync(temporary, { recursive: true, force: true });
}

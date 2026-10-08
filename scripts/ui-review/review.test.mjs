import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createReviewServer } from "./server.mjs";
import { scenes, makeFixture, REVIEW_NOW } from "./fixtures.mjs";

const requests = [];
const upstream = http.createServer((request, response) => {
  requests.push({ path: request.url, method: request.method, cookie: request.headers.cookie, authorization: request.headers.authorization });
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": "ww_session=should-not-forward" });
  response.end("<!doctype html><html><head></head><body>Local app</body></html>");
});
let server; let url;
before(async () => {
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  server = createReviewServer({ upstreamUrl: `http://127.0.0.1:${upstream.address().port}` });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { for (const service of [server, upstream]) { service.closeAllConnections(); await new Promise(resolve => service.close(resolve)); } });
const post = (path, data, headers = {}) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data) });

test("fourteen stable scenes use synthetic views, frozen clocks and valid recap role counts", () => {
  assert.equal(scenes.length, 14); assert.equal(new Set(scenes.map(s => s.id)).size, 14);
  for (const scene of scenes) {
    const fixture = makeFixture(scene); assert.equal(fixture.state.serverTime, REVIEW_NOW);
    assert.match(scene.roomId, /^[A-F0-9]{8}$/); assert.equal(fixture.recap.participants.length, 12);
    assert.equal(fixture.recap.participants.filter(p => p.role === "werewolf").length, 4);
    assert.ok(fixture.recap.participants.filter(p => p.role === "villager").every(p => !p.alive));
  }
});
test("all API operations stay local and never set ww_session cookies", async () => {
  const count = requests.length;
  const session = await post("/api/v2/session", {}, { Cookie: "ww_session=real-cookie" });
  assert.equal(session.status, 200); assert.equal(session.headers.get("set-cookie"), null);
  const scene = scenes.find(s => s.kind === "guard");
  const view = await (await fetch(`${url}/api/v2/rooms/${scene.roomId}`)).json();
  assert.equal(view.phase, "night_action");
  const accepted = await post(`/api/v2/rooms/${scene.roomId}/commands`, { requestId: "review-only", operation: { type: "guard", targetId: "p2" } });
  assert.equal(accepted.status, 200);
  assert.equal((await (await fetch(`${url}/api/v2/rooms/${scene.roomId}/private`)).json()).completed, true);
  assert.equal(requests.length, count);
  await post("/__review/reset", { scene: scene.id });
  assert.equal((await (await fetch(`${url}/api/v2/rooms/${scene.roomId}/private`)).json()).completed, false);
});
test("join stays at the invitation form until a simulated enrollment", async () => {
  const scene = scenes.find(s => s.kind === "join");
  assert.equal((await fetch(`${url}/api/v2/rooms/${scene.roomId}`)).status, 401);
  assert.equal((await fetch(`${url}/api/v2/rooms/${scene.roomId}/invitation`)).status, 200);
});
test("page forwarding strips real credentials and upstream cookies", async () => {
  const scene = scenes.find(s => s.kind === "identity");
  const response = await fetch(url + scene.path + `?reviewScene=${scene.id}`, { headers: { Cookie: "ww_session=real-cookie", Authorization: "Bearer private" } });
  assert.equal(response.status, 200); assert.equal(response.headers.get("set-cookie"), null);
  assert.match(await response.text(), /__UI_REVIEW__/);
  assert.equal(requests.at(-1).cookie, undefined); assert.equal(requests.at(-1).authorization, undefined);
});
test("unknown rooms, unknown APIs, non-view writes and external origins cannot reach the app", async () => {
  const count = requests.length;
  for (const path of ["/r/DEADBEEF", "/api/health", "/api/v2/rooms/DEADBEEF", "/_next/../api/v2/admin", "/.env.local"]) assert.equal((await fetch(url + path)).status, 404);
  assert.equal((await post("/__app", {})).status, 404);
  assert.equal((await post("/__review/reset", { scene: "S01" }, { Origin: "https://example.com" })).status, 403);
  assert.equal(requests.length, count);
});
test("external upstreams and credential-bearing URLs are rejected", () => {
  for (const upstreamUrl of ["https://werewolf-web-v2.vercel.app", "http://user:pass@127.0.0.1:3000", "http://example.com"]) assert.throws(() => createReviewServer({ upstreamUrl }), /loopback/);
});

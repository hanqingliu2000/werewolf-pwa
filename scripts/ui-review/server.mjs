import http from "node:http";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import process from "node:process";
import console from "node:console";
import { makeFixture, applyPreviewOperation, REVIEW_NOW, scenes } from "./fixtures.mjs";

const indexHtml = readFileSync(new URL("./index.html", import.meta.url));
const frameScript = readFileSync(new URL("./frame.js", import.meta.url));
const safeJson = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const loopback = (hostname) => ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
function upstreamHeaders(source, upstream) {
  const headers = { ...source, host: upstream.host, "accept-encoding": "identity" };
  for (const key of ["cookie", "authorization", "proxy-authorization", "origin", "referer", "x-forwarded-host", "x-forwarded-for"]) delete headers[key];
  return headers;
}

export function createReviewServer({ upstreamUrl = "http://127.0.0.1:3000", shutdownToken } = {}) {
  const upstream = new URL(upstreamUrl);
  if (upstream.protocol !== "http:" || !loopback(upstream.hostname) || upstream.username || upstream.password) throw new Error("Only a loopback app upstream is allowed");
  const fixtures = new Map(scenes.map(scene => [scene.roomId, makeFixture(scene)]));
  const json = (response, value, status = 200) => { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); };
  const error = (response, code, status = 400) => json(response, { error: { code } }, status);
  async function body(request) {
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 16_384) throw new Error("INPUT_INVALID"); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  }
  function sceneFor(url) {
    return scenes.find(s => s.id === url.searchParams.get("reviewScene")) ?? scenes.find(s => url.pathname.startsWith(`/r/${s.roomId}`))
      ?? scenes.find(s => s.kind === (url.pathname === "/join" ? "join" : "create"));
  }
  const allowedPage = (path) => ["/__app", "/new", "/join"].includes(path) || scenes.some(s => path === `/r/${s.roomId}` || path === `/r/${s.roomId}/recap/${s.gameId}`);
  const allowedAsset = (path) => /^\/(?:_next\/|art\/|fonts\/|audio\/)/.test(path) || path === "/favicon.ico";
  function proxy(request, response, url) {
    const target = new URL(url.pathname === "/__app" ? `/${url.search}` : `${url.pathname}${url.search}`, upstream);
    target.searchParams.delete("reviewScene");
    const remote = http.request(target, { method: "GET", headers: upstreamHeaders(request.headers, upstream) }, received => {
      const headers = { ...received.headers, "cache-control": "no-store" }; delete headers["set-cookie"];
      if (!(headers["content-type"] ?? "").includes("text/html")) { response.writeHead(received.statusCode ?? 502, headers); received.pipe(response); return; }
      const chunks = []; let size = 0;
      received.on("data", chunk => { size += chunk.length; if (size > 4_194_304) { remote.destroy(); response.destroy(); } else chunks.push(chunk); });
      received.on("end", () => {
        const scene = sceneFor(url);
        const injection = `<script>window.__UI_REVIEW__=${safeJson({ id: scene.id, kind: scene.kind, roomId: scene.roomId, key: url.searchParams.get("reviewKey"), panel: scene.panel ?? null, now: REVIEW_NOW })};Date.now=()=>window.__UI_REVIEW__.now;</script><script src="/__review/frame.js"></script>`;
        const html = Buffer.concat(chunks).toString("utf8").replace("</head>", `${injection}</head>`);
        delete headers["content-length"]; delete headers["content-encoding"]; delete headers["transfer-encoding"];
        response.writeHead(received.statusCode ?? 502, headers); response.end(html);
      });
    });
    remote.on("error", () => { if (!response.headersSent) json(response, { error: { code: "LOCAL_APP_UNAVAILABLE" } }, 502); else response.destroy(); });
    remote.end();
  }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1"); const path = url.pathname;
      if (request.method === "POST" && request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) return error(response, "ORIGIN_REJECTED", 403);
      if (path === "/__review/health") return json(response, { service: "werewolf-ui-review", simulated: true, scenes: scenes.length });
      if (path === "/__review/scenes") return json(response, scenes);
      if (path === "/__review/frame.js") { response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" }); return response.end(frameScript); }
      if (path === "/__review/reset" && request.method === "POST") {
        const input = await body(request); const scene = scenes.find(s => s.id === input.scene);
        if (!scene) return error(response, "INPUT_INVALID"); fixtures.set(scene.roomId, makeFixture(scene)); return json(response, { ok: true });
      }
      if (path === "/__review/shutdown" && request.method === "POST") {
        if (!shutdownToken || request.headers["x-ui-review-stop"] !== shutdownToken) return error(response, "FORBIDDEN", 403);
        json(response, { ok: true }); server.close(); server.closeAllConnections(); setTimeout(() => process.exit(0), 100).unref(); return;
      }
      // API calls never reach the app server. In particular, never set or forward ww_session.
      if (path.startsWith("/api/")) {
        if (path === "/api/v2/session" && request.method === "POST") { await body(request); return json(response, { ok: true }); }
        const segments = path.split("/").filter(Boolean);
        if (segments[1] !== "v2" || segments[2] !== "rooms") return error(response, "ENDPOINT_NOT_FOUND", 404);
        if (segments.length === 3 && request.method === "POST") {
          const input = await body(request); const lobbyScene = scenes.find(s => s.kind === "lobby"); const fixture = fixtures.get(lobbyScene.roomId);
          fixture.state.players[0].name = String(input.name ?? namesFallback()).slice(0, 48);
          fixture.state.self.isHost = true;
          if (input.config) { fixture.state.config = input.config; fixture.state.players = fixture.state.players.slice(0, Math.min(6, Object.values(input.config.roles).reduce((a, b) => a + b, 0))); }
          return json(response, { accepted: true, requestId: input.requestId, roomId: lobbyScene.roomId, epochId: fixture.state.epochId, flowId: fixture.state.windowId });
        }
        const fixture = fixtures.get(segments[3]); if (!fixture) return error(response, "ROOM_UNAVAILABLE", 404);
        const suffix = segments[4]; const { state, personal, host, recap } = fixture;
        if (request.method === "GET") {
          if (suffix === "invitation") return json(response, { roomId: state.roomId, epochId: state.epochId, phase: "lobby", config: state.config, occupiedSeats: state.players.map(p => p.seat) });
          if (fixture.scene.kind === "join" && !suffix) return error(response, "INVALID_SESSION", 401);
          if (suffix === "private") return json(response, personal);
          if (suffix === "host") return state.self.isHost ? json(response, host) : error(response, "FORBIDDEN", 403);
          if (suffix === "recaps") return json(response, segments[5] ? recap : { games: [{ gameId: recap.gameId, winner: recap.winner, aborted: false }] });
          if (!suffix) return json(response, state);
        }
        if (request.method === "POST") {
          if (suffix === "heartbeat") { await body(request); return json(response, { ok: true, paused: state.paused }); }
          const input = await body(request);
          if (suffix === "join") {
            const lobbyScene = scenes.find(s => s.kind === "lobby"); const lobby = fixtures.get(lobbyScene.roomId);
            lobby.state.players[0].name = String(input.name ?? namesFallback()).slice(0, 48);
            lobby.state.self.isHost = false;
            return json(response, { accepted: true, requestId: input.requestId, roomId: lobbyScene.roomId, epochId: lobby.state.epochId, flowId: lobby.state.windowId });
          }
          if (suffix === "commands") { applyPreviewOperation(fixture, input.operation); return json(response, { accepted: true, requestId: input.requestId, roomId: state.roomId, epochId: state.epochId, flowId: state.windowId }); }
        }
        return error(response, "ENDPOINT_NOT_FOUND", 404);
      }
      if (request.method !== "GET") return error(response, "ENDPOINT_NOT_FOUND", 404);
      if (path === "/") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); return response.end(indexHtml); }
      if (!allowedPage(path) && !allowedAsset(path)) return error(response, "ENDPOINT_NOT_FOUND", 404);
      proxy(request, response, url);
    } catch { if (!response.headersSent) error(response, "INPUT_INVALID"); else response.destroy(); }
  });
  server.on("upgrade", (request, socket, head) => {
    const targetUrl = new URL(request.url, upstream);
    if (!targetUrl.pathname.startsWith("/_next/") || targetUrl.origin !== upstream.origin || request.method !== "GET") { socket.destroy(); return; }
    const headers = upstreamHeaders(request.headers, upstream); headers.origin = upstream.origin;
    const remote = http.request(targetUrl, { headers });
    remote.on("upgrade", (received, target, targetHead) => {
      let status = "HTTP/1.1 101 Switching Protocols\r\n";
      for (let i = 0; i < received.rawHeaders.length; i += 2) if (received.rawHeaders[i].toLowerCase() !== "set-cookie") status += `${received.rawHeaders[i]}: ${received.rawHeaders[i + 1]}\r\n`;
      socket.write(`${status}\r\n`); if (targetHead.length) socket.write(targetHead); if (head.length) target.write(head);
      target.pipe(socket); socket.pipe(target); target.on("error", () => socket.destroy()); socket.on("error", () => target.destroy());
    });
    remote.on("response", () => socket.destroy()); remote.on("error", () => socket.destroy()); remote.end();
  });
  return server;
}
const namesFallback = () => "评审玩家";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.UI_REVIEW_PORT ?? 3010);
  const server = createReviewServer({ upstreamUrl: process.env.UI_REVIEW_UPSTREAM, shutdownToken: process.env.UI_REVIEW_STOP_TOKEN });
  server.listen(port, "127.0.0.1", () => console.log(`Local UI review ready: http://127.0.0.1:${port}/`));
}

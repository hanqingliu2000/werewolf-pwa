import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createHttpHandler } from "../src/server/http";
import { fixture } from "./server-helpers";
import { config } from "./helpers";

const fixtures: Awaited<Awaited<ReturnType<typeof fixture>>>[] = [];
async function setup() {
  const f = await fixture(1); fixtures.push(f);
  const handler = createHttpHandler(f.service);
  const call = async (path: string, method = "GET", input?: unknown, options: { cookie?: string; origin?: string; contentType?: string; raw?: string; site?: string } = {}) => {
    const headers: Record<string, string> = { cookie: options.cookie ?? `ww_session=${f.tokens[0]}` };
    if (method === "POST") { headers.origin = options.origin ?? "http://localhost"; headers["content-type"] = options.contentType ?? "application/json"; }
    if (options.site) headers["sec-fetch-site"] = options.site;
    return await handler(new Request(`http://localhost/api/v2/${path}`, { method, headers,
      ...(method === "POST" ? { body: options.raw ?? JSON.stringify(input ?? {}) } : {}) }));
  };
  return { ...f, handler, call };
}
afterEach(() => { vi.restoreAllMocks(); while (fixtures.length) fixtures.pop()!.close(); });

describe("HTTP identity and security", () => {
  it("bootstraps a HttpOnly host-only cookie without returning credentials", async () => {
    const f = await setup();
    const result = await f.call("session", "POST", {}, { cookie: "" });
    expect(result.status).toBe(200); expect(await result.json()).toEqual({ ok: true });
    const cookie = result.headers.get("set-cookie")!;
    expect(cookie).toMatch(/ww_session=[A-Za-z0-9_-]{43}/);
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=strict"); expect(cookie).not.toContain("Domain=");
    const again = await f.call("session", "POST");
    expect(again.headers.get("set-cookie")).toContain(`ww_session=${f.tokens[0]}`);
    const replacement = await f.call("session", "POST", {}, { cookie: "ww_session=bad" });
    expect(replacement.headers.get("set-cookie")).not.toContain("ww_session=bad;");
    const secureHandler = createHttpHandler(f.service, "https://game.example");
    const secure = await secureHandler(new Request("https://game.example/api/v2/session", { method: "POST", body: "{}",
      headers: { origin: "https://game.example", "content-type": "application/json" } }));
    expect(secure.headers.get("set-cookie")).toContain("Secure");
  });

  it.each(["https://evil.example", "null", "http://other.localhost"])("rejects mutation origin %s", async (origin) => {
    const f = await setup(); expect((await f.call("session", "POST", {}, { origin })).status).toBe(403);
  });

  it("rejects missing origin, cross-site fetch metadata and unconfigured public hosting", async () => {
    const f = await setup();
    const missing = await f.handler(new Request("http://localhost/api/v2/session", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(missing.status).toBe(403);
    expect((await f.call("session", "POST", {}, { site: "cross-site" })).status).toBe(403);
    expect((await f.call("session", "POST", {}, { site: "same-site" })).status).toBe(403);
    const publicHost = await f.handler(new Request("https://public.example/api/v2/session", { method: "POST", body: "{}", headers: { origin: "https://public.example", "content-type": "application/json" } }));
    expect(publicHost.status).toBe(403);
  });

  it("rejects absent or malformed session cookies", async () => {
    const f = await setup();
    for (const cookie of ["", "ww_session=bad", "another=credential"]) expect((await f.call(`rooms/${f.id}`, "GET", undefined, { cookie })).status).toBe(401);
  });

  it("bounds bodies, requires JSON, and rejects unknown fields", async () => {
    const f = await setup();
    expect((await f.call("session", "POST", {}, { contentType: "text/plain" })).status).toBe(415);
    expect((await f.call("session", "POST", {}, { raw: "{" })).status).toBe(400);
    expect((await f.call("session", "POST", {}, { raw: JSON.stringify({ padding: "a".repeat(16_384) }) })).status).toBe(413);
    expect((await f.call("session", "POST", { playerId: "forged" })).status).toBe(400);
    const empty = await f.handler(new Request("http://localhost/api/v2/session", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" } }));
    expect(empty.status).toBe(400);
  });

  it("uses private no-store responses, even for errors, and never echoes secret errors", async () => {
    const f = await setup();
    const responses = [await f.call(`rooms/${f.id}`), await f.call(`rooms/${f.id}/private`), await f.call(`rooms/${f.id}/host`),
      await f.call("no-such-path"), await f.call("rooms/INVALID")];
    for (const response of responses) {
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("vary")).toBe("Cookie"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
    vi.spyOn(f.service, "view").mockImplementation(() => { throw new Error("private database state token secret"); });
    const failure = await f.call(`rooms/${f.id}`);
    expect(failure.status).toBe(500); expect(await failure.json()).toEqual({ error: { code: "INTERNAL_ERROR" } });
  });

  it("routes room enrollment, commands, heartbeat and protected recaps", async () => {
    const f = await setup();
    const created = await f.call("rooms", "POST", { requestId: randomUUID(), name: "New room", config });
    expect(created.status).toBe(201);
    const receipt = await created.json(); expect(receipt).not.toHaveProperty("sessionToken");
    expect((await f.call(`rooms/${f.id}/join`, "POST", { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Restore" })).status).toBe(200);
    expect((await f.call(`rooms/${f.id}/invitation`)).status).toBe(200);
    expect(await (await f.call(`rooms/${f.id}/recaps`)).json()).toEqual({ games: [] });
    expect((await f.call(`rooms/${f.id}/commands`, "POST", f.envelope({ type: "ready", ready: true }))).status).toBe(200);
    expect((await f.call(`rooms/${f.id}/heartbeat`, "POST", { foreground: true, audioReady: true })).status).toBe(200);
    expect((await f.call(`rooms/${f.id}/recaps/${randomUUID()}`)).status).toBe(403);
    expect((await f.call(`rooms/${f.id}/recaps/invalid`)).status).toBe(400);
    expect((await f.call(`rooms/${f.id}/private/extra`)).status).toBe(404);
    expect((await f.call(`rooms/${f.id}/unknown`, "POST")).status).toBe(404);
    expect((await f.call("rooms")).status).toBe(404);
  });

  it("returns rate limit feedback without credentials or private state", async () => {
    const f = await setup(); vi.spyOn(f.service, "limit").mockImplementation(() => { throw Object.assign(new Error(), { name: "unused" }); });
    expect((await f.call(`rooms/${f.id}`)).status).toBe(500);
    vi.restoreAllMocks();
    for (let i = 0; i < 240; i++) await f.service.limit(`http:${(await import("../src/server/service")).hashSession(f.tokens[0]!)}`, 240);
    const response = await f.call(`rooms/${f.id}`);
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({ error: { code: "RATE_LIMITED" } });
  });
});

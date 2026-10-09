import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestGate, requestGate } from "../src/server/request-gate";
import { GET } from "../src/app/api/health/route";
import { RuleError } from "../src/game/errors";
import * as storage from "../src/server/storage-runtime";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const request = (ip = "203.0.113.1", cookie = "") => new Request("https://game.example/api/v2/session", {
  headers: { "x-vercel-forwarded-for": ip, cookie },
});
describe("database-free request filter", () => {
  it("rejects excessive health probes before opening storage", async () => {
    vi.spyOn(requestGate, "check").mockImplementation(() => { throw new RuleError("RATE_LIMITED"); });
    const opened = vi.spyOn(storage, "openStorage");
    const response = await GET(request());
    expect(response.status).toBe(429); expect(opened).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("allows twelve shared-Wi-Fi players with polling, private views, host controls and heartbeats", () => {
    vi.stubEnv("VERCEL", "1"); const gate = new RequestGate(() => 1000);
    for (let i = 0; i < 1800; i++) expect(() => gate.check(request("203.0.113.1", `player=${i % 12}`))).not.toThrow();
  });
  it("does not let cookie rotation bypass the wide request budget and resets after one minute", () => {
    vi.stubEnv("VERCEL", "1"); let time = 1000; const gate = new RequestGate(() => time);
    for (let i = 0; i < 2400; i++) gate.check(request("203.0.113.2", `rotated=${i}`));
    expect(() => gate.check(request("203.0.113.2", "rotated=again"))).toThrow("RATE_LIMITED");
    expect(() => gate.check(request("203.0.113.3"))).not.toThrow();
    time += 60_000; expect(() => gate.check(request("203.0.113.2"))).not.toThrow();
  });
  it("ignores untrusted forwarded headers and keeps health checks on a separate budget", () => {
    vi.stubEnv("VERCEL", "1"); const gate = new RequestGate(() => 1000);
    for (let i = 0; i < 60; i++) gate.check(new Request("https://game.example/api/health", { headers: { "x-forwarded-for": `spoof-${i}` } }), "health");
    expect(() => gate.check(request("invalid"), "health")).toThrow("RATE_LIMITED");
    expect(() => gate.check(request("invalid"), "api")).not.toThrow();
  });
  it("bounds memory without evicting active budgets and permits reuse after expiration", () => {
    vi.stubEnv("VERCEL", "1"); let time = 0; const gate = new RequestGate(() => time);
    for (let i = 1; i <= 2048; i++) gate.check(request(`2001:db8::${i.toString(16)}`));
    expect(() => gate.check(request("2001:db8::ffff"))).toThrow("RATE_LIMITED");
    expect(() => gate.check(request("2001:db8::1"))).not.toThrow();
    time = 60_000; expect(() => gate.check(request("2001:db8::ffff"))).not.toThrow();
  });
  it("does not impose platform IP limits on local development or tests", () => {
    vi.stubEnv("VERCEL", "0"); const gate = new RequestGate(() => 0);
    for (let i = 0; i < 2500; i++) gate.check(request(), "health");
  });
});

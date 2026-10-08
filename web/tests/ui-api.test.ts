import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });
it("initializes once and never places a credential in JavaScript request bodies", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true })); vi.stubGlobal("fetch", fetch);
  const api = await import("../src/ui/api"); await Promise.all([api.initialize(), api.initialize()]);
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0]![0]).toBe("/api/v2/session");
  expect(fetch.mock.calls[0]![1]).toMatchObject({ credentials: "same-origin", cache: "no-store", body: "{}" });
});
it("allows retry of initialization after a network failure", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError()).mockResolvedValue(Response.json({ ok: true })); vi.stubGlobal("fetch", fetch);
  const api = await import("../src/ui/api"); await expect(api.initialize()).rejects.toMatchObject({ code: "NETWORK_UNKNOWN" }); await api.initialize(); expect(fetch).toHaveBeenCalledTimes(2);
});
it("treats a non-JSON response as an unknown result, not a successful action", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 502 })));
  const api = await import("../src/ui/api"); await expect(api.request("rooms/R/commands", {})).rejects.toMatchObject({ code: "NETWORK_UNKNOWN" });
});
it("keeps a server denial actionable without exposing raw response content", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "STALE_WINDOW" }, secret: "not rendered" }, { status: 409 })));
  const api = await import("../src/ui/api"); await expect(api.request("rooms/R/commands", {})).rejects.toMatchObject({ code: "STALE_WINDOW" });
  expect(api.errorText(new api.ApiError("STALE_WINDOW"))).toBe("当前阶段已更新，请重新确认");
});
it("supports private reads without sending an actor id or target", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ role: "seer" })); vi.stubGlobal("fetch", fetch);
  const api = await import("../src/ui/api"); await api.request("rooms/R/private"); expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "GET", credentials: "same-origin" }); expect(fetch.mock.calls[0]![1]).not.toHaveProperty("body");
});
it("forwards cancellation for reads without changing ordinary command requests", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true }))); vi.stubGlobal("fetch", fetch);
  const api = await import("../src/ui/api"); const controller = new AbortController();
  await api.request("rooms/R", undefined, controller.signal);
  expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "GET", signal: controller.signal });
  await api.request("rooms/R/commands", { requestId: "preserved" });
  expect(fetch.mock.calls[1]![1]).not.toHaveProperty("signal");
  expect(fetch.mock.calls[1]![1]).toMatchObject({ method: "POST", body: JSON.stringify({ requestId: "preserved" }) });
});
it("uses a neutral fallback for unexpected errors", async () => {
  const api = await import("../src/ui/api"); expect(api.errorText(new Error("raw private state"))).toBe("操作未完成，请重试"); expect(api.errorText(new api.ApiError("UNKNOWN"))).toBe("当前状态不允许这项操作");
});

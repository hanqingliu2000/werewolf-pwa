import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { fixture } from "./server-helpers";
import { config } from "./helpers";
import { RoomService, mintSession, RETENTION_MS } from "../src/server/service";
import { createHttpHandler } from "../src/server/http";

afterEach(() => vi.unstubAllEnvs());

it("stops new enrollment across service instances but preserves retries, joins, readiness and host heartbeats", async () => {
  const f = await fixture(1);
  try {
    const second = new RoomService(f.store, () => f.time.now);
    const token = mintSession(); const input = { requestId: randomUUID(), name: "Host", config };
    const accepted = await second.create(token, input);
    for (let i = 0; i < 4; i++) await second.create(mintSession(), { ...input, requestId: randomUUID() });
    await expect(f.service.create(mintSession(), { ...input, requestId: randomUUID() })).rejects.toThrow("ENROLLMENT_UNAVAILABLE");
    expect(await f.service.create(token, input)).toEqual(accepted);
    await f.service.join(f.id, mintSession(), { requestId: randomUUID(), name: "Guest", epochId: f.state().lobbyId });
    await f.act({ type: "ready", ready: true });
    await f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    expect((await second.view(f.id, f.tokens[0]!)).players).toHaveLength(2);
    f.time.now += 3_600_000;
    await expect(second.create(mintSession(), { ...input, requestId: randomUUID() })).resolves.toHaveProperty("roomId");
  } finally { f.close(); }
});

it.each([["day", 20, RETENTION_MS], ["month", 100, 30 * RETENTION_MS]] as const)("enforces the %s budget independently", async (period, cap, duration) => {
  const f = await fixture(1);
  try {
    for (let i = 1; i < cap; i++) await f.store.rate(`enrollment:${period}`, f.time.now, cap, duration);
    await expect(f.service.create(mintSession(), { requestId: randomUUID(), name: "Host", config })).rejects.toThrow("ENROLLMENT_UNAVAILABLE");
    f.time.now += duration;
    await expect(f.service.create(mintSession(), { requestId: randomUUID(), name: "Host", config })).resolves.toHaveProperty("roomId");
  } finally { f.close(); }
});

it("returns a safe unavailable response when new rooms are disabled, without blocking existing rooms", async () => {
  const f = await fixture(1);
  try {
    vi.stubEnv("WEREWOLF_ENROLLMENT_CLOSED", "1");
    const handle = createHttpHandler(f.service, "https://game.example");
    const response = await handle(new Request("https://game.example/api/v2/rooms", { method: "POST", headers: {
      origin: "https://game.example", "content-type": "application/json", cookie: `ww_session=${f.tokens[0]}`,
    }, body: JSON.stringify({ requestId: randomUUID(), name: "Host", config }) }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ error: { code: "ENROLLMENT_UNAVAILABLE" } });
    await expect(f.service.view(f.id, f.tokens[0]!)).resolves.toHaveProperty("roomId", f.id);
  } finally { f.close(); }
});

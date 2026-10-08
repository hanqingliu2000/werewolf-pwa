import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fake = vi.hoisted(() => ({ unavailable: false, pools: 0 }));
vi.mock("pg", () => ({ Pool: class {
  constructor() { fake.pools++; }
  on() { return this; }
  async query() { if (fake.unavailable) throw new Error("private database credential and snapshot"); return { rows: [], rowCount: 0 }; }
} }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); fake.unavailable = false; fake.pools = 0; });

const environment = () => ({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "preview.example.vercel.app",
  WEREWOLF_STORAGE: "postgres", WEREWOLF_SCHEMA: "werewolf_preview",
  WEREWOLF_DATABASE_URL: "postgresql://werewolf_preview_app.project:placeholder@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
  WEREWOLF_DATABASE_CA: "certificate\\nlines", WEREWOLF_ORIGIN: "https://game.example" });

it("keeps SQLite local and fails closed on incomplete or mismatched cloud configuration", async () => {
  const { storageSettings } = await import("../src/server/storage-runtime");
  expect(storageSettings({}).kind).toBe("sqlite");
  expect(storageSettings({ WEREWOLF_STORAGE: "sqlite", WEREWOLF_DB_PATH: "/tmp/room.sqlite" })).toEqual({ kind: "sqlite", path: "/tmp/room.sqlite" });
  for (const settings of [{ VERCEL: "1" }, { WEREWOLF_STORAGE: "memory" }, { ...environment(), WEREWOLF_SCHEMA: "public" },
    { ...environment(), VERCEL_ENV: "production" }, { ...environment(), WEREWOLF_DATABASE_URL: "" }, { ...environment(), WEREWOLF_DATABASE_CA: "" }]) expect(() => storageSettings(settings)).toThrow();
  const cloud = storageSettings(environment()); expect(cloud.kind).toBe("postgres");
  if (cloud.kind === "postgres") { expect(cloud.pool.max).toBe(1); expect(cloud.pool.ssl).toEqual({ ca: "certificate\nlines", rejectUnauthorized: true }); }
  expect(storageSettings({ ...environment(), VERCEL_ENV: "production", WEREWOLF_SCHEMA: "werewolf_prod", WEREWOLF_DATABASE_URL: environment().WEREWOLF_DATABASE_URL.replace("preview", "prod") }).kind).toBe("postgres");
});

it.each(["https://user:password@example.com:6543/postgres", "postgresql://user:password@example.com:6543/postgres",
  "postgresql://werewolf_preview_app.project@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
  "postgresql://werewolf_preview_app.project:placeholder@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
  `${environment().WEREWOLF_DATABASE_URL}?sslmode=disable`])("rejects unsafe or privileged connection configuration %s", async (url) => {
  const { storageSettings } = await import("../src/server/storage-runtime"); expect(() => storageSettings({ ...environment(), WEREWOLF_DATABASE_URL: url })).toThrow("STORAGE_CONNECTION_INVALID");
});

it("uses only configured or platform deployment origins, never arbitrary request origins", async () => {
  const { allowedOrigins } = await import("../src/server/storage-runtime");
  expect(allowedOrigins({})).toBeUndefined(); expect(allowedOrigins(environment())).toEqual(["https://game.example", "https://preview.example.vercel.app"]);
  expect(() => allowedOrigins({ VERCEL: "1" })).toThrow("ORIGIN_NOT_CONFIGURED");
  expect(() => allowedOrigins({ WEREWOLF_ORIGIN: "https://game.example/path" })).toThrow("ORIGIN_NOT_CONFIGURED");
  expect(() => allowedOrigins({ ...environment(), WEREWOLF_ORIGIN: "http://game.example" })).toThrow("ORIGIN_NOT_CONFIGURED");
});

it("shares one pg pool per warm instance, probes all tables and detects changed configuration", async () => {
  const { openStorage } = await import("../src/server/storage-runtime");
  const first = openStorage(environment()), second = openStorage(environment()); expect(first.store).toBe(second.store); expect(fake.pools).toBe(1);
  await first.ready(); first.close();
  expect(() => openStorage({ ...environment(), WEREWOLF_DATABASE_CA: "changed" })).toThrow("STORAGE_CONFIGURATION_CHANGED");
  fake.unavailable = true; await expect(first.ready()).rejects.toThrow();
});

it("checks the actual local store and closes its connection", async () => {
  const { openStorage } = await import("../src/server/storage-runtime"); const directory = mkdtempSync(join(tmpdir(), "ww-ready-"));
  const storage = openStorage({ WEREWOLF_DB_PATH: join(directory, "ready.sqlite") });
  try { await storage.ready(); expect(await storage.store.load("00000000")).toBeNull(); } finally { storage.close(); rmSync(directory, { recursive: true, force: true }); }
});

it("health returns 503 rather than reporting a missing or failed database as healthy", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { GET } = await import("../src/app/api/health/route");
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("WEREWOLF_STORAGE", "sqlite");
  expect((await GET()).status).toBe(503);
  for (const [key, value] of Object.entries(environment())) vi.stubEnv(key, value);
  expect((await GET()).status).toBe(200); fake.unavailable = true;
  const response = await GET(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ status: "unavailable" });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("credential");
});

it("maintenance closes API enrollment and readiness without touching storage", async () => {
  vi.stubEnv("WEREWOLF_MAINTENANCE", "1"); vi.stubEnv("VERCEL", "1");
  const { GET: health } = await import("../src/app/api/health/route"); const { POST } = await import("../src/app/api/v2/[...path]/route");
  expect(await (await health()).json()).toEqual({ status: "maintenance" });
  const response = await POST(new Request("https://game.example/api/v2/session", { method: "POST" }));
  expect(response.status).toBe(503); expect(fake.pools).toBe(0);
});

it("route storage failures return generic uncached errors with no configuration details", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined); vi.stubEnv("VERCEL", "1"); vi.stubEnv("WEREWOLF_STORAGE", "sqlite");
  const { GET } = await import("../src/app/api/v2/[...path]/route");
  const response = await GET(new Request("https://game.example/api/v2/rooms/ABCDEF12"));
  expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR" } });
  expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("Vary")).toBe("Cookie");
});

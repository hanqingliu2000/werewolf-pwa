import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PostgresRoomStore, cloudSchema } from "../src/server/postgres-store";
import { RoomService, mintSession, RETENTION_MS } from "../src/server/service";
import { fixture } from "./server-helpers";
import { config, fixedRandom } from "./helpers";
import type { Receipt, RoomStore } from "../src/server/types";
import { createGame, executeCommand } from "../src/game/engine";

let db: PGlite, server: PGLiteSocketServer, pool: Pool, secondPool: Pool;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE authenticator;");
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261008013215_cloud_room_store.sql", import.meta.url), "utf8"));
  server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 10 }); await server.start();
  const [host, port] = server.getServerConn().split(":");
  const settings = { host, port: Number(port), user: "postgres", database: "postgres", max: 1, connectionTimeoutMillis: 5000 };
  pool = new Pool(settings); secondPool = new Pool(settings);
}, 30_000);
afterAll(async () => { await pool?.end(); await secondPool?.end(); await server?.stop(); await db?.close(); });

async function backend(kind: "sqlite" | "postgres") {
  if (kind === "sqlite") {
    const f = await fixture(1);
    return { store: f.store as RoomStore, service: f.service, token: f.tokens[0]!, id: f.id, time: f.time, close: f.close };
  }
  const store = new PostgresRoomStore(pool, "werewolf_preview"); const time = { now: Date.now() };
  const service = new RoomService(store, () => time.now, fixedRandom); const token = mintSession();
  const created = await service.create(token, { requestId: randomUUID(), name: "Host", config });
  return { store: store as RoomStore, service, token, id: created.roomId, time, close: () => undefined };
}

describe.each(["sqlite", "postgres"] as const)("%s storage contract", (kind) => {
  it("commits snapshots and receipts together, rejects stale versions and rolls back broken receipts", async () => {
    const f = await backend(kind);
    try {
      const record = (await f.store.load(f.id))!;
      const receipt: Receipt = { key: randomUUID(), fingerprint: "f", result: { accepted: true, requestId: randomUUID(), roomId: f.id, epochId: record.room.lobbyId, flowId: record.room.flowId } };
      record.room.members[0]!.name = "Changed";
      expect(await f.store.compareAndSwap(record.room, record.version, receipt)).toBe(true);
      expect(await f.store.compareAndSwap(record.room, record.version)).toBe(false);
      expect(await f.store.compareAndSwap(record.room, record.version + 1, receipt)).toBe(false);
      expect(await f.store.receipt(receipt.key)).toEqual(receipt);
      const before = (await f.store.load(f.id))!; const changed = structuredClone(before.room); changed.members[0]!.name = "Unsaved";
      const bad = { ...receipt, key: randomUUID(), extra: 1n } as Receipt;
      await expect(Promise.resolve().then(() => f.store.compareAndSwap(changed, before.version, bad))).rejects.toThrow();
      expect(await f.store.load(f.id)).toEqual(before);
      const copy = { ...changed, id: "ABCDEF99" }; const duplicate = { ...receipt, result: { ...receipt.result, roomId: copy.id } };
      expect(await f.store.insert(copy, duplicate)).toBe(false);
      expect(await f.store.load(copy.id)).toBeNull();
    } finally { f.close(); }
  });

  it("deduplicates requests across services and denies foreign sessions and non-host mutations", async () => {
    const f = await backend(kind);
    try {
      const second = new RoomService(f.store, () => f.time.now, fixedRandom); const guest = mintSession();
      const current = await f.service.view(f.id, f.token);
      const input = { requestId: randomUUID(), epochId: current.epochId, name: "Guest" };
      const accepted = await f.service.join(f.id, guest, input);
      expect(await second.join(f.id, guest, input)).toEqual(accepted);
      await expect(second.join(f.id, guest, { ...input, name: "Changed" })).rejects.toThrow("REQUEST_ID_REUSED");
      await expect(second.view(f.id, mintSession())).rejects.toThrow("INVALID_SESSION");
      await expect(second.mutate(f.id, guest, { requestId: randomUUID(), epochId: current.epochId, windowId: current.windowId, operation: { type: "configure", config } })).rejects.toThrow("FORBIDDEN");
      expect((await second.view(f.id, f.token)).players).toHaveLength(2);
      expect(JSON.stringify(await f.store.load(f.id))).not.toContain(f.token);
    } finally { f.close(); }
  });

  it("expires rooms and receipts, persists rate counts and resets at the minute boundary", async () => {
    const f = await backend(kind);
    try {
      const key = randomUUID(); expect(await f.store.rate(key, f.time.now, 1)).toBe(true);
      expect(await f.store.rate(key, f.time.now + 1, 1)).toBe(false);
      expect(await f.store.rate(key, f.time.now + 60_000, 1)).toBe(true);
      f.time.now += RETENTION_MS;
      await expect(f.service.view(f.id, f.token)).rejects.toThrow("ROOM_UNAVAILABLE");
      expect(await f.store.load(f.id)).toBeNull();
    } finally { f.close(); }
  });
});

it("uses independent pg pools without accepting two occupants for the last seat", async () => {
  const f = await backend("postgres");
  const other = new RoomService(new PostgresRoomStore(secondPool, "werewolf_preview"), () => f.time.now, fixedRandom);
  const { epochId } = await f.service.view(f.id, f.token);
  for (let i = 0; i < 6; i++) await f.service.join(f.id, mintSession(), { requestId: randomUUID(), epochId, name: `Guest${i}` });
  const results = await Promise.allSettled([f.service.join(f.id, mintSession(), { requestId: randomUUID(), epochId, name: "LastA" }), other.join(f.id, mintSession(), { requestId: randomUUID(), epochId, name: "LastB" })]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  expect((await other.view(f.id, f.token)).players).toHaveLength(8);
});

it("merges simultaneous wolf confirmations from two pg-backed service instances", async () => {
  const f = await backend("postgres"); const tokens = [f.token, ...Array.from({ length: 7 }, mintSession)];
  const { epochId } = await f.service.view(f.id, f.token);
  for (let i = 1; i < 8; i++) await f.service.join(f.id, tokens[i]!, { requestId: randomUUID(), epochId, name: `WolfFixture${i}` });
  const record = (await f.store.load(f.id))!; const room = record.room;
  let game = createGame(config, room.members.map(({ id, seat, name }) => ({ id, seat, name })), room.hostId, randomUUID(), f.time.now);
  const command = (input: Parameters<typeof executeCommand>[1], now = game.updatedAt + 1) => { game = executeCommand(game, input, now, fixedRandom); };
  command({ type: "deal", actorId: room.hostId });
  for (const p of game.players) command({ type: "acknowledge", actorId: p.id });
  command({ type: "begin_night", actorId: room.hostId }); command({ type: "open_window", actorId: room.hostId });
  command({ type: "guard", actorId: game.players.find(p => p.role === "guard")!.id, targetId: null });
  command({ type: "close_window", actorId: room.hostId }, game.window!.deadline);
  command({ type: "finish_role", actorId: room.hostId }); command({ type: "open_window", actorId: room.hostId });
  room.game = game; f.time.now = game.updatedAt; room.heartbeatAt = f.time.now;
  expect(await f.store.compareAndSwap(room, record.version)).toBe(true);
  const other = new RoomService(new PostgresRoomStore(secondPool, "werewolf_preview"), () => f.time.now, fixedRandom);
  const wolves = game.players.filter(p => p.role === "werewolf").map(p => tokens[room.members.findIndex(m => m.id === p.id)]!);
  async function action(service: RoomService, token: string, operation: unknown) {
    const current = await service.view(f.id, token);
    return service.mutate(f.id, token, { requestId: randomUUID(), epochId: current.epochId, windowId: current.windowId, operation });
  }
  for (const token of wolves) await action(f.service, token, { type: "wolf_propose", targetId: null });
  const consensusId = (await f.store.load(f.id))!.room.consensusId;
  await Promise.all(wolves.map((token, index) => action(index === 0 ? f.service : other, token, { type: "wolf_confirm", consensusId })));
  const night = (await f.store.load(f.id))!.room.game!.currentNight!;
  expect(night.killLocked).toBe(true); expect(night.wolfConfirmations).toHaveLength(wolves.length); expect(night.killTargetId).toBeNull();
});

it("isolates schemas, validates readiness, and rejects unavailable tables or unsupported state", async () => {
  const f = await backend("postgres"); const preview = new PostgresRoomStore(pool, "werewolf_preview"); const prod = new PostgresRoomStore(pool, "werewolf_prod");
  await preview.ready(); await prod.ready();
  expect(await prod.load(f.id)).toBeNull(); expect(await prod.receipt("missing")).toBeNull();
  expect(() => cloudSchema("public; DROP SCHEMA public")).toThrow("STORAGE_SCHEMA_INVALID");
  await pool.query("ALTER TABLE werewolf_prod.rooms RENAME TO hidden_rooms");
  try { await expect(prod.ready()).rejects.toThrow(); } finally { await pool.query("ALTER TABLE werewolf_prod.hidden_rooms RENAME TO rooms"); }
  const broken = { query: async () => ({ rows: [{ version: "1", state: { schemaVersion: 999 } }] }) } as unknown as Pool;
  await expect(new PostgresRoomStore(broken, "werewolf_preview").load(f.id)).rejects.toThrow("STORAGE_VERSION_UNSUPPORTED");
});

it("enables RLS and denies anonymous, authenticated and opposite-environment access", async () => {
  const policies = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relnamespace IN ('werewolf_prod'::regnamespace, 'werewolf_preview'::regnamespace) AND relkind = 'r'");
  expect(policies.rows).toHaveLength(6); expect(policies.rows.every(r => r.relrowsecurity)).toBe(true);
  for (const role of ["anon", "authenticated", "service_role", "authenticator", "werewolf_preview_app"]) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await expect(db.query("SELECT * FROM werewolf_prod.rooms")).rejects.toThrow("permission denied");
      if (role === "werewolf_preview_app") expect(await db.query("SELECT count(*) FROM werewolf_preview.rooms")).toBeDefined();
      else await expect(db.query("SELECT * FROM werewolf_preview.rooms")).rejects.toThrow("permission denied");
    } finally { await db.exec("RESET ROLE"); }
  }
});

it("prunes expired embedded archives and increments CAS version without extending room retention", async () => {
  const f = await backend("postgres"); const record = (await f.store.load(f.id))!;
  record.room.archives = [{ game: {} as never, members: [], expiresAt: f.time.now - 1 }];
  await f.store.compareAndSwap(record.room, record.version);
  const before = (await f.store.load(f.id))!;
  const store = new PostgresRoomStore(pool, "werewolf_preview"); await Promise.all([store.cleanup(f.time.now), store.cleanup(f.time.now)]);
  const after = (await store.load(f.id))!;
  expect(after.room.archives).toEqual([]); expect(after.room.expiresAt).toBe(before.room.expiresAt); expect(after.version).toBe(before.version + 1);
});

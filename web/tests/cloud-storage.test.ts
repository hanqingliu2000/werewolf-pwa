import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { DatabaseSync } from "node:sqlite";
import { PostgresRoomStore, cloudSchema } from "../src/server/postgres-store";
import { SqliteRoomStore } from "../src/server/store";
import { RoomService, mintSession, RETENTION_MS } from "../src/server/service";
import { fixture } from "./server-helpers";
import { config, fixedRandom } from "./helpers";
import type { Receipt, RoomStore } from "../src/server/types";
import { createGame, executeCommand } from "../src/game/engine";
import { changedUsage, USAGE_RETENTION_MS, usageSnapshot } from "../src/server/usage";

let db: PGlite, server: PGLiteSocketServer, pool: Pool, secondPool: Pool;
const live = !!process.env.LIVE_POSTGRES_CREDENTIALS;
const createdRooms: string[] = [];
beforeEach(async () => {
  // Isolate local contract cases; never erase a deployed environment's usage budgets.
  if (!live) await pool.query("DELETE FROM werewolf_preview.limits WHERE key LIKE 'enrollment:%'");
});
beforeAll(async () => {
  if (live) {
    const credentials = JSON.parse(readFileSync(process.env.LIVE_POSTGRES_CREDENTIALS!, "utf8"));
    const url = new URL("postgresql://aws-0-us-east-1.pooler.supabase.com:6543/postgres");
    url.username = "werewolf_preview_app.knkrwuquthqblnkoxdtn"; url.password = credentials.preview_password;
    const settings = { connectionString: url.toString(), max: 1, ssl: { ca: readFileSync(process.env.LIVE_POSTGRES_CA!, "utf8"), rejectUnauthorized: true }, connectionTimeoutMillis: 5000 };
    pool = new Pool(settings); secondPool = new Pool(settings);
    expect((await pool.query("SELECT current_user AS role")).rows[0].role).toBe("werewolf_preview_app");
    return;
  }
  db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE authenticator;");
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261008013215_cloud_room_store.sql", import.meta.url), "utf8"));
  await db.exec("CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;");
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261014025022_usage_summaries.sql", import.meta.url), "utf8"));
  server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 10 }); await server.start();
  const [host, port] = server.getServerConn().split(":");
  const settings = { host, port: Number(port), user: "postgres", database: "postgres", max: 1, connectionTimeoutMillis: 5000 };
  pool = new Pool(settings); secondPool = new Pool(settings);
}, 30_000);
afterAll(async () => {
  if (live && pool && createdRooms.length) {
    await pool.query(`DELETE FROM werewolf_preview.room_usage WHERE id IN
      (SELECT (state->'usage'->>'id')::uuid FROM werewolf_preview.rooms WHERE id = ANY($1::text[]))`, [createdRooms]);
    await pool.query("DELETE FROM werewolf_preview.rooms WHERE id = ANY($1::text[])", [createdRooms]);
  }
  await pool?.end(); await secondPool?.end(); await server?.stop(); await db?.close();
});

async function backend(kind: "sqlite" | "postgres") {
  if (kind === "sqlite") {
    const f = await fixture(1);
    return { store: f.store as RoomStore, service: f.service, token: f.tokens[0]!, id: f.id, time: f.time, path: f.path, close: f.close };
  }
  const store = new PostgresRoomStore(pool, "werewolf_preview"); const time = { now: Date.now() };
  const service = new RoomService(store, () => time.now, fixedRandom); const token = mintSession();
  const created = await service.create(token, { requestId: randomUUID(), name: "Host", config });
  if (live) createdRooms.push(created.roomId);
  return { store: store as RoomStore, service, token, id: created.roomId, time, path: undefined, close: () => undefined };
}

describe.each(["sqlite", "postgres"] as const)("%s storage contract", (kind) => {
  async function statistics(f: Awaited<ReturnType<typeof backend>>) {
    const id = (await f.store.load(f.id))!.room.usage!.id;
    if (kind === "postgres") return {
      rooms: (await pool.query("SELECT * FROM werewolf_preview.room_usage WHERE id = $1", [id])).rows,
      games: (await pool.query("SELECT * FROM werewolf_preview.game_usage WHERE room_usage_id = $1 ORDER BY first_seen_at, id", [id])).rows,
    };
    const local = new DatabaseSync(f.path!, { readOnly: true });
    try { return { rooms: local.prepare("SELECT * FROM room_usage WHERE id = ?").all(id),
      games: local.prepare("SELECT * FROM game_usage WHERE room_usage_id = ? ORDER BY first_seen_at, id").all(id) }; }
    finally { local.close(); }
  }

  it.skipIf(live)("records actual games once, survives restarts and detail expiry, and retains no personal fields", async () => {
    const f = await backend(kind);
    try {
      const tokens = [f.token, ...Array.from({ length: 7 }, mintSession)];
      const before = (await f.store.load(f.id))!.room;
      for (let i = 1; i < 8; i++) await f.service.join(f.id, tokens[i]!, { requestId: randomUUID(), epochId: before.lobbyId, name: `PrivateGuest${i}` });
      const act = async (operation: unknown, token = f.token) => {
        const view = await f.service.view(f.id, token);
        return f.service.mutate(f.id, token, { requestId: randomUUID(), epochId: view.epochId, windowId: view.windowId, operation });
      };
      for (const token of tokens) await act({ type: "ready", ready: true }, token);
      await act({ type: "start" });
      const heartbeatBefore = (await f.store.load(f.id))!.room;
      await f.service.heartbeat(f.id, f.token, { foreground: true, audioReady: true });
      expect(changedUsage((await f.store.load(f.id))!.room, heartbeatBefore)).toBeUndefined();
      f.time.now += 1000;
      const view = await f.service.view(f.id, f.token);
      const input = { requestId: randomUUID(), epochId: view.epochId, windowId: view.windowId, operation: { type: "abort" } };
      const receipt = await f.service.mutate(f.id, f.token, input);
      expect(await new RoomService(f.store, () => f.time.now).mutate(f.id, f.token, input)).toEqual(receipt);
      await act({ type: "restart" });
      for (const token of tokens) await act({ type: "ready", ready: true }, token);
      await act({ type: "start" });
      const snapshot = await statistics(f);
      expect(snapshot.rooms).toHaveLength(1); expect(Number(snapshot.rooms[0]!.peak_players)).toBe(8);
      expect(snapshot.rooms[0]!.room_name).toBe(`房间 ${f.id}`);
      expect(snapshot.games).toHaveLength(2);
      expect(snapshot.games.map(g => g.status).sort()).toEqual(["aborted", "active"]);
      const serialized = JSON.stringify(snapshot);
      for (const secret of [...tokens, "PrivateGuest", "sessionHash", "targetId", "werewolf", "witch", "hostId"]) expect(serialized).not.toContain(secret);
      f.time.now = (await f.store.load(f.id))!.room.expiresAt;
      await f.store.cleanup(f.time.now);
      expect(await f.store.load(f.id)).toBeNull();
      if (kind === "postgres") expect((await pool.query("SELECT status FROM werewolf_preview.game_usage WHERE room_usage_id = $1", [before.usage!.id])).rows.map(g => g.status).sort()).toEqual(["aborted", "expired"]);
      else {
        const local = new DatabaseSync(f.path!, { readOnly: true });
        try { expect(local.prepare("SELECT status FROM game_usage").all().map(g => g.status).sort()).toEqual(["aborted", "expired"]); } finally { local.close(); }
      }
      f.time.now += USAGE_RETENTION_MS;
      await f.store.cleanup(f.time.now);
      if (kind === "postgres") expect((await pool.query("SELECT id FROM werewolf_preview.room_usage WHERE id = $1", [before.usage!.id])).rows).toHaveLength(0);
      else {
        const local = new DatabaseSync(f.path!, { readOnly: true });
        try { expect(local.prepare("SELECT id FROM room_usage").all()).toHaveLength(0); expect(local.prepare("SELECT id FROM game_usage").all()).toHaveLength(0); } finally { local.close(); }
      }
    } finally { f.close(); }
  });

  it("rolls back snapshot, receipt and usage together on a failed summary write", async () => {
    const f = await backend(kind);
    try {
      const before = (await f.store.load(f.id))!; const snapshot = usageSnapshot(before.room); snapshot.room.players = 99;
      const receipt: Receipt = { key: randomUUID(), fingerprint: "f", result: { accepted: true, requestId: randomUUID(), roomId: f.id, epochId: before.room.lobbyId, flowId: before.room.flowId } };
      const changed = structuredClone(before.room); changed.members[0]!.name = "Unsaved";
      await expect(Promise.resolve().then(() => f.store.compareAndSwap(changed, before.version, receipt, snapshot))).rejects.toThrow();
      expect(await f.store.load(f.id)).toEqual(before); expect(await f.store.receipt(receipt.key)).toBeNull();
      expect(Number((await statistics(f)).rooms[0]!.player_count)).toBe(1);
      expect(await f.store.compareAndSwap(changed, before.version - 1, receipt, snapshot)).toBe(false);
    } finally { f.close(); }
  });
  it("shares atomic long-window budgets across stores and rejects until exact expiry", async () => {
    const f = await backend(kind);
    const other = kind === "postgres" ? new PostgresRoomStore(secondPool, "werewolf_preview") : new SqliteRoomStore(f.path!);
    try {
      const key = `budget-test:${randomUUID()}`;
      const stores = [f.store, other];
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => stores[i % 2]!.rate(key, f.time.now, 6, RETENTION_MS)));
      expect(results.filter(Boolean)).toHaveLength(6);
      expect(await f.store.rate(key, f.time.now + RETENTION_MS - 1, 6, RETENTION_MS)).toBe(false);
      expect(await f.store.rate(key, f.time.now + RETENTION_MS, 6, RETENTION_MS)).toBe(true);
    } finally { if (kind === "sqlite") (other as import("../src/server/store").SqliteRoomStore).close(); f.close(); }
  });
  it("stores SQL-looking nicknames literally and never interpolates lookup keys", async () => {
    const f = await backend(kind);
    try {
      const record = (await f.store.load(f.id))!;
      const name = "O'Brien'); DROP TABLE rooms;--";
      record.room.members[0]!.name = name;
      expect(await f.store.compareAndSwap(record.room, record.version)).toBe(true);
      expect((await f.store.load(f.id))!.room.members[0]!.name).toBe(name);
      expect(await f.store.load("' OR '1'='1")).toBeNull();
      expect(await f.store.receipt("' OR '1'='1")).toBeNull();
      expect((await f.service.view(f.id, f.token)).roomId).toBe(f.id);
      expect(() => cloudSchema("werewolf_prod; DROP SCHEMA public CASCADE;--")).toThrow("STORAGE_SCHEMA_INVALID");
    } finally { f.close(); }
  });
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
      const copy = { ...changed, id: randomBytes(4).toString("hex").toUpperCase() }; const duplicate = { ...receipt, result: { ...receipt.result, roomId: copy.id } };
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

  it.skipIf(live && kind === "postgres")("expires rooms and receipts, persists rate counts and resets at the minute boundary", async () => {
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
  let game = createGame(config, room.members.map(({ id, seat, name }) => ({ id, seat, name })), room.hostId, randomUUID(), live ? f.time.now - 30_020 : f.time.now);
  const command = (input: Parameters<typeof executeCommand>[1], now = game.updatedAt + 1) => { game = executeCommand(game, input, now, fixedRandom); };
  command({ type: "deal", actorId: room.hostId });
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
  const targetId = room.members[7]!.id;
  for (const token of wolves) await action(f.service, token, { type: "wolf_propose", targetId });
  const consensusId = (await f.store.load(f.id))!.room.consensusId;
  await Promise.all(wolves.map((token, index) => action(index === 0 ? f.service : other, token, { type: "wolf_confirm", consensusId })));
  const night = (await f.store.load(f.id))!.room.game!.currentNight!;
  expect(night.killLocked).toBe(true); expect(night.wolfConfirmations).toHaveLength(wolves.length); expect(night.killTargetId).toBe(targetId);
});

it.skipIf(live)("isolates schemas, validates readiness, and rejects unavailable tables or unsupported state", async () => {
  const f = await backend("postgres"); const preview = new PostgresRoomStore(pool, "werewolf_preview"); const prod = new PostgresRoomStore(pool, "werewolf_prod");
  await preview.ready(); await prod.ready();
  expect(await prod.load(f.id)).toBeNull(); expect(await prod.receipt("missing")).toBeNull();
  expect(() => cloudSchema("public; DROP SCHEMA public")).toThrow("STORAGE_SCHEMA_INVALID");
  await pool.query("ALTER TABLE werewolf_prod.rooms RENAME TO hidden_rooms");
  try { await expect(prod.ready()).rejects.toThrow(); } finally { await pool.query("ALTER TABLE werewolf_prod.hidden_rooms RENAME TO rooms"); }
  const broken = { query: async () => ({ rows: [{ version: "1", state: { schemaVersion: 999 } }] }) } as unknown as Pool;
  await expect(new PostgresRoomStore(broken, "werewolf_preview").load(f.id)).rejects.toThrow("STORAGE_VERSION_UNSUPPORTED");
});

it.skipIf(live)("enables RLS and denies anonymous, authenticated and opposite-environment access", async () => {
  const policies = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relnamespace IN ('werewolf_prod'::regnamespace, 'werewolf_preview'::regnamespace) AND relkind = 'r'");
  expect(policies.rows).toHaveLength(10); expect(policies.rows.every(r => r.relrowsecurity)).toBe(true);
  for (const role of ["anon", "authenticated", "service_role", "authenticator", "werewolf_preview_app"]) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await expect(db.query("SELECT * FROM werewolf_prod.rooms")).rejects.toThrow("permission denied");
      await expect(db.query("SELECT * FROM werewolf_prod.room_usage")).rejects.toThrow("permission denied");
      await expect(db.query("SELECT * FROM werewolf_prod.game_usage")).rejects.toThrow("permission denied");
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

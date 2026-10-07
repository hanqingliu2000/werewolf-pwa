import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { SqliteRoomStore } from "../src/server/store";
import { RoomService, RETENTION_MS, hashSession, mintSession } from "../src/server/service";
import { fixture } from "./server-helpers";
import { config } from "./helpers";

const fixtures: ReturnType<typeof fixture>[] = [];
function setup(count = 8) { const f = fixture(count); fixtures.push(f); return f; }
afterEach(() => { while (fixtures.length) fixtures.pop()!.close(); });

describe("durable local facts", () => {
  it("recovers roles, receipts and resources through a new SQLite connection", () => {
    const f = setup(); f.begin(); f.act({ type: "cue_ack" });
    const request = f.envelope({ type: "guard", targetId: null });
    const accepted = f.service.mutate(f.id, f.tokens[4]!, request);
    const otherStore = new SqliteRoomStore(f.path);
    try {
      const restarted = new RoomService(otherStore, () => f.time.now);
      expect(restarted.mutate(f.id, f.tokens[4]!, request)).toEqual(accepted);
      expect(otherStore.load(f.id)).toEqual(f.store.load(f.id));
      expect(restarted.view(f.id, f.tokens[4]!, "private")).toMatchObject({ role: "guard", completed: true,
        acceptedAction: { kind: "guard", targetId: null } });
    } finally { otherStore.close(); }
  });

  it("stores only session hashes, with private file permissions", () => {
    const f = setup();
    expect(statSync(f.path).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(f.state())).not.toContain(f.tokens[0]);
    expect(f.state().members[0]!.sessionHash).toBe(hashSession(f.tokens[0]!));
    expect(readFileSync(f.path).includes(f.tokens[0]!)).toBe(false);
  });

  it("CAS across two connections rejects lost updates and commits a receipt once", () => {
    const f = setup();
    const second = new SqliteRoomStore(f.path);
    try {
      const first = f.store.load(f.id)!;
      const stale = second.load(f.id)!;
      first.room.members[0]!.name = "Changed";
      const receipt = { key: "atomic", fingerprint: "fingerprint", result: { requestId: "r", roomId: f.id,
        epochId: first.room.lobbyId, flowId: first.room.flowId, accepted: true as const } };
      expect(f.store.compareAndSwap(first.room, first.version, receipt)).toBe(true);
      expect(second.compareAndSwap(stale.room, stale.version)).toBe(false);
      expect(second.compareAndSwap(first.room, first.version + 1, receipt)).toBe(false);
      expect(second.receipt("atomic")).toEqual(receipt);
      expect(second.load(f.id)!.room.members[0]!.name).toBe("Changed");
    } finally { second.close(); }
  });

  it("rolls back facts if the receipt insert fails", () => {
    const f = setup();
    const before = f.store.load(f.id)!;
    const room = structuredClone(before.room); room.id = "ABCDEF01";
    const receipt = { key: "bad", fingerprint: "f", result: { requestId: "r", roomId: room.id,
      epochId: room.lobbyId, flowId: room.flowId, accepted: true as const } };
    expect(f.store.insert(room, receipt)).toBe(true);
    expect(f.store.insert(room, { ...receipt, key: "collision" })).toBe(false);
    expect(f.store.insert({ ...room, id: "ABCDEF02" }, receipt)).toBe(false);
    const original = f.store.load(f.id)!;
    original.room.members[0]!.name = "Unsaved";
    const broken = { ...receipt, key: "bad-json", result: { ...receipt.result, unserializable: 1n } };
    expect(() => f.store.compareAndSwap(original.room, original.version, broken as unknown as typeof receipt)).toThrow();
    expect(f.store.load(f.id)).toEqual(before);
  });

  it("retrying create and join returns the same enrollment", () => {
    const f = setup(1);
    const token = mintSession();
    const input = { requestId: randomUUID(), name: "New host", config };
    const first = f.service.create(token, input);
    expect(f.service.create(token, input)).toEqual(first);
    expect(() => f.service.create(token, { ...input, name: "Different" })).toThrow("REQUEST_ID_REUSED");
    const join = { requestId: randomUUID(), epochId: f.state().lobbyId, name: "Guest" };
    const receipt = f.service.join(f.id, token, join);
    expect(f.service.join(f.id, token, join)).toEqual(receipt);
    expect(f.state().members).toHaveLength(2);
  });

  it("retains for 24h of actual changes, not polls, heartbeat or no-op requests", () => {
    const f = setup(1);
    const expiry = f.state().expiresAt;
    f.time.now += 1000;
    f.service.view(f.id, f.tokens[0]!);
    f.service.heartbeat(f.id, f.tokens[0]!, { foreground: true, audioReady: true });
    f.act({ type: "ready", ready: false });
    expect(f.state().expiresAt).toBe(expiry);
    f.act({ type: "ready", ready: true });
    expect(f.state().expiresAt).toBe(f.time.now + RETENTION_MS);
    f.time.now = f.state().expiresAt;
    expect(() => f.service.view(f.id, f.tokens[0]!)).toThrow("ROOM_UNAVAILABLE");
    expect(f.store.load(f.id)).toBeNull();
  });

  it("rate limits survive connection restart and reset at the minute boundary", () => {
    const f = setup(1);
    expect(f.store.rate("test", 0, 1)).toBe(true);
    const second = new SqliteRoomStore(f.path);
    try { expect(second.rate("test", 1, 1)).toBe(false); expect(second.rate("test", 60_000, 1)).toBe(true); }
    finally { second.close(); }
  });
});

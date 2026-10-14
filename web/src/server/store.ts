import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Receipt, Room, RoomStore, StoredRoom } from "./types";
import { usageSnapshot, USAGE_RETENTION_MS, type UsageSnapshot } from "./usage";

export class SqliteRoomStore implements RoomStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    const directory = dirname(path);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path, { timeout: 5000, enableForeignKeyConstraints: true });
    chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY, version INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        state TEXT NOT NULL CHECK(json_valid(state))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS rooms_expiry ON rooms(expires_at);
      CREATE TABLE IF NOT EXISTS receipts (
        key TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        value TEXT NOT NULL CHECK(json_valid(value))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS limits (
        key TEXT PRIMARY KEY, reset_at INTEGER NOT NULL, count INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS room_usage (
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL, room_name TEXT NOT NULL, created_at INTEGER,
        first_seen_at INTEGER NOT NULL, player_count INTEGER NOT NULL CHECK(player_count BETWEEN 1 AND 12),
        peak_players INTEGER NOT NULL CHECK(peak_players BETWEEN 1 AND 12),
        capacity INTEGER NOT NULL CHECK(capacity BETWEEN 8 AND 12), last_activity_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        is_test INTEGER NOT NULL CHECK(is_test IN (0, 1))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS room_usage_created ON room_usage(created_at);
      CREATE INDEX IF NOT EXISTS room_usage_activity ON room_usage(last_activity_at);
      CREATE TABLE IF NOT EXISTS game_usage (
        id TEXT PRIMARY KEY, room_usage_id TEXT NOT NULL REFERENCES room_usage(id) ON DELETE CASCADE,
        started_at INTEGER, ended_at INTEGER, first_seen_at INTEGER NOT NULL,
        player_count INTEGER NOT NULL CHECK(player_count BETWEEN 8 AND 12), status TEXT NOT NULL CHECK(status IN ('active','completed','aborted','expired'))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS game_usage_room ON game_usage(room_usage_id);
      CREATE INDEX IF NOT EXISTS game_usage_started ON game_usage(started_at);
    `);
    for (const suffix of ["-wal", "-shm"]) if (existsSync(path + suffix)) chmodSync(path + suffix, 0o600);
  }

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  load(id: string): StoredRoom | null {
    const row = this.db.prepare("SELECT version, state FROM rooms WHERE id = ?").get(id);
    if (!row) return null;
    const room = JSON.parse(String(row.state)) as Room;
    if (room.schemaVersion !== 1) throw new Error("STORAGE_VERSION_UNSUPPORTED");
    return { version: Number(row.version), room };
  }

  receipt(key: string): Receipt | null {
    const row = this.db.prepare("SELECT value FROM receipts WHERE key = ?").get(key);
    return row ? JSON.parse(String(row.value)) as Receipt : null;
  }

  private saveReceipt(room: Room, receipt: Receipt) {
    this.db.prepare("INSERT INTO receipts(key, room_id, value) VALUES (?, ?, ?)")
      .run(receipt.key, room.id, JSON.stringify(receipt));
  }

  private saveUsage(snapshot: UsageSnapshot) {
    const r = snapshot.room;
    this.db.prepare(`INSERT INTO room_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET player_count = excluded.player_count,
        peak_players = max(room_usage.peak_players, excluded.player_count), capacity = excluded.capacity,
        last_activity_at = excluded.last_activity_at, expires_at = excluded.expires_at`)
      .run(r.id, r.roomId, r.roomName, r.createdAt, r.createdAt ?? Date.now(), r.players, r.players, r.capacity, r.lastActivityAt, r.expiresAt, Number(r.isTest));
    const g = snapshot.game;
    if (g) this.db.prepare(`INSERT INTO game_usage VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET ended_at = excluded.ended_at, status = excluded.status`)
      .run(g.id, g.roomUsageId, g.startedAt, g.endedAt, g.startedAt ?? Date.now(), g.players, g.status);
  }

  insert(room: Room, receipt: Receipt): boolean {
    return this.transaction(() => {
      if (this.receipt(receipt.key)) return false;
      const result = this.db.prepare("INSERT OR IGNORE INTO rooms VALUES (?, 1, ?, ?)")
        .run(room.id, room.expiresAt, JSON.stringify(room));
      if (!result.changes) return false;
      this.saveReceipt(room, receipt);
      this.saveUsage(usageSnapshot(room));
      return true;
    });
  }

  compareAndSwap(room: Room, version: number, receipt?: Receipt, usage?: UsageSnapshot): boolean {
    return this.transaction(() => {
      if (receipt && this.receipt(receipt.key)) return false;
      const result = this.db.prepare("UPDATE rooms SET version = version + 1, state = ?, expires_at = ? WHERE id = ? AND version = ?")
        .run(JSON.stringify(room), room.expiresAt, room.id, version);
      if (!result.changes) return false;
      if (receipt) this.saveReceipt(room, receipt);
      if (usage) this.saveUsage(usage);
      return true;
    });
  }

  rate(key: string, now: number, limit: number, windowMs = 60_000): boolean {
    return this.transaction(() => {
      this.db.prepare(`INSERT INTO limits VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN reset_at <= ? THEN 1 ELSE min(count + 1, ?) END,
        reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END`)
        .run(key, now + windowMs, now, limit + 1, now);
      const row = this.db.prepare("SELECT count FROM limits WHERE key = ?").get(key)!;
      return Number(row.count) <= limit;
    });
  }

  cleanup(now: number): void {
    this.transaction(() => {
      this.db.prepare(`UPDATE game_usage SET status = 'expired' WHERE status = 'active'
        AND room_usage_id IN (SELECT id FROM room_usage WHERE expires_at <= ?)` ).run(now);
      this.db.prepare("DELETE FROM game_usage WHERE coalesce(ended_at, started_at, first_seen_at) <= ?").run(now - USAGE_RETENTION_MS);
      this.db.prepare("DELETE FROM room_usage WHERE max(last_activity_at, first_seen_at) <= ?").run(now - USAGE_RETENTION_MS);
      this.db.prepare("DELETE FROM rooms WHERE expires_at <= ?").run(now);
      this.db.prepare("DELETE FROM limits WHERE reset_at <= ?").run(now);
    });
  }

  close() { this.db.close(); }
}

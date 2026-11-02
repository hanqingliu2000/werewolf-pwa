import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { SqliteRoomStore } from "../src/server/store";
import { fixture } from "./server-helpers";

const legacySchema = `
  CREATE TABLE rooms (id TEXT PRIMARY KEY, version INTEGER NOT NULL, expires_at INTEGER NOT NULL, state TEXT NOT NULL CHECK(json_valid(state))) STRICT;
  CREATE TABLE receipts (key TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
  CREATE TABLE limits (key TEXT PRIMARY KEY, reset_at INTEGER NOT NULL, count INTEGER NOT NULL) STRICT;
  CREATE TABLE room_usage (
    id TEXT PRIMARY KEY, room_id TEXT NOT NULL, room_name TEXT NOT NULL, created_at INTEGER,
    first_seen_at INTEGER NOT NULL, player_count INTEGER NOT NULL CHECK(player_count BETWEEN 1 AND 12),
    peak_players INTEGER NOT NULL CHECK(peak_players BETWEEN 1 AND 12), capacity INTEGER NOT NULL CHECK(capacity BETWEEN 8 AND 12),
    last_activity_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, is_test INTEGER NOT NULL CHECK(is_test IN (0,1))
  ) STRICT;
  CREATE TABLE game_usage (
    id TEXT PRIMARY KEY, room_usage_id TEXT NOT NULL REFERENCES room_usage(id) ON DELETE CASCADE,
    started_at INTEGER, ended_at INTEGER, first_seen_at INTEGER NOT NULL,
    player_count INTEGER NOT NULL CHECK(player_count BETWEEN 8 AND 12), status TEXT NOT NULL CHECK(status IN ('active','completed','aborted','expired'))
  ) STRICT;
  CREATE INDEX room_usage_created ON room_usage(created_at);
  CREATE INDEX room_usage_activity ON room_usage(last_activity_at);
  CREATE INDEX game_usage_room ON game_usage(room_usage_id);
  CREATE INDEX game_usage_started ON game_usage(started_at);
`;

it.each([false, true])("upgrades old SQLite summaries atomically (invalid legacy foreign key: %s)", async (invalid) => {
  const f = await fixture(1); const path = join(f.directory, "legacy.sqlite");
  const room = f.state();
  const legacy = new DatabaseSync(path);
  try {
    legacy.exec(legacySchema);
    legacy.prepare("INSERT INTO rooms VALUES (?, 9, ?, ?)").run(room.id, room.expiresAt, JSON.stringify(room));
    const receipt = { key: "old-receipt", fingerprint: "unchanged", result: { accepted: true, requestId: "old", roomId: room.id, epochId: room.lobbyId, flowId: room.flowId } };
    legacy.prepare("INSERT INTO receipts VALUES (?, ?, ?)").run(receipt.key, room.id, JSON.stringify(receipt));
    legacy.exec("INSERT INTO limits VALUES ('keep-budget', 999999, 1)");
    legacy.prepare("INSERT INTO room_usage VALUES ('old', ?, 'Legacy', NULL, 10000, 8, 8, 8, 10000, 999999, 0)").run(room.id);
    if (invalid) legacy.exec("PRAGMA foreign_keys = OFF");
    legacy.prepare("INSERT INTO game_usage VALUES ('old-game', ?, NULL, 10000, 10000, 8, 'completed')").run(invalid ? "missing-parent" : "old");
    const before = {
      rooms: legacy.prepare("SELECT * FROM rooms").all(), receipts: legacy.prepare("SELECT * FROM receipts").all(),
      limits: legacy.prepare("SELECT * FROM limits").all(), room_usage: legacy.prepare("SELECT * FROM room_usage").all(),
      game_usage: legacy.prepare("SELECT * FROM game_usage").all(),
    };
    legacy.close();
    if (invalid) expect(() => new SqliteRoomStore(path)).toThrow();
    else {
      const upgraded = new SqliteRoomStore(path);
      try { expect(upgraded.load(room.id)).toEqual({ version: 9, room }); expect(upgraded.receipt(receipt.key)).toEqual(receipt); }
      finally { upgraded.close(); }
      const reopened = new SqliteRoomStore(path); reopened.close();
    }
    const check = new DatabaseSync(path);
    try {
      for (const table of ["rooms", "receipts", "limits", "room_usage", "game_usage"] as const) {
        expect(check.prepare(`SELECT * FROM ${table}`).all()).toEqual(before[table]);
      }
      expect(check.prepare("PRAGMA user_version").get()!.user_version).toBe(invalid ? 0 : 1);
      expect(check.prepare("SELECT name FROM sqlite_schema WHERE name LIKE '%_v0'").all()).toEqual([]);
      if (!invalid) {
        expect(check.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
        expect(check.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name IN ('room_usage_created','room_usage_activity','game_usage_room','game_usage_started')").all()).toHaveLength(4);
        check.exec("UPDATE room_usage SET capacity = 7; UPDATE game_usage SET player_count = 7;");
        expect(() => check.exec("UPDATE room_usage SET capacity = 6")).toThrow();
        expect(() => check.exec("UPDATE game_usage SET player_count = 6")).toThrow();
        check.exec("DELETE FROM room_usage WHERE id = 'old'");
        expect(check.prepare("SELECT * FROM game_usage").all()).toEqual([]);
      }
    } finally { check.close(); }
  } finally { if (legacy.isOpen) legacy.close(); f.close(); }
});

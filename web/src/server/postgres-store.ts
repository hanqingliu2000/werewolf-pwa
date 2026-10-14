import type { Pool, PoolClient } from "pg";
import type { Receipt, Room, RoomStore, StoredRoom } from "./types";
import { usageSnapshot, USAGE_RETENTION_MS, type UsageSnapshot } from "./usage";

export type CloudSchema = "werewolf_preview" | "werewolf_prod";
export function cloudSchema(value: string | undefined): CloudSchema {
  if (value !== "werewolf_preview" && value !== "werewolf_prod") throw new Error("STORAGE_SCHEMA_INVALID");
  return value;
}

export class PostgresRoomStore implements RoomStore {
  private readonly schema: CloudSchema;
  private cleanedAt: number | null = null;
  private cleaning: Promise<void> | null = null;

  constructor(private readonly pool: Pool, schema: string) { this.schema = cloudSchema(schema); }

  private async transaction(work: (client: PoolClient) => Promise<boolean>): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const accepted = await work(client);
      await client.query(accepted ? "COMMIT" : "ROLLBACK");
      return accepted;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    } finally { client.release(); }
  }

  async load(id: string): Promise<StoredRoom | null> {
    const { rows } = await this.pool.query(`SELECT version, state FROM ${this.schema}.rooms WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    const room = rows[0].state as Room;
    if (room.schemaVersion !== 1) throw new Error("STORAGE_VERSION_UNSUPPORTED");
    return { version: Number(rows[0].version), room };
  }

  async receipt(key: string): Promise<Receipt | null> {
    const { rows } = await this.pool.query(`SELECT value FROM ${this.schema}.receipts WHERE key = $1`, [key]);
    return rows[0]?.value ?? null;
  }

  private async saveReceipt(client: PoolClient, room: Room, receipt: Receipt) {
    const result = await client.query(`INSERT INTO ${this.schema}.receipts(key, room_id, value)
      VALUES ($1, $2, $3::jsonb) ON CONFLICT(key) DO NOTHING`, [receipt.key, room.id, JSON.stringify(receipt)]);
    return result.rowCount === 1;
  }

  private async saveUsage(client: PoolClient, snapshot: UsageSnapshot) {
    const r = snapshot.room;
    await client.query(`INSERT INTO ${this.schema}.room_usage
      (id, room_id, room_name, created_at, first_seen_at, player_count, peak_players, capacity, last_activity_at, expires_at, is_test)
      VALUES ($1,$2,$3,$4,COALESCE($4,(extract(epoch from now())*1000)::bigint),$5,$5,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET player_count = EXCLUDED.player_count,
        peak_players = GREATEST(room_usage.peak_players, EXCLUDED.player_count), capacity = EXCLUDED.capacity,
        last_activity_at = EXCLUDED.last_activity_at, expires_at = EXCLUDED.expires_at`,
    [r.id,r.roomId,r.roomName,r.createdAt,r.players,r.capacity,r.lastActivityAt,r.expiresAt,r.isTest]);
    const g = snapshot.game;
    if (g) await client.query(`INSERT INTO ${this.schema}.game_usage
      (id, room_usage_id, started_at, ended_at, first_seen_at, player_count, status)
      VALUES ($1,$2,$3,$4,COALESCE($3,(extract(epoch from now())*1000)::bigint),$5,$6)
      ON CONFLICT(id) DO UPDATE SET ended_at = EXCLUDED.ended_at, status = EXCLUDED.status`,
    [g.id,g.roomUsageId,g.startedAt,g.endedAt,g.players,g.status]);
  }

  async insert(room: Room, receipt: Receipt): Promise<boolean> {
    return this.transaction(async (client) => {
      const result = await client.query(`INSERT INTO ${this.schema}.rooms(id, version, expires_at, state)
        VALUES ($1, 1, $2, $3::jsonb) ON CONFLICT DO NOTHING`, [room.id, room.expiresAt, JSON.stringify(room)]);
      if (!result.rowCount) return false;
      if (!await this.saveReceipt(client, room, receipt)) return false;
      await this.saveUsage(client, usageSnapshot(room));
      return true;
    });
  }

  async compareAndSwap(room: Room, version: number, receipt?: Receipt, usage?: UsageSnapshot): Promise<boolean> {
    return this.transaction(async (client) => {
      if (receipt && (await client.query(`SELECT 1 FROM ${this.schema}.receipts WHERE key = $1`, [receipt.key])).rowCount) return false;
      const result = await client.query(`UPDATE ${this.schema}.rooms SET version = version + 1, state = $1::jsonb, expires_at = $2
        WHERE id = $3 AND version = $4`, [JSON.stringify(room), room.expiresAt, room.id, version]);
      if (!result.rowCount) return false;
      if (receipt && !await this.saveReceipt(client, room, receipt)) return false;
      if (usage) await this.saveUsage(client, usage);
      return true;
    });
  }

  async rate(key: string, now: number, limit: number, windowMs = 60_000): Promise<boolean> {
    const { rows } = await this.pool.query(`INSERT INTO ${this.schema}.limits(key, reset_at, count) VALUES ($1, $2, 1)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN limits.reset_at <= $3 THEN 1 ELSE LEAST(limits.count + 1, $4) END,
        reset_at = CASE WHEN limits.reset_at <= $3 THEN EXCLUDED.reset_at ELSE limits.reset_at END
      RETURNING count`, [key, now + windowMs, now, limit + 1]);
    return Number(rows[0].count) <= limit;
  }

  async cleanup(now: number): Promise<void> {
    if (this.cleaning) return this.cleaning;
    if (this.cleanedAt !== null && now >= this.cleanedAt && now - this.cleanedAt < 60_000) return;
    this.cleaning = this.performCleanup(now);
    try { await this.cleaning; this.cleanedAt = now; } finally { this.cleaning = null; }
  }

  private async performCleanup(now: number) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE ${this.schema}.game_usage SET status = 'expired' WHERE status = 'active'
        AND room_usage_id IN (SELECT id FROM ${this.schema}.room_usage WHERE expires_at <= $1)`, [now]);
      await client.query(`DELETE FROM ${this.schema}.game_usage WHERE COALESCE(ended_at, started_at, first_seen_at) <= $1`, [now - USAGE_RETENTION_MS]);
      await client.query(`DELETE FROM ${this.schema}.room_usage WHERE GREATEST(last_activity_at, first_seen_at) <= $1`, [now - USAGE_RETENTION_MS]);
      await client.query(`DELETE FROM ${this.schema}.rooms WHERE expires_at <= $1`, [now]);
      await client.query(`DELETE FROM ${this.schema}.limits WHERE reset_at <= $1`, [now]);
      await client.query(`UPDATE ${this.schema}.rooms r SET state = jsonb_set(state, '{archives}',
        COALESCE((SELECT jsonb_agg(a ORDER BY ordinal) FROM jsonb_array_elements(state->'archives') WITH ORDINALITY AS entries(a, ordinal)
          WHERE (a->>'expiresAt')::bigint > $1), '[]'::jsonb)), version = version + 1
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(r.state->'archives') a WHERE (a->>'expiresAt')::bigint <= $1)`, [now]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async ready(): Promise<void> {
    await this.pool.query(`SELECT version FROM ${this.schema}.rooms LIMIT 1`);
    await this.pool.query(`SELECT key FROM ${this.schema}.receipts LIMIT 1`);
    await this.pool.query(`SELECT key FROM ${this.schema}.limits LIMIT 1`);
    await this.pool.query(`SELECT id FROM ${this.schema}.room_usage LIMIT 1`);
    await this.pool.query(`SELECT id FROM ${this.schema}.game_usage LIMIT 1`);
  }
}

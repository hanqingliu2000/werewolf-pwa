import { Pool, type PoolConfig } from "pg";
import { resolve } from "node:path";
import { SqliteRoomStore } from "./store";
import { PostgresRoomStore, cloudSchema, type CloudSchema } from "./postgres-store";

type Environment = Record<string, string | undefined>;
export type StorageSettings = { kind: "sqlite"; path: string } | { kind: "postgres"; schema: CloudSchema; pool: PoolConfig };

export function storageSettings(env: Environment = process.env): StorageSettings {
  const deployed = env.VERCEL === "1";
  if (env.WEREWOLF_STORAGE !== "postgres") {
    if (deployed || (env.WEREWOLF_STORAGE && env.WEREWOLF_STORAGE !== "sqlite")) throw new Error("STORAGE_NOT_CONFIGURED");
    return { kind: "sqlite", path: resolve(/* turbopackIgnore: true */ env.WEREWOLF_DB_PATH ?? ".data/rooms.sqlite") };
  }
  const schema = cloudSchema(env.WEREWOLF_SCHEMA);
  if (deployed && schema !== (env.VERCEL_ENV === "production" ? "werewolf_prod" : "werewolf_preview")) throw new Error("STORAGE_ENVIRONMENT_MISMATCH");
  if (!env.WEREWOLF_DATABASE_URL || !env.WEREWOLF_DATABASE_CA) throw new Error("STORAGE_NOT_CONFIGURED");
  const url = new URL(env.WEREWOLF_DATABASE_URL);
  const user = decodeURIComponent(url.username);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.password || url.port !== "6543"
    || !url.hostname.endsWith(".pooler.supabase.com") || !user.startsWith(`${schema}_app.`) || url.search) throw new Error("STORAGE_CONNECTION_INVALID");
  return { kind: "postgres", schema, pool: {
    connectionString: url.toString(), max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10_000,
    statement_timeout: 5000, query_timeout: 10_000,
    ssl: { ca: env.WEREWOLF_DATABASE_CA.replaceAll("\\n", "\n"), rejectUnauthorized: true },
    application_name: `werewolf-${schema}`,
  } };
}

export function allowedOrigins(env: Environment = process.env): string[] | undefined {
  const origins = [env.WEREWOLF_ORIGIN, env.VERCEL === "1" && env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined].filter((v): v is string => !!v);
  for (const value of origins) {
    const url = new URL(value);
    if (url.origin !== value || (env.VERCEL === "1" && url.protocol !== "https:")) throw new Error("ORIGIN_NOT_CONFIGURED");
  }
  if (env.VERCEL === "1" && !origins.length) throw new Error("ORIGIN_NOT_CONFIGURED");
  return origins.length ? origins : undefined;
}

let cloud: { identity: string; store: PostgresRoomStore } | undefined;
export function openStorage(env: Environment = process.env) {
  const settings = storageSettings(env);
  if (settings.kind === "sqlite") {
    const store = new SqliteRoomStore(settings.path);
    return { store, ready: async () => { store.load("00000000"); }, close: () => store.close() };
  }
  const identity = JSON.stringify(settings);
  if (cloud && cloud.identity !== identity) throw new Error("STORAGE_CONFIGURATION_CHANGED");
  if (!cloud) {
    const pool = new Pool(settings.pool);
    pool.on("error", () => console.error(JSON.stringify({ event: "database_pool_error" })));
    cloud = { identity, store: new PostgresRoomStore(pool, settings.schema) };
  }
  return { store: cloud.store, ready: () => cloud!.store.ready(), close: () => undefined };
}

export function reportServerFailure(event: string, startedAt: number) {
  console.error(JSON.stringify({ event, durationMs: Math.max(0, Date.now() - startedAt), deployment: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" }));
}

import type { Room } from "./types";

export const USAGE_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
export interface UsageSnapshot {
  room: { id: string; roomId: string; roomName: string; createdAt: number | null; players: number;
    capacity: number; lastActivityAt: number; expiresAt: number; isTest: boolean };
  game: { id: string; roomUsageId: string; startedAt: number | null; endedAt: number | null;
    players: number; status: "active" | "completed" | "aborted" } | null;
}

// Explicit scalar allowlist: never persist player names, identities, actions or session hashes.
export function usageSnapshot(room: Room): UsageSnapshot {
  const id = room.usage?.id ?? room.lobbyId;
  return {
    room: { id, roomId: room.id, roomName: `房间 ${room.id}`, createdAt: room.usage?.createdAt ?? null,
      players: room.members.length, capacity: Object.values(room.config.roles).reduce((sum, n) => sum + n, 0),
      lastActivityAt: room.expiresAt - 24 * 60 * 60 * 1000, expiresAt: room.expiresAt,
      isTest: room.usage?.isTest ?? room.members[0]?.name.startsWith("Cloud QA ") ?? false },
    game: room.game ? { id: room.game.id, roomUsageId: id, startedAt: room.usage?.gameStartedAt ?? null,
      endedAt: room.game.phase === "end" ? room.game.updatedAt : null, players: room.game.players.length,
      status: room.game.phase !== "end" ? "active" : room.game.aborted ? "aborted" : "completed" } : null,
  };
}

export function changedUsage(room: Room, before: Room): UsageSnapshot | undefined {
  const after = usageSnapshot(room);
  return JSON.stringify(after) === JSON.stringify(usageSnapshot(before)) ? undefined : after;
}

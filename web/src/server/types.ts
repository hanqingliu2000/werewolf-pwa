import type { Game, RuleConfig, Seat } from "../game/types";

export interface Member extends Seat { sessionHash: string; ready: boolean }
export interface Archive { game: Game; members: Member[]; expiresAt: number }
export interface Room {
  schemaVersion: 1;
  id: string;
  hostId: string;
  lobbyId: string;
  flowId: string;
  config: RuleConfig;
  members: Member[];
  game: Game | null;
  archives: Archive[];
  publicRevision: number;
  consensusId: string;
  draftId: string | null;
  heartbeatAt: number;
  hostAvailable: boolean;
  pauseReason: "host_unavailable" | "window_incomplete" | "manual" | null;
  expiresAt: number;
}
export interface StoredRoom { version: number; room: Room }
export interface Receipt {
  key: string;
  fingerprint: string;
  result: { requestId: string; roomId: string; epochId: string; flowId: string; accepted: true };
}

// Every successful conditional write and its receipt are one atomic commit.
export interface RoomStore {
  load(id: string): StoredRoom | null;
  insert(room: Room, receipt: Receipt): boolean;
  compareAndSwap(room: Room, version: number, receipt?: Receipt): boolean;
  receipt(key: string): Receipt | null;
  rate(key: string, now: number, limit: number): boolean;
  cleanup(now: number): void;
}

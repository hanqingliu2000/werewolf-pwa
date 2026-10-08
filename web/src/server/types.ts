import type { Game, RuleConfig, Seat } from "../game/types";
import type { NarrationState } from "../narration/plan";

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
  narration?: NarrationState;
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
export type Awaitable<T> = T | Promise<T>;
export interface RoomStore {
  load(id: string): Awaitable<StoredRoom | null>;
  insert(room: Room, receipt: Receipt): Awaitable<boolean>;
  compareAndSwap(room: Room, version: number, receipt?: Receipt): Awaitable<boolean>;
  receipt(key: string): Awaitable<Receipt | null>;
  rate(key: string, now: number, limit: number): Awaitable<boolean>;
  cleanup(now: number): Awaitable<void>;
}

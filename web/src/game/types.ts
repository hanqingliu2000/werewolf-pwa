export const ROLES = ["werewolf", "seer", "witch", "guard", "hunter", "villager"] as const;
export type Role = (typeof ROLES)[number];
export type NightRole = "guard" | "werewolf" | "witch" | "seer";
export type Phase = "lobby" | "reveal" | "night_open" | "night_action" | "night_close" | "dawn" | "hunter" | "day" | "end";
export type Winner = "good" | "wolf" | "draw";
export interface RuleConfig {
  version: "werewolf-web-v1";
  winMode: "edge" | "parity";
  roles: Record<Role, number>;
}
export interface Seat { id: string; seat: number; name: string }
export interface Player extends Seat { role: Role | null; alive: boolean }
export type DeathCause = "wolf" | "poison" | "vote" | "shot";
export interface Death { playerId: string; causes: DeathCause[] }
export interface Action {
  actorId: string;
  kind: "guard" | "see" | "save" | "poison" | "pass";
  targetId: string | null;
}
export interface SeerReport { nightNo: number; targetId: string; alignment: "good" | "wolf" }
export interface WitchKnowledge { actorId: string; targetId: string | null }
export interface Night {
  number: number;
  actions: Action[];
  completedActorIds: string[];
  wolfProposals: Record<string, string | null>;
  wolfConfirmations: string[];
  killLocked: boolean;
  killTargetId: string | null;
  witchKnowledge: WitchKnowledge | null;
  deaths: Death[];
}
export type PublicEvent =
  | { type: "roles_dealt" }
  | { type: "deaths"; nightNo: number; playerIds: string[]; revealedHunters: string[] }
  | { type: "day_vote"; nightNo: number; playerId: string | null; revealedHunterId: string | null }
  | { type: "hunter_reaction"; nightNo: number; origin: "night" | "day"; playerId: string; targetId: string | null }
  | { type: "game_end"; winner: Winner | null; aborted: boolean };
export interface Window { openedAt: number; deadline: number; remainingMs: number | null }
export interface Game {
  id: string;
  hostId: string;
  config: RuleConfig;
  phase: Phase;
  players: Player[];
  nightNo: number;
  nightRole: NightRole | null;
  window: Window | null;
  paused: boolean;
  wolfDiscussionPaused?: boolean;
  currentNight: Night | null;
  nights: Night[];
  lastGuardTargetId: string | null;
  witchPotions: { save: boolean; poison: boolean };
  seerReports: Record<string, SeerReport[]>;
  pendingDeaths: Death[];
  pendingHunter: { playerId: string; origin: "night" | "day" } | null;
  dayDraft: { targetId: string | null; confirmed: boolean } | null;
  publicEvents: PublicEvent[];
  winner: Winner | null;
  aborted: boolean;
  updatedAt: number;
}

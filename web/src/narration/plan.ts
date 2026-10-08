import script from "./script.json";
import type { PublicEvent, NightRole, Phase, RuleConfig } from "../game/types";

export const NARRATION_VERSION = script.version;
export type ClipId = keyof typeof script.clips;
export type Announcement = { id: string; from: number; to: number } | { id: string; kind: "new_lobby" };
export interface NarrationState { mode: "text" | "voice"; pending: Announcement | null; version?: string }
export const defaultNarration = (): NarrationState => ({ mode: "text", pending: null, version: NARRATION_VERSION });
export interface NarrationView {
  epochId: string; windowId: string; phase: Phase; nightNo: number; nightRole: NightRole | null;
  paused: boolean; config: RuleConfig; events: PublicEvent[];
  players: { id: string; seat: number }[];
  narration: NarrationState & { version: string };
}
export interface Plan { id: string; clips: ClipId[]; completion: "cue_ack" | "announcement_done"; cueId: string }

// This accepts only the public projection, never a game snapshot or private role view.
export function narrationPlan(view: NarrationView): Plan | null {
  if (view.paused) return null;
  const pending = view.narration.pending;
  if (pending) {
    const clips: ClipId[] = [];
    const seat = (id: string) => {
      const number = view.players.find((p) => p.id === id)?.seat;
      if (!number || number < 1 || number > 12) throw new Error("PUBLIC_SEAT_MISSING");
      clips.push(`seat_${number}` as ClipId);
    };
    if ("kind" in pending) clips.push("new_lobby");
    else {
      for (const event of view.events.slice(pending.from, pending.to)) {
        switch (event.type) {
          case "roles_dealt": clips.push("roles_dealt"); break;
          case "deaths":
            clips.push(event.playerIds.length ? "death_list" : "no_death");
            for (const id of event.playerIds) { seat(id); if (event.revealedHunters.includes(id)) clips.push("hunter_identity"); }
            break;
          case "day_vote":
            clips.push(event.playerId ? "vote_list" : "vote_none");
            if (event.playerId) seat(event.playerId);
            if (event.revealedHunterId) clips.push("hunter_identity");
            break;
          case "hunter_reaction":
            clips.push(event.targetId ? "hunter_shot" : "hunter_pass");
            if (event.targetId) seat(event.targetId);
            break;
          case "game_end": clips.push(event.aborted ? "abort" : event.winner === "good" ? "good_win" : event.winner === "wolf" ? "wolf_win" : "draw"); break;
        }
      }
      if (view.phase === "hunter") clips.push("hunter_open");
      if (view.phase === "day") clips.push("day");
    }
    return { id: `${view.epochId}:${pending.id}`, clips, completion: "announcement_done", cueId: pending.id };
  }
  const clips: ClipId[] = [];
  if (view.phase === "dawn") clips.push("dawn");
  else if (view.nightRole && ["night_open", "night_close"].includes(view.phase)) {
    const first = (["guard", "werewolf", "witch", "seer"] as const).find((role) => view.config.roles[role] > 0);
    if (view.phase === "night_open" && first === view.nightRole) clips.push("night_start");
    clips.push(`${view.nightRole}_${view.phase === "night_open" ? "open" : "close"}` as ClipId);
  }
  if (!clips.length) return null;
  return { id: `${view.epochId}:${view.windowId}`, clips, completion: "cue_ack", cueId: view.windowId };
}
export const captions = (clips: ClipId[]) => clips.map((id) => script.clips[id]).join(" ");
export const clipIds = Object.keys(script.clips) as ClipId[];

import { seerReports, recap } from "../game/engine";
import { requireRule } from "../game/errors";
import type { PublicEvent } from "../game/types";
import type { Member, Room } from "./types";

export function epochId(room: Room) { return room.game?.id ?? room.lobbyId; }

// Only announced events can change the public roster, even after internal night resolution.
function announced(events: PublicEvent[]) {
  const dead = new Set<string>();
  const hunters = new Set<string>();
  for (const event of events) {
    if (event.type === "deaths") {
      event.playerIds.forEach((id) => dead.add(id));
      event.revealedHunters.forEach((id) => hunters.add(id));
    }
    if (event.type === "day_vote") {
      if (event.playerId) dead.add(event.playerId);
      if (event.revealedHunterId) hunters.add(event.revealedHunterId);
    }
    if (event.type === "hunter_reaction" && event.targetId) dead.add(event.targetId);
  }
  return { dead, hunters };
}

export function publicView(room: Room) {
  const game = room.game;
  const { dead, hunters } = announced(game?.publicEvents ?? []);
  return {
    roomId: room.id, epochId: epochId(room), windowId: room.flowId, revision: room.publicRevision,
    config: room.config, phase: game?.phase ?? "lobby", nightNo: game?.nightNo ?? 0,
    nightRole: game?.nightRole ?? null, paused: game?.paused ?? false, pauseReason: room.pauseReason,
    window: game?.window ? { openedAt: game.window.openedAt, deadline: game.window.deadline,
      remainingMs: game.window.remainingMs } : null,
    players: room.members.map(({ id, seat, name, ready }) => ({ id, seat, name,
      ...(game ? { alive: !dead.has(id), revealedRole: hunters.has(id) ? "hunter" as const : null } : { ready }) })),
    events: game?.publicEvents ?? [], winner: game?.winner ?? null, aborted: game?.aborted ?? false,
  };
}

export function privateView(room: Room, member: Member) {
  const game = room.game;
  const own = game?.players.find((p) => p.id === member.id);
  const events = announced(game?.publicEvents ?? []);
  const visibleAlive = !events.dead.has(member.id);
  const active = own?.alive && !game?.paused && game?.phase === "night_action" && own.role === game.nightRole;
  const completed = game?.currentNight?.completedActorIds.includes(member.id) ?? false;
  const knowledge = game?.currentNight?.witchKnowledge;
  const result = {
    playerId: member.id, role: own?.role ?? null, alive: visibleAlive,
    acknowledged: game?.roleAcknowledgements.includes(member.id) ?? false,
    action: active && !completed && !(own?.role === "werewolf" && game!.currentNight!.killLocked) ? game!.nightRole : null,
    completed,
    acceptedAction: game?.currentNight?.actions.find((a) => a.actorId === member.id) ?? null,
    hunterReaction: game?.phase === "hunter" && !game.paused && game.pendingHunter?.playerId === member.id,
  };
  return {
    ...result,
    ...(own?.role === "guard" ? { previousGuardTargetId: game!.lastGuardTargetId } : {}),
    ...(own?.role === "seer" ? { reports: seerReports(game!, member.id) } : {}),
    ...(own?.role === "witch" && visibleAlive ? { witch: {
      saveRemaining: game!.witchPotions.save, poisonRemaining: game!.witchPotions.poison,
      canSeeWolfTarget: knowledge?.actorId === member.id,
      ...(knowledge?.actorId === member.id ? { wolfTargetId: knowledge.targetId } : {}),
    },
      action: active && !completed && (game!.witchPotions.save || game!.witchPotions.poison) ? "witch" : null } : {}),
    ...(own?.role === "werewolf" && visibleAlive ? {
      teammates: game!.players.filter((p) => p.role === "werewolf").map((p) => ({ id: p.id, seat: p.seat, name: p.name })),
      ...(active ? { wolves: { proposals: game!.currentNight!.wolfProposals,
        confirmations: game!.currentNight!.wolfConfirmations, locked: game!.currentNight!.killLocked,
        consensusId: room.consensusId } } : {}),
    } : {}),
  };
}

export function hostView(room: Room, member: Member) {
  requireRule(member.id === room.hostId, "FORBIDDEN");
  return { playerId: member.id, narrationMode: "text" as const,
    canStart: !room.game && room.members.length === Object.values(room.config.roles).reduce((a, b) => a + b, 0)
      && room.members.every((p) => p.ready),
    canBeginNight: room.game?.phase === "reveal" && !room.game.paused
      && room.game.roleAcknowledgements.length === room.members.length,
    dayDraft: room.game?.phase === "day" ? room.game.dayDraft : null, draftId: room.draftId,
    cueId: room.game && ["night_open", "night_close", "dawn"].includes(room.game.phase) ? room.flowId : null,
  };
}

export function recapView(room: Room, sessionHash: string, gameId: string, now: number) {
  const current = room.game?.id === gameId ? room.game : null;
  const archive = room.archives.find((item) => item.game.id === gameId && item.expiresAt > now);
  const members = current ? room.members : archive?.members;
  const member = members?.find((p) => p.sessionHash === sessionHash);
  requireRule(member, "FORBIDDEN");
  return recap(current ?? archive!.game, member.id);
}

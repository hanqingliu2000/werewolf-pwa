import { randomUUID } from 'node:crypto';
import type {
  ActionType,
  CreateRoomInput,
  JoinRoomInput,
  NightAction,
  Player,
  Room,
  RuleConfig,
} from './types';
import { assignRoleNames, checkWin, phaseExpectedAction, roleActions } from './game-rules';
import { firstActiveNightPhase, nextActiveNightPhase } from './night-phase';

type GameEvent = {
  id: string;
  roomId: string;
  type: 'night_resolve' | 'hunter_shot' | 'day_vote' | 'phase_advance' | 'game_end';
  payload: Record<string, unknown>;
  createdAt: string;
};

type RoomBundle = {
  room: Room;
  players: Player[];
  nightActions: NightAction[];
  events: GameEvent[];
};

const defaultRuleConfig: RuleConfig = {
  winMode: 'A',
  guardCanRepeatProtect: false,
  witchSelfSave: 'first-night-only',
  witchCanSaveAndPoisonSameNight: false,
  witchSaveCount: 1,
  witchPoisonCount: 1,
  hunterCanShootWhenPoisoned: false,
  hunterCanShootWhenKilled: true,
};

const rooms = new Map<string, RoomBundle>();

function nowIso() {
  return new Date().toISOString();
}

function makeSessionToken() {
  return randomUUID();
}

function normalizeKey(input: string) {
  return input.trim().toLocaleLowerCase();
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getBundle(roomId: string) {
  const roomBundle = rooms.get(roomId);
  if (!roomBundle) throw new Error('ROOM_NOT_FOUND');
  return roomBundle;
}

function assertSession(player: Player, sessionToken?: string | null) {
  if (!sessionToken) throw new Error('UNAUTHORIZED');
  if (player.sessionToken !== sessionToken) throw new Error('INVALID_SESSION');
}

export function assertPlayerSession(roomId: string, playerId: string, sessionToken?: string | null) {
  const roomBundle = getBundle(roomId);
  const player = roomBundle.players.find((p) => p.id === playerId);
  if (!player) throw new Error('PLAYER_NOT_FOUND');
  assertSession(player, sessionToken);
  return player;
}

export function assertHostSession(roomId: string, hostPlayerId: string, sessionToken?: string | null) {
  const roomBundle = getBundle(roomId);
  if (roomBundle.room.hostId !== hostPlayerId) throw new Error('FORBIDDEN');
  const host = assertPlayerSession(roomId, hostPlayerId, sessionToken);
  return host;
}

function addEvent(roomBundle: RoomBundle, type: GameEvent['type'], payload: Record<string, unknown>) {
  roomBundle.events.push({
    id: randomUUID(),
    roomId: roomBundle.room.id,
    type,
    payload,
    createdAt: nowIso(),
  });
}

export function createRoom(input: CreateRoomInput) {
  const hostName = input.hostName.trim();
  if (!hostName) throw new Error('HOST_NAME_REQUIRED');

  const id = makeRoomCode();
  const hostId = randomUUID();
  const now = nowIso();

  const room: Room = {
    id,
    hostId,
    name: input.roomName?.trim() || `${hostName} 的房间`,
    status: 'lobby',
    currentPhase: 'LOBBY',
    currentNightNo: 0,
    phaseVersion: 1,
    ruleConfig: { ...defaultRuleConfig, ...(input.ruleConfig ?? {}) },
    createdAt: now,
    updatedAt: now,
  };

  const hostPlayer: Player = {
    id: hostId,
    roomId: id,
    name: hostName,
    role: null,
    alive: true,
    eliminatedAt: null,
    sessionToken: makeSessionToken(),
  };

  rooms.set(id, { room, players: [hostPlayer], nightActions: [], events: [] });

  return { room, hostPlayer };
}

export function joinRoom(roomId: string, input: JoinRoomInput) {
  const roomBundle = getBundle(roomId);
  if (roomBundle.room.status !== 'lobby') throw new Error('ROOM_ALREADY_STARTED');

  const name = input.name.trim();
  if (!name) throw new Error('PLAYER_NAME_REQUIRED');

  const key = normalizeKey(name);
  if (roomBundle.players.some((p) => normalizeKey(p.name) === key)) {
    throw new Error('PLAYER_NAME_TAKEN');
  }

  const player: Player = {
    id: randomUUID(),
    roomId,
    name,
    role: null,
    alive: true,
    eliminatedAt: null,
    sessionToken: makeSessionToken(),
  };

  roomBundle.players.push(player);
  roomBundle.room.updatedAt = nowIso();
  roomBundle.room.phaseVersion += 1;

  return { room: roomBundle.room, player };
}

export function startRoom(roomId: string, playerId: string) {
  const roomBundle = getBundle(roomId);
  if (roomBundle.room.hostId !== playerId) throw new Error('FORBIDDEN');
  if (roomBundle.room.status !== 'lobby') throw new Error('PHASE_MISMATCH');
  const targetPlayers = roomBundle.room.ruleConfig.targetPlayers;
  if (targetPlayers && roomBundle.players.length < targetPlayers) throw new Error('PLAYERS_NOT_READY');

  assignRoleNames(roomBundle.players, roomBundle.room.ruleConfig.rolePlan);

  roomBundle.room.status = 'night';
  roomBundle.room.currentNightNo = 1;
  roomBundle.room.currentPhase = firstActiveNightPhase(roomBundle.players);
  roomBundle.room.phaseVersion += 1;
  roomBundle.room.updatedAt = nowIso();

  return roomBundle.room;
}

export function submitNightAction(roomId: string, input: {
  actorPlayerId: string;
  targetPlayerId?: string;
  actionType: ActionType;
  confirm?: boolean;
}) {
  const roomBundle = getBundle(roomId);
  const { room, players } = roomBundle;

  if (room.status !== 'night') throw new Error('PHASE_MISMATCH');
  const expected = phaseExpectedAction[room.currentPhase];
  if (!expected) throw new Error('PHASE_MISMATCH');

  const phaseAllows =
    (room.currentPhase === 'NIGHT_WITCH' && ['save', 'poison', 'pass'].includes(input.actionType)) ||
    (room.currentPhase === 'NIGHT_WEREWOLF' && input.actionType === 'kill') ||
    input.actionType === expected;
  if (!phaseAllows) throw new Error('PHASE_MISMATCH');

  const actor = players.find((p) => p.id === input.actorPlayerId);
  if (!actor) throw new Error('PLAYER_NOT_FOUND');
  if (!actor.alive) throw new Error('ALREADY_ELIMINATED');

  const allow = roleActions[actor.role ?? 'villager'] ?? [];
  if (!allow.includes(input.actionType)) throw new Error('FORBIDDEN');

  const now = nowIso();
  if (room.currentPhase === 'NIGHT_WITCH' && ['save', 'poison'].includes(input.actionType)) {
    const currentNightSameAction = roomBundle.nightActions.find(
      (a) =>
        a.nightNo === room.currentNightNo &&
        a.actorPlayerId === actor.id &&
        a.actionType === input.actionType &&
        a.isFinal,
    );
    const usedSave = roomBundle.nightActions.filter(
      (a) =>
        a.actorPlayerId === actor.id &&
        a.actionType === 'save' &&
        a.isFinal &&
        !(input.actionType === 'save' && a.id === currentNightSameAction?.id),
    ).length;
    const usedPoison = roomBundle.nightActions.filter(
      (a) =>
        a.actorPlayerId === actor.id &&
        a.actionType === 'poison' &&
        a.isFinal &&
        !(input.actionType === 'poison' && a.id === currentNightSameAction?.id),
    ).length;
    const maxSave = Number(room.ruleConfig.witchSaveCount ?? 1);
    const maxPoison = Number(room.ruleConfig.witchPoisonCount ?? 1);
    if (input.actionType === 'save' && usedSave >= maxSave) throw new Error('WITCH_SAVE_EXHAUSTED');
    if (input.actionType === 'poison' && usedPoison >= maxPoison) throw new Error('WITCH_POISON_EXHAUSTED');
  }

  if (input.actionType !== 'pass') {
    const target = players.find((p) => p.id === input.targetPlayerId);
    if (!target) throw new Error('PLAYER_NOT_FOUND');

    const existing = roomBundle.nightActions.find(
      (a) =>
        a.roomId === roomId &&
        a.nightNo === room.currentNightNo &&
        a.actorPlayerId === input.actorPlayerId &&
        a.actionType === input.actionType &&
        a.isFinal,
    );

    if (existing) {
      existing.targetPlayerId = input.targetPlayerId!;
      existing.updatedAt = now;
    } else {
      roomBundle.nightActions.push({
        id: randomUUID(),
        roomId,
        nightNo: room.currentNightNo,
        actorRole: actor.role!,
        actorPlayerId: input.actorPlayerId,
        targetPlayerId: input.targetPlayerId!,
        actionType: input.actionType,
        isFinal: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  let shouldAdvance = false;
  if (room.currentPhase === 'NIGHT_GUARD' || room.currentPhase === 'NIGHT_SEER') {
    shouldAdvance = true;
  } else if (room.currentPhase === 'NIGHT_WEREWOLF') {
    const aliveWolves = players.filter((p) => p.alive && p.role === 'werewolf').map((p) => p.id);
    const wolfKills = roomBundle.nightActions
      .filter((a) => a.nightNo === room.currentNightNo && a.actionType === 'kill' && a.isFinal && aliveWolves.includes(a.actorPlayerId));
    const targetByWolf = new Map(wolfKills.map((a) => [a.actorPlayerId, a.targetPlayerId]));
    const allSelected = aliveWolves.every((id) => targetByWolf.has(id));
    const consensus = allSelected ? new Set(aliveWolves.map((id) => targetByWolf.get(id))).size === 1 : false;

    if (input.confirm) {
      if (!consensus) throw new Error('WOLF_CONSENSUS_REQUIRED');
      shouldAdvance = true;
    } else {
      shouldAdvance = false;
    }
  } else if (room.currentPhase === 'NIGHT_WITCH') {
    if (input.actionType === 'pass') {
      shouldAdvance = true;
    } else if (!room.ruleConfig.witchCanSaveAndPoisonSameNight) {
      shouldAdvance = true;
    } else {
      const witchActions = new Set(
        roomBundle.nightActions
          .filter((a) => a.nightNo === room.currentNightNo && a.actorPlayerId === actor.id && ['save', 'poison'].includes(a.actionType))
          .map((a) => a.actionType),
      );
      shouldAdvance = witchActions.has('save') && witchActions.has('poison');
    }
  }

  if (shouldAdvance) room.currentPhase = nextActiveNightPhase(room.currentPhase as any, players);

  room.phaseVersion += 1;
  room.updatedAt = now;

  return { room, acceptedAction: input.actionType };
}

export function resolveNight(roomId: string, hostPlayerId: string) {
  const roomBundle = getBundle(roomId);
  const { room, players, nightActions } = roomBundle;

  if (room.hostId !== hostPlayerId) throw new Error('FORBIDDEN');
  if (room.currentPhase !== 'NIGHT_RESOLVE') throw new Error('PHASE_MISMATCH');

  const actions = nightActions.filter((a) => a.nightNo === room.currentNightNo && a.isFinal);
  const kill = actions.find((a) => a.actionType === 'kill');
  const guard = actions.find((a) => a.actionType === 'guard');
  const save = actions.find((a) => a.actionType === 'save');
  const poison = actions.find((a) => a.actionType === 'poison');

  const deaths = new Set<string>();
  const killedByWolf = new Set<string>();
  const killedByPoison = new Set<string>();
  if (kill && kill.targetPlayerId !== guard?.targetPlayerId) {
    if (kill.targetPlayerId !== save?.targetPlayerId) {
      deaths.add(kill.targetPlayerId);
      killedByWolf.add(kill.targetPlayerId);
    }
  }
  if (poison) {
    deaths.add(poison.targetPlayerId);
    killedByPoison.add(poison.targetPlayerId);
  }

  players.forEach((p) => {
    if (deaths.has(p.id) && p.alive) {
      p.alive = false;
      p.eliminatedAt = nowIso();
    }
  });

  const hunter = players.find((p) => p.role === 'hunter');
  const hunterDead = !!hunter && deaths.has(hunter.id);
  const hunterByWolf = !!hunter && killedByWolf.has(hunter.id);
  const hunterByPoison = !!hunter && killedByPoison.has(hunter.id);
  const hunterCanShoot = hunterDead && (
    (hunterByWolf && (room.ruleConfig.hunterCanShootWhenKilled ?? true)) ||
    (hunterByPoison && room.ruleConfig.hunterCanShootWhenPoisoned)
  );
  if (hunterCanShoot) {
    room.currentPhase = 'DEATH_REACTION_HUNTER';
    room.status = 'night';
  } else {
    room.currentPhase = 'DAY_ANNOUNCE';
    room.status = 'day';
  }
  room.phaseVersion += 1;
  room.updatedAt = nowIso();
  addEvent(roomBundle, 'night_resolve', {
    nightNo: room.currentNightNo,
    deaths: players.filter((p) => deaths.has(p.id)).map((p) => ({ id: p.id, name: p.name })),
  });

  return {
    room,
    deaths: players.filter((p) => deaths.has(p.id)).map((p) => ({ id: p.id, name: p.name })),
  };
}

function buildWolfConsensus(players: Player[], nightActions: NightAction[], nightNo: number) {
  const aliveWolves = players.filter((p) => p.alive && p.role === 'werewolf').map((p) => p.id);
  const wolfKillActions = nightActions.filter(
    (a) => a.nightNo === nightNo && a.isFinal && a.actionType === 'kill' && aliveWolves.includes(a.actorPlayerId),
  );
  const wolfTargets = new Map(wolfKillActions.map((a) => [a.actorPlayerId, a.targetPlayerId]));
  const selectedCount = aliveWolves.filter((id) => wolfTargets.has(id)).length;
  const consensus =
    selectedCount > 0 &&
    selectedCount === aliveWolves.length &&
    new Set(aliveWolves.map((id) => wolfTargets.get(id))).size === 1;

  return {
    wolfCount: aliveWolves.length,
    selectedCount,
    consensus,
    allSelected: selectedCount === aliveWolves.length,
  };
}

export function advanceToDayInput(roomId: string, hostPlayerId: string) {
  const roomBundle = getBundle(roomId);
  const { room } = roomBundle;
  if (room.hostId !== hostPlayerId) throw new Error('FORBIDDEN');
  if (room.currentPhase !== 'DAY_ANNOUNCE') throw new Error('PHASE_MISMATCH');

  room.currentPhase = 'DAY_INPUT';
  room.status = 'day';
  room.phaseVersion += 1;
  room.updatedAt = nowIso();
  addEvent(roomBundle, 'phase_advance', { to: 'DAY_INPUT', nightNo: room.currentNightNo });
  return room;
}

export function hunterShot(roomId: string, input: { hunterPlayerId: string; targetPlayerId: string }) {
  const roomBundle = getBundle(roomId);
  const { room, players } = roomBundle;
  if (room.currentPhase !== 'DEATH_REACTION_HUNTER') throw new Error('PHASE_MISMATCH');

  const hunter = players.find((p) => p.id === input.hunterPlayerId);
  const target = players.find((p) => p.id === input.targetPlayerId);
  if (!hunter || !target) throw new Error('PLAYER_NOT_FOUND');
  if (hunter.role !== 'hunter') throw new Error('FORBIDDEN');
  if (hunter.alive) throw new Error('PHASE_MISMATCH');
  if (!target.alive) throw new Error('ALREADY_ELIMINATED');

  target.alive = false;
  target.eliminatedAt = nowIso();

  room.currentPhase = 'DAY_ANNOUNCE';
  room.status = 'day';
  room.phaseVersion += 1;
  room.updatedAt = nowIso();
  addEvent(roomBundle, 'hunter_shot', { hunterPlayerId: hunter.id, targetPlayerId: target.id });
  return room;
}

export function dayVote(roomId: string, input: { hostPlayerId: string; eliminatedPlayerId?: string | null }) {
  const roomBundle = getBundle(roomId);
  const { room, players } = roomBundle;

  if (room.hostId !== input.hostPlayerId) throw new Error('FORBIDDEN');
  if (room.status !== 'day') throw new Error('PHASE_MISMATCH');
  if (room.currentPhase !== 'DAY_INPUT') throw new Error('PHASE_MISMATCH');

  const eliminatedId = input.eliminatedPlayerId ?? null;
  if (eliminatedId) {
    const target = players.find((p) => p.id === eliminatedId);
    if (!target) throw new Error('PLAYER_NOT_FOUND');
    if (!target.alive) throw new Error('ALREADY_ELIMINATED');
    target.alive = false;
    target.eliminatedAt = nowIso();
  }

  addEvent(roomBundle, 'day_vote', { nightNo: room.currentNightNo, eliminatedPlayerId: eliminatedId });

  room.currentPhase = 'CHECK_WIN';
  const result = checkWin(room.ruleConfig, players);
  if (result.ended) {
    room.status = 'end';
    room.currentPhase = 'END';
    room.phaseVersion += 1;
    room.updatedAt = nowIso();
    addEvent(roomBundle, 'game_end', { winner: result.winner });
    return { room, winner: result.winner };
  }

  room.status = 'night';
  room.currentNightNo += 1;
  room.currentPhase = firstActiveNightPhase(players);
  room.phaseVersion += 1;
  room.updatedAt = nowIso();

  return { room, winner: null };
}

export function restartRoom(roomId: string, hostPlayerId: string) {
  const roomBundle = getBundle(roomId);
  const { room, players } = roomBundle;

  if (room.hostId !== hostPlayerId) throw new Error('FORBIDDEN');
  if (room.status !== 'end' || room.currentPhase !== 'END') throw new Error('PHASE_MISMATCH');

  players.forEach((p) => {
    p.alive = true;
    p.role = null;
    p.eliminatedAt = null;
  });

  roomBundle.nightActions = [];
  roomBundle.events = [];

  room.status = 'lobby';
  room.currentPhase = 'LOBBY';
  room.currentNightNo = 0;
  room.phaseVersion += 1;
  room.updatedAt = nowIso();

  return room;
}

export function getRoomState(roomId: string, opts?: { revealRoles?: boolean; revealPrivateNightActions?: boolean; revealWolfConsensus?: boolean }) {
  const roomBundle = getBundle(roomId);
  const nightActions = roomBundle.nightActions.filter((a) => a.nightNo === roomBundle.room.currentNightNo);

  return {
    room: roomBundle.room,
    players: roomBundle.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      role: opts?.revealRoles ? p.role : null,
    })),
    nightActions: opts?.revealPrivateNightActions ? nightActions : [],
    wolfConsensus: opts?.revealWolfConsensus ? buildWolfConsensus(roomBundle.players, roomBundle.nightActions, roomBundle.room.currentNightNo) : null,
    events: roomBundle.events.slice(-10),
  };
}

export function getPlayerView(roomId: string, playerId: string) {
  const roomBundle = getBundle(roomId);
  const me = roomBundle.players.find((p) => p.id === playerId);
  if (!me) throw new Error('PLAYER_NOT_FOUND');

  const nightActions = roomBundle.nightActions.filter((a) => a.nightNo === roomBundle.room.currentNightNo && a.isFinal);
  const seerResults =
    me.role === 'seer'
      ? roomBundle.nightActions
          .filter((a) => a.actorPlayerId === me.id && a.actionType === 'see' && a.isFinal)
          .map((a) => {
            const target = roomBundle.players.find((p) => p.id === a.targetPlayerId);
            const role = target?.role ?? null;
            return {
              nightNo: a.nightNo,
              targetName: target?.name ?? '未知玩家',
              targetRole: role,
              alignment: role === 'werewolf' ? 'wolf' as const : 'good' as const,
            };
          })
      : [];
  const witchUses = roomBundle.nightActions.filter((a) => a.actorPlayerId === me.id && ['save', 'poison'].includes(a.actionType) && a.isFinal);
  const witchStatus =
    me.role === 'witch'
      ? {
          usedSave: witchUses.filter((a) => a.actionType === 'save').length,
          usedPoison: witchUses.filter((a) => a.actionType === 'poison').length,
          maxSave: Number(roomBundle.room.ruleConfig.witchSaveCount ?? 1),
          maxPoison: Number(roomBundle.room.ruleConfig.witchPoisonCount ?? 1),
        }
      : null;
  const wolfKill = nightActions.find((a) => a.actionType === 'kill');
  const witchVictim = me.role === 'witch' && wolfKill
    ? (() => {
        const target = roomBundle.players.find((p) => p.id === wolfKill.targetPlayerId);
        return target ? { id: target.id, name: target.name } : null;
      })()
    : null;

  return {
    room: {
      id: roomBundle.room.id,
      name: roomBundle.room.name,
      status: roomBundle.room.status,
      currentPhase: roomBundle.room.currentPhase,
      currentNightNo: roomBundle.room.currentNightNo,
    },
    me: {
      id: me.id,
      name: me.name,
      alive: me.alive,
      role: me.role,
    },
    seerResults,
    witchStatus,
    witchVictim,
    wolfConsensus: me.role === 'werewolf' ? buildWolfConsensus(roomBundle.players, roomBundle.nightActions, roomBundle.room.currentNightNo) : null,
  };
}

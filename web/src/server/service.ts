import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createGame, executeCommand, type RandomSources } from "../game/engine";
import { validateConfig } from "../game/config";
import { requireRule, RuleError } from "../game/errors";
import type { Command } from "../game/commands";
import { parseCreate, parseJoin, parseMutation, parseHeartbeat, type Mutation } from "./input";
import type { Member, Receipt, Room, RoomStore, StoredRoom } from "./types";
import { epochId, publicView, privateView, hostView, recapView } from "./views";

export const RETENTION_MS = 24 * 60 * 60 * 1000;
export const hashSession = (token: string) => createHash("sha256").update(token).digest("hex");
export const mintSession = () => randomBytes(32).toString("base64url");
const fingerprint = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const hostOperations = new Set(["configure", "kick", "start", "begin_night", "cue_ack", "pause", "resume", "abort", "restart", "day_draft", "day_confirm", "day_publish"]);
const lobbyOperations = new Set(["ready", "configure", "seat", "rename", "kick", "leave", "start"]);

export class RoomService {
  constructor(private readonly store: RoomStore, private readonly clock: () => number = Date.now,
    private readonly random: RandomSources = {}) {}

  private now() {
    const now = this.clock();
    requireRule(Number.isSafeInteger(now) && now >= 0, "CLOCK_INVALID");
    return now;
  }

  limit(key: string, limit: number) {
    this.store.cleanup(this.now());
    requireRule(this.store.rate(key, this.now(), limit), "RATE_LIMITED");
  }

  private load(id: string): StoredRoom {
    requireRule(/^[A-F0-9]{8}$/.test(id), "ROOM_UNAVAILABLE");
    const now = this.now();
    this.store.cleanup(now);
    const state = this.store.load(id);
    requireRule(state && state.room.expiresAt > now, "ROOM_UNAVAILABLE");
    return state;
  }

  private member(room: Room, hash: string): Member {
    const member = room.members.find((p) => p.sessionHash === hash);
    requireRule(member, "INVALID_SESSION");
    return member;
  }

  private existing(key: string, input: unknown) {
    const receipt = this.store.receipt(key);
    if (!receipt) return null;
    requireRule(receipt.fingerprint === fingerprint(input), "REQUEST_ID_REUSED");
    this.load(receipt.result.roomId);
    return receipt.result;
  }

  private receipt(room: Room, key: string, requestId: string, input: unknown): Receipt {
    return { key, fingerprint: fingerprint(input), result: {
      requestId, roomId: room.id, epochId: epochId(room), flowId: room.flowId, accepted: true,
    } };
  }

  create(token: string, raw: unknown) {
    const input = parseCreate(raw);
    const hash = hashSession(token);
    const key = `create:${hash}:${input.requestId}`;
    const now = this.now();
    this.store.cleanup(now);
    const previous = this.existing(key, input);
    if (previous) return previous;
    const config = validateConfig(input.config);
    this.limit(`create:${hash}`, 5);
    this.limit("create:global", 30);
    for (let attempt = 0; attempt < 3; attempt++) {
      const hostId = randomUUID();
      const room: Room = {
        schemaVersion: 1, id: randomBytes(4).toString("hex").toUpperCase(), hostId,
        lobbyId: randomUUID(), flowId: randomUUID(), config,
        members: [{ id: hostId, seat: 1, name: input.name, sessionHash: hash, ready: false }],
        game: null, archives: [], publicRevision: 1, consensusId: randomUUID(), draftId: null, heartbeatAt: now,
        hostAvailable: true, pauseReason: null, expiresAt: now + RETENTION_MS,
      };
      const receipt = this.receipt(room, key, input.requestId, input);
      if (this.store.insert(room, receipt)) return receipt.result;
      const existing = this.existing(key, input);
      if (existing) return existing;
    }
    throw new RuleError("WRITE_CONFLICT");
  }

  join(id: string, token: string, raw: unknown) {
    const input = parseJoin(raw);
    const hash = hashSession(token);
    this.limit(`join:${hash}`, 20);
    this.limit("join:global", 300);
    return this.write(id, hash, `join:${id}:${hash}:${input.requestId}`, input.requestId, input, (room) => {
      const prior = room.members.find((p) => p.sessionHash === hash);
      if (prior) return;
      requireRule(input.epochId === room.lobbyId, "STALE_GAME");
      requireRule(!room.game, "ROOM_ALREADY_STARTED");
      this.uniqueName(room, input.name);
      const capacity = Object.values(room.config.roles).reduce((a, b) => a + b, 0);
      const seat = Array.from({ length: capacity }, (_, i) => i + 1).find((n) => !room.members.some((p) => p.seat === n));
      requireRule(seat, "ROOM_FULL");
      room.members.push({ id: randomUUID(), name: input.name, seat, sessionHash: hash, ready: false });
      room.members.sort((a, b) => a.seat - b.seat);
    }, false);
  }

  private uniqueName(room: Room, name: string, exceptId?: string) {
    requireRule(!room.members.some((p) => p.id !== exceptId && p.name.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US")), "PLAYER_NAME_DUPLICATE");
  }

  // Public epochs follow visible phase changes, never secret submissions or internal CAS versions.
  private finishChange(room: Room, before: Room, now: number, meaningful: boolean) {
    const shape = (r: Room) => [epochId(r), r.game?.phase, r.game?.nightRole, r.game?.nightNo, r.game?.paused];
    if (JSON.stringify(shape(room)) !== JSON.stringify(shape(before))) {
      room.flowId = randomUUID();
      if (epochId(room) !== epochId(before) || room.game?.nightNo !== before.game?.nightNo
        || room.game?.nightRole !== before.game?.nightRole) room.consensusId = randomUUID();
      if (room.game?.phase !== "day") room.draftId = null;
    }
    if (JSON.stringify(publicView(room)) !== JSON.stringify(publicView(before))) room.publicRevision++;
    const facts = (r: Room) => ({ config: r.config, members: r.members, lobbyId: r.lobbyId,
      game: r.game ? { ...r.game, updatedAt: 0 } : null, archives: r.archives });
    if (meaningful && JSON.stringify(facts(room)) !== JSON.stringify(facts(before))) room.expiresAt = now + RETENTION_MS;
    room.archives = room.archives.filter((archive) => archive.expiresAt > now);
  }

  private coordinate(source: Room, now: number): Room {
    const room = structuredClone(source);
    room.archives = room.archives.filter((archive) => archive.expiresAt > now);
    const game = room.game;
    if (!game || game.phase === "end" || game.paused) return room;
    now = Math.max(now, game.updatedAt);
    if (!room.hostAvailable || now - room.heartbeatAt >= 10_000) {
      room.game = executeCommand(game, { type: "pause", actorId: room.hostId }, now);
      room.pauseReason = "host_unavailable";
    } else if (game.phase === "night_action" && now >= game.window!.deadline) {
      room.game = executeCommand(game, { type: "close_window", actorId: room.hostId }, now);
      room.pauseReason = room.game.paused ? "window_incomplete" : null;
    }
    this.finishChange(room, source, now, false);
    return room;
  }

  private synchronized(id: string, hash: string): StoredRoom {
    for (let attempt = 0; attempt < 4; attempt++) {
      const state = this.load(id);
      this.member(state.room, hash);
      const room = this.coordinate(state.room, this.now());
      if (JSON.stringify(room) === JSON.stringify(state.room)) return state;
      if (this.store.compareAndSwap(room, state.version)) return { room, version: state.version + 1 };
    }
    throw new RuleError("WRITE_CONFLICT");
  }

  view(id: string, token: string, kind?: "public"): ReturnType<typeof publicView> & { self: { playerId: string; seat: number; isHost: boolean }; serverTime: number };
  view(id: string, token: string, kind: "private"): ReturnType<typeof privateView> & { serverTime: number };
  view(id: string, token: string, kind: "host"): ReturnType<typeof hostView> & { serverTime: number };
  view(id: string, token: string, kind: "public" | "private" | "host"): object;
  view(id: string, token: string, kind: "public" | "private" | "host" = "public") {
    const hash = hashSession(token);
    const { room } = this.synchronized(id, hash);
    const member = this.member(room, hash);
    const data = kind === "public" ? { ...publicView(room), self: { playerId: member.id, seat: member.seat, isHost: member.id === room.hostId } }
      : kind === "private" ? privateView(room, member) : hostView(room, member);
    return { ...data, serverTime: this.now() };
  }

  readRecap(id: string, token: string, gameId: string) {
    return recapView(this.load(id).room, hashSession(token), gameId, this.now());
  }

  invitation(id: string) {
    const { room } = this.load(id);
    return { roomId: room.id, epochId: room.lobbyId, phase: room.game ? "started" : "lobby",
      config: room.config, occupiedSeats: room.members.map((p) => p.seat) };
  }

  listRecaps(id: string, token: string) {
    const { room } = this.load(id);
    const hash = hashSession(token);
    const archives = room.archives.filter((a) => a.expiresAt > this.now() && a.members.some((p) => p.sessionHash === hash));
    const member = room.members.some((p) => p.sessionHash === hash);
    requireRule(member || archives.length > 0, "FORBIDDEN");
    const games = [...archives.map((a) => a.game), ...(member && room.game?.phase === "end" ? [room.game] : [])];
    return { games: games.map((g) => ({ gameId: g.id, winner: g.winner, aborted: g.aborted })) };
  }

  private write(id: string, hash: string, key: string, requestId: string, input: unknown,
    change: (room: Room, member: Member | null, now: number) => void, authenticated = true) {
    for (let attempt = 0; attempt < 4; attempt++) {
      this.load(id);
      const previous = this.existing(key, input);
      if (previous) return previous;
      const state = authenticated ? this.synchronized(id, hash) : this.load(id);
      const room = structuredClone(state.room);
      const now = Math.max(this.now(), room.game?.updatedAt ?? 0);
      change(room, authenticated ? this.member(room, hash) : null, now);
      this.finishChange(room, state.room, now, true);
      const receipt = this.receipt(room, key, requestId, input);
      if (this.store.compareAndSwap(room, state.version, receipt)) return receipt.result;
    }
    throw new RuleError("WRITE_CONFLICT");
  }

  mutate(id: string, token: string, raw: unknown) {
    const input = parseMutation(raw);
    const hash = hashSession(token);
    this.limit(`action:${hash}`, 120);
    return this.write(id, hash, `action:${id}:${hash}:${input.requestId}`, input.requestId, input, (room, member, now) => {
      requireRule(input.epochId === epochId(room), "STALE_GAME");
      requireRule(input.windowId === room.flowId, "STALE_WINDOW");
      const op = input.operation;
      if (hostOperations.has(op.type)) requireRule(member!.id === room.hostId, "FORBIDDEN");
      if (lobbyOperations.has(op.type)) { this.lobby(room, member!, op, now); return; }
      requireRule(room.game, "GAME_NOT_STARTED");
      if (op.type === "wolf_confirm") requireRule(op.consensusId === room.consensusId, "STALE_CONSENSUS");
      if (op.type === "day_confirm" || op.type === "day_publish") requireRule(op.draftId === room.draftId, "STALE_DRAFT");
      if (op.type === "restart") {
        requireRule(room.game.phase === "end", "PHASE_MISMATCH");
        room.archives.push({ game: structuredClone(room.game), members: structuredClone(room.members),
          expiresAt: room.game.updatedAt + RETENTION_MS });
        room.game = null;
        room.lobbyId = randomUUID();
        room.members.forEach((p) => { p.ready = false; });
        room.pauseReason = null;
        return;
      }
      if (["begin_night", "cue_ack", "resume"].includes(op.type)) {
        requireRule(room.hostAvailable && now - room.heartbeatAt < 10_000, "HOST_NOT_READY");
      }
      let command: Command;
      if (op.type === "cue_ack") {
        const type = ({ night_open: "open_window", night_close: "finish_role", dawn: "publish_dawn" } as const)[room.game.phase as "night_open" | "night_close" | "dawn"];
        requireRule(type, "PHASE_MISMATCH");
        command = { type, actorId: member!.id };
      } else if (["wolf_confirm", "day_confirm", "day_publish"].includes(op.type)) {
        command = { type: op.type, actorId: member!.id } as Command;
      } else command = { ...op, actorId: member!.id } as Command;
      const proposals = JSON.stringify(room.game.currentNight?.wolfProposals);
      room.game = executeCommand(room.game, command, now, this.random);
      if (op.type === "wolf_propose" && JSON.stringify(room.game.currentNight?.wolfProposals) !== proposals) room.consensusId = randomUUID();
      if (op.type === "day_draft") room.draftId = randomUUID();
      if (op.type === "pause") room.pauseReason = "manual";
      if (["resume", "abort"].includes(op.type)) room.pauseReason = null;
    });
  }

  private lobby(room: Room, member: Member, op: Mutation["operation"], now: number) {
    requireRule(!room.game, "PHASE_MISMATCH");
    switch (op.type) {
      case "ready": member.ready = op.ready; break;
      case "configure": {
        const config = validateConfig(op.config);
        const capacity = Object.values(config.roles).reduce((a, b) => a + b, 0);
        requireRule(room.members.every((p) => p.seat <= capacity), "SEATS_EXCEED_CAPACITY");
        room.config = config;
        room.members.forEach((p) => { p.ready = false; });
        break;
      }
      case "seat":
        requireRule(op.seat <= Object.values(room.config.roles).reduce((a, b) => a + b, 0), "SEAT_INVALID");
        requireRule(!room.members.some((p) => p.id !== member.id && p.seat === op.seat), "SEAT_TAKEN");
        member.seat = op.seat; member.ready = false;
        room.members.sort((a, b) => a.seat - b.seat);
        break;
      case "rename": this.uniqueName(room, op.name, member.id); member.name = op.name; member.ready = false; break;
      case "leave":
        requireRule(member.id !== room.hostId, "HOST_CANNOT_LEAVE");
        room.members = room.members.filter((p) => p.id !== member.id);
        break;
      case "kick":
        requireRule(op.playerId !== room.hostId, "HOST_CANNOT_LEAVE");
        requireRule(room.members.some((p) => p.id === op.playerId), "PLAYER_NOT_FOUND");
        room.members = room.members.filter((p) => p.id !== op.playerId);
        break;
      case "start":
        requireRule(room.members.length === Object.values(room.config.roles).reduce((a, b) => a + b, 0), "PLAYERS_NOT_READY");
        requireRule(room.members.every((p) => p.ready), "PLAYERS_NOT_READY");
        requireRule(room.hostAvailable && now - room.heartbeatAt < 10_000, "HOST_NOT_READY");
        room.game = executeCommand(createGame(room.config, room.members.map(({ id, name, seat }) => ({ id, name, seat })),
          room.hostId, randomUUID(), now), { type: "deal", actorId: room.hostId }, now, this.random);
        break;
      default: throw new RuleError("INPUT_INVALID");
    }
  }

  heartbeat(id: string, token: string, raw: unknown) {
    const input = parseHeartbeat(raw);
    const hash = hashSession(token);
    this.limit(`heartbeat:${hash}`, 40);
    for (let attempt = 0; attempt < 4; attempt++) {
      const state = this.synchronized(id, hash);
      requireRule(this.member(state.room, hash).id === state.room.hostId, "FORBIDDEN");
      const room = structuredClone(state.room);
      room.heartbeatAt = this.now();
      room.hostAvailable = input.foreground && input.audioReady;
      const coordinated = this.coordinate(room, this.now());
      if (this.store.compareAndSwap(coordinated, state.version)) return { ok: true, paused: coordinated.game?.paused ?? false };
    }
    throw new RuleError("WRITE_CONFLICT");
  }
}

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createGame, executeCommand, type RandomSources } from "../game/engine";
import { validateConfig } from "../game/config";
import { requireRule, RuleError } from "../game/errors";
import type { Command } from "../game/commands";
import { parseCreate, parseJoin, parseMutation, parseHeartbeat, type Mutation } from "./input";
import type { Member, Receipt, Room, RoomStore, StoredRoom } from "./types";
import { epochId, publicView, privateView, hostView, recapView } from "./views";
import { defaultNarration, NARRATION_VERSION } from "../narration/plan";

export const RETENTION_MS = 24 * 60 * 60 * 1000;
export const hashSession = (token: string) => createHash("sha256").update(token).digest("hex");
export const mintSession = () => randomBytes(32).toString("base64url");
const fingerprint = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const hostOperations = new Set(["configure", "kick", "start", "begin_night", "cue_ack", "pause", "resume", "abort", "restart", "day_draft", "day_confirm", "day_publish", "narration_mode", "announcement_done"]);
const lobbyOperations = new Set(["ready", "configure", "seat", "rename", "kick", "leave", "start"]);

export class RoomService {
  constructor(private readonly store: RoomStore, private readonly clock: () => number = Date.now,
    private readonly random: RandomSources = {}) {}

  private now() {
    const now = this.clock();
    requireRule(Number.isSafeInteger(now) && now >= 0, "CLOCK_INVALID");
    return now;
  }

  async limit(key: string, limit: number) {
    await this.store.cleanup(this.now());
    requireRule(await this.store.rate(key, this.now(), limit), "RATE_LIMITED");
  }

  private async load(id: string): Promise<StoredRoom> {
    requireRule(/^[A-F0-9]{8}$/.test(id), "ROOM_UNAVAILABLE");
    const now = this.now();
    await this.store.cleanup(now);
    const state = await this.store.load(id);
    requireRule(state && state.room.expiresAt > now, "ROOM_UNAVAILABLE");
    return state;
  }

  private member(room: Room, hash: string): Member {
    const member = room.members.find((p) => p.sessionHash === hash);
    requireRule(member, "INVALID_SESSION");
    return member;
  }

  private async existing(key: string, input: unknown) {
    const receipt = await this.store.receipt(key);
    if (!receipt) return null;
    requireRule(receipt.fingerprint === fingerprint(input), "REQUEST_ID_REUSED");
    await this.load(receipt.result.roomId);
    return receipt.result;
  }

  private receipt(room: Room, key: string, requestId: string, input: unknown): Receipt {
    return { key, fingerprint: fingerprint(input), result: {
      requestId, roomId: room.id, epochId: epochId(room), flowId: room.flowId, accepted: true,
    } };
  }

  async create(token: string, raw: unknown) {
    const input = parseCreate(raw);
    const hash = hashSession(token);
    const key = `create:${hash}:${input.requestId}`;
    const now = this.now();
    await this.store.cleanup(now);
    const previous = await this.existing(key, input);
    if (previous) return previous;
    const config = validateConfig(input.config);
    await this.limit(`create:${hash}`, 5);
    await this.limit("create:global", 30);
    for (let attempt = 0; attempt < 3; attempt++) {
      const hostId = randomUUID();
      const room: Room = {
        schemaVersion: 1, id: randomBytes(4).toString("hex").toUpperCase(), hostId,
        lobbyId: randomUUID(), flowId: randomUUID(), config,
        members: [{ id: hostId, seat: 1, name: input.name, sessionHash: hash, ready: false }],
        game: null, archives: [], publicRevision: 1, consensusId: randomUUID(), draftId: null, heartbeatAt: now,
        hostAvailable: true, narration: defaultNarration(), pauseReason: null, expiresAt: now + RETENTION_MS,
      };
      const receipt = this.receipt(room, key, input.requestId, input);
      if (await this.store.insert(room, receipt)) return receipt.result;
      const existing = await this.existing(key, input);
      if (existing) return existing;
    }
    throw new RuleError("WRITE_CONFLICT");
  }

  async join(id: string, token: string, raw: unknown) {
    const input = parseJoin(raw);
    const hash = hashSession(token);
    await this.limit(`join:${hash}`, 20);
    await this.limit("join:global", 300);
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
    if (room.narration?.mode === "voice") {
      const previousEvents = before.game?.id === room.game?.id ? before.game?.publicEvents.length ?? 0 : 0;
      const count = room.game?.publicEvents.length ?? 0;
      if (count > previousEvents) {
        room.narration.pending = { id: randomUUID(), from: previousEvents, to: count };
        if (room.game?.phase === "hunter" && before.game?.phase !== "hunter") room.game.window = null;
      }
      else if (before.game && !room.game) room.narration.pending = { id: randomUUID(), kind: "new_lobby" };
    }
    const shape = (r: Room) => [epochId(r), r.game?.phase, r.game?.nightRole, r.game?.nightNo, r.game?.paused,
      r.narration?.mode ?? "text", r.narration?.pending?.id, r.narration?.version];
    if (JSON.stringify(shape(room)) !== JSON.stringify(shape(before))) {
      room.flowId = randomUUID();
      if (epochId(room) !== epochId(before) || room.game?.nightNo !== before.game?.nightNo
        || room.game?.nightRole !== before.game?.nightRole) room.consensusId = randomUUID();
      if (room.game?.phase !== "day") room.draftId = null;
    }
    if (JSON.stringify(publicView(room)) !== JSON.stringify(publicView(before))) room.publicRevision++;
    const facts = (r: Room) => ({ config: r.config, members: r.members, lobbyId: r.lobbyId,
      game: r.game ? { ...r.game, updatedAt: 0 } : null, archives: r.archives, narration: r.narration });
    if (meaningful && JSON.stringify(facts(room)) !== JSON.stringify(facts(before))) room.expiresAt = now + RETENTION_MS;
    room.archives = room.archives.filter((archive) => archive.expiresAt > now);
  }

  private coordinate(source: Room, now: number): Room {
    const room = structuredClone(source);
    room.archives = room.archives.filter((archive) => archive.expiresAt > now);
    const game = room.game;
    if (!game || game.phase === "end" || (game.paused && !game.wolfDiscussionPaused)) return room;
    now = Math.max(now, game.updatedAt);
    if (!room.hostAvailable || now - room.heartbeatAt >= 10_000
      || (room.narration?.mode === "voice" && room.narration.version !== NARRATION_VERSION)) {
      room.game = executeCommand(game, { type: "pause", actorId: room.hostId }, now);
      room.pauseReason = "host_unavailable";
    } else if (game.phase === "night_action" && now >= game.window!.deadline) {
      if (game.wolfDiscussionPaused) return room;
      room.game = executeCommand(game, { type: "close_window", actorId: room.hostId }, now);
      room.pauseReason = room.game.paused ? "window_incomplete" : null;
    } else if (game.phase === "hunter" && !room.narration?.pending) {
      if (!game.window) room.game = executeCommand(game, { type: "open_hunter_window", actorId: room.hostId }, now);
      else if (now >= game.window.deadline) {
        room.game = executeCommand(game, { type: "close_hunter_window", actorId: room.hostId }, now);
        room.pauseReason = "window_incomplete";
      }
    }
    this.finishChange(room, source, now, false);
    return room;
  }

  private async synchronized(id: string, hash: string): Promise<StoredRoom> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const state = await this.load(id);
      this.member(state.room, hash);
      const room = this.coordinate(state.room, this.now());
      if (JSON.stringify(room) === JSON.stringify(state.room)) return state;
      if (await this.store.compareAndSwap(room, state.version)) return { room, version: state.version + 1 };
    }
    throw new RuleError("WRITE_CONFLICT");
  }

  view(id: string, token: string, kind?: "public"): Promise<ReturnType<typeof publicView> & { self: { playerId: string; seat: number; isHost: boolean }; serverTime: number }>;
  view(id: string, token: string, kind: "private"): Promise<ReturnType<typeof privateView> & { serverTime: number }>;
  view(id: string, token: string, kind: "host"): Promise<ReturnType<typeof hostView> & { serverTime: number }>;
  view(id: string, token: string, kind: "public" | "private" | "host"): Promise<object>;
  async view(id: string, token: string, kind: "public" | "private" | "host" = "public") {
    const hash = hashSession(token);
    const { room } = await this.synchronized(id, hash);
    const member = this.member(room, hash);
    const data = kind === "public" ? { ...publicView(room), self: { playerId: member.id, seat: member.seat, isHost: member.id === room.hostId } }
      : kind === "private" ? privateView(room, member) : hostView(room, member);
    return { ...data, serverTime: this.now() };
  }

  async readRecap(id: string, token: string, gameId: string) {
    return recapView((await this.load(id)).room, hashSession(token), gameId, this.now());
  }

  async invitation(id: string) {
    const { room } = await this.load(id);
    return { roomId: room.id, epochId: room.lobbyId, phase: room.game ? "started" : "lobby",
      config: room.config, occupiedSeats: room.members.map((p) => p.seat) };
  }

  async listRecaps(id: string, token: string) {
    const { room } = await this.load(id);
    const hash = hashSession(token);
    const archives = room.archives.filter((a) => a.expiresAt > this.now() && a.members.some((p) => p.sessionHash === hash));
    const member = room.members.some((p) => p.sessionHash === hash);
    requireRule(member || archives.length > 0, "FORBIDDEN");
    const games = [...archives.map((a) => a.game), ...(member && room.game?.phase === "end" ? [room.game] : [])];
    return { games: games.map((g) => ({ gameId: g.id, winner: g.winner, aborted: g.aborted })) };
  }

  private async write(id: string, hash: string, key: string, requestId: string, input: unknown,
    change: (room: Room, member: Member | null, now: number) => void, authenticated = true) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.load(id);
      const previous = await this.existing(key, input);
      if (previous) return previous;
      const state = await (authenticated ? this.synchronized(id, hash) : this.load(id));
      const room = structuredClone(state.room);
      const now = Math.max(this.now(), room.game?.updatedAt ?? 0);
      change(room, authenticated ? this.member(room, hash) : null, now);
      this.finishChange(room, state.room, now, true);
      const receipt = this.receipt(room, key, requestId, input);
      if (await this.store.compareAndSwap(room, state.version, receipt)) return receipt.result;
    }
    throw new RuleError("WRITE_CONFLICT");
  }

  async mutate(id: string, token: string, raw: unknown) {
    const input = parseMutation(raw);
    const hash = hashSession(token);
    await this.limit(`action:${hash}`, 120);
    return this.write(id, hash, `action:${id}:${hash}:${input.requestId}`, input.requestId, input, (room, member, now) => {
      requireRule(input.epochId === epochId(room), "STALE_GAME");
      requireRule(input.windowId === room.flowId, "STALE_WINDOW");
      const op = input.operation;
      if (hostOperations.has(op.type)) requireRule(member!.id === room.hostId, "FORBIDDEN");
      if (op.type === "narration_mode") {
        requireRule(!room.game || room.game.phase === "end" || room.game.paused, "PAUSE_BEFORE_MODE_CHANGE");
        requireRule(op.mode === "text" || (op.trialConfirmed && room.hostAvailable && now - room.heartbeatAt < 10_000), "AUDIO_TRIAL_REQUIRED");
        room.narration = { ...(room.narration ?? defaultNarration()), mode: op.mode, version: op.version };
        return;
      }
      if (op.type === "announcement_done") {
        requireRule(room.narration?.pending?.id === op.cueId, "STALE_CUE");
        if (room.narration.mode === "voice") {
          requireRule(op.version === NARRATION_VERSION && room.narration.version === NARRATION_VERSION, "STALE_AUDIO");
          requireRule(!room.game?.paused && room.hostAvailable && now - room.heartbeatAt < 10_000, "HOST_NOT_READY");
        }
        room.narration.pending = null;
        if (room.game?.phase === "hunter" && !room.game.window) room.game = executeCommand(room.game, { type: "open_hunter_window", actorId: room.hostId }, now);
        return;
      }
      if (["start", "begin_night", "cue_ack", "hunter", "day_publish", "restart"].includes(op.type)) {
        requireRule(!room.narration?.pending, "ANNOUNCEMENT_PENDING");
      }
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
        requireRule(room.narration?.mode !== "voice" || room.narration.version === NARRATION_VERSION, "STALE_AUDIO");
      }
      let command: Command;
      if (op.type === "cue_ack") {
        if (room.narration?.mode === "voice") {
          requireRule(op.version === NARRATION_VERSION, "STALE_AUDIO");
          requireRule(op.cueId === room.flowId, "STALE_CUE");
        }
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
      if (op.type === "wolf_confirm" && !room.game.paused) room.pauseReason = null;
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
        requireRule(room.narration?.mode !== "voice" || room.narration.version === NARRATION_VERSION, "STALE_AUDIO");
        room.game = executeCommand(createGame(room.config, room.members.map(({ id, name, seat }) => ({ id, name, seat })),
          room.hostId, randomUUID(), now), { type: "deal", actorId: room.hostId }, now, this.random);
        break;
      default: throw new RuleError("INPUT_INVALID");
    }
  }

  async heartbeat(id: string, token: string, raw: unknown) {
    const input = parseHeartbeat(raw);
    const hash = hashSession(token);
    await this.limit(`heartbeat:${hash}`, 40);
    for (let attempt = 0; attempt < 4; attempt++) {
      const state = await this.synchronized(id, hash);
      requireRule(this.member(state.room, hash).id === state.room.hostId, "FORBIDDEN");
      const room = structuredClone(state.room);
      room.heartbeatAt = this.now();
      room.hostAvailable = input.foreground && input.audioReady
        && (room.narration?.mode !== "voice" || input.narrationVersion === NARRATION_VERSION);
      const coordinated = this.coordinate(room, this.now());
      if (await this.store.compareAndSwap(coordinated, state.version)) return { ok: true, paused: coordinated.game?.paused ?? false };
    }
    throw new RuleError("WRITE_CONFLICT");
  }
}

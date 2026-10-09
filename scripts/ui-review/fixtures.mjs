import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export const REVIEW_NOW = Date.UTC(2026, 9, 8, 18);
const voice = JSON.parse(readFileSync(new URL("../../web/src/narration/script.json", import.meta.url), "utf8")).version;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { version: "werewolf-web-v1", winMode: "edge", roles: { werewolf: 4, seer: 1, witch: 1, guard: 1, hunter: 1, villager: 4 } };
const roles = ["guard", "werewolf", "werewolf", "werewolf", "werewolf", "witch", "seer", "hunter", "villager", "villager", "villager", "villager"];
const names = ["小林", "阿青", "小周", "Riley", "小夏", "木木", "小陈", "安安", "小余", "小许", "小叶", "今晚名字稍微长一点的玩家"];

export const scenes = [
  { id: "S01", name: "创建房间", kind: "create" },
  { id: "S02", name: "加入房间", kind: "join" },
  { id: "S03", name: "大厅 · 等待准备", kind: "lobby" },
  { id: "S04", name: "身份牌 · 女巫", kind: "identity", panel: "private" },
  { id: "S05", name: "守卫 · 选择目标", kind: "guard", panel: "private" },
  { id: "S06", name: "狼人 · 协商等待", kind: "werewolf", panel: "private" },
  { id: "S07", name: "女巫 · 有解药与毒药", kind: "witch", panel: "private" },
  { id: "S08", name: "预言家 · 查验与记录", kind: "seer", panel: "private" },
  { id: "S09", name: "猎人 · 出局后开枪", kind: "hunter", panel: "private" },
  { id: "S10", name: "主持 · 白天投票草案", kind: "vote", panel: "host" },
  { id: "S11", name: "白天 · 公开出局名单", kind: "day" },
  { id: "S12", name: "暂停 · 恢复对局", kind: "paused", panel: "host" },
  { id: "S13", name: "结束 · 狼人获胜", kind: "end" },
  { id: "S14", name: "复盘 · 身份与逐夜记录", kind: "recap" },
].map((scene, index) => {
  const roomId = `FA${String(index + 1).padStart(6, "0")}`;
  const gameId = uuid(index + 1);
  const path = scene.kind === "create" ? "/__app" : scene.kind === "join" ? `/join?room=${roomId}`
    : scene.kind === "recap" ? `/r/${roomId}/recap/${gameId}` : `/r/${roomId}`;
  return { ...scene, roomId, gameId, path };
});

function recapFor(scene, ownRole) {
  const assigned = [...roles]; const swap = assigned.indexOf(ownRole);
  if (swap >= 0) [assigned[0], assigned[swap]] = [assigned[swap], assigned[0]];
  const participants = assigned.map((role, i) => ({ id: `p${i + 1}`, seat: i + 1, name: names[i], role, alive: role !== "villager" }));
  const guard = participants.find(p => p.role === "guard").id;
  const seer = participants.find(p => p.role === "seer").id;
  const witch = participants.find(p => p.role === "witch").id;
  const wolves = participants.filter(p => p.role === "werewolf").map(p => p.id);
  const villagers = participants.filter(p => p.role === "villager").map(p => p.id);
  const nights = [1, 2].map(number => ({ number, actions: [
    { actorId: guard, kind: "guard", targetId: number === 1 ? guard : "p8" },
    { actorId: witch, kind: "pass", targetId: null }, { actorId: seer, kind: "see", targetId: wolves[number - 1] },
  ], completedActorIds: [guard, witch, seer], wolfProposals: Object.fromEntries(wolves.map(id => [id, villagers[number]])),
  wolfConfirmations: wolves, killLocked: true, killTargetId: villagers[number], witchKnowledge: null,
  deaths: [{ playerId: villagers[number], causes: ["wolf"] }] }));
  return { gameId: scene.gameId, config: structuredClone(config), participants, nights, winner: "wolf", aborted: false,
    publicEvents: [{ type: "roles_dealt" }, { type: "deaths", nightNo: 1, playerIds: [villagers[1]], revealedHunters: [] },
      { type: "day_vote", nightNo: 1, playerId: villagers[0], revealedHunterId: null },
      { type: "deaths", nightNo: 2, playerIds: [villagers[2]], revealedHunters: [] },
      { type: "day_vote", nightNo: 2, playerId: villagers[3], revealedHunterId: null },
      { type: "game_end", winner: "wolf", aborted: false }] };
}

export function makeFixture(scene) {
  const kind = scene.kind;
  const ownRole = ({ identity: "witch", guard: "guard", werewolf: "werewolf", witch: "witch", seer: "seer", hunter: "hunter" })[kind] ?? "villager";
  const lobby = ["create", "join", "lobby"].includes(kind);
  const action = ["guard", "werewolf", "witch", "seer"].includes(kind);
  const end = ["end", "recap"].includes(kind);
  const isHost = ["lobby", "vote", "paused", "end"].includes(kind);
  const duration = ["guard", "paused"].includes(kind) ? 30_000 : kind === "werewolf" ? 15_000 : 10_000;
  const phase = lobby ? "lobby" : kind === "identity" ? "reveal" : action || kind === "paused" ? "night_action"
    : kind === "hunter" ? "hunter" : end ? "end" : "day";
  const recap = recapFor(scene, ownRole);
  const state = { roomId: scene.roomId, epochId: scene.gameId, windowId: uuid(100 + scenes.indexOf(scene)), revision: 1,
    config: structuredClone(config), phase, nightNo: lobby || kind === "identity" ? 0 : 2,
    nightRole: action ? kind : kind === "paused" ? "guard" : null,
    paused: ["werewolf", "paused"].includes(kind), pauseReason: kind === "werewolf" ? "window_incomplete" : kind === "paused" ? "host_unavailable" : null,
    narration: { mode: "text", pending: null, version: voice },
    window: action || ["hunter", "paused"].includes(kind) ? { openedAt: REVIEW_NOW - (kind === "werewolf" ? 15_000 : kind === "paused" ? 18_000 : 0), deadline: REVIEW_NOW + (kind === "werewolf" ? 0 : kind === "paused" ? 12_000 : duration),
      remainingMs: kind === "werewolf" ? 0 : kind === "paused" ? 12_000 : null } : null,
    players: Array.from({ length: lobby ? 6 : 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, name: names[i],
      ...(lobby ? { ready: i !== 0 && i !== 3 } : { alive: end ? recap.participants[i].alive : !(["day", "vote"].includes(kind) && i === 9) && !(kind === "hunter" && i === 0),
        revealedRole: kind === "hunter" && i === 0 ? "hunter" : null }) })),
    events: lobby ? [] : end ? recap.publicEvents : kind === "hunter" ? [{ type: "roles_dealt" }, { type: "deaths", nightNo: 2, playerIds: ["p1"], revealedHunters: ["p1"] }]
      : ["day", "vote"].includes(kind) ? recap.publicEvents.slice(0, 2) : [{ type: "roles_dealt" }],
    winner: end ? "wolf" : null, aborted: false, self: { playerId: "p1", seat: 1, isHost }, serverTime: REVIEW_NOW };
  const personal = { playerId: "p1", role: lobby ? null : ownRole, alive: kind !== "hunter", acknowledged: !lobby,
    action: action ? kind : null, completed: false, acceptedAction: null, hunterReaction: kind === "hunter", epochId: state.epochId, windowId: state.windowId,
    ...(ownRole === "guard" ? { previousGuardTargetId: "p3" } : {}),
    ...(ownRole === "witch" ? { witch: { saveRemaining: true, poisonRemaining: true, canSeeWolfTarget: kind === "witch", ...(kind === "witch" ? { wolfTargetId: "p8" } : {}) } } : {}),
    ...(ownRole === "seer" ? { reports: [{ nightNo: 1, targetId: "p3", alignment: "wolf" }] } : {}) };
  if (kind === "werewolf") {
    personal.teammates = recap.participants.filter(p => p.role === "werewolf").map(({ id, seat, name }) => ({ id, seat, name }));
    personal.wolves = { proposals: Object.fromEntries(personal.teammates.map(p => [p.id, "p8"])), confirmations: personal.teammates.slice(1, 3).map(p => p.id),
      locked: false, discussionPaused: true, consensusId: uuid(300) };
  }
  const host = { playerId: "p1", epochId: state.epochId, windowId: state.windowId, narrationMode: "text", canStart: false,
    canBeginNight: phase === "reveal", cueId: null, draftId: uuid(200), dayDraft: kind === "vote" ? { targetId: "p5", confirmed: false } : null };
  return { scene, state, personal, host, recap };
}

// These mutations only expose additional UI states; they are not a second game engine.
export function applyPreviewOperation(fixture, operation) {
  const { state, personal, host } = fixture; const op = operation ?? {};
  if (op.type === "ready") state.players[0].ready = !!op.ready;
  else if (op.type === "rename") state.players[0].name = String(op.name ?? "").trim().slice(0, 48) || names[0];
  else if (["guard", "seer", "witch", "hunter"].includes(op.type)) {
    personal.action = null; personal.hunterReaction = false; personal.completed = true;
    personal.acceptedAction = { actorId: "p1", kind: op.type === "seer" ? "see" : op.type === "witch" ? op.choice : op.type === "hunter" ? "pass" : op.type, targetId: op.targetId ?? null };
    personal.actionResult = { kind: op.type === "hunter" ? "shot" : personal.acceptedAction.kind, targetId: op.targetId ?? null, nightNo: state.nightNo };
    if (op.type === "seer" && op.targetId) personal.reports.push({ nightNo: 2, targetId: op.targetId, alignment: fixture.recap.participants.find(p => p.id === op.targetId)?.role === "werewolf" ? "wolf" : "good" });
  } else if (op.type === "wolf_propose" && personal.wolves) { personal.wolves.proposals.p1 = op.targetId; personal.wolves.confirmations = []; }
  else if (op.type === "wolf_confirm" && personal.wolves && !personal.wolves.confirmations.includes("p1")) {
    personal.wolves.confirmations.push("p1");
    const ids = personal.teammates.map(p => p.id);
    if (ids.every(id => personal.wolves.confirmations.includes(id)) && new Set(ids.map(id => personal.wolves.proposals[id])).size === 1) {
      personal.wolves.locked = true; personal.wolves.discussionPaused = false; personal.action = null;
      personal.actionResult = { kind: "kill", targetId: personal.wolves.proposals.p1, nightNo: state.nightNo };
      state.paused = false; state.pauseReason = null;
    }
  }
  else if (op.type === "day_draft") { host.dayDraft = { targetId: op.targetId ?? null, confirmed: false }; host.draftId = randomUUID(); }
  else if (op.type === "day_confirm" && host.dayDraft) host.dayDraft.confirmed = true;
  else if (op.type === "pause" || op.type === "resume") { state.paused = op.type === "pause"; state.pauseReason = state.paused ? "manual" : null; }
  else if (op.type === "narration_mode") { state.narration.mode = op.mode; host.narrationMode = op.mode; }
  else if (op.type === "announcement_done") state.narration.pending = null;
  else if (op.type === "abort") { state.phase = "end"; state.aborted = true; state.winner = null; state.window = null; state.paused = false; }
  state.revision++;
  host.canStart = state.phase === "lobby" && state.players.length === Object.values(state.config.roles).reduce((a, b) => a + b, 0) && state.players.every(p => p.ready);
}

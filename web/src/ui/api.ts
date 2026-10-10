export class ApiError extends Error {
  constructor(public readonly code: string) { super(code); }
}
let initialization: Promise<void> | null = null;
export async function request<T>(path: string, input?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v2/${path}`, { method: input === undefined ? "GET" : "POST",
      credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}), ...(input === undefined ? {} : {
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      }) });
  } catch { throw new ApiError("NETWORK_UNKNOWN"); }
  let data;
  try { data = await response.json(); } catch { throw new ApiError("NETWORK_UNKNOWN"); }
  if (!response.ok) throw new ApiError(data.error?.code ?? "INTERNAL_ERROR");
  return data as T;
}
export function initialize() {
  initialization ??= request("session", {}).then(() => undefined).catch((error) => { initialization = null; throw error; });
  return initialization;
}
const messages: Record<string, string> = {
  INVALID_SESSION: "原浏览器身份已失效", ROOM_UNAVAILABLE: "房间已到期或不存在", ROOM_FULL: "房间已满员",
  ROOM_ALREADY_STARTED: "对局已经开始", PLAYER_NAME_DUPLICATE: "这个昵称已经有人使用", CONFIG_INVALID: "请检查人数和角色配比",
  INPUT_INVALID: "请检查输入内容", FORBIDDEN: "当前身份不能执行这项操作", RATE_LIMITED: "操作过于频繁，请稍后再试",
  STALE_GAME: "对局已经更新，请重新确认", STALE_WINDOW: "当前阶段已更新，请重新确认",
  STALE_CONSENSUS: "狼队提议已更新，请重新确认", STALE_DRAFT: "录入结果已更新，请重新核对",
  WOLF_CONSENSUS_REQUIRED: "请先选择本人的投票目标", HOST_NOT_READY: "主持尚未恢复，请先启用当前页面",
  GAME_PAUSED: "对局已暂停", ACTION_LOCKED: "这项行动已经确认", GUARD_REPEAT_FORBIDDEN: "不能连续守护同一目标",
  WITCH_SELF_SAVE_FORBIDDEN: "只有首夜可以自救", WITCH_SAVE_EXHAUSTED: "解药已用尽", WITCH_POISON_EXHAUSTED: "毒药已用尽",
  SAVE_TARGET_INVALID: "解药只能救本夜狼刀目标", TARGET_NOT_ALIVE: "目标已经出局", SELF_TARGET_FORBIDDEN: "不能选择本人",
  PLAYERS_NOT_READY: "尚未满员或有人未准备", VOTE_NOT_CONFIRMED: "结果尚未确认", WRITE_CONFLICT: "状态正在更新，请重试",
  NETWORK_UNKNOWN: "网络未确认结果，请重试原请求", INTERNAL_ERROR: "服务暂时不可用，请稍后重试",
  SEAT_TAKEN: "座位已被占用", SEATS_EXCEED_CAPACITY: "当前座位超出了新人数", ACTOR_ELIMINATED: "本人已经出局",
  ANNOUNCEMENT_PENDING: "公开公告尚未完成", STALE_CUE: "播报阶段已更新，请重新确认",
  AUDIO_TRIAL_REQUIRED: "请完成试音并确认听清", PAUSE_BEFORE_MODE_CHANGE: "请先暂停对局，再切换主持方式",
  STALE_AUDIO: "播报资源已更新，请刷新页面后启用声音",
  ORIGIN_REJECTED: "请求来源与当前网址不一致", ORIGIN_NOT_CONFIGURED: "当前网址尚未配置",
};
export function errorText(error: unknown) { return error instanceof ApiError ? messages[error.code] ?? "当前状态不允许这项操作" : "操作未完成，请重试"; }

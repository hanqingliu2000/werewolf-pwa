import type { Role, PublicEvent } from "../game/types";
export const roleNames: Record<Role, string> = { werewolf: "狼人", seer: "预言家", witch: "女巫", guard: "守卫", hunter: "猎人", villager: "平民" };
export const roleRules: Record<Role, string> = {
  werewolf: "存活狼人各自确认一票，最多票目标成为刀口，最高票平票时随机选择；可投空刀。操作30秒，未投完则等待。",
  seer: "每夜查验一名其他存活玩家的阵营，可重复查验或放弃。",
  witch: "解药与毒药各一瓶，每夜最多一瓶。仅首夜可自救，有解药时可看本夜狼刀目标。",
  guard: "可自守或不守，不可连续守护同一人。守护与解药叠加不会导致死亡。",
  hunter: "被狼刀或白天投票出局后可开枪或放弃。只要被毒就不能开枪，出局时公开身份。",
  villager: "白天参与线下讨论和投票。出局时不自动公开身份。",
};
export const phaseNames: Record<string, string> = { lobby: "集结中", reveal: "私密发牌", night_open: "天黑，请闭眼", night_action: "夜间行动", night_close: "请闭眼", dawn: "天亮了", hunter: "猎人反应", day: "白天讨论", end: "本局结束" };
export function winnerName(winner: string | null, aborted = false) { return aborted ? "本局已中止" : winner === "good" ? "好人阵营获胜" : winner === "wolf" ? "狼人阵营获胜" : "本局平局"; }
export function eventText(event: PublicEvent, seat: (id: string) => string): string {
  switch (event.type) {
    case "roles_dealt": return "身份已发放";
    case "deaths": return event.playerIds.length ? `第 ${event.nightNo} 夜：${event.playerIds.map(seat).join("、")}出局${event.revealedHunters.length ? `；${event.revealedHunters.map(seat).join("、")}是猎人` : ""}` : `第 ${event.nightNo} 夜：平安夜`;
    case "day_vote": return event.playerId ? `白天投票：${seat(event.playerId)}出局${event.revealedHunterId ? "，身份为猎人" : ""}` : "白天投票：无人出局";
    case "hunter_reaction": return event.targetId ? `猎人开枪：${seat(event.targetId)}出局` : "猎人放弃开枪";
    case "game_end": return winnerName(event.winner, event.aborted);
  }
}

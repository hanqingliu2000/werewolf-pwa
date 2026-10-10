"use client";
import { Check, EyeOff } from "lucide-react";
import { IconButton } from "./components";
import { PrivateAction } from "./private-action";
import { roleNames, roleRules } from "./content";
import { errorText } from "./api";
import type { RoomController } from "./use-room";

export function PrivateTask({ controller: c }: { controller: RoomController }) {
  const view = c.view!; const info = c.personal;
  const seat = (id: string) => `${view.players.find((p) => p.id === id)?.seat ?? "?"} 号`;
  if (!info) return <p role="status">正在读取本人身份</p>;
  if (!info.role) return <p>尚未发牌</p>;
  const task = info.hunterReaction ? "hunter" : info.wolves?.locked ? null : info.wolves ? "werewolf" : info.action;
  if (task) return <PrivateAction controller={c} info={info} task={task} />;
  const result = info.actionResult ?? (info.acceptedAction ? { ...info.acceptedAction, nightNo: view.nightNo }
    : info.wolves?.locked && Object.hasOwn(info.wolves.proposals, info.playerId)
      ? { kind: "kill" as const, targetId: info.wolves.proposals[info.playerId] ?? null, nightNo: view.nightNo } : null);
  const target = result?.targetId ? `${seat(result.targetId)} · ${view.players.find((p) => p.id === result.targetId)?.name ?? "玩家"}` : null;
  const summary = !result ? null : result.kind === "kill" ? target ? `狼队共同目标：${target}` : "狼队已决定空刀"
    : result.kind === "guard" ? target ? `守护：${target}` : "本夜不守"
      : result.kind === "save" ? `使用解药：${target}` : result.kind === "poison" ? `使用毒药：${target}`
        : result.kind === "see" ? target ? `查验：${target}` : "本夜不查验"
          : result.kind === "shot" ? target ? `开枪目标：${target}` : "已放弃开枪" : info.role === "hunter" ? "已放弃开枪" : "本夜不用药";
  const report = result?.kind === "see" && result.targetId ? info.reports?.find((r) => r.nightNo === result.nightNo && r.targetId === result.targetId) : null;
  const effect = report ? `查验结果：${report.alignment === "wolf" ? "狼人阵营" : "好人阵营"}`
    : result?.kind === "save" ? "解药已消耗" : result?.kind === "poison" ? "毒药已消耗"
      : result?.kind === "kill" ? "共同决策已锁定" : null;
  return <div className="private-task identity-view"><div className="private-scroll"><div className="identity identity-card"><img src={`/art/${info.role}.webp`} alt="" width="300" height="400" /><div><span className="eyebrow">{view.self.seat} 号 · 本人身份</span><h3>{roleNames[info.role]}</h3><p>{roleRules[info.role]}</p></div></div>
    {!!c.error && <p className="error" role="alert">{errorText(c.error)}</p>}{view.paused && <p className="muted">对局已暂停</p>}{c.pending && <button className="button secondary full-width" disabled={c.busy} onClick={() => void c.send()}>重试原请求</button>}
    {view.phase !== "reveal" && <div className="waiting-note"><Check size={24} aria-hidden /><h3>{result || info.completed ? "行动已确认" : info.alive ? "等待当前窗口" : "已出局"}</h3>{summary && <p>{summary}</p>}{effect && <p className="action-effect">{effect}</p>}</div>}
    {!!info.reports?.length && <section className="private-records"><h3>本人查验记录</h3>{info.reports.map((r) => <div key={r.nightNo}><span>第 {r.nightNo} 夜</span><strong>{seat(r.targetId)}</strong><span>{r.alignment === "wolf" ? "狼人阵营" : "好人阵营"}</span></div>)}</section>}
    {!!info.wolfHistory?.length && <section className="private-records"><h3>历次刀口目标</h3>{info.wolfHistory.map((r) => <div key={r.nightNo}><span>第 {r.nightNo} 夜</span><strong>{r.targetId ? seat(r.targetId) : "空刀"}</strong></div>)}</section>}
  </div><div className="privacy-close"><IconButton icon={EyeOff} label="收起私密信息" onClick={c.conceal} /></div></div>;
}

"use client";
import { Check, EyeOff, ShieldCheck } from "lucide-react";
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
  const task = info.hunterReaction ? "hunter" : info.wolves ? "werewolf" : info.action;
  if (task) return <PrivateAction controller={c} info={info} task={task} />;
  return <div className="private-task"><div className="private-scroll"><div className="identity"><img src={`/art/${info.role}.webp`} alt="" width="180" height="240" /><div><span className="eyebrow">{view.self.seat} 号 · 本人身份</span><h3>{roleNames[info.role]}</h3><p>{roleRules[info.role]}</p><span className="private-label"><ShieldCheck size={16} aria-hidden />本人私密视角</span></div></div>
    {!!c.error && <p className="error" role="alert">{errorText(c.error)}</p>}{view.paused && <p className="muted">对局已暂停</p>}{c.pending && <button className="button secondary full-width" disabled={c.busy} onClick={() => void c.send()}>重试原请求</button>}
    {view.phase !== "reveal" && <div className="waiting-note"><Check size={24} aria-hidden /><h3>{info.alive ? info.completed ? "行动已确认" : "等待当前窗口" : "已出局"}</h3>{info.acceptedAction && <p>本夜已接受：{info.acceptedAction.targetId ? seat(info.acceptedAction.targetId) : "放弃行动"}</p>}</div>}
    {!!info.reports?.length && <section className="private-records"><h3>本人查验记录</h3>{info.reports.map((r) => <div key={r.nightNo}><span>第 {r.nightNo} 夜</span><strong>{seat(r.targetId)}</strong><span>{r.alignment === "wolf" ? "狼人阵营" : "好人阵营"}</span></div>)}</section>}<div className="privacy-close"><IconButton icon={EyeOff} label="收起私密信息" onClick={c.conceal} /></div>
  </div></div>;
}

"use client";
import { useState } from "react";
import { Check, EyeOff, ShieldCheck } from "lucide-react";
import { IconButton, NextButton, SeatGrid, WindowCountdown } from "./components";
import { roleNames, roleRules } from "./content";
import { errorText } from "./api";
import type { RoomController } from "./use-room";

export function PrivateTask({ controller: c }: { controller: RoomController }) {
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [choice, setChoice] = useState<"save" | "poison" | "pass" | null>(null);
  const view = c.view!; const info = c.personal;
  const seat = (id: string | null | undefined) => id ? `${view.players.find((p) => p.id === id)?.seat ?? "?"} 号` : "无目标";
  if (!info) return <p role="status">正在读取本人身份</p>;
  if (!info.role) return <p>尚未发牌</p>;
  const isHunter = info.hunterReaction;
  const task = isHunter ? "hunter" : info.wolves ? "werewolf" : info.action;
  const alive = view.players.filter((p) => !("alive" in p) || p.alive);
  const disabled = (id: string) => (task === "seer" || task === "hunter") && id === info.playerId
    || task === "guard" && info.previousGuardTargetId === id;
  const working = c.busy || !!c.pending || (view.paused && !info.wolves?.discussionPaused);
  const ownProposal = info.wolves?.proposals[info.playerId];
  const liveWolves = info.teammates?.filter((p) => alive.some((a) => a.id === p.id)) ?? [];
  const proposed = liveWolves.every((p) => Object.hasOwn(info.wolves?.proposals ?? {}, p.id));
  const consensus = proposed && new Set(liveWolves.map((p) => info.wolves?.proposals[p.id])).size === 1;
  async function confirm() {
    if (target === undefined && task !== "witch") return;
    if (task === "guard" || task === "seer" || task === "hunter") await c.send({ type: task, targetId: target! });
    if (task === "witch" && choice) await c.send({ type: "witch", choice, targetId: choice === "pass" ? null : target! });
  }
  return <div className={`private-task${task ? " active-task" : ""}`}>
    {task && <div className="task-clock"><span>{isHunter ? "猎人反应" : `第 ${view.nightNo} 夜`}</span>{info.wolves?.discussionPaused ? <strong>协商等待</strong> : <WindowCountdown view={view} receivedAt={c.receivedAt} compact />}</div>}
    <div className="private-scroll"><div className="identity"><img src={`/art/${info.role}.webp`} alt="" width="180" height="240" /><div><span className="eyebrow">{view.self.seat} 号 · 本人身份</span><h3>{roleNames[info.role]}</h3>{!task && <><p>{roleRules[info.role]}</p><span className="private-label"><ShieldCheck size={16} aria-hidden />本人私密视角</span></>}</div></div>
    {!!c.error && <p className="error" role="alert">{errorText(c.error)}</p>}
    {view.paused && <p className="muted">对局已暂停</p>}
    {c.pending && <button className="button secondary full-width" disabled={c.busy} onClick={() => void c.send()}>重试原请求</button>}
    {view.phase === "reveal" ? <div className="action-footer">{info.acknowledged ? <p className="success"><Check size={18} aria-hidden />身份已确认</p> : <NextButton busy={c.busy} disabled={working} onClick={() => void c.send({ type: "acknowledge" })}>确认身份</NextButton>}</div>
      : task === "werewolf" && info.wolves ? <section className="task-section"><div className="section-heading"><h3>共同选择</h3><span>{info.wolves.locked ? "已锁定" : consensus ? "目标一致" : "尚未一致"}</span></div>
        {info.wolves.discussionPaused && <p role="status">等待全体共同确认</p>}
        <div className="wolf-proposals">{liveWolves.map((p) => <div key={p.id}><strong>{p.seat} 号 · {p.name}</strong><span>{Object.hasOwn(info.wolves!.proposals, p.id) ? info.wolves!.proposals[p.id] === null ? "空刀" : seat(info.wolves!.proposals[p.id]) : "尚未提议"}</span><span>{info.wolves!.confirmations.includes(p.id) ? "已确认" : "待确认"}</span></div>)}</div>
        <SeatGrid players={view.players} mode="target" ownId={info.playerId} selected={ownProposal} disabled={() => working || info.wolves!.locked} onSelect={(id) => { if (id) void c.send({ type: "wolf_propose", targetId: id }); }} />
      </section> : task ? <section className="task-section"><div className="section-heading"><h3>{isHunter ? "最后一枪" : task === "witch" ? "今夜的药" : task === "guard" ? "选择守护" : "选择查验"}</h3><span>{isHunter ? "选择或放弃" : "本夜一次"}</span></div>
        {task === "guard" && info.previousGuardTargetId && <p className="muted">上一夜守护：{seat(info.previousGuardTargetId)}</p>}
        {task === "witch" && info.witch && <><div className="potion-status"><span>解药 <strong>{info.witch.saveRemaining ? "1 瓶" : "已用尽"}</strong></span><span>毒药 <strong>{info.witch.poisonRemaining ? "1 瓶" : "已用尽"}</strong></span></div>
          <p className="knife-info">{info.witch.canSeeWolfTarget ? info.witch.wolfTargetId ? `本夜狼刀：${seat(info.witch.wolfTargetId)}` : "本夜空刀" : "本夜刀口不可见"}</p>
          <div className="segments potion-choices"><button disabled={working || !info.witch.saveRemaining || !info.witch.wolfTargetId || (info.witch.wolfTargetId === info.playerId && view.nightNo !== 1)} aria-pressed={choice === "save"} onClick={() => { setChoice("save"); setTarget(info.witch!.wolfTargetId); }}>使用解药</button><button disabled={working || !info.witch.poisonRemaining} aria-pressed={choice === "poison"} onClick={() => { setChoice("poison"); setTarget(undefined); }}>使用毒药</button><button disabled={working} aria-pressed={choice === "pass"} onClick={() => { setChoice("pass"); setTarget(null); }}>不用药</button></div></>}
        {(task !== "witch" || choice === "poison") && <SeatGrid players={view.players} mode="target" ownId={info.playerId} selected={target} disabled={(id) => working || disabled(id)} onSelect={(id) => setTarget(id)} />}
      </section> : <div className="waiting-note"><Check size={24} aria-hidden /><h3>{info.alive ? info.completed ? "行动已确认" : "等待当前窗口" : "已出局"}</h3>{info.acceptedAction && <p>本夜已接受：{info.acceptedAction.targetId ? seat(info.acceptedAction.targetId) : "放弃行动"}</p>}</div>}
    {info.reports && info.reports.length > 0 && <section className="private-records"><h3>本人查验记录</h3>{info.reports.map((r) => <div key={r.nightNo}><span>第 {r.nightNo} 夜</span><strong>{seat(r.targetId)}</strong><span>{r.alignment === "wolf" ? "狼人阵营" : "好人阵营"}</span></div>)}</section>}
    {task && <details className="task-rules"><summary>角色规则</summary><p>{roleRules[info.role]}</p></details>}
    {!task && <div className="privacy-close"><IconButton icon={EyeOff} label="收起私密信息" onClick={c.conceal} /></div>}
    </div>
    {task && <div className="private-action-bar">
      <div className="selection-summary">{task === "werewolf" ? ownProposal === undefined ? "尚未提议" : ownProposal === null ? "本夜空刀" : `共同目标：${seat(ownProposal)}`
        : target === undefined ? "尚未选择" : target === null ? "已选择放弃" : `${task === "witch" ? choice === "save" ? "解药" : "毒药" : "当前目标"}：${seat(target)}`}</div>
      <div className={`action-buttons${task === "witch" ? " single" : ""}`}>
        {task === "werewolf" && info.wolves ? <><button className="pass-choice" aria-pressed={ownProposal === null} disabled={working || info.wolves.locked} onClick={() => void c.send({ type: "wolf_propose", targetId: null })}>本夜空刀</button><NextButton disabled={working || !consensus || info.wolves.locked || info.wolves.confirmations.includes(info.playerId)} busy={c.busy} onClick={() => void c.send({ type: "wolf_confirm", consensusId: info.wolves!.consensusId })}>共同确认</NextButton></>
          : <>{task !== "witch" && <button className="pass-choice" aria-pressed={target === null} disabled={working} onClick={() => setTarget(null)}>{task === "guard" ? "本夜不守" : task === "seer" ? "本夜不查验" : "放弃开枪"}</button>}<NextButton busy={c.busy} disabled={working || target === undefined || (task === "witch" && !choice)} onClick={() => void confirm()}>确认行动</NextButton></>}
      </div>
    </div>}
  </div>;
}

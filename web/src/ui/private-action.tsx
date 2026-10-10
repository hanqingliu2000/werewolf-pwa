"use client";
import { useId, useState } from "react";
import { BookOpen, History, ShieldCheck, Users, X } from "lucide-react";
import { IconButton, NextButton, SeatGrid, WindowCountdown } from "./components";
import { roleNames, roleRules } from "./content";
import { errorText } from "./api";
import type { RoomController } from "./use-room";
import type { PrivateRoom } from "./contracts";

export function PrivateAction({ controller: c, info, task }: { controller: RoomController; info: PrivateRoom; task: NonNullable<PrivateRoom["action"]> | "hunter" }) {
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [choice, setChoice] = useState<"save" | "poison" | "pass" | null>(null);
  const [detail, setDetail] = useState<"rules" | "roster" | "reports" | "kills">("rules");
  const detailId = useId(); const detailTitle = useId();
  const view = c.view!;
  const seat = (id: string | null | undefined) => id ? `${view.players.find((p) => p.id === id)?.seat ?? "?"} 号` : "无目标";
  const disabled = (id: string) => (task === "seer" || task === "hunter") && id === info.playerId
    || task === "guard" && info.previousGuardTargetId === id;
  const working = c.busy || !!c.pending || (view.paused && !info.wolves?.discussionPaused);
  const ownProposal = info.wolves?.proposals[info.playerId];
  const liveWolves = info.teammates?.filter((p) => view.players.some((a) => a.id === p.id && (!("alive" in a) || a.alive))) ?? [];
  const title = task === "werewolf" ? "共同选择" : task === "witch" ? "今夜的药" : task === "guard" ? "选择守护" : task === "seer" ? "选择查验" : "最后一枪";
  const summary = task === "werewolf" ? ownProposal === undefined ? "尚未提议" : ownProposal === null ? "本夜空刀" : `${info.wolves?.locked ? "共同目标" : "本人提议"}：${seat(ownProposal)}`
    : target === undefined ? "尚未选择" : target === null ? "已选择放弃" : `${task === "witch" ? choice === "save" ? "解药" : "毒药" : "当前目标"}：${seat(target)}`;
  async function confirm() {
    if (target === undefined) return;
    if (task === "guard" || task === "seer" || task === "hunter") await c.send({ type: task, targetId: target });
    if (task === "witch" && choice) await c.send({ type: "witch", choice, targetId: choice === "pass" ? null : target });
  }
  return <div className="private-task active-task single-screen" data-task={task}>
    <header className="action-heading"><div className="identity"><img src={`/art/${info.role}.webp`} alt="" width="36" height="48" /><div><span>{roleNames[info.role!]} · {view.self.seat} 号</span><h3>{title}</h3></div></div><div className="task-clock">{info.wolves?.discussionPaused ? <strong>协商等待</strong> : <WindowCountdown view={view} receivedAt={c.receivedAt} compact />}</div><IconButton icon={X} label="关闭面板" onClick={c.conceal} /></header>
    {!!c.error && <div className="action-notice" role="alert"><span>{errorText(c.error)}</span>{c.pending && <button className="button secondary" disabled={c.busy} onClick={() => void c.send()}>重试原请求</button>}</div>}
    <div className="action-content"><section className="action-options" aria-label="本轮行动状态">
      <div className="action-context"><div className="action-facts">
        {task === "witch" && info.witch ? <><div className="potion-status"><span>解药 <strong>{info.witch.saveRemaining ? "1" : "0"}</strong></span><span>毒药 <strong>{info.witch.poisonRemaining ? "1" : "0"}</strong></span></div><p className="knife-info">{info.witch.canSeeWolfTarget ? info.witch.wolfTargetId ? `本夜狼刀：${seat(info.witch.wolfTargetId)}` : "本夜空刀" : "本夜刀口不可见"}</p></>
          : task === "werewolf" ? <span>{info.wolves?.locked ? "已锁定" : `${info.wolves?.confirmations.length ?? 0} / ${liveWolves.length} 已投票`}</span>
            : task === "guard" && info.previousGuardTargetId ? <span>上一夜：{seat(info.previousGuardTargetId)}</span> : task === "seer" ? null : <span>{task === "hunter" ? "选择或放弃" : "本夜一次"}</span>}
      </div><div className="action-tools"><IconButton icon={BookOpen} label="角色规则" popoverTarget={detailId} onClick={() => setDetail("rules")} /><IconButton icon={Users} label="完整名单" popoverTarget={detailId} onClick={() => setDetail("roster")} />{task === "seer" && !!info.reports?.length && <IconButton icon={History} label="本人查验记录" popoverTarget={detailId} onClick={() => setDetail("reports")} />}{task === "werewolf" && <IconButton icon={History} label="历次刀口目标" popoverTarget={detailId} onClick={() => setDetail("kills")} />}</div></div>
      {task === "werewolf" && info.wolves && <div className="wolf-proposals" data-count={liveWolves.length} aria-label="狼队投票与确认">{liveWolves.map((p) => <div key={p.id}><strong>{p.seat} 号</strong><span>{Object.hasOwn(info.wolves!.proposals, p.id) ? info.wolves!.proposals[p.id] === null ? "空刀" : seat(info.wolves!.proposals[p.id]) : "未投票"}</span><span>{info.wolves!.confirmations.includes(p.id) ? "已确认" : "待确认"}</span></div>)}</div>}
      {task === "witch" && info.witch && <div className="segments potion-choices"><button disabled={working || !info.witch.saveRemaining || !info.witch.wolfTargetId || (info.witch.wolfTargetId === info.playerId && view.nightNo !== 1)} aria-pressed={choice === "save"} onClick={() => { setChoice("save"); setTarget(info.witch!.wolfTargetId); }}>使用解药</button><button disabled={working || !info.witch.poisonRemaining} aria-pressed={choice === "poison"} onClick={() => { setChoice("poison"); setTarget(undefined); }}>使用毒药</button><button disabled={working} aria-pressed={choice === "pass"} onClick={() => { setChoice("pass"); setTarget(null); }}>不用药</button></div>}
    </section><section className="action-board" aria-label="行动目标">
      {task !== "witch" || choice === "poison" ? <SeatGrid action players={view.players} mode="target" ownId={info.playerId} selected={task === "werewolf" ? ownProposal : target} disabled={(id) => working || disabled(id) || !!info.wolves?.locked} onSelect={(id) => { if (task === "werewolf") { if (id) void c.send({ type: "wolf_propose", targetId: id }); } else setTarget(id); }} />
        : <div className="witch-selection"><ShieldCheck size={28} aria-hidden /><strong>{choice === "save" ? `解药：${seat(target)}` : choice === "pass" ? "本夜不用药" : "尚未选择药剂"}</strong></div>}
    </section></div>
    <footer className="private-action-bar"><div className="selection-summary">{summary}</div><div className={`action-buttons${task === "witch" ? " single" : ""}`}>
      {task === "werewolf" && info.wolves ? <><button className="pass-choice" aria-pressed={ownProposal === null} disabled={working || info.wolves.locked} onClick={() => void c.send({ type: "wolf_propose", targetId: null })}>本夜空刀</button><NextButton disabled={working || ownProposal === undefined || info.wolves.locked || info.wolves.confirmations.includes(info.playerId)} busy={c.busy} onClick={() => void c.send({ type: "wolf_confirm", consensusId: info.wolves!.consensusId })}>确认投票</NextButton></>
        : <>{task !== "witch" && <button className="pass-choice" aria-pressed={target === null} disabled={working} onClick={() => setTarget(null)}>{task === "guard" ? "本夜不守" : task === "seer" ? "本夜不查验" : "放弃开枪"}</button>}<NextButton busy={c.busy} disabled={working || target === undefined || (task === "witch" && !choice)} onClick={() => void confirm()}>确认行动</NextButton></>}
    </div></footer>
    <section id={detailId} popover="auto" className="private-detail" aria-labelledby={detailTitle}><div className="detail-heading"><h3 id={detailTitle}>{detail === "rules" ? "角色规则" : detail === "roster" ? "完整名单" : detail === "kills" ? "历次刀口目标" : "本人查验记录"}</h3><IconButton icon={X} label="关闭详情" popoverTarget={detailId} popoverTargetAction="hide" /></div>{detail === "rules" ? <p>{roleRules[info.role!]}</p> : detail === "roster" ? <ol className="full-roster">{view.players.map((p) => <li key={p.id}><strong>{p.seat} 号</strong><span>{p.name}</span></li>)}</ol> : detail === "kills" ? <section className="private-records">{info.wolfHistory?.length ? info.wolfHistory.map((r) => <div key={r.nightNo}><span>第 {r.nightNo} 夜</span><strong>{r.targetId ? seat(r.targetId) : "空刀"}</strong></div>) : <p>暂无历史刀口</p>}</section> : <section className="private-records"><h3>本人查验记录</h3>{info.reports?.map((r) => <div key={r.nightNo}><span>第 {r.nightNo} 夜</span><strong>{seat(r.targetId)}</strong><span>{r.alignment === "wolf" ? "狼人阵营" : "好人阵营"}</span></div>)}</section>}</section>
  </div>;
}

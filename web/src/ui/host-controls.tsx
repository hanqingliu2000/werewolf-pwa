"use client";
import { useState } from "react";
import { Check, Pause, Play, Square, UserMinus } from "lucide-react";
import { IconButton, NextButton, SeatGrid } from "./components";
import { phaseNames, roleNames } from "./content";
import { errorText } from "./api";
import type { RoomController } from "./use-room";
import type { VoiceController } from "./use-narration";
import { VoiceControls } from "./voice-controls";

export function HostControls({ controller: c, voice }: { controller: RoomController; voice: VoiceController }) {
  const [target, setTarget] = useState<string | null | undefined>(undefined); const [abort, setAbort] = useState(false); const [publish, setPublish] = useState(false);
  const v = c.view!; const host = c.host; const blocked = c.busy || !!c.pending || !c.leader;
  if (!host) return <p role="status">正在同步主持状态</p>;
  const seat = (id: string | null) => id ? `${v.players.find((p) => p.id === id)?.seat} 号` : "无人出局";
  return <div className="host-controls"><div className="host-mode"><span className="eyebrow">PUBLIC HOST</span><strong>{voice.mode === "text" ? "文字主持" : "语音主持"}</strong><span className={c.leader ? "success" : "muted"}>{c.leader ? "当前页面主持" : "另一页面主持中"}</span></div>
    {!c.leader && <NextButton onClick={() => void c.claim()}>使用当前页面主持</NextButton>}
    {!!c.error && <p className="error" role="alert">{errorText(c.error)}</p>}
    {c.pending && <button className="button secondary full-width" disabled={c.busy} onClick={() => void c.send()}>重试原请求</button>}
    <VoiceControls voice={voice} disabled={blocked} changeAllowed={["lobby", "end"].includes(v.phase) || v.paused} />
    <section className="host-cue"><span className="eyebrow">当前公开指令</span><h3>{v.narration.pending ? "公共公告" : v.nightRole ? `${roleNames[v.nightRole]}${v.phase === "night_close" ? "请闭眼" : "请睁眼"}` : phaseNames[v.phase]}</h3>
      {voice.text && <p className="cue-caption">{voice.text}</p>}
      {v.narration.pending ? voice.mode === "text" ? <NextButton disabled={blocked} onClick={() => void c.send({ type: "announcement_done", cueId: v.narration.pending!.id })}>公开公告已读完</NextButton> : <p role="status">{v.paused ? "公告尚未播完" : "等待公共播报完成"}</p> : null}
      {v.paused ? <NextButton disabled={blocked || !voice.ready || (voice.mode === "text" && !!v.narration.pending)} onClick={() => void c.send({ type: "resume" })}><Play size={18} aria-hidden />恢复对局</NextButton>
        : v.phase === "lobby" ? <NextButton disabled={blocked || !host.canStart || !!v.narration.pending || !voice.ready} onClick={() => void c.send({ type: "start" })}>开始发牌</NextButton>
          : v.phase === "reveal" ? <NextButton disabled={blocked || !host.canBeginNight} onClick={() => void c.send({ type: "begin_night" })}>开始首夜</NextButton>
            : host.cueId && voice.mode === "text" ? <NextButton disabled={blocked || !!v.narration.pending} onClick={() => void c.send({ type: "cue_ack" })}>{v.phase === "dawn" ? "发布出局公告" : "当前指令完成"}</NextButton>
              : v.phase === "night_action" ? <p className="muted">等待固定窗口结束</p> : null}
    </section>
    {v.phase === "day" && <section className="vote-form"><div className="section-heading"><h3>白天投票结果</h3><span>{host.dayDraft?.confirmed ? "待发布" : "草案"}</span></div>
      <SeatGrid players={v.players} mode="target" selected={target} disabled={() => blocked || v.paused} onSelect={(id) => { setTarget(id); setPublish(false); }} />
      <button className="pass-choice" aria-pressed={target === null} disabled={blocked || v.paused} onClick={() => { setTarget(null); setPublish(false); }}>本轮无人出局</button>
      <NextButton disabled={blocked || v.paused || target === undefined} onClick={() => { setPublish(false); void c.send({ type: "day_draft", targetId: target! }); }}>保存草案</NextButton>
      {host.dayDraft && <div className="draft-review"><h4>{seat(host.dayDraft.targetId)}{host.dayDraft.targetId ? "出局" : ""}</h4><span>{host.dayDraft.confirmed ? "已核对，等待发布" : "尚未确认"}</span>
        {!host.dayDraft.confirmed ? <button className="button secondary" disabled={blocked || v.paused} onClick={() => void c.send({ type: "day_confirm", draftId: host.draftId! })}><Check size={18} aria-hidden />确认待发布</button>
          : publish ? <div className="confirm-inline"><p>确认发布：{seat(host.dayDraft.targetId)}{host.dayDraft.targetId ? "出局" : ""}？</p><NextButton disabled={blocked || v.paused || !!v.narration.pending} onClick={() => { setPublish(false); void c.send({ type: "day_publish", draftId: host.draftId! }); }}>确认发布</NextButton><button className="text-link" onClick={() => setPublish(false)}>取消</button></div>
            : <NextButton disabled={blocked || v.paused || !!v.narration.pending} onClick={() => setPublish(true)}>发布结果</NextButton>}
      </div>}
    </section>}
    {v.phase === "lobby" && <section className="host-roster"><h3>席位维护</h3>{v.players.filter((p) => p.id !== v.self.playerId).map((p) => <div key={p.id}><span>{p.seat} 号 · {p.name}</span><IconButton icon={UserMinus} label={`移除${p.seat}号`} disabled={blocked} onClick={() => { if (window.confirm(`移除 ${p.seat} 号 ${p.name}？`)) void c.send({ type: "kick", playerId: p.id }); }} /></div>)}</section>}
    {!["lobby", "end"].includes(v.phase) && <section className="host-maintenance">{!v.paused && <button className="button secondary" disabled={blocked} onClick={() => void c.send({ type: "pause" })}><Pause size={18} aria-hidden />暂停对局</button>}
      {abort ? <div className="confirm-inline"><p>确认中止本局？</p><button className="button danger" disabled={blocked} onClick={() => { setAbort(false); void c.send({ type: "abort" }); }}>确认中止</button><button className="text-link" onClick={() => setAbort(false)}>取消</button></div>
        : <button className="text-link danger-text" disabled={blocked} onClick={() => setAbort(true)}><Square size={16} aria-hidden />中止本局</button>}
    </section>}
  </div>;
}

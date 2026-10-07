"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Crosshair, Moon } from "lucide-react";
import { Brand } from "./components";
import { initialize, request, errorText } from "./api";
import type { Recap } from "./contracts";
import { eventText, roleNames, winnerName } from "./content";

const actionNames: Record<string, string> = { guard: "守护", see: "查验", save: "解药", poison: "毒药", pass: "放弃" };
export function RecapScreen({ roomId, gameId }: { roomId: string; gameId: string }) {
  const [data, setData] = useState<Recap | null>(null); const [error, setError] = useState<unknown>(null);
  useEffect(() => { let active = true; initialize().then(() => request<Recap>(`rooms/${roomId}/recaps/${gameId}`)).then((d) => { if (active) setData(d); }).catch((e) => { if (active) setError(e); }); return () => { active = false; }; }, [roomId, gameId]);
  const seat = (id: string | null) => id ? `${data?.participants.find((p) => p.id === id)?.seat ?? "?"} 号` : "放弃";
  return <main className="recap-page"><Brand back={`/r/${roomId}`} /><section className="recap-heading"><span className="eyebrow">THE RECAP / {roomId}</span><h1>{data ? winnerName(data.winner, data.aborted) : "对局档案"}</h1><Link className="text-link" href={`/r/${roomId}`}><ArrowLeft size={17} aria-hidden />返回这一桌</Link></section>
    {error ? <p className="error" role="alert">{errorText(error)}</p> : !data ? <p role="status">正在读取本局记录</p> : <><section className="recap-identities"><div className="section-heading"><h2>揭开身份</h2><span>{data.participants.length} 人</span></div><div className="role-gallery">{data.participants.map((p) => <article key={p.id}><img src={`/art/${p.role}.webp`} alt="" width="240" height="320" /><div><span className="eyebrow">{p.seat} 号</span><h3>{roleNames[p.role!]}</h3><p>{p.name}</p><span className={p.alive ? "success" : "muted"}>{p.alive ? "存活" : "已出局"}</span></div></article>)}</div></section>
      <section className="night-recap"><div className="section-heading"><h2>逐夜记录</h2><span>{data.nights.length} 夜</span></div>{data.nights.length ? data.nights.map((night) => <section key={night.number} className="night-entry"><h3><Moon size={18} aria-hidden />第 {night.number} 夜</h3><div className="recap-action"><Crosshair size={17} aria-hidden /><span>狼人共同目标</span><strong>{night.killLocked ? night.killTargetId ? seat(night.killTargetId) : "空刀" : "未锁定"}</strong></div>{night.actions.map((a, i) => <div className="recap-action" key={i}><Check size={17} aria-hidden /><span>{seat(a.actorId)} · {actionNames[a.kind]}</span><strong>{seat(a.targetId)}</strong></div>)}<p className="night-result">{night.deaths.length ? `出局：${night.deaths.map((d) => `${seat(d.playerId)}（${d.causes.map((c) => ({ wolf: "狼刀", poison: "毒药", vote: "投票", shot: "猎人开枪" })[c]).join("、")}）`).join("，")}` : "平安夜"}</p></section>) : <p className="muted">没有已完成的夜晚</p>}</section>
      <section className="recap-public"><h2>公开进程</h2><ol>{data.publicEvents.map((event, i) => <li key={i}>{eventText(event, (id) => seat(id))}</li>)}</ol></section></>}
    <footer className="site-footer"><span>WEREWOLF</span><span>本局参与者档案</span></footer>
  </main>;
}

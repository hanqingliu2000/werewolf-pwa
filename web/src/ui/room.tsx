"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowRight, BookOpen, Copy, Eye, History, LogOut, Radio, Settings, Share2, UserRoundPen, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRoom } from "./use-room";
import { Brand, ConfigEditor, IconButton, Modal, NextButton, RuleList, SeatGrid } from "./components";
import { HostControls } from "./host-controls";
import { PrivateTask } from "./private-task";
import { errorText, request } from "./api";
import { eventText, phaseNames, roleNames, winnerName } from "./content";
import type { RuleConfig } from "../game/types";
import { preset } from "../game/config";

function Invitation({ roomId }: { roomId: string }) {
  const [qr, setQr] = useState(""); const [link, setLink] = useState(""); const [copied, setCopied] = useState("");
  useEffect(() => { let active = true; const url = `${location.origin}/join?room=${roomId}`; setLink(url);
    QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: "#161819", light: "#ffffff" } }).then((data) => { if (active) setQr(data); }).catch(() => { if (active) setCopied("二维码暂不可用"); });
    return () => { active = false; };
  }, [roomId]);
  return <div className="invitation">{qr && <img src={qr} alt={`加入房间 ${roomId} 的二维码`} width="240" height="240" />}<h3>{roomId}</h3><input readOnly aria-label="邀请链接" value={link} onFocus={(e) => e.currentTarget.select()} /><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied("邀请链接已复制"); } catch { setCopied("复制未成功"); } }}><Copy size={18} aria-hidden />复制邀请链接</button><p role="status">{copied}</p></div>;
}
export function RoomScreen({ roomId }: { roomId: string }) {
  const c = useRoom(roomId); const router = useRouter(); const v = c.view;
  const [pane, setPane] = useState<"rules" | "invite" | "rename" | "config" | "history" | null>(null);
  const [name, setName] = useState(""); const [config, setConfig] = useState<RuleConfig>(preset(8));
  const [history, setHistory] = useState<{ gameId: string; winner: string | null; aborted: boolean }[]>([]);
  const [now, setNow] = useState(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => { if (v) localStorage.setItem("ww:recent-room", roomId); }, [v, roomId]);
  if (!v) return <main className="room-page"><Brand back="/" /><div className="loading-page"><span className="eyebrow">ROOM / {roomId}</span><h1>{c.error ? "暂未入席" : "回到这一桌"}</h1>{c.error ? <><p className="error" role="alert">{errorText(c.error)}</p><Link className="button primary" href={`/join?room=${roomId}`}>加入房间<ArrowRight size={18} aria-hidden /></Link><button className="text-link" onClick={() => { c.setError(null); void c.sync().catch(c.setError); }}>重新连接</button></> : <p role="status">正在同步对局</p>}</div></main>;
  const capacity = Object.values(v.config.roles).reduce((a, b) => a + b, 0);
  const own = v.players.find((p) => p.id === v.self.playerId)!;
  const isReady = "ready" in own && own.ready;
  const seat = (id: string) => `${v.players.find((p) => p.id === id)?.seat ?? "?"} 号`;
  const remaining = v.paused ? v.window?.remainingMs ?? 0 : v.window ? Math.max(0, v.window.deadline - v.serverTime - Math.max(0, now - c.receivedAt)) : 0;
  const countdown = Math.ceil(remaining / 1000);
  const cue = v.paused ? "对局已暂停" : v.nightRole ? `${roleNames[v.nightRole]}${v.phase === "night_close" ? "请闭眼" : v.phase === "night_open" ? "请睁眼" : "行动窗口"}` : phaseNames[v.phase];
  const blocked = c.busy || !!c.pending;
  async function openHistory() { try { const data = await request<{ games: typeof history }>(`rooms/${roomId}/recaps`); setHistory(data.games); setPane("history"); } catch (e) { c.setError(e); } }
  return <main className={`room-page ${v.phase === "lobby" ? "is-lobby" : ""}`}><Brand back="/" /><div className="room-top"><div><span className="eyebrow">THE TABLE / {v.phase === "lobby" ? "ASSEMBLE" : `ROUND ${v.nightNo || "00"}`}</span><h1>{v.phase === "lobby" ? "入席，等夜来" : v.phase === "end" ? winnerName(v.winner, v.aborted) : "这一桌"}</h1></div><div className="room-code"><span>房间号</span><strong>{roomId}</strong><IconButton icon={Share2} label="邀请朋友" onClick={() => setPane("invite")} /></div></div>
    {!c.revealed && !c.hostOpen && !!c.error && <div className="error-banner" role="alert">{c.pending ? "有一项请求等待确认" : "状态暂未更新"}<button className="text-link" disabled={c.busy} onClick={() => { if (c.pending) void c.send(); else { c.setError(null); void c.sync().catch(c.setError); } }}>{c.pending ? "重试原请求" : "重新同步"}</button></div>}
    <div className="room-layout"><section className="room-main">{v.phase === "lobby" ? <><div className="section-heading"><h2>席位</h2><span><Users size={17} aria-hidden />{v.players.length} / {capacity} 人</span></div><SeatGrid players={v.players} capacity={capacity} ownId={own.id} selected={own.id} mode="lobby" onSelect={(_, n) => { if (!blocked) void c.send({ type: "seat", seat: n }); }} />
      <div className="lobby-actions"><NextButton busy={c.busy} disabled={blocked} onClick={() => void c.send({ type: "ready", ready: !isReady })}>{isReady ? "取消准备" : "准备好了"}</NextButton><IconButton icon={UserRoundPen} label="修改昵称" onClick={() => { setName(own.name); setPane("rename"); }} /></div>
      {v.self.isHost && <button className="button secondary full-width" onClick={() => void c.showHost()}><Radio size={18} aria-hidden />主持控制</button>}</> : <>
      <div className="public-stage"><div className="stage-line"><span className="eyebrow">{v.nightNo ? `第 ${v.nightNo} 夜` : "身份确认"}</span><span className="stage-status">{v.paused ? "暂停" : phaseNames[v.phase]}</span></div><h2>{cue}</h2>{v.window && <div className="countdown" aria-label="窗口剩余时间">{v.paused ? Math.ceil(remaining / 1000).toString().padStart(2, "0") : countdown.toString().padStart(2, "0")}<span>秒</span></div>}
        {v.phase !== "end" && <div className="neutral-identity"><div className="back-art" aria-hidden /><button className="button secondary" onClick={() => void c.showPrivate()}><Eye size={18} aria-hidden />{v.phase === "reveal" ? "查看身份" : "查看当前任务"}</button></div>}
        {v.phase === "end" && <div className="end-actions"><Link className="button primary" href={`/r/${roomId}/recap/${v.epochId}`}>查看本局复盘<ArrowRight size={18} aria-hidden /></Link>{v.self.isHost && <button className="button secondary" disabled={blocked || !c.leader} onClick={() => void c.send({ type: "restart" })}>下一局</button>}</div>}
      </div><div className="section-heading"><h2>这一桌的人</h2><span>{own.seat} 号 · 本人</span></div><SeatGrid players={v.players} ownId={own.id} />
      {v.self.isHost && <button className="button secondary full-width host-entry" onClick={() => void c.showHost()}><Radio size={18} aria-hidden />主持控制</button>}
      </>}
    </section><aside className="room-sidebar"><div className="section-heading"><h2>本局配置</h2><IconButton icon={BookOpen} label="公开规则" onClick={() => setPane("rules")} /></div><div className="config-summary"><div><span>胜负规则</span><strong>{v.config.winMode === "edge" ? "屠边" : "人数胜负"}</strong></div>{Object.entries(v.config.roles).filter(([, n]) => n > 0).map(([role, n]) => <div key={role}><span>{roleNames[role as keyof typeof roleNames]}</span><strong>× {n}</strong></div>)}</div>
      {v.phase === "lobby" && v.self.isHost && <button className="text-link" onClick={() => { setConfig(v.config); setPane("config"); }}><Settings size={16} aria-hidden />修改配置</button>}
      <section className="public-records"><div className="section-heading"><h2>桌边记录</h2><IconButton icon={History} label="参与过的对局" onClick={() => void openHistory()} /></div>{v.events.length ? <ol>{v.events.map((event, i) => <li key={i}>{eventText(event, seat)}</li>)}</ol> : <div className="empty-record"><span className="record-line" /><p>尚未开始</p></div>}</section>
      {v.phase === "lobby" && !v.self.isHost && <button className="text-link danger-text" disabled={blocked} onClick={async () => { if (window.confirm("确认退出这个房间？") && await c.send({ type: "leave" })) router.push("/"); }}><LogOut size={16} aria-hidden />退出房间</button>}
    </aside></div><footer className="site-footer"><span>WEREWOLF</span><span>{own.seat} 号 · {own.name}</span></footer>
    <Modal open={c.revealed} title="本人私密视角" onClose={c.conceal} privatePanel>{c.revealed && <PrivateTask key={v.windowId} controller={c} />}</Modal>
    <Modal open={c.hostOpen} title="主持控制" onClose={c.closeHost}><HostControls key={`${v.phase}:${v.epochId}`} controller={c} /></Modal>
    <Modal open={pane === "invite"} title="邀请入席" onClose={() => setPane(null)}><Invitation roomId={roomId} /></Modal>
    <Modal open={pane === "rules"} title="公开规则" onClose={() => setPane(null)}><RuleList config={v.config} /></Modal>
    <Modal open={pane === "rename"} title="修改昵称" onClose={() => setPane(null)}><form onSubmit={async (e) => { e.preventDefault(); if (await c.send({ type: "rename", name })) setPane(null); }}><label className="field">昵称<input disabled={c.busy || !!c.pending} value={name} maxLength={48} required onChange={(e) => setName(e.target.value)} /></label>{!!c.error && <p className="error">{errorText(c.error)}</p>}<NextButton type="submit" busy={c.busy}>{c.pending ? "重试原请求" : "保存昵称"}</NextButton></form></Modal>
    <Modal open={pane === "config"} title="本局配置" onClose={() => setPane(null)}><fieldset disabled={c.busy || !!c.pending}><ConfigEditor value={config} onChange={setConfig} /></fieldset>{!!c.error && <p className="error">{errorText(c.error)}</p>}<NextButton busy={c.busy} onClick={async () => { if (await c.send({ type: "configure", config })) setPane(null); }}>{c.pending ? "重试原请求" : "保存配置"}</NextButton></Modal>
    <Modal open={pane === "history"} title="参与过的对局" onClose={() => setPane(null)}>{history.length ? <div className="history-list">{history.map((g, i) => <Link key={g.gameId} href={`/r/${roomId}/recap/${g.gameId}`}><span>记录 {i + 1}</span><strong>{winnerName(g.winner, g.aborted)}</strong><ArrowRight size={18} aria-hidden /></Link>)}</div> : <p>暂无已结束对局</p>}</Modal>
  </main>;
}

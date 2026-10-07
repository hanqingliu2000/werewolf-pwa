"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { preset, validateConfig } from "../game/config";
import { Brand, ConfigEditor, IconButton, Modal, NextButton, RuleList } from "./components";
import { ApiError, errorText, initialize, request } from "./api";
import type { Receipt } from "./contracts";
import type { RuleConfig } from "../game/types";

type Invitation = { roomId: string; epochId: string; phase: string; config: RuleConfig; occupiedSeats: number[] };
export function Entry({ initialMode = "create", initialRoom = "" }: { initialMode?: "create" | "join"; initialRoom?: string }) {
  const router = useRouter(); const [mode, setMode] = useState(initialMode); const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(initialRoom.toUpperCase()); const [config, setConfig] = useState(preset(8));
  const [invitation, setInvitation] = useState<Invitation | null>(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [rules, setRules] = useState(false); const [recent, setRecent] = useState("");
  const [pending, setPending] = useState<{ path: string; input: unknown } | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setRecent(localStorage.getItem("ww:recent-room") ?? ""); setReady(true); }, []);
  useEffect(() => {
    let active = true; setInvitation(null);
    if (mode === "join" && /^[A-F0-9]{8}$/.test(roomId)) initialize().then(async () => {
      try {
        await request(`rooms/${roomId}`);
        if (active) { localStorage.setItem("ww:recent-room", roomId); router.replace(`/r/${roomId}`); }
        return null;
      } catch (error) { if (!(error instanceof ApiError) || error.code !== "INVALID_SESSION") throw error; }
      return request<Invitation>(`rooms/${roomId}/invitation`);
    }).then((data) => { if (active && data) { setInvitation(data); setError(""); } }).catch((e) => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, [mode, roomId, router]);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      await initialize();
      let work = pending;
      if (!work) {
        if (mode === "create") { try { validateConfig(config); } catch { throw new ApiError("CONFIG_INVALID"); }
          work = { path: "rooms", input: { requestId: crypto.randomUUID(), name, config } };
        } else {
          if (!invitation) throw new ApiError("ROOM_UNAVAILABLE");
          work = { path: `rooms/${roomId}/join`, input: { requestId: crypto.randomUUID(), epochId: invitation.epochId, name } };
        }
      }
      setPending(work); const receipt = await request<Receipt>(work.path, work.input);
      localStorage.setItem("ww:recent-room", receipt.roomId); router.push(`/r/${receipt.roomId}`);
    } catch (e) { setError(errorText(e)); if (!(e instanceof ApiError) || !["NETWORK_UNKNOWN", "INTERNAL_ERROR"].includes(e.code)) setPending(null); }
    finally { setBusy(false); }
  }
  return <main className="entry-page"><section className="entry-scene"><Brand /><div className="scene-copy"><span className="eyebrow">THE NIGHT IS OURS</span><h1>狼人杀</h1><p className="scene-cue">天黑，请闭眼。</p></div><div className="entry-nav"><div className="entry-tabs" role="group" aria-label="入场方式"><button type="button" aria-pressed={mode === "create"} onClick={() => { setMode("create"); setPending(null); setError(""); }}>创建房间</button><button type="button" aria-pressed={mode === "join"} onClick={() => { setMode("join"); setPending(null); setError(""); }}>加入房间</button></div><IconButton icon={BookOpen} label="查看游戏规则" onClick={() => setRules(true)} /></div></section>
    <section className="entry-workspace"><div className="entry-form"><div className="section-heading"><div><span className="eyebrow">{mode === "create" ? "01 / ASSEMBLE" : "02 / ENTER"}</span><h2>{mode === "create" ? "今晚，开一局" : "回到这一桌"}</h2></div><span className="edition">8 至 12 人</span></div>
      {recent && <Link className="recent-room" href={`/r/${recent}`}>继续房间 {recent}<ArrowUpRight size={18} aria-hidden /></Link>}
      <form onSubmit={submit} aria-label={mode === "create" ? "创建房间" : "加入房间"}>
        <fieldset disabled={!ready || busy || pending !== null}><label className="field">你的昵称<input name="name" autoComplete="nickname" maxLength={48} required value={name} placeholder="桌上的你" onChange={(e) => setName(e.target.value)} /></label>
        {mode === "join" ? <label className="field">房间号<input name="room" value={roomId} required pattern="[A-Fa-f0-9]{8}" maxLength={8} placeholder="8 位房间号" autoCapitalize="characters" autoComplete="off" onChange={(e) => setRoomId(e.target.value.toUpperCase())} /></label> : <ConfigEditor value={config} onChange={setConfig} />}</fieldset>
        {invitation && mode === "join" && <div className="invite-summary"><span>{invitation.phase === "lobby" ? "集结中" : "对局已开始"}</span><strong>{invitation.occupiedSeats.length} / {Object.values(invitation.config.roles).reduce((a, b) => a + b, 0)} 人</strong><button className="text-link" type="button" onClick={() => setRules(true)}>本局规则</button></div>}
        {error && <p className="error" role="alert">{error}</p>}<NextButton type="submit" busy={busy} disabled={!ready || (mode === "join" && !invitation)}>{pending ? "重试原请求" : mode === "create" ? "创建房间" : "加入房间"}</NextButton>
        {pending && !busy && <button type="button" className="text-link" onClick={() => { setPending(null); setError(""); }}>重新核对输入</button>}
      </form></div><aside className="entry-aside"><span className="eyebrow">THE TABLE</span><h2>月下的席位</h2><div className="back-art" role="img" aria-label="统一月纹牌背" /><div className="aside-rule"><span>本局胜负</span><strong>{(invitation?.config ?? config).winMode === "edge" ? "屠边" : "人数胜负"}</strong></div><div className="aside-rule"><span>主持方式</span><strong>文字主持</strong></div></aside></section>
    <footer className="site-footer"><span>WEREWOLF</span><span>夜幕 · 同席</span></footer>
    <Modal open={rules} title="公开规则" onClose={() => setRules(false)}><RuleList config={invitation?.config ?? config} /></Modal>
  </main>;
}

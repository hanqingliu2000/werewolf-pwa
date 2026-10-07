"use client";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, Moon, X, type LucideIcon } from "lucide-react";
import type { RuleConfig, Role } from "../game/types";
import { ROLES } from "../game/types";
import { preset } from "../game/config";
import { roleNames, roleRules } from "./content";

export function IconButton({ icon: Icon, label, ...props }: { icon: LucideIcon; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}><Icon size={20} strokeWidth={1.6} aria-hidden /></button>;
}
export function Brand({ back }: { back?: string }) {
  return <header className="site-header"><Link href={back ?? "/"} className="brand">{back ? <ArrowLeft size={20} aria-hidden /> : <Moon size={22} strokeWidth={1.4} aria-hidden />}<span>狼人杀</span></Link><span className="wordmark" aria-hidden>WEREWOLF</span></header>;
}
export function Modal({ open, title, onClose, children, privatePanel = false }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; privatePanel?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <dialog ref={dialog} aria-labelledby={titleId} className={`modal ${privatePanel ? "private-modal" : ""}`} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-header"><h2 id={titleId}>{title}</h2><IconButton icon={X} label="关闭面板" onClick={onClose} /></div><div className="modal-body">{children}</div>
  </dialog>;
}
export function RuleList({ config }: { config: RuleConfig }) {
  return <div className="rules-list"><div className="section-heading"><h3>本局规则</h3><span>{config.winMode === "edge" ? "屠边" : "人数胜负"}</span></div>
    <p>{config.winMode === "edge" ? "平民全部出局或神职全部出局，狼人获胜。" : "存活狼人数不少于存活好人数，狼人获胜。"}狼人全部出局则好人获胜，全员出局为平局。</p>
    {ROLES.filter((role) => config.roles[role] > 0).map((role) => <section key={role}><h4>{roleNames[role]} <span>× {config.roles[role]}</span></h4><p>{roleRules[role]}</p></section>)}
    <p>夜晚依次呼叫守卫、狼人、女巫、预言家。出局不自动公开身份，猎人除外。</p>
  </div>;
}
export function ConfigEditor({ value, onChange }: { value: RuleConfig; onChange: (config: RuleConfig) => void }) {
  const count = Object.values(value.roles).reduce((a, b) => a + b, 0);
  return <div className="config-editor"><fieldset><legend>对局人数</legend><div className="segments count-segments">{[8, 9, 10, 11, 12].map((n) => <button type="button" key={n} aria-pressed={n === count} onClick={() => onChange(preset(n, value.winMode))}>{n} 人</button>)}</div></fieldset>
    <fieldset><legend>胜负规则</legend><div className="segments"><button type="button" aria-pressed={value.winMode === "edge"} onClick={() => onChange({ ...value, winMode: "edge" })}>屠边</button><button type="button" aria-pressed={value.winMode === "parity"} onClick={() => onChange({ ...value, winMode: "parity" })}>人数胜负</button></div></fieldset>
    <div className="composition">{ROLES.map((role) => <div className="composition-row" key={role}><span>{roleNames[role]}</span><span className="count-number">{value.roles[role]}</span></div>)}</div>
    <details className="advanced"><summary>自定义配比</summary><div className="custom-counts">{ROLES.map((role) => <label key={role}>{roleNames[role]}<input aria-label={`${roleNames[role]}数量`} type="number" min="0" max={["seer", "witch", "guard", "hunter"].includes(role) ? 1 : 12} value={value.roles[role]} onChange={(e) => onChange({ ...value, roles: { ...value.roles, [role]: Number(e.target.value) } })} /></label>)}</div></details>
  </div>;
}
export function SeatGrid({ players, capacity, selected, ownId, onSelect, disabled, mode = "public" }: {
  players: { id: string; seat: number; name: string; alive?: boolean; ready?: boolean; revealedRole?: Role | null }[];
  capacity?: number; selected?: string | null; ownId?: string; onSelect?: (id: string | null, seat: number) => void;
  disabled?: (id: string) => boolean; mode?: "public" | "target" | "lobby";
}) {
  const slots: { id: string | null; seat: number; name: string; alive?: boolean; ready?: boolean; revealedRole?: Role | null }[] = Array.from({ length: capacity ?? players.length }, (_, i) => players.find((p) => p.seat === i + 1) ?? { id: null, seat: i + 1, name: "空座位" });
  return <div className={`seat-grid ${mode}`} role={onSelect ? "group" : undefined} aria-label="玩家座位">{slots.map((p) => {
    const unavailable = p.id !== null && (p.alive === false || disabled?.(p.id));
    const content = <><span className="seat-no">{String(p.seat).padStart(2, "0")}</span><span className="seat-name">{p.name}</span><span className="seat-status">{p.id === ownId ? "本人 · " : ""}{p.id === null ? "待入场" : p.alive === false ? "已出局" : mode === "lobby" ? p.ready ? "已准备" : "未准备" : p.revealedRole ? roleNames[p.revealedRole] : "存活"}</span>{p.id === selected && <Check className="seat-check" size={18} aria-hidden />}</>;
    return onSelect ? <button type="button" key={p.seat} className="seat" aria-label={`${p.seat}号 ${p.name}`} aria-pressed={p.id !== null && selected === p.id} disabled={mode === "lobby" ? p.id !== null && p.id !== ownId : p.id === null || unavailable} onClick={() => onSelect(p.id, p.seat)}>{content}</button>
      : <div key={p.seat} className={`seat ${p.alive === false ? "eliminated" : ""}`}>{content}</div>;
  })}</div>;
}
export function NextButton({ children, busy, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button className="button primary" {...props} disabled={busy || props.disabled}><span>{busy ? "正在保存" : children}</span><ArrowRight size={19} aria-hidden /></button>;
}

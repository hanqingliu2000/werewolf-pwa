import type { PrivateRoom } from "./contracts";

export function WolfTeam({ info }: { info: PrivateRoom }) {
  if (!info.teammates) return null;
  return <section className="private-records wolf-team" aria-label="狼人队友"><h3>狼队</h3>{info.teammates.map((p) => <div key={p.id}><strong>{p.seat} 号{p.id === info.playerId ? " · 本人" : ""}</strong><span>{p.name}</span><span>{p.alive ? "存活" : "已出局"}</span></div>)}</section>;
}

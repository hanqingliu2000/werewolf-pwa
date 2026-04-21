'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type MsgKind = 'error' | 'success' | 'info';

const baseRoles = { werewolf: 1, seer: 1, witch: 1, guard: 1, hunter: 1 };
const roleZh: Record<string, string> = {
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  guard: '守卫',
  hunter: '猎人',
};

export default function CreateRoomPage() {
  const router = useRouter();
  const [hostName, setHostName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [targetPlayers, setTargetPlayers] = useState(8);
  const [roles, setRoles] = useState(baseRoles);
  const [guardCanRepeatProtect, setGuardCanRepeatProtect] = useState(false);
  const [witchCanSaveAndPoisonSameNight, setWitchCanSaveAndPoisonSameNight] = useState(false);
  const [hunterCanShootWhenPoisoned, setHunterCanShootWhenPoisoned] = useState(false);
  const [hunterCanShootWhenKilled, setHunterCanShootWhenKilled] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [msg, setMsg] = useState<{ kind: MsgKind; text: string } | null>(null);

  useEffect(() => {
    const nick = localStorage.getItem('ww:nick') || '';
    setHostName(nick);
  }, []);

  const assigned = useMemo(() => Object.values(roles).reduce((a, b) => a + b, 0), [roles]);
  const villagers = Math.max(0, targetPlayers - assigned);

  async function createRoom() {
    if (!hostName.trim()) return setMsg({ kind: 'error', text: '请先填写你的昵称。' });
    if (assigned > targetPlayers) return setMsg({ kind: 'error', text: '角色总数不能超过目标人数。' });

    setMsg(null);
    const payload = {
      hostName,
      roomName,
      targetPlayers,
      rolePlan: { ...roles, villager: villagers },
      ruleConfig: {
        guardCanRepeatProtect,
        witchCanSaveAndPoisonSameNight,
        hunterCanShootWhenPoisoned,
        hunterCanShootWhenKilled,
      },
    };
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `创建失败：${json.error}` });

    localStorage.setItem('ww:nick', hostName.trim());
    localStorage.setItem(`ww:player:${json.room.id}`, json.hostPlayer.id);
    localStorage.setItem(`ww:token:${json.room.id}`, json.hostPlayer.sessionToken);
    setMsg({ kind: 'success', text: '房间创建成功，正在进入大厅…' });
    router.push(`/room/${json.room.id}/lobby?playerId=${encodeURIComponent(json.hostPlayer.id)}`);
  }

  return (
    <main>
      <div className="card">
        <div className="kicker">Dark Tabletop Setup</div>
        <h2>创建房间</h2>
        <p>先配置基础人数与身份，再按需展开进阶规则。</p>

        <div className="grid">
          <div>
            <label>你的昵称</label>
            <input placeholder="例如：主持人A" value={hostName} onChange={(e) => setHostName(e.target.value)} />
          </div>
          <div>
            <label>房间名（可选）</label>
            <input placeholder="今晚面杀局" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          </div>
        </div>

        <div className="panel-muted" style={{ marginTop: 12 }}>
          <h3>基础配置</h3>
          <label>目标人数：{targetPlayers}</label>
          <input type="range" min={4} max={12} value={targetPlayers} onChange={(e) => setTargetPlayers(Number(e.target.value))} />

          <div className="grid" style={{ marginTop: 8 }}>
            {Object.keys(baseRoles).map((role) => (
              <div key={role}>
                <label>{roleZh[role] || role}</label>
                <input
                  type="number"
                  min={0}
                  value={roles[role as keyof typeof baseRoles]}
                  onChange={(e) => setRoles((prev) => ({ ...prev, [role]: Number(e.target.value || 0) }))}
                />
              </div>
            ))}
          </div>
          <p>
            <span className="badge">平民自动补足：{villagers}</span>
          </p>
          {assigned > targetPlayers ? <p className="toast error">角色总数已超过目标人数，请调整。</p> : null}
        </div>

        <div className="panel-muted" style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ marginBottom: 0 }}>进阶规则</h3>
            <button className="secondary" onClick={() => setShowAdvanced((v) => !v)}>{showAdvanced ? '收起' : '展开'}</button>
          </div>
          {showAdvanced ? (
            <div style={{ marginTop: 8 }}>
              <label><input type="checkbox" checked={guardCanRepeatProtect} onChange={(e) => setGuardCanRepeatProtect(e.target.checked)} /> 守卫可连守</label><br />
              <label title="危险：会显著增强女巫强度，可能加快局势失衡。"><input type="checkbox" checked={witchCanSaveAndPoisonSameNight} onChange={(e) => setWitchCanSaveAndPoisonSameNight(e.target.checked)} /> 女巫可同夜救+毒（⚠ 高影响）</label><br />
              <label><input type="checkbox" checked={hunterCanShootWhenPoisoned} onChange={(e) => setHunterCanShootWhenPoisoned(e.target.checked)} /> 猎人被毒可开枪</label><br />
              <label><input type="checkbox" checked={hunterCanShootWhenKilled} onChange={(e) => setHunterCanShootWhenKilled(e.target.checked)} /> 猎人被刀可开枪</label>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>默认采用稳健配置。仅在熟悉规则时调整。</p>
          )}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button onClick={createRoom}>完成创建</button>
          <a href="/"><button className="secondary">返回</button></a>
        </div>

        {msg ? <p className={`toast ${msg.kind}`}>{msg.text}</p> : null}
      </div>
    </main>
  );
}

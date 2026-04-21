'use client';

import { useMemo, useState } from 'react';

type PlayerLite = { id: string; name: string; alive: boolean; role: string | null };

const roleZh: Record<string, string> = { guard: '守卫', werewolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人', villager: '平民' };
const actionZh: Record<string, string> = { guard: '守护', kill: '击杀', see: '查验', save: '救人', poison: '毒人' };

type RoomSnapshot = {
  room: {
    id: string;
    name: string;
    status: string;
    currentPhase: string;
    currentNightNo: number;
    phaseVersion: number;
  };
  players: PlayerLite[];
  nightActions?: Array<{ actorPlayerId: string; targetPlayerId: string; actionType: string }>;
};

export function RoomConsole() {
  const [hostName, setHostName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [hostPlayerId, setHostPlayerId] = useState('');
  const [hostToken, setHostToken] = useState('');
  const [state, setState] = useState<RoomSnapshot | null>(null);
  const [msg, setMsg] = useState('');

  const [actorId, setActorId] = useState('');
  const [actorToken, setActorToken] = useState('');
  const [targetId, setTargetId] = useState('');
  const [actionType, setActionType] = useState<'guard' | 'kill' | 'see' | 'save' | 'poison'>('guard');
  const [dayEliminatedId, setDayEliminatedId] = useState('');

  const alivePlayers = useMemo(() => (state?.players ?? []).filter((p) => p.alive), [state]);

  async function create() {
    setMsg('');
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName, roomName: roomName || undefined }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`创建失败：${json.error}`);
    setRoomId(json.room.id);
    setHostPlayerId(json.hostPlayer.id);
    setHostToken(json.hostPlayer.sessionToken);
    localStorage.setItem(`ww:player:${json.room.id}`, json.hostPlayer.id);
    localStorage.setItem(`ww:token:${json.room.id}`, json.hostPlayer.sessionToken);
    setMsg(`创建成功，房间号：${json.room.id}`);
    await refresh(json.room.id);
  }

  async function join() {
    setMsg('');
    const res = await fetch(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: playerName }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`加入失败：${json.error}`);
    setActorId(json.player.id);
    setActorToken(json.player.sessionToken);
    setMsg(`加入成功：${json.player.name}，已填入行动者 ID/token。`);
    await refresh(roomId);
  }

  async function start() {
    setMsg('');
    const res = await fetch(`/api/rooms/${roomId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': hostToken },
      body: JSON.stringify({ playerId: hostPlayerId }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`开始失败：${json.error}`);
    setMsg(`已开始，当前阶段：${json.room.currentPhase}`);
    await refresh(roomId);
  }

  async function submitAction() {
    setMsg('');
    const res = await fetch(`/api/rooms/${roomId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': actorToken },
      body: JSON.stringify({ actorPlayerId: actorId, targetPlayerId: targetId, actionType }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`夜晚操作失败：${json.error}`);
    setMsg(`夜晚操作成功：${actionZh[json.acceptedAction] || json.acceptedAction}`);
    await refresh(roomId);
  }

  async function resolveNight() {
    setMsg('');
    const res = await fetch(`/api/rooms/${roomId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': hostToken },
      body: JSON.stringify({ hostPlayerId }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`夜晚结算失败：${json.error}`);
    const deaths = (json.deaths ?? []).map((d: { name: string }) => d.name).join('、') || '无人出局';
    setMsg(`夜晚结算完成：${deaths}`);
    await refresh(roomId);
  }

  async function toDayInput() {
    setMsg('');
    const res = await fetch(`/api/rooms/${roomId}/day-announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': hostToken },
      body: JSON.stringify({ hostPlayerId }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`进入白天录入失败：${json.error}`);
    setMsg(`已进入白天录入阶段：${json.room.currentPhase}`);
    await refresh(roomId);
  }

  async function submitDayVote(noKill = false) {
    setMsg('');
    const res = await fetch(`/api/rooms/${roomId}/day-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': hostToken },
      body: JSON.stringify({ hostPlayerId, eliminatedPlayerId: noKill ? null : dayEliminatedId || null }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`白天录入失败：${json.error}`);
    if (json.winner) {
      setMsg(`本局结束，胜者：${json.winner === 'good' ? '好人' : '狼人'}`);
    } else {
      setMsg(`白天录入成功，已进入下一夜：${json.room.currentNightNo}`);
    }
    await refresh(roomId);
  }

  async function refresh(targetRoomId = roomId) {
    if (!targetRoomId) return;
    const debugQuery = hostPlayerId ? `?revealRoles=1&playerId=${encodeURIComponent(hostPlayerId)}` : '';
    const res = await fetch(`/api/rooms/${targetRoomId}/state${debugQuery}`, {
      headers: hostToken ? { 'x-player-token': hostToken } : {},
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`刷新失败：${json.error}`);
    setState(json);
  }

  return (
    <section className="card">
      <h3>开发控制台（Phase 1~3）</h3>
      <div className="grid">
        <div className="card">
          <div className="kicker">创建房间（Host）</div>
          <input placeholder="房主昵称" value={hostName} onChange={(e) => setHostName(e.target.value)} />
          <input placeholder="房间名（可选）" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          <input placeholder="房主 playerId" value={hostPlayerId} onChange={(e) => setHostPlayerId(e.target.value)} />
          <input placeholder="房主 token" value={hostToken} onChange={(e) => setHostToken(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={create}>创建房间</button>
          </div>
        </div>

        <div className="card">
          <div className="kicker">加入房间（Player）</div>
          <input placeholder="房间号" value={roomId} onChange={(e) => setRoomId(e.target.value.toUpperCase())} />
          <input placeholder="玩家昵称" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={join}>加入</button>
            <button className="secondary" onClick={() => refresh()}>刷新</button>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={start}>房主开始游戏</button>
      </div>

      <div className="card">
        <div className="kicker">夜晚操作提交</div>
        <input placeholder="行动者 playerId" value={actorId} onChange={(e) => setActorId(e.target.value)} />
        <input placeholder="行动者 token" value={actorToken} onChange={(e) => setActorToken(e.target.value)} />
        <input placeholder="目标 playerId" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <select value={actionType} onChange={(e) => setActionType(e.target.value as typeof actionType)}>
            <option value="guard">守护</option>
            <option value="kill">击杀</option>
            <option value="see">查验</option>
            <option value="save">救人</option>
            <option value="poison">毒人</option>
          </select>
          <button onClick={submitAction}>提交夜晚操作</button>
          <button className="secondary" onClick={resolveNight}>房主结算夜晚</button>
        </div>
      </div>

      <div className="card">
        <div className="kicker">白天录入</div>
        <input placeholder="淘汰 playerId（可空）" value={dayEliminatedId} onChange={(e) => setDayEliminatedId(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="secondary" onClick={toDayInput}>进入白天录入</button>
          <button onClick={() => submitDayVote(false)}>录入淘汰</button>
          <button className="secondary" onClick={() => submitDayVote(true)}>录入无人出局</button>
        </div>
      </div>

      {msg ? <p>{msg}</p> : null}

      {state ? (
        <div className="card">
          <div className="kicker">房间状态</div>
          <p>
            <b>{state.room.name}</b>（{state.room.id}） / {state.room.status} / {state.room.currentPhase} /
            夜晚 {state.room.currentNightNo} / v{state.room.phaseVersion}
          </p>
          <ul>
            {state.players.map((p) => (
              <li key={p.id}>{p.name} · {roleZh[p.role || ''] || '未分配'} · {p.alive ? '存活' : '出局'} · id={p.id}</li>
            ))}
          </ul>
          <div className="kicker">当前存活人数：{alivePlayers.length}</div>
        </div>
      ) : null}
    </section>
  );
}

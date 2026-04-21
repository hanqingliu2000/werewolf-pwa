'use client';

import { useEffect, useState } from 'react';

type MeView = {
  room: { id: string; name: string; status: string; currentPhase: string; currentNightNo: number };
  me: { id: string; name: string; alive: boolean; role: string | null };
};

const actionByRole: Record<string, string[]> = {
  guard: ['guard'],
  werewolf: ['kill'],
  seer: ['see'],
  witch: ['save', 'poison'],
};
const roleZh: Record<string, string> = { guard: '守卫', werewolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人', villager: '平民' };
const actionZh: Record<string, string> = { guard: '守护', kill: '击杀', see: '查验', save: '救人', poison: '毒人' };

export default function PlayerPage() {
  const [roomId, setRoomId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [playerToken, setPlayerToken] = useState('');
  const [targetId, setTargetId] = useState('');
  const [meView, setMeView] = useState<MeView | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!roomId) return;
    const cachedPlayerId = localStorage.getItem(`ww:player:${roomId.toUpperCase()}`) || '';
    const cachedToken = localStorage.getItem(`ww:token:${roomId.toUpperCase()}`) || '';
    if (cachedPlayerId) setPlayerId(cachedPlayerId);
    if (cachedToken) setPlayerToken(cachedToken);
  }, [roomId]);

  async function refresh() {
    setMsg('');
    const res = await fetch(`/api/rooms/${roomId}/me?playerId=${encodeURIComponent(playerId)}`, {
      headers: { 'x-player-token': playerToken },
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`获取失败：${json.error}`);
    setMeView(json);
    localStorage.setItem(`ww:player:${roomId.toUpperCase()}`, playerId);
    localStorage.setItem(`ww:token:${roomId.toUpperCase()}`, playerToken);
  }

  async function submit(actionType: 'guard' | 'kill' | 'see' | 'save' | 'poison') {
    setMsg('');
    const res = await fetch(`/api/rooms/${roomId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ actorPlayerId: playerId, targetPlayerId: targetId, actionType }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(`提交失败：${json.error}`);
    setMsg(`提交成功：${json.acceptedAction}`);
    await refresh();
  }

  const actions = meView?.me.role ? actionByRole[meView.me.role] ?? [] : [];

  return (
    <main>
      <div className="card">
        <h2>玩家私密页（MVP）</h2>
        <p className="kicker">仅展示自己的身份与可提交动作</p>
        <input placeholder="房间号" value={roomId} onChange={(e) => setRoomId(e.target.value.toUpperCase())} />
        <input placeholder="玩家ID" value={playerId} onChange={(e) => setPlayerId(e.target.value)} />
        <input placeholder="玩家 Token" value={playerToken} onChange={(e) => setPlayerToken(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={refresh}>刷新我的状态</button>
        </div>
      </div>

      {meView ? (
        <div className="card">
          <p>
            房间：<b>{meView.room.name}</b>（{meView.room.id}） / {meView.room.status} / {meView.room.currentPhase}
          </p>
          <p>
            我是：<b>{meView.me.name}</b> · 身份 <b>{roleZh[meView.me.role || ''] ?? '未分配'}</b> · {meView.me.alive ? '存活' : '出局'}
          </p>
          {meView.me.alive ? (
            <>
              <input placeholder="目标玩家ID" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
              <div className="row" style={{ marginTop: 8 }}>
                {actions.map((a) => (
                  <button key={a} onClick={() => submit(a as 'guard' | 'kill' | 'see' | 'save' | 'poison')}>
                    提交{actionZh[a] || a}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>你已出局，无法继续操作。</p>
          )}
        </div>
      ) : null}

      {msg ? <div className="card">{msg}</div> : null}
    </main>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

type Snapshot = {
  room: { id: string; hostId: string; name: string; status: string; currentPhase: string; ruleConfig?: { targetPlayers?: number } };
  players: Array<{ id: string; name: string; alive: boolean; role: string | null }>;
};

export default function LobbyPage() {
  const params = useParams<{ roomId: string }>();
  const search = useSearchParams();
  const roomId = String(params.roomId || '').toUpperCase();
  const playerId = search.get('playerId') || (typeof window !== 'undefined' ? localStorage.getItem(`ww:player:${roomId}`) || '' : '');
  const playerToken = typeof window !== 'undefined' ? localStorage.getItem(`ww:token:${roomId}`) || '' : '';

  const [state, setState] = useState<Snapshot | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);

  async function refresh() {
    const res = await fetch(`/api/rooms/${roomId}/state`);
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `刷新失败：${json.error}` });
    setState(json);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const targetPlayers = state?.room.ruleConfig?.targetPlayers || state?.players.length || 0;
  const ready = (state?.players.length || 0) >= targetPlayers;
  const isHost = !!state && state.room.hostId === playerId;

  async function startGame() {
    const res = await fetch(`/api/rooms/${roomId}/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ playerId }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `开始失败：${json.error}` });
    setMsg({ kind: 'success', text: `游戏已开始：${json.room.currentPhase}` });
    await refresh();
  }

  async function copyInvite() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteUrl = `${origin}/join?roomId=${encodeURIComponent(roomId)}`;
    const text = `狼人杀房间邀请\n房间号：${roomId}\n加入链接：${inviteUrl}`;

    try {
      await navigator.clipboard.writeText(text);
      setMsg({ kind: 'success', text: '已复制邀请信息（含房间号 + 一键加入链接）。' });
    } catch {
      setMsg({ kind: 'error', text: `复制失败，请手动复制：${inviteUrl}` });
    }
  }

  const statusLine = useMemo(() => {
    if (!state) return '加载中...';
    return `${state.room.name || '未命名房间'}（${state.room.id}）`;
  }, [state]);

  return (
    <main>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <div className="kicker">Lobby</div>
            <h2 style={{ marginBottom: 6 }}>房间等待区</h2>
            <p>{statusLine}</p>
            <p>房间码：<code>{roomId}</code></p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="secondary" onClick={copyInvite}>复制邀请链接</button>
            </div>
          </div>
          <span className="badge">{state?.players.length || 0}/{targetPlayers} 人</span>
        </div>
      </div>

      <div className="grid" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>玩家列表</h3>
          <ul>
            {(state?.players || []).map((p) => (
              <li key={p.id}>{p.name}{p.id === state?.room.hostId ? '（房主）' : ''}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>规则摘要</h3>
          <div className="panel-muted">
            <p>目标人数：{targetPlayers}</p>
            <p>人数状态：{ready ? '已满足开局条件' : '未满足开局条件'}</p>
            <p>流程：夜晚行动 → 夜晚结算 → 白天公布 → 白天录入</p>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <a href={`/room/${roomId}/play?playerId=${encodeURIComponent(playerId)}`}><button>进入对局页</button></a>
            <button className="secondary" onClick={refresh}>刷新</button>
          </div>
        </div>
      </div>

      {isHost ? (
        <div className="fixed-footer">
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ marginBottom: 6 }}>房主操作区</h3>
                <p style={{ color: 'var(--text-muted)' }}>{ready ? '人数就绪，可开始游戏。' : `人数不足：当前 ${state?.players.length || 0} / 目标 ${targetPlayers}`}</p>
              </div>
              <button onClick={startGame} disabled={!ready}>开始游戏</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card"><p>等待房主开始游戏…</p></div>
      )}

      {msg ? <div className={`toast ${msg.kind}`}>{msg.text}</div> : null}
    </main>
  );
}

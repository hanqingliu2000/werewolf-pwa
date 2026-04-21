'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const errZh: Record<string, string> = {
  ROOM_NOT_FOUND: '房间不存在，请确认房间号。',
  PLAYER_NAME_TAKEN: '昵称已被占用，请换一个。',
  PLAYER_NOT_FOUND: '未找到玩家信息，请重试。',
};

const explain = (e?: string) => errZh[e || ''] || e || '未知错误';

export default function JoinRoomPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem('ww:nick') || '';
    const q = new URLSearchParams(window.location.search);
    const queryName = (q.get('name') || '').trim();
    setName(queryName || cached);

    const queryRoom = (q.get('roomId') || q.get('room') || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
    if (queryRoom) setRoomId(queryRoom);
  }, []);

  const normalizedCode = useMemo(() => roomId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6), [roomId]);
  const codeError = normalizedCode && normalizedCode.length !== 6 ? '房间号必须为 6 位。' : '';

  async function joinRoom() {
    if (!name.trim()) return setMsg({ kind: 'error', text: '请先填写昵称。' });
    if (normalizedCode.length !== 6) return setMsg({ kind: 'error', text: '请输入 6 位房间号。' });

    setMsg(null);
    const res = await fetch(`/api/rooms/${normalizedCode}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `加入失败：${explain(json.error)}` });

    localStorage.setItem('ww:nick', name.trim());
    localStorage.setItem(`ww:player:${normalizedCode}`, json.player.id);
    localStorage.setItem(`ww:token:${normalizedCode}`, json.player.sessionToken);
    setMsg({ kind: 'success', text: '加入成功，正在进入大厅…' });
    router.push(`/room/${normalizedCode}/lobby?playerId=${encodeURIComponent(json.player.id)}`);
  }

  return (
    <main>
      <div className="card">
        <div className="kicker">Join Room</div>
        <h2>加入房间</h2>
        <p>输入 6 位房间号与昵称后即可进入等待区。</p>

        <label>房间号</label>
        <input
          placeholder="例如：A1B2C3"
          value={normalizedCode}
          onChange={(e) => setRoomId(e.target.value)}
          style={{ letterSpacing: '0.2em', fontWeight: 700, fontSize: '1.1rem', textTransform: 'uppercase' }}
        />
        {codeError ? <p className="toast error">{codeError}</p> : null}

        <label style={{ marginTop: 8, display: 'inline-block' }}>你的昵称</label>
        <input placeholder="例如：玩家3" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={joinRoom} disabled={normalizedCode.length !== 6}>加入房间</button>
          <a href="/"><button className="secondary">返回</button></a>
        </div>

        {msg ? <p className={`toast ${msg.kind}`}>{msg.text}</p> : null}
      </div>
    </main>
  );
}

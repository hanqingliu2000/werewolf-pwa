'use client';

import { useEffect, useState } from 'react';

export default function HomePage() {
  const [nick, setNick] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('ww:nick') || '';
    setNick(saved);
  }, []);

  function persistNick() {
    const normalized = nick.trim();
    if (!normalized) return false;
    localStorage.setItem('ww:nick', normalized);
    return true;
  }

  return (
    <main>
      <div className="card">
        <div className="kicker">Werewolf PWA</div>
        <h1>狼人杀玩家入口</h1>
        <p>每个人都是玩家，系统负责主持夜晚流程。先设置昵称，再创建或加入房间。</p>
        <input placeholder="你的昵称" value={nick} onChange={(e) => setNick(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <a
            href={persistNick() ? '/create' : '#'}
            onClick={(e) => {
              if (!persistNick()) e.preventDefault();
            }}
          >
            <button>创建房间</button>
          </a>
          <a
            href={persistNick() ? '/join' : '#'}
            onClick={(e) => {
              if (!persistNick()) e.preventDefault();
            }}
          >
            <button className="secondary">加入房间</button>
          </a>
        </div>
      </div>
    </main>
  );
}

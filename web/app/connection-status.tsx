'use client';

import { useEffect, useState } from 'react';

type Status = 'checking' | 'online' | 'offline' | 'degraded';

function labelFor(status: Status) {
  if (status === 'offline') return '离线';
  if (status === 'degraded') return '服务异常';
  if (status === 'checking') return '连接检查中';
  return '在线';
}

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function check() {
      if (!navigator.onLine) {
        if (alive) setStatus('offline');
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch('/api/keepalive', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (alive) setStatus(res.ok ? 'online' : 'degraded');
      } catch {
        if (alive) setStatus('degraded');
      } finally {
        clearTimeout(timeout);
      }
    }

    function onOnline() {
      void check();
    }

    function onOffline() {
      setStatus('offline');
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void check();
    }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    void check();
    timer = setInterval(check, 30000);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <div className={`connection-status ${status}`} aria-live="polite" title={`连接状态：${labelFor(status)}`}>
      <span className="connection-dot" aria-hidden="true" />
      <span>{labelFor(status)}</span>
    </div>
  );
}

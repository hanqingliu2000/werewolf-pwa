"use client";
import { useEffect, useState } from "react";

export function useWakeLock(enabled: boolean) {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let stopped = false; let requesting = false; let lock: WakeLockSentinel | null = null;
    async function request() {
      if (stopped || requesting || lock || document.visibilityState !== "visible") return;
      if (!navigator.wakeLock) { setUnavailable(true); return; }
      requesting = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped || document.visibilityState !== "visible") { await next.release(); return; }
        lock = next; setUnavailable(false);
        next.addEventListener("release", () => { if (lock === next) { lock = null; if (!stopped) setUnavailable(true); } });
      } catch { if (!stopped) setUnavailable(true); }
      finally { requesting = false; }
    }
    if (enabled) {
      void request(); document.addEventListener("visibilitychange", request); window.addEventListener("pageshow", request);
      document.addEventListener("pointerdown", request);
    }
    return () => { stopped = true; void lock?.release().catch(() => undefined); document.removeEventListener("visibilitychange", request); window.removeEventListener("pageshow", request); document.removeEventListener("pointerdown", request); };
  }, [enabled]);
  return enabled && unavailable;
}

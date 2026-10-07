"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, initialize, request } from "./api";
import type { HostRoom, Operation, PrivateRoom, PublicRoom, Receipt } from "./contracts";

export function useRoom(roomId: string) {
  const [view, setView] = useState<PublicRoom | null>(null); const [personal, setPersonal] = useState<PrivateRoom | null>(null);
  const [host, setHost] = useState<HostRoom | null>(null); const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const [revealed, setRevealed] = useState(false);
  const [hostOpen, setHostOpen] = useState(false); const [leader, setLeader] = useState(false);
  const [pending, setPending] = useState<{ requestId: string; epochId: string; windowId: string; operation: Operation } | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const current = useRef<PublicRoom | null>(null); const privateOpen = useRef(false); const maintenanceOpen = useRef(false);
  const tab = useRef(""); const active = useRef(true); const inFlight = useRef<Promise<void> | null>(null);
  const revealSequence = useRef(0);
  const hostSequence = useRef(0);
  const base = `rooms/${roomId}`;
  const conceal = useCallback(() => { revealSequence.current++; privateOpen.current = false; setRevealed(false); setPersonal(null); }, []);
  const sync = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const work = (async () => {
      await initialize(); const next = await request<PublicRoom>(base);
      if (!active.current) return;
      if (current.current && current.current.windowId !== next.windowId) {
        privateOpen.current = false; setRevealed(false); setPersonal(null);
      }
      current.current = next; setView(next); setReceivedAt(Date.now());
      if (privateOpen.current) {
        const info = await request<PrivateRoom>(`${base}/private`);
        if (active.current && privateOpen.current && info.windowId === next.windowId && current.current?.windowId === next.windowId) setPersonal(info);
      }
      if (maintenanceOpen.current && next.self.isHost) {
        const info = await request<HostRoom>(`${base}/host`); if (active.current && info.windowId === next.windowId) setHost(info);
      }
    })().finally(() => { inFlight.current = null; });
    inFlight.current = work; return work;
  }, [base, conceal]);
  useEffect(() => {
    active.current = true; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { await sync(); } catch (e) {
        if (!stopped) {
          setError(e);
          if (e instanceof ApiError && ["ROOM_UNAVAILABLE", "INVALID_SESSION"].includes(e.code)) {
            current.current = null; setView(null); conceal(); maintenanceOpen.current = false; setHostOpen(false); setHost(null);
          }
        }
      }
      if (!stopped) timer = setTimeout(poll, document.visibilityState === "visible" ? 1000 : 5000);
    }
    void poll();
    function hide() { if (document.visibilityState !== "visible") conceal(); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { conceal(); closeHost(); } }
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", conceal);
    window.addEventListener("keydown", escape);
    return () => { stopped = true; active.current = false; clearTimeout(timer); conceal(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", conceal); window.removeEventListener("keydown", escape); };
  }, [sync, conceal]);
  const isHost = view?.self.isHost ?? false;
  useEffect(() => {
    if (!isHost) return;
    tab.current ||= crypto.randomUUID(); const key = `ww:host:${roomId}`; const channel = new BroadcastChannel(key);
    let stopped = false;
    const owner = () => { try { return JSON.parse(localStorage.getItem(key) ?? "null") as { tab: string; until: number } | null; } catch { return null; } };
    async function beat() {
      if (stopped || document.visibilityState !== "visible") return;
      const lease = owner();
      const mine = !lease || lease.until < Date.now() || lease.tab === tab.current;
      setLeader(mine);
      if (mine) {
        localStorage.setItem(key, JSON.stringify({ tab: tab.current, until: Date.now() + 5000 })); channel.postMessage("owner");
        try { await request(`${base}/heartbeat`, { foreground: true, audioReady: true }); } catch (e) { if (!stopped) setError(e); }
      }
    }
    function hide(event: Event) {
      if (event.type !== "pagehide" && document.visibilityState === "visible") { void beat(); return; }
      conceal();
      if (owner()?.tab === tab.current) {
        localStorage.removeItem(key); setLeader(false);
        void fetch(`/api/v2/${base}/heartbeat`, { method: "POST", credentials: "same-origin", keepalive: true,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foreground: false, audioReady: true }) }).catch(() => undefined);
      }
    }
    const interval = setInterval(() => void beat(), 3000); void beat();
    channel.onmessage = () => setLeader(owner()?.tab === tab.current);
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", hide);
    return () => {
      stopped = true; clearInterval(interval); channel.close(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", hide);
      if (owner()?.tab === tab.current) {
        localStorage.removeItem(key);
        void fetch(`/api/v2/${base}/heartbeat`, { method: "POST", credentials: "same-origin", keepalive: true,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foreground: false, audioReady: true }) }).catch(() => undefined);
      }
    };
  }, [isHost, roomId, base, conceal]);
  async function showPrivate() {
    closeHost(); setError(null); const sequence = ++revealSequence.current;
    try {
      await sync();
      if (sequence !== revealSequence.current || document.visibilityState !== "visible") return;
      const info = await request<PrivateRoom>(`${base}/private`);
      if (sequence !== revealSequence.current || document.visibilityState !== "visible") return;
      if (info.windowId !== current.current?.windowId) { await sync(); throw new ApiError("STALE_WINDOW"); }
      privateOpen.current = true; setPersonal(info); setRevealed(true);
    }
    catch (e) { setError(e); }
  }
  async function showHost() {
    conceal(); setError(null); const sequence = ++hostSequence.current;
    try { await sync(); const info = await request<HostRoom>(`${base}/host`);
      if (sequence !== hostSequence.current || document.visibilityState !== "visible") return;
      if (info.windowId !== current.current?.windowId) { await sync(); throw new ApiError("STALE_WINDOW"); }
      maintenanceOpen.current = true; setHost(info); setHostOpen(true);
    } catch (e) { setError(e); }
  }
  function closeHost() { hostSequence.current++; maintenanceOpen.current = false; setHostOpen(false); setHost(null); }
  async function send(operation?: Operation): Promise<boolean> {
    if (!current.current || busy) return false;
    const envelope = pending ?? { requestId: crypto.randomUUID(), epochId: current.current.epochId,
      windowId: current.current.windowId, operation: operation! };
    if (!envelope.operation) return false;
    setBusy(true); setError(null);
    try {
      await request<Receipt>(`${base}/commands`, envelope); setPending(null); await sync(); return true;
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && ["NETWORK_UNKNOWN", "INTERNAL_ERROR"].includes(e.code)) setPending(envelope);
      else { setPending(null); try { await sync(); } catch { /* Keep the original actionable error. */ } }
      return false;
    } finally { setBusy(false); }
  }
  async function claim() {
    localStorage.setItem(`ww:host:${roomId}`, JSON.stringify({ tab: tab.current, until: Date.now() + 5000 }));
    setLeader(true); try { await request(`${base}/heartbeat`, { foreground: true, audioReady: true }); await sync(); } catch (e) { setError(e); }
  }
  return { view, personal, host, error, setError, busy, revealed, hostOpen, leader, pending, receivedAt, sync, send,
    showPrivate, conceal, showHost, closeHost, claim };
}
export type RoomController = ReturnType<typeof useRoom>;

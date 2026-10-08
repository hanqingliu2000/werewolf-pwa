"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, initialize, request } from "./api";
import type { HostRoom, Operation, PrivateRoom, PublicRoom, Receipt } from "./contracts";
import { NARRATION_VERSION } from "../narration/plan";

export function useRoom(roomId: string) {
  const [view, setView] = useState<PublicRoom | null>(null); const [personal, setPersonal] = useState<PrivateRoom | null>(null);
  const [host, setHost] = useState<HostRoom | null>(null); const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const [revealed, setRevealed] = useState(false);
  const [hostOpen, setHostOpen] = useState(false); const [leader, setLeader] = useState(false);
  const [pending, setPending] = useState<{ requestId: string; epochId: string; windowId: string; operation: Operation } | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const current = useRef<PublicRoom | null>(null); const privateOpen = useRef(false); const maintenanceOpen = useRef(false);
  const tab = useRef(""); const active = useRef(true); const inFlight = useRef<Promise<void> | null>(null);
  const readAbort = useRef<AbortController | null>(null);
  const heartbeatAborts = useRef(new Set<AbortController>());
  const revealSequence = useRef(0);
  const autoShown = useRef(new Set<string>());
  const autoCheckedWindow = useRef("");
  const foreground = useRef(true);
  const hostSequence = useRef(0);
  const audioReady = useRef(true); const leaderRef = useRef(false); const sending = useRef(false);
  leaderRef.current = leader;
  const base = `rooms/${roomId}`;
  const cancelHeartbeats = useCallback(() => {
    for (const controller of heartbeatAborts.current) controller.abort();
    heartbeatAborts.current.clear();
  }, []);
  async function foregroundHeartbeat() {
    const controller = new AbortController(); heartbeatAborts.current.add(controller);
    try {
      await request(`${base}/heartbeat`, { foreground: true, audioReady: audioReady.current, narrationVersion: NARRATION_VERSION }, controller.signal);
      return true;
    } catch (e) { if (!controller.signal.aborted && active.current) setError(e); return false; }
    finally { heartbeatAborts.current.delete(controller); }
  }
  function availabilityBeacon(foreground: boolean, ready: boolean) {
    const body = JSON.stringify({ foreground, audioReady: ready, narrationVersion: NARRATION_VERSION }); const url = `/api/v2/${base}/heartbeat`;
    try { if (navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return; } catch { /* Use the bounded unload fallback. */ }
    void fetch(url, { method: "POST", credentials: "same-origin", keepalive: true,
      headers: { "Content-Type": "application/json" }, body }).catch(() => undefined);
  }
  const conceal = useCallback(() => { revealSequence.current++; privateOpen.current = false; setRevealed(false); setPersonal(null); }, []);
  const sync = useCallback(() => {
    if (!active.current) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    const controller = new AbortController(); readAbort.current = controller;
    const work = (async () => {
      try {
        await initialize(); if (controller.signal.aborted) return;
        const next = await request<PublicRoom>(base, undefined, controller.signal);
        if (!active.current) return;
        if (current.current && current.current.windowId !== next.windowId) {
          privateOpen.current = false; setRevealed(false); setPersonal(null);
        }
        current.current = next; setView(next); setReceivedAt(Date.now());
        if (privateOpen.current) {
          const info = await request<PrivateRoom>(`${base}/private`, undefined, controller.signal);
          if (active.current && privateOpen.current && info.windowId === next.windowId && current.current?.windowId === next.windowId) setPersonal(info);
        } else if (foreground.current && document.visibilityState === "visible" && !next.narration.pending
          && ["night_action", "hunter"].includes(next.phase)) {
          // A logical turn survives pause/resume flow IDs, so dismissal never reopens it.
          const turn = `${next.epochId}:${next.nightNo}:${next.phase}:${next.nightRole ?? "hunter"}`;
          if (!autoShown.current.has(turn) && autoCheckedWindow.current !== next.windowId) {
            const sequence = revealSequence.current;
            const info = await request<PrivateRoom>(`${base}/private`, undefined, controller.signal);
            if (active.current && foreground.current && document.visibilityState === "visible"
              && sequence === revealSequence.current && info.windowId === next.windowId && current.current?.windowId === next.windowId) {
              autoCheckedWindow.current = next.windowId;
              if (info.action || info.hunterReaction || (info.wolves && !info.wolves.locked)) {
                autoShown.current.add(turn);
                hostSequence.current++; maintenanceOpen.current = false; setHostOpen(false); setHost(null);
                privateOpen.current = true; setPersonal(info); setRevealed(true);
              }
            }
          }
        }
        if (maintenanceOpen.current && next.self.isHost) {
          const info = await request<HostRoom>(`${base}/host`, undefined, controller.signal); if (active.current && info.windowId === next.windowId) setHost(info);
        }
      } catch (error) { if (!controller.signal.aborted) throw error; }
    })().finally(() => { inFlight.current = null; if (readAbort.current === controller) readAbort.current = null; });
    inFlight.current = work; return work;
  }, [base, conceal]);
  async function refresh() {
    // A saved command must not inherit a poll that started before its write.
    if (inFlight.current) await inFlight.current;
    await sync();
  }
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
    function hide() { foreground.current = document.visibilityState === "visible"; if (!foreground.current) conceal(); }
    function exit() { foreground.current = false; readAbort.current?.abort(); cancelHeartbeats(); conceal(); }
    function enter() { foreground.current = document.visibilityState === "visible"; }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { conceal(); closeHost(); } }
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", exit);
    window.addEventListener("pageshow", enter);
    window.addEventListener("keydown", escape);
    return () => { stopped = true; active.current = false; readAbort.current?.abort(); cancelHeartbeats(); clearTimeout(timer); conceal(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", exit); window.removeEventListener("pageshow", enter); window.removeEventListener("keydown", escape); };
  }, [sync, conceal, cancelHeartbeats]);
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
        await foregroundHeartbeat();
      }
    }
    function hide(event: Event) {
      if (event.type !== "pagehide" && document.visibilityState === "visible") { void beat(); return; }
      conceal();
      cancelHeartbeats();
      if (owner()?.tab === tab.current) {
        localStorage.removeItem(key); setLeader(false);
        availabilityBeacon(false, audioReady.current);
      }
    }
    const interval = setInterval(() => void beat(), 3000); void beat();
    channel.onmessage = () => setLeader(owner()?.tab === tab.current);
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", hide);
    return () => {
      stopped = true; cancelHeartbeats(); clearInterval(interval); channel.close(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", hide);
      if (owner()?.tab === tab.current) {
        localStorage.removeItem(key);
        availabilityBeacon(false, audioReady.current);
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
    try { await refresh(); let info = await request<HostRoom>(`${base}/host`);
      if (info.windowId !== current.current?.windowId) { await refresh(); info = await request<HostRoom>(`${base}/host`); }
      if (sequence !== hostSequence.current || document.visibilityState !== "visible") return;
      if (info.windowId !== current.current?.windowId) { await sync(); throw new ApiError("STALE_WINDOW"); }
      maintenanceOpen.current = true; setHost(info); setHostOpen(true);
    } catch (e) { setError(e); }
  }
  function closeHost() { hostSequence.current++; maintenanceOpen.current = false; setHostOpen(false); setHost(null); }
  async function dispatch(envelope: NonNullable<typeof pending>): Promise<boolean> {
    if (!current.current || sending.current) return false;
    if (!envelope.operation) return false;
    sending.current = true; setBusy(true); setError(null);
    try {
      await request<Receipt>(`${base}/commands`, envelope); setPending(null); await refresh(); return true;
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && ["NETWORK_UNKNOWN", "INTERNAL_ERROR"].includes(e.code)) setPending(envelope);
      else { setPending(null); try { await sync(); } catch { /* Keep the original actionable error. */ } }
      return false;
    } finally { sending.current = false; setBusy(false); }
  }
  async function send(operation?: Operation): Promise<boolean> {
    if (!current.current) return false;
    return dispatch(pending ?? { requestId: crypto.randomUUID(), epochId: current.current.epochId,
      windowId: current.current.windowId, operation: operation! });
  }
  async function sendCaptured(envelope: NonNullable<typeof pending>): Promise<boolean> {
    if (pending || current.current?.epochId !== envelope.epochId || current.current.windowId !== envelope.windowId) return false;
    return dispatch(envelope);
  }
  async function reportAudio(ready: boolean) {
    audioReady.current = ready;
    if (!current.current?.self.isHost || !leaderRef.current) return;
    if (!ready || document.visibilityState !== "visible") {
      availabilityBeacon(document.visibilityState === "visible", ready); return;
    }
    try { if (await foregroundHeartbeat() && active.current) await refresh(); }
    catch (e) { setError(e); }
  }
  async function claim() {
    localStorage.setItem(`ww:host:${roomId}`, JSON.stringify({ tab: tab.current, until: Date.now() + 5000 }));
    leaderRef.current = true; setLeader(true); try { if (await foregroundHeartbeat() && active.current) await refresh(); } catch (e) { setError(e); }
  }
  return { view, personal, host, error, setError, busy, revealed, hostOpen, leader, pending, receivedAt, sync, send,
    showPrivate, conceal, showHost, closeHost, claim, reportAudio, sendCaptured };
}
export type RoomController = ReturnType<typeof useRoom>;

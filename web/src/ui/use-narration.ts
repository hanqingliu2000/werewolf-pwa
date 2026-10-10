"use client";
import { useEffect, useRef, useState } from "react";
import { captions, narrationPlan, NARRATION_VERSION, type Plan } from "../narration/plan";
import script from "../narration/script.json";
import { NarrationPlayer, PlaybackError } from "../narration/player";
import type { RoomController } from "./use-room";
import type { Operation } from "./contracts";

export function useNarration(controller: RoomController) {
  const latest = useRef(controller); latest.current = controller;
  const player = useRef<NarrationPlayer | null>(null); const verified = useRef(false); const sequence = useRef(0);
  const [status, setStatus] = useState<"idle" | "loading" | "testing" | "ready" | "playing" | "failed">("idle");
  const [problem, setProblem] = useState<string | null>(null); const [caption, setCaption] = useState("");
  const [volume, setVolume] = useState(80); const [generation, setGeneration] = useState(0);
  const [completionRetry, setCompletionRetry] = useState(false);
  const completed = useRef<{ plan: Plan; envelope: { requestId: string; epochId: string; windowId: string; operation: Operation } } | null>(null);
  const delivering = useRef(false);
  const attempted = useRef<string | null>(null); const wasPaused = useRef(false); const ambientDone = useRef<string | null>(null);
  const v = controller.view; const mode = v?.narration.mode ?? "text";
  const plan = v ? narrationPlan(v) : null;
  const fail = useRef<(error: unknown) => void>(() => undefined);
  fail.current = (error) => {
    sequence.current++; player.current?.cancel(); verified.current = false; completed.current = null;
    setCompletionRetry(false);
    setStatus("failed"); setProblem(error instanceof PlaybackError ? error.code : "AUDIO_BLOCKED");
    if (latest.current.view?.narration.mode === "voice") void latest.current.reportAudio(false);
  };
  useEffect(() => {
    if (mode === "voice" && v?.narration.version !== NARRATION_VERSION) fail.current(new PlaybackError("AUDIO_VERSION"));
    const healthy = mode !== "voice" || (v?.narration.version === NARRATION_VERSION && verified.current && !!player.current?.ready);
    void latest.current.reportAudio(healthy);
  }, [mode, generation, v?.narration.version]);
  useEffect(() => {
    function hide(event: Event) {
      if (event.type === "pagehide" || document.visibilityState !== "visible") {
        sequence.current++; player.current?.cancel(); verified.current = false; completed.current = null;
        if (latest.current.view?.narration.mode === "voice") fail.current(new PlaybackError("AUDIO_INTERRUPTED"));
        else setStatus("idle");
      }
    }
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", hide);
    return () => { sequence.current++; verified.current = false; completed.current = null; player.current?.dispose(); player.current = null; document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", hide); };
  }, []);

  // Polls, private panels and individual submissions must not restart public audio.
  useEffect(() => {
    player.current?.cancel();
    const resumed = wasPaused.current && !v?.paused; wasPaused.current = v?.paused ?? false;
    if (!v?.self.isHost || !controller.leader || mode !== "voice" || !verified.current) return;
    const currentPlan = v.paused ? null : narrationPlan(v);
    if (v.paused || (!currentPlan && resumed)) {
      const id = `${v.windowId}:${v.paused ? "pause" : "resume"}`;
      if (ambientDone.current === id) return;
      ambientDone.current = id;
      const instance = player.current!; let cancelled = false;
      setStatus("playing");
      void instance.play([v.paused ? "pause" : "resume"], (clip) => setCaption(script.clips[clip])).then(() => {
        if (!cancelled) setStatus("ready");
      }).catch((error) => { if (!cancelled && !(error instanceof PlaybackError && error.code === "PLAYBACK_CANCELLED")) fail.current(error); });
      return () => { cancelled = true; instance.cancel(); };
    }
    if (!currentPlan || completed.current?.plan.id === currentPlan.id) return;
    const instance = player.current!; let cancelled = false;
    const envelope = { requestId: crypto.randomUUID(), epochId: v.epochId, windowId: v.windowId,
      operation: { type: currentPlan.completion, cueId: currentPlan.cueId, version: NARRATION_VERSION } as Operation };
    setStatus("playing"); setProblem(null);
    void instance.play(resumed ? ["resume", ...currentPlan.clips] : currentPlan.clips, (id) => setCaption(script.clips[id])).then(() => {
      if (cancelled) return;
      completed.current = { plan: currentPlan, envelope }; setCompletionRetry(false); setStatus("ready"); setGeneration((n) => n + 1);
    }).catch((error) => { if (!cancelled && !(error instanceof PlaybackError && error.code === "PLAYBACK_CANCELLED")) fail.current(error); });
    return () => { cancelled = true; instance.cancel(); };
  }, [plan?.id, v?.windowId, v?.paused, v?.self.isHost, controller.leader, mode, generation]);

  // Completion retains the original request and phase rather than using a newer poll.
  useEffect(() => {
    const item = completed.current;
    if (item && (item.envelope.epochId !== v?.epochId || item.envelope.windowId !== v.windowId)) { completed.current = null; setCompletionRetry(false); return; }
    if (!item || controller.busy || controller.pending || delivering.current || attempted.current === item.envelope.requestId || !controller.leader || mode !== "voice" || v?.paused) return;
    delivering.current = true; attempted.current = item.envelope.requestId;
    void controller.sendCaptured(item.envelope).then((accepted) => {
      if (completed.current === item) {
        if (accepted) completed.current = null;
        setCompletionRetry(!accepted);
      }
    }).finally(() => { delivering.current = false; });
  }, [generation, controller.busy, controller.pending, controller.leader, v?.windowId, v?.paused, mode]);

  function retryCompletion() {
    const c = latest.current; const item = completed.current;
    if (!item || c.busy || c.pending || delivering.current || !c.leader || c.view?.paused
      || c.view?.narration.mode !== "voice" || item.envelope.epochId !== c.view.epochId || item.envelope.windowId !== c.view.windowId) return;
    attempted.current = null;
    setCompletionRetry(false); setGeneration((n) => n + 1);
  }

  useEffect(() => {
    if (!controller.leader && player.current) {
      sequence.current++; player.current.cancel(); verified.current = false; completed.current = null; setStatus("idle");
    }
  }, [controller.leader]);

  async function prepareVoice(sample: boolean) {
    if (!latest.current.leader) return;
    const trialSequence = ++sequence.current; verified.current = false; completed.current = null;
    setCompletionRetry(false);
    player.current ??= new NarrationPlayer(() => fail.current(new PlaybackError("AUDIO_INTERRUPTED")));
    player.current.cancel(); setStatus("loading"); setProblem(null);
    const preparation = player.current.prepare();
    try {
      await preparation;
      if (trialSequence !== sequence.current || document.visibilityState !== "visible") return;
      if (sample) { setStatus("testing"); setCaption(script.clips.sample); await player.current.play(["sample"]); }
      if (trialSequence !== sequence.current || !player.current.ready || document.visibilityState !== "visible" || !latest.current.leader) return;
      verified.current = true; await latest.current.reportAudio(true);
      if (trialSequence !== sequence.current || !player.current.ready || document.visibilityState !== "visible" || !latest.current.leader) return;
      if (!sample && !await latest.current.send({ type: "narration_mode", mode: "voice", version: NARRATION_VERSION, trialConfirmed: false })) {
        verified.current = false; setStatus("failed"); setProblem("AUDIO_MODE_FAILED"); return;
      }
      setStatus("ready"); setCaption(""); setGeneration((n) => n + 1);
    } catch (error) { if (trialSequence === sequence.current) fail.current(error); }
  }
  const trial = () => prepareVoice(true);
  const enableVoice = () => prepareVoice(false);
  async function textMode() {
    const c = latest.current;
    sequence.current++; player.current?.cancel(); completed.current = null;
    if (c.view && !["lobby", "end"].includes(c.view.phase) && !c.view.paused && !await c.send({ type: "pause" })) return;
    if (await latest.current.send({ type: "narration_mode", mode: "text", version: NARRATION_VERSION, trialConfirmed: false })) {
      verified.current = false; setStatus("idle"); setProblem(null); setCaption(""); await latest.current.reportAudio(true);
    }
  }
  function changeVolume(value: number) { setVolume(value); player.current?.setVolume(value / 100); }
  const textPlan = v ? narrationPlan({ ...v, paused: false }) : null;
  const item = completed.current;
  return { mode, status, problem, caption, volume, ready: mode === "text" || (verified.current && !!player.current?.ready),
    completionRetry: completionRetry && !!item && controller.leader && !v?.paused && mode === "voice"
      && item.envelope.epochId === v?.epochId && item.envelope.windowId === v?.windowId, retryCompletion,
    text: textPlan ? captions(textPlan.clips) : "", version: NARRATION_VERSION, trial, enableVoice, textMode, changeVolume };
}
export type VoiceController = ReturnType<typeof useNarration>;

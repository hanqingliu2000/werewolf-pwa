"use client";
import { Headphones, RotateCcw, Volume2 } from "lucide-react";
import type { VoiceController } from "./use-narration";

const failures: Record<string, string> = {
  AUDIO_BLOCKED: "浏览器未允许播放", AUDIO_ASSET: "声音资源未能完整加载",
  AUDIO_INTERRUPTED: "声音已中断", AUDIO_TIMEOUT: "播放未能正常结束", AUDIO_MODE_FAILED: "语音主持尚未启用",
  AUDIO_VERSION: "播报资源已更新，请刷新页面后启用声音",
};
const statuses = { idle: "声音未启用", loading: "正在准备声音", testing: "正在试音", ready: "声音就绪", playing: "正在播报", failed: "声音不可用" };
export function VoiceControls({ voice, disabled, changeAllowed }: { voice: VoiceController; disabled: boolean; changeAllowed: boolean }) {
  const working = ["loading", "testing"].includes(voice.status);
  return <section className="voice-controls" aria-label="公共播报">
    <div className="section-heading"><h3>公共播报</h3><span role="status">{voice.mode === "text" ? "文字主持" : statuses[voice.status]}</span></div>
    <div className="segments" aria-label="主持方式"><button aria-pressed={voice.mode === "text"} disabled={disabled || working || voice.mode === "text"} onClick={() => void voice.textMode()}>文字</button><button aria-pressed={voice.mode === "voice"} disabled={disabled || !changeAllowed || working || voice.mode === "voice"} onClick={() => void voice.enableVoice()}>语音</button></div>
    <button className="button secondary full-width" disabled={disabled || !changeAllowed || working} onClick={() => void voice.trial()}><Headphones size={18} aria-hidden />{working ? statuses[voice.status] : "试音（可选）"}</button>
    {(voice.mode === "voice" || voice.status !== "idle") && <>
      {voice.problem && <p className="error" role="alert">{failures[voice.problem] ?? "播放未完成"}。{voice.mode === "voice" ? "请恢复声音，或切换文字主持。" : "可继续文字主持。"}</p>}
      {(voice.status === "failed" || voice.mode === "voice" && !voice.ready && !working) && <button className="button secondary full-width" disabled={disabled || !changeAllowed || working} onClick={() => void voice.enableVoice()}><RotateCcw size={18} aria-hidden />恢复声音</button>}
      <label className="voice-volume"><Volume2 size={19} aria-hidden /><span>播报音量</span><input aria-label="播报音量" type="range" min="10" max="100" step="5" value={voice.volume} onChange={(e) => voice.changeVolume(Number(e.target.value))} /><output>{voice.volume}%</output></label>
    </>}
  </section>;
}

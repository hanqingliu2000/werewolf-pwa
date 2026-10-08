import { z } from "zod";
import script from "./script.json";
import { clipIds, NARRATION_VERSION, type ClipId } from "./plan";

const record = z.object({ text: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive(), durationSeconds: z.number().positive().max(30) });
const manifestSchema = z.object({ version: z.literal(NARRATION_VERSION), rulesVersion: z.literal(script.rulesVersion), clips: z.record(z.string(), record) });
export class PlaybackError extends Error {
  constructor(public readonly code: "AUDIO_BLOCKED" | "AUDIO_ASSET" | "AUDIO_INTERRUPTED" | "AUDIO_TIMEOUT" | "AUDIO_VERSION" | "PLAYBACK_CANCELLED") { super(code); }
}

export class NarrationPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<ClipId, AudioBuffer>();
  private source: AudioBufferSourceNode | null = null;
  private cancelCurrent: (() => void) | null = null;
  private loading: AbortController | null = null;
  private generation = 0;
  private volume = 0.8;
  private bankVersion: string | null = null;
  constructor(private readonly interrupted: () => void, private readonly createContext = () => new AudioContext(),
    private readonly fetchAsset: typeof fetch = (input, init) => fetch(input, init)) {}

  get ready() { return this.context?.state === "running" && this.buffers.size === clipIds.length && this.bankVersion === NARRATION_VERSION; }
  setVolume(value: number) { this.volume = Math.max(0, Math.min(1, value)); if (this.gain) this.gain.gain.value = this.volume; }

  // Called directly from a click: resume is invoked before any network await.
  async prepare() {
    if (!this.context || this.context.state === "closed") {
      this.context = this.createContext(); this.gain = this.context.createGain();
      this.gain.gain.value = this.volume; this.gain.connect(this.context.destination);
      this.context.onstatechange = () => {
        if (this.context?.state !== "running") { this.cancel(); this.interrupted(); }
      };
    }
    const context = this.context;
    try { await context.resume(); } catch { throw new PlaybackError("AUDIO_BLOCKED"); }
    if (context.state !== "running") throw new PlaybackError("AUDIO_BLOCKED");
    if (this.ready) return;
    this.loading?.abort(); const controller = new AbortController(); this.loading = controller;
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const root = `/audio/${NARRATION_VERSION}`;
      const response = await this.fetchAsset(`${root}/manifest.json`, { signal: controller.signal, cache: "no-cache" });
      if (!response.ok) throw new PlaybackError("AUDIO_ASSET");
      const manifest = manifestSchema.parse(await response.json());
      const remaining = [...clipIds]; const decoded = new Map<ClipId, AudioBuffer>();
      await Promise.all(Array.from({ length: 4 }, async () => {
        let id: ClipId | undefined;
        while ((id = remaining.shift()) !== undefined) {
          const entry = manifest.clips[id];
          if (!entry || entry.text !== script.clips[id]) throw new PlaybackError("AUDIO_ASSET");
          const asset = await this.fetchAsset(`${root}/${id}.mp3`, { signal: controller.signal });
          if (!asset.ok) throw new PlaybackError("AUDIO_ASSET");
          const bytes = await asset.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
          if (bytes.byteLength !== entry.bytes || hash !== entry.sha256) throw new PlaybackError("AUDIO_ASSET");
          const buffer = await context.decodeAudioData(bytes);
          if (buffer.duration < 0.25 || buffer.duration > 30 || Math.abs(buffer.duration - entry.durationSeconds) > 0.3) throw new PlaybackError("AUDIO_ASSET");
          decoded.set(id, buffer);
        }
      }));
      if (controller.signal.aborted) throw new PlaybackError("PLAYBACK_CANCELLED");
      this.buffers = decoded;
      this.bankVersion = manifest.version;
    } catch (error) {
      controller.abort();
      if (error instanceof PlaybackError) throw error;
      throw new PlaybackError("AUDIO_ASSET");
    } finally { clearTimeout(timer); if (this.loading === controller) this.loading = null; }
    if (!this.ready) throw new PlaybackError("AUDIO_INTERRUPTED");
  }

  async play(clips: ClipId[], caption?: (id: ClipId) => void) {
    this.cancel(); const generation = this.generation;
    if (!this.ready) throw new PlaybackError("AUDIO_BLOCKED");
    for (const id of clips) {
      if (generation !== this.generation) throw new PlaybackError("PLAYBACK_CANCELLED");
      const buffer = this.buffers.get(id);
      if (!buffer) throw new PlaybackError("AUDIO_ASSET");
      caption?.(id);
      await new Promise<void>((resolve, reject) => {
        const source = this.context!.createBufferSource(); source.buffer = buffer; source.connect(this.gain!);
        this.source = source;
        const finish = (error?: PlaybackError) => {
          clearTimeout(timer); source.onended = null; source.disconnect();
          if (this.source === source) { this.source = null; this.cancelCurrent = null; }
          if (error) { try { source.stop(); } catch { /* Source may already have ended. */ } reject(error); } else resolve();
        };
        const timer = setTimeout(() => finish(new PlaybackError("AUDIO_TIMEOUT")), buffer.duration * 1000 + 3000);
        this.cancelCurrent = () => finish(new PlaybackError("PLAYBACK_CANCELLED"));
        source.onended = () => generation === this.generation ? finish() : finish(new PlaybackError("PLAYBACK_CANCELLED"));
        try { source.start(); } catch { finish(new PlaybackError("AUDIO_BLOCKED")); }
      });
    }
    if (generation !== this.generation || !this.ready) throw new PlaybackError("PLAYBACK_CANCELLED");
  }
  cancel() { this.generation++; this.cancelCurrent?.(); }
  dispose() {
    this.cancel(); this.loading?.abort();
    if (this.context) { this.context.onstatechange = null; void this.context.close().catch(() => undefined); }
    this.buffers.clear(); this.bankVersion = null; this.context = null; this.gain = null;
  }
}

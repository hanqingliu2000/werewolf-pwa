import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { clipIds } from "../src/narration/plan";
import script from "../src/narration/script.json";
import { NarrationPlayer } from "../src/narration/player";

class Source {
  buffer: unknown; onended: (() => void) | null = null; stopped = false;
  connect() {} disconnect() {} start() {} stop() { this.stopped = true; this.onended?.(); }
  finish() { this.onended?.(); }
}
class Context {
  state = "suspended"; onstatechange: (() => void) | null = null; destination = {};
  sources: Source[] = []; gain = { gain: { value: 1 }, connect() {} };
  createGain() { return this.gain; }
  async resume() { this.state = "running"; this.onstatechange?.(); }
  async close() { this.state = "closed"; this.onstatechange?.(); }
  async decodeAudioData() { return { duration: 1 }; }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
}
const bytes = new Uint8Array([1, 2, 3, 4]);
function bank() {
  return { version: script.version, rulesVersion: script.rulesVersion, clips: Object.fromEntries(clipIds.map((id) => [id, {
    text: script.clips[id], sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, durationSeconds: 1,
  }])) };
}
function setup() {
  const context = new Context(); const interrupted = vi.fn();
  const fetcher = vi.fn<typeof fetch>(async (url) => String(url).endsWith("manifest.json") ? Response.json(bank()) : new Response(bytes));
  const player = new NarrationPlayer(interrupted, () => context as unknown as AudioContext, fetcher);
  return { player, context, interrupted, fetcher };
}
afterEach(() => { vi.useRealTimers(); });

describe("verified public audio player", () => {
  it("unlocks synchronously, verifies the complete bank, and sequences actual ended events", async () => {
    const f = setup(); const preparation = f.player.prepare();
    expect(f.context.state).toBe("running"); await preparation;
    expect(f.player.ready).toBe(true); expect(f.fetcher).toHaveBeenCalledTimes(41);
    f.player.setVolume(0.4); expect(f.context.gain.gain.value).toBe(0.4);
    f.player.setVolume(5); expect(f.context.gain.gain.value).toBe(1);
    const captions: string[] = []; const done = vi.fn();
    const playback = f.player.play(["guard_open", "guard_close"], (id) => captions.push(id)).then(done);
    expect(done).not.toHaveBeenCalled(); expect(f.context.sources).toHaveLength(1);
    f.context.sources[0]!.finish(); await Promise.resolve();
    expect(f.context.sources).toHaveLength(2); expect(done).not.toHaveBeenCalled();
    f.context.sources[1]!.finish(); await playback;
    expect(captions).toEqual(["guard_open", "guard_close"]); expect(done).toHaveBeenCalledTimes(1);
    await f.player.prepare(); expect(f.fetcher).toHaveBeenCalledTimes(41);
    f.player.dispose(); expect(f.player.ready).toBe(false); expect(f.interrupted).not.toHaveBeenCalled();
  });
  it("cancels without completing or advancing into an obsolete queue", async () => {
    const f = setup(); await f.player.prepare();
    const playback = f.player.play(["dawn", "good_win"]); const result = expect(playback).rejects.toThrow("PLAYBACK_CANCELLED");
    f.player.cancel(); f.context.sources[0]!.finish(); await result;
    expect(f.context.sources).toHaveLength(1); expect(f.context.sources[0]!.stopped).toBe(true);
    f.player.dispose();
  });
  it("reports context interruption and a stalled source, never an ended acknowledgement", async () => {
    const f = setup(); await f.player.prepare();
    const playback = f.player.play(["dawn"]); const result = expect(playback).rejects.toThrow("PLAYBACK_CANCELLED");
    f.context.state = "suspended"; f.context.onstatechange!(); await result;
    expect(f.interrupted).toHaveBeenCalledOnce(); expect(f.player.ready).toBe(false);
    await f.player.prepare(); vi.useFakeTimers();
    const stalled = f.player.play(["dawn"]); const failure = expect(stalled).rejects.toThrow("AUDIO_TIMEOUT");
    await vi.advanceTimersByTimeAsync(4000); await failure;
    expect(f.context.sources.at(-1)!.stopped).toBe(true); f.player.dispose();
  });
  it("rejects blocked resume or starting before a complete trial", async () => {
    const f = setup(); await expect(f.player.play(["sample"])).rejects.toThrow("AUDIO_BLOCKED");
    vi.spyOn(f.context, "resume").mockRejectedValueOnce(new Error("NotAllowedError"));
    await expect(f.player.prepare()).rejects.toThrow("AUDIO_BLOCKED");
    vi.spyOn(f.context, "resume").mockResolvedValueOnce();
    await expect(f.player.prepare()).rejects.toThrow("AUDIO_BLOCKED"); f.player.dispose();
  });
  it.each(["missing", "version", "text", "bytes", "hash", "decode", "network", "http"]) ("rejects %s assets instead of quietly skipping them", async (failure) => {
    const f = setup(); const manifest = bank();
    if (failure === "missing") delete manifest.clips.sample;
    if (failure === "version") manifest.version = "obsolete";
    if (failure === "text") manifest.clips.sample!.text = "wrong words";
    if (failure === "bytes") manifest.clips.sample!.bytes = 100;
    if (failure === "hash") manifest.clips.sample!.sha256 = "0".repeat(64);
    if (failure === "decode") vi.spyOn(f.context, "decodeAudioData").mockResolvedValue({ duration: 50 });
    f.fetcher.mockImplementation(async (url) => {
      if (failure === "network") throw new Error("Network failure");
      if (failure === "http") return new Response(null, { status: 404 });
      return String(url).endsWith("manifest.json") ? Response.json(manifest) : new Response(bytes);
    });
    await expect(f.player.prepare()).rejects.toThrow("AUDIO_ASSET"); expect(f.player.ready).toBe(false); f.player.dispose();
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import script from "../src/narration/script.json";
import voice from "../src/narration/voice.json";

describe("new static narration bank", () => {
  it("announces dealing without asking players to confirm identity", () => {
    expect(script.clips.roles_dealt).toBe("身份已发放，请查看身份。");
    expect(script.clips.roles_dealt).not.toContain("确认");
  });
  it("reuses only unchanged approved v3 clips", () => {
    const manifest = JSON.parse(readFileSync(resolve("public/audio/host-zh-v3/manifest.json"), "utf8"));
    for (const id of Object.keys(script.clips)) {
      const current = readFileSync(resolve(`public/audio/${script.version}/${id}.mp3`));
      const old = manifest.clips[id];
      if (old?.text === script.clips[id as keyof typeof script.clips]) expect(current.equals(readFileSync(resolve(`public/audio/host-zh-v3/${id}.mp3`))), id).toBe(true);
      else if (old) expect(createHash("sha256").update(current).digest("hex"), id).not.toBe(old.sha256);
    }
    expect(voice.version).toBe(script.version);
  });
  it("has exactly the versioned scripts, source license and fingerprints, with no old assets", () => {
    const root = resolve(`public/audio/${script.version}`);
    const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ version: script.version, rulesVersion: script.rulesVersion,
      speaker: "Uncle_Fu", sourceModel: voice.sourceModel, license: "Apache-2.0",
      revision: voice.revision, style: voice.style, review: { humanPhoneListening: "pending" } });
    expect(Object.keys(manifest.clips).sort()).toEqual(Object.keys(script.clips).sort());
    expect(readdirSync(root).filter((name) => name.endsWith(".mp3")).sort()).toEqual(Object.keys(script.clips).map((id) => `${id}.mp3`).sort());
    for (const [id, text] of Object.entries(script.clips)) {
      const clip = manifest.clips[id]; const bytes = readFileSync(resolve(root, `${id}.mp3`));
      expect(clip.text, id).toBe(text); expect(clip.bytes, id).toBe(bytes.length);
      expect(clip.sha256, id).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(clip.durationSeconds, id).toBeGreaterThan(0.25); expect(clip.durationSeconds, id).toBeLessThan(30);
      expect(clip.sourceSampleRate, id).toBe(24_000); expect(Number.isSafeInteger(clip.seed), id).toBe(true);
      expect(clip.generation ?? manifest.generationDefaults).toEqual(voice.generation);
    }
  });
  it("fingerprints both pitch-preserving rates without touching the original clips", () => {
    const root = resolve(`public/audio/${script.version}`);
    const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
    expect(manifest.timeStretch).toMatchObject({ method: "FFmpeg atempo", preservesPitch: true, rates: [1.5, 2] });
    for (const rate of [1.5, 2]) {
      expect(Object.keys(manifest.rates[rate]).sort()).toEqual(Object.keys(script.clips).sort());
      for (const [id, text] of Object.entries(script.clips)) {
        const entry = manifest.rates[rate][id]; const bytes = readFileSync(resolve(root, `rates/${rate}/${id}.mp3`));
        expect(entry.text).toBe(text); expect(entry.bytes).toBe(bytes.length);
        expect(entry.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
        expect(Math.abs(entry.durationSeconds - manifest.clips[id].durationSeconds / rate)).toBeLessThan(0.4);
      }
    }
  });
});

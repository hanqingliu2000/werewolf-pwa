import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import script from "../src/narration/script.json";
import voice from "../src/narration/voice.json";

describe("new static narration bank", () => {
  it("announces dealing without asking players to confirm identity", () => {
    expect(script.clips.roles_dealt).toBe("身份已经发放。请查看本人的身份，然后收起私密信息。");
    expect(script.clips.roles_dealt).not.toContain("确认");
  });
  it("keeps the other 39 approved clips byte-identical to v2", () => {
    for (const id of Object.keys(script.clips)) {
      const previous = readFileSync(resolve(`public/audio/host-zh-v2/${id}.mp3`));
      const current = readFileSync(resolve(`public/audio/${script.version}/${id}.mp3`));
      expect(current.equals(previous), id).toBe(id !== "roles_dealt");
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
});

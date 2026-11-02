"""Match short action prompts to the approved voice's measured pace, without changing pitch."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import statistics
import subprocess

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ACTIONS = ("guard_action", "werewolf_action", "witch_action", "seer_action", "hunter_action")
REFERENCES = ("guard_open", "guard_close", "werewolf_open", "werewolf_close", "witch_open", "witch_close",
              "seer_open", "seer_close", "night_start", "dawn", "day", "sheriff_hands", "sheriff_speech")


def measure(path, text):
    raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-i", str(path),
                          "-ar", "24000", "-ac", "1", "-f", "f32le", "-"], check=True, capture_output=True).stdout
    samples = np.frombuffer(raw, dtype="<f4")
    if not samples.size or not np.isfinite(samples).all():
        raise ValueError("Invalid audio signal")
    frames = samples[:samples.size // 240 * 240].reshape(-1, 240)
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    active = np.flatnonzero(rms > max(0.004, float(rms.max()) * 0.025))
    if not active.size:
        raise ValueError("No speech detected")
    # Ignore only outer silence; retain pauses inside the spoken phrase.
    span = (int(active[-1]) - int(active[0]) + 1) / 100
    return {"durationSeconds": samples.size / 24000, "spokenSpanSeconds": span,
            "charactersPerSecond": len(re.findall(r"[\u4e00-\u9fff]", text)) / span}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-bank", required=True)
    parser.add_argument("--analyze", action="store_true")
    parser.add_argument("--staged", action="store_true", help="Analyze an already staged bank")
    args = parser.parse_args()
    if not re.fullmatch(r"host-zh-v[1-9][0-9]*", args.source_bank):
        parser.error("Source must be a versioned audio bank")
    source = ROOT / (".local-generation/banks" if args.staged else "web/public/audio") / args.source_bank
    manifest = json.loads((source / "manifest.json").read_text())
    metrics = {key: measure(source / f"{key}.mp3", manifest["clips"][key]["text"]) for key in (*REFERENCES, *ACTIONS)}
    target = statistics.median(metrics[key]["charactersPerSecond"] for key in REFERENCES)
    if args.analyze:
        print(json.dumps({"bank": args.source_bank, "referenceMedianCps": target, "clips": metrics}, ensure_ascii=False, indent=2))
        return
    if args.staged:
        parser.error("--staged requires --analyze")
    script = json.loads((ROOT / "web/src/narration/script.json").read_text())
    voice = json.loads((ROOT / "web/src/narration/voice.json").read_text())
    version = script["version"]
    if not re.fullmatch(r"host-zh-v[1-9][0-9]*", version) or version != voice["version"] or version == args.source_bank:
        raise ValueError("Increment and align script/voice versions before normalization")
    for key, expected in {"revision": voice["revision"], "style": voice["style"], "speaker": script["speaker"],
                          "generationDefaults": voice["generation"], "rulesVersion": script["rulesVersion"]}.items():
        if manifest[key] != expected:
            raise ValueError(f"Source voice settings differ: {key}")
    if set(script["clips"]) != set(manifest["clips"]):
        raise ValueError("Normalization cannot add or remove lines")
    destination = ROOT / ".local-generation/banks" / version
    if destination.exists() or (ROOT / "web/public/audio" / version).exists():
        raise ValueError("Destination already exists; never overwrite a versioned bank")
    report = json.loads((ROOT / f".local-generation/{args.source_bank}-verification.json").read_text())
    for key, entry in manifest["clips"].items():
        path = source / f"{key}.mp3"
        if entry["text"] != script["clips"][key] or path.stat().st_size != entry["bytes"] or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Unverified source: {key}")
        if report["clips"].get(key, {}).get("sha256") != entry["sha256"]:
            raise ValueError(f"Source lacks matching review: {key}")
    destination.mkdir(parents=True)
    for key in manifest["clips"]:
        shutil.copyfile(source / f"{key}.mp3", destination / f"{key}.mp3")
    adjustments = {}
    for key in ACTIONS:
        before = metrics[key]
        tempo = min(1.0, target / before["charactersPerSecond"])
        if tempo < 0.5:
            raise ValueError(f"Prompt needs more than a pacing correction: {key}")
        output = destination / f"{key}.mp3"
        if tempo < 0.99:
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-y", "-i", str(source / f"{key}.mp3"),
                            "-af", f"atempo={tempo:.8f},loudnorm=I=-18:TP=-1.5:LRA=7", "-ar", "24000", "-ac", "1",
                            "-b:a", "96k", str(output)], check=True)
            report["clips"].pop(key, None)
        else:
            tempo = 1.0
        after = measure(output, script["clips"][key])
        if after["charactersPerSecond"] > target * 1.08:
            raise ValueError(f"Prompt remains too fast: {key}")
        entry = manifest["clips"][key]
        adjustments[key] = {"sourceSha256": entry["sha256"], "tempo": tempo, "before": before, "after": after}
        if tempo < 1:
            entry.update(sha256=hashlib.sha256(output.read_bytes()).hexdigest(), bytes=output.stat().st_size,
                         durationSeconds=after["durationSeconds"], postProcessing={"method": "FFmpeg atempo", "tempo": tempo, "preservesPitch": True})
    manifest["version"] = version
    manifest["paceNormalization"] = {"sourceBank": args.source_bank, "method": "spoken-span reference median",
                                     "referenceClipIds": list(REFERENCES), "targetCharactersPerSecond": target,
                                     "preservesPitch": True, "actions": adjustments}
    manifest.pop("rates", None)
    manifest.pop("timeStretch", None)
    manifest["review"]["signalAndAsr"] = "pending"
    manifest["review"]["paceListening"] = "pending user audition"
    (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (ROOT / f".local-generation/{version}-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"version": version, "referenceMedianCps": target, "actions": adjustments}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

"""Generate the public narration bank locally; never synthesize player secrets."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("HF_HOME", str(ROOT / ".local-generation/hf-cache"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="Comma-separated clip ids; omit for the complete bank")
    parser.add_argument("--force", action="store_true", help="Regenerate only the selected clips")
    parser.add_argument("--seed-offset", type=int, default=0)
    parser.add_argument("--publish", action="store_true", help="Promote the fully verified staging bank; does not synthesize")
    args = parser.parse_args()
    script = json.loads((ROOT / "web/src/narration/script.json").read_text())
    voice = json.loads((ROOT / "web/src/narration/voice.json").read_text())
    destination = ROOT / f".local-generation/banks/{voice['version']}"
    manifest_path = destination / "manifest.json"
    if args.publish:
        manifest = json.loads(manifest_path.read_text())
        report = json.loads((ROOT / f".local-generation/{voice['version']}-verification.json").read_text())
        if manifest["version"] != voice["version"] or manifest["rulesVersion"] != script["rulesVersion"] or manifest["speaker"] != script["speaker"] or manifest["revision"] != voice["revision"] or manifest["style"] != voice["style"] or manifest["generationDefaults"] != voice["generation"] or set(manifest["clips"]) != set(script["clips"]):
            raise ValueError("Incomplete or incompatible bank")
        for key, text in script["clips"].items():
            entry = manifest["clips"][key]
            actual = hashlib.sha256((destination / f"{key}.mp3").read_bytes()).hexdigest()
            reviewed = report["clips"].get(key, {})
            if entry["text"] != text or actual != entry["sha256"] or reviewed.get("sha256") != actual or reviewed.get("peakDb", 0) >= 0:
                raise ValueError(f"Unverified clip: {key}")
        published = ROOT / f"web/public/audio/{voice['version']}"
        if published.exists():
            raise ValueError("Published versions are immutable; increment the version instead")
        manifest["review"]["signalAndAsr"] = "local signal and ASR review passed"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        shutil.copytree(destination, published)
        print(json.dumps({"publishedLocally": voice["version"], "clips": len(manifest["clips"])}), flush=True)
        return
    import mlx.core as mx
    import numpy as np
    from huggingface_hub import snapshot_download, model_info
    from mlx_audio.tts.utils import load_model
    from scipy.io.wavfile import write as write_wav
    import imageio_ffmpeg

    model_id = voice["model"]
    revision = model_info(model_id, revision=voice["revision"]).sha
    model_path = snapshot_download(model_id, revision=revision)
    model = load_model(model_path)
    selected = args.only.split(",") if args.only else list(script["clips"])
    if any(key not in script["clips"] for key in selected):
        raise ValueError("Unknown public clip")
    destination.mkdir(parents=True, exist_ok=True)
    raw_dir = ROOT / f".local-generation/raw/{voice['version']}"
    raw_dir.mkdir(parents=True, exist_ok=True)
    records = json.loads(manifest_path.read_text())["clips"] if manifest_path.exists() else {}
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text())
        if existing["revision"] != revision or existing["style"] != voice["style"] or existing["speaker"] != script["speaker"]:
            raise ValueError("Do not mix model revisions, voices or styles in one bank")
    for index, key in enumerate(selected):
        output = destination / f"{key}.mp3"
        if not args.force and output.exists() and records.get(key, {}).get("text") == script["clips"][key] and hashlib.sha256(output.read_bytes()).hexdigest() == records[key]["sha256"]:
            print(json.dumps({"clip": key, "status": "existing"}), flush=True)
            continue
        start = time.monotonic()
        parameters = voice["generation"]
        for attempt in range(3):
            seed = voice["seedBase"] + list(script["clips"]).index(key) + args.seed_offset + attempt * 1000
            mx.random.seed(seed)
            parts = list(model.generate_custom_voice(text=script["clips"][key], speaker=script["speaker"], language=script["language"],
                instruct=voice["style"]["instruction"], temperature=parameters["temperature"], max_tokens=parameters["maxTokens"],
                top_k=parameters["topK"], top_p=parameters["topP"], repetition_penalty=parameters["repetitionPenalty"]))
            samples = np.concatenate([np.asarray(part.audio, dtype=np.float32) for part in parts])
            sample_rate = int(parts[0].sample_rate)
            if np.isfinite(samples).all() and sample_rate / 4 < samples.size < sample_rate * min(30, max(5, len(script["clips"][key]) * 0.75 + 2)):
                break
            print(json.dumps({"clip": key, "invalidAttempt": attempt + 1, "seconds": samples.size / sample_rate}), flush=True)
            mx.clear_cache()
        else:
            raise RuntimeError(f"Invalid waveform after bounded retries: {key}")
        raw = raw_dir / f"{key}.wav"
        write_wav(raw, sample_rate, samples)
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
                        "-af", "loudnorm=I=-18:TP=-1.5:LRA=7", "-ar", "24000", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "96k", str(output)], check=True)
        if output.stat().st_size < 1000:
            raise RuntimeError(f"Empty audio: {key}")
        records[key] = {"text": script["clips"][key], "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                        "bytes": output.stat().st_size, "durationSeconds": samples.size / sample_rate,
                        "sourceSampleRate": sample_rate, "seed": seed,
                        "generation": parameters,
                        "generationSeconds": round(time.monotonic() - start, 2)}
        manifest = {"version": voice["version"], "rulesVersion": script["rulesVersion"], "language": script["language"],
                    "speaker": script["speaker"], "sourceModel": voice["sourceModel"], "style": voice["style"],
                    "model": model_id, "revision": revision, "precision": "4-bit MLX conversion", "license": "Apache-2.0",
                    "runtime": {name: importlib.metadata.version(name) for name in ["mlx-audio", "mlx", "transformers", "imageio-ffmpeg"]},
                    "generationDefaults": parameters,
                    "review": {"styleSelection": "neutral pilot approved by user", "signalAndAsr": "pending", "humanPhoneListening": "pending"},
                    "normalization": {"integratedLufs": -18, "truePeakDb": -1.5, "sampleRate": 24000, "bitrate": "96k"},
                    "clips": records}
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"clip": key, "index": index + 1, "count": len(selected), "seconds": records[key]["durationSeconds"], "generated": True}), flush=True)
        mx.clear_cache()


if __name__ == "__main__":
    main()

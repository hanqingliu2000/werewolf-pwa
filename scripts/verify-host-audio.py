"""Local signal and ASR review aid; this is not a substitute for phone listening."""
import hashlib
import argparse
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("HF_HOME", str(ROOT / ".local-generation/hf-cache"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="Verify selected replacement clips")
    parser.add_argument("--bank", choices=["host-zh-v1", "host-zh-v2", "host-zh-calm-pilot"], default="host-zh-v2")
    parser.add_argument("--staged", action="store_true")
    args = parser.parse_args()
    import numpy as np
    import mlx.core as mx
    import imageio_ffmpeg
    import mlx_whisper
    from huggingface_hub import snapshot_download, model_info
    bank = ROOT / (f".local-generation/banks/{args.bank}" if args.staged else f"web/public/audio/{args.bank}")
    manifest = json.loads((bank / "manifest.json").read_text())
    model_id = "mlx-community/whisper-small-mlx"
    revision = model_info(model_id, revision="45f3915923c7a79a5a5b5a7d909d39aeb0e5630e").sha
    model_path = snapshot_download(model_id, revision=revision)
    report_path = ROOT / (".local-generation/verification.json" if args.bank == "host-zh-v1" else f".local-generation/{args.bank}-verification.json")
    results = json.loads(report_path.read_text())["clips"] if report_path.exists() else {}
    for key, entry in manifest["clips"].items():
        if args.only and key not in args.only.split(","):
            continue
        path = bank / f"{key}.mp3"
        decoded = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-i", str(path), "-ar", "16000", "-ac", "1", "-f", "f32le", "pipe:1"], check=True, capture_output=True).stdout
        samples = np.frombuffer(decoded, dtype="<f4").copy()
        start = time.monotonic()
        transcript = mlx_whisper.transcribe(samples, path_or_hf_repo=model_path, language="zh", temperature=0.0, condition_on_previous_text=False)
        result = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "text": entry["text"], "transcript": transcript["text"],
                  "durationSeconds": samples.size / 16000, "peakDb": float(20 * np.log10(max(float(np.abs(samples).max()), 1e-10))),
                  "rmsDb": float(20 * np.log10(max(float(np.sqrt(np.mean(samples ** 2))), 1e-10))), "asrSeconds": round(time.monotonic() - start, 2)}
        if result["sha256"] != entry["sha256"] or result["peakDb"] >= 0 or not np.isfinite(samples).all():
            raise RuntimeError(f"Invalid signal or fingerprint: {key}")
        results[key] = result
        report = {"asrModel": model_id, "asrRevision": revision, "asrLibrary": "mlx-whisper==0.4.3", "humanPhoneListening": "pending", "clips": results}
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"clip": key, "transcript": result["transcript"], "duration": result["durationSeconds"]}, ensure_ascii=False), flush=True)
        mx.clear_cache()


if __name__ == "__main__":
    main()

"""Derive pitch-preserving public audio variants; run before publishing a new bank."""
import hashlib
import json
import re
from pathlib import Path
import subprocess
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT / "web/src/narration/script.json").read_text())["version"]
if not re.fullmatch(r"host-zh-v[1-9][0-9]*", version):
    raise ValueError("Invalid bank version")
bank = ROOT / f".local-generation/banks/{version}"
manifest = json.loads((bank / "manifest.json").read_text())
rates = {}
for rate in (1.5, 2):
    destination = bank / "rates" / str(rate)
    destination.mkdir(parents=True, exist_ok=True)
    records = {}
    for clip, original in manifest["clips"].items():
        output = destination / f"{clip}.mp3"
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(bank / f"{clip}.mp3"),
                        "-af", f"atempo={rate},alimiter=limit=0.84:level=false", "-ar", "24000", "-ac", "1", "-b:a", "96k", str(output)], check=True)
        raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-i", str(output),
                              "-f", "f32le", "-ac", "1", "-ar", "24000", "-"], capture_output=True, check=True).stdout
        duration = len(raw) / (4 * 24000)
        if not 0.25 < duration < 30 or abs(duration - original["durationSeconds"] / rate) > 0.4:
            raise ValueError(f"Unexpected duration: {clip} at {rate}")
        records[clip] = {"text": original["text"], "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                         "bytes": output.stat().st_size, "durationSeconds": duration}
    rates[str(rate)] = records
manifest["rates"] = rates
manifest["timeStretch"] = {"method": "FFmpeg atempo", "preservesPitch": True, "rates": [1.5, 2], "switchAt": "next clip boundary"}
(bank / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"version": version, "variants": sum(len(r) for r in rates.values())}))

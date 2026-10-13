"""Offline acoustic review aid. Mandarin tone and perceived style still need human listening."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import numpy as np
from scipy.signal import correlate, find_peaks
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("bank")
parser.add_argument("--staged", action="store_true")
args = parser.parse_args()
bank = ROOT / (f".local-generation/banks/{args.bank}" if args.staged else f"web/public/audio/{args.bank}")
manifest = json.loads((bank / "manifest.json").read_text())
results = {}
for clip, entry in manifest["clips"].items():
    raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-i", str(bank / f"{clip}.mp3"),
                          "-ar", "16000", "-ac", "1", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    samples = np.frombuffer(raw, dtype="<f4").astype(float)
    pitches = []; energies = []
    for start in range(0, len(samples) - 640, 160):
        frame = samples[start:start + 640]; rms = np.sqrt(np.mean(frame ** 2))
        if rms < 0.008: continue
        energies.append(rms)
        frame = (frame - np.mean(frame)) * np.hanning(len(frame))
        ac = correlate(frame, frame, mode="full", method="fft")[len(frame) - 1:]
        lo, hi = 16000 // 260, 16000 // 65
        peaks, _ = find_peaks(ac[lo:hi])
        if not len(peaks) or ac[0] <= 0: continue
        lag = int(peaks[np.argmax(ac[lo:hi][peaks])]) + lo
        if ac[lag] / ac[0] >= 0.45: pitches.append(16000 / lag)
    duration = len(samples) / 16000
    results[clip] = {"sha256": entry["sha256"], "durationSeconds": round(duration, 2),
                     "charsPerSecond": round(len(re.findall(r"[\u4e00-\u9fff]", entry["text"])) / duration, 2),
                     "voicedRmsDb": round(float(20 * np.log10(np.median(energies))), 2),
                     "pitchMedianHz": round(float(np.median(pitches)), 1) if pitches else None,
                     "pitchSpanHz": round(float(np.percentile(pitches, 90) - np.percentile(pitches, 10)), 1) if pitches else None}
report = {"bank": args.bank, "method": "40ms autocorrelation voiced frames; descriptive, not a perceptual pass/fail", "clips": results}
destination = ROOT / f".local-generation/{args.bank}-style.json"
destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({k: v for k, v in results.items() if k.endswith("_action") or k.startswith("sheriff_")}, ensure_ascii=False))

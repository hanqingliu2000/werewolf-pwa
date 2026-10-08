"""Two public-only style pilots; never replace the current narration bank."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("HF_HOME", str(ROOT / ".local-generation/hf-cache"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
TEXT = "天黑，请闭眼。守卫请睁眼。请选择守护目标，确认后请闭眼。"
VARIANTS = {
    "everyday": "平静自然的普通话，像日常跟朋友说话，语速中等偏快，停顿简短，语气平淡，不拖长尾音。",
    "neutral": "清晰平直的普通话播报，语速正常，停顿简短，音量均匀，不夸张，不渲染情绪。",
}


def main():
    import numpy as np
    import mlx.core as mx
    import imageio_ffmpeg
    from huggingface_hub import model_info, snapshot_download
    from mlx_audio.tts.utils import load_model
    destination = ROOT / "web/public/audio/host-zh-calm-pilot"
    destination.mkdir(parents=True, exist_ok=True)
    model_id = "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-4bit"
    manifest_path = destination / "manifest.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
    revision = previous["revision"] if previous else model_info(model_id, revision="f35faf19b0cc2160865af64ecf0f22f83d335135").sha
    path = snapshot_download(model_id, revision=revision)
    model = load_model(path)
    records = {}
    for index, (key, instruction) in enumerate(VARIANTS.items()):
        seed = 2026100800 + index
        mx.random.seed(seed)
        parts = list(model.generate_custom_voice(text=TEXT, speaker="Uncle_Fu", language="Chinese", instruct=instruction, temperature=0.7, max_tokens=512))
        samples = np.concatenate([np.asarray(part.audio, dtype=np.float32) for part in parts])
        sr = int(parts[0].sample_rate)
        if not np.isfinite(samples).all() or not sr < samples.size < sr * 35:
            raise RuntimeError(f"Invalid pilot: {key}, duration={samples.size / sr:.2f}, finite={bool(np.isfinite(samples).all())}")
        raw = ROOT / f".local-generation/raw/calm-{key}.wav"
        raw.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(raw), "wb") as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(sr)
            wav.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        output = destination / f"{key}.mp3"
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
                        "-af", "loudnorm=I=-18:TP=-1.5:LRA=7", "-ar", "24000", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "96k", str(output)], check=True)
        records[key] = {"text": TEXT, "instruction": instruction, "seed": seed, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                        "bytes": output.stat().st_size, "durationSeconds": samples.size / sr}
        manifest = {"version": "host-zh-calm-pilot", "status": "audition only; not enabled in game", "speaker": "Uncle_Fu", "language": "Chinese",
                    "sourceModel": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "model": model_id, "revision": revision, "modelLicense": "Apache-2.0",
                    "generation": {"temperature": 0.7, "maxTokens": 512, "topK": 50, "topP": 1, "repetitionPenalty": 1.05},
                    "runtime": {name: importlib.metadata.version(name) for name in ["mlx-audio", "mlx", "transformers", "imageio-ffmpeg"]}, "clips": records}
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"variant": key, "durationSeconds": records[key]["durationSeconds"], "generated": True}), flush=True)
        mx.clear_cache()


if __name__ == "__main__":
    main()

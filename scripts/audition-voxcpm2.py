"""Generate isolated public-line auditions; never publish or change game assets."""
import argparse
import hashlib
import html
import importlib.metadata
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
MODEL = "mlx-community/VoxCPM2-bf16"
REVISION = "a7fb80d9056983135a54ca3f71fcc5a637ccddf5"
CLIPS = ("night_start", "werewolf_open", "werewolf_action", "witch_action",
         "guard_action", "seer_action", "sheriff_hands", "sheriff_speech")
STYLE = "成年男性，标准普通话，音色温和清晰，平静自然的桌游主持人口吻，语速舒缓均匀，平直播报，不夸张，不表演。"
STYLES = {
    "original": STYLE,
    "restrained": "中年男性，标准普通话，像日常说话一样平静自然。音色松弛，语速均匀，重音轻，语调起伏小，句尾平稳收住。",
    "young": "偏年轻的男性声音，标准普通话。",
}
PARAMETERS = {"inference_timesteps": 10, "cfg_value": 2.0, "max_tokens": 600}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def load_previous(base, name, clips):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,60}", name):
        raise ValueError("Use a safe lowercase comparison name")
    directory = base / name
    if not directory.resolve().is_relative_to(base.resolve()):
        raise ValueError("Comparison must stay inside local auditions")
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest["settings"]["model"] != MODEL or manifest["settings"]["revision"] != REVISION:
        raise ValueError("Compare the same pinned VoxCPM2 model")
    for key, text in clips.items():
        record = manifest["clips"][key]
        if record["text"] != text:
            raise ValueError(f"Comparison text differs: {key}")
        for rate in ("1", "1.5", "2"):
            path = directory / "voxcpm2" / rate / f"{key}.mp3"
            if digest(path) != record["rates"][rate]["sha256"]:
                raise ValueError(f"Changed comparison audio: {key}/{rate}")
    return directory, manifest


def make_page(destination, clips, comparison_label="现有 Qwen3-TTS", comparison_bank="qwen3", voice_label="VoxCPM2"):
    if comparison_bank not in ("qwen3", "previous"):
        raise ValueError("Unknown comparison audio directory")
    rows = []
    for key, text in clips.items():
        players = "".join(
            f'<div><h3>{html.escape(label)}</h3><audio controls preload="none" '
            f'aria-label="{html.escape(label + "：" + text)}" '
            f'data-base="{bank}" data-clip="{key}" '
            f'src="{bank}/1.5/{key}.mp3"></audio></div>'
            for bank, label in (("voxcpm2", voice_label), (comparison_bank, comparison_label)))
        rows.append(f'<section><h2>{html.escape(text)}</h2><div class="players">{players}</div></section>')
    page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VoxCPM2 本地试听</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7f6;color:#182421;font:16px/1.6 system-ui,sans-serif}
main{max-width:960px;margin:auto;padding:24px}header{border-bottom:2px solid #386a58;padding-bottom:20px}
h1{font-size:28px;margin:0 0 16px}h2{font-size:18px;margin:0 0 12px}h3{font-size:14px;color:#4b5b55;margin:0 0 8px}
fieldset{display:flex;gap:12px;flex-wrap:wrap;border:0;padding:0;margin:0}legend{margin-bottom:8px}
label{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;background:white;border:1px solid #a7b6ae;border-radius:4px;cursor:pointer}
input{accent-color:#386a58}:focus-visible{outline:3px solid #a53647;outline-offset:3px}
section{padding:24px 0;border-bottom:1px solid #c9d3ce}.players{display:grid;grid-template-columns:1fr 1fr;gap:24px}
audio{width:100%;height:54px;display:block}@media(max-width:600px){main{padding:16px}.players{grid-template-columns:1fr;gap:16px}h1{font-size:24px}}
</style><main><header><h1>PAGE_HEADING</h1><fieldset><legend>播放速度</legend>
<label><input type="radio" name="rate" value="1">原速</label>
<label><input type="radio" name="rate" value="1.5" checked>1.5 倍</label>
<label><input type="radio" name="rate" value="2">2 倍</label>
</fieldset></header>ROWS</main><script>
const players=[...document.querySelectorAll('audio')];
for(const player of players)player.addEventListener('play',()=>{for(const other of players)if(other!==player)other.pause()});
for(const input of document.querySelectorAll('input'))input.addEventListener('change',()=>{
for(const player of players){player.pause();player.src=`${player.dataset.base}/${input.value}/${player.dataset.clip}.mp3`;player.load()}});
</script></html>'''
    heading = html.escape(f"{voice_label} / {comparison_label}")
    (destination / "index.html").write_text(page.replace("PAGE_HEADING", heading).replace("ROWS", "".join(rows)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="voxcpm2-pilot-01")
    parser.add_argument("--download", action="store_true", help="Allow the pinned public model download")
    parser.add_argument("--only", choices=CLIPS, nargs="+", help="Anchor must exist before generating other lines")
    parser.add_argument("--seed-base", type=int, default=4300)
    parser.add_argument("--style", choices=STYLES, default="original")
    parser.add_argument("--compare-to", help="Previously generated local VoxCPM2 audition name")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,60}", args.name):
        parser.error("Use a safe lowercase audition name")
    if args.compare_to == args.name:
        parser.error("Use a different name; the comparison must remain unchanged")
    os.environ.setdefault("HF_HOME", str(ROOT / ".local-generation/hf-cache"))
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    if not args.download:
        os.environ["HF_HUB_OFFLINE"] = "1"
    import mlx.core as mx
    import numpy as np
    from huggingface_hub import snapshot_download
    from mlx_audio.tts.utils import load_model
    from scipy.io.wavfile import write as write_wav
    import imageio_ffmpeg

    script = json.loads((ROOT / "web/src/narration/script.json").read_text())
    source = ROOT / "web/public/audio" / script["version"]
    source_manifest = json.loads((source / "manifest.json").read_text())
    clips = {key: script["clips"][key] for key in CLIPS}
    previous_directory, previous_manifest = load_previous(
        ROOT / ".local-generation/auditions", args.compare_to, clips
    ) if args.compare_to else (None, None)
    destination = ROOT / ".local-generation/auditions" / args.name
    destination.mkdir(parents=True, exist_ok=True)
    raw_dir = destination / "raw"
    raw_dir.mkdir(exist_ok=True)
    manifest_path = destination / "manifest.json"
    instruction = STYLES[args.style]
    settings = {"model": MODEL, "revision": REVISION, "instruction": instruction,
                "generation": PARAMETERS, "seedBase": args.seed_base,
                "comparisonBank": script["version"], "texts": clips,
                "runtime": {name: importlib.metadata.version(name) for name in
                            ("mlx-audio", "mlx", "transformers", "imageio-ffmpeg")}}
    if previous_directory:
        settings["comparisonPilot"] = {"name": args.compare_to, "manifestSha256": digest(previous_directory / "manifest.json")}
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        "settings": settings, "license": "Apache-2.0", "clips": {},
        "reference": "First self-generated line; no human or third-party reference voice",
        "review": {"humanListening": "pending", "productionApproved": False}}
    if manifest["settings"] != settings:
        raise ValueError("Existing audition differs; use a new --name")
    model_path = snapshot_download(MODEL, revision=REVISION, local_files_only=not args.download)
    model = load_model(model_path)
    anchor = raw_dir / "night_start.wav"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    for key in args.only or CLIPS:
        raw = raw_dir / f"{key}.wav"
        previous = manifest["clips"].get(key)
        if previous:
            if digest(raw) != previous["rawSha256"]:
                raise ValueError(f"Changed raw audition: {key}")
        else:
            if key != "night_start" and not anchor.exists():
                raise ValueError("Generate night_start first for a consistent synthetic reference")
            if key != "night_start" and digest(anchor) != manifest["clips"]["night_start"]["rawSha256"]:
                raise ValueError("Changed synthetic reference; use a new audition")
            start = time.monotonic()
            mx.random.seed(args.seed_base + CLIPS.index(key))
            reference = {"ref_audio": str(anchor)} if key != "night_start" else {}
            parts = list(model.generate(text=clips[key], instruct=instruction, **reference, **PARAMETERS))
            samples = np.concatenate([np.asarray(part.audio, dtype=np.float32).reshape(-1) for part in parts])
            sample_rate = int(parts[0].sample_rate)
            seconds = samples.size / sample_rate
            if not np.isfinite(samples).all() or not 0.3 < seconds < 30 or np.max(np.abs(samples)) < 0.01:
                raise ValueError(f"Invalid waveform: {key}, {seconds:.2f}s; choose a new audition seed/name")
            write_wav(raw, sample_rate, samples)
            manifest["clips"][key] = {"text": clips[key], "rawSha256": digest(raw),
                                     "sampleRate": sample_rate, "durationSeconds": round(seconds, 3),
                                     "generationSeconds": round(time.monotonic() - start, 2), "rates": {}}
            write_json(manifest_path, manifest)
            mx.clear_cache()
        for rate in ("1", "1.5", "2"):
            output = destination / "voxcpm2" / rate / f"{key}.mp3"
            output.parent.mkdir(parents=True, exist_ok=True)
            filters = "loudnorm=I=-18:TP=-1.5:LRA=7"
            if rate != "1":
                filters += f",atempo={rate}"
            subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(raw), "-af", filters,
                            "-ar", "24000", "-ac", "1", "-b:a", "96k", str(output)], check=True)
            if previous_directory:
                comparison = previous_directory / "voxcpm2" / rate / f"{key}.mp3"
                record = previous_manifest["clips"][key]["rates"][rate]
                comparison_text = previous_manifest["clips"][key]["text"]
            else:
                comparison = source / (f"rates/{rate}/" if rate != "1" else "") / f"{key}.mp3"
                record = source_manifest["clips"][key] if rate == "1" else source_manifest["rates"][rate][key]
                comparison_text = record["text"]
            if comparison_text != clips[key] or digest(comparison) != record["sha256"]:
                raise ValueError(f"Unverified comparison: {key}/{rate}")
            target = destination / ("previous" if previous_directory else "qwen3") / rate / f"{key}.mp3"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(comparison, target)
            manifest["clips"][key]["rates"][rate] = {"sha256": digest(output), "bytes": output.stat().st_size}
        write_json(manifest_path, manifest)
        print(json.dumps({"clip": key, **{k: manifest["clips"][key][k] for k in ("durationSeconds", "generationSeconds")}}), flush=True)
    comparison_label = "现有 Qwen3-TTS"
    if previous_manifest:
        comparison_label = "之前克制版" if previous_manifest["settings"]["instruction"] == STYLES["restrained"] else "之前版本"
    make_page(destination, {key: clips[key] for key in CLIPS if key in manifest["clips"]},
              comparison_label=comparison_label,
              comparison_bank="previous" if previous_directory else "qwen3",
              voice_label={"original": "VoxCPM2", "restrained": "VoxCPM2 克制版", "young": "VoxCPM2 年轻男声"}[args.style])
    print(json.dumps({"audition": str(destination), "clips": len(manifest["clips"]),
                      "peakMemoryGB": round(mx.get_peak_memory() / 1e9, 2), "published": False}), flush=True)


if __name__ == "__main__":
    main()

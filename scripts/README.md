# Development and Audio Tools

English | [简体中文](README.zh-CN.md)

prod1.0, October 13, 2026. These tools generate only public, versioned narration, never nicknames, private roles, or secret actions.

## Daily Checks

From the repository root:

```sh
npm --prefix web run repo:check
npm --prefix web run check
npm --prefix web run build
npm --prefix web run smoke
node --test scripts/ui-review/review.test.mjs
```

See the [temporary UI review guide](ui-review/README.md). Review requests never forward real game writes.

## Offline Audio Generation

For a pace-only change, `normalize-action-audio.py --source-bank host-zh-v8 --analyze` measures the current bank without editing it. Increment script/voice versions first, then run the normalizer against the previous still-published bank to stage a new one; verify the changed clips, prepare both rates, and publish using the commands below. V8 used V7 from commit `7b141bb`, not a new voice model. Published versions remain immutable; the prior bank is retired from the current public tree only after replacement verification.

Existing deployments use committed MP3s directly; developing the website requires no model. Regeneration requires macOS ARM64, Python 3.12, and MLX/Metal. Model caches, WAVs, and listening reports belong only in ignored `.local-generation/` storage.

```sh
python3.12 -m venv .local-generation/venv
.local-generation/venv/bin/python -m pip install -r scripts/audio-lock.txt
```

Lines live in `web/src/narration/script.json`, with parameters in `voice.json`. V8 contains 48 original-speed clips and 96 pitch-preserving speed variants. Qwen3-TTS CustomVoice with Uncle_Fu is pinned by model revision and parameters in voice.json. There is no human voice cloning or live model inference in the website.

Published banks are immutable. Bump script/voice versions before changing the voice. `--reuse` accepts only retained, fingerprint-verified banks with matching model, parameters, and text. Removed historical banks are no longer hardcoded.

Once the pinned model is cached:

```sh
.local-generation/venv/bin/python scripts/generate-host-audio.py --offline
.local-generation/venv/bin/python scripts/verify-host-audio.py --staged --offline
.local-generation/venv/bin/python scripts/prepare-audio-rates.py
.local-generation/venv/bin/python scripts/generate-host-audio.py --publish --offline
```

Without a cache, explicitly download the pinned revision first; offline mode is not a download command. Generation writes staging files only. Publishing verifies the complete manifest, signal/ASR reports, and fingerprints for both speed variants before copying into local public assets. It does not deploy production.

Pronunciation audition; retain the Chinese generation instruction verbatim:

```sh
.local-generation/venv/bin/python scripts/generate-host-audio.py --offline --only sheriff_speech --audition-instruction '警长中的长读zhǎng，第三声，不读cháng。保持平直播报，不读出拼音解释。'
```

Auditions use a separate private directory and cannot combine with reuse or publish. ASR cannot prove correct polyphonic pronunciation, and acoustic metrics cannot replace listening or phone speakers. Current published clips retain the Sheriff pronunciation guidance.

FFmpeg atempo pre-generates 1.5x/2x clips, while player nodes keep a native rate of 1. Action time is unchanged. Files are 24 kHz, mono, 96 kbps MP3, targeting -18 LUFS and -1.5 dB peak.

## VoxCPM2 Local Audition

This is an isolated experiment, not the selected game voice. It does not modify the active bank, narration configuration, or production site. The [MLX model](https://huggingface.co/mlx-community/VoxCPM2-bf16) uses Apache-2.0 weights, pinned to revision `a7fb80d9056983135a54ca3f71fcc5a637ccddf5` (about 5 GB). Generation requires local Metal/GPU access.

Use a separate Python 3.12 environment; do not upgrade the existing Qwen environment:

```sh
python3.12 -m venv .local-generation/voxcpm2-venv
.local-generation/voxcpm2-venv/bin/python -m pip install -r scripts/voxcpm2-lock.txt
.local-generation/voxcpm2-venv/bin/python scripts/audition-voxcpm2.py --download
.local-generation/voxcpm2-venv/bin/python scripts/test-audition-voxcpm2.py
```

Later runs default to offline. The first self-generated line anchors the other seven voices; no human reference recording is used. Both voice banks have the same public text and loudness target, with pre-generated, pitch-preserving 1x/1.5x/2x files. The page defaults to 1.5x. Raw 48 kHz WAVs, 24 kHz MP3 comparisons, runtime provenance, and the listening page stay under ignored `.local-generation/auditions/voxcpm2-pilot-01/`. A different seed or configuration needs a new `--name`.

Serve only that audition folder, never the private parent or model cache:

```sh
.local-generation/voxcpm2-venv/bin/python -m http.server 3032 --bind 127.0.0.1 --directory .local-generation/auditions/voxcpm2-pilot-01
```

Open `http://127.0.0.1:3032/`. Listening acceptance, polyphonic pronunciation, and voice selection remain manual; valid audio and ASR are not evidence of naturalness. No cloud inference service is involved.

For the less expressive second audition, keep the original prompt/seed defaults intact and use:

```sh
.local-generation/voxcpm2-venv/bin/python scripts/audition-voxcpm2.py --name voxcpm2-calm-02 --style restrained --compare-to voxcpm2-pilot-01
.local-generation/voxcpm2-venv/bin/python -m http.server 3033 --bind 127.0.0.1 --directory .local-generation/auditions/voxcpm2-calm-02
```

The exact voice instruction is: “中年男性，标准普通话，像日常说话一样平静自然。音色松弛，语速均匀，重音轻，语调起伏小，句尾平稳收住。” The new first line creates its own synthetic reference; the model, seed schedule, public text, and speed processing stay unchanged. Each row compares the new restrained VoxCPM2 clip against the fingerprint-verified original VoxCPM2 clip, not Qwen. The old audition remains unchanged. This is still a listening candidate, not an approved replacement.

## Security Checks

See the [security policy](../SECURITY.md) for full-history Gitleaks and release-file checks. Do not commit scanners, reports, credentials, source audio, or model caches, or attach them to GitHub Releases.

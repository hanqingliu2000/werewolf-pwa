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

Existing deployments use committed MP3s directly; developing the website requires no model. Regeneration requires macOS ARM64, Python 3.12, and MLX/Metal. Model caches, WAVs, and listening reports belong only in ignored `.local-generation/` storage.

```sh
python3.12 -m venv .local-generation/venv
.local-generation/venv/bin/python -m pip install -r scripts/audio-lock.txt
```

Lines live in `web/src/narration/script.json`, with parameters in `voice.json`. V7 contains 48 original-speed clips and 96 pitch-preserving speed variants. Qwen3-TTS CustomVoice with Uncle_Fu is pinned by model revision and parameters in voice.json. There is no human voice cloning or live model inference in the website.

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

## Security Checks

See the [security policy](../SECURITY.md) for full-history Gitleaks and release-file checks. Do not commit scanners, reports, credentials, source audio, or model caches, or attach them to GitHub Releases.

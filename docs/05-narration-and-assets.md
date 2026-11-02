# Narration and Assets

English | [简体中文](05-narration-and-assets.zh-CN.md)

Baseline: prod1.0, October 13, 2026.

## Current Resources

- Script: `web/src/narration/script.json`.
- Generation parameters: `web/src/narration/voice.json`.
- Published bank: `web/public/audio/host-zh-v8/`, with 48 original-speed MP3s and 96 pitch-preserving 1.5x/2x MP3s.
- Eight original WebP images in `web/public/art/`: scene, card back, and six role portraits.
- Local Noto Serif SC font and OFL in `web/public/fonts/`.
- Each asset directory's `manifest.json` records fingerprints and provenance.

Historical auditions, older banks, and former branding references are not distributed with prod1.0; consult the archive tags.

## Narration Principles

Use the Uncle_Fu Chinese male voice: concise, even, and without excessive drama. Each role prompt describes the current action, without reciting confirmation rules. Public narration must not include nicknames, private roles, inspection results, the Witch's wolf target, or teammate coordination.

Configured roles retain the full eyes-open/action/eyes-closed sequence even after elimination or when the Witch has no potions. Roles absent from the composition have no phase. Action deadlines lead to silent waiting, not pause narration.

The first night adds three clips: eyes-closed nominations, eyes-open election speeches, and transition to results. Pronounce 警长 as `jǐng zhǎng`; retain the pronunciation hint in generation instructions.

## Playback and Timing

V8 preserves all V7 text and the approved voice. Only the five action-prompt originals are pace-corrected with pitch-preserving time stretching, matching the median spoken-span pace of 13 existing narration clips (about 2.83 Chinese characters/second before global speed). The other 43 originals are byte-identical. Both 1.5x and 2x variants derive from the corrected originals; do not use per-clip player-speed exceptions or padding to disguise fast speech. The manifest records the source hashes, factors, and measured spans. User audition and phone listening remain pending; isolated Seer/Witch ASR homophone ambiguities match the V7 baseline and are not proof of pronunciation correctness.

Default playback is 1.5x, with optional 2x. FFmpeg atempo pre-processes the faster files, while Web Audio nodes retain a native playback rate of 1, preserving pitch. Speed changes take effect on the next clip.

After the actual end of the eyes-open clip, notify the server to allow preselection. Start the full 30/10-second action window only after the action prompt finishes. Estimated audio length or a playbackRate change must not shorten action time.

System interruptions trigger bounded automatic recovery with valid-cue checks; acknowledged narration cannot advance twice. Manual pauses still require manual resume. Wake Lock only helps keep a foreground screen awake and does not promise background or locked-screen playback.

## Updating Assets

For prod1.0.1 the maintainer selected the pace-adjusted Qwen V8 bank instead of the VoxCPM2 auditions. Those auditions remain private and unselected; no inference service is kept running. Real-phone listening acceptance remains incomplete.

Generate only public lines. Keep model caches, source WAVs, and audition reports in ignored directories. Changing published files requires a new audio version: stage, audition, check signal/ASR results, generate speed variants, verify all fingerprints, then publish local assets. See the [audio tools](../scripts/README.md) for commands.

ASR and acoustic measurements assist review; they do not replace human listening, pronunciation checks, or real-phone speaker acceptance.

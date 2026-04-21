# MeloTTS 最近一次批量生成参数（prod）

- 目标目录：`projects/werewolf-pwa/web/public/audio/host/`
- 素材来源：`projects/werewolf-pwa/tts/tts-materials-v1.json`
- 生成范围：`required + recommended`（共 17 条）
- 语言：`ZH`
- 设备：`cpu`
- speaker_id：`0`
- speed：`0.93`（在上一版基础上“稍稍减慢”）
- 模型调用：`from melo.api import TTS` + `tts_to_file(...)`

## 生成环境
- Conda env: `melotts311`
- Python: `3.11`
- torch: `2.2.2+cpu`
- torchaudio: `2.2.2+cpu`
- 关键分词依赖：`mecab`, `fugashi`, `unidic`（已下载词典）

## 安全说明
- 本次仅生成 `required/recommended` 公共播报。
- 未生成/未落盘任何 `privateTextOnly`（如 `seer_result_good`, `seer_result_wolf`）。

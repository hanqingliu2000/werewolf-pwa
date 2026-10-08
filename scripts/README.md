# 本地主持语音生成

这套工具只处理公开、版本化主持台词，不处理玩家昵称、身份、查验结果或女巫刀口。网页直接加载生成的 MP3，不运行模型，也不调用付费服务。

## 环境

本轮使用 macOS arm64、8GB 内存、Python 3.12.14。模型、虚拟环境、原始 WAV 与转写结果全部位于被 Git 忽略的 `.local-generation/`。可复现环境记录在 `audio-lock.txt`，主要依赖见 `audio-requirements.txt`。

```sh
python3.12 -m venv .local-generation/venv
.local-generation/venv/bin/python -m pip install -r scripts/audio-lock.txt
.local-generation/venv/bin/python scripts/generate-host-audio.py --only sample
```

当前采用 [Qwen 1.7B CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice) 的 `Uncle_Fu` 中文男声及同源 MLX 4-bit 转换，模型 revision 固定为 `f35faf19b0cc2160865af64ecf0f22f83d335135`。用户已选择 B 的平直播报，指令与生成参数固定在 `web/src/narration/voice.json`。没有真人克隆、付费服务或网页实时模型。

## 生成和复核

台词来自 `web/src/narration/script.json`，当前音频版本为 `host-zh-v3`，规则仍为 `werewolf-web-v1`。生成只写 `.local-generation/banks/host-zh-v3`；完成复核后 `--publish` 校验完整清单和复核指纹，再复制到本机网页目录。它不执行 TTS，不代表云端发布，也不代表完整真机听感验收。

```sh
.local-generation/venv/bin/python scripts/generate-host-audio.py
.local-generation/venv/bin/python scripts/verify-host-audio.py --bank host-zh-v3 --staged
.local-generation/venv/bin/python scripts/generate-host-audio.py --publish
npm --prefix web run check
npm --prefix web run build
npm --prefix web run test:ui
```

先确认样音，再生成完整银行；复核异常片段后才验收网页。重复生成不能和浏览器验收同时进行，避免资源与清单暂时不一致。已经发布的音频版本保持不可变；修改台词或文件必须升级版本并更新契约。

复核工具使用本地 [MLX Whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)，模型为 `mlx-community/whisper-small-mlx`，revision `45f3915923c7a79a5a5b5a7d909d39aeb0e5630e`。当前报告在 `.local-generation/host-zh-v3-verification.json`，不上传音频；转写只辅助发现重复、漏读或失控生成，不把同音字和繁简转换当成音质结论，也不替代人耳试听。

V3 取消发牌台词中的身份确认要求，沿用已选平直播报声线与参数。只重做这一句时，可用 `--reuse host-zh-v2` 复用文本、声线、生成参数和复核指纹完全匹配的其他片段；已修改的台词不能复用。`--offline` 只使用本机缓存的固定 revision，不下载模型或发送内容。

```sh
.local-generation/venv/bin/python scripts/generate-host-audio.py --only roles_dealt --reuse host-zh-v2 --offline
.local-generation/venv/bin/python scripts/verify-host-audio.py --bank host-zh-v3 --only roles_dealt --staged --offline
.local-generation/venv/bin/python scripts/generate-host-audio.py --publish
```

V2 全部使用 B 样音的同一风格指令、temperature 0.7、maxTokens 512、topK 50、topP 1、repetitionPenalty 1.05，种子从2026100801按目录顺序递增。异常时最多3次有界重试，实际种子记录在清单。本轮40段均在首个种子生成完成。浮点 WAV 保留原始幅度，再交由 FFmpeg 归一化，避免先写整数 WAV 时硬限幅。

已发布资源不可覆盖。需重做时先增加版本、在暂存目录用 `--only`、`--force`、`--seed-offset` 复做、重新校验，再发布。旧 `host-zh-v1` 是0.6B首批历史对照，不是当前应用资源；不得混入 V2。

统一为 24kHz 单声道、96kbps MP3，响度目标为 -18 LUFS，真峰值目标 -1.5dB。编码使用锁定版本 `imageio-ffmpeg` 的本地 FFmpeg，不要求另装系统 FFmpeg。模型许可标记为 Apache-2.0，指的是模型来源；没有复制旧 `materials/` 声音。

## 手机试听

网页大厅中打开主持控制，选择语音，等待真实样音结束后确认听清。首次拒绝播放、资源失败或刷新不能跳过试音直接推进。对局内切换方式先暂停；转文字后未读完的公开公告仍需明确确认。

实际 iOS Safari、Android Chrome 的扬声器音量、短句可懂度、蓝牙中断、锁屏与来电体验仍需现场验收。本机浏览器的实际解码和 ended 事件不能证明真实手机外放已合格。

## 克制语气小样

用户反馈首批部分声音过于戏剧化。`generate-calm-pilot.py` 试做了日常提醒与平直播报，使用独立 `host-zh-calm-pilot` 目录。用户已选平直播报，其指令、音色、模型与参数已应用到全部 V2 文件。[官方能力区别](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)

```sh
.local-generation/venv/bin/python scripts/generate-calm-pilot.py
.local-generation/venv/bin/python scripts/verify-host-audio.py --bank host-zh-calm-pilot
```

对比页仍在 `/audio/host-zh-calm-pilot/index.html`，当前整套试听为 `/audio/host-zh-v3/index.html`，均不自动发声。风格方向已确认，但整套真机听感仍待验收；不把提示词或转写通过当作全部声音已符合人耳预期。

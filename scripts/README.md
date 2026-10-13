# 开发与语音工具

prod1.0，2026-10-13。这里只生成公开、版本化主持台词，不处理昵称、身份或私密行动。

## 日常检查

根目录：

```sh
npm --prefix web run repo:check
npm --prefix web run check
npm --prefix web run build
npm --prefix web run smoke
node --test scripts/ui-review/review.test.mjs
```

临时UI评审见[工具说明](ui-review/README.md)，不会转发真实游戏写入。

## 离线语音生成

现有部署直接使用已提交的MP3，开发网页不需要模型。重新生成需要macOS ARM64、Python3.12与MLX/Metal；模型缓存、WAV及审听报告只在被忽略的 `.local-generation/`。

```sh
python3.12 -m venv .local-generation/venv
.local-generation/venv/bin/python -m pip install -r scripts/audio-lock.txt
```

台词位于 `web/src/narration/script.json`，参数位于 `voice.json`。当前V7有48段原速、96段保音调倍速。Qwen3-TTS CustomVoice、Uncle_Fu，模型revision与参数都由voice.json固定。没有真人克隆或网页实时模型。

已发布版本不可覆盖。调整声音时先提升script/voice版本；`--reuse` 只接受仍保留且同模型/参数、同文本、已有指纹核验的旧银行。历史银行已移除，不再硬编码它们。

缓存模型准备好后：

```sh
.local-generation/venv/bin/python scripts/generate-host-audio.py --offline
.local-generation/venv/bin/python scripts/verify-host-audio.py --staged --offline
.local-generation/venv/bin/python scripts/prepare-audio-rates.py
.local-generation/venv/bin/python scripts/generate-host-audio.py --publish --offline
```

没有缓存时先显式下载固定revision，不能把离线模式当成下载命令。生成只写暂存目录；publish校验全清单、信号/ASR报告和两种倍速指纹后复制到本地public，不代表正式站发布。

多音字试听：

```sh
.local-generation/venv/bin/python scripts/generate-host-audio.py --offline --only sheriff_speech --audition-instruction '警长中的长读zhǎng，第三声，不读cháng。保持平直播报，不读出拼音解释。'
```

试听写独立私有目录，不能与reuse或publish混用。ASR不能证明多音字正确，声学指标不能替代人耳和手机外放。当前正式文件保留警长读音指导。

1.5/2倍使用FFmpeg atempo预生成，播放器节点保持原生速度1；行动时间不缩减。文件为24kHz、单声道、96kbps MP3，目标响度-18LUFS，峰值-1.5dB。

## 安全检查

Gitleaks全历史扫描及发布文件检查见[安全说明](../SECURITY.md)。扫描器、结果、凭据、音频原始文件和模型缓存不提交，不作为GitHub Release附件。

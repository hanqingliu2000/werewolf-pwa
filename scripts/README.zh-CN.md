# 开发与语音工具

[English](README.md) | 简体中文

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

临时UI评审见[工具说明](ui-review/README.zh-CN.md)，不会转发真实游戏写入。

## 离线语音生成

只调整节奏时，`normalize-action-audio.py --source-bank host-zh-v8 --analyze` 可只读测量当前声音库。先提升script/voice版本，再以仍在发布目录中的上一版为来源运行校准，暂存新版本；核验改动片段、生成两种倍速后，按下列命令发布。V8来源为提交 `7b141bb` 的V7，不更换声音模型。已发布版本不可覆盖，替代版本核验后才从当前公开目录退役旧版本。

现有部署直接使用已提交的MP3，开发网页不需要模型。重新生成需要macOS ARM64、Python3.12与MLX/Metal；模型缓存、WAV及审听报告只在被忽略的 `.local-generation/`。

```sh
python3.12 -m venv .local-generation/venv
.local-generation/venv/bin/python -m pip install -r scripts/audio-lock.txt
```

台词位于 `web/src/narration/script.json`，参数位于 `voice.json`。当前V8有48段原速、96段保音调倍速。Qwen3-TTS CustomVoice、Uncle_Fu，模型revision与参数都由voice.json固定。没有真人克隆或网页实时模型。

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

## VoxCPM2 本地试听

这是独立实验，不是已选定的游戏声音，不修改当前声音库、播报配置或正式站。[MLX模型](https://huggingface.co/mlx-community/VoxCPM2-bf16)权重使用Apache-2.0，固定revision为 `a7fb80d9056983135a54ca3f71fcc5a637ccddf5`，下载约5GB，生成需要本机Metal/GPU权限。

使用独立的Python3.12环境，不升级现有Qwen环境：

```sh
python3.12 -m venv .local-generation/voxcpm2-venv
.local-generation/voxcpm2-venv/bin/python -m pip install -r scripts/voxcpm2-lock.txt
.local-generation/voxcpm2-venv/bin/python scripts/audition-voxcpm2.py --download
.local-generation/voxcpm2-venv/bin/python scripts/test-audition-voxcpm2.py
```

后续运行默认离线。首句由模型直接设计音色，其余七句用该合成音作为音色参考，不使用真人录音。两组声音采用相同公开文本与响度目标，预生成保音调的原速、1.5倍、2倍版本；页面默认1.5倍。48kHz原始WAV、24kHz MP3对照、运行参数与试听页均留在被忽略的 `.local-generation/auditions/voxcpm2-pilot-01/`。修改种子或配置必须换新的 `--name`。

仅开放该试听目录，不能开放私有父目录或模型缓存：

```sh
.local-generation/voxcpm2-venv/bin/python -m http.server 3032 --bind 127.0.0.1 --directory .local-generation/auditions/voxcpm2-pilot-01
```

打开 `http://127.0.0.1:3032/`。音色选择、自然度和多音字仍待人工试听；有效波形或ASR识别不等于听感验收，不涉及云端推理服务。

第二组使用更克制的提示词，保留原提示词和随机种子默认值不变：

```sh
.local-generation/voxcpm2-venv/bin/python scripts/audition-voxcpm2.py --name voxcpm2-calm-02 --style restrained --compare-to voxcpm2-pilot-01
.local-generation/voxcpm2-venv/bin/python -m http.server 3033 --bind 127.0.0.1 --directory .local-generation/auditions/voxcpm2-calm-02
```

准确提示词为：“中年男性，标准普通话，像日常说话一样平静自然。音色松弛，语速均匀，重音轻，语调起伏小，句尾平稳收住。” 新首句建立自己的合成音参考；模型、种子规则、公开台词和倍速处理不变。页面逐句比较新克制版与指纹核验过的原VoxCPM2，不是Qwen。旧试听不修改；新版本仍待试听，不代表已获准替换。

## 安全检查

Gitleaks全历史扫描及发布文件检查见[安全说明](../SECURITY.zh-CN.md)。扫描器、结果、凭据、音频原始文件和模型缓存不提交，不作为GitHub Release附件。

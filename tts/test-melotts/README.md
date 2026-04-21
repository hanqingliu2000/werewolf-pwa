# MeloTTS 本地生成说明（已验证可用）

这个目录用于本地生成狼人杀主持音频，并同步到 `web/public/audio/host/`。

## 当前状态
- ✅ MeloTTS 可用（conda env: `melotts311`）
- ✅ 已成功生成并落地 close 系列音频（守卫/狼人/预言家/女巫请闭眼）

## 推荐命令

```bash
/home/wanda/miniforge3/bin/conda run -n melotts311 python generate_melo.py
```

> 若要快速补单条音频，可直接写一个临时 Python 脚本调用：
> `from melo.api import TTS` + `tts_to_file(...)`

## 关键参数（当前实践）
- language: `ZH`
- device: `cpu`
- speaker_id: `0`
- speed: `0.93`（偏慢，适合主持口播）

## 输出目录
- 测试输出：`tts/test-melotts/out/`
- 生产落地：`web/public/audio/host/`

## 发布步骤
1. 生成音频到目标目录
2. 本地试听确认
3. `vercel --prod --yes` 发布
4. 用线上房间实测“阶段切换播报”

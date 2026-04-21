# TTS 语音主持并行方案记录（A + C）

更新时间：2026-02-13

## 目标
并行探索两条技术路径：
- 方案A：预生成音频文件（`/public/audio/host/*.mp3`）
- 方案C：浏览器 Web Speech API 实时合成

## 当前实现状态
- [x] 房主对局页新增“语音主持实验面板”
- [x] 可切换模式：browser / prebuilt
- [x] 支持手动播报当前阶段
- [x] 支持自动播报（阶段变化触发）
- [x] 本地保存偏好（mode / auto）

## 代码位置
- 主持播报映射与实现：`web/lib/host-tts.ts`
- 房主对局页语音主持面板：`web/app/room/[roomId]/play/page.tsx`

## 文件结构约定（方案A）
- 目录：`web/public/audio/host/`
- 文件命名（与 `phaseNarration.key` 对齐）：
  - `night_guard_open.mp3`
  - `night_werewolf_open.mp3`
  - `night_seer_open.mp3`
  - `night_witch_open.mp3`
  - `night_resolve.mp3`
  - `day_announce.mp3`
  - `day_input.mp3`

## 运行时行为
- `browser` 模式：调用 `speechSynthesis`，语言 `zh-CN`
- `prebuilt` 模式：播放 `/audio/host/<key>.mp3`
- 首次需手动点击“解锁语音播放”以适配移动端自动播放限制

## 当前阻塞与说明
- 当前环境通过 `tts` 工具生成的 mp3 文件为 0 byte（空文件），因此暂未将无效音频纳入仓库。
- 已添加校验脚本：`scripts/check-host-audio.mjs`（检查音频文件是否存在且非空）。

## 待办
- [ ] 在可用 TTS 环境重新生成并放入 `web/public/audio/host/*.mp3`
- [ ] 运行 `node scripts/check-host-audio.mjs` 验证资产完整性
- [ ] 记录 A/C 实机稳定性（iOS Safari / Android Chrome）
- [ ] 如果 C 在特定机型不稳定，默认回退到 A

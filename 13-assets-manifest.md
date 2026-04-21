# 狼人杀主持 PWA 素材清单（AI 生成版）

> 目标：一次性整理开发所需图文音素材，并标注生成方式。
> 优先级：先保证 MVP 可用，再做风格统一升级。

## 0. 目录结构建议

```text
projects/werewolf-pwa/assets/
  icons/
  roles/
  ui/
  backgrounds/
  sfx/
  tts/
  docs/
```

---

## 1) 必需素材（MVP 必备）

## 1.1 PWA 图标（必需）

| 文件名 | 尺寸 | 格式 | 用途 | 生成方式 |
|---|---:|---|---|---|
| `icons/app-icon-192.png` | 192x192 | PNG | PWA 安装图标 | AI 生成 1024 方图后缩放 |
| `icons/app-icon-512.png` | 512x512 | PNG | PWA 安装图标 | 同上 |
| `icons/maskable-512.png` | 512x512 | PNG | Android maskable 图标 | AI 生成时保留中心安全区 |
| `icons/favicon-32.png` | 32x32 | PNG | 浏览器标签页 | 从主图标导出 |

**AI 提示词示例：**
- 「一个简洁现代的狼人杀应用图标，扁平化，深蓝+月光银配色，中心是抽象狼爪与月亮，强对比，高辨识度，适合小尺寸图标，无文字，1:1」

---

## 1.2 角色卡（必需，6 张）

统一规格：`1024x1536`（2:3），PNG，半写实或卡通风任选，但要统一。

| 文件名 | 角色 | 用途 | 生成方式 |
|---|---|---|---|
| `roles/werewolf.png` | 狼人 | 私密身份展示 | AI 生成 |
| `roles/seer.png` | 预言家 | 私密身份展示 | AI 生成 |
| `roles/witch.png` | 女巫 | 私密身份展示 | AI 生成 |
| `roles/guard.png` | 守卫 | 私密身份展示 | AI 生成 |
| `roles/hunter.png` | 猎人 | 私密身份展示 | AI 生成 |
| `roles/villager.png` | 平民 | 私密身份展示 | AI 生成 |

**统一风格提示词模板：**
- 「狼人杀角色卡插画，{角色名}，中景半身，夜晚氛围，电影感打光，背景简洁，边缘留白用于UI叠字，统一画风，非恐怖血腥，高清」

**负面提示词建议：**
- 「避免文字水印、避免Logo、避免多余人物、避免血腥、避免低清晰度、避免畸形手指」

---

## 1.3 UI 状态图标（必需）

建议先用图标库（Lucide/Heroicons）导出 SVG，再做风格替换。

| 文件名 | 含义 |
|---|---|
| `ui/icon-waiting.svg` | 等待中 |
| `ui/icon-action.svg` | 可操作 |
| `ui/icon-submitted.svg` | 已提交 |
| `ui/icon-dead.svg` | 已出局 |
| `ui/icon-night.svg` | 夜晚 |
| `ui/icon-day.svg` | 白天 |
| `ui/icon-resolve.svg` | 结算 |
| `ui/icon-win-good.svg` | 好人胜 |
| `ui/icon-win-wolf.svg` | 狼人胜 |
| `ui/icon-warning.svg` | 警告提示 |

---

## 1.4 背景图（建议 MVP 就有）

| 文件名 | 尺寸 | 说明 |
|---|---:|---|
| `backgrounds/night-bg.jpg` | 1920x1080 | 夜晚主背景 |
| `backgrounds/day-bg.jpg` | 1920x1080 | 白天主背景 |
| `backgrounds/lobby-bg.jpg` | 1920x1080 | 房间等待页背景 |

**AI 提示词示例：**
- 夜晚：「静谧森林与月光，低饱和蓝色调，轻雾，留白，适合作为移动端 UI 背景」
- 白天：「清晨村庄广场，柔和阳光，简洁构图，低细节不抢文字」

---

## 2) 文案素材（你确认风格后我可直接落文件）

建议放在：`assets/docs/copywriting-zh-CN.json`

建议字段：
- `broadcast.night_start`
- `broadcast.day_start`
- `broadcast.announce_deaths`
- `hint.seer_action`
- `hint.witch_save`
- `hint.witch_poison`
- `error.phase_mismatch`
- `error.already_eliminated`
- `system.game_end_good`
- `system.game_end_wolf`

> 我可以下一步直接给你一版「中性主持」+「沉浸主持」双模板。

---

## 3) 音频素材（TTS + SFX）

## 3.1 TTS 播报（建议）

放在：`assets/tts/`

| 文件名 | 内容 | 时长建议 |
|---|---|---:|
| `tts/night-start.mp3` | “天黑请闭眼，夜晚阶段开始。” | 2~4s |
| `tts/day-start.mp3` | “天亮了，请睁眼，开始白天讨论。” | 2~4s |
| `tts/announce-death.mp3` | “昨夜死亡玩家如下……” | 2~4s |
| `tts/phase-switch.mp3` | “请下一位角色行动。” | 1~2s |
| `tts/game-end-good.mp3` | “好人阵营获胜。” | 1~2s |
| `tts/game-end-wolf.mp3` | “狼人阵营获胜。” | 1~2s |

**TTS 生成建议：**
- 语速：0.95~1.00
- 风格：中性、清晰、主持感
- 音量标准化：-16 LUFS（或统一峰值 -1dB）
- 采样率：44.1kHz / 48kHz 均可（全项目统一）

## 3.2 音效 SFX（可从免费库获取）

放在：`assets/sfx/`

| 文件名 | 用途 | 时长建议 |
|---|---|---:|
| `sfx/click-confirm.wav` | 提交成功 | <0.5s |
| `sfx/phase-transition.wav` | 阶段切换 | 0.5~1s |
| `sfx/private-notice.wav` | 私密操作提醒 | <0.8s |
| `sfx/error.wav` | 错误反馈 | <0.6s |

**获取方式：**
- 免费音效站（CC0/可商用）下载 + 二次裁剪
- 或 AI 生成短音效（注意授权条款）

---

## 4) AI 生成工作流（建议你照着跑）

1. 先生成高分辨率母版（如 1536 或 2048 宽）
2. 人工挑选 1 套统一风格
3. 批量裁切导出到目标尺寸
4. 用脚本统一命名（严格按本清单）
5. 进行压缩（PNG/JPG/WebP）
6. 放入 `assets/` 对应目录

---

## 5) 验收标准（避免返工）

- 风格统一（同一美术语言、同一色盘）
- 文件名和路径 100% 对齐
- 图标在小尺寸可识别
- 背景不抢前景文字
- 音频无爆音、无明显底噪
- 授权可用（可商用/可再分发）

---

## 6) 版权与合规备注

- AI 生成素材请保留：生成平台、模型、时间、prompt、license 截图。
- 第三方音效务必记录来源 URL 与授权类型。
- 建议新增登记表：`assets/docs/asset-license-log.md`。

---

## 7) 下一步我可以直接帮你做

- 产出 `asset-license-log.md` 模板
- 产出 `copywriting-zh-CN.json`（中性版 + 沉浸版）
- 写一个 `scripts/check-assets.ts`，启动前自动检查素材是否齐全

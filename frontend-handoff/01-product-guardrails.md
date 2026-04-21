# 01. 产品护栏（必须遵守）

> 目标：只升级前端视觉与交互体验，不破坏既有玩法逻辑、状态流转与接口契约。

## 不可变更（Hard Constraints）
1. **状态机不可改**（仅可优化展示文案/视觉）：
   - `LOBBY`
   - `NIGHT_GUARD`
   - `NIGHT_WEREWOLF`
   - `NIGHT_SEER`
   - `NIGHT_WITCH`
   - `NIGHT_RESOLVE`
   - `DEATH_REACTION_HUNTER`
   - `DAY_ANNOUNCE`
   - `DAY_INPUT`
   - `CHECK_WIN`
   - `END`
2. **服务端判定优先**：前端不可自行推进阶段，不可本地“伪结算”。
3. **角色权限不可放宽**：
   - 守卫只能 `guard`
   - 狼人只能 `kill`
   - 预言家只能 `see`
   - 女巫只能 `save` / `poison` / `pass`
4. **死人不能行动**（UI 和交互上都要锁定）。
5. **狼人确认机制不可删**：需要一致目标 + `confirm` 才推进到下一阶段。
6. **房间号、玩家加入、房主控制流程保留**。

## 允许变更（Safe Changes）
- 视觉风格（配色、排版、卡片、阴影、动效）。
- 组件拆分、样式系统（CSS variables / Tailwind / CSS modules 均可）。
- 信息层级优化（主操作突出、次要信息折叠）。
- 移动端可用性优化（触控、字号、间距）。

## 强烈建议
- 采用“夜色桌游”主题：深色底 + 高对比可点击元素 + 低噪声背景纹理。
- UI 文案保持简短、明确、指令式（尤其夜晚阶段）。
- 每个阶段提供“你现在该做什么”的单行提示。

# 06. UI 视觉规范 v1（Werewolf PWA）

> 适用范围：`/create`、`/join`、`/room/[roomId]/lobby`、`/room/[roomId]/play`  
> 目标：在不改变玩法机制、状态机与 API 语义前提下，完成“现代、简洁、桌游夜色主题”的前端视觉与交互改版。  
> 约束基线：严格遵守 `01-product-guardrails.md` 与 `02-api-state-contract.md`。

---

## 0) 不可变更前提（设计侧落地约束）

1. 仅做视觉与交互呈现优化，不更改以下语义：
   - 相位状态机（`LOBBY` → `...` → `END`）
   - 服务端驱动阶段推进（前端不可本地偷跑）
   - 角色权限与行动类型映射（`guard/kill/see/save/poison/pass`）
   - 狼人共识 + confirm 机制
   - 白天录入、猎人开枪、胜负判定流程
2. “禁用态”是 UI 表达，不是逻辑替代；所有关键校验仍以后端返回为准。
3. 设计输出不得新增/删减接口字段，不改变错误码语义。

---

## 1) 主题 Token（Design Tokens）

> 形式建议：CSS Variables / Tailwind Theme 均可，命名语义优先，不绑定具体组件。

### 1.1 颜色（Color）

```txt
--bg-canvas:        #0B1020   // 页面总背景（夜色）
--bg-surface-1:     #121A2B   // 一级卡片背景
--bg-surface-2:     #1A2438   // 二级容器背景
--bg-overlay:       rgba(6,10,20,.72) // 弹层遮罩

--text-primary:     #E5E7EB
--text-secondary:   #94A3B8
--text-muted:       #64748B
--text-on-accent:   #0B1020

--brand-primary:    #7C8CFF   // 主操作、可点击主通道
--brand-primary-h:  #96A3FF   // hover
--brand-primary-a:  #6777F0   // active

--state-success:    #34D399
--state-warning:    #F2B544
--state-danger:     #F87171
--state-info:       #60A5FA

--border-default:   #273247
--border-strong:    #3A4966
--focus-ring:       #A5B4FC

--role-wolf:        #EF4444
--role-seer:        #38BDF8
--role-witch:       #A78BFA
--role-guard:       #34D399
--role-hunter:      #F59E0B
--role-villager:    #CBD5E1

--disabled-bg:      #1E293B
--disabled-text:    #64748B
--disabled-border:  #334155
```

### 1.2 间距（Spacing）

8pt 栅格：

```txt
--space-0: 0
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
```

应用建议：
- 页面外边距：移动端 16，桌面端 24~32
- 卡片内边距：16/20
- 主要区块垂直间距：24

### 1.3 圆角（Radius）

```txt
--radius-sm: 8px
--radius-md: 12px
--radius-lg: 16px
--radius-xl: 20px
--radius-pill: 999px
```

### 1.4 阴影（Shadow）

```txt
--shadow-sm: 0 2px 8px rgba(0,0,0,.25)
--shadow-md: 0 8px 24px rgba(0,0,0,.32)
--shadow-lg: 0 16px 40px rgba(0,0,0,.4)
--shadow-focus: 0 0 0 3px rgba(165,180,252,.45)
```

### 1.5 字号与排版（Typography）

```txt
--font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto

--text-xs: 12px/18px
--text-sm: 14px/20px
--text-md: 16px/24px
--text-lg: 18px/26px
--text-xl: 20px/28px
--text-2xl: 24px/32px

--weight-regular: 400
--weight-medium: 500
--weight-semibold: 600
--weight-bold: 700
```

层级建议：
- 页面标题：`text-2xl semibold`
- 区块标题：`text-lg semibold`
- 主正文：`text-md regular`
- 辅助说明：`text-sm regular`
- 状态标签：`text-xs medium`

### 1.6 动效（Motion）

```txt
--motion-fast: 150ms ease-out
--motion-normal: 200ms ease-out
--motion-slow: 220ms ease-out
```

规则：轻量过渡（颜色、阴影、透明度、位移 <= 8px），禁用复杂转场。

---

## 2) 四个页面线框布局说明（Wireframe Spec）

## 2.1 `/create`（创建房间）

### 信息架构
1. 顶部：页面标题 + 副标题（1 行说明“配置规则后创建房间”）
2. 主卡片（基础配置）：
   - 房间名/主持人名（如有）
   - 玩家人数
   - 关键规则开关（常用项）
3. 折叠卡片（进阶配置，默认收起）：
   - 女巫是否同夜双药等高风险项
   - 每个高风险项提供 tooltip（说明影响）
4. 底部固定操作栏：
   - 主按钮“创建房间”
   - 次按钮“重置配置”（弱化）

### 交互规则
- 提交前本地校验仅做格式/必填提示，不代替服务端校验。
- 主按钮禁用条件：必填未满足、请求中。
- 提交成功后按既有流程跳转，不新增流程分支。

---

## 2.2 `/join`（加入房间）

### 信息架构
1. 顶部：Logo/标题 + 简短说明
2. 中央主卡片：
   - 房间码输入（大字号、等宽可选）
   - 昵称输入
   - 主按钮“加入房间”
3. 底部辅助：
   - “去创建房间”跳转

### 交互规则
- 房间码自动转大写，限制 6 位。
- 输入实时格式反馈（长度不足、非法字符）。
- 常见错误行内展示 + toast 双通道：
  - 房间不存在（`ROOM_NOT_FOUND`）
  - 玩家不存在/昵称冲突（按服务端错误映射文案）
- 请求中禁用提交按钮并显示 loading。

---

## 2.3 `/room/[roomId]/lobby`（大厅）

### 桌面布局（>=1024）
- 两栏布局（7:5）：
  - 左栏：玩家列表卡（头像占位/昵称/状态）
  - 右栏：规则摘要卡 + 房间信息卡（房间码、人数、房主标识）
- 底部固定房主操作区：
  - 房主可见主按钮“开始游戏”
  - 非房主显示“等待房主开始”信息

### 移动布局（<1024）
- 单列卡片堆叠：房间信息 → 玩家列表 → 规则摘要
- 底部 sticky 操作条保留“开始游戏/等待提示”

### 交互规则
- 玩家进出列表变化使用轻量动画（淡入 150ms）。
- 开始按钮禁用态明确展示原因（人数不足等）。
- 不允许前端伪造可开始状态；以后端状态为准。

---

## 2.4 `/room/[roomId]/play`（对局主界面）

### 总体结构
1. 顶部：阶段进度条（横向步骤）
   - 仅可视化当前 phase 与相邻 phase，不改变推进逻辑
   - 高亮当前 `room.currentPhase`
2. 中部：当前行动区（核心卡）
   - 标题：当前阶段名 + 单行“你现在该做什么”
   - 内容：仅渲染当前角色合法动作入口（UI 层）
   - 包含目标选择列表、确认按钮、次要操作（如 pass）
3. 侧/下区域：玩家面板
   - 玩家存活/死亡状态可视化
   - 死亡玩家明显禁用（灰阶、删除线或墓碑 icon）
4. 底部：系统事件流（最近 N 条）
   - 按时间倒序卡片展示
   - 事件标签（公告/夜晚结果/投票结果）

### 关键交互规范
- 狼人阶段：
  - 必须先选择目标并满足共识条件，再允许 confirm 主操作显著可用。
  - 若服务端返回 `WOLF_CONSENSUS_REQUIRED`，显示专属提示。
- 猎人开枪、狼人确认等高风险动作：
  - 移动端统一二次确认弹层。
- `PHASE_MISMATCH` / `PHASE_CONFLICT`：
  - 提示“阶段已更新，请同步最新状态”并触发状态刷新。
- `ALREADY_ELIMINATED`：
  - 立即切换为观战/禁用视图，不展示可行动主按钮。

---

## 3) 状态 / 错误 / 禁用态规范

## 3.1 通用状态

- `idle`：默认可操作
- `loading`：按钮 loading + 表单锁定（防重复）
- `success`：toast（短）+ 行内成功文案（可选）
- `error`：toast + 行内错误（字段相关则贴字段）

## 3.2 错误码映射（必须覆盖）

- `PHASE_MISMATCH`：阶段不一致，请等待同步后重试
- `PHASE_CONFLICT`：当前阶段已变化，已为你刷新最新状态
- `FORBIDDEN`：你当前角色/状态无权执行此操作
- `ALREADY_ELIMINATED`：你已出局，不能继续行动
- `PLAYER_NOT_FOUND`：玩家信息不存在，请刷新重试
- `ROOM_NOT_FOUND`：房间不存在或已结束
- `TARGET_REQUIRED`：请先选择目标
- `WOLF_CONSENSUS_REQUIRED`：狼人目标未达成一致，暂不可确认

> 实现建议：统一 `error-code -> i18n 文案` 映射表；未知错误显示通用回退文案。

## 3.3 禁用态规范

### 按钮禁用
- 视觉：`disabled-bg/disabled-text/disabled-border`
- 文案：保留可读，不隐藏
- 指针：`not-allowed`
- 可附 Tooltip 解释禁用原因

### 玩家禁用（死亡）
- 条目降噪：透明度 60%
- 状态标识：`已出局`
- 可交互元素全部禁用
- 不移除历史信息，避免信息断层

### 表单禁用（请求中）
- 输入框与主操作统一锁定
- 保留取消/返回（若流程允许）

---

## 4) 移动端规范（Mobile First）

1. 断点建议：
   - `sm`: 360+
   - `md`: 768+
   - `lg`: 1024+
2. 可触达与误触防护：
   - 主按钮高度 `>=44px`（推荐 48）
   - 可点击热区 `>=44x44`
   - 相邻危险按钮间距 `>=12px`
3. 布局策略：
   - 单列优先；关键状态（阶段、主操作）置于首屏
   - 底部 sticky 操作栏保障单手操作
4. 输入体验：
   - Join 页房间码使用易读大字号（建议 20~24）
   - 键盘弹出不遮挡主按钮（必要时按钮上移）
5. 高风险动作统一二次确认：
   - 狼人 confirm
   - 猎人 shot
   - 其他一旦提交不可逆的动作

---

## 5) 可访问性规范（A11y）

1. 对比度：文本与背景满足 WCAG AA（普通文本 >= 4.5:1）。
2. 焦点可见：所有可交互元素有清晰 focus ring（不可仅靠颜色微变）。
3. 键盘可达：
   - Tab 顺序符合视觉阅读流
   - 弹层支持 Esc 关闭与焦点回收
4. 语义化：
   - 按钮/输入使用正确 HTML 语义
   - 图标按钮必须有 `aria-label`
5. 错误可感知：
   - 错误文案和字段绑定（`aria-describedby`）
   - 颜色不是唯一错误标识（配文案/icon）
6. 动效无障碍：
   - 尊重 `prefers-reduced-motion`
   - 降低非必要过渡

---

## 6) 页面级文案与反馈风格

- 文案原则：短句、指令式、当前任务导向。
- 每个阶段提供一句 “你现在该做什么”。
- 错误文案避免技术术语堆叠，先给行动建议（如“请重试/等待同步/选择目标”）。

---

## 7) 与状态机/接口契约的对齐声明

本规范仅涉及视觉层、信息层级与交互反馈，不引入任何以下变更：
- 不新增/修改 phase；不改变 phase 跳转条件。
- 不新增/修改 API 路由与请求体字段。
- 不更改角色动作权限与服务器判定时机。
- 不取消狼人共识确认，不改白天录入/胜负结算。

---

## 8) 风险点总结（设计实施阶段）

1. **视觉引导过强导致“误以为可操作”风险**  
   若 UI 在错误 phase 仍突出按钮，用户会误触。需严格基于服务端 phase 显示可操作态。

2. **禁用态仅做样式未做可访问性提示**  
   可能让键盘/读屏用户无法理解原因。需补充禁用原因文案与 aria 描述。

3. **错误码映射不完整**  
   会出现“未知错误”体验割裂。必须覆盖 `02-api-state-contract.md` 列出的全部错误码。

4. **移动端危险操作误触**  
   狼人确认/猎人开枪等不可逆动作如无二次确认，可能造成实质玩法事故。

5. **事件流信息过多造成认知噪声**  
   若全部展开会挤压主操作区。建议默认展示最近 N 条，并支持查看历史。

6. **主题对比不足影响夜间可读性**  
   深色主题下灰字过多易读性下降。需在实现时进行对比度抽检（WCAG AA）。

7. **跨端布局不一致造成状态误判**  
   桌面与移动若信息排序差异过大，可能误读当前阶段。需保证“阶段 + 主操作”在两端都优先可见。

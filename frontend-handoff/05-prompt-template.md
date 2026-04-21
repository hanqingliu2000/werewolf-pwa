# 05. 可直接给前端生成 AI 的 Prompt 模板

你是资深前端工程师。请在下面项目中执行“仅前端 UI 重构”任务。

## 项目与约束
- 项目：`projects/werewolf-pwa/web`
- 技术栈：Next.js + React + TypeScript
- 目标：现代、简洁、桌游/狼人杀主题风格
- **绝对约束**：
  1) 不修改游戏机制与状态机。
  2) 不修改 API 路由语义和请求字段。
  3) 不放宽任何角色权限。
  4) 不删除狼人确认、白天录入、胜负判定流程。

## 请先阅读并遵循
- `projects/werewolf-pwa/frontend-handoff/01-product-guardrails.md`
- `projects/werewolf-pwa/frontend-handoff/02-api-state-contract.md`
- `projects/werewolf-pwa/frontend-handoff/03-ui-redesign-brief.md`
- `projects/werewolf-pwa/frontend-handoff/04-acceptance-checklist.md`

## 具体任务
1. 重构以下页面视觉与交互：
   - `/create`
   - `/join`
   - `/room/[roomId]/lobby`
   - `/room/[roomId]/play`
2. 建立统一主题 token（颜色、圆角、阴影、间距、按钮层级）。
3. 优化移动端布局和误触防护。
4. 错误反馈统一（toast + inline）。
5. 输出变更说明（改了什么、为什么、未改什么）。

## 输出要求
- 直接修改代码并给出 patch。
- 列出潜在风险点。
- 最后执行并汇报：
  - `npm run build:werewolf`
  - `npm run test:werewolf`

若你发现某项改动会触发机制风险，请停止并给出两个可选方案（保守/激进），默认采用保守方案。

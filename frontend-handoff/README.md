# 前端 AI 交接包（狼人杀 PWA）

用途：把这些文件直接给前端生成 AI（Cursor/Cline/Claude Code 等），让它在**不破坏玩法机制与后端契约**的前提下，升级 UI 到“现代、简洁、桌游主题”。

## 推荐投喂顺序
1. `01-product-guardrails.md`
2. `02-api-state-contract.md`
3. `03-ui-redesign-brief.md`
4. `04-acceptance-checklist.md`
5. `05-prompt-template.md`（可直接复制给 AI）

## 项目基础信息
- Tech: Next.js App Router + React + TypeScript
- 关键目录：
  - 页面：`projects/werewolf-pwa/web/app/**/page.tsx`
  - API：`projects/werewolf-pwa/web/app/api/**/route.ts`
  - 类型：`projects/werewolf-pwa/web/lib/types.ts`
- 本地命令：
  - `npm run dev:werewolf`
  - `npm run build:werewolf`
  - `npm run test:werewolf`

## 现网地址（便于 AI/设计参考）
- 生产地址：部署后在本地或私有文档中补充
- 预览地址：由 Vercel 每次部署生成，不提交到仓库

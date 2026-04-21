# Werewolf PWA 项目文档包

本文件夹用于“线下狼人杀主持 PWA”项目的 AI 友好文档集合。目标：让 AI 能直接推进开发，同时便于人类快速审阅与修改。

## 文档结构
- `01-brief.md` — 一句话目标 + 范围边界
- `02-requirements.md` — 需求清单（MVP/可选）
- `03-rules-config.md` — 游戏规则与可配置项
- `04-state-machine.md` — 流程状态机（夜/白）
- `05-data-model.md` — 数据结构/表设计草案
- `06-api-contract.md` — 前后端接口契约
- `07-ux-notes.md` — 交互/界面要点
- `08-security-privacy.md` — 权限/隐私/公平性
- `09-deployment.md` — 部署/环境建议
- `10-backlog.md` — 任务拆解与里程碑
- `11-testing.md` — 测试要点
- `12-risks.md` — 风险与缓解
- `21-testing-plan.md` — 自动化/集成/实战测试方案

## 使用方式（给 AI/人类）
- 先读 `01-brief.md` 与 `02-requirements.md`。
- 变更需求时先更新 `03-rules-config.md` 与 `04-state-machine.md`。
- 任何开发前改动都应同步 `05/06`。

> 约定：所有文档尽量保持“短段落 + 明确列表”，避免大段叙述。

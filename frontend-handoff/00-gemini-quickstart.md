# Gemini Quickstart (for UI-only refactor)

## One-line mission
Refactor the frontend UI for a modern, clean Werewolf tabletop style **without changing game logic, state machine, or API semantics**.

## Read in this order
1. `01-product-guardrails.md`
2. `02-api-state-contract.md`
3. `03-ui-redesign-brief.md`
4. `04-acceptance-checklist.md`
5. `05-prompt-template.md`

## Hard do-not-break rules
- Keep all phases unchanged.
- Do not alter role permissions.
- Do not bypass server-driven phase transitions.
- Keep wolf consensus + confirm behavior.
- Keep day vote / hunter shot / win checks intact.

## Required final verification
- `npm run build:werewolf`
- `npm run test:werewolf`

---

# 中文简版
目标：只做前端视觉和交互升级，不改玩法逻辑。

请先读：`01` → `02` → `03` → `04` → `05`。

严禁改动：状态机、API 语义、角色权限、狼人确认机制、白天录入与胜负判定。

完成后必须跑：
- `npm run build:werewolf`
- `npm run test:werewolf`

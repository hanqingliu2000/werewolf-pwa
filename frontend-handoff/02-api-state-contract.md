# 02. API 与状态契约（前端必须对齐）

## 页面路由（现有）
- `/` 首页
- `/create` 创建房间
- `/join` 加入房间
- `/player` 玩家入口
- `/room/[roomId]/lobby` 房间大厅
- `/room/[roomId]/play` 对局主界面

## 核心 API（Next.js Route Handlers）
- `POST /api/rooms` 创建房间
- `POST /api/rooms/[roomId]/join` 加入房间
- `POST /api/rooms/[roomId]/start` 开始游戏
- `GET /api/rooms/[roomId]/state` 拉取房间状态（支持 `?revealRoles=1`）
- `POST /api/rooms/[roomId]/actions` 夜晚行动
- `POST /api/rooms/[roomId]/resolve` 夜晚结算
- `POST /api/rooms/[roomId]/day-announce` 白天公告
- `POST /api/rooms/[roomId]/day-vote` 白天录入
- `POST /api/rooms/[roomId]/hunter-shot` 猎人开枪
- `GET /api/rooms/[roomId]/me` 当前玩家视角

## 关键请求体（简化）
### 1) 夜晚行动
`POST /api/rooms/[roomId]/actions`
```json
{
  "actorPlayerId": "string",
  "targetPlayerId": "string (optional for pass)",
  "actionType": "guard|kill|see|save|poison|pass",
  "confirm": "boolean (狼人确认时使用)"
}
```

### 2) 房间状态
`GET /api/rooms/[roomId]/state`
- 返回：`room`, `players`, `nightActions`, `events`
- 前端应以 `room.currentPhase`, `room.phaseVersion`, `room.status` 驱动渲染。

## 错误码（前端必须处理）
- `PHASE_MISMATCH`
- `FORBIDDEN`
- `ALREADY_ELIMINATED`
- `PLAYER_NOT_FOUND`
- `ROOM_NOT_FOUND`
- `TARGET_REQUIRED`
- `WOLF_CONSENSUS_REQUIRED`
- `PHASE_CONFLICT`

建议：统一 toast + 行内提示；不要吞错。

## 类型来源（单一事实来源）
- `projects/werewolf-pwa/web/lib/types.ts`

前端生成 AI 的代码必须与以下类型语义一致：
- `Role`
- `Phase`
- `RuleConfig`
- `Room`
- `Player`
- `ActionType`

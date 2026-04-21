# 接口契约（草案）

## 通用约定
- 所有写接口由服务端做阶段校验（非当前阶段请求必须拒绝）。
- 所有写接口支持幂等（建议 `idempotency_key`）。
- 错误码统一（示例）：
  - `PHASE_MISMATCH`
  - `FORBIDDEN`
  - `ALREADY_ELIMINATED`
  - `DUPLICATE_ACTION`

## 房间
- POST /rooms 创建房间
- GET /rooms/:id 获取房间信息
- POST /rooms/:id/start 开始游戏

## 玩家
- POST /rooms/:id/join 加入房间
- GET /rooms/:id/players 玩家列表（仅公共字段）

## 夜晚操作
- POST /rooms/:id/actions 提交操作（根据角色）
  - 请求体建议包含：
    - `action_type`
    - `target_player_id`
    - `night_no`
    - `idempotency_key`
- GET /rooms/:id/actions/me 获取自己的结果（如预言家查验）

## 白天录入
- POST /rooms/:id/day_vote 录入淘汰或无人出局
  - 请求体建议包含：
    - `day_no`
    - `eliminated_player_id`（可空，表示无人出局）
    - `idempotency_key`

## 状态
- GET /rooms/:id/state 获取当前阶段、夜晚编号、phase_version
- WS /rooms/:id/updates 实时推送
  - 推送建议包含：`phase`, `night_no`, `phase_version`, `public_events`

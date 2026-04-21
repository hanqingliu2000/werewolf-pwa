# 数据模型（草案）

## rooms
- id
- host_id
- name
- status (lobby/night/day/end)
- current_phase (LOBBY/NIGHT_*/...)
- current_night_no (int, 从 1 开始)
- phase_version (int, 乐观锁/并发控制)
- rule_config (JSON)
- created_at
- updated_at

## players
- id
- room_id
- name
- role
- alive (bool)
- eliminated_at (nullable)
- seat_no (optional)

## night_actions
- id
- room_id
- night_no
- actor_role
- actor_player_id
- target_player_id
- action_type (guard/kill/see/save/poison)
- is_final (bool, 是否当夜最终生效动作)
- created_at
- updated_at

建议唯一约束（防重复提交）：
- unique(room_id, night_no, actor_player_id, action_type)

## events
- id
- room_id
- type (night_resolve/death/day_vote/hunter_shot/game_end)
- payload (JSON)
- created_at

## 说明
- rule_config 存储开局规则与开关。
- night_actions 记录当夜各角色操作与覆盖关系。
- events 记录可回放的关键结算事件。
- phase_version 用于防止并发状态写冲突。

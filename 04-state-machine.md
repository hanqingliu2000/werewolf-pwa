# 状态机（Night/Day）

## 全局状态
- LOBBY
- NIGHT_GUARD
- NIGHT_WEREWOLF
- NIGHT_SEER
- NIGHT_WITCH
- NIGHT_RESOLVE
- DEATH_REACTION_HUNTER
- DAY_ANNOUNCE
- DAY_INPUT
- CHECK_WIN
- END

主循环：
- `LOBBY → NIGHT_GUARD → NIGHT_WEREWOLF → NIGHT_SEER → NIGHT_WITCH → NIGHT_RESOLVE → DEATH_REACTION_HUNTER → DAY_ANNOUNCE → DAY_INPUT → CHECK_WIN → (下一夜或 END)`

## 说明
- LOBBY：房主配置完成并开始游戏。
- NIGHT_*：对应角色操作（若该角色未配置/全灭则自动跳过）。
- NIGHT_RESOLVE：统一计算夜晚死亡名单。
- DEATH_REACTION_HUNTER：处理猎人死亡后是否开枪（按规则开关）。
- DAY_ANNOUNCE：公布死亡名单与结算结果。
- DAY_INPUT：房主录入白天淘汰或无人出局。
- CHECK_WIN：判定胜负；未结束则进入下一夜。
- END：游戏结束并锁定操作。

## 跳转规则
- 某角色数量 = 0 或角色全灭 → 跳过该角色阶段。
- 出局玩家不再可操作。
- 所有状态跳转由服务端判定，客户端仅接收推送并渲染。

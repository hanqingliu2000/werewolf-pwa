# Werewolf PWA 测试方案

更新时间：2026-04-20

目标：把“能跑通一局”提升为“规则可信、隐私不泄露、线下实战可恢复”。

## 1. 自动化测试分层

### A. 规则引擎 / Store 单元测试
- 房间创建、加入、开始。
- 角色分配数量与唯一性。
- 夜晚阶段顺序与跳过规则。
- 狼人共识：未选齐、目标不一致、一致后确认。
- 守卫/狼刀/女巫救毒结算矩阵。
- 猎人被刀/被毒开枪矩阵。
- 白天淘汰、无人出局、胜负判定。
- 出局玩家不可行动。

执行：
```bash
npm run smoke:werewolf
npm run test:werewolf
```

### B. 权限与隐私回归
- `/state` 默认不返回玩家身份。
- `/state` 默认不返回夜间行动明细。
- `/state` 默认不返回狼人共识进度。
- `/me` 仅返回当前玩家身份与私密结果。
- 玩家写接口必须携带匹配的 `x-player-token`。
- 房主写接口必须携带房主玩家的 `x-player-token`。
- 伪造 `playerId` 但无 token / 错 token 应拒绝。

当前已加入 store 级回归与内存模式 route handler 级回归。

### C. API 集成测试
- 使用内存模式启动 Next API，覆盖创建 -> 加入 -> 开始 -> 夜晚 -> 结算 -> 白天 -> 结束。
- 对所有写接口覆盖 401 / 403 / 409 / 400 错误。
- 验证 `PHASE_CONFLICT` 不会造成客户端误判。
- Supabase 模式下用测试库或本地 Supabase 跑同一套流程。

### D. 浏览器端冒烟
- `/create` 创建房间并保存 token。
- `/join` 加入房间并保存 token。
- `/room/[roomId]/lobby` 可开始游戏。
- `/room/[roomId]/play` 玩家仅能看到自己的动作入口。
- 刷新页面后凭 localStorage 自动恢复身份。
- `/manifest.webmanifest` 可访问，生产模式注册 `/sw.js`。
- Service worker 不缓存 `/api/*`，避免离线缓存污染实时游戏状态。
- 手机宽度下主操作可触达，无按钮重叠。

### E. 线下实战测试
- 6 人局、8 人局各完整跑一局。
- iOS Safari 与 Android Chrome 各跑一局。
- 测试中途刷新、锁屏、切后台、弱网。
- 确认公共语音不播报私密查验结果。
- 确认玩家不能通过公开状态推断夜间行动。

## 2. 每次提交前最低门槛
- `npm run typecheck:werewolf`
- `npm run smoke:werewolf`
- `npm run test:werewolf`
- `npm run e2e:werewolf`
- `npm run build:werewolf`
- `npm run check:audio`
- `npm run smoke:supabase`

如果本地没有安装依赖，先在 `web/` 安装依赖，再运行上述命令。`smoke:werewolf` 是轻量目标回归，用于快速覆盖 token 校验、首夜阶段与公开状态隐私；不能替代完整测试。
`smoke:supabase` 在没有 Supabase 环境变量时会跳过；配置好测试库后，可运行 `npm run smoke:supabase:rpc` 验证真实 RPC 写路径。

## 3. 当前缺口
- Route handler 已覆盖内存模式完整一局，并补充了 Supabase RPC 写路径的关键错误码映射；已提供真实 Supabase RPC smoke 入口，仍需在测试库中实际执行并纳入发布前检查。
- `next-pwa` 已移除，生产依赖审计当前为 0 vulnerabilities；PWA 仍需用真实移动浏览器验证安装、缓存更新和弱网行为。
- PWA 已提供 SVG 与 192px/512px PNG 图标；首页已用 390x844 移动视口做浏览器 smoke，无横向溢出；仍需用真实移动浏览器验证安装体验。
- Supabase 创建房间、加入房间、开始游戏、夜间行动、夜晚结算、白天宣告推进、猎人开枪、白天投票、重开房间已通过 RPC 事务化。
- 已增加 Playwright 手机视口测试，覆盖首页关键入口、横向溢出、PWA manifest 图标、创建房间、加入房间、玩家 session 落 localStorage、无 URL 参数重新打开大厅时的身份恢复、房主在就绪房间开局、无 URL 参数重新打开对局页时的身份恢复、首夜守卫行动提交后阶段推进到狼人夜、狼人选择目标、私密共识就绪、确认击杀后推进到预言家夜，以及预言家提交查验后仅在本人页面显示私密阵营结果、公开玩家状态仍不暴露身份。
- E2E 暴露出一个体验风险：语音播报错误 toast 可能覆盖普通操作反馈；后续应将语音状态与行动结果分层显示。
- E2E 还暴露出一个移动交互风险：语音失败后的全局解锁监听会吞掉下一次玩家目标点击；已改为延后一拍恢复语音状态，避免抢占当前游戏操作。
- 已增加浏览器在线状态与 `/api/keepalive` 服务探测；仍需定义房间级超时策略（例如主持人离线多久提示、夜晚阶段是否允许超时跳过）。
